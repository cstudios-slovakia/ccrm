<?php
/**
 * Retired standalone demo seeder - now a thin call of the shared re-seed.
 *
 * It used to seed only the finance data. Demo data is now written (and replaced) by one
 * function, demo_reseed_run() in api/demo_reseed.php - the same one the installer's
 * demo seed, Settings > Reset data > Re-seed demo data and `php ccrm demo:seed` use - so
 * this script cannot drift from them. It is kept so existing runbooks do not break.
 *
 * Usage (from the repo root):  php api/seed_demo_data.php [--lang=hu] [--currency=EUR] [--force]
 * Same options as `php ccrm demo:seed`; with none it re-seeds in the installed language and
 * currency. Refuses to run unless the instance is in demo mode (DEMO_MODE = true);
 * --force overrides that. NOTE: like demo:seed it REPLACES the demo rows and the demo logins.
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

define('CCRM_DEMO_RESEED_LIB', true);
require_once __DIR__ . '/demo_reseed.php';

$pdo = get_db_connection();
ccrm_apply_schema($pdo);

fwrite(STDERR, "Note: api/seed_demo_data.php is retired; this is `php ccrm demo:seed`.\n");
try {
    exit(demo_reseed_cli($pdo, array_slice($argv, 1)));
} catch (\Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
