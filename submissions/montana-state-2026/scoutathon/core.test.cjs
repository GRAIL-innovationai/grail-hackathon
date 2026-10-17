const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./core.js');

test('removing a catalog listing resets it for saving again without losing practice', () => {
  const state = Core.seed(), job = state.jobs[0], practice = structuredClone(state.practice);
  job.status = 'Saved'; job.cover = 'Draft to remove';
  assert.equal(Core.removeJob(state, job.id), true);
  assert.equal(job.status, 'Available');
  assert.equal(job.cover, '');
  assert.equal(job.demoActivity, false);
  assert.equal(state.jobs.length, 6);
  assert.deepEqual(state.practice, practice);
  const store = memoryStorage();
  assert.equal(Core.save(store, state), true);
  const reloaded = Core.load(store);
  assert.equal(reloaded.jobs[0].status, 'Available');
  assert.equal(Core.transition(reloaded, job.id, 'Saved'), true);
});

test('removing a listing removes only that role and its materials, preserving practice and other records', () => {
  const state = Core.seed();
  state.jobs.find(job => job.status === 'Interview').url = 'https://example.com/custom-listing';
  const before = structuredClone(state), removed = state.jobs.find(job => job.status === 'Interview');
  assert.equal(Core.removeJob(state, 'unknown'), false);
  assert.deepEqual(state, before);
  assert.equal(Core.removeJob(state, removed.id), true);
  assert.deepEqual(state.jobs, before.jobs.filter(job => job.id !== removed.id));
  assert.deepEqual(state.practice, before.practice);
  assert.deepEqual(state.projects, before.projects);
  assert.deepEqual(state.tasks, before.tasks);
  assert.equal(Core.validateState(state), true);
  const store = memoryStorage();
  assert.equal(Core.save(store, state), true);
  assert.equal(Core.load(store).jobs.some(job => job.id === removed.id), false);
  assert.equal(Core.STATUSES.includes('remove-listing'), false);
});

test('dashboard next steps reject empty, oversized, and excess tasks without mutation', () => {
  const state = Core.seed(), original = structuredClone(state);
  for (const title of ['', '   ', 'x'.repeat(301), null]) assert.equal(Core.addTask(state, title), false);
  assert.deepEqual(state, original);
  state.tasks = Array.from({ length: 1000 }, (_, i) => ({ id: `limit-${i}`, title: 'Task', done: false }));
  assert.equal(Core.addTask(state, 'One more'), false);
  assert.equal(state.tasks.length, 1000);
});

test('optional personal background is bounded and survives persistence without changing legacy profiles', () => {
  const state = Core.seed();
  assert.equal(Core.validateState(state), true);
  state.profile.background = 'I enjoy accessible education tools and mentoring classmates.';
  const store = memoryStorage();
  assert.equal(Core.save(store, state), true);
  assert.equal(Core.load(store).profile.background, state.profile.background);
  state.profile.background = 'x'.repeat(6001);
  assert.equal(Core.validateState(state), false);
  state.profile.background = { text: 'wrong type' };
  assert.equal(Core.validateState(state), false);
});

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) { assert.equal(key, Core.STORAGE_KEY); return value; },
    setItem(key, next) { assert.equal(key, Core.STORAGE_KEY); value = next; },
    value() { return value; }
  };
}

test('seed returns independent, valid sample data', () => {
  const first = Core.seed();
  const second = Core.seed();
  assert.equal(Core.validateState(first), true);
  assert.equal(first.profile.name, 'Alex Morgan');
  assert.equal(first.profile.location, 'Bozeman, MT');
  assert.equal(first.jobs.length, 6);
  assert.deepEqual(first.jobs.map(job => job.status).sort(), ['Applied', 'Available', 'Available', 'Interview', 'Preparing', 'Saved'].sort());
  assert.equal(first.projects.length, 2);
  assert.equal(first.tasks.length, 3);
  assert.equal(first.practice.length, 3);
  assert.ok(first.practice.every(item => item.attempt?.demo === true));
  assert.notEqual(first.practice[0].attempt.solution, first.practice[1].attempt.solution);
  first.jobs[0].skills.push('Changed');
  assert.equal(second.jobs[0].skills.includes('Changed'), false);
});

test('curated references have sources and never claim portfolio ownership or real application activity', () => {
  const state = Core.seed();
  assert.ok(state.jobs.every(job => job.demo === false && job.demoActivity && job.checkedAt === '2026-10-17' && job.url === job.sourceUrl));
  assert.equal(new Set(state.jobs.map(job => job.url)).size, 6);
  assert.ok(state.projects.every(project => project.reference && project.url.startsWith('https://github.com/')));
  for (const item of state.practice) assert.match(Core.practiceUrl(item.title), /^https:\/\/leetcode.com\/problems\/[a-z-]+\/$/);
  assert.equal(Core.practiceUrl('<script>'), '');
  assert.equal(Core.practiceUrl('__proto__'), '');
});

