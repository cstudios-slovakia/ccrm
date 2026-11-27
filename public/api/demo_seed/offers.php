<?php
/**
 * Demo seed module: offers (pack-based, phase 4B) - price offers, proforma (advance) invoices
 * and invoices of the story (D6), with their line items and the announcement each one files on
 * the client's timeline.
 *
 * Statuses use the built-in keys draft | sent | approved | rejected | invoiced | cancelled (the
 * defaults of OFFER_STATUSES / INVOICE_STATUSES, which an installation may rename): there is no
 * "accepted" or "expired" - accepted = 'approved', paid = 'approved' on an invoice and 'invoiced'
 * on a proforma that became one, and an expired offer is a 'sent' one whose valid_until passed.
 *
 * Money (C4) follows PriceOffersView.tsx: every unit price in the pack is EUR and is converted
 * with demo_money(); a line's total_price is net (qty x unit x (1 - discount %)), the subtotal is
 * the sum of the lines, VAT is the subtotal x the edition's rate (the COUNTRY decides, not the
 * currency) and total = subtotal + VAT, all rounded to the currency's minor unit. A document
 * with 'basis' (an advance or an instalment) bills a percentage of another document's CONVERTED
 * net subtotal. A total is never converted.
 *
 * demo_offers_compute() is the one place that does this arithmetic, and
 * demo_offers_project_value() lets the projects module (which runs earlier) give each project
 * the total of its accepted offer. The finance module reads the proforma/invoice rows back.
 *
 * Id plan: 1-16 documents, 101+ lines, 201+ offer categories, 2001+ timeline events. Returns rows inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

if (!function_exists('demo_offers_compute')) {

    /** Catalogue icons of the four default USP cards, in the order of billing.usp in the company pack. */
    function demo_offers_usp_icons(): array {
        return ['Ruler', 'Cpu', 'Hammer', 'ShieldCheck'];
    }

    /**
     * The lines and totals of document $key of the offers pack, from CONVERTED unit prices.
     * Needs a context (demo_ctx() has run). Returns
     * ['rows' => [[name, unit, qty, unitPrice, discount, net, itemRef|null, sku|null], ...],
     *  'subtotal', 'vat', 'total', 'rate'].
     */
    function demo_offers_compute(array $pack, string $key, array $cast, array $ctx): array {
        $doc = $pack['docs'][$key] ?? null;
        if ($doc === null) {
            throw new \RuntimeException("demo offers: unknown document '{$key}'");
        }
        $rate = (float)$ctx['vatDefault'];
        $rows = [];
        if (isset($doc['basis'])) {
            $base = demo_offers_compute($pack, (string)$doc['basis'], $cast, $ctx);
            $net = demo_money_minor($base['subtotal'] * (float)$doc['pct'] / 100);
            $rows[] = [demo_text($doc['lineText']), $pack['unitPiece'], 1.0, $net, 0.0, $net, null, null];
        } else {
            foreach ($doc['lines'] as $ln) {
                $qty = (float)$ln['qty'];
                $unitPrice = demo_money((float)$ln['priceEur']);
                $disc = (float)($ln['discount'] ?? 0);
                if (isset($ln['item'])) {
                    $item = $cast['items'][$ln['item']];
                    $name = (string)$item['name'];
                    $unit = (string)$item['unit'];
                    $itemRef = $ln['item'];
                    $sku = (string)$item['sku'];
                } else {
                    $c = $pack['catalog'][$ln['key']];
                    $name = (string)$c['name'];
                    $unit = (string)$c['unit'];
                    $itemRef = null;
                    $sku = null;
                }
                $net = demo_money_minor($qty * $unitPrice * (100 - $disc) / 100);
                $rows[] = [$name, $unit, $qty, $unitPrice, $disc, $net, $itemRef, $sku];
            }
        }
        $subtotal = 0.0;
        foreach ($rows as $r) {
            $subtotal += $r[5];
        }
        $subtotal = demo_money_minor($subtotal);
        $vat = demo_money_minor($subtotal * $rate / 100);
        return ['rows' => $rows, 'subtotal' => $subtotal, 'vat' => $vat, 'total' => demo_money_minor($subtotal + $vat), 'rate' => $rate];
    }

    /** The total of the accepted price offer of project $projectRef (its contract value). */
    function demo_offers_project_value(PDO $pdo, string $projectRef): float {
        $ctx = demo_ctx($pdo);
        $pack = demo_pack($pdo, 'offers');
        $cast = demo_company_pack($ctx['lang']);
        foreach ($pack['docs'] as $key => $doc) {
            if ($doc['type'] === 'price_offer' && ($doc['project'] ?? null) === $projectRef && $doc['status'] === 'approved') {
                return demo_offers_compute($pack, $key, $cast, $ctx)['total'];
            }
        }
        throw new \RuntimeException("demo offers: project {$projectRef} has no approved price offer");
    }
}

