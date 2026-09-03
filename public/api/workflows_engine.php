<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

// Safe DSN loader
$configFile = dirname(__DIR__) . '/config.php';
if (file_exists($configFile)) {
    require_once $configFile;
}

// Helpers
if (!function_exists('ccrm_resolve_json_path')) {
    /**
     * Resolve one {{$namespace.field}} path.
     *
     * $data is the node's own input, i.e. whatever the previous node returned;
     * that is what `$input` (and a bare path) reads. $context carries the
     * run-scoped namespaces the builder UI offers as pill tags — `trigger` (the
     * payload the workflow fired with), `ai`, `condition`, `item` — so a
     * variable means the same thing however deep in the graph it sits.
     *
     * Without the context, {{$trigger.name}} rendered empty behind every
     * condition and AI node (both replace the payload with their own output),
     * and {{$ai.result}} / {{$condition.result}} never resolved at all.
     */
    function ccrm_resolve_json_path($path, $data, $context = null) {
        $path = trim($path);
        if ($path === '') return $data;
        $parts = explode('.', $path);
        $first = $parts[0];
        $curr = $data;

        if ($first === '$input') {
            array_shift($parts);
        } elseif ($first !== '' && $first[0] === '$') {
            $namespace = substr($first, 1);
            array_shift($parts);
            if (is_array($context) && array_key_exists($namespace, $context)) {
                $curr = $context[$namespace];
            } elseif ($namespace === 'trigger') {
                // Callers that pass no context (and the trigger node itself,
                // where input and trigger are the same thing) keep the original
                // behaviour of reading the current payload.
                $curr = $data;
            } elseif (is_array($data) && array_key_exists($namespace, $data)) {
                $curr = $data[$namespace];
            } else {
                return null;
            }
        }

        foreach ($parts as $p) {
            if (is_array($curr) && isset($curr[$p])) {
                $curr = $curr[$p];
            } else if (is_object($curr) && isset($curr->$p)) {
                $curr = $curr->$p;
            } else {
                return null;
            }
        }
        return $curr;
    }
}

if (!function_exists('ccrm_interpolate_variables')) {
    function ccrm_interpolate_variables($text, $inputData, $context = null) {
        if (!is_string($text)) return $text;
        return preg_replace_callback('/\{\{([a-zA-Z0-9_\.\$]+)\}\}/', function($matches) use ($inputData, $context) {
            $path = $matches[1];
            $val = ccrm_resolve_json_path($path, $inputData, $context);
            if ($val === null) return '';
            if (is_array($val) || is_object($val)) {
                return json_encode($val, JSON_UNESCAPED_UNICODE);
            }
            return (string)$val;
        }, $text);
    }
}

if (!function_exists('ccrm_evaluate_condition')) {
    function ccrm_evaluate_condition($conditionJs, $inputData, $context = null) {
        $conditionJs = trim($conditionJs);
        if ($conditionJs === '') {
            return true;
        }
        if (stripos($conditionJs, 'return ') === 0) {
            $conditionJs = substr($conditionJs, 7);
        }
        $conditionJs = rtrim($conditionJs, ';');

        $tokens = preg_split('/(\|\||&&)/', $conditionJs, -1, PREG_SPLIT_DELIM_CAPTURE);
        $results = [];
        $operators = [];
        
        foreach ($tokens as $token) {
            $token = trim($token);
            if ($token === '||' || $token === '&&') {
                $operators[] = $token;
                continue;
            }
            
            // Compare left, operator, right
            if (preg_match('/^(\$[a-zA-Z0-9_\.]+)\s*(===|==|!==|!=|>=|<=|>|<)\s*(.+)$/', $token, $matches)) {
                $leftPath = $matches[1];
                $op = $matches[2];
                $rightRaw = trim($matches[3]);
                
                $leftVal = ccrm_resolve_json_path($leftPath, $inputData, $context);
                
                if ($rightRaw === 'true') {
                    $rightVal = true;
                } elseif ($rightRaw === 'false') {
                    $rightVal = false;
                } elseif ($rightRaw === 'null') {
                    $rightVal = null;
                } elseif (preg_match('/^[\'"](.*)[\'"]$/', $rightRaw, $strMatches)) {
                    $rightVal = $strMatches[1];
                } elseif (is_numeric($rightRaw)) {
                    $rightVal = (float)$rightRaw;
                } else {
                    if (strpos($rightRaw, '$') === 0) {
                        $rightVal = ccrm_resolve_json_path($rightRaw, $inputData, $context);
                    } else {
                        $rightVal = $rightRaw;
                    }
                }
                
                switch ($op) {
                    case '===': $res = ($leftVal === $rightVal); break;
                    case '==':  $res = ($leftVal == $rightVal); break;
                    case '!==': $res = ($leftVal !== $rightVal); break;
                    case '!=':  $res = ($leftVal != $rightVal); break;
                    case '>':   $res = ($leftVal > $rightVal); break;
                    case '>=':  $res = ($leftVal >= $rightVal); break;
                    case '<':   $res = ($leftVal < $rightVal); break;
                    case '<=':  $res = ($leftVal <= $rightVal); break;
                    default:    $res = false;
                }
                $results[] = $res;
            } else {
                if (strpos($token, '$') === 0) {
                    $results[] = (bool)ccrm_resolve_json_path($token, $inputData, $context);
                } else {
                    $results[] = false;
                }
            }
        }
        
        if (empty($results)) return false;
        
        $finalRes = $results[0];
        for ($i = 0; $i < count($operators); $i++) {
            $op = $operators[$i];
            $nextVal = $results[$i + 1] ?? false;
            if ($op === '&&') {
                $finalRes = $finalRes && $nextVal;
            } elseif ($op === '||') {
                $finalRes = $finalRes || $nextVal;
            }
        }
        return $finalRes;
    }
}

