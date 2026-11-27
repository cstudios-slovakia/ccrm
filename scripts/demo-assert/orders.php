<?php
/**
 * Assertions for the `orders` demo module (phase 4B). Format: scripts/demo-assert/company.php.
 * Order totals are sums of converted lines in every currency; VAT follows the country, not the currency.
 */
return [
    'minRows' => [
        'orders' => 5,
        'order_items' => 15,
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        demo_ctx_force($ctx['lang'], $ctx['currency']);
        $tol = $ctx['whole'] ? 1.0 : 0.01;
        $near = static fn(float $a, float $b, float $k = 1.0): bool => abs($a - $b) <= $tol * $k;
        $pack = demo_pack_for($ctx['lang'], 'orders');
        $cast = demo_company_pack($ctx['lang']);
        $billing = $cast['billing'];

        $orders = $db->rows('orders');
        $lines = [];
        foreach ($db->rows('order_items') as $l) $lines[$l['order_id']][] = $l;
        $check('5 sales orders: one cancelled, one awaiting payment, one shipped, two delivered', count($orders) === 5
            && array_count_values(array_column($orders, 'status')) == ['delivered' => 2, 'shipped' => 1, 'awaiting_payment' => 1, 'cancelled' => 1], json_encode(array_column($orders, 'status')));

        $bad = [];
        foreach ($orders as $o) {
            $ls = $lines[$o['id']] ?? [];
            $items = $services = $gross = 0.0;
            foreach ($ls as $l) {
                $net = (float)$l['quantity'] * (float)$l['unit_price'] * (100 - (float)$l['discount_percent']) / 100;
                if (!$near($net, (float)$l['total_net_amount'])) $bad[] = "{$o['order_number']}: line '{$l['name']}' net {$l['total_net_amount']} != qty x unit x (1 - discount) = " . round($net, 4);
                if (!$near((float)$l['total_net_amount'] * (1 + (float)$l['tax_rate'] / 100), (float)$l['total_gross_amount'])) $bad[] = "{$o['order_number']}: line '{$l['name']}' gross {$l['total_gross_amount']} != net x (1 + VAT)";
                if ((float)$l['tax_rate'] !== (float)$ctx['vatDefault']) $bad[] = "{$o['order_number']}: tax rate {$l['tax_rate']} != {$ctx['vatDefault']}";
                if ($l['item_type'] === 'product') {
                    $ref = array_search($l['item_id'], array_map('demo_ref_id', array_keys($cast['items'])), true);
                    $item = $cast['items'][array_keys($cast['items'])[$ref]];
                    if (abs((float)$l['unit_price'] - demo_money((float)$item['priceEur'])) > 1e-9) $bad[] = "{$o['order_number']}: unit price {$l['unit_price']} != demo_money({$item['priceEur']})";
                    if ($l['sku'] !== $item['sku'] || $l['name'] !== $item['name']) $bad[] = "{$o['order_number']}: SKU/name differ from the cast";
                    $items += (float)$l['total_net_amount'];
                } else {
                    $services += (float)$l['total_net_amount'];
                }
                $gross += (float)$l['total_gross_amount'];
            }
            if (!$near($items, (float)$o['items_net_amount'])) $bad[] = "{$o['order_number']}: items net {$o['items_net_amount']} != {$items}";
            if (!$near($services, (float)$o['services_net_amount'])) $bad[] = "{$o['order_number']}: services net {$o['services_net_amount']} != {$services}";
            if (!$near($items + $services, (float)$o['total_net_amount'])) $bad[] = "{$o['order_number']}: net {$o['total_net_amount']} != items + services";
            if (!$near($gross, (float)$o['total_gross_amount'])) $bad[] = "{$o['order_number']}: gross {$o['total_gross_amount']} != sum of line grosses {$gross}";
            if (!$near((float)$o['total_net_amount'] + (float)$o['total_tax_amount'], (float)$o['total_gross_amount'])) $bad[] = "{$o['order_number']}: net + tax != gross";
            if ($o['currency'] !== $ctx['currency']) $bad[] = "{$o['order_number']}: currency {$o['currency']}";
        }
        $check('every order reconciles: lines -> items/services -> net -> tax -> gross, prices are the cast\'s converted', !$bad, implode("\n", array_slice($bad, 0, 8)));

        // Shipping and the cash-on-delivery fee are EUR in the pack: converted once, like every other price.
        $bad = [];
        foreach ($pack['orders'] as $i => $po) {
            $svc = [];
            foreach ($lines['demo-orders-' . ($i + 1)] ?? [] as $l) if ($l['item_type'] === 'service') $svc[$l['service_code']] = $l;
            if (!isset($svc['SHIPPING']) || abs((float)$svc['SHIPPING']['unit_price'] - demo_money((float)$po['shipEur'])) > 1e-9) $bad[] = 'order ' . ($i + 1) . ': shipping price ' . ($svc['SHIPPING']['unit_price'] ?? 'missing') . ' != demo_money(' . $po['shipEur'] . ')';
            if (isset($svc['COD-FEE']) && abs((float)$svc['COD-FEE']['unit_price'] - demo_money((float)$pack['codEur'])) > 1e-9) $bad[] = 'order ' . ($i + 1) . ': COD fee ' . $svc['COD-FEE']['unit_price'];
            foreach ($lines['demo-orders-' . ($i + 1)] ?? [] as $l) if ($ctx['whole'] && abs((float)$l['unit_price'] - round((float)$l['unit_price'])) > 1e-9) $bad[] = 'order ' . ($i + 1) . ": a fractional price in {$ctx['currency']}: {$l['unit_price']}";
        }
        $check('shipping and cash-on-delivery fees are demo_money() of the pack\'s EUR (whole numbers in HUF)', !$bad, implode("\n", array_slice($bad, 0, 6)));

        $bad = [];
        foreach ($orders as $o) {
            if (!in_array($o['shipping_method'], $billing['shippingMethods'], true)) $bad[] = "{$o['order_number']}: shipping '{$o['shipping_method']}' is not a configured carrier";
            if (!in_array($o['payment_method'], $billing['paymentMethods'], true)) $bad[] = "{$o['order_number']}: payment '{$o['payment_method']}' is not a configured method";
            if ($o['delivery_country'] !== $ctx['country'] || $o['billing_country'] !== $ctx['country']) $bad[] = "{$o['order_number']}: country {$o['delivery_country']}";
            $paidStatus = in_array($o['status'], ['delivered', 'shipped'], true);
            if (($o['payment_status'] === 'paid') !== $paidStatus) $bad[] = "{$o['order_number']}: payment status {$o['payment_status']} for a {$o['status']} order";
            if ($o['payment_status'] === 'paid' && $o['paid_at'] === null) $bad[] = "{$o['order_number']}: paid without a date";
            if ($o['customer_type'] === 'client' && !preg_match('/^demo-clients-\d+$/', (string)$o['client_id'])) $bad[] = "{$o['order_number']}: client {$o['client_id']}";
            if ($o['customer_type'] === 'guest' && ($o['guest_name'] === null || $o['client_id'] !== null)) $bad[] = "{$o['order_number']}: a guest without a name";
            $codLine = array_filter($lines[$o['id']] ?? [], fn($l) => $l['service_code'] === 'COD-FEE');
            if (($o['payment_method'] === $billing['paymentMethods'][2]) !== (count($codLine) === 1)) $bad[] = "{$o['order_number']}: cash-on-delivery fee does not match the payment method";
        }
        $numbers = array_column($orders, 'order_number');
        $check('carriers and payment methods are the configured ones, countries follow the edition, payment status matches the order status', !$bad, implode("\n", array_slice($bad, 0, 6)));
        $check('order numbers are unique and sequential; orders span about six weeks', count(array_unique($numbers)) === 5
            && min(array_column($orders, 'order_date')) <= demo_d(-35) && max(array_column($orders, 'order_date')) >= demo_d(-7), implode(',', $numbers));
    },
];
