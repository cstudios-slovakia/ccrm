<?php
/**
 * Demo seed module: warehouse (pack-based, phase 4B).
 *
 * Two warehouses (W1, W2), three suppliers (S1-S3), eight catalogue items (I1-I8; I8, the
 * laser-measuring visit, is a service item without stock) and ~6 months of documents: receipts
 * (inward), issues (outward, filed against the demo clients) and transfers between the two
 * warehouses. Names, SKUs, units, addresses and prices of the cast are in packs/<lang>/company.php;
 * descriptions, supplier notes/contacts, batches and the documents are in packs/<lang>/warehouse.php.
 * This file holds code only. It also replaces what ccrm_seed_default_warehouses_and_items seeds
 * (that legacy seeder goes in phase 5).
 *
 * Money (C4): every price in the pack is EUR and is converted with demo_money() BEFORE anything
 * is multiplied. The documents are simulated chronologically in PHP and `warehouse_stock`,
 * `warehouse_batches` and each item's weighted-average purchase price are DERIVED from that
 * simulation, so stock always equals the sum of movements (an inward adds, an outward subtracts,
 * a transfer moves). Following WarehouseView.tsx: inward total_price = qty x purchase price;
 * outward total_price = qty x sell price with unit_purchase_price = the item's running average
 * cost; transfers are valued at average cost with zero profit. A document's total is the sum of
 * its lines - never a converted figure. `created_by` is the user's e-mail, as the UI writes it.
 *
 * Id plan: 1-2 warehouses, 101-108 items (I1-I8), 201-203 suppliers (S1-S3), 301-303 batches,
 * 401+ movements, 601+ movement lines. (The ids of the cast come from demo_ref_id().)
 * Returns the number of rows inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

function demo_seed_warehouse(PDO $pdo): int {
    $ctx = demo_ctx($pdo);
    $pack = demo_pack($pdo, 'warehouse');
    $cast = demo_company_pack($ctx['lang']);
    $users = demo_users($pdo);
    $inserted = 0;

    // --- Clean own rows (children first; FKs would otherwise block) ------------------------------
    $pdo->exec("DELETE FROM `warehouse_movement_items` WHERE `id` LIKE 'demo-warehouse-%' OR `movement_id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouse_movements` WHERE `id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouse_batches` WHERE `id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouse_stock` WHERE `warehouse_id` LIKE 'demo-warehouse-%' OR `item_id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouse_items` WHERE `id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `suppliers` WHERE `id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouses` WHERE `id` LIKE 'demo-warehouse-%'");

    // --- Warehouses -----------------------------------------------------------------------------------
    $insWh = $pdo->prepare("INSERT INTO `warehouses` (`id`, `name`, `code`, `address`, `manager_user_id`, `is_default`) VALUES (?, ?, ?, ?, ?, ?)");
    $hasDefault = (int)$pdo->query("SELECT COUNT(*) FROM `warehouses` WHERE `is_default` = 1")->fetchColumn() > 0;
    foreach (['W1', 'W2'] as $ref) {
        $w = $cast['warehouses'][$ref];
        $insWh->execute([demo_ref_id($ref), $w['name'], $w['code'], $w['address'], demo_ref_id($w['owner']), ($ref === 'W1' && !$hasDefault) ? 1 : 0]);
        $inserted++;
    }

    // --- Suppliers --------------------------------------------------------------------------------------
    $insSup = $pdo->prepare(
        "INSERT INTO `suppliers` (`id`, `name`, `company_id`, `tax_id`, `vat_id`, `street`, `city`, `postal_code`, `country`, `email`, `phone`, `website`,
            `iban`, `swift`, `payment_due_days`, `notes`, `contacts_json`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    foreach (['S1', 'S2', 'S3'] as $ref) {
        $s = $cast['suppliers'][$ref];
        $p = $pack['suppliers'][$ref];
        $contacts = [['name' => $s['contact'], 'position' => $p['position'], 'phone' => $s['phone'], 'email' => $s['email']]];
        foreach ($p['extra'] as $x) {
            $contacts[] = ['name' => $x['name'], 'position' => $x['position'], 'phone' => $x['phone'], 'email' => $x['email']];
        }
        $insSup->execute([
            demo_ref_id($ref), $s['name'], $s['companyId'], $s['taxId'], $s['vatId'], $s['street'], $s['city'], $s['postalCode'], $s['country'],
            $s['email'], $s['phone'], $s['website'], $s['iban'], $s['swift'], $s['paymentDueDays'], demo_text($p['notes']),
            json_encode($contacts, JSON_UNESCAPED_UNICODE),
        ]);
        $inserted++;
    }

    // --- Simulation: stock, batches, running average cost, document numbers ------------------------------
    $stock = [];     // [warehouse ref][item ref] => qty
    $onHand = [];    // item ref => qty across warehouses
    $avg = [];       // item ref => running weighted-average purchase price
    $last = [];      // item ref => last purchase price
    $batchQty = [];  // batch key => ['initial', 'current', 'price']
    $seqByKey = [];
    $prepared = [];
    foreach ($pack['movements'] as $mi => $m) {
        $type = $m['type'];
        $key = $pack['numbering'][$type] . '-' . substr(demo_d($m['day']), 0, 4);
        $seqByKey[$key] = ($seqByKey[$key] ?? 0) + 1;
        $number = sprintf('%s-%04d', $key, $seqByKey[$key]);
        $w = $m['warehouse'];

        $cost = 0.0;
        $sell = 0.0;
        $rows = [];
        foreach ($m['lines'] as $ln) {
            $item = $ln['item'];
            $qty = (float)$ln['qty'];
            $price = demo_money((float)$ln['priceEur']);
            $batch = $ln['batch'] ?? null;
            $defaultSell = demo_money((float)$cast['items'][$item]['priceEur']);
            if ($type === 'inward') {
                $total = demo_money_minor($qty * $price);
                $cost += $total;
                $newOn = ($onHand[$item] ?? 0.0) + $qty;
                $avg[$item] = $newOn > 0 ? (($onHand[$item] ?? 0.0) * ($avg[$item] ?? $price) + $qty * $price) / $newOn : $price;
                $onHand[$item] = $newOn;
                $last[$item] = $price;
                $stock[$w][$item] = ($stock[$w][$item] ?? 0.0) + $qty;
                if ($batch !== null) {
                    $prev = $batchQty[$batch] ?? ['initial' => 0.0, 'current' => 0.0];
                    $batchQty[$batch] = ['initial' => $prev['initial'] + $qty, 'current' => $prev['current'] + $qty, 'price' => $price];
                }
                $rows[] = [$item, $batch, $qty, $price, $defaultSell, $total];
            } elseif ($type === 'outward') {
                $unitCost = round($avg[$item] ?? 0.0, 4);
                $total = demo_money_minor($qty * $price);
                $cost += $qty * $unitCost;
                $sell += $total;
                $stock[$w][$item] = ($stock[$w][$item] ?? 0.0) - $qty;
                $onHand[$item] = ($onHand[$item] ?? 0.0) - $qty;
                if ($batch !== null) {
                    $batchQty[$batch]['current'] -= $qty;
                }
                $rows[] = [$item, $batch, $qty, $unitCost, $price, $total];
            } else { // transfer: 'to' is the target warehouse ref
                $unitCost = round($avg[$item] ?? 0.0, 4);
                $cost += $qty * $unitCost;
                $stock[$w][$item] = ($stock[$w][$item] ?? 0.0) - $qty;
                $stock[$m['to']][$item] = ($stock[$m['to']][$item] ?? 0.0) + $qty;
                $rows[] = [$item, null, $qty, $unitCost, $defaultSell, demo_money_minor($qty * $unitCost)];
            }
            if (($stock[$w][$item] ?? 0.0) < -0.0001) {
                throw new \RuntimeException("Demo warehouse data would drive item {$item} negative in warehouse {$w} at {$number}.");
            }
        }
        $prepared[] = [$mi, $m, $number, $rows, demo_money_minor($cost), demo_money_minor($sell)];
    }

    // --- Items (with the average and last prices the simulation ended on) ------------------------------------
    $insItem = $pdo->prepare(
        "INSERT INTO `warehouse_items` (`id`, `sku`, `barcode`, `name`, `description`, `category`, `unit`, `min_stock`, `optimal_stock`, `default_location`,
            `has_expiration`, `default_sell_price`, `avg_purchase_price`, `last_purchase_price`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $itemN = 0;
    foreach ($cast['items'] as $ref => $it) {
        $itemN++;
        $p = $pack['items'][$ref];
        $insItem->execute([
            demo_ref_id($ref), $it['sku'], '85880' . str_pad((string)(100 + $itemN), 7, '0', STR_PAD_LEFT), $it['name'], $p['description'], $it['category'], $it['unit'],
            $p['min'], $p['optimal'], $p['location'] === '' ? null : $p['location'], $p['expires'], demo_money((float)$it['priceEur']),
            round($avg[$ref] ?? demo_money((float)$it['costEur']), 4), round($last[$ref] ?? demo_money((float)$it['costEur']), 4),
        ]);
        $inserted++;
    }

    // --- Batches ---------------------------------------------------------------------------------------------------
    $insBatch = $pdo->prepare(
        "INSERT INTO `warehouse_batches` (`id`, `item_id`, `warehouse_id`, `batch_number`, `expiration_date`, `initial_quantity`, `current_quantity`, `purchase_price`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $batchId = [];
    $batchExp = [];
    foreach ($pack['batches'] as $i => $b) {
        $batchId[$b['key']] = demo_id('warehouse', 301 + $i);
        $batchExp[$b['key']] = demo_d($b['expDay']);
        $q = $batchQty[$b['key']] ?? ['initial' => 0.0, 'current' => 0.0, 'price' => 0.0];
        $insBatch->execute([$batchId[$b['key']], demo_ref_id($b['item']), demo_ref_id($b['warehouse']), $b['number'], $batchExp[$b['key']],
            $q['initial'], max(0.0, $q['current']), $q['price']]);
        $inserted++;
    }

    // --- Stock (derived) ----------------------------------------------------------------------------------------------
    $reserved = [];
    foreach ($pack['reserved'] as $r) {
        $reserved[$r['warehouse'] . ',' . $r['item']] = (float)$r['qty'];
    }
    $insStock = $pdo->prepare(
        "INSERT INTO `warehouse_stock` (`warehouse_id`, `item_id`, `quantity`, `reserved_quantity`, `location`) VALUES (?, ?, ?, ?, ?)"
    );
    foreach ($stock as $w => $byItem) {
        foreach ($byItem as $item => $qty) {
            if ($qty <= 0.00001) {
                continue;
            }
            $loc = $w === 'W2' ? $pack['items'][$item]['location2'] : $pack['items'][$item]['location'];
            $insStock->execute([demo_ref_id($w), demo_ref_id($item), round($qty, 4), min($qty, $reserved[$w . ',' . $item] ?? 0.0), $loc === '' ? null : $loc]);
            $inserted++;
        }
    }

    // --- Movements and lines -----------------------------------------------------------------------------------------------
    $insMov = $pdo->prepare(
        "INSERT INTO `warehouse_movements` (`id`, `document_number`, `type`, `status`, `warehouse_id`, `target_warehouse_id`, `supplier_id`, `lead_id`,
            `total_cost_value`, `total_sell_value`, `total_profit_value`, `created_by`, `note`, `issued_at`)
         VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insLine = $pdo->prepare(
        "INSERT INTO `warehouse_movement_items` (`id`, `movement_id`, `item_id`, `batch_id`, `quantity`, `unit_purchase_price`, `unit_sell_price`, `total_price`, `expiration_date`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $lineSeq = 0;
    foreach ($prepared as [$mi, $m, $number, $rows, $cost, $sell]) {
        $type = $m['type'];
        $movId = demo_id('warehouse', 401 + $mi);
        $insMov->execute([
            $movId, $number, $type, demo_ref_id($m['warehouse']),
            $type === 'transfer' ? demo_ref_id($m['to']) : null,
            $type === 'inward' ? demo_ref_id($m['supplier']) : null,
            $type === 'outward' ? demo_ref_id($m['client']) : null,
            $cost, $type === 'outward' ? $sell : ($type === 'transfer' ? $cost : 0), $type === 'outward' ? demo_money_minor($sell - $cost) : 0,
            $users[$m['user']]['email'], demo_text($m['note']), demo_dt($m['day'], sprintf('%02d:%02d', 8 + ($mi % 8), ($mi * 7) % 60)),
        ]);
        $inserted++;
        foreach ($rows as [$item, $batch, $qty, $unitPurchase, $unitSell, $total]) {
            $lineSeq++;
            $insLine->execute([
                demo_id('warehouse', 600 + $lineSeq), $movId, demo_ref_id($item), $batch === null ? null : $batchId[$batch], $qty,
                $unitPurchase, $unitSell, $total, $batch === null ? null : $batchExp[$batch],
            ]);
            $inserted++;
        }
    }
    return $inserted;
}
