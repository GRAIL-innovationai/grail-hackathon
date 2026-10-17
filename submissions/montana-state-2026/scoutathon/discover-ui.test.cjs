const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./core.js');
const seed = Core.seed();

function loadDiscover(document = null) {
  const window = { Core, JourneysUI: { safeUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; } } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./discover-ui.js'), 'utf8'), { window, document, URL, Date, Promise, structuredClone, crypto: { randomUUID: () => 'new-role' } });
  return window.DiscoverUI;
}

test('Discover renders the inline consented research composer and keeps samples below', () => {
  const context = { Core, window: { Core } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./views.js'), 'utf8'), context);
  const html = context.window.Views.discover(seed);
  assert.match(html, /discover-assistant/);
  assert.match(html, /CURATED \/ MANUAL SEARCH/);
  assert.match(html, /Circleback/);
  assert.doesNotMatch(html, /Find matching roles/);
});

test('report rendering escapes model text and accepts HTTPS evidence/listing links only', () => {
  const ui = loadDiscover();
  const run = { id: 'r1', request: '<img src=x>', revision: 1, createdAt: '2026-10-17T12:00:00Z', result: {
    source: 'Employer boards', summary: '<script>bad()</script>', sourceNotice: 'Check the source',
    plan: { queries: ['React & frontend'], location: 'Remote', level: 'Intern', rationale: 'Relevant skills' },
    recommendations: [{ job: { id: 'j1', company: '<b>North', role: 'Frontend intern', location: 'Remote', url: 'https://jobs.example/role?x=1&y=2', source: 'Board' }, whyFit: ['React'], gaps: ['Testing'], evidence: [{ quote: '<svg onload=x>', source: 'https://jobs.example/role' }], nextStep: 'Review the role.' }]
  } };
  ui.configure({ getState: () => ({ jobs: [] }), getRevision: () => 2 });
  const html = ui.renderReport(run);
  assert.match(html, /Your workspace has changed since this report/);
  assert.match(html, /Saved search plan and prior criteria/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&lt;svg onload=x&gt;/);
  assert.match(html, /href="https:\/\/jobs\.example\/role\?x=1&amp;y=2"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  run.result.recommendations[0].job.url = 'javascript:alert(1)';
  assert.doesNotMatch(ui.renderReport(run), /href="javascript:/);
});

test('separate postings with the same employer and title remain independently saveable', () => {
  const ui = loadDiscover();
  ui.configure({ getState: () => ({ jobs: [{ id: 'london', company: 'Example', role: 'Software Intern', url: 'https://example.com/london' }] }), getRevision: () => 1 });
  const run = { id: 'r', revision: 1, result: { recommendations: [{ job: { id: 'seattle', company: 'Example', role: 'Software Intern', url: 'https://example.com/seattle', demo: false } }] } };
  assert.match(ui.renderReport(run), />Save role<\/button>/);
  run.result.recommendations[0].job.url = 'https://example.com/london';
  assert.match(ui.renderReport(run), /disabled>Saved to Applications/);
});

test('research card saves an existing Available listing without duplicating or replacing its materials', async () => {
  let state = Core.seed();
  state.jobs[0].resume = 'Keep my existing draft';
  const job = structuredClone(state.jobs[0]);
  const run = { id: 'r', revision: 1, result: { recommendations: [{ job }] } };
  const elements = new Map();
  const makeElement = () => ({ value: '', checked: false, dataset: {}, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute() {} });
  const save = makeElement(); save.dataset.saveRecommendation = job.id;
  const container = { innerHTML: '', querySelector(selector) { if (!elements.has(selector)) elements.set(selector, makeElement()); return elements.get(selector); }, querySelectorAll(selector) { return selector === '[data-save-recommendation]' ? [save] : []; } };
  const ui = loadDiscover({ querySelector: () => container });
  let commits = 0;
  ui.configure({ getState: () => state, getRevision: () => 1,
    api: async path => path.endsWith('/runs') ? { runs: [run] } : { context: {}, revision: 1 },
    commitState: async next => { commits++; state = next; return true; }
  });
  assert.match(ui.renderReport(run), />Save role<\/button>/);
  const html = ui.renderReport(run);
  assert.ok(html.indexOf('data-save-recommendation') < html.indexOf('recommendation-columns'));
  ui.mount();
  await new Promise(resolve => setImmediate(resolve));
  await save.listeners.click();
  assert.equal(state.jobs[0].status, 'Saved');
  assert.equal(state.jobs[0].resume, 'Keep my existing draft');
  assert.equal(state.jobs.length, 6);
  assert.match(ui.renderReport(run), /disabled>Saved to Applications/);
  await save.listeners.click();
  assert.equal(commits, 1);
});

test('research refuses to send without explicit consent and sends bounded brief after selection', async () => {
  const elements = new Map();
  const makeElement = () => ({ value: '', checked: false, hidden: false, dataset: {}, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute() {} });
  const container = { innerHTML: '', querySelector(selector) { if (!elements.has(selector)) elements.set(selector, makeElement()); return elements.get(selector); }, querySelectorAll() { return []; } };
  const document = { querySelector(selector) { return selector === '#discover-assistant' ? container : null; } };
  const calls = [];
  let currentRevision = 3;
  const savedRun = { id: 'run-1', request: 'Intern roles', revision: 3, createdAt: '2026-10-17T12:00:00Z', result: { summary: 'Saved shortlist', plan: {}, recommendations: [] } };
  const ui = loadDiscover(document);
  ui.configure({
    api: async (path, options = {}) => { calls.push({ path, options }); if (path.endsWith('/context')) return { revision: currentRevision, context: { target: 'Frontend intern', skills: 'React', location: 'Remote', resumeExcerpt: currentRevision === 3 ? 'Reviewed text' : 'Updated reviewed text' } }; if (path.endsWith('/runs')) return { runs: [] }; if (path.endsWith('/research')) return { run: savedRun, usage: { used: 1, limit: 20 } }; throw new Error('Unexpected endpoint'); },
    ai: { configured: true }, getState: () => seed, getRevision: () => currentRevision, flushSaves: async () => true,
    commitState: async () => true
  });
  ui.mount();
  await new Promise(resolve => setImmediate(resolve));
  container.querySelector('#discovery-brief').value = 'a'.repeat(1205);
  let submit = container.querySelector('[data-discovery-form]').listeners.submit;
  await submit({ preventDefault() {} });
  assert.equal(calls.some(call => call.path.endsWith('/research')), false);
  currentRevision = 4;
  container.querySelector('[data-consent]').checked = true;
  submit = container.querySelector('[data-discovery-form]').listeners.submit;
  await submit({ preventDefault() {} });
  assert.equal(calls.some(call => call.path.endsWith('/research')), false);
  assert.match(container.innerHTML, /Updated reviewed text/);
  assert.match(container.innerHTML, /profile changed since you reviewed this context/);
  container.querySelector('[data-consent]').checked = true;
  submit = container.querySelector('[data-discovery-form]').listeners.submit;
  await submit({ preventDefault() {} });
  const research = calls.find(call => call.path.endsWith('/research'));
  assert.equal(research.options.body.consent, true);
  assert.equal(research.options.body.revision, 4);
  assert.equal(research.options.body.request.length, 1200);
  assert.match(container.innerHTML, /Saved shortlist/);
});
