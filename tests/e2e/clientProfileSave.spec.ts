import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * Saving the client profile on the Clients page.
 *
 * It used to write the whole profile to every record with the client's name, which
 * wiped the phone / e-mail a lead carries for itself and copied one client's details
 * onto a look-alike lead (a different person with the same name). Now it reaches the
 * client row, leads linked to it by id (minus their own contact details) and unlinked
 * same-name leads — and nothing linked to another client.
 *
 * The fixture runs in Slovak.
 */

const NAME = 'Kováč Reality s.r.o.';

type PushedLead = { id: string; phone?: string; email?: string; name?: string };

/** The fixture dataset plus three leads called like client-kovac, and a recorder for the pushes. */
async function seedSameNameLeads(page: Page) {
  const pushed = new Map<string, PushedLead>();
  await page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const payload = buildSyncPayload();
      const lead = (id: string, extra: object) => ({
        id, name: NAME, status: 'new', source: 'website', owner: 'Erik', value: 0,
        createdAt: new Date().toISOString(), timeline: [], ...extra,
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...payload,
          leads: [
            ...payload.leads,
            lead('client-holding', { name: 'Kováč Holding', adjustment: 0 }),
            lead('lead-linked', { clientId: 'client-kovac', phone: '+421 900 000 001' }),
            lead('lead-stranger', { clientId: 'client-holding', phone: '+421 900 000 002' }),
            lead('lead-loose', { phone: '+421 900 000 003' }),
          ],
        }),
      });
    }
    try {
      const body = request.postDataJSON() as { leads?: PushedLead[] };
      for (const l of body?.leads ?? []) pushed.set(l.id, l);
    } catch {
      /* not JSON */
    }
    await route.fallback();
  });
  return pushed;
}

test.describe('Clients — saving the profile', () => {
  test('reaches the client and its own leads, never a look-alike linked elsewhere', async ({ page }) => {
    await startSession(page);
    const pushed = await seedSameNameLeads(page);
    await gotoView(page, `#client-${encodeURIComponent(NAME)}`);

    await page.getByTitle('Upraviť údaje profilu').click();
    await page.locator('form input[type="tel"]').first().fill('+421 911 777 777');
    await page.getByRole('button', { name: /Uložiť profil klienta/ }).click();

    await expect.poll(() => pushed.get('client-kovac')?.phone).toBe('+421 911 777 777');
    // unlinked same-name lead: old behaviour, still receives the update
    await expect.poll(() => pushed.get('lead-loose')?.phone).toBe('+421 911 777 777');
    // linked by id: keeps the number it carries for itself
    expect(pushed.get('lead-linked')?.phone ?? '+421 900 000 001').toBe('+421 900 000 001');
    // linked to another client: untouched
    expect(pushed.get('lead-stranger')?.phone ?? '+421 900 000 002').toBe('+421 900 000 002');
  });
});
