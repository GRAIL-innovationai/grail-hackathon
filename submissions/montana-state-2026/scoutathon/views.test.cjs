const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./core.js');

const source = fs.readFileSync(require.resolve('./views.js'), 'utf8');
const window = { Core };
vm.runInNewContext(source, { window });
const Views = window.Views;

test('homepage offers Save job after removing a catalog listing from Applications', () => {
  const state = Core.seed();
  state.jobs.forEach(job => { job.status = 'Saved'; });
  assert.match(Views.dashboard(state), /disabled>✓ Saved<\/button>/);
  const removed = state.jobs[1];
  Core.removeJob(state, removed.id);
  const html = Views.dashboard(state);
  assert.match(html, new RegExp(`data-action="save-job" data-id="${removed.id}">Save job<`));
  assert.doesNotMatch(html, /disabled>✓ Saved<\/button>/);
  assert.doesNotMatch(Views.applications(state), new RegExp(`data-status-id="${removed.id}"`));
});

test('each application stage menu offers a separate removal action', () => {
  const state = Core.seed();
  const html = Views.applicationCards(state);
  assert.equal((html.match(/value="remove-listing">Remove listing…/g) || []).length, state.jobs.filter(job => job.status !== 'Available').length);
  assert.doesNotMatch(html, /value="remove-listing" selected/);
});

