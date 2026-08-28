import { defineConfig, devices } from '@playwright/test';
import { inferSuiteKindFromArgv, persistSuiteKind } from './tests/e2e/helpers/reportCollector';

persistSuiteKind(inferSuiteKindFromArgv());

/**
 * CCRM automated QA suite.
 *
 * Four kinds of test live here:
 *   - `crawler.spec.ts` / `navigation.spec.ts` — autonomous discovery.
 *   - `recorder.spec.ts` — replays Chrome DevTools Recorder exports.
 *   - `canary.spec.ts` — harness acceptance: the two known product bugs must
 *     still be detected. They pass when the bug is found.
 *   - `darkmode.spec.ts` / `license.spec.ts` — one declared invariant each,
 *     asserted directly: nothing illegible in dark mode, and nothing taken away
 *     by a lapsed licence.
 *
 * See https://playwright.dev/docs/test-configuration.
 */

/**
 * The audit gets its own port, separate from the 5173 you develop on.
 *
 * This repo is worked on through several git worktrees at once. Sharing 5173
 * and reusing whatever already listens there meant the suite could silently
 * audit a *different branch's* dev server — and fail every test the moment that
 * server went away. Its own port on `--strictPort` makes a run either audit
 * this checkout or refuse to start.
 *
 * 5273 rather than 5174 on purpose: when 5173 is busy Vite walks upward
 * (5174, 5175, …), so anything adjacent is exactly where a second checkout's
 * dev server lands.
 *
 * Set QA_REUSE_SERVER=1 to reuse an already-running server on the QA port when
 * you are iterating and want to skip the few seconds of Vite startup.
 */
const QA_PORT = Number(process.env.QA_PORT ?? 5273);
const QA_URL = `http://localhost:${QA_PORT}`;

/** Auditing a deployed environment: use it as-is, do not start anything local. */
const EXTERNAL_TARGET = process.env.BASE_URL;

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
    baseURL: EXTERNAL_TARGET || QA_URL,
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

  /* BASE_URL means "audit that deployment"; starting a local dev server then
     would be pointless and would make the run wait on a port nobody uses. */
  webServer: EXTERNAL_TARGET ? undefined : {
    command: `npm run dev -- --port ${QA_PORT} --strictPort`,
    url: QA_URL,
    reuseExistingServer: process.env.QA_REUSE_SERVER === '1',
    timeout: 120 * 1000,
    stdout: 'ignore',
    /* Vite forwards every browser console warning here (THREE deprecations and
       friends), which buries the run's own output. Playwright still fails
       loudly if the server never comes up. Set QA_SERVER_LOGS=1 when you need
       to debug the dev server itself. */
    stderr: process.env.QA_SERVER_LOGS === '1' ? 'pipe' : 'ignore',
  },
});