if (!function_exists('ccrm_load_automation_config')) {
    function ccrm_load_automation_config($pdo) {
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'AUTOMATION_CONFIG'")->fetchColumn();
        } catch (\Throwable $e) {
            $raw = false;
        }
        if (!$raw) {
            $defaultConfig = ['cronToken' => bin2hex(random_bytes(16))];
            try {
                $stmt = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('AUTOMATION_CONFIG', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
                $stmt->execute([json_encode($defaultConfig)]);
            } catch (\Throwable $e) {}
            return $defaultConfig;
        }
        $cfg = json_decode($raw, true) ?: [];
        if (empty($cfg['cronToken'])) {
            $cfg['cronToken'] = bin2hex(random_bytes(16));
        }
        return $cfg;
    }
}

if (!function_exists('ccrm_ai_provider_key')) {
    /**
     * API key for one of the LLM providers an AI agent node can pick. All AI
     * credentials live in INTEGRATIONS_CONFIG (Settings -> AI) so the CRM's AI
     * features and the workflow engine never read from two diverging copies.
     */
    function ccrm_ai_provider_key($pdo, string $provider): string {
        static $cfg = null;
        if ($cfg === null) {
            try {
                $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'")->fetchColumn();
            } catch (\Throwable $e) {
                $raw = false;
            }
            $cfg = $raw ? (json_decode($raw, true) ?: []) : [];
            if (function_exists('ccrm_decrypt_config_secrets') && function_exists('ccrm_integration_secret_keys')) {
                $cfg = ccrm_decrypt_config_secrets($cfg, ccrm_integration_secret_keys());
            }
        }
        $field = [
            'openai' => 'openAiKey',
            'anthropic' => 'anthropicKey',
            'gemini' => 'geminiKey',
        ][$provider] ?? '';
        return $field ? (string)($cfg[$field] ?? '') : '';
    }
}

if (!function_exists('ccrm_workflow_task_states')) {
    /**
     * The operator's configured task states, in board order. Index 0 is the
     * state a fresh task opens in and the last one counts as done — the same
     * convention the frontend uses. A workflow-created task must use these
     * labels: a hardcoded 'todo' matches no configured state, so the task would
     * render grey and drop out of every state filter and board column.
     */
    function ccrm_workflow_task_states($pdo) {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $states = [];
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATES'")->fetchColumn();
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                foreach ($decoded as $state) {
                    if (is_string($state) && trim($state) !== '') {
                        $states[] = $state;
                    }
                }
            }
        } catch (\Throwable $e) {
            // Fall through to the seeded defaults below.
        }
        if (!$states && function_exists('ccrm_default_lists')) {
            try {
                $language = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
                $states = ccrm_default_lists(is_string($language) ? $language : 'sk')['taskStates'] ?? [];
            } catch (\Throwable $e) {
                $states = [];
            }
        }
        $cached = $states;
        return $cached;
    }
}

