import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Finance → a record's VAT rate. The finance form used to store a `taxRate` it
 * never showed (always 20). It now offers the rates configured in Settings →
 * Billing, and a new record starts at the company's default rate.
 *
 * The anchor is `fr-4`, the monthly wages rule ("Mzdy"). The QA dataset runs the
 * app in Slovak, so every label is matched in both languages.
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

test('a finance record shows its VAT rate and the rate chosen is what is saved', async ({ page }) => {
  await startSession(page);
  const pushed = new Map<string, Record<string, unknown>>();
  await page.route('**/sync.php**', async (route) => {
    if (route.request().method() !== 'GET') {
      try {
        const body = route.request().postDataJSON() as { financialRecords?: Record<string, unknown>[] };
        for (const r of body?.financialRecords ?? []) pushed.set(String(r.id), r);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });

  const drawer = await openRuleEdit(page);
  const field = drawer.locator('div').filter({ has: page.getByText(/^(VAT rate|Sadzba DPH)$/) }).last();
  await expect(field).toBeVisible();

  // The picker lists the configured rates, and the rule's current one is among them.
  await field.getByRole('button').first().click();
  const options = page.getByRole('option');
  const labels = await options.allTextContents();
  expect(labels.length).toBeGreaterThan(1);
  expect(labels.every((label) => /^\d+(\.\d+)? %$/.test(label.trim()))).toBe(true);

  // Pick a rate other than the first, save, and read it back from what was pushed.
  const chosen = labels[labels.length - 1].trim();
  await options.last().click();
  await page.getByRole('button', { name: /Save Changes|Uložiť zmeny/ }).click();
  await expect
    .poll(() => pushed.get('fr-4')?.taxRate, { timeout: 10_000 })
    .toBe(parseFloat(chosen));
});
