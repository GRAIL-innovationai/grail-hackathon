'use strict';

const { Database } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('./core.js');

const MATERIAL_LIMIT = 12000;
const PROPOSAL_LIMIT = 50000;
const COACH_REVIEW_LIMIT = 100000;
const MATERIAL_FIELDS = ['resume', 'cover', 'outreach'];

function errorWithCode(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validRevision(revision) {
  return Number.isInteger(revision) && revision >= 0;
}

function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d\d-\d\d$/.test(day) &&
    Number.isFinite(Date.parse(`${day}T00:00:00.000Z`)) &&
    new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) === day;
}

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function proposalResult(result) {
  let json;
  let copy;
  try {
    json = JSON.stringify(result);
    if (!json || Buffer.byteLength(json, 'utf8') > PROPOSAL_LIMIT) throw new Error('too large');
    copy = JSON.parse(json);
  } catch (_) {
    throw errorWithCode('INVALID', 'Proposal result is invalid or too large.');
  }
  if (copy === null || typeof copy !== 'object' || Array.isArray(copy) ||
      !MATERIAL_FIELDS.every(field => typeof copy[field] === 'string' && copy[field].length <= MATERIAL_LIMIT)) {
    throw errorWithCode('INVALID', 'Proposal materials are invalid.');
  }
  return copy;
}

