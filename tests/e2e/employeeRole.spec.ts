import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';
import { employeeRolePermissions } from '../../src/utils/permissions';
import { getTranslation } from '../../src/utils/translations';

/**
 * The native Employee role, as the browser sees it.
 *
 * The backend is mocked, so this proves what the UI does with the answers the real server gives an
 * Employee (every restricted collection empty, a readScope block, the self-service endpoint) - not
 * that the server filters. The server's side is proven by `npm run test:rbac`.
 *
 * The QA workspace speaks Slovak, so labels come from the same translation table the app reads.
 */

const sk = (key: string) => getTranslation('sk', key);

const EMPLOYEE_USER = {
  id: 'user-eva',
  name: 'Eva Zamestnanec',
  email: 'eva@crm.com',
  role: 'Employee',
  color: '#0ea5e9',
  activityLog: [],
  metadata_json: '{}',
};

const OWN_TASK = {
  id: 'task-eva-1',
  title: 'Moja úloha',
  description: '',
  priority: 'medium',
  startDate: null,
  deadline: '2099-12-31',
  deadlineTime: null,
  status: 'New',
  owner: EMPLOYEE_USER.name,
  createdBy: 'Erik',
  relatedLeadId: null,
  relatedProjectId: null,
  isLocking: false,
  archived: false,
  assignedUsers: [EMPLOYEE_USER.name],
  tags: [],
};

const EMPLOYEE_ROLE = { name: 'Employee', permissions: employeeRolePermissions() };

const OVERVIEW = {
  success: true,
  identity: { id: 'emp-eva', name: EMPLOYEE_USER.name, email: EMPLOYEE_USER.email, isActive: true },
  can: { profile: true, editProfile: false, payroll: true, leave: true, requestLeave: true, files: true, hours: true },
  personal: { pin: '900101/1234', phone: '+421 900 111 222', addressStreet: 'Hlavná 1', addressCity: 'Košice', addressZip: '04001', addressCountry: 'Slovakia' },
  pay: {
    salaryType: 'monthly',
    salaryAmount: 2100,
    salaryDueDay: 10,
    payroll: [
      { id: 'sal-1', periodType: 'monthly', periodKey: '2026-09', year: 2026, periodNumber: 9, items: [], totalSalary: 2100, totalPaid: 2100, status: 'paid', dueDate: '2026-10-10', paymentDate: '2026-10-09', paymentMethod: 'bank_transfer', note: null },
    ],
  },
  leave: {
    vacationAllowances: { annual: 20 },
    types: [{ id: 'annual', name: 'Dovolenka', color: '#0ea5e9', isPaid: true, defaultAllowance: 20 }],
    requests: [{ id: 'vac-1', vacationTypeId: 'annual', startDate: '2026-12-21', endDate: '2026-12-23', daysCount: 3, status: 'requested', note: null }],
    balances: [{ typeId: 'annual', year: 2026, allowance: 20, used: 3, remaining: 17 }],
  },
  documents: [{ id: 'pf-1', name: 'zmluva.pdf', size: 2048, type: 'application/pdf', uploadedAt: '2026-01-01T00:00:00Z', downloadUrl: '/api/employee_file.php?employee=emp-eva&file=pf-1' }],
};

/** What sync.php sends an Employee: restricted collections empty (never omitted), plus readScope. */
function employeeSyncPayload() {
  const base = buildSyncPayload();
  return {
    ...base,
    leads: [],
    tasks: [OWN_TASK],
    users: [EMPLOYEE_USER],
    roles: [EMPLOYEE_ROLE],
    meetingNotes: [],
    unifiedEntries: [],
    unifiedEntriesData: {},
    projectTypes: [],
    projects: [],
    warehouses: [],
    suppliers: [],
    warehouseItems: [],
    warehouseStock: [],
    warehouseBatches: [],
    warehouseMovements: [],
    financialCategories: [],
    clientCategories: [],
    financialRecords: [],
    invoicesOffers: [],
    aiCustomTemplates: [],
    employees: [],
    employeeSalaries: [],
    employeeVacations: [],
    employeeSettings: null,
    readScope: {
      restricted: ['leads', 'projects', 'meetingNotes', 'employees', 'employeeSalaries', 'employeeVacations', 'financialRecords', 'invoicesOffers'],
      rowScoped: ['tasks'],
      referenceNames: { leads: {}, projects: {} },
    },
  };
}

async function asEmployee(page: Page, myEmployment: unknown = OVERVIEW) {
  await startSession(page);
  // Registered after the admin seed, so this session wins.
  await page.addInitScript((user: string) => {
    try {
      window.sessionStorage.setItem('crm_current_user_rbac', user);
    } catch {
      /* the login fallback handles it */
    }
  }, JSON.stringify(EMPLOYEE_USER));
  await page.route('**/sync.php**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(employeeSyncPayload()) });
  });
  await page.route('**/api/my_employment.php**', (route) => {
    const url = route.request().url();
    if (url.includes('action=hours')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, no_user_attached: true, data: null }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(myEmployment) });
  });
}

