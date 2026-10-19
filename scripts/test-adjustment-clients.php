<?php
/**
 * Checks for api/adjustment_client_migration.php.
 *   php scripts/test-adjustment-clients.php                       planner only, no database
 *   CCRM_TEST_DSN=mysql:host=...;dbname=... CCRM_TEST_USER=root CCRM_TEST_PASS=x php scripts/test-adjustment-clients.php
 *                                                                  also runs the SQL against a SCRATCH database
 * The database part creates and drops its own `leads` / `timeline_events` tables, so never point it at real data.
 */
chdir(dirname(__DIR__));
require_once __DIR__ . '/../public/api/adjustment_client_migration.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};
$row = fn($id, $name, $adj = 0, $email = '', $phone = '', $value = 0, $created = '2026-01-01', $clientId = null) =>
    ['id' => $id, 'name' => $name, 'adjustment' => $adj, 'email' => $email, 'phone' => $phone, 'value' => $value, 'created_at' => $created, 'client_id' => $clientId];

// the plain case
$plan = ccrm_plan_adjustment_clients([$row('lead-1', 'Peter Novák', 1200, 'p@x.sk'), $row('lead-2', ' peter novák ', 0, 'p@x.sk')]);
$e = $plan['entries'][0] ?? null;
$check('an adjustment-only client gets one planned client row', count($plan['entries']) === 1 && $e['client_id'] === 'client-adj-lead-1');
$check('the adjustment moves from the lead that carries it', $e['moved_from'] === ['lead-1'] && $e['adjustment'] === 1200.0);
$check('that lead and its same-name lead are linked', $e['link_ids'] === ['lead-1', 'lead-2'] || $e['link_ids'] === ['lead-2', 'lead-1']);

// nothing to do
$plan = ccrm_plan_adjustment_clients([$row('lead-1', 'A', 0), $row('client-1', 'B', 0), $row('client-2', 'C', 500)]);
$check('plain leads and names that already have a client row are not touched', $plan['entries'] === [] && $plan['has_client_row'] === 1 && $plan['unresolved'] === []);

// different people under one name
$plan = ccrm_plan_adjustment_clients([$row('lead-1', 'A', 100, 'one@x.sk'), $row('lead-2', 'A', 0, 'two@x.sk')]);
$check('a same-name lead with another e-mail is left unlinked and reported',
    $plan['entries'][0]['link_ids'] === ['lead-1'] && count($plan['entries'][0]['left_unlinked']) === 1
    && $plan['entries'][0]['left_unlinked'][0]['lead_ids'] === ['lead-2']);

// the source lead itself cannot be linked (client has no e-mail, the leads disagree)
$plan = ccrm_plan_adjustment_clients([$row('lead-1', 'A', 100), $row('lead-2', 'A', 0, 'one@x.sk'), $row('lead-3', 'A', 0, 'two@x.sk')]);
$check('a group whose source lead is not linkable is skipped, not half done', $plan['entries'] === [] && count($plan['unresolved']) === 1);

// adjustments the register and MCP would read differently
$plan = ccrm_plan_adjustment_clients([$row('lead-1', 'A', 100), $row('lead-2', 'A', 200)]);
$check('different adjustments under one name are reported, not guessed', $plan['entries'] === [] && strpos($plan['unresolved'][0]['reason'], 'different adjustments') !== false);
$plan = ccrm_plan_adjustment_clients([$row('lead-1', 'A', -50)]);
$check('a negative adjustment is reported', $plan['entries'] === [] && strpos($plan['unresolved'][0]['reason'], 'negative') !== false);

// the same value twice is one adjustment (the register counts a name's once)
$plan = ccrm_plan_adjustment_clients([$row('lead-1', 'A', 100, 'a@x.sk', '', 0, '2026-02-01'), $row('lead-2', 'A', 100, 'a@x.sk', '', 0, '2026-01-01')]);
$check('equal duplicates move together, from the oldest', $plan['entries'][0]['source_id'] === 'lead-2' && count($plan['entries'][0]['moved_from']) === 2);

// already linked, and idempotence
$plan = ccrm_plan_adjustment_clients([$row('lead-1', 'A', 100, '', '', 0, '2026-01-01', 'client-9')]);
$check('a lead already linked elsewhere is reported', $plan['entries'] === [] && strpos($plan['unresolved'][0]['reason'], 'client-9') !== false);
$plan = ccrm_plan_adjustment_clients([$row('client-adj-lead-1', 'A', 100), $row('lead-1', 'A', 0, '', '', 0, '2026-01-01', 'client-adj-lead-1')]);
$check('a second run plans nothing', $plan['entries'] === []);

