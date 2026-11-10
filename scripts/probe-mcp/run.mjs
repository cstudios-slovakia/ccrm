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
async function rpc(method, params, token, keyHeaders = { 'X-CCRM-MCP-KEY': token }) {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...keyHeaders }, body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }) });
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
    // HR field groups, written out so nothing falls back to the legacy "edit" default: personal data and
    // documents are off; leave is on for the editor only (the leave tools need it).
    'employees.personal': 'nothing', 'employees.files': 'nothing', 'employees.vacations': level === 'edit' ? 'edit' : 'nothing',
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

  // The clone is a copy of the dev database, which may predate the current schema: bring it up to date
  // the way a live request does (this is also what migrates the employee identity columns).
  docker('exec', WEB, 'php', '-r', `require '${SCRATCH_DIR}/config.php'; require '${SCRATCH_DIR}/api/schema.php'; ccrm_apply_schema(new PDO('mysql:host='.DB_HOST.';port='.DB_PORT.';dbname='.DB_NAME.';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]));`);

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
       INSERT INTO employees (id,name,pin,salary_type,salary_amount,auto_expense,expense_category_id,salary_due_day,is_active) VALUES ('pe-1','Probe Employee','900101/1234','monthly',2000,1,'exp-root',15,1);
       DELETE FROM employees WHERE id IN ('pe-2','pe-3','pe-4');
       INSERT INTO employees (id,name,kind,position,department,is_active) VALUES ('pe-2','Probe Dodigital s.r.o.','contractor','agentúra','Marketing',1), ('pe-3','Probe Provízia','ledger',NULL,NULL,1);
       INSERT INTO employees (id,name,is_active) VALUES ('pe-4','Probetomi',1);`);
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
  check('list_employees hides pin, contact and salary fields without their toggles', Array.isArray(emps) && emps.length > 0 && emps.every((e) => !('pin' in e) && !('phone' in e) && !('address_street' in e) && !('salary_amount' in e) && !('salary_type' in e)), JSON.stringify(emps).slice(0, 200));
  const emp = await call(TOKENS.editor, 'get_employee', { id: 'pe-1' });
  check('get_employee hides salaries and sensitive columns', emp && !('salaries' in emp) && !('pin' in emp) && !('phone' in emp) && !('salary_amount' in emp) && !('files_json' in emp), JSON.stringify(emp).slice(0, 200));
  check('get_employee keeps the leave list for a role with employees.vacations', emp && Array.isArray(emp.vacations) && 'vacation_allowances_json' in emp, JSON.stringify(emp).slice(0, 200));
  const byPin = await call(TOKENS.editor, 'list_employees', { search: '900101' });
  check('list_employees cannot be searched by a PIN the role may not read', Array.isArray(byPin) && byPin.length === 0, JSON.stringify(byPin).slice(0, 200));
  const viewerTools2 = await listTools(TOKENS.viewer);
  check('a role without employees.vacations gets no leave tools', !viewerTools2.includes('list_vacations') && !viewerTools2.includes('record_vacation') && !viewerTools2.includes('get_vacation_balance'), '');
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
  // The key may also arrive as X-API-Key (the claude.ai connector preset). Authorization: Bearer is
  // not probed: this container's Apache drops that header before PHP sees it (the reason
  // X-CCRM-MCP-KEY exists), so it cannot be tested here.
  for (const [label, h] of [['X-CCRM-MCP-KEY', { 'X-CCRM-MCP-KEY': TOKENS.admin }], ['X-API-Key', { 'X-API-Key': TOKENS.admin }]]) {
    check(`key sent as ${label} is accepted`, (await rpc('tools/list', {}, TOKENS.admin, h)).status === 200, '');
  }
  check('a bad X-API-Key is rejected (401)', (await rpc('tools/list', {}, 'nope', { 'X-API-Key': 'nope' })).status === 401, '');
  check('no key header at all is rejected (401)', (await rpc('tools/list', {}, '', {})).status === 401, '');
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
async function employeeIdentityChecks() {
  section('employee identity (name, kind, position, department)');
  const A = TOKENS.admin;

  // The one-off migration of rows that existed before the columns did.
  const migrated = rows(`SELECT kind, first_name, last_name FROM employees WHERE id = 'emp-1'`)[0];
  if (migrated) check('migration: "Ing. Michal Kováč" became an employee with first and last name', migrated[0] === 'employee' && migrated[1] === 'Ing. Michal' && migrated[2] === 'Kováč', JSON.stringify(migrated));

  const list = await call(A, 'list_employees', {});
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  check('list_employees returns first_name, last_name, kind, position and department', ['first_name', 'last_name', 'kind', 'position', 'department'].every((k) => k in byId['pe-1']), JSON.stringify(byId['pe-1']));
  check('a contractor row carries company_name and no person name', byId['pe-2']?.kind === 'contractor' && byId['pe-2'].company_name === 'Probe Dodigital s.r.o.' && byId['pe-2'].first_name === null, JSON.stringify(byId['pe-2']));
  check('kind=employee leaves out companies and accounting items', (await call(A, 'list_employees', { kind: 'employee' })).every((e) => e.kind === 'employee'), '');
  check('kind=ledger returns only the accounting items', JSON.stringify((await call(A, 'list_employees', { kind: 'ledger' })).map((e) => e.id)) === '["pe-3"]', '');
  check('an unknown kind is refused', isErr(await call(A, 'list_employees', { kind: 'bogus' }), /kind must be/), '');
  check('filter by department', (await call(A, 'list_employees', { department: 'marketing' })).some((e) => e.id === 'pe-2'), '');
  check('search finds a record by its position', (await call(A, 'list_employees', { search: 'agentúra' })).some((e) => e.id === 'pe-2'), '');

  // create_employee
  check('a person without a surname is refused', isErr(await call(A, 'create_employee', { first_name: 'Tomi' }), /first_name and last_name/), '');
  check('a contractor without company_name is refused', isErr(await call(A, 'create_employee', { kind: 'contractor' }), /company_name/), '');
  let r = await call(A, 'create_employee', { first_name: 'Probe', last_name: 'Programmer', position: 'programátor', department: 'Vývoj' });
  check('create_employee builds the display name from first and last name', r.name === 'Probe Programmer' && r.kind === 'employee', JSON.stringify(r));
  const made = rows(`SELECT name, first_name, last_name, kind, position, department FROM employees WHERE id = '${r.id}'`)[0];
  check('create_employee stores the identity columns', JSON.stringify(made) === JSON.stringify(['Probe Programmer', 'Probe', 'Programmer', 'employee', 'programátor', 'Vývoj']), JSON.stringify(made));
  r = await call(A, 'create_employee', { name: 'Probe Grafik' });
  check('create_employee splits a plain "First Last" name', r.first_name === 'Probe' && r.last_name === 'Grafik', JSON.stringify(r));
  check('a one-word name cannot be split', isErr(await call(A, 'create_employee', { name: 'Tomi' }), /first_name and last_name/), '');
  r = await call(A, 'create_employee', { kind: 'contractor', company_name: 'Probe Agency s.r.o.', position: 'PPC špecialista' });
  const co = rows(`SELECT name, first_name, kind FROM employees WHERE id = '${r.id}'`)[0];
  check('a contractor is stored under its company name, without person names', co[0] === 'Probe Agency s.r.o.' && co[1] === 'NULL' && co[2] === 'contractor', JSON.stringify(co));
  check('filter by position', (await call(A, 'list_employees', { position: 'PPC špecialista' })).some((e) => e.id === r.id), '');

  // An external supplier (company or sole trader): contact person and IČO / DIČ / IČ DPH.
  r = await call(A, 'create_employee', { kind: 'contractor', company_name: 'Probe Freelancer', first_name: 'Ján', last_name: 'Novák', company_id: '48123456', tax_id: '2120123456', vat_id: 'SK2120123456' });
  const sup = rows(`SELECT name, first_name, last_name, company_id, tax_id, vat_id FROM employees WHERE id = '${r.id}'`)[0];
  check('a contractor keeps its contact person and IČO / DIČ / IČ DPH', JSON.stringify(sup) === JSON.stringify(['Probe Freelancer', 'Ján', 'Novák', '48123456', '2120123456', 'SK2120123456']), JSON.stringify(sup));
  const supRow = (await call(A, 'list_employees', { search: '48123456' })).find((e) => e.id === r.id);
  check('list_employees returns the register numbers, and search finds a supplier by IČO', supRow?.company_id === '48123456' && supRow.tax_id === '2120123456' && supRow.vat_id === 'SK2120123456', JSON.stringify(supRow));
  check('IČO on a person is refused rather than dropped', isErr(await call(A, 'create_employee', { first_name: 'Probe', last_name: 'Person', company_id: '1' }), /contractor only/), '');
  await call(A, 'update_employee', { id: r.id, vat_id: '' });
  check('an empty vat_id clears just that number', JSON.stringify(rows(`SELECT company_id, vat_id FROM employees WHERE id = '${r.id}'`)[0]) === JSON.stringify(['48123456', 'NULL']), '');
  await call(A, 'update_employee', { id: r.id, kind: 'employee', first_name: 'Ján', last_name: 'Novák' });
  check('turning a supplier into a person clears the register numbers', JSON.stringify(rows(`SELECT kind, company_id, tax_id FROM employees WHERE id = '${r.id}'`)[0]) === JSON.stringify(['employee', 'NULL', 'NULL']), '');

  // update_employee
  check('a nickname-only record can get a position without completing the name', (await call(A, 'update_employee', { id: 'pe-4', position: 'telemarketing' })).success === true, '');
  check('...and the name is left as it was', cell(`SELECT name FROM employees WHERE id = 'pe-4'`) === 'Probetomi', '');
  check('completing only the first name is refused while the surname is missing', isErr(await call(A, 'update_employee', { id: 'pe-4', first_name: 'Tomáš' }), /first_name and last_name/), '');
  await call(A, 'update_employee', { id: 'pe-4', first_name: 'Tomáš', last_name: 'Gazdag' });
  check('first and last name together rebuild the display name', JSON.stringify(rows(`SELECT name, first_name, last_name FROM employees WHERE id = 'pe-4'`)[0]) === JSON.stringify(['Tomáš Gazdag', 'Tomáš', 'Gazdag']), '');
  await call(A, 'update_employee', { id: 'pe-4', last_name: 'Novák' });
  check('changing just the surname keeps the first name', cell(`SELECT name FROM employees WHERE id = 'pe-4'`) === 'Tomáš Novák', '');
  await call(A, 'update_employee', { id: 'pe-4', position: '' });
  check('an empty position clears it', cell(`SELECT position FROM employees WHERE id = 'pe-4'`) === 'NULL', '');
  check('turning a person into a company needs a company name', isErr(await call(A, 'update_employee', { id: 'pe-1', kind: 'contractor' }), /company_name/), '');
  check('an unknown employee is refused', isErr(await call(A, 'update_employee', { id: 'nope', position: 'x' }), /not found/), '');
  const editorOk = await call(TOKENS.editor, 'update_employee', { id: 'pe-1', position: 'projektový manažér', department: 'Manažment' });
  check('a role with employees=edit can set position and department (no pay toggle needed)', editorOk.success === true, JSON.stringify(editorOk));
  const eList = await call(TOKENS.editor, 'list_employees', { position: 'projektový manažér' });
  check('...and read them back without the personal / pay toggles', eList.length === 1 && eList[0].department === 'Manažment' && !('pin' in eList[0]), JSON.stringify(eList));
}

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
  check('a status the invoice list does not have is refused and the valid ones are listed', isErr(await call(A, 'update_invoice_status', { id: inv.id, status: 'paid' }), /Unknown invoice status.*invoiced/), '');
  check('an invoice can be sent', (await call(A, 'update_invoice_status', { id: inv.id, status: 'sent' })).success === true, '');
  await call(A, 'update_invoice_status', { id: inv.id, status: 'cancelled' });
  check('cancelling cancels the unsettled ledger movement', cell(`SELECT status FROM financial_records WHERE id='fr-inv-${inv.id}'`) === 'cancelled', '');
  check('a cancelled document cannot be reopened', isErr(await call(A, 'update_invoice_status', { id: inv.id, status: 'sent' }), /cannot be changed/), '');

  // price offers: their statuses are configurable (OFFER_STATUSES) and are judged by group
  const OFFER_STATUSES = [
    { key: 'draft', color: '#64748b', group: 'draft' },
    { key: 'precenenie', label: 'Precenenie', color: '#f59e0b', group: 'open' },
    { key: 'uzavreta_vyhra', label: 'Uzavretá', color: '#10b981', group: 'won' },
    { key: 'uzavreta_prehra', label: 'Bez objednávky', color: '#f43f5e', group: 'lost' },
    { key: 'cancelled', color: '#f43f5e', group: 'cancelled' },
  ];
  sql(`INSERT INTO system_settings (\`key\`, \`value\`) VALUES ('OFFER_STATUSES', ${sq(JSON.stringify(OFFER_STATUSES))}) ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`);
  const offerRow = (id, status) => `(${sq(id)}, ${sq('CP-PROBE-' + id)}, 'price_offer', ${sq(leadId)}, 'Probe', 'T', 'S', ${sq(status)}, CURDATE())`;
  const metricsBefore = await call(A, 'get_invoicing_metrics', {});
  sql(`INSERT INTO invoices_offers (id, document_number, type, lead_id, client_name, title, subject, status, issued_at) VALUES ${[offerRow('po-a', 'draft'), offerRow('po-w', 'uzavreta_vyhra'), offerRow('po-l', 'uzavreta_prehra')].join(', ')}`);
  check('an offer can be moved to a configured status of the open group', (await call(A, 'update_invoice_status', { id: 'po-a', status: 'precenenie' })).success === true, '');
  check('an offer status of the won group is a verdict left to the app', isErr(await call(A, 'update_invoice_status', { id: 'po-a', status: 'uzavreta_vyhra' }), /only be set in the app/), '');
  check('an unknown offer status is refused and the valid ones are listed', isErr(await call(A, 'update_invoice_status', { id: 'po-a', status: 'bogus' }), /Unknown offer status.*precenenie/), '');
  check('an offer can be cancelled, and then stays cancelled', (await call(A, 'update_invoice_status', { id: 'po-a', status: 'cancelled' })).success === true
    && isErr(await call(A, 'update_invoice_status', { id: 'po-a', status: 'precenenie' }), /cannot be changed/), '');
  const metricsAfter = await call(A, 'get_invoicing_metrics', {});
  check('the win rate counts offers by status group (one custom won, one custom lost)', metricsAfter.offers_decided - metricsBefore.offers_decided === 2, `${metricsBefore.offers_decided} -> ${metricsAfter.offers_decided}`);
  sql(`DELETE FROM invoices_offers WHERE id IN ('po-a', 'po-w', 'po-l')`);
  sql(`DELETE FROM system_settings WHERE \`key\` = 'OFFER_STATUSES'`);

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
  check('a vacation is logged as pending by default (v1.11.158)', r.success && r.status === 'pending', JSON.stringify(r));
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

  // "what changed since": updated_at in list_tasks, updated_from/updated_to, sort_by
  // 1590998400 = 2020-06-01 10:00 in Europe/Bratislava (CEST), independent of the MySQL session zone.
  const ageTask = (id) => sql(`UPDATE tasks SET updated_at = FROM_UNIXTIME(1590998400) WHERE id = ${sq(id)}`);
  const changedSince = async (from, id) => (await call(A, 'list_tasks', { updated_from: from, bucket: 'done', search: 'Bucket' })).some?.((t) => t.id === id);
  const listed = (await call(A, 'list_tasks', { search: 'Bucket', bucket: 'done' })).find?.((t) => t.id === t1);
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  check('list_tasks returns created_at and updated_at as ISO moments with an offset', listed && isoRe.test(listed.created_at) && isoRe.test(listed.updated_at), JSON.stringify(listed));
  const dbUnix = Number(cell(`SELECT FLOOR(UNIX_TIMESTAMP(updated_at)) FROM tasks WHERE id = ${sq(t1)}`));
  check('updated_at is the same moment the database holds, whatever the MySQL time zone', listed && Date.parse(listed.updated_at) / 1000 === dbUnix, `${listed?.updated_at} vs ${dbUnix}`);
  ageTask(t1);
  check('updated_from leaves out a task last changed before it', !(await changedSince('2021-01-01', t1)), '');
  check('updated_from takes a time of day', await changedSince('2020-06-01 09:59', t1) && !(await changedSince('2020-06-01 10:01', t1)), '');
  check('updated_to is exclusive with a time, whole-day with a date',
    !(await call(A, 'list_tasks', { updated_to: '2020-06-01 10:00', bucket: 'done', search: 'Bucket' })).some?.((t) => t.id === t1)
      && (await call(A, 'list_tasks', { updated_to: '2020-06-01', bucket: 'done', search: 'Bucket' })).some?.((t) => t.id === t1), '');
  check('a malformed updated_from is refused', isErr(await call(A, 'list_tasks', { updated_from: 'yesterday' }), /YYYY-MM-DD/), '');
  check('a malformed sort_by is refused', isErr(await call(A, 'list_tasks', { sort_by: 'title' }), /sort_by/), '');
  await call(A, 'set_task_tags', { task_id: t1, tags: ['urgent'] });
  check('re-adding an existing tag does not mark the task changed', !(await changedSince('2021-01-01', t1)), '');
  await call(A, 'set_task_tags', { task_id: t1, tags: ['fresh-tag'] });
  check('adding a tag marks the task changed', await changedSince('2021-01-01', t1), '');
  ageTask(t1);
  await call(A, 'set_task_assignees', { task_id: t1, assignees: ['Probe Admin'] });
  check('re-adding an existing assignee does not mark the task changed', !(await changedSince('2021-01-01', t1)), '');
  r = await call(A, 'create_task', { title: 'Bucket newest', deadline: '2020-01-01' });
  await call(A, 'complete_task', { id: r.id });
  const byUpdate = await call(A, 'list_tasks', { search: 'Bucket', bucket: 'done', sort_by: 'updated_at' });
  check('sort_by=updated_at puts the most recently changed first', byUpdate[0]?.id === r.id && byUpdate.at(-1)?.id === t1, JSON.stringify(byUpdate.map?.((t) => t.id)));

  // small guards
  r = await call(A, 'create_task', { title: 'Unlinked', deadline: '2030-01-01' });
  check('add_task_comment refuses a task with no linked lead (nothing would be stored)', isErr(await call(A, 'add_task_comment', { task_id: r.id, comment: 'hi' }), /not linked to a lead/), '');
  check('create_contact refuses an unknown client', isErr(await call(A, 'create_contact', { client_id: 'nope', name: 'X' }), /not found/), '');
  check('create_inventory_item refuses a duplicate SKU', isErr(await call(A, 'create_inventory_item', { sku: 'PI-1', name: 'Dup' }), /already exists/), '');

  // richer product data: VAT, pack size, weight, alternative codes, one price per price level
  const richItem = await call(A, 'create_inventory_item', { sku: 'PI-RICH', name: 'Rich product', default_sell_price: 100, vat_rate: 10, pack_quantity: 1.44, pack_unit: 'bal', weight_kg: 12.5, alt_codes: ['SUP-77', ' BR/100 ', 'sup-77'] });
  check('create_inventory_item takes VAT, pack size, weight and alternative codes', richItem.success === true, JSON.stringify(richItem));
  check('create_inventory_item refuses an impossible VAT rate', isErr(await call(A, 'create_inventory_item', { sku: 'PI-BADVAT', name: 'X', vat_rate: 250 }), /vat_rate/), '');
  r = await call(A, 'list_inventory_items', { search: 'BR/100' });
  check('an item is found by an alternative code', Array.isArray(r) && r.some((i) => i.id === richItem.id), JSON.stringify(r).slice(0, 200));
  sql(`UPDATE warehouse_items SET external_source = 'mrp', external_id = 'MRP-39' WHERE id = ${sq(richItem.id)}`);
  r = await call(A, 'list_inventory_items', { search: 'MRP-39' });
  check('an item is found by its external id', Array.isArray(r) && r.some((i) => i.id === richItem.id), '');
  const rich = Array.isArray(r) ? r.find((i) => i.id === richItem.id) : null;
  check('listed items carry the new fields, codes as a list', !!rich && rich.vat_rate === 10 && rich.pack_quantity === 1.44 && rich.pack_unit === 'bal' && rich.weight_kg === 12.5
    && JSON.stringify(rich.alt_codes) === JSON.stringify(['SUP-77', 'BR/100']) && !('alt_codes_json' in rich), JSON.stringify(rich));
  sql(`INSERT INTO system_settings (\`key\`, \`value\`) VALUES ('PRICE_LEVELS', ${sq(JSON.stringify([{ id: 'pl-wh', name: 'Veľkoobchod' }, { id: 'pl-partner', name: 'Partner' }]))}) ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`);
  sql(`INSERT INTO warehouse_item_prices (item_id, price_level_id, price) VALUES (${sq(richItem.id)}, 'pl-wh', 80), (${sq(richItem.id)}, 'pl-gone', 50)`);
  r = await call(A, 'get_inventory_item', { id: richItem.id });
  check('get_inventory_item lists the prices of the configured levels by name, and not those of a deleted level',
    Array.isArray(r.price_levels) && r.price_levels.length === 1 && r.price_levels[0].name === 'Veľkoobchod' && r.price_levels[0].price === 80, JSON.stringify(r.price_levels));
  sql(`DELETE FROM warehouse_item_prices WHERE item_id = ${sq(richItem.id)}`);
  sql(`DELETE FROM system_settings WHERE \`key\` = 'PRICE_LEVELS'`);
  r = await call(A, 'search_entities', { query: 'SUP-77', entity_types: ['warehouse'] });
  check('search_entities finds an item by an alternative code', Array.isArray(r.warehouse_items) && r.warehouse_items.some((i) => i.id === richItem.id), JSON.stringify(r).slice(0, 200));
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
  check('employee files need the employees.files toggle', isErr(await call(TOKENS.editor, 'list_files', { source: 'employee', id: 'pe-1' }), /employees\.files/), '');
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

