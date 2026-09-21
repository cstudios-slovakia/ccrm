import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Finance → Recurring → edit a rule: the drawer offers only what holds for
 * every payment the rule makes. A payment's status and paid amount cannot be
 * known ahead, so they belong to the single-payment drawer, not here.
 *
 * The anchor is `fr-4`, the monthly wages rule ("Mzdy"), active with no end.
 * The QA dataset runs the app in Slovak, so every label is matched in both.
 */

const SETTLE = { timeout: 20_000 };
const WAGES = 'Mzdy';

async function openRuleEdit(page: Page) {
  await gotoView(page, '#financial/recurring');
  const row = page.locator('table tbody tr').filter({ hasText: WAGES }).first();
  await expect(row).toBeVisible(SETTLE);
  await row.getByTitle(/Edit recurring expense|Upraviť pravidlo/).click();
  const drawer = page.locator('form#transaction-edit-form');
  await expect(drawer).toBeVisible(SETTLE);
  return drawer;
}

test('the rule drawer shows only rule-wide fields', async ({ page }) => {
  await startSession(page);
  const drawer = await openRuleEdit(page);

  await expect(drawer.getByText(/^(Status|Stav úhrady)$/)).toHaveCount(0);
  await expect(drawer.getByText(/^(Paid Amount|Skutočná suma)$/)).toHaveCount(0);
  await expect(drawer.getByText(/Issue Date|Dátum vystavenia/)).toHaveCount(0);
  await expect(drawer.getByText(/Due Date|Dátum splatnosti/)).toHaveCount(0);

  await expect(drawer.getByText(/Start date|Dátum začiatku/)).toBeVisible();
  await expect(drawer.getByText(/^(End date|Dátum ukončenia)$/)).toBeVisible();
  await expect(drawer.getByText(/Planned Amount|Plánovaná suma/)).toBeVisible();

  // The schedule is always shown — a rule cannot be switched to one-off here —
  // and the only switch is the rule's on/off, which starts on.
  await expect(drawer.getByText(/Recurrence Frequency|Periodicita opakovania/)).toBeVisible();
  const toggles = drawer.locator('input[type="checkbox"]');
  await expect(toggles).toHaveCount(1);
  await expect(toggles.first()).toBeChecked();
});

test('switching the rule to inactive pauses it from today', async ({ page }) => {
  await startSession(page);
  const drawer = await openRuleEdit(page);

  await drawer.getByText(/^(Active|Aktívne)$/).click();
  await expect(drawer.getByText(/^(Inactive|Neaktívne)$/)).toBeVisible();

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  await expect(drawer.locator('input[type="date"]').nth(1)).toHaveValue(today);

  await page.getByRole('button', { name: /Save Changes|Uložiť zmeny/ }).click();
  const row = page.locator('table tbody tr').filter({ hasText: WAGES }).first();
  await expect(row.getByText(/^(Paused|Pozastavené)$/)).toBeVisible(SETTLE);
});
