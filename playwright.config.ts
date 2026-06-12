import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MillOS E2E tests.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`.
     * Dedicated e2e port: on port 3000 (the dev default) reuseExistingServer
     * happily adopts WHATEVER is already listening — on one dev machine the
     * suite silently tested a Grafana login page. 5180 + --strictPort makes
     * the suite fail loudly instead of testing the wrong app. */
    baseURL: 'http://localhost:5180',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for 3D app to start
  },

  /* Increase timeout for 3D app loading */
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 15000, // 15 seconds for assertions
  },
});
