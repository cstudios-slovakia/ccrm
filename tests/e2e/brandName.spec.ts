import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { captureSync } from './helpers/hold';

/**
 * Settings → Company profile → System Brand Name, and where the name shows up.
 *
 * The product is "Koperniq". The field holds only the company's OWN choice:
 * empty means "use the default", and an empty field must save (it used to be
 * ignored, so the old text came back on reload).
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

test.describe('System Brand Name', () => {
  test('no custom name: the field is empty with a Koperniq placeholder and the app is called Koperniq', async ({ page }) => {
    await openProfile(page, '');
    await expect(page.locator(FIELD)).toHaveValue('');
    await expect(page.locator(FIELD)).toHaveAttribute('placeholder', PLACEHOLDER);
    await expect.poll(() => page.title()).toContain('Koperniq');
    await expect(page.locator('body')).not.toContainText(/\bCCRM\b/);
  });

  test('an existing install that stored "CCRM" keeps it as its custom name', async ({ page }) => {
    await openProfile(page, 'CCRM');
    await expect(page.locator(FIELD)).toHaveValue('CCRM');
    await expect.poll(() => page.title()).toContain('CCRM');
    await expect.poll(() => page.title()).not.toContain('Koperniq');
  });

  test('a custom name replaces Koperniq in the title, and clearing the field saves an empty name', async ({ page }) => {
    const sync = await openProfile(page, 'Acme Hub');
    await expect(page.locator(FIELD)).toHaveValue('Acme Hub');
    await expect.poll(() => page.title()).toContain('Acme Hub');
    await expect.poll(() => page.title()).not.toContain('Koperniq');

    await page.locator(FIELD).fill('');
    // Autosave waits ~700 ms of quiet, then the settings push is debounced once more.
    await expect
      .poll(() => sync.pushes.map((p) => p?.settings?.systemName).includes(''), { timeout: 10_000 })
      .toBe(true);
    await expect.poll(() => page.title()).toContain('Koperniq');
    await expect(page.locator(FIELD)).toHaveValue('');
    await expect(page.locator(FIELD)).toHaveAttribute('placeholder', PLACEHOLDER);
  });

  test('typing a name saves it and the title follows at once', async ({ page }) => {
    const sync = await openProfile(page, '');
    await page.locator(FIELD).fill('Acme Hub');
    await expect.poll(() => page.title(), { timeout: 10_000 }).toContain('Acme Hub');
    await expect
      .poll(() => sync.pushes.map((p) => p?.settings?.systemName).includes('Acme Hub'), { timeout: 10_000 })
      .toBe(true);
  });
});
