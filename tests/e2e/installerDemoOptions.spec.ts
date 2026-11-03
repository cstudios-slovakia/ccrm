import { expect, test, type Page } from '@playwright/test';
import { gotoView, readViewState, startSession } from './helpers/appDriver';

/**
 * Installer step 2 (docs/DEMO-MODE.md, phase 2): Demo asks for the demo data
 * language and the currency, Fresh asks for the currency only, and the POST to
 * /api/setup.php carries `systemLanguage`, `demoLanguage` and `currency`.
 * Also: the app works with zero divisions (B13), which is what a fresh
 * install starts with.
 */

async function openInstallerStep2(page: Page) {
  await page.route('**/sync.php**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installed: false }) }),
  );
  const posts: Record<string, unknown>[] = [];
  await page.route('**/api/setup.php**', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.type !== 'test_only') posts.push(body);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.goto('/?qa=installer');
  // The installer opens in the browser/app language (Slovak here); pick English.
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: /Test & Continue/ }).waitFor();
  await page.locator('input[placeholder="localhost"]').fill('db.test');
  await page.locator('input[placeholder="ccrm"]').fill('ccrm');
  await page.locator('input[placeholder="ccrm_user"]').fill('u');
  await page.getByRole('button', { name: /Test & Continue/ }).click();
  await expect(page.getByTestId('installer-regional')).toBeVisible();
  return posts;
}

test.describe('Installer: demo language and currency', () => {
  test('Demo shows both selects; hu + EUR is posted', async ({ page }) => {
    const posts = await openInstallerStep2(page);
    const lang = page.getByTestId('installer-demo-language');
    const cur = page.getByTestId('installer-currency');
    await expect(lang).toBeVisible();
    await expect(cur).toBeVisible();
    await expect(cur.locator('option')).toHaveCount(6);
    await expect(cur.locator('option[value="HUF"]')).toHaveText(/Forint/);
    // Currency follows the language until it is touched…
    await lang.selectOption('hu');
    await expect(cur).toHaveValue('HUF');
    await lang.selectOption('en');
    await expect(cur).toHaveValue('USD');
    // …and stays put once the user chose one.
    await lang.selectOption('hu');
    await cur.selectOption('EUR');
    await lang.selectOption('sk');
    await lang.selectOption('hu');
    await expect(cur).toHaveValue('EUR');

    await page.getByRole('button', { name: /Run Setup/ }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ type: 'demo', systemLanguage: 'en', demoLanguage: 'hu', currency: 'EUR' });
  });

  test('Fresh shows the currency select only', async ({ page }) => {
    const posts = await openInstallerStep2(page);
    await page.getByText('Start Fresh (Empty Database)').click();
    await expect(page.getByTestId('installer-demo-language')).toHaveCount(0);
    const cur = page.getByTestId('installer-currency');
    await expect(cur).toBeVisible();
    await cur.selectOption('HUF');
    await page.getByRole('button', { name: /Run Setup/ }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ type: 'fresh', currency: 'HUF' });
    expect(posts[0]).not.toHaveProperty('demoLanguage');
  });
});

test.describe('Zero divisions (B13)', () => {
  test('leads, projects and the divisions settings render without a division', async ({ page }) => {
    await startSession(page);
    for (const hash of ['#dashboard', '#leads', '#projects', '#settings/company/divisions']) {
      await gotoView(page, hash);
      const state = await readViewState(page);
      expect(state.errorScreen, `${hash} shows an error screen`).toBeNull();
      expect(state.textLength, `${hash} is blank`).toBeGreaterThan(50);
    }
    await expect(page.getByText('Cstudios')).toHaveCount(0);
  });
});
