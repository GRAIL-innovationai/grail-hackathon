import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, type AgentRequest, type AgentAction, type SessionState } from '../shared/types';
import { directions, professors } from '../server/catalog';
import { extractProfile, findFaculty, runDemo, sanitizeState, searchDirections } from '../server/engine';
import { parseAgentRequest } from '../server/validation';
import { AgentError } from '../server/errors';
import { runLive } from '../server/live';
import { app } from '../server/app';

const school = 'University of Minnesota Twin Cities';
function request(state = createSession(), action: AgentAction = 'chat', message = 'I am interested in education and how people use technology'): AgentRequest {
  return { state, action, message, mode: 'demo' };
}
function planState(directionId = 'human-computer-interaction', hours = 4): SessionState {
  const state = createSession(); state.profile.school = school; state.profile.hoursPerWeek = hours;
  return runDemo({ ...request(state, 'select_direction', ''), directionId }).state;
}

test('student profile starts with no assumed university; explicit chat facts are preserved without inventing skill', () => {
  assert.equal(createSession().profile.school, '');
  const profile = extractProfile(createSession().profile, 'I am interested in biology. I want to learn Python. I know a little statistics. I can spend 2 hours per week.');
  assert.match(profile.interests, /biology/);
  assert.match(profile.experience, /statistics/);
  assert.doesNotMatch(profile.experience, /Python/);
  assert.equal(profile.hoursPerWeek, 2);
});

test('explicit Chinese experience is retained, interest words alone do not create proficiency', () => {
  const profile = extractProfile(createSession().profile, '我对机器人感兴趣。我会一点Python。每周可以投入3小时。');
  assert.match(profile.interests, /机器人/); assert.match(profile.experience, /Python/); assert.equal(profile.hoursPerWeek, 3);
  assert.equal(extractProfile(createSession().profile, 'Python robotics are interesting').experience, '');
});

test('recommendation ranks biology and environment interests differently and explains exploration', () => {
  assert.equal(searchDirections('I love genetics and DNA')[0].id, 'bioinformatics');
  assert.equal(searchDirections('I like conservation and wildlife ecology')[0].id, 'ecology-conservation');
  const result = runDemo(request());
  assert.equal(result.state.directions.length, 3); assert.equal(result.state.stage, 'explore');
  assert.equal(result.state.profile.experience, ''); assert.equal(result.state.messages.length, 0);
});

test('plans respect the whole weekly budget at 0.5, 2, 4, and 40 hours', () => {
  for (const hours of [0.5, 2, 4, 40]) {
    const state = planState('human-computer-interaction', hours);
    assert.equal(state.tasks.reduce((sum, task) => sum + task.minutes, 0), hours * 60);
    assert.ok(state.tasks.every(task => task.minutes > 0 && task.output));
  }
  const state = runDemo(request(planState(), 'chat', 'I can spend 2 hours per week')).state;
  assert.equal(state.tasks.reduce((sum, task) => sum + task.minutes, 0), 120);
});

test('changing direction clears old professor and email context', () => {
  let state = runDemo(request(planState(), 'find_professors', '')).state;
  state = runDemo({ ...request(state, 'draft_email', ''), professorId: state.professors[0].id }).state;
  state.draft!.body = 'A student-edited, more personal draft.';
  state.draft!.subject = 'My edited subject';
  assert.ok(state.draft);
  state = runDemo({ ...request(state, 'select_direction', ''), directionId: 'bioinformatics' }).state;
  assert.equal(state.selectedDirectionId, 'bioinformatics'); assert.equal(state.professors.length, 0); assert.equal(state.draft, null);
  assert.ok(state.tasks.every(task => task.id.startsWith('bioinformatics-')));
});

test('contextual follow-ups retain plan and draft instead of silently recommending new directions', () => {
  let state = runDemo(request(planState(), 'find_professors', '')).state;
  state.profile.interests = 'education';
  state = runDemo({ ...request(state, 'draft_email', ''), professorId: state.professors[0].id }).state;
  state.draft!.body = 'A student-edited, more personal draft.';
  state.draft!.subject = 'My edited subject';
  for (const message of ['How should I compare these directions?', 'What should I ask at a first meeting?', 'What if the professor does not reply?']) {
    const response = runDemo(request(state, 'chat', message));
    assert.equal(response.state.selectedDirectionId, state.selectedDirectionId);
    assert.deepEqual(response.state.tasks, state.tasks); assert.deepEqual(response.state.draft, state.draft);
  }
});

