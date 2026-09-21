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
// Throwaway project type for the custom-attribute round-trip. Its dynamic
// tables are named after the id with everything outside [a-z0-9_] stripped.
const PT_ID = `${PREFIX}pt-${Date.now()}`;
const PT_TABLE_STEM = PT_ID.toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/\d+$/, "");

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

  // Custom attributes must read back under the very ids the client knows.
  // The client mints ids that already start with "attr_" / "file_" / "tattr_";
  // the column is "attr_" + id, and a reader that stripped every "attr_" turned
  // column attr_attr_1726_1 into key "1726_1" — the value sat in MySQL and still
  // showed as empty after a hard refresh (fixed 1.9.83). A throwaway type keeps
  // this independent of what the install has.
  {
    const stamp = Date.now();
    const attrId = `attr_${stamp}_1`;
    const fileId = `file_${stamp}_2`;
    const tlAttrId = `tattr_${stamp}_3`;
    const files = [{ id: `f-${stamp}`, name: "contract.pdf", size: "1 KB", type: "application/pdf", path: "uploads/probe.pdf" }];
    const ptCreate = await json("/sync.php", {
      method: "POST",
      body: JSON.stringify({
        syncProtocol: 2,
        baseSyncedAt: get5.body?.serverTime,
        projectTypes: [{
          id: PT_ID, name: `${PREFIX}Type`, description: "", icon: "Briefcase", color: "#a855f7",
          attributes: [{ id: attrId, name: "Investor", type: "textfield" }],
          hasTimeline: true, hasGantt: false, hasDeadline: false, deadlineWarningDays: 0, deadlineRequired: false,
          hasFiles: true, fileFields: [{ id: fileId, name: "Contract" }], listColumns: [],
          timelineEventTypes: [{ id: `tet_${stamp}`, name: "Note", attributes: [{ id: tlAttrId, name: "Remark", type: "textfield" }] }],
          timelineAttributes: [],
        }],
      }),
    });
    check("POST create project type 200", ptCreate.status === 200 && ptCreate.body?.success === true, `status=${ptCreate.status} body=${JSON.stringify(ptCreate.body)?.slice(0, 300)}`);

    const apId = `${PREFIX}attrproj-${stamp}`;
    const apCreate = await json("/sync.php", {
      method: "POST",
      body: JSON.stringify({
        syncProtocol: 2,
        baseSyncedAt: ptCreate.body?.serverTime,
        projects: [{
          id: apId, name: `${PREFIX}AttrProject`, projectTypeId: PT_ID, status: "active", clientId: null, managers: [],
          data: { [attrId]: "Ing. Novak", [fileId]: files },
          timeline: [{ id: `te-${stamp}`, type: "note", timestamp: "2026-01-01 10:00:00", title: "Kickoff", content: "", data: { [tlAttrId]: "first note" } }],
          gantt: [],
        }],
      }),
    });
    check("POST create project with attribute values 200", apCreate.status === 200 && apCreate.body?.success === true, `status=${apCreate.status} body=${JSON.stringify(apCreate.body)?.slice(0, 300)}`);

    const getA = await json("/sync.php");
    const ap = (getA.body?.projects || []).find((p) => p.id === apId);
    const keys = Object.keys(ap?.data || {});
    check("project attribute reads back under its own id (attr_ prefix kept)", ap?.data?.[attrId] === "Ing. Novak", `data=${JSON.stringify(ap?.data)}`);
    let filesBack = null;
    try { filesBack = typeof ap?.data?.[fileId] === "string" ? JSON.parse(ap.data[fileId]) : ap?.data?.[fileId]; } catch { /* not JSON */ }
    check("project file slot reads back under its own id", JSON.stringify(filesBack) === JSON.stringify(files), `value=${JSON.stringify(ap?.data?.[fileId])}`);
    check("no data key lost its prefix", keys.every((k) => k === attrId || k === fileId), `keys=${keys.join(",")}`);
    check("timeline attribute reads back under its own id", ap?.timeline?.[0]?.data?.[tlAttrId] === "first note", `timeline=${JSON.stringify(ap?.timeline)}`);
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

  // ---------------------------------------------------------------------------
  // Field-complete round-trips (persistence audit, 2026-09-19). Every check
  // below POSTs a record with each field set to a distinctive value, GETs, and
  // compares under the same keys. See docs/PERSISTENCE-AUDIT.md.
  // ---------------------------------------------------------------------------
  const t0 = Date.now();
  const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clock = async () => (await json("/sync.php")).body?.serverTime;
  const post = (body) => json("/sync.php", { method: "POST", body: JSON.stringify({ syncProtocol: 2, ...body }) });
  const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k]]));
  const diffKeys = (a, b, keys) => keys.filter((k) => !deepEq(a?.[k], b?.[k]));

  // Lead: every scalar, the address, JSON blobs, categories and one timeline
  // entry of every shape (note with voice memo, offer with attachments,
  // appointment, business document, note carrying a sale amount).
  const fullLeadId = `${PREFIX}full-${t0}`;
  {
    const stamp = "2026-03-04 09:15";
    const files = [{ name: "zmluva č. 1.pdf", size: "2 KB", path: `/uploads/ev-${t0}_zmluva.pdf` }];
    const lead = {
      id: fullLeadId, name: `${PREFIX}Ľudovít "Quote" O'Brien`, city: "Žilina", clientType: "business", status: "new",
      source: "Facebook Ads", owner: "Probe", value: 1234.5, rating: 4, createdAt: "2026-02-01",
      phone: "+421 900 123 456", email: "probe@example.test",
      address: { street: "Hlavná 1", city: "Žilina", postalCode: "010 01", country: "Slovakia" },
      companyId: "12345678", taxId: "2020202020", vatId: "SK2020202020", contactPerson: "Mgr. Anna Nováková",
      website: "https://example.test", establishmentDate: "2001-05-06", legalForm: "s.r.o.", skNace: "62010",
      organizationSize: "10-19", ownershipType: "private", dataSource: "registeruz", dissolutionDate: "",
      region: "Žilinský", district: "Žilina",
      vatValidationResult: { valid: true, name: "X s.r.o.", address: "Y", checkedAt: "2026-02-02" },
      categories: ["Strechy", "Okná"], interestNote: "Záujem o šindeľ – 'urgent'", referralLeadId: "",
      followUps: { new: "2026-02-03" }, aiSummary: "sum", aiSummaryFingerprint: "fp", clientCategoryId: null, archived: false,
      timeline: [
        { id: `ev-${t0}-1`, type: "note", timestamp: stamp, title: "Poznámka", content: "Text s diakritikou: ľščťžýáíé", author: "Probe", audioFile: "/uploads/a.webm", transcription: "prepis" },
        { id: `ev-${t0}-2`, type: "offer", timestamp: stamp, title: "Ponuka", content: "", amount: 99.9, fileName: files[0].name, fileSize: files[0].size, fileType: "offer", attachments: files },
        { id: `ev-${t0}-3`, type: "appointment", timestamp: stamp, title: "Stretnutie", content: "", extraTime: "10:30" },
        { id: `ev-${t0}-4`, type: "invoice", timestamp: stamp, title: "Faktúra", content: "", fileName: files[0].name, fileSize: files[0].size, fileType: "invoice", attachments: files },
        { id: `ev-${t0}-5`, type: "note", timestamp: stamp, title: "Predaj a výdaj tovaru", content: "sale", amount: 250.25, author: "Probe" },
      ],
    };
    const r = await post({ baseSyncedAt: await clock(), leads: [lead] });
    check("POST field-complete lead 200", r.status === 200 && r.body?.success === true, `status=${r.status} body=${JSON.stringify(r.body)?.slice(0, 300)}`);
    const back = ((await json("/sync.php")).body?.leads || []).find((l) => l.id === fullLeadId);
    const scalar = ["name", "city", "clientType", "status", "source", "owner", "value", "rating", "createdAt", "phone", "email",
      "companyId", "taxId", "vatId", "contactPerson", "website", "establishmentDate", "legalForm", "skNace", "organizationSize",
      "ownershipType", "dataSource", "dissolutionDate", "region", "district", "interestNote", "referralLeadId", "aiSummary",
      "aiSummaryFingerprint", "clientCategoryId", "archived", "address", "vatValidationResult", "followUps"];
    const d = diffKeys(back, lead, scalar);
    check("lead: every field reads back unchanged", !!back && d.length === 0, `diffs=${d.map((k) => `${k}=${JSON.stringify(back?.[k])}`).join(" ")}`);
    check("lead: categories read back", deepEq([...(back?.categories || [])].sort(), [...lead.categories].sort()), `categories=${JSON.stringify(back?.categories)}`);
    const byId = Object.fromEntries((back?.timeline || []).map((e) => [e.id, e]));
    const teKeys = ["type", "timestamp", "title", "content", "amount", "extraTime", "fileName", "fileSize", "fileType", "attachments", "author", "audioFile", "transcription"];
    const teDiffs = lead.timeline.flatMap((e) => diffKeys(byId[e.id], e, teKeys.filter((k) => k in e)).map((k) => `${e.type}.${k}=${JSON.stringify(byId[e.id]?.[k])}`));
    check("lead: every timeline entry shape reads back unchanged", teDiffs.length === 0, teDiffs.join(" "));
    check("lead: a note that logged a sale keeps its amount", byId[`ev-${t0}-5`]?.amount === 250.25, `amount=${JSON.stringify(byId[`ev-${t0}-5`]?.amount)}`);

    // Hiding an imported mail entry as the ONLY change to the lead. The row is
    // inserted the way api/mail_broker.php does (with seconds); the lead is
    // pushed once unchanged first so the timestamps are already normalised —
    // that is the state in which the hide used to be dropped as "identical".
    const mailId = `email-${t0}-probe`;
    phpFile("ccrm-mail-row.php", `<?php
require '/var/www/html/config.php';
$pdo = get_db_connection();
$pdo->prepare("INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, is_outgoing) VALUES (?,?,?,?,?,?,?)")
    ->execute([${JSON.stringify(mailId)}, ${JSON.stringify(fullLeadId)}, 'email', '2026-03-05 08:00:37', 'Re: ponuka', 'body', 0]);
echo 'ok';`);
    const g2 = await json("/sync.php");
    const l2 = (g2.body?.leads || []).find((l) => l.id === fullLeadId);
    check("lead: imported mail entry is served", !!l2?.timeline?.some((e) => e.id === mailId), `timeline=${(l2?.timeline || []).map((e) => e.id).join(",")}`);
    await post({ baseSyncedAt: g2.body?.serverTime, leads: [l2] });
    const g3 = await json("/sync.php");
    const l3 = (g3.body?.leads || []).find((l) => l.id === fullLeadId);
    const hidden = { ...l3, timeline: (l3?.timeline || []).map((e) => (e.id === mailId ? { ...e, hidden: true } : e)) };
    const r3 = await post({ baseSyncedAt: g3.body?.serverTime, leads: [hidden] });
    const l4 = ((await json("/sync.php")).body?.leads || []).find((l) => l.id === fullLeadId);
    check("lead: hiding a mail entry as the only change persists", r3.body?.success === true && !l4?.timeline?.some((e) => e.id === mailId), `stillServed=${!!l4?.timeline?.some((e) => e.id === mailId)}`);
    check("lead: hiding a mail entry leaves the other entries alone", (l4?.timeline || []).length === lead.timeline.length, `count=${(l4?.timeline || []).length}`);
  }

  // Project attribute values must come back with the type they were saved
  // with, in both dynamic tables; and a project-type record that omits its
  // attribute lists must not drop the columns behind them.
  {
    const s = t0;
    const ptId = `${PT_ID}-b`;
    const aText = `attr_${s}_t`, aBool = `attr_${s}_b`, aMulti = `attr_${s}_m`, aMoney = `attr_${s}_money`, aOne = `attr_${s}_one`;
    const tText = `tattr_${s}_t`, tBool = `tattr_${s}_b`, tOne = `tattr_${s}_one`, tOff = `tattr_${s}_off`;
    const attrs = [
      { id: aText, name: "Text", type: "textfield" }, { id: aBool, name: "Bool", type: "checkbox" },
      { id: aMulti, name: "Multi", type: "checkbox", options: ["A", "B", "C"] }, { id: aMoney, name: "Money", type: "money" },
      { id: aOne, name: "Radio", type: "radio", options: ["1", "2"] },
    ];
    const tet = [{ id: `tet_${s}`, name: "Note", attributes: [
      { id: tText, name: "T", type: "textfield" }, { id: tBool, name: "B", type: "checkbox" },
      { id: tOne, name: "One", type: "radio", options: ["1", "2"] }, { id: tOff, name: "Off", type: "checkbox" },
    ] }];
    const ptCreate = await post({ baseSyncedAt: await clock(), projectTypes: [{
      id: ptId, name: `${PREFIX}TypeB`, description: "", icon: "Briefcase", color: "#0ea5e9", attributes: attrs,
      hasTimeline: true, hasGantt: false, hasDeadline: false, deadlineWarningDays: 0, deadlineRequired: false,
      hasFiles: false, fileFields: [], listColumns: [], timelineEventTypes: tet, timelineAttributes: [],
    }] });
    const projId = `${PREFIX}typed-${s}`;
    const data = { [aText]: "42", [aBool]: true, [aMulti]: ["A", "B"], [aMoney]: { amount: 12.5, currency: "EUR" }, [aOne]: "1" };
    const teData = { [tText]: "42", [tBool]: true, [tOne]: "1", [tOff]: false };
    const pCreate = await post({ baseSyncedAt: ptCreate.body?.serverTime, projects: [{
      id: projId, name: `${PREFIX}Typed`, projectTypeId: ptId, status: "active", clientId: null, managers: [], data,
      timeline: [{ id: `te-${s}`, type: "note", eventType: `tet_${s}`, timestamp: "2026-01-01 10:00:00", title: "Kickoff", content: "", data: teData }],
      gantt: [],
    }] });
    check("POST typed project 200", pCreate.status === 200 && pCreate.body?.success === true, `status=${pCreate.status} body=${JSON.stringify(pCreate.body)?.slice(0, 300)}`);
    let p = ((await json("/sync.php")).body?.projects || []).find((x) => x.id === projId);
    check("project data: text \"42\" stays a string", p?.data?.[aText] === "42", `value=${JSON.stringify(p?.data?.[aText])}`);
    check("project data: checkbox true stays a boolean", p?.data?.[aBool] === true, `value=${JSON.stringify(p?.data?.[aBool])}`);
    check("project data: multi-select reads back as a list", deepEq(p?.data?.[aMulti], ["A", "B"]), `value=${JSON.stringify(p?.data?.[aMulti])}`);
    check("project data: money reads back as {amount,currency}", deepEq(p?.data?.[aMoney], { amount: 12.5, currency: "EUR" }), `value=${JSON.stringify(p?.data?.[aMoney])}`);
    check("project data: option \"1\" stays a string", p?.data?.[aOne] === "1", `value=${JSON.stringify(p?.data?.[aOne])}`);
    let te = p?.timeline?.[0]?.data;
    check("project timeline attr: text \"42\" stays a string", te?.[tText] === "42", `value=${JSON.stringify(te?.[tText])}`);
    check("project timeline attr: checkbox true stays a boolean", te?.[tBool] === true, `value=${JSON.stringify(te?.[tBool])}`);
    check("project timeline attr: option \"1\" stays a string", te?.[tOne] === "1", `value=${JSON.stringify(te?.[tOne])}`);
    check("project timeline attr: checkbox false stays a boolean", te?.[tOff] === false, `value=${JSON.stringify(te?.[tOff])}`);

    // Partial type record: rename only.
    const rename = await post({ baseSyncedAt: await clock(), projectTypes: [{ id: ptId, name: `${PREFIX}TypeB renamed`, icon: "Briefcase", color: "#0ea5e9", hasTimeline: true }] });
    const g = await json("/sync.php");
    const pt = (g.body?.projectTypes || []).find((x) => x.id === ptId);
    p = (g.body?.projects || []).find((x) => x.id === projId);
    te = p?.timeline?.[0]?.data;
    check("project type: a record without `attributes` keeps the stored attributes", rename.body?.success === true && (pt?.attributes || []).length === attrs.length, `attributes=${(pt?.attributes || []).length} name=${pt?.name}`);
    check("project type: a record without `timelineEventTypes` keeps them", (pt?.timelineEventTypes || []).length === 1, `types=${(pt?.timelineEventTypes || []).length}`);
    check("project type: the partial record keeps every attribute value", p?.data?.[aText] === "42" && deepEq(p?.data?.[aMulti], ["A", "B"]) && te?.[tText] === "42", `data=${JSON.stringify(p?.data)} te=${JSON.stringify(te)}`);
  }

  // Unified entry row: currency chosen, amount left blank.
  const ueId = `${PREFIX}ue-${t0}`;
  {
    const r = await post({ baseSyncedAt: await clock(),
      unifiedEntries: [{ id: ueId, name: `${PREFIX}Register`, entryName: "Entry", folderName: "Folder", icon: "Box", color: "#111111",
        modules: ["title", "money"], folderModules: [], foldersEnabled: false, showFolderSummary: false, warningDays: 0, archived: false }],
      unifiedEntriesData: { [ueId]: [{ id: `${ueId}-r1`, title: "Row", moneyCurrency: "USD", isFolder: false, parentId: null }] },
    });
    check("POST unified entry with a currency-only money row 200", r.status === 200 && r.body?.success === true, `status=${r.status} body=${JSON.stringify(r.body)?.slice(0, 300)}`);
    const rows = (await json("/sync.php")).body?.unifiedEntriesData?.[ueId] || [];
    const row = rows.find((x) => x.id === `${ueId}-r1`);
    check("unified entry: currency reads back when the amount is blank", row?.moneyCurrency === "USD", `row=${JSON.stringify(row)}`);
  }

  // Invoice / offer: status date, and line precision beyond two decimals.
  const ioId2 = `${PREFIX}io2-${t0}`;
  {
    const r = await post({ baseSyncedAt: await clock(), invoicesOffers: [{
      id: ioId2, type: "price_offer", documentNumber: `PROBE2-${t0}`, clientName: `${PREFIX}Offer2`, title: `${PREFIX}Offer2`,
      status: "sent", statusChangedAt: "2026-09-19", issuedAt: "2026-09-19",
      items: [{ id: `${ioId2}-i1`, name: "Lišta", quantity: 2.345, unit: "m", unitPrice: 0.125, vatRate: 0, discountPct: 0, totalPrice: 0.29 }],
    }] });
    check("POST offer with statusChangedAt and 3-decimal line 200", r.status === 200 && r.body?.success === true, `status=${r.status}`);
    const io = ((await json("/sync.php")).body?.invoicesOffers || []).find((x) => x.id === ioId2);
    check("offer: statusChangedAt reads back", io?.statusChangedAt === "2026-09-19", `value=${JSON.stringify(io?.statusChangedAt)}`);
    check("offer item: quantity 2.345 reads back exactly", io?.items?.[0]?.quantity === 2.345, `quantity=${JSON.stringify(io?.items?.[0]?.quantity)}`);
    check("offer item: unit price 0.125 reads back exactly", io?.items?.[0]?.unitPrice === 0.125, `unitPrice=${JSON.stringify(io?.items?.[0]?.unitPrice)}`);
  }

  // Financial records: the recurring-rule bookkeeping fields.
  const frId = `${PREFIX}fr-${t0}`;
  {
    const r = await post({ baseSyncedAt: await clock(), financialRecords: [
      { id: frId, type: "expense", subtype: "regular", title: "Nájom", amountPlanned: 500, amountReal: 0, currency: "EUR", status: "planned",
        issueDate: "2026-01-01", isRecurring: true, recurringFrequency: "monthly", recurringStartDate: "2026-01-01", recurringEndDate: "2026-09-19",
        recurringPlannedEndDate: "2027-12-31", recurringSkippedDates: ["2026-09-01", "2026-03-01"], recurringAmountHistory: [], attachments: [] },
      { id: `${frId}-one`, type: "expense", subtype: "regular", title: "Nájom – september", amountPlanned: 520, amountReal: 520, currency: "EUR",
        status: "paid", issueDate: "2026-09-01", paidDate: "2026-09-01", recurringSourceId: frId, recurringOccurrenceDate: "2026-09-01", attachments: [] },
    ] });
    check("POST recurring rule + stand-in movement 200", r.status === 200 && r.body?.success === true, `status=${r.status} body=${JSON.stringify(r.body)?.slice(0, 300)}`);
    const frs = (await json("/sync.php")).body?.financialRecords || [];
    const rule = frs.find((x) => x.id === frId);
    const one = frs.find((x) => x.id === `${frId}-one`);
    check("financial record: recurringPlannedEndDate reads back", rule?.recurringPlannedEndDate === "2027-12-31", `value=${JSON.stringify(rule?.recurringPlannedEndDate)}`);
    check("financial record: recurringSkippedDates read back (sorted)", deepEq(rule?.recurringSkippedDates, ["2026-03-01", "2026-09-01"]), `value=${JSON.stringify(rule?.recurringSkippedDates)}`);
    check("financial record: recurringSourceId / recurringOccurrenceDate read back", one?.recurringSourceId === frId && one?.recurringOccurrenceDate === "2026-09-01", `value=${JSON.stringify(pick(one, ["recurringSourceId", "recurringOccurrenceDate"]))}`);
  }

  // Users: activity log, metadata kept when omitted, e-mail change keeps the id.
  const probeUserId = `u-${PREFIX}${t0}`;
  {
    const emailA = `${PREFIX}${t0}@local.test`;
    const emailB = `${PREFIX}${t0}-renamed@local.test`;
    const act = [{ id: "a1", action: "Account provisioned", timestamp: "2026-09-19 10:00", type: "system" }];
    const r1 = await post({ baseSyncedAt: await clock(), users: [{ id: probeUserId, name: "Probe User", email: emailA, role: "Viewer", color: "#123456", metadata_json: { language: "sk" }, activityLog: act }] });
    check("POST user with activity log 200", r1.status === 200 && r1.body?.success === true, `status=${r1.status} body=${JSON.stringify(r1.body)?.slice(0, 300)}`);
    let u = ((await json("/sync.php")).body?.users || []).find((x) => x.id === probeUserId);
    check("user: activity log reads back", deepEq(u?.activityLog, act), `activityLog=${JSON.stringify(u?.activityLog)}`);
    const r2 = await post({ baseSyncedAt: await clock(), users: [{ id: probeUserId, name: "Probe User", email: emailB, role: "Viewer", color: "#123456" }] });
    const users = (await json("/sync.php")).body?.users || [];
    u = users.find((x) => x.id === probeUserId);
    const meta = typeof u?.metadata_json === "string" ? u.metadata_json : JSON.stringify(u?.metadata_json ?? null);
    check("user: e-mail change keeps the same record", r2.body?.success === true && u?.email === emailB && !users.some((x) => x.email === emailA), `email=${u?.email} seatRejections=${JSON.stringify(r2.body?.seatRejections)}`);
    check("user: metadata survives a record that omits it", /language/.test(meta || ""), `metadata=${meta}`);
    check("user: activity log survives a record that omits it", deepEq(u?.activityLog, act), `activityLog=${JSON.stringify(u?.activityLog)}`);
  }

  // Tasks: a field-complete round-trip, and a refused row is reported.
  {
    const taskId = `${PREFIX}task-${t0}`;
    const task = { id: taskId, title: "Úloha", description: "popis", priority: "high", startDate: "2026-09-01", deadline: "2026-09-30", deadlineTime: "14:30",
      status: "todo", owner: "Probe", assignedUsers: ["Probe"], relatedLeadId: fullLeadId, isLocking: true, archived: false };
    const r = await post({ baseSyncedAt: await clock(), tasks: [task, { id: `${taskId}-bad`, title: "x", deadline: "", owner: "", assignedUsers: [] }] });
    check("POST tasks 200", r.status === 200 && r.body?.success === true, `status=${r.status} body=${JSON.stringify(r.body)?.slice(0, 300)}`);
    check("task: a row the server refuses is reported as a conflict", (r.body?.conflicts?.tasks || []).includes(`${taskId}-bad`), `conflicts=${JSON.stringify(r.body?.conflicts)}`);
    const back = ((await json("/sync.php")).body?.tasks || []).find((x) => x.id === taskId);
    const keys = ["title", "description", "priority", "startDate", "deadline", "deadlineTime", "status", "owner", "assignedUsers", "relatedLeadId", "isLocking", "archived"];
    const d = diffKeys(back, task, keys);
    check("task: every field reads back unchanged", !!back && d.length === 0, `diffs=${d.map((k) => `${k}=${JSON.stringify(back?.[k])}`).join(" ")}`);
  }

  // Warehouse: quantities and prices beyond two decimals.
  const whId2 = `${PREFIX}wh2-${t0}`;
  const itemId = `${PREFIX}item-${t0}`;
  {
    const r = await post({ baseSyncedAt: await clock(),
      warehouses: [{ id: whId2, name: `${PREFIX}Warehouse2`, code: "PRB2" }],
      warehouseItems: [{ id: itemId, sku: `PRB-${t0}`, name: "Probe item", unit: "m", minStock: 0, optimalStock: 0, hasExpiration: false, defaultSellPrice: 0.125, avgPurchasePrice: 0, lastPurchasePrice: 0.125 }],
      warehouseStock: [{ warehouseId: whId2, itemId, quantity: 2.345, reservedQuantity: 0, location: "" }],
    });
    check("POST warehouse item + stock 200", r.status === 200 && r.body?.success === true, `status=${r.status} body=${JSON.stringify(r.body)?.slice(0, 300)}`);
    const g = (await json("/sync.php")).body || {};
    const stock = (g.warehouseStock || []).find((s) => s.itemId === itemId && s.warehouseId === whId2);
    const item = (g.warehouseItems || []).find((i) => i.id === itemId);
    check("warehouse stock: quantity 2.345 reads back exactly", stock?.quantity === 2.345, `stock=${JSON.stringify(stock)}`);
    check("warehouse item: sell price 0.125 reads back exactly", item?.defaultSellPrice === 0.125, `defaultSellPrice=${JSON.stringify(item?.defaultSellPrice)}`);
  }

  // Voice note on a timeline entry must not file a phantom meeting.
  const noteEventId = `note_event_${t0}`;
  {
    const fd = new FormData();
    fd.append("meetingId", noteEventId);
    fd.append("audio", new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" }), "note.webm");
    const res = await fetch(`${BASE}/api/upload_audio.php`, { method: "POST", body: fd, headers: { Cookie: cookieHeader() } });
    let up = null;
    try { up = await res.json(); } catch { /* keep null */ }
    check("upload_audio: timeline voice note accepted", res.status === 200 && up?.success === true, `status=${res.status} body=${JSON.stringify(up)?.slice(0, 200)}`);
    const meetings = (await json("/sync.php")).body?.meetingNotes || [];
    check("upload_audio: no phantom \"Untitled Note\" meeting is created", !meetings.some((m) => m.id === noteEventId), `meeting=${JSON.stringify(meetings.find((m) => m.id === noteEventId))}`);
  }

  // Settings: every name-keyed map must travel as an object, even when empty.
  {
    const s = (await json("/sync.php")).body?.settings || {};
    const bad = ["leadStateColors", "leadSourceColors", "leadCategoryColors", "leadStageGroups", "leadStateParents", "leadStateFollowUp"]
      .filter((k) => Array.isArray(s[k]));
    check("settings: name-keyed maps are objects, never arrays", bad.length === 0, `arrays=${bad.join(",")}`);
  }

  phpFile("ccrm-cleanup-rows.php", `<?php
require '/var/www/html/config.php';
$pdo = get_db_connection();
$pdo->exec("DELETE FROM tasks WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM timeline_events WHERE lead_id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM leads WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM warehouse_items WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM warehouses WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM projects WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM invoices_offers WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM financial_records WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM project_types WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM unified_entries WHERE id LIKE '${PREFIX}%'");
$pdo->exec("DELETE FROM meeting_notes WHERE id LIKE 'note_event_%' AND title = 'Untitled Note' AND notes = '[]'");
$pdo->exec("DELETE FROM users WHERE email LIKE '${PREFIX}%' AND email <> " . $pdo->quote(${JSON.stringify(EMAIL)}));
@array_map('unlink', glob('/var/www/html/uploads/meeting_audio_note_event_*'));
// The throwaway type's dynamic tables — this run's and any earlier run that died.
$tbls = $pdo->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME LIKE 'proj%${PT_TABLE_STEM}%' OR TABLE_NAME LIKE 'ue_ccrmdelprobeue%')")->fetchAll(PDO::FETCH_COLUMN);
foreach ($tbls as $t) { $pdo->exec("DROP TABLE IF EXISTS " . $t); }
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
