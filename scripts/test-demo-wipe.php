<?php
/**
 * Dry run of the demo re-seed (docs/DEMO-MODE.md phase 3) against the recording fake PDO.
 * Plain `php`: no database, no PDO driver, no Docker.
 * Run:  php scripts/test-demo-wipe.php [-v]        (npm run test:demo-wipe, if the script is wired)
 *
 * Covers public/api/demo_seed/wipe.php (demo_wipe_demo_rows) and public/api/demo_reseed.php:
 *  - the wipe removes demo rows - every 'demo-' id, every demo_legacy_ids() id, derived rows, the demo
 *    logins of all three editions with their passkeys / remember tokens, the demo WhatsApp numbers, the
 *    demo mailbox, demo SAI simulations with their sim<id>_* tables, demo project-type tables - and
 *    NOTHING else: a row a user made (lead, task, user, WhatsApp number, simulation, project type, a
 *    project inside a demo type's table) survives, and the number of rows that disappeared equals the
 *    counts the wipe reported;
 *  - the wipe is idempotent and refuses to run inside a transaction;
 *  - demo_reseed_run(): sk -> hu -> en switches language and currency, replaces the demo logins (the
 *    old edition's three and the legacy alex@ are gone, the new edition's three exist, a hand-made
 *    login stays), rewrites the lists only when resetCompany is on, keeps hand-made settings and
 *    DEMO_DATASET describes the last run;
 *  - the guards: refused unless DEMO_MODE is on (--force overrides), language / currency validation,
 *    the status call (outdated install, missing modules).
 */
require_once __DIR__ . '/lib/demo-fake-pdo.php';
define('CCRM_DEMO_RESEED_LIB', true);
require_once dirname(__DIR__) . '/public/api/demo_reseed.php';
require_once dirname(__DIR__) . '/public/api/schema.php';
require_once dirname(__DIR__) . '/public/api/Swarm/SwarmManager.php';

$verbose = in_array('-v', $argv, true);
$fails = 0;
$checks = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails, &$checks): void {
    $checks++;
    if (!$ok) $fails++;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . ($ok ? '' : "\n       " . str_replace("\n", "\n       ", $detail)) . "\n";
};
$section = static function (string $title): void { echo "\n== {$title}\n"; };
$throws = static function (callable $fn, string $needle = ''): bool {
    try { $fn(); } catch (\Throwable $e) { return $needle === '' || stripos($e->getMessage(), $needle) !== false; }
    return false;
};

/** Every row of every table, as "table|json(row)" strings: the fingerprint of the whole database. */
$allRows = static function (DemoFakePdo $db): array {
    $out = [];
    foreach ($db->tablesWithRows() as $t) foreach ($db->rows($t) as $r) $out[] = $t . '|' . json_encode($r);
    return $out;
};
$ids = static function (DemoFakePdo $db, string $table, string $col = 'id'): array {
    return array_map(static fn($r) => (string)$r[$col], $db->rows($table));
};

/**
 * A fake database holding a mixed bag: demo rows of every generation, and rows a user made.
 * Returns [$db, $mine] where $mine lists what must survive: table => [[column, value], ...].
 */
