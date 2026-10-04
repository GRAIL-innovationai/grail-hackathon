import { test, expect } from '@playwright/test';

test('Scout defaults to the subscription agent and migrates the old API choice', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('research-matchmaker-mode-v1')) localStorage.setItem('research-matchmaker-mode-v1', 'live');
  });
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, liveAvailable: false, model: '', facultyCount: 8, openclaw: { configured: true } } }));
  const modes: string[] = [];
  await page.route('**/api/agent', route => {
    const body = route.request().postDataJSON();
    modes.push(body.mode);
    return route.fulfill({ json: { state: body.state, reply: 'Which research question interests you?', suggestions: [], mode: 'openclaw', toolActivity: [] } });
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Scout — Find your next question');
  await expect(page.locator('.brand')).toHaveText('Scout.');
  await expect(page.locator('.mode-badge')).toHaveText('Research agent');
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('I am interested in biology');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Which research question interests you?')).toBeVisible();
  expect(modes).toEqual(['openclaw']);
  await page.reload();
  await expect(page.locator('.mode-badge')).toHaveText('Research agent');
  await page.locator('.mode-badge').click();
  const settings = page.getByRole('dialog', { name: 'Your workspace settings' });
  await expect(settings.getByText(/OPENAI_API_KEY/)).toHaveCount(0);
  await settings.getByRole('button', { name: /^Guided demo/ }).click();
  await settings.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('.mode-badge')).toHaveText('Guided demo');
});

test('missing agent configuration is visible without falling back to templates', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, liveAvailable: false, model: '', facultyCount: 8, openclaw: { configured: false } } }));
  const modes: string[] = [];
  await page.route('**/api/agent', route => {
    modes.push(route.request().postDataJSON().mode);
    return route.fulfill({ status: 503, json: { error: 'Start your local OpenClaw gateway and sign in.' } });
  });
  await page.goto('/');
  await expect(page.getByText('Connect your research agent')).toBeVisible();
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill('Explore biology');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('OpenClaw gateway');
  await expect(page.locator('.mode-badge')).toHaveText('Research agent');
  await expect(page.locator('.direction-card')).toHaveCount(0);
  expect(modes).toEqual(['openclaw']);
});
