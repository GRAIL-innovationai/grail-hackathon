import { facultyGuidance } from './helpers/faculty';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, type AgentRequest, type SessionState } from '../shared/types';
import { getDirection } from '../server/engine';
import { checkOpenClawConnection, getOpenClawStatus, runOpenClaw, type OpenClawOptions } from '../server/openclaw';
import { agentTools, ResearchTurn } from '../server/research-agent';
import toolNames from '../shared/research-tool-names.json';
import { parseAgentRequest } from '../server/validation';

const options: OpenClawOptions = { gatewayToken: 'test-gateway-secret', baseUrl: 'http://127.0.0.1:18789', agentId: 'research-matchmaker' };
const request = (state = createSession(), message = 'I am interested in learning analytics'): AgentRequest => ({ state, action: 'chat', message, mode: 'openclaw' });
let serial = 0;
const call = (name: string, args: unknown) => ({ type: 'function_call', call_id: `call_${++serial}`, name, arguments: JSON.stringify(name === 'inspect_professor' ? { ...(args as any), guidance: facultyGuidance((args as any).name) } : args) });
const done = (reply = 'Here is your next step.', needsInput = false) => call('complete_research_step', { reply, suggestions: [], needsInput });
const completed = (output: unknown[]) => new Response(JSON.stringify({ status: 'completed', output }), { status: 200 });
function scripted(outputs: unknown[][], payloads: any[] = []): typeof fetch { return (async (_url: unknown, init?: RequestInit) => { payloads.push(JSON.parse(String(init?.body))); return completed(outputs.shift() || []); }) as typeof fetch; }
const task = (title = 'Compare two learning datasets', minutes = 60) => ({ id: null, title, description: 'Compare measurement choices and note a limitation.', minutes, output: 'A short comparison and a research question.', resourceUrl: null });
function planned(): SessionState { const s = createSession(); s.selectedDirectionId = 'learning-analytics'; s.directions = [getDirection('learning-analytics')]; const { resourceUrl, ...content } = task(); s.tasks = [{ ...content, id: 'original-task', completed: true, resource: null }]; s.stage = 'plan'; return s; }

test('tool allowlist matches the implemented tools; configuration never exposes remote gateways', async () => {
  assert.deepEqual(agentTools.map(t => t.name), toolNames);
  assert.equal(parseAgentRequest(request()).mode, 'openclaw');
  assert.equal(getOpenClawStatus({ ...options, gatewayToken: '' }).configured, false);
  let calls = 0;
  await assert.rejects(runOpenClaw(request(), { ...options, gatewayToken: '', fetchImpl: (async () => { calls++; return completed([]); }) as typeof fetch }));
  assert.equal(calls, 0);
  for (const baseUrl of ['https://remote.example', 'http://localhost/?token=x', 'http://user:x@localhost', 'http://127.0.0.1.evil.example']) assert.equal(getOpenClawStatus({ ...options, baseUrl }).configured, false);
});

test('agent can ask a useful question immediately without forced catalog retrieval', async () => {
  const payloads: any[] = [];
  const result = await runOpenClaw(request(createSession(), 'I do not know where to start'), { ...options, fetchImpl: scripted([[done('Would you rather understand people, analyze data, or build something?', true)]], payloads) });
  assert.equal(payloads.length, 1); assert.equal(result.state.directions.length, 0);
  assert.ok(payloads[0].tools.some((t: any) => t.name === 'complete_research_step'));
  assert.equal(payloads[0].text, undefined); assert.equal(payloads[0].previous_response_id, undefined);
  assert.ok(payloads[0].input.every((i: any) => i.type === 'message'));
});

