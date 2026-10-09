#!/usr/bin/env node
/**
 * Probe for the MCP gateway (public/api/mcp*.php) against the local Docker backend.
 *
 * Why it exists: the QA suite mocks the backend, so nothing in it can run PHP. The gateway is
 * the one place where an AI client can read and write business data, so it gets its own check:
 *
 *   1. authorization  - which tools a key may see/call for roles with nothing / view / edit,
 *                       field stripping, tasks.view_all, key revocation, no wildcard CORS,
 *                       and a source-level guarantee that no tool deletes rows;
 *   2. parity         - the PHP finance maths against the TypeScript originals on one fixture;
 *   3. write paths    - invoices, stock, payroll, leads, projects, tasks follow the app's rules.
 *
 * It never touches the dev data: it clones the dev database into a scratch schema, serves a copy
 * of public/api from a scratch directory of the dev web container, and drops both when done.
 *
 *   npm run test:mcp
 *
 * Needs `docker compose up` (containers `crm` and `ccrm-db-1`). Overrides:
 *   CCRM_PROBE_WEB_CONTAINER, CCRM_PROBE_DB_CONTAINER, CCRM_PROBE_DB_ROOT_PASSWORD,
 *   CCRM_PROBE_DEV_DB (database to clone, default ccrm), CCRM_PROBE_URL (default http://127.0.0.1:8085).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORIES, RECORDS, PROJECTS, LEAD, fixtureSql } from './fixture.mjs';

const WEB = process.env.CCRM_PROBE_WEB_CONTAINER || 'crm';
const DB = process.env.CCRM_PROBE_DB_CONTAINER || 'ccrm-db-1';
const ROOT_PW = process.env.CCRM_PROBE_DB_ROOT_PASSWORD || 'ccrm_root_password';
const DEV_DB = process.env.CCRM_PROBE_DEV_DB || 'ccrm';
const BASE = (process.env.CCRM_PROBE_URL || 'http://127.0.0.1:8085').replace(/\/$/, '');
const SCRATCH_DB = 'ccrm_mcp_probe';
const SCRATCH_DIR = '/var/www/html/mcpprobe';
const ENDPOINT = `${BASE}/mcpprobe/api/mcp.php`;

const root = fileURLToPath(new URL('../../', import.meta.url));
const apiDir = fileURLToPath(new URL('../../public/api/', import.meta.url));
const utils = (f) => pathToFileURL(root + 'src/utils/' + f).href;

// ----------------------------------------------------------------------------- plumbing
const run = (cmd, args, input) => execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const docker = (...args) => run('docker', args);

const sql = (q, db = SCRATCH_DB) => {
  try {
    return docker('exec', '-i', DB, 'mysql', '-uroot', `-p${ROOT_PW}`, '--default-character-set=utf8mb4', '--batch', '--raw', db, '-e', q);
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter((l) => !l.includes('Using a password')).slice(0, 2).join(' | ');
    throw new Error('SQL failed: ' + msg);
  }
};
const rows = (q) => sql(q).split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'));
const cell = (q) => rows(q)[0]?.[0];

let failures = 0, passes = 0;
const check = (name, ok, detail = '') => {
  if (ok) passes++; else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + String(detail).slice(0, 300)}`);
};
const section = (t) => console.log(`\n== ${t}`);

let rpcId = 1;
async function rpc(method, params, token) {
  const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }) });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}
async function call(token, tool, args = {}) {
  const { body } = await rpc('tools/call', { name: tool, arguments: args }, token);
  if (!body) return { __error: 'no response' };
  if (body.error) return { __rpc: body.error };
  const text = body.result.content[0].text;
  if (body.result.isError) return { __error: text };
  try { return JSON.parse(text); } catch { return text; }
}
const listTools = async (token) => ((await rpc('tools/list', {}, token)).body?.result?.tools || []).map((t) => t.name);
const isErr = (r, re) => !!(r && r.__error && (!re || re.test(r.__error)));
const forbidden = (r) => !!(r && r.__rpc && r.__rpc.code === -32003);

// ----------------------------------------------------------------------------- setup / teardown
const MODULES = ['dashboard', 'tasks', 'leads', 'clients', 'projects', 'invoices', 'warehouse', 'financial', 'employees', 'meetings', 'files', 'email', 'unified_entries', 'automation', 'social_media'];
const SETTINGS_KEYS = ['general_config', 'pm_managers', 'pipeline_stages', 'traffic_sources', 'ai_config', 'system_reset', 'nav_edit'];
const role = (name, level) => ({
  name,
  permissions: {
    ...Object.fromEntries(MODULES.map((m) => [m, level])),
    ...Object.fromEntries(SETTINGS_KEYS.map((k) => [k, 'nothing'])),
    'tasks.view_all': 'nothing', 'employees.salaries': 'nothing', 'dashboard.custom': 'nothing', 'overview': 'nothing',
    'leads.delete': 'nothing', 'clients.delete': 'nothing', 'projects.delete': 'nothing', 'invoices.delete': 'nothing',
    'warehouse.delete': 'nothing', 'financial.delete': 'nothing', 'employees.delete': 'nothing', 'meetings.delete': 'nothing',
    'files.delete': 'nothing', 'unified_entries.delete': 'nothing', 'tasks.delete': 'nothing',
  },
});
const sq = (v) => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const TOKENS = {};
const USERS = { admin: ['probe-admin', 'Probe Admin', 'Admin'], none: ['probe-none', 'Probe None', 'ProbeNone'], viewer: ['probe-viewer', 'Probe Viewer', 'ProbeViewer'], editor: ['probe-editor', 'Probe Editor', 'ProbeEditor'] };

function setup() {
  for (const c of [WEB, DB]) {
    let running = 'false';
    try { running = docker('inspect', '-f', '{{.State.Running}}', c).trim(); } catch { /* missing */ }
    if (running !== 'true') throw new Error(`Container "${c}" is not running. Start the dev backend first: docker compose up -d`);
  }
  sql(`DROP DATABASE IF EXISTS ${SCRATCH_DB}; CREATE DATABASE ${SCRATCH_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON ${SCRATCH_DB}.* TO 'ccrm_user'@'%';`, 'mysql');
  const dump = run('docker', ['exec', DB, 'mysqldump', '-uroot', `-p${ROOT_PW}`, '--single-transaction', '--no-tablespaces', DEV_DB]);
  run('docker', ['exec', '-i', DB, 'mysql', '-uroot', `-p${ROOT_PW}`, SCRATCH_DB], dump);

  docker('exec', WEB, 'sh', '-c', `rm -rf ${SCRATCH_DIR} && mkdir -p ${SCRATCH_DIR}/api`);
  docker('cp', apiDir + '.', `${WEB}:${SCRATCH_DIR}/api`);
  docker('exec', WEB, 'sh', '-c', `sed "s/define('DB_NAME', '[^']*')/define('DB_NAME', '${SCRATCH_DB}')/" /var/www/html/config.php > ${SCRATCH_DIR}/config.php`);

  const roles = [role('ProbeNone', 'nothing'), role('ProbeViewer', 'view'), role('ProbeEditor', 'edit')];
  const statuses = [{ key: 'new', color: '#0ea5e9', group: 'new' }, { key: 'active', color: '#a855f7', group: 'in_progress' }, { key: 'on_hold', color: '#f59e0b', group: 'in_progress' }, { key: 'completed', color: '#10b981', group: 'completed' }, { key: 'cancelled', color: '#f43f5e', group: 'cancelled' }];
  const settings = {
    ROLES_RBAC: JSON.stringify([{ name: 'Admin', permissions: {} }, ...roles]),
    LEAD_STATES: JSON.stringify(['new', 'contacted', 'offer sent', 'accepted', 'rejected']),
    LEAD_STAGE_GROUPS: JSON.stringify({ new: 'new', contacted: 'in_progress', 'offer sent': 'in_progress', accepted: 'closed', rejected: 'closed' }),
    LEAD_STATE_PARENTS: '{}', LEAD_STATE_SLA: JSON.stringify({ contacted: 3 }),
    TASK_STATES: JSON.stringify(['New', 'In progress', 'Blocked', 'Done']),
    PROJECT_STATUSES: JSON.stringify(statuses), FINANCIAL_MODE: 'connected',
    EMPLOYEE_SETTINGS: JSON.stringify({ defaultAutoExpense: false, defaultExpenseCategoryId: 'exp-root', defaultSalaryDueDay: 15 }),
  };
  sql(Object.entries(settings).map(([k, v]) => `REPLACE INTO system_settings (\`key\`, \`value\`) VALUES (${sq(k)}, ${sq(v)});`).join('\n'));

  for (const [k, [id, name, r]] of Object.entries(USERS)) {
    sql(`DELETE FROM users WHERE id=${sq(id)} OR email=${sq(id + '@probe.test')};
         INSERT INTO users (id,name,email,password_hash,role) VALUES (${sq(id)},${sq(name)},${sq(id + '@probe.test')},'x',${sq(r)});`);
    const token = `ccrm_mcp_probe_${k}_${'0'.repeat(40)}`;
    TOKENS[k] = token;
    sql(`INSERT INTO mcp_keys (id,user_id,key_hash,key_prefix,name,created_at) VALUES (${sq('pk-' + k)},${sq(id)},${sq(createHash('sha256').update(token).digest('hex'))},'ccrm_mcp_p...','probe',NOW() - INTERVAL 1 DAY);`);
  }

  // Self-contained warehouse / payroll rows so the checks do not depend on demo data.
  sql(`INSERT INTO warehouses (id,name,code,is_default) VALUES ('pw-1','Probe warehouse','PW-1',0) ON DUPLICATE KEY UPDATE name=name;
       INSERT INTO warehouse_items (id,sku,name,min_stock,avg_purchase_price,default_sell_price) VALUES ('pi-1','PI-1','Probe item',5,110,210) ON DUPLICATE KEY UPDATE name=name;
       INSERT INTO warehouse_stock (warehouse_id,item_id,quantity,reserved_quantity) VALUES ('pw-1','pi-1',28,3) ON DUPLICATE KEY UPDATE quantity=28;
       DELETE FROM employee_salaries WHERE employee_id='pe-1'; DELETE FROM employee_vacations WHERE employee_id='pe-1'; DELETE FROM employees WHERE id='pe-1';
       INSERT INTO employees (id,name,pin,salary_type,salary_amount,auto_expense,expense_category_id,salary_due_day,is_active) VALUES ('pe-1','Probe Employee','900101/1234','monthly',2000,1,'exp-root',15,1);`);
}

