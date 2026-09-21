import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Pins F11 and F12 of `docs/audits/derived-numbers-dated-edits-audit-2026-09-18.md`.
 *
 * F11: the 5-step wizard used to have no date input at all — every document
 * was issued "today", due/valid-until computed from today, with no way to
 * back-date an invoice for, say, a job finished last Friday. Step 1 now has
 * an "Issued on" field, and due date / valid-until are derived from it.
 *
 * F12: `handleChangeStatus` used to write `{ ...o, status }` and nothing
 * else — a status change carried no date, so "invoiced this month" could
 * not be answered. It now also stamps `statusChangedAt`.
 *
 * Neither field is displayed anywhere in the UI yet (this pins the fix at
 * the data level, the same way the unit pinning test does for the ledger),
 * so both are verified off what the app actually pushes to `/sync.php`,
 * the same pattern `projectRating.spec.ts` uses for `rating`.
 *
 * The QA dataset runs in Slovak and has no seeded invoicing documents, so
 * each test creates its own through the real wizard.
 */

const LEAD_NAME = 'Novák Stavby';
const BACK_DATED_ISSUE = '2026-08-01';
// addDays(issuedAt, n) is a plain calendar add — no month straddled here.
const EXPECTED_DUE_DATE = '2026-08-15'; // fixture has no defaultPaymentDueDays override, so the 14-day fallback applies
const EXPECTED_VALID_UNTIL = '2026-08-31'; // the wizard's hard-coded 30 days

