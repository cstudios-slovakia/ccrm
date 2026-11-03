<?php
/**
 * Demo seed module: workflows (Automations & Workflows, plus the run history).
 *
 * Code only: every word a person reads lives in packs/{sk,hu,en}/workflows.php, keyed by workflow
 * ('wf1'..'wf7') and node. The graph (node ids, positions, edges, filters, priorities, deadlines)
 * is here. Idempotent: deletes its own 'demo-workflows-%' rows, then inserts.
 *
 * Seven workflows - three simple, two medium, two complex - touching every node type of the
 * builder: trigger with filters, condition with both branches, AI agent, and the actions create
 * lead / create client / create task / send e-mail / convert lead to project. Five are active and
 * two are not: the AI-triage and the won-deal-onboarding workflows need an AI key, which a demo
 * install does not have, so an active copy would log a failed run on every new lead.
 * 20 runs over the last 14 days fill the Logs view (C13); two of them failed, with a message that
 * says what to do. workflow_queue stays empty.
 *
 * Lead states, sources and the project type are read from this instance, so the nodes name values
 * that exist here. The module also backs scripts/seed_demo_workflows.php (CLI), which calls
 * demo_workflows_definitions() / demo_workflows_write() on their own.
 *
 * Local tokens in pack strings (not demo_text placeholders): %source% %offer% %won% %cur%
 * %threshold% - see demo_wf_tokens(). {{$trigger.x}} is the engine's own syntax and is left alone.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

if (!function_exists('demo_workflows_definitions')) {

    /** Horizontal step between two chained nodes (cards are 320 px wide). */
    function demo_wf_col(int $index): int {
        return 100 + ($index * 400);
    }

    function demo_wf_node(string $id, string $type, string $name, array $data, int $x, int $y): array {
        return ['id' => $id, 'type' => $type, 'name' => $name, 'data' => $data, 'x' => $x, 'y' => $y];
    }

    /** $handle is 'true' / 'false' on a condition node, null everywhere else. */
    function demo_wf_edge(string $source, string $target, ?string $handle = null): array {
        return [
            'id' => 'edge-' . $source . '-' . $target . ($handle ? '-' . $handle : ''),
            'source' => $source,
            'target' => $target,
            'sourceHandle' => $handle,
        ];
    }

    /** The local tokens of the pack strings, from this instance's settings (see the header). */
    function demo_wf_tokens(PDO $pdo, array $pack): array {
        $states = demo_lead_states($pdo);
        $sources = demo_lead_sources($pdo);
        $ctx = demo_ctx($pdo);
        return [
            '%source%' => demo_pick($sources, ['web', 'stránk', 'weboldal'], -1),
            '%offer%' => $states['offer'],
            '%won%' => $states['won'],
            '%cur%' => $ctx['currency'],
            '%threshold%' => demo_money_fmt(demo_money((float)$pack['thresholdEur'])),
        ];
    }

    /** A pack string with its local tokens and its demo_text() placeholders resolved. */
    function demo_wf_text(string $s, array $tokens): string {
        $s = strtr($s, $tokens);
        if (preg_match('/%[a-z]+%/', $s, $m)) {
            throw new \InvalidArgumentException("workflows pack: unknown token {$m[0]} in: " . mb_substr($s, 0, 60));
        }
        return demo_text($s);
    }

    /** The project type the "convert" step creates: the demo type if it exists, else any, else the demo id (projects runs first). */
    function demo_wf_project_type(PDO $pdo): string {
        $typeId = demo_ref_id('PT');
        if (demo_row_exists($pdo, 'project_types', $typeId)) {
            return $typeId;
        }
        try {
            $fallback = $pdo->query("SELECT `id` FROM `project_types` ORDER BY `created_at` ASC LIMIT 1")->fetchColumn();
            if ($fallback) {
                return (string)$fallback;
            }
        } catch (\Throwable $e) {
            // the demo id below is what the projects module creates
        }
        return $typeId;
    }

    /**
     * The seven demo workflows. Each entry: id, name, description, trigger_type, trigger_config,
     * nodes, edges, active (default on/off). Text comes from the pack of the context's language
     * ($lang is kept for the CLI script's signature and must equal it).
     */
    function demo_workflows_definitions(PDO $pdo, string $lang): array {
        $pack = demo_pack($pdo, 'workflows');
        $tokens = demo_wf_tokens($pdo, $pack);
        $W = static fn(string $wf, string $key): string => demo_wf_text($pack['workflows'][$wf][$key], $tokens);
        $N = static fn(string $wf, string $node, string $field): string => demo_wf_text($pack['workflows'][$wf]['nodes'][$node][$field], $tokens);
        $col = 'demo_wf_col';
        $node = 'demo_wf_node';
        $edge = 'demo_wf_edge';

        $states = demo_lead_states($pdo);
        $stateNew = $states['new'];
        $stateOffer = $states['offer'];
        $stateWon = $states['won'];
        $sourceWeb = $tokens['%source%'];

        // Whoever gets the internal notifications: the owner (the admin of the edition).
        $owner = demo_users($pdo)['owner'];
        $manager = ['name' => (string)$owner['name'], 'email' => (string)$owner['email']];
        $projectTypeId = demo_wf_project_type($pdo);
        $threshold = demo_money((float)$pack['thresholdEur']);
        $wf = [];

        // --- 1. Simple: welcome e-mail for a web lead -------------------------------------
        $wf[] = [
            'id' => demo_id('workflows', 1), 'active' => 1,
            'name' => $W('wf1', 'name'), 'description' => $W('wf1', 'description'),
            'trigger_type' => 'lead_created', 'trigger_config' => ['leadSource' => $sourceWeb],
            'nodes' => [
                $node('node-trigger', 'trigger', $N('wf1', 'trigger', 'name'), ['type' => 'lead_created'], $col(0), 140),
                $node('node-welcome-mail', 'action', $N('wf1', 'welcome-mail', 'name'), [
                    'type' => 'send_email', 'to' => '{{$trigger.email}}',
                    'subject' => $N('wf1', 'welcome-mail', 'subject'), 'body' => $N('wf1', 'welcome-mail', 'body'),
                ], $col(1), 140),
            ],
            'edges' => [$edge('node-trigger', 'node-welcome-mail')],
        ];

        // --- 2. Simple: follow-up task after the offer went out -----------------------------
        $wf[] = [
            'id' => demo_id('workflows', 2), 'active' => 1,
            'name' => $W('wf2', 'name'), 'description' => $W('wf2', 'description'),
            'trigger_type' => 'lead_status_changed', 'trigger_config' => ['fromStatus' => 'any', 'toStatus' => $stateOffer],
            'nodes' => [
                $node('node-trigger', 'trigger', $N('wf2', 'trigger', 'name'), ['type' => 'lead_status_changed'], $col(0), 140),
                $node('node-followup-task', 'action', $N('wf2', 'followup-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf2', 'followup-task', 'title'), 'description' => $N('wf2', 'followup-task', 'description'),
                    'priority' => 'high', 'deadline_days' => 3, 'deadline_time' => '09:00', 'owner' => '{{$trigger.owner}}',
                ], $col(1), 140),
            ],
            'edges' => [$edge('node-trigger', 'node-followup-task')],
        ];

        // --- 3. Medium: manual button that logs a phone enquiry ------------------------------
        $wf[] = [
            'id' => demo_id('workflows', 3), 'active' => 1,
            'name' => $W('wf3', 'name'), 'description' => $W('wf3', 'description'),
            'trigger_type' => 'manual', 'trigger_config' => ['buttonColor' => '#0f766e', 'buttonStyle' => 'full', 'buttonIcon' => 'Phone'],
            'nodes' => [
                $node('node-trigger', 'trigger', $N('wf3', 'trigger', 'name'), ['type' => 'manual'], $col(0), 300),
                $node('node-create-lead', 'action', $N('wf3', 'create-lead', 'name'), [
                    'type' => 'create_lead', 'name' => $N('wf3', 'create-lead', 'leadName'),
                    'city' => '', 'status' => $stateNew, 'owner' => $manager['name'], 'value' => '0',
                ], $col(1), 140),
                $node('node-qualify-task', 'action', $N('wf3', 'qualify-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf3', 'qualify-task', 'title'), 'description' => $N('wf3', 'qualify-task', 'description'),
                    'priority' => 'high', 'deadline_days' => 1, 'deadline_time' => '08:30', 'owner' => $manager['name'],
                ], $col(2), 140),
                $node('node-notify-mail', 'action', $N('wf3', 'notify-mail', 'name'), [
                    'type' => 'send_email', 'to' => $manager['email'],
                    'subject' => $N('wf3', 'notify-mail', 'subject'), 'body' => $N('wf3', 'notify-mail', 'body'),
                ], $col(2), 620),
            ],
            'edges' => [
                $edge('node-trigger', 'node-create-lead'),
                $edge('node-create-lead', 'node-qualify-task'),
                $edge('node-create-lead', 'node-notify-mail'),
            ],
        ];

        // --- 4. Complex: AI triage of every incoming lead (inactive: needs an AI key + SMTP) ---
        $wf[] = [
            'id' => demo_id('workflows', 4), 'active' => 0,
            'name' => $W('wf4', 'name'), 'description' => $W('wf4', 'description'),
            'trigger_type' => 'lead_created', 'trigger_config' => [],
            'nodes' => [
                $node('node-trigger', 'trigger', $N('wf4', 'trigger', 'name'), ['type' => 'lead_created'], $col(0), 340),
                $node('node-value-check', 'condition', $N('wf4', 'value-check', 'name'), [
                    'js_code' => 'return $trigger.clientType !== "person" && $trigger.value >= ' . $threshold . ';',
                ], $col(1), 340),
                $node('node-ai-note', 'ai_agent', $N('wf4', 'ai-note', 'name'), [
                    'provider' => 'gemini', 'prompt' => $N('wf4', 'ai-note', 'prompt'),
                ], $col(2), 140),
                $node('node-hot-task', 'action', $N('wf4', 'hot-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf4', 'hot-task', 'title'), 'description' => $N('wf4', 'hot-task', 'description'),
                    'priority' => 'high', 'deadline_days' => 1, 'deadline_time' => '10:00', 'owner' => '{{$trigger.owner}}',
                ], $col(3), 140),
                $node('node-hot-mail', 'action', $N('wf4', 'hot-mail', 'name'), [
                    'type' => 'send_email', 'to' => $manager['email'],
                    'subject' => $N('wf4', 'hot-mail', 'subject'), 'body' => $N('wf4', 'hot-mail', 'body'),
                ], $col(3), 620),
                $node('node-nurture-task', 'action', $N('wf4', 'nurture-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf4', 'nurture-task', 'title'), 'description' => $N('wf4', 'nurture-task', 'description'),
                    'priority' => 'low', 'deadline_days' => 7, 'deadline_time' => '14:00', 'owner' => '{{$trigger.owner}}',
                ], $col(2), 780),
            ],
            'edges' => [
                $edge('node-trigger', 'node-value-check'),
                $edge('node-value-check', 'node-ai-note', 'true'),
                $edge('node-ai-note', 'node-hot-task'),
                $edge('node-ai-note', 'node-hot-mail'),
                $edge('node-value-check', 'node-nurture-task', 'false'),
            ],
        ];

        // --- 5. Complex: won deal turns into a client and an onboarding chain (inactive: AI key + SMTP) ---
        $wf[] = [
            'id' => demo_id('workflows', 5), 'active' => 0,
            'name' => $W('wf5', 'name'), 'description' => $W('wf5', 'description'),
            'trigger_type' => 'lead_status_changed', 'trigger_config' => ['fromStatus' => 'any', 'toStatus' => $stateWon],
            'nodes' => [
                $node('node-trigger', 'trigger', $N('wf5', 'trigger', 'name'), ['type' => 'lead_status_changed'], $col(0), 440),
                $node('node-handover-task', 'action', $N('wf5', 'handover-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf5', 'handover-task', 'title'), 'description' => $N('wf5', 'handover-task', 'description'),
                    'priority' => 'medium', 'deadline_days' => 2, 'deadline_time' => '11:00', 'owner' => '{{$trigger.owner}}',
                ], $col(1), 960),
                $node('node-company-check', 'condition', $N('wf5', 'company-check', 'name'), ['js_code' => 'return $trigger.clientType !== "person";'], $col(1), 440),
                $node('node-create-client', 'action', $N('wf5', 'create-client', 'name'), [
                    'type' => 'create_client', 'name' => '{{$trigger.name}}', 'client_type' => 'business', 'status' => $stateWon,
                    'email' => '{{$trigger.email}}', 'phone' => '{{$trigger.phone}}', 'street' => '{{$trigger.address.street}}', 'city' => '{{$trigger.city}}',
                    'postal_code' => '{{$trigger.address.postalCode}}', 'country' => '{{$trigger.address.country}}', 'company_id' => '{{$trigger.companyId}}',
                    'tax_id' => '{{$trigger.taxId}}', 'vat_id' => '{{$trigger.vatId}}', 'contact_person' => '{{$trigger.contactPerson}}',
                    'website' => '{{$trigger.website}}', 'owner' => '{{$trigger.owner}}', 'value' => '{{$trigger.value}}',
                ], $col(2), 120),
                $node('node-onboarding-task', 'action', $N('wf5', 'onboarding-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf5', 'onboarding-task', 'title'), 'description' => $N('wf5', 'onboarding-task', 'description'),
                    'priority' => 'high', 'deadline_days' => 5, 'deadline_time' => '09:30', 'owner' => '{{$trigger.owner}}',
                ], $col(3), 120),
                $node('node-ai-onboarding', 'ai_agent', $N('wf5', 'ai-onboarding', 'name'), [
                    'provider' => 'gemini', 'prompt' => $N('wf5', 'ai-onboarding', 'prompt'),
                ], $col(4), 120),
                $node('node-onboarding-mail', 'action', $N('wf5', 'onboarding-mail', 'name'), [
                    'type' => 'send_email', 'to' => '{{$trigger.email}}',
                    'subject' => $N('wf5', 'onboarding-mail', 'subject'), 'body' => $N('wf5', 'onboarding-mail', 'body'),
                ], $col(5), 120),
                $node('node-personal-task', 'action', $N('wf5', 'personal-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf5', 'personal-task', 'title'), 'description' => $N('wf5', 'personal-task', 'description'),
                    'priority' => 'medium', 'deadline_days' => 3, 'deadline_time' => '13:00', 'owner' => '{{$trigger.owner}}',
                ], $col(2), 960),
            ],
            // The handover task is wired first on purpose: nodes run breadth-first in edge order,
            // so work that needs no AI key is done before the branch that may stop at the AI agent.
            'edges' => [
                $edge('node-trigger', 'node-handover-task'),
                $edge('node-trigger', 'node-company-check'),
                $edge('node-company-check', 'node-create-client', 'true'),
                $edge('node-create-client', 'node-onboarding-task'),
                $edge('node-onboarding-task', 'node-ai-onboarding'),
                $edge('node-ai-onboarding', 'node-onboarding-mail'),
                $edge('node-company-check', 'node-personal-task', 'false'),
            ],
        ];

        // --- 6. Simple: every new lead gets a call task for its owner -----------------------------
        $wf[] = [
            'id' => demo_id('workflows', 6), 'active' => 1,
            'name' => $W('wf6', 'name'), 'description' => $W('wf6', 'description'),
            'trigger_type' => 'lead_created', 'trigger_config' => [],
            'nodes' => [
                $node('node-trigger', 'trigger', $N('wf6', 'trigger', 'name'), ['type' => 'lead_created'], $col(0), 140),
                $node('node-call-task', 'action', $N('wf6', 'call-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf6', 'call-task', 'title'), 'description' => $N('wf6', 'call-task', 'description'),
                    'priority' => 'medium', 'deadline_days' => 1, 'deadline_time' => '10:00', 'owner' => '{{$trigger.owner}}',
                ], $col(1), 140),
            ],
            'edges' => [$edge('node-trigger', 'node-call-task')],
        ];

        // --- 7. Medium: accepted offer opens a project and its kickoff task ------------------------
        // "Offer accepted" is the lead reaching the won state: the accepted offer is what moves it there.
        $wf[] = [
            'id' => demo_id('workflows', 7), 'active' => 1,
            'name' => $W('wf7', 'name'), 'description' => $W('wf7', 'description'),
            'trigger_type' => 'lead_status_changed', 'trigger_config' => ['fromStatus' => 'any', 'toStatus' => $stateWon],
            'nodes' => [
                $node('node-trigger', 'trigger', $N('wf7', 'trigger', 'name'), ['type' => 'lead_status_changed'], $col(0), 140),
                $node('node-create-project', 'action', $N('wf7', 'create-project', 'name'), [
                    'type' => 'convert_lead_to_project', 'project_type_id' => $projectTypeId, 'status' => 'new', 'manager' => '', 'skip_if_exists' => true,
                ], $col(1), 140),
                $node('node-kickoff-task', 'action', $N('wf7', 'kickoff-task', 'name'), [
                    'type' => 'create_task', 'title' => $N('wf7', 'kickoff-task', 'title'), 'description' => $N('wf7', 'kickoff-task', 'description'),
                    'priority' => 'high', 'deadline_days' => 2, 'deadline_time' => '09:00', 'owner' => '{{$trigger.owner}}',
                ], $col(2), 140),
            ],
            'edges' => [
                $edge('node-trigger', 'node-create-project'),
                $edge('node-create-project', 'node-kickoff-task'),
            ],
        ];

        return $wf;
    }

    /**
     * Upsert workflows by id. $isActive: 1 / 0 forces every row, null keeps each
     * definition's own 'active' default. Returns the number written.
     */
    function demo_workflows_write(PDO $pdo, array $workflows, ?int $isActive = null): int {
        $stmt = $pdo->prepare(
            "INSERT INTO `workflows` (`id`, `name`, `description`, `trigger_type`, `trigger_config_json`, `nodes_json`, `edges_json`, `is_active`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               `name` = VALUES(`name`), `description` = VALUES(`description`), `trigger_type` = VALUES(`trigger_type`),
               `trigger_config_json` = VALUES(`trigger_config_json`), `nodes_json` = VALUES(`nodes_json`),
               `edges_json` = VALUES(`edges_json`), `is_active` = VALUES(`is_active`)"
        );
        foreach ($workflows as $wf) {
            $stmt->execute([
                $wf['id'], $wf['name'], $wf['description'], $wf['trigger_type'],
                json_encode((object)$wf['trigger_config'], JSON_UNESCAPED_UNICODE),
                json_encode($wf['nodes'], JSON_UNESCAPED_UNICODE),
                json_encode($wf['edges'], JSON_UNESCAPED_UNICODE),
                $isActive ?? (int)$wf['active'],
            ]);
        }
        return count($workflows);
    }

    /** `{{$trigger.x}}` / `{{$input.x}}` replaced from the run's payloads, the way the engine does it. */
    function demo_wf_interpolate(string $s, array $trigger, array $input): string {
        return preg_replace_callback('/\{\{\$(trigger|input)\.([A-Za-z0-9_.]+)\}\}/', static function (array $m) use ($trigger, $input): string {
            $v = $m[1] === 'trigger' ? $trigger : $input;
            foreach (explode('.', $m[2]) as $part) {
                if (!is_array($v) || !array_key_exists($part, $v)) {
                    return '';
                }
                $v = $v[$part];
            }
            return is_scalar($v) ? (string)$v : '';
        }, $s);
    }

    /**
     * The workflow_logs rows of the pack's run history. Each run is replayed along the graph of
     * its workflow (breadth-first from the trigger, like the engine), with the payloads the engine
     * would have passed from node to node; a failed run stops at the failing node.
     * $workflows = demo_workflows_definitions(). Returns rows keyed by column.
     */
    function demo_workflows_log_rows(PDO $pdo, array $workflows): array {
        $pack = demo_pack($pdo, 'workflows');
        $tokens = demo_wf_tokens($pdo, $pack);
        $byKey = [];
        foreach ($workflows as $w) {
            $byKey['wf' . (int)substr($w['id'], strlen('demo-workflows-'))] = $w;
        }
        $failingNode = ['wf1' => 'node-welcome-mail', 'wf7' => 'node-create-project'];
        $states = demo_lead_states($pdo);
        $taskStates = demo_task_states($pdo);
        $users = demo_users($pdo);
        $rows = [];

        foreach ($pack['logs'] as $i => $run) {
            $wf = $byKey[$run['wf']];
            $logId = demo_id('workflows', 101 + $i);
            $ownerName = (string)$users[$run['owner']]['name'];
            $when = demo_dt((int)$run['day'], (string)$run['time']);
            $ymd = demo_d((int)$run['day']);

            if ($run['client'] !== null) {
                $c = demo_ref($pdo, $run['client']);
                $trigger = [
                    'id' => demo_ref_id($run['client']), 'name' => $c['name'],
                    'clientType' => $c['type'] === 'person' ? 'person' : 'business',
                    'city' => $c['city'], 'phone' => $c['phone'], 'email' => $run['email'] ?? $c['email'],
                    'source' => $tokens['%source%'], 'value' => demo_money((float)$c['valueEur']),
                    'owner' => $ownerName, 'companyId' => $c['companyId'],
                    'status' => $states['new'], 'oldStatus' => $states['new'], 'newStatus' => $states['new'],
                ];
                if ($run['wf'] === 'wf2') {
                    $trigger['oldStatus'] = $states['contacted'];
                    $trigger['newStatus'] = $states['offer'];
                    $trigger['status'] = $states['offer'];
                } elseif ($run['wf'] === 'wf7') {
                    $trigger['oldStatus'] = $states['offer'];
                    $trigger['newStatus'] = $states['won'];
                    $trigger['status'] = $states['won'];
                }
            } else {
                $trigger = ['triggered_by' => $ownerName, 'triggered_at' => $when];
            }

            // Replay: breadth-first from the trigger along the edges, in edge order.
            $nodes = [];
            foreach ($wf['nodes'] as $n) $nodes[$n['id']] = $n;
            $triggerId = null;
            foreach ($wf['nodes'] as $n) if ($n['type'] === 'trigger') { $triggerId = $n['id']; break; }
            $queue = [[$triggerId, $trigger]];
            $log = [];
            $status = 'success';
            while ($queue) {
                [$nodeId, $input] = array_shift($queue);
                $n = $nodes[$nodeId];
                $data = $n['data'];
                $ok = true;
                $error = null;
                $output = $input;
                $failHere = $run['error'] !== null && ($failingNode[$run['wf']] ?? null) === $nodeId;
                if ($failHere) {
                    $ok = false;
                    $error = demo_wf_text((string)$run['error'], $tokens);
                    $output = ['error' => $error];
                } elseif ($n['type'] === 'action') {
                    $type = $data['type'] ?? '';
                    $sub = substr(md5($logId . $nodeId), 0, 8);
                    if ($type === 'create_task') {
                        $deadlineDays = (int)($data['deadline_days'] ?? 1);
                        $output = [
                            'id' => 'task-' . $sub,
                            'title' => demo_wf_interpolate((string)$data['title'], $trigger, $input),
                            'description' => demo_wf_interpolate((string)$data['description'], $trigger, $input),
                            'owner' => $ownerName,
                            'status' => $taskStates['new'],
                            'deadline' => (new \DateTimeImmutable($ymd))->modify("+{$deadlineDays} days")->format('Y-m-d'),
                            'deadline_time' => $data['deadline_time'] ?? null,
                        ];
                    } elseif ($type === 'send_email') {
                        $output = [
                            'success' => true,
                            'to' => demo_wf_interpolate((string)$data['to'], $trigger, $input),
                            'subject' => demo_wf_interpolate((string)$data['subject'], $trigger, $input),
                        ];
                    } elseif ($type === 'create_lead') {
                        $output = ['id' => 'lead-' . $sub, 'name' => $data['name'], 'status' => $data['status'], 'owner' => $ownerName, 'value' => 0];
                    } elseif ($type === 'convert_lead_to_project') {
                        $projectId = 'proj-' . $sub;
                        $output = [
                            'id' => $projectId, 'project_id' => $projectId, 'project_ids' => [$projectId],
                            'project_type_id' => $data['project_type_id'], 'status' => $data['status'],
                            'lead_id' => $trigger['id'], 'related_lead_id' => $trigger['id'], 'managers' => [$ownerName],
                        ];
                    }
                }
                $log[] = [
                    'node_id' => $nodeId, 'node_name' => $n['name'], 'type' => $n['type'],
                    'success' => $ok, 'error' => $error, 'input' => $input, 'output' => $output,
                ];
                if (!$ok) {
                    $status = 'failed';
                    break;
                }
                foreach ($wf['edges'] as $e) {
                    if ($e['source'] === $nodeId) $queue[] = [$e['target'], $output];
                }
            }

            $rows[] = [
                'id' => $logId, 'workflow_id' => $wf['id'], 'status' => $status,
                'execution_time_ms' => (int)$run['ms'], 'trigger_event' => $wf['trigger_type'],
                'execution_log_json' => json_encode($log, JSON_UNESCAPED_UNICODE),
                'created_at' => $when,
            ];
        }
        return $rows;
    }

    function demo_workflows_write_logs(PDO $pdo, array $rows): int {
        $stmt = $pdo->prepare(
            "INSERT INTO `workflow_logs` (`id`, `workflow_id`, `status`, `execution_time_ms`, `trigger_event`, `execution_log_json`, `created_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        foreach ($rows as $r) {
            $stmt->execute([$r['id'], $r['workflow_id'], $r['status'], $r['execution_time_ms'], $r['trigger_event'], $r['execution_log_json'], $r['created_at']]);
        }
        return count($rows);
    }
}

/** Seed the workflows and their run history; returns the rows inserted (workflows + log rows). */
function demo_seed_workflows(PDO $pdo): int {
    $pdo->exec("DELETE FROM `workflow_logs` WHERE `workflow_id` LIKE 'demo-workflows-%'");
    $pdo->exec("DELETE FROM `workflow_queue` WHERE `workflow_id` LIKE 'demo-workflows-%'");
    $pdo->exec("DELETE FROM `workflows` WHERE `id` LIKE 'demo-workflows-%'");
    $workflows = demo_workflows_definitions($pdo, demo_lang($pdo));
    $rows = demo_workflows_write($pdo, $workflows);
    $rows += demo_workflows_write_logs($pdo, demo_workflows_log_rows($pdo, $workflows));
    return $rows;
}