if (!function_exists('ccrm_workflow_open_task_exists')) {
    /**
     * True when this workflow already has a live task for the same record.
     * Without it, moving a lead back and forth across the trigger status (a
     * correction, a re-send, a drag onto the wrong column and back) stacks up a
     * duplicate follow-up every single time.
     *
     * "Live" mirrors the frontend's isDoneState(): not archived, and neither the
     * literal 'done' nor whatever the operator named their last task state.
     * A finished follow-up is therefore allowed to be superseded by a new one.
     *
     * The title is part of the match so that a workflow with several create-task
     * nodes (an onboarding kickoff *and* a document handover, say) still opens
     * all of them for the same record — only a repeat of the same task is
     * suppressed.
     */
    function ccrm_workflow_open_task_exists($pdo, $workflowId, $relatedLeadId, $title) {
        if ($workflowId === null || $workflowId === '') {
            return false;
        }
        $states = ccrm_workflow_task_states($pdo);
        $lastState = $states ? (string)end($states) : null;

        $sql = "SELECT COUNT(*) FROM `tasks`
                 WHERE `workflow_id` = ?
                   AND `archived` = 0
                   AND LOWER(`status`) <> 'done'";
        $params = [$workflowId];
        if ($lastState !== null && strtolower($lastState) !== 'done') {
            $sql .= " AND `status` <> ?";
            $params[] = $lastState;
        }
        // Scope to the record the workflow fired for. Tasks that could not be
        // linked (the trigger payload carried no record id) are matched on the
        // rendered title alone, which already carries the client name.
        if ($relatedLeadId !== null && $relatedLeadId !== '') {
            $sql .= " AND `related_lead_id` = ?";
            $params[] = $relatedLeadId;
        } else {
            $sql .= " AND `related_lead_id` IS NULL";
        }
        $sql .= " AND `title` = ?";
        $params[] = $title;

        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return (int)$stmt->fetchColumn() > 0;
        } catch (\Throwable $e) {
            // A failed lookup must not block the automation; creating a possible
            // duplicate beats silently dropping the follow-up.
            if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
            return false;
        }
    }
}

if (!function_exists('ccrm_workflow_related_record_id')) {
    /**
     * The `leads` row a payload points at, or null. Leads and clients share that
     * table and are told apart by their id prefix, so both count as a link
     * target for a task.
     */
    function ccrm_workflow_related_record_id($payload) {
        if (!is_array($payload)) {
            return null;
        }
        foreach ([$payload['id'] ?? null, $payload['related_lead_id'] ?? null, $payload['relatedLeadId'] ?? null] as $candidate) {
            if (is_string($candidate) && (strpos($candidate, 'lead-') === 0 || strpos($candidate, 'client-') === 0)) {
                return $candidate;
            }
        }
        return null;
    }
}

if (!function_exists('ccrm_workflow_unreachable_nodes')) {
    /**
     * Nodes no edge can lead to from the trigger.
     *
     * The executor walks outward from the trigger, so a node nothing links to is
     * never visited and never logged — a workflow whose only action is left
     * unconnected therefore finished as a plain "success" while doing nothing at
     * all, which reads as a broken action rather than a missing connection.
     *
     * Reachability ignores which branch of a condition would be taken: an unused
     * false-branch is a normal run, while a node outside the graph entirely can
     * never run for any input and is always a mistake worth reporting.
     */
    function ccrm_workflow_unreachable_nodes($nodes, $edges, $triggerNodeId) {
        $reachable = [$triggerNodeId => true];
        $stack = [$triggerNodeId];
        while ($stack) {
            $current = array_pop($stack);
            foreach ($edges as $edge) {
                $target = $edge['target'] ?? null;
                if (($edge['source'] ?? null) === $current && $target !== null && !isset($reachable[$target])) {
                    $reachable[$target] = true;
                    $stack[] = $target;
                }
            }
        }

        $unreachable = [];
        foreach ($nodes as $node) {
            $id = $node['id'] ?? null;
            if ($id === null || isset($reachable[$id]) || ($node['type'] ?? '') === 'trigger') {
                continue;
            }
            $unreachable[] = $node;
        }
        return $unreachable;
    }
}

