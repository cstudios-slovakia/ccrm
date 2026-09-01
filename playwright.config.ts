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
     modules are safe to audit concurrently.

     One worker is one Chromium instance, and each of those is a handful of
     `chrome-headless-shell` processes. Three of them measured 63% of a 12-core
     machine and made the desktop unusable, which is the whole reason this
     default came down to two. `scripts/qa/run-qa.mjs` derives a worker count
     from the machine's core count and passes it explicitly; this value is what
     a bare `npx playwright test` gets. */
  fullyParallel: true,
  workers: Number(process.env.QA_WORKERS ?? 2),

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
    /* `retain-on-failure` reads as "only on failure", but playwright has to
       record every test to be able to keep the ones that fail: it ran an
       `ffmpeg` per worker throughout, ~7% of a 12-core machine, to encode video
       that passing tests then deleted. Traces and failure screenshots already
       show what a defect looked like, so video is opt-in for the rare case
       where watching the sequence is the only way to understand a flake. */
    video: process.env.QA_VIDEO === '1' ? 'retain-on-failure' : 'off',
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
