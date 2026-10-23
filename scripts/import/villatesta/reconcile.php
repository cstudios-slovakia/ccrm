<?php
/**
 * Step 3 (PLAN C10): reconcile what was extracted with what is in the CCRM database.
 *
 *   php scripts/import/villatesta/reconcile.php [--data=<dir with the JSON>] [--config=<config.php>] [--api-dir=<dir>]
 *       [--uploads-dir=<dir>] [--host=<old DB host> --port=33061 --user=root --pass=root --db=vcrm_db] [--seed=1]
 *
 * Reads only. Counts old vs new per entity, lists orphans, shows 10 random records per entity
 * side by side (with --host also the raw row of the old CRM) and checks that the files exist.
 * Exit code 1 when a count differs, so a pipeline can stop on it.
 */

require __DIR__ . '/lib.php';
require __DIR__ . '/seed_config.php';

$cli = vt_cli($argv);
$dataDir = rtrim((string)($cli['data'] ?? (__DIR__ . '/out')), '/\\');
$configPath = (string)($cli['config'] ?? '');
if ($configPath === '') {
    $configPath = getcwd() . '/config.php';
    if (!is_file($configPath)) $configPath = dirname(__DIR__, 3) . '/config.php';
}
require $configPath;
$apiDir = isset($cli['api-dir']) ? rtrim((string)$cli['api-dir'], '/\\') : (is_dir(dirname($configPath) . '/api') ? dirname($configPath) . '/api' : dirname(__DIR__, 3) . '/public/api');
require_once $apiDir . '/auth.php';
$pdo = get_db_connection();

$old = null;
if (isset($cli['host'])) {
    $old = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $cli['host'], (int)($cli['port'] ?? 33061), $cli['db'] ?? 'vcrm_db'), $cli['user'] ?? 'root', $cli['pass'] ?? 'root', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
}
mt_srand((int)($cli['seed'] ?? 7));

$users = vt_json_read("{$dataDir}/users.json");
$clients = vt_json_read("{$dataDir}/clients.json");
$leads = vt_json_read("{$dataDir}/leads.json");
$projects = vt_json_read("{$dataDir}/projects.json");
$products = vt_json_read("{$dataDir}/products.json");
$files = vt_json_read("{$dataDir}/files.json");
$mailCount = 0;
$mailWithBody = 0;
foreach (vt_read_jsonl("{$dataDir}/mail.jsonl") as $m) { $mailCount++; if (trim((string)$m['body']) !== '') $mailWithBody++; }

function scalar(PDO $pdo, string $sql, array $p = []) { $st = $pdo->prepare($sql); $st->execute($p); return (int)$st->fetchColumn(); }

$md = "# Villatesta reconciliation - " . DB_NAME . "\n\n";
$bad = 0;

