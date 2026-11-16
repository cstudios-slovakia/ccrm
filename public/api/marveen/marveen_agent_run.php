<?php
/**
 * Agent tool-call dispatch and the Gemini, Anthropic and OpenAI loops.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

if (!function_exists('ccrm_marveen_execute_agent_tool_call')) {
    /**
     * Shared tool-call dispatcher for pure-PHP API agent loops (Gemini, Anthropic, OpenAI).
     */
    function ccrm_marveen_execute_agent_tool_call(
        string $fnName,
        array $fnArgs,
        callable $mcpCall,
        ?PDO $pdo,
        ?array $connector,
        string $connectorId,
        ?string $subagentId,
        int $depth,
        string $systemPrompt,
        string &$effectiveSystemPrompt,
        array &$steps,
        array &$sentReplyTargets,
        callable $delegateRunner
    ): string {
        if ($pdo !== null && in_array($fnName, [
            'whatsapp_list_chats',
            'whatsapp_read_messages',
            'whatsapp_send_message',
            'whatsapp_sync_chat',
        ], true)) {
            $waReplyKey = $fnName === 'whatsapp_send_message'
                ? ('wa:' . strtolower(trim((string)($fnArgs['chat'] ?? ($fnArgs['chat_id'] ?? 'default')))))
                : '';
            if ($waReplyKey !== '' && isset($sentReplyTargets[$waReplyKey])) {
                return json_encode([
                    'ok' => true,
                    'alreadySent' => true,
                    'message' => 'A WhatsApp reply was already sent to this chat in this run. Do not send duplicate replies.',
                ]);
            }
            $waExec = ccrm_marveen_execute_whatsapp_tool($pdo, $connector, $fnName, $fnArgs);
            $toolText = (string)($waExec['toolText'] ?? '');
            if ($waReplyKey !== '' && str_contains($toolText, '"ok":true')) {
                $sentReplyTargets[$waReplyKey] = true;
            }
            if (!empty($waExec['step'])) {
                $steps[] = $waExec['step'];
            }
            return $toolText;
        }

        if ($pdo !== null && in_array($fnName, [
            'email_list_accounts',
            'email_list_messages',
            'email_read_thread',
            'email_send_reply',
        ], true)) {
            $emReplyKey = $fnName === 'email_send_reply'
                ? ('em:' . strtolower(trim((string)($fnArgs['to'] ?? ($fnArgs['reply_to_uid'] ?? 'default')))))
                : '';
            if ($emReplyKey !== '' && isset($sentReplyTargets[$emReplyKey])) {
                return json_encode([
                    'ok' => true,
                    'alreadySent' => true,
                    'message' => 'An email reply was already sent to this recipient in this run. Do not send duplicate replies.',
                ]);
            }
            $emExec = ccrm_marveen_execute_email_tool($pdo, $connector, $fnName, $fnArgs);
            $toolText = (string)($emExec['toolText'] ?? '');
            if ($emReplyKey !== '' && str_contains($toolText, '"ok":true')) {
                $sentReplyTargets[$emReplyKey] = true;
            }
            if (!empty($emExec['step'])) {
                $steps[] = $emExec['step'];
            }
            return $toolText;
        }

        if ($pdo !== null && $connector !== null && in_array($fnName, [
            'memory_read',
            'memory_write',
            'memory_append',
            'artifact_write',
            'artifact_read',
            'artifact_list',
            'artifact_delete',
            'create_subagent',
            'list_subagents',
            'delete_subagent',
            'delegate_to_subagent',
            'schedule_autonomous_task',
            'list_autonomous_tasks',
            'cancel_autonomous_task',
            'create_event_trigger',
            'list_event_triggers',
            'delete_event_trigger',
            'schedule_conversation_followup',
            'list_conversation_followups',
            'cancel_conversation_followup',
        ], true)) {
            $targetSubId = !empty($fnArgs['subagent_id']) ? (string)$fnArgs['subagent_id'] : $subagentId;
            if ($fnName === 'memory_read') {
                $m = ccrm_marveen_get_memory($pdo, $connector, $targetSubId);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'memory',
                    'tool' => 'memory_read',
                    'label' => $targetSubId ? "Read subagent ({$targetSubId}) memory.md" : 'Read memory.md',
                ];
                return $m['memoryMd'];
            }
            if ($fnName === 'memory_write') {
                $newContent = (string)($fnArgs['content'] ?? '');
                $saved = ccrm_marveen_save_memory($pdo, $connectorId, $newContent, $targetSubId);
                $effectiveSystemPrompt = ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'memory',
                    'tool' => 'memory_write',
                    'label' => $targetSubId ? "Updated subagent ({$targetSubId}) memory.md" : 'Updated memory.md',
                ];
                return "Successfully updated memory.md (" . strlen($saved['memoryMd']) . " bytes).";
            }
            if ($fnName === 'memory_append') {
                $entry = trim((string)($fnArgs['entry'] ?? ($fnArgs['content'] ?? '')));
                $cur = ccrm_marveen_get_memory($pdo, $connector, $targetSubId)['memoryMd'];
                $line = str_starts_with($entry, '-') || str_starts_with($entry, '#') ? $entry : ('- ' . $entry);
                $merged = rtrim($cur) . "\n" . $line . "\n";
                ccrm_marveen_save_memory($pdo, $connectorId, $merged, $targetSubId);
                $effectiveSystemPrompt = ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'memory',
                    'tool' => 'memory_append',
                    'label' => $targetSubId ? "Appended to {$targetSubId} memory.md" : 'Appended to memory.md',
                    'detail' => $line,
                ];
                return "Appended to memory.md:\n" . $line;
            }
            if ($fnName === 'artifact_write') {
                $savedArt = ccrm_marveen_save_artifact($pdo, $connectorId, $fnArgs);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'memory',
                    'tool' => 'artifact_write',
                    'label' => "Saved artifact: {$savedArt['id']}",
                    'detail' => $savedArt['title'],
                ];
                return json_encode(['ok' => true, 'artifact' => $savedArt], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'artifact_read') {
                $reqName = trim((string)($fnArgs['name'] ?? ''));
                $arts = ccrm_marveen_list_artifacts($pdo, $connector);
                $foundContent = 'Artifact not found: ' . $reqName;
                foreach ($arts as $a) {
                    if (($a['id'] ?? '') === $reqName || ($a['title'] ?? '') === $reqName) {
                        $foundContent = (string)($a['content'] ?? '');
                        break;
                    }
                }
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'memory',
                    'tool' => 'artifact_read',
                    'label' => "Read artifact: {$reqName}",
                ];
                return $foundContent;
            }
            if ($fnName === 'artifact_list') {
                $arts = ccrm_marveen_list_artifacts($pdo, $connector);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'memory',
                    'tool' => 'artifact_list',
                    'label' => 'Listed artifacts (' . count($arts) . ')',
                ];
                return json_encode(['artifacts' => $arts], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'artifact_delete') {
                $delName = trim((string)($fnArgs['name'] ?? ''));
                $deleted = ccrm_marveen_delete_artifact($pdo, $connectorId, $delName);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'memory',
                    'tool' => 'artifact_delete',
                    'label' => "Deleted artifact: {$delName}",
                ];
                return json_encode(['ok' => $deleted, 'deleted' => $delName]);
            }
            if ($fnName === 'create_subagent') {
                $sub = ccrm_marveen_save_subagent($pdo, $connectorId, $fnArgs);
                $effectiveSystemPrompt = ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'subagent',
                    'tool' => 'create_subagent',
                    'label' => "Created subagent: {$sub['name']} ({$sub['id']})",
                    'detail' => $sub['role'],
                ];
                return json_encode(['ok' => true, 'subagent' => $sub], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'list_subagents') {
                $subs = ccrm_marveen_list_subagents($pdo, $connector);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'subagent',
                    'tool' => 'list_subagents',
                    'label' => 'Listed subagents (' . count($subs) . ')',
                ];
                return json_encode(['subagents' => $subs], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'delete_subagent') {
                $delId = (string)($fnArgs['id'] ?? '');
                $deleted = ccrm_marveen_delete_subagent($pdo, $connectorId, $delId);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'subagent',
                    'tool' => 'delete_subagent',
                    'label' => "Removed subagent: {$delId}",
                ];
                return json_encode(['ok' => $deleted, 'deletedId' => $delId]);
            }
            if ($fnName === 'delegate_to_subagent') {
                $delSubId = preg_replace('/[^a-z0-9_-]/', '-', strtolower(trim((string)($fnArgs['id'] ?? ''))));
                $delTask = trim((string)($fnArgs['task'] ?? ''));
                $subs = ccrm_marveen_list_subagents($pdo, $connector);
                $foundSub = null;
                foreach ($subs as $s) {
                    if (($s['id'] ?? '') === $delSubId || strtolower((string)($s['name'] ?? '')) === strtolower((string)($fnArgs['id'] ?? ''))) {
                        $foundSub = $s;
                        $delSubId = (string)$s['id'];
                        break;
                    }
                }
                if ($foundSub === null) {
                    $foundSub = ccrm_marveen_save_subagent($pdo, $connectorId, [
                        'id' => $delSubId ?: 'subagent',
                        'name' => (string)($fnArgs['id'] ?? 'Subagent'),
                        'role' => 'Autonomous Subagent',
                        'systemPrompt' => "You are a specialized CCRM subagent handling: {$delTask}",
                    ]);
                    $delSubId = (string)$foundSub['id'];
                }
                $subRes = $delegateRunner($delTask, $delSubId, $depth + 1);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'subagent',
                    'tool' => 'delegate_to_subagent',
                    'label' => "Delegated to {$foundSub['name']} ({$delSubId})",
                    'detail' => $delTask,
                    'subSteps' => $subRes['steps'] ?? [],
                ];
                return !empty($subRes['ok'])
                    ? ("[Subagent {$foundSub['name']} ({$delSubId}) Report]:\n" . ($subRes['text'] ?? ''))
                    : ("Subagent {$delSubId} error: " . ($subRes['error'] ?? 'failed'));
            }
            if ($fnName === 'schedule_autonomous_task') {
                $savedTask = ccrm_marveen_save_task($pdo, $connectorId, $fnArgs);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'schedule_autonomous_task',
                    'label' => "Scheduled autonomous task: {$savedTask['title']} (every {$savedTask['intervalMinutes']}m)",
                ];
                return json_encode(['ok' => true, 'task' => $savedTask], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'list_autonomous_tasks') {
                $tasks = ccrm_marveen_list_tasks($pdo, $connector);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'list_autonomous_tasks',
                    'label' => 'Listed autonomous tasks (' . count($tasks) . ')',
                ];
                return json_encode(['tasks' => $tasks], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'cancel_autonomous_task') {
                $cancelId = (string)($fnArgs['id'] ?? '');
                $removed = ccrm_marveen_delete_task($pdo, $connectorId, $cancelId);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'cancel_autonomous_task',
                    'label' => "Cancelled autonomous task: {$cancelId}",
                ];
                return json_encode(['ok' => $removed, 'id' => $cancelId]);
            }
            if ($fnName === 'create_event_trigger') {
                $trigPayload = [
                    'id' => (string)($fnArgs['id'] ?? ''),
                    'name' => (string)($fnArgs['name'] ?? 'Reactive Trigger'),
                    'sourceType' => (string)($fnArgs['source_type'] ?? 'whatsapp'),
                    'sourceConnectorId' => (string)($fnArgs['source_connector_id'] ?? ''),
                    'targetSubagentId' => (string)($fnArgs['target_subagent_id'] ?? ($fnArgs['target_agent_id'] ?? ($subagentId ?? ''))),
                    'filter' => [
                        'chatMatch' => (string)($fnArgs['chat_match'] ?? ($fnArgs['whatsapp_chat'] ?? '')),
                        'onlyGroup' => !empty($fnArgs['only_group']),
                        'onlyDirect' => !empty($fnArgs['only_direct']),
                        'subjectContains' => (string)($fnArgs['subject_contains'] ?? ($fnArgs['email_subject_filter'] ?? '')),
                        'fromContains' => (string)($fnArgs['from_contains'] ?? ($fnArgs['email_sender_filter'] ?? '')),
                        'keywordContains' => (string)($fnArgs['keyword_contains'] ?? ''),
                        'eventType' => (string)($fnArgs['crm_event_name'] ?? 'lead_created'),
                    ],
                    'instructions' => (string)($fnArgs['instructions'] ?? ''),
                    'autoReply' => array_key_exists('auto_reply', $fnArgs) ? (bool)$fnArgs['auto_reply'] : true,
                    'proactiveEnabled' => !empty($fnArgs['proactive_enabled']),
                    'proactiveAfterMinutes' => max(1, (int)($fnArgs['proactive_after_minutes'] ?? 120)),
                    'proactiveMaxAttempts' => max(1, min(5, (int)($fnArgs['proactive_max_attempts'] ?? 1))),
                    'proactiveInstructions' => (string)($fnArgs['proactive_instructions'] ?? ''),
                    'enabled' => true,
                ];
                $savedTrig = ccrm_marveen_save_trigger($pdo, $connectorId, $trigPayload);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'create_event_trigger',
                    'label' => "Created reactive trigger: {$savedTrig['name']} (⚡ {$savedTrig['sourceType']})",
                ];
                return json_encode(['ok' => true, 'trigger' => $savedTrig], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'list_event_triggers') {
                $trigs = ccrm_marveen_list_triggers($pdo, $connector);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'list_event_triggers',
                    'label' => 'Listed reactive triggers (' . count($trigs) . ')',
                ];
                return json_encode(['triggers' => $trigs], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'delete_event_trigger') {
                $delTrigId = (string)($fnArgs['id'] ?? '');
                $removedTrig = ccrm_marveen_delete_trigger($pdo, $connectorId, $delTrigId);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'delete_event_trigger',
                    'label' => "Deleted reactive trigger: {$delTrigId}",
                ];
                return json_encode(['ok' => $removedTrig, 'id' => $delTrigId]);
            }
            if ($fnName === 'schedule_conversation_followup') {
                $fupInput = array_merge($fnArgs, [
                    'subagentId' => $subagentId,
                ]);
                $savedFup = ccrm_marveen_save_followup($pdo, $connectorId, $fupInput);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'schedule_conversation_followup',
                    'label' => "Scheduled proactive follow-up: {$savedFup['targetName']} (in {$savedFup['delayMinutes']}m)",
                    'detail' => $savedFup['instructions'],
                ];
                return json_encode(['ok' => true, 'followup' => $savedFup], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'list_conversation_followups') {
                $fups = ccrm_marveen_list_followups($pdo, $connector);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'list_conversation_followups',
                    'label' => 'Listed proactive follow-ups (' . count($fups) . ')',
                ];
                return json_encode(['followups' => $fups], JSON_UNESCAPED_UNICODE);
            }
            if ($fnName === 'cancel_conversation_followup') {
                $delFupId = (string)($fnArgs['id'] ?? '');
                $removedFup = ccrm_marveen_cancel_followup($pdo, $connectorId, $delFupId);
                $steps[] = [
                    'id' => uniqid('st_', false),
                    'kind' => 'schedule',
                    'tool' => 'cancel_conversation_followup',
                    'label' => "Cancelled proactive follow-up: {$delFupId}",
                ];
                return json_encode(['ok' => $removedFup, 'id' => $delFupId]);
            }
        }

        $toolText = '';
        $toolRes = $mcpCall('tools/call', [
            'name' => $fnName,
            'arguments' => (object)$fnArgs,
        ]);
        if (is_array($toolRes['result']['content'] ?? null)) {
            foreach ($toolRes['result']['content'] as $cItem) {
                if (isset($cItem['text'])) {
                    $toolText .= $cItem['text'] . "\n";
                }
            }
        } elseif (isset($toolRes['error']['message'])) {
            $toolText = 'Error: ' . $toolRes['error']['message'];
        } else {
            $toolText = json_encode($toolRes);
        }
        $steps[] = [
            'id' => uniqid('st_', false),
            'kind' => 'mcp',
            'tool' => $fnName,
            'label' => "MCP: {$fnName}",
        ];
        return $toolText;
    }
}

