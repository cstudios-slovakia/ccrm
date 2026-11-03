<?php
/**
 * Assertions for the `sai` demo module (docs/DEMO-MODE.md C12; format and contract: scripts/demo-assert/company.php
 * and the header of public/api/demo_seed/index.php).
 *
 * demo-sai-1 is a COMPLETED simulation stored the way a live run leaves it, demo-sai-2 a DRAFT. The sharded
 * `sim<id>_*` tables key their rows inside the simulation (node_studios, edge_1, post 101), so their ids are
 * allowed not to start with demo-: the tables themselves belong to the demo- simulation.
 */
return [
    'minRows' => [
        'swarm_simulations' => 2,
    ],
    'idAllow' => [
        'simdemosai1_nodes' => '/^node_[a-z]+$/',
        'simdemosai1_edges' => '/^edge_\d+$/',
        'simdemosai1_posts' => '/^\d+$/',
        'simdemosai1_agents' => '/^\d+$/',
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $sims = [];
        foreach ($db->rows('swarm_simulations') as $r) $sims[$r['id']] = $r;
        $lang = $ctx['lang'];

        // --- Both stored entries exist, with demo-sai-* ids (never the id of the built-in demo), nothing stale ------------
        $demoIds = array_values(array_filter(array_keys($sims), static fn($id) => strpos((string)$id, 'demo-') === 0));
        sort($demoIds);
        $check('exactly two stored simulations: demo-sai-1 and demo-sai-2', $demoIds === ['demo-sai-1', 'demo-sai-2'] && count($sims) === 2, json_encode(array_keys($sims)));
        $check('the pre-pack id sai-demo-1 is not written', !isset($sims['sai-demo-1']));
        $check('no stored id collides with the built-in demo (demo-pricing-rehearsal, demo-sim-*)',
            !isset($sims['demo-pricing-rehearsal']) && array_filter(array_keys($sims), static fn($id) => strpos((string)$id, 'demo-sim-') === 0) === []);
        $one = $sims['demo-sai-1'] ?? null;
        $two = $sims['demo-sai-2'] ?? null;
        if ($one === null || $two === null) return;

        // --- demo-sai-1: completed, resumable without an LLM ----------------------------------------------------------
        $check('demo-sai-1 is completed after 3 of 3 rounds, 30 agents configured',
            $one['status'] === 'completed' && (int)$one['current_round'] === 3 && (int)$one['total_rounds'] === 3 && (int)$one['swarm_scale'] === 30,
            json_encode([$one['status'], $one['current_round'], $one['total_rounds'], $one['swarm_scale']]));
        $cp = json_decode((string)$one['checkpoint_state'], true);
        $report = json_decode((string)$one['final_report'], true);
        $check('checkpoint_state and final_report are valid JSON', is_array($cp) && is_array($report));
        if (!is_array($cp) || !is_array($report)) return;
        $check('the checkpoint has the shape SaiModule resumes from',
            ($cp['simulationId'] ?? '') === 'demo-sai-1' && ($cp['status'] ?? '') === 'completed' && ($cp['currentRound'] ?? 0) === 3
            && count($cp['graph']['nodes'] ?? []) === 6 && count($cp['graph']['edges'] ?? []) === 5
            && count($cp['agents'] ?? []) === 6 && count($cp['posts'] ?? []) === 9 && count($cp['metricsHistory'] ?? []) === 3
            && ($cp['finalReport'] ?? null) === $report);
        $check('the sharded tables hold the same graph, agents and posts as the checkpoint',
            count($db->rows('simdemosai1_nodes')) === 6 && count($db->rows('simdemosai1_edges')) === 5
            && count($db->rows('simdemosai1_agents')) === 6 && count($db->rows('simdemosai1_posts')) === 9);

        // Graph: edges end on nodes, agents stand for a node, nodes link to demo CRM rows by the fixed id map
        $nodeIds = array_column($cp['graph']['nodes'], 'id');
        $bad = [];
        foreach ($cp['graph']['edges'] as $e) {
            if (!in_array($e['source'], $nodeIds, true) || !in_array($e['target'], $nodeIds, true)) $bad[] = $e['id'];
        }
        foreach ($cp['agents'] as $a) {
            if (!in_array($a['sourceEntityId'], $nodeIds, true)) $bad[] = 'agent ' . $a['id'];
        }
        $check('every edge and every agent points at a node of the graph', $bad === [], implode(', ', $bad));
        $crm = [];
        foreach ($cp['graph']['nodes'] as $n) if (isset($n['sourceCrmId'])) $crm[$n['id']] = $n['sourceCrmId'];
        $check('five nodes link to demo rows by the fixed id map (C3, L9, L10, C1, S1); the rival has no CRM row',
            ($crm['node_studios'] ?? '') === 'demo-clients-3' && ($crm['node_homeowners'] ?? '') === 'demo-clients-9' && ($crm['node_architect'] ?? '') === 'demo-clients-10'
            && ($crm['node_developers'] ?? '') === 'demo-clients-1' && ($crm['node_supplier'] ?? '') === 'demo-warehouse-201' && !isset($crm['node_rival']), json_encode($crm));

        // Cast comes from the company pack: contacts by ref, never a typed name
        $pack = demo_company_pack($lang);
        $names = array_column($cp['agents'], 'displayName');
        $check('five agents carry the contact person of their cast member (C3, L9, L10, C1, C6)',
            $names[0] === $pack['clients']['C3']['contact'] && $names[1] === $pack['clients']['L9']['contact'] && $names[3] === $pack['clients']['L10']['contact']
            && $names[4] === $pack['clients']['C1']['contact'] && $names[5] === $pack['clients']['C6']['contact'], json_encode($names));

        // Posts: agent fields match the profile, quoted posts exist and come earlier, rounds are 1..3
        $postIds = array_column($cp['posts'], 'id');
        $bad = [];
        foreach ($cp['posts'] as $p) {
            $a = $cp['agents'][$p['agentId'] - 1] ?? null;
            if ($a === null || $a['displayName'] !== $p['agentName'] || $a['username'] !== $p['agentUsername']) $bad[] = "post {$p['id']}: agent";
            if (isset($p['targetPostId']) && (!in_array($p['targetPostId'], $postIds, true) || $p['targetPostId'] >= $p['id'])) $bad[] = "post {$p['id']}: target";
            if ($p['roundNum'] < 1 || $p['roundNum'] > 3) $bad[] = "post {$p['id']}: round";
        }
        $check('every post belongs to its agent, quotes an earlier post, and sits in round 1-3', $bad === [], implode(', ', $bad));

        // Votes: every round counts one answer per featured agent; the leading answer is the most voted one
        $answers = array_keys($cp['metricsHistory'][0]['answerDistribution']);
        $bad = [];
        foreach ($cp['metricsHistory'] as $m) {
            if (array_sum($m['answerDistribution']) !== 6) $bad[] = "round {$m['round']}: votes";
            if ($m['supportiveCount'] + $m['opposingCount'] + $m['neutralCount'] !== 6) $bad[] = "round {$m['round']}: stances";
            if ($m['answerDistribution'][$m['leadingAnswer']] !== max($m['answerDistribution'])) $bad[] = "round {$m['round']}: leading";
        }
        foreach ($cp['posts'] as $p) if (!in_array($p['supportedAnswer'], $answers, true)) $bad[] = "post {$p['id']}: answer";
        $check('metrics: 6 votes and 6 stances per round, the leading answer is the most voted, every post backs a listed answer', $bad === [], implode(', ', $bad));

        // Report: the verdict shares add up and use the same answers as the metrics
        $v = $report['executiveVerdict'] ?? [];
        $shares = array_column($v['answerBreakdown'] ?? [], 'sharePercentage');
        $check('the verdict shares sum to 100 and name the same answers as the metrics',
            array_sum($shares) === 100 && array_column($v['answerBreakdown'], 'answer') === $answers, json_encode([$shares, array_column($v['answerBreakdown'] ?? [], 'answer')]));
        $check('the report is complete: verdict, 3 drivers, tipping point, 4 sections, playbook with 3 objections and a 4-step plan',
            !empty($v['directAnswer']) && count($v['keyDrivers']) === 3 && count($v['tippingPoints']) === 1 && count($report['sections']) === 4
            && count($report['strategicPlaybook']['salesObjectionPlaybook']) === 3 && count($report['strategicPlaybook']['recommendedGtmSequence']) === 4);
        $check('the strategic question is the one asked about quartz worktops, not a copy of the built-in demo',
            ($cp['strategicQuestion'] ?? '') === ($v['question'] ?? 'x') && stripos($cp['title'], '8') !== false && stripos($cp['title'], '15') === false, (string)($cp['title'] ?? ''));

        // Money placeholders resolve in the chosen currency ({m:90} = the laser measuring visit, item I8)
        $eight = demo_money_fmt(demo_money(90.0));
        $check('{m:90} became the converted laser-measuring price in the hypothesis and the first rebuttal',
            strpos((string)$one['hypothesis'], $eight) !== false && strpos($report['strategicPlaybook']['salesObjectionPlaybook'][0]['rebuttal'], $eight) !== false, $eight . ' | ' . $one['hypothesis']);
        $check('the seed document names the laser-measuring item (I8) by its pack name', strpos((string)$one['seed_document'], $pack['items']['I8']['name']) !== false, (string)$one['seed_document']);

        // --- demo-sai-2: a draft that can be run -----------------------------------------------------------------------
        $check('demo-sai-2 is a draft that has not started (round 0, no checkpoint report, no final report)',
            $two['status'] === 'draft' && (int)$two['current_round'] === 0 && ($two['final_report'] === null || $two['final_report'] === ''), json_encode([$two['status'], $two['current_round']]));
        $dcp = json_decode((string)($two['checkpoint_state'] ?? 'null'), true);
        $check('the draft carries its data sources, which are slugs the app knows (so any demo user may open it)',
            is_array($dcp) && ($dcp['crm_data_sources'] ?? []) === ['active_leads', 'existing_clients', 'projects'], json_encode($dcp));
        $check('the draft hypothesis and seed name the sintered-stone product (I2)',
            strpos((string)$two['hypothesis'], $pack['items']['I2']['name']) !== false && strpos((string)$two['seed_document'], $pack['items']['I2']['name']) !== false);
        $check('the two entries have different titles and neither sits in the built-in demo\'s language-less scenario',
            $one['title'] !== $two['title'] && stripos($one['title'] . $two['title'], 'enterprise') === false);
        $check('no data source slug outside the app\'s list is used by either entry',
            !array_diff(array_merge($cp['crm_data_sources'], $dcp['crm_data_sources'] ?? []), ['active_leads', 'existing_clients', 'projects', 'financials', 'client_emails', 'meeting_notes', 'files', 'products', 'competitor_intel', 'lost_deal_objections', 'social_media_posts', 'unified_entries']));
    },
];