function wipe_fixture(): array {
    $db = new DemoFakePdo();
    foreach (['DEMO_MODE' => 'true', 'SYSTEM_LANGUAGE' => 'sk', 'SYSTEM_CURRENCY' => 'EUR', 'HAND_MADE_SETTING' => 'keep me'] as $k => $v) $db->setSetting($k, $v);
    // Tables created lazily by other code (the real statements, so the prefix wipe sees the real shape).
    $db->exec("CREATE TABLE IF NOT EXISTS `user_passkeys` (`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `user_id` VARCHAR(50) NOT NULL, `name` VARCHAR(100) NOT NULL, `credential_id` VARCHAR(512) NOT NULL, `credential` LONGTEXT NOT NULL, PRIMARY KEY (`id`))");
    $mine = [];
    // NOT NULL columns without a default, per table (the fake is as strict as MySQL).
    $fill = static function (string $table, array $row): array {
        $id = (string)($row['id'] ?? '');
        $defaults = [
            'leads' => ['name' => 'Lead', 'owner' => 'Owner', 'created_at' => '2026-01-01 00:00:00'],
            'tasks' => ['title' => 'Task', 'deadline' => '2026-01-01 00:00:00', 'owner' => 'Owner'],
            'timeline_events' => ['lead_id' => 'lead-1', 'title' => 'Event', 'timestamp' => '2026-01-01 00:00:00'],
            'financial_records' => ['type' => 'expense', 'title' => 'Record', 'issue_date' => '2026-01-01'],
            'warehouses' => ['name' => 'Warehouse', 'code' => $id],
            'orders' => ['order_number' => $id, 'order_date' => '2026-01-01'],
            'tickets' => ['ticket_number' => $id, 'title' => 'Ticket'],
            'email_summaries' => ['summary' => 's'],
            'project_types' => ['name' => 'Type', 'icon' => 'i', 'color' => '#000000', 'attributes_json' => '[]'],
            'employees' => ['name' => 'Staff'],
        ];
        return $row + ($defaults[$table] ?? []);
    };
    $seed = static function (string $table, array $row, bool $survives) use ($db, $fill, &$mine): void {
        $db->seedRow($table, $fill($table, $row));
        if ($survives) $mine[$table][] = $row;
    };
    $plant = static function (string $table, array $row) use ($db, $fill): void { $db->seedRow($table, $fill($table, $row)); };

    // --- users: every demo login of every edition + legacy, and two people who are not demo ----------
    foreach (demo_all_user_emails() as $i => $email) {
        $seed('users', ['id' => demo_user_id_for_email($email), 'name' => 'Demo ' . $i, 'email' => $email, 'password_hash' => 'x', 'role' => 'admin'], false);
        $db->seedRow('user_passkeys', ['user_id' => demo_user_id_for_email($email), 'name' => 'Laptop', 'credential_id' => 'cred-' . $i, 'credential' => '{}']);
    }
    $db->seedRow('user_remember_tokens', ['user_id' => demo_user_id_for_email('alex@crm.com'), 'selector' => 'sel-demo-00000000000000', 'validator_hash' => str_repeat('a', 64), 'created_at' => '2026-01-01 00:00:00', 'expires_at' => '2027-01-01 00:00:00']);
    $seed('users', ['id' => 'u-hand-made', 'name' => 'Real Person', 'email' => 'real.person@acme.example', 'password_hash' => 'x', 'role' => 'project_manager'], true);
    $seed('user_passkeys', ['user_id' => 'u-hand-made', 'name' => 'Phone', 'credential_id' => 'cred-real', 'credential' => '{}'], true);
    $seed('user_remember_tokens', ['user_id' => 'u-hand-made', 'selector' => 'sel-real-000000000000000', 'validator_hash' => str_repeat('b', 64), 'created_at' => '2026-01-01 00:00:00', 'expires_at' => '2027-01-01 00:00:00'], true);

    // --- leads / clients: demo-, legacy and a user's own ------------------------------------------------
    foreach (['demo-clients-1', 'demo-clients-7', 'lead-1', 'lead-3'] as $id) $seed('leads', ['id' => $id], false);
    foreach (['lead-1722222222', 'client-acme', 'my-demo-lead', 'leads-1'] as $id) $seed('leads', ['id' => $id], true);
    $seed('lead_categories', ['lead_id' => 'lead-2', 'category_name' => 'Products'], false);
    $seed('lead_categories', ['lead_id' => 'demo-clients-1', 'category_name' => 'Products'], false);
    $seed('lead_categories', ['lead_id' => 'lead-1722222222', 'category_name' => 'Services'], true);
    foreach (['demo-tasks-1', 'task-1', 'task-2'] as $id) $seed('tasks', ['id' => $id], false);
    foreach (['task-1722222222', 'task-4'] as $id) $seed('tasks', ['id' => $id], true);
    foreach (['ev-1', 'email-10412', 'demo-timeline-3'] as $id) $seed('timeline_events', ['id' => $id], false);
    $seed('timeline_events', ['id' => 'ev-1722222222', 'lead_id' => 'lead-1722222222'], true);

    // --- legacy staff, warehouse, orders: ids with LIKE patterns and an id that holds '_' --------------
    foreach (['emp-1', 'emp-4', 'demo-employees-2'] as $id) $seed('employees', ['id' => $id], false);
    $seed('employees', ['id' => 'emp-5'], true);
    $plant('employees', ['id' => 'emp-1722222222', 'user_id' => demo_user_id_for_email('alex@crm.com')]);
    $mine['employees'][] = ['id' => 'emp-1722222222'];   // kept, but its user_id is cleared
    $seed('financial_records', ['id' => 'fr-sal-sal-emp-1-2026-01'], false);
    $seed('financial_records', ['id' => 'fr-sal-demo-employees-sal-1'], false);
    $seed('financial_records', ['id' => 'fr-sal-sal-hand-made'], true);
    $seed('financial_records', ['id' => 'fr-1722222222'], true);
    $seed('warehouses', ['id' => 'wh-1'], false);
    $seed('warehouses', ['id' => 'wh-3'], true);
    $seed('orders', ['id' => 'ord-demo-3'], false);
    $seed('orders', ['id' => 'ord-1722222222'], true);
    $seed('tickets', ['id' => 'tck-demo-1'], false);
    $seed('tickets', ['id' => 'tck-1722222222'], true);
    // 'pt_luxury_stone' is an exact legacy id; 'ptXluxuryXstone' must not match it as a LIKE pattern would.
    $plant('project_types', ['id' => 'pt_luxury_stone']);
    $seed('project_types', ['id' => 'ptXluxuryXstone'], true);

    // --- WhatsApp numbers, mail caches ------------------------------------------------------------------
    $seed('whatsapp_numbers', ['phone_digits' => '421903245118', 'status' => 'registered', 'checked_at' => '2026-01-01 00:00:00'], false);
    $seed('whatsapp_numbers', ['phone_digits' => '421911000999', 'status' => 'registered', 'checked_at' => '2026-01-01 00:00:00'], true);
    $seed('email_summaries', ['user_email' => 'alex@crm.com', 'folder' => 'INBOX', 'email_uid' => '1'], false);
    $seed('email_summaries', ['user_email' => 'real.person@acme.example', 'folder' => 'INBOX', 'email_uid' => '2'], true);

    // --- SAI: a demo and a user simulation, built with the real SwarmManager (sharded tables) -------------
    $mgr = new \CCRM\Swarm\SwarmManager($db);
    foreach (['demo-sai-1', 'sai-demo-1'] as $simId) {
        $mgr->createSimulation(['id' => $simId, 'title' => 'Demo ' . $simId, 'status' => 'completed']);
    }
    $mgr->createSimulation(['id' => 'sim_hand_made', 'title' => 'My rehearsal', 'status' => 'draft']);
    $mine['swarm_simulations'][] = ['id' => 'sim_hand_made'];
    $db->seedRow('simdemosai1_nodes', ['id' => 'n1', 'entity_name' => 'x', 'entity_type' => 'person', 'summary' => 's']);
    $db->seedRow('simsim_hand_made_nodes', ['id' => 'n1', 'entity_name' => 'mine', 'entity_type' => 'person', 'summary' => 's']);
    $mine['simsim_hand_made_nodes'][] = ['id' => 'n1'];

    // --- project types: pure demo types (tables go), and a demo type a user added a project to ---------------
    // The per-type tables are named after the id with everything but [a-z0-9_] removed (sync.php).
    $typeTables = static function (string $typeId) use ($db): string {
        $safe = preg_replace('/[^a-z0-9_]/', '', strtolower($typeId));
        foreach (['proj_data_', 'proj_timeline_', 'proj_gantt_'] as $kind) {
            $db->exec("CREATE TABLE IF NOT EXISTS `{$kind}{$safe}` (`id` VARCHAR(50) NOT NULL PRIMARY KEY, `project_id` VARCHAR(50) NOT NULL)");
        }
        return $safe;
    };
    $safe = $typeTables('demo-projects-0');
    $plant('project_types', ['id' => 'demo-projects-0']);
    $db->seedRow('proj_data_' . $safe, ['id' => 'pd-1', 'project_id' => 'demo-projects-1']);
    $safe = $typeTables('pt_luxury_stone');                       // the legacy type; its project is a legacy id
    $db->seedRow('proj_data_' . $safe, ['id' => 'pd-2', 'project_id' => 'proj-vila-slavin']);
    $safe = $typeTables('demo-projects-9');                       // a demo type that holds a user's project too
    $plant('project_types', ['id' => 'demo-projects-9']);
    $db->seedRow('proj_data_' . $safe, ['id' => 'row-9a', 'project_id' => 'demo-projects-3']);
    $seed('proj_data_' . $safe, ['id' => 'row-9b', 'project_id' => 'proj-real-2'], true);
    $seed('project_types', ['id' => 'pt_hand_made'], true);
    $db->exec("CREATE TABLE IF NOT EXISTS `proj_data_pt_hand_made` (`id` VARCHAR(50) NOT NULL PRIMARY KEY, `project_id` VARCHAR(50) NOT NULL)");
    $seed('proj_data_pt_hand_made', ['id' => 'row-1', 'project_id' => 'proj-real-1'], true);
    return [$db, $mine];
}

