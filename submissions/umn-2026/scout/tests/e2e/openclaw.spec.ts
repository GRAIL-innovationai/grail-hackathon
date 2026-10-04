import { test, expect, type Page } from '@playwright/test';
import { createSession } from '../../shared/types';

async function mockHealth(page: Page, configured: boolean) {
  await page.route('**/api/health', route => route.fulfill({
    json: { ok: true, liveAvailable: false, model: '', facultyCount: 8,
      openclaw: { configured, agentId: 'research-matchmaker', message: configured ? 'Configured.' : 'Run setup.' } },
  }));
}
async function openSettings(page: Page) {
  await page.locator('.mode-badge').click();
  return page.getByRole('dialog', { name: 'Your workspace settings' });
}

test('OpenClaw setup is explicit and does not ask for browser credentials', async ({ page }) => {
  await mockHealth(page, false);
  await page.route('**/api/openclaw/check', route => route.fulfill({ json: { ok: false, agentId: 'research-matchmaker', message: 'OpenClaw is not configured. Run npm run openclaw:setup.' } }));
  await page.goto('/');
  const settings = await openSettings(page);
  await expect(settings.getByRole('button', { name: /Research agent · setup needed/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.locator('code')).toContainText('npm run openclaw:setup');
  await expect(settings.locator('input, textarea')).toHaveCount(0);
  await expect(settings.getByText(/gateway may also retain conversation records/)).toBeVisible();
  await settings.getByRole('button', { name: 'Check OpenClaw connection' }).click();
  await expect(settings.getByRole('alert')).toContainText('not configured');
  await settings.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('.mode-badge')).toContainText('Research agent');
});

test('OpenClaw checks the gateway and routes messages using the selected mode', async ({ page }, info) => {
  await mockHealth(page, true);
  let probeCount = 0;
  let agentCount = 0;
  await page.route('**/api/openclaw/check', async route => {
    probeCount++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({ json: { ok: true, agentId: 'research-matchmaker', message: 'The gateway is reachable. Model access is checked when you send a message.' } });
  });
  await page.route('**/api/agent', async route => {
    agentCount++;
    const body = route.request().postDataJSON();
    expect(body.mode).toBe('openclaw');
    expect(body.state.profile.school).toBe('');
    await route.fulfill({ json: { state: body.state, reply: 'What kinds of questions have caught your attention lately?', mode: 'openclaw', suggestions: [], toolActivity: ['Connected through OpenClaw'] } });
  });
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: /Research agent · configured/ }).click();
  await settings.getByRole('button', { name: 'Check OpenClaw connection' }).click();
  await expect(settings.getByRole('status')).toContainText('Gateway reachable');
  await expect(settings.getByText(/This checks the gateway connection only/)).toBeVisible();
  await expect(settings.getByText(/Faculty search uses public university pages/)).toBeVisible();
  expect(agentCount).toBe(0);
  expect(probeCount).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('openclaw-settings.png'), fullPage: true, animations: 'disabled' });
  await settings.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('.mode-badge')).toHaveText('Research agent');
  await expect(page.locator('.chat-mode')).toHaveText('Research agent');
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('I am interested in computer science.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('What kinds of questions have caught your attention lately?')).toBeVisible();
  expect(agentCount).toBe(1);
  await expect(page.locator('.chat-footnote')).toContainText('local OpenClaw gateway');
});

test('OpenClaw errors preserve the plan and retry the same mode once', async ({ page }) => {
  const session = createSession();
  session.profile.name = 'Riley';
  session.tasks = [{ id: 'saved-step', title: 'Read one short paper', description: 'Write down a question.', minutes: 20, output: 'One research question', completed: true, resource: null }];
  await page.addInitScript(state => localStorage.setItem('research-matchmaker-v1', JSON.stringify(state)), session);
  await mockHealth(page, true);
  let requests = 0;
  await page.route('**/api/agent', async route => {
    requests++;
    const body = route.request().postDataJSON();
    expect(body.mode).toBe('openclaw');
    expect(body.state.tasks).toEqual(session.tasks);
    expect(body.state.messages.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
    if (requests === 1) await route.fulfill({ status: 503, json: { error: 'OpenClaw is unavailable. Start your local gateway and try again.' } });
    else await route.fulfill({ json: { state: body.state, reply: 'We can keep working from your saved plan.', mode: 'openclaw', suggestions: [], toolActivity: [] } });
  });
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: /Research agent · configured/ }).click();
  await settings.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('What should I try after this paper?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('OpenClaw is unavailable');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('research-matchmaker-v1') || '{}'));
  expect(stored.tasks).toEqual(session.tasks);
  expect(stored.profile.name).toBe('Riley');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('We can keep working from your saved plan.')).toBeVisible();
  expect(requests).toBe(2);
  await expect(page.locator('.mode-badge')).toHaveText('Research agent');
});
