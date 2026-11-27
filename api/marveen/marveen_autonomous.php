<?php
/**
 * Autonomous ticks, connector picking and the bridge.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

if (!function_exists('ccrm_marveen_run_autonomous_ticks')) {
    /**
     * Checks active AI connectors for due autonomous tasks (or runs a specific task when $forceTaskId is set),
     * executes them with full CCRM MCP + subagent + memory.md access, and appends the result to chat history.
     */
    function ccrm_marveen_run_autonomous_ticks(PDO $pdo, ?string $onlyConnectorId = null, ?string $forceTaskId = null): array {
        require_once dirname(__DIR__) . '/auth.php';
        $sql = "SELECT * FROM `company_mailboxes` WHERE `is_active` = 1";
        $params = [];
        if ($onlyConnectorId !== null && $onlyConnectorId !== '') {
            $sql .= " AND `id` = ?";
            $params[] = $onlyConnectorId;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $secretKeys = function_exists('ccrm_email_secret_keys')
            ? ccrm_email_secret_keys()
            : ['imapPassword', 'smtpPassword', 'subscriptionToken', 'apiKey', 'graphClientSecret'];
        $executed = [];
        $now = time();

        foreach ($rows as $row) {
            $cid = (string)$row['id'];
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw) ? ccrm_decrypt_config_secrets($raw, $secretKeys) : [];
            $cType = (string)($settings['connectorType'] ?? '');
            if (!ccrm_marveen_is_agent_connector_type($cType)) {
                continue;
            }
            $row['settings'] = $settings;

            // Acquire non-blocking per-connector lock so overlapping cron ticks never collide
            $dir = ccrm_marveen_connector_dir($cid);
            $lockFp = @fopen($dir . '/.cron.lock', 'c');
            if ($lockFp && !@flock($lockFp, LOCK_EX | LOCK_NB)) {
                @fclose($lockFp);
                continue;
            }

            try {
                $userIds = is_array($settings['userIds'] ?? null) ? array_values(array_filter(array_map('strval', $settings['userIds']))) : [];
                $runAsUser = $userIds[0] ?? (string)($row['owner_user_id'] ?? '');
                if ($runAsUser === '') {
                    $uStmt = $pdo->query("SELECT `id` FROM `users` ORDER BY `role` = 'admin' DESC, `id` ASC LIMIT 1");
                    $runAsUser = (string)($uStmt ? $uStmt->fetchColumn() : '');
                }
                if ($runAsUser === '') {
                    continue;
                }

                // A) Execute due scheduled tasks in tasks.json
                $tasks = ccrm_marveen_list_tasks($pdo, $row);
                foreach ($tasks as $task) {
                    $tid = (string)($task['id'] ?? '');
                    if ($forceTaskId !== null && $forceTaskId !== '') {
                        if ($tid !== $forceTaskId) {
                            continue;
                        }
                    } else {
                        if (empty($task['enabled'])) {
                            continue;
                        }
                        $intervalSec = max(60, ((int)($task['intervalMinutes'] ?? 60)) * 60);
                        $lastRunTs = !empty($task['lastRunAt']) ? strtotime((string)$task['lastRunAt']) : 0;
                        if ($lastRunTs > 0 && ($now - $lastRunTs) < $intervalSec) {
                            continue;
                        }
                    }

                    $subId = !empty($task['subagentId']) ? (string)$task['subagentId'] : null;
                    $res = ccrm_marveen_run_agent(
                        $pdo,
                        $row,
                        $runAsUser,
                        "[Autonomous Cron Task: " . ($task['title'] ?? $tid) . "]\n" . (string)($task['prompt'] ?? ''),
                        '',
                        $subId
                    );

                    $task['lastRunAt'] = gmdate('c');
                    $task['lastStatus'] = !empty($res['ok']) ? 'ok' : ('error: ' . ($res['error'] ?? 'failed'));
                    ccrm_marveen_save_task($pdo, $cid, $task);

                    $botMsg = [
                        'id' => 'auto-' . uniqid('', false),
                        'role' => 'assistant',
                        'autonomous' => true,
                        'taskTitle' => (string)($task['title'] ?? $tid),
                        'subagentId' => $subId,
                        'text' => !empty($res['ok'])
                            ? (string)($res['text'] ?? 'Autonomous task completed.')
                            : ('⚠️ Autonomous task error: ' . (string)($res['error'] ?? 'failed')),
                        'steps' => $res['steps'] ?? [],
                        'timestamp' => date('H:i'),
                        'createdAt' => gmdate('c'),
                    ];
                    ccrm_marveen_append_chat_message($cid, $botMsg, $subId);
                    $executed[] = [
                        'connectorId' => $cid,
                        'taskId' => $tid,
                        'ok' => !empty($res['ok']),
                        'message' => $botMsg,
                    ];
                }

                // B) Execute Connector-Level Autonomous Cron Loop (`autonomous.json`)
                $autoCfg = ccrm_marveen_get_autonomous_config($pdo, $row);
                $shouldRunAuto = false;
                $isManualTrigger = ($forceTaskId === '__autonomous__');
                if ($isManualTrigger) {
                    $shouldRunAuto = true;
                } elseif ($forceTaskId === null || $forceTaskId === '') {
                    if (!empty($autoCfg['enabled'])) {
                        $autoIntervalSec = max(60, ((int)($autoCfg['intervalMinutes'] ?? 15)) * 60);
                        $lastAutoTs = !empty($autoCfg['lastRunAt']) ? strtotime((string)$autoCfg['lastRunAt']) : 0;
                        if ($lastAutoTs === 0 || ($now - $lastAutoTs) >= $autoIntervalSec) {
                            $shouldRunAuto = true;
                        }
                    }
                }

                if ($shouldRunAuto) {
                    $autoPrompt = "[Autonomous Server Cron Tick]\n"
                        . (string)($autoCfg['instructions'] ?? "Review your memory.md, artifacts, and CCRM state via MCP. Execute any pending autonomous goals, follow-ups, or subagent delegations recorded in memory.md. Update memory.md with your progress. If no autonomous actions are needed right now, reply with [IDLE].");

                    $res = ccrm_marveen_run_agent($pdo, $row, $runAsUser, $autoPrompt, '', null);
                    $replyText = trim((string)($res['text'] ?? ''));
                    $steps = is_array($res['steps'] ?? null) ? $res['steps'] : [];
                    $isIdle = !empty($res['ok']) && (stripos($replyText, '[IDLE]') !== false || stripos($replyText, 'HEARTBEAT_OK') !== false) && empty($steps);

                    $autoCfg['lastRunAt'] = gmdate('c');
                    $autoCfg['cronCount'] = ((int)($autoCfg['cronCount'] ?? 0)) + 1;
                    $autoCfg['lastStatus'] = !empty($res['ok'])
                        ? ($isIdle ? 'idle' : 'ok')
                        : ('error: ' . ($res['error'] ?? 'failed'));
                    ccrm_marveen_save_autonomous_config($pdo, $cid, $autoCfg);

                    // Append to chat history whenever the agent performed work, reported findings, or was manually triggered
                    if (!$isIdle || $isManualTrigger) {
                        $botMsg = [
                            'id' => 'cron-' . uniqid('', false),
                            'role' => 'assistant',
                            'autonomous' => true,
                            'taskTitle' => 'Autonomous Cron',
                            'subagentId' => null,
                            'text' => !empty($res['ok'])
                                ? ($isIdle ? '✓ Autonomous cron tick completed (no pending actions in memory.md).' : ($replyText ?: 'Autonomous cron tick completed.'))
                                : ('⚠️ Autonomous cron error: ' . (string)($res['error'] ?? 'failed')),
                            'steps' => $steps,
                            'timestamp' => date('H:i'),
                            'createdAt' => gmdate('c'),
                        ];
                        ccrm_marveen_append_chat_message($cid, $botMsg, null);
                    }

                    $executed[] = [
                        'connectorId' => $cid,
                        'taskId' => '__autonomous__',
                        'ok' => !empty($res['ok']),
                        'status' => $autoCfg['lastStatus'],
                    ];
                }

                // C) Execute Per-Agent Heartbeat Loops (`subagents.json` -> `heartbeatEnabled`)
                $subs = ccrm_marveen_list_subagents($pdo, $row);
                foreach ($subs as $sub) {
                    $subId = (string)($sub['id'] ?? '');
                    if ($subId === '') {
                        continue;
                    }
                    $isManualSubHb = ($forceTaskId === 'subagent:' . $subId);
                    $shouldRunSubHb = false;
                    if ($isManualSubHb) {
                        $shouldRunSubHb = true;
                    } elseif ($forceTaskId === null || $forceTaskId === '') {
                        if (!empty($sub['heartbeatEnabled'])) {
                            $subIntervalSec = max(60, ((int)($sub['heartbeatIntervalMinutes'] ?? 15)) * 60);
                            $lastSubTs = !empty($sub['lastHeartbeatAt']) ? strtotime((string)$sub['lastHeartbeatAt']) : 0;
                            if ($lastSubTs === 0 || ($now - $lastSubTs) >= $subIntervalSec) {
                                $shouldRunSubHb = true;
                            }
                        }
                    }
                    if (!$shouldRunSubHb) {
                        continue;
                    }
                    $subHbPrompt = "[Agent Heartbeat Tick — {$sub['name']}]\n"
                        . (string)($sub['heartbeatInstructions'] ?: "Review your memory.md and CCRM state via MCP. Execute any pending goals recorded in your memory.md. If no actions are needed right now, reply with [IDLE].");
                    $res = ccrm_marveen_run_agent($pdo, $row, $runAsUser, $subHbPrompt, '', $subId);
                    $replyText = trim((string)($res['text'] ?? ''));
                    $steps = is_array($res['steps'] ?? null) ? $res['steps'] : [];
                    $isIdle = !empty($res['ok']) && (stripos($replyText, '[IDLE]') !== false || stripos($replyText, 'HEARTBEAT_OK') !== false) && empty($steps);

                    $sub['lastHeartbeatAt'] = gmdate('c');
                    $sub['lastHeartbeatStatus'] = !empty($res['ok'])
                        ? ($isIdle ? 'idle' : 'ok')
                        : ('error: ' . ($res['error'] ?? 'failed'));
                    ccrm_marveen_save_subagent($pdo, $cid, $sub);

                    if (!$isIdle || $isManualSubHb) {
                        $botMsg = [
                            'id' => 'hb-' . uniqid('', false),
                            'role' => 'assistant',
                            'autonomous' => true,
                            'taskTitle' => '💓 Heartbeat (' . ($sub['name'] ?? $subId) . ')',
                            'subagentId' => $subId,
                            'text' => !empty($res['ok'])
                                ? ($isIdle ? '✓ Agent heartbeat completed (idle).' : ($replyText ?: 'Agent heartbeat completed.'))
                                : ('⚠️ Agent heartbeat error: ' . (string)($res['error'] ?? 'failed')),
                            'steps' => $steps,
                            'timestamp' => date('H:i'),
                            'createdAt' => gmdate('c'),
                        ];
                        ccrm_marveen_append_chat_message($cid, $botMsg, $subId);
                        ccrm_marveen_append_chat_message($cid, $botMsg, null);
                    }

                    $executed[] = [
                        'connectorId' => $cid,
                        'taskId' => 'subagent:' . $subId,
                        'ok' => !empty($res['ok']),
                        'status' => $sub['lastHeartbeatStatus'],
                    ];
                }
            } finally {
                if ($lockFp) {
                    @flock($lockFp, LOCK_UN);
                    @fclose($lockFp);
                }
            }
        }

        // D) Evaluate Reactive Event Triggers (Zero-cost idle check; only calls LLM if new messages/emails arrived)
        if ($forceTaskId === null || $forceTaskId === '') {
            $trigRes = ccrm_marveen_process_event_triggers($pdo);
            if (!empty($trigRes['executed'])) {
                foreach ($trigRes['executed'] as $ex) {
                    $executed[] = $ex;
                }
            }
        }

        return ['ok' => true, 'executed' => $executed];
    }
}