// =================================================================================================
$section('demo_wipe_demo_rows: demo rows go, a user\'s rows stay');
// =================================================================================================
demo_ctx_force('sk', 'EUR');
try {
    [$db, $mine] = wipe_fixture();
} catch (\Throwable $e) {
    echo 'FAIL fixture: ' . $e->getMessage() . "\n";
    exit(1);
}
$before = $allRows($db);
$counts = demo_wipe_demo_rows($db);
$after = $allRows($db);
if ($verbose) { echo "wiped:\n"; foreach ($counts as $t => $n) echo "       {$t}: {$n}\n"; }

$lost = [];
foreach ($mine as $table => $rows) {
    foreach ($rows as $row) {
        $found = false;
        foreach ($db->rows($table) as $r) {
            $ok = true;
            foreach ($row as $c => $v) if (!array_key_exists($c, $r) || $r[$c] !== $v) { $ok = false; break; }
            if ($ok) { $found = true; break; }
        }
        if (!$found) $lost[] = $table . ' ' . json_encode($row);
    }
}
$check('every row a user made is still there (' . array_sum(array_map('count', $mine)) . ' rows in ' . count($mine) . ' tables)', !$lost, implode("\n", $lost));
$check('lookalikes survive: lead \'my-demo-lead\', \'leads-1\', project type \'ptXluxuryXstone\' (an exact id is never a LIKE pattern)',
    in_array('my-demo-lead', $ids($db, 'leads'), true) && in_array('leads-1', $ids($db, 'leads'), true) && in_array('ptXluxuryXstone', $ids($db, 'project_types'), true));

$leftDemo = [];
foreach ($db->tablesWithRows() as $t) {
    foreach ($db->rows($t) as $r) {
        foreach (['id', 'lead_id', 'task_id', 'project_id'] as $c) {
            if (isset($r[$c]) && is_string($r[$c]) && strpos($r[$c], 'demo-') === 0) $leftDemo[] = "{$t}.{$c} = {$r[$c]}";
        }
    }
}
$check('no id with the demo- prefix is left (outside the table a user\'s project keeps alive)', !$leftDemo, implode("\n", $leftDemo));
$gone = static function (string $table, array $wantGone, string $col = 'id') use ($db, $ids): array {
    return array_values(array_intersect($wantGone, $ids($db, $table, $col)));
};
$check('legacy ids are gone: leads lead-1/3, tasks task-1/2, employees emp-1/4, wh-1, ord-demo-3, tck-demo-1, ev-1, email-10412',
    !$gone('leads', ['lead-1', 'lead-3']) && !$gone('tasks', ['task-1', 'task-2']) && !$gone('employees', ['emp-1', 'emp-4']) && !$gone('warehouses', ['wh-1'])
    && !$gone('orders', ['ord-demo-3']) && !$gone('tickets', ['tck-demo-1']) && !$gone('timeline_events', ['ev-1', 'email-10412']) && !$gone('project_types', ['pt_luxury_stone']));
$check('join rows of a demo lead go (lead_categories on lead-2 / demo-clients-1), a user\'s stay', $ids($db, 'lead_categories', 'lead_id') === ['lead-1722222222']);
$check('derived expense records of demo salaries go (fr-sal-sal-emp-*, fr-sal-demo-*), a hand-made salary record stays',
    !$gone('financial_records', ['fr-sal-sal-emp-1-2026-01', 'fr-sal-demo-employees-sal-1']) && in_array('fr-sal-sal-hand-made', $ids($db, 'financial_records'), true));

$check('all 12 demo logins of the three editions + legacy are deleted, with passkeys and remember tokens',
    array_values(array_diff($ids($db, 'users'), ['u-hand-made'])) === [] && $ids($db, 'user_passkeys', 'user_id') === ['u-hand-made'] && $ids($db, 'user_remember_tokens', 'user_id') === ['u-hand-made']);
$check('a hand-made login survives, and so do its passkey and remember token', $ids($db, 'users') === ['u-hand-made']);
$empUser = null;
foreach ($db->rows('employees') as $r) if ($r['id'] === 'emp-1722222222') $empUser = $r['user_id'];
$check('an employee a user hired, linked to a demo login: kept, user_id set to NULL (ON DELETE SET NULL by hand)', $empUser === null);
$check('demo WhatsApp number removed, a hand-made number stays', $ids($db, 'whatsapp_numbers', 'phone_digits') === ['421911000999']);
$check('cached mail data of the demo logins goes, a real user\'s stays', $ids($db, 'email_summaries', 'user_email') === ['real.person@acme.example']);

