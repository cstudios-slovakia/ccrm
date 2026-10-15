#!/usr/bin/env node
/**
 * Project tabs round-trip: write, fresh read, compare.
 *
 * Reproduces "adding/editing data in the Timeline and Gantt tabs does not
 * survive a hard refresh": a project whose type row reached project_types
 * WITHOUT its proj_data_/proj_timeline_/proj_gantt_ tables (a seeder, an import,
 * a restore). The POST reported success, every write threw into a catch that
 * only logged, and the next GET read the project back empty. sync.php now
 * builds the missing tables before it saves the project
 * (ccrm_heal_project_type_tables) and keeps the old rows if a rewrite fails.
 *
 * Also round-trips the other project tabs: custom attributes, Finances, Tasks
 * and project-level file slots.
 *
 * Needs the local Docker backend. Throwaway admin, type and project; all
 * removed at the end.
 *   CCRM_PROBE_URL        default http://127.0.0.1:8085
 *   CCRM_PROBE_CONTAINER  default crm  (the web container)
 *
 * The web container can keep serving a stale compiled sync.php after the file
 * changes on a bind mount (opcache never sees a newer mtime): restart it
 * ("docker restart crm") after editing sync.php, before trusting a result.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.CCRM_PROBE_URL || "http://127.0.0.1:8085";
const CONTAINER = process.env.CCRM_PROBE_CONTAINER || "crm";
const EMAIL = "ccrm-heal-probe@local.test";
const PASS = "probe-pass-9f3K";
const TYPE_ID = "ccrmhealprobe";
const PROJ_ID = "ccrm-heal-probe-proj";
const ATTR = "attr_probe1";

const dx = (args, opts = {}) =>
  execFileSync("docker", args, { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" }, ...opts }).trim();
const php = (name, code) => {
  const tmp = join(tmpdir(), name);
  writeFileSync(tmp, code);
  dx(["cp", tmp, `${CONTAINER}:/tmp/${name}`]);
  return dx(["exec", CONTAINER, "php", `/tmp/${name}`]);
};

const cookies = new Map();
const call = async (path, opts = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
  });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { _raw: text.slice(0, 300) }; }
  return { status: res.status, body };
};

const tbl = (label) => console.log("   [tables] " + label + ": " + php("heal-tbl.php", `<?php
require '/var/www/html/config.php';
$p = get_db_connection();
$r = $p->query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE '%${TYPE_ID}'")->fetchAll(PDO::FETCH_COLUMN);
echo $r ? implode(',', $r) : '(none)';`));
let failures = 0;
const check = (name, cond, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : " — " + detail}`);
};

const cleanup = () => php("heal-cleanup.php", `<?php
require '/var/www/html/config.php';
$pdo = get_db_connection();
$pdo->prepare('DELETE FROM financial_records WHERE id=?')->execute(['fr-heal-probe']);
$pdo->prepare('DELETE FROM tasks WHERE id=?')->execute(['task-heal-probe']);
$pdo->prepare('DELETE FROM projects WHERE id=?')->execute(['${PROJ_ID}']);
foreach (['data','timeline','gantt'] as $k) $pdo->exec("DROP TABLE IF EXISTS \`proj_{$k}_${TYPE_ID}\`");
$pdo->prepare('DELETE FROM project_types WHERE id=?')->execute(['${TYPE_ID}']);
$pdo->prepare('DELETE FROM users WHERE email=?')->execute(['${EMAIL}']);
echo 'clean';
`);

try {
  cleanup();
  const hash = php("heal-hash.php", `<?php echo password_hash(${JSON.stringify(PASS)}, PASSWORD_DEFAULT);`);
  // The seeder path: a type row, no tables.
  const seeded = php("heal-seed.php", `<?php
require '/var/www/html/config.php';
$pdo = get_db_connection();
$pdo->prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,?)')
    ->execute(['u-ccrm-heal-probe','Probe',${JSON.stringify(EMAIL)},<<<'H'
${hash}
H,'Admin']);
$pdo->prepare('INSERT INTO project_types (id, name, icon, color, has_timeline, has_gantt, attributes_json, timeline_event_types_json) VALUES (?,?,?,?,1,1,?,?)')
    ->execute(['${TYPE_ID}','Heal probe','Briefcase','#2563eb',json_encode([['id'=>'${ATTR}','name'=>'Probe','type'=>'text']]),'[]']);
$n = $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'proj\\\\_%\\\\_${TYPE_ID}'")->fetchColumn();
echo "tables_before=$n";
`);
  console.log(seeded);

  const login = await call("/api/login.php", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASS }) });
  check("login", login.body?.success === true, JSON.stringify(login.body));

  tbl("after login");
  let st = (await call("/sync.php")).body?.serverTime;
  tbl("after first GET");
  const post = async (project) => {
    const r = await call("/sync.php", { method: "POST", body: JSON.stringify({ syncProtocol: 2, baseSyncedAt: st, projects: [project] }) });
    st = r.body?.serverTime || st;
    return r;
  };
  const read = async () => (await call("/sync.php")).body?.projects?.find((p) => p.id === PROJ_ID);

  const base = { id: PROJ_ID, projectTypeId: TYPE_ID, status: "active", managers: [], customFileFields: [] };
  const ev1 = { id: "pte-1", type: "note", timestamp: "2026-10-12T10:30", title: "Čau svet", content: "obsah \"quoted\"", data: {} };
  const g1 = { id: "pgr-1", title: "Rezanie", contactId: "", startDate: "2026-10-13", endDate: "2026-10-20", progress: 40 };

  // 1. first write
  const r1 = await post({ ...base, data: { [ATTR]: "hodnota ľščť" }, timeline: [ev1], gantt: [g1] });
  tbl("after first POST");
  check("POST create ok", r1.body?.success === true, JSON.stringify(r1.body).slice(0, 200));
  let p = await read();
  check("timeline event survives reload", p?.timeline?.some((e) => e.id === "pte-1" && e.title === "Čau svet"), JSON.stringify(p?.timeline));
  check("gantt row survives reload", p?.gantt?.some((g) => g.id === "pgr-1" && g.progress === 40), JSON.stringify(p?.gantt));
  check("custom attribute survives reload", p?.data?.[ATTR] === "hodnota ľščť", JSON.stringify(p?.data));

  // 2. edit
  const ev2 = { id: "pte-2", type: "note", timestamp: "2026-10-12T11:00", title: "Druhá", content: "", data: {} };
  const r2 = await post({ ...base, data: { [ATTR]: "zmenené" }, timeline: [ev2, ev1], gantt: [{ ...g1, progress: 100, title: "Rezanie 2" }] });
  check("POST edit ok", r2.body?.success === true);
  p = await read();
  check("added timeline event survives", p?.timeline?.length === 2, JSON.stringify(p?.timeline));
  check("edited gantt row survives", p?.gantt?.[0]?.progress === 100 && p?.gantt?.[0]?.title === "Rezanie 2", JSON.stringify(p?.gantt));
  check("edited attribute survives", p?.data?.[ATTR] === "zmenené", JSON.stringify(p?.data));

  // 3. a rewrite that fails halfway must not wipe what is stored
  const bad = { id: "pte-bad", type: "note", timestamp: "2026-10-12T12:00", title: null, content: "", data: {} };
  await post({ ...base, timeline: [ev2, bad], gantt: [{ id: "pgr-bad", title: null, progress: 0 }] });
  p = await read();
  check("failed timeline rewrite keeps old rows", p?.timeline?.length === 2, JSON.stringify(p?.timeline));
  check("failed gantt rewrite keeps old rows", p?.gantt?.length === 1 && p.gantt[0].id === "pgr-1", JSON.stringify(p?.gantt));

  // 4. the other tabs, written the way the app writes them
  const postKey = async (key, rows) => {
    const r = await call("/sync.php", { method: "POST", body: JSON.stringify({ syncProtocol: 2, baseSyncedAt: st, [key]: rows }) });
    st = r.body?.serverTime || st;
    return r;
  };
  const full = (await call("/sync.php")).body;

  // Finances tab
  const fr = {
    id: "fr-heal-probe", type: "income", subtype: "invoice", title: "Faktúra č. 1 – Čau", description: "popis",
    categoryId: null, categoryPath: null, amountPlanned: 1200.5, amountReal: 300, currency: "EUR", status: "partially_paid",
    issueDate: "2026-10-01", dueDate: "2026-10-31", invoiceNumber: "2026-001", paidDate: null, paymentMethod: "bank_transfer",
    isRecurring: false, projectId: PROJ_ID, clientId: null, taxRate: 20, createdBy: "Probe", createdAt: "2026-10-12T10:00:00.000Z",
  };
  const rf = await postKey("financialRecords", [fr]);
  check("finance POST ok", rf.body?.success === true, JSON.stringify(rf.body).slice(0, 200));
  let back = (await call("/sync.php")).body?.financialRecords?.find((x) => x.id === fr.id);
  check("finance record survives reload", !!back && back.projectId === PROJ_ID && back.amountPlanned === 1200.5 && back.amountReal === 300 && back.status === "partially_paid" && back.title === fr.title, JSON.stringify(back));
  const rf2 = await postKey("financialRecords", [{ ...fr, amountReal: 1200.5, status: "paid", paidDate: "2026-10-12" }]);
  back = (await call("/sync.php")).body?.financialRecords?.find((x) => x.id === fr.id);
  check("finance edit survives reload", rf2.body?.success === true && back?.status === "paid" && back?.amountReal === 1200.5, JSON.stringify(back));

  // Tasks tab
  const task = {
    id: "task-heal-probe", title: "Zmerať kuchyňu", description: "poznámka", status: "todo", priority: "high",
    startDate: "2026-10-13", deadline: "2026-10-20", deadlineTime: "14:30", owner: "", createdBy: "Probe", createdAt: "2026-10-12 10:00",
    assignedUsers: [], relatedProjectId: PROJ_ID, tags: [],
  };
  const rt = await postKey("tasks", [task]);
  check("task POST ok", rt.body?.success === true, JSON.stringify(rt.body).slice(0, 200));
  let tb = (await call("/sync.php")).body?.tasks?.find((x) => x.id === task.id);
  check("project task survives reload", !!tb && tb.relatedProjectId === PROJ_ID && tb.title === task.title && tb.deadline === "2026-10-20", JSON.stringify(tb));
  await postKey("tasks", [{ ...task, title: "Zmerať kuchyňu (2)", status: "done" }]);
  tb = (await call("/sync.php")).body?.tasks?.find((x) => x.id === task.id);
  check("project task edit survives reload", tb?.title === "Zmerať kuchyňu (2)" && tb?.status === "done", JSON.stringify(tb));

  // Files tab: a slot added on this project alone
  const slot = { id: "cf-1", name: "Výkresy", files: [{ id: "f-1", name: "plan.pdf", url: "uploads/plan.pdf", size: 1234, type: "application/pdf" }] };
  const rs = await post({ ...base, customFileFields: [slot] });
  check("file slot POST ok", rs.body?.success === true);
  p = await read();
  check("project file slot survives reload", p?.customFileFields?.[0]?.name === "Výkresy" && p.customFileFields[0].files?.[0]?.name === "plan.pdf", JSON.stringify(p?.customFileFields));
  check("timeline/gantt untouched by a field-only project save", p?.timeline?.length === 2 && p?.gantt?.length === 1, `tl=${p?.timeline?.length} g=${p?.gantt?.length}`);
} catch (e) {
  failures++;
  console.log("ERROR", e.message);
} finally {
  try { console.log(cleanup()); } catch (e) { console.log("cleanup failed", e.message); }
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