// 1. counts
$safe = preg_replace('/[^a-z0-9_]/', '', strtolower(VT_PROJECT_TYPE_ID));
$rows = [
    ['users', count($users), scalar($pdo, "SELECT COUNT(*) FROM users WHERE LOWER(email) IN (" . implode(',', array_map(fn($u) => $pdo->quote(strtolower($u['email'])), $users)) . ")")],
    ['clients', count($clients), scalar($pdo, "SELECT COUNT(*) FROM leads WHERE id LIKE 'client-vt-%'")],
    ['leads (preleads)', count($leads), scalar($pdo, "SELECT COUNT(*) FROM leads WHERE id LIKE 'lead-vt-%'")],
    ['leads archived', count(array_filter($leads, fn($l) => $l['archived'])), scalar($pdo, "SELECT COUNT(*) FROM leads WHERE id LIKE 'lead-vt-%' AND archived = 1")],
    ['lead timeline entries', array_sum(array_map(fn($l) => count($l['timeline']), $leads)), scalar($pdo, "SELECT COUNT(*) FROM timeline_events WHERE lead_id LIKE 'lead-vt-%'")],
    ['client timeline entries (without mail)', array_sum(array_map(fn($c) => count($c['timeline']), $clients)), scalar($pdo, "SELECT COUNT(*) FROM timeline_events WHERE lead_id LIKE 'client-vt-%' AND id NOT LIKE 'email-%'")],
    ['mail messages', $mailCount, scalar($pdo, "SELECT COUNT(*) FROM timeline_events WHERE lead_id LIKE 'client-vt-%' AND id LIKE 'email-%'")],
    ['mail bodies', $mailWithBody, scalar($pdo, "SELECT COUNT(*) FROM filed_mail_bodies WHERE event_id IN (SELECT id FROM timeline_events WHERE lead_id LIKE 'client-vt-%')")],
    ['lead categories links', array_sum(array_map(fn($l) => count($l['categories']), $leads)) + array_sum(array_map(fn($c) => count($c['categories']), $clients)), scalar($pdo, "SELECT COUNT(*) FROM lead_categories WHERE lead_id LIKE 'lead-vt-%' OR lead_id LIKE 'client-vt-%'")],
    ['projects', count($projects), scalar($pdo, "SELECT COUNT(*) FROM projects WHERE id LIKE 'proj-vt-%'")],
    ['project managers links', array_sum(array_map(fn($p) => count($p['managers']), $projects)), scalar($pdo, "SELECT COUNT(*) FROM project_managers WHERE project_id LIKE 'proj-vt-%'")],
    ['project timeline entries', array_sum(array_map(fn($p) => count($p['timeline']), $projects)), scalar($pdo, "SELECT COUNT(*) FROM `proj_timeline_{$safe}` WHERE project_id LIKE 'proj-vt-%'")],
    ['warehouse items', count($products), scalar($pdo, "SELECT COUNT(*) FROM warehouse_items WHERE external_source = 'mrp'")],
    ['item price rows', array_sum(array_map(fn($p) => count($p['prices']), $products)), scalar($pdo, "SELECT COUNT(*) FROM warehouse_item_prices WHERE item_id LIKE 'whi-vt-%'")],
    ['stock rows', count(array_filter($products, fn($p) => $p['stock'] != 0 || $p['reserved'] != 0)), scalar($pdo, "SELECT COUNT(*) FROM warehouse_stock WHERE item_id LIKE 'whi-vt-%'")],
];
$md .= "## Counts\n\n| Entity | Extracted | In the database | |\n|---|---|---|---|\n";
foreach ($rows as [$name, $a, $b]) {
    $ok = (int)$a === (int)$b;
    if (!$ok) $bad++;
    $md .= "| {$name} | {$a} | {$b} | " . ($ok ? 'ok' : '**DIFFERENT**') . " |\n";
}

// 2. leads by state
$md .= "\n## Leads by state\n\n| State | Extracted | Database |\n|---|---|---|\n";
$exp = [];
foreach ($leads as $l) $exp[$l['status']] = ($exp[$l['status']] ?? 0) + 1;
$got = $pdo->query("SELECT status, COUNT(*) FROM leads WHERE id LIKE 'lead-vt-%' GROUP BY status")->fetchAll(PDO::FETCH_KEY_PAIR);
foreach (array_unique(array_merge(array_keys($exp), array_keys($got))) as $s) {
    $a = $exp[$s] ?? 0; $b = (int)($got[$s] ?? 0);
    if ($a !== $b) $bad++;
    $md .= "| {$s} | {$a} | {$b}" . ($a === $b ? '' : ' **DIFFERENT**') . " |\n";
}
$states = vt_setting_get($pdo, 'LEAD_STATES') ?: [];
$unknown = array_diff(array_keys($got), $states);
if ($unknown) { $bad++; $md .= "\n**States used by leads but missing from LEAD_STATES:** " . implode(', ', $unknown) . "\n"; }
$srcs = vt_setting_get($pdo, 'LEAD_SOURCES') ?: [];
$usedSrc = $pdo->query("SELECT DISTINCT source FROM leads WHERE id LIKE 'lead-vt-%' OR id LIKE 'client-vt-%'")->fetchAll(PDO::FETCH_COLUMN);
if (array_diff($usedSrc, $srcs)) { $bad++; $md .= "\n**Sources used but missing from LEAD_SOURCES:** " . implode(', ', array_diff($usedSrc, $srcs)) . "\n"; }