if (!function_exists('ccrm_workflow_resolve_assignee')) {
    /**
     * Narrow a workflow's assignee expression down to exactly one real CRM user.
     *
     * A task assignee is stored as a user *name* (`tasks`.`owner` and
     * `task_assignees`.`user_name`), so anything that is not one opens a task
     * that appears in nobody's list. The builder now offers a single choice per
     * node, but saved workflows still hold hand-typed strings, a name with a
     * variable appended behind it ("Admin {{$trigger.changedBy}}"), or a
     * variable that resolved to an e-mail — so normalise here as well.
     *
     * A value that names nobody is dropped: leaving the task unassigned is
     * honest, while writing an unknown string pretends someone owns the work.
     */
    function ccrm_workflow_resolve_assignee($pdo, $raw) {
        $candidate = trim(preg_replace('/\s+/u', ' ', (string)$raw));
        if ($candidate === '') {
            return '';
        }

        static $users = null;
        if ($users === null) {
            $users = [];
            try {
                $rows = $pdo->query("SELECT `name`, `email` FROM `users`")->fetchAll(PDO::FETCH_ASSOC) ?: [];
                foreach ($rows as $row) {
                    $name = trim((string)($row['name'] ?? ''));
                    if ($name === '') {
                        continue;
                    }
                    $users[] = ['name' => $name, 'email' => mb_strtolower(trim((string)($row['email'] ?? '')), 'UTF-8')];
                }
            } catch (\Throwable $e) {
                if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
                $users = [];
            }
        }
        // Nothing to check against (query failed, empty install): keep the
        // literal value rather than silently dropping every assignment.
        if (!$users) {
            return $candidate;
        }

        $lower = mb_strtolower($candidate, 'UTF-8');
        foreach ($users as $u) {
            if ($u['name'] === $candidate) {
                return $u['name'];
            }
        }
        foreach ($users as $u) {
            if (mb_strtolower($u['name'], 'UTF-8') === $lower) {
                return $u['name'];
            }
        }
        foreach ($users as $u) {
            if ($u['email'] !== '' && $u['email'] === $lower) {
                return $u['name'];
            }
        }
        // A name buried in leftover text. Longest match wins so that "Jan"
        // never beats "Jan Novak" when both are on the team.
        $best = '';
        foreach ($users as $u) {
            if (mb_strpos($lower, mb_strtolower($u['name'], 'UTF-8')) !== false
                && mb_strlen($u['name'], 'UTF-8') > mb_strlen($best, 'UTF-8')) {
                $best = $u['name'];
            }
        }
        return $best;
    }
}

if (!function_exists('ccrm_call_llm')) {
    function ccrm_call_llm($provider, $key, $prompt, $options = []) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        
        if ($provider === 'gemini') {
            $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . $key;
            $payload = [
                'contents' => [
                    ['parts' => [['text' => $prompt]]]
                ]
            ];
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        } elseif ($provider === 'openai') {
            $url = 'https://api.openai.com/v1/chat/completions';
            $model = $options['model'] ?? 'gpt-5.6-luna';
            $payload = [
                'model' => $model,
                'messages' => [['role' => 'user', 'content' => $prompt]]
            ];
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $key
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        } elseif ($provider === 'anthropic') {
            $url = 'https://api.anthropic.com/v1/messages';
            $model = $options['model'] ?? 'claude-3-5-sonnet-20241022';
            $payload = [
                'model' => $model,
                'max_tokens' => 1024,
                'messages' => [['role' => 'user', 'content' => $prompt]]
            ];
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'x-api-key: ' . $key,
                'anthropic-version: 2023-06-01'
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        } else {
            throw new Exception("Unknown AI provider: $provider");
        }
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            throw new Exception("LLM call failed with HTTP code $httpCode: " . $response);
        }
        
        $data = json_decode($response, true);
        if ($provider === 'gemini') {
            return $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        } elseif ($provider === 'openai') {
            return $data['choices'][0]['message']['content'] ?? '';
        } elseif ($provider === 'anthropic') {
            return $data['content'][0]['text'] ?? '';
        }
        return '';
    }
}

