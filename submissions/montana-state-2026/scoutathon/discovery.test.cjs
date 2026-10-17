'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDiscovery, buildDiscoveryContext, buildRankingContext, searchCandidates } = require('./discovery.cjs');
const { createDiscoverySources, mapJob, plain } = require('./discovery-sources.cjs');

const profile = { name: 'Private Person', email: 'private@example.com', resumeName: 'secret.pdf', target: 'Software engineering internship',
  location: 'Bozeman, MT', skills: 'JavaScript, React', resumeText: 'Built a React dashboard and used JavaScript for a class project.' };
const project = { name: 'Events Board', notes: 'A React app for browsing campus events.' };
const plan = { queries: ['software engineering internship', 'React'], boards: ['stripe', 'figma'], location: 'Bozeman, MT', level: 'internship', rationale: 'Prioritize software internships matching the student skills and location.' };
const job = { id: 'greenhouse-figma-1', company: 'Figma', role: 'Software Engineering Intern', location: 'Remote, United States', type: 'Internship',
  skills: [], description: 'Build React interfaces with JavaScript and collaborate with product engineers.', metadata: 'Engineering',
  status: 'Available', resume: '', cover: '', outreach: '', url: 'https://boards.greenhouse.io/figma/jobs/1', source: 'Greenhouse · Figma', demo: false };
const ranking = { summary: 'One listing fits the selected profile evidence.', recommendations: [{ id: job.id,
  whyFit: ['The profile lists React and JavaScript.'], gaps: ['The listing provides no detail about internship duration.'],
  evidence: [{ quote: 'Build React interfaces with JavaScript', source: 'description' }, { quote: 'React', source: 'description' }],
  nextStep: 'Open the listing to check its current status and eligibility.' }] };
const noMatch = { summary: 'No retrieved listing matched the requested location and role level.', recommendations: [] };

test('discovery includes bounded personal background in planning and ranking context', () => {
  const context = buildDiscoveryContext({ ...profile, background: 'b'.repeat(6000) });
  assert.equal(context.background.length, 3000);
  assert.equal(buildRankingContext(context).background.length, 2000);
});

function llmMock(responses, inspect) {
  const calls = [];
  return { calls, llm: { requestStructured: async request => {
    calls.push(request);
    if (inspect) inspect(request, calls.length);
    const value = responses.shift();
    if (value instanceof Error) throw value;
    if (!request.validate(value)) throw Object.assign(new Error('The provider returned an invalid response.'), { code: 'UPSTREAM' });
    return value;
  } } };
}

test('Google mode plans public queries without resume text and ranks snippets without pretending location is verified', async () => {
  const snippet = { ...job, location: 'Verify location on source', type: 'Unverified', searchSnippet: true, source: 'Google Search via Serper' };
  const mock = llmMock([plan, ranking]);
  const discovery = createDiscovery({ llm: mock.llm, opportunities: { mode: 'google', async search() {
    return { jobs: [snippet], source: 'Google Search via Serper', cachedAt: 1, limitations: [] };
  } } });
  const result = await discovery.run(profile, 'Internships near Montana');
  assert.equal(Object.hasOwn(mock.calls[0].input.context, 'resumeExcerpt'), false);
  assert.match(mock.calls[0].system, /Google web search is enabled/);
  assert.equal(result.recommendations[0].job.searchSnippet, true);
  assert.equal(result.recommendations[0].job.location, 'Verify location on source');
  assert.ok(result.limitations.some(item => item.includes('not independently verified')));
});

test('builds privacy-bounded context without contact or resume filename', () => {
  const context = buildDiscoveryContext(profile, [project]);
  assert.deepEqual(context, { target: profile.target, skills: profile.skills, location: profile.location,
    resumeExcerpt: profile.resumeText, projects: [{ name: project.name, description: project.notes }] });
  assert.equal(JSON.stringify(context).includes('private@example.com'), false);
  assert.equal(JSON.stringify(context).includes('Private Person'), false);
  assert.equal(JSON.stringify(context).includes('secret.pdf'), false);
  assert.equal(buildDiscoveryContext({ resumeText: 'r'.repeat(9000) }).resumeExcerpt.length, 2500);
  assert.equal(buildRankingContext({ ...context, resumeExcerpt: 'r'.repeat(2500), projects: Array.from({ length: 5 }, (_, i) => ({ name: String(i), description: 'p'.repeat(250) })) }).resumeExcerpt.length, 1000);
  assert.equal(buildRankingContext({ ...context, projects: Array.from({ length: 5 }, (_, i) => ({ name: String(i), description: 'p'.repeat(250) })) }).projects.length, 3);
  assert.deepEqual(buildDiscoveryContext(profile, require('./core.js').seed().projects).projects, []);
});

