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
  // Past dates (previous month, fixed Oct 2026 sections) are older than the default lockAfterDays (14): switch the age
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
/** Run PHP against the scratch copy with $pdo connected (the rate card has no HTTP surface of its own). */
const php = (code) =>
  docker('exec', '-u', 'www-data', WEB, 'php', '-r',
    `require '${SCRATCH_DIR}/config.php'; require_once '${SCRATCH_DIR}/api/schema.php'; require_once '${SCRATCH_DIR}/api/time_entries_lib.php'; require_once '${SCRATCH_DIR}/api/time_rate_card.php'; $pdo = get_db_connection(); ${code}`);

// Date-independent months (TT2 phase 3): the current and the previous calendar month are always open
// (C12 freezes a month at the start of month + 2), so the probe prices entries there and reads the expected
// working days from the same holiday calendar the PHP uses, instead of hard-coding May / October 2026.
const monthOffset = (back) => {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
  const ym = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  return { ym, year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, last: new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) };
};
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const near = (actual, expected) => actual !== null && actual !== undefined && Math.abs(Number(actual) - expected) < 0.00011;
const MULT = 1.352; // default employer multiplier; Erik: EUR 3200 / month, 8 h per day
const monthlyRate = (days) => round4((3200 / (days * 8)) * MULT);

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
    // M1 = previous month, M2 = current month: both open on any date. wd() = working days from the PHP calendar.
    const M1 = monthOffset(1);
    const M2 = monthOffset(0);
    const wd = (country, m) => parseInt(php(`echo ccrm_holidays_working_days($pdo, '${country}', ${m.year}, ${m.month}, [], false);`).trim(), 10);
    const skDays1 = wd('SK', M1);
    const skDays2 = wd('SK', M2);
    const huDays1 = wd('HU', M1);
    const rate1 = monthlyRate(skDays1);
    const cost1 = round4((8100 / 3600) * rate1); // a 2:15:00 entry
    const oct = await te(S.erik, { action: 'create', description: 'Offer work', entryDate: `${M1.ym}-14`, durationSec: 8100, source: 'day' });
    check('T2: create returns 201', oct.status === 201, oct.raw);
    const octRow = dbEntry(oct.data?.entry?.id);
    check(`T2: Erik ${M1.ym} SK -> 3200 / (${skDays1} x 8) x 1.352 = ${rate1}/h, source monthly`, near(octRow?.cost_rate, rate1) && octRow?.cost_rate_source === 'monthly' && octRow?.cost_rate_basis_days === String(skDays1), JSON.stringify(octRow));
    check(`T2: a 2:15:00 entry costs ${cost1} (4 decimals, D3.2)`, near(octRow?.cost, cost1), octRow?.cost);
    check('T2: employee_id is resolved from the owner', octRow?.employee_id === 'emp-erik');
    const may = await te(S.erik, { action: 'create', description: 'May work', entryDate: `${M2.ym}-12`, durationSec: 3600, source: 'day' });
    const mayRow = dbEntry(may.data?.entry?.id);
    check(`T2: Erik ${M2.ym} (${skDays2} days) -> ${monthlyRate(skDays2)}/h, priced with its own month's days`, near(mayRow?.cost_rate, monthlyRate(skDays2)) && mayRow?.cost_rate_basis_days === String(skDays2), JSON.stringify(mayRow));
    const free = await te(S.free, { action: 'create', description: 'Contract work', entryDate: `${M1.ym}-14`, durationSec: 3600, source: 'day' });
    const freeRow = dbEntry(free.data?.entry?.id);
    check('T2: freelancer hourly 20 -> flat 20.00, no multiplier', freeRow?.cost_rate === '20.0000' && freeRow?.cost_rate_source === 'contractor_hourly' && freeRow?.cost === '20.0000', JSON.stringify(freeRow));
    const pmEntry = await te(S.pm, { action: 'create', description: 'Manager work', entryDate: `${M1.ym}-14`, durationSec: 3600, source: 'day' });
    const pmRow = dbEntry(pmEntry.data?.entry?.id);
    check('T2: no employee linked -> no rate, cost NULL', pmRow?.cost_rate === null && pmRow?.cost_rate_source === 'none' && pmRow?.cost === null && pmRow?.employee_id === null, JSON.stringify(pmRow));
    // Same salary, Hungarian calendar: give Erik the HU calendar and add a second October entry.
    sql(`UPDATE employees SET work_country='HU' WHERE id='emp-erik'`);
    const hu = await te(S.erik, { action: 'create', description: 'HU calendar', entryDate: `${M1.ym}-15`, durationSec: 3600, source: 'day' });
    const huRow = dbEntry(hu.data?.entry?.id);
    const rateHu1 = monthlyRate(huDays1);
    check(`T2: ${M1.ym} in Hungary has ${huDays1} working days (SK ${skDays1}) -> ${rateHu1}/h`, near(huRow?.cost_rate, rateHu1) && huRow?.cost_rate_basis_days === String(huDays1), JSON.stringify(huRow));
    // C12 (TT2 phase 3): October is still open, so the calendar change re-priced the earlier October entry too.
    check(`T2: an open month follows the calendar: the earlier ${M1.ym} entry is re-priced to ${rateHu1}`, near(dbEntry(oct.data.entry.id)?.cost_rate, rateHu1), JSON.stringify(dbEntry(oct.data.entry.id)));
    sql(`UPDATE employees SET work_country=NULL WHERE id='emp-erik'`);
    php(`ccrm_tt_rate_for($pdo, 'emp-erik', '${M1.ym}', ccrm_tt_load_settings($pdo), true);`);
    check(`T2: ...and back to ${rate1} (cost ${cost1}) once the rate card sees the SK calendar again`, near(dbEntry(oct.data.entry.id)?.cost_rate, rate1) && near(dbEntry(oct.data.entry.id)?.cost, cost1), JSON.stringify(dbEntry(oct.data.entry.id)));

    section('T3: cost visibility is enforced by the server');
    const asPm = await list(S.pm, `?userId=all&from=${M1.ym}-01&to=${M2.last}`);
    const erikFromPm = (asPm.data?.entries || []).find((e) => e.id === oct.data.entry.id);
    check('T3: a manager (team, no costs) sees the entry', !!erikFromPm);
    check('T3: ...without cost, rate, source or billable rate', erikFromPm && !('cost' in erikFromPm) && !('costRate' in erikFromPm) && !('costRateSource' in erikFromPm) && !('billableRate' in erikFromPm), JSON.stringify(erikFromPm));
    check('T3: no cost number appears anywhere in the raw body of that list', !asPm.raw.includes(rate1.toFixed(2)) && !asPm.raw.includes(cost1.toFixed(2)), 'found a cost figure');
    const asCosts = await list(S.costs, `?userId=all&from=${M1.ym}-01&to=${M2.last}`);
    const erikFromCosts = (asCosts.data?.entries || []).find((e) => e.id === oct.data.entry.id);
    check(`T3: a role with time_tracking_costs sees cost ${cost1} and rate ${rate1}`, near(erikFromCosts?.cost, cost1) && near(erikFromCosts?.costRate, rate1), JSON.stringify(erikFromCosts));
    const own = await list(S.erik, `?from=${M1.ym}-01&to=${M2.last}`);
    const ownEntry = (own.data?.entries || []).find((e) => e.id === oct.data.entry.id);
    check('T3: the owner always sees their own cost', near(ownEntry?.cost, cost1));
    check('T3: ...but not the billable rate', ownEntry && !('billableRate' in ownEntry));
    const spy = await list(S.erik, `?userId=${USERS.free.id}&from=${M1.ym}-01&to=${M2.last}`);
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
    // Phase 4 (D5.1): running_guard is a plain index, so the database accepts a second running row; the per-user
    // lock in time_presence serialises timer writes instead (T15 races two starts).
    const guardIdx = rows(`SELECT INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'running_guard'`);
    check('T5: running_guard has the plain index idx_te_running and no unique key (D5.1)', guardIdx.length === 1 && guardIdx[0].INDEX_NAME === 'idx_te_running' && guardIdx[0].NON_UNIQUE === '1', JSON.stringify(guardIdx));
    check('T5: the per-user lock table time_presence exists', rows(`SHOW TABLES LIKE 'time_presence'`).length === 1);
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
    check('T11: re-pricing is admin only', (await te(S.pm, { action: 'reprice', from: `${M1.ym}-01`, to: M1.last })).status === 403);
    const rp = await te(S.admin, { action: 'reprice', from: `${M1.ym}-01`, to: M1.last });
    check(`T11: the admin re-prices ${M1.ym} (a month-picker end on the last day of the month is accepted)`, rp.status === 200 && rp.data?.repriced >= 3, rp.raw);
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
      // A4.4: starting the running target changes nothing (REST answers 409; MCP answers success:false, code already_running).
      const s1 = await mcp('start_timer', { description: 'T14 MCP same target' });
      const s2 = await mcp('start_timer', { description: 'T14 MCP same target' });
      check('T14: MCP start_timer of the running target does not split the entry (A4.4, fixed in phase 4)',
        countDesc('T14 MCP same target') === 1 && runningRows().length === 1 && runningRows()[0].id === s1.data?.entry?.id, `${countDesc('T14 MCP same target')} rows; ${s2.raw}`);
      check('T14 MCP: ...it answers success:false, code already_running, with the running entry (not an error)',
        !s2.isError && s2.data?.success === false && s2.data?.code === 'already_running' && s2.data?.entry?.id === s1.data?.entry?.id, s2.raw);

      // Leave nothing running for whoever uses Erik after this section.
      await te(S.erik, { action: 'stop' });
      sql(`DELETE FROM mcp_keys WHERE id = 'pk-tt-erik'`);
      check('T14: cleanup: Erik has no running entry', runningRows().length === 0);
    }
    section('T15: parallel timers (phase 4)');
    {
      // D5.1–D5.3. Erik (role Employee, index 2 of ROLES_RBAC in setup) gets `time_tracking_parallel` here and loses it at the end;
      // `parallel` settings are written straight into TIME_TRACKING_SETTINGS and removed at the end. requireProjectToStop is still
      // false (T13 switched it off; restored after this section).
      const runningRows = () => rows(`SELECT id FROM time_entries WHERE user_id='tt-erik' AND start_at IS NOT NULL AND end_at IS NULL AND deleted_at IS NULL ORDER BY start_at, id`);
      const setParallel = (p) => sql(`UPDATE system_settings SET value = JSON_SET(value, '$.parallel', CAST(${q(JSON.stringify(p))} AS JSON)) WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
      const grant = (on) => sql(on
        ? `UPDATE system_settings SET value = JSON_SET(value, '$[2].permissions.time_tracking_parallel', 'edit') WHERE \`key\` = 'ROLES_RBAC'`
        : `UPDATE system_settings SET value = JSON_REMOVE(value, '$[2].permissions.time_tracking_parallel') WHERE \`key\` = 'ROLES_RBAC'`);
      const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const ON = { enabled: true, maxParallel: 4, sameProject: 'differentTasks' };

      const roleName = rows(`SELECT JSON_UNQUOTE(JSON_EXTRACT(value, '$[2].name')) AS n FROM system_settings WHERE \`key\` = 'ROLES_RBAC'`)[0]?.n;
      check('T15: setup: ROLES_RBAC[2] is the Employee role Erik has', roleName === 'Employee', roleName);
      await te(S.erik, { action: 'stop', all: true });
      check('T15: starting point: Erik has no running entry', runningRows().length === 0);
      for (const [id, title] of [['task-tt-p1', 'T15 task one'], ['task-tt-p2', 'T15 task two'], ['task-tt-p3', 'T15 task three']]) {
        sql(`INSERT INTO tasks (id, title, priority, deadline, status, owner, created_by, related_project_id) VALUES (${q(id)}, ${q(title)}, 'medium', '2026-12-31', 'todo', 'TT Erik', 'TT Erik', 'proj-tt-1');`);
      }
      setParallel(ON);
      grant(true);

      // Two parallel starts; differentTasks lets two different tasks of proj-tt-1 run together.
      const p1 = await te(S.erik, { action: 'start', taskId: 'task-tt-p1', startedAt: iso(Date.now() - 120000) });
      const p2 = await te(S.erik, { action: 'start', taskId: 'task-tt-p2', mode: 'parallel' });
      check('T15: a parallel start (two different tasks of one project) returns 201 and stops nothing', p1.status === 201 && p2.status === 201 && p2.data?.stopped === null && Array.isArray(p2.data?.stoppedAll) && p2.data.stoppedAll.length === 0, `${p1.raw} / ${p2.raw}`);
      check('T15: ...both run in the database', runningRows().length === 2 && dbEntry(p1.data?.entry?.id)?.end_at === null);
      const gr = await api(S.erik, 'time_entries.php', { query: '?running=1' });
      // Two starts in one second tie on start_at; the order is (start_at, id), the same as runningRows().
      check('T15: ?running=1 lists both (oldest first, ties by id), entry = the first, paused [], presence null, serverNow',
        gr.status === 200 && gr.data?.running?.length === 2 && gr.data.running.map((e) => e.id).join() === runningRows().map((e) => e.id).join() && gr.data.entry?.id === runningRows()[0]?.id
          && Array.isArray(gr.data.paused) && gr.data.paused.length === 0 && gr.data.presence === null && typeof gr.data.serverNow === 'string', gr.raw);

      // The identical target never runs twice.
      const same = await te(S.erik, { action: 'start', taskId: 'task-tt-p1', mode: 'parallel' });
      check('T15: parallel start of the running target is 409 already_running with that entry', same.status === 409 && same.data?.code === 'already_running' && same.data?.entry?.id === p1.data?.entry?.id && runningRows().length === 2, same.raw);
      // A switch to a target among several running stops the others (T15b checks it).

      // sameProject 'never'.
      setParallel({ ...ON, sameProject: 'never' });
      const never = await te(S.erik, { action: 'start', taskId: 'task-tt-p3', mode: 'parallel' });
      check('T15: sameProject never: a third task of the same project is 409 same_project', never.status === 409 && never.data?.code === 'same_project' && runningRows().length === 2, never.raw);

      // The cap.
      setParallel({ ...ON, maxParallel: 2, sameProject: 'always' });
      const cap = await te(S.erik, { action: 'start', description: 'T15 over the cap', mode: 'parallel' });
      check('T15: maxParallel 2 with two running: a third is 409 parallel_limit', cap.status === 409 && cap.data?.code === 'parallel_limit' && runningRows().length === 2, cap.raw);

      // Off, and no permission.
      setParallel({ ...ON, enabled: false });
      const off = await te(S.erik, { action: 'start', description: 'T15 disabled', mode: 'parallel' });
      check('T15: parallel disabled: 409 parallel_disabled', off.status === 409 && off.data?.code === 'parallel_disabled' && runningRows().length === 2, off.raw);
      setParallel(ON);
      grant(false);
      const noPerm = await te(S.erik, { action: 'start', description: 'T15 forbidden', mode: 'parallel' });
      check('T15: without time_tracking_parallel: 409 parallel_forbidden', noPerm.status === 409 && noPerm.data?.code === 'parallel_forbidden' && runningRows().length === 2, noPerm.raw);
      grant(true);

      // A third item (free text, no project), then stop without an id is ambiguous.
      const p3 = await te(S.erik, { action: 'start', description: 'T15 free C', mode: 'parallel' });
      check('T15: a third parallel item (free text) starts', p3.status === 201 && runningRows().length === 3, p3.raw);
      const amb = await te(S.erik, { action: 'stop' });
      check('T15: stop without an id while several run is 409 ambiguous with running[]', amb.status === 409 && amb.data?.code === 'ambiguous' && amb.data?.running?.length === 3 && runningRows().length === 3, amb.raw);

      // switch with three running stops three; undo reopens all three.
      const sw = await te(S.erik, { action: 'start', description: 'T15 switch D' });
      const threeIds = [p1, p2, p3].map((r) => r.data?.entry?.id);
      check('T15: switch (no mode) with three running stops all three: stoppedAll 3, stopped = the first',
        sw.status === 201 && sw.data?.stoppedAll?.length === 3 && sw.data.stopped?.id === p1.data?.entry?.id && threeIds.every((id) => sw.data.stoppedAll.some((e) => e.id === id && e.running === false)), sw.raw);
      check('T15: ...only the new entry runs', runningRows().length === 1 && runningRows()[0].id === sw.data?.entry?.id);
      const undo = await te(S.erik, { action: 'undo_start', newId: sw.data?.entry?.id, stoppedIds: threeIds });
      check('T15: undo_start with stoppedIds removes the new entry and reopens all three',
        undo.status === 200 && undo.data?.reopened?.length === 3 && undo.data.entry?.id === threeIds[0] && !dbEntry(sw.data?.entry?.id) && runningRows().length === 3 && threeIds.every((id) => dbEntry(id)?.end_at === null), undo.raw);

      // stop all.
      const all = await te(S.erik, { action: 'stop', all: true });
      check('T15: stop {all:true} ends every running item', all.status === 200 && all.data?.stoppedAll?.length === 3 && runningRows().length === 0 && threeIds.every((id) => dbEntry(id)?.end_at !== null), all.raw);
      const allAgain = await te(S.erik, { action: 'stop', all: true });
      check('T15: stop {all:true} with nothing running is idempotent (200, empty)', allAgain.status === 200 && allAgain.data?.stoppedAll?.length === 0, allAgain.raw);

      // Two parallel 1 h entries share the hour: 30 min worked each. A window 5 h back, clear of the probe's own timers.
      const t0 = Date.now() - 5 * 3600000;
      const w1 = await te(S.erik, { action: 'start', description: 'T15 worked 1', startedAt: iso(t0) });
      const w2 = await te(S.erik, { action: 'start', description: 'T15 worked 2', startedAt: iso(t0), mode: 'parallel' });
      const s1 = await te(S.erik, { action: 'stop', id: w1.data?.entry?.id, stoppedAt: iso(t0 + 3600000) });
      const s2 = await te(S.erik, { action: 'stop', id: w2.data?.entry?.id, stoppedAt: iso(t0 + 3600000) });
      const [r1, r2] = [dbEntry(w1.data?.entry?.id), dbEntry(w2.data?.entry?.id)];
      check('T15: two parallel 1 h entries: duration 3600 each (project time is not split)', w1.status === 201 && w2.status === 201 && s1.status === 200 && s2.status === 200 && r1?.duration_sec === '3600' && r2?.duration_sec === '3600', `${JSON.stringify(r1)} / ${JSON.stringify(r2)}`);
      check('T15: ...and worked_ms 1 800 000 each (C1)', r1?.worked_ms === '1800000' && r2?.worked_ms === '1800000', `${r1?.worked_ms} / ${r2?.worked_ms}`);

      // A race: two switch starts at the same moment leave exactly one running entry (the per-user lock).
      // Two sessions of Erik (two devices): one PHP session would serialise the requests on its own session-file lock.
      const erik2 = await login(USERS.erik.email);
      const race = await Promise.all([
        te(S.erik, { action: 'start', description: 'T15 race A' }),
        te(erik2, { action: 'start', description: 'T15 race B' }),
      ]);
      check('T15: race: two concurrent switch starts both answer 201', race.every((r) => r.status === 201), race.map((r) => r.raw).join(' / '));
      check('T15: race: exactly one running entry afterwards', runningRows().length === 1, JSON.stringify(runningRows()));

      // T15b: concurrency fixes from review (undo, switch among several, the owner's permission).
      await te(S.erik, { action: 'stop', all: true });
      setParallel({ ...ON, sameProject: 'always' });
      const eid = (r) => r.data?.entry?.id;
      // (a) Undo of an old start after a later one: nothing was undone, so nothing is reopened.
      const u1 = await te(S.erik, { action: 'start', description: 'T15b undo A' });
      const u2 = await te(S.erik, { action: 'start', description: 'T15b undo B' }); // stops A
      const u3 = await te(S.erik, { action: 'start', description: 'T15b undo C' }); // stops B
      const oldUndo = await te(S.erik, { action: 'undo_start', newId: eid(u2), stoppedIds: [eid(u1)] });
      check('T15b: undo of an old start after a later start is 409 conflict', oldUndo.status === 409 && oldUndo.data?.code === 'conflict', oldUndo.raw);
      check('T15b: ...the entry it once stopped stays stopped, the old start stays, only the latest runs',
        dbEntry(eid(u1))?.end_at !== null && !!dbEntry(eid(u2)) && runningRows().length === 1 && runningRows()[0].id === eid(u3), JSON.stringify(runningRows()));
      // (b) Switch to a target that already runs among two: the other stops, the identical one keeps running.
      await te(S.erik, { action: 'stop', all: true });
      const b1 = await te(S.erik, { action: 'start', taskId: 'task-tt-p1' });
      const b2 = await te(S.erik, { action: 'start', taskId: 'task-tt-p2', mode: 'parallel' });
      const bs = await te(S.erik, { action: 'start', taskId: 'task-tt-p2' });
      check('T15b: switch to a running target among two answers 200 alreadyRunning with that entry and stops the other',
        b1.status === 201 && b2.status === 201 && bs.status === 200 && bs.data?.alreadyRunning === true && eid(bs) === eid(b2)
          && bs.data?.stoppedAll?.length === 1 && bs.data.stoppedAll[0].id === eid(b1) && bs.data.stopped?.id === eid(b1), bs.raw);
      check('T15b: ...exactly the identical one runs', runningRows().length === 1 && runningRows()[0].id === eid(b2), JSON.stringify(runningRows()));
      // (c) The permission is the owner's: a manager who has it cannot run a parallel timer for Erik, whose role lacks it.
      await te(S.erik, { action: 'stop', all: true });
      const grantPm = (on) => sql(on
        ? `UPDATE system_settings SET value = JSON_SET(value, '$[1].permissions.time_tracking_parallel', 'edit') WHERE \`key\` = 'ROLES_RBAC'`
        : `UPDATE system_settings SET value = JSON_REMOVE(value, '$[1].permissions.time_tracking_parallel') WHERE \`key\` = 'ROLES_RBAC'`);
      grant(false);
      grantPm(true);
      const c1 = await te(S.erik, { action: 'start', description: 'T15b Erik own' });
      const c2 = await te(S.pm, { action: 'start', userId: USERS.erik.id, description: 'T15b by the manager', mode: 'parallel' });
      check('T15b: a manager with the permission starting parallel for Erik (role without it) is 409 parallel_forbidden',
        c1.status === 201 && c2.status === 409 && c2.data?.code === 'parallel_forbidden' && runningRows().length === 1, c2.raw);
      grantPm(false);
      grant(true);

      // Cleanup.
      await te(S.erik, { action: 'stop', all: true });
      sql(`UPDATE system_settings SET value = JSON_REMOVE(value, '$.parallel') WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
      grant(false);
      check('T15: cleanup: Erik has no running entry, parallel settings and permission removed', runningRows().length === 0);
    }
    // T13/T14 stop free-text timers; Erik can pick a project, so "require a project" would refuse those stops
    // (that rule is T5's subject). Restore it for anything that runs after.
    sql(`UPDATE system_settings SET value = JSON_SET(value, '$.requireProjectToStop', true) WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);

    section('T16: leave-aware rate card (phase 3)');
    {
      // Erik: monthly 3 200 in SK. The open month is the current one (not frozen; the age lock is off);
      // the closed one is the previous month with a closed payroll record. Multiplier and hours per day
      // are whatever T9 saved, read back from the rate card row.
      const near = (a, b, tol = 0.00011) => Math.abs(Number(a) - Number(b)) <= tol;
      const round4 = (n) => Math.round(n * 10000) / 10000;
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 7);
      const pd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1));
      const prev = pd.toISOString().slice(0, 7);
      const card = (m) => rows(`SELECT * FROM time_rate_months WHERE employee_id='emp-erik' AND month=${q(m)}`)[0];
      const audits = (m) => Number(rows(`SELECT COUNT(*) AS n FROM audit_log WHERE action='time_tracking.rate_card' AND detail LIKE ${q(`Rate card emp-erik ${m}:%`)}`)[0]?.n ?? 0);
      // The first two SK working days of a month (weekdays that are not public holidays).
      const holidayCache = {};
      const firstWorkingDays = async (m) => {
        const y = m.slice(0, 4);
        holidayCache[y] ??= new Set(((await api(S.erik, 'holidays.php', { query: `?country=SK&year=${y}` })).data?.days || []).map((d) => d.date));
        const out = [];
        for (let d = new Date(`${m}-01T00:00:00Z`); out.length < 2; d.setUTCDate(d.getUTCDate() + 1)) {
          const ymd = d.toISOString().slice(0, 10);
          if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidayCache[y].has(ymd)) out.push(ymd);
        }
        return out;
      };
      const bookPaidLeave = async (id, m) => {
        const [d1, d2] = await firstWorkingDays(m);
        // 'annual' is a paid type in the EMPLOYEE_SETTINGS.vacationTypes the schema seeds (isPaid: true).
        sql(`INSERT INTO employee_vacations (id, employee_id, vacation_type_id, start_date, end_date, days_count, status) VALUES (${q(id)}, 'emp-erik', 'annual', ${q(d1)}, ${q(d2)}, 2.0, 'approved')`);
      };
      const expected = (row, pl) => round4((3200 * Number(row.multiplier)) / ((Number(row.working_days) - pl) * Number(row.hours_per_day)));
      const day = (desc, date) => te(S.erik, { action: 'create', description: desc, entryDate: date, durationSec: 3600, source: 'day' });

      // ---- open month: leave booked after tracking re-prices the month once ----
      const a = await day('T16 A', today);
      check('T16: an entry in the open month is created and priced monthly', a.status === 201 && dbEntry(a.data?.entry?.id)?.cost_rate_source === 'monthly', a.raw);
      const before = card(month);
      check('T16: the rate card has the open month, no leave, not frozen, same rate as the entry', before && before.paid_leave_days === '0.0' && before.frozen_at === null && before.rate === dbEntry(a.data.entry.id)?.cost_rate, JSON.stringify(before));
      const n0 = audits(month);
      await bookPaidLeave('vac-t16-open', month);
      const b = await day('T16 B', today); // pricing B reads the rate card, which sees the new leave
      const after = card(month);
      const want = after ? expected(after, 2) : NaN;
      check('T16: the rate card row now has 2 paid leave days and the D4.1 rate', after?.paid_leave_days === '2.0' && near(after?.rate, want), `${JSON.stringify(after)} want ${want}`);
      const aRow = dbEntry(a.data?.entry?.id);
      check('T16: the earlier entry A was re-priced: rate = salary x multiplier / ((WD - PL) x H), 4 decimals', near(aRow?.cost_rate, want), `${aRow?.cost_rate} vs ${want}`);
      check('T16: ...and its cost (1 h) follows, written by settle', near(aRow?.cost, want), `${aRow?.cost} vs ${want}`);
      check('T16: the new entry B carries the same rate', b.status === 201 && near(dbEntry(b.data?.entry?.id)?.cost_rate, want), b.raw);
      check('T16: one audit-log line for the re-pricing', audits(month) === n0 + 1, `${audits(month)} vs ${n0 + 1}`);
      const c = await day('T16 C', today);
      php(`echo json_encode(ccrm_tt_rate_card_cron($pdo, true));`);
      check('T16: another entry and a cron pass re-price nothing more (no new audit line)', c.status === 201 && audits(month) === n0 + 1 && near(dbEntry(a.data.entry.id)?.cost_rate, want), `${audits(month)} audit lines`);

      // ---- closed payroll month: not re-priced; the admin "Re-price a period" does recompute ----
      const p = await day('T16 P', `${prev}-10`);
      check('T16: an entry in the previous month is created', p.status === 201, p.raw);
      const p0 = dbEntry(p.data?.entry?.id)?.cost_rate;
      sql(`INSERT INTO employee_salaries (id, employee_id, period_type, period_key, year, period_number, items_json, total_salary, total_paid, status, closed_at) VALUES ('sal-t16', 'emp-erik', 'monthly', ${q(prev)}, ${Number(prev.slice(0, 4))}, ${Number(prev.slice(5, 7))}, '[]', 3200, 3200, 'paid', UTC_TIMESTAMP())`);
      const np0 = audits(prev);
      await bookPaidLeave('vac-t16-closed', prev);
      php(`echo json_encode(ccrm_tt_rate_card_cron($pdo, true));`);
      const frozen = card(prev);
      check('T16: closed payroll month: the entry keeps its rate', p0 && dbEntry(p.data.entry.id)?.cost_rate === p0, `${dbEntry(p.data.entry.id)?.cost_rate} vs ${p0}`);
      check('T16: ...the rate card row is frozen and ignores the new leave', !!frozen?.frozen_at && frozen?.paid_leave_days === '0.0', JSON.stringify(frozen));
      check('T16: ...and no audit line was written for it', audits(prev) === np0, `${audits(prev)} vs ${np0}`);
      const lastDay = new Date(Date.UTC(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const rp = await te(S.admin, { action: 'reprice', from: `${prev}-01`, to: lastDay, userIds: [USERS.erik.id] });
      const re = card(prev);
      const want2 = re ? expected(re, 2) : NaN;
      check('T16: admin re-price of the closed month succeeds', rp.status === 200 && rp.data?.repriced >= 1, rp.raw);
      check('T16: ...recomputes the frozen row (2 paid leave days, frozen_at kept)', re?.paid_leave_days === '2.0' && !!re?.frozen_at && re?.frozen_at === frozen?.frozen_at && near(re?.rate, want2), JSON.stringify(re));
      check('T16: ...and re-prices the entry with the new rate and cost', near(dbEntry(p.data.entry.id)?.cost_rate, want2) && near(dbEntry(p.data.entry.id)?.cost, want2), JSON.stringify(dbEntry(p.data.entry.id)));
    }
    section('T17: the extension with parallel timers (phase 4c)');
    {
      // D5.6: the extension stays single-timer but is safe beside parallel timers. Uses the T15 tasks (proj-tt-1), so
      // requireProjectToStop (true again) never refuses a stop. Pairs its own device: T14's key is out of scope here.
      const runningRows = () => rows(`SELECT id FROM time_entries WHERE user_id='tt-erik' AND start_at IS NOT NULL AND end_at IS NULL AND deleted_at IS NULL ORDER BY start_at, id`);
      const setParallel = (p) => sql(`UPDATE system_settings SET value = JSON_SET(value, '$.parallel', CAST(${q(JSON.stringify(p))} AS JSON)) WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
      const grant = (on) => sql(on
        ? `UPDATE system_settings SET value = JSON_SET(value, '$[2].permissions.time_tracking_parallel', 'edit') WHERE \`key\` = 'ROLES_RBAC'`
        : `UPDATE system_settings SET value = JSON_REMOVE(value, '$[2].permissions.time_tracking_parallel') WHERE \`key\` = 'ROLES_RBAC'`);
      const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const ext = (method, action, body, key) =>
        fetch(`${BASE}/ttprobe/api/time_tracker_ext.php${method === 'GET' ? `?action=${action}` : ''}`, {
          method,
          headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: body === undefined ? undefined : JSON.stringify({ action, ...body }),
        }).then(async (res) => { const raw = await res.text(); let data = null; try { data = JSON.parse(raw); } catch {} return { status: res.status, raw, data }; });

      await te(S.erik, { action: 'stop', all: true });
      check('T17: starting point: Erik has no running entry', runningRows().length === 0);
      const code = await api(S.erik, 'time_tracker_ext.php', { method: 'POST', body: { action: 'code' } });
      const key = (await ext('POST', 'pair', { code: code.data?.code, deviceName: 'T17 probe', version: '1.0.0' })).data?.deviceKey;
      check('T17: a device is paired', /^ttk_[a-f0-9]{64}$/.test(key || ''), code.raw);
      setParallel({ enabled: true, maxParallel: 4, sameProject: 'differentTasks' });
      grant(true);

      const t0 = Date.now() - 60000; // both started a minute ago: worked = 60 s, a plain sum would say 120 s
      const p1 = await te(S.erik, { action: 'start', taskId: 'task-tt-p1', startedAt: iso(t0) });
      const p2 = await te(S.erik, { action: 'start', taskId: 'task-tt-p2', mode: 'parallel', startedAt: iso(t0 + 1000) });
      check('T17: two REST timers run in parallel', p1.status === 201 && p2.status === 201 && runningRows().length === 2, `${p1.raw} / ${p2.raw}`);

      const er = await ext('GET', 'running', undefined, key);
      check('T17: extension running reports count 2, running[2], entry = the first, workedTodaySeconds a number',
        er.status === 200 && er.data?.count === 2 && er.data?.running?.length === 2 && er.data?.entry?.id === p1.data?.entry?.id && typeof er.data?.workedTodaySeconds === 'number', er.raw);
      // Running part = workedTodaySeconds - recent.todaySeconds (closed entries of today).
      const closed = (await ext('GET', 'recent', undefined, key)).data?.todaySeconds;
      const runningPart = er.data?.workedTodaySeconds - closed;
      check('T17: ...the worked clock adds the union of the running intervals (about 60 s, not 120)', runningPart >= 55 && runningPart < 100, `${er.data?.workedTodaySeconds} - ${closed}`);

      const amb = await ext('POST', 'stop', {}, key);
      check('T17: extension stop without an id while two run is 409 ambiguous with running = 2', amb.status === 409 && amb.data?.code === 'ambiguous' && amb.data?.running === 2 && runningRows().length === 2, amb.raw);

      const same = await ext('POST', 'start', { taskId: 'task-tt-p1' }, key);
      check('T17: extension start of a running target is 409 already_running with that entry, nothing stopped',
        same.status === 409 && same.data?.code === 'already_running' && same.data?.entry?.id === p1.data?.entry?.id && runningRows().length === 2, same.raw);

      const sw = await ext('POST', 'start', { taskId: 'task-tt-p3' }, key);
      const ids = [p1, p2].map((r) => r.data?.entry?.id);
      check('T17: extension start switches both off: stoppedAll 2, stopped = the first, one running',
        sw.status === 201 && sw.data?.stoppedAll?.length === 2 && sw.data?.stopped?.id === ids[0] && ids.every((id) => dbEntry(id)?.end_at !== null)
          && runningRows().length === 1 && runningRows()[0].id === sw.data?.entry?.id, sw.raw);

      const one = await ext('POST', 'stop', {}, key);
      check('T17: with one running, extension stop without an id ends it', one.status === 200 && one.data?.entry?.id === sw.data?.entry?.id && runningRows().length === 0, one.raw);

      await te(S.erik, { action: 'stop', all: true });
      sql(`UPDATE system_settings SET value = JSON_REMOVE(value, '$.parallel') WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
      grant(false);
      check('T17: cleanup: Erik has no running entry, parallel settings and permission removed', runningRows().length === 0);
    }
    section('T18: MCP with parallel timers (phase 4)');
    {
      // D5.6: the MCP tools follow the REST contract. Erik gets parallel settings and the permission as in T15; the
      // free-text timers here have no project, so requireProjectToStop is switched off for the section and restored after.
      const runningRows = () => rows(`SELECT id FROM time_entries WHERE user_id='tt-erik' AND start_at IS NOT NULL AND end_at IS NULL AND deleted_at IS NULL ORDER BY start_at, id`);
      const countDesc = (d) => rows(`SELECT id FROM time_entries WHERE user_id='tt-erik' AND description=${q(d)} AND deleted_at IS NULL`).length;
      const setParallel = (p) => sql(`UPDATE system_settings SET value = JSON_SET(value, '$.parallel', CAST(${q(JSON.stringify(p))} AS JSON)) WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
      const grant = (on) => sql(on
        ? `UPDATE system_settings SET value = JSON_SET(value, '$[2].permissions.time_tracking_parallel', 'edit') WHERE \`key\` = 'ROLES_RBAC'`
        : `UPDATE system_settings SET value = JSON_REMOVE(value, '$[2].permissions.time_tracking_parallel') WHERE \`key\` = 'ROLES_RBAC'`);
      const ON = { enabled: true, maxParallel: 4, sameProject: 'differentTasks' };
      const token = 'ccrm_mcp_probe_tt_erik18_' + '0'.repeat(38);
      sql(`INSERT INTO mcp_keys (id, user_id, key_hash, key_prefix, name, created_at) VALUES ('pk-tt-erik18', 'tt-erik', SHA2(${q(token)}, 256), 'ccrm_mcp_p...', 'probe T18', NOW() - INTERVAL 1 DAY);`);
      let rpcId = 1000;
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
      sql(`UPDATE system_settings SET value = JSON_SET(value, '$.requireProjectToStop', false) WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
      await te(S.erik, { action: 'stop', all: true });
      check('T18: starting point: Erik has no running entry', runningRows().length === 0);
      setParallel(ON);
      grant(true);

      const a = await mcp('start_timer', { description: 'T18 MCP A', mode: 'parallel' });
      const b = await mcp('start_timer', { description: 'T18 MCP B', mode: 'parallel' });
      check('T18: two parallel start_timer calls both succeed and stop nothing', !a.isError && !b.isError && a.data?.success === true && b.data?.success === true
        && b.data?.mode === 'parallel' && b.data?.stopped_previous_id === null && Array.isArray(b.data?.stopped_ids) && b.data.stopped_ids.length === 0, `${a.raw} / ${b.raw}`);
      check('T18: ...two entries run in the database', runningRows().length === 2);
      const gr = await mcp('get_running_timer');
      // Two starts in one second tie on start_at and the tie is broken by id: compare with the (start_at, id) order.
      check('T18: get_running_timer lists both in timers (by start_at, id), running = the first, paused []',
        !gr.isError && gr.data?.timers?.length === 2 && gr.data.timers.map((e) => e.id).join() === runningRows().map((e) => e.id).join() && [a.data?.entry?.id, b.data?.entry?.id].every((id) => gr.data.timers.some((e) => e.id === id)) && gr.data.running?.id === runningRows()[0]?.id
          && Array.isArray(gr.data.paused) && gr.data.paused.length === 0, gr.raw);
      const again = await mcp('start_timer', { description: 'T18 MCP A', mode: 'parallel' });
      check('T18: parallel start_timer of a running target: success:false, already_running, nothing new stored',
        !again.isError && again.data?.success === false && again.data?.code === 'already_running' && again.data?.entry?.id === a.data?.entry?.id
          && countDesc('T18 MCP A') === 1 && runningRows().length === 2, again.raw);
      const amb = await mcp('stop_timer');
      check('T18: stop_timer without arguments while several run is an error naming several timers', amb.isError && /several/i.test(amb.raw) && runningRows().length === 2, amb.raw);
      const one = await mcp('stop_timer', { entry_id: b.data?.entry?.id });
      check('T18: stop_timer {entry_id} stops that entry only', !one.isError && one.data?.entry?.id === b.data?.entry?.id && one.data?.entry?.running === false
        && runningRows().length === 1 && runningRows()[0].id === a.data?.entry?.id, one.raw);
      const c = await mcp('start_timer', { description: 'T18 MCP C', mode: 'parallel' });
      check('T18: a third parallel start runs beside A', !c.isError && c.data?.success === true && runningRows().length === 2, c.raw);
      setParallel({ ...ON, enabled: false });
      const off = await mcp('start_timer', { description: 'T18 MCP disabled', mode: 'parallel' });
      check('T18: parallel disabled: start_timer {mode:parallel} is an error naming parallel_disabled', off.isError && off.raw.includes('parallel_disabled') && countDesc('T18 MCP disabled') === 0 && runningRows().length === 2, off.raw);
      setParallel(ON);
      const all = await mcp('stop_timer', { all: true });
      check('T18: stop_timer {all:true} stops every running timer', !all.isError && all.data?.success === true && all.data?.stopped_ids?.length === 2 && all.data?.stopped?.length === 2 && runningRows().length === 0, all.raw);
      const allAgain = await mcp('stop_timer', { all: true });
      check('T18: stop_timer {all:true} with nothing running is idempotent', !allAgain.isError && allAgain.data?.success === true && allAgain.data?.stopped_ids?.length === 0, allAgain.raw);
      const gr0 = await mcp('get_running_timer');
      check('T18: get_running_timer is { running: null, timers: [] } again', gr0.data?.running === null && gr0.data?.timers?.length === 0, gr0.raw);

      // D9: a person's sum is worked time. T15 left two parallel 1 h entries (worked 30 min each), so Erik's project hours exceed his worked hours.
      const sum = await mcp('get_time_tracking_summary', { group_by: 'user' });
      const erikRow = (sum.data?.groups || []).find((g) => g.key === 'tt-erik');
      check('T18: get_time_tracking_summary group_by=user carries worked_hours and leverage per person and in total',
        !sum.isError && typeof erikRow?.worked_hours === 'number' && 'leverage' in (erikRow || {}) && typeof sum.data?.total_worked_hours === 'number', sum.raw);
      check('T18: ...Erik\'s worked hours are below his project hours (the T15 parallel hour counts once)', erikRow && erikRow.worked_hours < erikRow.hours && erikRow.leverage > 1, JSON.stringify(erikRow));
      const byProject = await mcp('get_time_tracking_summary', { group_by: 'project' });
      check('T18: group_by=project is unchanged (no worked_hours)', !byProject.isError && (byProject.data?.groups || []).every((g) => !('worked_hours' in g)) && !('total_worked_hours' in (byProject.data || {})), byProject.raw);

      // Cleanup.
      await te(S.erik, { action: 'stop', all: true });
      sql(`UPDATE system_settings SET value = JSON_REMOVE(value, '$.parallel') WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
      grant(false);
      sql(`UPDATE system_settings SET value = JSON_SET(value, '$.requireProjectToStop', true) WHERE \`key\` = 'TIME_TRACKING_SETTINGS'`);
      sql(`DELETE FROM mcp_keys WHERE id = 'pk-tt-erik18'`);
      check('T18: cleanup: Erik has no running entry', runningRows().length === 0);
    }
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
