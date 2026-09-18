import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Pins F8 of `docs/audits/derived-numbers-dated-edits-audit-2026-09-18.md`:
 * the item form used to save `avgPurchasePrice` straight from an editable
 * field, silently re-valuing every unit already on hand with no date and no
 * trace. The save handler (`WarehouseView.tsx` ~1126-1144) now freezes it to
 * the existing value whenever the item has any stock on hand.
 *
 * There is no longer a live `<input>` bound to it at all (the field is only
 * shown, read-only, in the profitability calculator), so this is a
 * regression pin on the *invariant* — editing and saving the item's other
 * fields must never move the valuation KPI — verified both on screen and
 * against what the app actually pushes to `/sync.php`, the fixture's item
 * `item-tile` (940 pcs on hand at 2.40 WAP in the QA dataset).
 */

const ITEM_ID = 'item-tile';
const VALUATION_LABEL = /Total Stock Value|Hodnota zásob skladu/;

/** Every warehouse item the app pushed to /sync.php, newest write winning per id. */
function recordSyncedItems(page: Page) {
  const pushed = new Map<string, Record<string, unknown>>();
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { warehouseItems?: Record<string, unknown>[] };
        for (const item of body?.warehouseItems ?? []) pushed.set(String(item.id), item);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

const valuationCard = (page: Page) => page.getByText(VALUATION_LABEL).locator('xpath=../..');

test.describe('Warehouse — WAP freeze on stock (audit F8)', () => {
  test('editing an item that has stock on hand never moves its purchase price or the valuation KPI', async ({
    page
  }) => {
    await startSession(page);
    const pushed = recordSyncedItems(page);

    await gotoView(page, '#warehouse');
    await expect(page.getByText(VALUATION_LABEL)).toBeVisible();
    const valuationBefore = await valuationCard(page).innerText();

    await gotoView(page, `#warehouse/${ITEM_ID}`);
    await expect(page.getByRole('button', { name: /Save Changes|Uložiť zmeny/ })).toBeVisible();

    // The "Fixed Product Data" card opens locked — hold the lock button for
    // 1s to unlock it, the same as a real user would.
    const lockButton = page.getByRole('button', { name: /Locked \(Hold 1s\)|Zamknuté \(Držte 1s\)/ });
    await lockButton.dispatchEvent('mousedown');
    await expect(page.getByRole('button', { name: /Unlocked|Odomknuté/ })).toBeVisible({ timeout: 3000 });
    await lockButton.dispatchEvent('mouseup').catch(() => {});

    console.log('DEBUG labels:', JSON.stringify(await page.locator('label').allInnerTexts()));
    // No live input carries the WAP at all any more — only a read-only
    // display inside the profitability calculator. Scoped to the label's own
    // wrapping <div> (label + input sit as siblings under one parent), not a
    // document-order guess, so it can't accidentally grab an unrelated field.
    const sellPriceInput = page
      .locator('label:has-text("Suggested Sale Price"), label:has-text("Predajná cena bez DPH")')
      .locator('xpath=..')
      .locator('input')
      .first();
    await expect(sellPriceInput).toBeVisible({ timeout: 5000 });
    await sellPriceInput.fill('4.50');

    await page.getByRole('button', { name: /Save Changes|Uložiť zmeny/ }).click();

    // Back on the list, the KPI that reads `onHand × avgPurchasePrice` for
    // every item is exactly what it was — only the sell price changed.
    await gotoView(page, '#warehouse');
    await expect(page.getByText(VALUATION_LABEL)).toBeVisible();
    await expect.poll(() => valuationCard(page).innerText(), { timeout: 10_000 }).toBe(valuationBefore);

    await expect.poll(() => pushed.get(ITEM_ID)?.defaultSellPrice, { timeout: 10_000 }).toBe(4.5);
    // The purchase price the valuation is built from must be untouched.
    expect(pushed.get(ITEM_ID)?.avgPurchasePrice).toBe(2.4);
  });
});