test('gateway continuations carry only new tool results and response IDs stay within one turn', async () => {
  const payloads: any[] = [];
  let step = 0;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: `resp_${++step}`, status: 'completed', output: step === 1 ? [call('get_student_context', {})] : [done('What kind of problem interests you?', true)] }));
  }) as typeof fetch;
  await runOpenClaw(request(), { ...options, fetchImpl });
  assert.equal(payloads[0].previous_response_id, undefined);
  assert.equal(payloads[1].previous_response_id, 'resp_1');
  assert.equal(payloads[1].input.length, 1);
  assert.equal(payloads[1].input[0].type, 'function_call_output');
  await runOpenClaw(request(), { ...options, fetchImpl });
  assert.equal(payloads[2].previous_response_id, undefined);
});

test('agent saves explicit profile evidence, authors tasks, and reads tool results in the same loop', async () => {
  const payloads: any[] = [];
  const result = await runOpenClaw(request(createSession(), 'I know basic Python. I have 2 hours a week.'), { ...options, fetchImpl: scripted([
    [call('update_student_profile', { updates: [{ field: 'experience', value: 'I know basic Python', evidence: 'I know basic Python' }, { field: 'hoursPerWeek', value: '2', evidence: 'I have 2 hours a week' }] })],
    [{ type: 'reasoning', id: 'reason_1', summary: [] }, call('get_learning_resources', { directionId: 'learning-analytics' })],
    [call('save_plan', { directionId: 'learning-analytics', tasks: [task('Inspect a tiny student activity table', 90)] })],
    [done('Your 90-minute task is saved; start by looking at the table.')],
  ], payloads) });
  assert.equal(result.state.profile.hoursPerWeek, 2);
  assert.equal(result.state.profileEvidence?.[0].source, 'student_statement');
  assert.equal(result.state.tasks.length, 1); assert.equal(result.state.tasks[0].minutes, 90);
  assert.equal(result.state.tasks[0].title, 'Inspect a tiny student activity table');
  assert.ok(payloads[3].input.some((x: any) => x.type === 'function_call_output' && x.output.includes('Inspect a tiny')));
  assert.ok(payloads[3].input.some((x: any) => x.type === 'reasoning'));
  assert.ok(payloads[0].input[1].content.includes('Current workspace DATA'));
});

test('invalid time budget is returned to the model for repair rather than silently replaced', async () => {
  const payloads: any[] = [];
  const result = await runOpenClaw(request(), { ...options, fetchImpl: scripted([
    [call('get_learning_resources', { directionId: 'learning-analytics' })],
    [call('save_plan', { directionId: 'learning-analytics', tasks: [task('Too much', 300)] })],
    [call('save_plan', { directionId: 'learning-analytics', tasks: [task('Small revised task', 45)] })], [done()],
  ], payloads) });
  assert.match(JSON.stringify(payloads[2].input), /exceeds weekly availability/);
  assert.equal(result.state.tasks[0].minutes, 45); assert.equal(result.state.tasks[0].title, 'Small revised task');
});

test('custom tasks and completed work survive follow-ups and validation', async () => {
  const state = planned(); const before = structuredClone(state);
  const result = await runOpenClaw(request(state, 'How should I interpret the result?'), { ...options, fetchImpl: scripted([[call('get_student_context', {})], [done('Look for one limitation in how the data was collected.')]]) });
  assert.deepEqual(result.state.tasks, state.tasks); assert.deepEqual(state, before);
  assert.deepEqual(parseAgentRequest(request(result.state)).state.tasks, state.tasks);
  const turn = new ResearchTurn(request(state, 'Make the next step easier'));
  turn.execute('get_learning_resources', { directionId: 'learning-analytics' });
  const rejected = turn.execute('save_plan', { directionId: 'learning-analytics', tasks: [task()] });
  assert.equal((rejected as any).ok, false); assert.deepEqual(turn.state.tasks, state.tasks);
});