// ----------------------------------------------------------------------------- change visibility (audit 2026-11-10)
// One function per work package so parallel branches never touch the same lines.
// See docs/audits/mcp-change-visibility-audit.md §5 for what each should prove.

async function changeCrmChecks() {
  section('change visibility: leads, clients, communications, documents, meetings, tasks');
  const A = TOKENS.admin;
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  const T20 = 1590998400; // 2020-06-01 10:00 in Europe/Bratislava (CEST), whatever the MySQL zone
  const ids = (r) => (Array.isArray(r) ? r.map((x) => x.id).join() : JSON.stringify(r).slice(0, 200));
  const has = (r, id) => Array.isArray(r) && r.some((x) => x.id === id);
  const age = (table, id, unix) => sql(`UPDATE ${table} SET updated_at = FROM_UNIXTIME(${unix}) WHERE id = ${sq(id)}`);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bratislava' });

  // Two more keys: one that reads leads but not clients, one that reads clients but not leads. Every row below is
  // prefixed cx- / client-cx- and removed again at the end (the roles setting is put back as it was).
  const rolesBefore = cell("SELECT `value` FROM system_settings WHERE `key` = 'ROLES_RBAC'");
  const cxRole = (name, modules) => { const r = role(name, 'nothing'); for (const m of modules) r.permissions[m] = 'view'; return r; };
  const roleList = JSON.parse(rolesBefore).concat([cxRole('ProbeLeadsOnly', ['leads', 'files']), cxRole('ProbeClientsOnly', ['clients', 'files'])]);
  sql(`REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('ROLES_RBAC', ${sq(JSON.stringify(roleList))});`);
  const cxUsers = { cxl: ['probe-cxl', 'Probe LeadsOnly', 'ProbeLeadsOnly'], cxc: ['probe-cxc', 'Probe ClientsOnly', 'ProbeClientsOnly'] };
  for (const [k, [id, name, r]] of Object.entries(cxUsers)) {
    const token = `ccrm_mcp_probe_${k}_${'0'.repeat(40)}`;
    TOKENS[k] = token;
    sql(`INSERT INTO users (id,name,email,password_hash,role) VALUES (${sq(id)},${sq(name)},${sq(id + '@probe.test')},'x',${sq(r)});
         INSERT INTO mcp_keys (id,user_id,key_hash,key_prefix,name,created_at) VALUES (${sq('pk-' + k)},${sq(id)},${sq(createHash('sha256').update(token).digest('hex'))},'ccrm_mcp_p...','probe',NOW() - INTERVAL 1 DAY);`);
  }
  const L = TOKENS.cxl, C = TOKENS.cxc;

  try {
    // ---- seed: leads, one client with two records (name pair), two more clients, timeline entries, meetings
    sql(`INSERT INTO leads (id,name,owner,status,created_at,archived,adjustment) VALUES
      ('cx-lead-1','CX Lead One','Probe Admin','new','2026-11-01',0,0), ('cx-lead-2','CX Lead Two','Probe Admin','new','2026-11-05',0,0),
      ('cx-lead-3','CX Lead Three','Probe Admin','new','2026-10-15',0,0), ('cx-lead-doc','CX Lead Doc','Probe Admin','new','2026-10-01',0,0),
      ('cx-lead-arch','CX Lead Arch','Probe Admin','new','2026-09-01',1,0), ('cx-lead-adj','CX Lead Adj','Probe Admin','new','2026-08-01',0,50),
      ('cx-lead-pair','CX Client One','Probe Admin','accepted','2026-07-01',0,0), ('client-cx-1','CX Client One','Probe Admin','accepted','2026-11-09',0,0),
      ('client-cx-2','CX Client Two','Probe Admin','accepted','2026-06-01',0,0), ('client-cx-3','CX Client Three','Probe Admin','accepted','2026-06-02',0,0);`);
    age('leads', 'cx-lead-1', T20); age('leads', 'cx-lead-3', T20); age('leads', 'client-cx-1', T20);
    age('leads', 'cx-lead-pair', T20 + 86400); age('leads', 'client-cx-2', T20 + 172800); age('leads', 'client-cx-3', T20 + 172800);
    sql(`INSERT INTO timeline_events (id,lead_id,type,timestamp,title,author,hidden) VALUES
      ('cx-ev-1','cx-lead-1','note','2020-07-01 12:00:00','CX note','Probe Admin',0),
      ('cx-ev-2','cx-lead-1','note','2020-08-01 12:00:00','CX hidden note','Probe Admin',1),
      ('cx-ev-3','cx-lead-3','email','2020-09-01 12:00:00','CX mail','Probe Admin',0),
      ('cx-ev-4','cx-lead-doc','note','2099-02-01 08:00:00','CX lead note','Probe Admin',0),
      ('cx-ev-5','client-cx-1','note','2099-02-01 09:00:00','CX client note','Probe Admin',0),
      ('cx-ev-6','cx-lead-doc','phone','2099-02-02 08:00:00','CX lead call','Probe Admin',0);
      INSERT INTO timeline_events (id,lead_id,type,timestamp,title,file_name,file_type,author) VALUES
      ('cx-doc-lead','cx-lead-doc','offer','2099-01-01 10:00:00','CX doc lead','a.pdf','offer','Probe Admin'),
      ('cx-doc-client','client-cx-1','offer','2099-01-02 10:00:00','CX doc client','b.pdf','offer','Probe Admin');`);
    sql(`INSERT INTO meeting_notes (id,title,date,lead_id,archived) VALUES
      ('cx-mtg-past','CX Mtg past','2020-01-10','client-cx-1',0), ('cx-mtg-today','CX Mtg today',${sq(today)},'client-cx-1',0),
      ('cx-mtg-f1','CX Mtg f1','2099-03-01','client-cx-1',0), ('cx-mtg-f2','CX Mtg f2','2099-03-02','client-cx-1',0),
      ('cx-mtg-arch','CX Mtg arch','2099-04-01',NULL,1);
      INSERT INTO meeting_tasks (id,meeting_id,title,due_date,status) VALUES
      ('cx-mt-1','cx-mtg-f1','CX item overdue','2020-01-01','todo'), ('cx-mt-2','cx-mtg-f1','CX item today',${sq(today)},'todo'),
      ('cx-mt-3','cx-mtg-f1','CX item later','2099-05-01','todo'), ('cx-mt-4','cx-mtg-f1','CX item done','2020-01-02','done'),
      ('cx-mt-5','cx-mtg-f1','CX item undated',NULL,'todo');`);
    age('meeting_notes', 'cx-mtg-past', T20);

    // ---- RC11: documents and files respect the leads/clients split
    let r, r2;
    r = await call(L, 'list_documents', { type: 'offer', limit: 100 });
    check('list_documents without lead_id: a leads-only key sees the document of a lead record', has(r, 'cx-doc-lead'), ids(r));
    check('list_documents without lead_id: a leads-only key does not see a client record\'s document', Array.isArray(r) && !has(r, 'cx-doc-client'), ids(r));
    r = await call(A, 'list_documents', { type: 'offer', limit: 100 });
    check('list_documents: Admin sees both kinds', has(r, 'cx-doc-lead') && has(r, 'cx-doc-client'), ids(r));
    r = await call(A, 'list_documents', { type: 'offer', limit: 1 });
    r2 = await call(A, 'list_documents', { type: 'offer', limit: 1, offset: 1 });
    check('list_documents: offset pages on (newest first, id tiebreak)', ids(r) === 'cx-doc-client' && ids(r2) === 'cx-doc-lead', `${ids(r)} / ${ids(r2)}`);
    check('list_documents: timestamp_iso is the stored local time with the offset', r2[0]?.timestamp_iso === '2099-01-01T10:00:00+01:00', JSON.stringify(r2[0]));
    check('list_documents: a client record named by id is refused for a leads-only key', isErr(await call(L, 'list_documents', { lead_id: 'client-cx-1' }), /not found/), '');
    check('list_files source=lead: a leads-only key gets nothing for a client record', (r = await call(L, 'list_files', { source: 'lead', id: 'client-cx-1' })) && Array.isArray(r) && r.length === 0, JSON.stringify(r));
    check('list_files source=lead: a leads-only key still gets a lead record\'s files', has(await call(L, 'list_files', { source: 'lead', id: 'cx-lead-doc' }), 'cx-doc-lead'), '');
    check('list_files source=lead: a clients-only key gets nothing for a lead record', (r = await call(C, 'list_files', { source: 'lead', id: 'cx-lead-doc' })) && Array.isArray(r) && r.length === 0, JSON.stringify(r));
    check('list_files source=lead: a clients-only key gets a client record\'s files', has(await call(C, 'list_files', { source: 'lead', id: 'client-cx-1' }), 'cx-doc-client'), '');
    r = await call(A, 'list_files', { source: 'lead', id: 'client-cx-1', limit: 1, offset: 5 });
    check('list_files source=lead: offset past the end is an empty page', Array.isArray(r) && r.length === 0, JSON.stringify(r));

    // ---- mcp_task_scope matches name or e-mail, like the app
    sql(`INSERT INTO tasks (id,title,deadline,status,owner,created_by) VALUES ('cx-task-mail','CX Mail owner','2031-01-01','New','probe-editor@probe.test','Probe Admin');`);
    check('a task owned by the caller\'s e-mail is visible without tasks.view_all', has(await call(TOKENS.editor, 'list_tasks', { search: 'CX Mail' }), 'cx-task-mail'), '');

    // ---- list_leads
    r = await call(A, 'list_leads', { search: 'CX', limit: 100 });
    check('list_leads: archived leads are hidden by default, every row says archived=false', has(r, 'cx-lead-1') && !has(r, 'cx-lead-arch') && r.every((l) => l.archived === false), ids(r));
    r = await call(A, 'list_leads', { search: 'CX', include_archived: true, limit: 100 });
    check('list_leads: include_archived lists the archived lead and flags it', r.find?.((l) => l.id === 'cx-lead-arch')?.archived === true, ids(r));
    r = await call(L, 'list_leads', { search: 'CX', limit: 100 });
    check('list_leads: a leads-only key sees no client record and no record with a client adjustment', has(r, 'cx-lead-1') && !has(r, 'client-cx-1') && !has(r, 'cx-lead-adj'), ids(r));
    r = await call(L, 'list_leads', { search: 'CX', limit: 2 });
    check('list_leads: the module split runs before LIMIT, so a page is full (2 of 2)', ids(r) === 'cx-lead-2,cx-lead-1', ids(r));
    r = await call(A, 'list_leads', { search: 'CX Lead One' });
    const l1 = r[0];
    check('list_leads: updated_at is an ISO moment, the one the database holds', l1 && l1.updated_at === '2020-06-01T10:00:00+02:00', JSON.stringify(l1));
    check('list_leads: created_at stays the plain creation date', l1 && l1.created_at === '2026-11-01', JSON.stringify(l1));
    check('list_leads: last_activity_at is the newest visible timeline entry (a hidden one is ignored)', l1 && Date.parse(l1.last_activity_at) === Date.parse('2020-07-01T12:00:00+02:00'), JSON.stringify(l1));
    r = await call(A, 'list_leads', { search: 'CX Lead Two' });
    check('list_leads: with no timeline entry last_activity_at equals updated_at', r[0] && isoRe.test(r[0].updated_at) && r[0].last_activity_at === r[0].updated_at, JSON.stringify(r[0]));
    const mailLead = async (tok) => (await call(tok, 'list_leads', { search: 'CX Lead Three' }))[0];
    check('list_leads: an e-mail entry counts in last_activity_at only for a key with the mailbox module', Date.parse((await mailLead(A)).last_activity_at) === Date.parse('2020-09-01T12:00:00+02:00') && (await mailLead(L)).last_activity_at === '2020-06-01T10:00:00+02:00', JSON.stringify([await mailLead(A), await mailLead(L)]));
    const since = async (args, tok = A) => ids(await call(tok, 'list_leads', { search: 'CX Lead', limit: 100, ...args }));
    check('list_leads: updated_from leaves out a lead last changed before it', !(await since({ updated_from: '2021-01-01' })).includes('cx-lead-1') && (await since({ updated_from: '2021-01-01' })).includes('cx-lead-2'), '');
    check('list_leads: updated_from takes a time of day', (await since({ updated_from: '2020-06-01 09:59' })).includes('cx-lead-1') && !(await since({ updated_from: '2020-06-01 10:01' })).includes('cx-lead-1'), '');
    check('list_leads: updated_to is exclusive with a time, whole-day with a date', !(await since({ updated_to: '2020-06-01 10:00' })).includes('cx-lead-1') && (await since({ updated_to: '2020-06-01' })).includes('cx-lead-1'), '');
    check('list_leads: a timeline entry does not move updated_at (the 2020-07-01 note is outside updated_from..to)', !(await since({ updated_from: '2020-06-30', updated_to: '2020-07-02' })).includes('cx-lead-1'), '');
    check('list_leads: activity_from/activity_to find the lead through its timeline entry', (await since({ activity_from: '2020-06-30', activity_to: '2020-07-02' })) === 'cx-lead-1', await since({ activity_from: '2020-06-30', activity_to: '2020-07-02' }));
    check('list_leads: activity_from also matches a record change', (await since({ activity_from: '2021-01-01' })).includes('cx-lead-2') && !(await since({ activity_from: '2021-01-01' })).includes('cx-lead-1'), '');
    check('list_leads: the activity filter honours the e-mail gate', (await since({ activity_from: '2020-08-31', activity_to: '2020-09-02' })).includes('cx-lead-3') && !(await since({ activity_from: '2020-08-31', activity_to: '2020-09-02' }, L)).includes('cx-lead-3'), '');
    r = (await since({ sort_by: 'updated_at' })).split(',');
    check('list_leads: sort_by=updated_at puts the most recently changed first', r.indexOf('cx-lead-2') < r.indexOf('cx-lead-1'), r.join());
    r = (await since({ sort_by: 'updated_at', sort_order: 'asc' })).split(',');
    check('list_leads: sort_order=asc reverses it', r.indexOf('cx-lead-1') < r.indexOf('cx-lead-2'), r.join());
    check('list_leads: created_from/created_to are an inclusive date range', (await since({ created_from: '2026-11-05', created_to: '2026-11-05' })) === 'cx-lead-2', await since({ created_from: '2026-11-05', created_to: '2026-11-05' }));
    check('list_leads: created_from after created_to is refused', isErr(await call(A, 'list_leads', { created_from: '2026-11-06', created_to: '2026-11-05' }), /after/), '');
    check('list_leads: a malformed sort_by is refused', isErr(await call(A, 'list_leads', { sort_by: 'name' }), /sort_by/), '');
    check('list_leads: offset pages (limit 1, offset 1 on the default newest-created order)', ids(await call(A, 'list_leads', { search: 'CX Lead', limit: 1, offset: 1 })) === 'cx-lead-1', ids(await call(A, 'list_leads', { search: 'CX Lead', limit: 1, offset: 1 })));
    r = await call(A, 'get_lead_pipeline_summary', {});
    const rL = await call(L, 'get_lead_pipeline_summary', {});
    check('get_lead_pipeline_summary: a leads-only key does not count a record with a client adjustment', r.active && rL.active && r.active.count > rL.active.count && r.as_of === today, JSON.stringify([r.active, rL.active, r.as_of]));

    // ---- get_lead
    r = await call(A, 'get_lead', { id: 'cx-lead-1' });
    check('get_lead: updated_at is ISO with the offset', r.updated_at === '2020-06-01T10:00:00+02:00', r.updated_at);
    check('get_lead: timeline entries keep the local time and carry an ISO form; hidden ones stay out', r.timeline_events?.length === 1 && r.timeline_events[0].timestamp === '2020-07-01 12:00:00' && r.timeline_events[0].timestamp_iso === '2020-07-01T12:00:00+02:00', JSON.stringify(r.timeline_events));
    check('get_lead: last_activity_at is the newest timeline entry', Date.parse(r.last_activity_at) === Date.parse('2020-07-01T12:00:00+02:00'), r.last_activity_at);
    check('get_lead: a leads-only key cannot read a client record', isErr(await call(L, 'get_lead', { id: 'client-cx-1' }), /not found/), '');

    // ---- clients
    r = await call(A, 'list_clients', { search: 'CX Client', limit: 100 });
    const one = r.find?.((c) => c.id === 'client-cx-1');
    check('list_clients: a profile\'s updated_at is the newest of its records, as ISO', one && one.leads_count === 2 && one.updated_at === '2020-06-02T10:00:00+02:00', JSON.stringify(one));
    check('list_clients: last_activity_at adds the timeline of all its records', one && Date.parse(one.last_activity_at) === Date.parse('2099-02-01T09:00:00+01:00'), JSON.stringify(one));
    check('list_clients: without a timeline last_activity_at equals updated_at', r.find?.((c) => c.id === 'client-cx-2')?.last_activity_at === '2020-06-03T10:00:00+02:00', JSON.stringify(r.map?.((c) => [c.id, c.last_activity_at])));
    const cl = async (args) => ids(await call(A, 'list_clients', { search: 'CX Client', limit: 100, ...args }));
    check('list_clients: sort_by=updated_at is newest first, ties by id', (await cl({ sort_by: 'updated_at' })) === 'client-cx-2,client-cx-3,client-cx-1', await cl({ sort_by: 'updated_at' }));
    check('list_clients: sort_order=asc reverses the moment, not the id tiebreak', (await cl({ sort_by: 'updated_at', sort_order: 'asc' })) === 'client-cx-1,client-cx-2,client-cx-3', await cl({ sort_by: 'updated_at', sort_order: 'asc' }));
    const pageIds = [];
    for (const o of [0, 1, 2]) pageIds.push(ids(await call(A, 'list_clients', { search: 'CX Client', sort_by: 'updated_at', limit: 1, offset: o })));
    check('list_clients: pages are stable, equal moments keep their id order (offset 0, 1, 2)', pageIds.join() === 'client-cx-2,client-cx-3,client-cx-1', pageIds.join());
    check('list_clients: updated_from leaves out a profile whose newest record is older', (await cl({ updated_from: '2020-06-03' })).split(',').sort().join() === 'client-cx-2,client-cx-3', await cl({ updated_from: '2020-06-03' }));
    check('list_clients: updated_to is whole-day with a date', (await cl({ updated_to: '2020-06-02' })) === 'client-cx-1', await cl({ updated_to: '2020-06-02' }));
    check('list_clients: a malformed updated_from is refused', isErr(await call(A, 'list_clients', { updated_from: 'soon' }), /YYYY-MM-DD/), '');
    r = await call(A, 'get_client_profile', { name: 'CX Client One' });
    check('get_client_profile: updated_at, last_activity_at and each record\'s updated_at are ISO', r.updated_at === '2020-06-02T10:00:00+02:00' && isoRe.test(r.last_activity_at) && r.leads?.every((l) => isoRe.test(l.updated_at)), JSON.stringify([r.updated_at, r.last_activity_at, r.leads?.map((l) => l.updated_at)]));
    r = await call(A, 'get_client', { id: 'client-cx-1' });
    check('get_client: updated_at is ISO, the one the database holds', r.updated_at === '2020-06-01T10:00:00+02:00', r.updated_at);

    // ---- get_client_dossier: upcoming vs recent meetings, ISO timeline
    r = await call(A, 'get_client_dossier', { identifier: 'client-cx-1' });
    check('get_client_dossier: upcoming_meetings are dated today or later, soonest first', ids(r.upcoming_meetings) === 'cx-mtg-today,cx-mtg-f1,cx-mtg-f2', ids(r.upcoming_meetings));
    check('get_client_dossier: recent_meetings are the past ones only', ids(r.recent_meetings) === 'cx-mtg-past', ids(r.recent_meetings));
    check('get_client_dossier: the timeline carries an ISO form and the profile an updated_at', r.latest_timeline?.length > 0 && r.latest_timeline.every((e) => isoRe.test(e.timestamp_iso)) && r.profile?.updated_at === '2020-06-02T10:00:00+02:00', JSON.stringify([r.latest_timeline?.[0], r.profile?.updated_at]));
    check('get_client_dossier: open_tasks_truncated says the list is complete', r.open_tasks_truncated === false, JSON.stringify(r.open_tasks_truncated));

    // ---- list_contacts
    r = await call(A, 'list_contacts', { client_id: 'client-cx-1' });
    check('list_contacts: carries the record\'s updated_at as ISO', r.length === 1 && r[0].updated_at === '2020-06-01T10:00:00+02:00', JSON.stringify(r));
    check('list_contacts: offset pages past the one contact', (await call(A, 'list_contacts', { client_id: 'client-cx-1', offset: 1 })).length === 0, '');
    check('list_contacts: a clients-only key gets nothing for a lead record, and its contact for a client', (await call(C, 'list_contacts', { client_id: 'cx-lead-1' })).length === 0 && (await call(C, 'list_contacts', { client_id: 'client-cx-1' })).length === 1, '');

    // ---- list_communications: the cross-record feed
    const feed = async (args, tok = A) => ids(await call(tok, 'list_communications', { from: '2099-01-01', sort_order: 'asc', limit: 100, ...args }));
    check('list_communications: lead_id is optional; Admin gets the feed across records, oldest first', (await feed({})) === 'cx-doc-lead,cx-doc-client,cx-ev-4,cx-ev-5,cx-ev-6', await feed({}));
    check('list_communications: a leads-only key gets the feed without client records, in full', (await feed({}, L)) === 'cx-doc-lead,cx-ev-4,cx-ev-6', await feed({}, L));
    check('list_communications: to is exclusive with a time', (await feed({ from: '2099-02-01', to: '2099-02-01 08:30' })) === 'cx-ev-4', await feed({ from: '2099-02-01', to: '2099-02-01 08:30' }));
    check('list_communications: to is whole-day with a date', (await feed({ from: '2099-02-01', to: '2099-02-01' })) === 'cx-ev-4,cx-ev-5', await feed({ from: '2099-02-01', to: '2099-02-01' }));
    check('list_communications: type filter', (await feed({ type: 'phone' })) === 'cx-ev-6', await feed({ type: 'phone' }));
    check('list_communications: offset pages the feed', (await feed({ limit: 2, offset: 2 })) === 'cx-ev-4,cx-ev-5', await feed({ limit: 2, offset: 2 }));
    check('list_communications: newest first by default', (await feed({ sort_order: 'desc' })).split(',')[0] === 'cx-ev-6', '');
    r = await call(A, 'list_communications', { from: '2099-02-01', to: '2099-02-01', sort_order: 'asc' });
    check('list_communications: rows carry lead_name and timestamp_iso (local time with the offset)', r[0]?.lead_name === 'CX Lead Doc' && r[0]?.timestamp === '2099-02-01 08:00:00' && r[0]?.timestamp_iso === '2099-02-01T08:00:00+01:00', JSON.stringify(r[0]));
    check('list_communications: a client record named by lead_id is refused for a leads-only key', isErr(await call(L, 'list_communications', { lead_id: 'client-cx-1' }), /not found/), '');
    check('list_communications: a malformed from is refused', isErr(await call(A, 'list_communications', { from: 'noon' }), /YYYY-MM-DD/), '');
    r = await call(A, 'log_communication', { lead_id: 'cx-lead-doc', type: 'note', title: 'CX logged' });
    const stamp = cell(`SELECT timestamp FROM timeline_events WHERE id = ${sq(r.id)}`);
    const localNow = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Bratislava' });
    const asUtc = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
    check('log_communication stamps the app clock, not MySQL NOW()', Math.abs(asUtc(stamp) - asUtc(localNow)) < 180000, `${stamp} vs ${localNow}`);
    r2 = await call(A, 'list_communications', { lead_id: 'cx-lead-doc', from: stamp, sort_order: 'asc' });
    check('list_communications: polling with from = the last timestamp seen returns the new entry', has(r2, r.id) && Math.abs(Date.parse(r2.find((x) => x.id === r.id).timestamp_iso) - Date.now()) < 180000, JSON.stringify(r2).slice(0, 300));

    // ---- meetings
    const mt = async (args, tok = A) => ids(await call(tok, 'list_meetings', { search: 'CX Mtg', limit: 100, ...args }));
    check('list_meetings: archived meetings are hidden by default', (await mt({})) === 'cx-mtg-f2,cx-mtg-f1,cx-mtg-today,cx-mtg-past', await mt({}));
    r = await call(A, 'list_meetings', { search: 'CX Mtg', include_archived: true, limit: 100 });
    check('list_meetings: include_archived lists the archived meeting and flags it', r.find?.((m) => m.id === 'cx-mtg-arch')?.archived === true && r.find((m) => m.id === 'cx-mtg-f1').archived === false, ids(r));
    const past = (await call(A, 'list_meetings', { search: 'CX Mtg past' }))[0];
    check('list_meetings: created_at and updated_at are ISO moments, updated_at the one the database holds', past && isoRe.test(past.created_at) && past.updated_at === '2020-06-01T10:00:00+02:00', JSON.stringify(past));
    check('list_meetings: updated_from leaves out a meeting last changed before it', !(await mt({ updated_from: '2021-01-01' })).includes('cx-mtg-past') && (await mt({ updated_from: '2021-01-01' })).includes('cx-mtg-f1'), '');
    check('list_meetings: sort_by=updated_at puts the most recently changed first', (await mt({ sort_by: 'updated_at' })).split(',').at(-1) === 'cx-mtg-past', await mt({ sort_by: 'updated_at' }));
    check('list_meetings: upcoming_only runs on the app date (today counts)', (await mt({ upcoming_only: true })) === 'cx-mtg-f2,cx-mtg-f1,cx-mtg-today', await mt({ upcoming_only: true }));
    check('list_meetings: date_from/date_to are an inclusive range on the meeting day', (await mt({ date_from: '2099-03-01', date_to: '2099-03-01' })) === 'cx-mtg-f1', await mt({ date_from: '2099-03-01', date_to: '2099-03-01' }));
    check('list_meetings: start_date still works as a lower bound', (await mt({ start_date: '2099-03-02' })) === 'cx-mtg-f2', await mt({ start_date: '2099-03-02' }));
    check('list_meetings: offset pages (limit 1, offset 1)', (await mt({ limit: 1, offset: 1 })) === 'cx-mtg-f1', await mt({ limit: 1, offset: 1 }));
    r = await call(A, 'get_meeting', { id: 'cx-mtg-past' });
    check('get_meeting: created_at and updated_at are ISO moments', isoRe.test(r.created_at) && r.updated_at === '2020-06-01T10:00:00+02:00', JSON.stringify([r.created_at, r.updated_at]));

    // ---- list_meeting_tasks
    const mit = async (args) => ids(await call(A, 'list_meeting_tasks', { meeting_id: 'cx-mtg-f1', ...args }));
    check('list_meeting_tasks: default order is the due date, then id (undated first)', (await mit({})) === 'cx-mt-5,cx-mt-1,cx-mt-4,cx-mt-2,cx-mt-3', await mit({}));
    check('list_meeting_tasks: bucket=overdue is open items past their due date only', (await mit({ bucket: 'overdue' })) === 'cx-mt-1', await mit({ bucket: 'overdue' }));
    check('list_meeting_tasks: bucket=today', (await mit({ bucket: 'today' })) === 'cx-mt-2', await mit({ bucket: 'today' }));
    check('list_meeting_tasks: bucket=upcoming', (await mit({ bucket: 'upcoming' })) === 'cx-mt-3', await mit({ bucket: 'upcoming' }));
    check('list_meeting_tasks: bucket=done', (await mit({ bucket: 'done' })) === 'cx-mt-4', await mit({ bucket: 'done' }));
    check('list_meeting_tasks: due_from/due_to are an inclusive range', (await mit({ due_from: '2020-01-01', due_to: '2020-01-02' })) === 'cx-mt-1,cx-mt-4', await mit({ due_from: '2020-01-01', due_to: '2020-01-02' }));
    check('list_meeting_tasks: offset pages (limit 2, offset 2)', (await mit({ limit: 2, offset: 2 })) === 'cx-mt-4,cx-mt-2', await mit({ limit: 2, offset: 2 }));
    check('list_meeting_tasks: an unknown bucket is refused', isErr(await call(A, 'list_meeting_tasks', { bucket: 'someday' }), /bucket/), '');

    // ---- list_tasks: archives, deadline range, deadline history
    const mk = async (title, deadline) => (await call(A, 'create_task', { title, deadline })).id;
    const dlA = await mk('CX Dl A', '2031-03-01');
    const dlB = await mk('CX Dl B', '2031-03-15');
    const archId = await mk('CX Arch task', '2031-04-01');
    const doneId = await mk('CX Done task', '2031-05-01');
    const tk = async (args) => ids(await call(A, 'list_tasks', { limit: 100, ...args }));
    check('list_tasks: deadline_from is an inclusive lower bound', (await tk({ search: 'CX Dl', deadline_from: '2031-03-10' })) === dlB, await tk({ search: 'CX Dl', deadline_from: '2031-03-10' }));
    check('list_tasks: deadline_to is an inclusive upper bound', (await tk({ search: 'CX Dl', deadline_to: '2031-03-01' })) === dlA, await tk({ search: 'CX Dl', deadline_to: '2031-03-01' }));
    check('list_tasks: a malformed deadline_from is refused', isErr(await call(A, 'list_tasks', { deadline_from: 'next week' }), /YYYY-MM-DD/), '');
    sql(`UPDATE tasks SET original_deadline = '2031-02-01', deadline_moves = 2 WHERE id = ${sq(dlA)}`);
    const rowA = (await call(A, 'list_tasks', { search: 'CX Dl A' }))[0];
    check('list_tasks: rows carry original_deadline and deadline_moves', rowA && rowA.original_deadline === '2031-02-01' && rowA.deadline_moves === 2, JSON.stringify(rowA));
    const gt = await call(A, 'get_task', { id: dlA });
    check('get_task: original_deadline and deadline_moves, ISO created_at/updated_at', gt.original_deadline === '2031-02-01' && Number(gt.deadline_moves) === 2 && isoRe.test(gt.created_at) && isoRe.test(gt.updated_at), JSON.stringify(gt).slice(0, 300));
    age('tasks', archId, T20);
    sql(`UPDATE tasks SET archived = 1 WHERE id = ${sq(archId)}`);
    check('list_tasks: an archived task is left out by default', !(await tk({ search: 'CX Arch' })).includes(archId), '');
    const arch = (await call(A, 'list_tasks', { search: 'CX Arch', include_archived: true }))[0];
    check('list_tasks: include_archived lists it, flagged archived', arch && arch.id === archId && arch.archived === true, JSON.stringify(arch));
    check('list_tasks: archiving moves updated_at, so include_archived + updated_from shows it as a change', (await tk({ search: 'CX Arch', include_archived: true, updated_from: '2021-01-01' })) === archId, await tk({ search: 'CX Arch', include_archived: true, updated_from: '2021-01-01' }));
    check('list_tasks: rows not archived say archived=false', (await call(A, 'list_tasks', { search: 'CX Dl A' }))[0]?.archived === false, '');
    await call(A, 'complete_task', { id: doneId });
    const done = (await call(A, 'list_tasks', { search: 'CX Done', bucket: 'done' }))[0];
    check('list_tasks: completed_at_iso is the local completion time with the offset', done && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(done.completed_at) && Math.abs(Date.parse(done.completed_at_iso) - Date.now()) < 300000, JSON.stringify(done));
  } finally {
    sql(`DELETE FROM task_assignees WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE 'CX %');
         DELETE FROM tasks WHERE title LIKE 'CX %';
         DELETE FROM meeting_notes WHERE id LIKE 'cx-mtg-%';
         DELETE FROM timeline_events WHERE id LIKE 'cx-%' OR lead_id LIKE 'cx-%' OR lead_id LIKE 'client-cx-%';
         DELETE FROM leads WHERE id LIKE 'cx-lead-%' OR id LIKE 'client-cx-%';
         DELETE FROM mcp_keys WHERE id IN ('pk-cxl', 'pk-cxc');
         DELETE FROM users WHERE id IN ('probe-cxl', 'probe-cxc');
         REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('ROLES_RBAC', ${sq(rolesBefore)});`);
  }
}

