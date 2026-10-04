import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { createLocalSetup } from '../scripts/openclaw-setup.mjs';
import clientTools from '../shared/research-tool-names.json' with { type: 'json' };

test('isolated setup protects credentials and preserves edits and the token on rerun', async () => {
  const root = await mkdtemp(join(tmpdir(), 'matchmaker-setup-'));
  try {
    const first = await createLocalSetup(root);
    const env = parse(await readFile(first.envPath, 'utf8'));
    assert.equal(env.OPENCLAW_BASE_URL, 'http://127.0.0.1:18789');
    assert.equal(env.OPENCLAW_AGENT_ID, 'research-matchmaker');
    assert.match(env.OPENCLAW_GATEWAY_TOKEN, /^[a-f0-9]{64}$/);
    assert.equal((await stat(first.envPath)).mode & 0o777, 0o600);
    const config = JSON.parse(await readFile(first.configPath, 'utf8'));
    assert.equal(config.gateway.bind, 'loopback');
    assert.equal(config.gateway.auth.token, '${OPENCLAW_GATEWAY_TOKEN}');
    assert.equal(config.gateway.http.endpoints.responses.enabled, true);
    assert.equal(config.agents.defaults.models['openai/gpt-6-astra'].agentRuntime.id, 'openclaw');
    assert.equal(config.plugins.entries.codex.enabled, false);
    assert.deepEqual(config.tools.allow, clientTools);
    config.tools.allow = ['search_research_directions', 'get_learning_resources', 'find_faculty', 'complete_research_step'];
    config.gateway.port = 18795;
    await writeFile(first.configPath, JSON.stringify(config));
    const second = await createLocalSetup(root);
    const rerun = parse(await readFile(second.envPath, 'utf8'));
    assert.equal(second.created, false);
    assert.deepEqual(JSON.parse(await readFile(second.configPath, 'utf8')).tools.allow, clientTools);
    assert.equal(rerun.OPENCLAW_GATEWAY_TOKEN, env.OPENCLAW_GATEWAY_TOKEN);
    assert.equal(rerun.OPENCLAW_BASE_URL, 'http://127.0.0.1:18795');
    const v2 = JSON.parse(await readFile(first.configPath, 'utf8'));
    v2.tools.allow = clientTools.filter(name => !['search_faculty_web', 'read_faculty_page', 'save_web_faculty'].includes(name));
    await writeFile(first.configPath, JSON.stringify(v2));
    await createLocalSetup(root);
    assert.deepEqual(JSON.parse(await readFile(first.configPath, 'utf8')).tools.allow, clientTools);
    v2.tools.allow = ['custom_tool'];
    await writeFile(first.configPath, JSON.stringify(v2));
    await createLocalSetup(root);
    assert.deepEqual(JSON.parse(await readFile(first.configPath, 'utf8')).tools.allow, ['custom_tool']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