test('revision actually saves a shorter email, preserving it on subsequent turns', async () => {
  const state = createSession();
  const draft = { professorId: 'joseph-konstan', subject: 'Undergraduate question about recommendations', body: 'Dear Professor Konstan,\nI know basic Python. How might a beginner compare two recommendation methods?\nThank you,\n[Your name]', studentClaims: [{ text: 'I know basic Python.', evidence: 'I know basic Python.' }] };
  const created = await runOpenClaw(request(state, 'I know basic Python. I want to contact Joseph A. Konstan first.'), { ...options, fetchImpl: scripted([[call('inspect_professor', { name: 'Konstan' })], [call('save_email_draft', draft)], [done('Your draft is ready to review.')]]) });
  assert.equal(created.state.tasks.length, 0); assert.equal(created.state.selectedDirectionId, null); assert.equal(created.state.draft?.body, draft.body);
  created.state.messages.push({ id: 'student_1', role: 'user', content: 'I know basic Python.', createdAt: '2026-10-03' });
  const shorter = { ...draft, body: 'Dear Professor Konstan,\nHow can a beginner explore recommender systems?\n[Your name]', studentClaims: [] };
  const revised = await runOpenClaw(request(created.state, 'Make the email shorter'), { ...options, fetchImpl: scripted([[call('get_student_context', {})], [call('inspect_professor', { name: 'Konstan' })], [call('save_email_draft', shorter)], [done('I shortened the saved draft.')]]) });
  assert.ok(revised.state.draft!.body.length < created.state.draft!.body.length);
  const followup = await runOpenClaw(request(revised.state, 'What if there is no reply?'), { ...options, fetchImpl: scripted([[done('You can keep exploring while waiting.')]]) });
  assert.deepEqual(followup.state.draft, revised.state.draft);
});

test('grounding rejects invented profile evidence, missing retrievals, URLs and claim citations', () => {
  const turn = new ResearchTurn(request(createSession(), 'I do not know Python yet.'));
  assert.equal((turn.execute('update_student_profile', { updates: [{ field: 'experience', value: 'Python', evidence: 'I do not know Python yet.' }] }) as any).ok, false);
  assert.equal((turn.execute('update_student_profile', { updates: [{ field: 'school', value: 'MIT', evidence: 'I attend MIT' }] }) as any).ok, false);
  assert.equal(turn.state.profile.school, '');
  assert.equal((turn.execute('save_plan', { directionId: 'learning-analytics', tasks: [task()] }) as any).ok, false);
  turn.execute('get_learning_resources', { directionId: 'learning-analytics' });
  assert.equal((turn.execute('save_plan', { directionId: 'learning-analytics', tasks: [{ ...task(), resourceUrl: 'https://invented.example/course' }] }) as any).ok, false);
  turn.execute('inspect_professor', { name: 'Konstan' });
  assert.equal((turn.execute('save_email_draft', { professorId: 'joseph-konstan', subject: 'Hello', body: 'I have published three papers.', studentClaims: [{ text: 'I have published three papers.', evidence: 'I published three papers' }] }) as any).ok, false);
  assert.equal(turn.state.draft, null);
});

test('faculty lookup uses the actual school, not a model-provided substitute', () => {
  const state = createSession(); state.profile.school = 'MIT';
  const turn = new ResearchTurn(request(state));
  turn.execute('get_learning_resources', { directionId: 'learning-analytics' });
  const result = turn.execute('find_faculty', { school: 'University of Minnesota', directionId: 'learning-analytics' }) as any;
  assert.equal(result.professors.length, 0); assert.match(result.note, /gap in our catalog for MIT/);
});

