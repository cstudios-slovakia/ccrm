import { test, expect, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { SECOND_USER, TEST_USER } from './helpers/fixture';

/**
 * The module setup wizard, end to end.
 *
 * The decisions behind it (who counts as "new", what Confirm writes, the empty-app
 * guard) are unit-tested in src/utils/moduleWizard.test.ts. What only a browser can
 * show is the wiring: that the wizard opens by itself exactly once for a brand-new
 * admin, that its choices reach the Sidebar and the Start menu through the same
 * `integrationsConfig.disabledModules` Settings uses, that they survive a reload,
 * and that the dialog can be driven from the keyboard alone.
 *
 * The seeded admin counts as an EXISTING user (it carries a preferences blob and a
 * completed-wizard stamp), so no other spec ever sees the dialog. A brand-new admin
 * is the same user without that blob.
 */

/** The seeded admin as an account that has never signed in: no preferences blob. */
const NEW_ADMIN = { ...TEST_USER, metadata_json: '{}' };

const wizard = (page: Page) => page.getByTestId('module-wizard');
const card = (page: Page, id: string) => page.getByTestId(`module-card-${id}`);
const sidebarItems = (page: Page) => page.locator('aside nav > button:not([aria-label])');

/** Opens Settings -> Visible Modules for the signed-in user. */
const openVisibleModules = async (page: Page) => {
  await gotoView(page, '#settings/modules');
  await expect(page.getByRole('switch').first()).toBeVisible();
};

const settingsSwitch = (page: Page, title: string) => page.getByRole('switch', { name: `Toggle ${title}` });

/**
 * Signs in as `user`, with the interface in English so labels can be matched by
 * name. (The wizard's strings are covered in all three languages by the unit
 * tests of the catalog; this spec is about behaviour.)
 */
const begin = async (page: Page, user?: typeof TEST_USER | typeof SECOND_USER) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('crm_language', 'en');
    } catch {
      /* storage unavailable */
    }
  });
  await startSession(page, user ? { user } : undefined);
};

/** Waits out the dialog's exit animation. */
const expectClosed = (page: Page) => expect(page.getByTestId('module-wizard-overlay')).toHaveCount(0);

