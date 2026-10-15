// One fixture feeds both sides of the parity check: the TypeScript originals read these objects,
// the PHP gateway reads the same rows from MySQL.

export const CATEGORIES = [
  { id: 'inc-root', type: 'income', name: 'Services', parentId: null, level: 1, sortOrder: 0 },
  { id: 'inc-child', type: 'income', name: 'Web design', parentId: 'inc-root', level: 2, sortOrder: 0 },
  { id: 'exp-root', type: 'expense', name: 'Operations', parentId: null, level: 1, sortOrder: 0 },
  { id: 'exp-child1', type: 'expense', name: 'Offices', parentId: 'exp-root', level: 2, sortOrder: 0 },
  { id: 'exp-grand', type: 'expense', name: 'Cleaning', parentId: 'exp-child1', level: 3, sortOrder: 0 },
  // A parent that no longer exists, a parent on the other side of the ledger, and a cycle.
  { id: 'exp-orphan', type: 'expense', name: 'Orphan', parentId: 'gone', level: 2, sortOrder: 1 },
  { id: 'inc-mismatch', type: 'income', name: 'Mismatch', parentId: 'exp-root', level: 2, sortOrder: 1 },
  { id: 'cyc-a', type: 'expense', name: 'Cycle A', parentId: 'cyc-b', level: 2, sortOrder: 2 },
  { id: 'cyc-b', type: 'expense', name: 'Cycle B', parentId: 'cyc-a', level: 2, sortOrder: 3 },
];

const base = {
  subtype: 'regular', currency: 'EUR', amountReal: 0, paidDate: null, dueDate: null, isRecurring: false,
  recurringFrequency: null, recurringConfig: null, recurringStartDate: null, recurringEndDate: null,
  recurringAmountHistory: null, recurringSkippedDates: null, projectId: null, clientId: null, invoiceNumber: null,
  categoryId: null, updatedAt: '2026-01-01 00:00:00', description: null, paymentMethod: null,
};
const R = (o) => ({ ...base, ...o });

export const RECORDS = [
  R({ id: 'f1', type: 'income', title: 'paid income', status: 'paid', categoryId: 'inc-child', issueDate: '2026-02-10', dueDate: '2026-02-20', paidDate: '2026-02-25', amountPlanned: 1000, amountReal: 1000 }),
  R({ id: 'f2', type: 'income', title: 'partial', status: 'partially_paid', categoryId: 'inc-root', issueDate: '2026-10-01', dueDate: '2026-11-15', amountPlanned: 9200, amountReal: 4000, projectId: 'p2' }),
  R({ id: 'f3', type: 'income', title: 'cancelled', status: 'cancelled', categoryId: 'inc-child', issueDate: '2026-03-01', amountPlanned: 500, projectId: 'p1' }),
  R({ id: 'f4', type: 'income', title: 'pending', status: 'pending', categoryId: 'inc-child', issueDate: '2026-10-02', dueDate: '2026-12-05', amountPlanned: 750, projectId: 'p1' }),
  R({ id: 'f4b', type: 'income', title: 'paid on project', status: 'paid', categoryId: 'inc-child', issueDate: '2026-04-01', paidDate: '2026-04-09', amountPlanned: 3000, amountReal: 3000, projectId: 'p1' }),
  R({ id: 'f5', type: 'expense', title: 'paid expense', status: 'paid', categoryId: 'exp-grand', issueDate: '2026-05-01', paidDate: '2026-05-03', amountPlanned: 300, amountReal: 280 }),
  R({ id: 'f6', type: 'expense', title: 'rent monthly', status: 'paid', categoryId: 'exp-child1', issueDate: '2026-01-15', paidDate: '2026-01-15', amountPlanned: 500, amountReal: 0, isRecurring: true, recurringFrequency: 'monthly', recurringConfig: { monthlyType: 'day_of_month', dayOfMonth: 15 }, recurringStartDate: '2026-01-01', recurringAmountHistory: [{ until: '2026-06-30', amountPlanned: 400, amountReal: 400 }], recurringSkippedDates: ['2026-08-15'] }),
  R({ id: 'f7', type: 'expense', title: 'weekly', status: 'planned', categoryId: 'exp-root', issueDate: '2026-03-01', amountPlanned: 50, isRecurring: true, recurringFrequency: 'weekly', recurringConfig: { dayOfWeek: 5 }, recurringStartDate: '2026-03-01', recurringEndDate: '2026-09-30' }),
  R({ id: 'f8', type: 'expense', title: 'yearly 31st', status: 'planned', categoryId: 'exp-root', issueDate: '2025-03-31', amountPlanned: 1200, isRecurring: true, recurringFrequency: 'yearly', recurringConfig: { month: 3, dayOfMonth: 31 }, recurringStartDate: '2025-03-31' }),
  R({ id: 'f9', type: 'expense', title: 'last tuesday', status: 'planned', categoryId: null, issueDate: '2026-04-01', amountPlanned: 99, isRecurring: true, recurringFrequency: 'monthly', recurringConfig: { monthlyType: 'nth_weekday', dayOfWeek: 2, weekOfMonth: -1 }, recurringStartDate: '2026-04-01' }),
  R({ id: 'f10', type: 'expense', title: 'own row rule', status: 'paid', categoryId: 'exp-orphan', issueDate: '2026-09-18', paidDate: '2026-09-18', amountPlanned: 70, amountReal: 70, isRecurring: true, recurringFrequency: 'monthly', recurringConfig: { monthlyType: 'day_of_month', dayOfMonth: 1 }, recurringStartDate: '2026-09-18' }),
  R({ id: 'f11', type: 'expense', title: 'uncategorized', status: 'planned', issueDate: '2026-10-01', dueDate: '2026-10-20', amountPlanned: 80 }),
  R({ id: 'f12', type: 'expense', title: 'wrong side category', status: 'pending', categoryId: 'inc-mismatch', issueDate: '2026-11-01', dueDate: '2026-11-30', amountPlanned: 60 }),
  R({ id: 'f13', type: 'income', title: 'last year', status: 'paid', categoryId: 'inc-child', issueDate: '2025-12-31', paidDate: '2025-12-31', amountPlanned: 400, amountReal: 400 }),
  R({ id: 'f14', type: 'expense', title: 'legacy cancelled rule', status: 'cancelled', categoryId: 'exp-root', issueDate: '2026-01-05', amountPlanned: 25, isRecurring: true, recurringFrequency: 'monthly', recurringConfig: { dayOfMonth: 5 }, recurringStartDate: '2026-01-01', updatedAt: '2026-06-10 12:00:00' }),
  R({ id: 'f15', type: 'expense', title: 'paused rule', status: 'planned', categoryId: 'cyc-a', issueDate: '2026-01-02', amountPlanned: 15, isRecurring: true, recurringFrequency: 'monthly', recurringConfig: { dayOfMonth: 2 }, recurringStartDate: '2026-01-01', recurringEndDate: '2026-07-10' }),
  R({ id: 'f16', type: 'expense', title: 'overdue', status: 'overdue', categoryId: 'exp-child1', issueDate: '2026-08-01', dueDate: '2026-09-01', amountPlanned: 210 }),
  R({ id: 'f17', type: 'income', title: 'due soon partial', status: 'partially_paid', categoryId: 'inc-child', issueDate: '2026-09-20', dueDate: '2026-10-25', paidDate: '2026-10-03', amountPlanned: 800, amountReal: 300, projectId: 'p2' }),
];

