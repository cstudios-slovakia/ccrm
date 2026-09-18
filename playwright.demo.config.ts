import { defineConfig, devices } from '@playwright/test';

/**
 * Presentation screenshot run — separate from the QA audit on purpose.
 *
 * `npm run shots` drives the real app against the demo dataset in
 * `tests/demo/demoData.ts` and writes PNGs into `presentation-screenshots/`.
 * It asserts nothing about the product; it only produces images.
 *
 * Its own port (5373) for the same reason the QA suite has one: several
 * worktrees of this repo are worked on at once and 5173/5273 are taken.
 */
const PORT = Number(process.env.SHOTS_PORT ?? 5373);
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/demo',
  outputDir: './test-results/demo-artifacts',
  timeout: 3 * 60 * 1000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: URL,
    /* 1600×1100 at 2× — wide enough for the sidebar plus a full data table, tall
       enough that a list shows rows rather than only its header, and retina-sharp
       when a marketing page scales it down. */
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: process.env.SHOTS_REUSE_SERVER === '1',
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
