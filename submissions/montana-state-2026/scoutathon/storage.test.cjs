const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Core = require('./core.js');
const { createStore } = require('./storage.cjs');

test('new dashboard steps and their completion persist across SQLite restarts', t => {
  const db = database(t);
  let store = db.open();
  const initial = store.getState();
  assert.equal(Core.addTask(initial.state, '  Prepare three interview stories  '), true);
  const task = initial.state.tasks[0];
  assert.equal(task.title, 'Prepare three interview stories');
  assert.equal(task.done, false);
  assert.equal(new Set(initial.state.tasks.map(item => item.id)).size, initial.state.tasks.length);
  store.saveState(initial.state, initial.revision);
  store.close();
  store = db.open();
  const saved = store.getState();
  assert.deepEqual(saved.state.tasks[0], task);
  saved.state.tasks[0].done = true;
  store.saveState(saved.state, saved.revision);
  store.close();
  store = db.open();
  assert.equal(store.getState().state.tasks[0].done, true);
});

function database(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-store-'));
  const filename = path.join(directory, 'nested', 'career.sqlite');
  const stores = [];
  t.after(() => {
    for (const store of stores) { try { store.close(); } catch (_) { /* A test may close before reopening. */ } }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { filename, open() { const store = createStore(filename); stores.push(store); return store; } };
}

function assertCode(code, action) {
  assert.throws(action, error => error && error.code === code);
}

const materials = (suffix = '') => ({
  resume: `Resume notes ${suffix}`,
  cover: `Cover letter ${suffix}`,
  outreach: `Outreach draft ${suffix}`
});

test('seed state and saved revisions persist across store restarts', t => {
  const db = database(t);
  let store = db.open();
  const initial = store.getState();
  assert.deepEqual(initial, { state: Core.seed(), revision: 0, initialized: false });
  const saved = store.saveState(initial.state, initial.revision);
  assert.equal(saved.revision, 1);
  assert.equal(saved.initialized, true);
  const expected = structuredClone(saved);
  store.close();

  store = db.open();
  assert.deepEqual(store.getState(), expected);
});

test('saveState rejects invalid data and stale revisions without overwriting', t => {
  const store = database(t).open();
  const initial = store.getState();
  const first = store.saveState(initial.state, 0);
  const changed = structuredClone(first.state);
  changed.profile.target = 'Updated target';
  assertCode('CONFLICT', () => store.saveState(changed, 0));
  assertCode('INVALID', () => store.saveState({ ...changed, jobs: [{ ...changed.jobs[0], status: 'Hired' }] }, 1));
  assert.deepEqual(store.getState(), first);
});

test('proposal creation previews without changing state and acceptance updates only its job materials', t => {
  const db = database(t);
  let store = db.open();
  const initial = store.getState();
  const saved = store.saveState(initial.state, initial.revision);
  const before = structuredClone(saved.state);
  store.createProposal('job-1', materials('older proposal'), saved.revision);
  const result = {
    ...materials(`'); DROP TABLE workspace; --`),
    summary: 'A concise proposal summary.',
    strengths: ['React project experience'],
    gaps: ['Accessibility testing'],
    nextSteps: ['Review the role description'],
    evidence: [{ claim: 'Built a React app', source: 'Campus Events Board project' }]
  };
  const proposal = store.createProposal('job-1', result, saved.revision);
  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.jobId, 'job-1');
  assert.deepEqual(proposal.result, result);
  assert.deepEqual(store.getProposal(proposal.id), proposal);
  assert.deepEqual(store.getLatestProposal('job-1'), proposal);
  assert.equal(store.getLatestProposal('missing'), null);
  assert.deepEqual(store.getState(), saved);
  store.close();

  store = db.open();
  assert.deepEqual(store.getProposal(proposal.id).result, result);
  assert.deepEqual(store.getLatestProposal('job-1'), proposal);

  const accepted = store.acceptProposal(proposal.id, saved.revision);
  assert.equal(accepted.revision, saved.revision + 1);
  assert.deepEqual(accepted.state.profile, before.profile);
  assert.deepEqual(accepted.state.projects, before.projects);
  assert.deepEqual(accepted.state.practice, before.practice);
  assert.deepEqual(accepted.state.tasks, before.tasks);
  assert.deepEqual(accepted.state.jobs.slice(1), before.jobs.slice(1));
  assert.deepEqual(accepted.state.jobs[0], {
    ...before.jobs[0], ...materials(`'); DROP TABLE workspace; --`), status: 'Preparing'
  });
  assert.equal(store.getProposal(proposal.id).status, 'accepted');
  assertCode('CONFLICT', () => store.acceptProposal(proposal.id, accepted.revision));
  assert.equal(store.usageCount('2026-10-17'), 0);
});

test('proposal errors cover missing jobs, invalid materials, and stale workspace revisions', t => {
  const store = database(t).open();
  const saved = store.saveState(Core.seed(), 0);
  assertCode('NOT_FOUND', () => store.createProposal("job-1' OR 1=1 --", materials(), saved.revision));
  assertCode('INVALID', () => store.createProposal('job-1', { resume: 'only one field' }, saved.revision));
  assert.equal(store.getProposal('missing'), null);
  const proposal = store.createProposal('job-1', materials(), saved.revision);

  const changed = structuredClone(saved.state);
  changed.tasks[0].done = true;
  const next = store.saveState(changed, saved.revision);
  assertCode('CONFLICT', () => store.acceptProposal(proposal.id, next.revision));
  assert.equal(store.getProposal(proposal.id).status, 'pending');
  assert.deepEqual(store.getState(), next);
  assertCode('NOT_FOUND', () => store.acceptProposal('missing', next.revision));
});

test('accepting materials preserves an already advanced application stage', t => {
  const store = database(t).open();
  const state = Core.seed();
  assert.equal(Core.transition(state, 'job-1', 'Applied'), true);
  const saved = store.saveState(state, 0);
  const proposal = store.createProposal('job-1', materials(), saved.revision);
  const accepted = store.acceptProposal(proposal.id, saved.revision);
  assert.equal(accepted.state.jobs[0].status, 'Applied');
});

test('daily usage cap is atomic and survives reopening', t => {
  const db = database(t);
  let store = db.open();
  const day = '2026-10-17';
  assert.equal(store.reserveUsage(2, day), true);
  assert.equal(store.reserveUsage(2, day), true);
  assert.equal(store.reserveUsage(2, day), false);
  assert.equal(store.usageCount(day), 2);
  store.close();

  store = db.open();
  assert.equal(store.usageCount(day), 2);
  assert.equal(store.reserveUsage(3, day), true);
  assert.equal(store.usageCount(day), 3);
  assert.equal(store.usageCount('2026-10-18'), 0);
  assertCode('INVALID', () => store.reserveUsage(20, "2026-10-17'; DROP TABLE usage; --"));
  assert.equal(store.usageCount(day), 3);
});

test('coach reports persist with provenance and are capped at 500 records', t => {
  const db = database(t);
  let store = db.open();
  const saved = store.saveState(Core.seed(), 0);
  const input = { context: { project: { id: 'project-1' } }, files: [{ path: 'src/app.js', content: 'safe source' }] };
  const result = { summary: 'Review summary', findings: [], tasks: [{ title: 'Add keyboard support', reason: 'Improve usability', doneWhen: 'Keyboard check documented' }] };
  const review = store.saveCoachReview('project', 'project-1', 'job-1', input, result, saved.revision);
  assert.deepEqual(review, { id: review.id, kind: 'project', targetId: 'project-1', jobId: 'job-1', input, result,
    revision: saved.revision, createdAt: review.createdAt, tasksImported: false });
  assert.deepEqual(store.getCoachReview(review.id), review);
  assert.deepEqual(store.listCoachReviews('project', 20, 'project-1'), [review]);
  assert.deepEqual(store.listCoachReviews('coding', 20), []);
  store.close();
  store = db.open();
  assert.deepEqual(store.getCoachReview(review.id), review);
  assert.throws(() => store.saveCoachReview('project', 'project-1', '', { value: 'x'.repeat(100001) }, result, saved.revision), e => e.code === 'INVALID');
  assert.throws(() => store.saveCoachReview('project', 'project-1', '', input, { value: 'x'.repeat(100001) }, saved.revision), e => e.code === 'INVALID');
  assert.throws(() => store.saveCoachReview('project', 'missing', '', input, result, saved.revision), e => e.code === 'NOT_FOUND');
  assert.throws(() => store.saveCoachReview('project', 'project-1', 'missing', input, result, saved.revision), e => e.code === 'NOT_FOUND');
});

test('coach task import is explicit, bounded by revision, preserves tasks, and runs once', t => {
  const store = database(t).open();
  const saved = store.saveState(Core.seed(), 0);
  const input = { context: {}, files: [] };
  const result = { tasks: [{ title: 'Add keyboard support' }, { title: 'Review error handling' }, { title: 'Add keyboard support' }] };
  const review = store.saveCoachReview('project', 'project-1', '', input, result, saved.revision);
  assert.throws(() => store.importCoachTasks(review.id, saved.revision + 1), e => e.code === 'CONFLICT');
  assert.deepEqual(store.getState(), saved);
  const imported = store.importCoachTasks(review.id, saved.revision);
  assert.equal(imported.revision, saved.revision + 1);
  assert.deepEqual(imported.state.tasks.slice(0, saved.state.tasks.length), saved.state.tasks);
  assert.deepEqual(imported.state.tasks.slice(-2), [
    { id: imported.state.tasks.at(-2).id, title: 'Add keyboard support', done: false },
    { id: imported.state.tasks.at(-1).id, title: 'Review error handling', done: false }
  ]);
  assert.equal(store.getCoachReview(review.id).tasksImported, true);
  assert.throws(() => store.importCoachTasks(review.id, imported.revision), e => e.code === 'CONFLICT');
  assert.equal(store.getState().state.tasks.length, saved.state.tasks.length + 2);
  const coding = store.saveCoachReview('coding', 'coding', '', { context: {}, input: {} }, { tasks: [] }, imported.revision);
  assert.throws(() => store.importCoachTasks(coding.id, imported.revision), e => e.code === 'INVALID');
});

test('interview turns and company updates persist, compare revisions, and mutate only after acceptance', t => {
  const db = database(t);
  const store = db.open();
  const saved = store.saveState(Core.seed(), 0);
  const context = { job: { company: 'Northstar Labs' }, companyResearch: { sources: [] } };
  const first = { role: 'interviewer', text: 'Tell me about a project.' };
  const session = store.createInterviewSession('job-1', 'mixed', context, first, saved.revision);
  assert.equal(session.history.length, 1);
  const loaded = store.getInterviewSession(session.id);
  assert.deepEqual(loaded, session);
  assert.deepEqual(store.listInterviewSessions('job-1'), [session]);
  const answer = { role: 'candidate', text: 'I built a board.' };
  const next = { role: 'interviewer', text: 'What tradeoff did you make?' };
  assert.throws(() => store.appendInterviewTurn(session.id, 2, answer, next, saved.revision), e => e.code === 'CONFLICT');
  assert.deepEqual(store.appendInterviewTurn(session.id, 1, answer, next, saved.revision).history, [first, answer, next]);
  assert.throws(() => store.appendInterviewTurn(session.id, 1, answer, next, saved.revision), e => e.code === 'CONFLICT');
  assert.throws(() => store.createInterviewSession('missing', 'mixed', context, first, saved.revision), e => e.code === 'NOT_FOUND');
  assert.throws(() => store.createInterviewSession('job-1', 'mixed', { value: 'x'.repeat(200001) }, first, saved.revision), e => e.code === 'INVALID');

  const update = store.createCompanyUpdate('job-1', 'You are invited to interview.', {
    summary: 'An interview invitation is proposed.', proposedStatus: 'Interview', evidenceQuote: 'invited to interview'
  }, saved.revision);
  assert.equal(store.getCompanyUpdate(update.id).message, 'You are invited to interview.');
  assert.deepEqual(store.getState(), saved);
  assert.throws(() => store.acceptCompanyUpdate(update.id, saved.revision + 1), e => e.code === 'CONFLICT');
  const accepted = store.acceptCompanyUpdate(update.id, saved.revision);
  assert.equal(accepted.revision, saved.revision + 1);
  assert.equal(accepted.state.jobs[0].status, 'Interview');
  assert.equal(accepted.state.jobs[1].status, saved.state.jobs[1].status);
  assert.equal(store.getCompanyUpdate(update.id).applied, true);
  assert.throws(() => store.acceptCompanyUpdate(update.id, accepted.revision), e => e.code === 'CONFLICT');
  const unknown = store.createCompanyUpdate('job-1', 'An ambiguous email.', { proposedStatus: 'Unknown', summary: 'Unclear', evidenceQuote: '' }, accepted.revision);
  assert.throws(() => store.acceptCompanyUpdate(unknown.id, accepted.revision), e => e.code === 'CONFLICT');
});