test.describe('Employee role', () => {
  test('the sidebar offers only Tasks, People and Updates', async ({ page }) => {
    await asEmployee(page);
    await gotoView(page, '#tasks');
    const sidebar = page.locator('[data-sidebar="true"]');
    for (const key of ['sidebar.tasks', 'sidebar.employees']) {
      await expect(sidebar.locator(`[title="${sk(key)}"]`).first()).toBeVisible();
    }
    for (const key of ['sidebar.leads', 'sidebar.clients', 'sidebar.my_employment', 'sidebar.financial', 'sidebar.warehouse', 'sidebar.meetings']) {
      await expect(sidebar.locator(`[title="${sk(key)}"]`)).toHaveCount(0);
    }
    // SAI is a sales module: no sales access, no SAI.
    await expect(sidebar.locator('[title="SAI"]')).toHaveCount(0);
  });

  test('#employees opens the own-data tab, not the company directory', async ({ page }) => {
    await asEmployee(page);
    await gotoView(page, '#employees');
    await expect(page.getByTestId('my-employment-page')).toBeVisible();
    await expect(page.getByText('950122/8104')).toHaveCount(0);
    await expect(page.getByText('K tejto sekcii nemáte prístup')).toHaveCount(0);
  });

  test('#my-employment still opens the own-data tab', async ({ page }) => {
    await asEmployee(page);
    await gotoView(page, '#my-employment');
    await expect(page.getByTestId('my-employment-page')).toBeVisible();

    // Personal data, read-only by default (self.profile = view).
    await expect(page.getByText('900101/1234')).toBeVisible();
    await expect(page.getByTestId('my-employment-edit-contact')).toHaveCount(0);

    await page.getByRole('tab', { name: sk('myEmployment.tab.payroll') }).click();
    await expect(page.getByTestId('my-employment-rate')).toContainText('2');
    await expect(page.getByTestId('my-employment-payroll')).toContainText('2026-09');

    await page.getByRole('tab', { name: sk('myEmployment.tab.leave') }).click();
    await expect(page.getByTestId('my-employment-balances')).toContainText('Dovolenka');
    // The leave-request form is there (self.vacations = edit) and has no employee picker or status field.
    await expect(page.getByTestId('my-employment-leave-form')).toBeVisible();
    await expect(page.getByTestId('my-employment-leave-form').locator('select')).toHaveCount(1);
    await expect(page.getByTestId('my-employment-leave-list')).toContainText(sk('myEmployment.leave.status.requested'));

    await page.getByRole('tab', { name: sk('myEmployment.tab.documents') }).click();
    await expect(page.getByTestId('my-employment-documents')).toContainText('zmluva.pdf');
    await expect(page.getByTestId('my-employment-documents').locator('a')).toHaveAttribute('href', /employee_file\.php\?employee=emp-eva&file=pf-1/);

    await page.getByRole('tab', { name: sk('myEmployment.tab.hours') }).click();
    await expect(page.getByTestId('my-employment-no-tracker')).toBeVisible();
    await page.screenshot({ path: 'test-results/my-employment.png', fullPage: false });
  });

  test('an unlinked login sees the friendly "not linked yet" state', async ({ page }) => {
    await asEmployee(page, { success: false, code: 'not_linked' });
    await gotoView(page, '#my-employment');
    await expect(page.getByTestId('my-employment-not-linked')).toBeAttached();
    await expect(page.getByText(sk('myEmployment.not_linked.title'))).toBeVisible();
  });

  test('Personal settings shows the name and e-mail read-only, with the password still editable', async ({ page }) => {
    await asEmployee(page);
    await gotoView(page, '#personal-settings');
    await expect(page.getByTestId('personal-name')).toHaveAttribute('readonly', '');
    await expect(page.getByTestId('personal-email')).toHaveAttribute('readonly', '');
    await expect(page.getByTestId('personal-account-locked')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeEditable();
  });
});

test.describe('Role matrix', () => {
  test('Admin sees the Employee column, the HR rows, the self-service section and the reset action', async ({ page }) => {
    await startSession(page);
    await page.route('**/sync.php**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const payload = buildSyncPayload();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...payload, roles: [...payload.roles, EMPLOYEE_ROLE] }),
      });
    });
    await gotoView(page, '#settings/rbac');
    await expect(page.getByRole('columnheader', { name: /Employee/ })).toBeVisible();
    for (const key of [
      'settings.rbac.perm.employees.salaries.label',
      'settings.rbac.perm.employees.vacations.label',
      'settings.rbac.perm.employees.files.label',
      'settings.rbac.perm.employees.personal.label',
      'settings.rbac.perm.self.profile.label',
      'settings.rbac.perm.self.account.label',
    ]) {
      await expect(page.getByText(sk(key), { exact: true })).toBeVisible();
    }
    await expect(page.getByText(sk('settings.rbac.section.self_service'), { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('rbac-reset-employee')).toBeVisible();
    await page.screenshot({ path: 'test-results/rbac-matrix-employee.png', fullPage: false });
  });
});
