import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Finance configuration: the movement categories (in Settings → Finance, and
 * behind the Finance screen's own Settings button — everyone who can use the
 * screen can edit them there), and the switch for editing a payment's status
 * straight from the movements ledger, which is off by default.
 *
 * The categories used to be a tab of the Finance screen. What the categories
 * are is configuration, so the tab is gone and a deep link to it must not be
 * left dangling.
 *
 * The fixture runs in Slovak, so every label is matched in both languages.
 * `fr-2` (an issued invoice for Novák Stavby, still pending) is the ledger row
 * the inline-edit tests look at.
 */

const SETTLE = { timeout: 20_000 };

const ROW = 'Novák Stavby';
const CATEGORY_NAME = 'QA Finance Category';

const inlineEditSwitch = (page: Page): Locator =>
  page.getByText(/^(Inline editing|Úpravy priamo v riadku)$/);

const movementRow = (page: Page): Locator =>
  page.locator('table tbody tr').filter({ hasText: ROW }).first();

async function openMovements(page: Page) {
  await gotoView(page, '#financial/movements');
  await expect(
    page.getByRole('columnheader', { name: /Payment Status|Stav úhrady/ })
  ).toBeVisible(SETTLE);
}

test.describe('Settings → Finance', () => {
  test('the Finance tab holds the categories, the inline-edit switch and the currency', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/finance');

    await expect(
      page.getByRole('heading', { name: /Movement Categories|Kategórie finančných pohybov/ })
    ).toBeVisible(SETTLE);
    await expect(inlineEditSwitch(page)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^(Currency|Mena|Pénznem)$/ })
    ).toBeVisible();
  });

  test('a category added here is saved to the tree', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#settings/finance');

    await page.getByPlaceholder(/e\.g\. Meta Ads|napr\. Meta Ads|pl\. Google Ads/).fill(CATEGORY_NAME);
    await page.getByRole('button', { name: /Add Category|Pridať kategóriu/ }).click();

    await expect(page.getByText(CATEGORY_NAME, { exact: true })).toBeVisible(SETTLE);
  });

  test('the Finance screen has no categories tab, but a Settings button that opens them', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#financial');

    await expect(page.getByRole('tab', { name: /Movements|Pohyby/ }).first()).toBeVisible(SETTLE);
    await expect(
      page.getByRole('tab', { name: /Movement Categories|Kategórie pohybov|Mozgási kategóriák/ })
    ).toHaveCount(0);

    // Settings swaps the screen for the category tree, with one way back.
    await page.getByRole('button', { name: /^(Settings|Nastavenia|Beállítások)$/ }).click();
    await expect(
      page.getByRole('heading', { name: /Movement Categories|Kategórie finančných pohybov/ })
    ).toBeVisible(SETTLE);
    await expect(page.getByRole('tab')).toHaveCount(0);

    await page.getByPlaceholder(/e\.g\. Meta Ads|napr\. Meta Ads|pl\. Google Ads/).fill(CATEGORY_NAME + ' 2');
    await page.getByRole('button', { name: /Add Category|Pridať kategóriu/ }).click();
    await expect(page.getByText(CATEGORY_NAME + ' 2', { exact: true })).toBeVisible(SETTLE);

    await page.getByRole('button', { name: /Back to finance|Späť na financie|Vissza a pénzügyekhez/ }).click();
    await expect(page.getByRole('tab').first()).toBeVisible(SETTLE);

    // An old bookmark lands on the overview instead of an empty screen.
    await gotoView(page, '#financial/categories');
    await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
  });

  test('inline editing is off by default and the switch turns the ledger status picker on', async ({ page }) => {
    await startSession(page);

    // Off by default: the status is a plain badge, clicking it opens nothing.
    await openMovements(page);
    await movementRow(page).getByText(/Pending|Čaká na úhradu/).click();
    await expect(page.getByRole('option')).toHaveCount(0);
    // The status is still shown — only the picker is absent.
    await expect(movementRow(page).getByText(/Pending|Čaká na úhradu/)).toBeVisible();

    await gotoView(page, '#settings/finance');
    await inlineEditSwitch(page).click();

    await openMovements(page);
    await movementRow(page).getByText(/Pending|Čaká na úhradu/).click();
    await expect(page.getByRole('option').first()).toBeVisible(SETTLE);
  });
});
