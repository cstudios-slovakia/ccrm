<?php
/**
 * Step 2 of the Villatesta migration: write the JSON of extract.php into a CCRM database.
 * Runs where config.php lives (the dev container, or the hosting). Idempotent: ids are
 * deterministic, so a second run updates the same rows.
 *
 *   php scripts/import/villatesta/load.php [--data=<dir with the JSON>] [--config=<config.php>]
 *       [--only=config,users,clients,leads,projects,mail,products,files,leftovers] [--dry-run]
 *       [--reset] [--overwrite-passwords] [--uploads-src=<dir that is /storage/uploads of the old CRM>]
 *       [--uploads-dir=<target uploads dir>] [--api-dir=<dir with auth.php>] [--report=<file>]
 *
 *  --dry-run              writes nothing (every step runs inside a rolled-back transaction) and prints what it would do
 *  --reset                first removes everything an earlier run created (ids *-vt-*), for rehearsals
 *  --overwrite-passwords  also replace the password of a user that already exists (default: keep it)
 *
 * Target: the database config.php points at. NEVER aim a half-built run at production: use --dry-run first.
 * Plan: Claude outputs/villatesta-migration/PLAN.md (C0-C9, B).
 */

require __DIR__ . '/lib.php';
require __DIR__ . '/seed_config.php';

$cli = vt_cli($argv);
$dataDir = rtrim((string)($cli['data'] ?? (__DIR__ . '/out')), '/\\');
$dry = !empty($cli['dry-run']);
$only = isset($cli['only']) ? array_filter(array_map('trim', explode(',', (string)$cli['only']))) : [];
$want = fn(string $name) => !$only || in_array($name, $only, true);

$configPath = (string)($cli['config'] ?? '');
if ($configPath === '') {
    $configPath = getcwd() . '/config.php';
    if (!is_file($configPath)) $configPath = dirname(__DIR__, 3) . '/config.php';
}
if (!is_file($configPath)) { fwrite(STDERR, "config.php not found - pass --config=\n"); exit(1); }
require $configPath;

// The app code (schema, upload name rules, ids). Next to config.php (the hosting) or in public/ (the repo).
$root = dirname($configPath);
$apiDir = isset($cli['api-dir']) ? rtrim((string)$cli['api-dir'], '/\\') : (is_dir($root . '/api') ? $root . '/api' : dirname(__DIR__, 3) . '/public/api');
require_once $apiDir . '/auth.php';
require_once $apiDir . '/schema.php';

$pdo = get_db_connection();
$report = new VtReport();
$started = microtime(true);

$say = function (string $m) { echo '[' . date('H:i:s') . '] ' . $m . "\n"; };
$say(($dry ? 'DRY RUN against ' : 'Loading into ') . DB_HOST . '/' . DB_NAME . ($only ? ' (' . implode(',', $only) . ')' : ''));

// ── helpers ──────────────────────────────────────────────────────────────────

/** INSERT ... ON DUPLICATE KEY UPDATE for one row; $keep lists columns an update must not touch. */
function vt_upsert(PDO $pdo, string $table, array $row, array $keep = []): void {
    static $cache = [];
    $cols = array_keys($row);
    $key = $table . '|' . implode(',', $cols) . '|' . implode(',', $keep);
    if (!isset($cache[$key])) {
        $upd = array_values(array_filter($cols, fn($c) => !in_array($c, $keep, true) && $c !== 'id'));
        $sql = 'INSERT INTO `' . $table . '` (' . implode(', ', array_map(fn($c) => "`{$c}`", $cols)) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')';
        $sql .= $upd ? ' ON DUPLICATE KEY UPDATE ' . implode(', ', array_map(fn($c) => "`{$c}` = VALUES(`{$c}`)", $upd)) : ' ON DUPLICATE KEY UPDATE `id` = `id`';
        $cache[$key] = $pdo->prepare($sql);
    }
    $cache[$key]->execute(array_values($row));
}