test('email and plan advice preserves student edits and completion; explicit mutations still work', () => {
  let state = runDemo(request(planState(), 'find_professors', '')).state;
  state = runDemo({ ...request(state, 'draft_email', ''), professorId: state.professors[0].id }).state;
  state.draft!.subject = 'My own subject'; state.draft!.body = 'My own careful wording.'; state.tasks[0].completed = true;
  for (const message of ['How long should my email be?', 'How should I write an outreach email?', 'Can I keep this paragraph in my email?', 'What is this plan asking me to do?', 'How can I make the plan easier?', 'Do not rewrite my email']) {
    const response = runDemo(request(state, 'chat', message));
    assert.deepEqual(response.state.draft, state.draft, message);
    assert.deepEqual(response.state.tasks, state.tasks, message);
  }
  const rewritten = runDemo(request(state, 'chat', 'Please rewrite my email'));
  assert.notEqual(rewritten.state.draft!.body, state.draft!.body);
  assert.deepEqual(rewritten.state.tasks, state.tasks);
  const easier = runDemo(request(state, 'chat', 'Make this easier'));
  assert.ok(easier.state.tasks.every(task => task.id.includes('-simple-')));
  const regenerated = runDemo(request(state, 'chat', 'Can you create a new plan?'));
  assert.equal(regenerated.state.tasks[0].completed, false);
});

test('missing school prompts, an explicit school reply resumes matching, other schools never receive UMN faculty', () => {
  let state = planState(); state.profile.school = '';
  let response = runDemo(request(state, 'find_professors', ''));
  assert.match(response.reply, /Which university/); assert.equal(response.state.professors.length, 0);
  response = runDemo(request(response.state, 'chat', 'I attend University of Minnesota Twin Cities'));
  assert.equal(response.state.profile.school, school); assert.ok(response.state.professors.length);
  state = response.state; state.profile.school = 'University of Wisconsin Madison';
  response = runDemo(request(state, 'find_professors', ''));
  assert.equal(response.state.professors.length, 0); assert.match(response.reply, /gap in our catalog/);
  assert.equal(findFaculty('UMN Duluth', 'human-computer-interaction').length, 0);
});

test('pending school accepts a full institute name or acronym without interpreting unrelated responses as a school', () => {
  let state = planState(); state.profile.school = '';
  const pending = runDemo(request(state, 'find_professors', '')).state;
  for (const message of ['Massachusetts Institute of Technology', 'MIT', 'I attend MIT']) {
    const response = runDemo(request(pending, 'chat', message));
    assert.equal(response.state.profile.school, message.startsWith('I attend') ? 'MIT' : message);
    assert.equal(response.state.stage, 'connect'); assert.equal(response.state.professors.length, 0);
  }
  for (const message of ['I do not know yet', 'Can I search later?', 'OK', 'Thanks', 'How can I improve my plan?']) {
    assert.equal(runDemo(request(pending, 'chat', message)).state.profile.school, '');
  }
  assert.equal(extractProfile(createSession().profile, 'I attend MIT').school, 'MIT');
  assert.equal(extractProfile(createSession().profile, 'AI').school, '');
});

