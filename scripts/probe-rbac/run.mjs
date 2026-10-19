#!/usr/bin/env node
/**
 * Server probe for Role-Based Access Control (RBAC) in CCRM.
 *
 * Runs against a cloned scratch database and scratch web directory in Docker:
 * - Never touches real dev data.
 * - Authenticates via api/login.php to obtain real session cookies.
 * - Asserts data isolation in sync.php GET and POST, employee endpoints, file access.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  USERS,
  TK,
  EMPLOYEE_A,
  EMPLOYEE_B,
  PRIVATE_KEY_A,
  PRIVATE_KEY_B,
  LEGACY_FILE,
  PDF_BYTES,
  FAKE_TOGGL_TOKEN,
  FAKE_CLOCKIFY_KEY,
  fixtureSql,
} from './fixture.mjs';

const WEB = process.env.CCRM_PROBE_WEB_CONTAINER || 'crm';
const DB = process.env.CCRM_PROBE_DB_CONTAINER || 'ccrm-db-1';
const ROOT_PW = process.env.CCRM_PROBE_DB_ROOT_PASSWORD || 'ccrm_root_password';
const DEV_DB = process.env.CCRM_PROBE_DEV_DB || 'ccrm';
const BASE = (process.env.CCRM_PROBE_URL || 'http://127.0.0.1:8085').replace(/\/$/, '');
const SCRATCH_DB = 'ccrm_rbac_probe';
const SCRATCH_DIR = '/var/www/html/rbacprobe';

const root = fileURLToPath(new URL('../../', import.meta.url));
const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
// R7 compares Admin / Project Manager against the last sync.php that did no read filtering (the parent of the commit that added it).
const BASELINE_REF = process.env.CCRM_PROBE_BASELINE_REF || '3c5b20b~1';
const BASE_DIR = '/var/www/html/rbacprobe_base';

const run = (cmd, args, input) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
const docker = (...args) => run('docker', args);

const sql = (q, db = SCRATCH_DB) => {
  try {
    return docker('exec', '-i', DB, 'mysql', '-uroot', `-p${ROOT_PW}`, '--default-character-set=utf8mb4', '--batch', '--raw', db, '-e', q);
  } catch (e) {
    const msg = String(e.stderr || e.message)
      .split('\n')
      .filter((l) => !l.includes('Using a password'))
      .slice(0, 2)
      .join(' | ');
    throw new Error('SQL failed: ' + msg);
  }
};

let failures = 0, passes = 0;
const check = (name, ok, detail = '') => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + String(detail).slice(0, 300)}`);
};
const section = (t) => console.log(`\n== ${t}`);

// ----------------------------------------------------------------------------- setup / teardown
function setup() {
  for (const c of [WEB, DB]) {
    let running = 'false';
    try {
      running = docker('inspect', '-f', '{{.State.Running}}', c).trim();
    } catch {}
    if (running !== 'true') throw new Error(`Container "${c}" is not running.`);
  }

  sql(`DROP DATABASE IF EXISTS ${SCRATCH_DB}; CREATE DATABASE ${SCRATCH_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON ${SCRATCH_DB}.* TO 'ccrm_user'@'%';`, 'mysql');
  const dump = run('docker', ['exec', DB, 'mysqldump', '-uroot', `-p${ROOT_PW}`, '--single-transaction', '--no-tablespaces', DEV_DB]);
  run('docker', ['exec', '-i', DB, 'mysql', '-uroot', `-p${ROOT_PW}`, SCRATCH_DB], dump);

  docker('exec', WEB, 'sh', '-c', `rm -rf ${SCRATCH_DIR} ${BASE_DIR} && mkdir -p ${SCRATCH_DIR} ${BASE_DIR}`);
  docker('cp', publicDir + '.', `${WEB}:${SCRATCH_DIR}/`);
  docker('cp', publicDir + '.', `${WEB}:${BASE_DIR}/`);
  // The baseline copy serves the pre-read-filtering sync.php so R7 is a real before/after.
  const oldSync = run('git', ['-C', root, 'show', `${BASELINE_REF}:public/sync.php`]);
  for (const dir of [SCRATCH_DIR, BASE_DIR]) {
    docker('exec', WEB, 'sh', '-c', `sed "s/define('DB_NAME', '[^']*')/define('DB_NAME', '${SCRATCH_DB}')/" /var/www/html/config.php > ${dir}/config.php`);
  }
  run('docker', ['exec', '-i', WEB, 'sh', '-c', `cat > ${BASE_DIR}/sync.php`], oldSync);
  // CCRM_PROBE_AGAINST_BASELINE=1 serves the OLD sync.php as the system under test, to watch
  // the read/write checks fail first (the checks must be able to fail to mean anything).
  if (process.env.CCRM_PROBE_AGAINST_BASELINE) {
    run('docker', ['exec', '-i', WEB, 'sh', '-c', `cat > ${SCRATCH_DIR}/sync.php`], oldSync);
  }
  docker('exec', WEB, 'chown', '-R', 'www-data:www-data', SCRATCH_DIR, BASE_DIR);

  // The dev database may predate Mango: bring the scratch copy up to date so the orders and
  // ticket tables exist before the fixture seeds them.
  docker('exec', '-u', 'www-data', WEB, 'php', '-r',
    `require '${SCRATCH_DIR}/config.php'; require '${SCRATCH_DIR}/api/schema.php'; $pdo = function_exists('get_db_connection') ? get_db_connection() : null; ccrm_migrate_orders($pdo); ccrm_migrate_tickets($pdo); ccrm_apply_migrations($pdo);`);

  // Through stdin: the seed outgrew the Windows command-line limit once the role registry grew.
  run('docker', ['exec', '-i', DB, 'mysql', '-uroot', `-p${ROOT_PW}`, '--default-character-set=utf8mb4', SCRATCH_DB], fixtureSql());

  // Documents on disk: two private ones (already in their final form) and one legacy
  // contract in the PUBLIC uploads directory that the migration has to move.
  docker('exec', '-u', 'www-data', WEB, 'php', '-r', `require '${SCRATCH_DIR}/api/employee_files.php'; ccrm_employee_private_dir();`);
  const writeAs = (path, content) => run('docker', ['exec', '-i', '-u', 'www-data', WEB, 'sh', '-c', `cat > ${path}`], content);
  writeAs(`${SCRATCH_DIR}/uploads/${PRIVATE_KEY_A}`, PDF_BYTES);
  writeAs(`${SCRATCH_DIR}/uploads/${PRIVATE_KEY_B}`, PDF_BYTES);
  writeAs(`${SCRATCH_DIR}/uploads/${LEGACY_FILE.replace(/^uploads\//, '')}`, PDF_BYTES);
}

function teardown() {
  if (process.env.CCRM_PROBE_KEEP) return;
  try { sql(`DROP DATABASE IF EXISTS ${SCRATCH_DB};`, 'mysql'); } catch {}
  try { docker('exec', WEB, 'sh', '-c', `rm -rf ${SCRATCH_DIR} ${BASE_DIR}`); } catch {}
}

const SESSIONS = {};

async function loginUser(email, password = 'x') {
  const res = await fetch(`${BASE}/rbacprobe/api/login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) {
    const text = await res.text();
    throw new Error(`Login failed for ${email} (${res.status}): ${text}`);
  }
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  let sessId = '';
  for (const c of cookies) {
    const m = c.match(/CCRMSESSID=([^;]+)/);
    if (m) { sessId = m[1]; }
  }
  if (!sessId) throw new Error(`No CCRMSESSID returned for ${email}`);
  return sessId;
}

async function syncGet(sessId, dir = 'rbacprobe') {
  const res = await fetch(`${BASE}/${dir}/sync.php`, {
    headers: { Cookie: `CCRMSESSID=${sessId}` },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, raw: text, data: json };
}

async function syncPost(sessId, payload) {
  const res = await fetch(`${BASE}/rbacprobe/sync.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `CCRMSESSID=${sessId}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, raw: text, data: json };
}

// Any authenticated endpoint under the scratch web root, as a given session.
async function api(sessId, path, { method = 'GET', body, query = '', headers = {}, raw = false } = {}) {
  const res = await fetch(`${BASE}/rbacprobe/${path}${query}`, {
    method,
    headers: { Cookie: `CCRMSESSID=${sessId}`, ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, raw: text, data: json, headers: res.headers };
}

// ----------------------------------------------------------------------------- main
async function main() {
  console.log(`Setting up RBAC probe scratch environment...`);
  setup();

  try {
    for (const [key, u] of Object.entries(USERS)) {
      SESSIONS[key] = await loginUser(u.email);
    }
    console.log(`Authenticated all fixture users.`);
    // The legacy contract is publicly readable until the first request runs the migration.
    const legacyBefore = (await fetch(`${BASE}/rbacprobe/${LEGACY_FILE}`)).status;

    // --- R1: Employee A sync.php GET (the first sync request: it also runs the file migration) ---
    section('R1: Employee A sync.php GET isolation');
    const empAGet = await syncGet(SESSIONS.employee_a);
    check('R1: HTTP status is 200', empAGet.status === 200, empAGet.status);

    const d = empAGet.data || {};
    // Every HR collection empty
    check('R1: employees collection is empty', Array.isArray(d.employees) && d.employees.length === 0, d.employees);
    check('R1: employeeSalaries collection is empty', Array.isArray(d.employeeSalaries) && d.employeeSalaries.length === 0, d.employeeSalaries);
    check('R1: employeeVacations collection is empty', Array.isArray(d.employeeVacations) && d.employeeVacations.length === 0, d.employeeVacations);

    // Business collections empty
    check('R1: leads collection is empty', Array.isArray(d.leads) && d.leads.length === 0, d.leads);
    check('R1: invoicesOffers is empty', Array.isArray(d.invoicesOffers) && d.invoicesOffers.length === 0, d.invoicesOffers);
    check('R1: financialRecords is empty', Array.isArray(d.financialRecords) && d.financialRecords.length === 0, d.financialRecords);
    check('R1: warehouses is empty', Array.isArray(d.warehouses) && d.warehouses.length === 0, d.warehouses);
    check('R1: meetingNotes is empty', Array.isArray(d.meetingNotes) && d.meetingNotes.length === 0, d.meetingNotes);
    check('R1: projects is empty', Array.isArray(d.projects) && d.projects.length === 0, d.projects);
    check('R1: unifiedEntries is empty', Array.isArray(d.unifiedEntries) && d.unifiedEntries.length === 0, d.unifiedEntries);

    // Tasks: only A's
    const taskIds = (d.tasks || []).map((t) => t.id).sort();
    const expectedTasks = ['task-a-assigned', 'task-a-created', 'task-a-own'].sort();
    check('R1: tasks holds only A-related tasks', JSON.stringify(taskIds) === JSON.stringify(expectedTasks), taskIds);

    // Raw body search: none of B's sensitive data or fake secrets may appear
    const raw = empAGet.raw;
    check('R1: B PIN does not appear in raw response', !raw.includes('920202/2222'), 'Found B PIN');
    check('R1: B salary amount does not appear in raw response', !raw.includes('3200'), 'Found 3200');
    check('R1: B street does not appear in raw response', !raw.includes('Bob Secret Street 20'), 'Found B street');
    check('R1: B note does not appear in raw response', !raw.includes('Bob confidential HR notes'), 'Found B note');
    check('R1: B document name does not appear in raw response', !raw.includes('bob_contract.pdf'), 'Found B document');
    check('R1: Fake Toggl token does not appear in raw response', !raw.includes(FAKE_TOGGL_TOKEN), 'Found Toggl token');
    check('R1: Fake Clockify key does not appear in raw response', !raw.includes(FAKE_CLOCKIFY_KEY), 'Found Clockify key');

    // Other users: stripped fields
    const otherUsers = (d.users || []).filter((u) => u.id !== USERS.employee_a.id);
    const hasLeakedUserMeta = otherUsers.some((u) => (u.activityLog && u.activityLog.length > 0) || u.metadata_json);
    check('R1: other users rows carry no activityLog or metadata_json', !hasLeakedUserMeta);

    // readScope
    check('R1: readScope is present', !!d.readScope);
    check('R1: readScope.referenceNames holds names only',
      d.readScope?.referenceNames?.leads?.['lead-probe-1'] === 'Alpha Lead' &&
      d.readScope?.referenceNames?.projects?.['proj-probe-1'] === 'Project Alpha'
    );

    const legacyAfter = (await fetch(`${BASE}/rbacprobe/${LEGACY_FILE}`)).status;

    // --- R3: Unlinked Employee ---
    section('R3: Unlinked Employee GET');
    const unlinkedGet = await syncGet(SESSIONS.employee_unlinked);
    check('R3: HTTP status is 200', unlinkedGet.status === 200, unlinkedGet.status);
    const ud = unlinkedGet.data || {};
    check('R3: employees is empty', Array.isArray(ud.employees) && ud.employees.length === 0);
    check('R3: leads is empty', Array.isArray(ud.leads) && ud.leads.length === 0);
    check('R3: tasks holds only own/created/assigned (empty for unlinked)', Array.isArray(ud.tasks) && ud.tasks.length === 0);

    // --- R6: HR-Lite GET ---
    section('R6: HR-Lite GET');
    const hrLiteGet = await syncGet(SESSIONS.hr_lite);
    check('R6: HTTP status is 200', hrLiteGet.status === 200, hrLiteGet.status);
    const hd = hrLiteGet.data || {};
    check('R6: employeeSalaries is empty', Array.isArray(hd.employeeSalaries) && hd.employeeSalaries.length === 0);
    const hasPayFields = (hd.employees || []).some((e) => 'salaryAmount' in e || 'salaryType' in e || 'autoExpense' in e);
    check('R6: employee rows carry no pay fields', !hasPayFields);

    // Anonymized finance salary rows
    const finSalaryRows = (hd.financialRecords || []).filter((r) => r.subtype === 'salary' || r.id === 'fr-sal-1');
    const salaryAnonymized = finSalaryRows.length > 0 && finSalaryRows.every((r) =>
      r.title.startsWith('Payroll') && !r.title.includes('Alice') && !r.description?.includes('Alice')
    );
    check('R6: finance salary rows are anonymized with Payroll (<period>)', salaryAnonymized, finSalaryRows);

    // --- R7: Admin and PM GET equal the pre-filtering sync.php ---
    section(`R7: Admin and Project Manager GET equals the pre-filtering baseline (${BASELINE_REF})`);
    const MASK = '********';
    // dataVersion is a hash over the tables each sync.php knows about: the baseline predates the
    // orders and ticket tables, which the scratch database now holds and seeds, so it cannot match.
    const VOLATILE = new Set(['createdAt', 'updatedAt', 'readScope', 'serverTime', 'timestamp', 'dataVersion']);
    const normalise = (val, path = '') => {
      if (Array.isArray(val)) return val.map((v) => normalise(v, path));
      if (val && typeof val === 'object') {
        const out = {};
        for (const k of Object.keys(val).sort()) {
          if (VOLATILE.has(k)) continue;
          out[k] = normalise(val[k], `${path}.${k}`);
        }
        return out;
      }
      // Documented difference: employee time-tracking secrets are now masked for everyone.
      if (path === '.employeeSettings.timeTracking.togglApiToken' || path === '.employeeSettings.timeTracking.clockifyApiKey') return MASK;
      return val;
    };
    // Documented, intended differences (see RBAC_SYSTEM.md "Read scope"):
    //  - every role: employee rows gain `userId` (the new login link)
    //  - non-admin without pm_managers: `roles` holds only the caller's own role, other
    //    users' rows are projected to id/name/email/role/color/avatar, and employeeSettings
    //    without general_config=edit is reduced to the non-secret lists.
    const SCOPED_KEYS = { admin: [], pm: ['roles', 'users', 'employeeSettings'] };
    const dropUserId = (d) => ({ ...d, employees: (d.employees || []).map(({ userId, ...rest }) => rest) });
    const GET_PROBES = {};
    for (const [label, key] of [['Admin', 'admin'], ['Project Manager', 'pm']]) {
      const cur = normalise(dropUserId((await syncGet(SESSIONS[key])).data || {}));
      const base = normalise(dropUserId((await syncGet(SESSIONS[key], 'rbacprobe_base')).data || {}));
      GET_PROBES[key] = { cur, base };
      // Everything the old GET sent must still be sent, unchanged. A NEW field is allowed: other
      // features add fields to the payload, and this probe is about nothing being taken away or altered.
      const keepsEverything = (b, c) => {
        if (Array.isArray(b)) return Array.isArray(c) && b.length === c.length && b.every((v, i) => keepsEverything(v, c[i]));
        if (b && typeof b === 'object') return !!c && typeof c === 'object' && Object.keys(b).every((k) => keepsEverything(b[k], c[k]));
        return b === c;
      };
      const diffKeys = Object.keys(base).filter((k) => !SCOPED_KEYS[key].includes(k) && !keepsEverything(base[k], cur[k]));
      for (const k of diffKeys) {
        const a = JSON.stringify(cur[k]) ?? 'undefined';
        const b = JSON.stringify(base[k]) ?? 'undefined';
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        console.log(`  ${label}.${k} differs at char ${i}:
    now:  ...${a.slice(Math.max(0, i - 40), i + 120)}
    base: ...${b.slice(Math.max(0, i - 40), i + 120)}`);
      }
      check(`R7: ${label} GET equals baseline on every key (bar documented scoping)`, diffKeys.length === 0 && Object.keys(base).length > 5, diffKeys.join(', '));
    }
    {
      const { cur, base } = GET_PROBES.pm;
      check('R7: PM roles = own role only', Array.isArray(cur.roles) && cur.roles.length === 1 && cur.roles[0].name === 'Project Manager', JSON.stringify(cur.roles).slice(0, 120));
      const ids = (d) => (d.users || []).map((u) => u.id).sort().join(',');
      check('R7: PM sees the same user list (names, e-mails, roles) as before', ids(cur) === ids(base));
      const pick = (d) => JSON.stringify((d.users || []).map((u) => [u.id, u.name, u.email, u.role, u.color, u.avatar]));
      check('R7: PM users keep id/name/email/role/color/avatar', pick(cur) === pick(base));
      check('R7: PM employeeSettings carries lists but no tokens',
        Array.isArray(cur.employeeSettings?.salaryTypes) && !JSON.stringify(cur.employeeSettings).includes(FAKE_TOGGL_TOKEN));
    }
    const adminCur = (await syncGet(SESSIONS.admin)).data || {};
    check('R7: Admin employeeSettings masks secrets', adminCur.employeeSettings?.timeTracking?.togglApiToken === MASK);

    // ======================================================================= writes
    // Every write check forges a request the way a hostile browser could, then reads
    // the DATABASE (not the response) to see whether anything moved.
    const val = (q) => sql(q).trim().split('\n').pop().trim();
    const row = (q) => val(q);
    const post = (key, body) => syncPost(SESSIONS[key], { syncProtocol: 2, ...body });
    const postV1 = (key, body) => syncPost(SESSIONS[key], body);
    const skipped = (r) => (r.data?.permissionSkipped || []).join(',');

    // --- W1: Employee A forges HR writes ---
    section('W1: Employee A cannot write HR data');
    const hrCounts = () => val("SELECT CONCAT((SELECT COUNT(*) FROM employees),'/',(SELECT COUNT(*) FROM employee_salaries),'/',(SELECT COUNT(*) FROM employee_vacations))");
    const hrBefore = hrCounts();
    await post('employee_a', { employees: [{ id: 'pe-b', name: 'Hacked', pin: 'x', salaryAmount: 1, salaryType: 'hourly', notes: 'pwned', files: [], isActive: false }] });
    check('W1: B employee row unchanged', val("SELECT CONCAT(name,'|',pin,'|',CAST(salary_amount AS UNSIGNED),'|',notes,'|',is_active) FROM employees WHERE id='pe-b'") === 'Probe Employee B|920202/2222|3200|Bob confidential HR notes|1');
    await post('employee_a', { employeeSalaries: [{ id: 'sal-b-1', employeeId: 'pe-b', periodType: 'monthly', periodKey: '2026-01', year: 2026, periodNumber: 1, totalSalary: 1, totalPaid: 1, status: 'paid' }] });
    check('W1: B salary unchanged', val("SELECT CAST(total_salary AS UNSIGNED) FROM employee_salaries WHERE id='sal-b-1'") === '3200');
    await post('employee_a', { employeeVacations: [
      { id: 'vac-b-1', employeeId: 'pe-b', vacationTypeId: 'vacation', startDate: '2026-07-01', endDate: '2026-07-05', daysCount: 5, status: 'rejected' },
      { id: 'vac-a-forged', employeeId: 'pe-a', vacationTypeId: 'vacation', startDate: '2026-09-01', endDate: '2026-09-02', daysCount: 2, status: 'approved', approvedBy: 'me@probe.test' },
    ] });
    check('W1: B leave unchanged', val("SELECT status FROM employee_vacations WHERE id='vac-b-1'") === 'approved');
    check('W1: self-approved leave not created', val("SELECT COUNT(*) FROM employee_vacations WHERE id='vac-a-forged'") === '0');
    await post('employee_a', { deleted: { employeeVacations: ['vac-b-1'], employeeSalaries: ['sal-b-1'], employees: ['pe-b'] } });
    await postV1('employee_a', { employees: [], employeeSalaries: [], employeeVacations: [] });
    check('W1: named deletes and an empty v1 snapshot change nothing', hrCounts() === hrBefore, hrCounts());

    // --- W2: renaming / e-mail / password ---
    section('W2: Employee A account changes');
    await post('employee_a', { users: [{ id: USERS.employee_a.id, name: USERS.employee_b.name, email: 'renamed-a@probe.test', role: 'Employee' }] });
    check('W2: rename to a colleague and e-mail change ignored (no self.account)',
      val(`SELECT CONCAT(name,'|',email) FROM users WHERE id='${USERS.employee_a.id}'`) === `${USERS.employee_a.name}|${USERS.employee_a.email}`);
    const hashBefore = val(`SELECT password_hash FROM users WHERE id='${USERS.employee_a.id}'`);
    await post('employee_a', { users: [{ id: USERS.employee_a.id, name: USERS.employee_a.name, email: USERS.employee_a.email, role: 'Employee', password: 'N3w-Passw0rd!' }] });
    check('W2: a password change still works', val(`SELECT password_hash FROM users WHERE id='${USERS.employee_a.id}'`) !== hashBefore);
    // someone else's row, claimed with the caller's own e-mail
    await post('employee_a', { users: [{ id: USERS.employee_b.id, name: 'Taken Over', email: USERS.employee_a.email, role: 'Employee' }] });
    check('W2: a payload naming a colleague id with own e-mail does not touch the colleague',
      val(`SELECT name FROM users WHERE id='${USERS.employee_b.id}'`) === USERS.employee_b.name);
    // with self.account: unique name and e-mail
    await post('account_editor', { users: [{ id: USERS.account_editor.id, name: USERS.employee_b.name.toUpperCase(), email: USERS.account_editor.email, role: 'AccountEditor' }] });
    check('W2: self.account cannot take a colleague name (case-insensitive)', val(`SELECT name FROM users WHERE id='${USERS.account_editor.id}'`) === USERS.account_editor.name);
    await post('account_editor', { users: [{ id: USERS.account_editor.id, name: USERS.account_editor.name, email: USERS.employee_b.email, role: 'AccountEditor' }] });
    check('W2: self.account cannot take a colleague e-mail', val(`SELECT email FROM users WHERE id='${USERS.account_editor.id}'`) === USERS.account_editor.email);
    await post('account_editor', { users: [{ id: USERS.account_editor.id, name: 'Renamed Editor', email: USERS.account_editor.email, role: 'AccountEditor' }] });
    check('W2: self.account may take a free name', val(`SELECT name FROM users WHERE id='${USERS.account_editor.id}'`) === 'Renamed Editor');

    // --- W5: stripped rows pushed back ---
    section('W5: stripped employee rows pushed back');
    const liteGet = (await syncGet(SESSIONS.hr_lite)).data;
    const liteRows = liteGet.employees || [];
    check('W5: HR-lite received rows without pay fields', liteRows.length >= 2 && !liteRows.some((e) => 'salaryAmount' in e));
    const stripped = liteRows.map((e) => (e.id === 'pe-b' ? { ...e, name: 'Probe Employee B (edited)' } : e));
    const w5 = await post('hr_lite', { employees: stripped });
    check('W5: push accepted', w5.status === 200 && w5.data?.success === true, w5.raw.slice(0, 200));
    check('W5: pay columns untouched', val("SELECT CONCAT(salary_type,'|',CAST(salary_amount AS UNSIGNED),'|',auto_expense,'|',expense_category_id) FROM employees WHERE id='pe-b'") === 'monthly|3200|1|exp-root');
    check('W5: documents untouched', val("SELECT files_json FROM employees WHERE id='pe-b'").includes('bob_contract.pdf'));
    check('W5: the directory edit itself landed', val("SELECT name FROM employees WHERE id='pe-b'") === 'Probe Employee B (edited)');
    await post('hr_lite', { employeeSalaries: [{ id: 'sal-b-1', employeeId: 'pe-b', periodType: 'monthly', periodKey: '2026-01', year: 2026, periodNumber: 1, totalSalary: 1, totalPaid: 1, status: 'paid' }] });
    check('W5: HR-lite cannot write payroll', val("SELECT CAST(total_salary AS UNSIGNED) FROM employee_salaries WHERE id='sal-b-1'") === '3200');
    await post('hr', { employees: [{ id: 'pe-b', name: 'Probe Employee B', salaryAmount: 3300, pin: '920202/2222', files: [{ id: 'pf-b-1', name: 'bob_contract.pdf', url: PRIVATE_KEY_B, size: 120, type: 'application/pdf', uploadedAt: '2026-01-01T00:00:00Z' }] }] });
    check('W5: full HR can still change pay', val("SELECT CAST(salary_amount AS UNSIGNED) FROM employees WHERE id='pe-b'") === '3300');
    await post('hr', { employees: [{ id: 'pe-b', name: 'Probe Employee B', salaryAmount: 3200, pin: '920202/2222', files: [{ id: 'pf-b-1', name: 'bob_contract.pdf', url: PRIVATE_KEY_B, size: 120, type: 'application/pdf', uploadedAt: '2026-01-01T00:00:00Z' }] }] });

    // leave: approved_by is the server's
    const hrLeave = await post('hr', { employeeVacations: [
      { id: 'vac-a-1', employeeId: 'pe-a', vacationTypeId: 'vacation', startDate: '2026-06-01', endDate: '2026-06-05', daysCount: 5, status: 'approved', approvedBy: 'forged@probe.test' },
      { id: 'vac-hr-new', employeeId: 'pe-a', vacationTypeId: 'vacation', startDate: '2026-10-01', endDate: '2026-10-02', daysCount: 2, status: 'pending', approvedBy: 'forged@probe.test' },
    ] });
    check('W5: HR leave push accepted', hrLeave.status === 200 && hrLeave.data?.success === true, hrLeave.raw.slice(0, 200));
    check('W5: approved_by of a pending request is empty whatever the client says', val("SELECT IFNULL(approved_by,'NULL') FROM employee_vacations WHERE id='vac-hr-new'") === 'NULL');
    await post('hr', { employeeVacations: [{ id: 'vac-hr-new', employeeId: 'pe-a', vacationTypeId: 'vacation', startDate: '2026-10-01', endDate: '2026-10-02', daysCount: 2, status: 'approved', approvedBy: 'forged@probe.test' }] });
    check('W5: approval records the session user, not the payload', val("SELECT approved_by FROM employee_vacations WHERE id='vac-hr-new'") === USERS.hr.email);
    check('W5: HR-lite without leave... (has leave toggle) sees leave', Array.isArray(liteGet.employeeVacations) && liteGet.employeeVacations.length >= 2);

    // employee settings: a masked token coming back never overwrites the stored one
    const adminSettings = (await syncGet(SESSIONS.admin)).data.employeeSettings;
    await post('admin', { employeeSettings: adminSettings });
    check('W5: masked Toggl/Clockify secrets echoed back leave the stored ones',
      val("SELECT value FROM system_settings WHERE `key`='EMPLOYEE_SETTINGS'").includes(FAKE_TOGGL_TOKEN) &&
      val("SELECT value FROM system_settings WHERE `key`='EMPLOYEE_SETTINGS'").includes(FAKE_CLOCKIFY_KEY));

    // --- W6: tasks ---
    section('W6: task scope');
    await post('employee_a', { tasks: [{ id: 'task-b-own', title: 'pwned', deadline: '2026-12-31', owner: USERS.employee_a.name, status: 'New', assignedUsers: [USERS.employee_a.name] }] });
    check("W6: B's task unchanged", val("SELECT title FROM tasks WHERE id='task-b-own'") === 'Task Owned By Bob');
    check("W6: B's task not handed to A", val("SELECT COUNT(*) FROM task_assignees WHERE task_id='task-b-own' AND user_name='" + USERS.employee_a.name + "'") === '0');
    await post('employee_a', { deleted: { tasks: ['task-b-own'] } });
    check("W6: named delete of B's task changes nothing", val("SELECT COUNT(*) FROM tasks WHERE id='task-b-own'") === '1');
    const w6 = await post('employee_a', { tasks: [{ id: 'task-a-new', title: 'Mine', deadline: '2026-12-31', owner: USERS.employee_a.name, status: 'New', assignedUsers: [USERS.employee_a.name] }] });
    check('W6: creating an own task works', w6.data?.success === true && val("SELECT created_by FROM tasks WHERE id='task-a-new'") === USERS.employee_a.name, w6.raw.slice(0, 200));
    await post('employee_a', { tasks: [{ id: 'task-a-own', title: 'Mine, retitled', deadline: '2026-12-31', owner: USERS.employee_a.name, status: 'New', assignedUsers: [USERS.employee_a.name] }] });
    check('W6: editing an own task works', val("SELECT title FROM tasks WHERE id='task-a-own'") === 'Mine, retitled');

    const delOther = await api(SESSIONS.employee_a, 'api/task.php', { method: 'DELETE', body: { id: 'task-b-own' } });
    check("W6: api/task.php refuses a task the caller cannot see (403)", delOther.status === 403 && val("SELECT COUNT(*) FROM tasks WHERE id='task-b-own'") === '1', delOther.raw.slice(0, 120));
    const delOwn = await api(SESSIONS.employee_a, 'api/task.php', { method: 'DELETE', body: { id: 'task-a-created' } });
    check('W6: api/task.php lets the creator delete their own task', delOwn.status === 200 && val("SELECT COUNT(*) FROM tasks WHERE id='task-a-created'") === '0', delOwn.raw.slice(0, 120));

    // --- leads / clients scope, finance salary rows, billing blobs ---
    section('W9: leads, finance and settings write scope');
    const leadRow = (id, name, extra = {}) => ({ id, name, clientType: 'person', status: 'new', owner: 'Probe Admin', value: 1, ...extra });
    await post('leads_only', { leads: [leadRow('client-probe-1', 'Pwned Client')] });
    check('W9: leads-only cannot overwrite a client row', val("SELECT name FROM leads WHERE id='client-probe-1'") === 'Beta Client');
    await postV1('leads_only', { leads: [leadRow('lead-probe-1', 'Alpha Lead')] });
    check('W9: leads-only full snapshot does not delete the clients it never saw', val("SELECT COUNT(*) FROM leads WHERE id='client-probe-1'") === '1');
    await post('leads_only', { deleted: { leads: ['client-probe-1'] } });
    check('W9: leads-only named delete of a client is dropped', val("SELECT COUNT(*) FROM leads WHERE id='client-probe-1'") === '1');
    const finGet = (await syncGet(SESSIONS.finance)).data;
    const salRow = (finGet.financialRecords || []).find((r) => r.id === 'fr-sal-1');
    check('W9: finance-only sees the salary row anonymised', !!salRow && salRow.title.startsWith('Payroll'), JSON.stringify(salRow)?.slice(0, 160));
    await post('finance', { financialRecords: [{ ...salRow, status: 'planned' }] });
    check('W9: saving it keeps the stored title and subtype', val("SELECT CONCAT(title,'|',subtype,'|',status) FROM financial_records WHERE id='fr-sal-1'") === 'Salary Alice|salary|planned');
    await post('pipeliner', { settings: { companyBillingSettings: { companyName: 'WIPED' } } });
    check('W9: a role that was never sent the billing blob cannot overwrite it', val("SELECT value FROM system_settings WHERE `key`='COMPANY_BILLING_SETTINGS'").includes('Probe Billing Co'));

    // ====================================================== self-service + documents
    section('R2: my_employment overview');
    const ov = await api(SESSIONS.employee_a, 'api/my_employment.php', { query: '?action=overview' });
    const od = ov.data || {};
    check('R2: overview answers 200', ov.status === 200 && od.success === true, ov.raw.slice(0, 160));
    check('R2: identity is A', od.identity?.id === 'pe-a' && od.identity?.name === USERS.employee_a.name);
    check('R2: personal data present, notes never', od.personal?.pin === '910101/1111' && !('notes' in (od.personal || {})) && !JSON.stringify(od).includes('Alice confidential HR notes'));
    check('R2: own pay and payroll rows, without financialRecordId',
      od.pay?.salaryAmount === 2500 && od.pay?.payroll?.length === 1 && od.pay.payroll[0].id === 'sal-a-1' && !('financialRecordId' in od.pay.payroll[0]));
    check('R2: own leave only, with types and balances',
      (od.leave?.requests || []).every((r) => ['vac-a-1', 'vac-a-pending', 'vac-hr-new'].includes(r.id)) && od.leave?.types?.length >= 2 && od.leave?.balances?.length >= 2);
    check('R2: own documents only, with an authenticated download URL',
      od.documents?.length === 1 && od.documents[0].id === 'pf-a-1' && od.documents[0].downloadUrl.includes('employee_file.php') && !JSON.stringify(od).includes('private/employees/'));
    check("R2: nothing of B's anywhere in the body", !ov.raw.includes('920202/2222') && !ov.raw.includes('Bob') && !ov.raw.includes('bob_contract') && !ov.raw.includes('3200'));
    check('R2: Employee cannot edit contact data or see edit forms', od.can?.editProfile === false && od.can?.requestLeave === true);

    section('R3: my_employment for an unlinked login');
    const unl = await api(SESSIONS.employee_unlinked, 'api/my_employment.php', { query: '?action=overview' });
    check('R3: not_linked', unl.data?.success === false && unl.data?.code === 'not_linked', unl.raw.slice(0, 160));
    const viewerOv = await api(SESSIONS.viewer, 'api/my_employment.php', { query: '?action=overview' });
    check('R3: a role without any self.* key is refused', viewerOv.status === 403 && viewerOv.data?.code === 'forbidden');
    const hoursA = await api(SESSIONS.employee_a, 'api/my_employment.php', { query: '?action=hours&year=2026&month=1&employee=pe-b&user_id=222&employee_id=pe-b' });
    check("R3: hours use the caller's own row, never a client-supplied id (A has none attached)", hoursA.data?.no_user_attached === true, hoursA.raw.slice(0, 160));

    section('R4: private employee documents');
    const fileUrl = (emp, file) => `?employee=${emp}&file=${file}`;
    const ownFile = await api(SESSIONS.employee_a, 'api/employee_file.php', { query: fileUrl('pe-a', 'pf-a-1') });
    check('R4: A downloads own contract', ownFile.status === 200 && (ownFile.headers.get('content-type') || '').startsWith('application/pdf') && ownFile.raw.startsWith('%PDF-'), `${ownFile.status} ${ownFile.headers.get('content-type')}`);
    // (A site-wide Content-Security-Policy from the deployment's .htaccess replaces the endpoint's own;
    // the endpoint only inlines PDFs and images and always sends nosniff, so that is acceptable.)
    check('R4: nosniff, no-store and an inline disposition with the original name',
      /nosniff/.test(ownFile.headers.get('x-content-type-options') || '') && /no-store/.test(ownFile.headers.get('cache-control') || '') &&
      /^inline;.*alice_contract\.pdf/.test(ownFile.headers.get('content-disposition') || ''),
      `xcto=${ownFile.headers.get('x-content-type-options')} cc=${ownFile.headers.get('cache-control')} cd=${ownFile.headers.get('content-disposition')}`);
    const otherFile = await api(SESSIONS.employee_a, 'api/employee_file.php', { query: fileUrl('pe-b', 'pf-b-1') });
    check("R4: A cannot read B's contract (403)", otherFile.status === 403 && !otherFile.raw.startsWith('%PDF-'), `${otherFile.status}`);
    const mixFile = await api(SESSIONS.employee_a, 'api/employee_file.php', { query: fileUrl('pe-a', 'pf-b-1') });
    check("R4: B's file id under A's record is not found", mixFile.status === 404);
    const unlinkedFile = await api(SESSIONS.employee_unlinked, 'api/employee_file.php', { query: fileUrl('pe-a', 'pf-a-1') });
    check('R4: an unlinked login cannot read it either', unlinkedFile.status === 403);
    const hrFile = await api(SESSIONS.hr, 'api/employee_file.php', { query: fileUrl('pe-b', 'pf-b-1') });
    check("R4: HR with employees.files reads B's contract", hrFile.status === 200 && hrFile.raw.startsWith('%PDF-'));
    const traversal = await api(SESSIONS.hr, 'api/employee_file.php', { query: '?employee=pe-b&file=../../config' });
    check('R4: a path in place of a file id finds nothing', traversal.status === 404 || traversal.status === 400);
    const direct = await fetch(`${BASE}/rbacprobe/uploads/${PRIVATE_KEY_A}`);
    check('R4: the direct URL of a private file is denied', direct.status === 403 || direct.status === 404, String(direct.status));

    section('M4: legacy public contract moved to private storage');
    const empC = () => JSON.parse(val("SELECT files_json FROM employees WHERE id='pe-c'"));
    const cKey = empC()[0].url;
    check('M4: record now points at a private storage key', /^private\/employees\/[a-f0-9]{32}\.pdf$/.test(cKey), cKey);
    check('M4: the old public path is gone (404)', legacyBefore === 200 && legacyAfter === 404, `before=${legacyBefore} after=${legacyAfter}`);
    check('M4: the file exists in the private directory', docker('exec', WEB, 'sh', '-c', `test -f ${SCRATCH_DIR}/uploads/${cKey} && echo yes || echo no`).trim() === 'yes');
    const filesBefore = val("SELECT files_json FROM employees WHERE id='pe-c'");
    await syncGet(SESSIONS.admin);
    await syncGet(SESSIONS.admin);
    check('M4: running the migration again changes nothing', val("SELECT files_json FROM employees WHERE id='pe-c'") === filesBefore);
    const carolFile = await api(SESSIONS.hr, 'api/employee_file.php', { query: fileUrl('pe-c', 'pf-c-1') });
    check('M4: HR can open the migrated contract', carolFile.status === 200 && carolFile.raw.startsWith('%PDF-'));

    section('W3: leave requests');
    const reqLeave = (key, body) => api(SESSIONS[key], 'api/my_employment.php', { method: 'POST', body: { action: 'request_leave', ...body } });
    const w3 = await reqLeave('employee_variant', { vacationTypeId: 'annual', startDate: '2026-12-07', endDate: '2026-12-11', daysCount: 99, status: 'approved', approvedBy: 'forged@probe.test', employeeId: 'pe-a', employee_id: 'pe-a' });
    check('W3: request accepted', w3.status === 201 && w3.data?.success === true, w3.raw.slice(0, 200));
    const w3row = val("SELECT CONCAT(employee_id,'|',status,'|',IFNULL(approved_by,'NULL'),'|',days_count) FROM employee_vacations WHERE id='" + (w3.data?.request?.id || 'none') + "'");
    check('W3: stored as requested, approved_by NULL, employee = caller, days computed by the server', w3row === 'pe-v|requested|NULL|5.0', w3row);
    const overlap = await reqLeave('employee_variant', { vacationTypeId: 'annual', startDate: '2026-12-10', endDate: '2026-12-14' });
    check('W3: an overlapping request is refused (overlap)', overlap.status === 409 && overlap.data?.code === 'overlap', overlap.raw.slice(0, 120));
    const weekend = await reqLeave('employee_variant', { vacationTypeId: 'annual', startDate: '2026-12-19', endDate: '2026-12-20' });
    check('W3: a weekend-only request is refused (no_working_days)', weekend.data?.code === 'no_working_days');
    const badType = await reqLeave('employee_variant', { vacationTypeId: 'nonsense', startDate: '2027-01-11', endDate: '2027-01-12' });
    check('W3: an unknown leave type is refused', badType.data?.code === 'unknown_type');
    const backwards = await reqLeave('employee_variant', { vacationTypeId: 'annual', startDate: '2027-01-12', endDate: '2027-01-11' });
    check('W3: reversed dates are refused', backwards.data?.code === 'invalid_dates');
    const garbage = await reqLeave('employee_variant', { vacationTypeId: 'annual', startDate: '2027-02-30', endDate: '2027-03-01' });
    check('W3: an impossible date is refused', garbage.data?.code === 'invalid_dates');
    const cancelOwn = await api(SESSIONS.employee_variant, 'api/my_employment.php', { method: 'POST', body: { action: 'cancel_leave', id: w3.data?.request?.id } });
    check('W3: cancelling an own requested leave works', cancelOwn.data?.success === true && val("SELECT COUNT(*) FROM employee_vacations WHERE id='" + w3.data?.request?.id + "'") === '0', cancelOwn.raw.slice(0, 120));
    const cancelApproved = await api(SESSIONS.employee_a, 'api/my_employment.php', { method: 'POST', body: { action: 'cancel_leave', id: 'vac-a-1' } });
    check('W3: cancelling an own approved leave is refused', cancelApproved.data?.code === 'not_cancellable' && val("SELECT COUNT(*) FROM employee_vacations WHERE id='vac-a-1'") === '1');
    const cancelOther = await api(SESSIONS.employee_a, 'api/my_employment.php', { method: 'POST', body: { action: 'cancel_leave', id: 'vac-b-1' } });
    check("W3: cancelling B's leave looks like it does not exist", cancelOther.status === 404 && val("SELECT COUNT(*) FROM employee_vacations WHERE id='vac-b-1'") === '1');
    const cancelPending = await api(SESSIONS.employee_a, 'api/my_employment.php', { method: 'POST', body: { action: 'cancel_leave', id: 'vac-a-pending' } });
    check('W3: A cancels own pending request', cancelPending.data?.success === true);
    check("W3: B's sick leave never appears in A's overview", !(await api(SESSIONS.employee_a, 'api/my_employment.php', { query: '?action=overview' })).raw.includes('vac-b-sick'));

    section('W4: update_contact');
    const contact = (key, body) => api(SESSIONS[key], 'api/my_employment.php', { method: 'POST', body: { action: 'update_contact', ...body } });
    const w4a = await contact('employee_a', { phone: '+421000000000' });
    check('W4: self.profile = view is refused', w4a.status === 403 && w4a.data?.code === 'forbidden' && val("SELECT phone FROM employees WHERE id='pe-a'") === '+421901111111');
    const w4b = await contact('employee_variant', { phone: '+421900999999', addressStreet: 'New Street 1', addressCity: 'Kosice', addressZip: '04001', addressCountry: 'Slovakia',
      salaryAmount: 1, pin: 'x', name: 'Hacked', notes: 'pwned', email: 'hacked@probe.test', isActive: false, salaryType: 'hourly', files: [], userId: 'probe-admin', timeTrackingUserId: '1' });
    check('W4: with edit, contact fields change', w4b.data?.success === true && val("SELECT CONCAT(phone,'|',address_street,'|',address_city) FROM employees WHERE id='pe-v'") === '+421900999999|New Street 1|Kosice', w4b.raw.slice(0, 160));
    check('W4: pay, PIN, name, notes, e-mail, state, link and ids are unchanged',
      val("SELECT CONCAT(name,'|',pin,'|',CAST(salary_amount AS UNSIGNED),'|',notes,'|',email,'|',is_active,'|',salary_type,'|',user_id,'|',IFNULL(time_tracking_user_id,'NULL'),'|',files_json) FROM employees WHERE id='pe-v'")
        === 'Probe Variant|930303/3333|2100|Vera confidential HR notes|probe-employee-variant@probe.test|1|monthly|probe-employee-variant|NULL|[]');

    section('W8: uploads');
    const pdfForm = (extra = {}, name = 'contract.pdf') => {
      const f = new FormData();
      f.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), name);
      f.append('eventId', 'emp_contract_probe');
      for (const [k, v] of Object.entries(extra)) f.append(k, v);
      return f;
    };
    const upEmployee = await api(SESSIONS.employee_a, 'upload.php', { method: 'POST', body: pdfForm({ module: 'employees' }), raw: true });
    check('W8: an Employee cannot upload an employee document (403)', upEmployee.status === 403, `${upEmployee.status} ${upEmployee.raw.slice(0, 100)}`);
    const upHr = await api(SESSIONS.hr, 'upload.php', { method: 'POST', body: pdfForm({ module: 'employees' }), raw: true });
    const hrKey = upHr.data?.filePath || '';
    check('W8: HR upload is stored privately under a random name', upHr.status === 200 && /^private\/employees\/[a-f0-9]{32}\.pdf$/.test(hrKey) && upHr.data?.fileName === 'contract.pdf', upHr.raw.slice(0, 200));
    check('W8: the file is in the private directory and not in public uploads',
      docker('exec', WEB, 'sh', '-c', `test -f ${SCRATCH_DIR}/uploads/${hrKey} && echo yes || echo no`).trim() === 'yes' &&
      docker('exec', WEB, 'sh', '-c', `ls ${SCRATCH_DIR}/uploads | grep -c emp_contract_probe || true`).trim() === '0');
    const directHr = await fetch(`${BASE}/rbacprobe/uploads/${hrKey}`);
    check('W8: the freshly uploaded file is not directly reachable', directHr.status === 403 || directHr.status === 404, String(directHr.status));
    const upLite = await api(SESSIONS.hr_lite, 'upload.php', { method: 'POST', body: pdfForm({ module: 'employees' }), raw: true });
    check('W8: HR-lite (employees.files on) may upload', upLite.status === 200);
    const upPhp = await api(SESSIONS.hr, 'upload.php', { method: 'POST', body: pdfForm({ module: 'employees' }, 'shell.php.pdf'), raw: true });
    check('W8: an executable double extension is still refused', upPhp.status === 415, `${upPhp.status}`);
    const upBadPdf = await api(SESSIONS.hr, 'upload.php', { method: 'POST', body: (() => { const f = new FormData(); f.append('file', new Blob(['not a pdf at all, just text padding padding'], { type: 'application/pdf' }), 'bad.pdf'); f.append('eventId', 'x'); f.append('module', 'employees'); return f; })(), raw: true });
    check('W8: a damaged document is still refused (magic bytes)', upBadPdf.status === 422, `${upBadPdf.status}`);
    const upViewer = await api(SESSIONS.no_edit, 'upload.php', { method: 'POST', body: pdfForm({}), raw: true });
    check('W8: a role with no edit right still cannot upload', upViewer.status === 403);
    const delEmployee = await api(SESSIONS.employee_a, 'api/delete_file.php', { method: 'POST', body: { fileName: 'anything.pdf' } });
    check('W8: delete_file refuses a role without files.delete (403)', delEmployee.status === 403, `${delEmployee.status}`);
    const delLegacy = await api(SESSIONS.employee_a, 'api/delete_file.php', { method: 'POST', body: { fileName: 'emp_contract_1700000000000_carol_contract.pdf' } });
    check('W8: delete_file refuses the legacy contract name to anyone without employees.files', delLegacy.status === 403);

    // detaching a document from a record removes its file, but only after the save committed
    const hrEmp = (await syncGet(SESSIONS.hr)).data.employees.find((e) => e.id === 'pe-c');
    const detach = await post('hr', { employees: [{ ...hrEmp, files: [] }] });
    check('W8: detaching a document deletes its file after the commit',
      detach.data?.success === true && docker('exec', WEB, 'sh', '-c', `test -f ${SCRATCH_DIR}/uploads/${cKey} && echo yes || echo no`).trim() === 'no');

    // ===================================================== other endpoints (R5)
    section('R5: AI assistant, search, dashboards, time tracking, summaries');
    const gated = async (label, key, path, opts) => {
      const r = await api(SESSIONS[key], path, opts);
      check(`R5: ${label} refused for ${key} (403)`, r.status === 403, `${r.status} ${r.raw.slice(0, 100)}`);
      return r;
    };
    const json = (body) => ({ method: 'POST', body });

    // AI assistant: needs rag_ai
    await gated('chat_rag chat', 'employee_a', 'api/chat_rag.php', json({ action: 'chat', message: 'what does Bob earn?', agent_id: 'orchestrator' }));
    await gated('chat_rag history', 'employee_a', 'api/chat_rag.php', { query: '?agent_id=orchestrator&user_id=probe-admin@probe.test' });
    await gated('realtime_session', 'employee_a', 'api/realtime_session.php', json({ action: 'create_session' }));
    await gated('realtime_session create_project', 'employee_a', 'api/realtime_session.php', json({ action: 'create_project', name: 'Voice Pwn' }));
    check('R5: no project was created by the voice agent', val("SELECT COUNT(*) FROM projects WHERE name='Voice Pwn'") === '0');
    // swarm
    await gated('swarm llm_proxy', 'employee_a', 'api/swarm.php', { query: '?action=llm_proxy', method: 'POST', body: { messages: [] } });
    const swarmCtx = await api(SESSIONS.no_edit, 'api/swarm.php', { query: '?action=fetch_crm_context&sources=all&lookback_months=12' });
    check('R5: SAI (swarm) is closed to a role with no sales access', swarmCtx.status === 403 && !swarmCtx.raw.includes('Alpha'), swarmCtx.raw.slice(0, 160));
    await gated('swarm list', 'employee_a', 'api/swarm.php', { query: '?action=list' });
    const swarmLeadsOnly = await api(SESSIONS.leads_only, 'api/swarm.php', { query: '?action=fetch_crm_context&sources=existing_clients,active_leads&lookback_months=12' });
    check('R5: a leads-only role gets the leads source but not the clients source', swarmLeadsOnly.status === 200 && !swarmLeadsOnly.raw.includes('Beta Client'), swarmLeadsOnly.raw.slice(0, 160));

    // search
    const searchA = await api(SESSIONS.employee_a, 'api/universal_search.php', { query: '?query=Alpha' });
    const searchAdmin = await api(SESSIONS.admin, 'api/universal_search.php', { query: '?query=Alpha' });
    check('R5: universal_search finds the lead for Admin (control)', Array.isArray(searchAdmin.data) && searchAdmin.raw.includes('Alpha Lead'), searchAdmin.raw.slice(0, 120));
    check('R5: universal_search returns nothing of leads / clients / meetings / mail to Employee A', Array.isArray(searchA.data) && !searchA.raw.includes('Alpha Lead'), searchA.raw.slice(0, 120));
    const searchMeeting = await api(SESSIONS.employee_a, 'api/universal_search.php', { query: '?query=Executive' });
    check('R5: ...nor the meeting', !searchMeeting.raw.includes('Secret Executive Meeting'));
    const searchLeadsOnly = await api(SESSIONS.leads_only, 'api/universal_search.php', { query: '?query=Beta' });
    check('R5: a leads-only role does not find the client row', !searchLeadsOnly.raw.includes('Beta Client'), searchLeadsOnly.raw.slice(0, 120));

    // dashboard queries
    const dq = (key, body) => api(SESSIONS[key], 'api/dashboard_query.php', json(body));
    check('R5: preset leads_count refused for Employee A', (await dq('employee_a', { action: 'leads_count' })).status === 403);
    check('R5: preset recent_meetings refused for Employee A', (await dq('employee_a', { action: 'recent_meetings' })).status === 403);
    check('R5: ad-hoc sql refused for Employee A', (await dq('employee_a', { action: 'sql', sql: 'SELECT name FROM leads' })).status === 403);
    check('R5: ad-hoc sql refused without dashboard.custom (LeadsOnly)', (await dq('leads_only', { action: 'sql', sql: 'SELECT name FROM leads' })).status === 403);
    const recentA = await dq('employee_a', { action: 'recent_tasks', params: { limit: 50 } });
    const recentIds = (recentA.data?.data || []).map((r) => r.id);
    check("R5: recent_tasks for A holds only A's tasks", recentA.status === 200 && recentIds.length > 0 && recentIds.every((id) => id.startsWith('task-a-')) && !recentIds.includes('task-b-own'), recentIds.join(','));
    const summaryA = await dq('employee_a', { action: 'tasks_summary' });
    const summaryTotal = (summaryA.data?.data || []).reduce((n, r) => n + Number(r.count), 0);
    const ownTaskCount = Number(val(`SELECT COUNT(*) FROM tasks t WHERE t.owner='${USERS.employee_a.name}' OR t.created_by='${USERS.employee_a.name}' OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id=t.id AND a.user_name='${USERS.employee_a.name}')`));
    check("R5: tasks_summary counts only A's own tasks", summaryTotal === ownTaskCount && ownTaskCount > 0, `${summaryTotal} vs ${ownTaskCount}`);
    const leadsCount = await dq('leads_only', { action: 'leads_count' });
    const expectedLeads = Number(val("SELECT COUNT(*) FROM leads WHERE NOT (id LIKE 'client-%' OR IFNULL(adjustment,0) > 0)"));
    check('R5: leads_count for a leads-only role excludes clients', leadsCount.data?.data?.count === expectedLeads, `${leadsCount.raw.slice(0, 80)} vs ${expectedLeads}`);
    const adminCount = await dq('admin', { action: 'leads_count' });
    check('R5: leads_count for Admin counts every row (control)', adminCount.data?.data?.count === Number(val('SELECT COUNT(*) FROM leads')));
    const pmSql = await dq('pm', { action: 'sql', sql: 'SELECT COUNT(*) AS c FROM leads' });
    check('R5: a role with dashboard.custom and the module views may run a query', pmSql.status === 200 && pmSql.data?.success === true, pmSql.raw.slice(0, 120));
    check('R5: ...but not over indexed mail (Admin-only)', (await dq('pm', { action: 'sql', sql: 'SELECT subject FROM rag_emails' })).status === 403);
    check('R5: Admin may query indexed mail', (await dq('admin', { action: 'sql', sql: 'SELECT subject FROM rag_emails LIMIT 1' })).status === 200);

    // time tracking
    check('R5: time_tracking hours of any employee refused for Employee A', (await api(SESSIONS.employee_a, 'api/time_tracking.php', json({ action: 'fetch_employee_hours', employee_id: 'pe-b', user_id: '222' }))).status === 403);
    check('R5: time_tracking test_connection refused for Employee A', (await api(SESSIONS.employee_a, 'api/time_tracking.php', json({ action: 'test_connection', api_token: 'x' }))).status === 403);
    check('R5: time_tracking test_connection refused for HR without general_config', (await api(SESSIONS.hr, 'api/time_tracking.php', json({ action: 'test_connection', api_token: 'x' }))).status === 403);
    const hrHours = await api(SESSIONS.hr, 'api/time_tracking.php', json({ action: 'fetch_employee_hours', employee_id: 'pe-a' }));
    check('R5: HR (employees view) may fetch employee hours', hrHours.status === 200 && hrHours.data?.no_user_attached === true, hrHours.raw.slice(0, 120));

    // summaries, transcripts, generators, connectors, audio: refused with no module access
    const blocked = [
      ['summarize_financial', 'api/summarize_financial.php', json({})],
      ['summarize_client_lead', 'api/summarize_client_lead.php', json({})],
      ['summarize_email', 'api/summarize_email.php', json({})],
      ['summarize_meeting', 'api/summarize_meeting.php', json({})],
      ['transcribe_meeting', 'api/transcribe_meeting.php', json({})],
      ['transcribe_task', 'api/transcribe_task.php', json({})],
      ['generate_report', 'api/generate_report.php', json({ companyId: '12345678' })],
      ['generate_dashboard', 'api/generate_dashboard.php', json({ prompt: 'x' })],
      ['translate_dashboard', 'api/translate_dashboard.php', json({})],
      ['generate_pdf_template', 'api/generate_pdf_template.php', json({})],
      ['idoklad', 'api/idoklad.php', json({ action: 'create_invoice' })],
      ['superfaktura', 'api/superfaktura.php', json({ action: 'create_invoice' })],
      ['upload_audio', 'api/upload_audio.php', json({})],
    ];
    for (const [name, path, opts] of blocked) {
      const r = await api(SESSIONS.no_edit, path, opts);
      check(`R5: ${name} refused for a role with no access to its module (403)`, r.status === 403, `${r.status} ${r.raw.slice(0, 90)}`);
    }
    const allowedSummary = await api(SESSIONS.pm, 'api/summarize_financial.php', json({}));
    check('R5: ...while a role with the module is not blocked by the gate (control)', allowedSummary.status !== 403, `${allowedSummary.status}`);

    // The assistant's own context, built per role (the builder is what chat_rag / realtime / the agents call).
    const contextFor = (userKey, query = 'employee salary vacation leads invoices finance meeting warehouse') => {
      const script = `<?php
chdir(__DIR__);
require __DIR__ . '/api/agent_utils.php';
$pdo = get_db_connection();
$u = $pdo->prepare('SELECT id, name, email, role FROM users WHERE id = ?'); $u->execute([$argv[1]]);
$scope = ccrm_read_scope($pdo, $u->fetch(PDO::FETCH_ASSOC));
$r = build_comprehensive_crm_rag_context($pdo, $pdo, $argv[2], 'sk', 'chro', ['limit' => 400, 'scope' => $scope]);
echo json_encode(['text' => $r['raw_context']]);`;
      run('docker', ['exec', '-i', '-u', 'www-data', WEB, 'sh', '-c', `cat > ${SCRATCH_DIR}/_ctx.php`], script);
      const out = docker('exec', '-u', 'www-data', WEB, 'php', `${SCRATCH_DIR}/_ctx.php`, USERS[userKey].id, query);
      return JSON.parse(out.slice(out.indexOf('{"text"'))).text;
    };
    const ctxA = contextFor('employee_a');
    for (const needle of ['Probe Employee B', '920202', '3200', 'Alpha Lead', 'Beta Client', 'Invoice Alpha', 'Secret Executive Meeting', 'Probe Warehouse', 'Rate:']) {
      check(`R5: Employee A's assistant context never contains "${needle}"`, !ctxA.includes(needle), needle);
    }
    const ctxLite = contextFor('hr_lite');
    check('R5: HR-lite context lists the roster', ctxLite.includes('COMPANY EMPLOYEES ROSTER') && ctxLite.includes('Probe Employee B'));
    check('R5: ...without pay or payroll', !ctxLite.includes('Rate: €') && !ctxLite.includes('RECENT PAYROLL') && !ctxLite.includes('COMPENSATION'));
    check('R5: ...with leave (it has employees.vacations)', ctxLite.includes('VACATIONS & LEAVES'));
    const ctxHr = contextFor('hr');
    check('R5: full HR context carries pay and payroll', ctxHr.includes('Rate: €3,200') && ctxHr.includes('RECENT PAYROLL'));
    const ctxFin = contextFor('finance');
    check('R5: a finance-only context shows salary rows without the name', ctxFin.includes('Payroll (') && !ctxFin.includes('Salary Alice') && !ctxFin.includes('Probe Employee B'), ctxFin.slice(ctxFin.indexOf('Financial'), 400));
    const ctxLeads = contextFor('leads_only');
    check('R5: a leads-only context has the lead but not the client', ctxLeads.includes('Alpha Lead') && !ctxLeads.includes('Beta Client'));
    const ctxAdmin = contextFor('admin');
    check('R5: Admin context has everything (control)', ctxAdmin.includes('Rate: €3,200') && ctxAdmin.includes('Alpha Lead'));

    // ============================================================ orders + tickets (Mango)
    // The two modules added after the RBAC work. nothing / view / edit / edit+delete, on the sync
    // GET, the sync POST, and the standalone endpoints. Public widget and status board stay open.
    section('T-R: orders & tickets read scope');
    const TK_VALUES = [TK.orderNumber, TK.ticketTitle, TK.ticketBody, TK.publicHash, TK.leadEmail, TK.imapHost];
    const leaked = (raw) => TK_VALUES.filter((v) => raw.includes(v)).join(', ');
    for (const key of ['tk_none', 'employee_a']) {
      const r = await syncGet(SESSIONS[key]);
      const g = r.data || {};
      const rs = g.readScope?.restricted || [];
      check(`T-R: ${key} receives no orders, tickets or support contracts`,
        ['orders', 'tickets', 'supportContracts'].every((c) => Array.isArray(g[c]) && g[c].length === 0), JSON.stringify([g.orders?.length, g.tickets?.length, g.supportContracts?.length]));
      check(`T-R: ${key} readScope marks them withheld (not deleted)`, ['orders', 'tickets', 'supportContracts'].every((c) => rs.includes(c)), rs.join(','));
      check(`T-R: ${key} body carries no order / ticket / widget / mailbox value`, leaked(r.raw) === '', leaked(r.raw));
    }
    {
      const g = (await syncGet(SESSIONS.tk_none)).data || {};
      check('T-R: nothing -> ticket statuses and settings travel as null', g.settings?.ticketStatuses === null && g.settings?.ticketSettings === null, JSON.stringify([g.settings?.ticketStatuses, g.settings?.ticketSettings]).slice(0, 120));
      check('T-R: nothing -> a task keeps its row but loses the ticket link',
        (g.tasks || []).some((t) => t.id === 'task-tk-1' && t.relatedTicketId === null));
      const p = (g.projects || []).find((x) => x.id === 'proj-probe-1');
      check('T-R: nothing -> the project is visible but its public-board hash and widget setup are not',
        !!p && p.ticketPublicHash === null && p.ticketWidgetEnabled === false && (p.ticketAllowedDomains || []).length === 0, JSON.stringify(p)?.slice(0, 200));
      const l = (g.leads || []).find((x) => x.id === 'lead-probe-1');
      check('T-R: nothing -> a lead loses its ticket e-mail whitelist', !!l && (l.ticketAllowedEmails || []).length === 0);
    }
    for (const key of ['tk_view', 'tk_edit', 'tk_full', 'admin']) {
      const r = await syncGet(SESSIONS[key]);
      const g = r.data || {};
      const rs = g.readScope?.restricted || [];
      const tk = (g.tickets || []).find((t) => t.id === 'tck-probe-1');
      check(`T-R: ${key} reads orders, tickets (with messages) and support contracts`,
        (g.orders || []).some((o) => o.id === 'ord-probe-1' && (o.items || []).length === 1) && !!tk && (tk.messages || []).some((m) => m.body === TK.ticketBody) && (g.supportContracts || []).some((c) => c.id === 'sc-probe-1'),
        JSON.stringify([g.orders?.length, g.tickets?.length, g.supportContracts?.length]));
      check(`T-R: ${key} readScope does not mark them withheld`, !['orders', 'tickets', 'supportContracts'].some((c) => rs.includes(c)), rs.join(','));
      const p = (g.projects || []).find((x) => x.id === 'proj-probe-1');
      check(`T-R: ${key} sees the widget setup, ticket link, settings and lead whitelist`,
        p?.ticketPublicHash === TK.publicHash && (g.tasks || []).some((t) => t.id === 'task-tk-1' && t.relatedTicketId === 'tck-probe-1') &&
        g.settings?.ticketSettings?.imapHost === TK.imapHost && (g.leads || []).some((x) => x.id === 'lead-probe-1' && (x.ticketAllowedEmails || []).includes(TK.leadEmail)),
        JSON.stringify([p?.ticketPublicHash, g.settings?.ticketSettings?.imapHost]));
    }

    section('T-W: orders & tickets write scope (sync.php POST)');
    const tkCounts = () => val("SELECT CONCAT((SELECT COUNT(*) FROM orders),'/',(SELECT COUNT(*) FROM order_items),'/',(SELECT COUNT(*) FROM tickets),'/',(SELECT COUNT(*) FROM ticket_messages),'/',(SELECT COUNT(*) FROM support_contracts))");
    const orderRow = (id, no, extra = {}) => ({ id, orderNumber: no, type: 'sales', status: 'new', customerType: 'client', clientId: 'client-probe-1', orderDate: '2026-02-01', guest: {}, delivery: {}, billing: {}, items: [], ...extra });
    const ticketRow = (id, num, title, extra = {}) => ({ id, ticketNumber: num, title, status: 'new', priority: 'normal', type: 'support', source: 'manual', messages: [], taskLinks: [], timeEntries: [], ...extra });
    const probeMsg = { id: 'tm-probe-1', ticketId: 'tck-probe-1', authorType: 'client', authorName: 'Probe Client', body: TK.ticketBody };
    const probeLink = { ticketId: 'tck-probe-1', taskId: 'task-tk-1', syncMode: 'auto_resolve' };
    const keepTicket = (title) => ticketRow('tck-probe-1', 'TCK-PROBE1', title, { messages: [probeMsg], taskLinks: [probeLink] });
    const contractRow = (id) => ({ id, clientId: 'client-probe-1', leadId: 'client-probe-1', projectId: 'proj-probe-1', name: 'Probe contract ' + id });
    const tkBefore = tkCounts();

    for (const key of ['tk_none', 'tk_view']) {
      await post(key, { orders: [orderRow('ord-w-1', 'OBJ-W-1'), orderRow('ord-probe-1', TK.orderNumber, { notes: 'pwned' })], tickets: [ticketRow('tck-w-1', 'TCK-W1', 'forged'), keepTicket('pwned title')], supportContracts: [contractRow('sc-w-1')] });
      check(`T-W: ${key} cannot create or change orders, tickets or contracts`,
        tkCounts() === tkBefore && val("SELECT title FROM tickets WHERE id='tck-probe-1'") === TK.ticketTitle && val("SELECT CONCAT('v:',COALESCE(notes,'')) FROM orders WHERE id='ord-probe-1'") === 'v:', tkCounts());
      const rd = await post(key, { deleted: { orders: ['ord-probe-1'], tickets: ['tck-probe-1'], supportContracts: ['sc-probe-1'] } });
      await postV1(key, { orders: [], tickets: [], supportContracts: [] });
      check(`T-W: ${key} named deletes and empty v1 snapshots remove nothing`, tkCounts() === tkBefore, tkCounts());
      check(`T-W: ${key} the refusal is reported back`, /orders|tickets/.test(skipped(rd)), skipped(rd));
    }

    // edit without the delete toggle: writes yes, deletes no
    await post('tk_edit', { orders: [orderRow('ord-w-1', 'OBJ-W-1', { notes: 'edit-made', items: [{ id: 'oi-w-1', orderId: 'ord-w-1', name: 'W item', quantity: 1, unitPrice: 5 }] }), orderRow('ord-probe-1', TK.orderNumber, { notes: 'edited', items: [{ id: 'oi-probe-1', orderId: 'ord-probe-1', name: 'Probe item', quantity: 1, unitPrice: 100 }] })],
      tickets: [ticketRow('tck-w-1', 'TCK-W1', 'created by edit'), keepTicket('Edited title')], supportContracts: [contractRow('sc-probe-1'), contractRow('sc-w-1')] });
    check('T-W: edit creates and updates orders', val("SELECT COUNT(*) FROM orders WHERE id='ord-w-1'") === '1' && val("SELECT notes FROM orders WHERE id='ord-probe-1'") === 'edited');
    check('T-W: edit creates and updates tickets', val("SELECT COUNT(*) FROM tickets WHERE id='tck-w-1'") === '1' && val("SELECT title FROM tickets WHERE id='tck-probe-1'") === 'Edited title');
    check('T-W: edit creates support contracts', val("SELECT COUNT(*) FROM support_contracts WHERE id='sc-w-1'") === '1');
    const afterEdit = tkCounts();
    await post('tk_edit', { deleted: { orders: ['ord-w-1'], tickets: ['tck-w-1'], supportContracts: ['sc-w-1'] } });
    await postV1('tk_edit', { orders: [orderRow('ord-probe-1', TK.orderNumber, { notes: 'edited', items: [{ id: 'oi-probe-1', orderId: 'ord-probe-1', name: 'Probe item', quantity: 1, unitPrice: 100 }] })], tickets: [keepTicket('Edited title')], supportContracts: [contractRow('sc-probe-1')] });
    check('T-W: edit WITHOUT the delete toggle cannot delete (named or by omission)', tkCounts() === afterEdit, `${tkCounts()} vs ${afterEdit}`);
    await post('tk_full', { deleted: { orders: ['ord-w-1'], tickets: ['tck-w-1'], supportContracts: ['sc-w-1'] } });
    check('T-W: edit + delete toggle deletes orders, tickets and contracts',
      val("SELECT COUNT(*) FROM orders WHERE id='ord-w-1'") === '0' && val("SELECT COUNT(*) FROM tickets WHERE id='tck-w-1'") === '0' && val("SELECT COUNT(*) FROM support_contracts WHERE id='sc-w-1'") === '0', tkCounts());
    check('T-W: ... and only those', val("SELECT COUNT(*) FROM orders WHERE id='ord-probe-1'") === '1' && val("SELECT COUNT(*) FROM tickets WHERE id='tck-probe-1'") === '1');

    section('T-X: ticket data carried by other modules (task link, widget setup, lead whitelist, ticket settings)');
    const taskLink = (id) => val(`SELECT CONCAT('v:',COALESCE(related_ticket_id,'')) FROM tasks WHERE id='${id}'`).slice(2);
    const linkRows = (id) => val(`SELECT COUNT(*) FROM ticket_task_links WHERE task_id='${id}'`);
    const tkTask = (id, extra = {}) => ({ id, title: 'Retitled ' + id, deadline: '2026-12-31', owner: 'Probe Admin', status: 'New', assignedUsers: [], ...extra });
    // A role that may edit tasks but holds no ticket right: the task saves, the link is untouched.
    await post('tk_none', { tasks: [tkTask('task-tk-1', { relatedTicketId: null })] });
    check('T-X: nothing + tasks edit -> the task saves', val("SELECT title FROM tasks WHERE id='task-tk-1'") === 'Retitled task-tk-1');
    check('T-X: ... but the stored ticket link survives the null it was sent', taskLink('task-tk-1') === 'tck-probe-1' && linkRows('task-tk-1') === '1', taskLink('task-tk-1'));
    for (const key of ['tk_none', 'tk_view']) {
      await post(key, { tasks: [tkTask('task-b-own', { relatedTicketId: 'tck-probe-1' })] });
      check(`T-X: ${key} cannot link a task to a ticket`, taskLink('task-b-own') === '' && linkRows('task-b-own') === '0', taskLink('task-b-own'));
      await post(key, { tasks: [tkTask('task-tk-1', { relatedTicketId: 'tck-other' })] });
      check(`T-X: ${key} cannot re-point an existing link`, taskLink('task-tk-1') === 'tck-probe-1');
    }
    await post('tk_edit', { tasks: [tkTask('task-b-own', { relatedTicketId: 'tck-probe-1' })] });
    check('T-X: edit can link a task to a ticket', taskLink('task-b-own') === 'tck-probe-1' && linkRows('task-b-own') === '1');

    const projOf = async (key) => ((await syncGet(SESSIONS[key])).data?.projects || []).find((x) => x.id === 'proj-probe-1');
    const projDb = () => val("SELECT CONCAT(ticket_widget_enabled,'|',ticket_public_hash,'|',COALESCE(ticket_allowed_domains,'')) FROM projects WHERE id='proj-probe-1'");
    const projBefore = projDb();
    for (const key of ['tk_none', 'tk_view']) {
      const pr = await projOf(key);
      await post(key, { projects: [{ ...pr, ticketWidgetEnabled: false, ticketPublicHash: 'hijacked-hash', ticketAllowedDomains: ['evil.test'], ticketWidgetConfig: { greeting: 'x' } }] });
      check(`T-X: ${key} saving a project cannot change its widget setup or public-board hash`, projDb() === projBefore, projDb());
    }
    {
      const pr = await projOf('tk_none');
      await post('tk_none', { projects: [{ ...pr, name: 'Renamed by tk_none' }] });
      check('T-X: nothing + projects edit -> the project still saves, with its hash intact', val("SELECT name FROM projects WHERE id='proj-probe-1'") === 'Renamed by tk_none' && projDb() === projBefore, projDb());
    }
    {
      const pr = await projOf('tk_edit');
      await post('tk_edit', { projects: [{ ...pr, ticketAllowedDomains: ['edited.test'] }] });
      check('T-X: edit can change the widget setup', projDb().includes('edited.test') && projDb().includes(TK.publicHash), projDb());
    }

    const leadWhitelist = () => val("SELECT COALESCE(ticket_allowed_emails,'') FROM leads WHERE id='lead-probe-1'");
    for (const key of ['tk_none', 'tk_view']) {
      await post(key, { leads: [leadRow('lead-probe-1', 'Alpha Lead', { ticketAllowedEmails: ['x@evil.test'] })] });
      check(`T-X: ${key} cannot change a lead's ticket e-mail whitelist`, leadWhitelist().includes(TK.leadEmail) && !leadWhitelist().includes('evil.test'), leadWhitelist());
    }
    await post('tk_edit', { leads: [leadRow('lead-probe-1', 'Alpha Lead', { ticketAllowedEmails: ['edited@client.probe'] })] });
    check('T-X: edit can change a lead whitelist', leadWhitelist().includes('edited@client.probe'), leadWhitelist());

    const setVal = (k) => val(`SELECT COALESCE(value,'') FROM system_settings WHERE \`key\`='${k}'`);
    const stBefore = [setVal('TICKET_STATUSES'), setVal('TICKET_SETTINGS')];
    const newStatuses = [{ id: 'probe_status', key: 'probe_status', label: 'Probe status', category: 'new', group: 'new', color: '#000000', isDefault: true, sortOrder: 1 }];
    for (const key of ['tk_none', 'tk_view']) {
      const r = await post(key, { settings: { systemName: 'CCRM', ticketStatuses: newStatuses, ticketSettings: { imapHost: 'evil.host' } } });
      check(`T-X: ${key} (general_config edit) cannot change ticket statuses or ticket settings`,
        setVal('TICKET_STATUSES') === stBefore[0] && setVal('TICKET_SETTINGS') === stBefore[1], r.raw.slice(0, 160));
    }
    await post('tk_edit', { settings: { systemName: 'CCRM', ticketStatuses: newStatuses, ticketSettings: { imapHost: 'edited.host' } } });
    check('T-X: edit (+ general_config) can change them', setVal('TICKET_STATUSES').includes('probe_status') && setVal('TICKET_SETTINGS').includes('edited.host'), setVal('TICKET_SETTINGS'));

    section('T-E: standalone endpoints (orders.php, tickets.php) and the public paths');
    const ordersN = () => val('SELECT COUNT(*) FROM orders');
    for (const key of ['tk_none', 'employee_a']) {
      const g = await api(SESSIONS[key], 'api/orders.php');
      const g1 = await api(SESSIONS[key], 'api/orders.php', { query: '?id=ord-probe-1' });
      check(`T-E: ${key} GET orders.php -> 403 and no order data`, g.status === 403 && g1.status === 403 && !g.raw.includes(TK.orderNumber) && !g1.raw.includes(TK.orderNumber), `${g.status}/${g1.status}`);
    }
    {
      const g = await api(SESSIONS.tk_view, 'api/orders.php');
      const g1 = await api(SESSIONS.tk_view, 'api/orders.php', { query: '?id=ord-probe-1' });
      check('T-E: view GET orders.php lists and reads an order', g.status === 200 && g.raw.includes(TK.orderNumber) && g1.status === 200 && g1.raw.includes(TK.orderNumber), `${g.status}/${g1.status}`);
      const n = ordersN();
      const w = await api(SESSIONS.tk_view, 'api/orders.php', { method: 'POST', body: { id: 'ord-api-1', order_number: 'OBJ-API-1', order_date: '2026-03-01' } });
      const d = await api(SESSIONS.tk_view, 'api/orders.php', { method: 'DELETE', query: '?id=ord-probe-1' });
      check('T-E: view cannot POST or DELETE through orders.php', w.status === 403 && d.status === 403 && ordersN() === n, `${w.status}/${d.status}`);
    }
    {
      const n = ordersN();
      const w = await api(SESSIONS.tk_edit, 'api/orders.php', { method: 'POST', body: { id: 'ord-api-1', order_number: 'OBJ-API-1', order_date: '2026-03-01' } });
      check('T-E: edit can POST an order through orders.php', w.status === 200 && ordersN() === String(Number(n) + 1), `${w.status} ${w.raw.slice(0, 160)}`);
      const d = await api(SESSIONS.tk_edit, 'api/orders.php', { method: 'DELETE', query: '?id=ord-api-1' });
      check('T-E: edit without the delete toggle cannot DELETE through orders.php', d.status === 403 && val("SELECT COUNT(*) FROM orders WHERE id='ord-api-1'") === '1', `${d.status}`);
      sql(`INSERT INTO orders (id, order_number, type, status, customer_type, guest_name, guest_email, order_date) VALUES ('ord-guest-1', 'OBJ-GUEST-1', 'sales', 'new', 'guest', 'Guest G', 'g@guest.probe', '2026-03-02')`);
      const cv = await api(SESSIONS.tk_edit, 'api/orders.php', { method: 'POST', query: '?action=convert_guest_to_client', body: { order_id: 'ord-guest-1' } });
      check('T-E: converting a guest needs edit on clients too (it creates a lead row)', cv.status === 403 && val("SELECT customer_type FROM orders WHERE id='ord-guest-1'") === 'guest', `${cv.status}`);
      const cv2 = await api(SESSIONS.tk_full, 'api/orders.php', { method: 'POST', query: '?action=convert_guest_to_client', body: { order_id: 'ord-guest-1' } });
      check('T-E: ... and with it the conversion works and creates a client row', cv2.status === 200 && val("SELECT customer_type FROM orders WHERE id='ord-guest-1'") === 'client' && val("SELECT COUNT(*) FROM leads l JOIN orders o ON o.client_id = l.id WHERE o.id='ord-guest-1' AND l.name = 'Guest G'") === '1', `${cv2.status} ${cv2.raw.slice(0, 160)}`);
      const d2 = await api(SESSIONS.tk_full, 'api/orders.php', { method: 'DELETE', query: '?id=ord-api-1' });
      check('T-E: edit + delete toggle can DELETE through orders.php', d2.status === 200 && val("SELECT COUNT(*) FROM orders WHERE id='ord-api-1'") === '0', `${d2.status}`);
    }
    for (const key of ['tk_none', 'tk_view']) {
      for (const action of ['test_imap', 'poll_imap', 'send_email_reply']) {
        const r = await api(SESSIONS[key], 'api/tickets.php', { method: 'POST', query: `?action=${action}`, body: { toEmail: 'a@b.probe', body: 'x', ticketId: 'tck-probe-1' } });
        check(`T-E: ${key} tickets.php ${action} -> 403`, r.status === 403, `${r.status} ${r.raw.slice(0, 120)}`);
      }
    }
    {
      const r = await api(SESSIONS.tk_edit, 'api/tickets.php', { method: 'POST', query: '?action=send_email_reply', body: {} });
      check('T-E: edit tickets.php send_email_reply passes the gate', r.status === 200 && r.data?.success === false && /Missing/.test(r.data?.message || ''), `${r.status} ${r.raw.slice(0, 160)}`);
      // test_imap connects to a host the caller names and can borrow the stored password,
      // so it is administrator-only (security audit VULN-03 / VULN-11), not just ticket-edit.
      const ti = await api(SESSIONS.tk_edit, 'api/tickets.php', { method: 'POST', query: '?action=test_imap', body: {} });
      check('T-E: edit (non-admin) tickets.php test_imap -> 403 (admin only)', ti.status === 403, `${ti.status} ${ti.raw.slice(0, 160)}`);
      const tia = await api(SESSIONS.admin, 'api/tickets.php', { method: 'POST', query: '?action=test_imap', body: {} });
      check('T-E: admin tickets.php test_imap passes the gate', tia.status === 200 && tia.data?.success === false && /Missing/.test(tia.data?.message || ''), `${tia.status} ${tia.raw.slice(0, 160)}`);
    }
    {
      const pub = await fetch(`${BASE}/rbacprobe/api/tickets.php?action=public_status&hash=${TK.publicHash}`);
      const pj = await pub.json().catch(() => null);
      check('T-E: the public status board still answers without a session', pub.status === 200 && pj?.success === true, `${pub.status} ${JSON.stringify(pj)?.slice(0, 160)}`);
      const wd = await fetch(`${BASE}/rbacprobe/api/ticket_widget.php?action=script&project=proj-probe-1&key=${TK.publicHash}`, { headers: { Origin: 'https://edited.test', Referer: 'https://edited.test/' } });
      const wt = await wd.text();
      check('T-E: the public widget script still answers without a session', wd.status === 200 && /ktw|Koperniq|function/.test(wt), `${wd.status} ${wt.slice(0, 120)}`);
    }

    // --- S: security audit fixes (Strix audit 2026-10-16, VULN-01..25) ---
    // Each check hits the real PHP and reads the DATABASE afterwards where it can, so a
    // handler that merely answers "no" while still writing would not pass.
    section('S: security audit fixes');
    const origin = new URL(BASE).origin; // http://127.0.0.1:8085 — the Host the server sees
    const same = { Origin: origin, 'Sec-Fetch-Site': 'same-origin' };

    // VULN-01 workflows need the automation module, VULN-12 zernio the social_media module.
    const wfEmp = await api(SESSIONS.employee_a, 'api/workflows.php', { query: '?action=list' });
    check('S1: workflows list refused without the automation module', wfEmp.status === 403, `${wfEmp.status} ${wfEmp.raw.slice(0, 120)}`);
    const wfEmpSave = await api(SESSIONS.employee_a, 'api/workflows.php', { method: 'POST', query: '?action=save', body: { name: 'Pwn WF', trigger_type: 'manual', nodes: [], edges: [] } });
    check('S1: workflows save refused without the automation module, and nothing stored', wfEmpSave.status === 403 && val("SELECT COUNT(*) FROM workflows WHERE name='Pwn WF'") === '0', `${wfEmpSave.status}`);
    const wfAdmin = await api(SESSIONS.admin, 'api/workflows.php', { query: '?action=list' });
    check('S1: admin can still list workflows', wfAdmin.status === 200 && wfAdmin.data?.success === true, `${wfAdmin.status} ${wfAdmin.raw.slice(0, 120)}`);
    const zr = await api(SESSIONS.employee_a, 'api/zernio.php', { method: 'POST', query: '?action=reply_comment', body: { postId: 'p', commentId: 'c', message: 'hi' } });
    check('S2: zernio reply_comment refused without the social_media module', zr.status === 403, `${zr.status} ${zr.raw.slice(0, 120)}`);
    const zg = await api(SESSIONS.employee_a, 'api/zernio.php', { method: 'POST', query: '?action=get_accounts', body: {} });
    check('S2: zernio get_accounts refused without the social_media module', zg.status === 403, `${zg.status}`);

    // VULN-18: a cross-origin write must not ride the session cookie.
    const csrfBase = { method: 'POST', query: '?action=save', body: { name: 'CSRF WF', trigger_type: 'manual', nodes: [], edges: [] } };
    const csrfSite = await api(SESSIONS.admin, 'api/workflows.php', { ...csrfBase, headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.test' } });
    check('S3: admin POST with Sec-Fetch-Site: cross-site is blocked (403)', csrfSite.status === 403, `${csrfSite.status} ${csrfSite.raw.slice(0, 120)}`);
    const csrfSub = await api(SESSIONS.admin, 'api/workflows.php', { ...csrfBase, headers: { 'Sec-Fetch-Site': 'same-site' } });
    check('S3: ... and same-site (a sibling subdomain) is blocked too', csrfSub.status === 403, `${csrfSub.status}`);
    const csrfOrigin = await api(SESSIONS.admin, 'api/workflows.php', { ...csrfBase, headers: { Origin: 'https://evil.test' } });
    check('S3: a mismatched Origin header alone is blocked (older browsers)', csrfOrigin.status === 403, `${csrfOrigin.status}`);
    check('S3: none of the blocked writes created a workflow', val("SELECT COUNT(*) FROM workflows WHERE name='CSRF WF'") === '0');
    const csrfOk = await api(SESSIONS.admin, 'api/workflows.php', { ...csrfBase, headers: same });
    check('S3: the same request from the app\'s own origin works', csrfOk.status === 200 && csrfOk.data?.success === true, `${csrfOk.status} ${csrfOk.raw.slice(0, 120)}`);
    const noHdr = await api(SESSIONS.admin, 'api/workflows.php', { ...csrfBase, body: { ...csrfBase.body, name: 'CSRF WF 2' } });
    check('S3: a non-browser client (no Origin / Sec-Fetch-Site) is unaffected', noHdr.status === 200 && noHdr.data?.success === true, `${noHdr.status}`);
    sql("DELETE FROM workflows WHERE name IN ('CSRF WF', 'CSRF WF 2')");

    // VULN-10: push subscriptions belong to the signed-in user only.
    const pushUrl = 'api/push_subscription.php';
    const anon = (method, body, query = '') => fetch(`${BASE}/rbacprobe/${pushUrl}${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    check('S4: push subscription GET without a session -> 401', (await anon('GET')).status === 401);
    check('S4: push subscription POST without a session -> 401', (await anon('POST', { endpoint: 'https://8.8.8.8/p/1', keys: { p256dh: 'a', auth: 'b' } })).status === 401);
    check('S4: push subscription DELETE without a session -> 401', (await anon('DELETE', { endpoint: 'https://8.8.8.8/p/1' })).status === 401);
    const pushBad = await api(SESSIONS.employee_a, pushUrl, { method: 'POST', body: { endpoint: 'https://127.0.0.1/hook', keys: { p256dh: 'a', auth: 'b' } } });
    check('S4: a loopback push endpoint is refused (SSRF)', pushBad.status === 400, `${pushBad.status} ${pushBad.raw.slice(0, 120)}`);
    const pushHttp = await api(SESSIONS.employee_a, pushUrl, { method: 'POST', body: { endpoint: 'http://8.8.8.8/hook', keys: { p256dh: 'a', auth: 'b' } } });
    check('S4: a non-https push endpoint is refused', pushHttp.status === 400, `${pushHttp.status}`);
    const pushMeta = await api(SESSIONS.employee_a, pushUrl, { method: 'POST', body: { endpoint: 'https://169.254.169.254/latest', keys: { p256dh: 'a', auth: 'b' } } });
    check('S4: the cloud-metadata address is refused', pushMeta.status === 400, `${pushMeta.status}`);
    const pushOk = await api(SESSIONS.employee_a, pushUrl, { method: 'POST', body: { endpoint: 'https://8.8.8.8/push/probe-1', keys: { p256dh: 'p', auth: 'a' }, userName: 'Probe Admin', userEmail: 'probe-admin@probe.test' } });
    const pushRow = val("SELECT CONCAT(user_id, '|', user_name, '|', user_email) FROM push_subscriptions WHERE endpoint = 'https://8.8.8.8/push/probe-1'");
    check('S4: a registration is bound to the SESSION user; the userName/userEmail in the body are ignored',
      pushOk.status === 200 && pushRow === `${USERS.employee_a.id}|${USERS.employee_a.name}|${USERS.employee_a.email}`, `${pushOk.status} ${pushRow}`);
    await api(SESSIONS.admin, pushUrl, { method: 'DELETE', body: { endpoint: 'https://8.8.8.8/push/probe-1' } });
    check('S4: another user cannot remove it', val("SELECT COUNT(*) FROM push_subscriptions WHERE endpoint = 'https://8.8.8.8/push/probe-1'") === '1');
    await api(SESSIONS.employee_a, pushUrl, { method: 'DELETE', body: { endpoint: 'https://8.8.8.8/push/probe-1' } });
    check('S4: the owner can', val("SELECT COUNT(*) FROM push_subscriptions WHERE endpoint = 'https://8.8.8.8/push/probe-1'") === '0');

    // VULN-04: an alias must not smuggle a secret column past the redaction.
    const dq2 = (body) => api(SESSIONS.admin, 'api/dashboard_query.php', { method: 'POST', body });
    for (const col of ['metadata_json', 'password_hash', 'sessions_valid_from']) {
      const r = await dq2({ action: 'sql', sql: `SELECT ${col} AS label FROM users` });
      check(`S5: SELECT ${col} AS label FROM users is refused`, r.status === 403, `${r.status} ${r.raw.slice(0, 120)}`);
    }
    const star = await dq2({ action: 'sql', sql: 'SELECT * FROM users LIMIT 1' });
    check('S5: SELECT * still returns rows with the secret columns redacted',
      star.status === 200 && Array.isArray(star.data?.data) && star.data.data.length > 0 &&
      star.data.data.every((r) => r.password_hash === '[REDACTED]' && r.metadata_json === '[REDACTED]'), `${star.status} ${star.raw.slice(0, 160)}`);

    // VULN-23: a Swarm simulation belongs to its creator.
    const sw = (key, query, opts = {}) => api(SESSIONS[key], 'api/swarm.php', { query, ...opts });
    const swCreate = await sw('leads_only', '?action=create_simulation', { method: 'POST', body: { id: 'probe-sim-1', title: 'Owner sim', hypothesis: 'h', crm_data_sources: ['active_leads'] }, headers: same });
    check('S6: a user with leads edit can create a simulation', swCreate.status === 200 && swCreate.data?.success === true, `${swCreate.status} ${swCreate.raw.slice(0, 160)}`);
    check('S6: ... and it records its owner', val("SELECT created_by FROM swarm_simulations WHERE id='probe-sim-1'") === USERS.leads_only.id);
    const swOther = await sw('pm', '?action=resume&simulation_id=probe-sim-1');
    check('S6: another user cannot resume it (404, same as missing)', swOther.status === 404, `${swOther.status} ${swOther.raw.slice(0, 120)}`);
    const swList = await sw('pm', '?action=list');
    check('S6: ... nor see it in the list', swList.status === 200 && !(swList.data?.simulations || []).some((s) => s.id === 'probe-sim-1'), swList.raw.slice(0, 160));
    const swHijack = await sw('pm', '?action=create_simulation', { method: 'POST', body: { id: 'probe-sim-1', title: 'HIJACKED', hypothesis: 'x' }, headers: same });
    check('S6: re-using its id to overwrite it is refused, title unchanged', swHijack.status === 404 && val("SELECT title FROM swarm_simulations WHERE id='probe-sim-1'") === 'Owner sim', `${swHijack.status}`);
    const swCk = await sw('pm', '?action=checkpoint', { method: 'POST', body: { simulation_id: 'probe-sim-1', round: 1, snapshot: { x: 1 } }, headers: same });
    check('S6: another user cannot overwrite its checkpoint', swCk.status === 404, `${swCk.status}`);
    const swGetDel = await sw('leads_only', '?action=delete&simulation_id=probe-sim-1');
    check('S6: delete over GET is refused (405) and the simulation survives', swGetDel.status === 405 && val("SELECT COUNT(*) FROM swarm_simulations WHERE id='probe-sim-1'") === '1', `${swGetDel.status}`);
    const swDelOther = await sw('pm', '?action=delete&simulation_id=probe-sim-1', { method: 'POST', headers: same });
    check('S6: another user cannot delete it', swDelOther.status === 404 && val("SELECT COUNT(*) FROM swarm_simulations WHERE id='probe-sim-1'") === '1', `${swDelOther.status}`);
    const swAdmin = await sw('admin', '?action=resume&simulation_id=probe-sim-1');
    check('S6: an administrator can read any simulation', swAdmin.status === 200 && swAdmin.data?.success === true, `${swAdmin.status}`);
    const swDelOwn = await sw('leads_only', '?action=delete&simulation_id=probe-sim-1', { method: 'POST', headers: same });
    check('S6: the owner can delete it', swDelOwn.status === 200 && val("SELECT COUNT(*) FROM swarm_simulations WHERE id='probe-sim-1'") === '0', `${swDelOwn.status}`);

    // VULN-03 / 11 / 13: connection testers do not dial internal hosts or hand the stored secret to a new host.
    const ti2 = await api(SESSIONS.admin, 'api/tickets.php', { method: 'POST', query: '?action=test_imap', body: { imapHost: 'attacker.example', imapPort: 993, imapUser: 'u', imapPassword: '' } });
    check('S7: test_imap with a CHANGED host and no password is refused (stored password is pinned to its host)', ti2.status === 200 && ti2.data?.success === false && /re-enter/i.test(ti2.data?.message || ''), `${ti2.status} ${ti2.raw.slice(0, 160)}`);
    const ti3 = await api(SESSIONS.admin, 'api/tickets.php', { method: 'POST', query: '?action=test_imap', body: { imapHost: '127.0.0.1', imapPort: 993, imapUser: 'u', imapPassword: 'typed' } });
    check('S7: test_imap against loopback is refused', ti3.data?.success === false && /internal|loopback|link-local/i.test(ti3.data?.message || ''), `${ti3.status} ${ti3.raw.slice(0, 160)}`);
    const ti4 = await api(SESSIONS.admin, 'api/tickets.php', { method: 'POST', query: '?action=test_imap', body: { imapHost: '8.8.8.8', imapPort: 22, imapUser: 'u', imapPassword: 'typed' } });
    check('S7: test_imap on a non-mail port is refused', ti4.data?.success === false && /port/i.test(ti4.data?.message || ''), `${ti4.status} ${ti4.raw.slice(0, 160)}`);
    const mb = await api(SESSIONS.employee_a, 'api/mail_broker.php', { method: 'POST', query: '?action=test_credentials', body: { provider: 'custom', imapHost: '169.254.169.254', imapPort: 143, imapSecure: 'none', smtpHost: 'smtp.example.test', smtpPort: 587 } });
    check('S7: mail_broker test_credentials against the metadata address is refused', mb.data?.success === false && /internal|link-local|loopback/i.test(mb.data?.error || ''), `${mb.status} ${mb.raw.slice(0, 160)}`);
    const vv1 = await api(SESSIONS.admin, 'api/validate_vector.php', { method: 'POST', body: { vectorDb: 'qdrant', qdrantUrl: 'file:///etc/passwd' } });
    check('S7: validate_vector refuses a file:// Qdrant URL', vv1.data?.success === false && /http/i.test(vv1.data?.message || ''), `${vv1.status} ${vv1.raw.slice(0, 160)}`);
    const vv2 = await api(SESSIONS.admin, 'api/validate_vector.php', { method: 'POST', body: { vectorDb: 'qdrant', qdrantUrl: 'http://169.254.169.254/latest/meta-data' } });
    check('S7: validate_vector refuses the cloud-metadata address', vv2.data?.success === false && /link-local|reserved/i.test(vv2.data?.message || ''), `${vv2.status} ${vv2.raw.slice(0, 160)}`);
    const vv3 = await api(SESSIONS.admin, 'api/validate_vector.php', { method: 'POST', body: { vectorDb: 'mariadb', mariaDbHost: '127.0.0.1;unix_socket=/tmp/x', mariaDbPort: '3306', mariaDbUser: 'u', mariaDbName: 'd', mariaDbPassword: 'p' } });
    check('S7: validate_vector refuses DSN-injecting values', vv3.data?.success === false && /invalid/i.test(vv3.data?.message || ''), `${vv3.status} ${vv3.raw.slice(0, 160)}`);

    // VULN-05: the reply goes to the ticket's reporter as stored, whatever the caller sends.
    const er0 = await api(SESSIONS.tk_edit, 'api/tickets.php', { method: 'POST', query: '?action=send_email_reply', body: { ticketId: 'tck-probe-1', toEmail: 'attacker@evil.test', body: 'x' } });
    check('S8: send_email_reply for a ticket with no reporter e-mail is refused (the caller-supplied address is not used)', er0.status === 404, `${er0.status} ${er0.raw.slice(0, 120)}`);
    const er1 = await api(SESSIONS.tk_edit, 'api/tickets.php', { method: 'POST', query: '?action=send_email_reply', body: { ticketId: 'no-such-ticket', toEmail: 'attacker@evil.test', body: 'x' } });
    check('S8: ... and for an unknown ticket', er1.status === 404, `${er1.status}`);
    sql("UPDATE tickets SET reporter_email='client@probe.test' WHERE id='tck-probe-1'");
    const er2 = await api(SESSIONS.tk_edit, 'api/tickets.php', { method: 'POST', query: '?action=send_email_reply', body: { ticketId: 'tck-probe-1', toEmail: 'attacker@evil.test', body: 'x' } });
    check('S8: with a reporter e-mail on file the request gets past the recipient lookup', er2.status === 200 && /SMTP/i.test(er2.data?.message || ''), `${er2.status} ${er2.raw.slice(0, 160)}`);
    sql("UPDATE tickets SET reporter_email=NULL WHERE id='tck-probe-1'");

    // VULN-06 / 08 / 19: the public widget bounds and cleans what strangers send.
    const wdomains = JSON.parse(val("SELECT ticket_allowed_domains FROM projects WHERE id='proj-probe-1'") || '[]');
    const wHost = wdomains[0] || 'probe.test';
    const wHeaders = { Origin: `https://${wHost}`, Referer: `https://${wHost}/` };
    const widget = (action, body) => fetch(`${BASE}/rbacprobe/api/ticket_widget.php?action=${action}&project=proj-probe-1&key=${TK.publicHash}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...wHeaders }, body: JSON.stringify(body) });
    // The widget refuses senders outside the project / client e-mail whitelist, so use one on it.
    const wlEmails = [
      val("SELECT COALESCE(ticket_allowed_emails, '[]') FROM leads WHERE id='lead-probe-1'"),
      val("SELECT COALESCE(ticket_allowed_emails, '[]') FROM projects WHERE id='proj-probe-1'"),
    ].flatMap((j) => { try { return JSON.parse(j); } catch { return []; } });
    const wEmail = wlEmails.find((e) => String(e).includes('@')) || 'r@probe.test';
    const wRes = await widget('submit', {
      subject: 'Probe widget ticket', description: 'd', reporterName: 'N', reporterEmail: wEmail,
      attachments: [
        { id: 'a1', name: 'evil', type: 'text/html', dataUrl: 'javascript:alert(1)' },
        { id: 'a2', name: 'huge.png', dataUrl: 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024 + 8) },
        { id: 'a3', name: 'ok.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', path: 'javascript:alert(2)', url: 'javascript:alert(3)' },
      ],
    });
    const wJson = await wRes.json().catch(() => null);
    const att = val("SELECT attachments_json FROM tickets WHERE title='Probe widget ticket' ORDER BY created_at DESC LIMIT 1");
    check('S9: widget submit stores only the valid, small image attachment (no javascript:, no oversize, no path/url)',
      wRes.status === 200 && wJson?.success === true && !/javascript:/i.test(att) && !/"path"|"url"/.test(att) && att.includes('ok.png') && !att.includes('huge.png'), `${wRes.status} ${att.slice(0, 200)}`);
    const wPrev = val("SELECT ticket_public_hash FROM projects WHERE id='proj-probe-1'");
    sql("UPDATE projects SET ticket_public_hash = NULL WHERE id='proj-probe-1'");
    const noKeyScript = await fetch(`${BASE}/rbacprobe/api/ticket_widget.php?action=script&project=proj-probe-1`, { headers: wHeaders });
    check('S9: an anonymous widget request does not write a hash into a project that has none (VULN-08)',
      noKeyScript.status === 403 && val("SELECT COALESCE(ticket_public_hash, 'NULL') FROM projects WHERE id='proj-probe-1'") === 'NULL', `${noKeyScript.status}`);
    sql(`UPDATE projects SET ticket_public_hash = ${JSON.stringify(wPrev)} WHERE id='proj-probe-1'`);
    const script = await (await fetch(`${BASE}/rbacprobe/api/ticket_widget.php?action=script&project=proj-probe-1&key=${TK.publicHash}`, { headers: wHeaders })).text();
    check('S9: the widget script escapes the title, label and subtitle it interpolates into innerHTML',
      /escapeHtml\(CFG\.title/.test(script) && /escapeHtml\(CFG\.buttonLabel/.test(script) && /escapeHtml\(CFG\.subtitle/.test(script) && /function safeColor/.test(script));

    // VULN-24: the audit trail records authentication and can be read (admin only).
    const badLogin = await fetch(`${BASE}/rbacprobe/api/login.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: USERS.viewer.email, password: 'definitely-wrong' }) });
    check('S10: a wrong password is still a 401', badLogin.status === 401);
    check('S10: ... and is recorded in the audit log', Number(val(`SELECT COUNT(*) FROM audit_log WHERE action='auth.login_failed' AND actor_email='${USERS.viewer.email}'`)) >= 1);
    check('S10: the successful logins at the start are recorded', Number(val("SELECT COUNT(*) FROM audit_log WHERE action='auth.login_success'")) >= 1);
    const al = await api(SESSIONS.admin, 'api/audit_log.php', { query: '?action=auth.&per_page=5' });
    check('S10: an admin can read the audit log (paginated, filtered)', al.status === 200 && al.data?.success === true && Array.isArray(al.data.entries) && al.data.entries.length > 0 && al.data.entries.every((e) => e.action.startsWith('auth.')), `${al.status} ${al.raw.slice(0, 160)}`);
    check('S10: a non-admin cannot', (await api(SESSIONS.employee_a, 'api/audit_log.php')).status === 403);
    const alCsv = await api(SESSIONS.admin, 'api/audit_log.php', { query: '?format=csv' });
    check('S10: the CSV export works for an admin', alCsv.status === 200 && alCsv.raw.startsWith('id,created_at,actor_id'), alCsv.raw.slice(0, 80));
    sql("INSERT INTO error_logs (message, file, line, trace) VALUES ('probe error', 'x.php', 1, '')");
    const elDel = await api(SESSIONS.admin, 'api/error_logs.php', { method: 'DELETE', headers: same });
    check('S10: clearing the error log is itself audited', elDel.status === 200 && Number(val("SELECT COUNT(*) FROM audit_log WHERE action='error_logs.clear'")) >= 1, `${elDel.status}`);
    const rst = await fetch(`${BASE}/rbacprobe/api/password_reset.php?action=reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'not-a-real-token', password: 'Abcdefghijk1' }) });
    check('S10: an invalid reset token is refused and recorded', rst.status === 400 && Number(val("SELECT COUNT(*) FROM audit_log WHERE action='password_reset.invalid_token'")) >= 1, `${rst.status}`);

    // VULN-07: the cron endpoint is not open to every signed-in user, nor to a plain GET with a cookie.
    const cronEmp = await api(SESSIONS.employee_a, 'api/cron.php', { method: 'POST', headers: same });
    check('S11: cron.php with a non-admin session -> 403', cronEmp.status === 403, `${cronEmp.status} ${cronEmp.raw.slice(0, 120)}`);
    const cronGet = await api(SESSIONS.admin, 'api/cron.php');
    check('S11: cron.php with an admin session but GET -> 403 (must be POST)', cronGet.status === 403, `${cronGet.status}`);
    const cronTok = await fetch(`${BASE}/rbacprobe/api/cron.php?token=wrong`);
    check('S11: cron.php with a wrong token and no session -> 401', cronTok.status === 401, `${cronTok.status}`);

    // VULN-14 / VULN-15: realtime voice and the dashboard AI endpoints.
    const rtSdp = await api(SESSIONS.employee_a, 'api/realtime_session.php', { method: 'POST', body: { action: 'exchange_sdp', sdp: 'v=0' } });
    check('S12: realtime exchange_sdp without rag_ai -> 403 (before anything about the OpenAI key is revealed)', rtSdp.status === 403, `${rtSdp.status} ${rtSdp.raw.slice(0, 120)}`);

    // --- W7: protected roles survive an admin push (kept last: it rewrites the registry) ---
    section('W7: protected roles');
    await post('admin', { roles: [{ name: 'Admin', permissions: {} }, { name: 'Custom', permissions: {} }] });
    const roleNames = JSON.parse(val("SELECT value FROM system_settings WHERE `key`='ROLES_RBAC'")).map((r) => r.name);
    check('W7: Admin push without Employee / Project Manager keeps them', roleNames.includes('Employee') && roleNames.includes('Project Manager') && roleNames.includes('Custom'), roleNames.join(','));
    await post('employee_a', { roles: [] });
    check('W7: a non-admin cannot touch the registry', JSON.parse(val("SELECT value FROM system_settings WHERE `key`='ROLES_RBAC'")).length === roleNames.length);

    // ============================================================ migrations (M1-M3, M5)
    // Run last: they rewrite the role registry and drop a column in the scratch database.
    section('M: migrations');
    const migScript = `<?php
chdir(__DIR__);
require __DIR__ . '/api/auth.php';
require __DIR__ . '/api/schema.php';
require __DIR__ . '/config.php';
$pdo = get_db_connection();
switch ($argv[1] ?? '') {
    case 'fallback': echo json_encode(array_column(ccrm_fallback_roles(), 'name')); break;
    case 'migrate_role': ccrm_migrate_employee_role_rbac($pdo); ccrm_migrate_employee_role_rbac($pdo); break;
    case 'apply': ccrm_apply_schema($pdo); ccrm_apply_schema($pdo); break;
}`;
    run('docker', ['exec', '-i', '-u', 'www-data', WEB, 'sh', '-c', `cat > ${SCRATCH_DIR}/_mig.php`], migScript);
    const mig = (action) => docker('exec', '-u', 'www-data', WEB, 'php', `${SCRATCH_DIR}/_mig.php`, action);
    const rolesInDb = () => JSON.parse(val("SELECT value FROM system_settings WHERE `key`='ROLES_RBAC'"));

    check('M1: a fresh install\'s fallback registry contains Employee', JSON.parse(mig('fallback')).includes('Employee'));

    sql(`UPDATE system_settings SET value='${JSON.stringify([{ name: 'Admin', permissions: {} }, { name: 'Project Manager', permissions: {} }])}' WHERE \`key\`='ROLES_RBAC'`);
    mig('migrate_role');
    check('M2: an existing registry without Employee gets it appended exactly once (migration run twice)',
      rolesInDb().filter((r) => r.name.toLowerCase() === 'employee').length === 1 && rolesInDb().length === 3, JSON.stringify(rolesInDb().map((r) => r.name)));
    check('M2: ...with the full default map', Object.keys(rolesInDb().find((r) => r.name === 'Employee').permissions).length >= 40);

    sql(`UPDATE system_settings SET value='${JSON.stringify([{ name: 'Admin', permissions: {} }, { name: 'employee', permissions: { tasks: 'view' } }])}' WHERE \`key\`='ROLES_RBAC'`);
    mig('migrate_role');
    const kept = rolesInDb();
    check('M3: an existing custom role named "employee" is left exactly as it was',
      kept.length === 2 && kept[1].name === 'employee' && JSON.stringify(kept[1].permissions) === JSON.stringify({ tasks: 'view' }), JSON.stringify(kept));

    sql('ALTER TABLE employees DROP FOREIGN KEY fk_employees_user_id');
    for (const idx of sql("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='user_id'").trim().split('\n').slice(1)) {
      sql(`ALTER TABLE employees DROP INDEX \`${idx.trim()}\``);
    }
    sql('ALTER TABLE employees DROP COLUMN user_id');
    check('M5: the user_id column is gone before the migration', val("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='user_id'") === '0');
    mig('apply');
    check('M5: user_id is added once, with its unique index and foreign key (migration run twice)',
      val("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='user_id'") === '1' &&
      Number(val("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='user_id' AND NON_UNIQUE=0")) >= 1 &&
      val("SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='user_id' AND REFERENCED_TABLE_NAME='users'") === '1');

  } finally {
    teardown();
  }

  console.log(`\n========================================`);
  console.log(`Probe complete: ${passes} passed, ${failures} failed.`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal probe error:', err);
  teardown();
  process.exit(1);
});
