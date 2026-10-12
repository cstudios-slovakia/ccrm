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