function demo_seed_offers(PDO $pdo): int {
    $ctx = demo_ctx($pdo);
    $pack = demo_pack($pdo, 'offers');
    $cast = demo_company_pack($ctx['lang']);
    $users = demo_users($pdo);
    $billing = $cast['billing'];
    $T = $pack['texts'];
    $inserted = 0;

    // --- Clean own rows ------------------------------------------------------------------------------
    $pdo->exec("DELETE FROM `invoice_offer_items` WHERE `id` LIKE 'demo-offers-%' OR `invoice_offer_id` LIKE 'demo-offers-%'");
    $pdo->exec("DELETE FROM `invoices_offers` WHERE `id` LIKE 'demo-offers-%'");
    $pdo->exec("DELETE FROM `timeline_events` WHERE `id` LIKE 'demo-offers-%'");
    $hasCategories = demo_table_exists($pdo, 'offer_categories');
    if ($hasCategories) {
        $pdo->exec("DELETE FROM `offer_categories` WHERE `id` LIKE 'demo-offers-%'");
    }

    // --- Offer categories (a 2-level tree); ids 201+ ----------------------------------------------------
    $catIds = [];
    $catSeq = 200;
    foreach (($pack['categories'] ?? []) as $catKey => $c) {
        $catIds[$catKey] = demo_id('offers', ++$catSeq);
    }
    if ($hasCategories && $catIds) {
        $insCat = $pdo->prepare(
            "INSERT INTO `offer_categories` (`id`, `name`, `parent_id`, `level`, `sort_order`, `color`, `icon`) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $catOrder = 0;
        foreach ($pack['categories'] as $catKey => $c) {
            $catOrder++;
            $insCat->execute([
                $catIds[$catKey], demo_text($c['name']), $c['parent'] === null ? null : $catIds[$c['parent']],
                (int)$c['level'], $catOrder, $c['color'], $c['icon'],
            ]);
            $inserted++;
        }
    }
    $setCategory = $hasCategories ? $pdo->prepare("UPDATE `invoices_offers` SET `category_id` = ? WHERE `id` = ?") : null;

    // Document numbers: per prefix and year, in issue order (ties keep pack order).
    $order = array_keys($pack['docs']);
    usort($order, static function (string $a, string $b) use ($pack): int {
        return [$pack['docs'][$a]['issued'], array_search($a, array_keys($pack['docs']), true)]
           <=> [$pack['docs'][$b]['issued'], array_search($b, array_keys($pack['docs']), true)];
    });
    $counters = [];
    $numbers = [];
    foreach ($order as $key) {
        $d = $pack['docs'][$key];
        $prefix = $pack['numbering'][$d['type']] . '-' . substr(demo_d($d['issued']), 0, 4);
        $counters[$prefix] = ($counters[$prefix] ?? 0) + 1;
        $numbers[$key] = sprintf('%s-%03d', $prefix, $counters[$prefix]);
    }

    $usp = [];
    $icons = demo_offers_usp_icons();
    foreach (array_slice($billing['usp'], 0, 3) as $i => $card) {
        $usp[] = ['title' => demo_text($card['title']), 'subtitle' => demo_text($card['subtitle']), 'icon' => $icons[$i]];
    }
    $uspJson = json_encode($usp, JSON_UNESCAPED_UNICODE);

    $insDoc = $pdo->prepare(
        "INSERT INTO `invoices_offers` (`id`, `document_number`, `type`, `mode`, `lead_id`, `client_id`, `client_name`, `client_email`, `client_phone`,
            `client_street`, `client_city`, `client_postal_code`, `client_country`, `client_ico`, `client_dic`, `client_icdph`,
            `title`, `subject`, `location`, `greeting_note`, `intro_note`, `usp_cards_json`, `reassurance_note`,
            `subtotal`, `vat_amount`, `total_price`, `currency`, `duration_text`, `start_date_text`, `warranty_text`,
            `next_steps_note`, `closing_note`, `sign_off_team`, `status`, `status_changed_at`, `issued_at`, `valid_until`, `due_date`, `created_by`)
         VALUES (?, ?, ?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insItem = $pdo->prepare(
        "INSERT INTO `invoice_offer_items` (`id`, `invoice_offer_id`, `warehouse_item_id`, `sku`, `name`, `description`, `quantity`, `unit`, `unit_price`, `vat_rate`, `discount_pct`, `total_price`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insEv = $pdo->prepare(
        "INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `amount`, `file_type`, `author`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    $n = 0;
    $lineSeq = 0;
    $evSeq = 0;
    foreach ($pack['docs'] as $key => $d) {
        $n++;
        $client = $cast['clients'][$d['client']];
        $clientId = demo_ref_id($d['client']);
        $author = $users[$d['user']]['name'];
        $docId = demo_id('offers', $n);
        $calc = demo_offers_compute($pack, $key, $cast, $ctx);
        $subject = demo_text($d['subject']);
        $isOffer = $d['type'] === 'price_offer';
        $intro = $T['intro'] . ((string)$d['note'] !== '' ? "\n\n" . demo_text($d['note']) : '');

        $insDoc->execute([
            $docId, $numbers[$key], $d['type'], $clientId, $clientId, $client['legalName'], $client['email'], $client['phone'],
            $client['street'], $client['city'], $client['postalCode'], $client['country'], $client['companyId'], $client['taxId'], $client['vatId'],
            $pack['titles'][$d['type']], $subject, $d['location'], str_replace('%name%', (string)$client['contact'], $T['greeting']), $intro, $uspJson, $T['reassurance'],
            $calc['subtotal'], $calc['vat'], $calc['total'], $ctx['currency'], demo_text($billing['durationText']), demo_text($billing['startDateText']), demo_text($billing['warrantyText']),
            demo_text($billing['nextSteps']), $T['closing'], demo_text($T['signOff']), $d['status'], demo_d($d['changed']), demo_d($d['issued']),
            $isOffer ? demo_d($d['issued'] + $d['validDays']) : null, $isOffer ? null : demo_d($d['issued'] + $d['validDays']), $author,
        ]);
        $inserted++;
        if ($setCategory !== null && isset($d['category'], $catIds[$d['category']])) {
            $setCategory->execute([$catIds[$d['category']], $docId]);
        }
        foreach ($calc['rows'] as [$name, $unit, $qty, $unitPrice, $disc, $net, $itemRef, $sku]) {
            $lineSeq++;
            $insItem->execute([
                demo_id('offers', 100 + $lineSeq), $docId, $itemRef === null ? null : demo_ref_id($itemRef), $sku, $name, null,
                $qty, $unit, $unitPrice, $calc['rate'], $disc, $net,
            ]);
            $inserted++;
        }

        // The announcement on the client's timeline (what the Invoicing wizard writes).
        $evSeq++;
        $evType = $isOffer ? 'offer' : ($d['type'] === 'proforma' ? 'proforma_invoice' : 'invoice');
        $insEv->execute([
            demo_id('offers', 2000 + $evSeq), $clientId, $evType, demo_dt($d['issued'], '10:00'),
            $pack['titles'][$d['type']] . ' (' . $numbers[$key] . ')',
            str_replace(['%total%', '%subject%'], [demo_money_fmt($calc['total']), $subject], $T['timeline']),
            $calc['total'], $isOffer ? 'offer' : 'invoice', $author,
        ]);
        $inserted++;
    }
    return $inserted;
}