test('browser-supplied professor sources are restored from canonical data and school changes clear the draft', () => {
  let state = runDemo(request(planState(), 'find_professors', '')).state;
  const selected = state.professors[0];
  selected.name = 'Invented Person'; selected.sources[0].url = 'https://untrusted.example/';
  state = runDemo({ ...request(state, 'draft_email', ''), professorId: selected.id }).state;
  assert.ok(state.draft); assert.doesNotMatch(state.draft.body, /Invented Person|untrusted\.example/);
  assert.match(state.draft.body, /\[Your name\]/); assert.match(state.draft.body, /\[Add one accurate sentence/);
  assert.doesNotMatch(state.draft.body, /I have Python|I read your paper/);
  state.profile.school = 'A Different University';
  const cleaned = sanitizeState(state); assert.equal(cleaned.professors.length, 0); assert.equal(cleaned.draft, null);
});

test('school changes stated in chat also clear old school matches and drafts', () => {
  let state = runDemo(request(planState(), 'find_professors', '')).state;
  state = runDemo({ ...request(state, 'draft_email', ''), professorId: state.professors[0].id }).state;
  const result = runDemo(request(state, 'chat', 'I attend University of Wisconsin Madison'));
  assert.equal(result.state.profile.school, 'University of Wisconsin Madison');
  assert.equal(result.state.professors.length, 0); assert.equal(result.state.draft, null);
});

test('request schema rejects bad IDs, invalid hours and oversized messages', () => {
  assert.throws(() => parseAgentRequest({ ...request(), directionId: 'invented-direction' }), /Unknown research direction/);
  const invalid = request(); invalid.state.profile.hoursPerWeek = -1;
  assert.throws(() => parseAgentRequest(invalid), /hoursPerWeek/);
  assert.throws(() => parseAgentRequest({ ...request(), message: 'a'.repeat(8001) }), /message/);
  assert.throws(() => parseAgentRequest({ ...request(), professorId: 'invented-professor' }), /Unknown or expired/);
});

test('different direction gives another group and expired browser professor data can recover', () => {
  const initial = runDemo(request()).state;
  const other = runDemo(request(initial, 'chat', 'I want a different direction')).state;
  assert.ok(other.directions.length >= 2);
  assert.ok(other.directions.every(item => !initial.directions.some(previous => previous.id === item.id)));
  let state = runDemo(request(planState(), 'find_professors', '')).state;
  const stale = structuredClone(state.professors[0]); stale.id = 'web-expired-profile';
  state.professors = [stale]; state.selectedProfessorId = stale.id;
  state.draft = { professorId: stale.id, subject: 'old draft', body: 'old body', checklist: [] };
  const parsed = parseAgentRequest(request(state, 'find_professors', ''));
  const recovered = runDemo(parsed).state;
  assert.ok(recovered.professors.length); assert.equal(recovered.draft, null);
  assert.equal(recovered.profile.school, school); assert.deepEqual(recovered.tasks, state.tasks);
});

test('Live mode explicitly fails without a server key', async () => {
  await assert.rejects(runLive({ ...request(), mode: 'live' }, { apiKey: '' }), (error: unknown) => error instanceof AgentError && error.status === 503 && error.code === 'LIVE_NOT_CONFIGURED');
});

test('Responses loop executes real tools, retains reasoning items, and applies grounded state', async () => {
  const payloads: Record<string, any>[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); payloads.push(body);
    const output = payloads.length === 1 ? [
      { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'test-reasoning' },
      { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'search_research_directions', arguments: JSON.stringify({ query: 'biology genetics' }) },
    ] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ action: 'recommend', directionId: null, professorId: null, reply: 'Which biological question would you enjoy exploring?' }) }] }];
    return new Response(JSON.stringify({ status: 'completed', output }), { status: 200 });
  }) as typeof fetch;
  const result = await runLive({ ...request(createSession(), 'chat', 'I am interested in genetics and biology'), mode: 'live' }, { apiKey: 'test-not-real', fetchImpl });
  assert.equal(payloads.length, 2); assert.equal(result.mode, 'live'); assert.equal(result.state.directions[0].id, 'bioinformatics');
  assert.ok(payloads[1].input.some((item: any) => item.type === 'reasoning' && item.id === 'rs_1'));
  const toolOutput = payloads[1].input.find((item: any) => item.type === 'function_call_output');
  assert.equal(toolOutput.call_id, 'call_1'); assert.match(toolOutput.output, /Bioinformatics/);
  assert.equal(payloads[0].text.format.type, 'json_schema'); assert.equal(payloads[0].store, false);
  assert.ok(result.toolActivity.some(item => item.includes('search_research_directions')));
});

test('ungrounded live professor IDs and upstream errors cannot masquerade as success', async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ action: 'draft_email', directionId: null, professorId: 'made-up-person', reply: '' }) }] }] }), { status: 200 })) as typeof fetch;
  await assert.rejects(runLive({ ...request(), mode: 'live' }, { apiKey: 'test-key', fetchImpl }), /unverified professor/);
  const failingFetch = (async () => new Response('secret error details with test-key', { status: 401 })) as typeof fetch;
  await assert.rejects(runLive({ ...request(), mode: 'live' }, { apiKey: 'test-key', fetchImpl: failingFetch }), (error: unknown) => error instanceof AgentError && error.status === 502 && !error.message.includes('test-key'));
});

test('HTTP health, demo workflow, malformed JSON and origin protection', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    let response = await fetch(`${base}/api/health`); const health = await response.json() as any;
    assert.equal(health.ok, true); assert.equal(health.facultyCount, professors.length);
    response = await fetch(`${base}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request()) });
    assert.equal(response.status, 200); const output = await response.json() as any; assert.equal(output.state.directions.length, 3);
    response = await fetch(`${base}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' }, body: JSON.stringify(request()) });
    assert.equal(response.status, 403);
    response = await fetch(`${base}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(response.status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
