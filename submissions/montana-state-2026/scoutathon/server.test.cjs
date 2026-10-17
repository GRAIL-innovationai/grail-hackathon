'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Core = require('./core.js');
const { createStore } = require('./storage.cjs');
const { createApp, handler, parsePort } = require('./server.cjs');

const proposalResult = {
  summary: 'A concise role-focused summary.',
  strengths: ['JavaScript'], gaps: ['Testing'], nextSteps: ['Add a test example'],
  evidence: [{ source: 'resume', quote: 'JavaScript' }],
  resume: 'Resume draft', cover: 'Cover draft', outreach: 'Outreach draft'
};

function removeTempDir(directory) {
  const root = path.resolve(os.tmpdir());
  const target = path.resolve(directory);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Refusing to remove a path outside the temporary test directory.');
  fs.rmSync(target, { recursive: true, force: true });
}

function requestWithHost(url, host) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, headers: { host } }, response => {
      response.resume();
      resolve(response);
    });
    req.once('error', reject);
    req.end();
  });
}

async function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-server-'));
  const filename = path.join(directory, 'career.sqlite');
  const store = createStore(filename);
  const llm = options.llm || {
    configured: true, provider: 'Mock', model: 'test-model',
    async generate() { return proposalResult; }
  };
  const server = http.createServer(createApp({ store, llm, coaches: options.coaches, opportunities: options.opportunities, updates: options.updates,
    interview: options.interview, research: options.research, resume: options.resume, dailyLimit: options.dailyLimit ?? 20, cooldownMs: options.cooldownMs ?? 0, token: options.token }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const sessionResponse = await fetch(`${base}/api/session`);
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  const request = (url, init = {}, authenticated = true) => fetch(`${base}${url}`, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(authenticated ? { 'x-workspace-token': session.token } : {}),
      ...init.headers
    }
  });
  async function saveSeed() {
    const state = Core.seed();
    state.profile.resumeText = 'Alex Morgan built JavaScript applications and used SQL for data projects.';
    const response = await request('/api/state', { method: 'PUT', body: JSON.stringify({ state, revision: 0 }) });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function close() {
    await new Promise(resolve => server.close(resolve));
    store.close();
    removeTempDir(directory);
  }
  return { directory, filename, store, server, base, session, request, saveSeed, close };
}

