import { defineConfig, devices } from '@playwright/test';
import { inferSuiteKindFromArgv, persistSuiteKind } from './tests/e2e/helpers/reportCollector';

persistSuiteKind(inferSuiteKindFromArgv());

/**
 * CCRM automated QA suite.
 *
 * Two kinds of test live here:
 *   - `crawler.spec.ts` / `navigation.spec.ts` — autonomous discovery.
 *   - `recorder.spec.ts` — replays Chrome DevTools Recorder exports.
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/artifacts',

  globalSetup: './tests/e2e/globalSetup.ts',
  globalTeardown: './tests/e2e/globalTeardown.ts',

  /* A deep audit of one module opens drawers, fills forms and walks every
     dropdown, so it needs far longer than a conventional assertion test. */
  timeout: 4 * 60 * 1000,
  expect: { timeout: 5000 },

  /* Each test gets its own browser context with its own mocked backend, so
     modules are safe to audit concurrently. */
  fullyParallel: true,
  workers: Number(process.env.QA_WORKERS ?? (process.env.CI ? 2 : 3)),

  forbidOnly: !!process.env.CI,
  retries: Number(process.env.QA_RETRIES ?? 0),

  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/qa-results.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* Wide enough for the desktop shell: the sidebar is `hidden lg:flex`, so a
       narrower viewport would hide the navigation the suite needs to click. */
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    /* The crawler clicks "copy" buttons it discovers; without this the browser
       raises a permission error that would be reported as an app defect. */
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