function teardown() {
  try { sql(`DROP DATABASE IF EXISTS ${SCRATCH_DB};`, 'mysql'); } catch (e) { console.log('cleanup (db):', e.message); }
  try { docker('exec', WEB, 'sh', '-c', `rm -rf ${SCRATCH_DIR}`); } catch (e) { console.log('cleanup (files):', e.message); }
}

// ----------------------------------------------------------------------------- 1. authorization
async function authorizationChecks() {
  section('authorization');
  const defined = new Set();
  for (const f of readdirSync(apiDir).filter((n) => /^mcp.*\.php$/.test(n))) {
    for (const m of readFileSync(apiDir + f, 'utf8').matchAll(/'name' => '([a-z_]+)',\s*\n\s*'description'/g)) defined.add(m[1]);
  }
  const adminTools = await listTools(TOKENS.admin);
  check(`Admin sees every defined tool (${defined.size})`, adminTools.length === defined.size && [...defined].every((t) => adminTools.includes(t)), `admin ${adminTools.length}, defined ${defined.size}`);
  check('every defined tool is in the permission table (fail-closed)', adminTools.length === defined.size, '');

  const noneTools = await listTools(TOKENS.none);
  check('role with nothing sees only the two open tools', noneTools.every((t) => ['search_entities', 'list_team_members'].includes(t)) && noneTools.length === 2, noneTools.join(','));
  for (const t of ['list_salaries', 'list_employees', 'get_financial_summary', 'list_tasks', 'create_task', 'get_invoicable_summary', 'adjust_stock']) {
    check(`nothing-role is refused ${t} (-32003)`, forbidden(await call(TOKENS.none, t, {})), '');
  }
  check('unknown tool is refused, not "unrecognized"', forbidden(await call(TOKENS.admin, 'drop_everything', {})), '');
  const noneSearch = await call(TOKENS.none, 'search_entities', { query: 'a' });
  check('search_entities returns no module sections to nothing-role', noneSearch && !noneSearch.__error && Object.keys(noneSearch).length === 0, JSON.stringify(noneSearch).slice(0, 200));

  const WRITE = /^(create|update|set|record|adjust|convert|transition|complete|add|schedule|log)_/;
  const viewerTools = await listTools(TOKENS.viewer);
  check('view-only role sees no write tool', !viewerTools.some((t) => WRITE.test(t)), viewerTools.filter((t) => WRITE.test(t)).join(','));
  check('view-only role sees read tools', ['list_leads', 'get_financial_overview', 'list_employees', 'get_project_billing_summary'].every((t) => viewerTools.includes(t)), '');
  check('view-only role without salaries toggle: no payroll tools', !viewerTools.includes('list_salaries') && !viewerTools.includes('get_payroll_summary'), '');
  check('view-only role cannot write (-32003)', forbidden(await call(TOKENS.viewer, 'create_task', { title: 'x', deadline: '2030-01-01' })), '');

  const editorTools = await listTools(TOKENS.editor);
  check('edit role sees write tools', ['create_task', 'create_invoice', 'adjust_stock', 'update_project', 'transition_lead_stage'].every((t) => editorTools.includes(t)), '');
  check('edit role without salaries toggle: no record_salary_payout', !editorTools.includes('record_salary_payout') && !editorTools.includes('list_salaries'), '');
  check('set_financial_mode is admin-only', !editorTools.includes('set_financial_mode') && adminTools.includes('set_financial_mode'), '');
  check('get_invoicable_summary visible to a role that can see leads/projects', editorTools.includes('get_invoicable_summary'), '');

  // Field stripping.
  const emps = await call(TOKENS.editor, 'list_employees', {});
  check('list_employees hides pin and salary fields without the toggle', Array.isArray(emps) && emps.length > 0 && emps.every((e) => !('pin' in e) && !('salary_amount' in e) && !('salary_type' in e)), JSON.stringify(emps).slice(0, 200));
  const emp = await call(TOKENS.editor, 'get_employee', { id: 'pe-1' });
  check('get_employee hides salaries and sensitive columns', emp && !('salaries' in emp) && !('pin' in emp) && !('salary_amount' in emp) && !('files_json' in emp), JSON.stringify(emp).slice(0, 200));
  check('update_employee refuses salary fields without the toggle', isErr(await call(TOKENS.editor, 'update_employee', { id: 'pe-1', salary_amount: 99999 }), /employees\.salaries/), '');
  const adminEmps = await call(TOKENS.admin, 'list_employees', {});
  check('Admin still sees salary fields', adminEmps.some((e) => e.salary_amount !== undefined && e.pin), '');

  // tasks.view_all
  await call(TOKENS.admin, 'create_task', { title: 'Admin only task', deadline: '2030-01-01', owner: 'Probe Admin' });
  await call(TOKENS.editor, 'create_task', { title: 'Editor own task', deadline: '2030-01-01' });
  const mine = await call(TOKENS.editor, 'list_tasks', { limit: 100 });
  check('without tasks.view_all a caller sees only their own tasks', Array.isArray(mine) && mine.some((t) => t.title === 'Editor own task') && !mine.some((t) => t.title === 'Admin only task'), JSON.stringify(mine).slice(0, 200));
  const all = await call(TOKENS.admin, 'list_tasks', { limit: 100 });
  check('Admin sees every task', all.some((t) => t.title === 'Admin only task') && all.some((t) => t.title === 'Editor own task'), '');

  // Keys.
  sql(`UPDATE mcp_keys SET revoked_at = NOW() WHERE id = 'pk-viewer';`);
  check('revoked key is rejected (401)', (await rpc('tools/list', {}, TOKENS.viewer)).status === 401, '');
  sql(`UPDATE users SET sessions_valid_from = NOW() WHERE id = 'probe-editor';`);
  check('a key older than the owner\'s last password reset is rejected', (await rpc('tools/list', {}, TOKENS.editor)).status === 401, '');
  sql(`UPDATE users SET sessions_valid_from = NULL WHERE id = 'probe-editor';`);
  check('bad key is rejected (401)', (await rpc('tools/list', {}, 'nope')).status === 401, '');
  const res = await rpc('tools/list', {}, TOKENS.admin);
  check('no wildcard CORS header', !res.headers.get('access-control-allow-origin'), res.headers.get('access-control-allow-origin'));

  // Errors do not leak SQL.
  const leak = await call(TOKENS.admin, 'create_task', { title: 'x'.repeat(300), deadline: '2030-01-01' });
  check('database errors are reported with a reference, not SQL', isErr(leak, /Database error \(ref [0-9a-f]+\)/) && !/SQLSTATE|too long|column/i.test(leak.__error), JSON.stringify(leak));

  // Source-level invariants.
  let offenders = [];
  for (const f of readdirSync(apiDir).filter((n) => /^mcp.*\.php$/.test(n))) {
    readFileSync(apiDir + f, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/i.test(code)) offenders.push(`${f}:${i + 1}`);
    });
  }
  check('no MCP file deletes, truncates or drops anything', offenders.length === 0, offenders.join(', '));
}

