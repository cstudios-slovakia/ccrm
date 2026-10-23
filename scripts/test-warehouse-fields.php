<?php
/**
 * Checks for the richer warehouse-item fields (api/schema.php, api/warehouse_item_fields.php, api/auth.php).
 *   php scripts/test-warehouse-fields.php                       price-level normalizer + price resolution, no database
 *   CCRM_TEST_DSN=mysql:host=...;dbname=... CCRM_TEST_USER=root CCRM_TEST_PASS=x php scripts/test-warehouse-fields.php
 *                                                               also runs the migration and the writer against a SCRATCH database
 * The database part drops and recreates `warehouse_items`, `warehouse_item_prices`, `leads` and
 * `system_settings` in that database, so never point it at real data. CCRM_API_DIR overrides the
 * folder that holds the api files (for running inside the dev container).
 */
$api = getenv('CCRM_API_DIR') ?: __DIR__ . '/../public/api';
require_once $api . '/auth.php';
require_once $api . '/warehouse_item_fields.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};

// ── price levels ──────────────────────────────────────────────────────────────
$check('junk gives no levels', ccrm_normalize_price_levels(null) === [] && ccrm_normalize_price_levels('x') === []);
$out = ccrm_normalize_price_levels([
    ['id' => 'a', 'name' => '  Retail '], ['id' => 'a', 'name' => 'Other'], ['id' => 'b', 'name' => 'retail'],
    ['id' => '', 'name' => 'x'], ['id' => 'c', 'name' => ''], null, ['id' => 'd', 'name' => 'Partner'],
]);
$check('levels are cleaned: junk dropped, names trimmed, duplicates removed (mirrors the TS cases)',
    $out === [['id' => 'a', 'name' => 'Retail'], ['id' => 'd', 'name' => 'Partner']]);

$levels = [['id' => 'pl-retail', 'name' => 'Retail'], ['id' => 'pl-wh', 'name' => 'Wholesale']];
$prices = ['pl-retail' => 100.0, 'pl-wh' => 80.0, 'pl-gone' => 50.0, 'pl-zero' => 0.0];
$check('a level price wins over the default', ccrm_resolve_sell_price(100.0, $prices, 'pl-wh', $levels) === 80.0);
$check('no level uses the default', ccrm_resolve_sell_price(100.0, $prices, null, $levels) === 100.0 && ccrm_resolve_sell_price(100.0, $prices, '', $levels) === 100.0);
$check('no price on the level falls back to the default', ccrm_resolve_sell_price(70.0, [], 'pl-wh', $levels) === 70.0);
$check('a zero level price means not set', ccrm_resolve_sell_price(5.0, ['pl-retail' => 0.0], 'pl-retail', $levels) === 5.0);
$check('a deleted level is ignored', ccrm_resolve_sell_price(100.0, $prices, 'pl-gone', $levels) === 100.0);

