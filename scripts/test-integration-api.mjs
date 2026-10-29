#!/usr/bin/env node
/**
 * Probe for the machine API (public/api/integration*.php) against the local Docker backend.
 *
 * The QA suite mocks the backend, so it cannot run PHP. This is the check for /api/v1: the
 * token pipeline (401 / 403 / 413 / 415 / 429), the router (404 / 405), the error envelope, the
 * "no cookie" guarantee, the log contents and the admin endpoint that issues tokens.
 *
 * It never touches the dev data: it clones the dev database into a scratch schema, serves a copy
 * of public/api (and public/.htaccess, so the real rewrite rule is exercised) from a scratch
 * directory of the dev web container, and drops both when done.
 *
 *   npm run test:integration
 *
 * Needs `docker compose up` (containers `crm` and `ccrm-db-1`). Overrides:
 *   CCRM_PROBE_WEB_CONTAINER, CCRM_PROBE_DB_CONTAINER, CCRM_PROBE_DB_ROOT_PASSWORD,
 *   CCRM_PROBE_DEV_DB (database to clone, default ccrm), CCRM_PROBE_URL (default http://127.0.0.1:8085),
 *   CCRM_PROBE_KEEP=1 (leave the scratch copy in place).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WEB = process.env.CCRM_PROBE_WEB_CONTAINER || 'crm';
const DB = process.env.CCRM_PROBE_DB_CONTAINER || 'ccrm-db-1';
const ROOT_PW = process.env.CCRM_PROBE_DB_ROOT_PASSWORD || 'ccrm_root_password';
const DEV_DB = process.env.CCRM_PROBE_DEV_DB || 'ccrm';
const BASE = (process.env.CCRM_PROBE_URL || 'http://127.0.0.1:8085').replace(/\/$/, '');
const SCRATCH_DB = 'ccrm_int_probe';
const SCRATCH_DIR = '/var/www/html/intprobe';
const API = `${BASE}/intprobe/api/v1`;
const ADMIN = `${BASE}/intprobe/api/integration_admin.php`;

const root = fileURLToPath(new URL('../', import.meta.url));

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
const cell = (q) => sql(q).split('\n').slice(1).filter(Boolean)[0]?.split('\t')[0];
const sq = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

let failures = 0, passes = 0;
const check = (name, ok, detail = '') => {
  if (ok) passes++; else failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + String(detail).slice(0, 400)}`);
};
const section = (t) => console.log(`\n== ${t}`);

// Every API response is collected here so "no cookie anywhere" is one assertion at the end.
const cookiesSeen = [];

async function call(path, { method = 'GET', token, headers = {}, body, contentType } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = contentType ?? 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), redirect: 'manual' });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* not JSON */ }
  cookiesSeen.push(...res.headers.getSetCookie());
  return { status: res.status, headers: res.headers, raw, json };
}
const errCode = (r) => r.json?.error?.code;

async function admin(session, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(ADMIN, {
    method,
    headers: { ...(session ? { Cookie: `CCRMSESSID=${session}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, raw, json };
}

async function login(email) {
  const res = await fetch(`${BASE}/intprobe/api/login.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'x' }) });
  if (res.status !== 200) throw new Error(`Login failed for ${email} (${res.status}): ${await res.text()}`);
  // The last one wins: login rotates the session id and may first expire the old cookie.
  const id = res.headers.getSetCookie().map((c) => c.match(/CCRMSESSID=([^;]+)/)?.[1]).filter(Boolean).pop();
  if (!id) throw new Error(`No CCRMSESSID returned for ${email}`);
  return id;
}

// ----------------------------------------------------------------------------- setup
const USERS = {
  admin: ['intp-admin', 'Int Probe Admin', 'Admin'],
  viewer: ['intp-viewer', 'Int Probe Viewer', 'Viewer'],
  phone: ['intp-phone', 'Int Probe Phone', 'Viewer'],
};

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
  docker('cp', root + 'public/api/.', `${WEB}:${SCRATCH_DIR}/api`);
  docker('cp', root + 'public/.htaccess', `${WEB}:${SCRATCH_DIR}/.htaccess`);
  docker('cp', root + 'public/sync.php', `${WEB}:${SCRATCH_DIR}/sync.php`);   // the task checks save through the real sync endpoint
  docker('exec', WEB, 'sh', '-c', `sed "s/define('DB_NAME', '[^']*')/define('DB_NAME', '${SCRATCH_DB}')/" /var/www/html/config.php > ${SCRATCH_DIR}/config.php`);
  docker('exec', WEB, 'chown', '-R', 'www-data:www-data', SCRATCH_DIR);

  // The clone is a copy of the dev database, which predates the integration tables: bring it up to date
  // the way a live request does.
  docker('exec', '-u', 'www-data', WEB, 'php', '-r',
    `require '${SCRATCH_DIR}/config.php'; require '${SCRATCH_DIR}/api/schema.php'; ccrm_apply_schema(get_db_connection());`);

  for (const [id, name, role] of Object.values(USERS)) {
    sql(`DELETE FROM users WHERE id=${sq(id)} OR email=${sq(id + '@probe.test')};
         INSERT INTO users (id,name,email,password_hash,role) VALUES (${sq(id)},${sq(name)},${sq(id + '@probe.test')},'x',${sq(role)});`);
  }
  // A phone for /users: it lives on the linked employee, not on the user.
  sql(`DELETE FROM employees WHERE id='intp-emp';
       INSERT INTO employees (id,name,user_id,phone,is_active) VALUES ('intp-emp','Int Probe Phone','intp-phone','0905 123 456',1);`);
  // Fixed settings, so the task checks do not depend on how the dev database is configured.
  sql(`REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('TASK_STATES', '["todo","in_progress","review","done"]'), ('SYSTEM_LANGUAGE', 'en'), ('APP_BASE_URL', 'https://crm.test/');`);
}

function teardown() {
  if (process.env.CCRM_PROBE_KEEP) return;
  try { sql(`DROP DATABASE IF EXISTS ${SCRATCH_DB};`, 'mysql'); } catch (e) { console.log('cleanup (db):', e.message); }
  try { docker('exec', WEB, 'sh', '-c', `rm -rf ${SCRATCH_DIR}`); } catch (e) { console.log('cleanup (files):', e.message); }
}

const ALL_SCOPES = ['users:read', 'directory:read', 'tasks:push', 'tasks:pull', 'whatsapp:links', 'timeline:push'];
const setClient = (assignments) => sql(`UPDATE integration_clients SET ${assignments} WHERE code='waai';`);
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ----------------------------------------------------------------------------- 0. the pure helpers
function libChecks() {
  section('helpers (scripts/test-integration-lib.php)');
  try {
    const out = run('docker', ['run', '--rm', '-v', `${root}:/app:ro`, '-w', '/app', 'php:8.2-cli', 'php', 'scripts/test-integration-lib.php']);
    check('IP ranges, text cleaning, ISO dates, scopes', /^OK \d+ checks/.test(out.trim()), out);
  } catch (e) {
    check('IP ranges, text cleaning, ISO dates, scopes', false, e.stderr || e.message);
  }
}