$simIds = $ids($db, 'swarm_simulations');
$check('demo simulations (demo-sai-1 and the legacy sai-demo-1) deleted, the user\'s kept', $simIds === ['sim_hand_made'], implode(',', $simIds));
$check('sim<id>_* tables of the demo simulations are dropped, the user\'s are kept',
    !$db->hasTable('simdemosai1_nodes') && !$db->hasTable('simdemosai1_edges') && !$db->hasTable('simdemosai1_agents') && !$db->hasTable('simdemosai1_posts')
    && !$db->hasTable('simsaidemo1_nodes') && $db->hasTable('simsim_hand_made_nodes') && count($db->rows('simsim_hand_made_nodes')) === 1);
$check('demo project types (demo-projects-0, the legacy pt_luxury_stone) and their proj_* tables are gone; a user\'s type stays',
    !$db->hasTable('proj_data_demoprojects0') && !$db->hasTable('proj_timeline_demoprojects0') && !$db->hasTable('proj_gantt_demoprojects0') && !$db->hasTable('proj_data_pt_luxury_stone')
    && in_array('pt_hand_made', $ids($db, 'project_types'), true) && $db->hasTable('proj_data_pt_hand_made') && count($db->rows('proj_data_pt_hand_made')) === 1);
$check('a demo type\'s table that holds a user\'s project is NOT dropped; only its demo rows go',
    $db->hasTable('proj_data_demoprojects9') && $ids($db, 'proj_data_demoprojects9') === ['row-9b']);

// The reported counts equal what really disappeared (rows of dropped tables included).
$removed = count(array_diff($before, $after));
$changed = 0;
// An UPDATE (employees.user_id -> NULL) shows up as one removed + one added string: do not count the new one.
foreach ($after as $row) if (!in_array($row, $before, true)) $changed++;
$check('the returned counts add up to the rows that disappeared', array_sum($counts) === $removed - $changed, 'counts sum ' . array_sum($counts) . ', removed ' . $removed . ', rewritten ' . $changed);
$check('counts are per table: leads, users, tasks, whatsapp_numbers, swarm_simulations are reported',
    ($counts['leads'] ?? 0) === 4 && ($counts['users'] ?? 0) === 12 && ($counts['tasks'] ?? 0) === 3 && ($counts['whatsapp_numbers'] ?? 0) === 1 && ($counts['swarm_simulations'] ?? 0) === 2, json_encode($counts));
$check('nothing is reported for a table the wipe did not touch', !isset($counts['lead_categories']) || $counts['lead_categories'] === 2);
$check('settings are never touched by the wipe (the hand-made one, DEMO_MODE)', ($db->settings()['HAND_MADE_SETTING'] ?? '') === 'keep me' && $db->settings()['DEMO_MODE'] === 'true');

$again = demo_wipe_demo_rows($db);
$check('idempotent: a second wipe removes nothing and changes nothing', $again === [] && $allRows($db) === $after, json_encode($again));
$db->beginTransaction();
$check('refuses to run inside a transaction (its DDL step commits implicitly)', $throws(fn() => demo_wipe_demo_rows($db), 'outside a transaction'));
$db->rollBack();

$bareDb = new DemoFakePdo();
$bareDb->setSetting('DEMO_MODE', 'true');
$check('an empty database: nothing to wipe, no error', demo_wipe_demo_rows($bareDb) === []);

// =================================================================================================
$section('demo_reseed_run: language, currency, logins');
// =================================================================================================
$ported = [];
foreach (demo_seed_modules() as $module) {
    $packs = 0;
    foreach (['sk', 'hu', 'en'] as $l) if (demo_pack_exists($l, $module)) $packs++;
    if (is_file(dirname(__DIR__) . "/public/api/demo_seed/{$module}.php") && $packs === 3) $ported[] = $module;
}
echo 'seeding the modules that have code and three packs: ' . implode(', ', $ported) . "\n";

[$db] = wipe_fixture();
$db->setSetting('LEAD_STATES', '["my own stage"]');
$db->setSetting('DIVISIONS', '["Hand made division"]');
$sk = demo_company_pack('sk');
$hu = demo_company_pack('hu');
$en = demo_company_pack('en');
$emails = static fn(array $pack): array => array_map(static fn($u) => strtolower($u['email']), array_values($pack['users']));
$loginEmails = static fn(DemoFakePdo $d): array => array_values(array_map(static fn($r) => $r['email'], $d->rows('users')));
sort($ported);

$run = demo_reseed_run($db, ['language' => 'hu', 'currency' => 'EUR', 'resetCompany' => true, 'only' => $ported]);
$logins = $loginEmails($db);
sort($logins);
$expected = array_merge($emails($hu), ['real.person@acme.example']);
sort($expected);
$check('hu/EUR: the demo logins of the old install are replaced by the Hungarian three, a real login stays', $logins === $expected, json_encode($logins));
$check('the response carries the new logins (role, name, e-mail) and the password',
    count($run['logins']) === 3 && $run['logins'][0]['email'] === $hu['users']['owner']['email'] && $run['logins'][0]['name'] === $hu['users']['owner']['name'] && $run['password'] === 'password' && $run['loginsReady'] === true, json_encode($run['logins']));
$check('SYSTEM_LANGUAGE and SYSTEM_CURRENCY are written (hu, EUR)', ($db->settings()['SYSTEM_LANGUAGE'] ?? '') === 'hu' && ($db->settings()['SYSTEM_CURRENCY'] ?? '') === 'EUR');
$check('resetCompany on: the pipeline lists are rewritten in the new language, the divisions come from the edition',
    ($db->settings()['LEAD_STATES'] ?? '') !== '["my own stage"]' && strpos($db->settings()['LEAD_STATES'] ?? '', 'Új') !== false || stripos($db->settings()['LEAD_STATES'] ?? '', 'új') !== false);
$check('...and DIVISIONS is the edition\'s two, COMPANY_BILLING_SETTINGS the Hungarian company',
    json_decode($db->settings()['DIVISIONS'] ?? '[]', true) === array_map(static fn($d) => $d['name'], $hu['divisions'])
    && json_decode($db->settings()['COMPANY_BILLING_SETTINGS'] ?? '{}', true)['companyName'] === $hu['company']['name']);
