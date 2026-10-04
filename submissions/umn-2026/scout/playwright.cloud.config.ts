import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/cloud',
  timeout: 45_000,
  fullyParallel: false,
  reporter: 'list',
  outputDir: 'test-results/cloud',
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