if (!function_exists('ccrm_marveen_run_gemini_mcp_agent')) {
    /**
     * Executes a fast, multi-turn Gemini + CCRM MCP autonomous tool-calling loop in PHP.
     * Supports reading/writing persistent `memory.md`, creating & delegating to subagents,
     * scheduling autonomous tasks, reading/replying to WhatsApp (WAAI) messages, and calling all CCRM MCP tools.
     */
    function ccrm_marveen_run_gemini_mcp_agent(
        string $apiKey,
        string $mcpUrl,
        string $mcpBearerKey,
        string $prompt,
        string $systemPrompt = '',
        string $preferredModel = '',
        ?PDO $pdo = null,
        ?array $connector = null,
        ?string $subagentId = null,
        int $depth = 0,
        string $apiEndpoint = ''
    ): array {
        $trimmedPreferred = preg_replace('#^models/#', '', trim($preferredModel));
        $candidateModels = array_values(array_unique(array_filter([
            ($trimmedPreferred !== '' && str_starts_with($trimmedPreferred, 'gemini-')) ? $trimmedPreferred : '',
            'gemini-2.5-flash',
            'gemini-3.5-flash-lite',
            'gemini-3.6-flash',
            'gemini-2.0-flash',
        ])));
        $modelIdx = 0;
        $model = $candidateModels[0] ?? 'gemini-2.5-flash';
        $connectorId = (string)($connector['id'] ?? 'default');
        $isSubagent = ($subagentId !== null && $subagentId !== '') || $depth > 0;

        $mcpCall = ccrm_marveen_mcp_rpc_caller($mcpUrl, $mcpBearerKey);
        $funcDecls = ccrm_marveen_collect_agent_tools($mcpCall, $isSubagent, true);

        $effectiveSystemPrompt = ($pdo !== null && $connector !== null)
            ? ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId)
            : $systemPrompt;

        $contents = [
            [
                'role' => 'user',
                'parts' => [['text' => $prompt]],
            ],
        ];

        $steps = [];
        $sentReplyTargets = [];
        $delegateRunner = static function (string $delTask, string $delSubId, int $nextDepth) use (
            $apiKey,
            $mcpUrl,
            $mcpBearerKey,
            $preferredModel,
            $pdo,
            $connector,
            $apiEndpoint
        ): array {
            return ccrm_marveen_run_gemini_mcp_agent(
                $apiKey,
                $mcpUrl,
                $mcpBearerKey,
                $delTask,
                '',
                $preferredModel,
                $pdo,
                $connector,
                $delSubId,
                $nextDepth,
                $apiEndpoint
            );
        };

        $maxTurns = $isSubagent ? 8 : 15;
        for ($turn = 0; $turn < $maxTurns; $turn++) {
            $payload = [
                'contents' => $contents,
            ];
            if ($effectiveSystemPrompt !== '') {
                $payload['systemInstruction'] = [
                    'parts' => [['text' => $effectiveSystemPrompt]],
                ];
            }
            if (!empty($funcDecls) && $turn < $maxTurns - 1) {
                $payload['tools'] = [
                    ['functionDeclarations' => $funcDecls],
                ];
            }

            $resp = null;
            $httpCode = 0;
            $numModels = count($candidateModels);
            for ($attempt = 0; $attempt < $numModels; $attempt++) {
                $tryIdx = ($modelIdx + $attempt) % $numModels;
                $model = $candidateModels[$tryIdx];
                $url = ccrm_marveen_build_api_url('gemini_api', $apiEndpoint, $model, $apiKey);
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 25,
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: application/json',
                        'x-goog-api-key: ' . $apiKey,
                    ],
                    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
                $rawResp = curl_exec($ch);
                $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                $resp = is_string($rawResp) ? json_decode($rawResp, true) : null;
                if (is_array($resp) && !empty($resp['candidates'][0]['content']['parts'])) {
                    $modelIdx = $tryIdx;
                    break;
                }
                if (in_array($httpCode, [0, 404, 429, 500, 502, 503, 504], true) && ($attempt + 1) < $numModels) {
                    continue;
                }
                break;
            }
            if (!is_array($resp) || empty($resp['candidates'][0]['content']['parts'])) {
                if ($httpCode === 200 && is_array($resp) && empty($resp['error']) && (!empty($resp['candidates']) || !empty($steps))) {
                    return [
                        'ok' => true,
                        'text' => '[IDLE]',
                        'mode' => 'gemini_mcp',
                        'model' => $model,
                        'steps' => $steps,
                    ];
                }
                $errMsg = (string)($resp['error']['message'] ?? ('Gemini API HTTP ' . $httpCode));
                return ['ok' => false, 'error' => $errMsg, 'steps' => $steps];
            }

            $parts = $resp['candidates'][0]['content']['parts'];
            foreach ($parts as &$pItem) {
                if (isset($pItem['functionCall']) && is_array($pItem['functionCall'])) {
                    $pItem['functionCall']['args'] = (object)(is_array($pItem['functionCall']['args'] ?? null) ? $pItem['functionCall']['args'] : []);
                }
            }
            unset($pItem);
            $contents[] = [
                'role' => 'model',
                'parts' => $parts,
            ];

            $funcCalls = [];
            $textParts = [];
            foreach ($parts as $part) {
                if (!empty($part['functionCall']['name'])) {
                    $funcCalls[] = $part['functionCall'];
                }
                if (isset($part['text']) && is_string($part['text']) && empty($part['thought'])) {
                    $textParts[] = $part['text'];
                }
            }

            if (empty($funcCalls)) {
                $finalText = trim(implode("\n", $textParts));
                return [
                    'ok' => true,
                    'text' => $finalText !== '' ? $finalText : '[IDLE]',
                    'mode' => 'gemini_mcp',
                    'model' => $model,
                    'steps' => $steps,
                ];
            }

            $responseParts = [];
            foreach ($funcCalls as $fc) {
                $fnName = (string)$fc['name'];
                $fnArgs = is_array($fc['args'] ?? null) ? $fc['args'] : (is_object($fc['args'] ?? null) ? (array)$fc['args'] : []);
                $toolText = ccrm_marveen_execute_agent_tool_call(
                    $fnName,
                    $fnArgs,
                    $mcpCall,
                    $pdo,
                    $connector,
                    $connectorId,
                    $subagentId,
                    $depth,
                    $systemPrompt,
                    $effectiveSystemPrompt,
                    $steps,
                    $sentReplyTargets,
                    $delegateRunner
                );
                $responseParts[] = [
                    'functionResponse' => [
                        'name' => $fnName,
                        'response' => [
                            'result' => mb_substr(trim($toolText), 0, 16000, 'UTF-8'),
                        ],
                    ],
                ];
            }

            $contents[] = [
                'role' => 'user',
                'parts' => $responseParts,
            ];
        }

        return ['ok' => false, 'error' => 'Agent exceeded maximum tool-calling turns.', 'steps' => $steps];
    }
}