// ----------------------------------------------------------------------------- 1. admin endpoint
async function adminChecks(state) {
  section('admin endpoint');
  const none = await admin(null);
  check('no session -> 401', none.status === 401, none.status);
  const viewerSession = await login(USERS.viewer[0] + '@probe.test');
  const viewer = await admin(viewerSession);
  check('a non-admin -> 403', viewer.status === 403, viewer.status);
  const viewerWrite = await admin(viewerSession, { method: 'POST', body: { action: 'issue_token' } });
  check('a non-admin cannot issue a token -> 403', viewerWrite.status === 403, viewerWrite.status);

  const session = await login(USERS.admin[0] + '@probe.test');
  state.adminSession = session;
  const first = await admin(session);
  check('GET before setup: no client, no tokens, scopes listed', first.status === 200 && first.json?.client === null && first.json.tokens.length === 0
    && ALL_SCOPES.every((s) => first.json.scopes_available.includes(s)), first.raw);
  check('GET lists the users for the owner picker', first.json?.users?.some((u) => u.id === USERS.admin[0]), first.raw.slice(0, 200));
  const early = await admin(session, { method: 'POST', body: { action: 'issue_token' } });
  check('a token cannot be issued before the client exists -> 409', early.status === 409, early.raw);

  const good = { action: 'save_client', name: 'WAAI', is_active: true, scopes: ALL_SCOPES, allowed_ips: [], require_direct: false, owner_user_ids: [USERS.admin[0]], feed_scope: 'owners', embed_url: 'https://wa.example.sk/', default_deadline_days: 7 };
  const bad = async (patch, field) => {
    const r = await admin(session, { method: 'POST', body: { ...good, ...patch } });
    check(`save_client refuses a bad ${field} -> 422`, r.status === 422 && r.json?.fields && field in r.json.fields, `${r.status} ${r.raw}`);
  };
  await bad({ name: '' }, 'name');
  await bad({ scopes: ['tasks:push', 'root:all'] }, 'scopes');
  await bad({ allowed_ips: ['10.0.0.0/33'] }, 'allowed_ips');
  await bad({ allowed_ips: ['example.com'] }, 'allowed_ips');
  await bad({ owner_user_ids: ['nobody-here'] }, 'owner_user_ids');
  await bad({ feed_scope: 'everything' }, 'feed_scope');
  await bad({ embed_url: 'http://wa.example.sk' }, 'embed_url');
  await bad({ embed_url: 'https://wa.example.sk/some/path' }, 'embed_url');
  await bad({ embed_url: 'https://user:pw@wa.example.sk' }, 'embed_url');
  await bad({ default_deadline_days: 400 }, 'default_deadline_days');
  await bad({ default_deadline_days: 'soon' }, 'default_deadline_days');

  const saved = await admin(session, { method: 'POST', body: good });
  const c = saved.json?.client;
  check('save_client creates the client; embed_url is normalised to an origin', saved.status === 200 && c?.code === 'waai' && c.embed_url === 'https://wa.example.sk'
    && c.scopes.length === 6 && c.owner_user_ids[0] === USERS.admin[0] && c.default_deadline_days === 7 && c.has_sso_secret === false, saved.raw);
  const local = await admin(session, { method: 'POST', body: { ...good, embed_url: 'http://wa.localtest.me:3000' } });
  check('plain http is accepted for a local development host', local.status === 200 && local.json.client.embed_url === 'http://wa.localtest.me:3000', local.raw);
  await admin(session, { method: 'POST', body: good });
  check('saving twice updates, it does not add a second client', cell('SELECT COUNT(*) FROM integration_clients') === '1');

  const pastExpiry = await admin(session, { method: 'POST', body: { action: 'issue_token', expires_at: '2020-01-01' } });
  check('a token cannot be issued with an expiry in the past -> 422', pastExpiry.status === 422, pastExpiry.raw);
  const cross = await admin(session, { method: 'POST', body: { action: 'issue_token' }, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  check('a cross-site request cannot ride the session -> 403', cross.status === 403, `${cross.status} ${cross.raw}`);

  const issued = await admin(session, { method: 'POST', body: { action: 'issue_token' } });
  const token = issued.json?.token;
  check('issue_token returns the plaintext once, in the documented format', issued.status === 200 && /^ccrm_int_[0-9a-f]{12}_[0-9a-f]{64}$/.test(token ?? ''), issued.raw);
  state.token = token;
  state.tokenId = issued.json?.token_id;
  const prefix = token.split('_')[2];
  state.prefix = prefix;
  check('the token list shows prefix and state, never the secret or the hash', issued.json.tokens.length === 1 && issued.json.tokens[0].prefix === prefix && issued.json.tokens[0].state === 'active'
    && !issued.raw.slice(0, issued.raw.indexOf('"token"')).includes(token.slice(-64)), issued.raw);
  const again = await admin(session);
  check('GET never repeats the plaintext', !again.raw.includes(token.slice(-64)) && !again.raw.includes('token_hash'), again.raw);
  check('only the sha256 is stored', cell(`SELECT token_hash FROM integration_tokens WHERE prefix=${sq(prefix)}`) === sha(token)
    && cell(`SELECT COUNT(*) FROM integration_tokens WHERE token_hash=${sq(token)} OR token_hash LIKE ${sq('%' + token.slice(-64) + '%')}`) === '0');
  check('issuing is audited (id and prefix only)', cell(`SELECT detail FROM audit_log WHERE action='integration.token_issue' ORDER BY id DESC LIMIT 1`)?.includes(prefix) === true
    && !cell(`SELECT detail FROM audit_log WHERE action='integration.token_issue' ORDER BY id DESC LIMIT 1`).includes(token.slice(-64)));

  const second = await admin(session, { method: 'POST', body: { action: 'issue_token', expires_at: '2099-12-31' } });
  check('a second token can be issued with an expiry', second.status === 200 && second.json.tokens.length === 2 && second.json.tokens.some((t) => t.expires_at?.startsWith('2099-12-31')), second.raw);
  state.token2 = second.json.token;
  state.prefix2 = state.token2.split('_')[2];

  const noSuch = await admin(session, { method: 'POST', body: { action: 'revoke_token', id: 'intt_nope' } });
  check('revoking an unknown token -> 404', noSuch.status === 404, noSuch.raw);
  const unknownAction = await admin(session, { method: 'POST', body: { action: 'drop_everything' } });
  check('an unknown action -> 400', unknownAction.status === 400, unknownAction.raw);
}

// ----------------------------------------------------------------------------- 2. the token API
async function apiChecks(state) {
  const { token, prefix } = state;

  section('authentication');
  const ping = await call('/ping', { token });
  check('ping with a valid token', ping.status === 200 && ping.json?.client === 'waai' && ping.json.scopes.length === 6 && !Number.isNaN(Date.parse(ping.json.server_time)), ping.raw);
  check('responses are JSON, uncached, with a request id', /^application\/json/.test(ping.headers.get('content-type')) && /no-store/.test(ping.headers.get('cache-control') ?? '') && /^[0-9a-f]{16}$/.test(ping.headers.get('x-request-id') ?? ''), JSON.stringify([...ping.headers]));

  const anon = await call('/ping');
  check('no token -> 401 with the error envelope', anon.status === 401 && errCode(anon) === 'unauthorized' && anon.json.error.request_id === anon.headers.get('x-request-id') && typeof anon.json.error.fields === 'object', anon.raw);
  check('401 carries WWW-Authenticate: Bearer', anon.headers.get('www-authenticate') === 'Bearer');
  const anonUnknown = await call('/does-not-exist');
  check('an unknown route without a token is still 401, never 404', anonUnknown.status === 401, anonUnknown.status);
  const anonBody = await call('/users', { method: 'POST', body: 'x', contentType: 'text/plain' });
  check('a bad body without a token is still 401, never 415', anonBody.status === 401, anonBody.status);
  check('a malformed header -> 401', (await call('/ping', { headers: { Authorization: 'Basic abc' } })).status === 401);
  check('a token that is not ours -> 401', (await call('/ping', { token: 'ccrm_int_' + '0'.repeat(12) + '_' + '0'.repeat(64) })).status === 401);
  check('a right prefix with a wrong secret -> 401', (await call('/ping', { token: `ccrm_int_${prefix}_${'0'.repeat(64)}` })).status === 401);
  check('an MCP key is not accepted here -> 401', (await call('/ping', { token: 'ccrm_mcp_' + '0'.repeat(64) })).status === 401);
  const inQuery = await fetch(`${API}/ping?token=${token}&access_token=${token}`);
  check('a token in the query string is ignored -> 401', inQuery.status === 401, inQuery.status);
  check('the scheme is case-insensitive', (await call('/ping', { headers: { Authorization: `bearer ${token}` } })).status === 200);

  setClient('is_active=0');
  check('an inactive client -> 401', (await call('/ping', { token })).status === 401);
  setClient('is_active=1');

  sql(`UPDATE integration_tokens SET expires_at = NOW() - INTERVAL 1 DAY WHERE prefix=${sq(state.prefix2)};`);
  check('an expired token -> 401', (await call('/ping', { token: state.token2 })).status === 401);
  sql(`UPDATE integration_tokens SET expires_at = NULL WHERE prefix=${sq(state.prefix2)};`);
  check('... and works again once the expiry is lifted', (await call('/ping', { token: state.token2 })).status === 200);

  section('usage tracking');
  const used = sql(`SELECT last_used_at, last_used_ip FROM integration_tokens WHERE prefix=${sq(prefix)};`).split('\n')[1]?.split('\t') ?? [];
  check('last_used_at and last_used_ip are recorded', used[0] && used[0] !== 'NULL' && /^[0-9a-f:.]+$/.test(used[1] ?? ''), used.join(' | '));
  state.remote = used[1];

  section('network');
  setClient(`allowed_ips='["192.0.2.1"]'`);
  const wrongIp = await call('/ping', { token });
  check('an address outside allowed_ips -> 403', wrongIp.status === 403 && errCode(wrongIp) === 'forbidden_network', wrongIp.raw);
  setClient(`allowed_ips='["192.0.2.0/24","${state.remote}"]'`);
  check('the caller\'s own address in allowed_ips -> 200', (await call('/ping', { token })).status === 200);
  setClient(`allowed_ips='["${state.remote.includes(':') ? '::/0' : '0.0.0.0/0'}"]'`);
  check('a CIDR block that covers the caller -> 200', (await call('/ping', { token })).status === 200);
  setClient(`allowed_ips='["192.0.2.1"]'`);
  const spoof = await call('/ping', { token, headers: { 'X-Forwarded-For': '192.0.2.1' } });
  check('a spoofed X-Forwarded-For does not satisfy allowed_ips -> 403', spoof.status === 403, spoof.raw);
  setClient(`allowed_ips='[]'`);
  setClient('require_direct=1');
  const proxied = await call('/ping', { token, headers: { 'X-Forwarded-For': '203.0.113.9' } });
  check('require_direct + X-Forwarded-For -> 403', proxied.status === 403 && errCode(proxied) === 'forbidden_network', proxied.raw);
  check('require_direct + X-Real-IP -> 403', (await call('/ping', { token, headers: { 'X-Real-IP': '203.0.113.9' } })).status === 403);
  check('require_direct without a proxy header -> 200', (await call('/ping', { token })).status === 200);
  setClient('require_direct=0');
  check('without require_direct a proxy header is fine', (await call('/ping', { token, headers: { 'X-Forwarded-For': '203.0.113.9' } })).status === 200);

  section('scopes');
  setClient(`scopes='["tasks:push"]'`);
  const noScope = await call('/users', { token });
  check('a missing scope -> 403', noScope.status === 403 && errCode(noScope) === 'forbidden_scope', noScope.raw);
  check('ping needs no scope', (await call('/ping', { token })).status === 200);
  check('the scope list in ping follows the client', JSON.stringify((await call('/ping', { token })).json.scopes) === '["tasks:push"]');
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);

  section('router, body checks');
  const unknown = await call('/does-not-exist', { token });
  check('an unknown route -> 404 route_not_found', unknown.status === 404 && errCode(unknown) === 'route_not_found', unknown.raw);
  const empty = await fetch(`${API}/`, { headers: { Authorization: `Bearer ${token}` } });
  check('the bare /api/v1/ -> 404 route_not_found', empty.status === 404, empty.status);
  const wrong = await call('/ping', { token, method: 'POST' });
  check('the wrong method -> 405 with Allow', wrong.status === 405 && errCode(wrong) === 'method_not_allowed' && wrong.headers.get('allow') === 'GET', `${wrong.status} ${wrong.headers.get('allow')} ${wrong.raw}`);
  check('DELETE on a GET route -> 405', (await call('/users', { token, method: 'DELETE' })).status === 405);
  check('a trailing slash is the same route', (await call('/ping/', { token })).status === 200);
  check('a percent-encoded path is decoded once', (await call('/p%69ng', { token })).status === 200);
  const notJson = await call('/users', { token, method: 'POST', body: 'a=b', contentType: 'application/x-www-form-urlencoded' });
  check('a non-JSON body -> 415', notJson.status === 415 && errCode(notJson) === 'unsupported_media_type', notJson.raw);
  const big = await call('/users', { token, method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(70 * 1024) }), contentType: 'application/json' });
  check('a body over 64 KB -> 413', big.status === 413 && errCode(big) === 'payload_too_large', `${big.status} ${big.raw.slice(0, 200)}`);
  const justUnder = await call('/users', { token, method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(60 * 1024) }), contentType: 'application/json' });
  check('a body under the cap passes the size check (then 405: /users is GET-only)', justUnder.status === 405, `${justUnder.status} ${justUnder.raw.slice(0, 200)}`);
  const emptyPost = await call('/users', { token, method: 'POST' });
  check('a request without a body is not a content-type error (405 here: /users is GET-only)', emptyPost.status === 405, emptyPost.status);

  section('users');
  const users = await call('/users', { token });
  const phoneUser = users.json?.users?.find((u) => u.id === USERS.phone[0]);
  check('GET /users lists users with string ids', users.status === 200 && Array.isArray(users.json?.users) && users.json.users.every((u) => typeof u.id === 'string' && typeof u.name === 'string' && typeof u.email === 'string'), users.raw.slice(0, 300));
  check('the phone is the linked employee\'s, raw', phoneUser?.phone === '0905 123 456' && phoneUser.email === USERS.phone[0] + '@probe.test', JSON.stringify(phoneUser));
  const noPhone = users.json?.users?.find((u) => u.id === USERS.viewer[0]);
  check('a user without an employee has phone null', noPhone && noPhone.phone === null, JSON.stringify(noPhone));
  check('no password hash or other column leaks', !/password|hash|metadata|sessions_valid_from/i.test(users.raw), users.raw.slice(0, 200));

  section('rate limit');
  const parallel = 40;
  const before = Number(cell(`SELECT COALESCE(SUM(hits),0) FROM integration_rate WHERE token_prefix=${sq(state.prefix2)}`));
  const results = await Promise.all(Array.from({ length: parallel }, () => call('/ping', { token: state.token2 })));
  const after = Number(cell(`SELECT COALESCE(SUM(hits),0) FROM integration_rate WHERE token_prefix=${sq(state.prefix2)}`));
  check(`${parallel} parallel requests are all counted exactly (atomic counter)`, results.every((r) => r.status === 200) && after - before === parallel, `${after - before} counted, statuses ${[...new Set(results.map((r) => r.status))]}`);
  let limited = null;
  for (let attempt = 0; attempt < 3 && !limited; attempt++) {
    const window = Math.floor(Date.now() / 60000) * 60;
    sql(`REPLACE INTO integration_rate (token_prefix, window_start, hits) VALUES (${sq(prefix)}, ${window}, 299);`);
    const at300 = await call('/ping', { token });
    const at301 = await call('/ping', { token });
    if (at300.status === 200 && at301.status === 429) limited = at301;   // retry only if the minute rolled over between the two
  }
  check('the 301st request in a minute -> 429 with Retry-After', limited && errCode(limited) === 'rate_limited' && Number(limited.headers.get('retry-after')) >= 1 && Number(limited.headers.get('retry-after')) <= 60, limited?.raw);
  check('the limit is per token: the other token is unaffected', (await call('/ping', { token: state.token2 })).status === 200);
  sql(`DELETE FROM integration_rate WHERE token_prefix=${sq(prefix)};`);

  section('revocation');
  const revoked = await admin(state.adminSession, { method: 'POST', body: { action: 'revoke_token', id: state.tokenId } });
  check('revoke_token marks the token revoked', revoked.status === 200 && revoked.json.tokens.find((t) => t.id === state.tokenId)?.state === 'revoked', revoked.raw);
  const afterRevoke = await call('/ping', { token });
  check('a revoked token -> 401 at once', afterRevoke.status === 401, afterRevoke.status);
  check('the other token still works (overlapping rotation)', (await call('/ping', { token: state.token2 })).status === 200);
  check('revoking is audited', cell(`SELECT COUNT(*) FROM audit_log WHERE action='integration.token_revoke'`) === '1');
  const manyBefore = Number(cell('SELECT COUNT(*) FROM integration_tokens WHERE revoked_at IS NULL'));
  for (let i = manyBefore; i < 10; i++) await admin(state.adminSession, { method: 'POST', body: { action: 'issue_token' } });
  const eleventh = await admin(state.adminSession, { method: 'POST', body: { action: 'issue_token' } });
  check('at most 10 active tokens -> 409', eleventh.status === 409, eleventh.raw);

  section('failure handling');
  sql('RENAME TABLE integration_rate TO integration_rate_x;');
  const broken = await call('/ping', { token: state.token2 });
  sql('RENAME TABLE integration_rate_x TO integration_rate;');
  check('an internal error -> 500 server_error, with no SQL or path in the body', broken.status === 500 && errCode(broken) === 'server_error' && !/SQL|integration_|\.php|PDO|table/i.test(broken.raw), broken.raw);
  check('... and the API recovers', (await call('/ping', { token: state.token2 })).status === 200);
}

