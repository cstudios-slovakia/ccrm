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
  EMPLOYEE_A,
  EMPLOYEE_B,
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
// R7 compares Admin / Project Manager against the last sync.php that did no read filtering.
const BASELINE_REF = process.env.CCRM_PROBE_BASELINE_REF || '69fb9be';
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

  sql(fixtureSql());
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

    // --- R1: Employee A sync.php GET ---
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
    const VOLATILE = new Set(['createdAt', 'updatedAt', 'readScope', 'serverTime', 'timestamp']);
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
      const diffKeys = [...new Set([...Object.keys(cur), ...Object.keys(base)])].filter(
        (k) => !SCOPED_KEYS[key].includes(k) && JSON.stringify(cur[k]) !== JSON.stringify(base[k]),
      );
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
    await post('hr', { employees: [{ id: 'pe-b', name: 'Probe Employee B', salaryAmount: 3300, pin: '920202/2222', files: [{ id: 'pf-b-1', name: 'bob_contract.pdf', path: 'uploads/employees/private/bob_contract.pdf' }] }] });
    check('W5: full HR can still change pay', val("SELECT CAST(salary_amount AS UNSIGNED) FROM employees WHERE id='pe-b'") === '3300');
    await post('hr', { employees: [{ id: 'pe-b', name: 'Probe Employee B', salaryAmount: 3200, pin: '920202/2222', files: [{ id: 'pf-b-1', name: 'bob_contract.pdf', path: 'uploads/employees/private/bob_contract.pdf' }] }] });

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

    // --- W7: protected roles survive an admin push (kept last: it rewrites the registry) ---
    section('W7: protected roles');
    await post('admin', { roles: [{ name: 'Admin', permissions: {} }, { name: 'Custom', permissions: {} }] });
    const roleNames = JSON.parse(val("SELECT value FROM system_settings WHERE `key`='ROLES_RBAC'")).map((r) => r.name);
    check('W7: Admin push without Employee / Project Manager keeps them', roleNames.includes('Employee') && roleNames.includes('Project Manager') && roleNames.includes('Custom'), roleNames.join(','));
    await post('employee_a', { roles: [] });
    check('W7: a non-admin cannot touch the registry', JSON.parse(val("SELECT value FROM system_settings WHERE `key`='ROLES_RBAC'")).length === roleNames.length);

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