test('excludes known fictional seed projects but keeps edited and real project notes', () => {
  const seedProjects = [
    { id: 'project-1', name: 'Campus Events Board', url: 'https://github.com/example/campus-events', notes: 'fictional seed' },
    { id: 'project-2', name: 'Study Buddy API', url: 'https://example.com/study-buddy', notes: 'fictional seed' }
  ];
  const result = buildDiscoveryContext(profile, [...seedProjects,
    { ...seedProjects[0], name: 'My real Events Board', notes: 'My actual project notes.' },
    { id: 'real-1', name: 'Personal project', url: 'https://github.com/student/project', notes: 'Built and deployed this app.' },
    { id: 'demo-1', name: 'Another demo', notes: 'demo only', demo: true }]);
  assert.deepEqual(result.projects, [
    { name: 'My real Events Board', description: 'My actual project notes.' },
    { name: 'Personal project', description: 'Built and deployed this app.' }
  ]);
});

test('plan changes board retrieval and queries, then recommendation preserves source job fields', async () => {
  const { llm, calls } = llmMock([plan, ranking], (request, n) => {
    if (n === 1) assert.deepEqual(request.input.context.projects, [{ name: project.name, description: project.notes }]);
  });
  let searchArgs, reservations = 0;
  const discovery = createDiscovery({ llm, opportunities: { search: async args => { searchArgs = args; return { jobs: [job], source: 'Mock public source', sourceNotice: 'Public listing.' }; } } });
  const report = await discovery.run(profile, 'Find an internship using React in Bozeman.', { projects: [project], reserveCall: async () => { reservations++; } });
  assert.deepEqual(searchArgs, { queries: plan.queries, location: plan.location, level: plan.level, boards: plan.boards });
  assert.equal(reservations, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.maxTokens), [900, 1800]);
  assert.equal(report.recommendations[0].job.id, job.id);
  assert.equal(report.recommendations[0].job.url, job.url);
  assert.equal(report.recommendations[0].job.description, job.description);
  assert.equal(report.recommendations[0].job.demo, false);
  assert.equal(report.source, 'Mock public source');
  assert.match(report.limitations.join(' '), /not proof/);
});

test('returns honest no-match report after one reserved model call', async () => {
  const { llm, calls } = llmMock([plan]);
  const discovery = createDiscovery({ llm, opportunities: { search: async () => ({ jobs: [], source: 'Mock public source' }) } });
  let reservations = 0;
  const report = await discovery.run(profile, 'Find a local internship.', { reserveCall: async () => { reservations++; } });
  assert.equal(calls.length, 1);
  assert.equal(reservations, 1);
  assert.deepEqual(report.recommendations, []);
  assert.match(report.summary, /No retrieved listings/);
});

test('rejects fabricated IDs, invalid exact quotes, and invalid plans before using source', async () => {
  const { llm } = llmMock([plan, { ...ranking, recommendations: [{ ...ranking.recommendations[0], id: 'invented' }] }]);
  const discovery = createDiscovery({ llm, opportunities: { search: async () => ({ jobs: [job] }) } });
  await assert.rejects(discovery.run(profile, 'Find roles.'), { code: 'UPSTREAM' });
  const quoteLlm = llmMock([plan, { ...ranking, recommendations: [{ ...ranking.recommendations[0], evidence: [{ quote: 'Invented quote', source: 'description' }] }] }]).llm;
  await assert.rejects(createDiscovery({ llm: quoteLlm, opportunities: { search: async () => ({ jobs: [job] }) } }).run(profile, 'Find roles.'), { code: 'UPSTREAM' });
  let searched = false;
  const badPlan = { ...plan, boards: ['not-allowlisted'] };
  const bad = llmMock([badPlan]).llm;
  await assert.rejects(createDiscovery({ llm: bad, opportunities: { search: async () => { searched = true; return { jobs: [] }; } } }).run(profile, 'Find roles.'), { code: 'UPSTREAM' });
  assert.equal(searched, false);
});

test('propagates planning, source, rank, and quota failures without exposing untrusted details', async () => {
  const message = 'private upstream response body';
  await assert.rejects(createDiscovery({ llm: { requestStructured: async () => { throw new Error(message); } }, opportunities: { search: async () => ({ jobs: [] }) } }).run(profile, 'Find roles.'), /private upstream response body/);
  const sourceFail = createDiscovery({ llm: llmMock([plan]).llm, opportunities: { search: async () => { throw Object.assign(new Error('Safe message'), { code: 'UPSTREAM' }); } } });
  await assert.rejects(sourceFail.run(profile, 'Find roles.'), { code: 'UPSTREAM', message: 'Safe message' });
  const rankFail = llmMock([plan, new Error('Sanitized model failure')]).llm;
  await assert.rejects(createDiscovery({ llm: rankFail, opportunities: { search: async () => ({ jobs: [job] }) } }).run(profile, 'Find roles.'), /Sanitized model failure/);
  let calls = 0;
  await assert.rejects(createDiscovery({ llm: llmMock([plan]).llm, opportunities: { search: async () => ({ jobs: [] }) } }).run(profile, 'Find roles.', { reserveCall: async () => { calls++; return false; } }), { code: 'QUOTA' });
  assert.equal(calls, 1);
});

