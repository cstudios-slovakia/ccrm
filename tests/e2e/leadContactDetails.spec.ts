import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * How we reach a lead: phone, e-mail and (for a company) a contact person.
 *
 * The fields existed on the lead and in the "add lead" form, but the detail panel
 * only showed them inside the client card — which an unlinked lead does not have —
 * and nothing in the panel could edit them. A lead created without a phone number
 * could never get one.
 *
 * Silvia is a pipeline lead with no client record, so everything here goes through
 * the lead's own form. The fixture runs in Slovak.
 */

const LEAD_HASH = '#lead-lead-silvia';

type PushedLead = { id: string; name?: string; phone?: string; email?: string; contactPerson?: string; clientId?: string | null };

/** Every lead pushed to /sync.php, newest write winning per id. */
function recordSyncedLeads(page: Page) {
  const pushed = new Map<string, PushedLead>();
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { leads?: PushedLead[] };
        for (const lead of body?.leads ?? []) pushed.set(lead.id, lead);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

test.describe('Lead detail — contact details', () => {
  test('an unlinked lead shows its own phone and e-mail in the form', async ({ page }) => {
    await startSession(page);
    await gotoView(page, LEAD_HASH);

    await expect(page.getByText('Bez klienta')).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toHaveValue('+421 900 111 222');
    await expect(page.locator('input[type="email"]')).toHaveValue('silvia@example.com');
  });

  test('phone and e-mail can be changed and are saved with the lead', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedLeads(page);
    await gotoView(page, LEAD_HASH);

    await page.getByTitle('Upraviť detaily leadu').click();
    await page.locator('input[type="tel"]').fill('+421 911 000 111');
    await page.locator('input[type="email"]').fill('silvia.new@example.com');
    await page.getByRole('button', { name: /Uložiť zmeny leadu/ }).click();

    await expect
      .poll(() => pushed.get('lead-silvia')?.phone)
      .toBe('+421 911 000 111');
    expect(pushed.get('lead-silvia')?.email).toBe('silvia.new@example.com');
    await expect(page.locator('input[type="tel"]')).toHaveValue('+421 911 000 111');
  });

  test('the contact person is offered for a company, not for a private person', async ({ page }) => {
    await startSession(page);

    // Silvia is a private person.
    await gotoView(page, LEAD_HASH);
    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.getByText('Kontaktná osoba', { exact: true })).toHaveCount(0);

    // Novák Stavby is a company and has one on file.
    await gotoView(page, '#lead-lead-novak');
    await expect(page.getByText('Kontaktná osoba', { exact: true })).toBeVisible();
    await expect(page.locator('input[value="Ján Novák"]')).toBeVisible();
  });

  test('creating a client from a lead links the two by id and carries the contact details over', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedLeads(page);
    await gotoView(page, LEAD_HASH);

    await page.getByRole('button', { name: /Vytvoriť nového klienta z leadu/ }).click();

    await expect.poll(() => pushed.get('lead-silvia')?.clientId).toMatch(/^client-/);
    const clientId = pushed.get('lead-silvia')?.clientId as string;
    const client = pushed.get(clientId);
    expect(client?.name).toBe('Silvia');
    expect(client?.phone).toBe('+421 900 111 222');
    expect(client?.email).toBe('silvia@example.com');
  });
});
