import { directionCard } from '../helpers/direction.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createSession } from '../../shared/types.ts';
import { runOpenClaw } from '../../server/openclaw.ts';
import { makeConfig, AGENT_ID } from '../../scripts/openclaw-setup.mjs';
import toolNames from '../../shared/research-tool-names.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(root, 'openclaw/runtime/node_modules/openclaw/openclaw.mjs');
const clientTools = new Set(toolNames);

async function listen(server) {
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListening);
  });
  return server.address().port;
}
async function closeServer(server) {
  server.closeAllConnections();
  await new Promise(resolveClosed => server.close(resolveClosed));
}
async function unusedPort() {
  const server = createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = new Promise(resolveExit => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exit; } finally { clearTimeout(timer); }
}

test('real isolated OpenClaw gateway executes the client-tool loop with no native tools', { timeout: 60_000 }, async t => {
  assert.ok(existsSync(cli), 'OpenClaw runtime is not installed. Run npm run openclaw:setup, then rerun this integration test. No model login is required for this test.');
  const temp = await mkdtemp(join(tmpdir(), 'research-openclaw-test-'));
  const payloads = [];
  const providerErrors = [];
  let gateway;
  let gatewayLog = '';
  let responseDiagnostic = '';
  // This deterministic provider is deliberately local and has no real credentials.
  // The gateway still exercises its real provider adapter, tool policy, agent loop,
  // response projection, and continuation parsing before our app sees a result.
  const provider = createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/v1/chat/completions');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      payloads.push(body);
      assert.equal(body.model, 'research-smoke-model');
      assert.equal(body.stream, true);
      const names = (body.tools || []).map(tool => tool.function?.name ?? tool.name);
      assert.ok(names.length > 0, 'Gateway must expose client research functions.');
      assert.ok(names.every(name => clientTools.has(name)), `Unexpected native tools reached the provider: ${names.filter(name => !clientTools.has(name)).join(', ')}`);
      const first = payloads.length === 1;
      const name = first ? 'search_research_directions' : payloads.length === 2 ? 'save_directions' : 'complete_research_step';
      assert.ok(names.includes(name), `${name} must be available in this turn.`);
      if (!first) assert.match(JSON.stringify(body.messages), /Bioinformatics/, 'Real catalog results must reach the provider in the follow-up.');
      const args = first ? { query: 'biology genetics' } : payloads.length === 2 ? { mode: 'replace', options: [
        { ...directionCard('Bioinformatics: compare two measurements'), directionId: 'bioinformatics', catalogDirectionId: 'bioinformatics', reason: 'Connect your genetics interest to biological data.' },
        { ...directionCard('Investigating a small memory question'), directionId: 'neuroscience', catalogDirectionId: 'neuroscience', reason: 'Compare a question about biological memory.' },
      ] } : {
        needsInput: false, suggestions: [],
        nextStep: { title: 'Compare your research questions', description: 'Choose the question you would like to try.', stage: 'explore', prompt: null },
        reply: 'Bioinformatics is one way to explore your interest in genetics. Start by comparing a small biological question with the other research options.',
      };
      const chunk = (delta, finish_reason = null) => ({ id: `chatcmpl-smoke-${payloads.length}`, object: 'chat.completion.chunk', created: 1, model: 'research-smoke-model', choices: [{ index: 0, delta, finish_reason }] });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(chunk({ role: 'assistant', tool_calls: [{ index: 0, id: `call_smoke_${payloads.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }))}\n\n`);
      res.write(`data: ${JSON.stringify(chunk({}, 'tool_calls'))}\n\n`);
      res.end('data: [DONE]\n\n');
    } catch (error) {
      providerErrors.push(error);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Deterministic integration provider assertion failed.' } }));
    }
  });
  t.after(async () => {
    await stopChild(gateway);
    await closeServer(provider);
    await rm(temp, { recursive: true, force: true });
  });
  const providerPort = await listen(provider);
  const gatewayPort = await unusedPort();
  const config = makeConfig(temp, 'research-smoke/research-smoke-model');
  config.gateway.port = gatewayPort;
  config.update = { checkOnStart: false, auto: { enabled: false } };
  config.telemetry = { enabled: false };
  config.logging = { file: join(temp, 'gateway.log') };
  config.models = { mode: 'replace', providers: { 'research-smoke': {
    baseUrl: `http://127.0.0.1:${providerPort}/v1`, apiKey: 'integration-fake-key', api: 'openai-completions',
    models: [{ id: 'research-smoke-model', name: 'Deterministic local integration test', reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  } } };
  const stateDir = join(temp, '.openclaw-local');
  const configPath = join(stateDir, 'openclaw.json');
  await mkdir(config.agents.defaults.workspace, { recursive: true, mode: 0o700 });
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  const gatewayToken = 'integration-gateway-token';
  gateway = spawn(process.execPath, [cli, 'gateway', 'run'], {
    cwd: config.agents.defaults.workspace,
    env: {
      PATH: process.env.PATH,
      HOME: temp,
      TMPDIR: temp,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
      OPENCLAW_GATEWAY_TOKEN: gatewayToken,
      OPENCLAW_NO_AUTO_UPDATE: '1',
      OPENCLAW_SKIP_CANVAS_HOST: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  gateway.stdout.on('data', chunk => { gatewayLog = (gatewayLog + chunk).slice(-8000); });
  gateway.stderr.on('data', chunk => { gatewayLog = (gatewayLog + chunk).slice(-8000); });
  let launchError;
  gateway.once('error', error => { launchError = error; });
  const baseUrl = `http://127.0.0.1:${gatewayPort}`;
  const deadline = Date.now() + 35_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    assert.equal(gateway.exitCode, null, `Gateway exited before startup:\n${gatewayLog}`);
    try {
      const response = await fetch(`${baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${gatewayToken}`, 'x-openclaw-agent-id': AGENT_ID }, signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* The process is still binding its localhost listener. */ }
    await delay(200);
  }
  assert.ok(ready, `Isolated gateway did not start:\n${gatewayLog}`);
  try {
    const result = await runOpenClaw({ state: createSession(), action: 'chat', message: 'I am interested in biology and genetics', mode: 'openclaw' }, { baseUrl, gatewayToken, agentId: AGENT_ID, timeoutMs: 15_000, fetchImpl: async (...args) => {
      const response = await fetch(...args);
      if (!response.ok) responseDiagnostic = `${response.status} ${await response.clone().text()}`;
      return response;
    } });
    assert.equal(providerErrors.length, 0, providerErrors[0]?.message);
    assert.equal(payloads.length, 3, 'Retrieve evidence, save model-authored directions, then finish via the real gateway.');
    assert.equal(result.mode, 'openclaw');
    assert.equal(result.state.directions[0].id, 'bioinformatics');
    assert.equal(result.state.profile.school, '');
    assert.match(result.reply, /interest in genetics/);
    assert.ok(result.toolActivity.some(item => item.includes('search_research_directions')));
  } catch (error) {
    if (providerErrors.length) throw providerErrors[0];
    throw new Error(`${error.message}\nIsolated gateway response: ${responseDiagnostic}\nIsolated gateway diagnostic:\n${gatewayLog}`, { cause: error });
  }
});
