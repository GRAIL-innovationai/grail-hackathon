const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./core.js');

test('job problem bindings validate without changing legacy practice or profile', () => {
  const state = Core.seed(), profile = structuredClone(state.profile);
  assert.equal(Core.validateState(state), true);
  const item = state.practice[0];
  item.jobId = state.jobs[0].id; item.problemId = 'two-sum'; item.completed = false;
  assert.equal(Core.validateState(state), true);
  item.completed = true;
  assert.equal(Core.validateState(state), false, 'demo solution cannot establish personal completion');
  item.attempt = { language: 'Python', solution: '', notes: 'Explained the complement lookup and edge cases.', outcome: '', demo: false };
  assert.equal(Core.validateState(state), true);
  assert.deepEqual(state.profile, profile);
  item.jobId = 'x'.repeat(101);
  assert.equal(Core.validateState(state), false);
  item.jobId = state.jobs[0].id; delete item.problemId;
  assert.equal(Core.validateState(state), false);
});

test('clearing a completed solution and reflection clears completion without losing the record', () => {
  const state = Core.seed(), item = state.practice[0];
  item.jobId = state.jobs[0].id; item.problemId = 'leetcode-1'; item.completed = false;
  assert.equal(Core.savePracticeAttempt(state, item.id, { language: 'Python', solution: 'return result', notes: '', outcome: '' }), true);
  item.completed = true;
  assert.equal(Core.validateState(state), true);
  assert.equal(Core.savePracticeAttempt(state, item.id, { language: 'Python', solution: '', notes: '', outcome: '' }), true);
  assert.equal(item.completed, false);
  assert.equal(Core.validateState(state), true);
});
