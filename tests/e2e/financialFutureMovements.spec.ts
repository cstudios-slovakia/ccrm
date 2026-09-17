import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Finance → movements: the forecast overlay draws what has not happened yet
 * into the ledger, next to what has.
 *
 * Two fixture records are the anchors:
 *
 *  - `fr-2` — an invoice for Novák Stavby, 9 200 € issued five days ago and
 *    payable in nine. The ledger files it under the day it was issued; the
 *    forecast moves it to the day the money is expected, and must not leave a
 *    copy behind, or the same invoice would be counted in both months.
 *  - `fr-4` — the monthly wages rule, 6 400 € on the 15th, with no end date.
 *    It charges forever, which is why the overlay is bounded to one month and
 *    offers the next one instead of rendering an infinite ledger.
 *
 * The QA dataset runs the app in Slovak, so every label is matched in both.
 */

const SETTLE = { timeout: 20_000 };

const INVOICE = 'Novák Stavby';
const WAGES = 'Mzdy';

const FUTURE_TOGGLE = /Future movements|Budúce pohyby|Várható tételek/;
const LOAD_MORE = /Load another month|Načítať ďalší mesiac|Még egy hónap/;

async function openMovements(page: Page) {
  await gotoView(page, '#financial/movements');
  await expect(
    page.getByRole('columnheader', { name: /Payment Status|Stav úhrady/ })
  ).toBeVisible(SETTLE);
}

const rows = (page: Page): Locator => page.locator('table tbody tr');

const rowsFor = (page: Page, text: string): Locator => rows(page).filter({ hasText: text });

/**
 * Forecast rows carry a marker of their own: their labels deliberately echo the
 * real ones (a status pill also says "Planned"), so matching on text would be
 * matching on a coincidence.
 */
const forecastRows = (page: Page): Locator => page.locator('table tbody tr[data-forecast]');

const futureToggle = (page: Page): Locator => page.getByRole('button', { name: FUTURE_TOGGLE });

test.describe('Finance — future movements', () => {
  test('the ledger shows nothing expected until the overlay is switched on', async ({ page }) => {
    await startSession(page);
    await openMovements(page);

    await expect(futureToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(forecastRows(page)).toHaveCount(0);

    // The recurring wages rule is one row — its future charges are not drawn.
    await expect(rowsFor(page, WAGES)).toHaveCount(1);
  });

  test('switching it on draws the expected movements once, and they cannot be edited in place', async ({ page }) => {
    await startSession(page);
    await openMovements(page);

    await futureToggle(page).click();
    await expect(futureToggle(page)).toHaveAttribute('aria-pressed', 'true');

    // A recurring rule charges again inside the first month, and an unpaid
    // invoice is expected on its due date.
    await expect(forecastRows(page).first()).toBeVisible(SETTLE);
    await expect(forecastRows(page).filter({ hasText: INVOICE })).toHaveCount(1);

    // The invoice is drawn once, not twice: the forecast took over the record
    // rather than adding a copy of it.
    await expect(rowsFor(page, INVOICE)).toHaveCount(1);

    // One action only: the way back to the rule or invoice behind it. No
    // status picker either — a row with no record has no status to set.
    await expect(forecastRows(page).first().locator('td').last().getByRole('button')).toHaveCount(1);
  });

  test('the overlay reaches one month, and another can be loaded and wound back', async ({ page }) => {
    await startSession(page);
    await openMovements(page);
    await futureToggle(page).click();

    await expect(page.getByText(/1 month ahead|na 1 mesiac dopredu|1 hónapra előre/).first()).toBeVisible(SETTLE);

    const before = await forecastRows(page).count();
    expect(before).toBeGreaterThan(0);

    // The wages rule never ends, so another month is always on offer.
    await page.getByRole('button', { name: LOAD_MORE }).click();

    await expect(page.getByText(/2 months ahead|na 2 mesiace dopredu|2 hónapra előre/).first()).toBeVisible(SETTLE);
    await expect.poll(() => forecastRows(page).count()).toBeGreaterThan(before);

    await page.getByRole('button', { name: /Back to one month|Späť na jeden mesiac|Vissza egy hónapra/ }).click();
    await expect.poll(() => forecastRows(page).count()).toBe(before);
  });

  test('switching the overlay off puts the ledger back exactly as it was', async ({ page }) => {
    await startSession(page);
    await openMovements(page);

    const baseline = await rows(page).count();

    await futureToggle(page).click();
    await expect(forecastRows(page).first()).toBeVisible(SETTLE);

    await futureToggle(page).click();
    await expect(forecastRows(page)).toHaveCount(0);
    await expect.poll(() => rows(page).count()).toBe(baseline);
  });
});
