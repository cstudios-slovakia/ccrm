<?php
/**
 * Demo seed module: orders (new, phase 4B) - five e-shop orders for the care products
 * (I5-I7) over ~6 weeks: delivered, shipped, awaiting payment and one cancelled. Replaces
 * ccrm_seed_default_orders (that legacy seeder goes in phase 5).
 *
 * Content is in packs/<lang>/orders.php (customers, dates, statuses, quantities, notes); the
 * product names, SKUs, units and prices come from the cast in packs/<lang>/company.php, the
 * carrier and payment-method names from its billing section (C7). This file holds code only.
 *
 * Money (C4): the unit price of every product line is the cast's priceEur converted with
 * demo_money(); shipping and the cash-on-delivery fee are EUR in the pack, converted the same
 * way. Line net = qty x unit x (1 - discount %), line gross = net x (1 + VAT %); the order
 * totals are the sums of the converted lines (net, tax = gross - net, gross), VAT being the
 * edition's country rate. A total is never converted.
 *
 * Id plan: 1-5 orders, 101+ order lines. Returns the number of rows inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

function demo_seed_orders(PDO $pdo): int {
    $ctx = demo_ctx($pdo);
    $pack = demo_pack($pdo, 'orders');
    $cast = demo_company_pack($ctx['lang']);
    $users = demo_users($pdo);
    $billing = $cast['billing'];
    $rate = (float)$ctx['vatDefault'];
    $inserted = 0;

    $pdo->exec("DELETE FROM `order_items` WHERE `id` LIKE 'demo-orders-%' OR `order_id` LIKE 'demo-orders-%'");
    $pdo->exec("DELETE FROM `orders` WHERE `id` LIKE 'demo-orders-%'");

    $insOrder = $pdo->prepare(
        "INSERT INTO `orders` (`id`, `order_number`, `type`, `status`, `customer_type`, `client_id`, `guest_name`, `guest_email`, `guest_phone`,
            `delivery_recipient`, `delivery_street`, `delivery_city`, `delivery_zip`, `delivery_country`, `delivery_phone`, `delivery_notes`,
            `shipping_method`, `shipping_pickup_point_id`, `shipping_tracking_number`,
            `billing_name`, `billing_street`, `billing_city`, `billing_zip`, `billing_country`, `billing_ico`, `billing_dic`, `billing_ic_dph`,
            `payment_method`, `payment_status`, `paid_at`, `payment_reference`, `currency`,
            `items_net_amount`, `services_net_amount`, `total_net_amount`, `total_tax_amount`, `total_gross_amount`,
            `order_date`, `requested_delivery_date`, `confirmed_delivery_date`, `warehouse_id`, `notes`, `customer_note`, `created_by`)
         VALUES (?, ?, 'sales', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insLine = $pdo->prepare(
        "INSERT INTO `order_items` (`id`, `order_id`, `item_type`, `item_id`, `sku`, `ean`, `name`, `variant_title`, `quantity`, `unit`, `unit_price`,
            `discount_percent`, `tax_rate`, `total_net_amount`, `total_gross_amount`, `fulfilled_quantity`, `service_code`, `notes`, `sort_order`)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    $orNull = static fn($v) => ((string)$v === '') ? null : $v;
    $n = 0;
    $lineSeq = 0;
    foreach ($pack['orders'] as $o) {
        $n++;
        $orderId = demo_id('orders', $n);
        $number = sprintf('%s-%s-%04d', $pack['numbering'], substr(demo_d($o['day']), 0, 4), $n);
        $done = in_array($o['status'], ['delivered', 'shipped'], true);
        $paid = $o['paidDay'] !== null;
        $method = (string)$billing['shippingMethods'][$o['shipping']];
        $isCod = $o['payment'] === 2;

        // Lines first: totals are sums of the converted lines.
        $lines = [];
        foreach ($o['lines'] as $ln) {
            $item = $cast['items'][$ln['item']];
            $qty = (float)$ln['qty'];
            $unit = demo_money((float)$item['priceEur']);
            $disc = (float)($ln['discount'] ?? 0);
            $net = demo_money_minor($qty * $unit * (100 - $disc) / 100);
            $lines[] = ['product', $ln['item'], (string)$item['sku'], '85880' . str_pad((string)(100 + (int)substr($ln['item'], 1)), 7, '0', STR_PAD_LEFT),
                (string)$item['name'], $qty, (string)$item['unit'], $unit, $disc, $net, demo_money_minor($net * (100 + $rate) / 100), $done ? $qty : 0.0, null, null];
        }
        $services = [[str_replace('%method%', $method, $pack['texts']['shipping']), 'SRV-SHIP', 'SHIPPING', $method, demo_money((float)$o['shipEur'])]];
        if ($isCod) {
            $services[] = [$pack['texts']['cod'], 'SRV-COD', 'COD-FEE', null, demo_money((float)$pack['codEur'])];
        }
        foreach ($services as [$name, $sku, $code, $notes, $price]) {
            $lines[] = ['service', null, $sku, null, $name, 1.0, (string)$pack['texts']['unitService'], $price, 0.0, $price, demo_money_minor($price * (100 + $rate) / 100), $done ? 1.0 : 0.0, $code, $notes];
        }
        $itemsNet = 0.0;
        $servicesNet = 0.0;
        $gross = 0.0;
        foreach ($lines as $l) {
            if ($l[0] === 'product') {
                $itemsNet += $l[9];
            } else {
                $servicesNet += $l[9];
            }
            $gross += $l[10];
        }
        $itemsNet = demo_money_minor($itemsNet);
        $servicesNet = demo_money_minor($servicesNet);
        $totalNet = demo_money_minor($itemsNet + $servicesNet);
        $gross = demo_money_minor($gross);

        // The customer: a registered client from the cast, or a guest of the pack.
        if (isset($o['client'])) {
            $c = $cast['clients'][$o['client']];
            $isBusiness = $c['type'] !== 'person';
            $clientId = demo_ref_id($o['client']);
            $customerType = 'client';
            $guest = [null, null, null];
            $recipient = (string)$c['contact'];
            [$street, $city, $zip, $phone] = [$c['street'], $c['city'], $c['postalCode'], $c['phone']];
            $billName = $c['legalName'];
            [$ico, $dic, $icdph] = $isBusiness ? [$orNull($c['companyId']), $orNull($c['taxId']), $orNull($c['vatId'])] : [null, null, null];
        } else {
            $g = $o['guest'];
            $clientId = null;
            $customerType = 'guest';
            $guest = [$g['name'], $g['email'], $g['phone']];
            $recipient = $g['name'];
            [$street, $city, $zip, $phone] = [$g['street'], $g['city'], $g['zip'], $g['phone']];
            $billName = $g['name'];
            [$ico, $dic, $icdph] = [null, null, null];
        }

        $insOrder->execute([
            $orderId, $number, $o['status'], $customerType, $clientId, $guest[0], $guest[1], $guest[2],
            $recipient, $street, $city, $zip, $ctx['country'], $phone, $orNull($o['deliveryNote']),
            $method, $orNull($o['pickup']), $orNull($o['tracking']),
            $billName, $street, $city, $zip, $ctx['country'], $ico, $dic, $icdph,
            (string)$billing['paymentMethods'][$o['payment']], $paid ? 'paid' : 'unpaid', $paid ? demo_dt($o['paidDay'], '14:20') : null, $paid ? $number : null, $ctx['currency'],
            $itemsNet, $servicesNet, $totalNet, demo_money_minor($gross - $totalNet), $gross,
            demo_d($o['day']), demo_d($o['day'] + 4), $o['deliveryDay'] === null ? null : demo_d($o['deliveryDay']), demo_ref_id('W1'),
            $orNull($o['note']), $orNull($o['customerNote']), $users[$o['user']]['name'],
        ]);
        $inserted++;

        $sort = 0;
        foreach ($lines as [$type, $itemRef, $sku, $ean, $name, $qty, $unit, $unitPrice, $disc, $net, $lineGross, $fulfilled, $code, $notes]) {
            $lineSeq++;
            $sort++;
            $insLine->execute([
                demo_id('orders', 100 + $lineSeq), $orderId, $type, $itemRef === null ? null : demo_ref_id($itemRef), $sku, $ean, $name,
                $qty, $unit, $unitPrice, $disc, $rate, $net, $lineGross, $fulfilled, $code, $notes, $sort,
            ]);
            $inserted++;
        }
    }
    return $inserted;
}