/** Runs $fn inside a transaction; a dry run rolls it back. */
function vt_tx(PDO $pdo, bool $dry, callable $fn): void {
    $pdo->beginTransaction();
    try {
        $fn();
        $dry ? $pdo->rollBack() : $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

/** Cuts a string to at most $bytes bytes without breaking a UTF-8 character. */
function vt_cut(?string $s, int $bytes): ?string {
    return $s === null ? null : mb_strcut($s, 0, $bytes, 'UTF-8');
}

function vt_ts($v, string $fallback): string {
    $v = (string)$v;
    return preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/', $v) ? str_replace('T', ' ', substr($v, 0, 19)) : $fallback;
}

/** One timeline entry (the shape extract.php writes) into timeline_events for $ownerId. */
function vt_put_event(PDO $pdo, string $ownerId, array $e, string $fallbackTs): void {
    $att = !empty($e['attachments']) ? json_encode($e['attachments'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    $row = [
        'id' => $e['id'], 'lead_id' => $ownerId, 'type' => $e['type'], 'timestamp' => vt_ts($e['timestamp'] ?? '', $fallbackTs),
        'title' => vt_cut(trim((string)($e['title'] ?? '')) !== '' ? $e['title'] : 'Záznam', 250),
        'content' => vt_cut($e['content'] ?? null, 60000), 'attachments_json' => $att,
        'is_outgoing' => !empty($e['isOutgoing']) ? 1 : 0, 'author' => $e['author'] ?? null,
    ];
    vt_upsert($pdo, 'timeline_events', $row, ['hidden']);
}

// ── schema ───────────────────────────────────────────────────────────────────

if ($dry) {
    $say('dry run: the schema is not touched' . (ccrm_schema_is_current($pdo, ccrm_schema_fingerprint()) ? '' : ' (WARNING: it is not current, steps may fail - run once without --dry-run, or `php ccrm update`)'));
} else {
    ccrm_apply_schema($pdo);
    $say('schema is current');
}

// ── reset (rehearsal only) ───────────────────────────────────────────────────

if (!empty($cli['reset']) && !$dry) {
    $say('reset: removing everything earlier runs created');
    $pdo->exec("DELETE FROM `filed_mail_bodies` WHERE `event_id` IN (SELECT `id` FROM `timeline_events` WHERE `lead_id` LIKE 'client-vt-%' OR `lead_id` LIKE 'lead-vt-%')");
    $pdo->exec("DELETE FROM `projects` WHERE `id` LIKE 'proj-vt-%'");
    $pdo->exec("DELETE FROM `leads` WHERE `id` LIKE 'lead-vt-%' OR `id` LIKE 'client-vt-%'");
    $pdo->exec("DELETE FROM `warehouse_items` WHERE `id` LIKE 'whi-vt-%'");
    $pdo->exec("DELETE FROM `users` WHERE `id` LIKE 'user-vt-%'");
}

// ── B: configuration ─────────────────────────────────────────────────────────

if ($want('config')) {
    vt_tx($pdo, $dry, fn() => vt_seed_config($pdo, $report));
    // DDL commits implicitly, so the tables are made outside the transaction (and never in a dry run)
    if (!$dry) vt_ensure_project_tables($pdo, VT_PROJECT_TYPE_ID, vt_project_attributes());
    $say('configuration seeded');
}

// ── C1: users ────────────────────────────────────────────────────────────────

$userIdByName = [];
foreach ($pdo->query("SELECT `id`, `name` FROM `users`")->fetchAll() as $u) $userIdByName[mb_strtolower($u['name'])] = $u['id'];

if ($want('users')) {
    $users = vt_json_read("{$dataDir}/users.json");
    vt_tx($pdo, $dry, function () use ($pdo, $users, $cli, $report, &$userIdByName) {
        $byEmail = $pdo->prepare("SELECT `id`, `name` FROM `users` WHERE LOWER(`email`) = ?");
        foreach ($users as $u) {
            $byEmail->execute([strtolower($u['email'])]);
            $existing = $byEmail->fetch();
            if ($existing) {
                $set = "`name` = ?, `role` = ?";
                $params = [$u['name'], $u['role']];
                if (!empty($cli['overwrite-passwords'])) { $set .= ", `password_hash` = ?"; $params[] = $u['passwordHash']; }
                $params[] = $existing['id'];
                $pdo->prepare("UPDATE `users` SET {$set} WHERE `id` = ?")->execute($params);
                $userIdByName[mb_strtolower($u['name'])] = $existing['id'];
                $report->count('users updated (password kept)');
                continue;
            }
            if (isset($userIdByName[mb_strtolower($u['name'])])) {
                $report->warn('users', "name \"{$u['name']}\" is already taken by another user - {$u['email']} imported under the same display name");
            }
            vt_upsert($pdo, 'users', ['id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'password_hash' => $u['passwordHash'], 'role' => $u['role']]);
            $userIdByName[mb_strtolower($u['name'])] = $u['id'];
            $report->count('users created');
        }
    });
    $say('users done');
}

/** Aborts the run when an owner is not a user of this CRM (same rule as import_leads.php). In a dry run the users of users.json count as present. */
function vt_check_owners(PDO $pdo, array $owners, array $extraKnown = []): void {
    $known = array_flip(array_merge($pdo->query("SELECT `name` FROM `users`")->fetchAll(PDO::FETCH_COLUMN), $extraKnown));
    $bad = [];
    foreach ($owners as $o => $n) if ($o !== '' && !isset($known[$o])) $bad[$o] = $n;
    if ($bad) {
        fwrite(STDERR, "ABORT: these owners are not users of this CRM (run the users step first):
");
        foreach ($bad as $o => $n) fwrite(STDERR, "  {$o} ({$n} rows)
");
        exit(1);
    }
}

// ── C2/C3/C4: clients and leads (offers are already folded into their timelines) ──

$clientCats = [];
$stmt = $pdo->query("SELECT `id` FROM `client_categories` WHERE `id` LIKE 'cc-vt-%'");
foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) $clientCats[substr($id, strlen('cc-vt-'))] = $id;

if ($want('clients')) {
    $clients = vt_json_read("{$dataDir}/clients.json");
    $owners = [];
    foreach ($clients as $c) $owners[$c['owner']] = ($owners[$c['owner']] ?? 0) + 1;
    vt_check_owners($pdo, $owners, $dry ? array_column(vt_json_read("{$dataDir}/users.json"), 'name') : []);
    vt_tx($pdo, $dry, function () use ($pdo, $clients, $clientCats, $report) {
        $delCat = $pdo->prepare("DELETE FROM `lead_categories` WHERE `lead_id` = ?");
        $insCat = $pdo->prepare("INSERT IGNORE INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
        foreach ($clients as $c) {
            vt_upsert($pdo, 'leads', [
                'id' => $c['id'], 'name' => $c['name'], 'city' => $c['city'], 'client_type' => $c['clientType'], 'status' => 'Akceptovaná',
                'source' => $c['source'], 'owner' => $c['owner'], 'value' => 0, 'adjustment' => 0, 'rating' => 5,
                'phone' => vt_cut($c['phone'], 30), 'email' => vt_cut($c['email'], 150), 'company_id' => $c['companyId'], 'tax_id' => $c['taxId'], 'vat_id' => $c['vatId'],
                'contact_person' => vt_cut($c['contactPerson'], 100), 'street' => $c['street'], 'postal_code' => vt_cut($c['postalCode'], 20), 'country' => $c['country'],
                'client_category_id' => $c['clientCategory'] ? ($clientCats[$c['clientCategory']] ?? null) : null,
                'archived' => $c['archived'] ? 1 : 0, 'created_at' => $c['createdAt'],
            ]);
            $delCat->execute([$c['id']]);
            foreach ($c['categories'] as $cat) $insCat->execute([$c['id'], $cat]);
            foreach ($c['timeline'] as $e) { vt_put_event($pdo, $c['id'], $e, $c['createdAt'] . ' 00:00:00'); $report->count('client timeline entries'); }
            $report->count('clients');
        }
    });
    $say('clients done');
}

if ($want('leads')) {
    $leads = vt_json_read("{$dataDir}/leads.json");
    $owners = [];
    foreach ($leads as $l) $owners[$l['owner']] = ($owners[$l['owner']] ?? 0) + 1;
    vt_check_owners($pdo, $owners, $dry ? array_column(vt_json_read("{$dataDir}/users.json"), 'name') : []);
    $clientIds = array_flip($pdo->query("SELECT `id` FROM `leads` WHERE `id` LIKE 'client-vt-%'")->fetchAll(PDO::FETCH_COLUMN));
    vt_tx($pdo, $dry, function () use ($pdo, $leads, $report, $clientIds, $dry) {
        $delCat = $pdo->prepare("DELETE FROM `lead_categories` WHERE `lead_id` = ?");
        $insCat = $pdo->prepare("INSERT IGNORE INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
        foreach ($leads as $l) {
            $clientId = $l['clientId'];
            if ($clientId !== null && !isset($clientIds[$clientId]) && !$dry) { $report->warn('leads', "{$l['code']}: client {$clientId} is not in the database, link left empty"); $clientId = null; }
            vt_upsert($pdo, 'leads', [
                'id' => $l['id'], 'name' => $l['name'], 'client_type' => 'person', 'status' => $l['status'], 'source' => $l['source'],
                'traffic_origin' => vt_cut($l['trafficOrigin'], 50), 'owner' => $l['owner'], 'value' => 0, 'adjustment' => 0, 'rating' => 3,
                'phone' => vt_cut($l['phone'], 30), 'email' => vt_cut($l['email'], 150), 'contact_person' => vt_cut($l['contactPerson'], 100),
                'interest_note' => $l['interestNote'], 'client_id' => $clientId, 'archived' => $l['archived'] ? 1 : 0, 'created_at' => $l['createdAt'],
            ]);
            $delCat->execute([$l['id']]);
            foreach ($l['categories'] as $cat) $insCat->execute([$l['id'], $cat]);
            foreach ($l['timeline'] as $e) { vt_put_event($pdo, $l['id'], $e, $l['createdAt'] . ' 00:00:00'); $report->count('lead timeline entries'); }
            $report->count('leads');
        }
    });
    $say('leads done');
}

// ── C5: zákazky -> projects ──────────────────────────────────────────────────

if ($want('projects')) {
    $projects = vt_json_read("{$dataDir}/projects.json");
    $safe = preg_replace('/[^a-z0-9_]/', '', strtolower(VT_PROJECT_TYPE_ID));
    $tablesOk = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'proj_data_{$safe}'")->fetchColumn() === 1;
    if (!$tablesOk) {
        $report->warn('projects', 'the tables of the project type do not exist yet' . ($dry ? ' (dry run does not create them): projects are counted, their data and timeline are not written' : ''));
    }
    $typeExists = (int)$pdo->query("SELECT COUNT(*) FROM `project_types` WHERE `id` = " . $pdo->quote(VT_PROJECT_TYPE_ID))->fetchColumn() === 1;
    vt_tx($pdo, $dry, function () use ($pdo, $projects, $report, $safe, $tablesOk, $typeExists, $userIdByName) {
        if (!$typeExists) { $report->warn('projects', 'the project type is missing - run the config step first'); return; }
        $delMgr = $pdo->prepare("DELETE FROM `project_managers` WHERE `project_id` = ?");
        $insMgr = $pdo->prepare("INSERT IGNORE INTO `project_managers` (`project_id`, `user_id`) VALUES (?, ?)");
        $delTl = $tablesOk ? $pdo->prepare("DELETE FROM `proj_timeline_{$safe}` WHERE `project_id` = ?") : null;
        $cols = $tablesOk ? array_flip($pdo->query("SHOW COLUMNS FROM `proj_data_{$safe}`")->fetchAll(PDO::FETCH_COLUMN)) : [];
        foreach ($projects as $p) {
            vt_upsert($pdo, 'projects', [
                'id' => $p['id'], 'project_type_id' => VT_PROJECT_TYPE_ID, 'name' => $p['name'], 'lead_id' => $p['leadId'], 'client_id' => $p['clientId'],
                'status' => $p['status'], 'archived' => $p['archived'] ? 1 : 0, 'created_at' => $p['createdAt'] . ' 00:00:00',
                'ticket_public_hash' => bin2hex(random_bytes(16)),
            ], ['ticket_public_hash']);
            $delMgr->execute([$p['id']]);
            foreach ($p['managers'] as $name) {
                // project_managers.user_id holds the user's NAME (the app keys managers by name, like lead owners)
                if (!isset($userIdByName[mb_strtolower($name)])) { $report->warn('projects', "{$p['code']}: manager \"{$name}\" is not a user"); continue; }
                $insMgr->execute([$p['id'], $name]);
            }
            if ($tablesOk) {
                $row = ['id' => $p['id'], 'project_id' => $p['id']];
                foreach ($p['data'] as $k => $v) {
                    $col = 'attr_' . preg_replace('/[^a-z0-9_]/', '', strtolower($k));
                    if (!isset($cols[$col])) { $report->warn('projects', "no column for attribute {$k}"); continue; }
                    $row[$col] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string)$v;
                }
                vt_upsert($pdo, "proj_data_{$safe}", $row);
                $delTl->execute([$p['id']]);
                foreach ($p['timeline'] as $e) {
                    $ts = vt_ts($e['timestamp'] ?? '', $p['createdAt'] . ' 00:00:00');
                    $pdo->prepare("INSERT INTO `proj_timeline_{$safe}` (`id`, `project_id`, `type`, `event_type`, `timestamp`, `title`, `content`) VALUES (?, ?, ?, NULL, ?, ?, ?)")
                        ->execute([$e['id'], $p['id'], in_array($e['type'], ['phone', 'email'], true) ? $e['type'] : 'note', $ts, vt_cut($e['title'] ?: 'Záznam', 250), vt_cut(($e['content'] ?? null) !== null ? $e['content'] : null, 60000)]);
                    $report->count('project timeline entries');
                }
            }
            $report->count('projects');
        }
    });
    $say('projects done');
}

// ── C6: customer e-mail history ──────────────────────────────────────────────

if ($want('mail')) {
    // The ids must be exactly what live IMAP reading builds, or every message would show twice.
    if (is_file($apiDir . '/mail_broker.php')) {
        require_once $apiDir . '/mail_broker.php';
        foreach ([['a@b.sk', 'INBOX', 12], ['Info@Villatesta.sk', 'Sent Messages', 7]] as [$u, $f, $n]) {
            if (ccrm_mail_event_id($u, $f, $n) !== vt_mail_event_id($u, $f, $n)) { fwrite(STDERR, "ABORT: mail event id formula differs from ccrm_mail_event_id()\n"); exit(1); }
        }
    }
    $clientIds = array_flip($pdo->query("SELECT `id` FROM `leads` WHERE `id` LIKE 'client-vt-%'")->fetchAll(PDO::FETCH_COLUMN));
    $batch = 0;
    $pdo->beginTransaction();
    try {
        $insBody = $pdo->prepare("INSERT INTO `filed_mail_bodies` (`event_id`, `body`, `attachments_json`) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE `body` = VALUES(`body`)");
        foreach (vt_read_jsonl("{$dataDir}/mail.jsonl") as $m) {
            if (!isset($clientIds[$m['clientId']]) && !$dry) { $report->skip('mail', 'client record not in the database', $m['id']); continue; }
            $hasBody = trim((string)$m['body']) !== '';
            vt_upsert($pdo, 'timeline_events', [
                'id' => $m['id'], 'lead_id' => $m['clientId'], 'type' => 'email', 'timestamp' => vt_ts($m['timestamp'], '2000-01-01 00:00:00'),
                'title' => vt_cut($m['title'], 250), 'content' => vt_cut($m['content'], 60000), 'is_outgoing' => $m['isOutgoing'] ? 1 : 0, 'author' => $m['author'],
                'mail_account' => vt_cut($m['mailAccount'], 150), 'mail_owner' => null, 'mail_has_body' => $hasBody ? 1 : 0,
                'mail_message_id' => $m['messageId'] !== '' ? $m['messageId'] : null,
            ], ['hidden']);
            if ($hasBody) $insBody->execute([$m['id'], $m['body']]);
            $report->count('mail messages');
            if (++$batch % 2000 === 0) { $dry ? null : $pdo->commit(); if (!$dry) $pdo->beginTransaction(); $say("  mail: {$batch}"); }
        }
        $dry ? $pdo->rollBack() : $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    $say('mail done');
}

// ── C7: products ─────────────────────────────────────────────────────────────

if ($want('products')) {
    $products = vt_json_read("{$dataDir}/products.json");
    $warehouseId = $pdo->query("SELECT `id` FROM `warehouses` WHERE `is_default` = 1 LIMIT 1")->fetchColumn();
    if (!$warehouseId) { $warehouseId = VT_WAREHOUSE_ID; $report->warn('products', 'no default warehouse yet - stock goes to ' . VT_WAREHOUSE_ID . ' once the config step has run'); }
    $levelIds = array_column(VT_PRICE_LEVELS, 'id');
    $byExt = [];
    $bySku = [];
    foreach ($pdo->query("SELECT `id`, `sku`, `external_source`, `external_id` FROM `warehouse_items`")->fetchAll() as $r) {
        $bySku[$r['sku']] = $r['id'];
        if ($r['external_source'] === 'mrp') $byExt[$r['external_id']] = $r['id'];
    }
    vt_tx($pdo, $dry, function () use ($pdo, $products, $report, $warehouseId, $levelIds, $byExt, $bySku) {
        $delPrices = $pdo->prepare("DELETE FROM `warehouse_item_prices` WHERE `item_id` = ?");
        $insPrice = $pdo->prepare("INSERT INTO `warehouse_item_prices` (`item_id`, `price_level_id`, `price`) VALUES (?, ?, ?)");
        $stock = $pdo->prepare("INSERT INTO `warehouse_stock` (`warehouse_id`, `item_id`, `quantity`, `reserved_quantity`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE `quantity` = VALUES(`quantity`), `reserved_quantity` = VALUES(`reserved_quantity`)");
        $whExists = (int)$pdo->query("SELECT COUNT(*) FROM `warehouses` WHERE `id` = " . $pdo->quote($warehouseId))->fetchColumn() === 1;
        foreach ($products as $p) {
            $id = $byExt[$p['externalId']] ?? $p['id'];
            if (isset($bySku[$p['sku']]) && $bySku[$p['sku']] !== $id) { $report->skip('products', 'SKU already used by another item', $p['sku']); continue; }
            vt_upsert($pdo, 'warehouse_items', [
                'id' => $id, 'sku' => $p['sku'], 'name' => $p['name'], 'description' => $p['description'], 'category' => vt_cut($p['category'], 100),
                'unit' => vt_cut($p['unit'] ?: 'ks', 20), 'min_stock' => $p['minStock'], 'optimal_stock' => $p['optimalStock'], 'default_location' => vt_cut($p['location'], 100),
                'default_sell_price' => $p['sellPrice'], 'avg_purchase_price' => $p['purchasePrice'], 'last_purchase_price' => $p['purchasePrice'],
                'vat_rate' => $p['vatRate'], 'pack_quantity' => $p['packQuantity'], 'external_source' => 'mrp', 'external_id' => $p['externalId'],
                'alt_codes_json' => $p['altCodes'] ? json_encode($p['altCodes'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            ]);
            $delPrices->execute([$id]);
            foreach ($p['prices'] as $i => $price) if (isset($levelIds[$i - 1])) $insPrice->execute([$id, $levelIds[$i - 1], $price]);
            if (($p['stock'] != 0 || $p['reserved'] != 0) && $whExists) { $stock->execute([$warehouseId, $id, $p['stock'], $p['reserved']]); $report->count('stock rows'); }
            $report->count('products');
        }
    });
    $say('products done');
}

// ── C9: files ────────────────────────────────────────────────────────────────

if ($want('files')) {
    $manifest = vt_json_read("{$dataDir}/files.json");
    $src = isset($cli['uploads-src']) ? rtrim((string)$cli['uploads-src'], '/\\') : null;
    $dest = isset($cli['uploads-dir']) ? rtrim((string)$cli['uploads-dir'], '/\\') . '/' : ccrm_uploads_dir();
    if ($src === null) {
        $report->warn('files', 'no --uploads-src given: ' . count($manifest) . ' files are NOT copied (the timeline entries already point to their final paths)');
    } else {
        $missing = [];
        foreach ($manifest as $f) {
            $rel = preg_replace('~^/?storage/uploads/~', '', ltrim((string)$f['source'], '/'));
            $from = $src . '/' . $rel;
            if (ccrm_safe_upload_name($f['target']) === null) { $report->skip('files', 'blocked file type', $f['target']); continue; }
            if (!is_file($from)) { $missing[] = $f['key'] . ' ' . $rel; continue; }
            if ($dry) { $report->count('files that would be copied'); continue; }
            if (!is_dir($dest)) mkdir($dest, 0775, true);
            if (!@copy($from, $dest . $f['target'])) { $report->skip('files', 'copy failed', $f['target']); continue; }
            if (!ccrm_stored_file_matches_extension($dest . $f['target'], $f['target'])) $report->warn('files', "{$f['target']}: content does not match its extension");
            $report->count('files copied');
        }
        foreach ($missing as $m) $report->skip('files', 'missing in the downloaded storage', $m);
    }
    $say('files done');
}

// ── C8: leftovers (nothing is written; Peter decides) ────────────────────────

if ($want('leftovers')) {
    $left = vt_json_read("{$dataDir}/leftovers.json");
    $report->note('Calendar events not imported (' . count($left['events']) . ': ' . implode(' | ', array_map(fn($e) => $e['name'] . ' ' . $e['date'], $left['events'])) . ') - PLAN C8 waits for Peter\'s decision.');
    $report->note(count($left['orphanOffers']) . ' price offers have neither a prelead nor a named client and were not imported (listed in leftovers.json).');
    $report->note('Mail accounts of the old CRM (for D6, credentials are in the old DB, not exported here): ' . implode(', ', array_column($left['mailAccounts'], 'email')));
}

$report->set('seconds', (int)round(microtime(true) - $started));
$md = $report->toMarkdown(($dry ? 'Dry run' : 'Load') . ' report - ' . DB_NAME);
$reportFile = (string)($cli['report'] ?? ($dataDir . '/load-report' . ($dry ? '-dry' : '') . '.md'));
@file_put_contents($reportFile, $md);
echo "\n" . $md;
