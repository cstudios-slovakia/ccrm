import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Finance → movements: the payment status of a movement is editable straight
 * from its ledger row. Switching into `paid` or `partially_paid` writes money,
 * so the picker has to stop and ask for the amount that was really settled
 * instead of committing a guess.
 *
 * The QA dataset runs the app in Slovak, so every label is matched in both.
 *
 * Fixture `fr-2` is the anchor: an issued invoice for Novák Stavby, planned
 * 9 200 €, nothing settled yet.
 */

const SETTLE = { timeout: 20_000 };

const ROW = 'Novák Stavby';

/** `formatMoney` groups thousands by locale — comma, dot, space or nbsp. */
const THOUSANDS = (head: number, tail: number | string) =>
  new RegExp(String(head) + '[,.\\s\\u00a0]?' + String(tail));

async function openMovements(page: Page) {
  await gotoView(page, '#financial/movements');
  await expect(
    page.getByRole('columnheader', { name: /Payment Status|Stav úhrady/ })
  ).toBeVisible(SETTLE);
}

const movementRow = (page: Page): Locator =>
  page.locator('table tbody tr').filter({ hasText: ROW }).first();

/** The row's status control — the pill-shaped trigger of its picker. */
const statusPill = (page: Page): Locator =>
  movementRow(page).getByRole('button', { expanded: false }).first();

async function pickStatus(page: Page, label: RegExp) {
  await statusPill(page).click();
  await page.getByRole('option', { name: label }).click();
}

/** The settled-amount prompt, keyed off its own amount field. */
const promptAmount = (page: Page): Locator => page.locator('#status-prompt-amount');

test.describe('Movements ledger — inline payment status', () => {
  test('marking a row paid asks for the settled amount and writes it', async ({ page }) => {
    await startSession(page);
    await openMovements(page);

    await expect(statusPill(page)).toHaveText(/Pending|Čaká na úhradu/);

    await pickStatus(page, /^(Paid|Uhradené)$/);

    // The prompt defaults to the planned figure — the common case is paid in full.
    await expect(promptAmount(page)).toHaveValue('9200', SETTLE);
    await expect(
      page.getByRole('heading', { name: /Mark as paid|Označiť ako uhradené/ })
    ).toBeVisible();

    await page.getByRole('button', { name: /Confirm payment|Potvrdiť úhradu/ }).click();

    await expect(promptAmount(page)).toHaveCount(0);
    await expect(statusPill(page)).toHaveText(/^(Paid|Uhradené)$/, SETTLE);
    // 9 200 lands in the row as its real amount, whatever the locale's separator.
    await expect(movementRow(page)).toContainText(THOUSANDS(9, 200));
  });

  test('a partial payment writes the entered amount and keeps the plan as an estimate', async ({
    page
  }) => {
    await startSession(page);
    await openMovements(page);

    await pickStatus(page, /^(Partially Paid|Čiastočne uhradené)$/);

    await expect(
      page.getByRole('heading', { name: /Record a partial payment|Zaznamenať čiastočnú úhradu/ })
    ).toBeVisible(SETTLE);

    await promptAmount(page).fill('3200');

    // 9 200 planned less 3 200 settled — the prompt says what is still owed.
    await expect(page.getByText(/Still outstanding|Zostáva doplatiť/)).toBeVisible();
    await expect(page.getByText(THOUSANDS(6, '000')).first()).toBeVisible();

    await page
      .getByRole('button', { name: /Save partial payment|Uložiť čiastočnú úhradu/ })
      .click();

    await expect(promptAmount(page)).toHaveCount(0);
    await expect(statusPill(page)).toHaveText(/Partially Paid|Čiastočne uhradené/, SETTLE);
    await expect(movementRow(page)).toContainText(THOUSANDS(3, 200));
    // The planned figure survives as the "est:" subtitle.
    await expect(movementRow(page)).toContainText(
      new RegExp('est:\\s*' + THOUSANDS(9, 200).source)
    );
  });

  test('a status that moves no money commits straight away', async ({ page }) => {
    await startSession(page);
    await openMovements(page);

    await pickStatus(page, /^(Overdue|Po splatnosti)$/);

    // No prompt: nothing was settled, so there is no amount to ask for — and
    // none is written either, so the row keeps showing its planned figure only.
    await expect(promptAmount(page)).toHaveCount(0);
    await expect(statusPill(page)).toHaveText(/Overdue|Po splatnosti/, SETTLE);
    await expect(movementRow(page)).not.toContainText(/est:/);
  });

  test('cancelling the prompt leaves the row untouched', async ({ page }) => {
    await startSession(page);
    await openMovements(page);

    const before = await statusPill(page).textContent();

    await pickStatus(page, /^(Paid|Uhradené)$/);
    await expect(promptAmount(page)).toBeVisible(SETTLE);
    await page.getByRole('button', { name: /^(Cancel|Zrušiť)$/ }).click();

    await expect(promptAmount(page)).toHaveCount(0);
    await expect(statusPill(page)).toHaveText(before!.trim(), SETTLE);
    // Nothing was settled, so nothing was written as the real amount either.
    await expect(movementRow(page)).not.toContainText(/est:/);
  });
});
