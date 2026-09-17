import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Financial Management → overview table: every movement is counted, whether
 * or not it was filed under a category.
 *
 * Fixture `fr-5` is the anchor: a paid 180 € office-supplies expense with no
 * category. It used to be silently dropped from the matrix — and from the
 * "Total Expenses" and net rows with it — so the table's "Skutočnosť" never
 * matched the movements ledger until every movement was categorised.
 *
 * The QA dataset runs the app in Slovak, so every label is matched in both.
 */

const SETTLE = { timeout: 20_000 };

const UNCATEGORIZED = /Uncategorized|Bez kategórie/;
const TOTAL_EXPENSES = /Total Expenses|Výdavky spolu/;

async function openOverviewTable(page: Page) {
  await gotoView(page, '#financial/table');
  await expect(
    page.getByRole('columnheader', { name: /Category Structure|Štruktúra kategórií/ })
  ).toBeVisible(SETTLE);
  // Year columns span two years either side of today, so the fixture's
  // relative dates never fall outside the horizon.
  await page.getByRole('button', { name: /^(Year|Rok)$/ }).click();
}

const matrixRows = (page: Page): Locator => page.locator('table tbody tr');

const uncategorizedRow = (page: Page): Locator =>
  matrixRows(page).filter({ hasText: UNCATEGORIZED }).first();

test.describe('Financial Management — overview table', () => {
  test('a movement without a category has its own row and is counted in the totals', async ({ page }) => {
    await startSession(page);
    await openOverviewTable(page);

    const row = uncategorizedRow(page);
    await expect(row).toBeVisible(SETTLE);
    await expect(row).toContainText('180');

    // It sits inside the expenses section — above "Total Expenses".
    const rows = matrixRows(page);
    const rowTexts = await rows.allInnerTexts();
    const uncategorizedIdx = rowTexts.findIndex((t) => UNCATEGORIZED.test(t));
    const totalExpensesIdx = rowTexts.findIndex((t) => TOTAL_EXPENSES.test(t));
    expect(uncategorizedIdx).toBeGreaterThan(-1);
    expect(totalExpensesIdx).toBeGreaterThan(uncategorizedIdx);
  });

  test('a paid movement without a category shows up under "Real"', async ({ page }) => {
    await startSession(page);
    await openOverviewTable(page);

    await page.getByRole('button', { name: /^(Real|Skutočnosť|Tény)$/ }).click();
    await expect(uncategorizedRow(page)).toContainText('180', SETTLE);

    // And disappears from the plan-only view, because nothing of it is still expected.
    await page.getByRole('button', { name: /^(Est|Plán|Terv)$/ }).click();
    await expect(uncategorizedRow(page)).not.toContainText('180');
  });
});