// ---- (separator: keep these stubs apart so git merges them cleanly) ----

async function changeMoneyChecks() {
  section('change visibility: projects, invoices, expenses, ledger, forecast');
  const A = TOKENS.admin;
  const today = (await call(A, 'get_financial_overview', { year: 2026 })).as_of;   // the app's date, not this machine's
  const shift = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const [yesterday, in3, in5, in10, in14, in20] = [-1, 3, 5, 10, 14, 20].map((n) => shift(today, n));
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  const list = (r) => (Array.isArray(r) ? r : []);
  const ids = (rs) => list(rs).map((r) => r.id).join();
  const sortedIds = (rs) => list(rs).map((r) => r.id).sort().join();
  // 1590998400 = 2020-06-01 10:00 Europe/Bratislava, whatever the MySQL zone (as in the task checks).
  const age = (table, where) => sql(`UPDATE ${table} SET updated_at = FROM_UNIXTIME(1590998400) WHERE ${where}`);
  const unix = (iso) => Date.parse(iso) / 1000;

  // ---- projects: deadline buckets and ranges, window, paging
  sql(`SET FOREIGN_KEY_CHECKS=0;
       DELETE FROM projects WHERE id LIKE 'cm-p%' OR id LIKE 'cm-bulk%';
       INSERT INTO projects (id,project_type_id,name,status,value,completion_deadline,invoice_date) VALUES
         ('cm-p1','pt-parity','cmprobe overdue','active',1000,'${yesterday}','${in3}'),
         ('cm-p2','pt-parity','cmprobe done late','completed',1000,'${yesterday}',NULL),
         ('cm-p3','pt-parity','cmprobe soon','active',1000,'${in10}',NULL),
         ('cm-p4','pt-parity','cmprobe undated','active',1000,NULL,NULL);
       INSERT INTO projects (id,project_type_id,name,status) VALUES ${Array.from({ length: 120 }, (_, i) => `('cm-bulk${i}','pt-parity','cmbulk probe','active')`).join(',')};
       SET FOREIGN_KEY_CHECKS=1;`);
  const lp = (a) => call(A, 'list_projects', { search: 'cmprobe', ...a });
  let r = await lp({});
  const p1 = list(r).find((p) => p.id === 'cm-p1');
  check('list_projects returns created_at and updated_at as ISO moments with an offset', p1 && isoRe.test(p1.created_at) && isoRe.test(p1.updated_at), JSON.stringify(p1));
  check('list_projects: updated_at is the moment the database holds', p1 && unix(p1.updated_at) === Number(cell(`SELECT FLOOR(UNIX_TIMESTAMP(updated_at)) FROM projects WHERE id = 'cm-p1'`)), p1?.updated_at);
  check('list_projects rows carry the status group', p1?.status_group === 'in_progress' && list(r).find((p) => p.id === 'cm-p2')?.status_group === 'completed', JSON.stringify(list(r).map((p) => p.status_group)));
  check('list_projects bucket=overdue: open and past the deadline (a completed late project is not)', sortedIds(await lp({ bucket: 'overdue' })) === 'cm-p1', JSON.stringify(await lp({ bucket: 'overdue' })).slice(0, 300));
  check('list_projects bucket=done: the completed project', sortedIds(await lp({ bucket: 'done' })) === 'cm-p2', '');
  check('list_projects bucket=upcoming: a deadline later than tomorrow', sortedIds(await lp({ bucket: 'upcoming' })) === 'cm-p3', '');
  check('list_projects bucket=today: nothing due today', Array.isArray(await lp({ bucket: 'today' })) && sortedIds(await lp({ bucket: 'today' })) === '', '');
  check('list_projects deadline_from/deadline_to is an inclusive range (today .. +14 days)', sortedIds(await lp({ deadline_from: today, deadline_to: in14 })) === 'cm-p3', '');
  check('list_projects deadline_to alone: everything due up to yesterday', sortedIds(await lp({ deadline_to: yesterday })) === 'cm-p1,cm-p2', '');
  check('list_projects invoice_date_from/invoice_date_to', sortedIds(await lp({ invoice_date_from: today, invoice_date_to: in3 })) === 'cm-p1', '');
  check('list_projects sort_by=deadline: soonest first, undated last', ids(await lp({ sort_by: 'deadline' })) === 'cm-p1,cm-p2,cm-p3,cm-p4', ids(await lp({ sort_by: 'deadline' })));
  check('list_projects sort_by=deadline sort_order=desc keeps undated last', ids(await lp({ sort_by: 'deadline', sort_order: 'desc' })) === 'cm-p3,cm-p1,cm-p2,cm-p4', ids(await lp({ sort_by: 'deadline', sort_order: 'desc' })));
  check('list_projects refuses a malformed deadline_from and an unknown bucket', isErr(await lp({ deadline_from: 'soon' }), /YYYY-MM-DD/) && isErr(await lp({ bucket: 'late' }), /bucket/), '');
  age('projects', `id = 'cm-p1'`);
  check('list_projects updated_from leaves out a project last changed before it', !ids(await lp({ updated_from: '2021-01-01' })).includes('cm-p1') && ids(await lp({ updated_from: '2021-01-01' })).includes('cm-p3'), '');
  check('list_projects updated_from takes a time of day', ids(await lp({ updated_from: '2020-06-01 09:59' })).includes('cm-p1') && !ids(await lp({ updated_from: '2020-06-01 10:01' })).includes('cm-p1'), '');
  check('list_projects sort_by=updated_at lists the oldest change last', list(await lp({ sort_by: 'updated_at' })).at(-1)?.id === 'cm-p1', ids(await lp({ sort_by: 'updated_at' })));
  const page1 = await lp({ limit: 2, sort_by: 'deadline' });
  const page2 = await lp({ limit: 2, offset: 2, sort_by: 'deadline' });
  check('list_projects offset pages without overlap or gaps', ids(page1) === 'cm-p1,cm-p2' && ids(page2) === 'cm-p3,cm-p4', `${ids(page1)} | ${ids(page2)}`);
  const bulk = (a) => call(A, 'list_projects', { search: 'cmbulk', limit: 100, ...a });
  const bulkA = await bulk({});
  const bulkB = await bulk({ offset: 100 });
  check('list_projects: 120 projects, offset 100 returns the last 20 (no silent cap at 100)', list(bulkA).length === 100 && list(bulkB).length === 20 && new Set([...list(bulkA), ...list(bulkB)].map((p) => p.id)).size === 120, `${list(bulkA).length} / ${list(bulkB).length}`);
  const gp = await call(A, 'get_project', { id: 'cm-p1' });
  check('get_project returns created_at and updated_at as ISO moments (the stored moment, any MySQL zone)', isoRe.test(gp.created_at) && isoRe.test(gp.updated_at) && unix(gp.updated_at) === 1590998400, `${gp.created_at} ${gp.updated_at}`);

  // ---- milestones: across projects, deadline range, bucket, paging
  sql(`CREATE TABLE IF NOT EXISTS proj_gantt_ptparity (id VARCHAR(50) PRIMARY KEY, project_id VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL, contact_id VARCHAR(50) NULL, start_date DATE NULL, end_date DATE NULL, progress INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
       DELETE FROM proj_gantt_ptparity WHERE id LIKE 'cmg%';
       INSERT INTO proj_gantt_ptparity (id,project_id,title,start_date,end_date,progress) VALUES
         ('cmg1','cm-p1','CM Gantt late','${shift(today, -30)}','${yesterday}',40),
         ('cmg2','cm-p1','CM Gantt done','${shift(today, -30)}','${yesterday}',100),
         ('cmg3','cm-p3','CM Gantt later','${today}','${in10}',0);`);
  const ms = await call(A, 'create_milestone', { project_id: 'cm-p1', title: 'CM milestone task', deadline: yesterday });
  const lmAll = async (a, token = A) => (await call(token, 'list_milestones', a)).milestones || [];
  check('list_milestones with project_id and bucket=overdue: open milestones past their deadline', sortedIds(await lmAll({ project_id: 'cm-p1', bucket: 'overdue' })) === ['cmg1', ms.id].sort().join(), JSON.stringify(await lmAll({ project_id: 'cm-p1', bucket: 'overdue' })).slice(0, 300));
  // The dev data may hold other milestones: narrow ranges keep ours on the first page.
  let all = await lmAll({ deadline_from: yesterday, deadline_to: in10, limit: 100 });
  check('list_milestones without project_id lists milestones of every project, each with its project', ['cmg1', 'cmg2', 'cmg3', ms.id].every((id) => all.some((m) => m.id === id)) && all.every((m) => m.project_id && 'project_name' in m), JSON.stringify(all.slice(0, 2)));
  all = await lmAll({ bucket: 'overdue', deadline_from: yesterday, deadline_to: in10, limit: 100 });
  check('list_milestones across projects: bucket=overdue has the open late ones, not the finished or future ones', all.some((m) => m.id === 'cmg1') && all.some((m) => m.id === ms.id) && !all.some((m) => m.id === 'cmg2' || m.id === 'cmg3'), ids(all));
  all = await lmAll({ deadline_from: today, deadline_to: in20, limit: 100 });
  check('list_milestones across projects: deadline_from/deadline_to', all.some((m) => m.id === 'cmg3') && !all.some((m) => m.id === 'cmg1'), ids(all));
  check('list_milestones across projects: open_only leaves out the finished Gantt row', (await lmAll({ open_only: true, deadline_from: yesterday, deadline_to: yesterday, limit: 100 })).some((m) => m.id === 'cmg1') && !(await lmAll({ open_only: true, deadline_from: yesterday, deadline_to: yesterday, limit: 100 })).some((m) => m.id === 'cmg2'), '');
  const mp1 = await call(A, 'list_milestones', { limit: 1 });
  const mp2 = await call(A, 'list_milestones', { limit: 1, offset: 1 });
  check('list_milestones pages with limit + offset and says whether a next page exists', mp1.milestones?.length === 1 && mp2.milestones?.length === 1 && mp1.milestones[0].id !== mp2.milestones[0].id && mp1.has_more === true, JSON.stringify([mp1.has_more, mp1.milestones?.map((m) => m.id), mp2.milestones?.map((m) => m.id)]));
  const msRow = (await lmAll({ project_id: 'cm-p1' })).find((m) => m.id === ms.id);
  check('list_milestones: a milestone task carries created_at and updated_at as ISO moments', msRow && isoRe.test(msRow.created_at) && isoRe.test(msRow.updated_at), JSON.stringify(msRow));
  check('list_milestones across projects: milestone tasks follow task visibility', (await lmAll({ deadline_from: yesterday, deadline_to: yesterday, limit: 100 }, TOKENS.editor)).some((m) => m.id === 'cmg1') && !(await lmAll({ deadline_from: yesterday, deadline_to: yesterday, limit: 100 }, TOKENS.editor)).some((m) => m.source === 'task' && m.id === ms.id), '');
  sql(`UPDATE projects SET archived = 1 WHERE id = 'cm-p3'`);
  check('list_milestones across projects leaves out archived projects unless asked', !(await lmAll({ deadline_from: in10, deadline_to: in10, limit: 100 })).some((m) => m.id === 'cmg3') && (await lmAll({ deadline_from: in10, deadline_to: in10, limit: 100, include_archived: true })).some((m) => m.id === 'cmg3'), '');

  // ---- invoices: payment state, derived overdue, due/issue ranges, last_activity_at
  const inv = (n, o) => `('cm-inv${n}','CMP-${n}','${o.type || 'invoice'}','cm-lead','cm-client','CMProbe Client','Inv ${n}','Inv ${n}',${o.total / 1.2},${o.total - o.total / 1.2},${o.total},'${o.status || 'sent'}',${o.changed ? `'${o.changed}'` : 'NULL'},'${o.issued}',${o.due ? `'${o.due}'` : 'NULL'})`;
  const fr = (n, status, planned, real, paidDate, due) => `('fr-inv-cm-inv${n}','income','invoice','Inv ${n}',${planned},${real},'EUR','${status}','${today}',${due ? `'${due}'` : 'NULL'},${paidDate ? `'${paidDate}'` : 'NULL'},'CMP-${n}')`;
  sql(`SET FOREIGN_KEY_CHECKS=0;
       DELETE FROM invoices_offers WHERE id LIKE 'cm-inv%'; DELETE FROM financial_records WHERE id LIKE 'fr-inv-cm-inv%';
       INSERT INTO invoices_offers (id,document_number,type,lead_id,client_id,client_name,title,subject,subtotal,vat_amount,total_price,status,status_changed_at,issued_at,due_date) VALUES
         ${inv(1, { total: 120, issued: shift(today, -5), due: yesterday, changed: '2026-11-01' })},
         ${inv(2, { total: 240, issued: shift(today, -2), due: in10 })},
         ${inv(3, { total: 360, issued: shift(today, -1), due: in10 })},
         ${inv(4, { type: 'price_offer', total: 600, issued: shift(today, -20) })},
         ${inv(5, { total: 600, issued: shift(today, -3), due: yesterday })};
       INSERT INTO financial_records (id,type,subtype,title,amount_planned,amount_real,currency,status,issue_date,due_date,paid_date,invoice_number) VALUES
         ${fr(1, 'pending', 120, 0, null, yesterday)}, ${fr(2, 'paid', 240, 240, yesterday, in10)}, ${fr(3, 'pending', 360, 0, null, in10)};
       SET FOREIGN_KEY_CHECKS=1;`);
  const li = (a) => call(A, 'list_invoices', { search: 'CMProbe', ...a });
  const pay = (rs) => list(rs).map((i) => `${i.id.replace('cm-inv', '')}:${i.payment_status}`).sort().join();
  r = await li({});
  check('list_invoices returns the payment state (paid, derived overdue, no ledger row, offers have none)', pay(r) === '1:overdue,2:paid,3:unpaid,4:null,5:overdue', pay(r));
  const i2 = list(r).find((i) => i.id === 'cm-inv2');
  const i1 = list(r).find((i) => i.id === 'cm-inv1');
  check('list_invoices: paid, open and paid_date come from the ledger movement', i2?.paid === 240 && i2?.open === 0 && i2?.paid_date === yesterday && i1?.paid === 0 && i1?.open === 120, JSON.stringify([i1, i2]).slice(0, 400));
  check('list_invoices keeps its columns and adds status_changed_at and ISO moments', i1?.status === 'sent' && i1?.issued_at === shift(today, -5) && i1?.total_price !== undefined && i1?.status_changed_at === '2026-11-01' && isoRe.test(i1?.created_at) && isoRe.test(i1?.updated_at) && isoRe.test(i1?.last_activity_at), JSON.stringify(i1));
  r = await li({ payment_status: 'overdue' });
  check('list_invoices payment_status=overdue: past due and unpaid, with or without a ledger row', sortedIds(r) === 'cm-inv1,cm-inv5' && list(r).every((i) => i.payment_status === 'overdue'), sortedIds(r));
  check('list_invoices payment_status=overdue answers "how much is open" across clients (120 + 600)', list(r).reduce((s, i) => s + i.open, 0) === 720, JSON.stringify(list(r).map((i) => i.open)));
  check('list_invoices payment_status=paid / unpaid', sortedIds(await li({ payment_status: 'paid' })) === 'cm-inv2' && sortedIds(await li({ payment_status: 'unpaid' })) === 'cm-inv3', '');
  const overdueAll = await call(A, 'list_invoices', { payment_status: 'overdue', limit: 100 });
  check('list_invoices payment_status=overdue across all clients includes both', ['cm-inv1', 'cm-inv5'].every((id) => list(overdueAll).some((i) => i.id === id)) && list(overdueAll).every((i) => i.payment_status === 'overdue'), ids(overdueAll).slice(0, 200));
  check('list_invoices offset pages the derived payment_status filter', ids(await li({ payment_status: 'overdue', limit: 1 })) === 'cm-inv5' && ids(await li({ payment_status: 'overdue', limit: 1, offset: 1 })) === 'cm-inv1', '');
  check('list_invoices due_from/due_to', sortedIds(await li({ due_to: yesterday })) === 'cm-inv1,cm-inv5' && sortedIds(await li({ due_from: today, due_to: in14 })) === 'cm-inv2,cm-inv3', '');
  check('list_invoices issued_from/issued_to', sortedIds(await li({ issued_from: shift(today, -4), issued_to: shift(today, -3) })) === 'cm-inv5', '');
  check('list_invoices refuses a malformed date, activity_from and an unknown payment_status', isErr(await li({ due_from: 'x' }), /YYYY-MM-DD/) && isErr(await li({ activity_from: 'x' }), /YYYY-MM-DD/) && isErr(await li({ payment_status: 'late' }), /payment_status/), '');
  // A payment moves the movement's updated_at, not the invoice's: it shows in last_activity_at.
  age('invoices_offers', `id IN ('cm-inv1','cm-inv3')`);
  age('financial_records', `id IN ('fr-inv-cm-inv1','fr-inv-cm-inv3')`);
  sql(`UPDATE financial_records SET status = 'paid', amount_real = 360, paid_date = '${yesterday}' WHERE id = 'fr-inv-cm-inv3'`);
  r = await li({});
  const i3 = list(r).find((i) => i.id === 'cm-inv3');
  check('a payment moves last_activity_at but not the invoice updated_at, and the invoice is now paid', i3?.payment_status === 'paid' && unix(i3.updated_at) === 1590998400 && unix(i3.last_activity_at) > unix('2026-01-01T00:00:00Z'), JSON.stringify(i3));
  check('an untouched invoice has last_activity_at = updated_at', unix(list(r).find((i) => i.id === 'cm-inv1').last_activity_at) === 1590998400, '');
  check('list_invoices updated_from does not see the payment', !ids(await li({ updated_from: '2021-01-01' })).includes('cm-inv3') && !ids(await li({ updated_from: '2021-01-01' })).includes('cm-inv1'), ids(await li({ updated_from: '2021-01-01' })));
  check('list_invoices activity_from sees the payment, not the untouched invoice', ids(await li({ activity_from: '2021-01-01' })).includes('cm-inv3') && !ids(await li({ activity_from: '2021-01-01' })).includes('cm-inv1'), ids(await li({ activity_from: '2021-01-01' })));
  check('list_invoices activity_to is exclusive with a time', Array.isArray(await li({ activity_to: '2020-06-01 10:00' })) && ids(await li({ activity_to: '2020-06-01 10:00' })) === '' && ids(await li({ activity_to: '2020-06-01' })) === 'cm-inv1', ids(await li({ activity_to: '2020-06-01' })));
  check('list_invoices sort_by=last_activity_at puts the untouched invoice last', list(await li({ sort_by: 'last_activity_at' })).at(-1)?.id === 'cm-inv1', ids(await li({ sort_by: 'last_activity_at' })));
  check('list_invoices: a non-admin key with invoices access sees the paid amounts too', list(await call(TOKENS.editor, 'list_invoices', { search: 'CMProbe' })).find((i) => i.id === 'cm-inv2')?.paid === 240, JSON.stringify(await call(TOKENS.editor, 'list_invoices', { search: 'CMProbe' })).slice(0, 200));
  const gi = await call(A, 'get_invoice', { id: 'cm-inv3' });
  check('get_invoice: payment state, ISO moments, last_activity_at, items', gi.payment_status === 'paid' && gi.paid === 360 && gi.open === 0 && gi.paid_date === yesterday && unix(gi.updated_at) === 1590998400 && isoRe.test(gi.created_at) && unix(gi.last_activity_at) > 1590998400 && Array.isArray(gi.items), JSON.stringify(gi).slice(0, 400));
  check('get_invoice: derived overdue and status_changed_at', (await call(A, 'get_invoice', { id: 'cm-inv1' })).payment_status === 'overdue' && (await call(A, 'get_invoice', { id: 'cm-inv1' })).status_changed_at === '2026-11-01', '');
  check('get_client_invoices says whether it was truncated', (await call(A, 'get_client_invoices', { identifier: 'Villatesta' })).truncated === false, '');

  // ---- expenses
  const ex = (n, issue, due, status = 'pending') => `('cm-ex${n}','expense','expense','CMProbe expense ${n}',${n * 10},0,'EUR','${status}','${issue}',${due ? `'${due}'` : 'NULL'})`;
  sql(`DELETE FROM financial_records WHERE id LIKE 'cm-ex%';
       INSERT INTO financial_records (id,type,subtype,title,amount_planned,amount_real,currency,status,issue_date,due_date) VALUES
         ${ex(1, shift(today, -10), shift(today, -5))}, ${ex(2, shift(today, -2), in5)}, ${ex(3, shift(today, -2), null)};`);
  const le = (a) => call(A, 'list_expenses', { search: 'CMProbe expense', ...a });
  r = await le({});
  check('list_expenses returns created_at and updated_at as ISO moments', list(r).length === 3 && list(r).every((e) => isoRe.test(e.created_at) && isoRe.test(e.updated_at)), JSON.stringify(list(r)[0]));
  check('list_expenses start_date/end_date still filter the issue date', sortedIds(await le({ start_date: shift(today, -3) })) === 'cm-ex2,cm-ex3' && sortedIds(await le({ end_date: shift(today, -5) })) === 'cm-ex1', '');
  check('list_expenses validates its dates', isErr(await le({ start_date: 'last week' }), /YYYY-MM-DD/) && isErr(await le({ end_date: '2026-13-45' }), /YYYY-MM-DD/), '');
  check('list_expenses due_from/due_to', sortedIds(await le({ due_to: shift(today, -1) })) === 'cm-ex1' && sortedIds(await le({ due_from: today })) === 'cm-ex2', '');
  age('financial_records', `id = 'cm-ex1'`);
  check('list_expenses updated_from leaves out an expense last changed before it', !ids(await le({ updated_from: '2021-01-01' })).includes('cm-ex1') && ids(await le({ updated_from: '2021-01-01' })).includes('cm-ex2'), '');
  check('list_expenses offset pages (ties broken by id)', ids(await le({ limit: 1, offset: 0 })) !== ids(await le({ limit: 1, offset: 1 })) && list(await le({ limit: 2, offset: 2 })).length === 1, '');

  // ---- ledger movements: derived overdue, due / paid / issue ranges, updated_at
  const mv = (n, type, status, planned, real, issue, due, paid) => `('cm-mv${n}','${type}','invoice','CMProbe mv ${n}',${planned},${real},'EUR','${status}','${issue}',${due ? `'${due}'` : 'NULL'},${paid ? `'${paid}'` : 'NULL'})`;
  const d9 = shift(today, -9), d3 = shift(today, -3);
  sql(`DELETE FROM financial_records WHERE id LIKE 'cm-mv%' OR id = 'cm-rec1';
       INSERT INTO financial_records (id,type,subtype,title,amount_planned,amount_real,currency,status,issue_date,due_date,paid_date) VALUES
         ${mv(1, 'income', 'pending', 100, 0, shift(today, -10), d3)},
         ${mv(2, 'expense', 'overdue', 40, 0, d9, in10)},
         ${mv(3, 'income', 'pending', 30, 0, d9, in5)},
         ${mv(4, 'income', 'paid', 60, 60, d9, shift(today, -8), yesterday)},
         ${mv(5, 'income', 'planned', 25, 0, d9, d3)},
         ${mv(6, 'income', 'partially_paid', 100, 100, d9, d3)},
         ${mv(7, 'income', 'partially_paid', 200, 50, d9, shift(today, -2))},
         ${mv(8, 'income', 'pending', 11, 0, d9, today)};
       INSERT INTO financial_records (id,type,subtype,title,amount_planned,amount_real,currency,status,issue_date,is_recurring,recurring_frequency,recurring_config_json,recurring_start_date,recurring_amount_history_json) VALUES
         ('cm-rec1','expense','overhead','CMProbe rule',20,0,'EUR','planned','2026-01-01',1,'monthly',${sq(JSON.stringify({ monthlyType: 'day_of_month', dayOfMonth: 1 }))},'2026-01-01',${sq(JSON.stringify([{ until: '2026-03-31', amountPlanned: 10, amountReal: 10 }]))});`);
  const lm = (a) => call(A, 'list_financial_movements', { search: 'CMProbe mv', ...a });
  r = await lm({});
  check('list_financial_movements returns updated_at and created_at as ISO moments', list(r).length === 8 && list(r).every((m) => isoRe.test(m.updated_at) && isoRe.test(m.created_at)), JSON.stringify(list(r)[0]));
  check('list_financial_movements rows carry the derived payment_status', list(r).map((m) => `${m.id.replace('cm-mv', '')}:${m.payment_status}`).sort().join() === '1:overdue,2:overdue,3:unpaid,4:paid,5:planned,6:paid,7:overdue,8:unpaid', list(r).map((m) => `${m.id}:${m.payment_status}`).join());
  r = await lm({ status: 'overdue' });
  check('list_financial_movements status=overdue is derived: unpaid and past due, or flagged (not planned, not covered by payments)', sortedIds(r) === 'cm-mv1,cm-mv2,cm-mv7', sortedIds(r));
  check('list_financial_movements status=overdue agrees with the row payment_status', list(r).every((m) => m.payment_status === 'overdue'), '');
  check('list_financial_movements paid_from/paid_to: what was paid yesterday', sortedIds(await lm({ paid_from: yesterday, paid_to: yesterday })) === 'cm-mv4', '');
  check('list_financial_movements due_from/due_to', sortedIds(await lm({ due_from: d3, due_to: d3 })) === 'cm-mv1,cm-mv5,cm-mv6', '');
  check('list_financial_movements issue_from/issue_to', sortedIds(await lm({ issue_from: shift(today, -10), issue_to: shift(today, -10) })) === 'cm-mv1', '');
  check('list_financial_movements keeps from/to on the filed date', sortedIds(await lm({ from: yesterday, to: yesterday })) === 'cm-mv4', '');
  check('list_financial_movements refuses a malformed paid_from', isErr(await lm({ paid_from: 'yesterday' }), /YYYY-MM-DD/), '');
  age('financial_records', `id = 'cm-mv1'`);
  check('list_financial_movements updated_from leaves out a movement last changed before it', !ids(await lm({ updated_from: '2021-01-01' })).includes('cm-mv1') && ids(await lm({ updated_from: '2021-01-01' })).includes('cm-mv2'), '');
  check('list_financial_movements offset pages', list(await lm({ limit: 3 })).length === 3 && list(await lm({ limit: 3, offset: 6 })).length === 2, '');
  const rec = list(await call(A, 'list_recurring_movements', {})).find((x) => x.id === 'cm-rec1');
  check('list_recurring_movements returns the amount history', rec?.amount_history?.length === 1 && rec.amount_history[0].until === '2026-03-31' && rec.amount_history[0].amountPlanned === 10, JSON.stringify(rec));

  // ---- forecast: overdue block
  const fc = await call(A, 'get_cash_flow_forecast', { months: 3, include_items: true });
  const od = fc.overdue || {};
  const odItem = (id) => (od.items || []).find((i) => i.record_id === id);
  check('get_cash_flow_forecast keeps as_of and has an overdue block with totals and items', fc.as_of === today && Array.isArray(od.items) && od.truncated === false && od.totals && od.count === od.items.length, JSON.stringify(od).slice(0, 300));
  check('forecast overdue: unpaid issued movements dated before today, at the amount still open', odItem('cm-mv1')?.amount === 100 && odItem('cm-mv1')?.days_overdue === 3 && odItem('cm-mv7')?.amount === 150, JSON.stringify([odItem('cm-mv1'), odItem('cm-mv7')]));
  check('forecast overdue leaves out planned, paid, future and due-today movements', ['cm-mv3', 'cm-mv4', 'cm-mv5', 'cm-mv6', 'cm-mv8', 'cm-mv2'].every((id) => !odItem(id)), JSON.stringify((od.items || []).map((i) => i.record_id)));
  check('forecast overdue: planned movements already past are counted apart, due-today money too', od.planned_past?.count >= 1 && od.due_today?.count >= 1 && od.due_today.income >= 11, JSON.stringify([od.planned_past, od.due_today]));
  check('forecast overdue: totals net = income - expense', Math.abs(od.totals.net - (od.totals.income - od.totals.expense)) < 0.011 && od.totals.income >= 250, JSON.stringify(od.totals));
  check('forecast months still hold the future movements and not the overdue ones', (fc.items || []).some((i) => i.record_id === 'cm-mv3') && !(fc.items || []).some((i) => ['cm-mv1', 'cm-mv7', 'cm-mv5'].includes(i.record_id)), '');

  // ---- project billing summary paging; financial mode / simplified table moments
  const b1 = await call(A, 'get_project_billing_summary', { limit: 2 });
  const b2 = await call(A, 'get_project_billing_summary', { limit: 2, offset: 2 });
  const bIds = (b) => (b.projects || []).map((p) => p.project_id);
  check('get_project_billing_summary: offset pages and truncated says a next page exists', bIds(b1).length === 2 && bIds(b2).length === 2 && bIds(b1).every((id) => !bIds(b2).includes(id)) && b1.truncated === true, JSON.stringify([bIds(b1), bIds(b2), b1.truncated]));
  const setMoment = (key) => Number(cell(`SELECT FLOOR(UNIX_TIMESTAMP(updated_at)) FROM system_settings WHERE \`key\` = '${key}'`));
  const mode = await call(A, 'get_financial_mode', {});
  check('get_financial_mode returns updated_at as the stored moment', isoRe.test(mode.updated_at) && unix(mode.updated_at) === setMoment('FINANCIAL_MODE'), JSON.stringify(mode));
  const simp = await call(A, 'get_financial_simplified_table', {});
  check('get_financial_simplified_table returns updated_at as the stored moment', isoRe.test(simp.updated_at) && unix(simp.updated_at) === setMoment('FINANCIAL_SIMPLIFIED_TABLE'), JSON.stringify(simp.updated_at));

  // ---- clean up (the scratch database is dropped at the end, but later sections should not see these rows)
  sql(`SET FOREIGN_KEY_CHECKS=0;
       DELETE FROM tasks WHERE related_project_id LIKE 'cm-p%';
       DELETE FROM proj_gantt_ptparity WHERE id LIKE 'cmg%';
       DELETE FROM projects WHERE id LIKE 'cm-p%' OR id LIKE 'cm-bulk%';
       DELETE FROM invoices_offers WHERE id LIKE 'cm-inv%';
       DELETE FROM financial_records WHERE id LIKE 'fr-inv-cm-inv%' OR id LIKE 'cm-ex%' OR id LIKE 'cm-mv%' OR id = 'cm-rec1';
       SET FOREIGN_KEY_CHECKS=1;`);
}

