const test = require('node:test');
const assert = require('node:assert/strict');
const { createDemoOpportunities, createDemoResearch } = require('./demo-data.cjs');
test('catalog search returns dated employer links and honest filters', async () => {
  const results = await createDemoOpportunities().search({ query: 'software', level: 'internship' });
  assert.ok(results.jobs.length);
  assert.ok(results.jobs.every(job => !job.demo && !job.demoActivity && job.type === 'Internship' && job.url.startsWith('https://jobs.ashbyhq.com/')));
  assert.match(results.notice, /not a live feed/);
  assert.equal(results.cachedAt, '2026-10-17');
  assert.equal((await createDemoOpportunities().search({ level: 'entry' })).jobs.length, 0);
  assert.equal((await createDemoOpportunities().search({ location: 'Bozeman' })).jobs.length, 0);
  await assert.rejects(createDemoOpportunities().search({ query: {}, level: 'all' }), { code: 'INVALID' });
});
test('company brief declines unknown companies and uses only matching sourced records', async () => {
  const result = await createDemoResearch().company({company:'Acme',role:'Intern'});
  assert.deepEqual(result.sources, []);
  assert.match(result.notice, /No verified/);
  const job = require('./core.js').seed().jobs[0];
  const known = await createDemoResearch().company(job);
  assert.equal(known.sources[0].url, job.url);
  assert.equal(known.sources[0].excerpt, job.description);
  assert.match(known.notice, /October 17, 2026/);
  assert.deepEqual((await createDemoResearch().company({ ...job, url: 'https://example.com' })).sources, []);
});
