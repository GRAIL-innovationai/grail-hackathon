'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdates, validateInput, validateResult } = require('./updates.cjs');

const context = { job: { company: 'Example Co', role: 'Frontend Intern', description: 'Build accessible interfaces.' } };
const message = 'Hello, we would like to invite you to interview for the Frontend Intern role at Example Co.';
const result = { summary: 'The message explicitly invites the applicant to interview.', proposedStatus: 'Interview', evidenceQuote: 'invite you to interview' };
const fakeGroqKey = ['gsk', 'x'.repeat(25)].join('_');
const fakeProjectKey = ['sk', 'proj', 'x'.repeat(30)].join('-');

test('validates only selected job fields and bounded non-secret messages', () => {
  assert.equal(validateInput(context, message), true);
  assert.equal(validateInput({ ...context, resumeText: 'private resume' }, message), true);
  assert.equal(validateInput(context, ''), false);
  assert.equal(validateInput(context, 'x'.repeat(12001)), false);
  assert.equal(validateInput(context, fakeGroqKey), false);
  assert.equal(validateInput({ job: { ...context.job, role: 'r'.repeat(201) } }, message), false);
});

test('non-unknown statuses require exact supporting message quote; Unknown requires no quote', () => {
  assert.equal(validateResult(result, message), true);
  assert.equal(validateResult({ ...result, evidenceQuote: 'we are rejecting you' }, message), false);
  assert.equal(validateResult({ ...result, proposedStatus: 'Unknown', evidenceQuote: '' }, message), true);
  assert.equal(validateResult({ ...result, proposedStatus: 'Other' }, message), false);
  assert.equal(validateResult({ ...result, evidenceQuote: 'q'.repeat(601) }, message), false);
});

test('preview sends only selected role and user message through strict structured output', async () => {
  const calls = [];
  const updates = createUpdates({ async requestStructured(request) {
    calls.push(request);
    assert.equal(request.name, 'application_update');
    assert.equal(request.maxTokens, 1000);
    assert.equal(request.schema.additionalProperties, false);
    assert.deepEqual(Object.keys(request.input), ['job', 'message']);
    assert.match(request.system, /Silence is never evidence/);
    assert.match(request.system, /never send email/i);
    return request.validate(result) ? result : assert.fail('result validation');
  } });
  assert.deepEqual(await updates.preview(context, message), result);
  assert.equal(calls.length, 1);
  await assert.rejects(updates.preview(context, fakeProjectKey), { code: 'INVALID' });
  assert.equal(calls.length, 1);
});