// ----------------------------------------------------------------------------- 2. parity
async function parityChecks() {
  section('parity with the TypeScript originals');
  const { aggregateOverviewTable } = await import(utils('financialOverviewTable.ts'));
  const { projectBilling, resolveProjectValue } = await import(utils('projectBilling.ts'));
  const { projectFutureMovements, futureWindow } = await import(utils('futureMovements.ts'));

  sql(fixtureSql());
  const year = 2026;
  const ov = await call(TOKENS.admin, 'get_financial_overview', { year, by_month: true });
  check('get_financial_overview responds', !!ov.categories, JSON.stringify(ov).slice(0, 200));
  const today = ov.as_of;
  const cols = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const last = new Date(Date.UTC(year, i + 1, 0)).getUTCDate();
    return { id: `${year}-${m}`, startIso: `${year}-${m}-01`, endIso: `${year}-${m}-${String(last).padStart(2, '0')}`, isFuture: false };
  });
  const ts = aggregateOverviewTable(RECORDS, CATEGORIES, cols, today);
  const near = (a, b) => Math.abs(a - b) < 0.0051;
  const bad = [];

  const phpRows = new Map(ov.categories.map((r) => [r.category_id ?? (r.type === 'income' ? '__uncategorized__income' : '__uncategorized__expense'), r]));
  const nonEmpty = [];
  for (const [rowId, row] of Object.entries(ts.cells)) {
    const real = cols.reduce((s, c) => s + row[c.id].real, 0), est = cols.reduce((s, c) => s + row[c.id].estimated, 0);
    if (real === 0 && est === 0) continue;
    nonEmpty.push(rowId);
    const php = phpRows.get(rowId);
    if (!php) { bad.push(`row ${rowId} missing in PHP`); continue; }
    cols.forEach((c, i) => {
      if (!near(row[c.id].real, php.months[i].real) || !near(row[c.id].estimated, php.months[i].estimated)) bad.push(`${rowId} ${c.id}`);
    });
  }
  for (const k of phpRows.keys()) if (!nonEmpty.includes(k)) bad.push(`row ${k} only in PHP`);
  check(`category rows × months match (${nonEmpty.length} rows)`, bad.length === 0, bad.join('; '));

  const colBad = [];
  cols.forEach((c, i) => {
    const ti = ts.totalIncomesByCol[c.id], te = ts.totalExpensesByCol[c.id], m = ov.months[i];
    if (!near(ti.real, m.income.real) || !near(ti.estimated, m.income.estimated)) colBad.push('income ' + c.id);
    if (!near(te.real, m.expense.real) || !near(te.estimated, m.expense.estimated)) colBad.push('expense ' + c.id);
  });
  check('monthly income/expense totals match', colBad.length === 0, colBad.join('; '));
  check('movements outside the year match', ['income', 'expense'].every((t) => ts.outsideHorizon[t].count === ov.outside_year[t].count && near(ts.outsideHorizon[t].real, ov.outside_year[t].real)), '');

  const summary = await call(TOKENS.admin, 'get_financial_summary', { year });
  const tsIncome = cols.reduce((s, c) => s + ts.totalIncomesByCol[c.id].real, 0);
  const tsExpense = cols.reduce((s, c) => s + ts.totalExpensesByCol[c.id].real, 0);
  check('get_financial_summary equals the overview totals', near(summary.paid_revenue, tsIncome) && near(summary.paid_expenses, tsExpense) && near(summary.net_profit, tsIncome - tsExpense), JSON.stringify(summary));

  const bill = await call(TOKENS.admin, 'get_project_billing_summary', {});
  const billBad = [];
  for (const p of PROJECTS) {
    const { value } = resolveProjectValue({ value: p.value, data: {}, leadId: p.leadId }, undefined, p.leadId ? LEAD : undefined, 'EUR');
    const t = projectBilling(value, RECORDS, p.id);
    const php = bill.projects.find((x) => x.project_id === p.id);
    if (!php) { billBad.push(p.id + ' missing'); continue; }
    for (const [tk, pk] of [['value', 'value'], ['received', 'received'], ['invoicedOpen', 'invoiced_open'], ['invoiced', 'invoiced'], ['notInvoiced', 'not_invoiced'], ['stillToBePaid', 'still_to_be_paid'], ['overInvoiced', 'over_invoiced']]) {
      if (!near(t[tk], php[pk])) billBad.push(`${p.id}.${tk} ts=${t[tk]} php=${php[pk]}`);
    }
  }
  check('project billing matches projectBilling.ts (value, received, open, not invoiced, over-invoiced)', billBad.length === 0, billBad.join('; '));

  // A project whose value comes from the project type's money attributes (stored in proj_data_<type>).
  const attrs = JSON.stringify([{ id: 'money1', type: 'money' }, { id: 'money2', type: 'money' }, { id: 'note', type: 'text' }]);
  sql(`DELETE FROM projects WHERE id='pm1'; DELETE FROM project_types WHERE id='pt-money';
       DROP TABLE IF EXISTS proj_data_ptmoney;
       CREATE TABLE proj_data_ptmoney (id VARCHAR(50) PRIMARY KEY, project_id VARCHAR(50), attr_money1 LONGTEXT, attr_money2 LONGTEXT, attr_note LONGTEXT);
       INSERT INTO project_types (id,name,icon,color,attributes_json) VALUES ('pt-money','Money','Folder','#000000',${sq(attrs)});
       INSERT INTO projects (id,project_type_id,name,status) VALUES ('pm1','pt-money','pm1','active');
       INSERT INTO proj_data_ptmoney (id,project_id,attr_money1,attr_money2,attr_note) VALUES ('pm1','pm1',${sq('{"amount":1200,"currency":"EUR"}')},'300','800');`);
  const typed = resolveProjectValue({ value: null, data: { money1: { amount: 1200, currency: 'EUR' }, money2: '300', note: '800' }, leadId: null }, { attributes: JSON.parse(attrs) }, undefined, 'EUR');
  const billM = await call(TOKENS.admin, 'get_project_billing_summary', { project_id: 'pm1' });
  check('project value from money attributes matches resolveProjectValue (1200 + 300)', typed.value === 1500 && billM.projects?.[0]?.value === 1500, JSON.stringify([typed, billM.projects?.[0]?.value]));

  // The arithmetic evaluator behind the simplified table has a PHP twin; keep them identical.
  const { evaluateEquation } = await import(utils('equationEvaluator.ts'));
  const exprs = ['1+2*3', '= 1200 + 450', '12,5 + 7,5', '-5 + 10', '(1+2)*3', '1 500 + 250', '10/4', '10/0', '2*(3+', 'abc', '1.5.2', '--3', '2*-3', '((4))', '1e3', '', '7 7'];
  const evalBad = [];
  for (const e of exprs) {
    const t = evaluateEquation(e);
    const out = await call(TOKENS.admin, 'set_financial_simplified_cell', { category_id: 'inc-root', period: '2026-01', equation: e || '1' });
    const php = isErr(out) ? null : out.evaluated_value;
    const expected = e === '' ? 1 : t;
    if (!((expected === null && php === null) || (expected !== null && php !== null && Math.abs(expected - php) < 0.0001))) evalBad.push(`"${e}" ts=${expected} php=${php}`);
  }
  check('simplified-table equation evaluator matches evaluateEquation', evalBad.length === 0, evalBad.join('; '));

  const fc = await call(TOKENS.admin, 'get_cash_flow_forecast', { months: 6, include_items: true });
  const w = futureWindow(today, 6);
  const key = (d, id, amt, src) => `${d}|${id}|${Number(amt).toFixed(2)}|${src}`;
  const A = projectFutureMovements(RECORDS, w.startIso, w.endIso).map((m) => key(m.date, m.record.id, m.amount, m.source)).sort();
  const B = (fc.items || []).map((m) => key(m.date, m.record_id, m.amount, m.source)).sort();
  check(`cash-flow forecast matches projectFutureMovements (${A.length} items)`, A.length > 0 && A.join('\n') === B.join('\n'), `ts ${A.length} php ${B.length}`);
}