if (!function_exists('ccrm_marveen_run_anthropic_mcp_agent')) {
    /**
     * Pure-PHP HTTPS multi-turn Anthropic Messages API + CCRM MCP agent loop.
     */
    function ccrm_marveen_run_anthropic_mcp_agent(
        string $apiKey,
        string $mcpUrl,
        string $mcpBearerKey,
        string $prompt,
        string $systemPrompt = '',
        string $preferredModel = '',
        ?PDO $pdo = null,
        ?array $connector = null,
        ?string $subagentId = null,
        int $depth = 0,
        string $apiEndpoint = ''
    ): array {
        $trimmedPreferred = trim($preferredModel);
        $candidateModels = $trimmedPreferred !== ''
            ? [$trimmedPreferred]
            : ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
        $modelIdx = 0;
        $model = $candidateModels[0];
        $connectorId = (string)($connector['id'] ?? 'default');
        $isSubagent = ($subagentId !== null && $subagentId !== '') || $depth > 0;

        $mcpCall = ccrm_marveen_mcp_rpc_caller($mcpUrl, $mcpBearerKey);
        $rawDecls = ccrm_marveen_collect_agent_tools($mcpCall, $isSubagent, false);
        $anthropicTools = [];
        foreach ($rawDecls as $d) {
            $anthropicTools[] = [
                'name' => $d['name'],
                'description' => $d['description'],
                'input_schema' => $d['parameters'] ?? ['type' => 'object', 'properties' => (object)[]],
            ];
        }

        $effectiveSystemPrompt = ($pdo !== null && $connector !== null)
            ? ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId)
            : $systemPrompt;

        $messages = [
            ['role' => 'user', 'content' => $prompt],
        ];

        $steps = [];
        $sentReplyTargets = [];
        $delegateRunner = static function (string $delTask, string $delSubId, int $nextDepth) use (
            $apiKey,
            $mcpUrl,
            $mcpBearerKey,
            $preferredModel,
            $pdo,
            $connector,
            $apiEndpoint
        ): array {
            return ccrm_marveen_run_anthropic_mcp_agent(
                $apiKey,
                $mcpUrl,
                $mcpBearerKey,
                $delTask,
                '',
                $preferredModel,
                $pdo,
                $connector,
                $delSubId,
                $nextDepth,
                $apiEndpoint
            );
        };

        $url = ccrm_marveen_build_api_url('claude_api', $apiEndpoint, $model, $apiKey);
        $maxTurns = $isSubagent ? 8 : 15;
        for ($turn = 0; $turn < $maxTurns; $turn++) {
            $resp = null;
            $httpCode = 0;
            $curlErr = '';
            $numModels = count($candidateModels);
            for ($attempt = 0; $attempt < $numModels; $attempt++) {
                $tryIdx = ($modelIdx + $attempt) % $numModels;
                $model = $candidateModels[$tryIdx];
                $payload = [
                    'model' => $model,
                    'max_tokens' => 4096,
                    'messages' => $messages,
                ];
                if ($effectiveSystemPrompt !== '') {
                    $payload['system'] = $effectiveSystemPrompt;
                }
                if (!empty($anthropicTools) && $turn < $maxTurns - 1) {
                    $payload['tools'] = $anthropicTools;
                }

                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 30,
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: application/json',
                        'x-api-key: ' . $apiKey,
                        'anthropic-version: 2023-06-01',
                    ],
                    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
                $rawResp = curl_exec($ch);
                $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $curlErr = curl_error($ch);
                curl_close($ch);

                $resp = is_string($rawResp) ? json_decode($rawResp, true) : null;
                if ($httpCode >= 200 && $httpCode < 300 && is_array($resp) && !empty($resp['content'])) {
                    $modelIdx = $tryIdx;
                    break;
                }
                if (in_array($httpCode, [0, 404, 429, 500, 502, 503, 504], true) && ($attempt + 1) < $numModels) {
                    continue;
                }
                break;
            }

            if ($httpCode < 200 || $httpCode >= 300 || !is_array($resp) || !isset($resp['content']) || !is_array($resp['content'])) {
                $errMsg = (string)($resp['error']['message'] ?? ($curlErr !== '' ? $curlErr : ('Anthropic API HTTP ' . $httpCode)));
                return ['ok' => false, 'error' => $errMsg, 'steps' => $steps];
            }

            $assistantBlocks = [];
            $toolUses = [];
            $textParts = [];
            foreach ($resp['content'] as $block) {
                if (!is_array($block)) {
                    continue;
                }
                if (($block['type'] ?? '') === 'tool_use') {
                    $block['input'] = (object)(is_array($block['input'] ?? null) ? $block['input'] : []);
                    $toolUses[] = $block;
                } elseif (($block['type'] ?? '') === 'text' && isset($block['text']) && is_string($block['text'])) {
                    $textParts[] = $block['text'];
                }
                $assistantBlocks[] = $block;
            }
            $messages[] = ['role' => 'assistant', 'content' => $assistantBlocks];

            if (empty($toolUses)) {
                $finalText = trim(implode("\n", $textParts));
                return [
                    'ok' => true,
                    'text' => $finalText !== '' ? $finalText : '[IDLE]',
                    'mode' => 'anthropic_mcp',
                    'model' => $model,
                    'steps' => $steps,
                ];
            }

            $toolResults = [];
            foreach ($toolUses as $tu) {
                $fnName = (string)($tu['name'] ?? '');
                $fnArgs = is_array($tu['input'] ?? null) ? $tu['input'] : (is_object($tu['input'] ?? null) ? (array)$tu['input'] : []);
                $toolText = ccrm_marveen_execute_agent_tool_call(
                    $fnName,
                    $fnArgs,
                    $mcpCall,
                    $pdo,
                    $connector,
                    $connectorId,
                    $subagentId,
                    $depth,
                    $systemPrompt,
                    $effectiveSystemPrompt,
                    $steps,
                    $sentReplyTargets,
                    $delegateRunner
                );
                $toolResults[] = [
                    'type' => 'tool_result',
                    'tool_use_id' => (string)($tu['id'] ?? ''),
                    'content' => mb_substr(trim($toolText), 0, 16000, 'UTF-8'),
                ];
            }
            $messages[] = ['role' => 'user', 'content' => $toolResults];
        }

        return ['ok' => false, 'error' => 'Agent exceeded maximum tool-calling turns.', 'steps' => $steps];
    }
}