// ── database ──────────────────────────────────────────────────────────────────
$dsn = getenv('CCRM_TEST_DSN');
if (!$dsn) {
    echo "skip database checks (set CCRM_TEST_DSN to run them against a scratch database)\n";
    echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
    exit($fails === 0 ? 0 : 1);
}
require_once $api . '/schema.php';
$pdo = new PDO($dsn, getenv('CCRM_TEST_USER') ?: 'root', getenv('CCRM_TEST_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
foreach (['warehouse_item_prices', 'warehouse_items', 'leads', 'system_settings'] as $t) $pdo->exec("DROP TABLE IF EXISTS `$t`");
$pdo->exec("CREATE TABLE `warehouse_items` (`id` VARCHAR(50) NOT NULL PRIMARY KEY, `sku` VARCHAR(100) NOT NULL UNIQUE, `name` VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE `leads` (`id` VARCHAR(50) NOT NULL PRIMARY KEY, `name` VARCHAR(100) NOT NULL)");
$pdo->exec("CREATE TABLE `system_settings` (`key` VARCHAR(100) NOT NULL PRIMARY KEY, `value` LONGTEXT)");
$pdo->exec("INSERT INTO `warehouse_items` (`id`, `sku`, `name`) VALUES ('a', 'SKU-A', 'Old item'), ('b', 'SKU-B', 'Other item')");
$pdo->exec("INSERT INTO `leads` (`id`, `name`) VALUES ('l1', 'Client')");

$colCount = fn() => count($pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_items'")->fetchAll());
$before = $colCount();
ccrm_migrate_warehouse_item_fields($pdo);
$cols = $pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouse_items'")->fetchAll(PDO::FETCH_COLUMN);
$check('the migration adds every new item column', !array_diff(['vat_rate', 'pack_quantity', 'pack_unit', 'external_source', 'external_id', 'alt_codes_json', 'weight_kg'], $cols));
$check('...and the price table and the client level column',
    $pdo->query("SHOW TABLES LIKE 'warehouse_item_prices'")->rowCount() === 1 && ccrm_column_exists($pdo, 'leads', 'price_level_id'));
$check('items that predate it are untouched (all new fields NULL)',
    (int)$pdo->query("SELECT COUNT(*) FROM warehouse_items WHERE vat_rate IS NULL AND pack_quantity IS NULL AND external_id IS NULL AND alt_codes_json IS NULL AND weight_kg IS NULL")->fetchColumn() === 2);
$after = $colCount();
ccrm_migrate_warehouse_item_fields($pdo);
$check('running it again changes nothing', $colCount() === $after && $after === $before + 7);

// the writer
ccrm_write_warehouse_item_extras($pdo, 'a', [
    'vatRate' => 10, 'packQuantity' => '1.44', 'packUnit' => 'bal', 'weightKg' => 12.5,
    'altCodes' => ['X1', 'x1', ' Y2 ', ''], 'externalSource' => 'mrp', 'externalId' => '39',
    'priceLevels' => ['pl-wh' => 80, 'pl-zero' => 0, 'pl-bad' => 'abc'],
]);
$row = $pdo->query("SELECT * FROM warehouse_items WHERE id = 'a'")->fetch(PDO::FETCH_ASSOC);
$check('every field is stored', (float)$row['vat_rate'] === 10.0 && (float)$row['pack_quantity'] === 1.44 && $row['pack_unit'] === 'bal'
    && (float)$row['weight_kg'] === 12.5 && $row['external_source'] === 'mrp' && $row['external_id'] === '39');
$check('alternative codes are trimmed and deduplicated', json_decode($row['alt_codes_json'], true) === ['X1', 'Y2']);
$check('only positive level prices are stored', $pdo->query("SELECT GROUP_CONCAT(CONCAT(price_level_id, '=', price)) FROM warehouse_item_prices WHERE item_id = 'a'")->fetchColumn() === 'pl-wh=80.0000');

ccrm_write_warehouse_item_extras($pdo, 'a', ['name' => 'a payload from an older client, none of the new keys']);
$row2 = $pdo->query("SELECT * FROM warehouse_items WHERE id = 'a'")->fetch(PDO::FETCH_ASSOC);
$check('a payload without the new keys leaves them as they were (omitted means unchanged)',
    $row2['vat_rate'] === $row['vat_rate'] && $row2['external_id'] === '39' && $row2['alt_codes_json'] === $row['alt_codes_json']
    && (int)$pdo->query("SELECT COUNT(*) FROM warehouse_item_prices WHERE item_id = 'a'")->fetchColumn() === 1);

ccrm_write_warehouse_item_extras($pdo, 'a', ['vatRate' => null, 'packQuantity' => 0, 'altCodes' => [], 'priceLevels' => []]);
$row3 = $pdo->query("SELECT * FROM warehouse_items WHERE id = 'a'")->fetch(PDO::FETCH_ASSOC);
$check('an explicit null / empty clears a field and the level prices',
    $row3['vat_rate'] === null && $row3['pack_quantity'] === null && $row3['alt_codes_json'] === null
    && (int)$pdo->query("SELECT COUNT(*) FROM warehouse_item_prices WHERE item_id = 'a'")->fetchColumn() === 0);

ccrm_write_warehouse_item_extras($pdo, 'a', ['externalSource' => 'mrp', 'externalId' => '39']);
ccrm_write_warehouse_item_extras($pdo, 'b', ['externalSource' => 'mrp', 'externalId' => '39']);
$check('a clashing external reference is skipped, not fatal', $pdo->query("SELECT external_id FROM warehouse_items WHERE id = 'b'")->fetchColumn() === null);
ccrm_write_warehouse_item_extras($pdo, 'b', ['externalSource' => '', 'externalId' => '40']);
$check('an external id without a source is not stored (only meaningful as a pair)', $pdo->query("SELECT external_id FROM warehouse_items WHERE id = 'b'")->fetchColumn() === null);
ccrm_write_warehouse_item_extras($pdo, 'b', ['externalSource' => 'erp', 'externalId' => '39']);
$check('the same id from another source is fine', $pdo->query("SELECT external_source FROM warehouse_items WHERE id = 'b'")->fetchColumn() === 'erp');
$pdo->exec("INSERT INTO warehouse_items (id, sku, name) VALUES ('c', 'SKU-C', 'No ref'), ('d', 'SKU-D', 'No ref either')");
$check('many items may have no external reference (unique only when both are set)',
    (int)$pdo->query("SELECT COUNT(*) FROM warehouse_items WHERE external_id IS NULL")->fetchColumn() === 2);

ccrm_write_warehouse_item_extras($pdo, 'b', ['priceLevels' => ['pl-wh' => 5]]);
$pdo->exec("DELETE FROM warehouse_items WHERE id = 'b'");
$check('deleting an item deletes its level prices', (int)$pdo->query("SELECT COUNT(*) FROM warehouse_item_prices WHERE item_id = 'b'")->fetchColumn() === 0);

// the configured list is read from system_settings
$pdo->exec("INSERT INTO system_settings (`key`, `value`) VALUES ('PRICE_LEVELS', '[{\"id\":\"pl-x\",\"name\":\"X\"},{\"id\":\"pl-x\",\"name\":\"dup\"}]')");
$check('the configured levels are read and normalized', ccrm_price_levels($pdo) === [['id' => 'pl-x', 'name' => 'X']]);

// A catalogue table with another collation cannot be referenced by a foreign key: the price table must still exist.
$pdo->exec("DROP TABLE IF EXISTS `warehouse_item_prices`");
$pdo->exec("DROP TABLE IF EXISTS `warehouse_items`");
try {
    $pdo->exec("CREATE TABLE `warehouse_items` (`id` VARCHAR(50) NOT NULL PRIMARY KEY, `sku` VARCHAR(100) NOT NULL UNIQUE, `name` VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci");
    $pdo->exec("INSERT INTO `warehouse_items` (`id`, `sku`, `name`) VALUES ('z', 'SKU-Z', 'Z')");
    ccrm_migrate_warehouse_item_fields($pdo);
    $check('with an incompatible collation the price table is still created, without its key',
        $pdo->query("SHOW TABLES LIKE 'warehouse_item_prices'")->rowCount() === 1);
    ccrm_write_warehouse_item_extras($pdo, 'z', ['priceLevels' => ['pl-a' => 9]]);
    ccrm_delete_item_prices($pdo, ['z']);
    $check('...and the prices of a deleted item are removed explicitly', (int)$pdo->query("SELECT COUNT(*) FROM warehouse_item_prices")->fetchColumn() === 0);
} catch (PDOException $e) {
    echo "skip collation fallback check (" . $e->getMessage() . ")
";
}

foreach (['warehouse_item_prices', 'warehouse_items', 'leads', 'system_settings'] as $t) $pdo->exec("DROP TABLE IF EXISTS `$t`");
echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
exit($fails === 0 ? 0 : 1);
