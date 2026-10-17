'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'core.js', 'views.js', 'app.js', 'coach-ui.js', 'journeys-ui.js', 'discover-ui.js', 'practice-ui.js', 'interview-problems.js', 'interview-problems-ui.js', 'assets/Inter.ttf', 'assets/favicon.svg']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const MAX_BODY = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeHeaders(res, api = false) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (api) res.setHeader('Cache-Control', 'no-store');
}

function send(res, status, payload, headers = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(payload));
}

function errorResponse(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  const errors = {
    INVALID: [400, 'The request is invalid.'],
    CONFLICT: [409, 'The workspace changed. Reload it and try again.'],
    NOT_FOUND: [404, 'That item was not found.'],
    CONFIG: [503, 'The assistant is not configured.'],
    QUOTA: [429, 'The daily assistant limit has been reached.'],
    UPSTREAM: [502, 'The assistant could not complete the request.'],
    TIMEOUT: [504, 'The assistant request timed out.']
  };
  if (code === 'BUSY') return [429, 'An assistant request is already in progress.'];
  if (code === 'COOLDOWN') return [429, 'Please wait before starting another assistant request.'];
  return errors[code] || [500, 'The request could not be completed.'];
}

function readJson(req, maxBytes = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    if (type !== 'application/json') {
      req.resume();
      const error = new Error('JSON required'); error.code = 'INVALID'; reject(error); return;
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      const error = new Error('Body too large'); error.code = 'TOO_LARGE'; reject(error); return;
    }
    let total = 0;
    const chunks = [];
    let settled = false;
    const finishError = code => {
      if (settled) return;
      settled = true;
      const error = new Error(code); error.code = code;
      reject(error);
    };
    const timer = setTimeout(() => finishError('BODY_TIMEOUT'), 15000);
    timer.unref?.();
    req.on('data', chunk => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        req.resume();
        finishError('TOO_LARGE');
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const value = JSON.parse(raw);
        if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Object required');
        resolve(value);
      } catch {
        const error = new Error('Invalid JSON'); error.code = 'INVALID'; reject(error);
      }
    });
    req.on('aborted', () => { clearTimeout(timer); finishError('INVALID'); });
    req.on('error', () => { clearTimeout(timer); finishError('INVALID'); });
    req.on('close', () => { if (!req.complete) { clearTimeout(timer); finishError('INVALID'); } });
  });
}

function revisionValue(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function serveStatic(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const filename = pathname.replace(/^\/+/, '') || 'index.html';
  if (!PUBLIC_FILES.has(filename)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, filename), (error, bytes) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  });
}

