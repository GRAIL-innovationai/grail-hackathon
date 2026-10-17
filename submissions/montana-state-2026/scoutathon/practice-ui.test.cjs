'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./core.js');

const context = { Core, module: { exports: {} }, structuredClone };
vm.runInNewContext(fs.readFileSync(require.resolve('./practice-ui.js'), 'utf8'), context, { filename: 'practice-ui.js' });
const PracticeUI = context.module.exports;

test('viewer separates first-party examples from manual attempts and disclaims code execution', () => {
  const example = PracticeUI.render(Core.seed().practice[0]);
  assert.match(example, /DEMO example/);
  assert.match(example, /first-party sample code and notes/);
  assert.match(example, /no code was run/);
  const manual = PracticeUI.render({ ...Core.seed().practice[0], attempt: { language: 'JavaScript', solution: 'const ok = true;', notes: 'My own notes', outcome: 'Self reported', demo: false } });
  assert.match(manual, /Your manually recorded attempt/);
  assert.match(manual, /Self-reported outcome/);
  assert.match(manual, /does not execute code or verify a test result/);
});

test('viewer escapes attempt fields and renders bounded manual notes-only entry fields', () => {
  const item = { ...Core.seed().practice[0], attempt: {
    language: '<img src=x onerror=1>', solution: '</textarea><script>x</script>', notes: '<svg onload=x>', outcome: '<b>done</b>', demo: false
  } };
  const html = PracticeUI.render(item);
  assert.doesNotMatch(html, /<img|<script|<svg|<b>/i);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /maxlength="12000"/);
  assert.match(html, /maxlength="2000"/);
  assert.match(html, /placeholder="Paste your solution or leave blank to save notes only"/);
});

test('missing practice record renders a safe empty state', () => {
  assert.match(PracticeUI.render(null), /could not be found/);
});

test('viewer opens the dedicated practice dialog and commits a manual notes-only attempt', async () => {
  let state = Core.seed();
  const controls = { language: { value: '' }, solution: { value: '' }, notes: { value: 'I practiced the stack invariant.' }, outcome: { value: '' } };
  let submit;
  const status = { textContent: '' };
  const saveButton = { disabled: false };
  const form = {
    elements: controls,
    addEventListener(type, handler) { assert.equal(type, 'submit'); submit = handler; },
    querySelector(selector) {
      if (selector === '[data-practice-status]') return status;
      if (selector === 'button[type="submit"]') return saveButton;
      return null;
    }
  };
  const body = { innerHTML: '', querySelector(selector) {
    if (selector === '[data-practice-attempt]') return form;
    if (selector === '[data-practice-status]') return status;
    return null;
  } };
  const title = { textContent: '' };
  const dialog = { open: false, showModal() { this.open = true; } };
  context.document = { querySelector(selector) { return ({ '#practice-dialog': dialog, '#practice-title': title, '#practice-body': body })[selector] || null; } };
  let committed;
  PracticeUI.configure({ getState: () => state, async commitState(next) { committed = next; state = next; return true; } });
  assert.equal(PracticeUI.open('practice-1'), true);
  assert.equal(dialog.open, true);
  assert.equal(title.textContent, 'Two Sum');
  let prevented = false;
  await submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(committed.practice[0].attempt.demo, false);
  assert.equal(committed.practice[0].attempt.solution, '');
  assert.equal(committed.practice[0].attempt.notes, 'I practiced the stack invariant.');
  assert.deepEqual(committed.profile, state.profile);
  assert.equal(status.textContent, 'Attempt saved on this computer.');
  assert.equal(saveButton.disabled, true);
  assert.match(body.innerHTML, /Your manually recorded attempt/);
  assert.doesNotMatch(body.innerHTML, /DEMO example/);
});