// ---- (separator: keep these stubs apart so git merges them cleanly) ----

async function changePeopleChecks() {
  section('change visibility: employees, salaries, vacations, stock, workflows, registries');
  const A = TOKENS.admin;
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  // 1590998400 = 2020-06-01 10:00 in Europe/Bratislava (CEST), independent of the MySQL session zone.
  const AGED = 1590998400;
  const age = (table, id) => sql(`UPDATE ${table} SET updated_at = FROM_UNIXTIME(${AGED}) WHERE id = ${sq(id)}`);
  const unix = (iso) => Date.parse(iso) / 1000;
  const ids = (r) => (Array.isArray(r) ? r.map((x) => x.id).join() : JSON.stringify(r).slice(0, 200));
  const shift = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  // "Today" as the app sees it (PHP zone), not this machine's.
  const today = (await call(A, 'get_vacation_balance', { employee_id: 'pe-2' })).on_date;
  check('get_vacation_balance names the day it answers for', /^\d{4}-\d{2}-\d{2}$/.test(today || ''), String(today));

  // ---- employees: ISO moments, updated_from, offset
  age('employees', 'pe-2');
  sql(`UPDATE employees SET position = position WHERE id = 'pe-1'`);
  const emp1 = (await call(A, 'list_employees', { search: 'Probe' })).find?.((e) => e.id === 'pe-1');
  const empDbUnix = Number(cell(`SELECT FLOOR(UNIX_TIMESTAMP(updated_at)) FROM employees WHERE id = 'pe-1'`));
  check('list_employees returns created_at and updated_at as ISO moments with an offset', emp1 && isoRe.test(emp1.created_at) && isoRe.test(emp1.updated_at), JSON.stringify(emp1)?.slice(0, 200));
  check('list_employees updated_at is the moment the database holds', emp1 && unix(emp1.updated_at) === empDbUnix, `${emp1?.updated_at} vs ${empDbUnix}`);
  const empSince = async (from) => ids(await call(A, 'list_employees', { search: 'Probe', updated_from: from })).split(',');
  check('list_employees updated_from leaves out a record last changed before it', !(await empSince('2021-01-01')).includes('pe-2') && (await empSince('2021-01-01')).includes('pe-1'), '');
  check('list_employees updated_from takes a time of day', (await empSince('2020-06-01 09:59')).includes('pe-2') && !(await empSince('2020-06-01 10:01')).includes('pe-2'), '');
  const empAll = await call(A, 'list_employees', { search: 'Probe' });
  const empP1 = await call(A, 'list_employees', { search: 'Probe', limit: 1 });
  const empP2 = await call(A, 'list_employees', { search: 'Probe', limit: 1, offset: 1 });
  check('list_employees pages by offset in a stable order', empAll.length >= 2 && empP1.length === 1 && empP1[0].id === empAll[0].id && empP2[0]?.id === empAll[1].id, ids(empAll));
  check('list_employees sort_by=updated_at puts the most recent first', (await call(A, 'list_employees', { search: 'Probe', sort_by: 'updated_at' }))[0]?.id !== 'pe-2', '');
  check('list_employees refuses a malformed updated_from', isErr(await call(A, 'list_employees', { updated_from: 'yesterday' }), /YYYY-MM-DD/), '');
  const getEmp = await call(A, 'get_employee', { id: 'pe-2' });
  check('get_employee returns created_at and updated_at as ISO moments', isoRe.test(getEmp.created_at || '') && unix(getEmp.updated_at) === AGED, JSON.stringify(getEmp)?.slice(0, 200));

  // ---- salaries: ISO incl. closed_at, change window, due / payment ranges, paging
  sql(`DELETE FROM employee_salaries WHERE id IN ('cp-sal-1','cp-sal-2');
       INSERT INTO employee_salaries (id,employee_id,period_type,period_key,year,period_number,items_json,total_salary,total_paid,status,due_date,payment_date,closed_at)
       VALUES ('cp-sal-1','pe-2','monthly','2031-01',2031,1,'[]',1000,1000,'paid','2031-01-15','2031-01-14','2031-01-14 12:30:00'),
              ('cp-sal-2','pe-2','monthly','2031-02',2031,2,'[]',1000,0,'pending','2031-02-15',NULL,NULL);`);
  const sal = async (args) => call(A, 'list_salaries', { employee_id: 'pe-2', ...args });
  let r = await sal({ year: 2031 });
  check('list_salaries lists the newest period first', ids(r) === 'cp-sal-2,cp-sal-1', ids(r));
  const s1 = r.find?.((x) => x.id === 'cp-sal-1');
  check('list_salaries returns created_at and updated_at as ISO moments', s1 && isoRe.test(s1.created_at) && isoRe.test(s1.updated_at), JSON.stringify(s1)?.slice(0, 200));
  check('list_salaries closed_at is an ISO moment (the app writes local wall time)', s1?.closed_at === '2031-01-14T12:30:00+01:00', String(s1?.closed_at));
  check('list_salaries leaves closed_at null for an open month', r.find?.((x) => x.id === 'cp-sal-2')?.closed_at === null, '');
  check('list_salaries due_from / due_to', ids(await sal({ due_from: '2031-02-01' })) === 'cp-sal-2' && ids(await sal({ due_to: '2031-01-31' })) === 'cp-sal-1' && ids(await sal({ due_from: '2031-01-15', due_to: '2031-01-15' })) === 'cp-sal-1', '');
  check('list_salaries payment_from / payment_to', ids(await sal({ payment_from: '2031-01-01' })) === 'cp-sal-1' && ids(await sal({ payment_to: '2030-12-31', year: 2031 })) === '', '');
  check('list_salaries refuses a reversed due range', isErr(await sal({ due_from: '2031-03-01', due_to: '2031-01-01' }), /after/), '');
  age('employee_salaries', 'cp-sal-1');
  check('list_salaries updated_from leaves out a record last changed before it', ids(await sal({ year: 2031, updated_from: '2021-01-01' })) === 'cp-sal-2', '');
  check('list_salaries pages by offset', ids(await sal({ year: 2031, limit: 1 })) === 'cp-sal-2' && ids(await sal({ year: 2031, limit: 1, offset: 1 })) === 'cp-sal-1', '');
  const getEmpSal = (await call(A, 'get_employee', { id: 'pe-2' })).salaries?.find?.((x) => x.id === 'cp-sal-1');
  check('get_employee salaries carry ISO moments, closed_at included', getEmpSal && isoRe.test(getEmpSal.created_at) && unix(getEmpSal.updated_at) === AGED && getEmpSal.closed_at === '2031-01-14T12:30:00+01:00', JSON.stringify(getEmpSal)?.slice(0, 200));
  check('list_salaries stays closed to a role without employees.salaries', forbidden(await call(TOKENS.editor, 'list_salaries', {})), '');

  // ---- vacations: overlap range, change window, on_date, ISO
  sql(`DELETE FROM employee_vacations WHERE id IN ('cp-vac-1','cp-vac-2');
       INSERT INTO employee_vacations (id,employee_id,vacation_type_id,start_date,end_date,days_count,status)
       VALUES ('cp-vac-1','pe-2','annual','2031-03-03','2031-03-07',5,'approved'), ('cp-vac-2','pe-2','annual','2031-03-20','2031-03-21',2,'approved');`);
  const vac = async (args) => call(A, 'list_vacations', { employee_id: 'pe-2', ...args });
  r = await vac({ year: 2031 });
  check('list_vacations keeps the year filter and returns ISO moments', ids(r) === 'cp-vac-2,cp-vac-1' && isoRe.test(r[0].created_at) && isoRe.test(r[0].updated_at), JSON.stringify(r)?.slice(0, 200));
  check('list_vacations from/to finds an entry that starts before the range', ids(await vac({ from: '2031-03-05', to: '2031-03-10' })) === 'cp-vac-1', '');
  check('list_vacations from/to is inclusive at both ends', ids(await vac({ from: '2031-03-07', to: '2031-03-07' })) === 'cp-vac-1' && ids(await vac({ from: '2031-03-02', to: '2031-03-03' })) === 'cp-vac-1', '');
  check('list_vacations from/to leaves out entries wholly outside', ids(await vac({ from: '2031-03-08', to: '2031-03-19' })) === '' && ids(await vac({ to: '2031-03-02' })) === '', '');
  check('list_vacations a range with only "from" or only "to"', ids(await vac({ from: '2031-03-10' })) === 'cp-vac-2' && ids(await vac({ to: '2031-03-10' })) === 'cp-vac-1', '');
  check('list_vacations refuses a reversed range and a malformed date', isErr(await vac({ from: '2031-04-01', to: '2031-03-01' }), /after/) && isErr(await vac({ from: 'next week' }), /YYYY-MM-DD/), '');
  age('employee_vacations', 'cp-vac-1');
  check('list_vacations updated_from leaves out an entry last changed before it', ids(await vac({ updated_from: '2021-01-01' })) === 'cp-vac-2', '');
  check('list_vacations pages by offset', ids(await vac({ limit: 1 })) === 'cp-vac-2' && ids(await vac({ limit: 1, offset: 1 })) === 'cp-vac-1', '');
  const onLeave = async (d) => (await call(A, 'get_vacation_balance', { on_date: d })).on_leave?.map((e) => e.id) || [];
  check('get_vacation_balance on_date: who is on leave that day', (await onLeave('2031-03-04')).includes('pe-2') && (await onLeave('2031-03-07')).includes('pe-2') && !(await onLeave('2031-03-10')).includes('pe-2'), '');
  const balToday = await call(A, 'get_vacation_balance', { employee_id: 'pe-2' });
  check('get_vacation_balance keeps on_leave_today, answered for today', Array.isArray(balToday.on_leave_today) && balToday.on_date === today && JSON.stringify(balToday.on_leave) === JSON.stringify(balToday.on_leave_today), JSON.stringify(balToday).slice(0, 200));
  const balLater = await call(A, 'get_vacation_balance', { on_date: '2031-03-04' });
  check('get_vacation_balance on_leave_today stays about today when on_date is another day', balLater.on_date === '2031-03-04' && !balLater.on_leave_today.some((e) => e.id === 'pe-2'), JSON.stringify(balLater.on_leave_today).slice(0, 200));
  check('get_vacation_balance refuses a malformed on_date', isErr(await call(A, 'get_vacation_balance', { on_date: 'tomorrow' }), /YYYY-MM-DD/), '');
  const getEmpVac = (await call(A, 'get_employee', { id: 'pe-2' })).vacations?.find?.((x) => x.id === 'cp-vac-1');
  check('get_employee vacations carry ISO moments', getEmpVac && isoRe.test(getEmpVac.created_at) && unix(getEmpVac.updated_at) === AGED, JSON.stringify(getEmpVac)?.slice(0, 200));

  // ---- team members: ISO created_at
  const team = await call(A, 'list_team_members', { search: 'Probe', limit: 1 });
  check('list_team_members returns created_at as an ISO moment and pages', Array.isArray(team) && team.length === 1 && isoRe.test(team[0].created_at) && isoRe.test(team[0].updated_at), JSON.stringify(team).slice(0, 200));

  // ---- inventory items (warehouse_items.updated_at)
  sql(`DELETE FROM warehouse_items WHERE id = 'cp-item-2';
       INSERT INTO warehouse_items (id,sku,name,min_stock,avg_purchase_price,default_sell_price) VALUES ('cp-item-2','CP-ITEM-2','Probe item two',1,1,2);`);
  age('warehouse_items', 'pi-1');
  const itemsSince = async (from) => ids(await call(A, 'list_inventory_items', { search: 'Probe item', updated_from: from })).split(',');
  const pi1 = (await call(A, 'list_inventory_items', { search: 'Probe item' })).find?.((x) => x.id === 'pi-1');
  check('list_inventory_items returns created_at and updated_at as ISO moments', pi1 && isoRe.test(pi1.created_at) && unix(pi1.updated_at) === AGED, JSON.stringify(pi1)?.slice(0, 200));
  check('list_inventory_items updated_from leaves out an item last changed before it', !(await itemsSince('2021-01-01')).includes('pi-1') && (await itemsSince('2021-01-01')).includes('cp-item-2'), '');
  sql(`UPDATE warehouse_items SET description = 'changed by the probe' WHERE id = 'pi-1'`);
  check('editing an item moves its updated_at', (await itemsSince('2021-01-01')).includes('pi-1'), '');
  age('warehouse_items', 'pi-1');
  sql(`UPDATE warehouse_items SET description = 'changed by the probe' WHERE id = 'pi-1'`);
  check('re-saving an item with the same values leaves updated_at alone', !(await itemsSince('2021-01-01')).includes('pi-1'), '');
  sql(`UPDATE warehouse_items SET description = NULL WHERE id = 'pi-1'`);
  age('warehouse_items', 'pi-1');
  const itAll = await call(A, 'list_inventory_items', { search: 'Probe item' });
  check('list_inventory_items pages by offset in name order', itAll.length >= 2 && ids(await call(A, 'list_inventory_items', { search: 'Probe item', limit: 1 })) === itAll[0].id && ids(await call(A, 'list_inventory_items', { search: 'Probe item', limit: 1, offset: 1 })) === itAll[1].id, ids(itAll));
  const gi = await call(A, 'get_inventory_item', { id: 'pi-1' });
  check('get_inventory_item returns created_at and updated_at as ISO moments', isoRe.test(gi.created_at || '') && unix(gi.updated_at) === AGED, JSON.stringify(gi)?.slice(0, 200));

  // ---- suppliers
  sql(`DELETE FROM suppliers WHERE id IN ('cp-sup-1','cp-sup-2');
       INSERT INTO suppliers (id,name) VALUES ('cp-sup-1','Probe Supplier A'), ('cp-sup-2','Probe Supplier B');`);
  age('suppliers', 'cp-sup-1');
  const sup = async (args) => call(A, 'list_suppliers', { search: 'Probe Supplier', ...args });
  r = await sup({});
  check('list_suppliers returns created_at and updated_at as ISO moments', ids(r) === 'cp-sup-1,cp-sup-2' && unix(r[0].updated_at) === AGED && isoRe.test(r[1].created_at), JSON.stringify(r)?.slice(0, 200));
  check('list_suppliers updated_from leaves out a supplier last changed before it', ids(await sup({ updated_from: '2021-01-01' })) === 'cp-sup-2', '');
  check('list_suppliers pages by offset', ids(await sup({ limit: 1 })) === 'cp-sup-1' && ids(await sup({ limit: 1, offset: 1 })) === 'cp-sup-2', '');

  // ---- stock movements: time of day on issued_at, change window
  sql(`DELETE FROM warehouse_movements WHERE id IN ('cp-mov-1','cp-mov-2');
       INSERT INTO warehouse_movements (id,document_number,type,status,warehouse_id,created_by,issued_at)
       VALUES ('cp-mov-1','CP-MOV-1','inward','confirmed','pw-1','probe','2031-04-10 14:30:00'), ('cp-mov-2','CP-MOV-2','inward','confirmed','pw-1','probe','2031-04-10 09:00:00');`);
  const mov = async (args) => call(A, 'list_stock_movements', { warehouse_id: 'pw-1', ...args });
  r = await mov({ from: '2031-04-10', to: '2031-04-10' });
  check('list_stock_movements whole-day from/to still covers the day, latest first', ids(r) === 'cp-mov-1,cp-mov-2', ids(r));
  check('list_stock_movements from takes a time of day (inclusive)', ids(await mov({ from: '2031-04-10 12:00', to: '2031-04-11' })) === 'cp-mov-1' && ids(await mov({ from: '2031-04-10 09:00', to: '2031-04-10 09:01' })) === 'cp-mov-2', '');
  check('list_stock_movements to with a time is exclusive', ids(await mov({ from: '2031-04-10', to: '2031-04-10 14:30' })) === 'cp-mov-2', '');
  check('list_stock_movements refuses a malformed from', isErr(await mov({ from: 'yesterday' }), /YYYY-MM-DD/), '');
  check('list_stock_movements pages by offset', ids(await mov({ from: '2031-04-10', to: '2031-04-10', limit: 1, offset: 1 })) === 'cp-mov-2', '');
  check('list_stock_movements returns created_at and updated_at as ISO moments', isoRe.test(r[0]?.created_at || '') && isoRe.test(r[0]?.updated_at || ''), JSON.stringify(r[0])?.slice(0, 200));
  age('warehouse_movements', 'cp-mov-2');
  check('list_stock_movements updated_from leaves out a document last changed before it', ids(await mov({ from: '2031-04-10', to: '2031-04-10', updated_from: '2021-01-01' })) === 'cp-mov-1', '');
  check('list_stock_movements sort_by=updated_at puts the most recently changed first', ids(await mov({ from: '2031-04-10', to: '2031-04-10', sort_by: 'updated_at' })) === 'cp-mov-1,cp-mov-2', '');

  // ---- batches: expiry relative to the app's today, change window
  const days = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  sql(`DELETE FROM warehouse_batches WHERE id IN ('cp-bat-1','cp-bat-2');
       INSERT INTO warehouse_batches (id,item_id,warehouse_id,batch_number,expiration_date,initial_quantity,current_quantity)
       VALUES ('cp-bat-1','pi-1','pw-1','CP1','2031-06-01',10,10), ('cp-bat-2','pi-1','pw-1','CP2','2031-12-01',10,10);`);
  const bat = async (args) => call(A, 'list_batches', { item_id: 'pi-1', ...args });
  check('list_batches expiring_within_days counts from the app\'s today (boundary included)', ids(await bat({ expiring_within_days: days('2031-06-01') })) === 'cp-bat-1' && ids(await bat({ expiring_within_days: days('2031-06-01') - 1 })) === '', '');
  r = await bat({});
  check('list_batches returns created_at and updated_at as ISO moments', ids(r) === 'cp-bat-1,cp-bat-2' && isoRe.test(r[0].created_at) && isoRe.test(r[0].updated_at), JSON.stringify(r)?.slice(0, 200));
  age('warehouse_batches', 'cp-bat-1');
  check('list_batches updated_from leaves out a batch last changed before it', ids(await bat({ updated_from: '2021-01-01' })) === 'cp-bat-2', '');
  check('list_batches pages by offset', ids(await bat({ limit: 1 })) === 'cp-bat-1' && ids(await bat({ limit: 1, offset: 1 })) === 'cp-bat-2', '');

  // ---- categories: updated_at as ISO
  const cc = await call(A, 'list_client_categories', {});
  check('list_client_categories returns updated_at as an ISO moment', Array.isArray(cc) && cc.every((c) => isoRe.test(c.updated_at || '')), JSON.stringify(cc?.[0]));
  const fc = await call(A, 'list_financial_categories', {});
  check('list_financial_categories returns updated_at as an ISO moment', Array.isArray(fc) && fc.length > 0 && fc.every((c) => isoRe.test(c.updated_at || '')), JSON.stringify(fc?.[0]));

  // ---- workflows and runs
  sql(`DELETE FROM workflow_logs WHERE workflow_id = 'cp-wf-1'; DELETE FROM workflows WHERE id = 'cp-wf-1';
       INSERT INTO workflows (id,name,trigger_type,nodes_json,edges_json) VALUES ('cp-wf-1','Probe workflow','manual','[]','[]');
       INSERT INTO workflow_logs (id,workflow_id,status,execution_time_ms,trigger_event,execution_log_json,created_at) VALUES
         ('cp-wl-1','cp-wf-1','success',10,'manual','[]',FROM_UNIXTIME(${AGED})),
         ('cp-wl-2','cp-wf-1','failed',20,'manual','[]',FROM_UNIXTIME(${AGED})),
         ('cp-wl-3','cp-wf-1','success',5,'manual','[]',FROM_UNIXTIME(${AGED + 60}));`);
  const wf = (await call(A, 'list_workflows', {})).find?.((w) => w.id === 'cp-wf-1');
  check('list_workflows last_run is an ISO moment equal to the database moment', wf && isoRe.test(wf.last_run || '') && unix(wf.last_run) === AGED + 60 && wf.last_status === 'success', JSON.stringify(wf)?.slice(0, 200));
  check('list_workflows returns the workflow\'s own updated_at (and created_at) as ISO', wf && isoRe.test(wf.updated_at || '') && isoRe.test(wf.created_at || ''), JSON.stringify(wf)?.slice(0, 200));
  const runs = async (args) => call(A, 'get_workflow_runs', { workflow_id: 'cp-wf-1', ...args });
  r = await runs({});
  check('get_workflow_runs newest first with an id tiebreak, created_at as ISO', ids(r) === 'cp-wl-3,cp-wl-1,cp-wl-2' && unix(r[0].created_at) === AGED + 60, JSON.stringify(r)?.slice(0, 200));
  check('get_workflow_runs pages by offset', ids(await runs({ limit: 1, offset: 1 })) === 'cp-wl-1' && ids(await runs({ limit: 2, offset: 2 })) === 'cp-wl-2', '');
  check('get_workflow_runs created_from takes a time of day', ids(await runs({ created_from: '2020-06-01 10:01' })) === 'cp-wl-3', '');
  check('get_workflow_runs refuses updated_from (runs are never edited)', isErr(await runs({ updated_from: '2021-01-01' }), /not available/), '');

  // ---- custom registries: due date range / bucket, window, deterministic order
  const t = today;
  sql(`DELETE FROM unified_entries WHERE id IN ('cpreg','cpplain'); DROP TABLE IF EXISTS ue_cpreg; DROP TABLE IF EXISTS ue_cpplain;
       INSERT INTO unified_entries (id,name,icon,color,modules_json) VALUES ('cpreg','Probe registry','Folder','#000000','["title","due_date"]'), ('cpplain','Probe plain registry','Folder','#000000','["title"]');
       CREATE TABLE ue_cpreg (id VARCHAR(50) NOT NULL PRIMARY KEY, parent_id VARCHAR(50) NULL, is_folder TINYINT(1) NOT NULL DEFAULT 0,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         title VARCHAR(255) NULL, due_date DATE NULL, warning_days INT NOT NULL DEFAULT 0);
       CREATE TABLE ue_cpplain (id VARCHAR(50) NOT NULL PRIMARY KEY, parent_id VARCHAR(50) NULL, is_folder TINYINT(1) NOT NULL DEFAULT 0,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, title VARCHAR(255) NULL);
       INSERT INTO ue_cpreg (id,title,due_date) VALUES ('cp-r1','Overdue',${sq(shift(t, -3))}), ('cp-r2','Today',${sq(t)}), ('cp-r3','Tomorrow',${sq(shift(t, 1))}), ('cp-r4','Later',${sq(shift(t, 10))}), ('cp-r5','No date',NULL);
       INSERT INTO ue_cpplain (id,title) VALUES ('cp-p1','One'), ('cp-p2','Two');`);
  const reg = async (args) => call(A, 'get_unified_entry_rows', { registry_id: 'cpreg', ...args });
  check('get_unified_entry_rows bucket=overdue / today / tomorrow / upcoming', ids(await reg({ bucket: 'overdue' })) === 'cp-r1' && ids(await reg({ bucket: 'today' })) === 'cp-r2' && ids(await reg({ bucket: 'tomorrow' })) === 'cp-r3' && ids(await reg({ bucket: 'upcoming' })) === 'cp-r4', '');
  check('get_unified_entry_rows due_from / due_to is inclusive and leaves out rows without a date', ids(await reg({ due_from: t, due_to: shift(t, 1), sort_by: 'due_date' })) === 'cp-r2,cp-r3', '');
  check('get_unified_entry_rows refuses a reversed range and bucket=done', isErr(await reg({ due_from: shift(t, 5), due_to: t }), /after/) && isErr(await reg({ bucket: 'done' }), /bucket/), '');
  r = await reg({ sort_by: 'due_date', limit: 10 });
  check('get_unified_entry_rows sort_by=due_date orders the dated rows', ids(r).split(',').filter((x) => x !== 'cp-r5').join() === 'cp-r1,cp-r2,cp-r3,cp-r4', ids(r));
  check('get_unified_entry_rows has a deterministic order that pages without gaps', ids(await reg({ sort_by: 'due_date', limit: 2 })) + '|' + ids(await reg({ sort_by: 'due_date', limit: 2, offset: 2 })) + '|' + ids(await reg({ sort_by: 'due_date', limit: 2, offset: 4 })) === 'cp-r5,cp-r1|cp-r2,cp-r3|cp-r4', '');
  check('get_unified_entry_rows returns created_at and updated_at as ISO moments', r.every((x) => isoRe.test(x.created_at || '') && isoRe.test(x.updated_at || '')), JSON.stringify(r[0])?.slice(0, 200));
  age('ue_cpreg', 'cp-r1');
  check('get_unified_entry_rows updated_from leaves out a row last changed before it', !ids(await reg({ updated_from: '2021-01-01' })).split(',').includes('cp-r1') && ids(await reg({ updated_from: '2021-01-01' })).split(',').includes('cp-r2'), '');
  const plain = (args) => call(A, 'get_unified_entry_rows', { registry_id: 'cpplain', ...args });
  check('a registry without a due date lists its rows in a deterministic order', ids(await plain({})).split(',').sort().join() === 'cp-p1,cp-p2' && ids(await plain({})) === ids(await plain({})), '');
  check('a registry without a due date refuses due_from and bucket', isErr(await plain({ due_from: t }), /no due date/) && isErr(await plain({ bucket: 'overdue' }), /no due date/), '');

  // ---- tidy up what this section made
  sql(`DELETE FROM employee_salaries WHERE id IN ('cp-sal-1','cp-sal-2'); DELETE FROM employee_vacations WHERE id IN ('cp-vac-1','cp-vac-2');
       DELETE FROM warehouse_batches WHERE id IN ('cp-bat-1','cp-bat-2'); DELETE FROM warehouse_movements WHERE id IN ('cp-mov-1','cp-mov-2');
       DELETE FROM suppliers WHERE id IN ('cp-sup-1','cp-sup-2'); DELETE FROM warehouse_items WHERE id = 'cp-item-2';
       DELETE FROM workflow_logs WHERE workflow_id = 'cp-wf-1'; DELETE FROM workflows WHERE id = 'cp-wf-1';
       DELETE FROM unified_entries WHERE id IN ('cpreg','cpplain'); DROP TABLE IF EXISTS ue_cpreg; DROP TABLE IF EXISTS ue_cpplain;`);
}

