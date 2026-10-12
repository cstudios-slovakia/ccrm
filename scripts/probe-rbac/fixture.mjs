/**
 * RBAC Probe Fixture.
 *
 * Populates a scratch MySQL database with users, roles, employees, tasks,
 * leads, finance records, and settings needed to test server-side isolation.
 */
import { employeeRolePermissions } from '../../src/utils/permissions.ts';

export const FAKE_TOGGL_TOKEN = 'FAKE_TOGGL_SECRET_TOKEN_12345';
export const FAKE_CLOCKIFY_KEY = 'FAKE_CLOCKIFY_KEY_67890';

export const USERS = {
  admin: { id: 'probe-admin', name: 'Probe Admin', email: 'probe-admin@probe.test', role: 'Admin' },
  pm: { id: 'probe-pm', name: 'Probe PM', email: 'probe-pm@probe.test', role: 'Project Manager' },
  hr: { id: 'probe-hr', name: 'Probe HR', email: 'probe-hr@probe.test', role: 'HR' },
  hr_lite: { id: 'probe-hr-lite', name: 'Probe HR-Lite', email: 'probe-hr-lite@probe.test', role: 'HR-Lite' },
  employee_a: { id: 'probe-employee-a', name: 'Probe Employee A', email: 'probe-employee-a@probe.test', role: 'Employee' },
  employee_b: { id: 'probe-employee-b', name: 'Probe Employee B', email: 'probe-employee-b@probe.test', role: 'Employee' },
  employee_unlinked: { id: 'probe-employee-unlinked', name: 'Probe Unlinked', email: 'probe-employee-unlinked@probe.test', role: 'Employee' },
  viewer: { id: 'probe-viewer', name: 'Probe Viewer', email: 'probe-viewer@probe.test', role: 'Viewer' },
  employee_variant: { id: 'probe-employee-variant', name: 'Probe Variant', email: 'probe-employee-variant@probe.test', role: 'EmployeeVariant' },
  // Roles that exist to prove one specific write rule each.
  finance: { id: 'probe-finance', name: 'Probe Finance', email: 'probe-finance@probe.test', role: 'FinanceOnly' },
  pipeliner: { id: 'probe-pipeliner', name: 'Probe Pipeliner', email: 'probe-pipeliner@probe.test', role: 'Pipeliner' },
  leads_only: { id: 'probe-leads-only', name: 'Probe LeadsOnly', email: 'probe-leads-only@probe.test', role: 'LeadsOnly' },
  account_editor: { id: 'probe-account-editor', name: 'Probe Account Editor', email: 'probe-account-editor@probe.test', role: 'AccountEditor' },
};

export const BILLING_SETTINGS = { companyName: 'Probe Billing Co', iban: 'SK0000000000000000000000' };

export const EMPLOYEE_A = {
  id: 'pe-a',
  name: 'Probe Employee A',
  user_id: 'probe-employee-a',
  email: 'probe-employee-a@probe.test',
  pin: '910101/1111',
  phone: '+421901111111',
  address_street: 'Alice Secret Street 10',
  address_city: 'Bratislava',
  address_zip: '81101',
  address_country: 'Slovakia',
  notes: 'Alice confidential HR notes',
  salary_type: 'monthly',
  salary_amount: 2500,
  salary_due_day: 15,
  auto_expense: 1,
  expense_category_id: 'exp-root',
  vacation_allowances: JSON.stringify({ 2026: { annual: 25, carried: 0 } }),
  files: JSON.stringify([{ id: 'pf-a-1', name: 'alice_contract.pdf', path: 'uploads/employees/private/alice_contract.pdf', uploadedAt: '2026-01-01' }]),
};

