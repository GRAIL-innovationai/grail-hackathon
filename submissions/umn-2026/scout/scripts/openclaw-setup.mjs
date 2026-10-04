import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'dotenv';
import clientTools from '../shared/research-tool-names.json' with { type: 'json' };

export const DEFAULT_MODEL = 'openai/gpt-6-astra';
export const AGENT_ID = 'research-matchmaker';
const legacyTools = ['search_research_directions', 'get_learning_resources', 'find_faculty', 'complete_research_step'];

export function makeConfig(root, model = DEFAULT_MODEL) {
  const workspace = join(root, '.openclaw-local', 'workspace');
  return {
    gateway: {
      mode: 'local', bind: 'loopback', port: 18789,
      auth: { mode: 'token', token: '${OPENCLAW_GATEWAY_TOKEN}' },
      http: { endpoints: { responses: { enabled: true } } },
      controlUi: { enabled: false },
      tailscale: { mode: 'off' },
    },
    agents: {
      defaults: {
        workspace, skipBootstrap: true,
        model: { primary: model },
        models: { [model]: { agentRuntime: { id: 'openclaw' } } },
        heartbeat: { every: '0m' }, skills: [],
      },
      entries: { [AGENT_ID]: { name: 'Research Matchmaker', workspace } },
    },
    tools: { allow: clientTools, codeMode: false, toolSearch: false, elevated: { enabled: false } },
    plugins: { allow: ['openai'], slots: { memory: 'none' }, entries: { codex: { enabled: false } } },
    discovery: { mdns: { mode: 'off' } },
    cron: { enabled: false },
  };
}

async function readOptional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Only creates project-owned files. Reruns preserve the gateway config and token.
export async function createLocalSetup(root) {
  const stateDir = join(root, '.openclaw-local');
  const configPath = join(stateDir, 'openclaw.json');
  const envPath = join(root, '.env.openclaw');
  await mkdir(join(stateDir, 'workspace'), { recursive: true, mode: 0o700 });
  await chmod(stateDir, 0o700);
  const oldConfig = await readOptional(configPath);
  const config = oldConfig ? JSON.parse(oldConfig) : makeConfig(root);
  // Migrate only the exact project-owned v1 allowlist, retaining all account/model settings.
  if (oldConfig && (JSON.stringify(config.tools?.allow) === JSON.stringify(legacyTools) || JSON.stringify(config.tools?.allow) === JSON.stringify(clientTools.filter(name => !['search_faculty_web', 'read_faculty_page', 'save_web_faculty'].includes(name))))) {
    config.tools.allow = clientTools;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }
  if (!oldConfig) await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await chmod(configPath, 0o600);
  const port = config.gateway?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || config.gateway.bind !== 'loopback') {
    throw new Error('The project gateway must use a valid local port and loopback binding. Check .openclaw-local/openclaw.json.');
  }
  const existingEnv = parse(await readOptional(envPath) || '');
  const token = existingEnv.OPENCLAW_GATEWAY_TOKEN || randomBytes(32).toString('hex');
  const generated = {
    ...existingEnv,
    OPENCLAW_BASE_URL: `http://127.0.0.1:${port}`,
    OPENCLAW_GATEWAY_TOKEN: token,
    OPENCLAW_AGENT_ID: AGENT_ID,
  };
  await writeFile(envPath, `# Project-local OpenClaw connection. Keep this file private.\n${Object.entries(generated).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n')}\n`, { mode: 0o600 });
  await chmod(envPath, 0o600);
  return { configPath, stateDir, envPath, created: !oldConfig };
}
