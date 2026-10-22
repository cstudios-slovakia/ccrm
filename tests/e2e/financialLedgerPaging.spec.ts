import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * The movements ledger pages inside its own scroll box. The first page is 40
 * rows; the rest arrive only when that box is scrolled to the footer. A footer
 * parked under the scrollbar, watched against the window, never sees that
 * scroll — and once it is already on screen the observer does not ask again,
 * so the last short page never appears.
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

  const scroller = page.locator('.table-sticky-scroll').filter({ hasText: NEWEST });
  await expect(scroller.getByText(NEWEST)).toBeVisible();
  await expect(scroller.getByText(OLDEST)).toHaveCount(0);
  await expect(scroller.getByText(/showing 40 of 47|zobrazených 40 z 47|40 \/ 47/)).toHaveCount(1);

  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  await expect(scroller.getByText(/All 47 movements loaded|Všetkých 47 pohybov|47 mozgás betöltve/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(scroller.getByText(OLDEST)).toBeVisible();
});
