'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./core.js');

let form;
const body = {
  innerHTML: '',
  querySelector(selector) { return selector === '#coach-coding-form' ? form : null; }
};
Object.defineProperty(body, 'innerHTML', { set(value) {
  this._innerHTML = value;
  form = {
    elements: Object.fromEntries(['problem', 'solution', 'language', 'topic', 'difficulty', 'jobId'].map(name => [name, { value: name === 'difficulty' ? 'Medium' : name === 'language' ? 'JavaScript' : '' }])),
    consent: { checked: false },
    querySelector(selector) { return selector === '[data-history]' ? {} : null; }
  };
}, get() { return this._innerHTML || ''; } });
const title = { textContent: '' };
const dialog = { open: false, showModal() { this.open = true; } };
const context = { Core, module: { exports: {} }, document: {
  querySelector(selector) { return ({ '#coach-title': title, '#coach-body': body, '#coach-dialog': dialog })[selector] || null; }
} };
vm.runInNewContext(fs.readFileSync(require.resolve('./coach-ui.js'), 'utf8'), context, { filename: 'coach-ui.js' });
const CoachUI = context.module.exports;

test('openCoding prefills a saved attempt and valid selected role without consent or provider calls', () => {
  const state = Core.seed();
  const malicious = '<img src=x onerror=alert(1)>\nconst answer = 42;';
  let apiCalls = 0;
  CoachUI.configure({ getState: () => state, ai: { configured: true }, api() { apiCalls++; } });
  CoachUI.openCoding({ jobId: 'job-2', input: {
    problem: 'Given a graph, visit every node.', solution: malicious, language: 'JavaScript', topic: 'Graph traversal', difficulty: 'Hard'
  } });

  assert.equal(title.textContent, 'Coding coach');
  assert.equal(dialog.open, true);
  assert.equal(form.elements.jobId.value, 'job-2');
  assert.equal(form.elements.problem.value, 'Given a graph, visit every node.');
  assert.equal(form.elements.solution.value, malicious);
  assert.equal(form.elements.language.value, 'JavaScript');
  assert.equal(form.elements.topic.value, 'Graph traversal');
  assert.equal(form.elements.difficulty.value, 'Hard');
  assert.equal(form.consent.checked, false);
  assert.match(body.innerHTML, /name="solution" maxlength="12000"/);
  assert.doesNotMatch(body.innerHTML, /<img|onerror=/i);
  assert.equal(apiCalls, 0);
});

test('openCoding leaves an unknown role unselected and preserves free-text values safely', () => {
  const state = Core.seed();
  const problem = '<svg onload=alert(1)> string problem';
  let apiCalls = 0;
  CoachUI.configure({ getState: () => state, ai: { configured: false }, api() { apiCalls++; } });
  CoachUI.openCoding({ jobId: 'missing-job', input: { problem, solution: 'line 1\nline 2', language: 'Python', topic: 'Strings', difficulty: 'Easy' } });

  assert.equal(form.elements.jobId.value, '');
  assert.equal(form.elements.problem.value, problem);
  assert.equal(form.elements.solution.value, 'line 1\nline 2');
  assert.equal(form.elements.language.value, 'Python');
  assert.equal(form.elements.topic.value, 'Strings');
  assert.equal(form.elements.difficulty.value, 'Easy');
  assert.equal(form.consent.checked, false);
  assert.doesNotMatch(body.innerHTML, /<svg|onload=/i);
  assert.equal(apiCalls, 0);
});
