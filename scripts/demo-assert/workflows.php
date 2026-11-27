<?php
/**
 * Assertions for the `workflows` demo module (format: header of public/api/demo_seed/index.php).
 *
 * Seven workflows (5 active, 2 inactive), 20 run-history rows over 14 days with two readable
 * failures, and every state / source / project type a node names must exist in the settings.
 */
return [
    'minRows' => [
        'workflows' => 7,
        'workflow_logs' => 20,
    ],
    'idAllow' => [],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $pack = demo_pack_for($ctx['lang'], 'workflows');
        $workflows = $db->rows('workflows');
        $logs = $db->rows('workflow_logs');
        $settings = $db->settings();
        $list = static function (string $key, string $default) use ($db, $settings): array {
            $decoded = json_decode($settings[$key] ?? 'null', true);
            return is_array($decoded) && $decoded ? $decoded : demo_default_list($db, $default);
        };
        // What the installer writes for this language (the fake has no installer): the setting if present, else the default list.
        $states = $list('LEAD_STATES', 'leadStates');
        $sources = $list('LEAD_SOURCES', 'leadSources');

        $check('seven workflows: 5 active, 2 inactive', count($workflows) === 7 && array_sum(array_column($workflows, 'is_active')) === 5,
            json_encode(array_column($workflows, 'is_active')));
        $inactive = array_values(array_map(static fn($w) => $w['id'], array_filter($workflows, static fn($w) => (int)$w['is_active'] === 0)));
        $check('the inactive two are the AI ones (they need a key a demo install does not have)', $inactive === ['demo-workflows-4', 'demo-workflows-5'], json_encode($inactive));

        // Every state, source and project type a node names exists.
        $bad = [];
        $typeIds = array_column($db->rows('project_types'), 'id');
        $projectsPorted = $typeIds !== [];
        foreach ($workflows as $w) {
            $trigger = json_decode($w['trigger_config_json'], true) ?: [];
            foreach (['toStatus', 'fromStatus'] as $k) {
                if (isset($trigger[$k]) && $trigger[$k] !== 'any' && !in_array($trigger[$k], $states, true)) $bad[] = "{$w['id']} trigger {$k} '{$trigger[$k]}' is not a lead state";
            }
            if (isset($trigger['leadSource']) && !in_array($trigger['leadSource'], $sources, true)) $bad[] = "{$w['id']} trigger leadSource '{$trigger['leadSource']}' is not a lead source";
            foreach (json_decode($w['nodes_json'], true) as $node) {
                $d = $node['data'];
                if (in_array($d['type'] ?? '', ['create_lead', 'create_client'], true) && !in_array($d['status'], $states, true)) {
                    $bad[] = "{$w['id']}/{$node['id']} status '{$d['status']}' is not a lead state";
                }
                if (($d['type'] ?? '') === 'convert_lead_to_project') {
                    $want = demo_ref_id('PT');
                    if ($d['project_type_id'] !== $want) $bad[] = "{$w['id']}/{$node['id']} project_type_id '{$d['project_type_id']}' is not the demo project type {$want}";
                    if ($projectsPorted && !in_array($d['project_type_id'], $typeIds, true)) $bad[] = "{$w['id']}/{$node['id']} project type does not exist among the seeded project_types";
                }
                if (($d['type'] ?? '') === 'send_email' && strpos((string)$d['to'], '{{') === false && strpos((string)$d['to'], '@') === false) $bad[] = "{$w['id']}/{$node['id']} has no recipient";
            }
        }
        $check('every state, source and project type a node names exists in the settings', !$bad, implode("\n", array_slice($bad, 0, 10)));

        // Edges point at nodes of the same workflow; the graph has one trigger.
        $bad = [];
        foreach ($workflows as $w) {
            $nodes = json_decode($w['nodes_json'], true);
            $ids = array_column($nodes, 'id');
            if (count(array_filter($nodes, static fn($n) => $n['type'] === 'trigger')) !== 1) $bad[] = "{$w['id']} needs exactly one trigger";
            foreach (json_decode($w['edges_json'], true) as $e) {
                if (!in_array($e['source'], $ids, true) || !in_array($e['target'], $ids, true)) $bad[] = "{$w['id']} edge {$e['id']} points outside the graph";
            }
        }
        $check('every edge connects nodes of its workflow, one trigger each', !$bad, implode("\n", $bad));

        // The currency token and the threshold follow the chosen currency.
        $texts = json_encode([array_column($workflows, 'name'), array_column($workflows, 'description'), array_column($workflows, 'nodes_json')], JSON_UNESCAPED_UNICODE);
        $check('no leftover %token% in any workflow text', !preg_match('/%[a-z]+%/', $texts));
        if ($ctx['currency'] !== 'EUR') $check("no hardcoded EUR in a {$ctx['currency']} edition", strpos($texts, 'EUR') === false);
        $ai = null;
        foreach ($workflows as $w) if ($w['id'] === 'demo-workflows-4') $ai = $w;
        $thr = demo_money((float)$pack['thresholdEur']);
        $check('the AI triage condition uses the converted threshold', $ai !== null && strpos($ai['nodes_json'], '>= ' . $thr . ';') !== false, (string)$thr);

        // The run history: 20 rows in the last 14 days, two readable failures, queue empty.
        $check('20 run-history rows, ids unique', count($logs) === 20 && count(array_unique(array_column($logs, 'id'))) === 20, (string)count($logs));
        $now = time();
        $oldest = strtotime(demo_d(-14) . ' 00:00:00');
        $badTime = array_filter($logs, static function ($r) use ($now, $oldest) { $t = strtotime($r['created_at']); return $t > $now || $t < $oldest; });
        $check('every run is within the last 14 days and not in the future', !$badTime, json_encode(array_column($badTime, 'created_at')));
        $failed = array_values(array_filter($logs, static fn($r) => $r['status'] === 'failed'));
        $check('two failed runs, mostly success otherwise', count($failed) === 2 && count($logs) - count($failed) === 18, (string)count($failed));
        $msgs = [];
        foreach ($failed as $r) {
            foreach (json_decode($r['execution_log_json'], true) as $step) if (!$step['success']) $msgs[] = (string)$step['error'];
        }
        $check('each failure carries a readable message (a sentence, not a stack trace)', count($msgs) === 2 && !array_filter($msgs, static fn($m) => mb_strlen($m) < 40 || strpos($m, 'Exception') !== false || strpos($m, '{') !== false), json_encode($msgs, JSON_UNESCAPED_UNICODE));
        $wfIds = array_column($workflows, 'id');
        $badRef = array_filter($logs, static fn($r) => !in_array($r['workflow_id'], $wfIds, true) || !is_array(json_decode($r['execution_log_json'], true)));
        $check('every run belongs to a seeded workflow and has a decodable log', !$badRef);
        $stepsOk = true;
        foreach ($logs as $r) {
            $steps = json_decode($r['execution_log_json'], true);
            if (!$steps || $steps[0]['type'] !== 'trigger') $stepsOk = false;
            if ($r['status'] === 'success' && array_filter($steps, static fn($s) => !$s['success'])) $stepsOk = false;
            if ($r['status'] === 'failed' && end($steps)['success']) $stepsOk = false;
            if (strpos($r['execution_log_json'], '{{') !== false) $stepsOk = false;
        }
        $check('a log starts at the trigger, a successful run has no failed step, no template left unresolved', $stepsOk);
        $check('workflow_queue stays empty', count($db->rows('workflow_queue')) === 0);
    },
];
