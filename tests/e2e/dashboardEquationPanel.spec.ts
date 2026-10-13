import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { TEST_USER, buildSyncPayload } from './helpers/fixture';

/**
 * The "Combined Pipeline & Projects Invoicable Breakdown" panel in the
 * Performance Dashboard (#overview) renders as a clean dashboard-style card
 * (WidgetCard) with multi-group structure (Sales & Pipeline and Projects & Deliverables).
 *
 * Its preferences — Detail / Summary, record counts, and the excluded statuses —
 * are per-user preferences in users.metadata_json.preferences (dashboardEquationView,
 * dashboardEquationCounts, dashboardEquationExcluded), persisted over /sync.php.
 *
 * The fixture runs in Slovak.
 */

const DETAIL = 'Detail';
const SUMMARY = 'Prehľad';
const COUNTS = 'Počty';
const SELECT_ALL = 'Vybrať všetko';

type MetaStore = { meta: Map<string, unknown> };

function installUserBackend(page: Page, store: MetaStore) {
  return page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { users?: { email?: string; metadata_json?: unknown }[] };
        for (const user of body?.users ?? []) {
          if (user?.email && user.metadata_json !== undefined) store.meta.set(user.email, user.metadata_json);
        }
      } catch {
        /* not JSON — nothing to remember */
      }
      return route.fallback();
    }
    const payload = buildSyncPayload();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...payload,
        users: payload.users.map((u) => (store.meta.has(u.email) ? { ...u, metadata_json: store.meta.get(u.email) } : u)),
      }),
    });
  });
}

/** The preferences the app last pushed for the test user. */
function storedPrefs(store: MetaStore): Record<string, unknown> {
  const raw = store.meta.get(TEST_USER.email);
  const meta = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw ?? {});
  return ((meta as { preferences?: Record<string, unknown> }).preferences ?? {}) as Record<string, unknown>;
}

const panel = (page: Page): Locator => page.locator('[data-status-equation]');
const pills = (page: Page): Locator => panel(page).locator('[data-status-key]');
const toggle = (page: Page, name: string): Locator => panel(page).getByRole('button', { name, exact: true });

test.describe('Combined Pipeline & Projects Invoicable Breakdown panel', () => {
  test('renders as a dashboard-style card with Sales & Pipeline and Projects groups, and no gradients', async ({ page }) => {
    await startSession(page);
    await installUserBackend(page, { meta: new Map() });
    await gotoView(page, '#overview');

    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('heading', { level: 2 })).toContainText(/Kombinovaný prehľad hodnôt na fakturovanie/i);

    // Groups are rendered
    await expect(panel(page).getByText('Obchody a Pipeline', { exact: true })).toBeVisible();
    await expect(panel(page).getByText('Projekty a Realizácie', { exact: true })).toBeVisible();

    // Detail is default: the pills are there and every status counts.
    await expect(toggle(page, DETAIL)).toHaveAttribute('aria-pressed', 'true');
    const count = await pills(page).count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(pills(page).nth(i)).toHaveAttribute('aria-pressed', 'true');

    // Dashboard chrome: shared card surface, hairline dividers, and NO gradients anywhere
    const gradients = await panel(page).evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll('*'))].filter((n) => getComputedStyle(n).backgroundImage.includes('gradient')).length
    );
    expect(gradients).toBe(0);
  });

  test('leaving a status out updates the total, shows Select all, and persists to user preferences', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#overview');
    await expect(pills(page).first()).toBeVisible();

    const total = await pills(page).count();
    const key = (await pills(page).first().getAttribute('data-status-key'))!;

    await pills(page).first().click();
    await expect(pills(page).first()).toHaveAttribute('aria-pressed', 'false');
    await expect(panel(page)).toContainText(`${total - 1} zo ${total} stavov`);
    await expect(toggle(page, SELECT_ALL)).toBeVisible();

    // Kept in the user's preferences, not in localStorage
    await expect.poll(() => storedPrefs(store).dashboardEquationExcluded, { timeout: 10_000 }).toEqual([key]);
    expect(await page.evaluate(() => localStorage.getItem('ccrm_overview_equation_stats_disabled'))).toBeNull();

    await toggle(page, SELECT_ALL).click();
    await expect(pills(page).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page, SELECT_ALL)).toHaveCount(0);
    await expect.poll(() => storedPrefs(store).dashboardEquationExcluded, { timeout: 10_000 }).toEqual([]);
  });

  test('Detail / Summary and the counts switch survive a reload', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#overview');
    await expect(pills(page).first()).toBeVisible();

    // Switch to Summary
    await toggle(page, SUMMARY).click();
    await expect(toggle(page, SUMMARY)).toHaveAttribute('aria-pressed', 'true');
    await expect(pills(page)).toHaveCount(0);
    await expect.poll(() => storedPrefs(store).dashboardEquationView, { timeout: 10_000 }).toBe('summary');

    await gotoView(page, '#overview');
    await expect(panel(page)).toBeVisible();
    await expect(toggle(page, SUMMARY)).toHaveAttribute('aria-pressed', 'true');
    await expect(pills(page)).toHaveCount(0);

    // Switch back to Detail, and toggle counts off — both survive reload
    await toggle(page, DETAIL).click();
    await expect(pills(page).first()).toBeVisible();
    await expect(toggle(page, COUNTS)).toHaveAttribute('aria-pressed', 'true');
    await toggle(page, COUNTS).click();
    await expect(toggle(page, COUNTS)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => storedPrefs(store).dashboardEquationCounts, { timeout: 10_000 }).toBe(false);
    await expect.poll(() => storedPrefs(store).dashboardEquationView, { timeout: 10_000 }).toBe('detail');

    await gotoView(page, '#overview');
    await expect(pills(page).first()).toBeVisible();
    await expect(toggle(page, DETAIL)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page, COUNTS)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the info button opens the drawer on the page itself, and Escape closes it', async ({ page }) => {
    await startSession(page);
    await installUserBackend(page, { meta: new Map() });
    await gotoView(page, '#overview');
    await expect(pills(page).first()).toBeVisible();

    await pills(page).first().getByRole('button').click();
    const drawer = page.getByRole('heading', { name: 'Prehľad kalkulovaných položiek' });
    await expect(drawer).toBeVisible();
    // Portalled: it is not inside the card
    expect(await panel(page).getByRole('heading', { name: 'Prehľad kalkulovaných položiek' }).count()).toBe(0);
    // Opening it left the pill as it was
    await expect(pills(page).first()).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });
});