function createApp({ store, llm, coaches: injectedCoaches, opportunities: injectedOpportunities, updates: injectedUpdates,
  interview: injectedInterview, research: injectedResearch, resume: injectedResume, discovery: injectedDiscovery,
  dailyLimit = 20, cooldownMs = 10000, token, allowedHosts } = {}) {
  if (!store || !llm) throw new TypeError('createApp requires a store and an llm');
  let coaches = injectedCoaches || null;
  const coachApi = () => coaches || (coaches = require('./coaches.cjs').createCoaches(llm));
  const integrations = {};
  if (injectedOpportunities) integrations.opportunities = injectedOpportunities;
  if (injectedUpdates) integrations.updates = injectedUpdates;
  if (injectedInterview) integrations.interview = injectedInterview;
  if (injectedResearch) integrations.research = injectedResearch;
  if (injectedResume) integrations.resume = injectedResume;
  const helper = (name, factory) => integrations[name] || (integrations[name] = factory());
  const publicSession = session => ({ ...session, context: {
    notice: session.context?.companyResearch?.notice || 'Company research may match this company name only. Check every source before relying on it.',
    sources: session.context && session.context.companyResearch ? session.context.companyResearch.sources : [],
    limitations: session.context?.companyResearch?.limitations || 'Interview questions are practice exercises and may not match the employer’s process.'
  } });
  const workspaceToken = token || crypto.randomBytes(32).toString('base64url');
  const hostsOverride = allowedHosts ? new Set(allowedHosts.map(host => String(host).toLowerCase())) : null;
  let generationBusy = false;
  let lastGenerationAt = 0;

  function validHost(req) {
    const host = String(req.headers.host || '').toLowerCase();
    const localPort = req.socket.localPort;
    const defaultHosts = new Set([`127.0.0.1:${localPort}`, `localhost:${localPort}`]);
    return defaultHosts.has(host) && (!hostsOverride || hostsOverride.has(host));
  }

  function validOrigin(req) {
    const origin = req.headers.origin;
    if (origin == null) return true;
    try {
      const parsed = new URL(origin);
      return parsed.origin === `http://${String(req.headers.host || '').toLowerCase()}`;
    } catch { return false; }
  }

  function validToken(req) {
    const provided = req.headers['x-workspace-token'];
    if (typeof provided !== 'string') return false;
    const expectedBytes = Buffer.from(workspaceToken);
    const providedBytes = Buffer.from(provided);
    return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
  }

  async function routeApi(req, res, pathname) {
    safeHeaders(res, true);
    if (!validHost(req) || !validOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site') {
      send(res, 403, { error: 'Request rejected.' }); return;
    }

    const session = pathname === '/api/session';
    if (session && req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
    if (!session && !validToken(req)) { send(res, 403, { error: 'Request rejected.' }); return; }

    if (session) {
      send(res, 200, { token: workspaceToken, ai: { configured: Boolean(llm.configured), provider: llm.provider || null, model: llm.model || null }, storage: 'sqlite' });
      return;
    }

    if (pathname === '/api/discovery/context') {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      const snapshot = await store.getState();
      const { buildDiscoveryContext } = require('./discovery.cjs');
      send(res, 200, { revision: snapshot.revision, searchMode: process.env.SERPER_API_KEY?.trim() ? 'google' : 'boards', context: buildDiscoveryContext(snapshot.state.profile, snapshot.state.projects),
        notice: 'Only this selected profile excerpt, project summaries, and your search brief are shared with Groq. Public job sources receive only search parameters, never your resume.' });
      return;
    }

    if (pathname === '/api/discovery/runs') {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      send(res, 200, { runs: await store.listDiscoveryRuns(10) }); return;
    }

    if (pathname === '/api/discovery/research') {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      const body = await readJson(req);
      if (body.consent !== true || !revisionValue(body.revision) || typeof body.request !== 'string' ||
          !body.request.trim() || body.request.length > 1200) {
        send(res, 400, { error: 'Add a search brief and confirm sharing the displayed context.' }); return;
      }
      if (generationBusy) { send(res, 429, { error: 'An assistant request is already in progress.' }); return; }
      if (lastGenerationAt && Date.now() - lastGenerationAt < cooldownMs) {
        send(res, 429, { error: 'Please wait before starting another assistant request.' }); return;
      }
      if (!llm.configured) { send(res, 503, { error: 'The assistant is not configured.' }); return; }
      generationBusy = true;
      try {
        const snapshot = await store.getState();
        if (snapshot.revision !== body.revision) { send(res, 409, { error: 'The workspace changed. Reload it and try again.' }); return; }
        const discovery = helper('discovery', () => injectedDiscovery || require('./discovery.cjs').createDiscovery({ llm }));
        let calls = 0;
        const reserveCall = async () => {
          if (calls >= 2) throw Object.assign(new Error('Discovery call limit reached.'), { code: 'QUOTA' });
          if (!await store.reserveUsage(dailyLimit)) throw Object.assign(new Error('Assistant quota reached.'), { code: 'QUOTA' });
          calls += 1; lastGenerationAt = Date.now();
        };
        const result = await discovery.run(snapshot.state.profile, body.request.trim(), { reserveCall, projects: snapshot.state.projects });
        if ((await store.getState()).revision !== body.revision) {
          send(res, 409, { error: 'The workspace changed during research. Your applications have not been changed.' }); return;
        }
        const run = await store.createDiscoveryRun(body.request.trim(), result, body.revision);
        send(res, 200, { run, usage: { used: await store.usageCount(), limit: dailyLimit } });
      } finally { generationBusy = false; }
      return;
    }

    if (pathname === '/api/resume/extract') {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      const body = await readJson(req, 3 * 1024 * 1024);
      if (typeof body.filename !== 'string' || body.filename.length > 240 || typeof body.base64 !== 'string' || !body.base64.length || body.base64.length > 2.7 * 1024 * 1024) {
        send(res, 400, { error: 'The request is invalid.' }); return;
      }
      const resume = helper('resume', () => require('./resume.cjs'));
      const extract = typeof resume === 'function' ? resume : resume.extractResume;
      send(res, 200, await extract(body.filename, body.base64)); return;
    }

    if (pathname === '/api/opportunities/search') {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      const body = await readJson(req);
      if (typeof body.query !== 'string' || body.query.length > 120 ||
          (body.level !== undefined && (typeof body.level !== 'string' || body.level.length > 40)) ||
          (body.location !== undefined && (typeof body.location !== 'string' || body.location.length > 120))) {
        send(res, 400, { error: 'The request is invalid.' }); return;
      }
      const opportunities = helper('opportunities', () => require('./demo-data.cjs').createDemoOpportunities());
      send(res, 200, await opportunities.search({ query: body.query, level: body.level, location: body.location })); return;
    }

    if (pathname === '/api/company') {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      const jobId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('jobId');
      if (!jobId || jobId.length > 100) { send(res, 400, { error: 'The request is invalid.' }); return; }
      const snapshot = await store.getState();
      const job = (snapshot.state.jobs || []).find(item => item.id === jobId);
      if (!job) { send(res, 404, { error: 'That item was not found.' }); return; }
      const research = helper('research', () => require('./demo-data.cjs').createDemoResearch());
      send(res, 200, await research.company(job)); return;
    }

    if (pathname === '/api/state') {
      if (req.method === 'GET') { send(res, 200, await store.getState()); return; }
      if (req.method === 'PUT') {
        const body = await readJson(req);
        if (!revisionValue(body.revision) || !Object.hasOwn(body, 'state')) { send(res, 400, { error: 'The request is invalid.' }); return; }
        send(res, 200, await store.saveState(body.state, body.revision)); return;
      }
      send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, PUT' }); return;
    }

    if (pathname === '/api/generate') {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      const body = await readJson(req);
      if (body.consent !== true || typeof body.jobId !== 'string' || !revisionValue(body.revision)) {
        send(res, 400, { error: 'The request is invalid.' }); return;
      }
      if (generationBusy) { send(res, 429, { error: 'An assistant request is already in progress.' }); return; }
      const now = Date.now();
      if (lastGenerationAt && now - lastGenerationAt < cooldownMs) { send(res, 429, { error: 'Please wait before starting another assistant request.' }); return; }
      if (!llm.configured) { send(res, 503, { error: 'The assistant is not configured.' }); return; }

      generationBusy = true;
      try {
        const snapshot = await store.getState();
        if (snapshot.revision !== body.revision) { send(res, 409, { error: 'The workspace changed. Reload it and try again.' }); return; }
        const state = snapshot.state || {};
        const job = Array.isArray(state.jobs) ? state.jobs.find(item => item && item.id === body.jobId) : null;
        const profile = state.profile || {};
        if (!job) { send(res, 404, { error: 'That item was not found.' }); return; }
        if ((!(typeof profile.resumeText === 'string' && profile.resumeText.trim()) && !(typeof profile.background === 'string' && profile.background.trim())) || typeof job.description !== 'string' || !job.description.trim()) {
          send(res, 400, { error: 'Add resume text or personal background, and a job description, before generating a proposal.' }); return;
        }
        const reserved = await store.reserveUsage(dailyLimit);
        if (!reserved) {
          send(res, 429, { error: 'The daily assistant limit has been reached.', usage: { used: await store.usageCount(), limit: dailyLimit } });
          return;
        }
        lastGenerationAt = Date.now();
        const result = await llm.generate(profile, job);
        const latest = await store.getState();
        if (latest.revision !== body.revision) { send(res, 409, { error: 'The workspace changed. Reload it and try again.' }); return; }
        const proposal = await store.createProposal(job.id, result, latest.revision);
        send(res, 200, { proposal, usage: { used: await store.usageCount(), limit: dailyLimit } });
      } finally { generationBusy = false; }
      return;
    }

    if (pathname === '/api/coaches/project' || pathname === '/api/coaches/coding') {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      const body = await readJson(req);
      const kind = pathname.endsWith('/project') ? 'project' : 'coding';
      if (body.consent !== true || !revisionValue(body.revision) ||
          (kind === 'project' && (typeof body.projectId !== 'string' || !body.projectId)) ||
          (body.jobId !== undefined && typeof body.jobId !== 'string')) {
        send(res, 400, { error: 'The request is invalid.' }); return;
      }
      const targetId = kind === 'project' ? body.projectId : 'coding';
      const jobId = body.jobId || '';
      const coach = coachApi();
      const validInput = kind === 'project' ? coach.validateFiles(body.files) : coach.validateCodingInput(body.input);
      if (!validInput) { send(res, 400, { error: 'The request is invalid.' }); return; }
      if (generationBusy) { send(res, 429, { error: 'An assistant request is already in progress.' }); return; }
      const now = Date.now();
      if (lastGenerationAt && now - lastGenerationAt < cooldownMs) { send(res, 429, { error: 'Please wait before starting another assistant request.' }); return; }
      if (!llm.configured) { send(res, 503, { error: 'The assistant is not configured.' }); return; }
      generationBusy = true;
      try {
        const snapshot = await store.getState();
        if (snapshot.revision !== body.revision) { send(res, 409, { error: 'The workspace changed. Reload it and try again.' }); return; }
        const state = snapshot.state || {};
        if (kind === 'project' && !(state.projects || []).some(project => project && project.id === targetId)) {
          send(res, 404, { error: 'That item was not found.' }); return;
        }
        if (jobId && !(state.jobs || []).some(job => job && job.id === jobId)) { send(res, 404, { error: 'That item was not found.' }); return; }
        const previous = kind === 'coding' ? store.listCoachReviews('coding', 3).map(review => review.result) : [];
        const context = coach.buildContext(state, jobId, previous);
        if (kind === 'project') {
          const project = state.projects.find(item => item.id === targetId);
          context.project = { id: project.id, name: project.name, url: project.url, notes: project.notes };
        }
        const files = kind === 'project' ? body.files.map(file => ({ path: file.path.replaceAll('\\', '/'),
          content: file.content.replaceAll('\r\n', '\n').replaceAll('\r', '\n') })) : null;
        const input = kind === 'project' ? { context, files } : { context, input: body.input };
        const reserved = await store.reserveUsage(dailyLimit);
        if (!reserved) {
          send(res, 429, { error: 'The daily assistant limit has been reached.', usage: { used: await store.usageCount(), limit: dailyLimit } });
          return;
        }
        lastGenerationAt = Date.now();
        const result = kind === 'project' ? await coach.project(context, files) : await coach.coding(context, body.input);
        const latest = await store.getState();
        if (latest.revision !== body.revision) { send(res, 409, { error: 'The workspace changed. Reload it and try again.' }); return; }
        const review = await store.saveCoachReview(kind, targetId, jobId, input, result, latest.revision);
        send(res, 200, { review, usage: { used: await store.usageCount(), limit: dailyLimit } });
      } finally { generationBusy = false; }
      return;
    }

    if (pathname === '/api/coaches/reviews') {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      const query = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const kind = query.get('kind');
      const targetId = query.get('targetId') || undefined;
      if (!['project', 'coding'].includes(kind)) { send(res, 400, { error: 'The request is invalid.' }); return; }
      send(res, 200, { reviews: await store.listCoachReviews(kind, 20, targetId) }); return;
    }

    const importTasksMatch = pathname.match(/^\/api\/coaches\/reviews\/([^/]+)\/tasks$/);
    if (importTasksMatch) {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      if (!UUID.test(importTasksMatch[1])) { send(res, 404, { error: 'That item was not found.' }); return; }
      const body = await readJson(req);
      if (!revisionValue(body.revision)) { send(res, 400, { error: 'The request is invalid.' }); return; }
      send(res, 200, await store.importCoachTasks(importTasksMatch[1], body.revision)); return;
    }

    const coachReviewMatch = pathname.match(/^\/api\/coaches\/reviews\/([^/]+)$/);
    if (coachReviewMatch) {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      if (!UUID.test(coachReviewMatch[1])) { send(res, 404, { error: 'That item was not found.' }); return; }
      const review = await store.getCoachReview(coachReviewMatch[1]);
      if (!review) { send(res, 404, { error: 'That item was not found.' }); return; }
      send(res, 200, { review }); return;
    }

    if (pathname === '/api/interviews/start') {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      const body = await readJson(req);
      if (body.consent !== true || typeof body.jobId !== 'string' || !body.jobId || !revisionValue(body.revision) ||
          !['behavioral', 'technical', 'mixed'].includes(body.mode) || (body.researchConfirmed !== undefined && typeof body.researchConfirmed !== 'boolean')) {
        send(res, 400, { error: 'The request is invalid.' }); return;
      }
      if (generationBusy) { send(res, 429, { error: 'An assistant request is already in progress.' }); return; }
      if (lastGenerationAt && Date.now() - lastGenerationAt < cooldownMs) { send(res, 429, { error: 'Please wait before starting another assistant request.' }); return; }
      if (!llm.configured) { send(res, 503, { error: 'The assistant is not configured.' }); return; }
      generationBusy = true;
      try {
        const snapshot = await store.getState();
        if (snapshot.revision !== body.revision) { send(res, 409, { error: 'The workspace changed. Reload it and try again.' }); return; }
        const job = (snapshot.state.jobs || []).find(item => item.id === body.jobId);
        if (!job) { send(res, 404, { error: 'That item was not found.' }); return; }
        if (typeof snapshot.state.profile?.resumeText !== 'string' || !snapshot.state.profile.resumeText.trim()) {
          send(res, 400, { error: 'Add resume text before starting interview practice.' }); return;
        }
        let companyResearch = { sources: [], notice: 'No company research was included.' };
        if (body.researchConfirmed) {
          const research = helper('research', () => require('./demo-data.cjs').createDemoResearch());
          companyResearch = await research.company(job);
        }
        const reserved = await store.reserveUsage(dailyLimit);
        if (!reserved) {
          send(res, 429, { error: 'The daily assistant limit has been reached.', usage: { used: await store.usageCount(), limit: dailyLimit } }); return;
        }
        lastGenerationAt = Date.now();
        const interview = helper('interview', () => require('./interview.cjs').createInterview(llm));
        const context = interview.buildInterviewContext(snapshot.state, body.jobId, companyResearch, []);
        context.companyResearch.notice = companyResearch.notice || '';
        context.companyResearch.limitations = companyResearch.limitations || '';
        const result = await interview.generate(context, { answer: '', mode: body.mode, first: true });
        const firstTurn = { role: 'interviewer', text: result.question, feedback: result.feedback, focus: result.focus,
          practiceTask: result.practiceTask, evidenceQuote: result.evidenceQuote, limitations: result.limitations };
        const sessionRecord = await store.createInterviewSession(body.jobId, body.mode, context, firstTurn, body.revision);
        const sessionValue = publicSession(sessionRecord);
        send(res, 200, { session: sessionValue, usage: { used: await store.usageCount(), limit: dailyLimit } });
      } finally { generationBusy = false; }
      return;
    }

    if (pathname === '/api/interviews') {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      const jobId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('jobId');
      if (!jobId || jobId.length > 100) { send(res, 400, { error: 'The request is invalid.' }); return; }
      send(res, 200, { sessions: store.listInterviewSessions(jobId).map(publicSession) }); return;
    }

    const interviewAnswerMatch = pathname.match(/^\/api\/interviews\/([^/]+)\/answer$/);
    if (interviewAnswerMatch) {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      if (!UUID.test(interviewAnswerMatch[1])) { send(res, 404, { error: 'That item was not found.' }); return; }
      const body = await readJson(req);
      if (body.consent !== true || typeof body.answer !== 'string' || body.answer.length > 5000 || !body.answer.trim() || !revisionValue(body.revision)) {
        send(res, 400, { error: 'The request is invalid.' }); return;
      }
      if (generationBusy) { send(res, 429, { error: 'An assistant request is already in progress.' }); return; }
      if (lastGenerationAt && Date.now() - lastGenerationAt < cooldownMs) { send(res, 429, { error: 'Please wait before starting another assistant request.' }); return; }
      if (!llm.configured) { send(res, 503, { error: 'The assistant is not configured.' }); return; }
      generationBusy = true;
      try {
        const sessionRecord = await store.getInterviewSession(interviewAnswerMatch[1]);
        if (!sessionRecord) { send(res, 404, { error: 'That item was not found.' }); return; }
        const snapshot = await store.getState();
        if (snapshot.revision !== body.revision || sessionRecord.revision !== body.revision) { send(res, 409, { error: 'Workspace changed since this interview session began. Start a new session.' }); return; }
        if (sessionRecord.history.filter(turn => turn.role === 'candidate').length >= 12) { send(res, 409, { error: 'The interview session reached its turn limit.' }); return; }
        const reserved = await store.reserveUsage(dailyLimit);
        if (!reserved) {
          send(res, 429, { error: 'The daily assistant limit has been reached.', usage: { used: await store.usageCount(), limit: dailyLimit } }); return;
        }
        lastGenerationAt = Date.now();
        const interview = helper('interview', () => require('./interview.cjs').createInterview(llm));
        const context = { ...sessionRecord.context, history: sessionRecord.history.slice(-6).map(turn => ({ role: turn.role, text: turn.text })) };
        const result = await interview.generate(context, { answer: body.answer, mode: sessionRecord.mode, first: false });
        const candidateTurn = { role: 'candidate', text: body.answer };
        const interviewerTurn = { role: 'interviewer', text: result.question, feedback: result.feedback, focus: result.focus,
          practiceTask: result.practiceTask, evidenceQuote: result.evidenceQuote, limitations: result.limitations };
        const updated = await store.appendInterviewTurn(sessionRecord.id, sessionRecord.history.length, candidateTurn, interviewerTurn, body.revision);
        send(res, 200, { session: publicSession(updated), usage: { used: await store.usageCount(), limit: dailyLimit } });
      } finally { generationBusy = false; }
      return;
    }

    const interviewMatch = pathname.match(/^\/api\/interviews\/([^/]+)$/);
    if (interviewMatch) {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      if (!UUID.test(interviewMatch[1])) { send(res, 404, { error: 'That item was not found.' }); return; }
      const savedSession = await store.getInterviewSession(interviewMatch[1]);
      if (!savedSession) { send(res, 404, { error: 'That item was not found.' }); return; }
      send(res, 200, { session: publicSession(savedSession) }); return;
    }

    if (pathname === '/api/updates/preview') {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      const body = await readJson(req);
      if (body.consent !== true || typeof body.jobId !== 'string' || !body.jobId || typeof body.message !== 'string' ||
          body.message.length > 12000 || !body.message.trim() || !revisionValue(body.revision)) { send(res, 400, { error: 'The request is invalid.' }); return; }
      if (generationBusy) { send(res, 429, { error: 'An assistant request is already in progress.' }); return; }
      if (lastGenerationAt && Date.now() - lastGenerationAt < cooldownMs) { send(res, 429, { error: 'Please wait before starting another assistant request.' }); return; }
      if (!llm.configured) { send(res, 503, { error: 'The assistant is not configured.' }); return; }
      generationBusy = true;
      try {
        const snapshot = await store.getState();
        if (snapshot.revision !== body.revision) { send(res, 409, { error: 'The workspace changed. Reload it and try again.' }); return; }
        const job = (snapshot.state.jobs || []).find(item => item.id === body.jobId);
        if (!job) { send(res, 404, { error: 'That item was not found.' }); return; }
        const updates = helper('updates', () => require('./updates.cjs').createUpdates(llm));
        const updateContext = { job: { company: job.company, role: job.role, description: job.description } };
        if (typeof updates.validateInput === 'function' && !updates.validateInput(updateContext, body.message)) { send(res, 400, { error: 'The request is invalid.' }); return; }
        const reserved = await store.reserveUsage(dailyLimit);
        if (!reserved) { send(res, 429, { error: 'The daily assistant limit has been reached.', usage: { used: await store.usageCount(), limit: dailyLimit } }); return; }
        lastGenerationAt = Date.now();
        const result = await updates.preview(updateContext, body.message);
        const latest = await store.getState();
        if (latest.revision !== body.revision) { send(res, 409, { error: 'The workspace changed. Reload it and try again.' }); return; }
        const update = await store.createCompanyUpdate(job.id, body.message, result, latest.revision);
        send(res, 200, { update, usage: { used: await store.usageCount(), limit: dailyLimit } });
      } finally { generationBusy = false; }
      return;
    }

    const updateAcceptMatch = pathname.match(/^\/api\/updates\/([^/]+)\/accept$/);
    if (updateAcceptMatch) {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      if (!UUID.test(updateAcceptMatch[1])) { send(res, 404, { error: 'That item was not found.' }); return; }
      const body = await readJson(req);
      if (!revisionValue(body.revision)) { send(res, 400, { error: 'The request is invalid.' }); return; }
      send(res, 200, await store.acceptCompanyUpdate(updateAcceptMatch[1], body.revision)); return;
    }

    const updateMatch = pathname.match(/^\/api\/updates\/([^/]+)$/);
    if (updateMatch) {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      if (!UUID.test(updateMatch[1])) { send(res, 404, { error: 'That item was not found.' }); return; }
      const update = await store.getCompanyUpdate(updateMatch[1]);
      if (!update) { send(res, 404, { error: 'That item was not found.' }); return; }
      send(res, 200, { update }); return;
    }

    if (pathname === '/api/proposals') {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      let jobId;
      try { jobId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('jobId'); }
      catch { jobId = null; }
      if (!jobId || jobId.length > 100) { send(res, 400, { error: 'The request is invalid.' }); return; }
      const proposal = await store.getLatestProposal(jobId);
      send(res, 200, { proposal: proposal || null }); return;
    }

    const acceptMatch = pathname.match(/^\/api\/proposals\/([^/]+)\/accept$/);
    if (acceptMatch) {
      if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' }); return; }
      if (!UUID.test(acceptMatch[1])) { send(res, 404, { error: 'That item was not found.' }); return; }
      const body = await readJson(req);
      if (!revisionValue(body.revision)) { send(res, 400, { error: 'The request is invalid.' }); return; }
      send(res, 200, await store.acceptProposal(acceptMatch[1], body.revision)); return;
    }

    const proposalMatch = pathname.match(/^\/api\/proposals\/([^/]+)$/);
    if (proposalMatch) {
      if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' }); return; }
      if (!UUID.test(proposalMatch[1])) { send(res, 404, { error: 'That item was not found.' }); return; }
      const proposal = await store.getProposal(proposalMatch[1]);
      if (!proposal) { send(res, 404, { error: 'That item was not found.' }); return; }
      send(res, 200, proposal); return;
    }

    send(res, 404, { error: 'Not found.' });
  }

  return async function handler(req, res) {
    safeHeaders(res);
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      try { await routeApi(req, res, pathname); }
      catch (error) {
        if (res.writableEnded) return;
        if (error && error.code === 'TOO_LARGE') { send(res, 413, { error: 'Request body is too large.' }); return; }
        if (error && error.code === 'BODY_TIMEOUT') { send(res, 408, { error: 'Request timed out.' }); return; }
        const [status, message] = errorResponse(error);
        send(res, status, { error: message });
      }
      return;
    }

    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    serveStatic(req, res, pathname);
  };
}