// ----------------------------------------------------------------------------- 2b. tasks
const ADMIN_ID = USERS.admin[0], ADMIN_NAME = USERS.admin[1];
const PHONE_ID = USERS.phone[0], PHONE_NAME = USERS.phone[1];
const VIEWER_ID = USERS.viewer[0], VIEWER_NAME = USERS.viewer[1];

const jrow = (q) => { const out = sql(q).split('\n').slice(1).filter(Boolean)[0]; return out ? JSON.parse(out) : null; };
const taskRow = (id) => jrow(`SELECT JSON_OBJECT('title',title,'description',description,'deadline',CAST(deadline AS CHAR),'deadline_time',deadline_time,'status',status,'owner',owner,'created_by',created_by,
  'start_date',CAST(start_date AS CHAR),'lead',related_lead_id,'project',related_project_id,'completed_by',completed_by,'completed_at',completed_at,'conclusion',conclusion,'priority',priority,
  'ext_source',external_source,'ext_url',external_url,'meta',external_meta_json,'updated',CAST(updated_at AS CHAR)) AS j FROM tasks WHERE id=${sq(id)}`);
const assigneesOf = (id) => sql(`SELECT user_name FROM task_assignees WHERE task_id=${sq(id)} ORDER BY user_name`).split('\n').slice(1).filter(Boolean);