// 3. orphans
$orph = [
    ['leads without an owner (the old prelead had no manager)', "SELECT COUNT(*) FROM leads WHERE id LIKE 'lead-vt-%' AND owner = ''", false],
    ['leads whose owner is not a user', "SELECT COUNT(*) FROM leads l WHERE (l.id LIKE 'lead-vt-%' OR l.id LIKE 'client-vt-%') AND l.owner <> '' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.name = l.owner)", true],
    ['leads without a client link', "SELECT COUNT(*) FROM leads WHERE id LIKE 'lead-vt-%' AND client_id IS NULL", false],
    ['leads whose client_id points nowhere', "SELECT COUNT(*) FROM leads l WHERE l.id LIKE 'lead-vt-%' AND l.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads c WHERE c.id = l.client_id)", true],
    ['clients without any contact data (no e-mail, no phone)', "SELECT COUNT(*) FROM leads WHERE id LIKE 'client-vt-%' AND COALESCE(email,'') = '' AND COALESCE(phone,'') = ''", false],
    ['projects without a lead', "SELECT COUNT(*) FROM projects WHERE id LIKE 'proj-vt-%' AND lead_id IS NULL", false],
    ['projects without a client', "SELECT COUNT(*) FROM projects WHERE id LIKE 'proj-vt-%' AND client_id IS NULL", false],
    ['projects whose lead or client is missing', "SELECT COUNT(*) FROM projects p WHERE p.id LIKE 'proj-vt-%' AND ((p.lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = p.lead_id)) OR (p.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = p.client_id)))", true],
    ['projects without a manager', "SELECT COUNT(*) FROM projects p WHERE p.id LIKE 'proj-vt-%' AND NOT EXISTS (SELECT 1 FROM project_managers m WHERE m.project_id = p.id)", false],
    ['projects with a status that is not configured', "SELECT COUNT(*) FROM projects WHERE id LIKE 'proj-vt-%' AND status NOT IN ('" . implode("','", array_column(vt_project_status_defs(), 'key')) . "')", true],
    ['mail events whose body is missing although flagged', "SELECT COUNT(*) FROM timeline_events t WHERE t.id LIKE 'email-%' AND t.lead_id LIKE 'client-vt-%' AND t.mail_has_body = 1 AND NOT EXISTS (SELECT 1 FROM filed_mail_bodies b WHERE b.event_id = t.id)", true],
    ['timeline entries with an empty title', "SELECT COUNT(*) FROM timeline_events WHERE (lead_id LIKE 'lead-vt-%' OR lead_id LIKE 'client-vt-%') AND TRIM(title) = ''", true],
    ['items without a price (CENA1 = 0)', "SELECT COUNT(*) FROM warehouse_items WHERE external_source = 'mrp' AND default_sell_price = 0", false],
    ['users without a bcrypt password hash', "SELECT COUNT(*) FROM users WHERE id LIKE 'user-vt-%' AND password_hash NOT LIKE '\$2y\$%'", true],
];
$md .= "\n## Orphans and sanity checks\n\n| Check | Rows | |\n|---|---|---|\n";
foreach ($orph as [$name, $sql, $mustBeZero]) {
    $n = scalar($pdo, $sql);
    if ($mustBeZero && $n > 0) $bad++;
    $md .= "| {$name} | {$n} | " . ($mustBeZero ? ($n ? '**PROBLEM**' : 'ok') : 'info') . " |\n";
}
$dupe = $pdo->query("SELECT LOWER(email) e, COUNT(*) c FROM leads WHERE id LIKE 'client-vt-%' AND COALESCE(email,'') <> '' GROUP BY e HAVING c > 1")->fetchAll(PDO::FETCH_KEY_PAIR);
$md .= "\nClient e-mail duplicates: " . ($dupe ? implode(', ', array_map(fn($e, $c) => "{$e} ({$c})", array_keys($dupe), $dupe)) : 'none') . "\n";

// 4. files
$dir = isset($cli['uploads-dir']) ? rtrim((string)$cli['uploads-dir'], '/\\') . '/' : ccrm_uploads_dir();
$missing = [];
foreach ($files as $f) if (!is_file($dir . $f['target'])) $missing[] = $f['target'];
$md .= "\n## Files\n\n" . count($files) . " attachments are referenced; " . (count($files) - count($missing)) . " exist in `{$dir}`, " . count($missing) . " do not.";
if ($missing) $md .= ' (e.g. ' . implode(', ', array_slice($missing, 0, 5)) . ')';
$md .= "\n";

// 5. samples
function sample(array $all, int $n): array { if (count($all) <= $n) return $all; $keys = (array)array_rand($all, $n); return array_map(fn($k) => $all[$k], $keys); }
$md .= "\n## Samples (10 random records per entity)\n";