test('retriever uses only allowlisted public GET URLs, maps source descriptions, and caches boards', async () => {
  let fetches = 0, current = Date.UTC(2026, 9, 17, 12);
  const source = createDiscoverySources({ now: () => current, fetchImpl: async (url, init) => {
    fetches++;
    assert.match(url, /^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/(stripe|figma)\/jobs\?content=true$/);
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    const board = new URL(url).pathname.split('/')[3];
    const company = board === 'figma' ? 'figma' : 'stripe';
    return new Response(JSON.stringify({ jobs: [{ id: 1, title: 'Software Engineering Intern', absolute_url: `https://boards.greenhouse.io/${company}/jobs/1`,
      location: { name: 'Remote, United States' }, content: '&amp;lt;p&amp;gt;Build React interfaces &amp;amp; test &#x74;ag&amp;lt;/p&amp;gt;', departments: [{ name: 'Engineering' }] }] }), { headers: { 'content-type': 'application/json' } });
  } });
  const args = { queries: ['React internship'], boards: ['stripe', 'figma'], location: '', level: '' };
  const first = await source.search(args);
  current += 60 * 60 * 1000;
  const second = await source.search(args);
  assert.equal(first.jobs.length, 2); assert.equal(first.jobs[0].description, 'Build React interfaces & test tag');
  assert.equal(first.jobs[0].skills.length, 0); assert.equal(first.jobs[0].demo, false);
  assert.equal(fetches, 2); assert.equal(second.jobs.length, 2);
  assert.equal(second.cachedAt, Date.UTC(2026, 9, 17, 12));
  assert.equal(second.sources[0].retrievedAt, new Date(Date.UTC(2026, 9, 17, 12)).toISOString());
  assert.match(second.sourceNotice, /Stripe.*2026-10-17T12:00:00.000Z/);
});

test('accepts verified Stripe employer URLs and finds relevant listings past unrelated first thirty jobs', async () => {
  const greenhouse = id => ({ id, title: `Sales Associate ${id}`, absolute_url: `https://boards.greenhouse.io/stripe/jobs/${id}`,
    location: { name: 'New York, NY' }, content: 'Sell financial products to customers.' });
  const jobs = Array.from({ length: 35 }, (_, i) => greenhouse(i + 100));
  jobs[34] = { id: 8172510, title: 'Software Engineering Intern', absolute_url: 'https://stripe.com/jobs/search?gh_jid=8172510',
    location: { name: 'Remote, United States' }, content: 'Build backend software with Python and React.' };
  const source = createDiscoverySources({ fetchImpl: async () => new Response(JSON.stringify({ jobs }), { headers: { 'content-type': 'application/json' } }) });
  const result = await source.search({ queries: ['software engineering internship React'], boards: ['stripe'], location: 'Bozeman, MT', level: 'internship' });
  assert.equal(result.jobs.length, 35);
  assert.equal(result.jobs.at(-1).url, 'https://stripe.com/jobs/search?gh_jid=8172510');
  const selected = searchCandidates(result.jobs, { queries: ['software engineering internship React'], location: 'Bozeman, MT', level: 'internship' });
  assert.deepEqual(selected.map(candidate => candidate.id), ['greenhouse-stripe-8172510']);
  assert.equal(mapJob('stripe', { id: 8172510, title: 'Engineer', absolute_url: 'https://stripe.com/jobs/search?gh_jid=9', content: 'Role' }), null);
});

test('rejects unsafe URLs and request plans; candidate filter respects plan terms and location', async () => {
  assert.equal(mapJob('figma', { id: 1, title: 'Intern', absolute_url: 'https://evil.example/jobs/1', content: 'Role' }), null);
  const source = createDiscoverySources({ fetchImpl: async () => { throw new Error('should not call'); } });
  await assert.rejects(source.search({ queries: ['x'], boards: ['evil'], location: '', level: '' }), { code: 'INVALID' });
  const candidates = searchCandidates([job, { ...job, id: 'other', role: 'Senior Accountant', location: 'London' }],
    { queries: ['React internship'], location: 'Bozeman, MT', level: 'internship' });
  assert.deepEqual(candidates.map(candidate => candidate.id), [job.id]);
});

test('plain text strips encoded markup after decoding named and numeric entities', () => {
  assert.equal(plain('&amp;lt;p&amp;gt;React &amp;amp; SQL &amp;lt;script&amp;gt;bad()&amp;lt;/script&amp;gt;&#33;&amp;lt;/p&amp;gt;', 100), 'React & SQL !');
});

test('internship search excludes internal engineering roles and retains company variety in the bounded pool', () => {
  const jobs = [
    ...Array.from({ length: 8 }, (_, i) => ({ ...job, id: `intern-${i}`, company: 'First employer' })),
    { ...job, id: 'second-employer', company: 'Second employer' },
    { ...job, id: 'internal', role: 'Software Engineer, Internal Systems', type: 'Unspecified' }
  ];
  const candidates = searchCandidates(jobs, { queries: ['software', 'intern'], location: '', level: 'internship' });
  assert.equal(candidates.length, 6);
  assert.equal(candidates.some(item => item.id === 'second-employer'), true);
  assert.equal(candidates.some(item => item.id === 'internal'), false);
});