// Europe/Bratislava wall-clock parts of an instant, independent of the machine running the probe.
const tzParts = (iso) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
};
const todayPlus = (n) => { const t = new Date(tzParts(new Date().toISOString()).date + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const lastSundayOfMarch = (year) => { const d = new Date(Date.UTC(year, 3, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };

async function syncApi(session, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/intprobe/sync.php`, {
    method,
    headers: { Cookie: `CCRMSESSID=${session}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* not JSON */ }
  return { status: res.status, json, raw };
}

async function taskChecks(state) {
  const token = state.token2;
  const session = state.adminSession;
  let rev = Date.now();
  const nextRev = () => ++rev;
  const put = (ext, body, opts = {}) => call(`/tasks/external/${ext}`, { method: 'PUT', token, body, ...opts });
  const payload = (over = {}) => ({
    revision: 'revision' in over ? over.revision : nextRev(), title: 'Poslať ponuku', description: 'Detail ponuky', status: 'open', owner_id: ADMIN_ID, assignee_ids: [ADMIN_ID],
    due: { at: `${todayPlus(30)}T10:00:00Z`, all_day: true },
    context: { conversation: 'Marek Novák', is_group: false, assignee_label: 'Marek', path: '/c/ckx8abc' },
    ...over,
  });
  const resetRate = () => sql(`DELETE FROM integration_rate;`);
  resetRate();
  sql(`UPDATE integration_clients SET default_deadline_days = 7 WHERE code='waai';`);

  section('task push: validation');
  setClient(`scopes='["tasks:pull"]'`);
  const noPush = await put('waaitask0001', payload());
  check('a token without tasks:push cannot push -> 403', noPush.status === 403 && errCode(noPush) === 'forbidden_scope', noPush.raw);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);
  for (const ext of ['short', 'x'.repeat(65), 'has space ok1', 'waaitask0001%0A']) {
    const r = await put(ext, payload());
    check(`external id "${ext.slice(0, 20)}" is refused -> 422 (not 404)`, r.status === 422 && 'externalId' in (r.json?.error?.fields ?? {}), `${r.status} ${r.raw}`);
  }
  check('a non-object body -> 400', (await put('waaitask0001', '[1,2]')).status === 400);
  check('no body -> 400', (await call('/tasks/external/waaitask0001', { method: 'PUT', token })).status === 400);
  const refuse = async (patch, field) => {
    const r = await put('waaitask0001', payload(patch));
    check(`push refuses a bad ${field} -> 422`, r.status === 422 && r.json?.error?.fields && field in r.json.error.fields, `${r.status} ${r.raw}`);
  };
  await refuse({ revision: undefined }, 'revision');
  await refuse({ revision: '5' }, 'revision');
  await refuse({ revision: 0 }, 'revision');
  await refuse({ title: '' }, 'title');
  await refuse({ title: '<b></b>' }, 'title');
  await refuse({ title: 'x'.repeat(256) }, 'title');
  await refuse({ description: 'x'.repeat(5001) }, 'description');
  await refuse({ status: 'archived' }, 'status');
  await refuse({ owner_id: VIEWER_ID }, 'owner_id');
  await refuse({ owner_id: 'nobody-here' }, 'owner_id');
  await refuse({ owner_id: undefined }, 'owner_id');
  await refuse({ assignee_ids: ['nobody-here'] }, 'assignee_ids');
  await refuse({ assignee_ids: 'intp-admin' }, 'assignee_ids');
  await refuse({ assignee_ids: Array.from({ length: 21 }, () => ADMIN_ID) }, 'assignee_ids');
  await refuse({ due: { at: 'tomorrow' } }, 'due');
  await refuse({ due: { at: '2020-01-01T10:00:00Z' } }, 'due');
  await refuse({ start: 'soon' }, 'start');
  await refuse({ lead_id: 'no-such-lead' }, 'lead_id');
  await refuse({ project_id: 'no-such-project' }, 'project_id');
  await refuse({ lead_id: 5 }, 'lead_id');
  await refuse({ context: { path: '//evil.example/c/x' } }, 'context.path');
  await refuse({ context: { path: 'https://evil.example/c/x' } }, 'context.path');
  await refuse({ context: { path: '/c/x?m=1&admin=1' } }, 'context.path');
  check('nothing was created by the refused pushes', cell(`SELECT COUNT(*) FROM tasks WHERE external_source IS NOT NULL`) === '0');
  check('... and no ref row is left behind', cell(`SELECT COUNT(*) FROM integration_refs WHERE kind='task'`) === '0');

  section('task push: create, repeat, stale');
  const EXT = 'waaitask0001';
  const created = await put(EXT, payload());
  const t = created.json;
  const id = t?.id;
  check('first push -> 201 with a tsk_ id', created.status === 201 && /^tsk_[0-9a-f]{16}$/.test(id ?? ''), created.raw);
  check('the representation: origin, external id, state, due, people, flags', t?.origin === 'waai' && t.external_id === EXT && t.title === 'Poslať ponuku' && t.state.code === 'todo' && t.done === false
    && t.due.all_day === true && t.due.at.startsWith(todayPlus(30) + 'T23:59:00') && t.created_by === ADMIN_ID && JSON.stringify(t.assignee_ids) === `["${ADMIN_ID}"]`
    && t.is_automation === false && t.stale === false && t.applied.includes('title') && Number.isInteger(t.updated_at) && t.lead_id === null && t.project_id === null && t.start === null, created.raw);
  check('url is a hash link on the configured base', t?.url === `https://crm.test/#tasks?task=${id}`, t?.url);
  let row = taskRow(id);
  check('stored like a hand-made task: owner and creator are user names, priority medium', row.owner === ADMIN_NAME && row.created_by === ADMIN_NAME && row.priority === 'medium' && row.status === 'todo'
    && row.deadline === todayPlus(30) && row.deadline_time === null, JSON.stringify(row));
  check('the owner is also the assignee (visibility)', JSON.stringify(assigneesOf(id)) === JSON.stringify([ADMIN_NAME]));
  check('source columns are set; the path is stored, not a URL', row.ext_source === 'waai' && row.ext_url === '/c/ckx8abc', JSON.stringify(row));
  check('the description carries a footer with the chat, the WhatsApp assignee and a link back (built by CCRM)', row.description === 'Detail ponuky\n\nWhatsApp chat: Marek Novák\nWhatsApp assignee: Marek\nOpen chat: https://crm.test/#whatsapp/c/ckx8abc', JSON.stringify(row.description));
  check('the chat title is kept as metadata, no message text', JSON.parse(row.meta).conversation === 'Marek Novák' && JSON.parse(row.meta).due_inferred === undefined, row.meta);

  const before = row.updated;
  await new Promise((r) => setTimeout(r, 30));
  const repeatRev = nextRev();
  const repeat = await put(EXT, payload({ revision: repeatRev }));
  check('the same payload again -> 200, same task, nothing applied', repeat.status === 200 && repeat.json.id === id && repeat.json.stale === false && repeat.json.applied.length === 0, repeat.raw);
  check('... no duplicate task, no duplicate ref', cell(`SELECT COUNT(*) FROM tasks WHERE external_source='waai'`) === '1' && cell(`SELECT COUNT(*) FROM integration_refs WHERE kind='task' AND external_id=${sq(EXT)}`) === '1');
  check('... and updated_at did not move (no write)', taskRow(id).updated === before, `${before} -> ${taskRow(id).updated}`);

  const stale = await put(EXT, payload({ revision: 1, title: 'Old title' }));
  check('an old revision -> 200 {stale:true}, nothing applied', stale.status === 200 && stale.json.stale === true && stale.json.applied.length === 0 && stale.json.title === 'Poslať ponuku', stale.raw);
  const sameRev = await put(EXT, payload({ revision: repeatRev, title: 'Same revision' }));
  check('the same revision again is stale too', sameRev.json?.stale === true && taskRow(id).title === 'Poslať ponuku', sameRev.raw);

  const retitle = await put(EXT, payload({ title: 'Poslať ponuku na kuchyňu' }));
  check('a changed field is applied: only that one', retitle.status === 200 && JSON.stringify(retitle.json.applied) === '["title"]' && taskRow(id).title === 'Poslať ponuku na kuchyňu', retitle.raw);
  check('the change moved updated_at (so open clients see it)', taskRow(id).updated !== before);
  const audit = sql(`SELECT detail FROM audit_log WHERE action='integration_task_push' ORDER BY id`).split('\n').slice(1).filter(Boolean);
  check('pushes are audited with ids only', audit.length >= 2 && audit.every((d) => /^(create|update) tsk_[0-9a-f]{16} ext=waaitask0001$/.test(d)), audit.join(' | '));

  section('task push: CCRM edits survive (three-way merge, real sync.php)');
  // A CCRM user moves the deadline and renames the task through the app's own save.
  let g = await syncApi(session);
  const mine = g.json?.tasks?.find((x) => x.id === id);
  check('sync GET exposes the source: externalSource, externalUrl, dueInferred=false', mine?.externalSource === 'waai' && mine.externalUrl === '/c/ckx8abc' && mine.dueInferred === false, JSON.stringify(mine));
  const edited = await syncApi(session, { method: 'POST', body: { syncProtocol: 2, baseSyncedAt: g.json.serverTime, tasks: [{ ...mine, deadline: todayPlus(40), title: 'Edited in CCRM' }] } });
  check('the user\'s save succeeds', edited.status === 200 && edited.json?.success === true, edited.raw.slice(0, 300));
  row = taskRow(id);
  check('the edit is stored, and the server-only columns survived the save', row.deadline === todayPlus(40) && row.title === 'Edited in CCRM' && row.ext_source === 'waai' && row.ext_url === '/c/ckx8abc' && !!row.meta, JSON.stringify(row));
  const unchanged = await put(EXT, payload({ title: 'Poslať ponuku na kuchyňu' }));
  check('a push where the chat changed nothing leaves the user\'s edits alone', unchanged.json?.applied.length === 0 && taskRow(id).title === 'Edited in CCRM' && taskRow(id).deadline === todayPlus(40), unchanged.raw);
  const partly = await put(EXT, payload({ title: 'Poslať ponuku na kuchyňu', description: 'Nový detail' }));
  check('a field the chat changed is applied, the others stay', JSON.stringify(partly.json?.applied) === '["description"]' && taskRow(id).title === 'Edited in CCRM' && taskRow(id).deadline === todayPlus(40) && taskRow(id).description.startsWith('Nový detail\n\nWhatsApp chat'), partly.raw);
  const moved = await put(EXT, payload({ title: 'Poslať ponuku na kuchyňu', description: 'Nový detail', due: { at: `${todayPlus(50)}T10:00:00Z`, all_day: true } }));
  check('when the chat moves the date again, it wins over the user\'s edit', JSON.stringify(moved.json?.applied) === '["due"]' && taskRow(id).deadline === todayPlus(50), moved.raw);

  section('task push: a stale app cannot clobber or delete');
  g = await syncApi(session);
  const stalePicture = g.json.tasks.find((x) => x.id === id);
  const staleClock = g.json.serverTime;
  await new Promise((r) => setTimeout(r, 40));
  const apiWrite = await put(EXT, payload({ title: 'Poslať ponuku na kuchyňu', description: 'Nový detail', due: { at: `${todayPlus(50)}T10:00:00Z`, all_day: true }, assignee_ids: [ADMIN_ID, PHONE_ID] }));
  check('the push after the app\'s last read applies', JSON.stringify(apiWrite.json?.applied) === '["assignee_ids"]', apiWrite.raw);
  const staleSave = await syncApi(session, { method: 'POST', body: { syncProtocol: 2, baseSyncedAt: staleClock, tasks: [{ ...stalePicture, title: 'Stale title' }] } });
  check('a stale save is reported as a conflict for that task', staleSave.status === 200 && (staleSave.json?.conflicts?.tasks ?? []).includes(id), staleSave.raw.slice(0, 300));
  check('... the API\'s write stays: assignees and title intact, the task still exists', JSON.stringify(assigneesOf(id)) === JSON.stringify([ADMIN_NAME, PHONE_NAME].sort()) && taskRow(id).title === 'Edited in CCRM');
  const noTaskSave = await syncApi(session, { method: 'POST', body: { syncProtocol: 2, baseSyncedAt: staleClock, tasks: [] } });
  check('a snapshot that omits the task does not delete it', noTaskSave.status === 200 && taskRow(id) !== null);

  section('task push: people and links');
  check('the first assignee is the owner; every assignee is stored', taskRow(id).owner === ADMIN_NAME && apiWrite.json.assignee_ids.length === 2 && apiWrite.json.assignee_ids[0] === ADMIN_ID, JSON.stringify(taskRow(id)));
  const pe = await put('waaitask0002', payload({ assignee_ids: [PHONE_ID, ADMIN_ID, PHONE_ID] }));
  check('the first listed assignee becomes `owner`; duplicates collapse', pe.status === 201 && taskRow(pe.json.id).owner === PHONE_NAME && taskRow(pe.json.id).created_by === ADMIN_NAME && assigneesOf(pe.json.id).length === 2, pe.raw);
  const empty = await put('waaitask0003', payload({ assignee_ids: [] }));
  check('no assignees -> the owner', empty.status === 201 && taskRow(empty.json.id).owner === ADMIN_NAME && JSON.stringify(assigneesOf(empty.json.id)) === JSON.stringify([ADMIN_NAME]), empty.raw);
  sql(`DELETE FROM users WHERE id IN ('intp-dup1','intp-dup2'); INSERT INTO users (id,name,email,password_hash,role) VALUES ('intp-dup1','Int Probe Twin','dup1@probe.test','x','Viewer'),('intp-dup2','Int Probe Twin','dup2@probe.test','x','Viewer');`);
  const twin = await put('waaitask0004', payload({ assignee_ids: ['intp-dup1', ADMIN_ID] }));
  check('a name shared by two users is never guessed: that assignee is left out of the answer', twin.status === 201 && JSON.stringify(twin.json.assignee_ids) === `["${ADMIN_ID}"]` && twin.json.created_by === ADMIN_ID, twin.raw);
  sql(`DELETE FROM users WHERE id IN ('intp-dup1','intp-dup2');`);

  const leadId = 'intp-lead-1';
  sql(`DELETE FROM leads WHERE id=${sq(leadId)}; INSERT INTO leads (id,name,owner,created_at) VALUES (${sq(leadId)},'Int Probe Lead',${sq(ADMIN_NAME)},CURDATE());`);
  const projectId = cell(`SELECT id FROM projects LIMIT 1`);
  const linked = await put('waaitask0005', payload({ lead_id: leadId, project_id: projectId, start: `${todayPlus(2)}T00:00:00+01:00` }));
  check('lead_id, project_id and start are stored and returned', linked.status === 201 && linked.json.lead_id === leadId && linked.json.project_id === projectId && linked.json.start === todayPlus(2)
    && taskRow(linked.json.id).lead === leadId && taskRow(linked.json.id).project === projectId, linked.raw);
  const relinked = await put('waaitask0005', payload({ lead_id: null, project_id: projectId, start: `${todayPlus(2)}T00:00:00+01:00` }));
  check('a link the chat removes is cleared (three-way merged)', JSON.stringify(relinked.json?.applied) === '["lead_id"]' && taskRow(linked.json.id).lead === null && taskRow(linked.json.id).project === projectId, relinked.raw);
  sql(`UPDATE tasks SET related_lead_id=${sq(leadId)} WHERE id=${sq(linked.json.id)};`);
  const keep = await put('waaitask0005', payload({ lead_id: null, project_id: projectId, start: `${todayPlus(2)}T00:00:00+01:00` }));
  check('a link a CCRM user set survives a push where the chat changed nothing', keep.json?.applied.length === 0 && taskRow(linked.json.id).lead === leadId, keep.raw);
  const noKeys = await put('waaitask0005', payload({ title: 'No link keys' }));
  check('a payload without lead_id / project_id does not touch the links', taskRow(linked.json.id).lead === leadId && taskRow(linked.json.id).project === projectId && noKeys.json.applied.includes('title'), noKeys.raw);
  const ctxStart = await put('waaitask0006', payload({ context: { path: '/c/ckx8abc', start: `${todayPlus(3)}` } }));
  check('start in the old context shape is understood', ctxStart.status === 201 && ctxStart.json.start === todayPlus(3), ctxStart.raw);

  section('task push: deadlines');
  const noDue = await put('waaitask0007', payload({ due: undefined }));
  check('no date in the chat -> today + 7 days, all day', noDue.status === 201 && taskRow(noDue.json.id).deadline === todayPlus(7) && taskRow(noDue.json.id).deadline_time === null && noDue.json.due.all_day === true, noDue.raw);
  let m = JSON.parse(taskRow(noDue.json.id).meta);
  check('... remembered as inferred', m.due_inferred === true && m.inferred_deadline === todayPlus(7), JSON.stringify(m));
  g = await syncApi(session);
  check('the app is told: dueInferred=true', g.json.tasks.find((x) => x.id === noDue.json.id)?.dueInferred === true);
  const stillNone = await put('waaitask0007', payload({ due: undefined, title: 'Still no date' }));
  check('a push that still has no date keeps the inferred one', JSON.stringify(stillNone.json?.applied) === '["title"]' && taskRow(noDue.json.id).deadline === todayPlus(7), stillNone.raw);
  const nowStated = await put('waaitask0007', payload({ title: 'Still no date', due: { at: `${todayPlus(12)}T10:00:00Z`, all_day: true } }));
  m = JSON.parse(taskRow(noDue.json.id).meta);
  check('a date stated later replaces the inferred one and clears the mark', JSON.stringify(nowStated.json?.applied) === '["due"]' && taskRow(noDue.json.id).deadline === todayPlus(12) && m.due_inferred === undefined, JSON.stringify([nowStated.json?.applied, m]));
  const vanished = await put('waaitask0007', payload({ title: 'Still no date', due: undefined }));
  m = JSON.parse(taskRow(noDue.json.id).meta);
  check('a date the chat takes back falls to today + 7 days, marked "not stated" again', taskRow(noDue.json.id).deadline === todayPlus(7) && vanished.json.applied.includes('due') && m.due_inferred === true && m.inferred_deadline === todayPlus(7), JSON.stringify([vanished.raw, m]));
  g = await syncApi(session);
  check('... and the app is told: dueInferred=true', g.json.tasks.find((x) => x.id === noDue.json.id)?.dueInferred === true);
  // A CCRM user moved the date the chat had set: taking the date back must not override the user.
  const userMoved = await put('waaitask0090', payload({ due: { at: `${todayPlus(15)}T10:00:00Z`, all_day: true } }));
  sql(`UPDATE tasks SET deadline=${sq(todayPlus(18))} WHERE id=${sq(userMoved.json.id)};`);
  const userMovedBack = await put('waaitask0090', payload({ due: undefined }));
  check('a date a CCRM user moved survives the chat taking the date back', taskRow(userMoved.json.id).deadline === todayPlus(18) && !userMovedBack.json.applied.includes('due') && JSON.parse(taskRow(userMoved.json.id).meta).due_inferred === undefined, userMovedBack.raw);
  sql(`UPDATE integration_clients SET default_deadline_days = 3 WHERE code='waai';`);
  const three = await put('waaitask0008', payload({ due: undefined }));
  check('the default is per client (3 days here)', taskRow(three.json.id).deadline === todayPlus(3), three.raw);
  sql(`UPDATE integration_clients SET default_deadline_days = 7 WHERE code='waai';`);
  // The user moves an inferred deadline in the app: it is a stated one from then on.
  g = await syncApi(session);
  const inferredTask = g.json.tasks.find((x) => x.id === three.json.id);
  await syncApi(session, { method: 'POST', body: { syncProtocol: 2, baseSyncedAt: g.json.serverTime, tasks: [{ ...inferredTask, deadline: todayPlus(9) }] } });
  g = await syncApi(session);
  check('... a user moving it clears dueInferred', g.json.tasks.find((x) => x.id === three.json.id)?.dueInferred === false && taskRow(three.json.id).deadline === todayPlus(9));

  const timed = await put('waaitask0009', payload({ due: { at: `${todayPlus(20)}T08:30:00Z`, all_day: false } }));
  const want = tzParts(`${todayPlus(20)}T08:30:00Z`);
  check('a timed deadline is stored as local date + HH:MM', timed.status === 201 && taskRow(timed.json.id).deadline === want.date && taskRow(timed.json.id).deadline_time === want.time && timed.json.due.all_day === false, `${timed.raw} want ${JSON.stringify(want)}`);
  check('... and read back as ISO 8601 with the offset of that day', new Date(timed.json.due.at).toISOString() === `${todayPlus(20)}T08:30:00.000Z`, timed.json.due.at);
  const dstYear = new Date().getUTCFullYear() + 1;
  const dstDay = lastSundayOfMarch(dstYear);
  for (const [at, exp] of [[`${dstDay}T00:30:00Z`, '01:30'], [`${dstDay}T01:30:00Z`, '03:30']]) {
    const r = await put('waaitask1' + at.slice(11, 13) + at.slice(14, 16), payload({ due: { at, all_day: false } }));
    check(`DST ${dstDay}: ${at.slice(11, 16)}Z is stored as local ${exp}`, r.status === 201 && taskRow(r.json.id).deadline === dstDay && taskRow(r.json.id).deadline_time === exp, `${r.raw} ${JSON.stringify(taskRow(r.json?.id))}`);
    check(`... and the same instant comes back`, new Date(r.json?.due?.at).toISOString().slice(0, 16) === at.slice(0, 16), r.json?.due?.at);
  }
  const day = await put('waaitask0010', payload({ due: { at: `${dstDay}T22:59:00Z`, all_day: true } }));
  check('an all-day deadline keeps the local day around the change', taskRow(day.json.id).deadline === tzParts(`${dstDay}T22:59:00Z`).date && taskRow(day.json.id).deadline_time === null, day.raw);

  section('task push: text is cleaned');
  const dirty = await put('waaitask0011', payload({
    title: '<b>Call</b> <script>alert(1)</script>Marek\u202E\u0000\u200Bnow',
    description: 'Line 1\u202E\r\n<img src=x onerror=alert(1)>Line 2\u0000\n\n\n\nFamily 👨\u200D👩\u200D👧 &lt;b&gt;x&lt;/b&gt;',
    context: { conversation: '<i>Marek</i>\u202E', assignee_label: 'Me\u0000', path: '/c/ckx8abc' },
  }));
  row = taskRow(dirty.json?.id);
  check('markup, NUL, bidi overrides and zero-width spaces are gone from the title', dirty.status === 201 && row.title === 'Call alert(1)Mareknow', JSON.stringify(row?.title));
  check('the description: no tags, no NUL/bidi, blank runs collapsed, the ZWJ emoji sequence kept', !/[<>]/.test(row.description) && !/[\u202E\u0000]/.test(row.description) && row.description.includes('Line 1\nLine 2\n\nFamily 👨\u200D👩\u200D👧 x'), JSON.stringify(row.description));
  check('the footer is built from the cleaned context', row.description.includes('WhatsApp chat: Marek\n') && row.description.includes('WhatsApp assignee: Me\n'), JSON.stringify(row.description));

  section('task push: completion');
  const done1 = await put('waaitask0012', payload({ status: 'completed' }));
  check('created as completed -> done state, attributed to the owner', done1.status === 201 && done1.json.done === true && done1.json.state.code === 'done' && taskRow(done1.json.id).completed_by === ADMIN_NAME && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(taskRow(done1.json.id).completed_at), done1.raw);
  const afterDone = await put('waaitask0012', payload({ status: 'open', title: 'Changed after done' }));
  check('done is final: later changes and `open` are ignored', afterDone.status === 200 && afterDone.json.applied.length === 0 && afterDone.json.done === true && taskRow(done1.json.id).title === 'Poslať ponuku', afterDone.raw);
  const open1 = await put('waaitask0013', payload());
  const complete1 = await put('waaitask0013', payload({ status: 'completed' }));
  check('open -> completed on update completes the task', JSON.stringify(complete1.json?.applied) === '["status"]' && complete1.json.state.code === 'done' && taskRow(open1.json.id).completed_by === ADMIN_NAME, complete1.raw);
  const inProg = await put('waaitask0014', payload());
  sql(`UPDATE tasks SET status='in_progress' WHERE id=${sq(inProg.json.id)};`);
  const stillOpen = await put('waaitask0014', payload({ status: 'open', title: 'Retitled while in progress' }));
  check('`open` never moves a task between non-done states', taskRow(inProg.json.id).status === 'in_progress' && !stillOpen.json.applied.includes('status') && taskRow(inProg.json.id).title === 'Retitled while in progress', stillOpen.raw);

  const needs = await put('waaitask0015', payload());
  sql(`UPDATE tasks SET requires_conclusion=1 WHERE id=${sq(needs.json.id)};`);
  const refusedDone = await put('waaitask0015', payload({ status: 'completed', title: 'Should not apply' }));
  check('a push that completes a task needing a conclusion -> 422 completion_refused', refusedDone.status === 422 && errCode(refusedDone) === 'completion_refused', refusedDone.raw);
  check('... and rolls back entirely (title and status unchanged)', taskRow(needs.json.id).status === 'todo' && taskRow(needs.json.id).title === 'Poslať ponuku');

  section('task push: deleted in CCRM');
  const gone = await put('waaitask0016', payload());
  sql(`DELETE FROM tasks WHERE id=${sq(gone.json.id)};`);   // what the app's delete does: a hard delete
  const after410 = await put('waaitask0016', payload({ title: 'Back from the dead' }));
  check('a push for a task a user deleted -> 410 gone, not recreated', after410.status === 410 && errCode(after410) === 'gone' && cell(`SELECT COUNT(*) FROM tasks WHERE title='Back from the dead'`) === '0', after410.raw);
  const luk = await call('/tasks/lookup', { method: 'POST', token, body: { external_ids: ['waaitask0016', 'waaitask0001', 'waaitaskNone1'] } });
  check('lookup lists it under deleted, the live one as an item, the unknown one as not_found', luk.status === 200 && JSON.stringify(luk.json.deleted.external_ids) === '["waaitask0016"]' && luk.json.items.length === 1 && luk.json.items[0].external_id === 'waaitask0001'
    && JSON.stringify(luk.json.not_found.external_ids) === '["waaitaskNone1"]', luk.raw);

  section('task feed, lookup, complete (CCRM-origin tasks)');
  resetRate();
  const T = `'2031-02-03 04:05:06.000'`;
  const seed = (tid, owner, status, createdBy) => sql(`DELETE FROM tasks WHERE id=${sq(tid)}; INSERT INTO tasks (id,title,deadline,status,owner,created_by,updated_at) VALUES (${sq(tid)},${sq('Feed ' + tid)},'2031-03-01',${sq(status)},${sq(owner)},${sq(createdBy ?? owner)},${T});`);
  seed('tsk_feed_a1', ADMIN_NAME, 'todo');
  seed('tsk_feed_a2', ADMIN_NAME, 'todo');
  seed('tsk_feed_a3', VIEWER_NAME, 'todo');
  sql(`INSERT INTO task_assignees (task_id,user_name) VALUES ('tsk_feed_a3', ${sq(ADMIN_NAME)});`);
  seed('tsk_feed_a4', ADMIN_NAME, 'done');
  seed('tsk_feed_x1', VIEWER_NAME, 'todo');
  seed('tsk_feed_x2', ADMIN_NAME, 'todo');
  sql(`DELETE FROM integration_clients WHERE code='other'; INSERT INTO integration_clients (id,code,name,is_active,scopes,allowed_ips,owner_user_ids) VALUES ('intc_other','other','Other',1,'[]','[]','[]');
       INSERT INTO integration_refs (client_id,kind,external_id,local_id,revision) VALUES ('intc_other','task','otherext0001','tsk_feed_x2',1);`);
  const feed = (qs) => call(`/tasks/feed?${qs}`, { token });
  const SINCE = 1900000000;   // far below the seeded updated_at (2031), far above everything else
  const ids = (r) => r.json?.items?.map((i) => i.id);

  setClient(`scopes='["tasks:push"]'`);
  check('the feed needs tasks:pull -> 403', (await feed(`updated_since=${SINCE}`)).status === 403);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);
  const all1 = await feed(`updated_since=${SINCE}`);
  check('feed (owners scope): the owner\'s tasks, including one where the owner is only an assignee', all1.status === 200 && JSON.stringify(ids(all1)) === '["tsk_feed_a1","tsk_feed_a2","tsk_feed_a3","tsk_feed_a4"]', all1.raw.slice(0, 400));
  const a1 = all1.json?.items?.[0];
  check('a CCRM-origin task: origin crm, no external id, string ids, ISO due, done flag', a1?.origin === 'crm' && a1.external_id === null && a1.created_by === ADMIN_ID && a1.state.code === 'todo' && a1.done === false && a1.due.all_day === true
    && a1.due.at.startsWith('2031-03-01T23:59:00') && a1.updated_at >= SINCE && all1.json.items[3].done === true && a1.is_automation === false, JSON.stringify(a1));
  check('the other client\'s task and a non-owner\'s task are not in the feed', !ids(all1).includes('tsk_feed_x1') && !ids(all1).includes('tsk_feed_x2'));
  const paged = [];
  let cursor = `updated_since=${SINCE}&limit=2`, pages = 0, hasMore = true, lastNext = null;
  while (hasMore && pages < 6) {
    const r = await feed(cursor);
    paged.push(...ids(r));
    hasMore = r.json.has_more;
    lastNext = r.json.next;
    cursor = `updated_since=${r.json.next.updated_since}&after_id=${encodeURIComponent(r.json.next.after_id)}&limit=2`;
    pages++;
  }
  check('paging with limit=2 across equal updated_at returns every task exactly once, in id order', JSON.stringify(paged) === '["tsk_feed_a1","tsk_feed_a2","tsk_feed_a3","tsk_feed_a4"]' && pages === 2, `${paged} pages=${pages}`);
  check('the cursor is (seconds, string id) of the last item', lastNext?.after_id === 'tsk_feed_a4' && Number.isInteger(lastNext.updated_since), JSON.stringify(lastNext));
  const tail = await feed(`updated_since=${lastNext.updated_since}&after_id=${lastNext.after_id}`);
  check('after the last cursor the feed is empty', tail.json?.items.length === 0 && tail.json.has_more === false && tail.json.next.after_id === 'tsk_feed_a4', tail.raw);
  check('open_only leaves out done tasks', JSON.stringify(ids(await feed(`updated_since=${SINCE}&open_only=1`))) === '["tsk_feed_a1","tsk_feed_a2","tsk_feed_a3"]');
  for (const bad of ['limit=0', 'limit=101', 'limit=x', 'updated_since=-1', 'updated_since=abc', 'after_id=a%20b']) {
    check(`feed refuses ${bad} -> 422`, (await feed(bad)).status === 422, bad);
  }
  setClient(`feed_scope='all'`);
  check('feed_scope=all adds the other users\' tasks, but never another client\'s', JSON.stringify(ids(await feed(`updated_since=${SINCE}`))) === '["tsk_feed_a1","tsk_feed_a2","tsk_feed_a3","tsk_feed_a4","tsk_feed_x1"]');
  setClient(`feed_scope='owners'`);
  setClient(`owner_user_ids='[]'`);
  check('without owners the owners scope is empty', (await feed(`updated_since=${SINCE}`)).json?.items.length === 0);
  setClient(`owner_user_ids='["${ADMIN_ID}"]'`);
  check('pushed (WAAI-origin) tasks appear in the feed with origin waai', (await feed('updated_since=0&limit=100')).json?.items.some((i) => i.id === id && i.origin === 'waai' && i.external_id === EXT));

  const look = (body, tok = token) => call('/tasks/lookup', { method: 'POST', token: tok, body });
  const l1 = await look({ task_ids: ['tsk_feed_a2', 'tsk_feed_x1', 'tsk_feed_x2', 'tsk_none_1', id] });
  check('lookup by task id: visible ones as items, everything else not_found (hidden = missing)', l1.status === 200 && JSON.stringify(l1.json.items.map((i) => i.id).sort()) === JSON.stringify(['tsk_feed_a2', id].sort())
    && JSON.stringify(l1.json.not_found.task_ids) === '["tsk_feed_x1","tsk_feed_x2","tsk_none_1"]' && l1.json.deleted.external_ids.length === 0, l1.raw);
  setClient(`scopes='["tasks:push"]'`);
  const l2 = await look({ task_ids: ['tsk_feed_a2', id], external_ids: [EXT] });
  check('with tasks:push only: its own pushed task is visible, a CCRM-origin task is not', JSON.stringify(l2.json?.items.map((i) => i.id)) === JSON.stringify([id]) && JSON.stringify(l2.json.not_found.task_ids) === '["tsk_feed_a2"]', l2.raw);
  setClient(`scopes='["tasks:pull"]'`);
  const l3 = await look({ task_ids: ['tsk_feed_a2', id], external_ids: [EXT] });
  check('with tasks:pull only: the feed scope is visible, external ids are not resolvable', l3.json?.items.map((i) => i.id).sort().join() === ['tsk_feed_a2', id].sort().join() && JSON.stringify(l3.json.not_found.external_ids) === JSON.stringify([EXT]), l3.raw);
  setClient(`scopes='["users:read"]'`);
  check('lookup needs tasks:push or tasks:pull -> 403', (await look({ task_ids: [] })).status === 403);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);
  check('lookup refuses integer ids, a bad external id, a non-list and > 200 ids -> 422', (await look({ task_ids: [5] })).status === 422 && (await look({ external_ids: ['x'] })).status === 422
    && (await look({ task_ids: 'a' })).status === 422 && (await look({ task_ids: Array.from({ length: 201 }, (_, i) => 'tsk_n' + i) })).status === 422);
  check('lookup with nothing asked for is an empty answer', JSON.stringify((await look({})).json) === '{"items":[],"deleted":{"external_ids":[]},"not_found":{"task_ids":[],"external_ids":[]}}');

  const comp = (tid, body, tok = token) => call(`/tasks/${tid}/complete`, { method: 'POST', token: tok, ...(body !== undefined ? { body } : {}) });
  const c1 = await comp('tsk_feed_a1');
  check('complete -> 200, done, attributed to the client\'s first owner', c1.status === 200 && c1.json.done === true && c1.json.state.code === 'done' && taskRow('tsk_feed_a1').completed_by === ADMIN_NAME && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(taskRow('tsk_feed_a1').completed_at), c1.raw);
  const upd = taskRow('tsk_feed_a1').updated;
  await new Promise((r) => setTimeout(r, 30));
  const c2 = await comp('tsk_feed_a1');
  check('completing again is safe: 200, unchanged', c2.status === 200 && c2.json.done === true && taskRow('tsk_feed_a1').updated === upd, c2.raw);
  const c3 = await comp('tsk_feed_a2', { user_id: PHONE_ID, conclusion: '<b>Done</b> by phone' });
  check('the completion can be attributed to a user and carry a (cleaned) conclusion', c3.status === 200 && taskRow('tsk_feed_a2').completed_by === PHONE_NAME && taskRow('tsk_feed_a2').conclusion === 'Done by phone', c3.raw);
  check('an unknown user_id -> 422; a non-object body -> 400', (await comp('tsk_feed_a3', { user_id: 'nobody' })).status === 422 && (await comp('tsk_feed_a3', [1])).status === 400);
  check('a task outside the feed scope or unknown -> 404 not_found', (await comp('tsk_feed_x1')).status === 404 && errCode(await comp('tsk_feed_x2')) === 'not_found' && (await comp('tsk_nope_1')).status === 404 && (await comp('a%20b')).status === 404);
  setClient(`scopes='["tasks:push"]'`);
  check('complete needs tasks:pull -> 403', (await comp('tsk_feed_a3')).status === 403);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);
  sql(`UPDATE tasks SET requires_conclusion=1 WHERE id='tsk_feed_a3';`);
  const c4 = await comp('tsk_feed_a3');
  check('a task that needs a conclusion -> 422 completion_refused, left open', c4.status === 422 && errCode(c4) === 'completion_refused' && taskRow('tsk_feed_a3').status === 'todo', c4.raw);
  const c5 = await comp('tsk_feed_a3', { conclusion: 'Handled' });
  check('... with a conclusion it completes', c5.status === 200 && c5.json.done === true && taskRow('tsk_feed_a3').conclusion === 'Handled', c5.raw);
  const doneInFeed = await feed(`updated_since=${SINCE}&open_only=1`);
  check('a completed task drops out of the open feed', doneInFeed.json?.items.length === 0 || !ids(doneInFeed).includes('tsk_feed_a1'));
  const au = sql(`SELECT detail FROM audit_log WHERE action='integration_task_complete' ORDER BY id`).split('\n').slice(1).filter(Boolean);
  check('completions are audited with ids only (and the no-op repeat is not)', au.length === 3 && au.every((d) => /^complete tsk_feed_a[123]$/.test(d)), au.join(' | '));

  section('task API: the pushed task as a user sees it');
  g = await syncApi(session);
  const shown = g.json.tasks.find((x) => x.id === id);
  check('the app\'s task list contains the pushed task with its assignees', !!shown && shown.owner === ADMIN_NAME && shown.assignedUsers.includes(PHONE_NAME) && shown.createdBy === ADMIN_NAME, JSON.stringify(shown));
  check('the audit trail holds no task text', cell(`SELECT COUNT(*) FROM audit_log WHERE action LIKE 'integration_task%' AND (detail LIKE '%Poslať%' OR detail LIKE '%Marek%')`) === '0');
}

