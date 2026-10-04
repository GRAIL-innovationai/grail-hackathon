import { test, expect, type Page } from '@playwright/test';

async function navigate(page: Page, name: RegExp) {
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeAttached();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation.getByRole('button', { name }).click();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
    await expect.poll(async () => { const bounds = await page.locator('.sidebar').boundingBox(); return bounds ? bounds.x + bounds.width : 0; }).toBeLessThanOrEqual(1);
  }
}
async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message your research guide' }).fill(text);
  const response = page.waitForResponse(response => response.url().endsWith('/api/agent') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send message' }).click();
  await response;
}
async function chooseHci(page: Page) {
  await send(page, 'I like human-computer interaction, interface design and education.');
  const card = page.locator('.direction-card').filter({ has: page.getByRole('heading', { name: /Human.*Computer Interaction/ }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Try this path' }).click();
  await expect(page.getByRole('heading', { name: 'Make curiosity a practice.' })).toBeVisible();
}

test('complete research journey, editable draft, exports, persistence, and deletion', async ({ page }, info) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Find your next.*question/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('welcome.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Add background or resume' }).click();
  const profile = page.getByRole('dialog', { name: 'Your starting point' });
  await profile.getByLabel('Name', { exact: true }).fill('Avery');
  await profile.getByLabel('University or college').fill('University of Minnesota Twin Cities');
  await profile.getByLabel('Major or area of study').fill('Computer science');
  await profile.getByRole('combobox', { name: 'Year', exact: true }).selectOption('Second year');
  await profile.getByLabel('Experience & things you’ve tried').fill('I have basic Python experience.');
  await profile.getByRole('button', { name: 'Save my starting point' }).click();
  await chooseHci(page);
  await expect(page.locator('.task-card')).toHaveCount(3);
  await page.locator('.task-card').first().getByRole('checkbox').check();
  await expect(page.getByText('1 of 3 steps complete')).toBeVisible();
  const planDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download plan' }).click();
  expect((await planDownload).suggestedFilename()).toMatch(/first-steps/);
  await page.getByRole('button', { name: 'Meet the researchers' }).click();
  await expect(page.locator('.faculty-card').first()).toBeVisible();
  await expect(page.getByText('Openings unknown').first()).toBeVisible();
  const faculty = page.locator('.faculty-card').first();
  await faculty.getByText('Sources & context').click();
  await expect(faculty.locator('.sources a').first()).toHaveAttribute('href', /^https:\/\//);
  await faculty.getByRole('button', { name: 'Draft an introduction' }).click();
  const draft = page.getByRole('textbox', { name: 'Email body' });
  await expect(draft).toHaveValue(/Avery/);
  await expect(draft).toHaveValue(/basic Python/);
  const custom = 'Dear Professor,\n\nMy edited introduction uses my own words.\n\nThank you, Avery';
  await draft.fill(custom);
  await page.getByRole('textbox', { name: 'Email subject' }).fill('My personal introduction');
  const emailDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await emailDownload).suggestedFilename()).toMatch(/introduction/);
  await navigate(page, /^Discover/);
  await send(page, 'What if the professor does not reply?');
  await navigate(page, /Outreach studio/);
  await expect(page.getByRole('textbox', { name: 'Email body' })).toHaveValue(custom);
  await page.reload();
  await navigate(page, /Outreach studio/);
  await expect(page.getByRole('textbox', { name: 'Email body' })).toHaveValue(custom);
  await page.screenshot({ path: info.outputPath('outreach.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /^Guided demo/ }).first().click();
  const settings = page.getByRole('dialog', { name: 'Your workspace settings' });
  await expect(settings.getByRole('button', { name: /Live AI.*not connected/ })).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await settings.getByRole('button', { name: 'Clear local data' }).click();
  await expect(page.getByRole('heading', { name: /Find your next.*question/ })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('research-matchmaker-cloud-v1') || '{}'));
  expect(stored.profile.school).toBe('');
  expect(stored.messages).toHaveLength(0);
  expect(runtimeErrors).toEqual([]);
});

test('school is requested only when needed and can be answered in conversation', async ({ page }) => {
  await page.goto('/');
  await chooseHci(page);
  await page.getByRole('button', { name: 'Meet the researchers' }).click();
  await expect(page.getByText(/Which university do you attend/).first()).toBeVisible();
  if (!(await page.getByRole('textbox', { name: 'Message your research guide' }).isVisible())) await navigate(page, /^Discover/);
  await send(page, 'University of Minnesota Twin Cities');
  await expect(page.locator('.faculty-card').first()).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('research-matchmaker-cloud-v1') || '{}'));
  expect(stored.profile.school).toBe('University of Minnesota Twin Cities');
  expect(stored.selectedDirectionId).toBe('human-computer-interaction');
});

test('failed requests preserve work and can be retried', async ({ page }) => {
  await page.goto('/');
  let failed = false;
  await page.route('**/api/agent', route => {
    if (!failed) { failed = true; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Test service is temporarily unavailable.' }) }); }
    return route.continue();
  });
  await send(page, 'I like ecology and conservation.');
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.direction-card')).toHaveCount(3);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('research-matchmaker-cloud-v1') || '{}'));
  expect(stored.messages.filter((message: any) => message.role === 'user')).toHaveLength(1);
});

test('layout fits viewport and resume preview needs confirmation', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Add background or resume' }).click();
  const profile = page.getByRole('dialog', { name: 'Your starting point' });
  await profile.locator('input[type=file]').setInputFiles({ name: 'background.txt', mimeType: 'text/plain', buffer: Buffer.from('I completed an introductory biology course.') });
  await expect(profile.getByRole('textbox', { name: 'Resume text preview' })).toBeVisible();
  await profile.getByRole('button', { name: 'Cancel', exact: true }).click();
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('research-matchmaker-cloud-v1') || '{}'));
  expect(stored.profile.experience).toBe('');
  await page.getByRole('button', { name: 'Add background or resume' }).click();
  await profile.locator('input[type=file]').setInputFiles({ name: 'background.txt', mimeType: 'text/plain', buffer: Buffer.from('I completed an introductory biology course.') });
  await profile.getByRole('button', { name: 'Use this text as experience' }).click();
  await profile.getByRole('button', { name: 'Save my starting point' }).click();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('research-matchmaker-cloud-v1') || '{}'));
  expect(stored.profile.experience).toContain('introductory biology');
});
