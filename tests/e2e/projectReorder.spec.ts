import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { TEST_USER, buildSyncPayload } from './helpers/fixture';

/**
 * Projects can be put in a hand-set order by dragging a row (table) or a card
 * (grid) onto another. The order is a per-user preference: it has to reach the
 * user's row over /sync.php and come back on the next load, which is what the
 * shared backend below stands in for — the fixture's own memory forgets a
 * pushed preference the moment the page reloads.
 *
 * The order is the project structure. The Structure view always shows it and
 * is where it is dragged; the table and cards show it only on "Custom order"
 * and refuse a drag under a column sort, so a sort can never be adopted as the
 * structure — the reason the Structure view exists at all.
 */

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

/** The stored projects sort preference, as the app last pushed it. */
function storedSort(store: MetaStore): { key?: string; order?: string[] } | null {
  const raw = store.meta.get(TEST_USER.email);
  const meta = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw ?? {});
  return (meta as { preferences?: { projectsSort?: { key?: string; order?: string[] } } }).preferences?.projectsSort ?? null;
}

const rowIds = (page: Page) =>
  page.locator('tbody tr[data-project-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-project-row')));
const cardIds = (page: Page) =>
  page.locator('[data-project-card]').evaluateAll((cards) => cards.map((c) => c.getAttribute('data-project-card')));

/** Native HTML5 drag from one element onto a given edge of another. */
async function dragOnto(source: Locator, target: Locator, edge: 'top' | 'bottom' | 'left' | 'right') {
  const box = await target.boundingBox();
  if (!box) throw new Error('drop target is not on screen');
  const targetPosition = {
    top: { x: box.width / 2, y: 4 },
    bottom: { x: box.width / 2, y: box.height - 4 },
    left: { x: 8, y: box.height / 2 },
    right: { x: box.width - 8, y: box.height / 2 },
  }[edge];
  await source.dragTo(target, { targetPosition });
}

/** Starts the backend with preferences already stored for the test user, as if set on another device. */
function seedPrefs(store: MetaStore, preferences: Record<string, unknown>) {
  store.meta.set(TEST_USER.email, JSON.stringify({ ...JSON.parse(TEST_USER.metadata_json), preferences }));
}

const isDraggable = (row: Locator) => row.evaluate((el) => (el as HTMLElement).draggable);

test.describe('Project reordering', () => {
  test('dragging a row in the structure reorders it, and it survives a reload', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#projects');
    await page.getByRole('button', { name: 'Zobrazenie štruktúry' }).click();
    await expect(page.locator('[data-structure-handle]').first()).toBeVisible();

    const before = await rowIds(page);
    expect(before.length).toBeGreaterThanOrEqual(3);
    const first = before[0];
    const last = before[before.length - 1];

    // The top row, dropped below the bottom one.
    await dragOnto(page.locator(`tr[data-project-row="${first}"]`), page.locator(`tr[data-project-row="${last}"]`), 'bottom');
    const expected = [...before.slice(1), first];
    await expect.poll(() => rowIds(page)).toEqual(expected);
    // A drag does not open the project it moved.
    await expect(page.getByPlaceholder(/Vyhľadať projekty/)).toBeVisible();

    await expect.poll(() => storedSort(store)?.order?.slice(-1), { timeout: 10_000 }).toEqual([first]);
    // Rearranging the structure is not a choice of sort for the table and cards.
    expect(storedSort(store)?.key).toBe('default');
    await page.screenshot({ path: 'test-results/project-reorder-structure.png', fullPage: false });

    // The structure is also the view the screen reopens on.
    await gotoView(page, '#projects');
    await expect(page.locator('[data-structure-handle]').first()).toBeVisible();
    await expect.poll(() => rowIds(page)).toEqual(expected);
  });

  test('a column sort never touches the structure, and cannot be dragged into it', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#projects');
    await page.getByRole('button', { name: 'Zobrazenie štruktúry' }).click();
    const structure = await rowIds(page);
    expect(structure.length).toBeGreaterThanOrEqual(3);

    // Sort the table by name, descending, so it cannot match the structure by chance.
    await page.getByRole('button', { name: 'Zobrazenie zoznamu' }).click();
    const nameHeader = page.locator('thead').getByRole('button', { name: 'Projekt', exact: true });
    await nameHeader.click();
    await nameHeader.click();
    await expect(page.locator('thead th[aria-sort="descending"]')).toHaveCount(1);
    const sorted = await rowIds(page);

    // A sorted table refuses the drag that used to overwrite the structure.
    expect(await isDraggable(page.locator(`tr[data-project-row="${sorted[0]}"]`))).toBe(false);

    // The structure is where it was, headers are plain labels, rows drag.
    await page.getByRole('button', { name: 'Zobrazenie štruktúry' }).click();
    await expect.poll(() => rowIds(page)).toEqual(structure);
    await expect(page.locator('thead th[aria-sort]')).toHaveCount(0);
    const last = structure[structure.length - 1];
    await dragOnto(page.locator(`tr[data-project-row="${last}"]`), page.locator(`tr[data-project-row="${structure[0]}"]`), 'top');
    const expected = [last, ...structure.slice(0, -1)];
    await expect.poll(() => rowIds(page)).toEqual(expected);

    // Back in the table the name sort is still on.
    await page.getByRole('button', { name: 'Zobrazenie zoznamu' }).click();
    await expect(page.locator('thead th[aria-sort="descending"]')).toHaveCount(1);
    await expect.poll(() => rowIds(page)).toEqual(sorted);
    await expect.poll(() => storedSort(store)?.order, { timeout: 10_000 }).toEqual(expected);
  });

  test('on "Custom order" the cards show the structure and can be dragged', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    seedPrefs(store, { projectsViewMode: 'grid', projectsSort: { key: 'manual', direction: 'asc' } });
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#projects');
    await expect(page.locator('[data-project-card]').first()).toBeVisible();

    const before = await cardIds(page);
    expect(before.length).toBeGreaterThanOrEqual(3);
    const last = before[before.length - 1];

    // The last card, dropped on the left of the first one.
    await dragOnto(page.locator(`[data-project-card="${last}"]`), page.locator(`[data-project-card="${before[0]}"]`), 'left');
    const expected = [last, ...before.slice(0, -1)];
    await expect.poll(() => cardIds(page)).toEqual(expected);
    await expect.poll(() => storedSort(store)?.order, { timeout: 10_000 }).toEqual(expected);
    expect(storedSort(store)?.key).toBe('manual');
    await page.screenshot({ path: 'test-results/project-reorder-grid.png', fullPage: false });

    // The structure view reads the same order.
    await page.getByRole('button', { name: 'Zobrazenie štruktúry' }).click();
    await expect.poll(() => rowIds(page)).toEqual(expected);
  });
});