test('reference refresh replaces only exact legacy fixtures and is idempotent', () => {
  const state = Core.seed();
  const legacy = { id: 'job-1', company: 'Northstar Labs', role: 'Frontend Engineering Intern', location: 'Remote', type: 'Internship', skills: ['JavaScript', 'React', 'Accessibility'], description: 'Build clear, accessible interfaces for research tools.', status: 'Available', resume: '', cover: '', outreach: '' };
  state.jobs[0] = structuredClone(legacy);
  state.profile.name = 'My own profile';
  state.practice[0].attempt.notes = 'My own notes';
  assert.equal(Core.refreshReferenceContent(state), true);
  assert.equal(state.jobs[0].company, 'Circleback');
  assert.equal(state.profile.name, 'My own profile');
  assert.equal(state.practice[0].attempt.notes, 'My own notes');
  assert.equal(Core.refreshReferenceContent(state), false);
  for (const change of [{ status: 'Saved' }, { resume: 'My materials' }, { description: 'My revised posting' }, { url: 'https://example.com' }]) {
    state.jobs[0] = { ...legacy, ...change };
    const before = structuredClone(state);
    assert.equal(Core.refreshReferenceContent(state), false);
    assert.deepEqual(state, before);
  }
});

test('storage round trips valid state and falls back for missing or corrupt data', () => {
  const state = Core.seed();
  const storage = memoryStorage();
  assert.equal(Core.load(storage).jobs.length, 6);
  assert.equal(Core.save(storage, state), true);
  assert.deepEqual(Core.load(storage), state);
  assert.equal(Core.load(memoryStorage('{broken')).profile.name, 'Alex Morgan');
  assert.equal(Core.load({ getItem() { throw new Error('blocked'); } }).jobs.length, 6);
  const invalid = { ...state, jobs: state.jobs.map((job, i) => i ? job : { ...job, status: 'Hired' }) };
  assert.equal(Core.load(memoryStorage(JSON.stringify(invalid))).profile.name, 'Alex Morgan');
});

test('save reports invalid state and storage quota failures', () => {
  const state = Core.seed();
  assert.equal(Core.save(memoryStorage(), { ...state, jobs: [{ ...state.jobs[0], status: 'Unknown' }] }), false);
  assert.equal(Core.save({ setItem() { throw new Error('quota'); } }, state), false);
});

test('validator rejects malformed shapes, oversized data, and duplicate ids', () => {
  const state = Core.seed();
  assert.equal(Core.validateState({ ...state, tasks: [{ ...state.tasks[0], id: state.tasks[1].id }, state.tasks[1], state.tasks[2]] }), false);
  assert.equal(Core.validateState({ ...state, tasks: [{ ...state.tasks[0], done: 'false' }, ...state.tasks.slice(1)] }), false);
  assert.equal(Core.validateState({ ...state, profile: { ...state.profile, skills: 'x'.repeat(2001) } }), false);
  assert.equal(Core.validateState(null), false);
});

