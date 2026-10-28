import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { SECOND_USER, buildSyncPayload } from './helpers/fixture';

/**
 * "New order" from a lead and from a client.
 *
 * Both detail pages have a "New order" button that opens the order editor inside
 * the Orders module, with a draft already attached to the customer:
 * `#orders/new?customer=<leads row id>&from=<page to come back to>`. Saving (or
 * going back) returns to the page the user started from.
 *
 * Pinned rather than left to the crawler because the crawler only proves that a
 * button opens something. What matters here is the chain behind it: the right
 * record is attached (a lead without a client carries the order itself; a client
 * record takes it directly), billing and delivery arrive filled in, the order
 * that reaches /sync.php holds that `clientId`, one "Order created" note lands
 * on the record the user started from, and the way back is the page they left —
 * for a client, its Orders tab, so the new order is visible.
 *
 * The fixture runs in Slovak. Silvia is a pipeline lead with no client record;
 * Kováč Reality is a client record (`client-kovac`) with a contact person.
 */

const LEAD_HASH = '#lead-lead-silvia';
const CLIENT_NAME = 'Kováč Reality s.r.o.';
const CLIENT_HASH = `#client-${encodeURIComponent(CLIENT_NAME)}`;

type PushedOrder = {
  id: string;
  orderNumber: string;
  clientId?: string | null;
  customerType?: string;
  billing?: { name?: string; street?: string; icDph?: string };
  delivery?: { recipient?: string; phone?: string };
  items?: unknown[];
};
type PushedLead = { id: string; timeline?: { title?: string }[] };

/** Every order and lead pushed to /sync.php, newest write winning per id. */
function recordSyncedState(page: Page) {
  const orders = new Map<string, PushedOrder>();
  const leads = new Map<string, PushedLead>();
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { orders?: PushedOrder[]; leads?: PushedLead[] };
        for (const o of body?.orders ?? []) orders.set(o.id, o);
        for (const l of body?.leads ?? []) leads.set(l.id, l);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return { orders, leads };
}

/** Adds one custom product line and saves the order the editor has open. */
async function addItemAndSave(page: Page) {
  // "Prehľad" is also a sidebar entry; the item browser's button is the one in the page.
  await page.getByRole('main').getByRole('button', { name: /^Prehľad/ }).click();
  await page.getByRole('button', { name: /\+ Vlastný tovar/ }).click();
  await page.getByRole('button', { name: /^Uložiť objednávku$/ }).click();
}

test.describe('New order from a customer', () => {
  test('a lead opens the Orders editor with the lead attached, and saving returns to the lead', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedState(page);
    await gotoView(page, LEAD_HASH);

    await page.getByRole('button', { name: /Nová objednávka/ }).click();

    // Inside the Orders module, on a draft for this lead.
    await expect(page).toHaveURL(/#orders\/new\?customer=lead-silvia&from=/);
    // A lead has no client profile yet, and the card says so.
    await expect(page.getByText('Lead (bez profilu klienta)')).toBeVisible();
    // Billing and delivery both carry the lead's street, the delivery its phone.
    await expect(page.locator('input[value="Hlavná 1"]')).toHaveCount(2);
    await expect(page.locator('input[value="+421 900 111 222"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Späť na lead/ })).toBeVisible();

    await addItemAndSave(page);

    // Back on the lead it came from.
    await expect(page).toHaveURL(/#lead-lead-silvia$|#leads\/lead-silvia$/);
    await expect(page.getByText(/Vytvorená nová objednávka: OBJ-\d{4}-\d{4}/)).toBeVisible();

    // What reached the server: the order sits on the lead itself, with one "Order created" note.
    await expect.poll(() => pushed.orders.size).toBe(1);
    const order = [...pushed.orders.values()][0];
    expect(order.clientId).toBe('lead-silvia');
    expect(order.customerType).toBe('client');
    expect(order.billing?.name).toBe('Silvia');
    expect(order.delivery?.phone).toBe('+421 900 111 222');
    expect(order.items).toHaveLength(1);
    await expect
      .poll(() => (pushed.leads.get('lead-silvia')?.timeline ?? []).filter((e) => e.title?.includes(order.orderNumber)).length)
      .toBe(1);
  });

  test('a client opens the editor on its record, and saving lands on its Orders tab with the order listed', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedState(page);
    await gotoView(page, CLIENT_HASH);

    await page.getByRole('button', { name: /^Nová objednávka$/ }).first().click();

    await expect(page).toHaveURL(/#orders\/new\?customer=client-kovac&from=/);
    // A lead has no client profile yet, and the card says so.
    await expect(page.getByText('Lead (bez profilu klienta)')).toBeVisible();
    await expect(page.locator('input[value="Štefánikova 8"]')).toHaveCount(2);
    await expect(page.locator('input[value="45678901"]')).toHaveCount(1);
    await expect(page.locator('input[value="Marek Kováč"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Späť na klienta/ })).toBeVisible();

    await addItemAndSave(page);

    // The client's Orders tab, with the order we just made in it.
    await expect(page).toHaveURL(/#client-.*tab=orders|#clients\/.*tab=orders/);
    await expect.poll(() => pushed.orders.size).toBe(1);
    const order = [...pushed.orders.values()][0];
    expect(order.clientId).toBe('client-kovac');
    expect(order.billing?.icDph).toBe('SK2045678901');
    await expect(page.getByText(order.orderNumber)).toBeVisible();
  });

  test('going back from the draft returns to the page it came from and saves nothing', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedState(page);
    await gotoView(page, LEAD_HASH);

    await page.getByRole('button', { name: /Nová objednávka/ }).click();
    await page.getByRole('button', { name: /Späť na lead/ }).click();

    await expect(page).toHaveURL(/#lead-lead-silvia$|#leads\/lead-silvia$/);
    expect(pushed.orders.size).toBe(0);
  });

  test('a draft reached from an outside address only goes back to a client or lead page', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#orders/new?customer=lead-silvia&from=' + encodeURIComponent('settings/general'));

    // An unsafe `from` is ignored: the editor falls back to the Orders list.
    await expect(page.getByRole('button', { name: /Späť na objednávky/ })).toBeVisible();
    await page.getByRole('button', { name: /Späť na objednávky/ }).click();
    await expect(page).toHaveURL(/#orders$/);
  });

  test('a user who may not edit orders sees no New order button', async ({ page }) => {
    await startSession(page, { user: SECOND_USER });
    // The fixture's Manager role stores no `orders` key, so it falls back to the legacy
    // default (edit). Give it an explicit "nothing", and a role that may edit leads.
    await page.route('**/sync.php**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const payload = buildSyncPayload();
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...payload,
          roles: payload.roles.map((r) =>
            r.name === 'Manager' ? { ...r, permissions: { ...r.permissions, leads: 'edit', orders: 'nothing' } } : r,
          ),
        }),
      });
    });
    await gotoView(page, LEAD_HASH);

    // The lead is open and editable ...
    await expect(page.getByTitle('Upraviť detaily leadu')).toBeVisible();
    // ... but there is no way into an order from it.
    await expect(page.getByRole('button', { name: /Nová objednávka/ })).toHaveCount(0);
  });
});