test('personal background persists and supports consented application drafting without resume text', async () => {
  let received;
  const app = await fixture({ llm: { configured: true, async generate(profile) { received = profile; return proposalResult; } } });
  try {
    const state = Core.seed(); state.profile.resumeText = ''; state.profile.background = 'I mentor classmates and build accessible tools.';
    const save = await app.request('/api/state', { method: 'PUT', body: JSON.stringify({ state, revision: 0 }) });
    const saved = await save.json();
    assert.equal(save.status, 200);
    const generate = await app.request('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true }) });
    assert.equal(generate.status, 200);
    assert.equal(received.background, state.profile.background);
    assert.equal((await (await app.request('/api/state')).json()).state.profile.background, state.profile.background);
  } finally { await app.close(); }
});

test('static server serves the app and keeps private paths inaccessible', async () => {
  const app = await fixture();
  try {
    const page = await fetch(app.base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Scout/);
    assert.equal(page.headers.get('content-security-policy')?.includes("default-src 'self'"), true);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    for (const file of ['styles.css', 'core.js', 'views.js', 'app.js', 'coach-ui.js', 'discover-ui.js', 'practice-ui.js', 'assets/Inter.ttf']) assert.equal((await fetch(`${app.base}/${file}`)).status, 200, file);
    for (const file of ['AGENTS.md', 'server.cjs', 'storage.cjs', 'llm.cjs', 'package.json', '.env', 'data/career.sqlite', '..%2f..%2fWindows%2fwin.ini']) {
      assert.equal((await fetch(`${app.base}/${file}`)).status, 404, file);
    }
    assert.equal((await fetch(app.base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${app.base}/api/state`)).status, 403);
  } finally { await app.close(); }
});

test('session and API reject cross-origin, cross-site, foreign hosts, and missing tokens', async () => {
  const app = await fixture();
  try {
    const foreignOrigin = await fetch(`${app.base}/api/session`, { headers: { origin: 'https://evil.example' } });
    assert.equal(foreignOrigin.status, 403);
    const crossSite = await fetch(`${app.base}/api/session`, { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(crossSite.status, 403);
    const missingToken = await app.request('/api/state', {}, false);
    assert.equal(missingToken.status, 403);
    const foreignHost = await requestWithHost(`${app.base}/api/session`, `evil.example:${app.server.address().port}`);
    assert.equal(foreignHost.statusCode, 403);
    const localhost = await requestWithHost(`${app.base}/api/session`, `localhost:${app.server.address().port}`);
    assert.equal(localhost.statusCode, 200);
    const sameOrigin = await fetch(`${app.base}/api/session`, { headers: { origin: app.base } });
    assert.equal(sameOrigin.status, 200);
  } finally { await app.close(); }
});

test('API validates JSON and body size, and reports methods explicitly', async () => {
  const app = await fixture();
  try {
    const invalidType = await app.request('/api/state', { method: 'PUT', body: '{}' , headers: { 'content-type': 'text/plain' } });
    assert.equal(invalidType.status, 400);
    const invalidJson = await app.request('/api/state', { method: 'PUT', body: '{' });
    assert.equal(invalidJson.status, 400);
    const oversized = await app.request('/api/state', { method: 'PUT', body: JSON.stringify({ state: 'x'.repeat(1024 * 1024 + 1), revision: 0 }) });
    assert.equal(oversized.status, 413);
    const method = await app.request('/api/generate', { method: 'GET' });
    assert.equal(method.status, 405);
    assert.equal(method.headers.get('allow'), 'POST');
    assert.equal(method.headers.get('cache-control'), 'no-store');
  } finally { await app.close(); }
});

test('state saves use compare-and-swap revisions and reject invalid state', async () => {
  const app = await fixture();
  try {
    const initial = await (await app.request('/api/state')).json();
    assert.equal(initial.revision, 0);
    assert.equal(initial.initialized, false);
    const state = Core.seed();
    const saved = await app.request('/api/state', { method: 'PUT', body: JSON.stringify({ state, revision: 0 }) });
    assert.equal(saved.status, 200);
    const snapshot = await saved.json();
    assert.equal(snapshot.revision, 1);
    assert.equal(snapshot.initialized, true);
    const stale = await app.request('/api/state', { method: 'PUT', body: JSON.stringify({ state, revision: 0 }) });
    assert.equal(stale.status, 409);
    const invalid = await app.request('/api/state', { method: 'PUT', body: JSON.stringify({ state: {}, revision: 1 }) });
    assert.equal(invalid.status, 400);
  } finally { await app.close(); }
});

test('generation creates a read-only proposal and acceptance applies its materials once', async () => {
  let observed;
  const app = await fixture({ llm: { configured: true, provider: 'Mock', model: 'test-model', async generate(profile, job) { observed = { profile, job }; return proposalResult; } } });
  try {
    const saved = await app.saveSeed();
    const before = await (await app.request('/api/state')).json();
    const response = await app.request('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true }) });
    assert.equal(response.status, 200);
    const generated = await response.json();
    assert.equal(generated.proposal.status, 'pending');
    assert.equal(generated.usage.used, 1);
    assert.equal(observed.job.id, 'job-1');
    assert.equal(observed.profile.resumeText, before.state.profile.resumeText);
    const afterPreview = await (await app.request('/api/state')).json();
    assert.deepEqual(afterPreview, before);
    const reopened = await app.request(`/api/proposals/${generated.proposal.id}`);
    assert.equal(reopened.status, 200);
    assert.deepEqual(await reopened.json(), generated.proposal);
    const latest = await app.request('/api/proposals?jobId=job-1');
    assert.deepEqual((await latest.json()).proposal, generated.proposal);

    const accepted = await app.request(`/api/proposals/${generated.proposal.id}/accept`, { method: 'POST', body: JSON.stringify({ revision: saved.revision }) });
    assert.equal(accepted.status, 200);
    const result = await accepted.json();
    assert.equal(result.revision, saved.revision + 1);
    const job = result.state.jobs.find(item => item.id === 'job-1');
    assert.equal(job.resume, proposalResult.resume);
    assert.equal(job.cover, proposalResult.cover);
    assert.equal(job.outreach, proposalResult.outreach);
    assert.equal(job.status, 'Preparing');
    const unchanged = result.state.jobs.find(item => item.id === 'job-2');
    assert.equal(unchanged.resume, '');
    const twice = await app.request(`/api/proposals/${generated.proposal.id}/accept`, { method: 'POST', body: JSON.stringify({ revision: result.revision }) });
    assert.equal(twice.status, 409);
  } finally { await app.close(); }
});

test('unconfigured generation returns before reserving usage or calling a provider', async () => {
  let calls = 0;
  const app = await fixture({ llm: { configured: false, provider: 'Groq', model: 'test-model', async generate() { calls++; throw new Error('must not call'); } } });
  try {
    const saved = await app.saveSeed();
    const response = await app.request('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true }) });
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
    assert.equal(app.store.usageCount(), 0);
  } finally { await app.close(); }
});

test('stale workspace changes invalidate proposals and preserve the edited workspace', async () => {
  const app = await fixture();
  try {
    const saved = await app.saveSeed();
    const response = await app.request('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true }) });
    assert.equal(response.status, 200);
    const { proposal } = await response.json();
    const changed = await (await app.request('/api/state')).json();
    changed.state.jobs.find(job => job.id === 'job-1').description = 'Revised role description after proposal generation.';
    const update = await app.request('/api/state', { method: 'PUT', body: JSON.stringify({ state: changed.state, revision: changed.revision }) });
    assert.equal(update.status, 200);
    const accept = await app.request(`/api/proposals/${proposal.id}/accept`, { method: 'POST', body: JSON.stringify({ revision: changed.revision + 1 }) });
    assert.equal(accept.status, 409);
    const current = await (await app.request('/api/state')).json();
    assert.equal(current.state.jobs.find(job => job.id === 'job-1').description, 'Revised role description after proposal generation.');
    assert.equal(current.state.jobs.find(job => job.id === 'job-1').resume, '');
  } finally { await app.close(); }
});

test('generation allows one request at a time and enforces the cooldown', async () => {
  let markStarted;
  let release;
  const started = new Promise(resolve => { markStarted = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const app = await fixture({ cooldownMs: 60000, llm: { configured: true, provider: 'Mock', model: 'test-model', async generate() { markStarted(); await hold; return proposalResult; } } });
  try {
    const saved = await app.saveSeed();
    const payload = JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true });
    const firstPromise = app.request('/api/generate', { method: 'POST', body: payload });
    await started;
    const busy = await app.request('/api/generate', { method: 'POST', body: payload });
    assert.equal(busy.status, 429);
    release();
    const first = await firstPromise;
    assert.equal(first.status, 200);
    const cooling = await app.request('/api/generate', { method: 'POST', body: payload });
    assert.equal(cooling.status, 429);
  } finally { release(); await app.close(); }
});

test('provider errors are sanitized and reserved daily usage survives restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-quota-'));
  const filename = path.join(directory, 'career.sqlite');
  let store = createStore(filename);
  const state = Core.seed();
  const saved = store.saveState(state, 0);
  const llm = { configured: true, provider: 'Mock', model: 'test-model', async generate() { const error = new Error('secret provider response'); error.code = 'UPSTREAM'; throw error; } };
  const server = http.createServer(createApp({ store, llm, dailyLimit: 1, cooldownMs: 0, token: 'test-token' }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, init = {}) => fetch(`${base}${url}`, { ...init, headers: { ...(init.body === undefined ? {} : { 'content-type': 'application/json' }), 'x-workspace-token': 'test-token', ...init.headers } });
  try {
    const first = await request('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true }) });
    assert.equal(first.status, 502);
    assert.doesNotMatch(await first.text(), /secret provider response/);
    assert.equal(store.usageCount(), 1);
    store.close();
    await new Promise(resolve => server.close(resolve));

    store = createStore(filename);
    assert.equal(store.usageCount(), 1);
    const nextServer = http.createServer(createApp({ store, llm: { configured: true, provider: 'Mock', model: 'test-model', async generate() { return proposalResult; } }, dailyLimit: 1, cooldownMs: 0, token: 'test-token' }));
    await new Promise((resolve, reject) => { nextServer.once('error', reject); nextServer.listen(0, '127.0.0.1', resolve); });
    const nextBase = `http://127.0.0.1:${nextServer.address().port}`;
    const quota = await fetch(`${nextBase}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-token': 'test-token' }, body: JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true }) });
    assert.equal(quota.status, 429);
    assert.equal((await quota.json()).usage.used, 1);
    await new Promise(resolve => nextServer.close(resolve));
  } finally {
    try { if (store) store.close(); } catch { /* already closed */ }
    removeTempDir(directory);
  }
});

test('provider timeouts map to 504 without exposing provider details', async () => {
  const app = await fixture({ llm: { configured: true, provider: 'Mock', model: 'test-model', async generate() { const error = new Error('secret timeout details'); error.code = 'TIMEOUT'; throw error; } } });
  try {
    const saved = await app.saveSeed();
    const response = await app.request('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true }) });
    assert.equal(response.status, 504);
    assert.doesNotMatch(await response.text(), /secret timeout details/);
  } finally { await app.close(); }
});

test('coach API requires consent, validates targets, persists a review, and shares the role-review quota', async () => {
  const calls = [];
  const coaches = {
    validateFiles: files => Array.isArray(files) && files.length === 1 && files[0].content === 'const x = 1;',
    validateCodingInput: input => !!input && input.hintOnly === true,
    buildContext(state, jobId, previous) {
      calls.push({ contextState: state, jobId, previous });
      return { profile: { target: state.profile.target }, selectedJob: jobId ? { id: jobId } : null, practice: state.practice.slice(-1) };
    },
    async project(context, files) { calls.push({ project: { context, files } }); return { summary: 'Project review', findings: [], tasks: [{ title: 'Add tests' }] }; },
    async coding(context, input) { calls.push({ coding: { context, input } }); return { summary: 'Use an invariant', weaknesses: ['Loop boundary'], nextPractice: [{ topic: 'Arrays' }] }; }
  };
  const app = await fixture({ dailyLimit: 2, coaches });
  try {
    const saved = await app.saveSeed();
    const files = [{ path: 'src/index.js', content: 'const x = 1;' }];
    const missingConsent = await app.request('/api/coaches/project', { method: 'POST', body: JSON.stringify({ projectId: 'project-1', files, revision: saved.revision }) });
    assert.equal(missingConsent.status, 400);
    const missingProject = await app.request('/api/coaches/project', { method: 'POST', body: JSON.stringify({ projectId: 'unknown', files, revision: saved.revision, consent: true }) });
    assert.equal(missingProject.status, 404);
    assert.equal(app.store.usageCount(), 0);
    const before = await (await app.request('/api/state')).json();
    const response = await app.request('/api/coaches/project', { method: 'POST', body: JSON.stringify({ projectId: 'project-1', jobId: 'job-2', files, revision: saved.revision, consent: true }) });
    assert.equal(response.status, 200);
    const { review, usage } = await response.json();
    assert.equal(usage.used, 1);
    assert.equal(review.kind, 'project');
    assert.equal(review.targetId, 'project-1');
    assert.equal(review.jobId, 'job-2');
    assert.deepEqual(review.input, { context: { profile: { target: before.state.profile.target }, selectedJob: { id: 'job-2' }, practice: before.state.practice.slice(-1),
      project: { id: 'project-1', name: before.state.projects[0].name, url: before.state.projects[0].url, notes: before.state.projects[0].notes } }, files });
    assert.deepEqual(await (await app.request('/api/state')).json(), before);
    assert.deepEqual((await (await app.request('/api/coaches/reviews?kind=project&targetId=project-1')).json()).reviews, [review]);
    assert.deepEqual((await (await app.request(`/api/coaches/reviews/${review.id}`)).json()).review, review);
    const imported = await app.request(`/api/coaches/reviews/${review.id}/tasks`, { method: 'POST', body: JSON.stringify({ revision: saved.revision }) });
    assert.equal(imported.status, 200);
    const importedState = await imported.json();
    assert.equal(importedState.revision, saved.revision + 1);
    assert.equal(importedState.state.tasks.at(-1).title, 'Add tests');
    const again = await app.request(`/api/coaches/reviews/${review.id}/tasks`, { method: 'POST', body: JSON.stringify({ revision: importedState.revision }) });
    assert.equal(again.status, 409);

    const codeInput = { problem: 'Find two sum', solution: 'for (let i=0; i<n; i++) {}', language: 'JavaScript', topic: 'Arrays', difficulty: 'Easy', hintOnly: true };
    const coding = await app.request('/api/coaches/coding', { method: 'POST', body: JSON.stringify({ input: codeInput, revision: importedState.revision, consent: true }) });
    assert.equal(coding.status, 200);
    assert.equal((await coding.json()).usage.used, 2);
    assert.equal(calls.some(call => call.jobId === 'job-2' && call.previous.length === 0), true);
    const roleReview = await app.request('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', revision: importedState.revision, consent: true }) });
    assert.equal(roleReview.status, 429);
    assert.equal((await roleReview.json()).usage.used, 2);
  } finally { await app.close(); }
});

test('coding coach rejects invalid input before quota, and stale projects cannot import suggestions', async () => {
  const coaches = {
    validateFiles: files => Array.isArray(files) && files.length === 1,
    validateCodingInput: () => false,
    buildContext: () => ({ profile: {} }),
    async project() { return { summary: 'Review', findings: [], tasks: [{ title: 'Add tests' }] }; },
    async coding() { throw new Error('must not call'); }
  };
  const app = await fixture({ coaches });
  try {
    const saved = await app.saveSeed();
    const invalid = await app.request('/api/coaches/coding', { method: 'POST', body: JSON.stringify({ input: {}, revision: saved.revision, consent: true }) });
    assert.equal(invalid.status, 400);
    assert.equal(app.store.usageCount(), 0);
    const response = await app.request('/api/coaches/project', { method: 'POST', body: JSON.stringify({ projectId: 'project-1', files: [{ path: 'x.js', content: 'x' }], revision: saved.revision, consent: true }) });
    const review = (await response.json()).review;
    const changed = structuredClone(saved.state);
    changed.profile.target = 'Updated target';
    const updated = await app.request('/api/state', { method: 'PUT', body: JSON.stringify({ state: changed, revision: saved.revision }) });
    assert.equal(updated.status, 200);
    const importResponse = await app.request(`/api/coaches/reviews/${review.id}/tasks`, { method: 'POST', body: JSON.stringify({ revision: saved.revision + 1 }) });
    assert.equal(importResponse.status, 409);
    assert.equal(app.store.getState().state.tasks.length, saved.state.tasks.length);
  } finally { await app.close(); }
});

test('resume extraction and opportunity search use bounded helpers without retention or AI quota', async () => {
  let received;
  const app = await fixture({ dailyLimit: 1,
    resume: { async extractResume(filename, base64) { received = { filename, base64 }; return { text: Buffer.from(base64, 'base64').toString('utf8'), warning: '' }; } },
    opportunities: { async search(input) { return { jobs: [{ id: 'demo-1' }], source: 'Demo listings', notice: 'Sample roles', cachedAt: null, input }; } }
  });
  try {
    const extracted = await app.request('/api/resume/extract', { method: 'POST', body: JSON.stringify({ filename: 'resume.txt', base64: Buffer.from('Resume text').toString('base64') }) });
    assert.equal(extracted.status, 200);
    assert.equal((await extracted.json()).text, 'Resume text');
    assert.deepEqual(received, { filename: 'resume.txt', base64: Buffer.from('Resume text').toString('base64') });
    assert.equal(app.store.usageCount(), 0);
    const search = await app.request('/api/opportunities/search', { method: 'POST', body: JSON.stringify({ query: 'intern', level: 'internship', location: 'Bozeman' }) });
    assert.equal(search.status, 200);
    assert.deepEqual((await search.json()).input, { query: 'intern', level: 'internship', location: 'Bozeman' });
    assert.equal(app.store.usageCount(), 0);
    const oversized = await app.request('/api/resume/extract', { method: 'POST', body: JSON.stringify({ filename: 'x', base64: 'A'.repeat(3 * 1024 * 1024) }) });
    assert.equal(oversized.status, 413);
  } finally { await app.close(); }
});

test('company research and adaptive interview sessions are role-scoped, consented, versioned, and quota limited', async () => {
  const seen = [];
  const research = { async company(job) { seen.push({ researchFor: job.id }); return { sources: [{ title: 'Possible match', url: 'https://example.test/company', excerpt: 'A sample company overview.' }], notice: 'Sample research; check sources.' }; } };
  const interview = {
    buildInterviewContext(state, jobId, supplied, history) {
      seen.push({ context: { jobId, supplied, history } });
      return { profile: { resumeText: state.profile.resumeText }, job: { id: jobId }, companyResearch: supplied, history };
    },
    async generate(context, input) {
      seen.push({ contextSent: context, input });
      return { feedback: input.first ? 'Practice begins.' : 'Make the outcome clearer.', question: input.first ? 'Tell me about a project.' : 'What did you learn?',
        focus: 'Project impact', practiceTask: 'Add one metric.', limitations: 'Practice only.', evidenceQuote: input.first ? '' : input.answer.slice(0, 12) };
    }
  };
  const app = await fixture({ dailyLimit: 2, research, interview });
  try {
    const saved = await app.saveSeed();
    const company = await app.request('/api/company?jobId=job-1');
    assert.equal(company.status, 200);
    assert.equal((await company.json()).notice, 'Sample research; check sources.');
    const noConsent = await app.request('/api/interviews/start', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', mode: 'mixed', revision: saved.revision }) });
    assert.equal(noConsent.status, 400);
    const started = await app.request('/api/interviews/start', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', mode: 'mixed', revision: saved.revision, consent: true, researchConfirmed: true }) });
    assert.equal(started.status, 200);
    let session = (await started.json()).session;
    assert.equal(session.history[0].text, 'Tell me about a project.');
    assert.equal(session.context.notice, 'Sample research; check sources.');
    assert.equal(seen.find(item => item.context)?.context.supplied.sources[0].title, 'Possible match');
    const answer = await app.request(`/api/interviews/${session.id}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'I built a clear project and learned from feedback.', revision: saved.revision, consent: true }) });
    assert.equal(answer.status, 200);
    session = (await answer.json()).session;
    assert.equal(session.history.length, 3);
    assert.equal(session.history[1].role, 'candidate');
    assert.equal(session.history[2].feedback, 'Make the outcome clearer.');
    assert.equal((await (await app.request(`/api/interviews/${session.id}`)).json()).session.history.length, 3);
    assert.equal((await (await app.request('/api/interviews?jobId=job-1')).json()).sessions.length, 1);
    const limited = await app.request('/api/generate', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', revision: saved.revision, consent: true }) });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).usage.used, 2);
    const changed = structuredClone(saved.state); changed.profile.target = 'New target';
    const updated = await app.request('/api/state', { method: 'PUT', body: JSON.stringify({ state: changed, revision: saved.revision }) });
    const staleAnswer = await app.request(`/api/interviews/${session.id}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'Another answer', revision: saved.revision + 1, consent: true }) });
    assert.equal(staleAnswer.status, 409);
  } finally { await app.close(); }
});

test('company update proposals preserve the source message and require explicit current-revision acceptance', async () => {
  const seen = [];
  const updates = {
    validateInput(context, message) { return !!context.job && message.length <= 12000; },
    async preview(context, message) { seen.push({ context, message }); return { summary: 'Interview invitation.', proposedStatus: 'Interview', evidenceQuote: 'invited to interview' }; }
  };
  const app = await fixture({ dailyLimit: 1, updates });
  try {
    const saved = await app.saveSeed();
    const message = 'We would like to invite you to interview next week.';
    const preview = await app.request('/api/updates/preview', { method: 'POST', body: JSON.stringify({ jobId: 'job-1', message, revision: saved.revision, consent: true }) });
    assert.equal(preview.status, 200);
    const update = (await preview.json()).update;
    assert.equal(update.proposedStatus, 'Interview');
    assert.equal(update.message, message);
    const selected = saved.state.jobs[0];
    assert.deepEqual(seen[0].context, { job: { company: selected.company, role: selected.role, description: selected.description } });
    assert.equal(JSON.stringify(seen[0].context).includes('resumeText'), false);
    assert.equal((await (await app.request(`/api/updates/${update.id}`)).json()).update.message, message);
    const before = await (await app.request('/api/state')).json();
    assert.deepEqual(before, saved);
    const accepted = await app.request(`/api/updates/${update.id}/accept`, { method: 'POST', body: JSON.stringify({ revision: saved.revision }) });
    assert.equal(accepted.status, 200);
    const snapshot = await accepted.json();
    assert.equal(snapshot.state.jobs[0].status, 'Interview');
    assert.equal(snapshot.state.jobs[1].status, saved.state.jobs[1].status);
    const repeat = await app.request(`/api/updates/${update.id}/accept`, { method: 'POST', body: JSON.stringify({ revision: snapshot.revision }) });
    assert.equal(repeat.status, 409);
  } finally { await app.close(); }
});

test('legacy handler remains static-only and PORT parsing rejects unsafe values', async () => {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/api/session`)).status, 404);
    assert.equal(parsePort(undefined), 4173);
    assert.equal(parsePort('65535'), 65535);
    for (const value of ['0', '65536', '-1', '3.5', 'abc']) assert.throws(() => parsePort(value));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
