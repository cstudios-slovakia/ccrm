<?php
/**
 * Standalone demo seeder for the finance data.
 *
 * The data itself lives in api/demo_seed/finance.php — the same function the
 * demo installer calls — so this script and a fresh demo install cannot drift.
 * Finance records link to clients, projects, offers and warehouse receipts, so
 * those modules run first (each is idempotent and only touches its own
 * 'demo-%' rows).
 *
 * Usage (from the repo root):  php api/seed_demo_data.php [--force]
 *
 * Refuses to run unless the instance is in demo mode (DEMO_MODE = true);
 * --force overrides that.
 */

// CLI only. The repo root is the docroot on git-clone deploys, so without this
// an anonymous GET to /api/seed_demo_data.php seeded demo records into the
// live database.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script is CLI only.\n");
}

if (file_exists(__DIR__ . '/schema.php')) {
    require_once __DIR__ . '/schema.php';
} elseif (file_exists('/var/www/html/api/schema.php')) {
    require_once '/var/www/html/api/schema.php';
}

if (file_exists(dirname(__DIR__) . '/config.php')) {
    require_once dirname(__DIR__) . '/config.php';
} elseif (file_exists('/var/www/html/config.php')) {
    require_once '/var/www/html/config.php';
}

require_once __DIR__ . '/demo_seed/index.php';

$pdo = get_db_connection();
ccrm_apply_schema($pdo);

$demoMode = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'")->fetchColumn();
if ($demoMode !== 'true' && !in_array('--force', array_slice($argv, 1), true)) {
    fwrite(STDERR, "This instance is not in demo mode; refusing to seed demo data. Pass --force to override.\n");
    exit(1);
}

try {
    // The first version of this script wrote 'demo-fin-*' rows linked to leads that never existed.
    $pdo->exec("DELETE FROM `financial_records` WHERE `id` LIKE 'demo-fin-%'");

    foreach (['clients', 'projects', 'offers', 'warehouse', 'finance'] as $module) {
        require_once __DIR__ . '/demo_seed/' . $module . '.php';
        $fn = 'demo_seed_' . $module;
        demo_seed_run_module($pdo, $module, $fn);
        echo "  seeded {$module}\n";
    }

    $count = (int)$pdo->query("SELECT COUNT(*) FROM `financial_records` WHERE `id` LIKE 'demo-finance-%'")->fetchColumn();
    echo "SUCCESS: Seeded {$count} financial records.\n";
} catch (\Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
