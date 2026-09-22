import { defineConfig, devices } from '@playwright/test';

/**
 * Enterprise Playwright E2E Configuration for HR Solutions
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // These tests write to a real database. Serial execution prevents a failed
  // shared backend from causing interleaved, misleading persistence results.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  // Registration provisions Cognito and a tenant schema against the deployed
  // service, so it legitimately needs more than Playwright's 30s default.
  timeout: 90_000,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // The frontend's .env defines the deployed API under test. Only start the
  // Next.js application here; starting a second local API would test a
  // different database and can mask deployment configuration issues.
  webServer: {
    command: 'npm run dev',
    url: process.env.BASE_URL || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
