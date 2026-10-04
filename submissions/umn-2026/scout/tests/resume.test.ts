import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { readResumePdf } from '../server/resume';

import { pdf } from './helpers/pdf';

test('PDF resume extracts actual page text and rejects unreadable or oversized inputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'research-resume-'));
  try {
    const path = join(dir, 'resume.pdf');
    await writeFile(path, pdf('I completed an introductory statistics course.'));
    const result = await readResumePdf(path);
    assert.equal(result.pages, 1); assert.match(result.text, /introductory statistics/);
    await writeFile(path, pdf('')); await assert.rejects(readResumePdf(path), /no readable text/);
    await writeFile(path, 'not a pdf'); await assert.rejects(readResumePdf(path), /valid PDF header/);
    await writeFile(path, Buffer.alloc(5 * 1024 * 1024 + 1)); await assert.rejects(readResumePdf(path), /5 MB/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI PDF import waits for confirmation, discards a declined preview, and persists an accepted one', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'research-resume-cli-'));
  const resume = join(dir, 'resume.pdf'); const session = join(dir, 'session.json');
  await writeFile(resume, pdf('I know basic Python.'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/research-agent.ts', '--session', session], { cwd: resolve('.'), stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  async function until(text: string) {
    const end = Date.now() + 8000;
    while (!output.includes(text)) { if (Date.now() > end || child.exitCode !== null) throw new Error(`CLI did not reach ${text}: ${output}`); await new Promise(r => setTimeout(r, 20)); }
  }
  try {
    await until('You:'); output = ''; child.stdin.write(`/resume ${resume}\n`);
    await until('Type yes'); await assert.rejects(readFile(session), (e: any) => e.code === 'ENOENT');
    output = ''; child.stdin.write('no\n'); await until('preview discarded');
    await assert.rejects(readFile(session), (e: any) => e.code === 'ENOENT');
    output = ''; child.stdin.write(`/resume ${resume}\n`); await until('Type yes');
    output = ''; child.stdin.write('yes\n'); await until('Confirmed PDF text saved locally');
    const saved = JSON.parse(await readFile(session, 'utf8'));
    assert.match(saved.profile.experience, /I know basic Python/); assert.equal(saved.messages.length, 0);
    const exit = new Promise(resolveExit => child.once('exit', resolveExit)); child.stdin.write('/quit\n'); await exit;
    assert.equal(child.exitCode, 0);
  } finally { if (child.exitCode === null) child.kill(); await rm(dir, { recursive: true, force: true }); }
});
