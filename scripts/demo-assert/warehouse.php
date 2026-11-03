<?php
/**
 * Assertions for the `warehouse` demo module (phase 4B). Format: scripts/demo-assert/company.php.
 * Stock, batches and average cost are DERIVED from the documents, so the invariant is recomputed here from the
 * written movement lines: stock = receipts - issues +/- transfers, never negative; inward totals are qty x the
 * converted purchase price; outward profit = sell - cost; every price is demo_money() of the pack's EUR.
 */
return [
    'minRows' => [
        'warehouses' => 2,
        'suppliers' => 3,
        'warehouse_items' => 8,
        'warehouse_batches' => 3,
        'warehouse_movements' => 22,
        'warehouse_movement_items' => 39,
        'warehouse_stock' => 10,
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        demo_ctx_force($ctx['lang'], $ctx['currency']);
        $tol = $ctx['whole'] ? 1.0 : 0.01;
        $near = static fn(float $a, float $b, float $k = 1.0): bool => abs($a - $b) <= $tol * $k;
        $pack = demo_pack_for($ctx['lang'], 'warehouse');
        $cast = demo_company_pack($ctx['lang']);
        $emails = array_map(static fn($u) => strtolower($u['email']), $cast['users']);

        $movs = [];
        foreach ($db->rows('warehouse_movements') as $m) $movs[$m['id']] = $m;
        $lines = [];
        foreach ($db->rows('warehouse_movement_items') as $l) $lines[$l['movement_id']][] = $l;
        $check('2 warehouses, 3 suppliers and 8 catalogue items of the cast (ids from the ref map)',
            array_column($db->rows('warehouses'), 'id') === [demo_ref_id('W1'), demo_ref_id('W2')]
            && array_column($db->rows('suppliers'), 'id') === [demo_ref_id('S1'), demo_ref_id('S2'), demo_ref_id('S3')]
            && array_column($db->rows('warehouse_items'), 'id') === array_map('demo_ref_id', ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8']));

        // Recompute stock and batches from the lines.
        $stock = [];
        $batch = [];
        foreach ($pack['movements'] as $i => $m) {
            $row = $movs['demo-warehouse-' . (401 + $i)] ?? null;
            foreach ($lines[$row['id'] ?? ''] ?? [] as $l) {
                $q = (float)$l['quantity'];
                $w = $row['warehouse_id'];
                $it = $l['item_id'];
                if ($row['type'] === 'inward') {
                    $stock[$w][$it] = ($stock[$w][$it] ?? 0) + $q;
                    if ($l['batch_id']) $batch[$l['batch_id']]['in'] = ($batch[$l['batch_id']]['in'] ?? 0) + $q;
                } elseif ($row['type'] === 'outward') {
                    $stock[$w][$it] = ($stock[$w][$it] ?? 0) - $q;
                    if ($l['batch_id']) $batch[$l['batch_id']]['out'] = ($batch[$l['batch_id']]['out'] ?? 0) + $q;
                } else {
                    $stock[$w][$it] = ($stock[$w][$it] ?? 0) - $q;
                    $stock[$row['target_warehouse_id']][$it] = ($stock[$row['target_warehouse_id']][$it] ?? 0) + $q;
                }
            }
        }
        $written = [];
        foreach ($db->rows('warehouse_stock') as $s) $written[$s['warehouse_id']][$s['item_id']] = $s;
        $bad = [];
        foreach ($stock as $w => $by) {
            foreach ($by as $it => $q) {
                if ($q < -1e-6) $bad[] = "negative stock {$q} of {$it} in {$w}";
                if ($q > 1e-5) {
                    $got = isset($written[$w][$it]) ? (float)$written[$w][$it]['quantity'] : null;
                    if ($got === null || abs($got - $q) > 1e-3) $bad[] = "{$w}/{$it}: stock row " . var_export($got, true) . " != sum of movements {$q}";
                    elseif ((float)$written[$w][$it]['reserved_quantity'] > $got + 1e-6) $bad[] = "{$w}/{$it}: reserved more than on hand";
                }
            }
        }
        foreach ($written as $w => $by) foreach ($by as $it => $s) if (($stock[$w][$it] ?? 0) <= 1e-5) $bad[] = "{$w}/{$it}: a stock row without stock";
        $check('stock equals the sum of the movements, never negative, reservations fit', !$bad, implode("\n", array_slice($bad, 0, 6)));
        $check('a service item (I8) has no stock', !isset($written[demo_ref_id('W1')][demo_ref_id('I8')]) && !isset($written[demo_ref_id('W2')][demo_ref_id('I8')]));

        $bad = [];
        foreach ($db->rows('warehouse_batches') as $b) {
            $expect = ($batch[$b['id']]['in'] ?? 0) - ($batch[$b['id']]['out'] ?? 0);
            if (abs((float)$b['initial_quantity'] - ($batch[$b['id']]['in'] ?? 0)) > 1e-3 || abs((float)$b['current_quantity'] - $expect) > 1e-3) $bad[] = "{$b['batch_number']}: {$b['initial_quantity']}/{$b['current_quantity']} != " . ($batch[$b['id']]['in'] ?? 0) . "/{$expect}";
        }
        $check('batches: initial = receipts, current = receipts - issues', !$bad, implode("\n", $bad));
        $expiring = array_filter($db->rows('warehouse_batches'), fn($b) => $b['expiration_date'] <= demo_d(30));
        $check('one batch expires within a month (the expiry warning has something to show)', count($expiring) === 1);

        // Money.
        $bad = [];
        $docNumbers = [];
        foreach ($pack['movements'] as $i => $m) {
            $row = $movs['demo-warehouse-' . (401 + $i)] ?? null;
            if ($row === null) { $bad[] = "movement {$i} missing"; continue; }
            $docNumbers[] = $row['document_number'];
            $ls = $lines[$row['id']] ?? [];
            $sumLines = 0.0;
            $sumQtyCost = 0.0;
            foreach ($ls as $n => $l) {
                $sumLines += (float)$l['total_price'];
                $sumQtyCost += (float)$l['quantity'] * (float)$l['unit_purchase_price'];
                $pl = $m['lines'][$n];
                if ($row['type'] === 'inward' && abs((float)$l['unit_purchase_price'] - demo_money((float)$pl['priceEur'])) > 1e-9) $bad[] = "{$row['document_number']}: purchase price {$l['unit_purchase_price']} != demo_money({$pl['priceEur']})";
                if ($row['type'] === 'outward' && abs((float)$l['unit_sell_price'] - demo_money((float)$pl['priceEur'])) > 1e-9) $bad[] = "{$row['document_number']}: sell price {$l['unit_sell_price']} != demo_money({$pl['priceEur']})";
                if ($row['type'] !== 'transfer' && !$near((float)$l['quantity'] * ($row['type'] === 'inward' ? (float)$l['unit_purchase_price'] : (float)$l['unit_sell_price']), (float)$l['total_price'])) $bad[] = "{$row['document_number']}: line total {$l['total_price']} != qty x price";
            }
            if ($row['type'] === 'inward' && !$near($sumLines, (float)$row['total_cost_value'])) $bad[] = "{$row['document_number']}: cost {$row['total_cost_value']} != sum of lines {$sumLines}";
            if ($row['type'] === 'outward') {
                if (!$near($sumLines, (float)$row['total_sell_value'])) $bad[] = "{$row['document_number']}: sell value {$row['total_sell_value']} != sum of lines {$sumLines}";
                if (!$near($sumQtyCost, (float)$row['total_cost_value'], 2)) $bad[] = "{$row['document_number']}: cost {$row['total_cost_value']} != qty x average cost {$sumQtyCost}";
                if (!$near((float)$row['total_sell_value'] - (float)$row['total_cost_value'], (float)$row['total_profit_value'], 2)) $bad[] = "{$row['document_number']}: profit {$row['total_profit_value']} != sell - cost";
            }
            if ($row['type'] === 'transfer' && ((float)$row['total_profit_value'] != 0.0 || !$near((float)$row['total_sell_value'], (float)$row['total_cost_value']))) $bad[] = "{$row['document_number']}: a transfer must have zero profit";
            if (!in_array(strtolower((string)$row['created_by']), $emails, true)) $bad[] = "{$row['document_number']}: created_by {$row['created_by']} is not one of the demo users' e-mails";
        }
        $check('movement totals are sums of their converted lines; outward profit = sell - cost; transfers have none', !$bad, implode("\n", array_slice($bad, 0, 8)));
        $check('document numbers are unique and sequential per type and year', count($docNumbers) === count(array_unique($docNumbers))
            && preg_match('/^' . preg_quote($pack['numbering']['inward'], '/') . '-\d{4}-0001$/', $docNumbers[0]) === 1, implode(',', array_slice($docNumbers, 0, 3)));

        $bad = [];
        foreach ($db->rows('warehouse_items') as $it) {
            $ref = array_search($it['id'], array_map('demo_ref_id', array_keys($cast['items'])), true);
            $refName = array_keys($cast['items'])[$ref];
            if (abs((float)$it['default_sell_price'] - demo_money((float)$cast['items'][$refName]['priceEur'])) > 1e-9) $bad[] = "{$refName}: sell price {$it['default_sell_price']}";
            if ($it['name'] !== $cast['items'][$refName]['name'] || $it['sku'] !== $cast['items'][$refName]['sku']) $bad[] = "{$refName}: name/sku differ from the cast";
        }
        $check('catalogue prices are demo_money() of the cast\'s EUR price; names and SKUs are the cast\'s', !$bad, implode("\n", $bad));

        // Links: receipts from suppliers, issues to demo clients.
        $okLinks = true;
        foreach ($movs as $m) {
            if ($m['type'] === 'inward' && !in_array($m['supplier_id'], array_map('demo_ref_id', ['S1', 'S2', 'S3']), true)) $okLinks = false;
            if ($m['type'] === 'outward' && !preg_match('/^demo-clients-([1-9]|1[01])$/', (string)$m['lead_id'])) $okLinks = false;
            if ($m['type'] === 'transfer' && $m['target_warehouse_id'] === $m['warehouse_id']) $okLinks = false;
        }
        $check('receipts name a supplier, issues a client or lead, transfers go to the other warehouse', $okLinks);
        $sup = [];
        foreach ($db->rows('suppliers') as $s) $sup[$s['id']] = json_decode((string)$s['contacts_json'], true);
        $check('every supplier has its cast contact first and at least one more', array_reduce($sup, fn($ok, $c) => $ok && is_array($c) && count($c) >= 2, true));
    },
];
