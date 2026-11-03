<?php
/**
 * Assertions for the `offers` demo module (phase 4B). Format and contract: scripts/demo-assert/company.php and
 * the header of public/api/demo_seed/index.php.
 *
 * The point of this file is C4: money must reconcile in EVERY currency. For sk/EUR, hu/HUF, hu/EUR and en/USD it
 * checks that each document's subtotal is the sum of its converted items, VAT comes from the edition's country
 * (hu/EUR keeps 27 %), total = subtotal + VAT, an advance bills its percentage of the CONVERTED base subtotal,
 * and the timeline announcements carry the document's own total. Tolerance: 0.01, 1 for HUF.
 */
return [
    'minRows' => [
        'invoices_offers' => 16,
        'invoice_offer_items' => 60,
        'timeline_events' => 16,
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        demo_ctx_force($ctx['lang'], $ctx['currency']);
        $tol = $ctx['whole'] ? 1.0 : 0.01;
        $near = static fn(float $a, float $b, float $k = 1.0): bool => abs($a - $b) <= $tol * $k;
        $pack = demo_pack_for($ctx['lang'], 'offers');
        $cast = demo_company_pack($ctx['lang']);
        $keys = array_keys($pack['docs']);

        $docs = $db->rows('invoices_offers');
        $byId = [];
        foreach ($docs as $d) $byId[$d['id']] = $d;
        $items = [];
        foreach ($db->rows('invoice_offer_items') as $it) $items[$it['invoice_offer_id']][] = $it;
        $check('16 documents: 9 price offers, 2 proformas, 5 invoices', count($docs) === 16
            && count(array_filter($docs, fn($d) => $d['type'] === 'price_offer')) === 9
            && count(array_filter($docs, fn($d) => $d['type'] === 'proforma')) === 2
            && count(array_filter($docs, fn($d) => $d['type'] === 'invoice')) === 5, (string)count($docs));

        $bad = [];
        foreach ($keys as $i => $key) {
            $id = 'demo-offers-' . ($i + 1);
            $d = $byId[$id] ?? null;
            if ($d === null) { $bad[] = "{$key}: no row {$id}"; continue; }
            $its = $items[$id] ?? [];
            if (!$its) { $bad[] = "{$key}: no items"; continue; }
            $sum = 0.0;
            $vat = 0.0;
            foreach ($its as $it) {
                $sum += (float)$it['total_price'];
                $expect = (float)$it['quantity'] * (float)$it['unit_price'] * (100 - (float)$it['discount_pct']) / 100;
                if (!$near($expect, (float)$it['total_price'])) $bad[] = "{$key}: item '{$it['name']}' total {$it['total_price']} != qty x unit x (1 - discount) = " . round($expect, 4);
                if ((float)$it['vat_rate'] !== (float)$ctx['vatDefault']) $bad[] = "{$key}: item VAT {$it['vat_rate']} != country rate {$ctx['vatDefault']}";
                $vat += (float)$it['total_price'] * (float)$it['vat_rate'] / 100;
            }
            if (!$near($sum, (float)$d['subtotal'])) $bad[] = "{$key}: subtotal {$d['subtotal']} != sum of items " . round($sum, 4);
            if (!$near($vat, (float)$d['vat_amount'])) $bad[] = "{$key}: VAT {$d['vat_amount']} != items x rate " . round($vat, 4);
            if (!$near((float)$d['subtotal'] + (float)$d['vat_amount'], (float)$d['total_price'])) $bad[] = "{$key}: total {$d['total_price']} != subtotal + VAT";
            if ($d['currency'] !== $ctx['currency']) $bad[] = "{$key}: currency {$d['currency']}";
            if ($ctx['whole']) {
                foreach ($its as $it) if (abs((float)$it['unit_price'] - round((float)$it['unit_price'])) > 1e-9) $bad[] = "{$key}: a fractional price in {$ctx['currency']}: {$it['unit_price']}";
            }
        }
        $check('every document reconciles: items -> subtotal -> VAT -> total, and the currency is ' . $ctx['currency'], !$bad, implode("\n", array_slice($bad, 0, 8)));

        // Unit prices are the EUR of the pack, converted per unit (never a converted total).
        $bad = [];
        foreach ($keys as $i => $key) {
            $doc = $pack['docs'][$key];
            if (isset($doc['basis'])) continue;
            $its = $items['demo-offers-' . ($i + 1)] ?? [];
            foreach ($doc['lines'] as $n => $ln) {
                $got = isset($its[$n]) ? (float)$its[$n]['unit_price'] : null;
                if ($got === null || abs($got - demo_money((float)$ln['priceEur'])) > 1e-9) $bad[] = "{$key} line {$n}: unit price " . var_export($got, true) . ' != demo_money(' . $ln['priceEur'] . ')';
            }
        }
        $check('every unit price is demo_money() of the pack\'s EUR price', !$bad, implode("\n", array_slice($bad, 0, 6)));

        // VAT follows the country, not the currency.
        $vatOk = true;
        foreach ($db->rows('invoice_offer_items') as $it) if ((float)$it['vat_rate'] !== (float)$ctx['vatDefault']) $vatOk = false;
        $check("VAT is {$ctx['vatDefault']} % in the {$ctx['lang']} edition whatever the currency", $vatOk);

        // Advances and instalments bill a percentage of the converted base subtotal.
        $bad = [];
        foreach ($keys as $i => $key) {
            $doc = $pack['docs'][$key];
            if (!isset($doc['basis'])) continue;
            $base = $byId['demo-offers-' . (array_search($doc['basis'], $keys, true) + 1)];
            $mine = $byId['demo-offers-' . ($i + 1)];
            $expect = round((float)$base['subtotal'] * $doc['pct'] / 100, $ctx['whole'] ? 0 : 2);
            if (!$near((float)$mine['subtotal'], $expect)) $bad[] = "{$key}: subtotal {$mine['subtotal']} != {$doc['pct']} % of {$doc['basis']} ({$base['subtotal']}) = {$expect}";
            if (strpos((string)($items['demo-offers-' . ($i + 1)][0]['name'] ?? ''), (string)$doc['pct']) === false) $bad[] = "{$key}: line text does not mention {$doc['pct']} %";
        }
        $check('advances bill 40 % of the converted net subtotal of their base document', !$bad, implode("\n", $bad));

        // The story (D6): statuses, due dates, who owns what.
        $row = static fn(string $k) => $byId['demo-offers-' . (array_search($k, array_keys(demo_pack_for('en', 'offers')['docs']), true) + 1)];
        $statuses = array_map(fn($k) => $row($k)['status'], ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10', 'O11', 'O12', 'O13', 'O14', 'O15', 'O16']);
        $check('statuses: 5 accepted, 2 sent, draft, rejected, deposit paid + deposit sent, instalment sent, P2 and two P4 invoices paid, one P4 issued',
            $statuses === ['approved', 'approved', 'approved', 'approved', 'approved', 'sent', 'sent', 'draft', 'rejected', 'invoiced', 'sent', 'sent', 'approved', 'approved', 'approved', 'sent'], implode(',', $statuses));
        $check('the P3 deposit is overdue by 12 days; the P1 instalment is due in 5 days', $row('O11')['due_date'] === demo_d(-12) && $row('O12')['due_date'] === demo_d(5), $row('O11')['due_date'] . ' / ' . $row('O12')['due_date']);
        $check('the lost lead L11 has a rejected offer, the draft belongs to L8, the foreign architect L10 has a sent framework offer',
            $row('O9')['lead_id'] === demo_ref_id('L11') && $row('O8')['lead_id'] === demo_ref_id('L8') && $row('O7')['lead_id'] === demo_ref_id('L10') && $row('O7')['status'] === 'sent');
        $check('the L9 offer carries the 4 cm mitred edge option with the converted amount', strpos((string)$row('O6')['intro_note'], demo_money_fmt(demo_money(180.0))) !== false, (string)$row('O6')['intro_note']);

        // Numbering: unique, per prefix and year in issue order.
        $numbers = array_column($docs, 'document_number');
        $ordered = true;
        $last = [];
        $sorted = $docs;
        usort($sorted, fn($a, $b) => [$a['issued_at'], $a['id']] <=> [$b['issued_at'], $b['id']]);
        foreach ($sorted as $d) {
            if (!preg_match('/^(.+-\d{4})-(\d{3})$/', $d['document_number'], $m)) { $ordered = false; continue; }
            if ((int)$m[2] !== ($last[$m[1]] ?? 0) + 1) $ordered = false;
            $last[$m[1]] = (int)$m[2];
        }
        $check('document numbers are unique and run 001, 002, ... per prefix and year in issue order', count($numbers) === count(array_unique($numbers)) && $ordered);

        // Each document announces itself on its client's timeline with its own total.
        $events = [];
        foreach ($db->rows('timeline_events') as $e) if (strpos((string)$e['id'], 'demo-offers-') === 0) $events[$e['lead_id']][] = $e;
        $bad = [];
        foreach ($docs as $d) {
            $found = false;
            foreach ($events[$d['lead_id']] ?? [] as $e) {
                if (strpos((string)$e['title'], $d['document_number']) !== false) {
                    $found = true;
                    if (!$near((float)$e['amount'], (float)$d['total_price'])) $bad[] = "{$d['document_number']}: event amount {$e['amount']} != total {$d['total_price']}";
                    if (strpos((string)$e['content'], demo_money_fmt((float)$d['total_price'])) === false) $bad[] = "{$d['document_number']}: event text lacks " . demo_money_fmt((float)$d['total_price']);
                }
            }
            if (!$found) $bad[] = "{$d['document_number']}: no timeline event";
        }
        $check('every document has a timeline event whose amount and text carry its total', !$bad, implode("\n", array_slice($bad, 0, 6)));

        // The client block comes from the cast, in the edition's own form.
        $d1 = $byId['demo-offers-1'];
        $c1 = $cast['clients']['C1'];
        $check('the client details of a document are the cast record (legal name, IDs, address)', $d1['client_name'] === $c1['legalName'] && $d1['client_ico'] === $c1['companyId'] && $d1['client_street'] === $c1['street'] && $d1['client_country'] === $c1['country']);
    },
];