test('profile additions preserve earlier experience and a bad multi-field update rolls back atomically', () => {
  const state = createSession(); state.profile.experience = 'I know basic Python.';
  const turn = new ResearchTurn(request(state, 'I completed an introductory statistics course.'));
  const added = turn.execute('update_student_profile', { updates: [{ field: 'experience', value: 'I completed an introductory statistics course.', evidence: 'I completed an introductory statistics course.', operation: 'append' }] }) as any;
  assert.equal(added.ok, true);
  assert.match(turn.state.profile.experience, /basic Python/);
  assert.match(turn.state.profile.experience, /statistics/);
  const before = structuredClone(turn.state);
  const rejected = turn.execute('update_student_profile', { updates: [
    { field: 'interests', value: 'statistics', evidence: 'I completed an introductory statistics course.' },
    { field: 'school', value: 'MIT', evidence: 'I attend MIT' },
  ] }) as any;
  assert.equal(rejected.ok, false); assert.deepEqual(turn.state, before);
});

test('feedback changes only unfinished tasks and progress can be saved with student evidence', () => {
  const state = planned();
  state.tasks.push({ id: 'unfinished', title: 'Implement a complex model', description: 'Build a model.', minutes: 120, output: 'A model.', completed: false, resource: null });
  const turn = new ResearchTurn(request(state, 'I finished the comparison. Make the coding task easier.'));
  turn.execute('get_learning_resources', { directionId: 'learning-analytics' });
  const old = state.tasks[0];
  const result = turn.execute('save_plan', { directionId: 'learning-analytics', tasks: [
    { id: old.id, title: old.title, description: old.description, minutes: old.minutes, output: old.output, resourceUrl: null },
    { ...task('Compare two rows by hand', 20), id: 'unfinished' },
  ] }) as any;
  assert.equal(result.ok, true); assert.equal(turn.state.tasks[0].completed, true);
  assert.equal(turn.state.tasks[1].title, 'Compare two rows by hand');
  assert.equal(turn.state.tasks[1].completed, false);
  assert.equal((turn.execute('update_task_progress', { taskId: old.id, completed: true, evidence: 'I finished the comparison' }) as any).ok, true);
});

test('failed turns roll back all writes, undeclared tools cannot run, unfinished UI actions cannot succeed', async () => {
  const req = request(); const before = structuredClone(req);
  await assert.rejects(runOpenClaw(req, { ...options, fetchImpl: scripted([[call('get_learning_resources', { directionId: 'learning-analytics' })], [call('save_plan', { directionId: 'learning-analytics', tasks: [task()] })], [call('send_email', {})]]) }), /unsupported/);
  assert.deepEqual(req, before);
  const turn = new ResearchTurn({ ...request(), action: 'create_plan' });
  assert.throws(() => turn.finish({ reply: 'Plan saved', suggestions: [], needsInput: false }), /unfinished/);
  assert.equal(turn.finish({ reply: 'How much time do you have?', suggestions: [], needsInput: true }).state.tasks.length, 0);
});

test('authentication errors, incomplete responses, timeouts and failed checks stay explicit and redact provider secrets', async () => {
  for (const fetchImpl of [(async () => new Response('test-gateway-secret', { status: 401 })) as typeof fetch, (async () => { throw new Error('test-gateway-secret'); }) as typeof fetch]) await assert.rejects(runOpenClaw(request(), { ...options, fetchImpl }), (e: any) => !e.message.includes('test-gateway-secret'));
  await assert.rejects(runOpenClaw(request(), { ...options, fetchImpl: (async () => new Response(JSON.stringify({ status: 'incomplete', output: [] }))) as typeof fetch }), /did not complete/);
  const never = ((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))) as typeof fetch;
  await assert.rejects(runOpenClaw(request(), { ...options, timeoutMs: 5, fetchImpl: never }), /timed out/);
  const result = await checkOpenClawConnection({ ...options, fetchImpl: (async () => new Response('test-gateway-secret', { status: 401 })) as typeof fetch });
  assert.equal(result.ok, false); assert.doesNotMatch(result.message, /test-gateway-secret/);
});