// The demo login picker is the unauthenticated sync.php answer: `SELECT ... FROM users ORDER BY name`
// (public/sync.php, the `$sessionUser === null && DEMO_MODE` branch). It lists whatever is in `users`.
$picker = array_map(static fn($r) => $r['name'], $db->query("SELECT `id`, `name`, `email`, `role`, `avatar`, `color` FROM `users` ORDER BY `name` ASC")->fetchAll(PDO::FETCH_ASSOC));
$expectedPicker = array_merge(array_map(static fn($u) => $u['name'], array_values($hu['users'])), ['Real Person']);
sort($expectedPicker);
$check('the demo login picker query lists exactly the new edition\'s names (and the real user), none of the old', $picker === $expectedPicker, json_encode($picker));
$check('every module of the run reported ok', $run['failed'] === [] && !array_diff($ported, array_keys(array_filter($run['report'], static fn($r) => !empty($r['ok']) && empty($r['skipped'])))), json_encode($run['failed']));
$ds = json_decode($db->settings()['DEMO_DATASET'] ?? 'null', true);
$check('DEMO_DATASET describes the run (version, hu, EUR)', is_array($ds) && $ds['version'] === DEMO_DATASET_VERSION && $ds['language'] === 'hu' && $ds['currency'] === 'EUR');
$check('a hand-made setting and a hand-made lead survive the re-seed', ($db->settings()['HAND_MADE_SETTING'] ?? '') === 'keep me' && in_array('lead-1722222222', $ids($db, 'leads'), true) && in_array('u-hand-made', $ids($db, 'users'), true));
$check('the wipe\'s per-table counts are in the response', ($run['wiped']['leads'] ?? 0) === 4 && ($run['wiped']['users'] ?? 0) === 12);

// Second run, another edition: hu -> en/USD, keep the company (resetCompany off).
$db->setSetting('LEAD_STATES', '["my own stage"]');
$db->setSetting('DIVISIONS', '["Hand made division"]');
$run2 = demo_reseed_run($db, ['language' => 'en', 'currency' => 'USD', 'resetCompany' => false, 'only' => $ported]);
$logins = $loginEmails($db);
sort($logins);
$expected = array_merge($emails($en), ['real.person@acme.example']);
sort($expected);
$check('en/USD: the Hungarian three are gone, the English three exist', $logins === $expected, json_encode($logins));
$check('resetCompany OFF: lists, divisions and the company profile are not rewritten',
    ($db->settings()['LEAD_STATES'] ?? '') === '["my own stage"]' && ($db->settings()['DIVISIONS'] ?? '') === '["Hand made division"]'
    && json_decode($db->settings()['COMPANY_BILLING_SETTINGS'] ?? '{}', true)['companyName'] === $hu['company']['name']);
$check('...but language and currency are switched (the data is seeded in them)', ($db->settings()['SYSTEM_LANGUAGE'] ?? '') === 'en' && ($db->settings()['SYSTEM_CURRENCY'] ?? '') === 'USD' && json_decode($db->settings()['DEMO_DATASET'], true)['currency'] === 'USD');
$idempotentDiff = [];
$check('a second re-seed in the same edition leaves the same rows (idempotent)', (function () use ($db, $ported, $allRows, &$idempotentDiff) {
    $first = $allRows($db);
    $again = demo_reseed_run($db, ['language' => 'en', 'currency' => 'USD', 'resetCompany' => false, 'only' => $ported]);
    $second = $allRows($db);
    // DEMO_DATASET carries a timestamp and password hashes are salted: compare everything else.
    // created_at / updated_at that the database stamped with the clock (a value within two minutes of
    // now) differ between two runs by definition once a run crosses a second, and sixteen modules do.
    // They are replaced by a marker; a SEEDED timestamp (days ago, a fixed hour) is still compared exactly.
    // Row counts still have to match, so a module that duplicates rows is still caught.
    $clock = static function (string $row): string {
        [$table, $json] = explode('|', $row, 2);
        $cols = json_decode($json, true);
        if (!is_array($cols)) return $row;
        // An AUTO_INCREMENT surrogate id (whatsapp_links.id) is renumbered by every delete + insert.
        if (isset($cols['id']) && is_int($cols['id'])) {
            $cols['id'] = '<auto>';
        }
        // The demo browser device carries a random, never-usable key (C10), like a salted password hash.
        if ($table === 'time_tracker_devices') {
            foreach (['key_hash', 'key_prefix'] as $c) {
                if (isset($cols[$c])) $cols[$c] = '<random>';
            }
        }
        foreach (['created_at', 'updated_at'] as $c) {
            if (isset($cols[$c]) && is_string($cols[$c]) && ($ts = strtotime($cols[$c])) !== false && abs($ts - time()) <= 120) {
                $cols[$c] = '<clock>';
            }
        }
        return $table . '|' . json_encode($cols);
    };
    $strip = static fn(array $rows): array => array_values(array_map($clock, array_filter($rows, static fn($r) => strpos($r, 'system_settings|{"key":"DEMO_DATASET"') !== 0 && strpos($r, 'users|') !== 0)));
    $a = $strip($first);
    $b = $strip($second);
    // Name the columns that differ, not the whole row: a row is "table|{json}".
    $onlyBefore = array_values(array_diff($a, $b));
    $onlyAfter = array_values(array_diff($b, $a));
    $describe = static function (string $row) {
        [$table, $json] = explode('|', $row, 2);
        return [$table, json_decode($json, true) ?: []];
    };
    $lines = [];
    foreach (array_slice($onlyBefore, 0, 12) as $row) {
        [$table, $before] = $describe($row);
        $match = null;
        foreach ($onlyAfter as $other) {
            [$t2, $after] = $describe($other);
            if ($t2 === $table && ($after['id'] ?? $after['email_uid'] ?? null) === ($before['id'] ?? $before['email_uid'] ?? null)) { $match = $after; break; }
        }
        if ($match === null) {
            $lines[] = "{$table}: row " . ($before['id'] ?? $before['email_uid'] ?? '?') . ' is gone after the second re-seed';
            continue;
        }
        $cols = array_keys(array_filter($before, static fn($v, $k) => ($match[$k] ?? null) !== $v, ARRAY_FILTER_USE_BOTH));
        $lines[] = "{$table}: row " . ($before['id'] ?? $before['email_uid'] ?? '?') . ' differs in ' . implode(', ', $cols);
    }
    foreach (array_slice($onlyAfter, 0, 4) as $row) {
        [$table, $after] = $describe($row);
        $hit = false;
        foreach ($onlyBefore as $other) {
            [$t2, $before] = $describe($other);
            if ($t2 === $table && ($after['id'] ?? $after['email_uid'] ?? null) === ($before['id'] ?? $before['email_uid'] ?? null)) { $hit = true; break; }
        }
        if (!$hit) { $lines[] = "{$table}: new row " . ($after['id'] ?? $after['email_uid'] ?? '?') . ' after the second re-seed'; }
    }
    $idempotentDiff = array_merge($lines, array_map(static fn($m) => 'module failed: ' . $m, array_keys($again['failed'] ?? [])));
    return $a === $b;
})(), implode("\n       ", $idempotentDiff));

