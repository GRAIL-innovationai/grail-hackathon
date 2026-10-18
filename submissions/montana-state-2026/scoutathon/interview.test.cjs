'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createInterview, buildInterviewContext, validateInput, validateResult } = require('./interview.cjs');

const state = {
  profile: { name: 'Private Name', location: 'Private City', target: 'Frontend developer', skills: 'JavaScript, CSS',
    resumeText: 'Built a class project with React and accessible forms.', resumeName: 'resume.pdf' },
  jobs: [
    { id: 'j1', company: 'Example Co', role: 'Frontend Intern', type: 'Internship', skills: ['React', 'Accessibility'], description: 'Build accessible interfaces.' },
    { id: 'j2', company: 'Other Co', role: 'Backend Engineer', description: 'Other job context.' }
  ]
};
const research = { summary: 'A supplied public careers page excerpt.', sources: [{ title: 'Careers', url: 'https://example.invalid/careers', excerpt: 'The team builds research tools.' }] };
const firstInput = { answer: '', mode: 'mixed', first: true };
const answerInput = { answer: 'I built a form for a class project and checked it with a keyboard.', mode: 'behavioral', first: false };
const firstResult = { feedback: 'We can begin with a role-focused question.', question: 'Tell me about a project where you improved an interface.', focus: 'Project explanation', practiceTask: 'Outline the situation, action, and result.', limitations: 'This is practice, not an employer question.', evidenceQuote: '' };
const followupResult = { feedback: 'You named the project and a specific accessibility check. Add the outcome if you can.', question: 'What changed after you checked keyboard access?', focus: 'Explain impact', practiceTask: 'Add one concrete result to your example.', limitations: 'I cannot verify the project or its result.', evidenceQuote: 'checked it with a keyboard' };

test('context is selected-role only, bounded, and excludes names/contact metadata', () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'candidate' : 'interviewer', text: `turn ${i}` }));
  const context = buildInterviewContext(state, 'j1', research, history);
  assert.equal(context.job.role, 'Frontend Intern');
  assert.equal(context.job.description, 'Build accessible interfaces.');
  assert.equal(context.profile.resumeText, state.profile.resumeText);
  assert.equal(context.history.length, 6);
  assert.equal(context.history[0].text, 'turn 2');
  const serialized = JSON.stringify(context);
  assert.equal(serialized.includes('Private Name'), false);
  assert.equal(serialized.includes('Private City'), false);
  assert.equal(serialized.includes('Other Co'), false);
  assert.equal(serialized.includes('Other job context'), false);
  assert.throws(() => buildInterviewContext(state, 'missing', research, []), { code: 'NOT_FOUND' });
  const long = buildInterviewContext({ ...state, profile: { ...state.profile, resumeText: 'r'.repeat(9000) } }, 'j1',
    { summary: 's'.repeat(3000), sources: [{ title: 't'.repeat(300), url: 'u'.repeat(1200), excerpt: 'e'.repeat(1500) }] },
    [{ role: 'candidate', text: 'h'.repeat(3000) }]);
  assert.equal(long.profile.resumeText.length, 6000);
  assert.equal(long.companyResearch.summary.length, 2000);
  assert.equal(long.companyResearch.sources[0].excerpt.length, 1200);
  assert.equal(long.history[0].text.length, 2000);
});

test('input rules distinguish first question from answer review', () => {
  assert.equal(validateInput(firstInput), true);
  assert.equal(validateInput(answerInput), true);
  assert.equal(validateInput({ ...firstInput, answer: 'already answered' }), false);
  assert.equal(validateInput({ ...answerInput, answer: ' ' }), false);
  assert.equal(validateInput({ ...answerInput, mode: 'random' }), false);
  assert.equal(validateInput({ ...answerInput, answer: 'x'.repeat(5001) }), false);
});

test('first-turn output asks a question without claiming evidence; follow-up evidence must match answer', () => {
  assert.equal(validateResult(firstResult, firstInput), true);
  assert.equal(validateResult({ ...firstResult, evidenceQuote: 'made up' }, firstInput), false);
  assert.equal(validateResult(followupResult, answerInput), true);
  assert.equal(validateResult({ ...followupResult, evidenceQuote: 'I led a team' }, answerInput), false);
  assert.equal(validateResult({ ...followupResult, surprise: true }, answerInput), false);
});

test('generation uses strict bounded structured output and adapts first and follow-up turns', async () => {
  const calls = [];
  const coach = createInterview({ async requestStructured(request) {
    calls.push(request);
    assert.equal(request.name, 'interview_practice');
    assert.equal(request.maxTokens, 1600);
    assert.equal(request.schema.additionalProperties, false);
    assert.match(request.system, /real questions/i);
    if (request.input.first) {
      assert.equal(request.input.answer, '');
      assert.equal(request.input.context.job.role, 'Frontend Intern');
      assert.equal(request.input.context.companyResearch.sources[0].excerpt, research.sources[0].excerpt);
      return request.validate(firstResult) ? firstResult : assert.fail('first response validation');
    }
    assert.equal(request.input.answer, answerInput.answer);
    assert.equal(request.input.mode, 'behavioral');
    return request.validate(followupResult) ? followupResult : assert.fail('follow-up response validation');
  } });
  const context = buildInterviewContext(state, 'j1', research, []);
  assert.equal((await coach.generate(context, firstInput)).question, firstResult.question);
  const withHistory = { ...context, history: [{ role: 'interviewer', text: firstResult.question }] };
  assert.equal((await coach.generate(withHistory, answerInput)).evidenceQuote, followupResult.evidenceQuote);
  assert.equal(calls.length, 2);
  await assert.rejects(coach.generate(context, { ...answerInput, answer: '' }), { code: 'INVALID' });
});
