import { createInterface } from 'node:readline/promises';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createSession, type SessionState } from '../shared/types';
import { parseAgentRequest } from '../server/validation';
import { runOpenClaw } from '../server/openclaw';
import { readResumePdf } from '../server/resume';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: [resolve(root, '.env'), resolve(root, '.env.openclaw')], quiet: true });
// This entrypoint always uses the local subscription gateway, never direct API billing.
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Research Matchmaker agent\n\nnpm run agent\nnpm run agent -- --message "I want to explore research"\nnpm run agent -- --session /path/to/session.json\n\nCommands: /state /profile /resume /absolute/path/resume.pdf /reset /quit\nPDF text is shown for confirmation before saving. Session is saved locally after each successful turn. Sign in first with npm run openclaw:login, then keep npm run openclaw:start running.');
  process.exit(0);
}
function option(name: string) { const i = args.indexOf(name); if (i < 0) return undefined; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${name}`); return args[i + 1]; }
const sessionPath = resolve(option('--session') || resolve(root, '.research-agent/session.json'));
let state: SessionState;
try {
  const loaded = JSON.parse(await readFile(sessionPath, 'utf8'));
  state = parseAgentRequest({ mode: 'openclaw', action: 'chat', message: 'Validate saved session', state: loaded }).state;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Saved session is invalid or unreadable. Use --session with a different path; the existing file was not overwritten.');
  state = createSession();
}
async function save(next: SessionState) {
  await mkdir(dirname(sessionPath), { recursive: true, mode: 0o700 });
  const temporary = `${sessionPath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600, flag: 'wx' });
  await rename(temporary, sessionPath);
}
async function chat(message: string) {
  const next = structuredClone(state);
  next.messages = [...next.messages.slice(-88), { id: crypto.randomUUID(), role: 'user', content: message, createdAt: new Date().toISOString() }];
  const response = await runOpenClaw({ state: next, message, action: 'chat', mode: 'openclaw' }, {
    onToolEvent: event => console.log(`  ${event.ok ? '✓' : '↻'} ${event.name}${event.error ? `: ${event.error}` : ''}`),
  });
  response.state.messages.push({ id: crypto.randomUUID(), role: 'assistant', content: response.reply, createdAt: new Date().toISOString() });
  await save(response.state); state = response.state;
  console.log(`\n${response.reply}\n`);
  console.log(`Tools: ${response.toolActivity.join(' → ')}\n`);
  if (state.tasks.length) console.log(state.tasks.map(t => `${t.completed ? '[x]' : '[ ]'} ${t.title} (${t.minutes} min)\n    ${t.description}\n    Output: ${t.output}`).join('\n'));
  if (state.draft) console.log(`\nDraft — ${state.draft.subject}\n${state.draft.body}\n`);
}
const message = option('--message');
if (message) {
  try { await chat(message); } catch (error) { console.error(error instanceof Error ? error.message : 'Agent failed.'); process.exitCode = 1; }
} else {
  console.log('Research Matchmaker · ChatGPT subscription via OpenClaw\n/state /profile /resume /absolute/path/resume.pdf /reset /quit · Changes are saved locally after each successful turn.');
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const line = (await terminal.question('\nYou: ')).trim();
      if (line === '/quit') break;
      if (line === '/state') { console.log(JSON.stringify(state, null, 2)); continue; }
      if (line === '/profile') { console.log(JSON.stringify(state.profile, null, 2)); continue; }
      if (line.startsWith('/resume ')) {
        try {
          const path = line.slice(8).trim().replace(/^(["'])(.*)\1$/, '$2');
          const pdf = await readResumePdf(resolve(path));
          console.log(`\nPDF preview (${pdf.pages} pages, ${pdf.text.length} characters):\n${pdf.text}\n`);
          const answer = await terminal.question('Check the text and personal details. Add this to your background? Type yes (it will be included in future model requests): ');
          if (answer.trim() === 'yes') {
            const experience = [state.profile.experience, pdf.text].filter(Boolean).join('\n\n');
            if (experience.length > 16000) throw new Error('Combined background exceeds 16,000 characters. Use a shorter PDF; existing background was retained.');
            const next = structuredClone(state); next.profile.experience = experience;
            // The full PDF stays on disk. Only user-confirmed extracted text joins this session.
            next.profileEvidence = (next.profileEvidence || []).filter(item => item.field !== 'experience');
            await save(next); state = next; console.log('Confirmed PDF text saved locally. Ask the agent to use your background when you are ready.');
          } else console.log('PDF preview discarded; your saved background is unchanged.');
        } catch (error) { console.error(error instanceof Error ? error.message : 'Could not read the PDF; existing session retained.'); }
        continue;
      }
      if (line === '/reset') { if ((await terminal.question('Clear this saved session? Type yes: ')).trim() === 'yes') { const fresh = createSession(); await save(fresh); state = fresh; } continue; }
      if (!line) continue;
      try { await chat(line); } catch (error) { console.error(error instanceof Error ? error.message : 'Agent failed; existing session retained.'); }
    }
  } finally { terminal.close(); }
}