// ---- (separator: keep these stubs apart so git merges them cleanly) ----

async function changeSyncChecks() {
  section('change visibility: child bumps, activity, deletions');
  const A = TOKENS.admin;
  const AGED = 1590998400;
  const age = (table, id) => sql(`UPDATE ${table} SET updated_at = FROM_UNIXTIME(${AGED}) WHERE id = ${sq(id)}`);
  const stampOf = (table, id) => Number(cell(`SELECT UNIX_TIMESTAMP(updated_at) FROM ${table} WHERE id = ${sq(id)}`));

  // ---- create_milestone: the blocking milestone task is part of the project (the sync.php child bumps
  // - managers, Gantt rows, line items, action items, movement lines - need a push through sync.php and
  // are checked in scripts/probe-persistence.mjs, changeVisibilityChecks()).
  const typeId = cell(`SELECT id FROM project_types LIMIT 1`);
  sql(`DELETE FROM projects WHERE id = 'ds-proj'; INSERT INTO projects (id,project_type_id,name,status) VALUES ('ds-proj',${sq(typeId)},'Sync visibility probe','active');`);
  age('projects', 'ds-proj');
  check('probe fixture: the project starts aged', stampOf('projects', 'ds-proj') === AGED, String(stampOf('projects', 'ds-proj')));
  const ms = await call(A, 'create_milestone', { project_id: 'ds-proj', title: 'Probe go-live', deadline: '2031-05-01' });
  check('create_milestone moves the project\'s updated_at', !ms.__error && stampOf('projects', 'ds-proj') > AGED + 3600, JSON.stringify(ms) + ' ts=' + stampOf('projects', 'ds-proj'));
  sql(`DELETE FROM tasks WHERE related_project_id = 'ds-proj'; DELETE FROM projects WHERE id = 'ds-proj';`);

  // ---- list_deleted_records. The MCP never deletes (the source check above), so the tombstones are written
  // here the way sync.php writes them; the delete paths themselves are checked in probe-persistence.mjs.
  const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  const unix = (iso) => Date.parse(iso) / 1000;
  const at = (k) => AGED + 60 * k;
  const utc = (k) => new Date(at(k) * 1000).toISOString().slice(0, 19) + 'Z';
  sql(`DELETE FROM deleted_records WHERE entity_id LIKE 'ds-%';
       INSERT INTO deleted_records (entity, entity_id, label, deleted_by, extra, deleted_at) VALUES
         ('leads', 'ds-l1', 'Lead one', 'Probe Admin', '{"client":false}', FROM_UNIXTIME(${at(0)})),
         ('leads', 'ds-c1', 'Client one', 'Probe Admin', '{"client":true}', FROM_UNIXTIME(${at(1)})),
         ('projects', 'ds-p1', 'Project one', 'Probe Admin', NULL, FROM_UNIXTIME(${at(2)})),
         ('tasks', 'ds-t1', 'Task one', NULL, NULL, FROM_UNIXTIME(${at(3)})),
         ('employee_salaries', 'ds-s1', '2020-05', 'Probe Admin', NULL, FROM_UNIXTIME(${at(4)}));`);
  const window = { deleted_from: utc(0), deleted_to: utc(10) }; // isolates the five rows above from any real tombstone
  const list = (token, args = {}) => call(token, 'list_deleted_records', { ...window, ...args });
  const dsIds = (r) => (Array.isArray(r) ? r.filter((x) => String(x.entity_id).startsWith('ds-')).map((x) => x.entity_id).join() : JSON.stringify(r).slice(0, 200));

  let r = await list(A);
  check('list_deleted_records: oldest first, one row per tombstone', dsIds(r) === 'ds-l1,ds-c1,ds-p1,ds-t1,ds-s1', dsIds(r));
  const lead = r.find?.((x) => x.entity_id === 'ds-l1');
  check('list_deleted_records: entity, label, deleted_by and deleted_at as an ISO moment', lead?.entity === 'leads' && lead.label === 'Lead one' && lead.deleted_by === 'Probe Admin' && isoRe.test(lead.deleted_at || '') && unix(lead.deleted_at) === at(0), JSON.stringify(lead));
  check('list_deleted_records: a client record is reported as clients, a lead as leads', r.find?.((x) => x.entity_id === 'ds-c1')?.entity === 'clients' && lead?.entity === 'leads', JSON.stringify(r.slice?.(0, 2)));
  check('list_deleted_records: no raw TIMESTAMP and no tombstone internals leave the server', r.every?.((x) => !('extra' in x) && !('deleted_at__ts' in x) && Object.keys(x).sort().join() === 'deleted_at,deleted_by,entity,entity_id,label'), JSON.stringify(r[0]));
  check('list_deleted_records: entity=clients returns only client records, entity=leads only leads', dsIds(await list(A, { entity: 'clients' })) === 'ds-c1' && dsIds(await list(A, { entity: 'leads' })) === 'ds-l1', '');
  check('list_deleted_records: entity=projects', dsIds(await list(A, { entity: 'projects' })) === 'ds-p1', '');
  check('list_deleted_records: deleted_from is inclusive, deleted_to exclusive', dsIds(await call(A, 'list_deleted_records', { deleted_from: utc(2), deleted_to: utc(10) })) === 'ds-p1,ds-t1,ds-s1' && dsIds(await call(A, 'list_deleted_records', { deleted_from: utc(0), deleted_to: utc(2) })) === 'ds-l1,ds-c1', '');
  check('list_deleted_records: sort_order=desc reverses it', dsIds(await list(A, { sort_order: 'desc' })) === 'ds-s1,ds-t1,ds-p1,ds-c1,ds-l1', '');
  check('list_deleted_records: limit + offset page without gaps', dsIds(await list(A, { limit: 2 })) + '|' + dsIds(await list(A, { limit: 2, offset: 2 })) + '|' + dsIds(await list(A, { limit: 2, offset: 4 })) === 'ds-l1,ds-c1|ds-p1,ds-t1|ds-s1', '');
  check('list_deleted_records: a malformed deleted_from or deleted_to is refused', isErr(await call(A, 'list_deleted_records', { deleted_from: 'yesterday' }), /deleted_from/) && isErr(await call(A, 'list_deleted_records', { deleted_to: '2020-13-45' }), /deleted_to/), '');
  check('list_deleted_records: an unknown entity is refused', isErr(await call(A, 'list_deleted_records', { entity: 'users' }), /entity/), '');

  // Permissions: a row is visible only when the key may view that record's module.
  const rbac = JSON.parse(cell("SELECT `value` FROM system_settings WHERE `key` = 'ROLES_RBAC'"));
  const only = (name, ...modules) => { const x = role(name, 'nothing'); for (const m of modules) x.permissions[m] = 'view'; return x; };
  const extra = [only('ProbeLeadsOnly', 'leads'), only('ProbeClientsOnly', 'clients'), only('ProbeProjectsOnly', 'projects')];
  sql(`REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('ROLES_RBAC', ${sq(JSON.stringify([...rbac.filter((x) => !extra.some((e) => e.name === x.name)), ...extra]))});`);
  const limited = {};
  for (const [k, name] of [['leadsOnly', 'ProbeLeadsOnly'], ['clientsOnly', 'ProbeClientsOnly'], ['projectsOnly', 'ProbeProjectsOnly']]) {
    const id = `probe-${k}`;
    limited[k] = `ccrm_mcp_probe_${k}_${'0'.repeat(40)}`;
    sql(`DELETE FROM mcp_keys WHERE id = ${sq('pk-' + k)}; DELETE FROM users WHERE id = ${sq(id)} OR email = ${sq(id + '@probe.test')};
         INSERT INTO users (id,name,email,password_hash,role) VALUES (${sq(id)},${sq('Probe ' + k)},${sq(id + '@probe.test')},'x',${sq(name)});
         INSERT INTO mcp_keys (id,user_id,key_hash,key_prefix,name,created_at) VALUES (${sq('pk-' + k)},${sq(id)},${sq(createHash('sha256').update(limited[k]).digest('hex'))},'ccrm_mcp_p...','probe',NOW() - INTERVAL 1 DAY);`);
  }
  check('list_deleted_records: a leads-only key sees lead deletions only (no client, project, task or salary)', dsIds(await list(limited.leadsOnly)) === 'ds-l1', dsIds(await list(limited.leadsOnly)));
  check('list_deleted_records: a clients-only key sees client deletions only', dsIds(await list(limited.clientsOnly)) === 'ds-c1', dsIds(await list(limited.clientsOnly)));
  check('list_deleted_records: a projects-only key sees project deletions only', dsIds(await list(limited.projectsOnly)) === 'ds-p1', dsIds(await list(limited.projectsOnly)));
  check('list_deleted_records: entity=projects is empty for a leads-only key', dsIds(await list(limited.leadsOnly, { entity: 'projects' })) === '', dsIds(await list(limited.leadsOnly, { entity: 'projects' })));
  check('list_deleted_records: pages stay full for a limited key (the filter runs in SQL)', dsIds(await list(limited.leadsOnly, { limit: 1 })) === 'ds-l1', '');
  r = await list(TOKENS.editor);
  check('list_deleted_records: without tasks.view_all or employees.salaries the task and salary deletions stay hidden', dsIds(r) === 'ds-l1,ds-c1,ds-p1', dsIds(r));
  check('list_deleted_records: the nothing-role is refused (-32003)', forbidden(await list(TOKENS.none)), '');
  check('list_deleted_records is listed for a key that can view leads, not for the nothing-role', (await listTools(limited.leadsOnly)).includes('list_deleted_records') && !(await listTools(TOKENS.none)).includes('list_deleted_records'), '');
  sql(`DELETE FROM deleted_records WHERE entity_id LIKE 'ds-%'; DELETE FROM mcp_keys WHERE id LIKE 'pk-%Only'; DELETE FROM users WHERE id LIKE 'probe-%Only';`);
}

