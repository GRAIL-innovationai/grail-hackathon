import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app';
import { createSession } from '../shared/types';
import { requestAgent } from '../src/agent-client';

test('browser HTTP stream runs the research tools and returns only committed state', async () => {
  const oldUrl = process.env.OPENCLAW_BASE_URL, oldToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  let count = 0, fail = false;
  const gateway = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    assert.ok(payload.tools.some((t: { name: string }) => t.name === 'save_plan'));
    assert.equal(req.headers.authorization, 'Bearer test-only');
    if (fail) { res.writeHead(503); res.end('private upstream diagnostic'); return; }
    count++;
    const calls = [
      { name: 'get_learning_resources', arguments: { directionId: 'learning-analytics' } },
      { name: 'save_plan', arguments: { directionId: 'learning-analytics', tasks: [{ id: null, title: 'Model authored custom activity', description: 'Compare four observations on paper.', minutes: 25, output: 'One table', resourceUrl: null }] } },
      { name: 'complete_research_step', arguments: { reply: 'Your custom plan is ready.', suggestions: [], needsInput: false } },
    ];
    const call = calls[count - 1];
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'completed', output: [{ type: 'function_call', call_id: `c${count}`, name: call.name, arguments: JSON.stringify(call.arguments) }] }));
  });
  gateway.listen(0, '127.0.0.1');
  const server = app.listen(0, '127.0.0.1');
  await Promise.all([new Promise<void>(r => gateway.once('listening', r)), new Promise<void>(r => server.once('listening', r))]);
  const gw = gateway.address(), addr = server.address();
  assert.ok(gw && typeof gw === 'object' && addr && typeof addr === 'object');
  process.env.OPENCLAW_BASE_URL = `http://127.0.0.1:${gw.port}`; process.env.OPENCLAW_GATEWAY_TOKEN = 'test-only';
  const base = `http://127.0.0.1:${addr.port}`;
  const request = { mode: 'openclaw', action: 'create_plan', message: 'Make a paper exercise.', state: createSession() };
  try {
    const response = await fetch(`${base}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify(request) });
    assert.match(response.headers.get('content-type')!, /ndjson/);
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.filter(e => e.type === 'tool').map(e => e.name), ['get_learning_resources', 'save_plan', 'complete_research_step']);
    const result = events.at(-1).result;
    assert.equal(result.state.tasks.length, 1); assert.equal(result.state.tasks[0].title, 'Model authored custom activity'); assert.equal(result.mode, 'openclaw');
    fail = true;
    const failed = await fetch(`${base}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ ...request, state: result.state }) });
    const errorText = await failed.text();
    assert.match(errorText, /"type":"error"/); assert.doesNotMatch(errorText, /"type":"result"|test-only|private upstream diagnostic/);
  } finally {
    if (oldUrl === undefined) delete process.env.OPENCLAW_BASE_URL; else process.env.OPENCLAW_BASE_URL = oldUrl;
    if (oldToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN; else process.env.OPENCLAW_GATEWAY_TOKEN = oldToken;
    await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => gateway.close(() => r()))]);
  }
});

test('browser stream handles split Unicode chunks and refuses a truncated result', async () => {
  const originalFetch = globalThis.fetch;
  const state = createSession();
  const result = { state, reply: '你好，计划已保存', mode: 'openclaw', toolActivity: [], suggestions: [] };
  const encode = new TextEncoder();
  const received: string[] = [];
  function stream(text: string) {
    const bytes = encode.encode(text);
    return new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    } }), { headers: { 'content-type': 'application/x-ndjson' } });
  }
  try {
    globalThis.fetch = async () => stream(`${JSON.stringify({ type: 'tool', name: 'save_plan', ok: true })}\n${JSON.stringify({ type: 'result', result })}\n`);
    const reply = await requestAgent({ state, action: 'chat', message: 'hi', mode: 'openclaw' }, new AbortController().signal, text => received.push(text));
    assert.equal(reply.reply, result.reply); assert.deepEqual(received, ['Prepared your research plan']);
    globalThis.fetch = async () => stream('{"type":"tool","name":"save_plan","ok":true}\n');
    await assert.rejects(requestAgent({ state, action: 'chat', message: 'hi', mode: 'openclaw' }, new AbortController().signal, () => {}), /before the agent finished/);
  } finally { globalThis.fetch = originalFetch; }
});