if (!function_exists('ccrm_marveen_run_openai_mcp_agent')) {
    /**
     * Pure-PHP HTTPS multi-turn OpenAI Chat Completions + CCRM MCP agent loop.
     */
    function ccrm_marveen_run_openai_mcp_agent(
        string $apiKey,
        string $mcpUrl,
        string $mcpBearerKey,
        string $prompt,
        string $systemPrompt = '',
        string $preferredModel = '',
        ?PDO $pdo = null,
        ?array $connector = null,
        ?string $subagentId = null,
        int $depth = 0,
        string $apiEndpoint = ''
    ): array {
        $trimmedPreferred = trim($preferredModel);
        $model = $trimmedPreferred !== '' ? $trimmedPreferred : 'gpt-4o';
        $connectorId = (string)($connector['id'] ?? 'default');
        $isSubagent = ($subagentId !== null && $subagentId !== '') || $depth > 0;

        $mcpCall = ccrm_marveen_mcp_rpc_caller($mcpUrl, $mcpBearerKey);
        $rawDecls = ccrm_marveen_collect_agent_tools($mcpCall, $isSubagent, false);
        $openaiTools = [];
        foreach ($rawDecls as $d) {
            $openaiTools[] = [
                'type' => 'function',
                'function' => [
                    'name' => $d['name'],
                    'description' => $d['description'],
                    'parameters' => $d['parameters'] ?? ['type' => 'object', 'properties' => (object)[]],
                ],
            ];
        }

        $effectiveSystemPrompt = ($pdo !== null && $connector !== null)
            ? ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId)
            : $systemPrompt;

        $messages = [];
        if ($effectiveSystemPrompt !== '') {
            $messages[] = ['role' => 'system', 'content' => $effectiveSystemPrompt];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $steps = [];
        $sentReplyTargets = [];
        $delegateRunner = static function (string $delTask, string $delSubId, int $nextDepth) use (
            $apiKey,
            $mcpUrl,
            $mcpBearerKey,
            $preferredModel,
            $pdo,
            $connector,
            $apiEndpoint
        ): array {
            return ccrm_marveen_run_openai_mcp_agent(
                $apiKey,
                $mcpUrl,
                $mcpBearerKey,
                $delTask,
                '',
                $preferredModel,
                $pdo,
                $connector,
                $delSubId,
                $nextDepth,
                $apiEndpoint
            );
        };

        $url = ccrm_marveen_build_api_url('openai_api', $apiEndpoint, $model, $apiKey);
        $maxTurns = $isSubagent ? 8 : 15;
        for ($turn = 0; $turn < $maxTurns; $turn++) {
            if ($effectiveSystemPrompt !== '' && isset($messages[0]['role']) && $messages[0]['role'] === 'system') {
                $messages[0]['content'] = $effectiveSystemPrompt;
            }
            $payload = [
                'model' => $model,
                'messages' => $messages,
            ];
            if (!empty($openaiTools) && $turn < $maxTurns - 1) {
                $payload['tools'] = $openaiTools;
            }

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'Authorization: Bearer ' . $apiKey,
                ],
                CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            $rawResp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            $resp = is_string($rawResp) ? json_decode($rawResp, true) : null;
            if ($httpCode < 200 || $httpCode >= 300 || !is_array($resp) || empty($resp['choices'][0]['message'])) {
                $errMsg = (string)($resp['error']['message'] ?? ($curlErr !== '' ? $curlErr : ('OpenAI API HTTP ' . $httpCode)));
                return ['ok' => false, 'error' => $errMsg, 'steps' => $steps];
            }

            $msg = $resp['choices'][0]['message'];
            $toolCalls = is_array($msg['tool_calls'] ?? null) ? $msg['tool_calls'] : [];
            $assistantMsg = [
                'role' => 'assistant',
                'content' => isset($msg['content']) && is_string($msg['content']) ? $msg['content'] : '',
            ];
            if (!empty($toolCalls)) {
                $assistantMsg['tool_calls'] = $toolCalls;
            }
            $messages[] = $assistantMsg;

            if (empty($toolCalls)) {
                $finalText = trim((string)($msg['content'] ?? ''));
                return [
                    'ok' => true,
                    'text' => $finalText !== '' ? $finalText : '[IDLE]',
                    'mode' => 'openai_mcp',
                    'model' => $model,
                    'steps' => $steps,
                ];
            }

            foreach ($toolCalls as $tc) {
                $fnName = (string)($tc['function']['name'] ?? '');
                $rawArgs = (string)($tc['function']['arguments'] ?? '{}');
                $decodedArgs = json_decode($rawArgs, true);
                $fnArgs = is_array($decodedArgs) ? $decodedArgs : [];
                $toolText = ccrm_marveen_execute_agent_tool_call(
                    $fnName,
                    $fnArgs,
                    $mcpCall,
                    $pdo,
                    $connector,
                    $connectorId,
                    $subagentId,
                    $depth,
                    $systemPrompt,
                    $effectiveSystemPrompt,
                    $steps,
                    $sentReplyTargets,
                    $delegateRunner
                );
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => (string)($tc['id'] ?? ''),
                    'content' => mb_substr(trim($toolText), 0, 16000, 'UTF-8'),
                ];
            }
        }

        return ['ok' => false, 'error' => 'Agent exceeded maximum tool-calling turns.', 'steps' => $steps];
    }
}