// ----------------------------------------------------------------------------- 2c. directory and chat links
async function directoryChecks(state) {
  const token = state.token2;
  const session = state.adminSession;
  const SINCE = 1900000000;   // far below the seeded updated_at (2031), far above everything the clone holds
  sql(`DELETE FROM integration_rate;`);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}', owner_user_ids='["${USERS.admin[0]}"]'`);

  section('directory');
  sql(`DELETE FROM whatsapp_links; DELETE FROM whatsapp_numbers;
       DELETE FROM leads WHERE id IN ('client-intp1','lead-intp1','lead-intp2');
       DELETE FROM projects WHERE id='project-intp1'; DELETE FROM project_types WHERE id='intptype'; DROP TABLE IF EXISTS proj_data_intptype;
       INSERT INTO leads (id,name,owner,created_at,phone,country,client_id,adjustment,archived) VALUES
         ('client-intp1','Probe Client','x','2031-01-01','0905 111 222','Slovakia',NULL,0,0),
         ('lead-intp1','Probe Lead','x','2031-01-01','+421 905 333 444','Slovakia','client-intp1',0,0),
         ('lead-intp2','Probe Adjusted','x','2031-01-01',NULL,NULL,NULL,5,1);
       UPDATE leads SET updated_at='2031-01-01 00:00:00' WHERE id IN ('client-intp1','lead-intp1');
       UPDATE leads SET updated_at='2031-01-01 00:00:01' WHERE id='lead-intp2';
       INSERT INTO project_types (id,name,icon,color,attributes_json) VALUES ('intptype','Probe type','Box','#000000',
         ${sq(JSON.stringify([{ id: 'contactattr', name: 'Contact', type: 'contact', required: false }, { id: 'noteattr', name: 'Note', type: 'textfield', required: false }]))});
       CREATE TABLE proj_data_intptype (id VARCHAR(50) PRIMARY KEY, project_id VARCHAR(50) NOT NULL, attr_contactattr LONGTEXT NULL, attr_noteattr LONGTEXT NULL);
       INSERT INTO projects (id,project_type_id,name,lead_id,client_id,status,contact_phone) VALUES ('project-intp1','intptype','Probe Project','lead-intp1','client-intp1','active','0911 000 111');
       UPDATE projects SET updated_at='2031-01-01 00:00:01' WHERE id='project-intp1';
       INSERT INTO proj_data_intptype (id,project_id,attr_contactattr,attr_noteattr) VALUES ('pd1','project-intp1','lead-intp2','not a lead');`);

  const dir = (qs = '') => call(`/directory?updated_since=${SINCE}${qs}`, { token });
  setClient(`scopes='["tasks:push"]'`);
  check('the directory needs directory:read -> 403', (await dir()).status === 403);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);

  const all = await dir();
  const keys = all.json?.items?.map((i) => `${i.type}:${i.id}`);
  check('lead, client and project rows come back ordered by (updated_at, type:id)', all.status === 200
    && JSON.stringify(keys) === '["lead:client-intp1","lead:lead-intp1","lead:lead-intp2","project:project-intp1"]' && all.json.has_more === false, all.raw.slice(0, 500));
  const [client, lead, adjusted, project] = all.json?.items ?? [];
  check('client: is_client, raw phone and country, link to the clients page', client?.is_client === true && client.client_id === null && client.phone === '0905 111 222' && client.country === 'Slovakia'
    && client.archived === false && client.url === 'https://crm.test/#clients/client-intp1' && /^2031-01-01T00:00:00[+-]\d\d:\d\d$/.test(client.updated_at), JSON.stringify(client));
  check('lead: not a client, linked to its client by client_id', lead?.is_client === false && lead.client_id === 'client-intp1' && lead.phone === '+421 905 333 444' && lead.url === 'https://crm.test/#leads/lead-intp1', JSON.stringify(lead));
  check('a record with a value adjustment is a client; archived and empty phone are reported as they are', adjusted?.is_client === true && adjusted.archived === true && adjusted.phone === null && adjusted.country === null, JSON.stringify(adjusted));
  check('project: contact phone, client, lead, status and the contact attribute\'s lead ids', project?.contact_phone === '0911 000 111' && project.client_id === 'client-intp1' && project.lead_id === 'lead-intp1'
    && JSON.stringify(project.contact_lead_ids) === '["lead-intp2"]' && project.status === 'active' && project.name === 'Probe Project' && project.url === 'https://crm.test/#projects/project-intp1', JSON.stringify(project));
  check('no financial or other private fields leak into an item', !all.raw.includes('"value"') && !all.raw.includes('adjustment') && !all.raw.includes('"email"') && !all.raw.includes('"owner"'));

  const seen = [];
  const cursorTs = Number(cell(`SELECT FLOOR(UNIX_TIMESTAMP(updated_at)) FROM leads WHERE id='lead-intp2'`));
  let qs = `updated_since=${SINCE}&limit=3`, pages = 0, more = true, firstNext = null;
  while (more && pages < 5) {
    const r = await call(`/directory?${qs}`, { token });
    seen.push(...r.json.items.map((i) => `${i.type}:${i.id}`));
    more = r.json.has_more;
    firstNext ??= r.json.next;
    qs = `updated_since=${r.json.next.updated_since}&after_id=${encodeURIComponent(r.json.next.after_id)}&limit=3`;
    pages++;
  }
  check('the cursor is (seconds, "type:id") of the last item', firstNext?.after_id === 'lead:lead-intp2' && firstNext.updated_since === cursorTs, JSON.stringify(firstNext));
  check('paging with limit=3 across equal updated_at returns every row exactly once, in two pages', JSON.stringify(seen) === JSON.stringify(keys) && pages === 2, `${seen.join(',')} pages=${pages}`);
  const tail = await call(`/directory?updated_since=${cursorTs}&after_id=project%3Aproject-intp1`, { token });
  check('after the last cursor the directory is empty and the cursor stays', tail.json?.items.length === 0 && tail.json.has_more === false && tail.json.next.after_id === 'project:project-intp1', tail.raw);
  for (const bad of ['limit=0', 'limit=201', 'limit=x', 'after_id=lead', 'after_id=lead%3A', 'after_id=other%3Aabc', 'after_id=lead%3Aa%20b', 'updated_since=-1', 'updated_since=abc']) {
    check(`directory refuses ${bad} -> 422`, (await call(`/directory?${bad}`, { token })).status === 422, bad);
  }
  check('POST on /directory -> 405 with Allow: GET', (await call('/directory', { method: 'POST', token, body: {} })).headers.get('allow') === 'GET');

  section('project contact phone through the app\'s sync');
  let g = await syncApi(session);
  const proj = g.json?.projects?.find((p) => p.id === 'project-intp1');
  check('sync GET carries the project\'s contactPhone', proj?.contactPhone === '0911 000 111', JSON.stringify(proj)?.slice(0, 300));
  const saveProject = (patch, drop = []) => {
    const p = { ...proj, ...patch };
    for (const k of drop) delete p[k];
    return syncApi(session, { method: 'POST', body: { syncProtocol: 2, baseSyncedAt: g.json.serverTime, projects: [p] } });
  };
  const phoneOf = () => cell(`SELECT IFNULL(contact_phone,'<null>') FROM projects WHERE id='project-intp1'`);
  let saved = await saveProject({ contactPhone: ' +421 911 222 333 ' });
  check('the app\'s save stores the contact phone, trimmed', saved.status === 200 && saved.json?.success === true && phoneOf() === '+421 911 222 333', `${saved.raw.slice(0, 200)} ${phoneOf()}`);
  g = await syncApi(session);
  saved = await saveProject({}, ['contactPhone']);
  check('a client that does not send the key leaves it alone', saved.status === 200 && phoneOf() === '+421 911 222 333', phoneOf());
  g = await syncApi(session);
  saved = await saveProject({ contactPhone: 'x'.repeat(80) });
  check('it is cut to 50 characters', phoneOf() === 'x'.repeat(50), phoneOf());
  g = await syncApi(session);
  saved = await saveProject({ contactPhone: '' });
  check('an empty value clears it', phoneOf() === '<null>', phoneOf());
  sql(`UPDATE projects SET contact_phone='0911 000 111' WHERE id='project-intp1';`);

  section('chat links');
  const REF = 'ckx8abcdef01';
  const link = (ref, body, opts = {}) => call(`/whatsapp/links/${ref}`, { method: 'PUT', token, body, ...opts });
  const good = (over = {}) => ({
    title: 'Marek Novák', is_group: false, phone: '421905333444', owner_id: USERS.admin[0], path: `/c/${REF}`, last_message_at: '2026-10-29T14:03:00+01:00',
    links: [{ entity_type: 'lead', entity_id: 'client-intp1', source: 'auto' }, { entity_type: 'project', entity_id: 'project-intp1', source: 'auto' }],
    ...over,
  });
  const rowsOf = (ref) => sql(`SELECT CONCAT_WS('|', entity_type, entity_id, link_source, title, is_group, IFNULL(phone_digits,'-'), IFNULL(owner_user_id,'-'), path, IFNULL(last_message_at,'-')) FROM whatsapp_links WHERE conversation_ref=${sq(ref)} ORDER BY entity_type, entity_id`).split('\n').slice(1).filter(Boolean);

  setClient(`scopes='["tasks:push"]'`);
  check('links need whatsapp:links -> 403', (await link(REF, good())).status === 403);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);
  const put1 = await link(REF, good());
  check('PUT stores one row per entity with the chat\'s title, phone, owner, path and local last-message time', put1.status === 200 && put1.json.links.length === 2 && put1.json.ignored.length === 0
    && JSON.stringify(rowsOf(REF)) === JSON.stringify([`lead|client-intp1|auto|Marek Novák|0|421905333444|${USERS.admin[0]}|/c/${REF}|${tzParts('2026-10-29T14:03:00+01:00').date} ${tzParts('2026-10-29T14:03:00+01:00').time}:00`, `project|project-intp1|auto|Marek Novák|0|421905333444|${USERS.admin[0]}|/c/${REF}|${tzParts('2026-10-29T14:03:00+01:00').date} ${tzParts('2026-10-29T14:03:00+01:00').time}:00`]), `${put1.raw} ${rowsOf(REF)}`);
  const stamp = () => cell(`SELECT MAX(updated_at) FROM whatsapp_links WHERE conversation_ref=${sq(REF)}`);
  const before = stamp();
  await new Promise((r) => setTimeout(r, 30));
  const put2 = await link(REF, good());
  check('repeating the same PUT is idempotent: same rows, updated_at untouched', put2.status === 200 && rowsOf(REF).length === 2 && stamp() === before, `${before} -> ${stamp()}`);
  const put3 = await link(REF, good({ title: 'Marek N.', links: [{ entity_type: 'lead', entity_id: 'client-intp1', source: 'manual' }] }));
  check('a PUT replaces the whole set: the project link is gone, the lead link is manual and carries the new title', put3.status === 200 && JSON.stringify(rowsOf(REF).map((r) => r.split('|').slice(0, 4).join('|'))) === '["lead|client-intp1|manual|Marek N."]', rowsOf(REF).join(' ; '));
  const dup = await link(REF, good({ links: [{ entity_type: 'lead', entity_id: 'lead-intp1', source: 'manual' }, { entity_type: 'lead', entity_id: 'lead-intp1', source: 'auto' }] }));
  check('the same entity twice collapses; manual beats auto', dup.status === 200 && dup.json.links.length === 1 && dup.json.links[0].source === 'manual' && rowsOf(REF).length === 1, dup.raw);
  const ghost = await link(REF, good({ links: [{ entity_type: 'lead', entity_id: 'client-intp1', source: 'auto' }, { entity_type: 'lead', entity_id: 'lead-deleted', source: 'auto' }, { entity_type: 'project', entity_id: 'project-gone', source: 'auto' }] }));
  check('a link to a lead or project that does not exist is ignored and reported, the rest is stored', ghost.status === 200 && ghost.json.links.length === 1 && JSON.stringify(ghost.json.ignored) === '[{"entity_type":"lead","entity_id":"lead-deleted"},{"entity_type":"project","entity_id":"project-gone"}]' && rowsOf(REF).length === 1, ghost.raw);
  const none = await link(REF, good({ links: [] }));
  check('an empty link list removes every link of the conversation', none.status === 200 && none.json.links.length === 0 && rowsOf(REF).length === 0, none.raw);
  const group = await link('grp0000000001', good({ is_group: true, phone: null, owner_id: null, last_message_at: null, path: '/c/grp0000000001', links: [{ entity_type: 'project', entity_id: 'project-intp1', source: 'manual' }] }));
  check('a group has no phone, owner or last message', group.status === 200 && rowsOf('grp0000000001')[0] === 'project|project-intp1|manual|Marek Novák|1|-|-|/c/grp0000000001|-', `${group.raw} ${rowsOf('grp0000000001')}`);

  section('chat links: validation');
  const refuse = async (what, over, ref = REF) => {
    const r = await link(ref, good(over));
    check(`${what} -> 422`, r.status === 422 && errCode(r) === 'validation_failed', `${r.status} ${r.raw}`);
  };
  await refuse('a path that is not a chat path', { path: '/c/../etc' });
  await refuse('a path with a message suffix (links point at the chat)', { path: `/c/${REF}?m=abc` });
  await refuse('a missing path', { path: undefined });
  await refuse('a phone with a plus sign or spaces', { phone: '+421 905 333 444' });
  await refuse('a phone that is too short', { phone: '123' });
  await refuse('an owner that is not a CCRM user', { owner_id: 'nobody-here' });
  await refuse('a non-boolean is_group', { is_group: 'yes' });
  await refuse('a title over 255 characters', { title: 'x'.repeat(256) });
  await refuse('a last_message_at without a time zone', { last_message_at: '2026-10-29T14:03:00' });
  await refuse('links that are not a list', { links: { a: 1 } });
  await refuse('more than 50 links', { links: Array.from({ length: 51 }, (_, i) => ({ entity_type: 'lead', entity_id: `l${i}`, source: 'auto' })) });
  await refuse('an unknown entity type', { links: [{ entity_type: 'ticket', entity_id: 'x', source: 'auto' }] });
  await refuse('an unknown source', { links: [{ entity_type: 'lead', entity_id: 'client-intp1', source: 'blocked' }] });
  await refuse('an entity id with spaces', { links: [{ entity_type: 'lead', entity_id: 'a b', source: 'auto' }] });
  await refuse('a conversation ref with a dot', {}, 'bad.ref');
  check('a missing links key -> 422', (await link(REF, (({ links, ...rest }) => rest)(good()))).status === 422);
  check('a non-object body -> 400', (await link(REF, [1])).status === 400);
  const markup = await link(REF, good({ title: '<b>Marek</b> &lt;i&gt;Novák&lt;/i&gt;', links: [{ entity_type: 'lead', entity_id: 'client-intp1', source: 'auto' }] }));
  check('the title is cleaned like any text from the chat app (no markup)', markup.status === 200 && rowsOf(REF)[0].split('|')[3] === 'Marek Novák', rowsOf(REF).join(' ; '));
  check('rows written by one failed PUT never appear (validation happens first)', rowsOf(REF).length === 1);

  section('chat links: delete and read');
  const del = await call(`/whatsapp/links/${REF}`, { method: 'DELETE', token });
  check('DELETE removes the conversation\'s links', del.status === 200 && del.json.deleted === 1 && rowsOf(REF).length === 0, del.raw);
  const del2 = await call(`/whatsapp/links/${REF}`, { method: 'DELETE', token });
  check('DELETE again is safe: 200, nothing deleted', del2.status === 200 && del2.json.deleted === 0, del2.raw);
  check('PATCH on a link -> 405 with Allow: PUT, DELETE', (await call(`/whatsapp/links/${REF}`, { method: 'PATCH', token, body: {} })).headers.get('allow') === 'PUT, DELETE');
  setClient(`scopes='["tasks:push"]'`);
  check('DELETE needs whatsapp:links -> 403', (await call(`/whatsapp/links/${REF}`, { method: 'DELETE', token })).status === 403);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);
  const audit = sql(`SELECT detail FROM audit_log WHERE action='integration_whatsapp_links' ORDER BY id`).split('\n').slice(1).filter(Boolean);
  check('link writes are audited with the reference and a count only', audit.length > 0 && audit.every((d) => /^(set|delete) [A-Za-z0-9_-]+ n=\d+$/.test(d)), audit.join(' | '));
  check('the audit trail holds no chat title', cell(`SELECT COUNT(*) FROM audit_log WHERE action='integration_whatsapp_links' AND detail LIKE '%Marek%'`) === '0');

  await link(REF, good());
  await link('grp0000000001', good({ is_group: true, phone: null, owner_id: null, last_message_at: null, path: '/c/grp0000000001', links: [{ entity_type: 'project', entity_id: 'project-intp1', source: 'manual' }] }));
  const nums = await call('/whatsapp/numbers', { method: 'PUT', token, body: { items: [{ phone: '421905333444', status: 'registered', checked_at: '2026-10-29T10:00:00Z' }, { phone: '421900000001', status: 'not_registered', checked_at: '2026-10-29T10:00:00Z' }] } });
  check('numbers: a batch is stored', nums.status === 200 && nums.json.stored === 2 && cell(`SELECT COUNT(*) FROM whatsapp_numbers`) === '2', nums.raw);
  await call('/whatsapp/numbers', { method: 'PUT', token, body: { items: [{ phone: '421900000001', status: 'registered', checked_at: '2026-10-30T10:00:00Z' }] } });
  check('numbers: a newer answer replaces the status', cell(`SELECT status FROM whatsapp_numbers WHERE phone_digits='421900000001'`) === 'registered');
  await call('/whatsapp/numbers', { method: 'PUT', token, body: { items: [{ phone: '421900000001', status: 'not_registered', checked_at: '2026-10-01T10:00:00Z' }] } });
  check('numbers: an older answer arriving late does not overwrite a newer one', cell(`SELECT status FROM whatsapp_numbers WHERE phone_digits='421900000001'`) === 'registered');
  for (const [what, items] of [['a non-list', { a: 1 }], ['a bad status', [{ phone: '421900000002', status: 'maybe' }]], ['a bad phone', [{ phone: '+421900000002', status: 'registered' }]], ['501 items', Array.from({ length: 501 }, (_, i) => ({ phone: String(421000000000 + i), status: 'registered' }))], ['a non-object item', ['x']]]) {
    const r = await call('/whatsapp/numbers', { method: 'PUT', token, body: { items } });
    check(`numbers refuses ${what} -> 422`, r.status === 422, r.raw);
  }
  setClient(`scopes='["tasks:push"]'`);
  check('numbers need whatsapp:links -> 403', (await call('/whatsapp/numbers', { method: 'PUT', token, body: { items: [] } })).status === 403);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);

  section('chat links as the app sees them');
  g = await syncApi(session);
  const l = g.json?.whatsappLinks?.find((x) => x.conversationRef === REF && x.entityId === 'client-intp1');
  check('sync GET carries the links for an administrator', l?.entityType === 'lead' && l.source === 'auto' && l.title === 'Marek Novák' && l.isGroup === false && l.phone === '421905333444' && l.ownerUserId === USERS.admin[0] && l.path === `/c/${REF}` && g.json.whatsappLinks.length === 3, JSON.stringify(g.json?.whatsappLinks));
  check('... and the number checks', g.json?.whatsappNumbers?.some((n) => n.phone === '421900000001' && n.status === 'registered' && !!n.checkedAt), JSON.stringify(g.json?.whatsappNumbers));
  const viewerSession = await login(USERS.viewer[0] + '@probe.test');
  const vg = await syncApi(viewerSession);
  check('a user without the whatsapp permission gets neither', vg.status === 200 && Array.isArray(vg.json?.whatsappLinks) && vg.json.whatsappLinks.length === 0 && vg.json.whatsappNumbers.length === 0, vg.raw.slice(0, 200));
  const writeAttempt = await syncApi(session, { method: 'POST', body: { syncProtocol: 2, baseSyncedAt: g.json.serverTime, whatsappLinks: [], whatsappNumbers: [] } });
  check('a save from the app cannot touch the link tables', writeAttempt.status === 200 && cell(`SELECT COUNT(*) FROM whatsapp_links`) === '3' && cell(`SELECT COUNT(*) FROM whatsapp_numbers`) === '2', writeAttempt.raw.slice(0, 200));
  check('deleting the lead does not fail and the link rows are left for WAAI to drop', (() => { sql(`DELETE FROM leads WHERE id='lead-intp1'`); return cell(`SELECT COUNT(*) FROM whatsapp_links`) === '3'; })());

  section('messages in the install language');
  const needs = await call('/tasks/external/waaitasklang01', { method: 'PUT', token, body: { revision: Date.now(), title: 'Language check', description: '', status: 'open', owner_id: USERS.admin[0], assignee_ids: [USERS.admin[0]], context: { conversation: 'Marek', is_group: false, assignee_label: '', path: '/c/ckx8abc' } } });
  sql(`UPDATE tasks SET requires_conclusion=1 WHERE id=${sq(needs.json.id)};`);
  const WANT = {
    en: 'This task requires a conclusion before it can be completed.',
    sk: 'Táto úloha vyžaduje záver, až potom ju možno dokončiť.',
    hu: 'Ehhez a feladathoz lezárás (következtetés) szükséges, mielőtt befejezhető.',
  };
  const GONE = { en: 'The task was deleted in CCRM.', sk: 'Úloha bola v CCRM vymazaná.', hu: 'A feladatot törölték a CCRM-ben.' };
  const MISSING = { en: 'No such task.', sk: 'Taká úloha neexistuje.', hu: 'Nincs ilyen feladat.' };
  for (const lang of ['en', 'sk', 'hu', 'de']) {
    sql(`REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('SYSTEM_LANGUAGE', ${sq(lang)});`);
    const k = lang === 'de' ? 'sk' : lang;   // an unsupported language falls back to the app default, Slovak
    const viaPut = await call('/tasks/external/waaitasklang01', { method: 'PUT', token, body: { revision: Date.now() + 1, title: 'Language check', description: '', status: 'completed', owner_id: USERS.admin[0], assignee_ids: [USERS.admin[0]] } });
    check(`completion_refused via PUT is in ${lang === 'de' ? 'the default (sk) for an unsupported language' : lang}`, viaPut.status === 422 && viaPut.json?.error?.message === WANT[k], viaPut.raw);
    const viaComplete = await call(`/tasks/${needs.json.id}/complete`, { method: 'POST', token });
    check(`completion_refused via /complete is in ${k}`, viaComplete.status === 422 && viaComplete.json?.error?.message === WANT[k], viaComplete.raw);
    const missing = await call('/tasks/tsk_nope_lang/complete', { method: 'POST', token });
    check(`not_found is in ${k}`, missing.status === 404 && missing.json?.error?.message === MISSING[k], missing.raw);
  }
  sql(`REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('SYSTEM_LANGUAGE', 'hu');`);
  sql(`DELETE FROM tasks WHERE id=${sq(needs.json.id)};`);
  const goneRes = await call('/tasks/external/waaitasklang01', { method: 'PUT', token, body: { revision: Date.now() + 2, title: 'Language check', description: '', status: 'open', owner_id: USERS.admin[0], assignee_ids: [USERS.admin[0]] } });
  check('gone (task deleted in CCRM) is in hu', goneRes.status === 410 && goneRes.json?.error?.message === GONE.hu, goneRes.raw);
  sql(`REPLACE INTO system_settings (\`key\`, \`value\`) VALUES ('SYSTEM_LANGUAGE', 'en');`);
}

