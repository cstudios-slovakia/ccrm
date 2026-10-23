<?php
// Warehouse item fields beyond the basic catalogue row: VAT, pack size, weight,
// alternative codes, the external (ERP / MRP) reference and one price per price level.
// Kept in its own file so a test can load it without running sync.php.

/**
 * Writes the richer warehouse-item fields (VAT, pack size, external reference,
 * alternative codes, weight, per-level prices) that the main item upsert does not
 * carry. Each field is written only when the payload names it, so a client that
 * predates them cannot blank what an import or another client stored.
 * `warehouse_items`.(external_source, external_id) is UNIQUE: a clash skips just
 * the external reference of that item (and logs it) instead of failing the sync.
 */
function ccrm_write_warehouse_item_extras(PDO $pdo, $itemId, array $item) {
    $number = function ($v, $scale) {
        return ($v === null || $v === '' || !is_numeric($v)) ? null : round((float)$v, $scale);
    };
    $text = function ($v, $max) {
        $v = trim((string)$v);
        return $v === '' ? null : mb_substr($v, 0, $max);
    };
    $set = [];
    $params = [];
    if (array_key_exists('vatRate', $item)) {
        $rate = $number($item['vatRate'], 2);
        $set[] = '`vat_rate` = ?';
        $params[] = ($rate !== null && $rate >= 0 && $rate <= 100) ? $rate : null;
    }
    if (array_key_exists('packQuantity', $item)) {
        $qty = $number($item['packQuantity'], 4);
        $set[] = '`pack_quantity` = ?';
        $params[] = ($qty !== null && $qty > 0) ? $qty : null;
    }
    if (array_key_exists('packUnit', $item)) {
        $set[] = '`pack_unit` = ?';
        $params[] = $text($item['packUnit'], 30);
    }
    if (array_key_exists('weightKg', $item)) {
        $w = $number($item['weightKg'], 3);
        $set[] = '`weight_kg` = ?';
        $params[] = ($w !== null && $w >= 0) ? $w : null;
    }
    if (array_key_exists('altCodes', $item)) {
        $codes = [];
        if (is_array($item['altCodes'])) {
            foreach ($item['altCodes'] as $c) {
                $c = $text($c, 100);
                if ($c !== null && !in_array(mb_strtolower($c), array_map('mb_strtolower', $codes), true)) $codes[] = $c;
            }
        }
        $set[] = '`alt_codes_json` = ?';
        $params[] = $codes ? json_encode($codes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null; // slashes unescaped: a plain LIKE finds BR/100
    }
    if ($set) {
        $params[] = $itemId;
        $pdo->prepare("UPDATE `warehouse_items` SET " . implode(', ', $set) . " WHERE `id` = ?")->execute($params);
    }
    if (array_key_exists('externalSource', $item) || array_key_exists('externalId', $item)) {
        $source = $text($item['externalSource'] ?? null, 50);
        $extId = $text($item['externalId'] ?? null, 100);
        if ($source === null || $extId === null) { $source = null; $extId = null; } // only meaningful as a pair
        try {
            $pdo->prepare("UPDATE `warehouse_items` SET `external_source` = ?, `external_id` = ? WHERE `id` = ?")->execute([$source, $extId, $itemId]);
        } catch (PDOException $e) {
            error_log('[ccrm sync] external reference ' . $source . '/' . $extId . ' of item ' . $itemId . ' not stored: ' . $e->getMessage());
        }
    }
    if (array_key_exists('priceLevels', $item) && is_array($item['priceLevels'])) {
        try {
            $pdo->prepare("DELETE FROM `warehouse_item_prices` WHERE `item_id` = ?")->execute([$itemId]);
            $ins = $pdo->prepare("INSERT INTO `warehouse_item_prices` (`item_id`, `price_level_id`, `price`) VALUES (?, ?, ?)");
            foreach ($item['priceLevels'] as $levelId => $price) {
                $levelId = trim((string)$levelId);
                $price = $number($price, 4);
                if ($levelId !== '' && mb_strlen($levelId) <= 50 && $price !== null && $price > 0) {
                    $ins->execute([$itemId, $levelId, $price]);
                }
            }
        } catch (PDOException $e) {
            // A missing price table (schema not migrated yet) must not fail the whole sync.
            error_log('[ccrm sync] level prices of item ' . $itemId . ' not stored: ' . $e->getMessage());
        }
    }
}

/** Removes the level prices of items that are being deleted, for a price table without its cascading key. */
function ccrm_delete_item_prices(PDO $pdo, array $itemIds) {
    if (!$itemIds) return;
    try {
        $marks = implode(',', array_fill(0, count($itemIds), '?'));
        $pdo->prepare("DELETE FROM `warehouse_item_prices` WHERE `item_id` IN ($marks)")->execute(array_values($itemIds));
    } catch (PDOException $e) {
        error_log('[ccrm sync] level prices of deleted items not removed: ' . $e->getMessage());
    }
}
