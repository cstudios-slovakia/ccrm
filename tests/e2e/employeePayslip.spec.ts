import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * Evidencia výplat: an employee's monthly record is laid out like a payslip. Hrubá mzda =
 * Základná mzda (the contract amount, locked unless unlocked for the month) + Iné (custom rows);
 * Cena práce and Na výplatu are typed in by hand; Vyplatené is one amount measured against Cena
 * práce. A contractor has no payslip and keeps the per-row Mzda / Vyplatené table.
 */

const EMPLOYEE = {
  id: 'emp-pay-1', name: 'Anna Nováková', firstName: 'Anna', lastName: 'Nováková', kind: 'employee',
  position: 'QA', salaryType: 'monthly', salaryAmount: 2000, isActive: true,
  createdAt: '2026-01-01T09:00:00.000Z', updatedAt: '2026-01-01T09:00:00.000Z',
};
const CONTRACTOR = {
  id: 'emp-pay-2', name: 'Dodigital s.r.o.', kind: 'contractor', position: 'Dodávateľ',
  salaryType: 'monthly', salaryAmount: 3000, isActive: true,
  createdAt: '2026-01-02T09:00:00.000Z', updatedAt: '2026-01-02T09:00:00.000Z',
};
const SEPTEMBER = {
  id: 'sal_emp-pay-1_M09_2026', employeeId: EMPLOYEE.id, periodType: 'monthly', periodKey: 'M09', year: 2026,
  periodNumber: 9, items: [{ categoryId: 'base', categoryName: 'Základná mzda', amount: 2000, paidAmount: 0 }],
  totalSalary: 2000, totalPaid: 0, laborCost: 2704, netPay: 1530.4, status: 'pending', dueDate: '2026-10-15',
};

type Pushed = { employeeSalaries?: Record<string, unknown>[] };

async function installBackend(page: Page, pushes: Pushed[]) {
  await page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as Pushed;
        if (Array.isArray(body?.employeeSalaries)) pushes.push(body);
      } catch {
        /* not JSON */
      }
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...buildSyncPayload(),
        employees: [EMPLOYEE, CONTRACTOR],
        employeeSalaries: [SEPTEMBER],
        employeeVacations: [],
        employeeSettings: { salaryDueDay: 15, autoExpense: false, vacationTypes: [], salaryTypes: [] },
      }),
    });
  });
}

test.describe('Employee payslip', () => {
  test('history shows Odvody zamestnávateľa as Cena práce − Hrubá mzda', async ({ page }) => {
    await startSession(page);
    await installBackend(page, []);
    await gotoView(page, `#employees/detail?id=${EMPLOYEE.id}&tab=salaries`);

    const row = page.locator('tbody tr', { hasText: 'M09' });
    await expect(page.getByRole('columnheader', { name: 'Cena práce' })).toBeVisible();
    await expect(row).toContainText('2 704,00');
    await expect(row).toContainText('1 530,40');
    await expect(row).toContainText('704,00');
    await expect(row).not.toContainText('1 173,60');
  });

  test('gross is base + other rows; paid is measured against Cena práce', async ({ page }) => {
    const pushes: Pushed[] = [];
    await startSession(page);
    await installBackend(page, pushes);
    await gotoView(page, `#employees/detail?id=${EMPLOYEE.id}&tab=salaries`);

    await page.getByRole('button', { name: 'Pridať mzdu' }).first().click();
    const payslip = page.getByTestId('salary-payslip');
    await expect(payslip).toBeVisible();
    await expect(page.getByTestId('salary-gross')).toContainText('2 000,00');

    // Základná mzda is the contract amount, locked until unlocked for this month
    await expect(page.getByTestId('salary-base-amount')).toContainText('2 000,00');
    await expect(page.getByTestId('salary-base-input')).toHaveCount(0);
    await page.getByTestId('salary-base-unlock').click();
    await page.getByTestId('salary-base-input').fill('1800');
    await expect(page.getByTestId('salary-gross')).toContainText('1 800,00');
    await page.getByTestId('salary-base-reset').click();
    await expect(page.getByTestId('salary-gross')).toContainText('2 000,00');
    await expect(page.getByTestId('salary-base-reset')).toHaveCount(0);

    // Iné: a custom row adds to the gross
    await page.getByTestId('salary-add-other').click();
    const other = page.getByTestId('salary-other-row');
    await expect(other).toHaveCount(1);
    await other.locator('input[type="text"]').fill('Prémia');
    await other.locator('input[type="number"]').fill('300');
    await expect(page.getByTestId('salary-other-total')).toContainText('300,00');
    await expect(page.getByTestId('salary-gross')).toContainText('2 300,00');

    // Before Cena práce is known, Vyplatené is measured against the gross
    await expect(payslip).toContainText('z hrubej mzdy');
    await page.getByTestId('salary-labor-cost').fill('3110');
    await page.getByTestId('salary-net-pay').fill('1700');
    await expect(page.getByTestId('salary-employer-levies')).toContainText('810,00');
    await expect(page.getByTestId('salary-employee-deductions')).toContainText('600,00');
    await expect(payslip).toContainText('z ceny práce');

    await page.getByRole('button', { name: 'Označiť ako vyplatené' }).click();
    await expect(page.getByTestId('salary-paid')).toHaveValue('3110');
    await expect(page.getByText('Stav: Vyplatené')).toBeVisible();
    await page.screenshot({ path: 'test-results/employee-payslip-drawer.png' });

    await page.getByRole('button', { name: 'Uložiť mzdu' }).click();
    await expect
      .poll(() =>
        pushes
          .flatMap((p) => p.employeeSalaries ?? [])
          .find((s) => s.id !== SEPTEMBER.id && s.laborCost === 3110) ?? null,
      )
      .toMatchObject({
        totalSalary: 2300,
        totalPaid: 3110,
        netPay: 1700,
        status: 'paid',
        items: [
          expect.objectContaining({ categoryId: 'base', amount: 2000 }),
          expect.objectContaining({ categoryName: 'Prémia', amount: 300 }),
        ],
      });
  });

  test('a contractor keeps the per-row table and has no payslip', async ({ page }) => {
    await startSession(page);
    await installBackend(page, []);
    await gotoView(page, `#employees/detail?id=${CONTRACTOR.id}&tab=salaries`);

    await page.getByRole('button', { name: 'Pridať mzdu' }).first().click();
    await expect(page.getByRole('button', { name: 'Uložiť mzdu' })).toBeVisible();
    await expect(page.getByText('Zložky mzdy')).toBeVisible();
    await expect(page.getByTestId('salary-payslip')).toHaveCount(0);
  });
});
