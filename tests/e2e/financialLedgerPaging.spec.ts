import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * The movements ledger pages as the page scrolls. The first page is 40 rows;
 * the rest arrive only when the page (`main.workspace`, the one vertical
 * scroller) reaches the footer under the table. The window itself never
 * scrolls, so a footer watched against the viewport never sees that scroll —
 * and once it is already on screen the observer does not ask again, so the
 * last short page never appears.
 */

const TOTAL = 47;
const OLDEST = 'Paging row 00';
const NEWEST = 'Paging row 46';

function pagingRecords() {
  return Array.from({ length: TOTAL }, (_, i) => {
    const date = new Date(Date.UTC(2023, 0, 1));
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const n = String(i).padStart(2, '0');
    return {
      id: `fr-page-${n}`,
      type: 'expense',
      subtype: 'material',
      title: `Paging row ${n}`,
      categoryId: 'fc-expense',
      amountPlanned: 10,
      amountReal: 10,
      currency: 'EUR',
      status: 'paid',
      issueDate: iso,
      dueDate: iso,
      paidDate: iso,
      paymentMethod: 'bank_transfer',
      isRecurring: false,
      createdBy: 'Erik',
      createdAt: `${iso}T08:00:00`,
    };
  });
}

test('scrolling the ledger loads the rows past the first page', async ({ page }) => {
  await startSession(page);
  // Registered after the session mock, so this GET wins and the mock still
  // handles everything the ledger writes back.
  await page.route('**/sync.php**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const payload = buildSyncPayload();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...payload, financialRecords: pagingRecords() }),
    });
  });

  await gotoView(page, '#financial/movements');
  await expect(page.getByRole('columnheader', { name: /Payment Status|Stav úhrady/ })).toBeVisible({
    timeout: 20_000,
  });

  const ledger = page.locator('.table-page-wrap').filter({ hasText: NEWEST });
  await expect(ledger.getByText(NEWEST)).toBeVisible();
  await expect(ledger.getByText(OLDEST)).toHaveCount(0);
  await expect(ledger.getByText(/showing 40 of 47|zobrazených 40 z 47|40 \/ 47/)).toHaveCount(1);

  // No box of its own: the page is what scrolls.
  expect(await ledger.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    const main = document.querySelector('main.workspace') as HTMLElement;
    main.scrollTop = main.scrollHeight;
  });

  await expect(ledger.getByText(/All 47 movements loaded|Všetkých 47 pohybov|47 mozgás betöltve/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(ledger.getByText(OLDEST)).toBeVisible();
});