// ----------------------------------------------------------------------------- 3. write paths
async function writeChecks() {
  section('write paths follow the app');
  const A = TOKENS.admin;
  const stock = () => Number(cell(`SELECT SUM(quantity) FROM warehouse_stock WHERE item_id='pi-1'`));

  // leads
  let r = await call(A, 'create_lead', { name: 'W Lead', status: 'nonsense' });
  check('create_lead rejects an unconfigured stage', isErr(r, /Unknown lead stage/), JSON.stringify(r));
  r = await call(A, 'create_lead', { name: 'W Lead', value: 1000, status: 'New' });
  const leadId = r.id;
  check('create_lead canonicalises the stage', !!leadId && r.status === 'new', JSON.stringify(r));
  sql(`INSERT INTO tasks (id,title,deadline,status,owner,created_by,related_lead_id,is_locking) VALUES ('wl-lock','Blocker','2030-12-01','New','Probe Admin','Probe Admin',${sq(leadId)},1);`);
  check('a blocking task holds the lead in its stage', isErr(await call(A, 'transition_lead_stage', { id: leadId, status: 'contacted' }), /blocking tasks/), '');
  sql(`UPDATE tasks SET status='Done' WHERE id='wl-lock';`);
  r = await call(A, 'transition_lead_stage', { id: leadId, status: 'contacted', note: 'called' });
  check('the stage moves once the blocker is done', r.success && r.new_status === 'contacted', JSON.stringify(r));
  check('a status_change history entry is written', Number(cell(`SELECT COUNT(*) FROM timeline_events WHERE lead_id=${sq(leadId)} AND type='status_change' AND content LIKE 'new % contacted%called'`)) === 1, '');
  check('unknown stage refused on transition', isErr(await call(A, 'transition_lead_stage', { id: leadId, status: 'bogus' }), /Unknown lead stage/), '');
  const pipe = await call(A, 'get_lead_pipeline_summary', {});
  check('pipeline summary lists configured stages in order', pipe.stages?.map((s) => s.state).slice(0, 2).join() === 'new,contacted', JSON.stringify(pipe.stages?.slice(0, 2)));

  // clients
  r = await call(A, 'convert_lead_to_client', { id: leadId, create_project: true, project_name: 'W Project' });
  check('convert_lead_to_client registers a client-* record and a project', r.success && /^client-/.test(r.client_id) && !!r.project_id, JSON.stringify(r));
  const clientRec = r.client_id;
  check('the lead is closed as won', cell(`SELECT status FROM leads WHERE id=${sq(leadId)}`) === 'accepted', '');
  r = await call(A, 'list_clients', { search: 'W Lead' });
  check('list_clients returns one profile carrying the lead value', Array.isArray(r) && r.length === 1 && r[0].id === clientRec && r[0].total_value === 1000 && r[0].leads_count === 2, JSON.stringify(r).slice(0, 300));
  r = await call(A, 'list_clients', { limit: 100 });
  check('list_clients no longer lists pipeline leads as clients', Array.isArray(r) && !r.some((c) => c.id === 'lead-parity'), '');
  check('create_client refuses a duplicate name', isErr(await call(A, 'create_client', { name: 'w lead' }), /already exists/), '');
  r = await call(A, 'create_client', { name: 'W Fresh Client', company_id: '123' });
  check('create_client makes a client-* record', r.success && /^client-/.test(r.id), JSON.stringify(r));
  r = await call(A, 'get_client_profile', { name: 'W Fresh Client' });
  check('get_client_profile finds it', r.name === 'W Fresh Client', JSON.stringify(r).slice(0, 200));

  // projects
  check('create_project refuses an unconfigured status', isErr(await call(A, 'create_project', { name: 'X', status: 'nope' }), /Unknown project status/), '');
  r = await call(A, 'create_project', { name: 'W Project 2', client_id: leadId, value: 5000, budget: 800 });
  const p2 = r.id;
  check('create_project starts in the first status of the "new" group', r.success && r.status === 'new', JSON.stringify(r));
  await call(A, 'update_project', { id: p2, status: 'completed' });
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const fin = cell(`SELECT finished_at FROM projects WHERE id=${sq(p2)}`);
  check('a completed status stamps the finish date', fin === localToday || fin === new Date().toISOString().slice(0, 10), fin);
  await call(A, 'update_project', { id: p2, status: 'active' });
  check('an open status clears the finish date', cell(`SELECT finished_at FROM projects WHERE id=${sq(p2)}`) === 'NULL', '');
  check('update_project refuses a blank name', isErr(await call(A, 'update_project', { id: p2, name: '  ' }), /cannot be empty/), '');
  r = await call(A, 'list_projects', { status: 'active', search: 'W Project' });
  check('list_projects: status and search filters work (no ambiguous column)', Array.isArray(r) && r.some((p) => p.id === p2), JSON.stringify(r).slice(0, 200));

  // invoices
  check('create_invoice refuses an unknown client', isErr(await call(A, 'create_invoice', { client_id: 'nope', title: 'T', items: [{ title: 'A', quantity: 1, unit_price: 10 }] }), /Client not found/), '');
  const inv = await call(A, 'create_invoice', { client_id: leadId, title: 'Web', items: [{ title: 'Design', quantity: 2, unit_price: 100.5, vat_rate: 20 }, { title: 'Hosting', quantity: 1, unit_price: 50, vat_rate: 10, discount_pct: 10 }] });
  check('create_invoice succeeds with an FA-YYYY-NNN number', inv.success && /^FA-\d{4}-\d{3}$/.test(inv.document_number), JSON.stringify(inv));
  check('totals are net per line plus per-line VAT (246.00 + 44.70 = 290.70)', inv.subtotal === 246 && inv.vat_amount === 44.7 && inv.total_price === 290.7, JSON.stringify(inv));
  const items = rows(`SELECT name,total_price FROM invoice_offer_items WHERE invoice_offer_id=${sq(inv.id)} ORDER BY name`);
  check('line items are stored under "name" with net totals', items.length === 2 && items[0][0] === 'Design' && Number(items[0][1]) === 201 && Number(items[1][1]) === 45, JSON.stringify(items));
  const mv = rows(`SELECT status,amount_planned,amount_real FROM financial_records WHERE id='fr-inv-${inv.id}'`)[0];
  check('the linked ledger movement fr-inv-<id> is pending with nothing received', !!mv && mv[0] === 'pending' && Number(mv[1]) === 290.7 && Number(mv[2]) === 0, JSON.stringify(mv));
  const inv2 = await call(A, 'create_invoice', { client_id: leadId, title: 'Second', items: [{ title: 'X', quantity: 1, unit_price: 1 }] });
  check('document numbers are sequential', Number(inv2.document_number.slice(-3)) === Number(inv.document_number.slice(-3)) + 1, `${inv2.document_number} after ${inv.document_number}`);
  check('a duplicate document number is refused', isErr(await call(A, 'create_invoice', { client_id: leadId, title: 'D', document_number: inv.document_number, items: [{ title: 'X', quantity: 1, unit_price: 1 }] }), /already used/), '');
  check('a negative quantity is refused', isErr(await call(A, 'create_invoice', { client_id: leadId, title: 'Bad', items: [{ title: 'X', quantity: -1, unit_price: 1 }] }), /at least/), '');
  check('a refused invoice leaves no orphan header', Number(cell(`SELECT COUNT(*) FROM invoices_offers WHERE title='Bad'`)) === 0, '');
  check('approving an invoice is refused (changes the books)', isErr(await call(A, 'update_invoice_status', { id: inv.id, status: 'approved' }), /only be set in the app/), '');
  check('marking an invoice paid is refused', isErr(await call(A, 'update_invoice_status', { id: inv.id, status: 'paid' }), /only be set in the app/), '');
  check('an invoice can be sent', (await call(A, 'update_invoice_status', { id: inv.id, status: 'sent' })).success === true, '');
  await call(A, 'update_invoice_status', { id: inv.id, status: 'cancelled' });
  check('cancelling cancels the unsettled ledger movement', cell(`SELECT status FROM financial_records WHERE id='fr-inv-${inv.id}'`) === 'cancelled', '');
  check('a cancelled document cannot be reopened', isErr(await call(A, 'update_invoice_status', { id: inv.id, status: 'sent' }), /cannot be changed/), '');

  // expenses
  check('a paid expense is refused', isErr(await call(A, 'record_expense', { title: 'E', amount: 10, issue_date: '2026-10-01', status: 'paid' }), /planned.*pending/), '');
  check('an income category is refused for an expense', isErr(await call(A, 'record_expense', { title: 'E', amount: 10, issue_date: '2026-10-01', category_id: 'inc-child' }), /income category/), '');
  check('a non-positive amount is refused', isErr(await call(A, 'record_expense', { title: 'E', amount: -5, issue_date: '2026-10-01' }), /at least/), '');
  r = await call(A, 'record_expense', { title: 'Paper', amount: 42.5, issue_date: '2026-10-01', category_id: 'exp-child1' });
  check('a planned expense is recorded with nothing paid', r.success && r.status === 'planned' && Number(cell(`SELECT amount_real FROM financial_records WHERE id=${sq(r.id)}`)) === 0, JSON.stringify(r));

  // stock
  const before = stock();
  r = await call(A, 'adjust_stock', { item_id: 'pi-1', warehouse_id: 'pw-1', quantity_change: 12, reason: 'receipt', unit_purchase_price: 130 });
  check('a receipt gets a PRI-YYYY-NNNN document', r.success && /^PRI-\d{4}-\d{4}$/.test(r.document_number) && r.movement_type === 'inward', JSON.stringify(r));
  check('the weighted average price is updated ((28×110 + 12×130) / 40 = 116)', Number(cell(`SELECT avg_purchase_price FROM warehouse_items WHERE id='pi-1'`)) === 116, '');
  check('selling more than is available is refused', isErr(await call(A, 'adjust_stock', { item_id: 'pi-1', warehouse_id: 'pw-1', quantity_change: -1000, reason: 'sale' }), /Insufficient stock/), '');
  check('selling reserved stock is refused (40 on hand, 3 reserved)', isErr(await call(A, 'adjust_stock', { item_id: 'pi-1', warehouse_id: 'pw-1', quantity_change: -38, reason: 'sale' }), /Insufficient stock/), '');
  check('a sale needs a negative quantity', isErr(await call(A, 'adjust_stock', { item_id: 'pi-1', warehouse_id: 'pw-1', quantity_change: 5, reason: 'sale' }), /negative/), '');
  r = await call(A, 'adjust_stock', { item_id: 'pi-1', warehouse_id: 'pw-1', quantity_change: -4, reason: 'sale', unit_sell_price: 250 });
  const mov = rows(`SELECT total_cost_value,total_sell_value,total_profit_value FROM warehouse_movements WHERE document_number=${sq(r.document_number)}`)[0];
  check('a sale is a VYD document with cost 4×116, sell 4×250, profit 536', /^VYD-/.test(r.document_number) && Number(mov[0]) === 464 && Number(mov[1]) === 1000 && Number(mov[2]) === 536, JSON.stringify(mov));
  r = await call(A, 'adjust_stock', { item_id: 'pi-1', warehouse_id: 'pw-1', quantity_change: -2, reason: 'damage' });
  check('damage is an adjustment document', r.success && r.movement_type === 'adjustment' && /^INV-/.test(r.document_number), JSON.stringify(r));
  check('stock arithmetic adds up (+12 −4 −2)', stock() === before + 12 - 4 - 2, `${stock()} vs ${before + 6}`);
  check('an unknown item is refused', isErr(await call(A, 'adjust_stock', { item_id: 'nope', quantity_change: 1, reason: 'receipt' }), /not found/), '');
  check('a zero change is refused', isErr(await call(A, 'adjust_stock', { item_id: 'pi-1', quantity_change: 0, reason: 'audit' }), /cannot be zero/), '');

  // payroll
  r = await call(A, 'record_salary_payout', { employee_id: 'pe-1', period_key: '2027-02', total_salary: 2000, total_paid: 500, payment_date: '2027-02-20' });
  check('a partial payout is recorded with a ledger link', r.success && r.status === 'partially_paid' && !!r.financial_record_id, JSON.stringify(r));
  let fr = rows(`SELECT status,amount_planned,amount_real,category_id,issue_date FROM financial_records WHERE id=${sq(r.financial_record_id)}`)[0];
  check('the payroll expense is mirrored in the ledger (planned 2000, real 500, 1st of the month)', !!fr && fr[0] === 'partially_paid' && Number(fr[1]) === 2000 && Number(fr[2]) === 500 && fr[3] === 'exp-root' && fr[4] === '2027-02-01', JSON.stringify(fr));
  r = await call(A, 'record_salary_payout', { employee_id: 'pe-1', period_key: '2027-02', total_salary: 2000, total_paid: 2000, payment_date: '2027-02-22' });
  fr = rows(`SELECT status,amount_real FROM financial_records WHERE id=${sq(r.financial_record_id)}`)[0];
  check('completing the payout updates the same ledger row', r.status === 'paid' && fr[0] === 'paid' && Number(fr[1]) === 2000, JSON.stringify(fr));
  check('a paid period cannot be overwritten', isErr(await call(A, 'record_salary_payout', { employee_id: 'pe-1', period_key: '2027-02', total_salary: 1, total_paid: 0 }), /already paid/), '');
  check('a weekly period key is refused', isErr(await call(A, 'record_salary_payout', { employee_id: 'pe-1', period_key: '2027-W12', total_salary: 1 }), /YYYY-MM/), '');
  check('items_json carries the base component', (cell(`SELECT items_json FROM employee_salaries WHERE id='sal-pe-1-2027-02'`) || '').includes('"categoryId":"base"'), '');
  const pay = await call(A, 'get_payroll_summary', { year: 2027 });
  check('get_payroll_summary totals the year', pay.year_total && pay.year_total.planned === 2000 && pay.year_total.paid === 2000, JSON.stringify(pay).slice(0, 200));

  // vacations
  r = await call(A, 'record_vacation', { employee_id: 'pe-1', start_date: '2027-03-01', end_date: '2027-03-05', days_count: 5 });
  check('a vacation is logged as requested by default', r.success && r.status === 'requested', JSON.stringify(r));
  check('overlapping leave is refused', isErr(await call(A, 'record_vacation', { employee_id: 'pe-1', start_date: '2027-03-04', end_date: '2027-03-08' }), /Overlaps/), '');
  check('reversed dates are refused', isErr(await call(A, 'record_vacation', { employee_id: 'pe-1', start_date: '2027-05-05', end_date: '2027-05-01' }), /cannot be before/), '');
  check('an unknown vacation type is refused', isErr(await call(A, 'record_vacation', { employee_id: 'pe-1', start_date: '2027-06-01', end_date: '2027-06-02', vacation_type_id: 'bogus' }), /Unknown vacation_type_id/), '');
  const bal = await call(A, 'get_vacation_balance', { employee_id: 'pe-1', year: 2027 });
  const annual = bal.employees?.[0]?.types?.find((t) => t.type_id === 'annual');
  check('get_vacation_balance counts the requested days against the allowance', annual && annual.used === 5 && annual.left === annual.allowance - 5, JSON.stringify(annual));

  // tasks
  check('create_task refuses an unconfigured status', isErr(await call(A, 'create_task', { title: 'T', deadline: '2030-12-01', status: 'todo' }), /Unknown task status/), '');
  check('create_task refuses an impossible date', isErr(await call(A, 'create_task', { title: 'T', deadline: '2030-13-45' }), /YYYY-MM-DD/), '');
  check('create_task refuses a non-user owner', isErr(await call(A, 'create_task', { title: 'T', deadline: '2030-12-01', owner: 'Nobody' }), /not a registered user/), '');
  r = await call(A, 'create_task', { title: 'Bucket task', deadline: '2020-01-01', owner: 'Probe Viewer' });
  const t1 = r.id;
  check('create_task starts in the first configured status', r.success && r.status === 'New', JSON.stringify(r));
  check('bucket=overdue finds it', (await call(A, 'list_tasks', { bucket: 'overdue', search: 'Bucket' })).some?.((t) => t.id === t1), '');
  check('bucket=upcoming does not', !(await call(A, 'list_tasks', { bucket: 'upcoming', search: 'Bucket' })).some?.((t) => t.id === t1), '');
  await call(A, 'update_task', { id: t1, owner: 'Probe Editor' });
  check('a new owner is added to the assignees (stays visible)', rows(`SELECT user_name FROM task_assignees WHERE task_id=${sq(t1)} ORDER BY 1`).map((x) => x[0]).join() === 'Probe Editor,Probe Viewer', '');
  check('set_task_assignees refuses non-users', isErr(await call(A, 'set_task_assignees', { task_id: t1, assignees: ['Ghost'] }), /not a registered user/), '');
  r = await call(A, 'set_task_assignees', { task_id: t1, assignees: ['probe admin'] });
  check('set_task_assignees adds (case-insensitive) and removes nobody', r.success && ['Probe Admin', 'Probe Editor', 'Probe Viewer'].every((n) => r.assignees.includes(n)), JSON.stringify(r));
  check('set_task_tags adds tags', (await call(A, 'set_task_tags', { task_id: t1, tags: ['urgent', 'client'] })).success === true, '');
  r = await call(A, 'complete_task', { id: t1 });
  check('complete_task uses the configured done state', r.success && r.status === 'Done', JSON.stringify(r));
  check('bucket=done finds it', (await call(A, 'list_tasks', { bucket: 'done', search: 'Bucket' })).some?.((t) => t.id === t1), '');
  check('complete_task on an unknown id fails', isErr(await call(A, 'complete_task', { id: 'missing' }), /not found/), '');

  // small guards
  r = await call(A, 'create_task', { title: 'Unlinked', deadline: '2030-01-01' });
  check('add_task_comment refuses a task with no linked lead (nothing would be stored)', isErr(await call(A, 'add_task_comment', { task_id: r.id, comment: 'hi' }), /not linked to a lead/), '');
  check('create_contact refuses an unknown client', isErr(await call(A, 'create_contact', { client_id: 'nope', name: 'X' }), /not found/), '');
  check('create_inventory_item refuses a duplicate SKU', isErr(await call(A, 'create_inventory_item', { sku: 'PI-1', name: 'Dup' }), /already exists/), '');
  check('schedule_meeting refuses an impossible date', isErr(await call(A, 'schedule_meeting', { title: 'M', date: '2026-02-31' }), /YYYY-MM-DD/), '');

  // read tools that need no fixture beyond the above
  const sm = await call(A, 'get_invoicable_summary', { include_rows: true });
  check('get_invoicable_summary: leads and projects groups, total adds up', sm.groups?.length === 2 && Math.abs(sm.total - sm.groups.reduce((s, g) => s + g.invoicable, 0)) < 0.01, JSON.stringify(sm).slice(0, 200));
  const im = await call(A, 'get_invoicing_metrics', {});
  check('get_invoicing_metrics counts invoices only', im.invoiced_value > 0 && im.offers_value === 0, JSON.stringify(im).slice(0, 200));
  const wm = await call(A, 'get_warehouse_metrics', { warehouse_id: 'pw-1' });
  check('get_warehouse_metrics values stock at the average price', Math.abs(wm.stock_valuation - 34 * 116) < 0.01, JSON.stringify(wm));
  for (const [tool, args] of [['list_financial_movements', {}], ['list_financial_categories', {}], ['list_recurring_movements', { include_paused: true }], ['list_client_categories', {}], ['list_warehouses', {}], ['list_suppliers', {}], ['list_stock_movements', {}], ['list_batches', {}], ['list_workflows', {}], ['list_unified_entries', {}], ['list_meeting_tasks', {}], ['list_documents', {}], ['list_invoices', {}]]) {
    const out = await call(A, tool, args);
    check(`${tool} responds`, Array.isArray(out), JSON.stringify(out).slice(0, 200));
  }
  const wfs = await call(A, 'list_workflows', {});
  if (Array.isArray(wfs) && wfs.length) check('get_workflow_runs responds for a workflow', Array.isArray(await call(A, 'get_workflow_runs', { workflow_id: wfs[0].id })), '');
  check('list_workflows does not expose the workflow definition', Array.isArray(wfs) && wfs.every((w) => !('nodes_json' in w) && !('edges_json' in w)), '');
  const ues = await call(A, 'list_unified_entries', {});
  if (Array.isArray(ues) && ues.length) check('get_unified_entry_rows responds for a registry', Array.isArray(await call(A, 'get_unified_entry_rows', { registry_id: ues[0].id })), '');
  check('get_unified_entry_rows refuses an unknown registry', isErr(await call(A, 'get_unified_entry_rows', { registry_id: 'nope' }), /not found/), '');
  check('list_files on a project responds', Array.isArray(await call(A, 'list_files', { source: 'project', id: 'p1' })), '');
  check('employee files need the salaries toggle', isErr(await call(TOKENS.editor, 'list_files', { source: 'employee', id: 'pe-1' }), /salaries/), '');
  r = await call(A, 'set_financial_mode', { mode: 'simplified' });
  const overviewSimple = await call(A, 'get_financial_overview', {});
  check('get_financial_overview points simplified workspaces to the simplified table', overviewSimple.mode === 'simplified', JSON.stringify(overviewSimple));
  await call(A, 'set_financial_mode', { mode: 'connected' });
}

