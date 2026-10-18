'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoaches, buildContext, validateProjectResult, validateCodingResult, validateFiles, validateCodingInput } = require('./coaches.cjs');

const files = [{ path: 'src/app.js', content: 'function add(a, b) {\n  return a + b;\n}\n' }];
const projectResult = {
  summary: 'The file has a small add function.', jobRelevance: 'Basic JavaScript evidence for a frontend role.',
  findings: [{ path: 'src/app.js', lineStart: 1, lineEnd: 3, quote: 'return a + b;', issue: 'No input validation is shown.', suggestion: 'Consider documenting the expected input types.' }],
  tasks: [{ title: 'Add focused examples', reason: 'Examples clarify expected behavior.', doneWhen: 'Examples cover positive and negative inputs.' }]
};
const codingInput = { problem: 'Add two values.', solution: '1 function add(a, b) {\n2   return a + b;\n3 }', language: 'JavaScript', topic: 'Functions', difficulty: 'Easy', hintOnly: true };
const codingResult = {
  summary: 'The function returns the sum for ordinary numeric inputs.',
  correctness: { assessment: 'The shown implementation matches the simple addition task.', evidence: [{ lineStart: 1, lineEnd: 3, quote: 'return a + b;', explanation: 'The return expression adds both parameters.' }] },
  complexity: { time: 'O(1)', space: 'O(1)', reasoning: 'Assuming primitive numeric inputs and no coercion concerns.' },
  hints: ['Consider what types the problem allows.'], weaknesses: ['Input assumptions are unstated.'],
  nextPractice: [{ topic: 'Functions', exercise: 'Write a typed addition helper.', reason: 'Practice explicit input contracts.' }],
  jobRelevance: 'Clear small functions help with frontend work.', limitations: 'No tests were run; accepted input types are unspecified.'
};
const fakeGroqKey = ['gsk', 'x'.repeat(25)].join('_');
const fakeProjectKey = ['sk', 'proj', 'x'.repeat(30)].join('-');
const fakeGoogleKey = ['AIza', 'x'.repeat(35)].join('');

test('buildContext includes selected role and recent learning history while minimizing profile data', () => {
  const state = {
    profile: { name: 'Private Person', location: 'Secret Location', target: 'Frontend developer', skills: 'JS, CSS', resumeText: 'PRIVATE RESUME' },
    jobs: [{ id: 'j1', company: 'Example Co', role: 'UI Engineer', type: 'Intern', skills: ['JavaScript'], description: 'Build UI.' }],
    practice: Array.from({ length: 12 }, (_, i) => ({ title: `Problem ${i}`, topic: 'Arrays', difficulty: 'Easy', date: '2026-10-01', solution: 'private code' }))
  };
  const context = buildContext(state, 'j1', [{ weaknesses: ['Edge cases'], nextPractice: [{ topic: 'Arrays', exercise: 'Two Sum', reason: 'Practice maps.' }], code: 'must not pass' }]);
  assert.equal(context.job.role, 'UI Engineer');
  assert.equal(context.practice.length, 10);
  assert.equal(context.practice[0].title, 'Problem 2');
  assert.deepEqual(context.previousCodingReviews[0].weaknesses, ['Edge cases']);
  assert.equal(JSON.stringify(context).includes('Private Person'), false);
  assert.equal(JSON.stringify(context).includes('PRIVATE RESUME'), false);
  assert.equal(JSON.stringify(context).includes('Secret Location'), false);
  assert.equal(JSON.stringify(context).includes('private code'), false);
  assert.throws(() => buildContext(state, 'missing'), { code: 'NOT_FOUND' });
});

test('validates manually selected files and rejects unsafe paths, duplicate names, secrets, and size excess', () => {
  assert.equal(validateFiles(files), true);
  for (const bad of [
    [{ path: '../secret.js', content: 'x' }], [{ path: 'C:\\repo\\x.js', content: 'x' }],
    [{ path: '.env', content: 'x' }], [{ path: 'id_rsa', content: 'x' }], [{ path: 'node_modules/a.js', content: 'x' }],
    [{ path: 'x.js', content: fakeGroqKey }], [{ path: 'x.js', content: 'a'.repeat(8001) }],
    [{ path: 'x.js', content: 'a\0b' }], [{ path: 'x.js', content: '' }],
    [{ path: 'x.js', content: 'a' }, { path: 'X.JS', content: 'b' }],
    Array.from({ length: 3 }, (_, i) => ({ path: `${i}.txt`, content: 'x'.repeat(8000) }))
  ]) assert.equal(validateFiles(bad), false);
});

test('validates coding limits and rejects key-shaped solution literals', () => {
  assert.equal(validateCodingInput(codingInput), true);
  assert.equal(validateCodingInput({ ...codingInput, difficulty: 'Expert' }), false);
  assert.equal(validateCodingInput({ ...codingInput, problem: 'p'.repeat(6001) }), false);
  assert.equal(validateCodingInput({ ...codingInput, solution: fakeProjectKey }), false);
});

test('project citations must name a selected file and quote exact text within a short line range', () => {
  assert.equal(validateProjectResult(projectResult, files), true);
  assert.equal(validateProjectResult({ ...projectResult, findings: [{ ...projectResult.findings[0], quote: 'return a - b;' }] }, files), false);
  assert.equal(validateProjectResult({ ...projectResult, findings: [{ ...projectResult.findings[0], path: 'other.js' }] }, files), false);
  assert.equal(validateProjectResult({ ...projectResult, findings: [{ ...projectResult.findings[0], lineStart: 1, lineEnd: 1 }] }, files), false);
  assert.equal(validateProjectResult({ ...projectResult, findings: [{ ...projectResult.findings[0], lineStart: 1, lineEnd: 31 }] }, files), false);
});

test('coding review evidence must cite exact solution lines and nonempty solutions require evidence', () => {
  assert.equal(validateCodingResult(codingResult, codingInput.solution), true);
  assert.equal(validateCodingResult({ ...codingResult, correctness: { ...codingResult.correctness,
    evidence: [{ ...codingResult.correctness.evidence[0], quote: 'return a - b;' }] } }, codingInput.solution), false);
  assert.equal(validateCodingResult({ ...codingResult, correctness: { ...codingResult.correctness, evidence: [] } }, codingInput.solution), false);
});

test('coach calls use structured schemas, retain hint-only mode, and never execute supplied code', async () => {
  const calls = [];
  const coaches = createCoaches({ async requestStructured(request) {
    calls.push(request);
    assert.equal(request.maxTokens, 3000);
    if (request.name === 'project_review') return request.validate(projectResult) ? projectResult : assert.fail('project validation');
    assert.equal(request.input.hintOnly, true);
    assert.match(request.system, /do not provide replacement code/i);
    assert.equal(request.input.solution, codingInput.solution);
    return request.validate(codingResult) ? codingResult : assert.fail('coding validation');
  } });
  await coaches.project({ profile: {}, job: null, practice: [], previousCodingReviews: [] }, files);
  await coaches.coding({}, codingInput);
  assert.deepEqual(calls.map(call => call.name), ['project_review', 'coding_coach']);
  await assert.rejects(coaches.coding({}, { ...codingInput, solution: fakeGoogleKey }), { code: 'INVALID' });
});
