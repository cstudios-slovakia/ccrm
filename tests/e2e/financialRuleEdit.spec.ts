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

  await expect(drawer.getByText(/First payment|Prvá platba/)).toBeVisible();
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

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('a new recurring payment pays first on the date picked, every two weeks after it', async ({ page }) => {
  await startSession(page);
  await gotoView(page, '#financial/movements');
  await page.getByRole('button', { name: /New Expense|Nový výdavok/ }).first().click();
  const form = page.locator('form').filter({ hasText: /Recurring payment|Opakujúca sa platba/ }).last();
  await expect(form).toBeVisible(SETTLE);

  await form.getByText(/^(Recurring payment|Opakujúca sa platba)$/).click();
  // A rule is not a single payment: no status, issue or due date, but a first payment, prefilled with today.
  await expect(form.getByText(/^(Status|Stav úhrady)$/)).toHaveCount(0);
  await expect(form.getByText(/Issue Date|Dátum vystavenia/)).toHaveCount(0);
  const first = form.getByLabel(/^(First payment|Prvá platba)$/);
  await expect(first).toHaveValue(isoDay(0));

  // No weekday to pick: it is read off the first payment.
  await expect(form.getByText(/^(Day of the Week|Deň v týždni)$/)).toHaveCount(0);
  await first.fill(isoDay(6));
  await form.getByRole('button', { name: /^(Weekly|Týždenne)$/ }).click();
  await form.getByRole('button', { name: /^(Custom|Vlastné)$/ }).click();

  const expected = await page.evaluate(
    (days) => days.map((iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' });
    }),
    [isoDay(6), isoDay(20), isoDay(34), isoDay(48)]
  );
  await expect(form).toContainText(`Platby: ${expected.join(', ')}`);

  await form.getByPlaceholder(/Material purchase|Nákup materiálu/).fill('Dvojtýždenný servis');
  await form.locator('input[type="number"][step="0.01"]').first().fill('120');
  await page.getByRole('button', { name: /^(Create Expense|Vytvoriť výdavok)$/ }).click();
  await expect(form, 'the form saves and closes').toBeHidden(SETTLE);

  // Switch tabs in place: a reload would drop the new rule from the mocked backend.
  await page.getByRole('tab', { name: /Recurring Movements|Pravidelné pohyby/ }).click();
  const row = page.locator('table tbody tr').filter({ hasText: 'Dvojtýždenný servis' }).first();
  await expect(row).toBeVisible(SETTLE);
  await expect(row.getByText(/^(Custom|Vlastné)$/)).toBeVisible();
  await expect(row).toContainText(expected[0]);
});