/** Every invoicing document the app pushed to /sync.php, newest write winning per id. */
function recordSyncedOffers(page: Page) {
  const pushed = new Map<string, Record<string, unknown>>();
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { invoicesOffers?: Record<string, unknown>[] };
        for (const offer of body?.invoicesOffers ?? []) pushed.set(String(offer.id), offer);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

async function openNewDocumentWizard(page: Page) {
  await gotoView(page, '#invoices');
  await page.getByRole('button', { name: /New document|Nový doklad/ }).click();
  await expect(page.getByText(/Step 1 of 5|Krok 1 z 5/)).toBeVisible();
}

/** Fills the required fields of every step and issues the document. */
async function fillAndIssue(page: Page, title: string, issuedOn?: string) {
  // Step 1 — document type & format (price offer is the default selection).
  const titleInput = page.locator('label:has-text("Document title"), label:has-text("Názov dokladu")').locator('xpath=following::input[1]');
  await titleInput.fill(title);

  if (issuedOn) {
    const issuedOnInput = page
      .locator('label:has-text("Issued on"), label:has-text("Dátum vystavenia")')
      .locator('xpath=following::input[@type="date"][1]');
    await issuedOnInput.fill(issuedOn);
  }

  await page.getByRole('button', { name: /Continue|Pokračovať/ }).click();

  // Step 2 — client.
  await expect(page.getByText(/Step 2 of 5|Krok 2 z 5/)).toBeVisible();
  await page.getByRole('button', { name: /Select a client|Vyberte klienta/ }).click();
  await page.getByRole('option', { name: new RegExp(LEAD_NAME) }).click();
  await page.getByRole('button', { name: /Continue|Pokračovať/ }).click();

  // Step 3 — at least one line item, or issuing is refused.
  await expect(page.getByText(/Step 3 of 5|Krok 3 z 5/)).toBeVisible();
  await page.getByRole('button', { name: /Custom item|Vlastná položka/ }).click();
  await page.getByPlaceholder(/Item name|Názov položky/).fill('Konzultácia');
  const unitPriceInput = page
    .locator('label:has-text("Unit price"), label:has-text("Jedn. cena")')
    .locator('xpath=following::input[1]');
  await unitPriceInput.fill('100');
  await page.getByRole('button', { name: /Continue|Pokračovať/ }).click();

  // Step 4 — parameters, nothing required.
  await expect(page.getByText(/Step 4 of 5|Krok 4 z 5/)).toBeVisible();
  await page.getByRole('button', { name: /Continue|Pokračovať/ }).click();

  // Step 5 — live preview & issue.
  await expect(page.getByText(/Step 5 of 5|Krok 5 z 5/)).toBeVisible();
  await page.getByRole('button', { name: /Issue & log in CRM|Vystaviť a zaevidovať/ }).click();
}

test.describe('Invoicing — dated edits (audit F11/F12)', () => {
  test('F11: a document can be issued for a date other than today, and due/valid-until follow it', async ({
    page
  }) => {
    await startSession(page);
    const pushed = recordSyncedOffers(page);
    const title = 'Ponuka — spätne datovaná';

    await openNewDocumentWizard(page);
    await fillAndIssue(page, title, BACK_DATED_ISSUE);

    // The wizard closed and the document is in the list, dated the day it was issued.
    await expect(page.getByText(/Step 5 of 5|Krok 5 z 5/)).toHaveCount(0);
    const row = page.locator('tbody tr').filter({ hasText: title });
    await expect(row).toBeVisible();

    await expect.poll(
      () => {
        for (const offer of pushed.values()) {
          if (offer.title === title) return offer;
        }
        return undefined;
      },
      { timeout: 10_000 }
    ).not.toBeUndefined();

    const created = [...pushed.values()].find((o) => o.title === title)!;
    expect(created.issuedAt).toBe(BACK_DATED_ISSUE);
    expect(created.dueDate).toBe(EXPECTED_DUE_DATE);
    expect(created.validUntil).toBe(EXPECTED_VALID_UNTIL);
  });

  test('F11: the issue date of an existing document can be changed, and due/valid-until move with it', async ({
    page
  }) => {
    await startSession(page);
    const pushed = recordSyncedOffers(page);
    const title = 'Ponuka — preplánovaná';

    await openNewDocumentWizard(page);
    await fillAndIssue(page, title, BACK_DATED_ISSUE);
    const row = page.locator('tbody tr').filter({ hasText: title });
    await expect(row).toBeVisible();

    // Reopen it, move the issue date by four days and save — nothing else.
    await row.getByTitle(/^(Edit|Upraviť)$/).click();
    const issuedOnInput = page
      .locator('label:has-text("Issued on"), label:has-text("Dátum vystavenia")')
      .locator('xpath=following::input[@type="date"][1]');
    await expect(issuedOnInput).toHaveValue(BACK_DATED_ISSUE);
    await issuedOnInput.fill('2026-08-05');
    for (let step = 2; step <= 5; step++) {
      await page.getByRole('button', { name: /Continue|Pokračovať/ }).click();
      await expect(page.getByText(new RegExp(`Step ${step} of 5|Krok ${step} z 5`))).toBeVisible();
    }
    await page.getByRole('button', { name: /Save changes|Uložiť zmeny/ }).click();

    await expect.poll(
      () => {
        const saved = [...pushed.values()].find((o) => o.title === title);
        return saved && { issuedAt: saved.issuedAt, dueDate: saved.dueDate, validUntil: saved.validUntil };
      },
      { timeout: 10_000 }
    ).toEqual({ issuedAt: '2026-08-05', dueDate: '2026-08-19', validUntil: '2026-09-04' });
  });

  test('F12: sent / approved / invoiced / cancelled carry the date they happened', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedOffers(page);
    const title = 'Ponuka — zmena stavu';
    const today = new Date().toISOString().slice(0, 10);

    await openNewDocumentWizard(page);
    await fillAndIssue(page, title);

    const row = page.locator('tbody tr').filter({ hasText: title });
    await expect(row).toBeVisible();

    // Newly issued, no status change yet — nothing to stamp.
    await expect.poll(
      () => [...pushed.values()].find((o) => o.title === title),
      { timeout: 10_000 }
    ).not.toBeUndefined();
    expect([...pushed.values()].find((o) => o.title === title)!.statusChangedAt ?? null).toBeNull();

    // Move it to "sent" from the row's own status picker.
    await row.getByRole('button', { expanded: false }).first().click();
    await page.getByRole('option', { name: /^(Sent|Odoslaná)$/ }).click();

    await expect.poll(
      () => [...pushed.values()].find((o) => o.title === title)?.status,
      { timeout: 10_000 }
    ).toBe('sent');
    expect([...pushed.values()].find((o) => o.title === title)!.statusChangedAt).toBe(today);
  });
});