$check('forceDemoMode (the CLI --force) switches DEMO_MODE on', (function () {
    $d = new DemoFakePdo();
    $d->setSetting('DEMO_MODE', 'false');
    demo_reseed_run($d, ['language' => 'sk', 'currency' => 'EUR', 'only' => ['company'], 'forceDemoMode' => true]);
    return $d->settings()['DEMO_MODE'] === 'true';
})());

// =================================================================================================
$section('guards and status');
// =================================================================================================
$off = new DemoFakePdo();
$off->setSetting('DEMO_MODE', 'false');
$check('refused unless DEMO_MODE is on (not_demo_mode); --force overrides it', demo_reseed_refusal($off) === 'not_demo_mode' && demo_reseed_refusal($off, true) === null && demo_reseed_refusal(new DemoFakePdo()) === null);
$noSetting = new DemoFakePdo();
$noSetting->exec("DELETE FROM `system_settings` WHERE `key` = 'DEMO_MODE'");
$check('a missing DEMO_MODE setting is "off"', demo_reseed_refusal($noSetting) === 'not_demo_mode');
$bad = static function (array $in): string { try { demo_reseed_validate($in); } catch (\InvalidArgumentException $e) { return $e->getMessage(); } return 'ok'; };
$check('validation: language sk|hu|en, currency EUR|HUF|CZK|PLN|USD|GBP, resetCompany defaults on',
    $bad(['language' => 'de', 'currency' => 'EUR']) === 'invalid_language' && $bad(['currency' => 'EUR']) === 'invalid_language'
    && $bad(['language' => 'hu', 'currency' => 'JPY']) === 'invalid_currency' && $bad(['language' => 'hu']) === 'invalid_currency'
    && $bad(['language' => 'hu', 'currency' => 'huf']) === 'ok' && demo_reseed_validate(['language' => 'hu', 'currency' => 'huf']) === ['hu', 'HUF', true]
    && demo_reseed_validate(['language' => 'sk', 'currency' => 'EUR', 'resetCompany' => false])[2] === false);
$check('an unknown language does not wipe anything: the pack must load first', (function () use ($db, $allRows) {
    $snapshot = $allRows($db);
    try { demo_reseed_run($db, ['language' => 'xx', 'currency' => 'EUR']); return false; } catch (\Throwable $e) { return $allRows($db) === $snapshot; }
})());

$old = new DemoFakePdo();   // an install seeded before DEMO_DATASET existed
$status = demo_reseed_status($old);
$check('status on an old install: no dataset, outdated, every module missing', $status['demoMode'] === true && $status['dataset'] === null && $status['outdated'] === true && $status['missing'] === demo_seed_modules() && $status['currentVersion'] === DEMO_DATASET_VERSION);
$check('status lists what this code cannot seed yet as `unavailable`, so the UI only names what a re-seed adds',
    array_values(array_diff($status['modules'], $status['unavailable'])) === demo_seed_modules_installed());
$new = new DemoFakePdo();
demo_reseed_run($new, ['language' => 'en', 'currency' => 'USD', 'only' => $ported]);
$s2 = demo_reseed_status($new);
$check('status after a re-seed: dataset present, language/currency read back, not outdated',
    $s2['dataset'] !== null && $s2['language'] === 'en' && $s2['currency'] === 'USD' && $s2['outdated'] === false && !array_intersect($s2['missing'], $ported));
$new->setSetting('DEMO_DATASET', json_encode(['version' => DEMO_DATASET_VERSION - 1, 'language' => 'sk', 'currency' => 'EUR', 'modules' => ['company' => 5]]));
$s3 = demo_reseed_status($new);
$check('status with an older dataset version: outdated, the modules it lacks are missing', $s3['outdated'] === true && in_array('time', $s3['missing'], true) && !in_array('company', $s3['missing'], true));

$probe = new DemoFakePdo();   // no DEMO_DATASET, but the pre-pack and clients/tasks modules left their demo- rows
$probe->seedRow('leads', ['id' => 'demo-clients-1', 'name' => 'x', 'owner' => 'o', 'created_at' => '2026-01-01 00:00:00']);
$probe->seedRow('tasks', ['id' => 'demo-tasks-4', 'title' => 'x', 'deadline' => '2026-01-01 00:00:00', 'owner' => 'o']);
$probe->seedRow('timeline_events', ['id' => 'demo-mail-3', 'lead_id' => 'demo-clients-1', 'title' => 'x', 'timestamp' => '2026-01-01 00:00:00']);
$probe->seedRow('tasks', ['id' => 'task-1', 'title' => 'legacy', 'deadline' => '2026-01-01 00:00:00', 'owner' => 'o']);
$sp = demo_reseed_status($probe);
$check('an install without DEMO_DATASET is probed for demo- rows: clients, tasks and email are present, the rest is missing',
    $sp['dataset'] === null && !array_intersect(['clients', 'tasks', 'email'], $sp['missing']) && !array_diff(['company', 'employees', 'time', 'tickets', 'meetings', 'workflows', 'sai', 'projects'], $sp['missing']), json_encode($sp['missing']));

