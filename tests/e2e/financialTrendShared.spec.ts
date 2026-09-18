import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { gotoView, startSession, waitForWorkspaceContent } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * The finance trend's manual weekly anchors are shared workspace data.
 *
 * They used to live in localStorage, so the projection curve was per browser:
 * whoever reconciled a week against the bank statement saw one chart and every
 * colleague saw another, built from the default starting balance. This pins the
 * round trip — the anchor has to reach /sync.php and come back to a second,
 * completely separate browser profile.
 */

const CUMULATIVE = /^(Cumulative Balance|Stav na účte \(Kumulatívny\)|Bankszámla egyenleg)$/;
const OPEN_TABLE = /Inspect Full 18-Week|Zobraziť podrobnú 18-týždňovú|Részletes 18 hetes/;
const CUMULATIVE_CHIP = /(Cumulative Funds|Kumulatívny stav|Kumulált egyenleg)/;
const CALIBRATE = /^(Calibrate|Nastaviť|Beállít)$/;
const SAVE = /Save & Recalculate Timeline|Uložiť a prepočítať os|Mentés és újraszámolás/;
const ANCHOR_BADGE = /🎯 (Set|Nastavené|Fix)/;

const ANCHOR_VALUE = '123456';

/**
 * A backend that remembers the trend anchors, standing in for the database.
 * Registered after the fixture's mocks, so Playwright asks this one first.
 */
function installSharedTrendBackend(page: Page, store: { trend: unknown }) {
  return page.route('**/sync.php**', async (route) => {
    const request = route.request();

    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { financialTrend?: unknown };
        // The server's contract: omitted means unchanged.
        if (body?.financialTrend !== undefined) store.trend = body.financialTrend;
      } catch {
        /* not JSON — nothing to remember */
      }
      return route.fallback();
    }

    // Serve the fixture's dataset with our remembered anchors spliced in.
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...buildSyncPayload(), financialTrend: store.trend }),
    });
  });
}

async function openTrendTable(page: Page) {
  await gotoView(page, '#financial');
  await waitForWorkspaceContent(page);
  await page.getByRole('button', { name: CUMULATIVE }).first().click();
  // The mode moved from localStorage to the user's DB-backed preferences, so
  // check the toggle still actually switches the curve.
  await expect(page.getByText(CUMULATIVE_CHIP).first()).toBeVisible();
  await page.getByRole('button', { name: OPEN_TABLE }).first().click();
}

test.describe('Financial trend anchors', () => {
  test('a reconciled week reaches the server and shows up in another browser', async ({
    page,
    browser,
    baseURL,
  }) => {
    // One store shared by both browser profiles: the same "database".
    const store: { trend: unknown } = {
      trend: { weeklyBankBalances: {}, currentBankBalance: null },
    };

    await startSession(page);
    await installSharedTrendBackend(page, store);
    await openTrendTable(page);

    // --- the first user reconciles the earliest listed week ---------------
    await page.getByRole('button', { name: CALIBRATE }).first().click();
    await page.getByRole('spinbutton').fill(ANCHOR_VALUE);
    await page.getByRole('button', { name: SAVE }).click();
    await expect(page.getByText(ANCHOR_BADGE).first()).toBeVisible();

    // It left the browser rather than settling into localStorage.
    await expect
      .poll(() => JSON.stringify(store.trend), { timeout: 10_000 })
      .toContain(ANCHOR_VALUE);
    await expect(
      page.evaluate(() => localStorage.getItem('crm_financial_weekly_bank_balances')),
    ).resolves.toBeNull();

    // --- a second user, on a separate browser profile ---------------------
    let second: BrowserContext | undefined;
    try {
      second = await browser.newContext();
      const pageB = await second.newPage();
      await startSession(pageB);
      await installSharedTrendBackend(pageB, store);
      await pageB.goto(baseURL ?? 'http://localhost:5273/');
      await openTrendTable(pageB);

      // Same anchor, same curve — and nothing in this browser's storage said so.
      await expect(pageB.getByText(ANCHOR_BADGE).first()).toBeVisible();
      await expect(
        pageB.evaluate(() => localStorage.getItem('crm_financial_weekly_bank_balances')),
      ).resolves.toBeNull();
    } finally {
      await second?.close();
    }
  });
});
