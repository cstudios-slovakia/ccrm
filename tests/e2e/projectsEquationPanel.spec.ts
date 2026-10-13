import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { TEST_USER, buildSyncPayload } from './helpers/fixture';

/**
 * The "Active Projects Budget Breakdown" panel above the Projects list is drawn
 * from the same kit as the dashboard's status widget (big total, proportional
 * strip, status pills, footer) but is a panel, not a grid card: its adjustments
 * — Detail / Summary, record counts, the statuses left out of the total — are
 * per-user preferences, so they have to reach the user's row over /sync.php and
 * come back on the next load. The backend below stands in for that round trip;
 * the fixture's own memory forgets a pushed preference when the page reloads.
 *
 * The component is shared with the Leads screen, which keeps its own state in
 * localStorage; the last test makes sure that screen still draws the same panel.
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
const projectRows = (page: Page): Locator => page.locator('tbody tr[data-project-row]');

test.describe('Active Projects Budget Breakdown panel', () => {
  test('renders as a dashboard-style card with one pill per open status', async ({ page }) => {
    await startSession(page);
    await installUserBackend(page, { meta: new Map() });
    await gotoView(page, '#projects');

    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('heading')).toContainText(/Prehľad rozpočtov aktívnych fáz/i);

    // Detail is the default: the pills are there and every status counts.
    await expect(toggle(page, DETAIL)).toHaveAttribute('aria-pressed', 'true');
    const count = await pills(page).count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(pills(page).nth(i)).toHaveAttribute('aria-pressed', 'true');

    // The configured closed statuses (completed, cancelled) are not "active".
    await expect(panel(page).getByText('ZRUŠENÝ', { exact: true })).toHaveCount(0);

    // Dashboard chrome: the shared card's radius and hairline, and no gradient fill anywhere in it.
    const gradients = await panel(page).evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll('*'))].filter((n) => getComputedStyle(n).backgroundImage.includes('gradient')).length
    );
    expect(gradients).toBe(0);
    await page.screenshot({ path: 'test-results/projects-equation-panel.png', fullPage: false });
  });

  test('leaving a status out changes the total, not the list below, and Select all puts it back', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#projects');
    await expect(pills(page).first()).toBeVisible();

    const total = await pills(page).count();
    const rowsBefore = await projectRows(page).count();
    const key = (await pills(page).first().getAttribute('data-status-key'))!;

    await pills(page).first().click();
    await expect(pills(page).first()).toHaveAttribute('aria-pressed', 'false');
    await expect(panel(page)).toContainText(`${total - 1} zo ${total} stavov`);
    await expect(toggle(page, SELECT_ALL)).toBeVisible();

    // The pills are not the status filter: the list keeps what it had.
    expect(await projectRows(page).count()).toBe(rowsBefore);

    // Kept in the user's preferences, not in the browser.
    await expect.poll(() => storedPrefs(store).projectsEquationExcluded, { timeout: 10_000 }).toEqual([key]);
    expect(await page.evaluate(() => localStorage.getItem('ccrm_projects_equation_stats_disabled'))).toBeNull();

    await toggle(page, SELECT_ALL).click();
    await expect(pills(page).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page, SELECT_ALL)).toHaveCount(0);
    await expect.poll(() => storedPrefs(store).projectsEquationExcluded, { timeout: 10_000 }).toEqual([]);
  });

  test('Detail / Summary and the counts switch survive a reload', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#projects');
    await expect(pills(page).first()).toBeVisible();

    await toggle(page, SUMMARY).click();
    await expect(toggle(page, SUMMARY)).toHaveAttribute('aria-pressed', 'true');
    await expect(pills(page)).toHaveCount(0);
    await expect.poll(() => storedPrefs(store).projectsEquationView, { timeout: 10_000 }).toBe('summary');

    await gotoView(page, '#projects');
    await expect(panel(page)).toBeVisible();
    await expect(toggle(page, SUMMARY)).toHaveAttribute('aria-pressed', 'true');
    await expect(pills(page)).toHaveCount(0);

    // Back to Detail, and the record counts off — both come back too.
    await toggle(page, DETAIL).click();
    await expect(pills(page).first()).toBeVisible();
    await expect(toggle(page, COUNTS)).toHaveAttribute('aria-pressed', 'true');
    await toggle(page, COUNTS).click();
    await expect(toggle(page, COUNTS)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => storedPrefs(store).projectsEquationCounts, { timeout: 10_000 }).toBe(false);
    await expect.poll(() => storedPrefs(store).projectsEquationView, { timeout: 10_000 }).toBe('detail');

    await gotoView(page, '#projects');
    await expect(pills(page).first()).toBeVisible();
    await expect(toggle(page, DETAIL)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page, COUNTS)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the info button opens the drawer on the page itself, and Escape closes it', async ({ page }) => {
    await startSession(page);
    await installUserBackend(page, { meta: new Map() });
    await gotoView(page, '#projects');
    await expect(pills(page).first()).toBeVisible();

    await pills(page).first().getByRole('button').click();
    const drawer = page.getByRole('heading', { name: 'Prehľad kalkulovaných položiek' });
    await expect(drawer).toBeVisible();
    // Portalled: it is not inside the card, whose ancestors may animate or transform.
    expect(await panel(page).getByRole('heading', { name: 'Prehľad kalkulovaných položiek' }).count()).toBe(0);
    // Opening it left the pill as it was.
    await expect(pills(page).first()).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });
});

test.describe('Leads uses the same panel', () => {
  test('still renders, and keeps its own view in the browser', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#leads');

    await expect(panel(page)).toBeVisible();
    await expect(pills(page).first()).toBeVisible();
    await expect(panel(page).getByRole('heading')).toContainText(/Prehľad hodnôt aktívnych fáz/i);

    // Not wired to the Projects preferences: no counts switch, and the view it
    // switches to is not written to them (the blob carries the default, "detail").
    await expect(toggle(page, COUNTS)).toHaveCount(0);
    await toggle(page, SUMMARY).click();
    await expect(pills(page)).toHaveCount(0);
    await expect(toggle(page, SUMMARY)).toHaveAttribute('aria-pressed', 'true');
    expect(storedPrefs(store).projectsEquationView).not.toBe('summary');
    expect(await page.evaluate(() => localStorage.getItem('ccrm_leads_equation_stats_expanded'))).toBe('false');

    await gotoView(page, '#leads');
    await expect(panel(page)).toBeVisible();
    await expect(toggle(page, SUMMARY)).toHaveAttribute('aria-pressed', 'true');
    await expect(pills(page)).toHaveCount(0);
  });
});