if (!function_exists('ccrm_marveen_pick_connector_for_user')) {
    /**
     * Selects the best active AI subscription connector assigned to $userId
     * (following Szotasz/marveen claude-plan-rotation.ts headroom / error ranking).
     */
    function ccrm_marveen_pick_connector_for_user(PDO $pdo, string $userId, ?string $preferredProvider = null): ?array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM company_mailboxes WHERE is_active = 1 ORDER BY last_error IS NOT NULL ASC, id ASC");
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $candidates = [];
        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw)
                ? ccrm_decrypt_config_secrets($raw, ['imapPassword', 'smtpPassword', 'subscriptionToken', 'apiKey', 'graphClientSecret'])
                : [];
            $type = (string)($settings['connectorType'] ?? '');
            if (!ccrm_marveen_is_agent_connector_type($type)) {
                continue;
            }
            $userIds = is_array($settings['userIds'] ?? null) ? array_map('strval', $settings['userIds']) : [];
            if ($row['owner_user_id'] && !in_array((string)$row['owner_user_id'], $userIds, true)) {
                $userIds[] = (string)$row['owner_user_id'];
            }
            // Empty userIds means all users or admin-assigned; non-empty restricts to listed users
            if (!empty($userIds) && !in_array($userId, $userIds, true)) {
                continue;
            }
            $row['settings'] = $settings;
            if ($preferredProvider !== null && $type === $preferredProvider) {
                array_unshift($candidates, $row);
            } else {
                $candidates[] = $row;
            }
        }
        return $candidates[0] ?? null;
    }
}

if (!function_exists('ccrm_marveen_bridge_post')) {
    function ccrm_marveen_bridge_post(string $baseUrl, string $path, array $payload): array {
        $url = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');
        $ch = curl_init($url);
        $secret = (string)(getenv('MARVEEN_SHARED_SECRET') ?: '');
        $headers = ['Content-Type: application/json'];
        if ($secret !== '') {
            $headers[] = 'Authorization: Bearer ' . $secret;
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($res === false) {
            return ['ok' => false, 'error' => 'Remote Marveen bridge unreachable: ' . $err];
        }
        $decoded = json_decode((string)$res, true);
        if (!is_array($decoded)) {
            return ['ok' => false, 'error' => 'Remote Marveen bridge HTTP ' . $code];
        }
        return $decoded;
    }
}
