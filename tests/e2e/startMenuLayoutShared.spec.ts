import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { gotoView, startSession, waitForAppReady } from './helpers/appDriver';
import { TEST_USER, buildSyncPayload } from './helpers/fixture';

/**
 * The Start Menu layout is a per-user preference, and it follows the account.
 *
 * It used to live in localStorage under `ccrm_start_menu_groups_v2_<user id>`:
 * namespaced by user, in the one home that cannot deliver per-user state. The
 * arrangement survived a reload and was gone on the same person's second
 * machine. This pins the round trip — the layout has to reach the user's row
 * over /sync.php and come back in a completely separate browser profile, which
 * is the only way the defect is visible at all.
 */

const LEGACY_KEY = `ccrm_start_menu_groups_v2_${TEST_USER.id}`;
const EDIT = /^(Edit|Upraviť|Szerkesztés)$/;
const RENAME = /Rename group|Premenovať skupinu|Csoport átnevezése/;

const RENAMED = 'QA Launcher Column';
const LEGACY_NAME = 'Column From The Old Build';

/** email -> the metadata_json the app last pushed, shared by both profiles. */
type MetaStore = { meta: Map<string, unknown> };

/**
 * A backend that remembers every user's metadata blob, standing in for the
 * database. Registered after the fixture's mocks, so Playwright asks this one
 * first — and unlike the fixture's own memory, this store is shared across
 * browser contexts.
 */
function installSharedUserBackend(page: Page, store: MetaStore) {
  return page.route('**/sync.php**', async (route) => {
    const request = route.request();

    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as {
          users?: { email?: string; metadata_json?: unknown }[];
        };
        for (const user of body?.users ?? []) {
          if (user?.email && user.metadata_json !== undefined) {
            store.meta.set(user.email, user.metadata_json);
          }
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
        users: payload.users.map((u) =>
          store.meta.has(u.email) ? { ...u, metadata_json: store.meta.get(u.email) } : u,
        ),
      }),
    });
  });
}

async function openStartMenu(page: Page) {
  await page.locator(`button[title]`).filter({ hasText: 'START' }).first().click();
  await expect(page.getByPlaceholder(/Search modules|Hľadať v moduloch|Keresés a modulok/)).toBeVisible();
}

const storedLayout = (store: MetaStore): string => {
  const meta = store.meta.get(TEST_USER.email);
  return typeof meta === 'string' ? meta : JSON.stringify(meta ?? {});
};

const legacyKeys = (page: Page) =>
  page.evaluate(
    (prefix: string) => Object.keys(localStorage).filter((k) => k.startsWith(prefix)),
    'ccrm_start_menu_groups_v2_',
  );

test.describe('Start Menu layout', () => {
  test('a renamed group reaches the row and shows up in another browser', async ({
    page,
    browser,
    baseURL,
  }) => {
    const store: MetaStore = { meta: new Map() };

    await startSession(page);
    await installSharedUserBackend(page, store);
    await gotoView(page, '#dashboard');

    // --- the first user renames a launcher column -------------------------
    await openStartMenu(page);
    await page.getByRole('button', { name: EDIT }).first().click();
    await page.getByRole('button', { name: RENAME }).first().click();

    const nameInput = page.locator('input[type="text"].border-indigo-400').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(RENAMED);
    await nameInput.press('Enter');
    await expect(page.getByText(RENAMED).first()).toBeVisible();

    // It left the browser rather than settling into localStorage.
    await expect.poll(() => storedLayout(store), { timeout: 10_000 }).toContain(RENAMED);
    await expect(legacyKeys(page)).resolves.toEqual([]);

    // --- the same account, on a separate browser profile -------------------
    let second: BrowserContext | undefined;
    try {
      second = await browser.newContext();
      const pageB = await second.newPage();
      await startSession(pageB);
      await installSharedUserBackend(pageB, store);
      await pageB.goto(baseURL ?? 'http://localhost:5273/');
      await waitForAppReady(pageB);

      // Same column name — and nothing in this browser's storage said so.
      await openStartMenu(pageB);
      await expect(pageB.getByText(RENAMED).first()).toBeVisible();
      await expect(legacyKeys(pageB)).resolves.toEqual([]);
    } finally {
      await second?.close();
    }
  });

  test('a layout left behind by an older build is adopted into the row', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };

    await startSession(page);
    await installSharedUserBackend(page, store);

    // Seed the browser the way an install running the previous release has it.
    // Set after a first load rather than through an init script, which would
    // put the key back on every navigation and hide a failed migration.
    await page.goto('/');
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [
        LEGACY_KEY,
        JSON.stringify({
          groups: [{ id: 'operations', name: LEGACY_NAME, iconName: 'Briefcase' }],
          groupItems: { operations: ['projects'] },
          unused: ['updates'],
        }),
      ],
    );

    await gotoView(page, '#dashboard');

    // Adopted into the user's row, and the browser copy is gone so it cannot
    // fire a second time and overwrite a newer layout from another machine. The
    // copy goes only once the server has answered the push that carries it, so
    // it trails the request the store just saw by a round trip.
    await expect.poll(() => storedLayout(store), { timeout: 15_000 }).toContain(LEGACY_NAME);
    await expect.poll(() => legacyKeys(page), { timeout: 5_000 }).toEqual([]);

    await openStartMenu(page);
    await expect(page.getByText(LEGACY_NAME).first()).toBeVisible();
  });
});
