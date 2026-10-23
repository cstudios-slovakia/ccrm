import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';
import { holdToConfirm } from './helpers/hold';

/**
 * Price levels, and the richer product data (VAT per item, package size, weight,
 * alternative codes, an external reference).
 *
 * Pinned as journeys because what matters is what reaches the server (levels, the
 * per-level prices, a client's level) and what a user is shown when they pick a
 * product for a client on a level: that client's price, the product's own VAT,
 * and a match on an alternative code.
 *
 * The dataset's `item-tile` (3.90 €/ks, KRY-001) is given a wholesale price, 10 % VAT,
 * a pack size and two alternative codes; the client `lead-novak` is put on the
 * wholesale level. The fixture runs in Slovak.
 */

const ITEM_ID = 'item-tile';
const LEVELS = [
  { id: 'pl-retail', name: 'Maloobchod' },
  { id: 'pl-wholesale', name: 'Veľkoobchod' },
];

const COMPANY = {
  companyName: 'Test Stavby s.r.o.', street: 'Hlavná 1', city: 'Bratislava', postalCode: '81101', country: 'Slovakia',
  companyId: '11223344', taxId: '2011223344', vatId: 'SK2011223344', email: 'info@teststavby.sk', phone: '+421 900 000 000',
  website: 'teststavby.sk', iban: 'SK00 0000 0000 0000 0000 0000', swift: 'TESTSKBX', bankName: 'Testbanka',
  defaultPaymentDueDays: 14, defaultVatRate: 23, vatRates: [23, 10, 0], defaultWarrantyText: '', defaultDurationText: '',
  defaultNextSteps: '', defaultSocialProof: '', defaultUspCards: [],
};

/** Puts levels, a priced item and a client on a level into the mocked `GET /sync.php`. */
async function seed(page: Page, opts: { levels?: typeof LEVELS } = {}) {
  await page.route('**/sync.php**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const base = buildSyncPayload();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...base,
        warehouseItems: base.warehouseItems.map((w: Record<string, unknown>) =>
          w.id === ITEM_ID
            ? {
                ...w,
                vatRate: 10,
                priceLevels: { 'pl-wholesale': 3.1 },
                packQuantity: 50,
                packUnit: 'pal',
                altCodes: ['BR-100', 'SUP/77'],
                externalSource: 'mrp',
                externalId: '39',
              }
            : w,
        ),
        leads: base.leads.map((l: Record<string, unknown>) => (l.id === 'lead-novak' ? { ...l, priceLevelId: 'pl-wholesale' } : l)),
        settings: { ...base.settings, companyBillingSettings: COMPANY, priceLevels: opts.levels ?? LEVELS },
      }),
    });
  });
}

type Pushed = {
  priceLevels?: { id: string; name: string }[];
  items: Map<string, Record<string, unknown>>;
};

