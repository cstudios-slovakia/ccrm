import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * "Show favorite leads always as first" on the leads screen.
 *
 * A favorite sits in a group of its own above the rest of the list (and as the
 * first column of the kanban board), and is *moved* there, not copied. The
 * checkbox is a display choice, so it lives with the other filters but is not
 * a filter. The fixture runs in Slovak.
 */

const NOVAK = 'Novák Stavby';

/** The checkbox is on the first filter row when it fits, otherwise under the chevron. */
async function favoritesFirstCheckbox(page: Page) {
  const box = page.getByRole('checkbox', { name: /Obľúbené leady vždy ako prvé/ });
  if (!(await box.isVisible())) {
    const more = page.getByRole('button', { name: 'Ďalšie filtre' }).locator('visible=true').first();
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  }
  await expect(box).toBeVisible({ timeout: 5_000 });
  return box;
}

async function favoriteNovak(page: Page) {
  const row = page.locator('tbody tr', { hasText: NOVAK }).first();
  await row.locator('button[title="Pridať do obľúbených"]:visible').first().click();
}

test.describe('Leads — favorites on the top', () => {
  test('list: the favorite moves into a Favorites group above the stages', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#leads');
    await favoriteNovak(page);

    // Off by default: no group, the lead stays in its stage.
    await expect(page.locator('th[scope="colgroup"]', { hasText: 'Obľúbené' })).toHaveCount(0);

    await (await favoritesFirstCheckbox(page)).check();

    const firstGroup = page.locator('th[scope="colgroup"]').first();
    await expect(firstGroup).toContainText('Obľúbené');
    await expect(firstGroup).toContainText('1');
    // Moved, not copied.
    await expect(page.locator('tbody tr:visible', { hasText: NOVAK })).toHaveCount(1);

    await (await favoritesFirstCheckbox(page)).uncheck();
    await expect(page.locator('th[scope="colgroup"]', { hasText: 'Obľúbené' })).toHaveCount(0);
    await expect(page.locator('tbody tr:visible', { hasText: NOVAK })).toHaveCount(1);
  });

  test('kanban: the favorites get a column of their own, first in line', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#leads');
    await favoriteNovak(page);
    await (await favoritesFirstCheckbox(page)).check();

    await page.getByRole('button', { name: 'Kanban' }).first().click();

    const firstColumn = page.locator('h4', { hasText: NOVAK }).first();
    await expect(firstColumn).toBeVisible();
    const headers = page.locator('span.type-overline.text-slate-800');
    await expect(headers.first()).toHaveText('Obľúbené');
    await expect(page.locator('h4', { hasText: NOVAK })).toHaveCount(1);
  });
});
