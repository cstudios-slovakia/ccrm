import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { captureSync } from './helpers/hold';

/**
 * Settings → Company profile → System title, and where the two names show up.
 *
 * Two names, never mixed up (see src/utils/brand.ts):
 *  - the PRODUCT is "Koperniq": the sidebar's top button, the profile footer, every hint;
 *  - the SYSTEM TITLE is the company's own choice ("Lapidea"): the page header, the login
 *    heading, and the browser tab as "Lapidea (Koperniq)".
 * The field holds only the company's title: empty means "none" (the product name stands in),
 * and an empty field must save (it used to be ignored, so the old text came back on reload).
 */

const FIELD = '#settings-system-name';
const PLACEHOLDER = 'Koperniq';

async function openProfile(page: import('@playwright/test').Page, systemName: string) {
  await startSession(page);
  const sync = await captureSync(page, 2, (payload) => {
    (payload.settings as { systemName: string }).systemName = systemName;
  });
  await gotoView(page, '#settings/company/profile');
  await expect(page.locator(FIELD)).toBeVisible();
  return sync;
}

test.describe('System title', () => {
  test('no custom title: the field is empty with a Koperniq placeholder and the app is called Koperniq', async ({ page }) => {
    await openProfile(page, '');
    await expect(page.locator(FIELD)).toHaveValue('');
    await expect(page.locator(FIELD)).toHaveAttribute('placeholder', PLACEHOLDER);
    await expect.poll(() => page.title()).toContain('Koperniq');
    // never "Koperniq (Koperniq)"
    await expect.poll(() => page.title()).not.toContain('Koperniq (Koperniq)');
    await expect(page.locator('body')).not.toContainText(/\bCCRM\b/);
  });

  test('an existing install that stored "CCRM" keeps it as its title, with the product beside it', async ({ page }) => {
    await openProfile(page, 'CCRM');
    await expect(page.locator(FIELD)).toHaveValue('CCRM');
    await expect.poll(() => page.title()).toContain('CCRM (Koperniq)');
  });

  test('a custom title shows as "Lapidea (Koperniq)" in the tab and as "Lapidea" in the page header', async ({ page }) => {
    const sync = await openProfile(page, 'Lapidea');
    await expect(page.locator(FIELD)).toHaveValue('Lapidea');
    await expect.poll(() => page.title()).toContain('Lapidea (Koperniq)');
    // The page header carries the company's title, not the product name.
    await expect(page.getByRole('heading', { level: 1, name: 'Lapidea' })).toBeVisible();

    await page.locator(FIELD).fill('');
    // Autosave waits ~700 ms of quiet, then the settings push is debounced once more.
    await expect
      .poll(() => sync.pushes.map((p) => p?.settings?.systemName).includes(''), { timeout: 10_000 })
      .toBe(true);
    await expect.poll(() => page.title()).not.toContain('Lapidea');
    await expect.poll(() => page.title()).toContain('Koperniq');
    await expect(page.locator(FIELD)).toHaveValue('');
    await expect(page.locator(FIELD)).toHaveAttribute('placeholder', PLACEHOLDER);
  });

  test('typing a title saves it and the tab follows at once', async ({ page }) => {
    const sync = await openProfile(page, '');
    await page.locator(FIELD).fill('Lapidea');
    await expect.poll(() => page.title(), { timeout: 10_000 }).toContain('Lapidea (Koperniq)');
    await expect
      .poll(() => sync.pushes.map((p) => p?.settings?.systemName).includes('Lapidea'), { timeout: 10_000 })
      .toBe(true);
  });
});
