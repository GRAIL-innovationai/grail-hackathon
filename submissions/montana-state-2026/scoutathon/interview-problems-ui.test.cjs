const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ jobs = [], practice = [], recs = [] } = {}) {
  let state = { jobs, practice };
  let latestRecs = recs;
  const calls = [];
  const listeners = new Map();
  const attrs = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const mount = {
    html: '',
    set innerHTML(value) { this.html = value; listeners.clear(); attrs.clear(); },
    get innerHTML() { return this.html; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      const attr = selector === '[data-attempt]' ? 'attempt' : selector === '[data-review]' ? 'review' : selector === '[data-complete]' ? 'complete' : '';
      if (!attr) return [];
      const re = new RegExp(`data-${attr}="([^"]+)"`, 'g');
      return [...this.html.matchAll(re)].map(match => {
        const el = { dataset: { [attr === 'complete' ? 'complete' : attr === 'attempt' ? 'attempt' : 'review']: match[1] }, checked: false,
          addEventListener(type, fn) { listeners.set(`${attr}:${match[1]}:${type}`, fn); } };
        attrs.set(`${attr}:${match[1]}`, el); return el;
      });
    }
  };
  const root = {
    Core: { escape: esc }, document: { querySelector: selector => selector === '#interview-problems' ? mount : null },
    InterviewProblems: {
      catalog: [],
      recommendations: (current, jobId, weaknesses) => { calls.push(['recommendations', jobId, weaknesses]); return latestRecs; },
      startAttempt(current, jobId, problemId) { const id = `attempt-${current.practice.length + 1}`; current.practice.push({ id, jobId, problemId, title: 'Two Sum', topic: 'Arrays', difficulty: 'Easy', date: '2026-10-17T00:00:00.000Z', attempt: { language: '', solution: '', notes: '', outcome: '', demo: false } }); calls.push(['create', jobId, problemId]); return { id, created: true }; },
      setCompleted(current, practiceId, completed = true) { const row = current.practice.find(item => item.id === practiceId); if (!row?.attempt || row.attempt.demo || !(row.attempt.solution.trim() || row.attempt.notes.trim())) return false; row.completed = completed; calls.push(['complete', practiceId, completed]); return true; }
    },
    URL, structuredClone, setTimeout
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./interview-problems-ui.js'), 'utf8'), root, { filename: 'interview-problems-ui.js' });
  const ui = root.InterviewProblemsUI;
  ui.configure({ getState: () => state, commitState: async next => { calls.push(['commit']); state = next; return true; },
    onOpenAttempt: id => calls.push(['open', id]), onReviewAttempt: (...args) => calls.push(['review', ...args]),
    getFeedback: () => ['complexity reasoning'] });
  return { ui, mount, calls, listeners, attrs, getState: () => state, setRecommendations: value => { latestRecs = value; } };
}

const role = (overrides = {}) => ({ id: 'job-1', company: 'Example Co', role: 'Software Engineer', location: 'Remote', status: 'Interview', url: 'https://jobs.example/role', ...overrides });
const recommendation = (overrides = {}) => ({ problem: { id: 'leetcode-1', title: 'Two Sum', topic: 'Arrays', difficulty: 'Easy', focus: 'Hash maps', url: 'https://leetcode.com/problems/two-sum/' }, reason: 'Practice complement lookup.', basis: 'role-practice', report: null, practiceId: null, completed: false, ...overrides });

test('empty state offers Applications and excludes roles not at Interview', () => {
  const app = setup({ jobs: [role({ status: 'Applied' })] });
  app.ui.mount();
  assert.match(app.mount.innerHTML, /Open Applications/);
  assert.doesNotMatch(app.mount.innerHTML, /Example Co/);
});

test('renders escaped role practice and only matching, dated company reports with safe links', () => {
  const recs = [recommendation({ problem: { ...recommendation().problem, title: '<img src=x>', url: 'javascript:alert(1)' } }), recommendation({
    problem: { id: 'leetcode-2', title: 'Valid Parentheses', topic: 'Stacks', difficulty: 'Easy', url: 'https://leetcode.com/problems/valid-parentheses/' },
    basis: 'company-reported', report: { company: 'Other Co', url: 'https://example.com/wrong', interviewDate: '2026-09-01', checkedAt: '2026-10-17', quote: 'No matching employer.' }
  }), recommendation({
    problem: { id: 'leetcode-3', title: 'Merge Intervals', topic: 'Sorting', difficulty: 'Medium', url: 'https://leetcode.com/problems/merge-intervals/' },
    basis: 'company-reported', report: { company: '<b>Example</b> Co', url: 'https://example.com/interview-guide', interviewDate: '2026-09', checkedAt: '2026-10-17', quote: '<script>reported</script>' }
  })];
  const app = setup({ jobs: [role({ company: '<b>Example</b> Co' })], recs });
  app.ui.mount();
  assert.match(app.mount.innerHTML, /Recommended next problems/);
  assert.match(app.mount.innerHTML, /role aligned practice/i);
  assert.match(app.mount.innerHTML, /https:\/\/leetcode\.com\/problems\/valid-parentheses\//);
  assert.doesNotMatch(app.mount.innerHTML, /javascript:alert/);
  assert.match(app.mount.innerHTML, /&lt;img src=x&gt;/);
  assert.match(app.mount.innerHTML, /&lt;b&gt;Example&lt;\/b&gt; Co/);
  assert.match(app.mount.innerHTML, /interview 2026-09 · checked 2026-10-17/);
  assert.match(app.mount.innerHTML, /&lt;script&gt;reported&lt;\/script&gt;/);
  assert.doesNotMatch(app.mount.innerHTML, /No matching employer/);
  assert.match(app.mount.innerHTML, /This is not an employer-confirmed question or a hiring prediction/);
});

test('start and continue save before opening PracticeUI, then manual attempt can be completed', async () => {
  const app = setup({ jobs: [role()], recs: [recommendation()] });
  app.ui.mount();
  await app.listeners.get('attempt:leetcode-1:click')();
  assert.deepEqual(app.calls.filter(call => ['commit', 'open'].includes(call[0])).map(call => call[0]), ['commit', 'open']);
  assert.equal(app.calls.find(call => call[0] === 'recommendations')[2][0], 'complexity reasoning');
  app.setRecommendations([recommendation({ practiceId: 'attempt-1' })]);
  app.ui.mount();
  await app.listeners.get('attempt:leetcode-1:click')();
  const lastCommit = app.calls.map(call => call[0]).lastIndexOf('commit');
  assert.deepEqual(app.calls.slice(lastCommit).filter(call => ['commit', 'open'].includes(call[0])), [['commit'], ['open', 'attempt-1']]);

  const state = app.getState();
  app.setRecommendations([recommendation({ practiceId: 'attempt-1' })]);
  app.ui.mount();
  assert.match(app.mount.innerHTML, /disabled><span>Mark completed/);
  // A saved non-empty reflection enables the explicit completion checkbox.
  state.practice[0].attempt.notes = 'I tried the hash map approach and checked edge cases.';
  app.ui.mount();
  assert.doesNotMatch(app.mount.innerHTML, /data-complete="leetcode-1"[^>]*disabled/);
  const checkbox = app.attrs.get('complete:leetcode-1'); checkbox.checked = true;
  await app.listeners.get('complete:leetcode-1:change')();
  assert.equal(app.getState().practice[0].completed, true);
  assert.ok(app.calls.some(call => call[0] === 'complete' && call[2] === true));
});

test('code review callback requires a saved manual solution and keeps role/problem identifiers', async () => {
  const practice = [{ id: 'attempt-1', jobId: 'job-1', problemId: 'leetcode-1', title: 'Two Sum', topic: 'Arrays', difficulty: 'Easy', date: '2026-10-17T00:00:00.000Z', attempt: { language: 'JavaScript', solution: 'return []', notes: '', outcome: '', demo: false } }];
  const app = setup({ jobs: [role()], practice, recs: [recommendation({ practiceId: 'attempt-1' })] });
  app.ui.mount();
  await app.listeners.get('review:leetcode-1:click')();
  assert.deepEqual(app.calls.at(-1), ['review', 'job-1', 'leetcode-1', 'attempt-1']);
});
