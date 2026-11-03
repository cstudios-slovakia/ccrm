<?php
/**
 * Demo seed module: clients (clients C1-C6, leads L7-L11, categories, referrals, timeline).
 *
 * Code only: every name, address, id, number and sentence comes from
 * packs/<lang>/company.php (the cast, by ref) and packs/<lang>/clients.php (what happens
 * to them). Contract: the header of index.php.
 *
 * How the app tells a lead from a client (src/utils/clientRecord.ts): leads and clients share
 * the `leads` table, and a record is a client when its id starts with 'client-' OR it carries a
 * positive `adjustment` (the value of earlier orders). Demo ids must start with 'demo-', so the
 * clients get a positive `adjustment` plus the won state - exactly what the Clients registry
 * accepts. The stage is NOT what decides it.
 *
 * Id plan:  1-11     leads rows (refs C1-C6 = 1-6, L7-L11 = 7-11; demo_ref_id())
 *           101-104  client_categories (the customer category tree)
 *           1001+    timeline_events
 *
 * Pack shape (clients):
 *   categories  key => [name, parent (key|null), level, color, icon]
 *   statusTitle sprintf pattern for a status_change card, %s = the state's name
 *   leads       ref => [source, owner (role ref), division (index), adjustmentEur, leadCategories (indexes),
 *                       clientCategory (key|null), referral (ref|null), day, legalForm, interest]
 *   timeline    list of [client (ref), day, time, type, user (role ref|null), outgoing, title, content,
 *               headers (wrap e-mail From/To/Subject above the body, as mail_broker.php does), status (state role|null)]
 *
 * Returns the number of rows inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

if (!function_exists('demo_seed_clients')) {

    /** Lead-source role (pack) -> index into the instance's LEAD_SOURCES (showroom, facebook, instagram, website). */
    function demo_clients_source_index(string $role): int {
        $map = ['showroom' => 0, 'facebook' => 1, 'instagram' => 2, 'website' => 3];
        if (!isset($map[$role])) {
            throw new \InvalidArgumentException("clients pack: unknown lead source role '{$role}'");
        }
        return $map[$role];
    }

    function demo_seed_clients(PDO $pdo): int {
        $pack = demo_pack($pdo, 'clients');
        $users = demo_users($pdo);
        $states = demo_lead_states($pdo);
        $sources = demo_lead_sources($pdo);
        $cats = demo_lead_categories($pdo);
        $divisions = demo_divisions($pdo);
        $rows = 0;

        // --- Clean own rows (the FK cascades clear categories and events) ---------------
        $pdo->exec("DELETE FROM `timeline_events` WHERE `id` LIKE 'demo-clients-%'");
        $pdo->exec("DELETE FROM `lead_categories` WHERE `lead_id` LIKE 'demo-clients-%'");
        $pdo->exec("DELETE FROM `leads` WHERE `id` LIKE 'demo-clients-%'");
        $hasCategories = demo_table_exists($pdo, 'client_categories');
        if ($hasCategories) {
            $pdo->exec("DELETE FROM `client_categories` WHERE `id` LIKE 'demo-clients-%'");
        }

        // --- Customer categories (a 2-level tree) ----------------------------------------
        $catIds = [];
        $n = 100;
        foreach ($pack['categories'] as $key => $c) {
            $catIds[$key] = demo_id('clients', ++$n);
        }
        if ($hasCategories) {
            $insCat = $pdo->prepare(
                "INSERT INTO `client_categories` (`id`, `name`, `parent_id`, `level`, `sort_order`, `color`, `icon`) VALUES (?, ?, ?, ?, ?, ?, ?)"
            );
            $order = 0;
            foreach ($pack['categories'] as $key => $c) {
                $order++;
                $insCat->execute([
                    $catIds[$key], demo_text($c['name']), $c['parent'] === null ? null : $catIds[$c['parent']],
                    (int)$c['level'], $order, $c['color'], $c['icon'],
                ]);
                $rows++;
            }
        }

        // --- Clients and leads --------------------------------------------------------------
        $insLead = $pdo->prepare(
            "INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `division`, `value`, `adjustment`, `rating`,
                `phone`, `email`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`, `street`, `postal_code`, `country`,
                `interest_note`, `referral_lead_id`, `client_category_id`, `legal_form`, `created_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $insLeadCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
        $interest = [];
        foreach ($pack['leads'] as $ref => $l) {
            $c = demo_ref($pdo, $ref);
            $interest[$ref] = demo_text($l['interest']);
            $referral = $l['referral'] === null ? null : demo_ref_id($l['referral']);
            $sourceIdx = min(demo_clients_source_index($l['source']), count($sources) - 1);
            $division = $divisions[min((int)$l['division'], count($divisions) - 1)] ?? null;
            $nz = static fn($v) => ($v === '' || $v === null) ? null : $v;
            $insLead->execute([
                $c['id'], $c['name'], $c['city'], $c['type'], $states[$c['stage']], $sources[$sourceIdx],
                $users[$l['owner']]['name'], $division,
                demo_money((float)$c['valueEur']), demo_money((float)$l['adjustmentEur']), (int)$c['rating'],
                $c['phone'], $c['email'], $nz($c['companyId']), $nz($c['taxId']), $nz($c['vatId']), $c['contact'], $nz($c['website']),
                $c['street'], $c['postalCode'], $c['country'],
                $interest[$ref], $referral, $l['clientCategory'] === null ? null : $catIds[$l['clientCategory']],
                $nz($l['legalForm']), demo_d((int)$l['day']),
            ]);
            $rows++;
            foreach ($l['leadCategories'] as $ci) {
                if (isset($cats[$ci])) {
                    $insLeadCat->execute([$c['id'], $cats[$ci]]);
                    $rows++;
                }
            }
        }

        // --- Timeline -------------------------------------------------------------------------
        // Calls, mails, visits, notes and status changes. Offers and invoices are filed by the
        // offers module with real amounts. The inquiry form note has no author (nobody here
        // triggered it), exactly as pipeline.php writes it.
        $insEv = $pdo->prepare(
            "INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `extra_time`, `is_outgoing`, `author`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $seq = 0;
        foreach ($pack['timeline'] as $e) {
            $seq++;
            $client = demo_ref($pdo, $e['client']);
            $user = $e['user'] === null ? null : $users[$e['user']];
            if ($e['status'] !== null) {
                $title = sprintf($pack['statusTitle'], $states[$e['status']]);
                $content = null;
            } else {
                $title = demo_text($e['title']);
                $content = $e['content'] === null ? null : demo_text($e['content']);
                if ($e['headers'] && $content !== null) {
                    // mail_broker.php files a mailbox message as: headers, a blank line, the body.
                    $us = $user === null ? ['name' => '', 'email' => ''] : $user;
                    [$from, $to] = $e['outgoing']
                        ? [[$us['name'], $us['email']], [$client['contact'], $client['email']]]
                        : [[$client['contact'], $client['email']], [$us['name'], $us['email']]];
                    $content = "From: {$from[0]} <{$from[1]}>\nTo: {$to[0]} <{$to[1]}>\nSubject: {$title}\n\n" . $content;
                }
            }
            $insEv->execute([
                demo_id('clients', 1000 + $seq), $client['id'], $e['type'], demo_dt((int)$e['day'], $e['time']), $title, $content,
                $e['type'] === 'appointment' ? $e['time'] : null, $e['outgoing'] ? 1 : 0, $user === null ? null : $user['name'],
            ]);
            $rows++;
        }
        return $rows;
    }
}