test.describe('Module setup wizard', () => {
  test('opens by itself for a brand-new admin, filled from the workspace state', async ({ page }) => {
    await begin(page, NEW_ADMIN);
    await gotoView(page, '#dashboard');

    await expect(wizard(page)).toBeVisible();
    await expect(wizard(page)).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('dialog', { name: /choose your modules|vyberte si moduly|válassza ki/i })).toBeVisible();

    // Same ids the Settings page lists: one card per module, everything on to begin with.
    const total = await page.locator('[data-module-id]').count();
    expect(total).toBeGreaterThanOrEqual(19);
    await expect(page.locator('[data-module-id][aria-checked="true"]')).toHaveCount(total);
    await expect(page.getByTestId('module-wizard-counter')).toContainText(new RegExp(`${total}\\s*(of|z|/)\\s*${total}`));

    // The header says plainly that the choice is workspace-wide.
    await expect(wizard(page)).toContainText(/everyone in the workspace|všetkých v pracovnom priestore|munkaterület minden tagjára/i);
  });

  test('does not open for an existing admin', async ({ page }) => {
    await begin(page);
    await gotoView(page, '#dashboard');
    // The first-login migration and the auto-open effect both run within a moment of sync.
    await page.waitForTimeout(1500);
    await expect(wizard(page)).toHaveCount(0);
  });

  test('does not open for a non-admin, and offers them no launch button', async ({ page }) => {
    await begin(page, SECOND_USER);
    await gotoView(page, '#dashboard');
    await page.waitForTimeout(1500);
    await expect(wizard(page)).toHaveCount(0);
    await expect(page.getByTestId('run-module-setup-wizard')).toHaveCount(0);
  });

  test('Confirm hides the switched-off modules from the sidebar and Start menu, and the choice survives a reload', async ({ page }) => {
    await begin(page, NEW_ADMIN);
    await gotoView(page, '#dashboard');
    await expect(wizard(page)).toBeVisible();
    const sidebarBefore = await sidebarItems(page).count();

    for (const id of ['tickets', 'orders', 'warehouse']) {
      await card(page, id).scrollIntoViewIfNeeded();
      await card(page, id).click();
      await expect(card(page, id)).toHaveAttribute('aria-checked', 'false');
    }
    const total = await page.locator('[data-module-id]').count();
    await expect(page.getByTestId('module-wizard-counter')).toContainText(new RegExp(`${total - 3}\\s*(of|z|/)\\s*${total}`));

    // Nothing is applied until Confirm.
    await page.getByTestId('module-wizard-confirm').click();
    await expectClosed(page);
    await expect(page.getByText(/module setup saved|nastavenie modulov uložené|modulok beállítása mentve/i)).toBeVisible();

    await expect(sidebarItems(page)).toHaveCount(sidebarBefore - 3);
    await expect(page.locator('aside nav button[title="Support Tickets"]')).toHaveCount(0);

    await page.getByTitle(/Start Menu \(All Modules\)/).first().click();
    await expect(page.getByText('Leads Pipeline', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Support Tickets', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // A real page load: the choice came back from the (mocked) server, and the wizard did not.
    await gotoView(page, '#dashboard');
    await page.waitForTimeout(1200);
    await expect(wizard(page)).toHaveCount(0);
    await expect(sidebarItems(page)).toHaveCount(sidebarBefore - 3);
  });

  test('Decide later leaves the modules alone and the wizard does not come back', async ({ page }) => {
    await begin(page, NEW_ADMIN);
    await gotoView(page, '#dashboard');
    await expect(wizard(page)).toBeVisible();
    const sidebarBefore = await sidebarItems(page).count();

    // A draft change that is then abandoned must not leak out.
    await card(page, 'leads').click();
    await expect(card(page, 'leads')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('module-wizard-skip').click();
    await expectClosed(page);
    await expect(page.getByText(/module setup skipped|nastavenie modulov preskočené|beállítása kihagyva/i)).toBeVisible();
    await expect(sidebarItems(page)).toHaveCount(sidebarBefore);

    await gotoView(page, '#dashboard');
    await page.waitForTimeout(1200);
    await expect(wizard(page)).toHaveCount(0);
    await expect(sidebarItems(page)).toHaveCount(sidebarBefore);

    // Settings still shows everything on.
    await openVisibleModules(page);
    await expect(settingsSwitch(page, 'Leads Pipeline')).toHaveAttribute('aria-checked', 'true');
  });

  test('the Settings button opens the wizard pre-filled with the current state, and Confirm updates Settings', async ({ page }) => {
    await begin(page);
    await openVisibleModules(page);

    // Settings applies a toggle at once.
    await settingsSwitch(page, 'Support Tickets').click();
    await expect(settingsSwitch(page, 'Support Tickets')).toHaveAttribute('aria-checked', 'false');

    const launch = page.getByTestId('run-module-setup-wizard');
    await launch.click();
    await expect(wizard(page)).toBeVisible();

    // Pre-filled with what the workspace has now, not with "everything on".
    await expect(card(page, 'tickets')).toHaveAttribute('aria-checked', 'false');
    await expect(card(page, 'leads')).toHaveAttribute('aria-checked', 'true');

    await card(page, 'clients').click();
    await page.getByTestId('module-wizard-confirm').click();
    await expectClosed(page);

    await expect(settingsSwitch(page, 'Support Tickets')).toHaveAttribute('aria-checked', 'false');
    await expect(settingsSwitch(page, 'Clients Register').or(settingsSwitch(page, 'Clients'))).toHaveAttribute('aria-checked', 'false');
    // Focus goes back to the button that opened it.
    await expect(launch).toBeFocused();
  });

  test('keyboard: Tab stays inside, Space and Enter toggle a module, Escape behaves like Decide later', async ({ page }) => {
    await begin(page, NEW_ADMIN);
    await gotoView(page, '#dashboard');
    await expect(wizard(page)).toBeVisible();
    const sidebarBefore = await sidebarItems(page).count();

    // Tab reaches the toggles, and never leaves the dialog.
    let reachedCard = false;
    for (let i = 0; i < 12 && !reachedCard; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="module-wizard"]'));
      expect(inside).toBe(true);
      reachedCard = await page.evaluate(() => !!document.activeElement?.closest('[data-module-id]'));
    }
    expect(reachedCard).toBe(true);

    const focusedId = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.moduleId!);
    const focused = card(page, focusedId);
    await expect(focused).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Space');
    await expect(focused).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Enter');
    await expect(focused).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Space');
    await expect(focused).toHaveAttribute('aria-checked', 'false');

    // Shift+Tab from the first control wraps to the last, still inside.
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="module-wizard"]'))).toBe(true);

    await page.keyboard.press('Escape');
    await expectClosed(page);
    await expect(sidebarItems(page)).toHaveCount(sidebarBefore);

    await gotoView(page, '#dashboard');
    await page.waitForTimeout(1200);
    await expect(wizard(page)).toHaveCount(0);
  });

  test('Confirm is refused while every module is switched off', async ({ page }) => {
    await begin(page, NEW_ADMIN);
    await gotoView(page, '#dashboard');
    await expect(wizard(page)).toBeVisible();

    const cards = page.locator('[data-module-id]');
    const total = await cards.count();
    for (let i = 0; i < total; i++) {
      await cards.nth(i).scrollIntoViewIfNeeded();
      await cards.nth(i).click();
    }
    await expect(page.getByTestId('module-wizard-guard')).toBeVisible();
    await expect(page.getByTestId('module-wizard-confirm')).toHaveAttribute('aria-disabled', 'true');

    // aria-disabled stays focusable and clickable for a person; Playwright treats it as disabled, hence force.
    await page.getByTestId('module-wizard-confirm').click({ force: true });
    await expect(wizard(page)).toBeVisible();
    await expect(page.getByTestId('module-wizard-guard')).toBeVisible();

    // One module back on is enough.
    await page.getByTestId('module-wizard-enable-all').click();
    await expect(page.getByTestId('module-wizard-guard')).toHaveCount(0);
    await expect(page.getByTestId('module-wizard-confirm')).not.toHaveAttribute('aria-disabled', 'true');
  });

  for (const viewport of [
    { name: 'phone', width: 390, height: 844, columns: 1 },
    { name: 'laptop', width: 1440, height: 900, columns: 2 },
  ]) {
    test(`layout at ${viewport.name} width: ${viewport.columns} column(s), no horizontal scroll, readable screenshots`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await begin(page, NEW_ADMIN);
      await gotoView(page, '#dashboard');
      await expect(wizard(page)).toBeVisible();
      await page.waitForTimeout(500);

      const metrics = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="module-wizard"]') as HTMLElement;
        const body = document.querySelector('[data-testid="module-wizard-body"]') as HTMLElement;
        const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-module-id]'));
        const tops = new Set(cards.slice(0, 6).map((c) => Math.round(c.getBoundingClientRect().top)));
        const firstShot = document.querySelector('[data-testid="module-card-shot"]') as HTMLElement;
        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          panelOverflow: panel.scrollWidth - panel.clientWidth,
          bodyOverflow: body.scrollWidth - body.clientWidth,
          // Cards sharing a top edge are in the same row.
          cardsInFirstRow: cards.slice(0, 6).filter((c) => Math.round(c.getBoundingClientRect().top) === Math.min(...tops)).length,
          shotWidth: Math.round(firstShot.getBoundingClientRect().width),
        };
      });

      expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
      expect(metrics.panelOverflow).toBeLessThanOrEqual(0);
      expect(metrics.bodyOverflow).toBeLessThanOrEqual(0);
      expect(metrics.cardsInFirstRow).toBe(viewport.columns);
      if (viewport.columns === 2) expect(metrics.shotWidth).toBeGreaterThanOrEqual(600);

      // Header and footer stay put while the body scrolls, and Confirm is always reachable.
      await page.getByTestId('module-wizard-body').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect(page.getByTestId('module-wizard-confirm')).toBeInViewport();
      await expect(page.getByTestId('module-wizard-counter')).toBeInViewport();
    });
  }
});