async function timelineChecks(state) {
  section('timeline push: validation and scopes');
  const token = state.token2;
  const session = state.adminSession;

  // Ensure test client lead exists
  sql(`INSERT IGNORE INTO leads (id, name, client_type, created_at, updated_at) VALUES ('client-intp1', 'Acme s.r.o.', 'company', NOW(), NOW())`);

  const EXT = 'task_created:waaitask0001';
  const good = (overrides = {}) => ({
    revision: 1000,
    kind: 'task_created',
    lead_id: 'client-intp1',
    at: '2026-10-29T14:03:00+01:00',
    title: 'Zaslať cenovú ponuku',
    content: 'Do piatku · zodpovedný: Peter · z chatu „Marek Novák“',
    path: '/c/ckx8abc?m=ckm2xyz',
    ...overrides,
  });

  // Scope check
  setClient(`scopes='["tasks:push"]'`);
  const noScope = await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good() });
  check('timeline push needs timeline:push -> 403', noScope.status === 403);
  setClient(`scopes='${JSON.stringify(ALL_SCOPES)}'`);

  // Validation
  check('timeline push refuses invalid external_id -> 422', (await call('/timeline/external/bad%20id!', { method: 'PUT', token, body: good() })).status === 422);
  check('timeline push refuses non-object body -> 400', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: 'bad' })).status === 400);
  check('timeline push refuses missing revision -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ revision: null }) })).status === 422);
  check('timeline push refuses negative revision -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ revision: -1 }) })).status === 422);
  check('timeline push refuses unknown kind -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ kind: 'other' }) })).status === 422);
  check('timeline push refuses missing lead_id -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ lead_id: '' }) })).status === 422);
  check('timeline push refuses non-existent lead_id -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ lead_id: 'no-such-lead-999' }) })).status === 422);
  check('timeline push refuses non-existent project_id -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ project_id: 'no-such-proj-999' }) })).status === 422);
  check('timeline push refuses missing at -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ at: null }) })).status === 422);
  check('timeline push refuses invalid at -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ at: 'yesterday' }) })).status === 422);
  check('timeline push refuses empty title -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ title: '' }) })).status === 422);
  check('timeline push refuses bad path -> 422', (await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ path: 'https://evil.com' }) })).status === 422);

  section('timeline push: upsert and staleness');
  const first = await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good() });
  check('first timeline push creates row -> 201', first.status === 201 && first.json?.type === 'whatsapp' && first.json?.external_url === '/c/ckx8abc?m=ckm2xyz' && first.json?.stale === false, first.raw);
  const localId = first.json?.id;

  const row = sql(`SELECT id, lead_id, type, timestamp, title, content, external_url FROM timeline_events WHERE id=${sq(localId)}`).split('\n').slice(1).filter(Boolean)[0];
  check('timeline_events row stored correctly', row && row.includes('client-intp1') && row.includes('whatsapp') && row.includes('/c/ckx8abc?m=ckm2xyz'), row);

  // Stale revision
  const stale = await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ revision: 500, title: 'Old update' }) });
  check('stale revision returns stale: true -> 200', stale.status === 200 && stale.json?.stale === true, stale.raw);
  check('stale revision did not change title', cell(`SELECT title FROM timeline_events WHERE id=${sq(localId)}`) === 'Zaslať cenovú ponuku');

  // Idempotent / updated revision
  const update = await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ revision: 2000, title: 'Zaslať upravenú ponuku' }) });
  check('newer revision updates existing row -> 200', update.status === 200 && update.json?.id === localId && update.json?.title === 'Zaslať upravenú ponuku' && update.json?.stale === false, update.raw);
  check('database row updated', cell(`SELECT title FROM timeline_events WHERE id=${sq(localId)}`) === 'Zaslať upravenú ponuku');

  section('timeline push: 410 gone after CCRM delete');
  // User deletes event in CCRM
  sql(`DELETE FROM timeline_events WHERE id=${sq(localId)}`);
  const gone = await call(`/timeline/external/${EXT}`, { method: 'PUT', token, body: good({ revision: 3000 }) });
  check('pushing deleted timeline event returns 410 gone', gone.status === 410 && gone.json?.error?.code === 'gone', gone.raw);

  section('timeline entries appear on client timeline via sync');
  const EXT2 = 'task_created:waaitask0002';
  const push2 = await call(`/timeline/external/${EXT2}`, { method: 'PUT', token, body: good({ revision: 1000, title: 'Nová ponuka z WhatsAppu' }) });
  check('second push created -> 201', push2.status === 201, push2.raw);
  const syncRes = await syncApi(session);
  const clientObj = syncRes.json?.leads?.find((l) => l.id === 'client-intp1');
  const te = clientObj?.timeline?.find((e) => e.id === push2.json.id);
  check('event appears in client timeline from sync GET', te?.type === 'whatsapp' && te?.title === 'Nová ponuka z WhatsAppu' && te?.externalUrl === '/c/ckx8abc?m=ckm2xyz', JSON.stringify(clientObj?.timeline));
}