// Review fixes of the change-visibility work: one overdue rule (flagged, or due date else issue date, before
// today), documents with no ledger movement are not receivables, list_clients created_at ascends, undated last.
async function changeReviewFixChecks() {
  section('change visibility review fixes: overdue rule, no-movement documents, client order, undated last');
  const A = TOKENS.admin;
  const today = (await call(A, 'get_financial_overview', { year: 2026 })).as_of;   // the app's date, not this machine's
  const shift = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const [yesterday, in5, in10] = [-1, 5, 10].map((n) => shift(today, n));
  const list = (r) => (Array.isArray(r) ? r : []);
  const ids = (rs) => list(rs).map((r) => r.id).join();
  const sortedIds = (rs) => list(rs).map((r) => r.id).sort().join();
  const cleanup = () => sql(`SET FOREIGN_KEY_CHECKS=0;
       DELETE FROM invoices_offers WHERE id LIKE 'rv-inv%';
       DELETE FROM financial_records WHERE id LIKE 'rv-mv%' OR id LIKE 'fr-inv-rv-inv%';
       DELETE FROM leads WHERE id LIKE 'client-rv-%';
       SET FOREIGN_KEY_CHECKS=1;`);
  cleanup();

  // ---- seed. Movements: 1 pending, no due date, issued 5 days ago (overdue by its issue date);
  // 2 flagged overdue, issued today, no due date (overdue by the flag, but not dated before today);
  // 3 pending, due in 5 days.
  const mv = (n, status, issue, due) => `('rv-mv${n}','income','invoice','RVProbe mv ${n}',70,0,'EUR','${status}','${issue}',${due ? `'${due}'` : 'NULL'})`;
  // Invoices: 1 rejected, 2 proforma, both with a due date in the past and no ledger movement (no receivable);
  // 3 live invoice, no due date, issued 3 days ago, movement missing (kept as pending: overdue by its issue date);
  // 4 live invoice due in 10 days with its movement.
  const inv = (n, o) => `('rv-inv${n}','RVP-${n}','${o.type}','rv-lead','rv-client','RVProbe Client','Inv ${n}','Inv ${n}',100,20,120,'${o.status}','${o.issued}',${o.due ? `'${o.due}'` : 'NULL'})`;
  sql(`SET FOREIGN_KEY_CHECKS=0;
       INSERT INTO financial_records (id,type,subtype,title,amount_planned,amount_real,currency,status,issue_date,due_date) VALUES
         ${mv(1, 'pending', shift(today, -5), null)}, ${mv(2, 'overdue', today, null)}, ${mv(3, 'pending', today, in5)};
       INSERT INTO invoices_offers (id,document_number,type,lead_id,client_id,client_name,title,subject,subtotal,vat_amount,total_price,status,issued_at,due_date) VALUES
         ${inv(1, { type: 'invoice', status: 'rejected', issued: shift(today, -5), due: yesterday })},
         ${inv(2, { type: 'proforma', status: 'sent', issued: shift(today, -5), due: yesterday })},
         ${inv(3, { type: 'invoice', status: 'sent', issued: shift(today, -3), due: null })},
         ${inv(4, { type: 'invoice', status: 'sent', issued: shift(today, -1), due: in10 })};
       INSERT INTO financial_records (id,type,subtype,title,amount_planned,amount_real,currency,status,issue_date,due_date,invoice_number) VALUES
         ('fr-inv-rv-inv4','income','invoice','Inv 4',120,0,'EUR','pending','${shift(today, -1)}','${in10}','RVP-4');
       INSERT INTO leads (id,name,owner,status,created_at,archived,adjustment) VALUES
         ('client-rv-1','RVProbe C','Probe Admin','accepted','2020-01-01',0,0), ('client-rv-2','RVProbe A','Probe Admin','accepted','2020-01-02',0,0),
         ('client-rv-3','RVProbe B','Probe Admin','accepted','2020-01-03',0,0);
       SET FOREIGN_KEY_CHECKS=1;`);

  // ---- 1. one overdue rule
  const lm = (a) => call(A, 'list_financial_movements', { search: 'RVProbe mv', limit: 100, ...a });
  let r = await lm({});
  const row = (n) => list(r).find((m) => m.id === `rv-mv${n}`);
  check('overdue rule: a pending movement with no due date and an old issue date has payment_status overdue', row(1)?.payment_status === 'overdue', JSON.stringify(row(1)));
  check('overdue rule: a flagged movement dated today is overdue, an unflagged one due in 5 days is not', row(2)?.payment_status === 'overdue' && row(3)?.payment_status === 'unpaid', JSON.stringify([row(2), row(3)]));
  r = await lm({ status: 'overdue' });
  check('overdue rule: list_financial_movements status=overdue lists the issue-date one and the flagged one, agreeing with payment_status', sortedIds(r) === 'rv-mv1,rv-mv2' && list(r).every((m) => m.payment_status === 'overdue'), sortedIds(r));
  const fc = await call(A, 'get_cash_flow_forecast', { months: 3, include_items: true });
  const odItem = (id) => (fc.overdue?.items || []).find((i) => i.record_id === id);
  check('overdue rule: the forecast overdue block holds the issue-date one with its age', odItem('rv-mv1')?.amount === 70 && odItem('rv-mv1')?.days_overdue === 5 && odItem('rv-mv1')?.due_date === null, JSON.stringify(odItem('rv-mv1')));
  check('overdue rule: the forecast block leaves out a flagged movement dated today and one due later (months unchanged)', !odItem('rv-mv2') && !odItem('rv-mv3') && (fc.items || []).some((i) => i.record_id === 'rv-mv3') && !(fc.items || []).some((i) => i.record_id === 'rv-mv1'), JSON.stringify((fc.overdue?.items || []).map((i) => i.record_id)));
  check('overdue rule: the forecast basis no longer claims flagged rows', typeof fc.overdue?.basis === 'string' && !/\(pending, partially paid, flagged overdue\)/.test(fc.overdue.basis) && /due date, else issue date/.test(fc.overdue.basis), fc.overdue?.basis);

  // ---- 2. documents with no ledger movement are not receivables
  const li = (a) => call(A, 'list_invoices', { search: 'RVProbe', limit: 100, ...a });
  r = await li({});
  const doc = (n) => list(r).find((d) => d.id === `rv-inv${n}`);
  check('no movement: a rejected invoice has payment_status null, paid 0 and open 0', doc(1)?.payment_status === null && doc(1)?.paid === 0 && doc(1)?.open === 0, JSON.stringify(doc(1)));
  check('no movement: a proforma has payment_status null, paid 0 and open 0', doc(2)?.payment_status === null && doc(2)?.paid === 0 && doc(2)?.open === 0, JSON.stringify(doc(2)));
  check('no movement: a live invoice whose movement is missing keeps pending, open = total (overdue by its issue date)', doc(3)?.payment_status === 'overdue' && doc(3)?.open === 120 && doc(4)?.payment_status === 'unpaid' && doc(4)?.open === 120, JSON.stringify([doc(3), doc(4)]));
  r = await li({ payment_status: 'overdue' });
  check('no movement: payment_status=overdue returns neither the rejected invoice nor the proforma', sortedIds(r) === 'rv-inv3', sortedIds(r));
  const gi = await call(A, 'get_invoice', { id: 'rv-inv1' });
  check('no movement: get_invoice of the rejected invoice says the same', gi.payment_status === null && gi.open === 0 && gi.paid === 0, JSON.stringify([gi.payment_status, gi.open, gi.paid]));

  // ---- 3. list_clients created_at ascends by default (oldest first); updated_at stays newest first
  const cl = async (a) => ids(await call(A, 'list_clients', { search: 'RVProbe', limit: 100, ...a }));
  check('list_clients: sort_by=created_at is ascending by default (oldest first)', (await cl({ sort_by: 'created_at' })) === 'client-rv-1,client-rv-2,client-rv-3', await cl({ sort_by: 'created_at' }));
  check('list_clients: sort_by=created_at with sort_order=desc is newest first', (await cl({ sort_by: 'created_at', sort_order: 'desc' })) === 'client-rv-3,client-rv-2,client-rv-1', await cl({ sort_by: 'created_at', sort_order: 'desc' }));
  check('list_clients: the default order is still by name', (await cl({})) === 'client-rv-2,client-rv-3,client-rv-1', await cl({}));

  // ---- 4. undated rows sort last in both directions
  check('list_invoices sort_by=due_date sort_order=desc puts the undated invoice last', ids(await li({ sort_by: 'due_date', sort_order: 'desc' })) === 'rv-inv4,rv-inv1,rv-inv2,rv-inv3', ids(await li({ sort_by: 'due_date', sort_order: 'desc' })));
  check('list_invoices sort_by=due_date ascending still puts the undated invoice last', ids(await li({ sort_by: 'due_date' })) === 'rv-inv1,rv-inv2,rv-inv4,rv-inv3', ids(await li({ sort_by: 'due_date' })));
  check('list_financial_movements sort_by=due_date sort_order=desc puts undated movements last', ids(await lm({ sort_by: 'due_date', sort_order: 'desc' })) === 'rv-mv3,rv-mv1,rv-mv2', ids(await lm({ sort_by: 'due_date', sort_order: 'desc' })));

  cleanup();
}

// ----------------------------------------------------------------------------- main
try {
  setup();
  await authorizationChecks();
  await employeeIdentityChecks();
  await parityChecks();
  await writeChecks();
  await intelChecks();
  await changeCrmChecks();
  await changeMoneyChecks();
  await changePeopleChecks();
  await changeSyncChecks();
  await changeReviewFixChecks();
} catch (e) {
  failures++;
  console.log('\nPROBE ERROR: ' + (e && e.stack ? e.stack : e));
} finally {
  teardown();
}
console.log(`\n${failures ? 'FAILED' : 'OK'}: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