test('named professor lookup appends visible cards, deduplicates, and keeps the current draft', () => {
  const state = createSession();
  const first = new ResearchTurn(request(state, 'Tell me about Konstan'));
  first.execute('inspect_professor', { name: 'Konstan', guidance: facultyGuidance('Konstan') });
  const saved = first.finish({ reply: 'Joseph A. Konstan is on your faculty list.', suggestions: [], needsInput: false }).state;
  assert.equal(saved.stage, 'connect'); assert.deepEqual(saved.professors.map(p => p.id), ['joseph-konstan']);
  saved.selectedProfessorId = 'joseph-konstan';
  saved.draft = { professorId: 'joseph-konstan', subject: 'My subject', body: 'My edited introduction', checklist: [] };
  const more = new ResearchTurn(request(saved, 'Recommend more professors'));
  more.execute('inspect_professor', { name: 'Terveen', guidance: facultyGuidance('Terveen') });
  more.execute('inspect_professor', { name: 'Terveen', guidance: facultyGuidance('Terveen') });
  assert.deepEqual(more.state.professors.map(p => p.id), ['joseph-konstan', 'loren-terveen']);
  assert.deepEqual(more.state.draft, saved.draft);
  assert.equal(more.state.selectedProfessorId, saved.selectedProfessorId);
  assert.deepEqual(parseAgentRequest(request(more.finish({ reply: 'Loren Terveen is now also on your list.', suggestions: [], needsInput: false }).state)).state.professors, more.state.professors);
  const missing = more.execute('inspect_professor', { name: 'Invented Person' }) as any;
  assert.equal(missing.addedCount, 0); assert.equal(more.state.professors.length, 2);
});

test('more faculty expands to labeled adjacent topics at the actual school without losing existing cards', () => {
  const state = createSession(); state.profile.school = 'University of Minnesota Twin Cities';
  const turn = new ResearchTurn(request(state, 'More professors, including related fields'));
  turn.execute('get_learning_resources', { directionId: 'recommender-systems' });
  const first = turn.execute('find_faculty', { school: state.profile.school, directionId: 'recommender-systems' }) as any;
  assert.equal(first.directCount, 1); assert.equal(first.addedCount, 1);
  assert.equal(turn.state.selectedDirectionId, 'recommender-systems');
  assert.ok(turn.state.directions.some(d => d.id === 'recommender-systems'));
  const more = turn.execute('find_faculty', { school: 'MIT', directionId: 'recommender-systems', includeRelated: true }) as any;
  assert.ok(more.addedCount > 0); assert.ok(more.relatedCount > 0);
  assert.ok(turn.state.professors.some(p => p.id === 'joseph-konstan'));
  assert.ok(turn.state.professors.every(p => p.university === state.profile.school));
  assert.ok(more.relatedMatches.every((p: any) => p.sharedTopics.length && /Adjacent/.test(p.note)));
  const repeated = turn.execute('find_faculty', { school: state.profile.school, directionId: 'recommender-systems', includeRelated: true }) as any;
  assert.equal(repeated.addedCount, 0); assert.match(repeated.note, /No new cards/);
  const unsupported = createSession(); unsupported.profile.school = 'MIT';
  const other = new ResearchTurn(request(unsupported));
  other.execute('get_learning_resources', { directionId: 'recommender-systems' });
  const gap = other.execute('find_faculty', { school: state.profile.school, directionId: 'recommender-systems', includeRelated: true }) as any;
  assert.equal(gap.professors.length, 0); assert.equal(other.state.professors.length, 0);
});

test('conversation-only recommendation is repaired through a tool before completion', async () => {
  const payloads: any[] = [];
  const result = await runOpenClaw(request(createSession(), 'Recommend more professors'), { ...options, fetchImpl: scripted([
    [done('Consider Loren Terveen.')],
    [call('inspect_professor', { name: 'Terveen' })],
    [done('Loren Terveen is now on your faculty list.')],
  ], payloads) });
  assert.equal(payloads.length, 3);
  assert.match(JSON.stringify(payloads[1]), /without a visible faculty card/);
  assert.equal(result.state.professors[0].id, 'loren-terveen');
  assert.equal(result.state.stage, 'connect');
});