$md .= "\n### Leads\n\n| Old code | Extracted: name / state / owner / source | Database: name / state / owner / source / client | Old CRM raw |\n|---|---|---|---|\n";
foreach (sample($leads, 10) as $l) {
    $st = $pdo->prepare("SELECT name, status, owner, source, client_id, (SELECT COUNT(*) FROM timeline_events WHERE lead_id = leads.id) te FROM leads WHERE id = ?");
    $st->execute([$l['id']]);
    $r = $st->fetch();
    $raw = '';
    if ($old) {
        $x = $old->prepare("SELECT code, status_code, (SELECT status_code FROM price_offer o WHERE o.id = p.created_price_offer_id) offer_status FROM prelead p WHERE id = ?");
        $x->execute([$l['oldId']]);
        $rr = $x->fetch();
        $raw = $rr ? "{$rr['status_code']}" . ($rr['offer_status'] ? " / offer {$rr['offer_status']}" : '') : '';
    }
    $md .= "| {$l['code']} | {$l['name']} / {$l['status']} / " . ($l['owner'] ?: '-') . " / {$l['source']} (" . count($l['timeline']) . " entries) | " . ($r ? "{$r['name']} / {$r['status']} / " . ($r['owner'] ?: '-') . " / {$r['source']} / " . ($r['client_id'] ?: '-') . " ({$r['te']} entries)" : '**MISSING**') . " | {$raw} |\n";
}

$md .= "\n### Clients\n\n| Old id | Extracted: name / e-mail / phone / category | Database |\n|---|---|---|\n";
foreach (sample($clients, 10) as $c) {
    $st = $pdo->prepare("SELECT name, email, phone, client_category_id, city, street FROM leads WHERE id = ?");
    $st->execute([$c['id']]);
    $r = $st->fetch();
    $md .= "| {$c['oldId']} | {$c['name']} / " . ($c['email'] ?: '-') . ' / ' . ($c['phone'] ?: '-') . ' / ' . ($c['clientCategory'] ?: '-') . ' | ' . ($r ? "{$r['name']} / " . ($r['email'] ?: '-') . ' / ' . ($r['phone'] ?: '-') . ' / ' . ($r['client_category_id'] ?: '-') : '**MISSING**') . " |\n";
}

$md .= "\n### Projects\n\n| Old code | Extracted: name / status / managers / attributes | Database: name / status / lead / client |\n|---|---|---|\n";
foreach (sample($projects, 10) as $p) {
    $st = $pdo->prepare("SELECT name, status, lead_id, client_id FROM projects WHERE id = ?");
    $st->execute([$p['id']]);
    $r = $st->fetch();
    $md .= "| {$p['code']} | {$p['name']} / {$p['status']} / " . implode(', ', $p['managers']) . ' / ' . count($p['data']) . ' | ' . ($r ? "{$r['name']} / {$r['status']} / " . ($r['lead_id'] ?: '-') . ' / ' . ($r['client_id'] ?: '-') : '**MISSING**') . " |\n";
}

$md .= "\n### Products\n\n| MRP | Extracted: name / unit / VAT / sell / stock | Database: name / unit / VAT / sell / stock |\n|---|---|---|\n";
foreach (sample($products, 10) as $p) {
    $st = $pdo->prepare("SELECT i.name, i.unit, i.vat_rate, i.default_sell_price, (SELECT COALESCE(SUM(quantity),0) FROM warehouse_stock s WHERE s.item_id = i.id) q FROM warehouse_items i WHERE i.id = ?");
    $st->execute([$p['id']]);
    $r = $st->fetch();
    $md .= "| {$p['sku']} | {$p['name']} / {$p['unit']} / {$p['vatRate']} / {$p['sellPrice']} / {$p['stock']} | " . ($r ? "{$r['name']} / {$r['unit']} / {$r['vat_rate']} / " . (float)$r['default_sell_price'] . ' / ' . (float)$r['q'] : '**MISSING**') . " |\n";
}

$md .= "\n---\n" . ($bad ? "**{$bad} check(s) failed.**" : 'All counts agree and no hard problem was found.') . "\n";
file_put_contents("{$dataDir}/reconcile-report.md", $md);
echo $md;
exit($bad ? 1 : 0);
