import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { TEST_USER, buildSyncPayload } from './helpers/fixture';

/**
 * The "Na fakturovanie" block of the performance overview (#overview, tab "Výkonnostný prehľad"):
 * the two group cards "Obchody a Pipeline" and "Projekty a Realizácie" with one tickable row per
 * status, and the "Spolu na fakturovanie" card that adds them up.
 *
 * The statuses the user unticks are a per-user preference in users.metadata_json.preferences
 * (dashboardEquationExcluded, a list of "<group>:<status>" keys), persisted over /sync.php.
 *
 * The old card had a Detail / Prehľad switch, a "Počty" toggle and an info drawer. They are
 * intentionally not part of the new design, so the tests that covered them are gone; the prefs
 * dashboardEquationView and dashboardEquationCounts are no longer read by the dashboard.
 *
 * The fixture runs in Slovak.
 */

const CLEAR_SELECTION = 'Zrušiť výber stavov';

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

const section = (page: Page): Locator => page.locator('[data-status-equation]');
const rows = (scope: Locator): Locator => scope.locator('[data-status-key]');

/** The card (rounded surface) that carries the heading `name`. */
const card = (page: Page, name: string): Locator =>
  section(page)
    .getByRole('heading', { level: 3, name, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
const pipeline = (page: Page): Locator => card(page, 'Obchody a Pipeline');
const projects = (page: Page): Locator => card(page, 'Projekty a Realizácie');
const grand = (page: Page): Locator => card(page, 'Spolu na fakturovanie');

/** The big figure of a card ("1 234,00 €") as a number. */
async function figure(scope: Locator): Promise<number> {
  const text = await scope.locator('.type-metric').last().innerText();
  return Number(text.replace(/[^\d,-]/g, '').replace(',', '.'));
}

/** The money printed at the end of a status row, as a number. */
async function rowValue(row: Locator): Promise<number> {
  const text = await row.locator('span').last().innerText();
  return Number(text.replace(/[^\d,-]/g, '').replace(',', '.'));
}

/** The first status row of the group that carries money, so unticking it must change the totals. */
async function firstRowWithValue(group: Locator): Promise<Locator> {
  const count = await rows(group).count();
  for (let i = 0; i < count; i++) {
    if ((await rowValue(rows(group).nth(i))) > 0) return rows(group).nth(i);
  }
  throw new Error('no status row with a value in the fixture');
}

test.describe('Na fakturovanie block of the performance overview', () => {
  test('renders the two group cards and the total card with every status ticked', async ({ page }) => {
    await startSession(page);
    await installUserBackend(page, { meta: new Map() });
    await gotoView(page, '#overview');

    await expect(section(page)).toBeVisible();
    await expect(pipeline(page)).toBeVisible();
    await expect(projects(page)).toBeVisible();
    await expect(grand(page)).toBeVisible();

    const count = await rows(section(page)).count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(rows(section(page)).nth(i).getByRole('checkbox')).toBeChecked();

    // The grand total is the two group totals together.
    expect(await figure(grand(page))).toBeCloseTo((await figure(pipeline(page))) + (await figure(projects(page))), 1);
  });

  test('unticking a status updates the group and grand totals and is stored in the user preferences', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#overview');
    await expect(pipeline(page)).toBeVisible();

    const group = pipeline(page);
    const total = await rows(group).count();
    const row = await firstRowWithValue(group);
    const key = (await row.getAttribute('data-status-key'))!;
    const groupBefore = await figure(group);
    const grandBefore = await figure(grand(page));
    const value = await rowValue(row);

    await row.getByRole('checkbox').uncheck();
    await expect(row.getByRole('checkbox')).not.toBeChecked();
    await expect(group).toContainText(new RegExp(`${total - 1} zo? ${total} stav`));
    expect(await figure(group)).toBeCloseTo(groupBefore - value, 1);
    expect(await figure(grand(page))).toBeCloseTo(grandBefore - value, 1);

    // Kept in the user's preferences, not in localStorage
    await expect.poll(() => storedPrefs(store).dashboardEquationExcluded, { timeout: 10_000 }).toEqual([key]);
    expect(await page.evaluate(() => localStorage.getItem('ccrm_overview_equation_stats_disabled'))).toBeNull();

    // ...and it survives a reload
    await gotoView(page, '#overview');
    await expect(pipeline(page)).toBeVisible();
    await expect(section(page).locator(`[data-status-key="${key}"]`).getByRole('checkbox')).not.toBeChecked();
    await expect(pipeline(page)).toContainText(new RegExp(`${total - 1} zo? ${total} stav`));
  });

  test('"Zrušiť výber stavov" ticks every status again and stores an empty list', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#overview');
    await expect(pipeline(page)).toBeVisible();

    const first = rows(section(page)).first();
    const key = (await first.getAttribute('data-status-key'))!;
    await first.getByRole('checkbox').uncheck();
    await expect.poll(() => storedPrefs(store).dashboardEquationExcluded, { timeout: 10_000 }).toEqual([key]);

    await section(page).getByRole('button', { name: CLEAR_SELECTION, exact: true }).click();
    const count = await rows(section(page)).count();
    for (let i = 0; i < count; i++) await expect(rows(section(page)).nth(i).getByRole('checkbox')).toBeChecked();
    await expect.poll(() => storedPrefs(store).dashboardEquationExcluded, { timeout: 10_000 }).toEqual([]);
  });
});
