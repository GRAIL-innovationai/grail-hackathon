'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpportunities, mapJob } = require('./opportunities.cjs');

function raw(overrides = {}) {
  return { id: 42, url: 'https://remotive.com/remote-jobs/software-dev/frontend-intern-42', title: 'Frontend Intern',
    company_name: 'Example Co', job_type: 'internship', publication_date: '2026-10-17T12:00:00Z',
    candidate_required_location: 'Worldwide', tags: ['React', 'TypeScript'],
    description: '<p>Build React interfaces &amp; accessible forms.</p><script>alert(1)</script>', ...overrides };
}
function response(jobs, status = 200) { return new Response(JSON.stringify({ jobs }), { status, headers: { 'content-type': 'application/json' } }); }

test('maps feed records to sanitized app jobs with Remotive links and attribution', async () => {
  const opportunities = createOpportunities({ fetchImpl: async url => {
    assert.equal(url, 'https://remotive.com/api/remote-jobs?category=software-dev');
    return response([raw()]);
  } });
  const result = await opportunities.search({ query: 'React', level: 'intern', location: 'Bozeman' });
  assert.equal(result.source, 'Remotive');
  assert.match(result.notice, /24 hours/);
  assert.match(result.notice, /Remotive/);
  assert.equal(result.jobs[0].id, 'remotive-42');
  assert.equal(result.jobs[0].type, 'Internship');
  assert.equal(result.jobs[0].location, 'Worldwide');
  assert.equal(result.jobs[0].description, 'Build React interfaces & accessible forms.');
  assert.equal(result.jobs[0].url, raw().url);
  assert.equal(result.jobs[0].demo, false);
  assert.equal(result.jobs[0].resume, '');
});

test('fetches once, caches six hours, and reapplies filters locally across query changes', async () => {
  let current = Date.UTC(2026, 9, 17, 12), calls = 0;
  const opportunities = createOpportunities({ now: () => current, fetchImpl: async (_url, init) => {
    calls += 1;
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.accept, 'application/json');
    return response([raw(), raw({ id: 43, title: 'Senior React Engineer', job_type: 'full_time', candidate_required_location: 'Canada' }),
      raw({ id: 44, title: 'Junior SQL Developer', job_type: 'full_time', candidate_required_location: 'United States' })]);
  } });
  const first = await opportunities.search({ query: 'React', level: '', location: '' });
  const second = await opportunities.search({ query: 'SQL', level: 'entry', location: 'United States' });
  assert.equal(first.jobs[0].id, 'remotive-43');
  assert.deepEqual(second.jobs.map(job => job.id), ['remotive-44']);
  assert.equal(calls, 1);
  current += 6 * 60 * 60 * 1000 + 1;
  await opportunities.search({ query: 'React' });
  assert.equal(calls, 2);
});

test('ranks matching title and tags, caps results at 30, and ignores unsafe listing URLs', async () => {
  const records = Array.from({ length: 35 }, (_, i) => raw({ id: i + 100, title: `React Engineer ${i}` }));
  records.push(raw({ id: 999, url: 'https://evil.invalid/job' }));
  const opportunities = createOpportunities({ fetchImpl: async () => response(records) });
  const result = await opportunities.search({ query: 'React' });
  assert.equal(result.jobs.length, 30);
  assert.equal(mapJob(raw({ url: 'https://user@remotive.com/remote-jobs/x' })), null);
  assert.equal(mapJob(raw({ url: 'http://remotive.com/remote-jobs/x' })), null);
});

test('rejects invalid search filters and sanitizes upstream errors', async () => {
  const bad = createOpportunities({ fetchImpl: async () => new Response('secret upstream body', { status: 500 }) });
  await assert.rejects(bad.search({ query: 'q'.repeat(121) }), { code: 'INVALID' });
  await assert.rejects(bad.search({}), error => error.code === 'UPSTREAM' && !error.message.includes('secret upstream'));
});

test('allows four requests per UTC day and resets the best-effort quota at UTC midnight', async () => {
  let current = Date.UTC(2026, 9, 17, 0, 1), calls = 0;
  const opportunities = createOpportunities({ now: () => current, fetchImpl: async () => { calls++; return response([raw()]); } });
  for (let i = 0; i < 4; i++) {
    if (i) current += 6 * 60 * 60 * 1000 + 1;
    await opportunities.search({ query: String(i) });
  }
  current = Date.UTC(2026, 9, 18, 0, 1) + 10;
  await opportunities.search({});
  assert.equal(calls, 5);
});
