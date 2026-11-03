<?php
/**
 * Assertions for the `clients` demo module (phase 4A): clients C1-C6, leads L7-L11, categories,
 * referrals and the timeline. Format and contract: scripts/demo-assert/company.php and the header of
 * public/api/demo_seed/index.php. Runs for sk/EUR, hu/HUF, hu/EUR and en/USD.
 */
return [
    'minRows' => [
        'leads' => 11,
        'client_categories' => 4,
        'lead_categories' => 11,
        'timeline_events' => 40,
    ],
    'idAllow' => [],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $lang = $ctx['lang'];
        $pack = demo_pack_for($lang, 'clients');
        $company = demo_company_pack($lang);
        $users = demo_users();
        $leads = [];
        foreach ($db->rows('leads') as $l) $leads[$l['id']] = $l;

        // Every cast record is there under its fixed id, with the cast's own name, contact, city and country.
        $bad = [];
        foreach (['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'L7', 'L8', 'L9', 'L10', 'L11'] as $ref) {
            $c = $company['clients'][$ref];
            $row = $leads[demo_ref_id($ref)] ?? null;
            if ($row === null) { $bad[] = "{$ref}: no row"; continue; }
            if ($row['name'] !== $c['name'] || $row['contact_person'] !== $c['contact'] || $row['city'] !== $c['city'] || $row['country'] !== $c['country'] || $row['email'] !== $c['email'] || $row['client_type'] !== $c['type']) {
                $bad[] = "{$ref}: row differs from the cast record";
            }
        }
        $check('C1-C6 and L7-L11 exist under demo-clients-1..11, matching the company pack', !$bad, implode("\n", $bad));

        // Clients are won with a positive adjustment (that is what the Clients registry accepts); leads are not.
        $bad = [];
        foreach (['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as $ref) {
            $row = $leads[demo_ref_id($ref)];
            if ((float)$row['adjustment'] <= 0) $bad[] = "{$ref}: adjustment {$row['adjustment']}";
        }
        foreach (['L7', 'L8', 'L9', 'L10', 'L11'] as $ref) {
            if ((float)$leads[demo_ref_id($ref)]['adjustment'] != 0.0) $bad[] = "{$ref}: a lead must have no adjustment";
        }
        $check('clients carry a positive adjustment, leads none', !$bad, implode("\n", $bad));

        // The pipeline stage of every record follows its cast 'stage' and the instance's own state names.
        $states = demo_lead_states($db);
        $bad = [];
        foreach ($company['clients'] as $ref => $c) {
            if ($leads[demo_ref_id($ref)]['status'] !== $states[$c['stage']]) $bad[] = "{$ref}: status '{$leads[demo_ref_id($ref)]['status']}' (expected role {$c['stage']})";
        }
        $check('every record has the pipeline state of its stage (won / new / contacted / offer / lost)', !$bad, implode("\n", $bad));

        // Money is converted from EUR and nothing else.
        $bad = [];
        foreach ($company['clients'] as $ref => $c) {
            $v = (float)$leads[demo_ref_id($ref)]['value'];
            if (abs($v - demo_money((float)$c['valueEur'])) > 0.005) $bad[] = "{$ref}: value {$v} != demo_money({$c['valueEur']})";
        }
        $check('lead value = demo_money(cast valueEur)', !$bad, implode("\n", $bad));

        // Owners are the edition's three logins, divisions are the edition's, sources exist in LEAD_SOURCES.
        $names = array_column($users, 'name');
        $divs = array_map(static fn($d) => $d['name'], $company['divisions']);
        $bad = [];
        foreach ($leads as $id => $row) {
            if (!in_array($row['owner'], $names, true)) $bad[] = "{$id}: owner '{$row['owner']}'";
            if (!in_array($row['division'], $divs, true)) $bad[] = "{$id}: division '{$row['division']}'";
        }
        $check('owners are the three logins, divisions the edition\'s two (never Cstudios)', !$bad, implode("\n", $bad));

        // Referrals: every referral ref in the pack is a real, written record, and the row carries its id.
        $bad = [];
        foreach ($pack['leads'] as $ref => $l) {
            $want = $l['referral'] === null ? null : demo_ref_id($l['referral']);
            if ($want !== null && !isset($leads[$want])) $bad[] = "{$ref}: referral {$l['referral']} was not written";
            if (($leads[demo_ref_id($ref)]['referral_lead_id'] ?? null) !== $want) $bad[] = "{$ref}: referral_lead_id";
        }
        $check('referrals point at written records', !$bad && count(array_filter($pack['leads'], static fn($l) => $l['referral'] !== null)) >= 3, implode("\n", $bad));

        // Categories: a 2-level tree, every record in a category of the tree, lead categories from LEAD_CATEGORIES.
        $cats = [];
        foreach ($db->rows('client_categories') as $c) $cats[$c['id']] = $c;
        $hasChild = false;
        foreach ($cats as $c) if ($c['parent_id'] !== null && isset($cats[$c['parent_id']]) && (int)$c['level'] === 2) $hasChild = true;
        $bad = [];
        foreach ($leads as $id => $row) if ($row['client_category_id'] === null || !isset($cats[$row['client_category_id']])) $bad[] = "{$id}: client_category_id";
        $check('client categories form a two-level tree and every record has one', $hasChild && !$bad, implode("\n", $bad));
        $lc = [];
        foreach ($db->rows('lead_categories') as $r) $lc[$r['lead_id']][] = $r['category_name'];
        $check('every record has at least one lead category', count($lc) === 11 && !array_diff(array_keys($leads), array_keys($lc)));

        // Timeline: every card belongs to a written record, in the past, in the pack's order.
        $events = $db->rows('timeline_events');
        $bad = [];
        $today = (new DateTimeImmutable('today'))->format('Y-m-d');
        foreach ($events as $e) {
            if (!isset($leads[$e['lead_id']])) $bad[] = "{$e['id']}: lead {$e['lead_id']}";
            if (substr((string)$e['timestamp'], 0, 10) > $today) $bad[] = "{$e['id']}: in the future";
            if ((string)$e['title'] === '') $bad[] = "{$e['id']}: no title";
        }
        // Every card of every module must belong to a written record, be in the past and have a title (above);
        // the count is of THIS module's cards only: offers, mail and WhatsApp file their own (A5 #30).
        $own = array_filter($events, static fn($e) => strpos((string)$e['id'], 'demo-clients-') === 0);
        $check('every timeline card belongs to a written record, is not in the future and has a title', !$bad && count($own) === count($pack['timeline']), implode("\n", array_slice($bad, 0, 8)));
        $byLead = [];
        foreach ($events as $e) $byLead[$e['lead_id']][] = $e;
        $check('every client and lead has at least one timeline card', count($byLead) === 11);

        // Status cards use the instance's state name; a won client has the won card.
        $won = $states['won'];
        $okStatus = true;
        foreach (['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as $ref) {
            $has = false;
            foreach ($byLead[demo_ref_id($ref)] ?? [] as $e) if ($e['type'] === 'status_change' && strpos((string)$e['title'], $won) !== false) $has = true;
            if (!$has) $okStatus = false;
        }
        $check('every client has its "status changed to won" card', $okStatus);

        // L9: the web-form inquiry (no author) and the two-mail thread about the sink cutout.
        $l9 = $byLead[demo_ref_id('L9')] ?? [];
        $form = null; $in = null; $out = null;
        foreach ($l9 as $e) {
            if ($e['type'] === 'note' && $e['author'] === null) $form = $e;
            if ($e['type'] === 'email' && (int)$e['is_outgoing'] === 0) $in = $e;
            if ($e['type'] === 'email' && (int)$e['is_outgoing'] === 1) $out = $e;
        }
        $contactEmail = $company['clients']['L9']['email'];
        $salesEmail = $users['sales']['email'];
        $check('L9 has the web-form inquiry note without an author', $form !== null && strpos((string)$form['content'], $company['clients']['L9']['contact']) !== false);
        $check('L9 has a two-mail thread: incoming first, our reply after, headers carry the real addresses',
            $in !== null && $out !== null && $in['timestamp'] < $out['timestamp']
            && strpos((string)$in['content'], "From: {$company['clients']['L9']['contact']} <{$contactEmail}>") === 0
            && strpos((string)$in['content'], "To: {$users['sales']['name']} <{$salesEmail}>") !== false
            && strpos((string)$out['content'], "From: {$users['sales']['name']} <{$salesEmail}>") === 0
            && strpos((string)$out['content'], "To: {$company['clients']['L9']['contact']} <{$contactEmail}>") !== false
            && $out['author'] === $users['sales']['name'] && $in['author'] === $users['sales']['name']);
        $check('L9 mail thread mentions the mitred edge price in the chosen currency (no raw {m:...})', $out !== null && strpos((string)$out['content'], demo_money_fmt(demo_money(180.0))) !== false, (string)($out['content'] ?? ''));
        $l7 = $byLead[demo_ref_id('L7')] ?? [];
        $check('L7 has the web-form inquiry from yesterday', count($l7) === 1 && substr((string)$l7[0]['timestamp'], 0, 10) === (new DateTimeImmutable('yesterday'))->format('Y-m-d') && $l7[0]['author'] === null);

        // A re-run leaves exactly the same rows (the runner also checks the totals; this checks the leads).
        $before = count($db->rows('leads'));
        demo_seed_all($db, ['only' => ['clients'], 'writeDataset' => false]);
        $check('re-running the module does not duplicate the leads', count($db->rows('leads')) === $before);
    },
];
