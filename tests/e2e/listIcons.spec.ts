import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * Icons in front of list labels — the Slovak / Hungarian flag on a lead source, carried
 * over from a customer's old system where it told .sk leads from .hu leads.
 *
 * The icons have their own endpoint (api/list_icons.php), mocked here. What matters to a
 * user: the icon picked in Settings shows in the source chip there and in front of the
 * source in the leads list, and picking another one saves just that one change.
 * The fixture runs in Slovak, as the admin Erik; its lead sources include "website".
 */

async function mockListIcons(page: Page, initial: Record<string, Record<string, string>>) {
  const posted: Record<string, unknown>[] = [];
  let icons = structuredClone(initial);
  await page.route('**/api/list_icons.php**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { kind: string; key: string; icon: string | null };
      posted.push(body);
      const entries = { ...(icons[body.kind] ?? {}) };
      if (body.icon) entries[body.key.toLowerCase()] = body.icon;
      else delete entries[body.key.toLowerCase()];
      icons = { ...icons, [body.kind]: entries };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, icons }) });
  });
  return posted;
}

const useHrefs = (page: Page, scope: string) =>
  page.locator(`${scope} use`).evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));

test.describe('List icons', () => {
  test('a lead source shows its flag in Settings and in the leads list, and a new pick is saved', async ({ page }) => {
    await startSession(page);
    const posted = await mockListIcons(page, { leadSources: { website: 'flag-slovakia' } });

    await gotoView(page, '#settings/leads/sources');
    const row = page.locator('tr', { has: page.getByText('website', { exact: true }) }).first();
    await expect(row).toBeVisible();
    // the chip carries the flag as a picture from the sprite, not as an emoji character
    await expect.poll(() => useHrefs(page, 'tr:has-text("website")')).toContainEqual(expect.stringMatching(/list-icons\.svg\?v=\w+#flag-slovakia$/));

    // pick the Hungarian flag instead
    await row.locator('[data-list-icon-picker="leadSources"]').click();
    const panel = page.getByRole('dialog', { name: 'Vybrať ikonu' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Vlajky')).toBeVisible();
    await page.screenshot({ path: 'test-results/list-icons-picker.png', fullPage: false });
    await panel.getByRole('button', { name: 'Flag hungary' }).click();
    await expect(panel).toBeHidden();

    await expect.poll(() => posted.at(-1)).toEqual({ kind: 'leadSources', key: 'website', icon: 'flag-hungary' });
    await expect.poll(() => useHrefs(page, 'tr:has-text("website")')).toContainEqual(expect.stringMatching(/#flag-hungary$/));

    // a source with no icon offers the empty slot, and "No icon" clears one
    await row.locator('[data-list-icon-picker="leadSources"]').click();
    await page.getByRole('dialog', { name: 'Vybrať ikonu' }).getByRole('button', { name: 'Bez ikony' }).click();
    await expect.poll(() => posted.at(-1)).toEqual({ kind: 'leadSources', key: 'website', icon: null });
  });

  test('the leads list puts the icon in front of the source', async ({ page }) => {
    await startSession(page);
    await mockListIcons(page, { leadSources: { website: 'flag-slovakia', facebook: 'megaphone' } });
    await gotoView(page, '#leads');
    await expect.poll(async () => (await useHrefs(page, 'main')).filter((h) => /#(flag-slovakia|megaphone)$/.test(h)).length, { timeout: 15_000 }).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/list-icons-leads.png', fullPage: false });
  });
});
