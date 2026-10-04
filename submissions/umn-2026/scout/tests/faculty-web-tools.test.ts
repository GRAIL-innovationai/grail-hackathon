import test from 'node:test';
import assert from 'node:assert/strict';
import { FacultyWebTools, publicFacultyUrl } from '../server/faculty-web-tools';
import { ResearchTurn } from '../server/research-agent';
import { createSession } from '../shared/types';
import { getVerifiedWebProfessor } from '../server/web-faculty';
import { parseAgentRequest } from '../server/validation';
const url = 'https://example.edu/faculty/ava';
const text = 'Ava Example is a Professor at Example University in Computer Science. She studies interfaces that support learning and accessibility.';
const row = { name: 'Ava Example', title: 'Professor', university: 'Example University', department: 'Computer Science', research: 'She studies interfaces that support learning and accessibility.', sourceUrl: url, nameEvidence: 'Ava Example', affiliationEvidence: 'Professor at Example University', researchEvidence: 'She studies interfaces that support learning and accessibility.', officialFacultyPage: true };
function client() {
  const calls: Array<{ url: string; body: any; headers: any }> = [];
  const fetchImpl = (async (target: any, init: any) => {
    calls.push({ url: String(target), body: JSON.parse(init.body), headers: init.headers });
    return Response.json({ success: true, data: String(target).endsWith('search') ? { web: [{ url, title: 'Faculty', description: 'Ava Example' }] } : { markdown: text, metadata: { title: 'Ava Example faculty', sourceURL: url, statusCode: 200 } } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
async function loaded() { const c = client(); const web = new FacultyWebTools(c.fetchImpl); await web.search('Example University', 'learning'); await web.read(url); return { web, ...c }; }
test('keyless search/read/save requires actual page evidence and restores canonical profiles', async () => {
  const { web, calls } = await loaded();
  const p = web.save(row, 'Example University');
  assert.equal(p.verification, 'web_sourced'); assert.equal(p.availability, 'unknown');
  assert.deepEqual(getVerifiedWebProfessor(p.id), p);
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.deepEqual(Object.keys(calls[0].body), ['query', 'limit']);
  assert.equal(p.sources[0].url, url);
});
test('snippets, fabricated quotes, changed universities and private URLs cannot create cards', async () => {
  const c = client(); const web = new FacultyWebTools(c.fetchImpl);
  await web.search('Example University', 'learning');
  assert.throws(() => web.save(row, 'Example University'), /Read the actual/);
  await assert.rejects(web.read('https://unseen.edu/faculty'), /returned by search/);
  await web.read(url);
  assert.throws(() => web.save({ ...row, researchEvidence: 'Invented research with no supporting source.' }, 'Example University'), /evidence quote/);
  assert.throws(() => web.save(row, 'Other University'), /confirmed university/);
  for (const value of ['http://example.edu', 'https://127.0.0.1/x', 'https://[::1]/', 'https://user:pass@example.edu/', 'https://internal.local/', 'https://2130706433/']) assert.throws(() => publicFacultyUrl(value));
});
test('web professors work through personalization, completion, validation and email drafting', async () => {
  const c = client(); const state = createSession(); state.profile.school = 'Example University';
  const request = { mode: 'openclaw' as const, action: 'find_professors' as const, message: 'Find faculty online', state };
  const turn = new ResearchTurn(request, c.fetchImpl);
  await turn.executeAsync('search_faculty_web', { school: state.profile.school, topic: 'learning' });
  await turn.executeAsync('read_faculty_page', { url });
  const saved: any = turn.execute('save_web_faculty', row); assert.equal(saved.ok, true);
  const p = saved.professor;
  const result: any = turn.execute('inspect_professor', { name: p.id, guidance: { fit: 'Explore learning interfaces.', question: 'How are learning interfaces evaluated?', experience: '', preparation: 'Read the cited research page.', studentEvidence: [], sourceEvidence: row.research } });
  assert.equal(result.ok, undefined); assert.equal(result.professors.length, 1);
  const complete = turn.finish({ reply: 'I saved the faculty profile.', suggestions: [], needsInput: false });
  const restored = parseAgentRequest({ ...request, state: complete.state });
  assert.equal(restored.state.professors[0].name, row.name);
  const email: any = turn.execute('save_email_draft', { professorId: p.id, subject: 'Research question', body: 'I would like to ask about your learning-interface research.', studentClaims: [], checklist: [] });
  assert.equal(email.ok, true); assert.equal(turn.state.draft?.professorId, p.id);
});
test('missing school, private query, cancellation and provider failure do not create profiles', async () => {
  const c = client(); const state = createSession(); const turn = new ResearchTurn({ mode: 'openclaw', action: 'chat', message: 'Find faculty', state }, c.fetchImpl);
  assert.equal((await turn.executeAsync('search_faculty_web', { school: 'Example University', topic: 'learning' }) as any).ok, false); assert.equal(c.calls.length, 0);
  turn.state.profile.school = 'Example University';
  assert.equal((await turn.executeAsync('search_faculty_web', { school: 'Example University', topic: 'student@example.com' }) as any).ok, false);
  const failed = new FacultyWebTools((async () => new Response('', { status: 429 })) as typeof fetch);
  await assert.rejects(failed.search('Example University', 'learning'), /rate limited/);
  const aborted = new FacultyWebTools((async (_url, init) => { init?.signal?.throwIfAborted(); return Response.json({}); }) as typeof fetch);
  await assert.rejects(aborted.search('Example University', 'learning', AbortSignal.abort()));
  assert.equal(turn.state.professors.length, 0);
});

test('gateway adapter awaits web tools and returns a saved card only after completion', async () => {
  const { runOpenClaw } = await import('../server/openclaw');
  const c = client(); const state = createSession(); state.profile.school = 'Example University';
  const responses = [
    ['search_faculty_web', { school: 'Example University', topic: 'learning interfaces' }],
    ['read_faculty_page', { url }],
    ['save_web_faculty', row],
    ['inspect_professor', { name: row.name, guidance: { fit: 'Explore learning interfaces.', question: 'How are interfaces evaluated?', experience: '', preparation: 'Read the source page.', studentEvidence: [], sourceEvidence: row.research } }],
    ['complete_research_step', { reply: 'I saved the profile with its source.', suggestions: [], needsInput: false, nextStep: null }],
  ];
  let step = 0; const payloads: any[] = [];
  const result = await runOpenClaw({ mode: 'openclaw', action: 'find_professors', state, message: 'Find faculty online' }, {
    gatewayToken: 'test-only-token', webFetchImpl: c.fetchImpl,
    fetchImpl: (async (_url, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      const [name, args] = responses[step++];
      return Response.json({ status: 'completed', id: `response-${step}`, output: [{ type: 'function_call', call_id: `call-${step}`, name, arguments: JSON.stringify(args) }] });
    }) as typeof fetch,
  });
  assert.equal(c.calls.length, 2);
  assert.match(JSON.stringify(payloads[2]), /interfaces that support learning/);
  assert.equal(result.state.professors[0].verification, 'web_sourced');
  assert.ok(result.state.professors[0].guidance);
  assert.equal(result.state.professors[0].sources[0].url, url);
});

test('a web-sourced version of a catalog professor satisfies the visible-name completion check', async () => {
  const { professors } = await import('../server/catalog');
  const { registerWebProfessor } = await import('../server/web-faculty');
  const original = professors[0];
  const web = { ...structuredClone(original), id: 'web-completion-regression', verification: 'web_sourced' as const };
  registerWebProfessor(web, original.university);
  const state = createSession(); state.profile.school = original.university; state.professors = [web];
  const turn = new ResearchTurn({ mode: 'openclaw', action: 'chat', message: 'Summarize the saved profile', state });
  assert.doesNotThrow(() => turn.finish({ reply: `The saved profile is ${original.name}.`, suggestions: [], needsInput: false, nextStep: null }));
});
