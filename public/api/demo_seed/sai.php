<?php
/**
 * Demo seed module: sai (Synthetic AI market rehearsal). Code only; every string lives in
 * packs/{sk,hu,en}/sai.php (docs/DEMO-MODE.md C12).
 *
 *  - demo-sai-1  COMPLETED: "Raise quartz worktop prices by 8 % and add free laser measuring" - stored exactly
 *                as a finished live run leaves it: a `swarm_simulations` row whose checkpoint_state carries
 *                graph, agents, posts and round metrics, the strategic report in `final_report`, and the
 *                per-simulation `sim<id>_nodes/edges/agents/posts` tables. SaiModule opens it through the
 *                normal resume path - no network or LLM call.
 *  - demo-sai-2  DRAFT: the outdoor-kitchen line in sintered stone, configured but not run, so the user can
 *                press Run and watch it.
 *
 * Both are listed whether the module's demo toggle is on or off. They are different from the built-in
 * interactive demo (src/utils/swarm/demoData.*.ts, a 15-year warranty on premium sintered stone).
 * The ids start with demo- on purpose (B7): SaiModule only treats the built-in checkpoint id and
 * demo-sim-* as the client-side demo.
 *
 * Creating a simulation runs DDL (CREATE TABLE of the sharded tables), so this module cannot be rolled
 * back by its transaction: the runner deletes demo-sai-% rows by prefix instead.
 */
require_once __DIR__ . '/helpers.php';
require_once dirname(__DIR__) . '/Swarm/SwarmManager.php';

const DEMO_SAI_COMPLETED_ID = 'demo-sai-1';
const DEMO_SAI_DRAFT_ID = 'demo-sai-2';
/** The id the pre-pack seeder used; removed here so a re-seed does not leave a second, stale simulation. */
const DEMO_SAI_LEGACY_ID = 'sai-demo-1';

function demo_seed_sai(PDO $pdo): int {
    demo_ctx($pdo); // builds the context (language, currency) every placeholder below needs
    $pack = demo_text_deep(demo_pack($pdo, 'sai'));
    $manager = new \CCRM\Swarm\SwarmManager($pdo);
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    // Idempotent: drop what an earlier run wrote (and its sharded tables) before writing again.
    foreach ([DEMO_SAI_COMPLETED_ID, DEMO_SAI_DRAFT_ID, DEMO_SAI_LEGACY_ID] as $oldId) {
        $manager->deleteSimulation($oldId);
    }

    $rows = 0;
    $rows += demo_sai_write_completed($pdo, $manager, $pack['completed'], $flags);
    $rows += demo_sai_write_draft($manager, $pack['draft']);
    return $rows;
}