if (!function_exists('ccrm_trigger_workflow')) {
    function ccrm_trigger_workflow($eventType, $payload, $pdo) {
        try {
            // Find all active workflows with this trigger_type
            $stmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `trigger_type` = ? AND `is_active` = 1");
            $stmt->execute([$eventType]);
            $workflows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($workflows as $wf) {
                $config = json_decode($wf['trigger_config_json'] ?? '{}', true) ?: [];
                $matches = true;
                
                // Match filters based on trigger type
                if ($eventType === 'lead_created') {
                    if (!empty($config['leadSource']) && isset($payload['source'])) {
                        $sources = (array)$config['leadSource'];
                        if (!in_array($payload['source'], $sources, true)) {
                            $matches = false;
                        }
                    }
                } elseif ($eventType === 'lead_status_changed') {
                    if (isset($payload['oldStatus']) && isset($payload['newStatus'])) {
                        if (!empty($config['fromStatus']) && $config['fromStatus'] !== 'any') {
                            if ($payload['oldStatus'] !== $config['fromStatus']) $matches = false;
                        }
                        if (!empty($config['toStatus']) && $config['toStatus'] !== 'any') {
                            if ($payload['newStatus'] !== $config['toStatus']) $matches = false;
                        }
                    }
                } elseif ($eventType === 'client_created') {
                    // The payload is the client row as the browser pushed it, so the
                    // key is camelCase. The snake_case spelling this used to read
                    // never existed in it, which made the filter silently vanish and
                    // fired the workflow for every new client. Both spellings are
                    // accepted so anything already queued still matches.
                    $clientType = $payload['clientType'] ?? $payload['client_type'] ?? null;
                    if (!empty($config['clientType']) && $clientType !== null) {
                        if ($clientType !== $config['clientType']) $matches = false;
                    }
                } elseif ($eventType === 'task_created') {
                    if (!empty($config['owner']) && isset($payload['owner'])) {
                        if ($payload['owner'] !== $config['owner']) $matches = false;
                    }
                } elseif ($eventType === 'task_status_changed') {
                    if (isset($payload['oldStatus']) && isset($payload['newStatus'])) {
                        if (!empty($config['fromStatus']) && $config['fromStatus'] !== 'any') {
                            if ($payload['oldStatus'] !== $config['fromStatus']) $matches = false;
                        }
                        if (!empty($config['toStatus']) && $config['toStatus'] !== 'any') {
                            if ($payload['newStatus'] !== $config['toStatus']) $matches = false;
                        }
                    }
                }
                
                if ($matches) {
                    $ins = $pdo->prepare("
                        INSERT INTO `workflow_queue` (`workflow_id`, `trigger_event_type`, `payload_json`, `status`)
                        VALUES (?, ?, ?, 'pending')
                    ");
                    $ins->execute([$wf['id'], $eventType, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
                    $hasEnqueued = true;
                }
            }

            if (!empty($hasEnqueued) && !$pdo->inTransaction()) {
                ccrm_process_workflow_queue($pdo);
            }
        } catch (\Throwable $e) {
            if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
        }
    }
}

if (!function_exists('ccrm_execute_workflow')) {
    function ccrm_execute_workflow($wf, $triggerPayload, $pdo, $queueId = null) {
        $startTime = microtime(true);
        $nodes = json_decode($wf['nodes_json'] ?? '[]', true) ?: [];
        $edges = json_decode($wf['edges_json'] ?? '[]', true) ?: [];
        
        $nodesMap = [];
        foreach ($nodes as $node) {
            $nodesMap[$node['id']] = $node;
        }
        
        // Find trigger node
        $triggerNode = null;
        foreach ($nodes as $node) {
            if ($node['type'] === 'trigger') {
                $triggerNode = $node;
                break;
            }
        }
        
        if (!$triggerNode) {
            throw new Exception("Workflow trigger node is missing.");
        }
        
        $executionLog = [];
        $nodeOutputs = [
            $triggerNode['id'] => $triggerPayload,
            'trigger' => $triggerPayload
        ];
        
        // Queue for node execution: [nodeId, incomingPayload, visitedPath, context].
        // The context holds the run-scoped variable namespaces ($trigger, $ai,
        // $condition, $item) and travels down each branch separately, so an AI
        // answer produced in one branch never leaks into a sibling one.
        $rootContext = ['trigger' => is_array($triggerPayload) ? $triggerPayload : []];
        $execQueue = [[$triggerNode['id'], $triggerPayload, [], $rootContext]];

        $status = 'success';

        while (!empty($execQueue)) {
            list($currNodeId, $incomingPayload, $path, $context) = array_shift($execQueue);
            if (in_array($currNodeId, $path)) {
                // Detect cycle, skip to prevent infinite loop
                continue;
            }
            $newPath = array_merge($path, [$currNodeId]);
            
            $node = $nodesMap[$currNodeId] ?? null;
            if (!$node) continue;
            
            $nodeType = $node['type'];
            $nodeData = $node['data'] ?? [];
            
            $outputPayload = $incomingPayload;
            $nodeSuccess = true;
            $errorMsg = null;
            
            try {
                if ($nodeType === 'trigger') {
                    $outputPayload = $incomingPayload;
                } elseif ($nodeType === 'condition') {
                    $jsCode = $nodeData['js_code'] ?? '';
                    $conditionResult = ccrm_evaluate_condition($jsCode, $incomingPayload, $context);
                    $outputPayload = ['result' => $conditionResult];
                } elseif ($nodeType === 'splitter') {
                    // Splitter node is hidden from the builder UI (AutomationView.tsx) until a
                    // trigger/node exists that actually emits a list payload — no current trigger
                    // does, so array_path never resolves and this branch is currently dead in
                    // practice. Re-enable the UI once list-producing sources exist.
                    // Splits events: expects array payload
                    $arrayPath = $nodeData['array_path'] ?? '';
                    $arrayData = ccrm_resolve_json_path($arrayPath, $incomingPayload, $context);
                    if (is_array($arrayData)) {
                        // For splitter, we branch out for each element
                        foreach ($arrayData as $item) {
                            // Find child nodes and queue them with individual item payload
                            $childEdges = array_filter($edges, function($e) use ($currNodeId) {
                                return $e['source'] === $currNodeId;
                            });
                            $itemContext = $context;
                            $itemContext['item'] = ['value' => $item];
                            foreach ($childEdges as $edge) {
                                $execQueue[] = [$edge['target'], $item, $newPath, $itemContext];
                            }
                        }
                        // Stop standard child execution because we just manual-queued it
                        continue;
                    }
                } elseif ($nodeType === 'ai_agent') {
                    $provider = $nodeData['provider'] ?? 'gemini';
                    $key = ccrm_ai_provider_key($pdo, $provider);

                    if (empty($key)) {
                        throw new Exception("AI Provider API key is not configured for $provider. Set it in Settings -> AI Settings & Embeddings.");
                    }
                    
                    $promptTemplate = $nodeData['prompt'] ?? '';
                    $prompt = ccrm_interpolate_variables($promptTemplate, $incomingPayload, $context);
                    
                    $response = ccrm_call_llm($provider, $key, $prompt);
                    
                    // Attempt to decode as JSON if next node expects object, or just keep as text
                    $jsonDecoded = json_decode($response, true);
                    $outputPayload = [
                        'text' => $response,
                        'json' => is_array($jsonDecoded) ? $jsonDecoded : null
                    ];
                } elseif ($nodeType === 'action') {
                    $actionType = $nodeData['type'] ?? '';
                    if ($actionType === 'create_lead' || $actionType === 'create_client') {
                        $name = ccrm_interpolate_variables($nodeData['name'] ?? '', $incomingPayload, $context);
                        $city = ccrm_interpolate_variables($nodeData['city'] ?? '', $incomingPayload, $context);
                        $phone = ccrm_interpolate_variables($nodeData['phone'] ?? '', $incomingPayload, $context);
                        $email = ccrm_interpolate_variables($nodeData['email'] ?? '', $incomingPayload, $context);
                        // Deliberately not called $status: that name holds the
                        // run's own success/failed flag, and overwriting it with
                        // a lead state made the closing workflow_logs INSERT
                        // fail on its ENUM — every workflow that creates a lead
                        // or a client died right after doing its work.
                        $recordStatus = ccrm_interpolate_variables($nodeData['status'] ?? ($actionType === 'create_client' ? 'client' : 'new'), $incomingPayload, $context);
                        $value = (float)ccrm_interpolate_variables($nodeData['value'] ?? '0', $incomingPayload, $context);
                        // An unset owner used to fall back to the literal "Alex" —
                        // a demo account name that does not exist on a real
                        // install, so every workflow-created lead landed on
                        // nobody. Use the same auto-assignment the rest of the
                        // app uses, and the primary user if that is switched off.
                        $owner = trim(ccrm_interpolate_variables($nodeData['owner'] ?? '', $incomingPayload, $context));
                        if ($owner === '') {
                            $owner = ccrm_auto_assign_owner($pdo) ?: ccrm_default_owner($pdo);
                        }
                        $clientType = ($actionType === 'create_client') ? ($nodeData['client_type'] ?? 'person') : 'person';

                        $street = ccrm_interpolate_variables($nodeData['street'] ?? '', $incomingPayload, $context);
                        $postalCode = ccrm_interpolate_variables($nodeData['postal_code'] ?? '', $incomingPayload, $context);
                        $country = ccrm_interpolate_variables($nodeData['country'] ?? 'Slovensko', $incomingPayload, $context);
                        $companyId = ccrm_interpolate_variables($nodeData['company_id'] ?? ($nodeData['ico'] ?? ''), $incomingPayload, $context);
                        $taxId = ccrm_interpolate_variables($nodeData['tax_id'] ?? ($nodeData['dic'] ?? ''), $incomingPayload, $context);
                        $vatId = ccrm_interpolate_variables($nodeData['vat_id'] ?? ($nodeData['ic_dph'] ?? ''), $incomingPayload, $context);
                        $contactPerson = ccrm_interpolate_variables($nodeData['contact_person'] ?? '', $incomingPayload, $context);
                        $website = ccrm_interpolate_variables($nodeData['website'] ?? '', $incomingPayload, $context);
                        
                        $leadId = ($actionType === 'create_client' ? 'client-' : 'lead-') . sprintf('%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff));
                        $stmt = $pdo->prepare("
                            INSERT INTO `leads` (
                              `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `phone`, `email`,
                              `street`, `postal_code`, `country`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`,
                              `created_at`
                            )
                            VALUES (?, ?, ?, ?, ?, 'automation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE())
                        ");
                        $stmt->execute([
                          $leadId, $name, $city, $clientType, $recordStatus, $owner, $value, $phone, $email,
                          $street, $postalCode, $country, $companyId, $taxId, $vatId, $contactPerson, $website
                        ]);
                        $outputPayload = [
                          'id' => $leadId,
                          'name' => $name,
                          'status' => $recordStatus,
                          'client_type' => $clientType,
                          'email' => $email,
                          'phone' => $phone,
                          'city' => $city,
                          'company_id' => $companyId
                        ];
                    } elseif ($actionType === 'create_task') {
                        $title = ccrm_interpolate_variables($nodeData['title'] ?? '', $incomingPayload, $context);
                        $desc = ccrm_interpolate_variables($nodeData['description'] ?? '', $incomingPayload, $context);
                        // Exactly one real user, or nobody at all.
                        $owner = ccrm_workflow_resolve_assignee(
                            $pdo,
                            ccrm_interpolate_variables($nodeData['owner'] ?? '', $incomingPayload, $context)
                        );
                        $priority = $nodeData['priority'] ?? 'medium';
                        $deadlineDays = (int)($nodeData['deadline_days'] ?? 1);

                        // Time of day the task is due. Without it the task lands
                        // on the calendar with no hour and sorts ahead of every
                        // timed entry on that day.
                        $deadlineTime = trim((string)($nodeData['deadline_time'] ?? ''));
                        if (!preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $deadlineTime)) {
                            $deadlineTime = null;
                        }

                        $taskId = 'task-' . sprintf('%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff));
                        $deadline = date('Y-m-d', strtotime("+$deadlineDays days"));

                        // Prefer the record the previous node produced (a freshly
                        // created lead or client), and fall back to the one the
                        // workflow fired for — behind a condition or an AI node
                        // the incoming payload no longer carries it.
                        $relatedLeadId = ccrm_workflow_related_record_id($incomingPayload);
                        if ($relatedLeadId === null) {
                            $relatedLeadId = ccrm_workflow_related_record_id($context['trigger'] ?? null);
                        }

                        // Open the task in the operator's own first state rather
                        // than a hardcoded 'todo' that matches no configured one.
                        $taskStates = ccrm_workflow_task_states($pdo);
                        $taskStatus = $taskStates[0] ?? 'todo';

                        $workflowId = $wf['id'] ?? null;
                        if (ccrm_workflow_open_task_exists($pdo, $workflowId, $relatedLeadId, $title)) {
                            $outputPayload = [
                                'skipped' => true,
                                'reason' => 'An open task from this workflow already exists for this record.',
                                'title' => $title
                            ];
                        } else {
                            $stmt = $pdo->prepare("
                                INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`, `related_lead_id`, `workflow_id`, `created_at`)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Automation', ?, ?, CURRENT_TIMESTAMP())
                            ");
                            $stmt->execute([$taskId, $title, $desc, $priority, $deadline, $deadlineTime, $taskStatus, $owner, $relatedLeadId, $workflowId]);

                            if (!empty($owner)) {
                                $insAss = $pdo->prepare("INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
                                $insAss->execute([$taskId, $owner]);
                            }

                            $outputPayload = [
                                'id' => $taskId,
                                'title' => $title,
                                'description' => $desc,
                                'owner' => $owner,
                                'status' => $taskStatus,
                                'deadline' => $deadline,
                                'deadline_time' => $deadlineTime
                            ];
                        }
                    } elseif ($actionType === 'send_email') {
                        // Outbound SMTP setup
                        require_once __DIR__ . '/mail_broker.php';
                        $mailSettings = ccrm_load_integrations_config($pdo);
                        
                        $to = ccrm_interpolate_variables($nodeData['to'] ?? '', $incomingPayload, $context);
                        $subject = ccrm_interpolate_variables($nodeData['subject'] ?? '', $incomingPayload, $context);
                        $body = ccrm_interpolate_variables($nodeData['body'] ?? '', $incomingPayload, $context);
                        
                        // Deliver through the system outbound profile, which
                        // validates every SMTP reply code. The previous php
                        // mail() fallback ignored its own return value, so an
                        // unconfigured server logged "success" while the mail
                        // was silently dropped — never report a send the
                        // server did not actually accept.
                        ccrm_send_system_mail($mailSettings, $to, $subject, $body);
                        $outputPayload = ['success' => true, 'to' => $to, 'subject' => $subject];
                    } else {
                        // Other actions (Reply to email, SMS, Create document) are stubbed out or simulated for testing
                        $outputPayload = ['action' => $actionType, 'simulated' => true, 'time' => date('Y-m-d H:i:s')];
                    }
                }
            } catch (\Throwable $e) {
                $nodeSuccess = false;
                $status = 'failed';
                $errorMsg = $e->getMessage();
                $outputPayload = ['error' => $errorMsg];
            }
            
            $nodeOutputs[$currNodeId] = $outputPayload;
            
            $executionLog[] = [
                'node_id' => $currNodeId,
                'node_name' => $node['name'] ?? $nodeType,
                'type' => $nodeType,
                'success' => $nodeSuccess,
                'error' => $errorMsg,
                'input' => $incomingPayload,
                'output' => $outputPayload
            ];
            
            if (!$nodeSuccess) {
                break; // Stop execution on error
            }
            
            // Find children / downstream nodes
            $childEdges = array_filter($edges, function($e) use ($currNodeId) {
                return $e['source'] === $currNodeId;
            });

            // Hand the branch its own namespaces, so downstream nodes can read
            // {{$ai.result}} / {{$condition.result}} next to {{$trigger.*}}.
            $childContext = $context;
            if ($nodeType === 'condition') {
                $childContext['condition'] = ['result' => (bool)($outputPayload['result'] ?? false)];
            } elseif ($nodeType === 'ai_agent') {
                $aiText = (string)($outputPayload['text'] ?? '');
                $childContext['ai'] = [
                    'result' => $aiText,
                    'summary' => $aiText,
                    'text' => $aiText,
                    'json' => $outputPayload['json'] ?? null
                ];
            }

            foreach ($childEdges as $edge) {
                // If current node was a condition node, only travel down matching edges
                if ($nodeType === 'condition') {
                    $handle = $edge['sourceHandle'] ?? 'true';
                    $evalResult = (bool)($outputPayload['result'] ?? false);
                    $pathMatches = ($handle === 'true' && $evalResult) || ($handle === 'false' && !$evalResult);
                    if (!$pathMatches) continue;
                }
                $execQueue[] = [$edge['target'], $outputPayload, $newPath, $childContext];
            }
        }
        
        // Report every block the run could not even reach. Without this the log
        // says "success" for a workflow that did nothing, and the operator goes
        // looking for a bug in an action that was never executed.
        foreach (ccrm_workflow_unreachable_nodes($nodes, $edges, $triggerNode['id']) as $stranded) {
            $strandedType = $stranded['type'] ?? 'action';
            $executionLog[] = [
                'node_id' => $stranded['id'] ?? '',
                'node_name' => $stranded['name'] ?? $strandedType,
                'type' => $strandedType,
                'success' => false,
                'error' => 'Action node not connected: nothing links it to the trigger, so it never runs. Connect it to the previous block in the workflow builder.',
                'input' => null,
                'output' => null
            ];
            $status = 'failed';
        }

        $durationMs = (int)((microtime(true) - $startTime) * 1000);

        // Log the execution
        $logId = 'log-' . sprintf('%04x%04x-%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
        $logStmt = $pdo->prepare("
            INSERT INTO `workflow_logs` (`id`, `workflow_id`, `queue_id`, `status`, `execution_time_ms`, `trigger_event`, `execution_log_json`)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $logStmt->execute([
            $logId,
            $wf['id'],
            $queueId,
            $status,
            $durationMs,
            $wf['trigger_type'],
            json_encode($executionLog, JSON_UNESCAPED_UNICODE)
        ]);
        
        return [
            'status' => $status,
            'duration_ms' => $durationMs,
            'logs' => $executionLog
        ];
    }
}

if (!function_exists('ccrm_process_workflow_queue')) {
    function ccrm_process_workflow_queue($pdo) {
        // Fetch up to 10 pending queue items
        $stmt = $pdo->query("SELECT * FROM `workflow_queue` WHERE `status` = 'pending' ORDER BY `created_at` ASC LIMIT 10");
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($items as $item) {
            // Update status to processing
            $update = $pdo->prepare("UPDATE `workflow_queue` SET `status` = 'processing' WHERE `id` = ?");
            $update->execute([$item['id']]);
            
            try {
                // Fetch workflow
                $wfStmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `id` = ? AND `is_active` = 1 LIMIT 1");
                $wfStmt->execute([$item['workflow_id']]);
                $wf = $wfStmt->fetch(PDO::FETCH_ASSOC);
                
                if (!$wf) {
                    throw new Exception("Workflow not found or inactive.");
                }
                
                $payload = json_decode($item['payload_json'] ?? '{}', true) ?: [];
                $result = ccrm_execute_workflow($wf, $payload, $pdo, $item['id']);
                
                // Complete queue item
                $complete = $pdo->prepare("UPDATE `workflow_queue` SET `status` = 'completed', `processed_at` = CURRENT_TIMESTAMP() WHERE `id` = ?");
                $complete->execute([$item['id']]);
            } catch (\Throwable $e) {
                // Fail queue item
                $fail = $pdo->prepare("UPDATE `workflow_queue` SET `status` = 'failed', `error_message` = ?, `processed_at` = CURRENT_TIMESTAMP() WHERE `id` = ?");
                $fail->execute([$e->getMessage(), $item['id']]);
            }
        }
    }
}
