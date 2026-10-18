const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./core.js');

const context = { Core, module: { exports: {} }, URL };
vm.runInNewContext(fs.readFileSync(require.resolve('./journeys-ui.js'), 'utf8'), context, { filename: 'journeys-ui.js' });
const UI = context.module.exports;

test('public listing rendering escapes provider text and rejects unsafe links', () => {
  const html = UI.renderJobs([{ id: 'a', role: '<img>', company: 'x', location: 'Remote', type: 'Internship', description: '<script>x</script>', url: 'javascript:alert(1)', source: 'Remotive', sourceUrl: 'https://example.com', publishedAt: '<b>' }]);
  assert.doesNotMatch(html, /<(?:img|script|b)\b|href="javascript:/i);
  assert.match(html, /Listing link unavailable/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.equal(UI.safeUrl('https://example.com/role'), 'https://example.com/role');
  assert.equal(UI.safeUrl('http://example.com'), '');
  assert.equal(UI.safeUrl('javascript:alert(1)'), '');
});

test('external research links and interview history are escaped', () => {
  const sources = UI.renderSources([{ title: '<img>', url: 'https://example.com/?x=1&y=2', excerpt: '<script>' }, { title: 'unsafe', url: 'data:text/html,x' }]);
  assert.doesNotMatch(sources, /<(?:img|script)\b|href="data:/i);
  assert.match(sources, /&lt;img&gt;/);
  const turns = UI.renderTurns([{ role: 'interviewer', text: '<svg onload=1>', evidenceQuote: '<iframe>' }, { role: 'candidate', text: '& answer' }]);
  assert.doesNotMatch(turns, /<(?:svg|iframe)\b/i);
  assert.match(turns, /&lt;svg onload=1&gt;/);
  assert.match(turns, /&amp; answer/);
});
