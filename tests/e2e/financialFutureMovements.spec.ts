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
 *  - `fr-4` — the monthly wages rule, 6 400 € on the 15th, started 200 days
 *    ago, with no end date. The charges it has already made are stored as
 *    settled movements of their own (`materializeDueCharges`, run when the app
 *    loads), so the ledger shows them as ordinary rows; the ones still to come
 *    are the overlay's. It charges forever, which is why the overlay is bounded
 *    to one month and offers the next one instead of rendering an infinite
 *    ledger.
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

/** Charges the schedule still draws on its own — none once the materializer has stored every due one. */
const drawnChargeRows = (page: Page): Locator => page.locator('table tbody tr[data-recurring-charge]');

/**
 * Charges a recurring rule has already made: stored movements of their own, which
 * carry the "Recurring" badge their rule gives them.
 */
const storedChargeRows = (page: Page): Locator =>
  page.locator('table tbody tr').filter({ has: page.locator('[data-recurring-payment]') });

const futureToggle = (page: Page): Locator => page.getByRole('button', { name: FUTURE_TOGGLE });

const DAY = 24 * 60 * 60 * 1000;

/** A local `Date` at midnight, `offsetDays` from now — the same day arithmetic the fixture's dates use. */
function localDay(offsetDays: number): Date {
  const d = new Date(Date.now() + offsetDays * DAY);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** How many times the wages rule (the 15th, from 200 days ago) has charged up to and including today. */
function wagesChargesToDate(): number {
  const today = localDay(0);
  let count = 0;
  for (const d = localDay(-200); d <= today; d.setDate(d.getDate() + 1)) {
    if (d.getDate() === 15) count++;
  }
  return count;
}

test.describe('Finance — future movements', () => {
  test('the ledger shows nothing expected until the overlay is switched on', async ({ page }) => {
    await startSession(page);
    await openMovements(page);

    await expect(futureToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(forecastRows(page)).toHaveCount(0);

    // The wages rule has stored every charge it has made up to today as a
    // movement of its own — and none of the ones still to come, which only the
    // overlay draws.
    await expect(storedChargeRows(page).filter({ hasText: WAGES })).toHaveCount(wagesChargesToDate(), SETTLE);
    // Nothing is left for the schedule to draw: a due day is a stored movement,
    // drawn once, never a second time from the rule.
    await expect(drawnChargeRows(page).filter({ hasText: WAGES })).toHaveCount(0);
    // Beside the stored payments, at most the rule's own row.
    const ownRows = rowsFor(page, WAGES).filter({ hasNot: page.locator('[data-recurring-payment]') });
    expect(await ownRows.count()).toBeLessThanOrEqual(1);
  });

  test('a charge the rule already made is a stored movement that opens against its rule', async ({ page }) => {
    await startSession(page);
    await openMovements(page);

    const charge = storedChargeRows(page).filter({ hasText: WAGES }).first();
    await expect(charge).toBeVisible(SETTLE);

    // Stored, so it is a movement like any other: it can be edited and deleted.
    const edit = charge.getByRole('button', { name: /Edit movement|Upraviť pohyb|Szerkesztés/ });
    await expect(edit).toHaveCount(1);

    // The checkbox column stays hidden until the user asks for it. A stored
    // charge can be ticked then, unlike one still drawn from the schedule.
    await expect(page.getByRole('checkbox', { name: /Select movement|Vybrať pohyb|Tétel kijelölése/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^(Select|Vybrať|Kijelölés)$/ }).click();
    await expect(charge.getByRole('checkbox')).toBeEnabled();
    await edit.click();

    // It opens that payment against its rule (the rule's title and the day it
    // stands in for), never a form for a new movement.
    await expect(page.locator('#transaction-edit-form')).toBeVisible(SETTLE);
    // A stored payment opens the payment form, which names the rule it belongs to
    // in its read-only source panel; the rule's own fields are edited elsewhere.
    await expect(page.locator('#transaction-edit-form [data-occurrence-source]')).toContainText('Mzdy — mesačné');
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
