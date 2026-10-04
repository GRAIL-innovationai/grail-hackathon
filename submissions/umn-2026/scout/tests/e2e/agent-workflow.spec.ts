import { facultyGuidance } from '../helpers/faculty';
import { test, expect, type Page } from '@playwright/test';
import { runOpenClaw } from '../../server/openclaw';
import { createSession } from '../../shared/types';
import { pdf } from '../helpers/pdf';

async function navigate(page: Page, name: RegExp) {
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name }).click();
}

test('agent-authored plan, progress, profile edits, revision and email survive the website round trip', async ({ page }) => {
  await page.route('**/api/health', r => r.fulfill({ json: { ok: true, liveAvailable: false, facultyCount: 8, openclaw: { configured: true } } }));
  let turn = 0;
  await page.route('**/api/agent', async route => {
    turn++;
    const req = route.request().postDataJSON();
    expect(req.mode).toBe('openclaw');
    expect(route.request().headers().accept).toBe('application/x-ndjson');
    let serial = 0;
    const call = (name: string, args: unknown) => ({ type: 'function_call', name, call_id: `call-${++serial}`, arguments: JSON.stringify(args) });
    const finish = (reply: string) => call('complete_research_step', { reply, suggestions: [], needsInput: false });
    let calls: unknown[];
    if (turn === 1) {
      calls = [call('get_learning_resources', { directionId: 'learning-analytics' }), call('save_plan', { directionId: 'learning-analytics', tasks: [
        { id: null, title: 'Sketch four learning observations', description: 'Use paper and compare measurements.', minutes: 20, output: 'Four notes', resourceUrl: null },
        { id: null, title: 'Make a Python comparison', description: 'Calculate differences.', minutes: 60, output: 'A short table', resourceUrl: null },
      ] }), finish('Your tailored plan is ready.')];
    } else if (turn === 2) {
      expect(req.action).toBe('simplify_plan');
      expect(req.state.profile.hoursPerWeek).toBe(0.5);
      expect(req.state.tasks[0].completed).toBe(true);
      const first = req.state.tasks[0];
      calls = [call('get_learning_resources', { directionId: 'learning-analytics' }), call('save_plan', { directionId: 'learning-analytics', tasks: [
        { id: first.id, title: first.title, description: first.description, minutes: first.minutes, output: first.output, resourceUrl: null },
        { id: null, title: 'Compare two values on paper', description: 'No programming needed.', minutes: 10, output: 'One observation', resourceUrl: null },
      ] }), finish('I kept your completed work and made the remaining step smaller.')];
    } else if (turn === 3) {
      expect(req.state.tasks[0].completed).toBe(true);
      // Use a real catalog professor retrieved by the agent.
      const { professors } = await import('../../server/catalog');
      const professor = professors[0];
      calls = [call('inspect_professor', { name: professor.name }), call('save_email_draft', { professorId: professor.id, subject: 'A question about your research', body: `Dear Professor ${professor.name},\n\nI would appreciate a short conversation about your research.\n\nThank you,\n[Your name]`, studentClaims: [] }), finish('Your introduction is ready for review.')];
    } else {
      expect(req.state.draft.body).toBe('My personal edited introduction.');
      calls = [finish('Your edited draft and completed work are still here.')];
    }
    const events: unknown[] = [];
    const result = await runOpenClaw(req, {
      gatewayToken: 'fixture-token',
      fetchImpl: (async () => new Response(JSON.stringify({ status: 'completed', output: [calls.shift()] }))) as typeof fetch,
      onToolEvent: event => events.push({ type: 'tool', ...event }),
    });
    await route.fulfill({ contentType: 'application/x-ndjson', body: [...events, { type: 'result', result }].map(e => JSON.stringify(e)).join('\n') + '\n' });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('Make a small learning analytics plan.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.task-card')).toHaveCount(2);
  await expect(page.locator('.task-card').first()).toContainText('Sketch four learning observations');
  await page.locator('.task-card').first().getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add background or resume' }).click();
  const profile = page.getByRole('dialog', { name: 'Your starting point' });
  await profile.getByLabel('Hours to explore per week').fill('0.5');
  await profile.getByRole('button', { name: 'Save my starting point' }).click();
  await expect(page.locator('.task-card')).toHaveCount(2);
  await expect(page.locator('.task-card').first().getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Make this smaller' }).click();
  await expect(page.getByRole('heading', { name: 'Compare two values on paper' })).toBeVisible();
  await expect(page.locator('.task-card').first().getByRole('checkbox')).toBeChecked();
  await page.reload();
  await navigate(page, /Your first steps/);
  await expect(page.getByText(/0.5 hours available per week/)).toBeVisible();
  await expect(page.locator('.task-card').first().getByRole('checkbox')).toBeChecked();
  await page.locator('.mode-badge').click();
  const settings = page.getByRole('dialog', { name: 'Your workspace settings' });
  await expect(settings.getByRole('button', { name: /^Guided demo/ })).toBeDisabled();
  await settings.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('Help me draft an introduction to a professor.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('textbox', { name: 'Email subject' })).toHaveValue('A question about your research');
  await page.getByRole('textbox', { name: 'Email body' }).fill('My personal edited introduction.');
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('What should I check before sending?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('region', { name: 'Research conversation' }).getByText('Your edited draft and completed work are still here.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email body' })).toHaveValue('My personal edited introduction.');
  expect(turn).toBe(4);
});

test('PDF preview stays local, requires confirmation, and invalid files show an error', async ({ page }) => {
  await page.goto('/');
  let calls = 0;
  await page.route('**/api/agent', r => { calls++; return r.abort(); });
  await page.getByRole('button', { name: 'Add background or resume' }).click();
  const profile = page.getByRole('dialog', { name: 'Your starting point' });
  await profile.locator('input[type=file]').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: pdf('I know basic Python.') });
  await expect(profile.getByRole('textbox', { name: 'Resume text preview' })).toHaveValue(/I know basic Python/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('research-matchmaker-v1')!).profile.experience)).toBe('');
  await profile.getByRole('button', { name: 'Use this text as experience' }).click();
  await profile.getByRole('button', { name: 'Save my starting point' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Add background or resume' }).click();
  await expect(profile.getByLabel('Experience & things you’ve tried')).toHaveValue(/I know basic Python/);
  await profile.locator('input[type=file]').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await expect(profile.getByRole('alert')).toContainText('valid PDF header');
  await expect(profile.getByRole('textbox', { name: 'Resume text preview' })).toHaveCount(0);
  expect(calls).toBe(0);
});

test('an interrupted agent stream keeps saved work and retry commits only a final result', async ({ page }) => {
  const state = createSession();
  state.tasks = [{ id: 'kept', title: 'A completed observation', description: 'Keep my work', minutes: 10, output: 'A note', completed: true, resource: null }];
  await page.addInitScript(s => localStorage.setItem('research-matchmaker-v1', JSON.stringify(s)), state);
  let count = 0;
  await page.route('**/api/agent', route => {
    const body = route.request().postDataJSON(); count++;
    expect(body.state.tasks).toEqual(state.tasks);
    expect(body.state.messages.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
    const events = count === 1 ? [{ type: 'tool', name: 'save_plan', ok: true }] : [{ type: 'result', result: { state: body.state, reply: 'Your saved work is intact.', suggestions: [], toolActivity: [], mode: 'openclaw' } }];
    return route.fulfill({ contentType: 'application/x-ndjson', body: events.map(e => JSON.stringify(e)).join('\n') + '\n' });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('What next?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('before the agent finished');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Your saved work is intact.')).toBeVisible();
  expect(count).toBe(2);
});

test('more professor recommendations append cards, clear stale filters and survive reload', async ({ page }) => {
  await page.route('**/api/health', r => r.fulfill({ json: { ok: true, liveAvailable: false, facultyCount: 8, openclaw: { configured: true } } }));
  let turn = 0;
  await page.route('**/api/agent', async route => {
    const req = route.request().postDataJSON(); turn++;
    let serial = 0;
    const call = (name: string, args: unknown) => ({ type: 'function_call', name, call_id: `c-${++serial}`, arguments: JSON.stringify(args) });
    const name = turn === 1 ? 'Konstan' : 'Terveen';
    const calls = [call('inspect_professor', { name, guidance: facultyGuidance(name) }), call('complete_research_step', { reply: turn === 1 ? 'Joseph A. Konstan is on your list.' : 'Loren Terveen has also been added.', suggestions: [], needsInput: false })];
    const result = await runOpenClaw(req, { gatewayToken: 'test-only', fetchImpl: (async () => new Response(JSON.stringify({ status: 'completed', output: [calls.shift()] }))) as typeof fetch });
    await route.fulfill({ json: result });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('Recommend a professor.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.faculty-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Filter faculty' }).fill('Konstan');
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('Recommend more professors.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.faculty-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Loren Terveen' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Filter faculty' })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Find more faculty' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await navigate(page, /Find faculty/);
  await expect(page.locator('.faculty-card')).toHaveCount(2);
});

test('direction cards are authored, revised in place and remain usable for planning after reload', async ({ page }) => {
  const { directionCard } = await import('../helpers/direction');
  let turn = 0;
  await page.route('**/api/agent', async route => {
    const req = route.request().postDataJSON(); turn++;
    let serial = 0;
    const call = (name: string, args: unknown) => ({ type: 'function_call', name, call_id: `c${++serial}`, arguments: JSON.stringify(args) });
    let calls;
    if (turn === 1) calls = [call('save_directions', { mode: 'replace', options: [directionCard('Compare handwritten hints'), directionCard('Study sound in a quiet classroom')] })];
    else if (turn === 2) calls = [call('save_directions', { mode: 'merge', options: [{ ...directionCard('Two paper feedback designs'), directionId: req.state.directions[0].id, question: 'Which hint makes the error clearer?', description: 'Study hints without writing any code.', firstStep: 'Draw both hint designs on paper.', activities: ['Compare two sketches'], skills: ['Visual comparison'] }] })];
    else {
      expect(req.action).toBe('select_direction'); expect(req.directionId).toMatch(/^custom-/);
      expect(req.state.directions.find((d: any) => d.id === req.directionId).title).toBe('Two paper feedback designs');
      calls = [call('get_learning_resources', { directionId: req.directionId }), call('save_plan', { directionId: req.directionId, tasks: [{ id: null, title: 'Sketch two paper hints', description: 'Use the revised question.', minutes: 20, output: 'Two sketches', resourceUrl: null }] })];
    }
    calls.push(call('complete_research_step', { reply: 'The saved workspace is updated.', suggestions: [], needsInput: false }));
    const result = await runOpenClaw(req, { gatewayToken: 'test-only', fetchImpl: (async () => new Response(JSON.stringify({ status: 'completed', output: [calls.shift()] }))) as typeof fetch });
    await route.fulfill({ json: result });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('Suggest concrete research questions.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.direction-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Compare handwritten hints' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('Change the first direction to a paper-only experiment.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('heading', { name: 'Two paper feedback designs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Study sound in a quiet classroom' })).toBeVisible();
  await page.reload(); await navigate(page, /Explore directions/);
  const revised = page.locator('.direction-card').filter({ has: page.getByRole('heading', { name: 'Two paper feedback designs' }) });
  await expect(revised).toContainText('Study hints without writing any code.');
  await expect(revised).toContainText('Which hint makes the error clearer?');
  await revised.getByText('What would I actually do?').click();
  await expect(revised).toContainText('Draw both hint designs on paper.');
  await expect(revised).toContainText('Compare two sketches');
  await revised.getByRole('button', { name: 'Try this path' }).click();
  await expect(page.getByRole('heading', { name: 'Sketch two paper hints' })).toBeVisible();
  await expect(page.locator('.plan-overview')).toContainText('Two paper feedback designs');
  expect(turn).toBe(3);
});