import { directionCard } from './helpers/direction';

test('authored direction fields survive revisions, subsequent turns and selection into a plan', () => {
  const turn = new ResearchTurn(request());
  const created = turn.execute('save_directions', { mode: 'replace', options: [directionCard(), directionCard('Explore a question about acoustic design')] }) as any;
  assert.equal(created.ok, true);
  const [card, other] = turn.state.directions;
  assert.match(card.id, /^custom-/); assert.equal(card.catalogDirectionId, null);
  const follow = new ResearchTurn(request(turn.finish({ reply: 'Two exploratory questions are ready.', suggestions: [], needsInput: false }).state, 'Focus the first card on a paper-only experiment.'));
  const revised = { ...directionCard('Paper-only feedback experiment'), directionId: card.id, question: 'How do two handwritten hints differ?', firstStep: 'Write two alternative hints.', activities: ['Compare handwritten hints'], skills: ['Qualitative comparison'] };
  assert.equal((follow.execute('save_directions', { mode: 'merge', options: [revised] }) as any).ok, true);
  assert.deepEqual(follow.state.directions[1], other);
  const saved = follow.finish({ reply: 'The first card is updated.', suggestions: [], needsInput: false }).state;
  const next = new ResearchTurn({ ...request(saved), action: 'select_direction', directionId: card.id });
  assert.equal(next.state.directions[0].title, revised.title); assert.equal(next.state.directions[0].question, revised.question);
  assert.equal(next.state.directions[0].firstStep, revised.firstStep); assert.deepEqual(next.state.directions[0].activities, revised.activities);
  next.execute('get_learning_resources', { directionId: card.id });
  assert.equal((next.execute('save_plan', { directionId: card.id, tasks: [task('Compare two handwritten hints', 30)] }) as any).ok, true);
  assert.equal(next.finish({ reply: 'Your plan is saved.', suggestions: [], needsInput: false }).state.selectedDirectionId, card.id);
  assert.throws(() => parseAgentRequest({ ...request(saved), mode: 'demo' }), /Unknown research direction/);
});

test('editing catalog-backed cards preserves authored content and selected work while canonicalizing resources', () => {
  const state = planned(); const turn = new ResearchTurn(request(state));
  turn.execute('get_learning_resources', { directionId: 'learning-analytics' });
  const resource = getDirection('learning-analytics').resources[0];
  const option = { ...directionCard('Debugging hints in beginner Python lessons'), directionId: 'learning-analytics', catalogDirectionId: 'learning-analytics', resourceUrls: [resource.url] };
  assert.equal((turn.execute('save_directions', { mode: 'merge', options: [option] }) as any).ok, true);
  assert.deepEqual(turn.state.tasks, state.tasks);
  const follow = new ResearchTurn(request(turn.state));
  assert.equal(follow.state.directions[0].title, option.title); assert.deepEqual(follow.state.directions[0].resources, [resource]);
  follow.execute('save_directions', { mode: 'replace', options: [directionCard('A second question')] });
  assert.ok(follow.state.directions.some(d => d.id === 'learning-analytics' && d.title === option.title));
  assert.deepEqual(follow.state.tasks, state.tasks);
});

test('direction writes reject invented resources and unknown categories atomically', () => {
  const turn = new ResearchTurn(request());
  const bad = turn.execute('save_directions', { mode: 'replace', options: [directionCard(), { ...directionCard('Bad source'), resourceUrls: ['https://made-up.example/study'] }] }) as any;
  assert.equal(bad.ok, false); assert.equal(turn.state.directions.length, 0);
  const unknown = turn.execute('save_directions', { mode: 'merge', options: [{ ...directionCard(), catalogDirectionId: 'made-up-field' }] }) as any;
  assert.equal(unknown.ok, false); assert.equal(turn.state.directions.length, 0);
});
