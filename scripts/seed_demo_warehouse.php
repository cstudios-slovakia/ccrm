<?php
/**
 * Seeds the demo warehouse (warehouses, suppliers, items, stock, batches and
 * ~3 months of receipts, issues and a transfer).
 *
 * The data lives in api/demo_seed/warehouse.php — the same function the demo
 * installer calls — so this script and a fresh demo install can never drift.
 *
 * Usage (from the repo root):  php scripts/seed_demo_warehouse.php
 *
 * Re-running is safe: the seeded rows carry 'demo-warehouse-*' ids and are
 * replaced, never duplicated. Rows an older version of this script created
 * under fixed ids (wh-1, sup-1, item-1, mov-1 ...) are removed first.
 */

// CLI only. The repo root is the docroot on git-clone deploys, so without this
// an anonymous GET to /scripts/seed_demo_warehouse.php seeded demo warehouses
// into the live database.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script is CLI only.\n");
}

$root = dirname(__DIR__);
$configFile = file_exists($root . '/config.php') ? $root . '/config.php' : '/var/www/html/config.php';
require_once $configFile;
$schemaFile = file_exists($root . '/api/schema.php') ? $root . '/api/schema.php' : '/var/www/html/api/schema.php';
require_once $schemaFile;
$seedFile = file_exists($root . '/api/demo_seed/warehouse.php') ? $root . '/api/demo_seed/warehouse.php' : '/var/www/html/api/demo_seed/warehouse.php';
require_once $seedFile;

$pdo = get_db_connection();
ccrm_apply_schema($pdo);

echo "Seeding Demo Warehouse Data...\n";

// The pre-refactor version of this script used fixed ids; clear them so the old
// and the new data sets do not pile up side by side (document numbers would clash).
$pdo->beginTransaction();
try {
    $pdo->exec("DELETE FROM `warehouse_movement_items` WHERE `movement_id` IN ('mov-1','mov-2','mov-3')");
    $pdo->exec("DELETE FROM `warehouse_movements` WHERE `id` IN ('mov-1','mov-2','mov-3')");
    $pdo->exec("DELETE FROM `warehouse_batches` WHERE `id` IN ('bat-1','bat-2','bat-3')");
    $pdo->exec("DELETE FROM `warehouse_stock` WHERE `warehouse_id` IN ('wh-1','wh-2')");
    $pdo->exec("DELETE FROM `warehouse_items` WHERE `id` IN ('item-1','item-2','item-3','item-4','item-5')");
    $pdo->exec("DELETE FROM `suppliers` WHERE `id` IN ('sup-1','sup-2','sup-3')");
    $pdo->exec("DELETE FROM `warehouses` WHERE `id` IN ('wh-1','wh-2')");
    $pdo->commit();
} catch (\Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "Could not clear the old demo warehouse rows: " . $e->getMessage() . "\n");
    exit(1);
}

demo_seed_warehouse($pdo);

foreach (['warehouses', 'suppliers', 'warehouse_items', 'warehouse_stock', 'warehouse_batches', 'warehouse_movements', 'warehouse_movement_items'] as $table) {
    $n = (int)$pdo->query("SELECT COUNT(*) FROM `{$table}` WHERE " . ($table === 'warehouse_stock' ? "`warehouse_id`" : "`id`") . " LIKE 'demo-warehouse-%'")->fetchColumn();
    printf("  %-26s %d\n", $table, $n);
}

echo "Successfully seeded Demo Warehouse Data!\n";