// long ids stay within the 50 characters of leads.id
$long = str_repeat('x', 45);
$check('a long lead id still gives a valid id', strlen(ccrm_adjustment_client_id($long)) <= 50 && strpos(ccrm_adjustment_client_id($long), 'client-adj-') === 0);

// the register total
$check('register total = values + the first non-zero adjustment, once',
    ccrm_register_total([$row('a', 'A', 0, '', '', 10), $row('b', 'A', 100, '', '', 5), $row('c', 'A', 100, '', '', 1)]) === 116.0);

// ---- SQL against a scratch database ----
$dsn = getenv('CCRM_TEST_DSN');
if ($dsn) {
    $pdo = new PDO($dsn, getenv('CCRM_TEST_USER') ?: 'root', getenv('CCRM_TEST_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec("DROP TABLE IF EXISTS `client_adjustment_migration`, `timeline_events`, `leads`");
    $pdo->exec("CREATE TABLE `leads` (
        `id` VARCHAR(50) NOT NULL, `name` VARCHAR(150) NOT NULL, `city` VARCHAR(100) NULL,
        `client_type` ENUM('person','business','partner') NOT NULL DEFAULT 'person', `status` VARCHAR(50) NOT NULL DEFAULT 'new',
        `source` VARCHAR(50) NOT NULL DEFAULT 'website', `owner` VARCHAR(100) NOT NULL, `division` VARCHAR(100) NULL,
        `value` DECIMAL(12,2) NOT NULL DEFAULT 0, `adjustment` DECIMAL(14,2) NOT NULL DEFAULT 0, `rating` INT NOT NULL DEFAULT 3,
        `phone` VARCHAR(30) NULL, `email` VARCHAR(150) NULL, `company_id` VARCHAR(50) NULL, `tax_id` VARCHAR(50) NULL, `vat_id` VARCHAR(50) NULL,
        `contact_person` VARCHAR(100) NULL, `website` VARCHAR(255) NULL, `street` VARCHAR(255) NULL, `postal_code` VARCHAR(20) NULL,
        `country` VARCHAR(100) NULL DEFAULT 'Slovakia', `client_id` VARCHAR(50) NULL, `archived` TINYINT(1) NOT NULL DEFAULT 0,
        `created_at` DATE NOT NULL, `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (`id`)) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE `timeline_events` (`id` VARCHAR(50) PRIMARY KEY, `lead_id` VARCHAR(50) NOT NULL) ENGINE=InnoDB");
    $ins = $pdo->prepare("INSERT INTO `leads` (id,name,owner,client_type,status,value,adjustment,email,phone,company_id,contact_person,city,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'2020-01-01 00:00:00.000')");
    //        id        name            owner client_type status value adjustment email         phone  ico        contact   city   created
    foreach ([
        ['lead-a1', 'Acme s.r.o.', 'Eva', 'business', 'won', 300, 1200, 'a@acme.sk', '0900111222', '12345678', 'Jana K.', 'Nitra', '2025-03-01'],
        ['lead-a2', 'ACME s.r.o.', 'Eva', 'business', 'new', 50, 0, 'a@acme.sk', '', '', '', '', '2026-01-01'],
        ['lead-a3', 'Acme s.r.o.', 'Eva', 'business', 'new', 70, 0, 'other@acme.sk', '', '', '', '', '2026-02-01'],
        ['lead-b1', 'Beta', 'Eva', 'person', 'won', 10, 0, '', '', '', '', '', '2026-01-01'],
        ['client-c1', 'Gamma', 'Eva', 'business', 'won', 0, 500, '', '', '', '', '', '2025-01-01'],
        ['lead-d1', 'Delta', 'Eva', 'person', 'won', 0, 100, '', '', '', '', '', '2025-01-01'],
        ['lead-d2', 'Delta', 'Eva', 'person', 'won', 0, 250, '', '', '', '', '', '2025-02-01'],
    ] as $r) $ins->execute($r);

    $totals = function () use ($pdo) {
        $by = [];
        foreach ($pdo->query("SELECT * FROM leads")->fetchAll(PDO::FETCH_ASSOC) as $r) $by[mb_strtolower(trim($r['name']))][] = $r;
        ksort($by);
        return array_map('ccrm_register_total', $by);
    };
    $snapshot = fn() => $pdo->query("SELECT id,adjustment,client_id FROM leads ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
    $t0 = $totals();
    $s0 = $snapshot();

    $dry = ccrm_migrate_adjustment_clients($pdo, false);
    $check('db: a dry run plans one client and writes nothing', count($dry['planned']) === 1 && $snapshot() === $s0 && $dry['created'] === []);
    $check('db: Delta (different adjustments) is reported as skipped', count($dry['unresolved']) === 1 && $dry['unresolved'][0]['name'] === 'Delta');

    $run = ccrm_migrate_adjustment_clients($pdo, true);
    $check('db: apply creates the client row', count($run['created']) === 1 && $run['failed'] === []);
    $new = $pdo->query("SELECT * FROM leads WHERE id = 'client-adj-lead-a1'")->fetch(PDO::FETCH_ASSOC);
    $check('db: the new row carries the adjustment and the contact/company fields',
        $new && (float)$new['adjustment'] === 1200.0 && (float)$new['value'] === 0.0 && $new['company_id'] === '12345678'
        && $new['contact_person'] === 'Jana K.' && $new['email'] === 'a@acme.sk' && $new['created_at'] === '2025-03-01' && $new['client_type'] === 'business');
    $a1 = $pdo->query("SELECT adjustment, client_id, updated_at FROM leads WHERE id = 'lead-a1'")->fetch(PDO::FETCH_ASSOC);
    $check('db: the lead gave the adjustment up and points at the client', (float)$a1['adjustment'] === 0.0 && $a1['client_id'] === 'client-adj-lead-a1');
    $check('db: that lead updated_at moved, so a stale browser cannot push the old adjustment back', $a1['updated_at'] > '2020-01-01 00:00:00.000');
    $links = $pdo->query("SELECT id, client_id, updated_at FROM leads WHERE id IN ('lead-a2','lead-a3')")->fetchAll(PDO::FETCH_ASSOC | PDO::FETCH_UNIQUE);
    $check('db: the safe same-name lead is linked, the one with another e-mail is not', $links['lead-a2']['client_id'] === 'client-adj-lead-a1' && $links['lead-a3']['client_id'] === null);
    $check('db: linking a sibling leaves its updated_at alone', $links['lead-a2']['updated_at'] === '2020-01-01 00:00:00.000');
    $check('db: no register total changed', $totals() === $t0);
    $check('db: Gamma and Delta were not touched', $pdo->query("SELECT COUNT(*) FROM leads WHERE name IN ('Gamma','Delta') AND client_id IS NOT NULL")->fetchColumn() == 0);

    $again = ccrm_migrate_adjustment_clients($pdo, true);
    $check('db: a second apply does nothing', $again['planned'] === [] && $again['created'] === [] && (int)$pdo->query("SELECT COUNT(*) FROM leads WHERE id LIKE 'client-adj-%'")->fetchColumn() === 1);

    // a client that has been used cannot be undone
    $pdo->exec("INSERT INTO timeline_events (id, lead_id) VALUES ('ev-1', 'client-adj-lead-a1')");
    $undo = ccrm_undo_adjustment_clients($pdo, true);
    $check('db: undo refuses a client row that has been used', $undo['restored'] === [] && strpos($undo['kept'][0]['reason'], 'timeline_events') !== false
        && $pdo->query("SELECT COUNT(*) FROM leads WHERE id = 'client-adj-lead-a1'")->fetchColumn() == 1);
    $pdo->exec("DELETE FROM timeline_events");

    $undry = ccrm_undo_adjustment_clients($pdo, false);
    $check('db: an undo dry run writes nothing', count($undry['restored']) === 1 && $pdo->query("SELECT COUNT(*) FROM leads WHERE id = 'client-adj-lead-a1'")->fetchColumn() == 1);
    $undo = ccrm_undo_adjustment_clients($pdo, true);
    $check('db: undo restores the adjustment, the links and removes the row', count($undo['restored']) === 1
        && $snapshot() === $s0 && (int)$pdo->query("SELECT COUNT(*) FROM client_adjustment_migration")->fetchColumn() === 0);
    $check('db: totals are the same after undo', $totals() === $t0);

    // an adjustment edited on the client is what comes back
    ccrm_migrate_adjustment_clients($pdo, true);
    $pdo->exec("UPDATE leads SET adjustment = 1500 WHERE id = 'client-adj-lead-a1'");
    ccrm_undo_adjustment_clients($pdo, true);
    $check('db: undo restores the adjustment as it is now, not as it was', (float)$pdo->query("SELECT adjustment FROM leads WHERE id = 'lead-a1'")->fetchColumn() === 1500.0);

    $pdo->exec("DROP TABLE IF EXISTS `client_adjustment_migration`, `timeline_events`, `leads`");
} else {
    echo "skip db part (set CCRM_TEST_DSN to a scratch database to run it)\n";
}

echo $fails === 0 ? "\nAll passed.\n" : "\n$fails FAILED.\n";
exit($fails === 0 ? 0 : 1);