if (!function_exists('ccrm_marveen_run_agent')) {
    function ccrm_marveen_run_agent(
        PDO $pdo,
        array $connector,
        string $userId,
        string $prompt,
        string $systemPrompt = '',
        ?string $subagentId = null
    ): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $provider = strtolower(trim((string)($settings['connectorType'] ?? 'claude')));
        $isApiKeyMode = ccrm_marveen_is_api_key_connector_type($provider);
        $token = trim((string)($settings['subscriptionToken'] ?? ''));
        $apiKey = ccrm_marveen_resolve_provider_api_key($pdo, $connectorId, $provider, $settings);
        $agentEndpoint = trim((string)($settings['agentEndpoint'] ?? ''));
        $model = trim((string)($settings['agentModel'] ?? ''));

        $mcpKey = ccrm_marveen_ensure_user_mcp_key($pdo, $userId);
        $mcpUrl = ccrm_marveen_internal_mcp_url();
        $ctx = ccrm_marveen_ensure_worker_dir($connectorId, $provider, $token !== '' ? $token : $apiKey, $mcpUrl, $mcpKey);

        // Tier 2: Remote Marveen Bridge (only for subscription connectors; API-key connectors use agentEndpoint as custom API base URL)
        if (!$isApiKeyMode) {
            $remoteUrl = $agentEndpoint ?: trim((string)(getenv('MARVEEN_URL') ?: ''));
            if ($remoteUrl !== '') {
                return ccrm_marveen_bridge_post($remoteUrl, '/run', [
                    'connectorId' => $connectorId,
                    'provider' => $provider,
                    'subscriptionToken' => $token,
                    'mcpUrl' => $mcpUrl,
                    'mcpBearerKey' => $mcpKey,
                    'userId' => $userId,
                    'prompt' => $prompt,
                    'systemPrompt' => ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId),
                    'model' => $model,
                ]);
            }
        }

        // Pure-PHP HTTPS Gemini API + CCRM MCP loop (`gemini_api` or `antigravity` with OAuth/AIza key)
        if ($provider === 'gemini_api' || ($provider === 'antigravity' && $token !== '')) {
            $geminiKey = ($provider === 'gemini_api')
                ? ($apiKey !== '' ? $apiKey : null)
                : ccrm_marveen_resolve_gemini_api_key($connectorId, $token);
            if ($provider === 'gemini_api' && ($geminiKey === null || $geminiKey === '')) {
                return [
                    'ok' => false,
                    'error' => 'No Gemini API key configured for this connector. Add your Google AI Studio key in Connector Settings or System Settings -> AI.',
                    'connectorId' => $connectorId,
                    'provider' => $provider,
                    'steps' => [],
                ];
            }
            if ($geminiKey !== null && $geminiKey !== '') {
                $geminiRes = ccrm_marveen_run_gemini_mcp_agent(
                    $geminiKey,
                    $mcpUrl,
                    $mcpKey,
                    $prompt,
                    $systemPrompt,
                    $model,
                    $pdo,
                    $connector,
                    $subagentId,
                    0,
                    $isApiKeyMode ? $agentEndpoint : ''
                );
                return array_merge($geminiRes, [
                    'connectorId' => $connectorId,
                    'provider' => $provider,
                ]);
            }
        }

        // Pure-PHP HTTPS Anthropic Messages API + CCRM MCP loop (`claude_api` or `claude` with sk-ant-api* key)
        if ($provider === 'claude_api' || ($provider === 'claude' && $apiKey !== '' && str_starts_with($apiKey, 'sk-ant-api'))) {
            if ($apiKey === '') {
                return [
                    'ok' => false,
                    'error' => 'No Anthropic API key configured for this connector. Add your Anthropic key in Connector Settings or System Settings -> AI.',
                    'connectorId' => $connectorId,
                    'provider' => $provider,
                    'steps' => [],
                ];
            }
            $anthropicRes = ccrm_marveen_run_anthropic_mcp_agent(
                $apiKey,
                $mcpUrl,
                $mcpKey,
                $prompt,
                $systemPrompt,
                $model,
                $pdo,
                $connector,
                $subagentId,
                0,
                $isApiKeyMode ? $agentEndpoint : ''
            );
            return array_merge($anthropicRes, [
                'connectorId' => $connectorId,
                'provider' => $provider,
            ]);
        }

        // Pure-PHP HTTPS OpenAI Chat Completions API + CCRM MCP loop (`openai_api` or `chatgpt` with standard sk-* API key when CLI is unavailable)
        $looksLikeOpenAiApiKey = $apiKey !== '' && str_starts_with($apiKey, 'sk-') && !str_contains($apiKey, ' ') && substr_count($apiKey, '.') !== 2;
        if ($provider === 'openai_api' || ($provider === 'chatgpt' && $looksLikeOpenAiApiKey && !ccrm_marveen_can_proc_open())) {
            if ($apiKey === '') {
                return [
                    'ok' => false,
                    'error' => 'No OpenAI API key configured for this connector. Add your OpenAI key in Connector Settings or System Settings -> AI.',
                    'connectorId' => $connectorId,
                    'provider' => $provider,
                    'steps' => [],
                ];
            }
            $openaiRes = ccrm_marveen_run_openai_mcp_agent(
                $apiKey,
                $mcpUrl,
                $mcpKey,
                $prompt,
                $systemPrompt,
                $model,
                $pdo,
                $connector,
                $subagentId,
                0,
                $isApiKeyMode ? $agentEndpoint : ''
            );
            return array_merge($openaiRes, [
                'connectorId' => $connectorId,
                'provider' => $provider,
            ]);
        }

        // Tier 1: Local Embedded CLI Runner with isolated .mcp.json and memory.md (mirrored to CLAUDE.md / GEMINI.md / AGENTS.md)
        $spec = ccrm_marveen_cli_package_for($provider);
        $bin = $spec ? ccrm_marveen_find_bin($spec['bin']) : null;

        $builtSystem = ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId);
        $fullPrompt = $builtSystem . "\n\n## User Instruction\n" . $prompt;

        if ($bin !== null && ccrm_marveen_can_proc_open() && $token !== '') {
            $resolvedGeminiKey = ($provider === 'antigravity')
                ? (ccrm_marveen_resolve_gemini_api_key($connectorId, $token) ?? (!str_starts_with($token, 'gemini-oauth:') ? $token : ''))
                : '';
            if ($provider === 'antigravity') {
                $cmd = [$bin, '-p', $fullPrompt, '--yolo'];
                if ($model !== '') {
                    $cmd[] = '-m';
                    $cmd[] = $model;
                }
            } elseif ($provider === 'chatgpt') {
                $cmd = [$bin, 'exec', $fullPrompt];
                if ($model !== '') {
                    $cmd[] = '-m';
                    $cmd[] = $model;
                }
            } else {
                $cmd = [$bin, '-p', $fullPrompt, '--mcp-config', $ctx['mcpPath'], '--dangerously-skip-permissions'];
                if ($model !== '') {
                    $cmd[] = '--model';
                    $cmd[] = $model;
                }
            }
            $env = [
                'PATH' => dirname($bin) . ':/usr/local/bin:/usr/bin:/bin',
                'HOME' => $ctx['workerHome'],
                'CLAUDE_CONFIG_DIR' => $ctx['configDir'],
                'CLAUDE_CODE_OAUTH_TOKEN' => $token,
                'OPENAI_API_KEY' => $token,
                'GEMINI_CLI_TRUST_WORKSPACE' => 'true',
                'DISABLE_AUTOUPDATER' => '1',
            ];
            if ($resolvedGeminiKey !== '') {
                $env['GEMINI_API_KEY'] = $resolvedGeminiKey;
            }
            $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
            $proc = @proc_open($cmd, $descriptors, $pipes, $ctx['workerHome'], $env);
            if (is_resource($proc)) {
                fclose($pipes[0]);
                $stdout = (string)stream_get_contents($pipes[1]);
                $stderr = (string)stream_get_contents($pipes[2]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                $exit = proc_close($proc);
                // Sync back any changes the CLI agent made to memory.md / CLAUDE.md / AGENTS.md
                if (is_file($ctx['workerHome'] . '/memory.md')) {
                    $diskMem = (string)@file_get_contents($ctx['workerHome'] . '/memory.md');
                    if (trim($diskMem) !== '') {
                        ccrm_marveen_save_memory($pdo, $connectorId, $diskMem, $subagentId);
                    }
                }
                if ($exit === 0 && trim($stdout) !== '') {
                    return [
                        'ok' => true,
                        'text' => trim($stdout),
                        'mode' => 'local_cli',
                        'connectorId' => $connectorId,
                        'provider' => $provider,
                        'steps' => [],
                    ];
                }
                return [
                    'ok' => false,
                    'error' => 'Agent CLI exited with ' . $exit . ': ' . trim($stderr ?: $stdout),
                    'steps' => [],
                ];
            }
        }

        return [
            'ok' => true,
            'text' => sprintf(
                "[%s Subscription Agent connected via CCRM MCP as user %s] Ready. (MCP config provisioned at %s)",
                strtoupper($provider),
                $userId,
                basename($ctx['mcpPath'])
            ),
            'mode' => 'mcp_provisioned',
            'connectorId' => $connectorId,
            'provider' => $provider,
            'steps' => [],
        ];
    }
}