function createStore(filename) {
  if (typeof filename !== 'string' || !filename) throw new TypeError('A database filename is required.');
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });

  const db = new Database(filename);
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        result_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage (
        day TEXT PRIMARY KEY,
        calls INTEGER NOT NULL CHECK (calls >= 0)
      );
      CREATE TABLE IF NOT EXISTS coach_reviews (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('project', 'coding')),
        target_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        input_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        tasks_imported INTEGER NOT NULL DEFAULT 0 CHECK (tasks_imported IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('behavioral', 'technical', 'mixed')),
        context_json TEXT NOT NULL,
        history_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS company_updates (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        message TEXT NOT NULL,
        result_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS discovery_runs (
        id TEXT PRIMARY KEY,
        request TEXT NOT NULL,
        result_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  } catch (error) {
    db.close();
    throw error;
  }

  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = callback();
      db.exec('COMMIT;');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch (_) { /* Keep the original transaction error. */ }
      throw error;
    }
  }

  function readCurrent() {
    const row = db.prepare('SELECT state_json, revision FROM workspace WHERE singleton = 1').get();
    if (!row) return { state: Core.seed(), revision: 0, initialized: false };
    try {
      const state = JSON.parse(row.state_json);
      if (!Number.isInteger(row.revision) || row.revision < 1 || !Core.validateState(state)) throw new Error('invalid row');
      return { state, revision: row.revision, initialized: true };
    } catch (_) {
      throw errorWithCode('INVALID', 'Stored workspace data is invalid.');
    }
  }

  function getState() {
    return readCurrent();
  }

  function saveState(state, expectedRevision) {
    if (!Core.validateState(state) || !validRevision(expectedRevision)) {
      throw errorWithCode('INVALID', 'Workspace state or revision is invalid.');
    }
    return transaction(() => {
      const row = db.prepare('SELECT revision FROM workspace WHERE singleton = 1').get();
      const currentRevision = row ? row.revision : 0;
      if (!Number.isInteger(currentRevision) || currentRevision !== expectedRevision) {
        throw errorWithCode('CONFLICT', 'Workspace changed since it was loaded.');
      }
      const nextRevision = currentRevision + 1;
      const json = JSON.stringify(state);
      if (row) {
        db.prepare('UPDATE workspace SET state_json = ?, revision = ? WHERE singleton = 1').run(json, nextRevision);
      } else {
        db.prepare('INSERT INTO workspace (singleton, state_json, revision) VALUES (1, ?, ?)').run(json, nextRevision);
      }
      return readCurrent();
    });
  }

  function createProposal(jobId, result, revision) {
    if (typeof jobId !== 'string' || !jobId || jobId.length > 100 || !validRevision(revision)) {
      throw errorWithCode('INVALID', 'Proposal job or revision is invalid.');
    }
    const materials = proposalResult(result);
    return transaction(() => {
      const current = readCurrent();
      if (current.revision !== revision) throw errorWithCode('CONFLICT', 'Workspace changed since the proposal was prepared.');
      if (!current.state.jobs.some(job => job.id === jobId)) throw errorWithCode('NOT_FOUND', 'The requested job was not found.');
      const proposal = {
        id: randomUUID(), jobId, result: materials, revision,
        status: 'pending', createdAt: new Date().toISOString()
      };
      db.prepare('INSERT INTO proposals (id, job_id, result_json, revision, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(proposal.id, proposal.jobId, JSON.stringify(proposal.result), proposal.revision, proposal.status, proposal.createdAt);
      return proposal;
    });
  }

  function getProposal(id) {
    if (typeof id !== 'string') return null;
    const row = db.prepare('SELECT id, job_id, result_json, revision, status, created_at FROM proposals WHERE id = ?').get(id);
    if (!row) return null;
    try {
      const result = proposalResult(JSON.parse(row.result_json));
      if (!Number.isInteger(row.revision) || row.revision < 0 || !['pending', 'accepted'].includes(row.status)) throw new Error('invalid row');
      return { id: row.id, jobId: row.job_id, result, revision: row.revision, status: row.status, createdAt: row.created_at };
    } catch (_) {
      throw errorWithCode('INVALID', 'Stored proposal data is invalid.');
    }
  }

  function getLatestProposal(jobId) {
    if (typeof jobId !== 'string' || !jobId) return null;
    const row = db.prepare('SELECT id FROM proposals WHERE job_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(jobId);
    return row ? getProposal(row.id) : null;
  }

  function acceptProposal(id, expectedRevision) {
    if (typeof id !== 'string' || !validRevision(expectedRevision)) {
      throw errorWithCode('INVALID', 'Proposal id or revision is invalid.');
    }
    return transaction(() => {
      const proposal = getProposal(id);
      if (!proposal) throw errorWithCode('NOT_FOUND', 'The proposal was not found.');
      if (proposal.status !== 'pending') throw errorWithCode('CONFLICT', 'The proposal has already been accepted.');
      const current = readCurrent();
      if (expectedRevision !== proposal.revision || current.revision !== proposal.revision) {
        throw errorWithCode('CONFLICT', 'Workspace changed since the proposal was prepared.');
      }
      const nextState = current.state;
      const job = nextState.jobs.find(item => item.id === proposal.jobId);
      if (!job) throw errorWithCode('NOT_FOUND', 'The proposal job was not found.');
      for (const field of MATERIAL_FIELDS) job[field] = proposal.result[field];
      if (job.status === 'Available' || job.status === 'Saved') job.status = 'Preparing';
      if (!Core.validateState(nextState)) throw errorWithCode('INVALID', 'Accepted materials make workspace state invalid.');

      const nextRevision = current.revision + 1;
      const json = JSON.stringify(nextState);
      if (current.initialized) {
        db.prepare('UPDATE workspace SET state_json = ?, revision = ? WHERE singleton = 1').run(json, nextRevision);
      } else {
        db.prepare('INSERT INTO workspace (singleton, state_json, revision) VALUES (1, ?, ?)').run(json, nextRevision);
      }
      db.prepare("UPDATE proposals SET status = 'accepted' WHERE id = ? AND status = 'pending'").run(id);
      return { state: nextState, revision: nextRevision, initialized: true };
    });
  }

  function reserveUsage(limit = 20, day = utcDay()) {
    if (!Number.isInteger(limit) || limit < 0 || !validDay(day)) {
      throw errorWithCode('INVALID', 'Usage limit or day is invalid.');
    }
    return transaction(() => {
      const row = db.prepare('SELECT calls FROM usage WHERE day = ?').get(day);
      const calls = row ? row.calls : 0;
      if (!Number.isInteger(calls) || calls < 0) throw errorWithCode('INVALID', 'Stored usage data is invalid.');
      if (calls >= limit) return false;
      if (row) db.prepare('UPDATE usage SET calls = ? WHERE day = ?').run(calls + 1, day);
      else db.prepare('INSERT INTO usage (day, calls) VALUES (?, 1)').run(day);
      return true;
    });
  }

  function usageCount(day = utcDay()) {
    if (!validDay(day)) throw errorWithCode('INVALID', 'Usage day is invalid.');
    const row = db.prepare('SELECT calls FROM usage WHERE day = ?').get(day);
    return row ? row.calls : 0;
  }

  function coachJson(value, label) {
    try {
      const json = JSON.stringify(value);
      if (!json || Buffer.byteLength(json, 'utf8') > COACH_REVIEW_LIMIT) throw new Error('too large');
      return { json, value: JSON.parse(json) };
    } catch (_) {
      throw errorWithCode('INVALID', `Coach ${label} is invalid or too large.`);
    }
  }

  function coachReviewFromRow(row) {
    if (!row) return null;
    try {
      if (!['project', 'coding'].includes(row.kind) || !Number.isInteger(row.revision) || row.revision < 0 ||
          ![0, 1].includes(row.tasks_imported)) throw new Error('invalid row');
      const input = JSON.parse(row.input_json);
      const result = JSON.parse(row.result_json);
      if (Buffer.byteLength(row.input_json, 'utf8') > COACH_REVIEW_LIMIT || Buffer.byteLength(row.result_json, 'utf8') > COACH_REVIEW_LIMIT) throw new Error('too large');
      return { id: row.id, kind: row.kind, targetId: row.target_id, jobId: row.job_id || '', input, result,
        revision: row.revision, createdAt: row.created_at, tasksImported: row.tasks_imported === 1 };
    } catch (_) { throw errorWithCode('INVALID', 'Stored coach review is invalid.'); }
  }

  function saveCoachReview(kind, targetId, jobId, input, result, revision) {
    if (!['project', 'coding'].includes(kind) || typeof targetId !== 'string' || !targetId || targetId.length > 100 ||
        typeof jobId !== 'string' || jobId.length > 100 || !validRevision(revision)) {
      throw errorWithCode('INVALID', 'Coach review metadata is invalid.');
    }
    const inputData = coachJson(input, 'input');
    const resultData = coachJson(result, 'result');
    return transaction(() => {
      const current = readCurrent();
      if (current.revision !== revision) throw errorWithCode('CONFLICT', 'Workspace changed since the coach review was prepared.');
      const targetExists = kind === 'project'
        ? current.state.projects.some(item => item.id === targetId)
        : targetId === 'coding';
      if (!targetExists) throw errorWithCode('NOT_FOUND', 'The coach review target was not found.');
      if (jobId && !current.state.jobs.some(item => item.id === jobId)) throw errorWithCode('NOT_FOUND', 'The coach review job was not found.');
      const count = db.prepare('SELECT COUNT(*) AS count FROM coach_reviews').get().count;
      if (count >= 500) throw errorWithCode('CONFLICT', 'The coach review history is full.');
      const review = { id: randomUUID(), kind, targetId, jobId, input: inputData.value, result: resultData.value,
        revision, createdAt: new Date().toISOString(), tasksImported: false };
      db.prepare(`INSERT INTO coach_reviews (id, kind, target_id, job_id, input_json, result_json, revision, created_at, tasks_imported)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`)
        .run(review.id, kind, targetId, jobId, inputData.json, resultData.json, revision, review.createdAt);
      return review;
    });
  }

  function getCoachReview(id) {
    if (typeof id !== 'string') return null;
    return coachReviewFromRow(db.prepare(`SELECT id, kind, target_id, job_id, input_json, result_json, revision, created_at, tasks_imported
      FROM coach_reviews WHERE id = ?`).get(id));
  }

  function listCoachReviews(kind, limit = 20, targetId) {
    if (!['project', 'coding'].includes(kind) || !Number.isInteger(limit) || limit < 1 || limit > 500 ||
        (targetId !== undefined && (typeof targetId !== 'string' || targetId.length > 100))) {
      throw errorWithCode('INVALID', 'Coach review query is invalid.');
    }
    const rows = targetId === undefined
      ? db.prepare(`SELECT id, kind, target_id, job_id, input_json, result_json, revision, created_at, tasks_imported
          FROM coach_reviews WHERE kind = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(kind, limit)
      : db.prepare(`SELECT id, kind, target_id, job_id, input_json, result_json, revision, created_at, tasks_imported
          FROM coach_reviews WHERE kind = ? AND target_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(kind, targetId, limit);
    return rows.map(coachReviewFromRow);
  }

  function importCoachTasks(id, expectedRevision) {
    if (typeof id !== 'string' || !validRevision(expectedRevision)) throw errorWithCode('INVALID', 'Coach review id or revision is invalid.');
    return transaction(() => {
      const review = getCoachReview(id);
      if (!review) throw errorWithCode('NOT_FOUND', 'The coach review was not found.');
      if (review.kind !== 'project') throw errorWithCode('INVALID', 'Coding reviews cannot be imported as project tasks.');
      const current = readCurrent();
      if (review.tasksImported) throw errorWithCode('CONFLICT', 'Tasks from this review were already imported.');
      if (current.revision !== expectedRevision || review.revision !== current.revision) {
        throw errorWithCode('CONFLICT', 'Workspace changed since this coach review. Run the review again before importing tasks.');
      }
      const candidates = Array.isArray(review.result.tasks) ? review.result.tasks : [];
      if (candidates.some(task => !task || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 160)) {
        throw errorWithCode('INVALID', 'Coach task titles are invalid.');
      }
      const state = structuredClone(current.state);
      const titles = new Set(state.tasks.map(task => task.title.trim().toLocaleLowerCase()));
      const tasks = candidates.map(task => task.title).filter(title => {
        const key = title.toLocaleLowerCase();
        if (titles.has(key)) return false;
        titles.add(key); return true;
      });
      if (state.tasks.length + tasks.length > 1000) throw errorWithCode('CONFLICT', 'The task list is full.');
      for (const title of tasks) state.tasks.push({ id: `coach-${randomUUID()}`, title, done: false });
      if (!Core.validateState(state)) throw errorWithCode('INVALID', 'Imported tasks make workspace state invalid.');
      const revision = current.revision + 1;
      const json = JSON.stringify(state);
      if (current.initialized) db.prepare('UPDATE workspace SET state_json = ?, revision = ? WHERE singleton = 1').run(json, revision);
      else db.prepare('INSERT INTO workspace (singleton, state_json, revision) VALUES (1, ?, ?)').run(json, revision);
      db.prepare('UPDATE coach_reviews SET tasks_imported = 1 WHERE id = ? AND tasks_imported = 0').run(id);
      return { state, revision, initialized: true };
    });
  }

  const SESSION_LIMIT = 200000;
  function boundedJson(value, label, max = SESSION_LIMIT) {
    try {
      const json = JSON.stringify(value);
      if (!json || Buffer.byteLength(json, 'utf8') > max) throw new Error('too large');
      return { json, value: JSON.parse(json) };
    } catch (_) { throw errorWithCode('INVALID', `${label} is invalid or too large.`); }
  }
  function interviewFromRow(row) {
    if (!row) return null;
    try {
      if (!['behavioral', 'technical', 'mixed'].includes(row.mode) || !Number.isInteger(row.revision) || row.revision < 0) throw new Error('invalid');
      const context = JSON.parse(row.context_json), history = JSON.parse(row.history_json);
      if (Buffer.byteLength(row.context_json, 'utf8') > SESSION_LIMIT || Buffer.byteLength(row.history_json, 'utf8') > SESSION_LIMIT ||
          !Array.isArray(history) || history.length < 1 || history.length > 25) throw new Error('invalid');
      return { id: row.id, jobId: row.job_id, mode: row.mode, context, history, revision: row.revision, createdAt: row.created_at };
    } catch (_) { throw errorWithCode('INVALID', 'Stored interview session is invalid.'); }
  }
  function createInterviewSession(jobId, mode, context, firstTurn, revision) {
    if (typeof jobId !== 'string' || !jobId || jobId.length > 100 || !['behavioral', 'technical', 'mixed'].includes(mode) || !validRevision(revision))
      throw errorWithCode('INVALID', 'Interview session metadata is invalid.');
    const contextData = boundedJson(context, 'Interview context');
    const historyData = boundedJson([firstTurn], 'Interview turn');
    return transaction(() => {
      const current = readCurrent();
      if (current.revision !== revision) throw errorWithCode('CONFLICT', 'Workspace changed since interview practice was prepared.');
      if (!current.state.jobs.some(job => job.id === jobId)) throw errorWithCode('NOT_FOUND', 'The selected job was not found.');
      const session = { id: randomUUID(), jobId, mode, context: contextData.value, history: historyData.value, revision, createdAt: new Date().toISOString() };
      db.prepare(`INSERT INTO interview_sessions (id, job_id, mode, context_json, history_json, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(session.id, jobId, mode, contextData.json, historyData.json, revision, session.createdAt);
      return session;
    });
  }
  function getInterviewSession(id) {
    if (typeof id !== 'string') return null;
    return interviewFromRow(db.prepare('SELECT id, job_id, mode, context_json, history_json, revision, created_at FROM interview_sessions WHERE id = ?').get(id));
  }
  function listInterviewSessions(jobId, limit = 20) {
    if (typeof jobId !== 'string' || !jobId || jobId.length > 100 || !Number.isInteger(limit) || limit < 1 || limit > 100)
      throw errorWithCode('INVALID', 'Interview query is invalid.');
    return db.prepare(`SELECT id, job_id, mode, context_json, history_json, revision, created_at FROM interview_sessions
      WHERE job_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(jobId, limit).map(interviewFromRow);
  }
  function appendInterviewTurn(id, expectedHistoryLength, candidateTurn, interviewerTurn, expectedRevision) {
    if (typeof id !== 'string' || !Number.isInteger(expectedHistoryLength) || expectedHistoryLength < 1 || !validRevision(expectedRevision))
      throw errorWithCode('INVALID', 'Interview turn metadata is invalid.');
    return transaction(() => {
      const session = getInterviewSession(id);
      if (!session) throw errorWithCode('NOT_FOUND', 'The interview session was not found.');
      const current = readCurrent();
      if (current.revision !== expectedRevision || session.revision !== current.revision) throw errorWithCode('CONFLICT', 'Workspace changed since this interview session began. Start a new session.');
      if (session.history.length !== expectedHistoryLength) throw errorWithCode('CONFLICT', 'This interview turn was already submitted. Reload the session.');
      if (session.history.filter(turn => turn && turn.role === 'candidate').length >= 12) throw errorWithCode('CONFLICT', 'The interview session reached its turn limit.');
      const history = [...session.history, candidateTurn, interviewerTurn];
      const historyData = boundedJson(history, 'Interview history');
      db.prepare('UPDATE interview_sessions SET history_json = ? WHERE id = ?').run(historyData.json, id);
      return { ...session, history: historyData.value };
    });
  }

  function updateFromRow(row) {
    if (!row) return null;
    try {
      const result = JSON.parse(row.result_json);
      if (!Number.isInteger(row.revision) || row.revision < 0 || ![0, 1].includes(row.applied) || Buffer.byteLength(row.result_json, 'utf8') > 100000 || row.message.length > 12000) throw new Error('invalid');
      return { id: row.id, jobId: row.job_id, message: row.message, ...result, revision: row.revision, createdAt: row.created_at, applied: row.applied === 1 };
    } catch (_) { throw errorWithCode('INVALID', 'Stored company update is invalid.'); }
  }
  function createCompanyUpdate(jobId, message, result, revision) {
    if (typeof jobId !== 'string' || !jobId || jobId.length > 100 || typeof message !== 'string' || !message.trim() || message.length > 12000 || !validRevision(revision))
      throw errorWithCode('INVALID', 'Company update metadata is invalid.');
    const resultData = boundedJson(result, 'Company update proposal', 100000);
    return transaction(() => {
      const current = readCurrent();
      if (current.revision !== revision) throw errorWithCode('CONFLICT', 'Workspace changed since the update was reviewed.');
      if (!current.state.jobs.some(job => job.id === jobId)) throw errorWithCode('NOT_FOUND', 'The selected job was not found.');
      const update = { id: randomUUID(), jobId, message, ...resultData.value, revision, createdAt: new Date().toISOString(), applied: false };
      db.prepare('INSERT INTO company_updates (id, job_id, message, result_json, revision, created_at, applied) VALUES (?, ?, ?, ?, ?, ?, 0)')
        .run(update.id, jobId, message, resultData.json, revision, update.createdAt);
      return update;
    });
  }
  function getCompanyUpdate(id) {
    if (typeof id !== 'string') return null;
    return updateFromRow(db.prepare('SELECT id, job_id, message, result_json, revision, created_at, applied FROM company_updates WHERE id = ?').get(id));
  }
  function acceptCompanyUpdate(id, expectedRevision) {
    if (typeof id !== 'string' || !validRevision(expectedRevision)) throw errorWithCode('INVALID', 'Company update id or revision is invalid.');
    return transaction(() => {
      const update = getCompanyUpdate(id);
      if (!update) throw errorWithCode('NOT_FOUND', 'The company update was not found.');
      if (update.applied || !['Applied', 'Interview', 'Offer', 'Rejected'].includes(update.proposedStatus)) throw errorWithCode('CONFLICT', 'This update cannot be applied.');
      const current = readCurrent();
      if (current.revision !== expectedRevision || update.revision !== current.revision) throw errorWithCode('CONFLICT', 'Workspace changed since this update was reviewed. Review the message again.');
      const state = structuredClone(current.state);
      const job = state.jobs.find(item => item.id === update.jobId);
      if (!job) throw errorWithCode('NOT_FOUND', 'The selected job was not found.');
      job.status = update.proposedStatus;
      if (!Core.validateState(state)) throw errorWithCode('INVALID', 'Company update status is invalid.');
      const revision = current.revision + 1;
      if (current.initialized) db.prepare('UPDATE workspace SET state_json = ?, revision = ? WHERE singleton = 1').run(JSON.stringify(state), revision);
      else db.prepare('INSERT INTO workspace (singleton, state_json, revision) VALUES (1, ?, ?)').run(JSON.stringify(state), revision);
      db.prepare('UPDATE company_updates SET applied = 1 WHERE id = ? AND applied = 0').run(id);
      return { state, revision, initialized: true };
    });
  }

  function discoveryFromRow(row) {
    if (!row) return null;
    try {
      if (!validRevision(row.revision) || typeof row.request !== 'string' || row.request.length > 1200 ||
          Buffer.byteLength(row.result_json, 'utf8') > 100000) throw new Error('Invalid discovery run');
      const result = JSON.parse(row.result_json);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid discovery result');
      return { id: row.id, request: row.request, result, revision: row.revision, createdAt: row.created_at };
    } catch (_) { throw errorWithCode('INVALID', 'Stored discovery research is invalid.'); }
  }

  function createDiscoveryRun(request, result, revision) {
    if (typeof request !== 'string' || !request.trim() || request.length > 1200 || !validRevision(revision) ||
        !result || typeof result !== 'object' || Array.isArray(result)) throw errorWithCode('INVALID', 'Discovery research is invalid.');
    const resultData = boundedJson(result, 'Discovery research', 100000);
    return transaction(() => {
      if (readCurrent().revision !== revision) throw errorWithCode('CONFLICT', 'Workspace changed during research.');
      const run = { id: randomUUID(), request, result: resultData.value, revision, createdAt: new Date().toISOString() };
      db.prepare('INSERT INTO discovery_runs (id, request, result_json, revision, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(run.id, run.request, resultData.json, run.revision, run.createdAt);
      return run;
    });
  }

  function listDiscoveryRuns(limit = 10) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw errorWithCode('INVALID', 'Discovery history limit is invalid.');
    return db.prepare('SELECT id, request, result_json, revision, created_at FROM discovery_runs ORDER BY rowid DESC LIMIT ?')
      .all(limit).map(discoveryFromRow);
  }

  return { getState, saveState, createProposal, getProposal, getLatestProposal, acceptProposal, reserveUsage, usageCount,
    saveCoachReview, listCoachReviews, getCoachReview, importCoachTasks, createInterviewSession, getInterviewSession,
    listInterviewSessions, appendInterviewTurn, createCompanyUpdate, getCompanyUpdate, acceptCompanyUpdate,
    createDiscoveryRun, listDiscoveryRuns, close: () => db.close() };
}

module.exports = { createStore };