// =================================================================================================
$section('php ccrm demo:seed (demo_reseed_cli)');
// =================================================================================================
echo "(the lines on stderr below are the refusals the checks provoke)\n";
$cli = static function (DemoFakePdo $d, array $args): array { ob_start(); $code = demo_reseed_cli($d, $args); return [$code, (string)ob_get_clean()]; };
[$cliDb] = wipe_fixture();
[$code, $out] = $cli($cliDb, ['--lang=hu', '--currency=EUR', '--only=company']);
$check('--lang=hu --currency=EUR: exit 0, prints the logins and the password', $code === 0 && strpos($out, 'kollar.andras@lapidea.example') !== false && strpos($out, 'password: password') !== false && strpos($out, 'company') !== false, $out);
$check('...and the install is now hu/EUR with the Hungarian logins (the old ones replaced)', ($cliDb->settings()['SYSTEM_LANGUAGE'] ?? '') === 'hu' && ($cliDb->settings()['SYSTEM_CURRENCY'] ?? '') === 'EUR' && !in_array('alex@crm.com', $loginEmails($cliDb), true));
[$code, $out] = $cli($cliDb, ['--lang=en', '--only=company']);
$check('a new --lang alone takes that language\'s default currency (en -> USD)', $code === 0 && ($cliDb->settings()['SYSTEM_CURRENCY'] ?? '') === 'USD' && ($cliDb->settings()['SYSTEM_LANGUAGE'] ?? '') === 'en');
[$code] = $cli($cliDb, ['--only=company']);
$check('no options at all re-seeds in the installed language and currency', $code === 0 && ($cliDb->settings()['SYSTEM_LANGUAGE'] ?? '') === 'en' && ($cliDb->settings()['SYSTEM_CURRENCY'] ?? '') === 'USD');
$cliDb->setSetting('DIVISIONS', '["Mine"]');
$cli($cliDb, ['--keep-company', '--only=company']);
$check('--keep-company leaves the divisions alone', ($cliDb->settings()['DIVISIONS'] ?? '') === '["Mine"]');

[$offDb] = wipe_fixture();
$offDb->setSetting('DEMO_MODE', 'false');
$beforeOff = $allRows($offDb);
[$code] = $cli($offDb, ['--lang=hu', '--only=company']);
$check('refused without DEMO_MODE (exit 1) and nothing is deleted', $code === 1 && $allRows($offDb) === $beforeOff);
[$code] = $cli($offDb, ['--lang=hu', '--currency=EUR', '--only=company', '--force']);
$check('--force overrides it, wipes, and switches DEMO_MODE on', $code === 0 && $offDb->settings()['DEMO_MODE'] === 'true' && count(array_filter($offDb->rows('users'), static fn($u) => $u['email'] === 'alex@crm.com')) === 0);
[$code] = $cli($cliDb, ['--lang=de']);
$check('an invalid language exits 2 before anything is touched', $code === 2);
[$code] = $cli($cliDb, ['--currency=JPY']);
$check('an invalid currency exits 2', $code === 2);
[$code] = $cli($cliDb, ['--bogus']);
$check('an unknown option exits 2', $code === 2);

// =================================================================================================
$section('demo_leave_demo_mode: Settings > Wipe demo data (api/wipe_demo.php) - the clean slate');
// =================================================================================================
require_once dirname(__DIR__) . '/public/api/demo_seed/leave.php';
// A whole demo installed (every module that has code and three packs), plus one row a user made in every
// table the clean slate empties - cloned from a seeded row, so every NOT NULL column is satisfied.
// The tables the clean slate must empty, written out here on purpose: the test must not read the list it checks.
$cleanSlateTables = [
    'order_items', 'orders', 'invoice_offer_items', 'invoices_offers',
    'warehouse_movement_items', 'warehouse_movements', 'warehouse_batches', 'warehouse_stock', 'warehouse_items', 'warehouses', 'suppliers',
    'project_managers', 'projects', 'employee_vacations', 'employee_salaries', 'employees',
    'timeline_events', 'lead_categories', 'leads', 'task_assignees', 'tasks', 'financial_records',
    'ticket_messages', 'ticket_time_entries', 'ticket_task_links', 'tickets', 'support_contracts', 'time_entries', 'time_activity', 'workflow_logs',
];
$leaveFixture = static function () use ($ported, $cleanSlateTables): DemoFakePdo {
    [$d] = wipe_fixture();
    demo_reseed_run($d, ['language' => 'hu', 'currency' => 'EUR', 'resetCompany' => true, 'only' => $ported]);
    $d->setSetting('DEMO_MODE', 'true');
    foreach ($cleanSlateTables as $table) {
        $first = $d->rows($table)[0] ?? null;
        if ($first === null) continue;
        $mine = $first;
        unset($mine['running_guard']);          // a generated column: MySQL computes it, a write is an error
        foreach (['id', 'order_number', 'ticket_number', 'invoice_number', 'code'] as $c) {
            if (isset($mine[$c]) && is_string($mine[$c])) $mine[$c] = 'hand-made-' . $table;
        }
        if (isset($mine['id']) && is_string($mine['id'])) {
            $d->seedRow($table, $mine);
        }
    }
    return $d;
};
$cleanTables = $cleanSlateTables;
$mustHaveRows = ['leads', 'tasks', 'projects', 'employees', 'financial_records', 'warehouses', 'invoices_offers', 'orders', 'tickets', 'ticket_messages', 'support_contracts', 'time_entries', 'time_activity', 'workflow_logs'];

$ld = $leaveFixture();
$emptyBefore = array_values(array_filter($mustHaveRows, static fn($t) => count($ld->rows($t)) === 0));
$check('the fixture is a whole demo: every table the clean slate empties has rows, among them the five the endpoint used to miss',
    !$emptyBefore, 'empty before: ' . implode(', ', $emptyBefore));
