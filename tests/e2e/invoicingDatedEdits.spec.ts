import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Pins F11 and F12 of `docs/audits/derived-numbers-dated-edits-audit-2026-09-18.md`.
 *
 * F11: the price offer editor (once a 5-step wizard) used to have no date
 * input at all — every document was issued "today", valid-until computed from
 * today, with no way to back-date an offer for, say, a job finished last
 * Friday. The document's own date is now an input, and valid-until is derived
 * from it. (Payment due dates went with the invoices, which no longer live in
 * this module.)
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
 * each test creates its own through the real editor.
 */

const LEAD_NAME = 'Novák Stavby';
const BACK_DATED_ISSUE = '2026-08-01';
// addDays(issuedAt, n) is a plain calendar add — no month straddled here.
const EXPECTED_VALID_UNTIL = '2026-08-31'; // the editor's hard-coded 30 days

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

/** The date in the document's own header — the only input that carries the issue date. */
const issuedOnInput = (page: Page) => page.getByLabel(/^(Issued on|Dátum vystavenia)$/);

/** Opens the inline editor on the Standard template from the "New price offer" menu. */
async function openNewOfferEditor(page: Page) {
  await gotoView(page, '#invoices');
  await page.getByRole('button', { name: /New price offer|Nová cenová ponuka/ }).click();
  await page.getByRole('menuitem', { name: /Standard template|Štandardná šablóna/ }).click();
  await expect(page.locator('[data-offer-editor]')).toBeVisible();
}

/** Fills the required fields of the document in place and issues it. */
async function fillAndIssue(page: Page, title: string, issuedOn?: string) {
  const editor = page.locator('[data-offer-editor]');

  // Title — the first field of the document.
  await editor.locator('[data-offer-field="title"] input').fill(title);

  if (issuedOn) await issuedOnInput(page).fill(issuedOn);

  // Client — the picker sits in the recipient block.
  await page.getByRole('button', { name: /Select a client|Vyberte klienta/ }).click();
  await page.getByRole('option', { name: new RegExp(LEAD_NAME) }).click();

  // At least one line item, or issuing is refused.
  await page.getByRole('button', { name: /Custom item|Vlastná položka/ }).click();
  await page.getByPlaceholder(/Item name|Názov položky/).fill('Konzultácia');
  await page.getByRole('spinbutton', { name: /Unit price|Jedn\. cena/ }).fill('100');

  await page.getByRole('button', { name: /Issue & log in CRM|Vystaviť a zaevidovať/ }).click();
}

test.describe('Price offers — dated edits (audit F11/F12)', () => {
  test('F11: an offer can be issued for a date other than today, and valid-until follows it', async ({
    page
  }) => {
    await startSession(page);
    const pushed = recordSyncedOffers(page);
    const title = 'Ponuka — spätne datovaná';

    await openNewOfferEditor(page);
    await fillAndIssue(page, title, BACK_DATED_ISSUE);

    // The editor closed and the document is in the list, dated the day it was issued.
    await expect(page.locator('[data-offer-editor]')).toHaveCount(0);
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
    // A price offer has no payment due date — that belongs to invoices.
    expect(created.dueDate ?? null).toBeNull();
    expect(created.validUntil).toBe(EXPECTED_VALID_UNTIL);
  });

  test('F11: the issue date of an existing offer can be changed, and valid-until moves with it', async ({
    page
  }) => {
    await startSession(page);
    const pushed = recordSyncedOffers(page);
    const title = 'Ponuka — preplánovaná';

    await openNewOfferEditor(page);
    await fillAndIssue(page, title, BACK_DATED_ISSUE);
    const row = page.locator('tbody tr').filter({ hasText: title });
    await expect(row).toBeVisible();

    // Reopen it, move the issue date by four days and save — nothing else.
    await row.getByTitle(/^(Edit|Upraviť)$/).click();
    await expect(issuedOnInput(page)).toHaveValue(BACK_DATED_ISSUE);
    await issuedOnInput(page).fill('2026-08-05');
    await page.getByRole('button', { name: /Save changes|Uložiť zmeny/ }).click();

    await expect.poll(
      () => {
        const saved = [...pushed.values()].find((o) => o.title === title);
        return saved && { issuedAt: saved.issuedAt, validUntil: saved.validUntil };
      },
      { timeout: 10_000 }
    ).toEqual({ issuedAt: '2026-08-05', validUntil: '2026-09-04' });
  });

  test('F12: a status change carries the date it happened', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedOffers(page);
    const title = 'Ponuka — zmena stavu';
    const today = new Date().toISOString().slice(0, 10);

    await openNewOfferEditor(page);
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
