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
  position: 'QA',
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
  test('a person needs a first and a last name; positions are suggested from the roster', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installBackend(page, store);
    await gotoView(page, '#employees/new');

    await page.getByPlaceholder('Peter', { exact: true }).fill('Tomáš');
    await page.getByRole('button', { name: 'Vytvoriť zamestnanca' }).first().click();
    await expect(page.getByText('Zadajte prosím meno aj priezvisko zamestnanca')).toBeVisible();

    // The position is the same searchable dropdown as the lead picker. What the roster already
    // uses comes first, after the "none" row; the defaults follow.
    const position = page.locator('label', { hasText: 'Pozícia' }).locator('..').getByRole('button');
    await position.click();
    const options = await page.getByRole('listbox').getByRole('option').allTextContents();
    expect(options[1]).toBe('QA');
    expect(options).toContain('Programátor');

    // Anything not on the list is typed into the search box and added with the "+".
    await page.getByPlaceholder('Hľadať...', { exact: true }).fill('Dizajnér UX');
    await page.getByRole('button', { name: 'Pridať napísanú pozíciu' }).click();
    await expect(position).toContainText('Dizajnér UX');
  });

  test('an external supplier takes IČO / DIČ / IČ DPH from the register and keeps a contact person', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installBackend(page, store);
    // The business register: one company, found by its IČO.
    await page.route('**/api/company_registry.php**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true, country: 'Slovakia', countryCode: 'SK', name: 'Dodigital s.r.o.', companyId: '48123456',
          taxId: '2120123456', vatId: 'SK2120123456', street: 'Hlavná 1', city: 'Nitra', postalCode: '949 01',
          contactPerson: 'Ing. Ján Novák', active: true,
        }),
      })
    );
    let pushed: { employees?: Record<string, unknown>[] } | null = null;
    await page.route('**/sync.php**', async (route) => {
      if (route.request().method() === 'POST') {
        try {
          const body = route.request().postDataJSON() as { employees?: Record<string, unknown>[] };
          if (body?.employees?.some((e) => e.kind === 'contractor')) pushed = body;
        } catch { /* not JSON */ }
      }
      return route.fallback();
    });
    await gotoView(page, '#employees/new');

    // "External supplier" covers a company and a sole trader alike.
    await page.getByRole('button', { name: 'Zamestnanec' }).first().click();
    await page.getByRole('option', { name: 'Externý dodávateľ' }).click();
    await expect(page.getByText('Názov firmy / obchodné meno')).toBeVisible();
    await expect(page.getByText('Kontaktná osoba: meno')).toBeVisible();

    await page.getByPlaceholder('48123456').fill('48123456');
    await page.getByRole('button', { name: 'Načítať z registra' }).click();

    await expect(page.getByPlaceholder('Dodigital s.r.o.')).toHaveValue('Dodigital s.r.o.');
    await expect(page.locator('label', { hasText: /^DIČ$/ }).locator('..').locator('input')).toHaveValue('2120123456');
    await expect(page.locator('label', { hasText: /^IČ DPH$/ }).locator('..').locator('input')).toHaveValue('SK2120123456');
    await expect(page.getByPlaceholder('Peter', { exact: true })).toHaveValue('Ing. Ján');
    await expect(page.getByPlaceholder('Varga', { exact: true })).toHaveValue('Novák');
    // The registered address lands in the address card.
    await expect(page.getByPlaceholder('e.g. Ružová dolina 25/B')).toHaveValue('Hlavná 1');

    await page.getByRole('button', { name: 'Vytvoriť zamestnanca' }).first().click();
    await expect.poll(() => pushed !== null).toBe(true);
    const saved = pushed!.employees!.find((e) => e.kind === 'contractor')!;
    expect(saved).toMatchObject({
      name: 'Dodigital s.r.o.', firstName: 'Ing. Ján', lastName: 'Novák',
      companyId: '48123456', taxId: '2120123456', vatId: 'SK2120123456',
    });
  });

  test('a background sync does not reset the new-employee form', async ({ page }) => {
    const store: MetaStore = { meta: new Map() };
    await startSession(page);
    await installBackend(page, store);
    await gotoView(page, '#employees/new');

    const firstName = page.getByPlaceholder('Peter', { exact: true });
    const lastName = page.getByPlaceholder('Varga', { exact: true });
    await firstName.fill('Ing. Test');
    await lastName.fill('Zamestnanec');
    await page.getByPlaceholder('+421 905 123 456').fill('+421 900 000 000');

    // Three full pulls, each carrying a new-but-equal employeeSettings object.
    for (let i = 0; i < 3; i++) {
      const pulled = page.waitForResponse((r) => r.url().includes('/sync.php') && r.request().method() === 'GET');
      await page.evaluate(() => window.dispatchEvent(new Event('ccrm:reload-data')));
      await pulled;
      // Let React apply the response before looking at the form.
      await page.waitForTimeout(300);
    }

    await expect(firstName).toHaveValue('Ing. Test');
    await expect(lastName).toHaveValue('Zamestnanec');
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