// ----------------------------------------------------------------------------- 4. client & project intelligence
async function intelChecks() {
  section('client and project intelligence');
  const A = TOKENS.admin;
  // One client split over a pipeline lead and its client-* record (the shape the Clients register groups by
  // name), a project paired with the lead, one only named for the client, and one whose name merely starts alike.
  const events = Array.from({ length: 6 }, (_, i) => `('pv-ev${i}','pv-lead','note','2026-0${i + 1}-05 10:00:00','Note ${i}','Body ${i}')`).join(',');
  sql(`SET FOREIGN_KEY_CHECKS=0;
       REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('INVOICING_INTEGRATIONS', '{}');
       DELETE FROM timeline_events WHERE lead_id IN ('pv-lead','client-9000000001','client-9000000002','pv-kav');
       DELETE FROM leads WHERE id IN ('pv-lead','client-9000000001','client-9000000002','pv-kav');
       INSERT INTO leads (id,name,status,owner,value,email,company_id,tax_id,interest_note,created_at) VALUES ('pv-lead','Villatesta','offer sent','Erik',8000,'info@villatesta.sk','51999123','2120999123','Rekonštrukcia vily Pribylina77','2026-01-02');
       INSERT INTO leads (id,name,status,owner,value,contact_person,created_at) VALUES ('client-9000000001','Villatesta','accepted','Erik',0,'Ignác Probenák','2026-02-01');
       INSERT INTO leads (id,name,status,owner,value,created_at) VALUES ('client-9000000002','Villa Rosa','accepted','Erik',0,'2026-02-01');
       INSERT INTO leads (id,name,status,owner,value,created_at) VALUES ('pv-kav','Kávička Bar','new','Erik',0,'2026-02-01');
       INSERT INTO timeline_events (id,lead_id,type,timestamp,title,content) VALUES ${events};
       DELETE FROM projects WHERE id IN ('pv1','pv2','pv3');
       INSERT INTO projects (id,project_type_id,name,lead_id,client_id,status,value) VALUES
         ('pv1','pt-parity','Web','pv-lead',NULL,'active',6000),
         ('pv2','pt-parity','Villatesta – e-shop',NULL,NULL,'completed',1500),
         ('pv3','pt-parity','Villatestament',NULL,NULL,'active',900);
       DELETE FROM financial_records WHERE id LIKE 'pvf%' OR id = 'fr-inv-pv-inv';
       INSERT INTO financial_records (id,type,subtype,title,amount_planned,amount_real,currency,status,issue_date,due_date,paid_date,project_id,invoice_number) VALUES
         ('pvf1','income','invoice','Splátka 1',2000,2000,'EUR','paid','2026-01-10','2026-01-15','2026-01-20','pv1','2026001'),
         ('pvf2','income','invoice','Splátka 2',2000,0,'EUR','pending','2020-01-10','2020-02-01',NULL,'pv1','2026002'),
         ('pvf3','income','regular','Splátka 3',2000,0,'EUR','planned','2031-06-01','2031-06-30',NULL,'pv1',NULL),
         ('fr-inv-pv-inv','income','invoice','FA-2026-900 — Villatesta',1210,1210,'EUR','paid','2026-03-01','2026-03-15','2026-03-10',NULL,'FA-2026-900');
       DELETE FROM invoices_offers WHERE id = 'pv-inv';
       INSERT INTO invoices_offers (id,document_number,type,lead_id,client_id,client_name,title,subject,subtotal,vat_amount,total_price,status,issued_at,due_date) VALUES
         ('pv-inv','FA-2026-900','invoice','client-9000000001','client-9000000001','Villatesta','Záloha','Záloha',1000,210,1210,'sent','2026-03-01','2026-03-15');
       CREATE TABLE IF NOT EXISTS proj_gantt_ptparity (id VARCHAR(50) PRIMARY KEY, project_id VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL, contact_id VARCHAR(50) NULL, start_date DATE NULL, end_date DATE NULL, progress INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
       DELETE FROM proj_gantt_ptparity WHERE project_id = 'pv1';
       INSERT INTO proj_gantt_ptparity (id,project_id,title,start_date,end_date,progress) VALUES ('pvg1','pv1','Design phase','2026-01-01','2026-02-01',100),('pvg2','pv1','Build','2026-02-01','2031-03-01',40);
       SET FOREIGN_KEY_CHECKS=1;`);
  const ids = (rs) => (rs || []).map((r) => r.id).sort().join();

  // 1. search
  let s = await call(A, 'search_entities', { query: 'villa testa' });
  check('search: "villa testa" finds the Villatesta records (every word, any field)', ids(s.leads_and_clients) === 'client-9000000001,pv-lead', JSON.stringify(s.leads_and_clients));
  s = await call(A, 'search_entities', { query: 'VILLATESTA' });
  check('search: case-insensitive', ids(s.leads_and_clients) === 'client-9000000001,pv-lead', JSON.stringify(s.leads_and_clients));
  s = await call(A, 'search_entities', { query: 'kavicka bar', entity_types: ['leads', 'clients'] });
  check('search: accent-insensitive ("kavicka bar" finds "Kávička Bar")', ids(s.leads_and_clients) === 'pv-kav', JSON.stringify(s));
  s = await call(A, 'search_entities', { query: 'kavickabar', entity_types: ['leads'] });
  check('search: a name run together finds the spaced name ("kavickabar")', ids(s.leads_and_clients) === 'pv-kav', JSON.stringify(s));
  s = await call(A, 'search_entities', { query: 'villa bar', entity_types: ['leads', 'clients'] });
  check('search: words are ANDed ("villa bar" matches neither)', (s.leads_and_clients || []).length === 0, JSON.stringify(s));
  for (const [q, want] of [['51999123', 'pv-lead'], ['2120999123', 'pv-lead'], ['Probenák', 'client-9000000001'], ['pribylina77', 'pv-lead'], ['villatesta.sk', 'pv-lead']]) {
    s = await call(A, 'search_entities', { query: q, entity_types: ['leads', 'clients'] });
    check(`search: "${q}" finds ${want} (IČO / DIČ / contact person / notes / email)`, ids(s.leads_and_clients) === want, JSON.stringify(s.leads_and_clients));
  }
  s = await call(A, 'search_entities', { query: 'villatesta', entity_types: ['clients'] });
  check('search: entity_types=clients returns only client records', ids(s.leads_and_clients) === 'client-9000000001', JSON.stringify(s.leads_and_clients));
  const cRow = s.leads_and_clients?.[0];
  check('search: client rows carry kind and a #client- url', cRow?.kind === 'client' && /#client-Villatesta$/.test(cRow?.url || ''), JSON.stringify(cRow));
  s = await call(A, 'search_entities', { query: 'villatesta', entity_types: ['projects'] });
  check('search: projects match their client\'s name and their own, with a url', ['pv1', 'pv2', 'pv3'].every((id) => s.projects?.some((p) => p.id === id)) && s.projects.every((p) => /#projects\//.test(p.url)), JSON.stringify(s.projects));

  // 2. get_client resolves the whole client
  const gc = await call(A, 'get_client', { id: 'client-9000000001' });
  check('get_client: projects of every record with the name, plus name-only ones (not "Villatestament")', ids(gc.projects) === 'pv1,pv2', JSON.stringify(gc.projects));
  check('get_client: projects say how they are linked', gc.projects?.find((p) => p.id === 'pv1')?.linked_by === 'lead_id' && gc.projects?.find((p) => p.id === 'pv2')?.linked_by === 'name_match', JSON.stringify(gc.projects));
  check('get_client: invoices with payment status', gc.invoices?.some((d) => d.document_number === 'FA-2026-900' && d.payment_status === 'paid'), JSON.stringify(gc.invoices));
  check('get_client: url to the client page', /#client-Villatesta$/.test(gc.url || '') && gc.kind === 'client', JSON.stringify({ url: gc.url, kind: gc.kind }));
  const gl = await call(A, 'get_client', { id: 'pv-lead' });
  check('get_client by the lead record finds the same projects', ids(gl.projects) === 'pv1,pv2', JSON.stringify(gl.projects));

  // 3. get_project: client and financials
  const gp = await call(A, 'get_project', { id: 'pv1' });
  check('get_project: client resolved through the paired lead to the client record', gp.client?.id === 'client-9000000001' && gp.client?.linked_by === 'lead_id' && gp.client?.company_id === '51999123', JSON.stringify(gp.client));
  check('get_project: url', /#projects\/pv1$/.test(gp.url || ''), gp.url);
  const f = gp.financials || {};
  check('get_project: financials (value 6000, invoiced 6000, paid 2000, outstanding 4000, billable 0, planned 2000)',
    f.contract_value === 6000 && f.invoiced_total === 6000 && f.paid_total === 2000 && f.outstanding_invoiced === 4000 && f.remaining_billable === 0 && f.planned_not_issued === 2000, JSON.stringify(f));
  check('get_project: installment schedule with payment status', f.installment_based === true && (f.installments || []).map((i) => `${i.id}:${i.payment_status}`).join() === 'pvf2:overdue,pvf1:paid,pvf3:planned', JSON.stringify(f.installments));
  const gp2 = await call(A, 'get_project', { id: 'pv2' });
  check('get_project: an unlinked project finds its client by name', gp2.client?.id === 'client-9000000001' && gp2.client?.linked_by === 'name_match', JSON.stringify(gp2.client));
  check('get_project: a name that only starts alike is not linked', (await call(A, 'get_project', { id: 'pv3' })).client === null, '');

  // 4. milestones
  const ms = await call(A, 'create_milestone', { project_id: 'pv1', title: 'Go-live', deadline: '2031-05-01' });
  let lm = await call(A, 'list_milestones', { project_id: 'pv1' });
  check('list_milestones: Gantt rows and milestone tasks', ['pvg1', 'pvg2', ms.id].every((id) => lm.milestones?.some((m) => m.id === id)) && lm.milestones.find((m) => m.id === 'pvg1').done === true && lm.milestones.find((m) => m.id === ms.id).source === 'task', JSON.stringify(lm));
  lm = await call(A, 'list_milestones', { project_id: 'pv1', open_only: true });
  check('list_milestones: open_only leaves out finished ones', !lm.milestones?.some((m) => m.id === 'pvg1') && lm.milestones?.some((m) => m.id === 'pvg2'), JSON.stringify(lm.milestones));
  lm = await call(TOKENS.editor, 'list_milestones', { project_id: 'pv1' });
  check('list_milestones: milestone tasks follow task visibility', Array.isArray(lm.milestones) && !lm.milestones.some((m) => m.source === 'task'), JSON.stringify(lm.milestones));
  check('list_milestones: unknown project', isErr(await call(A, 'list_milestones', { project_id: 'nope' }), /not found/), '');

  // 5. invoices of a client
  const ci = await call(A, 'get_client_invoices', { identifier: 'Villatesta' });
  const nums = (ci.invoices || []).map((i) => `${i.document_number}:${i.payment_status}`).sort().join();
  check('get_client_invoices: Invoicing documents and ledger invoices/installments of the client\'s projects', nums === '2026001:paid,2026002:overdue,FA-2026-900:paid,null:planned', nums);
  check('get_client_invoices: totals (invoiced 5210, paid 3210, overdue 2000; plans excluded)', ci.totals?.invoiced === 5210 && ci.totals?.paid === 3210 && ci.totals?.overdue === 2000, JSON.stringify(ci.totals));
  check('get_client_invoices: SuperFaktúra skipped when the integration is off', ci.superfaktura?.enabled === false, JSON.stringify(ci.superfaktura));
  const od = await call(A, 'get_client_invoices', { identifier: 'client-9000000001', payment_status: 'overdue' });
  check('get_client_invoices: payment_status filter', (od.invoices || []).map((i) => i.document_number).join() === '2026002', JSON.stringify(od.invoices));

  // 6. dossier
  const d1 = await call(A, 'get_client_dossier', { identifier: '51 999 123' });
  const d2 = await call(A, 'get_client_dossier', { identifier: 'villa testa' });
  check('get_client_dossier: found by IČO and by name, as the same client', d1.profile?.id === 'client-9000000001' && d2.profile?.id === 'client-9000000001', JSON.stringify([d1.profile?.id, d2.profile?.id, d1.__error, d2.__error]));
  check('get_client_dossier: profile carries IČO, DIČ, contacts, owner, notes', d1.profile?.company_id === '51999123' && d1.profile?.tax_id === '2120999123' && d1.profile?.contacts?.length === 2 && d1.profile?.owner === 'Erik' && /Pribylina77/.test(d1.profile?.interest_note || ''), JSON.stringify(d1.profile));
  check('get_client_dossier: active and past projects', ids(d1.projects?.active) === 'pv1' && ids(d1.projects?.past) === 'pv2', JSON.stringify(d1.projects));
  check('get_client_dossier: financial summary over the projects (7500 contracted, 2000 paid)', d1.financial_summary?.contract_value === 7500 && d1.financial_summary?.paid_total === 2000 && d1.financial_summary?.invoices?.paid === 1210, JSON.stringify(d1.financial_summary));
  check('get_client_dossier: open milestones and open tasks', d1.open_milestones?.some((m) => m.id === 'pvg2') && !d1.open_milestones?.some((m) => m.id === 'pvg1') && d1.open_tasks?.some((t) => t.id === ms.id), JSON.stringify([d1.open_milestones, d1.open_tasks]).slice(0, 300));
  check('get_client_dossier: last 5 timeline entries', d1.latest_timeline?.length === 5 && d1.latest_timeline[0].id === 'pv-ev5', JSON.stringify(d1.latest_timeline?.map((e) => e.id)));
  check('get_client_dossier: several clients matching a name is an error that lists them', isErr(await call(A, 'get_client_dossier', { identifier: 'villa' }), /Several clients match/), '');
  check('get_client_dossier: nothing matching is an error', isErr(await call(A, 'get_client_dossier', { identifier: 'zzzz nothing' }), /No client or lead matches/), '');

  // 7. urls on list rows
  check('list_projects rows carry a url', (await call(A, 'list_projects', { search: 'Villatesta' })).every?.((p) => /#projects\//.test(p.url)), '');
  check('list_clients rows carry a url', (await call(A, 'list_clients', { search: 'Villatesta' })).some?.((c) => /#client-Villatesta$/.test(c.url)), '');
}

// ----------------------------------------------------------------------------- main
try {
  setup();
  await authorizationChecks();
  await parityChecks();
  await writeChecks();
  await intelChecks();
} catch (e) {
  failures++;
  console.log('\nPROBE ERROR: ' + (e && e.stack ? e.stack : e));
} finally {
  teardown();
}
console.log(`\n${failures ? 'FAILED' : 'OK'}: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