test('escape encodes HTML metacharacters', () => {
  assert.equal(Core.escape(`<img src=x onerror="alert('x')"> &`), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp;');
});

test('transition changes only a known job to an allowed status', () => {
  const state = Core.seed();
  assert.equal(Core.transition(state, 'job-1', 'Saved'), true);
  assert.equal(state.jobs[0].status, 'Saved');
  assert.equal(Core.transition(state, 'missing', 'Applied'), false);
  assert.equal(Core.transition(state, 'job-1', 'Hired'), false);
});

test('Accepted is a valid terminal application status and survives save/load', () => {
  const state = Core.seed();
  const original = state.jobs.map(job => job.status);
  assert.equal(Core.STATUSES.indexOf('Accepted'), Core.STATUSES.indexOf('Offer') + 1);
  assert.equal(Core.transition(state, 'job-1', 'Accepted'), true);
  assert.equal(Core.validateState(state), true);
  const storage = memoryStorage();
  assert.equal(Core.save(storage, state), true);
  const restored = Core.load(storage);
  assert.equal(restored.jobs[0].status, 'Accepted');
  assert.deepEqual(restored.jobs.slice(1).map(job => job.status), original.slice(1));
});

test('match reports skill overlap and gaps without a probability score', () => {
  const result = Core.match({ skills: ['React', 'SQL', 'C++'] }, { skills: 'React, SQL' });
  assert.deepEqual(result, { matched: ['React', 'SQL'], missing: ['C++'], label: 'Strong alignment' });
  assert.deepEqual(Core.match({ skills: ['Go'] }, { skills: 'JavaScript' }), { matched: [], missing: ['Go'], label: 'Explore fit' });
});

test('safeRepoUrl accepts only a simple HTTPS GitHub repository URL', () => {
  assert.equal(Core.safeRepoUrl('https://github.com/example/demo'), 'https://github.com/example/demo');
  assert.equal(Core.safeRepoUrl('https://github.com/example/demo/'), 'https://github.com/example/demo/');
  for (const url of [
    'http://github.com/example/demo', 'https://github.com.evil.test/example/demo',
    'https://user:pass@github.com/example/demo', 'https://github.com/example/demo/tree/main',
    'https://github.com/example/demo?tab=readme', 'https://github.com/example/demo#readme'
  ]) assert.equal(Core.safeRepoUrl(url), null, url);
});

test('addPractice validates input and records an ISO dated entry', () => {
  const state = Core.seed();
  const before = state.practice.length;
  assert.equal(Core.addPractice(state, { title: 'Binary Search', topic: 'Search', difficulty: 'Medium' }), true);
  assert.equal(state.practice.length, before + 1);
  assert.equal(Number.isFinite(Date.parse(state.practice.at(-1).date)), true);
  assert.equal(Core.addPractice(state, { title: ' ', topic: 'Search', difficulty: 'Medium' }), false);
  assert.equal(Core.addPractice(state, { title: 'Valid Title', topic: 'Search', difficulty: 'Expert' }), false);
});

test('practice attempts are bounded, optional for old workspaces, and survive save/load', () => {
  const state = Core.seed();
  const legacy = structuredClone(state);
  delete legacy.practice[0].attempt;
  assert.equal(Core.validateState(legacy), true);
  const storage = memoryStorage();
  assert.equal(Core.save(storage, state), true);
  assert.deepEqual(Core.load(storage), state);
  const attempt = { language: 'JavaScript', solution: '', notes: 'Reviewed a hash map approach.', outcome: 'Self-reported: finished', demo: false };
  const profileBefore = structuredClone(state.profile);
  assert.equal(Core.addPractice(state, { title: 'Custom exercise', topic: 'Maps', difficulty: 'Medium', attempt }), true);
  const custom = state.practice.at(-1);
  assert.equal(custom.attempt.demo, false);
  assert.equal(Core.savePracticeAttempt(state, custom.id, { language: '', solution: '', notes: 'Notes only; no code.', outcome: '' }), true);
  assert.equal(custom.attempt.solution, '');
  assert.deepEqual(state.profile, profileBefore);
  assert.equal(Core.save(storage, state), true);
  assert.deepEqual(Core.load(storage), state);
  assert.equal(Core.addPractice(state, { title: 'Bad attempt', topic: 'Maps', difficulty: 'Easy', attempt: { ...attempt, solution: 'x'.repeat(12001) } }), false);
  assert.equal(Core.addPractice(state, { title: 'Direct fields', topic: 'Maps', difficulty: 'Easy', language: 'Python', solution: '', notes: 'Recorded without code' }), true);
  assert.equal(state.practice.at(-1).attempt.demo, false);
  assert.equal(Core.addPractice(state, { title: 'Fake sample', topic: 'Maps', difficulty: 'Easy', attempt: { ...attempt, demo: true } }), false);
  assert.equal(Core.savePracticeAttempt(state, custom.id, { language: '', solution: '', notes: '', outcome: '' }), false);
  const invalid = structuredClone(state);
  invalid.practice[0].attempt.notes = 'x'.repeat(2001);
  assert.equal(Core.validateState(invalid), false);
});

test('legacy workspace gets examples only on exact seed rows and preserves any saved attempt', () => {
  const state = Core.seed();
  delete state.practice[0].attempt;
  delete state.practice[1].attempt;
  state.practice.push({ id: 'custom', title: 'Two Sum', topic: 'Arrays', difficulty: 'Easy', date: '2026-10-17T00:00:00.000Z' });
  assert.equal(Core.attachSampleAttempts(state), true);
  assert.equal(state.practice[0].attempt.demo, true);
  assert.equal(state.practice[1].attempt.demo, true);
  assert.equal(Object.hasOwn(state.practice.at(-1), 'attempt'), false);
  const manual = { language: 'Go', solution: 'my code', notes: 'mine', outcome: '', demo: false };
  state.practice[0].attempt = manual;
  assert.equal(Core.attachSampleAttempts(state), false);
  assert.deepEqual(state.practice[0].attempt, manual);
  const renamed = structuredClone(state);
  delete renamed.practice[2].attempt;
  renamed.practice[2].title = 'My Merge Intervals';
  assert.equal(Core.attachSampleAttempts(renamed), false);
  assert.equal(Object.hasOwn(renamed.practice[2], 'attempt'), false);
});
