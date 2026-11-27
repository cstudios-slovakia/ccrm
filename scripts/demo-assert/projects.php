<?php
/**
 * Assertions for the `projects` demo module (phase 4B). Format: scripts/demo-assert/company.php.
 * A project's contract value must equal the total of its accepted offer in EVERY currency (the Invoicing and Finance
 * tabs bill against it); the budget is the pack's EUR converted once.
 */
return [
    'minRows' => [
        'project_types' => 1,
        'projects' => 5,
        'project_managers' => 8,
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        demo_ctx_force($ctx['lang'], $ctx['currency']);
        $tol = $ctx['whole'] ? 1.0 : 0.01;
        $pack = demo_pack_for($ctx['lang'], 'projects');
        $cast = demo_company_pack($ctx['lang']);
        $offerPack = demo_pack_for($ctx['lang'], 'offers');
        $offerKeys = array_keys($offerPack['docs']);
        $offerRows = [];
        foreach ($db->rows('invoices_offers') as $d) $offerRows[$d['id']] = $d;
        $projects = [];
        foreach ($db->rows('projects') as $p) $projects[$p['id']] = $p;
        $names = array_map(static fn($u) => $u['name'], $cast['users']);

        $check('five projects P1-P5 on the demo project type, named by the cast', count($projects) === 5
            && array_reduce(array_keys($cast['projects']), fn($ok, $ref) => $ok && ($projects[demo_ref_id($ref)]['name'] ?? null) === $cast['projects'][$ref]['name'] && $projects[demo_ref_id($ref)]['project_type_id'] === 'demo-projects-0', true));

        // Value = total of the accepted price offer of the project.
        $bad = [];
        foreach ($cast['projects'] as $ref => $rec) {
            foreach ($offerKeys as $i => $key) {
                $doc = $offerPack['docs'][$key];
                if ($doc['type'] !== 'price_offer' || ($doc['project'] ?? null) !== $ref || $doc['status'] !== 'approved') continue;
                $offer = $offerRows['demo-offers-' . ($i + 1)] ?? null;
                if ($offer === null) { $bad[] = "{$ref}: offers module did not run"; continue; }
                $v = (float)$projects[demo_ref_id($ref)]['value'];
                if (abs($v - (float)$offer['total_price']) > $tol) $bad[] = "{$ref}: value {$v} != accepted offer total {$offer['total_price']}";
                if ($offer['lead_id'] !== $projects[demo_ref_id($ref)]['lead_id']) $bad[] = "{$ref}: the offer belongs to another client";
            }
        }
        $check('a project\'s value is the total of its accepted offer', !$bad, implode("\n", $bad));

        $bad = [];
        foreach ($pack['projects'] as $ref => $p) {
            $row = $projects[demo_ref_id($ref)];
            if (abs((float)$row['budget'] - demo_money((float)$p['budgetEur'])) > 1e-9) $bad[] = "{$ref}: budget {$row['budget']}";
            if (abs((float)$row['billable_rate'] - demo_money((float)$pack['rateEur'])) > 1e-9) $bad[] = "{$ref}: billable rate {$row['billable_rate']}";
            if ($row['lead_id'] !== demo_ref_id($cast['projects'][$ref]['client']) || $row['client_id'] !== $row['lead_id']) $bad[] = "{$ref}: client link {$row['lead_id']}";
        }
        $check('budget and billable rate are the pack\'s EUR converted; every project points at its client', !$bad, implode("\n", $bad));

        $divisions = array_map(static fn($d) => $d['name'], $cast['divisions']);
        $check('every project is in one of the edition\'s two divisions (no Cstudios)', array_reduce($projects, fn($ok, $p) => $ok && in_array($p['division'], $divisions, true), true));
        $p3 = $projects['demo-projects-3'];
        $p2 = $projects['demo-projects-2'];
        $p5 = $projects['demo-projects-5'];
        $check('P3 is delayed (deadline passed, reason written); P2 is completed and finished; P5 starts in the future',
            $p3['status'] === 'active' && $p3['completion_deadline'] < demo_d(0) && trim((string)$p3['delay_reason']) !== ''
            && $p2['status'] === 'completed' && $p2['finished_at'] !== null && $p5['status'] === 'new' && $p5['start_date'] > demo_d(0));

        $mgr = [];
        foreach ($db->rows('project_managers') as $m) $mgr[$m['project_id']][] = $m['user_id'];
        $check('every project has managers, stored by NAME (the Projects UI lists users by name)', count($mgr) === 5
            && array_reduce($mgr, fn($ok, $list) => $ok && $list && !array_diff($list, $names), true), json_encode($mgr, JSON_UNESCAPED_UNICODE));

        // The per-type tables.
        $type = $db->rows('project_types')[0] ?? [];
        $attrs = json_decode((string)($type['attributes_json'] ?? '[]'), true) ?: [];
        $events = json_decode((string)($type['timeline_event_types_json'] ?? '[]'), true) ?: [];
        $check('the project type has 6 attributes, 4 timeline event types and 2 file slots, named in the edition\'s language',
            count($attrs) === 6 && count($events) === 4 && count(json_decode((string)$type['file_fields_json'], true) ?: []) === 2 && $type['name'] === $pack['type']['name']);
        $data = $db->rows('proj_data_demoprojects0');
        $tl = $db->rows('proj_timeline_demoprojects0');
        $gantt = $db->rows('proj_gantt_demoprojects0');
        $check('5 attribute rows, 15 timeline events, 15 Gantt rows', count($data) === 5 && count($tl) === 15 && count($gantt) === 15, count($data) . '/' . count($tl) . '/' . count($gantt));
        $options = $pack['type']['attributes']['material']['options'];
        $okValues = true;
        foreach ($data as $r) {
            if (!in_array($r['attr_material'], $options, true) || !in_array($r['attr_thickness'], $pack['type']['attributes']['thickness']['options'], true)) $okValues = false;
            if (!is_array(json_decode((string)$r['attr_checks'], true))) $okValues = false;
        }
        $check('select attributes hold one of their options, checklists are JSON lists', $okValues);
        $eventIds = array_column($events, 'id');
        $check('timeline events use the type\'s event ids and Gantt rows run forward in time with progress 0-100',
            array_reduce($tl, fn($ok, $e) => $ok && in_array($e['event_type'], $eventIds, true), true)
            && array_reduce($gantt, fn($ok, $g) => $ok && $g['start_date'] <= $g['end_date'] && $g['progress'] >= 0 && $g['progress'] <= 100, true));
    },
];