$handMade = array_values(array_filter($mustHaveRows, static fn($t) => count(array_filter($ld->rows($t), static fn($r) => strpos((string)($r['id'] ?? ''), 'hand-made-') === 0)) > 0));
$check('...and a row a user made sits in most of them (tickets, time entries, workflow logs included)',
    count($handMade) >= 10 && in_array('tickets', $handMade, true) && in_array('time_entries', $handMade, true) && in_array('workflow_logs', $handMade, true), implode(', ', $handMade));

$keepLogins = $ld->rows('users');
$keepIds = array_map(static fn($u) => $u['id'], $keepLogins);
$res = demo_leave_demo_mode($ld, true);
$leftover = array_values(array_filter($cleanTables, static fn($t) => count($ld->rows($t)) > 0));
$check('keep configs: every transactional table is empty, user rows included (a clean slate), tickets / contracts / time / workflow logs too',
    !$leftover, 'still has rows: ' . implode(', ', $leftover));
$check('keep configs: every login stays (the admin who clicked is one of the demo logins) and so does a hand-made one',
    array_map(static fn($u) => $u['id'], $ld->rows('users')) === $keepIds && in_array('u-hand-made', $keepIds, true) && $res['adminPassword'] === null);
$check('keep configs: DEMO_MODE is false, DEMO_DATASET is gone, settings and lists stay',
    ($ld->settings()['DEMO_MODE'] ?? '') === 'false' && !array_key_exists('DEMO_DATASET', $ld->settings()) && ($ld->settings()['HAND_MADE_SETTING'] ?? '') === 'keep me' && ($ld->settings()['SYSTEM_CURRENCY'] ?? '') === 'EUR');
$demoLeft = [];
foreach ($ld->tablesWithRows() as $t) foreach ($ld->rows($t) as $r) foreach (['id', 'lead_id', 'task_id', 'project_id', 'workflow_id', 'ticket_id'] as $c) {
    if (isset($r[$c]) && is_string($r[$c]) && strpos($r[$c], 'demo-') === 0) $demoLeft[] = "{$t}.{$c} = {$r[$c]}";
}
$demoTypesLeft = array_filter($ld->rows('project_types'), static fn($r) => strpos((string)$r['id'], 'demo-') === 0);
$check('keep configs: no demo- id is left anywhere, no demo project type, simulation or WhatsApp number; a hand-made project type and WhatsApp number stay',
    !$demoLeft && !$demoTypesLeft && in_array('pt_hand_made', $ids($ld, 'project_types'), true) && count($ld->rows('swarm_simulations')) === 0 && $ids($ld, 'whatsapp_numbers', 'phone_digits') === ['421911000999'],
    implode("\n", array_merge(array_slice($demoLeft, 0, 8), ['types: ' . json_encode($ids($ld, 'project_types')), 'sims: ' . count($ld->rows('swarm_simulations')), 'numbers: ' . json_encode($ids($ld, 'whatsapp_numbers', 'phone_digits'))])));
$check('keep configs: the result reports what the demo wipe removed (demo WhatsApp numbers yes, logins none: they stay)',
    ($res['wiped']['whatsapp_numbers'] ?? 0) >= 1 && ($res['wiped']['users'] ?? 0) === 0, json_encode($res['wiped']));

// A second call on the emptied install changes nothing and does not fail; it refuses to run inside a transaction.
$snapshot = $allRows($ld);
$again = null;
try { $again = demo_leave_demo_mode($ld, true); } catch (\Throwable $e) { $again = $e->getMessage(); }
$check('idempotent: calling it again on the emptied install changes nothing', is_array($again) && $allRows($ld) === $snapshot, is_string($again) ? $again : '');
$ld->beginTransaction();
$check('refuses to run inside a transaction (it drops tables afterwards)', $throws(fn() => demo_leave_demo_mode($ld, true), 'outside a transaction'));
$ld->rollBack();

// The full reset: nothing of the old install is left but the language and the currency.
$fd = $leaveFixture();
$fd->setSetting('DIVISIONS', '["Hand made division"]');
$res = demo_leave_demo_mode($fd, false);
$users = $fd->rows('users');
$check('full reset: ONE login, admin@crm.com with a random password that is returned once, and every demo login, passkey and token is gone',
    count($users) === 1 && $users[0]['email'] === 'admin@crm.com' && $users[0]['role'] === 'admin' && is_string($res['adminPassword']) && strlen($res['adminPassword']) === 12
    && password_verify($res['adminPassword'], $users[0]['password_hash']) && !password_verify('password', $users[0]['password_hash'])
    && count($fd->rows('user_passkeys')) === 0 && count($fd->rows('user_remember_tokens')) === 0);
$settings = $fd->settings();
$check('full reset: settings are a fresh install\'s - DEMO_MODE false, no divisions, the hand-made setting and DEMO_DATASET gone, currency kept',
    ($settings['DEMO_MODE'] ?? '') === 'false' && ($settings['DIVISIONS'] ?? '') === '[]' && !isset($settings['HAND_MADE_SETTING']) && !isset($settings['DEMO_DATASET']) && ($settings['SYSTEM_CURRENCY'] ?? '') === 'EUR',
    json_encode(array_intersect_key($settings, array_flip(['DEMO_MODE', 'DIVISIONS', 'HAND_MADE_SETTING', 'DEMO_DATASET', 'SYSTEM_CURRENCY']))));
$leftover = array_values(array_filter(array_merge($cleanTables, ['financial_categories', 'project_types', 'client_categories', 'swarm_simulations']), static fn($t) => count($fd->rows($t)) > 0));
$check('full reset: transactional tables, finance categories, project types and simulations are empty', !$leftover, implode(', ', $leftover));

$warn = $db->warnings();
if ($warn) {
    echo 'WARN ' . count($warn) . " statement(s) the fake could not interpret (their result is unverified here):\n";
    foreach (array_slice($warn, 0, $verbose ? 50 : 5) as $w) echo '       - ' . $w . "\n";
}
echo "\n{$checks} checks, " . ($fails === 0 ? 'all passed.' : "{$fails} FAILED.") . "\n";
exit($fails === 0 ? 0 : 1);
