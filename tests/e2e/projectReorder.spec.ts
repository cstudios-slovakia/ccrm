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
 * Also pinned here: a drop made while a column sort is on switches the list to
 * "Custom order", otherwise the sort would undo the drop on the next frame.
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

test.describe('Project reordering', () => {
  test('dragging a row reorders the table, and the order survives a reload', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#projects');

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

    await expect.poll(() => storedSort(store)?.key, { timeout: 10_000 }).toBe('manual');
    expect(storedSort(store)?.order?.slice(-1)).toEqual([first]);
    await page.screenshot({ path: 'test-results/project-reorder-list.png', fullPage: false });

    await gotoView(page, '#projects');
    await expect.poll(() => rowIds(page)).toEqual(expected);
  });

  test('dragging a card reorders the grid, even out of a column sort', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installUserBackend(page, store);
    await gotoView(page, '#projects');

    // Sort by name first: the drop must switch the list to the custom order.
    await page.locator('thead').getByRole('button', { name: 'Projekt', exact: true }).click();
    await expect(page.locator('thead th[aria-sort="ascending"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Zobrazenie kariet' }).click();
    await expect(page.locator('[data-project-card]').first()).toBeVisible();

    const before = await cardIds(page);
    expect(before.length).toBeGreaterThanOrEqual(3);
    const last = before[before.length - 1];

    // The last card, dropped on the left of the first one.
    await dragOnto(page.locator(`[data-project-card="${last}"]`), page.locator(`[data-project-card="${before[0]}"]`), 'left');
    const expected = [last, ...before.slice(0, -1)];
    await expect.poll(() => cardIds(page)).toEqual(expected);
    await expect.poll(() => storedSort(store)?.key, { timeout: 10_000 }).toBe('manual');
    await page.screenshot({ path: 'test-results/project-reorder-grid.png', fullPage: false });

    // The table reads the same order.
    await page.getByRole('button', { name: 'Zobrazenie zoznamu' }).click();
    await expect.poll(() => rowIds(page)).toEqual(expected);
  });
});
