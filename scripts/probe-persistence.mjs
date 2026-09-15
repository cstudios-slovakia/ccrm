#!/usr/bin/env node
/**
 * Prove sync.php mutations actually land in MySQL (GET after POST).
 * Uses a throwaway Admin on the local Docker backend. Cleans up after itself.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.CCRM_PROBE_URL || "http://127.0.0.1:8086";
const EMAIL = "ccrm-del-probe@local.test";
const PASS = "probe-pass-9f3K";
const PREFIX = "ccrm-del-probe-";

const cookies = new Map();

const storeCookies = (res) => {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
};

const cookieHeader = () =>
  [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

const json = async (path, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(),
      ...(opts.headers || {}),
    },
  });
  storeCookies(res);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { _raw: text.slice(0, 400) }; }
  return { status: res.status, body, text };
};

const findings = [];
const ok = [];
const check = (name, cond, detail) => {
  if (cond) ok.push(name);
  else findings.push({ name, detail });
  console.log(cond ? `PASS  ${name}` : `FAIL  ${name} — ${detail}`);
};

const phpFile = (name, code) => {
  const tmp = join(tmpdir(), name);
  writeFileSync(tmp, code);
  execSync(`docker cp ${JSON.stringify(tmp)} crm-19-jackfruit:/tmp/${name}`);
  return execSync(`docker exec crm-19-jackfruit php /tmp/${name}`, { encoding: "utf8" }).trim();
};

const hash = phpFile("ccrm-hash.php", `<?php echo password_hash(${JSON.stringify(PASS)}, PASSWORD_DEFAULT);`);

phpFile("ccrm-seed-probe.php", `<?php
require '/var/www/html/config.php';
$pdo = get_db_connection();
$hash = <<<'H'
${hash}
H;
$pdo->prepare('DELETE FROM users WHERE email=?')->execute([${JSON.stringify(EMAIL)}]);
$pdo->prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,?)')
    ->execute(['u-ccrm-del-probe','Probe',${JSON.stringify(EMAIL)},$hash,'Admin']);
echo 'seeded';
`);

const colType = phpFile("ccrm-col.php", `<?php
require '/var/www/html/config.php';
$pdo = get_db_connection();
$st = $pdo->query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leads' AND COLUMN_NAME='updated_at'");
echo (string)$st->fetchColumn();
`);
console.log(`leads.updated_at column type: ${colType || "(missing)"}`);

try {
  const login = await json("/api/login.php", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASS }) });
  check("login", login.status === 200 && login.body?.success === true, `status=${login.status} body=${JSON.stringify(login.body)}`);
  if (!login.body?.success) throw new Error("login failed");

  const get0 = await json("/sync.php");
  check("GET sync authenticated", get0.status === 200 && get0.body?.syncProtocol >= 2, `status=${get0.status} protocol=${get0.body?.syncProtocol}`);
  const serverTime = get0.body?.serverTime;
  check("serverTime is a string", typeof serverTime === "string" && serverTime.length > 8, `serverTime=${JSON.stringify(serverTime)}`);
  console.log(`  syncProtocol=${get0.body?.syncProtocol} serverTime=${serverTime} dataVersion=${get0.body?.dataVersion}`);

  const leadId = `${PREFIX}lead-${Date.now()}`;
  const lead = {
    id: leadId,
    name: `${PREFIX}Lead`,
    clientType: "person",
    status: "new",
    source: "website",
    owner: "Probe",
    value: 0,
    rating: 3,
    city: "Probe",
    createdAt: new Date().toISOString().slice(0, 10),
    timeline: [],
    categories: [],
  };

  const create = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({
      syncProtocol: 2,
      baseSyncedAt: serverTime,
      leads: [lead],
    }),
  });
  check(
    "POST create lead 200",
    create.status === 200 && create.body?.success === true,
    `status=${create.status} body=${JSON.stringify(create.body)?.slice(0, 300)}`,
  );
  check("POST create returns string serverTime", typeof create.body?.serverTime === "string", `serverTime=${JSON.stringify(create.body?.serverTime)}`);
  const afterCreate = create.body?.serverTime || serverTime;

  const get1 = await json("/sync.php");
  const found1 = (get1.body?.leads || []).some((l) => l.id === leadId);
  check("GET after create contains lead", found1, `ids=${(get1.body?.leads || []).map((l) => l.id).filter((id) => String(id).startsWith(PREFIX)).join(",") || "(none)"}`);

  const edit = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({
      syncProtocol: 2,
      baseSyncedAt: afterCreate,
      leads: [{ ...lead, name: `${PREFIX}Lead-edited` }],
    }),
  });
  check("POST edit lead 200", edit.status === 200 && edit.body?.success === true, `status=${edit.status}`);
  const get2 = await json("/sync.php");
  const edited = (get2.body?.leads || []).find((l) => l.id === leadId);
  check("GET after edit shows new name", edited?.name === `${PREFIX}Lead-edited`, `name=${edited?.name}`);

  const del = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({
      syncProtocol: 2,
      baseSyncedAt: edit.body?.serverTime || afterCreate,
      leads: [],
      deleted: { leads: [leadId] },
    }),
  });
  check(
    "POST named delete 200",
    del.status === 200 && del.body?.success === true,
    `status=${del.status} deleteBlocked=${JSON.stringify(del.body?.deleteBlocked)} permissionSkipped=${JSON.stringify(del.body?.permissionSkipped)}`,
  );
  const blocked = del.body?.deleteBlocked?.leads;
  check("named delete not circuit-broken", !Array.isArray(blocked) || blocked.length === 0, `deleteBlocked=${JSON.stringify(del.body?.deleteBlocked)}`);

  const get3 = await json("/sync.php");
  const found3 = (get3.body?.leads || []).some((l) => l.id === leadId);
  check("GET after named delete does not contain lead", !found3, `still present`);

  // Immediate create → delete (the TIMESTAMP(3) race).
  const raceId = `${PREFIX}race-${Date.now()}`;
  const raceLead = { ...lead, id: raceId, name: `${PREFIX}Race` };
  const c2 = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({ syncProtocol: 2, baseSyncedAt: get3.body?.serverTime, leads: [raceLead] }),
  });
  const d2 = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({
      syncProtocol: 2,
      baseSyncedAt: c2.body?.serverTime,
      leads: [],
      deleted: { leads: [raceId] },
    }),
  });
  const get4 = await json("/sync.php");
  const raced = (get4.body?.leads || []).some((l) => l.id === raceId);
  check("create-then-immediate-delete stays gone", !raced && d2.body?.success === true, `present=${raced} deleteBlocked=${JSON.stringify(d2.body?.deleteBlocked)}`);

  // Last remaining warehouse (empty-table breaker).
  const existingWh = get4.body?.warehouses || [];
  const whId = `${PREFIX}wh-${Date.now()}`;
  const wCreate = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({
      syncProtocol: 2,
      baseSyncedAt: get4.body?.serverTime,
      warehouses: [{ id: whId, name: `${PREFIX}Warehouse`, code: "PROBE" }],
    }),
  });
  const wDel = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({
      syncProtocol: 2,
      baseSyncedAt: wCreate.body?.serverTime,
      warehouses: [],
      deleted: { warehouses: [whId] },
    }),
  });
  const get5 = await json("/sync.php");
  const whGone = !(get5.body?.warehouses || []).some((w) => w.id === whId);
  check(
    "named delete of a warehouse persists (incl. last-item case)",
    wDel.body?.success === true && whGone,
    `gone=${whGone} deleteBlocked=${JSON.stringify(wDel.body?.deleteBlocked)} existingBefore=${existingWh.length}`,
  );

  // Last remaining project via dedicated filter (not ccrm_delete_omitted).
  const existingProj = get5.body?.projects || [];
  const types = get5.body?.projectTypes || [];
  const typeId = types[0]?.id;
  if (typeId) {
    const projId = `${PREFIX}proj-${Date.now()}`;
    const pCreate = await json("/sync.php", {
      method: "POST",
      body: JSON.stringify({
        syncProtocol: 2,
        baseSyncedAt: get5.body?.serverTime,
        projects: [{
          id: projId,
          name: `${PREFIX}Project`,
          projectTypeId: typeId,
          status: "active",
          clientId: null,
          managers: [],
          data: {},
          timeline: [],
          gantt: [],
        }],
      }),
    });
    const pDel = await json("/sync.php", {
      method: "POST",
      body: JSON.stringify({
        syncProtocol: 2,
        baseSyncedAt: pCreate.body?.serverTime,
        projects: [],
        deleted: { projects: [projId] },
      }),
    });
    const get6 = await json("/sync.php");
    const projGone = !(get6.body?.projects || []).some((p) => p.id === projId);
    check(
      "named delete of a project persists (incl. last-item case)",
      pDel.body?.success === true && projGone,
      `gone=${projGone} deleteBlocked=${JSON.stringify(pDel.body?.deleteBlocked)} existingBefore=${existingProj.length} createOk=${pCreate.body?.success}`,
    );
  } else {
    console.log("SKIP  project delete — no project type on this install");
  }

  // Invoice last-item (already explicit before this audit).
  const ioId = `${PREFIX}io-${Date.now()}`;
  const ioCreate = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({
      syncProtocol: 2,
      baseSyncedAt: (await json("/sync.php")).body?.serverTime,
      invoicesOffers: [{
        id: ioId,
        type: "price_offer",
        documentNumber: `PROBE-${Date.now()}`,
        clientName: `${PREFIX}Offer`,
        title: `${PREFIX}Offer`,
        status: "draft",
        items: [{ id: `${ioId}-i1`, name: "Probe", quantity: 1, unitPrice: 1, vatRate: 0, totalPrice: 1 }],
      }],
    }),
  });
  const ioDel = await json("/sync.php", {
    method: "POST",
    body: JSON.stringify({
      syncProtocol: 2,
      baseSyncedAt: ioCreate.body?.serverTime,
      invoicesOffers: [],
      deleted: { invoicesOffers: [ioId] },
    }),
  });
  const get7 = await json("/sync.php");
  const ioGone = !(get7.body?.invoicesOffers || []).some((o) => o.id === ioId);
  check(
    "named delete of a price offer persists",
    ioDel.body?.success === true && ioGone,
    `gone=${ioGone} deleteBlocked=${JSON.stringify(ioDel.body?.deleteBlocked)} createOk=${ioCreate.body?.success}`,
  );

  phpFile("ccrm-cleanup-rows.php", `<?php
require '/var/www/html/config.php';
$pdo = get_db_connection();
$pdo->exec("DELETE FROM leads WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM warehouses WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM projects WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM invoices_offers WHERE id LIKE '${PREFIX}%'");
`);
} finally {
  phpFile("ccrm-cleanup-user.php", `<?php
require '/var/www/html/config.php';
$pdo = get_db_connection();
$pdo->prepare('DELETE FROM users WHERE email=?')->execute([${JSON.stringify(EMAIL)}]);
echo 'cleaned';
`);
}

console.log("\n---");
console.log(`passed: ${ok.length}  failed: ${findings.length}`);
if (findings.length) {
  for (const f of findings) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
