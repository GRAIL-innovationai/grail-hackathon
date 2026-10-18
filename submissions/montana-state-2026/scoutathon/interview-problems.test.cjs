'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./core.js');
const InterviewProblems = require('./interview-problems.js');

function stateFor({ company = 'Granite Analytics', role = 'Data Engineering Intern', skills = ['Python', 'SQL'],
  description = 'Build data pipelines and analytical queries with SQL and Python.', status = 'Interview' } = {}) {
  const state = Core.seed();
  state.jobs = [{ id: 'job-interview', company, role, location: 'Bozeman, MT', type: 'Internship', skills,
    description, status, resume: '', cover: '', outreach: '' }];
  return state;
}

test('catalog contains free LeetCode links across core patterns and SQL/data', () => {
  assert.equal(InterviewProblems.catalog.length, 12);
  assert.ok(InterviewProblems.catalog.some(problem => problem.topic.includes('SQL')));
  assert.ok(InterviewProblems.catalog.some(problem => problem.topic.includes('Graphs')));
  for (const problem of InterviewProblems.catalog) {
    assert.match(problem.url, /^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/$/);
    assert.ok(problem.focus.length <= 150);
  }
});

test('returns no recommendations unless the selected role is still in Interview', () => {
  const state = stateFor({ status: 'Preparing' });
  assert.deepEqual(InterviewProblems.recommendations(state, 'job-interview'), []);
  assert.deepEqual(InterviewProblems.recommendations(state, 'missing'), []);
  assert.deepEqual(InterviewProblems.recommendations(state, 'job-interview'), []);
});

test('ranks SQL practice for a data engineering interview and logged weaknesses for a general role', () => {
  const dataState = stateFor();
  const sql = InterviewProblems.recommendations(dataState, 'job-interview', ['SQL joins are rusty']);
  assert.equal(sql.length, 5);
  assert.ok(sql.slice(0, 3).every(item => item.problem.topic.startsWith('SQL')));
  assert.ok(sql[0].reason.includes('feedback'));
  assert.ok(sql.every(item => item.basis === 'role-practice' && item.report === null));

  const general = stateFor({ company: 'Unknown Company', role: 'Software Engineer Intern', skills: ['JavaScript'],
    description: 'Build web services with JavaScript.' });
  const graph = InterviewProblems.recommendations(general, 'job-interview', ['tree traversal']);
  assert.equal(graph[0].problem.id, 'leetcode-102');
  assert.equal(graph[0].basis, 'role-practice');
  assert.equal(graph[0].report, null);
});

test('labels only curated company and problem matches as candidate-reported with bounded evidence', () => {
  const google = InterviewProblems.recommendations(stateFor({ company: 'Google', role: 'Software Engineer', skills: [], description: '' }), 'job-interview');
  const reported = google.find(item => item.problem.id === 'leetcode-1');
  assert.equal(reported.basis, 'company-reported');
  assert.equal(reported.report.publishedAt, 'Unknown');
  assert.equal(reported.report.interviewDate, '2026-08');
  assert.ok(reported.report.quote.split(/\s+/).length <= 25);
  assert.match(reported.report.caveat, /Candidate self-report.*not verified by the employer/);
  const amazon = InterviewProblems.recommendations(stateFor({ company: 'Amazon', role: 'Software Engineer', skills: [], description: '' }), 'job-interview');
  assert.equal(amazon.find(item => item.problem.id === 'leetcode-49').basis, 'company-reported');
  assert.equal(amazon.find(item => item.problem.id === 'leetcode-1').basis, 'role-practice');
  const unknown = InterviewProblems.recommendations(stateFor({ company: 'Amazonian Labs' }), 'job-interview');
  assert.ok(unknown.every(item => item.basis === 'role-practice' && item.report === null));
});

test('startAttempt creates one job-bound practice without sample solutions and resumes repeats', () => {
  const state = stateFor({ company: 'Unknown Company', role: 'Software Engineer Intern', skills: ['JavaScript'], description: 'Build web services.' });
  const oldPractice = structuredClone(state.practice);
  const oldProfile = structuredClone(state.profile);
  const result = InterviewProblems.startAttempt(state, 'job-interview', 'leetcode-1');
  assert.ok(result.id);
  assert.equal(result.created, true);
  const item = state.practice.find(practice => practice.id === result.id);
  assert.deepEqual({ jobId: item.jobId, problemId: item.problemId, completed: item.completed },
    { jobId: 'job-interview', problemId: 'leetcode-1', completed: false });
  assert.equal(Object.hasOwn(item, 'attempt'), false);
  assert.deepEqual(state.practice.slice(0, oldPractice.length), oldPractice);
  assert.deepEqual(state.profile, oldProfile);
  assert.deepEqual(InterviewProblems.startAttempt(state, 'job-interview', 'leetcode-1'), { id: result.id, created: false });
  assert.equal(state.practice.length, oldPractice.length + 1);
  assert.deepEqual(InterviewProblems.startAttempt(state, 'job-interview', 'unknown'), { id: null, created: false });
});

test('completion requires a non-demo solution or reflection and completed problems drop below unfinished work', () => {
  const state = stateFor({ company: 'Unknown Company', role: 'Software Engineer Intern', skills: ['arrays'], description: 'Use arrays and hash maps.' });
  const started = InterviewProblems.startAttempt(state, 'job-interview', 'leetcode-1');
  assert.equal(InterviewProblems.setCompleted(state, started.id, true), false);
  const practice = state.practice.find(item => item.id === started.id);
  assert.equal(Core.savePracticeAttempt(state, started.id, { language: 'JavaScript', solution: '', notes: 'I tested empty input and duplicate values.', outcome: '' }), true);
  assert.equal(InterviewProblems.setCompleted(state, started.id, true), true);
  assert.equal(practice.completed, true);
  const progress = InterviewProblems.recommendations(state, 'job-interview');
  const completed = progress.find(item => item.practiceId === started.id);
  assert.ok(completed);
  assert.equal(completed.completed, true);
  assert.equal(progress.at(-1).practiceId, started.id);
  assert.equal(progress.filter(item => item.completed).length, 1);
  assert.equal(InterviewProblems.setCompleted(state, started.id, false), true);
  assert.equal(practice.completed, false);

  const demo = Core.seed();
  demo.jobs[0].status = 'Interview';
  demo.practice[0].jobId = demo.jobs[0].id;
  demo.practice[0].problemId = 'leetcode-1';
  demo.practice[0].completed = true;
  assert.equal(InterviewProblems.recommendations(demo, demo.jobs[0].id).find(item => item.practiceId === 'practice-1').completed, false);
});
