import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { TEST_USER, buildSyncPayload } from './helpers/fixture';

/**
 * Two things about the employees section:
 *
 *  1. The "new employee" form must not blank itself while it is being filled in.
 *     It used to re-initialise whenever the `settings` prop changed identity, and
 *     every background sync handed it a fresh settings object — so a half-typed
 *     form was wiped at random. The server below answers every pull with an
 *     equal-but-new `employeeSettings`, exactly as sync.php does.
 *
 *  2. The directory has a Structure view like the project list's: the hand-set
 *     order, dragged into place, kept in the user's own preferences.
 */

const EMPLOYEES = ['Anna Nováková', 'Boris Kováč', 'Cyril Horváth'].map((name, i) => ({
  id: `emp-qa-${i + 1}`,
  name,
  role: 'QA',
  email: `qa${i + 1}@example.com`,
  salaryType: 'monthly',
  salaryAmount: 1500 + i * 100,
  isActive: true,
  createdAt: `2026-01-0${i + 1}T09:00:00.000Z`,
  updatedAt: `2026-01-0${i + 1}T09:00:00.000Z`,
}));

type MetaStore = { meta: Map<string, unknown> };

function installBackend(page: Page, store: MetaStore) {
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
        employees: EMPLOYEES,
        employeeSalaries: [],
        employeeVacations: [],
        // Same content on every pull, a new object on every parse.
        employeeSettings: { salaryDueDay: 15, autoExpense: true, vacationTypes: [], salaryTypes: [] },
        users: payload.users.map((u) => (store.meta.has(u.email) ? { ...u, metadata_json: store.meta.get(u.email) } : u)),
      }),
    });
  });
}

/** The stored employees preferences, as the app last pushed them. */
function storedPrefs(store: MetaStore): { employeesOrder?: string[]; employeesViewMode?: string } {
  const raw = store.meta.get(TEST_USER.email);
  const meta = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw ?? {});
  return (meta as { preferences?: Record<string, never> }).preferences ?? {};
}

const rowIds = (page: Page) =>
  page.locator('tbody tr[data-employee-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-employee-row')));

async function dragOnto(source: Locator, target: Locator, edge: 'top' | 'bottom') {
  const box = await target.boundingBox();
  if (!box) throw new Error('drop target is not on screen');
  const targetPosition = edge === 'top' ? { x: box.width / 2, y: 4 } : { x: box.width / 2, y: box.height - 4 };
  await source.dragTo(target, { targetPosition });
}

test.describe('Employees', () => {
  test('a background sync does not reset the new-employee form', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installBackend(page, store);
    await gotoView(page, '#employees/new');

    const name = page.getByPlaceholder('e.g. Ing. Michal Kováč, PhD.');
    await name.fill('Ing. Test Zamestnanec');
    await page.getByPlaceholder('+421 905 123 456').fill('+421 900 000 000');

    // Three full pulls, each carrying a new-but-equal employeeSettings object.
    for (let i = 0; i < 3; i++) {
      const pulled = page.waitForResponse((r) => r.url().includes('/sync.php') && r.request().method() === 'GET');
      await page.evaluate(() => window.dispatchEvent(new Event('ccrm:reload-data')));
      await pulled;
      // Let React apply the response before looking at the form.
      await page.waitForTimeout(300);
    }

    await expect(name).toHaveValue('Ing. Test Zamestnanec');
    await expect(page.getByPlaceholder('+421 905 123 456')).toHaveValue('+421 900 000 000');
  });

  test('the structure view reorders by drag, and keeps the order across a reload', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installBackend(page, store);
    await gotoView(page, '#employees');
    await page.getByRole('button', { name: 'Zobrazenie štruktúry' }).click();
    await expect(page.locator('[data-structure-handle]').first()).toBeVisible();

    const before = await rowIds(page);
    expect(before).toHaveLength(EMPLOYEES.length);
    const first = before[0] as string;
    const last = before[before.length - 1] as string;

    // The top row, dropped below the bottom one.
    await dragOnto(page.locator(`tr[data-employee-row="${first}"]`), page.locator(`tr[data-employee-row="${last}"]`), 'bottom');
    const expected = [...before.slice(1), first];
    await expect.poll(() => rowIds(page)).toEqual(expected);
    // A drag does not open the employee it moved.
    await expect(page.getByPlaceholder(/Hľadať podľa mena/)).toBeVisible();

    await expect.poll(() => storedPrefs(store).employeesOrder, { timeout: 10_000 }).toEqual(expected);
    expect(storedPrefs(store).employeesViewMode).toBe('structure');
    await page.screenshot({ path: 'test-results/employee-structure.png', fullPage: false });

    // The structure is also the view the directory reopens on.
    await gotoView(page, '#employees');
    await expect(page.locator('[data-structure-handle]').first()).toBeVisible();
    await expect.poll(() => rowIds(page)).toEqual(expected);
  });

  test('the plain table has no drag handles and does not drag', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installBackend(page, store);
    await gotoView(page, '#employees');
    await page.getByRole('button', { name: 'Tabuľka' }).click();

    await expect(page.locator('tbody tr[data-employee-row]').first()).toBeVisible();
    await expect(page.locator('[data-structure-handle]')).toHaveCount(0);
    const draggable = await page.locator('tbody tr[data-employee-row]').first().evaluate((el) => (el as HTMLElement).draggable);
    expect(draggable).toBe(false);
  });
});
