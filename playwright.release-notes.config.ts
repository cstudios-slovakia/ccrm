import { defineConfig, devices } from '@playwright/test';

/**
 * Screenshots for the automated release notes (docs/RELEASE-NOTES.md).
 *
 * Driven by `scripts/release-notes/shoot.mjs`, which sets:
 *   RELEASE_SPEC       spec file inside tests/release-notes/ (default: example.spec.ts)
 *   RELEASE_SHOTS_OUT  output root; each language writes to <root>/<lang>/
 *   RELEASE_LANGS      comma list of sk,en,hu (default: all three)
 *
 * One Playwright project per language: the same spec runs three times with the
 * app UI in that language. Own port (5473), like the QA (5273) and demo (5373)
 * runs, so it never collides with a dev server from another worktree.
 */
const PORT = Number(process.env.RELEASE_SHOTS_PORT ?? 5473);
const URL = `http://localhost:${PORT}`;
const LANGS = (process.env.RELEASE_LANGS ?? 'sk,en,hu').split(',').map((s) => s.trim()).filter(Boolean);

export default defineConfig({
  testDir: './tests/release-notes',
  testMatch: process.env.RELEASE_SPEC ?? 'example.spec.ts',
  outputDir: './test-results/release-notes-artifacts',
  timeout: 3 * 60 * 1000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: URL,
    /* Narrower than the marketing shots (1600×1100): an article column shows the
       image at ~700 px, and a 1440 frame keeps the text in it legible. 2× keeps
       zoomed crops sharp in the lightbox. */
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  projects: LANGS.map((name) => ({ name, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } })),

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: process.env.RELEASE_SHOTS_REUSE_SERVER === '1',
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