function handler(req, res) {
  safeHeaders(res);
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (pathname === '/api' || pathname.startsWith('/api/')) { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('Not found'); return; }
  serveStatic(req, res, pathname);
}

function parsePort(value) {
  if (value == null || value === '') return 4173;
  if (!/^\d+$/.test(value)) throw new Error('Invalid port');
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  return port;
}

function main() {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync(path.join(__dirname, '.env'))) {
    try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { console.error('Could not load environment configuration.'); process.exitCode = 1; return; }
  }
  let port;
  try { port = parsePort(process.env.PORT); }
  catch { console.error('PORT must be an integer from 1 to 65535.'); process.exitCode = 1; return; }

  let store, llm;
  try {
    const { createStore } = require('./storage.cjs');
    const { createLlm } = require('./llm.cjs');
    store = createStore(path.join(__dirname, 'data', 'career.sqlite'));
    llm = createLlm({ apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL });
  } catch { console.error('Could not initialize the local workspace.'); process.exitCode = 1; return; }

  const server = http.createServer(createApp({ store, llm }));
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on('error', () => { console.error('The local server could not start.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Scout: http://127.0.0.1:${server.address().port}`));
  const close = () => server.close(() => { try { store.close(); } catch { /* Cleanup is best-effort; never print store details. */ } });
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (require.main === module) main();
module.exports = { createApp, handler, PUBLIC_FILES, parsePort };
