'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Core = require('./core.js');
const { createStore } = require('./storage.cjs');
const { createApp } = require('./server.cjs');

const report = {
  summary: 'A small set of relevant public listings.',
  plan: { queries: ['JavaScript'], location: 'Remote', level: '', rationale: 'role fit' },
  recommendations: [], searchedAt: '2026-10-17T00:00:00.000Z', source: 'Public job listings',
  sourceNotice: 'Test sources', limitations: ['No hiring guarantee']
};

function removeTempDir(directory) {
  const root = path.resolve(os.tmpdir());
  const target = path.resolve(directory);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Refusing to remove a path outside the temporary test directory.');
  fs.rmSync(target, { recursive: true, force: true });
}

async function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'career-discovery-'));
  const filename = path.join(directory, 'career.sqlite');
  const store = createStore(filename);
  let calls = 0;
  const discovery = options.discovery || {
    async run() { calls++; return report; }
  };
  const llm = { configured: true, provider: 'Mock', model: 'test-model' };
  const server = http.createServer(createApp({ store, llm, discovery, dailyLimit: options.dailyLimit ?? 20,
    cooldownMs: 0, token: options.token || 'test-discovery-token' }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, init = {}, authenticated = true) => fetch(`${base}${url}`, {
    ...init,
    headers: { ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(authenticated ? { 'x-workspace-token': options.token || 'test-discovery-token' } : {}), ...init.headers }
  });
  const state = Core.seed();
  state.profile.resumeText = 'JavaScript developer with project experience.';
  const saved = await store.saveState(state, 0);
  async function close() {
    await new Promise(resolve => server.close(resolve));
    store.close();
    removeTempDir(directory);
  }
  return { directory, filename, store, server, base, request, saved, get calls() { return calls; }, close };
}

test('discovery requires consent and a current workspace revision before running', async () => {
  const app = await fixture();
  try {
    const noConsent = await app.request('/api/discovery/research', { method: 'POST', body: JSON.stringify({ request: 'Find remote JavaScript roles', revision: app.saved.revision }) });
    assert.equal(noConsent.status, 400);
    const stale = await app.request('/api/discovery/research', { method: 'POST', body: JSON.stringify({ request: 'Find remote JavaScript roles', consent: true, revision: app.saved.revision - 1 }) });
    assert.equal(stale.status, 409);
    assert.equal(app.calls, 0);
    assert.equal(app.store.usageCount(), 0);
  } finally { await app.close(); }
});

test('discovery validates bounded nonblank requests and requires the workspace token', async () => {
  const app = await fixture();
  try {
    const missingToken = await app.request('/api/discovery/research', { method: 'POST', body: JSON.stringify({ request: 'JavaScript', consent: true, revision: app.saved.revision }) }, false);
    assert.equal(missingToken.status, 403);
    for (const request of ['', '  ', 'x'.repeat(1201)]) {
      const response = await app.request('/api/discovery/research', { method: 'POST', body: JSON.stringify({ request, consent: true, revision: app.saved.revision }) });
      assert.equal(response.status, 400);
    }
    assert.equal(app.calls, 0);
    assert.equal(app.store.usageCount(), 0);
  } finally { await app.close(); }
});

test('discovery uses one shared reservation per search unit and stores only completed reports', async () => {
  const observed = [];
  const discovery = {
    async run(profile, request, { reserveCall, projects }) {
      observed.push({ profile, request, projects });
      await reserveCall();
      await reserveCall();
      return report;
    }
  };
  const app = await fixture({ discovery, dailyLimit: 3 });
  try {
    const payload = { request: 'Find remote JavaScript roles', consent: true, revision: app.saved.revision };
    const first = await app.request('/api/discovery/research', { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.usage.used, 2);
    assert.deepEqual(firstBody.run.result, report);
    assert.equal(observed[0].request, payload.request);
    assert.equal(observed[0].profile.resumeText, 'JavaScript developer with project experience.');
    assert.deepEqual(observed[0].projects, app.saved.state.projects);

    const incomplete = await app.request('/api/discovery/research', { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(incomplete.status, 429);
    assert.equal(app.store.usageCount(), 3);
    const history = await app.request('/api/discovery/runs');
    assert.equal(history.status, 200);
    const runs = (await history.json()).runs;
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].result, report);
  } finally { await app.close(); }
});

test('discovery history survives reopening SQLite without invoking the provider', async () => {
  const app = await fixture({ discovery: { async run(profile, request, { reserveCall }) { await reserveCall(); return report; } } });
  try {
    const response = await app.request('/api/discovery/research', { method: 'POST', body: JSON.stringify({
      request: 'Find remote JavaScript roles', consent: true, revision: app.saved.revision
    }) });
    assert.equal(response.status, 200);
    const stored = (await response.json()).run;
    const filename = app.filename;
    app.store.close();
    const reopened = createStore(filename);
    try {
      const persisted = reopened.listDiscoveryRuns();
      assert.equal(persisted.length, 1);
      assert.deepEqual(persisted[0], stored);
      assert.equal(app.calls, 0);
    } finally { reopened.close(); }
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    removeTempDir(app.directory);
  }
});

test('discovery context is read-only and upstream errors do not expose provider details', async () => {
  const app = await fixture({ discovery: {
    async run(_profile, _request, { reserveCall }) { await reserveCall(); throw Object.assign(new Error('secret provider response body'), { code: 'UPSTREAM' }); }
  } });
  try {
    const context = await app.request('/api/discovery/context');
    assert.equal(context.status, 200);
    const contextBody = await context.json();
    assert.equal(contextBody.context.target, app.saved.state.profile.target);
    assert.equal(contextBody.context.resumeExcerpt, app.saved.state.profile.resumeText);
    assert.equal(Object.hasOwn(contextBody.context, 'name'), false);
    assert.equal(typeof contextBody.notice, 'string');
    const failed = await app.request('/api/discovery/research', { method: 'POST', body: JSON.stringify({
      request: 'Find remote JavaScript roles', consent: true, revision: app.saved.revision
    }) });
    assert.equal(failed.status, 502);
    assert.doesNotMatch(await failed.text(), /secret provider response body/);
    assert.equal(app.store.usageCount(), 1);
    const history = await app.request('/api/discovery/runs');
    assert.deepEqual((await history.json()).runs, []);
  } finally { await app.close(); }
});