export const PROJECTS = [
  { id: 'p1', leadId: null, value: 10000 },
  { id: 'p2', leadId: 'lead-parity', value: null },
  { id: 'p3', leadId: null, value: null, budget: 800 },
];
export const LEAD = { id: 'lead-parity', value: 5000 };

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");

/** SQL that replaces the finance tables' content with the fixture (scratch database only). */
export function fixtureSql() {
  const out = ['SET FOREIGN_KEY_CHECKS=0;', 'DELETE FROM financial_records; DELETE FROM financial_categories;'];
  for (const c of CATEGORIES) {
    out.push(`INSERT INTO financial_categories (id,type,name,parent_id,level,sort_order) VALUES (${q(c.id)},${q(c.type)},${q(c.name)},${q(c.parentId)},${c.level},${c.sortOrder});`);
  }
  for (const r of RECORDS) {
    out.push(
      'INSERT INTO financial_records (id,type,subtype,title,category_id,amount_planned,amount_real,currency,status,issue_date,due_date,paid_date,is_recurring,recurring_frequency,recurring_config_json,recurring_start_date,recurring_end_date,recurring_amount_history_json,recurring_skipped_dates_json,project_id,client_id,invoice_number,updated_at) VALUES ' +
        `(${q(r.id)},${q(r.type)},${q(r.subtype)},${q(r.title)},${q(r.categoryId)},${r.amountPlanned},${r.amountReal},'EUR',${q(r.status)},${q(r.issueDate)},${q(r.dueDate)},${q(r.paidDate)},${r.isRecurring ? 1 : 0},${q(r.recurringFrequency)},${q(r.recurringConfig ? JSON.stringify(r.recurringConfig) : null)},${q(r.recurringStartDate)},${q(r.recurringEndDate)},${q(r.recurringAmountHistory ? JSON.stringify(r.recurringAmountHistory) : null)},${q(r.recurringSkippedDates ? JSON.stringify(r.recurringSkippedDates) : null)},${q(r.projectId)},${q(r.clientId)},${q(r.invoiceNumber)},${q(r.updatedAt)});`,
    );
  }
  out.push("DELETE FROM projects WHERE id IN ('p1','p2','p3');");
  out.push("INSERT IGNORE INTO project_types (id,name,icon,color,attributes_json) VALUES ('pt-parity','Parity','Folder','#000000','[]');");
  out.push("DELETE FROM leads WHERE id='lead-parity'; INSERT INTO leads (id,name,value,status,owner,created_at) VALUES ('lead-parity','Parity Lead',5000,'new','Erik','2026-01-01');");
  for (const p of PROJECTS) {
    out.push(`INSERT INTO projects (id,project_type_id,name,lead_id,status,value,budget) VALUES (${q(p.id)},'pt-parity',${q(p.id)},${q(p.leadId)},'active',${q(p.value)},${q(p.budget ?? null)});`);
  }
  out.push('SET FOREIGN_KEY_CHECKS=1;');
  return out.join('\n');
}
