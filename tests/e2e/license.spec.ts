import { test, expect, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Licensing, end to end through the real app.
 *
 * The decision layer — when a banner is warranted, how a dismissal is keyed —
 * is covered exhaustively and cheaply in `src/utils/license.test.ts`. What that
 * cannot see is the wiring: that the state actually reaches the banner, that the
 * settings tab renders it, and above all that the one promise this feature makes
 * holds — **an expired licence does not take anything away**. That promise is
 * asserted here, against the running app, on every run.
 */

/** Overrides the licence route the session fixture installed. */
const withLicense = async (page: Page, license: Record<string, unknown>) => {
  // Playwright matches routes in reverse registration order, so this wins over
  // the healthy licence installed by installBackendMocks().
  await page.route('**/api/license.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        license: {
          configured: true,
          status: 'active',
          valid: true,
          keyMasked: 'CCRM-********QA01',
          expiresAt: '2099-12-31',
          daysRemaining: 3650,
          warnDays: 30,
          maxUsers: null,
          seatsUsed: 4,
          customer: 'QA Automated Suite',
          plan: 'standard',
          activatedAt: '2026-01-01 09:00:00',
          lastCheckAt: '2026-01-01 09:00:00',
          lastAttemptAt: '2026-01-01 09:00:00',
          lastError: null,
          offlineDays: 0,
          updatesAllowed: true,
          updatesBlockedReason: null,
          ...license,
        },
      }),
    }),
  );
};

const banner = (page: Page) => page.locator('[role="status"]').filter({ hasText: /licenci|licence|licenc/i }).first();

test.describe('Licensing', () => {
  test('a healthy licence says nothing', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#dashboard');
    await expect(banner(page)).toBeHidden();
  });

  test('an expiring licence warns, and the warning can be silenced', async ({ page }) => {
    await startSession(page);
    await withLicense(page, {
      status: 'expiring',
      expiresAt: '2026-09-15',
      daysRemaining: 18,
    });
    await gotoView(page, '#dashboard');

    const notice = banner(page);
    await expect(notice).toBeVisible();
    // The reassurance is not decoration: without it "licence" in a coloured box
    // reads as "something is about to be taken away from me". Matched in all
    // three languages, because whichever one is active is the one a customer
    // will be reading it in.
    await expect(notice).toContainText(/bez obmedzenia|working normally|változatlanul/i);

    await notice.getByRole('button', { name: /nezobrazovať|show again|jelenjen meg/i }).click();
    await expect(notice).toBeHidden();
  });

  test('an expired licence takes nothing away', async ({ page }) => {
    await startSession(page);
    await withLicense(page, {
      status: 'expired',
      valid: false,
      expiresAt: '2026-01-01',
      daysRemaining: -240,
      updatesAllowed: false,
      updatesBlockedReason: 'expired',
    });

    // Every module still opens and still renders its content. This is the whole
    // promise of the feature; if it ever fails, the licence has started doing
    // something it must never do.
    for (const hash of ['#dashboard', '#leads', '#clients', '#tasks', '#settings']) {
      await gotoView(page, hash);
      const workspace = page.locator('main').first();
      await expect(workspace).toBeVisible();
      const text = (await workspace.innerText()).replace(/\s+/g, ' ').trim();
      expect(text.length, `${hash} rendered almost nothing on an expired licence`).toBeGreaterThan(200);
    }
  });

  test('the licence settings tab shows what is installed', async ({ page }) => {
    await startSession(page);
    await withLicense(page, {
      status: 'expiring',
      expiresAt: '2026-09-15',
      daysRemaining: 18,
      maxUsers: 25,
      seatsUsed: 4,
    });
    await gotoView(page, '#settings/license');

    const workspace = page.locator('main').first();
    await expect(workspace).toContainText('CCRM-********QA01');
    await expect(workspace).toContainText('QA Automated Suite');
    // Seats are rendered "4 of 25" / "4 z 25" / "4 / 25" depending on language.
    await expect(workspace).toContainText(/4\s*(of|z|\/)\s*25/i);
    // An admin gets somewhere to type a new key.
    await expect(page.getByPlaceholder(/CCRM-XXXX/i)).toBeVisible();
  });

  test('a backend that answers nothing useful produces no banner at all', async ({ page }) => {
    await startSession(page);
    // What an older backend, or the suite's generic /api/* catch-all, returns.
    // A lenient client would read this as "no licence" and warn every user of
    // every installation that has not upgraded its PHP yet.
    await page.route('**/api/license.php**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    );
    await gotoView(page, '#dashboard');
    await expect(banner(page)).toBeHidden();
  });
});
