'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleSearch } = require('./google-search.cjs');

const ENDPOINT = 'https://google.serper.dev/search';
const listing = (title, link, snippet = 'A public role.') => ({ title, link, snippet });
const response = (organic, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return { organic }; } });

test('search uses the fixed Serper endpoint and keeps the API key in the server request header', async () => {
  const calls = [];
  const search = createGoogleSearch({ apiKey: 'server-secret', fetchImpl: async (url, init) => { calls.push({ url, init }); return response([listing('Engineer', 'https://jobs.example.com/1')]); }, now: () => 1234 });
  const result = await search.search({ queries: ['software engineer', 'backend'], location: 'Remote', level: 'Entry' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-API-KEY'], 'server-secret');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.q, 'software engineer Remote Entry');
  assert.equal(body.num, 10);
  assert.equal(body.gl, 'us');
  assert.equal(body.hl, 'en');
  assert.equal(result.cachedAt, 1234);
  assert.equal(result.source, 'Google Search via Serper');
  assert.equal(result.jobs[0].company, 'Source: jobs.example.com');
});

test('outgoing request has an allowlisted body and excludes supplied personal context', async () => {
  let request;
  const search = createGoogleSearch({ apiKey: 'key', fetchImpl: async (_url, init) => { request = JSON.parse(init.body); return response([]); } });
  await search.search({ queries: ['data analyst'], location: 'Boston', level: 'Intern', resume: 'PERSONAL_RESUME_MARKER', profile: 'PERSONAL_PROFILE_MARKER' });
  assert.deepEqual(Object.keys(request).sort(), ['gl', 'hl', 'num', 'q']);
  assert.doesNotMatch(JSON.stringify(request), /PERSONAL_RESUME_MARKER|PERSONAL_PROFILE_MARKER/);
});

test('maps valid public HTTPS results, rejects private or credentialed URLs, and deduplicates by stable ID', async () => {
  const rows = [
    listing('Software Engineer', 'https://Jobs.Example.com/roles/1?source=search', 'Build reliable systems.'),
    listing('Software Engineer', 'https://jobs.example.com/roles/1?source=other', 'Duplicate result.'),
    listing('Local', 'https://localhost/private'), listing('IPv4 private', 'https://127.0.0.1/job'),
    listing('IPv6 private', 'https://[::1]/job'), listing('Credentials', 'https://name:pass@jobs.example.com/role'),
    listing('HTTP', 'http://jobs.example.com/role'), listing('Link local', 'https://169.254.1.2/job'),
    listing('Private network', 'https://192.168.1.20/job')
  ];
  const fetchImpl = async () => response(rows);
  const first = await createGoogleSearch({ apiKey: 'key', fetchImpl, now: () => 50 }).search({ queries: ['engineer'] });
  const second = await createGoogleSearch({ apiKey: 'key', fetchImpl, now: () => 50 }).search({ queries: ['engineer'] });
  assert.equal(first.jobs.length, 1);
  assert.equal(first.jobs[0].url, 'https://jobs.example.com/roles/1?source=search');
  assert.match(first.jobs[0].id, /^[a-f0-9]{64}$/);
  assert.equal(first.jobs[0].id, second.jobs[0].id);
  assert.equal(first.jobs[0].role, 'Software Engineer');
  assert.equal(first.jobs[0].location, 'Verify location on source');
  assert.equal(first.jobs[0].type, 'Unverified');
  assert.equal(first.jobs[0].description, 'Google search snippet: Build reliable systems.');
  assert.equal(first.jobs[0].metadata, 'Software Engineer');
  assert.deepEqual(first.jobs[0].skills, []);
  assert.equal(first.jobs[0].demo, false);
  assert.equal(first.jobs[0].searchSnippet, true);
  assert.equal(typeof first.sources[0].url, 'string');
  assert.match(first.sourceNotice, /verify/i);
  assert.ok(Array.isArray(first.limitations));
});

test('caches identical query results for six hours', async () => {
  let time = 1000, calls = 0;
  const search = createGoogleSearch({ apiKey: 'key', now: () => time, fetchImpl: async () => { calls++; return response([listing('Role', 'https://jobs.example.org/role')]); } });
  const input = { queries: ['engineer'] };
  const a = await search.search(input);
  time += 6 * 60 * 60 * 1000 - 1;
  const b = await search.search(input);
  assert.equal(calls, 1);
  assert.equal(a.cachedAt, b.cachedAt);
  time++;
  await search.search(input);
  assert.equal(calls, 2);
});

test('returns safe CONFIG, QUOTA, and UPSTREAM errors', async () => {
  await assert.rejects(createGoogleSearch({ fetchImpl: async () => response([]) }).search({ queries: ['engineer'] }), { code: 'CONFIG' });
  const quota = createGoogleSearch({ apiKey: 'key', fetchImpl: async () => response([], 429) });
  await assert.rejects(quota.search({ queries: ['engineer'] }), { code: 'QUOTA' });
  const upstream = createGoogleSearch({ apiKey: 'key', fetchImpl: async () => { throw new Error('private upstream body'); } });
  await assert.rejects(upstream.search({ queries: ['engineer'] }), error => error.code === 'UPSTREAM' && !error.message.includes('private upstream body'));
});

test('sends exactly one search using the first query plus location and level', async () => {
  const calls = [];
  const search = createGoogleSearch({ apiKey: 'key', fetchImpl: async (_url, init) => { calls.push(JSON.parse(init.body)); return response([]); } });
  await search.search({ queries: ['engineer', 'analyst', 'designer'], location: 'Remote', level: 'Entry' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].q, 'engineer Remote Entry');
  assert.ok(calls.every(call => call.num === 10));
});
