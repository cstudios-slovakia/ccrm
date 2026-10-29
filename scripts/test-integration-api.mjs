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
  await crossChecks(state);
} catch (e) {
  failures++;
  console.log('ERROR ' + (e.stack || e.message));
} finally {
  teardown();
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