// ----------------------------------------------------------------------------- 3. cross-cutting
async function crossChecks(state) {
  section('cookies and logs');
  check('no response set a cookie', cookiesSeen.length === 0, cookiesSeen.join(' | '));
  const secret = state.token.slice(-64);
  await call('/ping?private=SECRETQUERY', { token: state.token2 });
  // Apache's error log is the container's stderr, which `docker logs` replays on stderr.
  const logged = spawnSync('docker', ['logs', '--tail', '5000', WEB], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = logged.stdout + logged.stderr;
  const mine = lines.split('\n').filter((l) => l.includes('[ccrm integration]'));
  check('every request is logged as one line', mine.some((l) => new RegExp(`req=[0-9a-f]{16} client=waai token=${state.prefix2} GET /intprobe/api/v1/ping status=200 ms=\\d+`).test(l)), mine.slice(-3).join('\n'));
  check('failures are logged too (the 401 for a missing token)', mine.some((l) => /client=- token=- GET .* status=401/.test(l)));
  // Apache's own access log keeps the whole URL (which is why a token in a query string is refused); the API's line must not.
  const ours = mine.join('\n');
  check('the API log line never holds a token secret or the query string', mine.length > 0 && !ours.includes('SECRETQUERY') && !ours.includes(secret) && !ours.includes(state.token2.slice(-64)), '');
}

// ----------------------------------------------------------------------------- main
const state = {};
try {
  libChecks();
  console.log('\nSetting up the scratch environment...');
  setup();
  await adminChecks(state);
  await apiChecks(state);
  await taskChecks(state);
  await directoryChecks(state);
  await timelineChecks(state);
  await crossChecks(state);
} catch (e) {
  failures++;
  console.log('ERROR ' + (e.stack || e.message));
} finally {
  teardown();
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
