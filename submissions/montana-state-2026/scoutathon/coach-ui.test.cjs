const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./core.js');

const source = fs.readFileSync(require.resolve('./coach-ui.js'), 'utf8');
const context = { Core, module: { exports: {} } };
vm.runInNewContext(source, context, { filename: 'coach-ui.js' });
const CoachUI = context.module.exports;

test('project report escapes all model controlled text', () => {
  const html = CoachUI.renderProjectReview({ result: {
    summary: '<img src=x onerror=alert(1)>', jobRelevance: '& role',
    findings: [{ path: 'src/x" onclick="x.js', lineStart: 4, lineEnd: 5, quote: '<script>x</script>', issue: 'issue', suggestion: 'fix' }],
    tasks: [{ title: '<svg onload=x>', reason: 'r', doneWhen: 'd' }]
  } });
  assert.doesNotMatch(html, /<(?:img|script|svg|title)\b/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /x&quot; onclick=&quot;x/);
  assert.match(html, /lines 4–5/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
});

test('coding report renders assessment, cited line evidence, complexity reasoning, and every next practice entry', () => {
  const html = CoachUI.renderCodingReview({ result: {
    summary: 'Reviewed from the submitted text.',
    correctness: { assessment: '<img>Looks correct under stated assumptions.', evidence: [
      { lineStart: 3, lineEnd: 4, quote: '<script>return total;</script>', explanation: 'The loop returns the running total.' }
    ] },
    complexity: { time: 'O(n)', space: 'O(1)', reasoning: '<svg onload=1>Visits each input value once.' },
    hints: ['<iframe src=x>'], weaknesses: ['& weak'],
    nextPractice: [
      { topic: 'Arrays', exercise: '<a href=x>', reason: 'Practice single-pass scans.' },
      { topic: 'Hash maps', exercise: 'Count values', reason: 'Compare lookup tradeoffs.' }
    ], jobRelevance: 'role', limitations: 'limits'
  } });
  assert.doesNotMatch(html, /<img>|<script>|<svg|<iframe|<a href/);
  assert.match(html, /&lt;iframe src=x&gt;/);
  assert.match(html, /&amp; weak/);
  assert.match(html, /Looks correct under stated assumptions/);
  assert.match(html, /Lines 3–4/);
  assert.match(html, /The loop returns the running total/);
  assert.match(html, /Visits each input value once/);
  assert.match(html, /Count values/);
  assert.match(html, /Compare lookup tradeoffs/);
});

test('coding topic input cap matches server validation limit', () => {
  const source = fs.readFileSync(require.resolve('./coach-ui.js'), 'utf8');
  assert.match(source, /field\('Topic', 'topic', '', 'text', 100\)/);
});