/** The completed simulation. Returns the number of rows inserted. */
function demo_sai_write_completed(PDO $pdo, \CCRM\Swarm\SwarmManager $manager, array $c, int $flags): int {
    $id = DEMO_SAI_COMPLETED_ID;
    $sources = array_values($c['sources']);
    $created = $manager->createSimulation([
        'id' => $id,
        'title' => $c['title'],
        'hypothesis' => $c['hypothesis'],
        'seed_document' => $c['seed'],
        'lookback_months' => $c['lookback'],
        'swarm_scale' => $c['scale'],
        'total_rounds' => $c['rounds'],
        'status' => 'completed',
        'crm_data_sources' => $sources,
    ]);
    $prefix = preg_replace('/[^a-zA-Z0-9_]/', '', $created['table_prefix']);
    $rows = 1;

    $answers = [$c['answers']['yes'], $c['answers']['maybe'], $c['answers']['no']];
    $answerOf = static fn(string $key): string => $c['answers'][$key];

    // --- Graph: nodes carry the CRM link of the cast member they stand for ---------------------
    $nodes = [];
    foreach ($c['nodes'] as $n) {
        $crmId = null;
        foreach (['client', 'project', 'supplier'] as $refKey) {
            if (isset($n[$refKey]) && $crmId === null) {
                $crmId = demo_ref_id($n[$refKey]);
            }
        }
        $nodes[] = ['id' => $n['id'], 'name' => $n['name'], 'type' => $n['type'], 'summary' => $n['summary']]
            + ($crmId !== null ? ['sourceCrmId' => $crmId] : []);
    }
    $edges = [];
    foreach ($c['edges'] as $e) {
        $edges[] = ['id' => $e['id'], 'source' => $e['source'], 'target' => $e['target'], 'relation' => $e['relation'], 'fact' => $e['fact'], 'validFromRound' => $e['round']];
    }
    $graph = ['nodes' => $nodes, 'edges' => $edges];

    $agents = [];
    foreach ($c['agents'] as $i => $a) {
        $agents[] = [
            'id' => $i + 1, 'username' => $a['username'], 'displayName' => $a['displayName'], 'profession' => $a['profession'],
            'mbti' => $a['mbti'], 'stance' => $a['stance'], 'userChar' => $a['userChar'], 'publicBio' => $a['publicBio'],
            'followerCount' => $a['followers'], 'karma' => $a['karma'], 'sourceEntityId' => $a['node'], 'interestedTopics' => array_values($a['topics']),
        ];
    }

    $posts = [];
    foreach ($c['posts'] as $p) {
        $a = $agents[$p['agent'] - 1];
        $post = [
            'id' => $p['id'], 'roundNum' => $p['round'], 'agentId' => $p['agent'],
            'agentName' => $a['displayName'], 'agentUsername' => $a['username'], 'agentProfession' => $a['profession'],
            'platform' => $p['platform'], 'actionType' => $p['type'], 'content' => $p['text'],
            'likesCount' => $p['likes'], 'quotesCount' => $p['quotes'], 'commentsCount' => $p['comments'],
            'sentimentScore' => $p['sentiment'], 'createdAt' => $p['time'], 'supportedAnswer' => $answerOf($p['answer']),
        ];
        if ($p['target'] > 0) {
            $post['targetPostId'] = $p['target'];
        }
        $posts[] = $post;
    }

    $metrics = [];
    foreach ($c['metrics'] as $m) {
        $metrics[] = [
            'round' => $m['round'], 'simulatedHour' => $m['hour'], 'averageSentiment' => $m['sentiment'],
            'supportiveCount' => $m['supportive'], 'opposingCount' => $m['opposing'], 'neutralCount' => $m['neutral'],
            'totalInteractions' => $m['interactions'], 'viralIndex' => $m['viral'],
            'answerDistribution' => array_combine($answers, $m['dist']),
            'leadingAnswer' => $answerOf($m['leading']), 'consensusPercentage' => $m['consensus'],
        ];
    }

    $finishedAt = demo_dt($c['updated']['day'], $c['updated']['time']);
    $r = $c['report'];
    $breakdown = [];
    foreach ($r['shares'] as $i => $s) {
        $breakdown[] = ['answer' => $answers[$i], 'sharePercentage' => $s['pct'], 'count' => $s['count'], 'sentiment' => $s['sentiment']];
    }
    $report = [
        'title' => $r['title'],
        'summary' => $r['summary'],
        'generatedAt' => (new \DateTimeImmutable($finishedAt))->format(DATE_ATOM),
        'executiveVerdict' => [
            'question' => $c['question'],
            'directAnswer' => $r['directAnswer'],
            'confidenceScore' => $r['confidence'],
            'summary' => $r['verdictSummary'],
            'answerBreakdown' => $breakdown,
            'keyDrivers' => array_map(static fn(array $d): array => ['title' => $d['title'], 'explanation' => $d['explanation'], 'quotes' => [$d['quote']]], $r['drivers']),
            'tippingPoints' => [['round' => $r['tipping']['round'], 'description' => $r['tipping']['description'], 'impact' => $r['tipping']['impact']]],
            'whatWouldChangeOutcome' => array_values($r['whatIf']),
            'actionableRecommendations' => array_values($r['recommendations']),
        ],
        'sections' => array_map(static fn(array $s): array => ['title' => $s['title'], 'content' => $s['content']], $r['sections']),
        'strategicPlaybook' => [
            'keyVulnerabilities' => array_values($r['vulnerabilities']),
            'actionableCounterMeasures' => array_values($r['counterMeasures']),
            'salesObjectionPlaybook' => array_map(static fn(array $o): array => ['objection' => $o['objection'], 'rebuttal' => $o['rebuttal']], $r['objections']),
            'recommendedGtmSequence' => array_values($r['gtm']),
        ],
    ];

    // --- Sharded tables ------------------------------------------------------------------------
    $insNode = $pdo->prepare("INSERT INTO `{$prefix}nodes` (`id`, `entity_name`, `entity_type`, `summary`, `attributes`, `source_crm_id`) VALUES (?, ?, ?, ?, ?, ?)");
    foreach ($nodes as $n) {
        $insNode->execute([$n['id'], $n['name'], $n['type'], $n['summary'], json_encode(new \stdClass()), $n['sourceCrmId'] ?? null]);
        $rows++;
    }
    $insEdge = $pdo->prepare("INSERT INTO `{$prefix}edges` (`id`, `source_node_id`, `target_node_id`, `relation_name`, `fact`, `valid_from_round`) VALUES (?, ?, ?, ?, ?, ?)");
    foreach ($edges as $e) {
        $insEdge->execute([$e['id'], $e['source'], $e['target'], $e['relation'], $e['fact'], $e['validFromRound']]);
        $rows++;
    }
    $insAgent = $pdo->prepare("INSERT INTO `{$prefix}agents` (`agent_index`, `username`, `display_name`, `profession`, `mbti`, `stance`, `user_char`, `public_bio`, `follower_count`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($agents as $a) {
        $insAgent->execute([$a['id'], $a['username'], $a['displayName'], $a['profession'], $a['mbti'], $a['stance'], $a['userChar'], $a['publicBio'], $a['followerCount']]);
        $rows++;
    }
    $insPost = $pdo->prepare("INSERT INTO `{$prefix}posts` (`id`, `round_num`, `agent_id`, `platform`, `action_type`, `target_post_id`, `content`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($posts as $p) {
        $insPost->execute([$p['id'], $p['roundNum'], $p['agentId'], $p['platform'], $p['actionType'], $p['targetPostId'] ?? null, $p['content'], demo_dt($c['updated']['day'], $p['createdAt'])]);
        $rows++;
    }

    // --- Registry: the state the UI resumes from -------------------------------------------------
    $checkpoint = [
        'simulationId' => $id,
        'title' => $c['title'],
        'hypothesis' => $c['hypothesis'],
        'strategicQuestion' => $c['question'],
        'currentRound' => $c['rounds'],
        'totalRounds' => $c['rounds'],
        'total_rounds' => $c['rounds'],
        'status' => 'completed',
        'graph' => $graph,
        'agents' => $agents,
        'posts' => $posts,
        'metricsHistory' => $metrics,
        'finalReport' => $report,
        'crm_data_sources' => $sources,
        'model_name' => 'gpt-6-luna',
        'diurnal_cycle' => true,
    ];
    $upd = $pdo->prepare("UPDATE `swarm_simulations`
        SET `current_round` = ?, `status` = 'completed', `checkpoint_state` = ?, `final_report` = ?, `created_at` = ?, `updated_at` = ?
        WHERE `id` = ?");
    $upd->execute([
        $c['rounds'], json_encode($checkpoint, $flags), json_encode($report, $flags),
        demo_dt($c['created']['day'], $c['created']['time']), $finishedAt, $id,
    ]);
    return $rows;
}

/** The draft: configured, not run. Returns the number of rows inserted. */
function demo_sai_write_draft(\CCRM\Swarm\SwarmManager $manager, array $d): int {
    $manager->createSimulation([
        'id' => DEMO_SAI_DRAFT_ID,
        'title' => $d['title'],
        'hypothesis' => $d['hypothesis'],
        'seed_document' => $d['seed'],
        'lookback_months' => $d['lookback'],
        'swarm_scale' => $d['scale'],
        'total_rounds' => $d['rounds'],
        'status' => 'draft',
        'crm_data_sources' => array_values($d['sources']),
    ]);
    return 1;
}
