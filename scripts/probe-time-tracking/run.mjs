#!/usr/bin/env node
/**
 * Server probe for the Time Tracking API (api/time_entries.php, api/holidays.php).
 *
 * The mocked browser suite cannot see what the server stores or strips, so this runs the real PHP
 * against a scratch database and a scratch copy of public/ in the dev web container:
 *   - never touches dev data (own database `ccrm_tt_probe`, own directory `ttprobe/`),
 *   - logs in through api/login.php for real session cookies,
 *   - asserts what is STORED (the database itself) and what is RETURNED (the raw bodies).
 *
 *   npm run test:time-tracking
 *
 * Needs the dev containers (docker compose up): `crm` (web) and `ccrm-db-1` (MySQL).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PM_ROLE, employeeRole, noRole, costsRole } from './roles.mjs';

const WEB = process.env.CCRM_PROBE_WEB_CONTAINER || 'crm';
const DB = process.env.CCRM_PROBE_DB_CONTAINER || 'ccrm-db-1';
const ROOT_PW = process.env.CCRM_PROBE_DB_ROOT_PASSWORD || 'ccrm_root_password';
const BASE = (process.env.CCRM_PROBE_URL || 'http://127.0.0.1:8085').replace(/\/$/, '');
const SCRATCH_DB = 'ccrm_tt_probe';
const SCRATCH_DIR = '/var/www/html/ttprobe';
const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

const run = (cmd, args, input) =>
  execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const docker = (...args) => run('docker', args);
const sql = (q, db = SCRATCH_DB) => {
  try {
    return docker('exec', '-i', DB, 'mysql', '-uroot', `-p${ROOT_PW}`, '--default-character-set=utf8mb4', '--batch', '--raw', db, '-e', q);
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter((l) => !l.includes('Using a password')).slice(0, 2).join(' | ');
    throw new Error('SQL failed: ' + msg);
  }
};
const rows = (q) => {
  const lines = sql(q).trim().split('\n');
  if (lines.length < 2) return [];
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v === 'NULL' ? null : v])));
};

let failures = 0;
let passes = 0;
const check = (name, ok, detail = '') => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + String(detail).slice(0, 400)}`);
};
const section = (t) => console.log(`\n== ${t}`);
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);

const USERS = {
  admin: { id: 'tt-admin', name: 'TT Admin', email: 'tt-admin@probe.test', role: 'Admin' },
  pm: { id: 'tt-pm', name: 'TT Manager', email: 'tt-pm@probe.test', role: 'Project Manager' },
  erik: { id: 'tt-erik', name: 'TT Erik', email: 'tt-erik@probe.test', role: 'Employee' },
  free: { id: 'tt-free', name: 'TT Freelancer', email: 'tt-free@probe.test', role: 'Employee' },
  costs: { id: 'tt-costs', name: 'TT Costs', email: 'tt-costs@probe.test', role: 'Costs' },
  none: { id: 'tt-none', name: 'TT Nobody', email: 'tt-none@probe.test', role: 'NoTT' },
};

function setup() {
  for (const c of [WEB, DB]) {
    let running = 'false';
    try { running = docker('inspect', '-f', '{{.State.Running}}', c).trim(); } catch {}
    if (running !== 'true') throw new Error(`Container "${c}" is not running.`);
  }
  sql(`DROP DATABASE IF EXISTS ${SCRATCH_DB}; CREATE DATABASE ${SCRATCH_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON ${SCRATCH_DB}.* TO 'ccrm_user'@'%';`, 'mysql');
  docker('exec', WEB, 'sh', '-c', `rm -rf ${SCRATCH_DIR} && mkdir -p ${SCRATCH_DIR}`);
  docker('cp', publicDir + '.', `${WEB}:${SCRATCH_DIR}/`);
  docker('exec', WEB, 'sh', '-c', `sed "s/define('DB_NAME', '[^']*')/define('DB_NAME', '${SCRATCH_DB}')/" /var/www/html/config.php > ${SCRATCH_DIR}/config.php`);
  // The dev container's Apache drops the Authorization header (public/.htaccess forwards it only for api/v1);
  // the extension authenticates with a Bearer key, so forward it in the scratch copy.
  docker('exec', WEB, 'sh', '-c', `printf '%s
' 'SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1' >> ${SCRATCH_DIR}/.htaccess`);
  docker('exec', WEB, 'chown', '-R', 'www-data:www-data', SCRATCH_DIR);
  // A fresh database: the real schema code builds every table.
  docker('exec', '-u', 'www-data', WEB, 'php', '-r',
    `require '${SCRATCH_DIR}/config.php'; require '${SCRATCH_DIR}/api/schema.php'; ccrm_apply_schema(get_db_connection());`);

  const roles = [
    { name: 'Admin', permissions: {} },
    PM_ROLE,
    employeeRole(),
    noRole('NoTT'),
    costsRole('Costs'),
  ];
  const lines = [
    `REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('ROLES_RBAC', ${q(JSON.stringify(roles))});`,
    `REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('COMPANY_BILLING_SETTINGS', ${q(JSON.stringify({ companyName: 'Probe Co', country: 'Slovakia' }))});`,
  ];
  for (const u of Object.values(USERS)) {
    lines.push(`INSERT INTO users (id, name, email, password_hash, role) VALUES (${q(u.id)}, ${q(u.name)}, ${q(u.email)}, 'x', ${q(u.role)});`);
  }
  // Erik: employee on €3,200 a month. The freelancer: contractor, €20 an hour, Hungarian calendar.
  lines.push(`INSERT INTO employees (id, name, kind, user_id, salary_type, salary_amount, work_country, is_active) VALUES ('emp-erik', 'TT Erik', 'employee', 'tt-erik', 'monthly', 3200, NULL, 1);`);
  lines.push(`INSERT INTO employees (id, name, kind, user_id, salary_type, salary_amount, work_country, is_active) VALUES ('emp-free', 'TT Freelancer', 'contractor', 'tt-free', 'hourly', 20, 'HU', 1);`);
  lines.push(`INSERT INTO project_types (id, name, icon, color, attributes_json) VALUES ('pt-tt', 'TT Type', 'Folder', '#000', '[]');`);
  lines.push(`INSERT INTO projects (id, project_type_id, name, status, created_at) VALUES ('proj-tt-1', 'pt-tt', 'TT Project One', 'active', NOW()), ('proj-tt-2', 'pt-tt', 'TT Project Two', 'active', NOW());`);
  const task = (id, title, owner, project) =>
    `INSERT INTO tasks (id, title, priority, deadline, status, owner, created_by, related_project_id) VALUES (${q(id)}, ${q(title)}, 'medium', '2026-12-31', 'todo', ${q(owner)}, ${q(owner)}, ${q(project)});`;
  lines.push(task('task-tt-1', 'Write the offer', 'TT Erik', 'proj-tt-1'));
  lines.push(task('task-tt-2', 'Secret task of the manager', 'TT Manager', null));
  lines.push(task('task-tt-3', 'Task without a project', 'TT Erik', null));
  // Fixed past dates (2026-05, 2026-10) are older than the default lockAfterDays (14): switch the age
  // lock off for the whole probe (null = off). Sections that test the lock turn it on for themselves (T13).
  lines.push(`REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('TIME_TRACKING_SETTINGS', ${q(JSON.stringify({ lockAfterDays: null }))});`);
  sql(lines.join('\n'));
}

function teardown() {
  if (process.env.CCRM_PROBE_KEEP) return;
  try { sql(`DROP DATABASE IF EXISTS ${SCRATCH_DB};`, 'mysql'); } catch {}
  try { docker('exec', WEB, 'sh', '-c', `rm -rf ${SCRATCH_DIR}`); } catch {}
}

async function login(email) {
  const res = await fetch(`${BASE}/ttprobe/api/login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'x' }),
  });
  if (res.status !== 200) throw new Error(`Login failed for ${email} (${res.status}): ${await res.text()}`);
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  // session_regenerate_id() sends the old (expired) cookie first; the last one is the live session.
  let sess = '';
  for (const c of cookies) {
    const m = c.match(/CCRMSESSID=([^;]+)/);
    if (m) sess = m[1];
  }
  if (!sess) throw new Error(`No session for ${email}`);
  return sess;
}

async function api(sess, path, { method = 'GET', body, query = '' } = {}) {
  const res = await fetch(`${BASE}/ttprobe/api/${path}${query}`, {
    method,
    headers: { ...(sess ? { Cookie: `CCRMSESSID=${sess}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, raw: text, data: json };
}
const te = (sess, body) => api(sess, 'time_entries.php', { method: 'POST', body });
const list = (sess, query = '') => api(sess, 'time_entries.php', { query });
const dbEntry = (id) => rows(`SELECT * FROM time_entries WHERE id=${q(id)}`)[0];

async function main() {
  console.log('Setting up the time tracking probe scratch environment...');
  setup();
  try {
    const S = {};
    for (const [k, u] of Object.entries(USERS)) S[k] = await login(u.email);
    console.log('Authenticated all fixture users.');

    section('T1: access');
    check('T1: signed-out request is refused', (await api(null, 'time_entries.php')).status === 401);
    check('T1: a role without the module gets 403', (await list(S.none)).status === 403);
    check('T1: an Employee may open the module', (await list(S.erik)).status === 200);

    section('T2: cost rate per employment status (frozen on save)');
    const oct = await te(S.erik, { action: 'create', description: 'Offer work', entryDate: '2026-10-14', durationSec: 8100, source: 'day' });
    check('T2: create returns 201', oct.status === 201, oct.raw);
    const octRow = dbEntry(oct.data?.entry?.id);
    check('T2: Erik Oct 2026 SK -> 24.5818/h, source monthly, 22 days', octRow?.cost_rate === '24.5818' && octRow?.cost_rate_source === 'monthly' && octRow?.cost_rate_basis_days === '22', JSON.stringify(octRow));
    check('T2: a 2:15:00 entry costs 55.3091 (4 decimals, D3.2)', octRow?.cost === '55.3091', octRow?.cost);
    check('T2: employee_id is resolved from the owner', octRow?.employee_id === 'emp-erik');
    const may = await te(S.erik, { action: 'create', description: 'May work', entryDate: '2026-05-12', durationSec: 3600, source: 'day' });
    const mayRow = dbEntry(may.data?.entry?.id);
    check('T2: Erik May 2026 (20 days) -> 27.04/h, differs from October', mayRow?.cost_rate === '27.0400' && mayRow?.cost_rate_basis_days === '20', JSON.stringify(mayRow));
    const free = await te(S.free, { action: 'create', description: 'Contract work', entryDate: '2026-10-14', durationSec: 3600, source: 'day' });
    const freeRow = dbEntry(free.data?.entry?.id);
    check('T2: freelancer hourly 20 -> flat 20.00, no multiplier', freeRow?.cost_rate === '20.0000' && freeRow?.cost_rate_source === 'contractor_hourly' && freeRow?.cost === '20.0000', JSON.stringify(freeRow));
    const pmEntry = await te(S.pm, { action: 'create', description: 'Manager work', entryDate: '2026-10-14', durationSec: 3600, source: 'day' });
    const pmRow = dbEntry(pmEntry.data?.entry?.id);
    check('T2: no employee linked -> no rate, cost NULL', pmRow?.cost_rate === null && pmRow?.cost_rate_source === 'none' && pmRow?.cost === null && pmRow?.employee_id === null, JSON.stringify(pmRow));
    // Same salary, Hungarian calendar: give Erik the HU calendar and add a second October entry.
    sql(`UPDATE employees SET work_country='HU' WHERE id='emp-erik'`);
    const hu = await te(S.erik, { action: 'create', description: 'HU calendar', entryDate: '2026-10-15', durationSec: 3600, source: 'day' });
    const huRow = dbEntry(hu.data?.entry?.id);
    check('T2: Oct 2026 in Hungary has 21 working days -> 25.7524/h', huRow?.cost_rate === '25.7524' && huRow?.cost_rate_basis_days === '21', JSON.stringify(huRow));
    sql(`UPDATE employees SET work_country=NULL WHERE id='emp-erik'`);
    check('T2: the frozen October rate did not change when the calendar did', dbEntry(oct.data.entry.id)?.cost_rate === '24.5818');

    section('T3: cost visibility is enforced by the server');
    const asPm = await list(S.pm, '?userId=all&from=2026-01-01&to=2026-12-31');
    const erikFromPm = (asPm.data?.entries || []).find((e) => e.id === oct.data.entry.id);
    check('T3: a manager (team, no costs) sees the entry', !!erikFromPm);
    check('T3: ...without cost, rate, source or billable rate', erikFromPm && !('cost' in erikFromPm) && !('costRate' in erikFromPm) && !('costRateSource' in erikFromPm) && !('billableRate' in erikFromPm), JSON.stringify(erikFromPm));
    check('T3: no cost number appears anywhere in the raw body of that list', !asPm.raw.includes('24.58') && !asPm.raw.includes('55.30'), 'found a cost figure');
    const asCosts = await list(S.costs, '?userId=all&from=2026-01-01&to=2026-12-31');
    const erikFromCosts = (asCosts.data?.entries || []).find((e) => e.id === oct.data.entry.id);
    check('T3: a role with time_tracking_costs sees cost 55.3091 and rate 24.5818', erikFromCosts?.cost === 55.3091 && erikFromCosts?.costRate === 24.5818, JSON.stringify(erikFromCosts));
    const own = await list(S.erik, '?from=2026-01-01&to=2026-12-31');
    const ownEntry = (own.data?.entries || []).find((e) => e.id === oct.data.entry.id);
    check('T3: the owner always sees their own cost', ownEntry?.cost === 55.3091);
    check('T3: ...but not the billable rate', ownEntry && !('billableRate' in ownEntry));
    const spy = await list(S.erik, `?userId=${USERS.free.id}&from=2026-01-01&to=2026-12-31`);
    check('T3: asking for a colleague without time_tracking_team returns only own entries', (spy.data?.entries || []).every((e) => e.userId === USERS.erik.id) && !spy.raw.includes('Contract work'), spy.raw.slice(0, 200));

    section('T4: ownership');
    const forged = await te(S.erik, { action: 'create', userId: USERS.free.id, description: 'x', entryDate: '2026-10-14', durationSec: 60 });
    check('T4: an Employee cannot log time for someone else', forged.status === 403);
    const touch = await te(S.erik, { action: 'update', id: free.data.entry.id, description: 'hacked' });
    check('T4: ...nor edit or delete a colleague\'s entry', touch.status === 403 && (await te(S.erik, { action: 'delete', id: free.data.entry.id })).status === 403);
    check('T4: the colleague\'s entry is untouched in the database', dbEntry(free.data.entry.id)?.description === 'Contract work' && dbEntry(free.data.entry.id)?.deleted_at === null);
    const forPm = await te(S.pm, { action: 'create', userId: USERS.erik.id, description: 'Logged by manager', entryDate: '2026-10-16', durationSec: 1800, source: 'day' });
    const forPmRow = dbEntry(forPm.data?.entry?.id);
    check('T4: a manager may log time for Erik: owner Erik, recorded by the manager', forPmRow?.user_id === USERS.erik.id && forPmRow?.recorded_by_user_id === USERS.pm.id && forPmRow?.employee_id === 'emp-erik', JSON.stringify(forPmRow));

    section('T5: one running timer per user, and Undo');
    const a = await te(S.erik, { action: 'start', description: 'Timer A' });
    check('T5: start returns 201 with a running entry', a.status === 201 && a.data?.entry?.running === true, a.raw);
    const b = await te(S.erik, { action: 'start', description: 'Timer B' });
    check('T5: starting B stops A and returns it', b.data?.stopped?.id === a.data.entry.id && b.data?.stopped?.running === false && b.data.entry.running === true, b.raw);
    const running = rows(`SELECT id FROM time_entries WHERE user_id='tt-erik' AND start_at IS NOT NULL AND end_at IS NULL AND deleted_at IS NULL`);
    check('T5: exactly one running entry in the database', running.length === 1 && running[0].id === b.data.entry.id);
    // A stale tab offering "Start" on what already runs must not split it into a new entry.
    const restart = await te(S.erik, { action: 'start', description: 'Timer B' });
    check('T5: starting the running target again is refused with the running entry', restart.status === 409 && restart.data?.code === 'already_running' && restart.data?.entry?.id === b.data.entry.id && dbEntry(b.data.entry.id)?.end_at === null, restart.raw);
    const stoppedRow = dbEntry(a.data.entry.id);
    check('T5: the stopped entry was priced when it stopped', stoppedRow?.cost_rate !== null && stoppedRow?.duration_sec !== null, JSON.stringify(stoppedRow));
    // The database itself refuses a second running row.
    let dup = false;
    try {
      sql(`INSERT INTO time_entries (id, user_id, recorded_by_user_id, entry_date, start_at) VALUES ('te-dup', 'tt-erik', 'tt-erik', CURDATE(), UTC_TIMESTAMP())`);
    } catch { dup = true; }
    check('T5: UNIQUE running_guard rejects a second running timer for the same user', dup);
    const undo = await te(S.erik, { action: 'undo_start', newId: b.data.entry.id, stoppedId: a.data.entry.id });
    check('T5: Undo removes B and reopens A', undo.status === 200 && undo.data?.entry?.running === true && !dbEntry(b.data.entry.id), undo.raw);
    const runningNow = await api(S.erik, 'time_entries.php', { query: '?running=1' });
    check('T5: ?running=1 returns A', runningNow.data?.entry?.id === a.data.entry.id);
    const stop = await te(S.erik, { action: 'stop' });
    check('T5: an Employee who cannot pick a project is not blocked by "require a project"', stop.status === 200 && stop.data?.entry?.running === false && stop.data.entry.projectId === null, stop.raw);
    check('T5: stopping twice is idempotent', (await te(S.erik, { action: 'stop', id: a.data.entry.id })).status === 200);
    const m1 = await te(S.pm, { action: 'start', description: 'Manager timer' });
    const m1Stop = await te(S.pm, { action: 'stop' });
    check('T5: someone who can pick a project must (project_required on stop)', m1.status === 201 && m1Stop.status === 422 && m1Stop.data?.code === 'project_required', m1Stop.raw);
    const m1Stop2 = await te(S.pm, { action: 'stop', projectId: 'proj-tt-1' });
    check('T5: stopping with a project saves it and prices the entry', m1Stop2.status === 200 && m1Stop2.data?.entry?.projectId === 'proj-tt-1' && m1Stop2.data.entry.running === false, m1Stop2.raw);

    section('T6: the title of a linked entry is the task\'s');
    const linked = await te(S.erik, { action: 'create', taskId: 'task-tt-1', description: 'must be dropped', entryDate: '2026-10-14', durationSec: 3600, source: 'day' });
    const linkedRow = dbEntry(linked.data?.entry?.id);
    check('T6: a task-linked entry stores NO description', linked.status === 201 && linkedRow?.description === null, JSON.stringify(linkedRow));
    check('T6: title and titleSource come from the task, the project from the task', linked.data?.entry?.title === 'Write the offer' && linked.data.entry.titleSource === 'task' && linked.data.entry.projectId === 'proj-tt-1', linked.raw);
    check('T6: title_snapshot is written', linkedRow?.title_snapshot === 'Write the offer');
    sql(`UPDATE tasks SET title='Write the revised offer' WHERE id='task-tt-1'`);
    const renamed = (await list(S.erik, '?from=2026-10-01&to=2026-10-31')).data.entries.find((e) => e.id === linked.data.entry.id);
    check('T6: renaming the task renames the entry (live join)', renamed?.title === 'Write the revised offer', JSON.stringify(renamed));
    const unlinked = await te(S.erik, { action: 'update', id: linked.data.entry.id, taskId: null });
    check('T6: unlinking makes the title the entry\'s own, prefilled with the task\'s current title', unlinked.data?.entry?.titleSource === 'entry' && unlinked.data.entry.title === 'Write the revised offer' && dbEntry(linked.data.entry.id)?.description === 'Write the revised offer', unlinked.raw);
    const relinked = await te(S.erik, { action: 'update', id: linked.data.entry.id, taskId: 'task-tt-1' });
    check('T6: linking a standalone entry drops its own description', relinked.data?.entry?.titleSource === 'task' && dbEntry(linked.data.entry.id)?.description === null);
    sql(`DELETE FROM tasks WHERE id='task-tt-1'`);
    const orphan = (await list(S.erik, '?from=2026-10-01&to=2026-10-31')).data.entries.find((e) => e.id === linked.data.entry.id);
    check('T6: a deleted task leaves the entry, greyed out with its snapshot title', orphan?.titleDeleted === true && orphan?.title === 'Write the revised offer', JSON.stringify(orphan));
    const secret = await te(S.erik, { action: 'create', taskId: 'task-tt-2', entryDate: '2026-10-14', durationSec: 60 });
    check('T6: a task the caller cannot see cannot be linked (no title leaks)', secret.status === 403 && !secret.raw.includes('Secret task'), secret.raw);
    const noSuchProject = await te(S.erik, { action: 'create', description: 'p', projectId: 'proj-tt-2', entryDate: '2026-10-14', durationSec: 60 });
    check('T6: an Employee without the projects module cannot pick a project directly', noSuchProject.status === 403, noSuchProject.raw);
    const mismatch = await te(S.admin, { action: 'create', taskId: 'task-tt-3', projectId: 'proj-tt-1', entryDate: '2026-10-14', durationSec: 60 });
    check('T6: a task without a project accepts a project for this entry', mismatch.status === 201 && mismatch.data?.entry?.projectId === 'proj-tt-1', mismatch.raw);

    section('T7: validation');
    check('T7: end before start is refused', (await te(S.erik, { action: 'create', description: 'x', startAt: '2026-10-14T10:00:00Z', endAt: '2026-10-14T09:00:00Z' })).data?.code === 'end_before_start');
    check('T7: more than 24 h is refused', (await te(S.erik, { action: 'create', description: 'x', entryDate: '2026-10-14', durationSec: 90000 })).data?.code === 'duration_out_of_range');
    check('T7: a timed entry needs an end or a duration', (await te(S.erik, { action: 'create', description: 'x', startAt: '2026-10-14T10:00:00Z' })).data?.code === 'duration_required');
    const timed = await te(S.erik, { action: 'create', description: 'Timed', startAt: '2026-10-14T10:00:00Z', endAt: '2026-10-14T11:30:00Z' });
    check('T7: start+end gives the duration and the company-timezone date', timed.data?.entry?.durationSec === 5400 && timed.data.entry.entryDate === '2026-10-14', timed.raw);
    check('T7: an unknown action is refused', (await te(S.erik, { action: 'nope' })).status === 400);

    section('T8: soft delete and restore');
    const del = await te(S.erik, { action: 'delete', id: timed.data.entry.id });
    check('T8: delete is soft', del.status === 200 && dbEntry(timed.data.entry.id)?.deleted_at !== null);
    check('T8: a deleted entry is not listed', !(await list(S.erik, '?from=2026-10-01&to=2026-10-31')).data.entries.some((e) => e.id === timed.data.entry.id));
    check('T8: restore brings it back', (await te(S.erik, { action: 'restore', id: timed.data.entry.id })).data?.entry?.id === timed.data.entry.id);

    section('T9: settings');
    const getSettings = await api(S.erik, 'time_entries.php', { query: '?action=settings' });
    check('T9: any user of the module reads the settings, with the default calendar and their own', getSettings.data?.settings?.hoursPerDay === 8 && getSettings.data.defaultCountry === 'SK' && getSettings.data.me?.workCountry === 'SK', getSettings.raw);
    check('T9: an Employee cannot change the settings', (await te(S.erik, { action: 'settings', settings: { hoursPerDay: 1 } })).status === 403);
    const saved = await te(S.admin, { action: 'settings', settings: { hoursPerDay: 7.5, employerMultiplier: 1.4, holidayOverrides: { HU: { 2026: [{ date: '2026-08-21', kind: 'extraDayOff', name: 'Bridge day' }, { date: '2025-01-01', kind: 'extraDayOff', name: 'wrong year' }, { date: '2026-08-08', kind: 'nonsense', name: 'x' }] } } } });
    check('T9: the admin saves; bad overrides are dropped', saved.data?.settings?.hoursPerDay === 7.5 && saved.data.settings.holidayOverrides.HU['2026']?.length === 1, saved.raw);
    sql(`UPDATE employees SET work_country='HU' WHERE id='emp-erik'`);
    const aug = await te(S.erik, { action: 'create', description: 'Aug', entryDate: '2026-08-14', durationSec: 3600, source: 'day' });
    // HU Aug 2026: 21 weekdays - 20 Aug (Thu) - the override 21 Aug = 19 days; rate 3200 / (19 x 7.5) x 1.4
    check('T9: the override changes the working days used for the rate (19 days)', dbEntry(aug.data?.entry?.id)?.cost_rate_basis_days === '19' && dbEntry(aug.data.entry.id)?.cost_rate === '31.4386', JSON.stringify(dbEntry(aug.data?.entry?.id)));
    sql(`UPDATE employees SET work_country=NULL WHERE id='emp-erik'`);

    section('T11: re-price a period');
    const noRateRow = dbEntry(pmEntry.data.entry.id);
    check('T11: the manager entry starts with no rate', noRateRow?.cost_rate_source === 'none');
    sql(`INSERT INTO employees (id, name, kind, user_id, salary_type, salary_amount, is_active) VALUES ('emp-pm', 'TT Manager', 'employee', 'tt-pm', 'hourly', 10, 1)`);
    check('T11: re-pricing is admin only', (await te(S.pm, { action: 'reprice', from: '2026-10-01', to: '2026-10-31' })).status === 403);
    const rp = await te(S.admin, { action: 'reprice', from: '2026-10-01', to: '2026-10-31' });
    check('T11: the admin re-prices October (a month-picker end of the 31st is accepted)', rp.status === 200 && rp.data?.repriced >= 3, rp.raw);
    const pricedRow = dbEntry(pmEntry.data.entry.id);
    check('T11: the entry that had no rate is now priced: hourly 10 x 1.4 (saved multiplier)', pricedRow?.cost_rate === '14.0000' && pricedRow?.cost === '14.0000' && pricedRow?.employee_id === 'emp-pm', JSON.stringify(pricedRow));

    section('T10: holidays');
    const hol = await api(S.erik, 'holidays.php', { query: '?country=SK&year=2026' });
    const dates = (hol.data?.days || []).map((d) => d.date);
    check('T10: Slovakia 2026 lists 1 May, and neither 8 May nor 15 Sept (not rest days in 2026)', dates.includes('2026-05-01') && !dates.includes('2026-05-08') && !dates.includes('2026-09-15'), dates.join(','));
    check('T10: ...and 11 days of rest in total', dates.length === 11, String(dates.length));
    const huHol = await api(S.erik, 'holidays.php', { query: '?country=HU&year=2026' });
    check('T10: Hungary 2026 has 23 Oct and no invented 24 Dec', (huHol.data?.days || []).some((d) => d.date === '2026-10-23') && !(huHol.data?.days || []).some((d) => d.date === '2026-12-24'));
    check('T10: bad requests are refused', (await api(S.erik, 'holidays.php', { query: '?country=DE&year=2026' })).status === 400);
    check('T10: signed-out is refused', (await api(null, 'holidays.php', { query: '?country=SK&year=2026' })).status === 401);

    section('T12: ticket time moves into time_entries, once');
    sql(`INSERT INTO tickets (id, ticket_number, title, status, project_id, assignee_id) VALUES ('tck-tt', 'TCK-TT', 'Legacy ticket', 'open', 'proj-tt-1', 'tt-erik')`);
    sql(`INSERT INTO ticket_time_entries (id, ticket_id, user_id, user_name, minutes, billable, note, logged_at) VALUES ('tte-old', 'tck-tt', 'tt-erik', 'TT Erik', 45, 1, 'old note', '2026-10-02')`);
    sql(`INSERT INTO ticket_time_entries (id, ticket_id, user_name, minutes, billable, logged_at) VALUES ('tte-name', 'tck-tt', 'TT Manager', 15, 1, '2026-10-03')`);
    const migrate = `require '${SCRATCH_DIR}/config.php'; require '${SCRATCH_DIR}/api/schema.php'; require '${SCRATCH_DIR}/api/ticket_time_migration.php'; ccrm_migrate_ticket_time_entries(get_db_connection());`;
    docker('exec', '-u', 'www-data', WEB, 'php', '-r', migrate);
    const copied = rows(`SELECT external_id, user_id, duration_sec, legacy_note, description IS NULL AS blank, source FROM time_entries WHERE source='ticket_legacy' ORDER BY external_id`);
    const byUser = copied.find((r) => r.external_id === 'tte:tte-old');
    const byName = copied.find((r) => r.external_id === 'tte:tte-name');
    check('T12: a row with a real user id is copied, hours-only, note kept, no description of its own', byUser?.user_id === 'tt-erik' && byUser?.duration_sec === '2700' && byUser?.legacy_note === 'old note' && byUser?.blank === '1', JSON.stringify(copied));
    check('T12: a unique name match is accepted', byName?.user_id === 'tt-pm', JSON.stringify(byName));
    docker('exec', '-u', 'www-data', WEB, 'php', '-r', migrate);
    const again = rows(`SELECT id FROM time_entries WHERE source='ticket_legacy'`);
    check('T12: running the migration again inserts nothing', again.length === copied.length, `${again.length} vs ${copied.length}`);
    const hidden = await list(S.erik, '?ticketId=tck-tt&from=2026-01-01&to=2026-12-31');
    check('T12: ticket time is refused without tickets.time', hidden.status === 403, hidden.raw);
    sql(`UPDATE projects SET billable_rate = 80 WHERE id = 'proj-tt-1'`);
    const rated = await te(S.admin, { action: 'create', projectId: 'proj-tt-1', description: 'Rated', entryDate: '2026-10-20', durationSec: 3600, source: 'manual' });
    check('T12: an entry with no rate of its own freezes the project billable rate', dbEntry(rated.data?.entry?.id)?.billable_rate === '80.00', JSON.stringify(dbEntry(rated.data?.entry?.id)));

    section('T13: worked time and parallel cost (TT2 phase 1)');
    sql(`UPDATE system_settings SET value = JSON_SET(value, '$.requireProjectToStop', false) WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
    {
      const round4 = (n) => Math.round(n * 10000) / 10000;
      const near = (a, b, tol = 0.00011) => Math.abs(Number(a) - Number(b)) <= tol;
      const cents = (n) => Number(n).toFixed(2);
      const setLock = (days) => te(S.admin, { action: 'settings', settings: { lockAfterDays: days } });
      // Timed manual entry for Erik; times are UTC on a fixed past day (October 2026, still CEST: UTC+2).
      const mk = (date, from, to, desc, extra = {}) =>
        te(S.erik, { action: 'create', description: desc, startAt: `${date}T${from}:00Z`, endAt: `${date}T${to}:00Z`, source: 'manual', ...extra });
      const row = (r) => dbEntry(r.data?.entry?.id);
      const H2 = 7200000;
      const min = (n) => String(n * 60000);

      // One entry alone.
      const a = await mk('2026-10-05', '09:00', '11:00', 'T13 A');
      check('T13: timed entry A is created', a.status === 201, a.raw);
      let aRow = row(a);
      const rate = Number(aRow?.cost_rate);
      check('T13: A alone: worked_ms = 7 200 000', aRow?.worked_ms === String(H2), JSON.stringify(aRow));
      const fullCost = round4(2 * rate).toFixed(4);
      check('T13: A alone: cost = round4(2 x rate), stored with 4 decimals', rate > 0 && aRow?.cost === fullCost, `${aRow?.cost} vs ${fullCost}`);

      // Identical interval: they split it.
      const b = await mk('2026-10-05', '09:00', '11:00', 'T13 B');
      aRow = row(a);
      let bRow = row(b);
      check('T13: B (identical interval) is created', b.status === 201, b.raw);
      check('T13: identical intervals: A and B each get worked_ms 3 600 000', aRow?.worked_ms === '3600000' && bRow?.worked_ms === '3600000', `${aRow?.worked_ms} / ${bRow?.worked_ms}`);
      check('T13: A.cost + B.cost = the cost of A alone (4 decimals and to the cent)', near(Number(aRow?.cost) + Number(bRow?.cost), fullCost) && cents(Number(aRow?.cost) + Number(bRow?.cost)) === cents(fullCost), `${aRow?.cost} + ${bRow?.cost} vs ${fullCost}`);
      check('T13: B\'s create re-settled A (its stored cost dropped to half)', near(aRow?.cost, rate), aRow?.cost);
      check('T13: project time (duration_sec) is untouched: 7200 each', aRow?.duration_sec === '7200' && bRow?.duration_sec === '7200');

      // Soft delete B, restore B.
      await te(S.erik, { action: 'delete', id: b.data.entry.id });
      aRow = row(a);
      check('T13: deleting B returns A to 7 200 000 and the full cost', aRow?.worked_ms === String(H2) && aRow?.cost === fullCost, JSON.stringify(aRow));
      await te(S.erik, { action: 'restore', id: b.data.entry.id });
      aRow = row(a); bRow = row(b);
      check('T13: restoring B splits them again', aRow?.worked_ms === '3600000' && bRow?.worked_ms === '3600000', `${aRow?.worked_ms} / ${bRow?.worked_ms}`);

      // Move B away.
      const moved = await te(S.erik, { action: 'update', id: b.data.entry.id, startAt: '2026-10-05T13:00:00Z', endAt: '2026-10-05T15:00:00Z' });
      aRow = row(a); bRow = row(b);
      check('T13: moving B so it no longer overlaps: both worked_ms 7 200 000', moved.status === 200 && aRow?.worked_ms === String(H2) && bRow?.worked_ms === String(H2), `${moved.raw.slice(0, 160)} ${aRow?.worked_ms} / ${bRow?.worked_ms}`);
      check('T13: ...and both carry the full cost', aRow?.cost === fullCost && bRow?.cost === fullCost, `${aRow?.cost} / ${bRow?.cost}`);

      // Staggered example of D2 (one day; C overlaps A and B).
      const sa = await mk('2026-10-06', '09:00', '11:00', 'T13 SA');
      const sb = await mk('2026-10-06', '09:30', '10:30', 'T13 SB');
      const sc = await mk('2026-10-06', '10:00', '10:30', 'T13 SC');
      const [ra, rb, rc] = [row(sa), row(sb), row(sc)];
      check('T13: staggered: worked 85 / 25 / 10 minutes in ms', ra?.worked_ms === min(85) && rb?.worked_ms === min(25) && rc?.worked_ms === min(10), `${ra?.worked_ms} / ${rb?.worked_ms} / ${rc?.worked_ms}`);
      check('T13: staggered: sum of worked_ms = 7 200 000 (the union)', Number(ra?.worked_ms) + Number(rb?.worked_ms) + Number(rc?.worked_ms) === H2);
      const sumCost = Number(ra?.cost) + Number(rb?.cost) + Number(rc?.cost);
      check('T13: staggered: sum of cost = the cost of 2 h, to the cent', cents(sumCost) === cents(fullCost) && near(sumCost, fullCost, 0.00031), `${sumCost} vs ${fullCost}`);

      // Hours-only entry on the same day as timed ones.
      const day = await te(S.erik, { action: 'create', description: 'T13 Day', entryDate: '2026-10-06', durationSec: 5400, source: 'day' });
      check('T13: hours-only entry: worked_ms = duration x 1000 (C15)', row(day)?.worked_ms === '5400000', JSON.stringify(row(day)));
      check('T13: ...and the timed entries of that day are untouched by it', row(sa)?.worked_ms === min(85) && row(sb)?.worked_ms === min(25) && row(sc)?.worked_ms === min(10));

      // Running entry.
      const run1 = await te(S.erik, { action: 'start', description: 'T13 running' });
      check('T13: a running entry has worked_ms NULL', run1.status === 201 && row(run1)?.worked_ms === null, run1.raw);
      const stopped = await te(S.erik, { action: 'stop' });
      check('T13: after stop, worked_ms is set', stopped.status === 200 && row(run1)?.worked_ms !== null, JSON.stringify(row(run1)));

      // Lock rule (D3.3): overlapping a locked neighbour. The new entry gets today's date (so the age rule does
      // not lock it itself) but its interval overlaps A on 2026-10-05, which lockAfterDays=1 locks.
      const today = new Date().toISOString().slice(0, 10);
      await setLock(1);
      const blocked = await mk('2026-10-05', '09:30', '10:00', 'T13 overlaps locked', { entryDate: today });
      check('T13: lock: an Employee creating an entry that overlaps a locked entry is refused (entry_locked)', (blocked.status === 409 || blocked.status === 403) && blocked.data?.code === 'entry_locked', blocked.raw);
      check('T13: lock: the refused entry was not stored and A is unchanged', rows(`SELECT id FROM time_entries WHERE description='T13 overlaps locked'`).length === 0 && row(a)?.worked_ms === String(H2));
      const control = await mk('2026-10-20', '09:00', '10:00', 'T13 control, no neighbour', { entryDate: today });
      check('T13: lock (control): the same trick without a locked neighbour is allowed', control.status === 201, control.raw);
      const forErik = await te(S.admin, { action: 'create', userId: USERS.erik.id, description: 'T13 admin override', startAt: '2026-10-05T09:30:00Z', endAt: '2026-10-05T10:00:00Z', entryDate: today, source: 'manual' });
      check('T13: lock: the admin acting for Erik may overlap the locked entry', forErik.status === 201, forErik.raw);
      await setLock(null);
      check('T13: lock: the setting is restored (age lock off again)', (await api(S.erik, 'time_entries.php', { query: '?action=settings' })).data?.settings?.lockAfterDays === null);

      // These two land in a later package of the same phase (D5.3 last row): list and totals expose worked time.
      const listed = (await list(S.erik, '?from=2026-10-05&to=2026-10-06')).data?.entries || [];
      const la = listed.find((e) => e.id === a.data.entry.id);
      check('T13 [later package]: list entries carry workedMs', listed.length > 0 && la?.workedMs !== undefined && la.workedMs !== null && Number(la.workedMs) > 0, JSON.stringify(la));
      const totals = await api(S.erik, 'time_entries.php', { query: '?action=totals' });
      const proj = totals.data?.byProject?.['proj-tt-1'];
      check('T13 [later package]: action=totals carries workedMs next to seconds', !!proj && typeof proj.seconds === 'number' && typeof proj.workedMs === 'number', totals.raw);
    }
    section("T14: today's timer behaviour (REST, extension, MCP)");
    {
      // Baseline for phase 4 (parallel timers): single-timer use must keep behaving like this (A4.4, A4.8, D5.6).
      // Fixture user Erik; every description is unique to this section so earlier counts are untouched.
      const runningRows = () => rows(`SELECT id FROM time_entries WHERE user_id='tt-erik' AND start_at IS NOT NULL AND end_at IS NULL AND deleted_at IS NULL`);
      const countDesc = (d) => rows(`SELECT id FROM time_entries WHERE user_id='tt-erik' AND description=${q(d)} AND deleted_at IS NULL`).length;
      await te(S.erik, { action: 'stop' }); // leftovers of earlier sections (404 when nothing runs)
      check('T14: starting point: Erik has no running entry', runningRows().length === 0);

      // ---- REST (api/time_entries.php) ----
      const ra = await te(S.erik, { action: 'start', description: 'T14 REST A' });
      check('T14 REST: start returns 201, a running entry and stopped null', ra.status === 201 && ra.data?.entry?.running === true && ra.data?.stopped === null, ra.raw);
      const runA = await api(S.erik, 'time_entries.php', { query: '?running=1' });
      // Shape today: { entry: <entry|null>, success }. Phase 4 keeps `entry` and adds running[], paused[], presence, serverNow.
      check('T14 REST: ?running=1 returns { entry } with the running entry', runA.status === 200 && 'entry' in (runA.data || {}) && runA.data.entry?.id === ra.data?.entry?.id, runA.raw);
      const rb = await te(S.erik, { action: 'start', description: 'T14 REST B' });
      check('T14 REST: starting another target returns the stopped entry', rb.status === 201 && rb.data?.stopped?.id === ra.data?.entry?.id && rb.data?.stopped?.running === false, rb.raw);
      check('T14 REST: ...the first entry now has end_at and a duration, only B runs', dbEntry(ra.data?.entry?.id)?.end_at !== null && dbEntry(ra.data?.entry?.id)?.duration_sec !== null && runningRows().length === 1 && runningRows()[0].id === rb.data?.entry?.id);
      const rb2 = await te(S.erik, { action: 'start', description: 'T14 REST B' });
      check('T14 REST: starting the running target again is 409 already_running with the running entry', rb2.status === 409 && rb2.data?.code === 'already_running' && rb2.data?.entry?.id === rb.data?.entry?.id, rb2.raw);
      check('T14 REST: ...and nothing new was stored', countDesc('T14 REST B') === 1 && runningRows().length === 1);
      const undo = await te(S.erik, { action: 'undo_start', newId: rb.data?.entry?.id, stoppedId: ra.data?.entry?.id });
      check('T14 REST: undo_start removes the new entry and reopens the stopped one', undo.status === 200 && undo.data?.entry?.id === ra.data?.entry?.id && undo.data?.entry?.running === true && !dbEntry(rb.data?.entry?.id) && runningRows().length === 1 && runningRows()[0].id === ra.data?.entry?.id, undo.raw);
      const st1 = await te(S.erik, { action: 'stop' });
      const endAfterFirstStop = dbEntry(ra.data?.entry?.id)?.end_at;
      const st2 = await te(S.erik, { action: 'stop', id: ra.data?.entry?.id });
      check('T14 REST: stop ends the running entry', st1.status === 200 && st1.data?.entry?.id === ra.data?.entry?.id && st1.data?.entry?.running === false && endAfterFirstStop !== null, st1.raw);
      check('T14 REST: stopping again is idempotent (200, end_at unchanged)', st2.status === 200 && dbEntry(ra.data?.entry?.id)?.end_at === endAfterFirstStop, st2.raw);
      const runNone = await api(S.erik, 'time_entries.php', { query: '?running=1' });
      check('T14 REST: ?running=1 is { entry: null } with nothing running', runNone.status === 200 && runNone.data?.entry === null, runNone.raw);

      // ---- Chrome extension (api/time_tracker_ext.php, Authorization: Bearer ttk_...) ----
      const ext = (method, action, body, key) =>
        fetch(`${BASE}/ttprobe/api/time_tracker_ext.php${method === 'GET' ? `?action=${action}` : ''}`, {
          method,
          headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: body === undefined ? undefined : JSON.stringify({ action, ...body }),
        }).then(async (res) => { const raw = await res.text(); let data = null; try { data = JSON.parse(raw); } catch {} return { status: res.status, raw, data }; });
      const code = await api(S.erik, 'time_tracker_ext.php', { method: 'POST', body: { action: 'code' } });
      const paired = await ext('POST', 'pair', { code: code.data?.code, deviceName: 'T14 probe', version: '1.0.0' });
      const key = paired.data?.deviceKey;
      check('T14 EXT: a pairing code (session) pairs a device and returns a ttk_ key', code.status === 200 && paired.status === 200 && /^ttk_[a-f0-9]{64}$/.test(key || ''), `${code.raw} / ${paired.raw}`);
      const e0 = await ext('GET', 'running', undefined, key);
      // If this fails with 401 not_paired while the key is right, the container's Apache drops the Authorization header
      // (the same trap scripts/probe-mcp documents); the remaining EXT checks then fail for that reason alone.
      check('T14 EXT: running with the device key returns { entry: null }', e0.status === 200 && e0.data?.entry === null, e0.raw);
      const ea = await ext('POST', 'start', { description: 'T14 EXT A' }, key);
      check('T14 EXT: start returns 201 with a running entry (source extension)', ea.status === 201 && ea.data?.entry?.running === true && dbEntry(ea.data?.entry?.id)?.source === 'extension', ea.raw);
      const e1 = await ext('GET', 'running', undefined, key);
      check('T14 EXT: running returns that entry', e1.data?.entry?.id === ea.data?.entry?.id, e1.raw);
      const rToday = await ext('GET', 'recent', undefined, key); // the popup's "today" data: last 3 stopped entries + todaySeconds
      check('T14 EXT: recent returns { entries[], todaySeconds }', rToday.status === 200 && Array.isArray(rToday.data?.entries) && typeof rToday.data?.todaySeconds === 'number', rToday.raw);
      const rSwitch = await te(S.erik, { action: 'start', description: 'T14 EXT then REST' });
      check('T14 EXT: a REST start while the extension timer runs stops it', rSwitch.status === 201 && rSwitch.data?.stopped?.id === ea.data?.entry?.id && runningRows().length === 1, rSwitch.raw);
      const eSwitch = await ext('POST', 'start', { description: 'T14 EXT B' }, key);
      check('T14 EXT: an extension start while a REST timer runs stops it', eSwitch.status === 201 && eSwitch.data?.stopped?.id === rSwitch.data?.entry?.id && runningRows().length === 1, eSwitch.raw);
      const eStop = await ext('POST', 'stop', {}, key);
      check('T14 EXT: stop ends the running entry', eStop.status === 200 && eStop.data?.entry?.id === eSwitch.data?.entry?.id && eStop.data?.entry?.running === false && runningRows().length === 0, eStop.raw);

      // ---- MCP (api/mcp.php, tools get_running_timer / start_timer / stop_timer) ----
      const token = 'ccrm_mcp_probe_tt_erik_' + '0'.repeat(40);
      sql(`INSERT INTO mcp_keys (id, user_id, key_hash, key_prefix, name, created_at) VALUES ('pk-tt-erik', 'tt-erik', SHA2(${q(token)}, 256), 'ccrm_mcp_p...', 'probe', NOW() - INTERVAL 1 DAY);`);
      let rpcId = 1;
      const mcp = async (tool, args = {}) => {
        const res = await fetch(`${BASE}/ttprobe/api/mcp.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CCRM-MCP-KEY': token },
          body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name: tool, arguments: args } }),
        });
        const raw = await res.text();
        let body = null; try { body = JSON.parse(raw); } catch {}
        const text = body?.result?.content?.[0]?.text;
        let data = null; try { data = JSON.parse(text); } catch {}
        return { status: res.status, raw, isError: !!body?.result?.isError || !!body?.error, data };
      };
      const m0 = await mcp('get_running_timer');
      check('T14 MCP: get_running_timer with nothing running is { running: null }', m0.status === 200 && !m0.isError && m0.data?.running === null, m0.raw);
      const m1 = await mcp('start_timer', { description: 'T14 MCP A' });
      check('T14 MCP: start_timer returns success, a running entry and stopped_previous_id null', !m1.isError && m1.data?.success === true && m1.data?.entry?.running === true && m1.data?.stopped_previous_id === null, m1.raw);
      const m2 = await mcp('get_running_timer');
      check('T14 MCP: get_running_timer returns that entry', m2.data?.running?.id === m1.data?.entry?.id, m2.raw);
      const m3 = await mcp('start_timer', { description: 'T14 MCP B' });
      check('T14 MCP: starting another target reports stopped_previous_id and leaves one running', m3.data?.stopped_previous_id === m1.data?.entry?.id && dbEntry(m1.data?.entry?.id)?.end_at !== null && runningRows().length === 1, m3.raw);
      const m4 = await mcp('stop_timer');
      check('T14 MCP: stop_timer ends the running entry', !m4.isError && m4.data?.success === true && m4.data?.entry?.id === m3.data?.entry?.id && m4.data?.entry?.running === false && runningRows().length === 0, m4.raw);
      const m5 = await mcp('get_running_timer');
      check('T14 MCP: get_running_timer is { running: null } again', m5.data?.running === null, m5.raw);
      // A4.4: REST answers 409 for the running target; MCP start_timer stops it and opens a new entry (one block of work becomes two).
      const s1 = await mcp('start_timer', { description: 'T14 MCP same target' });
      const s2 = await mcp('start_timer', { description: 'T14 MCP same target' });
      check('T14: MCP start_timer of the running target does not split the entry (A4.4, fixed in phase 4) [EXPECTED TO FAIL today]',
        countDesc('T14 MCP same target') === 1 && runningRows().length === 1 && runningRows()[0].id === s1.data?.entry?.id, `${countDesc('T14 MCP same target')} rows; ${s2.raw}`);

      // Leave nothing running for whoever uses Erik after this section.
      await te(S.erik, { action: 'stop' });
      sql(`DELETE FROM mcp_keys WHERE id = 'pk-tt-erik'`);
      check('T14: cleanup: Erik has no running entry', runningRows().length === 0);
    }
    // T13/T14 stop free-text timers; Erik can pick a project, so "require a project" would refuse those stops
    // (that rule is T5's subject). Restore it for anything that runs after.
    sql(`UPDATE system_settings SET value = JSON_SET(value, '$.requireProjectToStop', true) WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
  } finally {
    teardown();
  }
  console.log(`\n${passes} passed, ${failures} failed.`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  teardown();
  process.exit(1);
});