function recordPushes(page: Page): Pushed {
  const pushed: Pushed = { items: new Map() };
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as {
          settings?: { priceLevels?: Pushed['priceLevels'] };
          warehouseItems?: Record<string, unknown>[];
        };
        if (body?.settings?.priceLevels) pushed.priceLevels = body.settings.priceLevels;
        for (const it of body?.warehouseItems ?? []) pushed.items.set(String(it.id), it);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

const levelRow = (page: Page, id: string) => page.getByTestId(`price-level-row-${id}`);

test.describe('Price levels', () => {
  test('levels are added, renamed and removed in settings, and pushed to the server', async ({ page }) => {
    await startSession(page);
    await seed(page, { levels: [] });
    const pushed = recordPushes(page);
    await gotoView(page, '#settings/invoicing');
    await expect(page.getByTestId('price-level-settings')).toBeVisible();

    await page.getByLabel('Nová cenová hladina').fill('Partner');
    await page.getByRole('button', { name: 'Pridať hladinu' }).click();
    await expect(levelRow(page, 'pl-partner')).toContainText('Partner');
    await expect.poll(() => pushed.priceLevels, { timeout: 10_000 }).toEqual([{ id: 'pl-partner', name: 'Partner' }]);

    await page.getByLabel('Nová cenová hladina').fill('Veľkoobchod');
    await page.getByRole('button', { name: 'Pridať hladinu' }).click();
    await expect.poll(() => (pushed.priceLevels ?? []).map((l) => l.id), { timeout: 10_000 }).toEqual(['pl-partner', 'pl-velkoobchod']);

    // Reorder: the second one moves up.
    await levelRow(page, 'pl-velkoobchod').getByTitle('Posunúť vyššie').click();
    await expect.poll(() => (pushed.priceLevels ?? []).map((l) => l.id), { timeout: 10_000 }).toEqual(['pl-velkoobchod', 'pl-partner']);

    // Rename: the id items and clients point at never moves.
    await levelRow(page, 'pl-partner').getByTitle('Premenovať').click();
    const input = levelRow(page, 'pl-partner').locator('input');
    await input.fill('Partneri');
    await input.press('Enter');
    await expect.poll(() => pushed.priceLevels?.find((l) => l.id === 'pl-partner')?.name, { timeout: 10_000 }).toBe('Partneri');

    await holdToConfirm(levelRow(page, 'pl-partner').getByRole('button', { name: /^Zmazať:/ }));
    await expect(levelRow(page, 'pl-partner')).toHaveCount(0);
    await expect.poll(() => (pushed.priceLevels ?? []).map((l) => l.id), { timeout: 10_000 }).toEqual(['pl-velkoobchod']);
    await page.screenshot({ path: 'test-results/price-levels-settings.png', fullPage: false });
  });
});

test.describe('Product data', () => {
  test('the product form shows and saves VAT, package size, weight, alternative codes and level prices', async ({ page }) => {
    await startSession(page);
    await seed(page);
    const pushed = recordPushes(page);
    await gotoView(page, `#warehouse/${ITEM_ID}`);

    const extras = page.getByTestId('item-extras');
    await expect(extras).toBeVisible();
    // What the item already carries.
    await expect(extras.getByLabel('Sadzba DPH tovaru')).toHaveValue('10');
    await expect(extras.getByLabel('Alternatívne kódy')).toHaveValue('BR-100, SUP/77');
    await expect(extras.getByLabel('Počet jednotiek v balení')).toHaveValue('50');
    await expect(page.getByTestId('item-level-price-pl-wholesale').locator('input')).toHaveValue('3.1');
    await expect(page.getByTestId('item-level-price-pl-retail').locator('input')).toHaveValue('');
    // The external reference is shown, read-only.
    await expect(page.getByTestId('item-external-ref')).toContainText('mrp / 39');
    await expect(page.getByTestId('item-external-ref').locator('input')).toHaveCount(0);

    // The card opens locked: hold the lock for 1 s to unlock it. Only the press is sent — the button
    // is replaced by "Unlocked" the moment the hold completes, so a release has nothing to land on.
    await page.getByRole('button', { name: /Locked \(Hold 1s\)|Zamknuté \(Držte 1s\)/ }).dispatchEvent('mousedown');
    await expect(page.getByRole('button', { name: /Unlocked|Odomknuté/ })).toBeVisible({ timeout: 3000 });

    await extras.getByLabel('Sadzba DPH tovaru').selectOption({ index: 0 });
    await extras.getByLabel('Alternatívne kódy').fill('BR-100, NEW-5');
    await extras.getByLabel('Hmotnosť v kilogramoch').fill('1,25');
    await page.getByTestId('item-level-price-pl-retail').locator('input').fill('3,6');
    await page.getByRole('button', { name: /Save Changes|Uložiť zmeny/ }).click();

    await expect.poll(() => pushed.items.get(ITEM_ID)?.altCodes, { timeout: 10_000 }).toEqual(['BR-100', 'NEW-5']);
    const saved = pushed.items.get(ITEM_ID)!;
    expect(saved.vatRate).toBeNull(); // back to "company default"
    expect(saved.weightKg).toBe(1.25);
    expect(saved.packQuantity).toBe(50);
    expect(saved.priceLevels).toEqual({ 'pl-wholesale': 3.1, 'pl-retail': 3.6 });
    // The external reference round-trips untouched.
    expect(saved.externalSource).toBe('mrp');
    expect(saved.externalId).toBe('39');
  });

  test('the warehouse list finds a product by an alternative code', async ({ page }) => {
    await startSession(page);
    await seed(page);
    await gotoView(page, '#warehouse');
    const search = page.getByPlaceholder(/Hľadať podľa názvu, SKU/);
    await search.fill('SUP/77');
    await expect(page.getByRole('link', { name: 'Betónová krytina antracit' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Difúzna fólia/ })).toHaveCount(0);
  });
});

test.describe('Picking a product for a client on a price level', () => {
  test('the offer editor offers the client\'s price and the item\'s VAT, and finds an alternative code', async ({ page }) => {
    await startSession(page);
    await seed(page);
    await gotoView(page, '#invoices');
    await page.getByRole('button', { name: /New price offer|Nová cenová ponuka/ }).click();
    await page.getByRole('menuitem', { name: /Standard template|Štandardná šablóna/ }).click();
    const editor = page.locator('[data-offer-editor]');
    await expect(editor).toBeVisible();

    await editor.getByRole('button', { name: /Select a client|Vyberte klienta/ }).click();
    await page.getByRole('option', { name: /Novák Stavby/ }).click();

    // Found by an alternative code; the listed price is the wholesale one, with the pack hint.
    const picker = editor.getByPlaceholder(/Add a product from the warehouse|Pridať tovar zo skladu/).first();
    await picker.fill('BR-100');
    const option = page.getByRole('option', { name: /Betónová krytina antracit/ });
    await expect(option).toBeVisible();
    await expect(option).toContainText(/3,10/);
    await expect(option).not.toContainText(/3,90/);
    await expect(option).toContainText('1 pal = 50 ks');
    await option.click();

    // The line carries the level price; the item's own 10 % VAT is prefilled (the company default is 23 %).
    const document_ = editor.locator('[data-offer-editing]');
    await expect(document_).toContainText(/3,10/);
    await expect
      .poll(() => document_.locator('input, select').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)), { timeout: 5000 })
      .toContain('10');
  });
});
