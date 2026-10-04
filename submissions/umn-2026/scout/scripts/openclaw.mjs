import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createLocalSetup } from './openclaw-setup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = join(root, 'openclaw/runtime');
const cli = join(runtime, 'node_modules/openclaw/openclaw.mjs');
const stateDir = join(root, '.openclaw-local');
const configPath = join(stateDir, 'openclaw.json');

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
  });
}

try {
  const command = process.argv[2] || 'help';
  if (command === 'help') {
    console.log('Research Matchmaker · OpenClaw\n\nnpm run openclaw:setup   Install and configure an isolated local gateway\nnpm run openclaw:login   Sign in with your ChatGPT account\nnpm run openclaw:start   Start the gateway (keep this terminal open)\nnpm run openclaw -- …    Run other OpenClaw CLI commands in this project');
    process.exit(0);
  }
  if (command === 'setup') {
    if (!existsSync(cli)) {
      const exitCode = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--prefix', runtime, '--no-audit', '--no-fund'], { cwd: root });
      if (exitCode) process.exit(exitCode);
    }
    const result = await createLocalSetup(root);
    console.log(result.created ? 'Created the isolated research gateway.' : 'Kept the existing gateway configuration and token.');
  }
  if (!existsSync(cli) || !existsSync(configPath)) throw new Error('Run npm run openclaw:setup first.');
  loadEnv({ path: [join(root, '.env'), join(root, '.env.openclaw')], quiet: true });
  const env = { ...process.env, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath };
  // This project uses an explicit subscription login; do not accidentally select ambient API billing.
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  const args = command === 'setup' ? ['config', 'validate']
    : command === 'start' ? ['gateway', 'run']
    : command === 'login' ? ['models', 'auth', 'login', '--provider', 'openai', '--method', 'oauth', '--agent', 'research-matchmaker', ...process.argv.slice(3)]
    : process.argv.slice(2);
  const code = await run(process.execPath, [cli, ...args], { cwd: join(stateDir, 'workspace'), env });
  if (!code && command === 'setup') {
    console.log('\nReady for account sign-in: npm run openclaw:login\nThen start the gateway: npm run openclaw:start\nIn another terminal start the research agent: npm run agent');
  }
  process.exitCode = code;
} catch (error) {
  // No raw gateway/provider responses or environment values are printed here.
  console.error(error instanceof Error ? error.message : 'OpenClaw setup failed.');
  process.exitCode = 1;
}