export const EMPLOYEE_B = {
  id: 'pe-b',
  name: 'Probe Employee B',
  user_id: 'probe-employee-b',
  email: 'probe-employee-b@probe.test',
  pin: '920202/2222',
  phone: '+421902222222',
  address_street: 'Bob Secret Street 20',
  address_city: 'Kosice',
  address_zip: '04001',
  address_country: 'Slovakia',
  notes: 'Bob confidential HR notes',
  salary_type: 'monthly',
  salary_amount: 3200,
  salary_due_day: 15,
  auto_expense: 1,
  expense_category_id: 'exp-root',
  vacation_allowances: JSON.stringify({ 2026: { annual: 20, carried: 0 } }),
  files: JSON.stringify([{ id: 'pf-b-1', name: 'bob_contract.pdf', path: 'uploads/employees/private/bob_contract.pdf', uploadedAt: '2026-01-01' }]),
};

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");

export function fixtureSql() {
  const empPerms = employeeRolePermissions();
  const hrPerms = {
    ...empPerms,
    employees: 'edit',
    'employees.salaries': 'edit',
    'employees.vacations': 'edit',
    'employees.files': 'edit',
    'employees.personal': 'edit',
    'employees.delete': 'edit',
    financial: 'edit',
    tasks: 'edit',
    'tasks.view_all': 'edit',
  };
  const hrLitePerms = {
    ...empPerms,
    employees: 'edit',
    'employees.salaries': 'nothing',
    'employees.vacations': 'edit',
    'employees.files': 'edit',
    'employees.personal': 'edit',
    'employees.delete': 'edit',
    financial: 'view',
    tasks: 'view',
    'tasks.view_all': 'edit',
  };
  const empVariantPerms = {
    ...empPerms,
    'self.vacations': 'edit',
    'self.profile': 'edit',
  };
  const pmPerms = {
    ...hrPerms,
    dashboard: 'edit',
    'dashboard.custom': 'edit',
    leads: 'edit',
    'leads.delete': 'edit',
    clients: 'edit',
    'clients.delete': 'edit',
    projects: 'edit',
    'projects.delete': 'edit',
    invoices: 'edit',
    'invoices.delete': 'edit',
    warehouse: 'edit',
    'warehouse.delete': 'edit',
    meetings: 'edit',
    'meetings.delete': 'edit',
    files: 'edit',
    'files.delete': 'edit',
    email: 'edit',
    unified_entries: 'edit',
    'unified_entries.delete': 'edit',
  };
  const viewerPerms = {
    dashboard: 'view',
    tasks: 'view',
    'tasks.view_all': 'edit',
  };

  const nothing = { ...empPerms };
  const financeOnlyPerms = { ...nothing, financial: 'edit', 'financial.delete': 'edit' };
  const pipelinerPerms = { ...nothing, pipeline_stages: 'edit' };
  const leadsOnlyPerms = { ...nothing, leads: 'edit', 'leads.delete': 'edit', tasks: 'edit', 'tasks.view_all': 'edit' };
  const accountEditorPerms = { ...nothing, 'self.account': 'edit' };

  const roles = [
    { name: 'Admin', permissions: {} },
    { name: 'Project Manager', permissions: pmPerms },
    { name: 'HR', permissions: hrPerms },
    { name: 'HR-Lite', permissions: hrLitePerms },
    { name: 'Employee', permissions: empPerms },
    { name: 'Viewer', permissions: viewerPerms },
    { name: 'EmployeeVariant', permissions: empVariantPerms },
    { name: 'FinanceOnly', permissions: financeOnlyPerms },
    { name: 'Pipeliner', permissions: pipelinerPerms },
    { name: 'LeadsOnly', permissions: leadsOnlyPerms },
    { name: 'AccountEditor', permissions: accountEditorPerms },
  ];

  const employeeSettings = {
    defaultAutoExpense: false,
    defaultExpenseCategoryId: 'exp-root',
    defaultSalaryDueDay: 15,
    salaryPeriod: 'monthly',
    salaryTypes: ['monthly', 'hourly'],
    vacationTypes: ['vacation', 'sick_leave'],
    timeTracking: {
      provider: 'toggl',
      togglApiToken: FAKE_TOGGL_TOKEN,
      clockifyApiKey: FAKE_CLOCKIFY_KEY,
    },
  };

  const lines = [
    'SET FOREIGN_KEY_CHECKS=0;',
    'DELETE FROM users WHERE email LIKE "%@probe.test";',
    'DELETE FROM system_settings WHERE `key` IN ("ROLES_RBAC", "EMPLOYEE_SETTINGS");',
    `REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('ROLES_RBAC', ${q(JSON.stringify(roles))});`,
    `REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('EMPLOYEE_SETTINGS', ${q(JSON.stringify(employeeSettings))});`,
    `REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('COMPANY_BILLING_SETTINGS', ${q(JSON.stringify(BILLING_SETTINGS))});`,
  ];

  for (const u of Object.values(USERS)) {
    lines.push(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (${q(u.id)}, ${q(u.name)}, ${q(u.email)}, 'x', ${q(u.role)});`
    );
  }

  // Employees
  lines.push('DELETE FROM employees WHERE id IN ("pe-a", "pe-b");');
  for (const e of [EMPLOYEE_A, EMPLOYEE_B]) {
    lines.push(
      `INSERT INTO employees (id, name, user_id, pin, phone, address_street, address_city, address_zip, address_country, notes, salary_type, salary_amount, salary_due_day, auto_expense, expense_category_id, vacation_allowances_json, files_json, is_active) VALUES (${q(e.id)}, ${q(e.name)}, ${q(e.user_id)}, ${q(e.pin)}, ${q(e.phone)}, ${q(e.address_street)}, ${q(e.address_city)}, ${q(e.address_zip)}, ${q(e.address_country)}, ${q(e.notes)}, ${q(e.salary_type)}, ${e.salary_amount}, ${e.salary_due_day}, ${e.auto_expense}, ${q(e.expense_category_id)}, ${q(e.vacation_allowances)}, ${q(e.files)}, 1);`
    );
  }

  // Employee Salaries & Vacations
  lines.push('DELETE FROM employee_salaries WHERE employee_id IN ("pe-a", "pe-b");');
  lines.push('DELETE FROM employee_vacations WHERE employee_id IN ("pe-a", "pe-b");');
  lines.push(`INSERT INTO employee_salaries (id, employee_id, period_type, period_key, year, period_number, items_json, total_salary, total_paid, status) VALUES ('sal-a-1', 'pe-a', 'monthly', '2026-01', 2026, 1, '[]', 2500, 2500, 'paid'), ('sal-b-1', 'pe-b', 'monthly', '2026-01', 2026, 1, '[]', 3200, 3200, 'paid');`);
  lines.push(`INSERT INTO employee_vacations (id, employee_id, vacation_type_id, start_date, end_date, days_count, status) VALUES ('vac-a-1', 'pe-a', 'vacation', '2026-06-01', '2026-06-05', 5, 'approved'), ('vac-b-1', 'pe-b', 'vacation', '2026-07-01', '2026-07-05', 5, 'approved');`);

  // Leads & Clients
  lines.push('DELETE FROM leads WHERE id IN ("lead-probe-1", "client-probe-1");');
  lines.push(`INSERT INTO leads (id, name, value, status, owner, archived, adjustment, created_at) VALUES ('lead-probe-1', 'Alpha Lead', 5000, 'new', 'Probe Admin', 0, 0, NOW()), ('client-probe-1', 'Beta Client', 10000, 'accepted', 'Probe Admin', 0, 0, NOW());`);

  // Projects
  lines.push('DELETE FROM projects WHERE id IN ("proj-probe-1");');
  lines.push("INSERT IGNORE INTO project_types (id, name, icon, color, attributes_json) VALUES ('pt-probe', 'Probe Type', 'Folder', '#000', '[]');");
  lines.push(`INSERT INTO projects (id, project_type_id, name, lead_id, status, value, created_at) VALUES ('proj-probe-1', 'pt-probe', 'Project Alpha', 'lead-probe-1', 'active', 8000, NOW());`);

  // Invoices
  lines.push('DELETE FROM invoices_offers WHERE id IN ("inv-probe-1");');
  lines.push(`INSERT INTO invoices_offers (id, document_number, type, lead_id, client_name, title, subject, total_price, status, issued_at) VALUES ('inv-probe-1', 'FA-2026-001', 'invoice', 'lead-probe-1', 'Beta Client', 'Invoice Alpha', 'Services', 1200, 'draft', '2026-01-15');`);

  // Financial categories & records
  lines.push('DELETE FROM financial_records WHERE id IN ("fr-sal-1", "fr-regular-1");');
  lines.push("INSERT IGNORE INTO financial_categories (id, type, name, parent_id, level, sort_order) VALUES ('exp-root', 'expense', 'Operations', NULL, 1, 0);");
  lines.push(`INSERT INTO financial_records (id, type, subtype, title, description, amount_planned, amount_real, currency, status, issue_date, category_id) VALUES ('fr-sal-1', 'expense', 'salary', 'Salary Alice', 'Salary for Probe Employee A', 2500, 2500, 'EUR', 'paid', '2026-01-15', 'exp-root'), ('fr-regular-1', 'expense', 'regular', 'Office Supplies', 'Paper and pens', 150, 150, 'EUR', 'paid', '2026-01-20', 'exp-root');`);

  // Tasks & Assignees
  lines.push('DELETE FROM tasks WHERE id IN ("task-a-own", "task-a-created", "task-a-assigned", "task-b-own", "task-unassigned");');
  lines.push('DELETE FROM task_assignees WHERE task_id IN ("task-a-own", "task-a-created", "task-a-assigned", "task-b-own", "task-unassigned");');
  lines.push(`INSERT INTO tasks (id, title, owner, created_by, related_lead_id, related_project_id, status, priority, archived, deadline) VALUES
    ('task-a-own', 'Task Owned By Alice', 'Probe Employee A', 'Probe Admin', 'lead-probe-1', 'proj-probe-1', 'New', 'medium', 0, '2026-12-31'),
    ('task-a-created', 'Task Created By Alice', 'Probe Admin', 'Probe Employee A', 'lead-probe-1', NULL, 'New', 'medium', 0, '2026-12-31'),
    ('task-a-assigned', 'Task Assigned To Alice', 'Probe Admin', 'Probe Admin', NULL, 'proj-probe-1', 'New', 'medium', 0, '2026-12-31'),
    ('task-b-own', 'Task Owned By Bob', 'Probe Employee B', 'Probe Employee B', NULL, NULL, 'New', 'medium', 0, '2026-12-31'),
    ('task-unassigned', 'Unassigned Task', '', 'Probe Admin', NULL, NULL, 'New', 'medium', 0, '2026-12-31');`);
  lines.push(`INSERT INTO task_assignees (task_id, user_name) VALUES ('task-a-assigned', 'Probe Employee A');`);

  // Warehouses, Meetings, Unified entries
  lines.push('DELETE FROM warehouses WHERE id IN ("wh-probe-1");');
  lines.push(`INSERT INTO warehouses (id, name, code, is_default) VALUES ('wh-probe-1', 'Probe Warehouse', 'PWH-1', 0);`);

  lines.push('DELETE FROM meeting_notes WHERE id IN ("mn-probe-1");');
  lines.push(`INSERT INTO meeting_notes (id, title, date, lead_name) VALUES ('mn-probe-1', 'Secret Executive Meeting', '2026-01-15', 'Beta Client');`);

  lines.push('DELETE FROM unified_entries WHERE id IN ("ue-probe-1");');
  lines.push(`INSERT INTO unified_entries (id, name, icon, color, modules_json) VALUES ('ue-probe-1', 'Secret Unified Entry', 'Folder', '#000', '[]');`);

  lines.push('SET FOREIGN_KEY_CHECKS=1;');
  return lines.join('\n');
}