test('Development leads with projects and keeps coding history collapsed', () => {
  const html = Views.development(Core.seed());
  assert.ok(html.indexOf('Add project') < html.indexOf('Coding practice ·'));
  assert.match(html, /<details class="card practice-history"><summary>Coding practice ·/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(html, /data-action="project-coach"/);
  assert.match(html, /describe your contribution/);
});

test('dashboard offers quick task entry and renders all pending steps safely', () => {
  const state = Core.seed();
  state.tasks.forEach(task => { task.done = false; });
  Core.addTask(state, '<img src=x onerror=alert(1)>');
  Core.addTask(state, 'Review interview notes');
  state.tasks.find(task => task.id === 'task-1').done = true;
  const html = Views.dashboard(state);
  assert.match(html, /id="add-task-form"/);
  assert.match(html, /for="task-title">New next step/);
  assert.match(html, /name="title"[^>]*maxlength="300" required/);
  assert.match(html, /type="submit">Add/);
  for (const task of state.tasks.filter(task => !task.done)) assert.ok(html.includes(Core.escape(task.title)));
  assert.doesNotMatch(html, /<img src=x/);
  assert.equal((html.match(/data-action="toggle-task"/g) || []).length, 4);
  state.tasks.forEach(task => { task.done = true; });
  assert.match(Views.dashboard(state), /id="add-task-form"/);
});

test('Profile offers editable and importable background notes with safely rendered saved context', () => {
  const state = Core.seed(); state.profile.background = '<script>private notes</script>';
  const html = Views.profile(state);
  assert.match(html, /About you/);
  assert.match(html, /name="background" maxlength="6000"/);
  assert.match(html, /id="profile-background-file"/);
  assert.match(html, /&lt;script&gt;private notes&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>private notes/);
});

test('Discover puts one-click save in each card header and marks saved roles', () => {
  const html = Views.discover(Core.seed());
  const cards = html.match(/<article class="card job-card"[\s\S]*?<\/article>/g);
  assert.equal(cards.length, 3);
  assert.ok(cards.every(card => card.indexOf('data-action="save-job"') < card.indexOf('job-description')));
  assert.equal((html.match(/data-action="save-job"/g) || []).length, 3);
  assert.match(cards[0], />Save job<\/button>/);
  assert.match(cards[2], /disabled>✓ Saved<\/button>/);
});

test('source links and demo activity labels appear alongside local practice records', () => {
  const state = Core.seed();
  assert.match(Views.discover(state), /View employer posting/);
  assert.match(Views.applications(state), /application stage is fictional demo activity/);
  assert.match(Views.development(state), /https:\/\/leetcode.com\/problems\/two-sum\//);
  assert.match(Views.development(state), /External learning reference/);
  state.jobs[0].url = 'javascript:alert(1)';
  assert.doesNotMatch(Views.discover(state), /href="javascript:/);
});

test('every page renders from the seeded state', () => {
  const state = Core.seed();
  const expected = {
    dashboard: 'Welcome back, Alex Morgan.',
    discover: 'Circleback',
    applications: 'Pylon',
    prep: 'Prepare for a role',
    development: 'freeCodeCamp',
    profile: 'Alex Morgan'
  };
  for (const [page, content] of Object.entries(expected)) {
    assert.equal(typeof Views[page], 'function', `${page} view exists`);
    assert.ok(Views[page](state).includes(content), `${page} renders ${content}`);
  }
});

test('hostile profile, job, skill, and project text is escaped in rendered views', () => {
  const state = Core.seed();
  state.profile.name = '<img src=x onerror="boom">';
  state.jobs[0].company = '<script>boom()</script>';
  state.jobs[0].role = '" onmouseover="boom';
  state.jobs[0].description = '<svg onload=boom>';
  state.jobs[0].skills = ['<b>HTML</b>', 'React'];
  state.projects[0].name = '<iframe src=x>';
  const dashboard = Views.dashboard(state);
  const discover = Views.discover(state);
  const development = Views.development(state);
  for (const html of [dashboard, discover, Views.profile(state), development]) {
    assert.doesNotMatch(html, /<script>boom\(\)<\/script>|<img src=x|<svg onload=boom>|<iframe src=x|<b>HTML<\/b>/i);
    assert.match(html, /&lt;script&gt;|&lt;img|&lt;svg|&lt;iframe|&lt;b&gt;HTML/);
  }
});

test('empty collections show useful empty states', () => {
  const state = Core.seed();
  state.jobs = [];
  state.projects = [];
  state.practice = [];
  state.tasks = [];
  assert.match(Views.dashboard(state), /No sample roles yet/);
  assert.match(Views.discover(state), /No roles to show/);
  assert.match(Views.applications(state), /Your tracker is ready/);
  assert.match(Views.prep(state), /No saved roles yet/);
  assert.match(Views.prep(state), /Coding practice you log will appear here/);
  assert.match(Views.development(state), /Your portfolio starts here/);
  assert.match(Views.development(state), /0 sessions recorded/);
  assert.match(Views.dashboard(state), /You’re all caught up/);
});

test('job cards show derived skill alignment labels', () => {
  const state = Core.seed();
  state.profile.skills = state.jobs[0].skills.join(', ');
  const discover = Views.discover(state);
  assert.match(discover, /Strong alignment/);
  assert.match(discover, /Some alignment/);
  state.profile.skills = '';
  assert.match(Views.discover(state), /Explore fit/);
});

test('Accepted is a distinct terminal stage after Offer received', () => {
  const state = Core.seed();
  state.jobs[5].status = 'Accepted';
  const applications = Views.applications(state);
  assert.match(applications, /value="Offer"[^>]*>Offer received/);
  assert.match(applications, /value="Accepted"[^>]*>Offer accepted/);
  assert.match(applications, /status-accepted">Offer accepted/);
  const dashboard = Views.dashboard(state);
  assert.match(dashboard, /<span class="metric-value">2<\/span><span class="metric-label">Active applications/);
});

test('Applications searches company names with trimmed case-insensitive text', () => {
  const state = Core.seed();
  const template = state.jobs[0];
  state.jobs = [
    { ...template, id: 'search-a', company: 'Northwind Labs', role: 'Engineer', status: 'Applied' },
    { ...template, id: 'search-b', company: 'Other Company', role: 'Northwind Engineer', status: 'Saved' },
    { ...template, id: 'search-c', company: 'Northwind Careers', status: 'Available' }
  ];
  const html = Views.applicationCards(state, { query: '  NORTHwind  ', sort: 'company' });
  assert.match(html, /Northwind Labs/);
  assert.doesNotMatch(html, /Other Company|Northwind Careers/);
  assert.match(Views.applicationCards(state, { query: 'missing' }), /No companies match your search/);
  assert.match(Views.applicationCards({ ...state, jobs: [] }), /Your tracker is ready/);
});

test('Applications sorts by workflow stage or company without modifying stored jobs', () => {
  const state = Core.seed();
  const template = state.jobs[0];
  state.jobs = [
    { ...template, id: 'sort-z', company: 'Zebra', status: 'Saved' },
    { ...template, id: 'sort-b', company: 'Beta', status: 'Interview' },
    { ...template, id: 'sort-a', company: 'Alpha', status: 'Saved' },
    { ...template, id: 'sort-c', company: 'Aardvark', status: 'Accepted' },
    { ...template, id: 'sort-hidden', company: 'Available Company', status: 'Available' }
  ];
  const before = JSON.stringify(state.jobs);
  const companies = html => [...html.matchAll(/data-status-id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(companies(Views.applicationCards(state, { sort: 'status' })), ['sort-a', 'sort-z', 'sort-b', 'sort-c']);
  assert.deepEqual(companies(Views.applicationCards(state, { sort: 'company' })), ['sort-c', 'sort-a', 'sort-b', 'sort-z']);
  assert.deepEqual(companies(Views.applicationCards(state, { query: 'a', sort: 'status' })), ['sort-a', 'sort-z', 'sort-b', 'sort-c']);
  assert.equal(JSON.stringify(state.jobs), before);
});

test('Applications renders its current search and sort controls safely', () => {
  const html = Views.applications(Core.seed(), { query: '\"><img src=x>', sort: 'status' });
  assert.match(html, /id="applications-search"/);
  assert.match(html, /id="applications-sort"/);
  assert.match(html, /id="applications-results"/);
  assert.match(html, /value="status"[^>]*selected/);
  assert.match(html, /&quot;&gt;&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
});
