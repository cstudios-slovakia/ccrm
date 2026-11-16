<?php
/**
 * Visual event triggers: records, CRUD and event processing.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

// -----------------------------------------------------------------------------
// Visual Event Triggers ($0 Idle Cost Event-Driven Agent Execution)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_normalize_trigger_record')) {
    function ccrm_marveen_normalize_trigger_record(array $t): array {
        $f = is_array($t['filter'] ?? null) ? $t['filter'] : [];
        $chatMatch = trim((string)($f['chatMatch'] ?? (($t['whatsappChatJid'] ?? '*') !== '*' ? ($t['whatsappChatJid'] ?? '') : '')));
        $subjectContains = trim((string)($f['subjectContains'] ?? ($t['emailSubjectFilter'] ?? '')));
        $fromContains = trim((string)($f['fromContains'] ?? ($t['emailSenderFilter'] ?? '')));
        $keywordContains = trim((string)($f['keywordContains'] ?? ($t['keywordFilter'] ?? '')));
        $eventType = trim((string)($f['eventType'] ?? ($t['crmEventName'] ?? 'lead_created')));
        $onlyGroup = !empty($f['onlyGroup']);
        $onlyDirect = !empty($f['onlyDirect']);

        $t['filter'] = [
            'chatMatch' => $chatMatch,
            'onlyGroup' => $onlyGroup,
            'onlyDirect' => $onlyDirect,
            'subjectContains' => $subjectContains,
            'fromContains' => $fromContains,
            'keywordContains' => $keywordContains,
            'eventType' => $eventType !== '' ? $eventType : 'lead_created',
        ];
        if (!array_key_exists('targetSubagentId', $t)) {
            $agentId = trim((string)($t['targetAgentId'] ?? 'main'));
            $t['targetSubagentId'] = ($agentId !== '' && $agentId !== 'main') ? $agentId : null;
        }
        $t['proactiveEnabled'] = !empty($t['proactiveEnabled']);
        $t['proactiveAfterMinutes'] = max(1, (int)($t['proactiveAfterMinutes'] ?? 120));
        $t['proactiveMaxAttempts'] = max(1, min(5, (int)($t['proactiveMaxAttempts'] ?? 1)));
        $t['proactiveInstructions'] = trim((string)($t['proactiveInstructions'] ?? 'Follow up politely on our last message if the conversation is still open. If the conversation ended naturally (e.g. thanks/goodbye/resolved), reply with [SKIP_FOLLOWUP] and do not send a message.'));
        return $t;
    }
}

if (!function_exists('ccrm_marveen_list_triggers')) {
    function ccrm_marveen_list_triggers(PDO $pdo, array $connector): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $dir = ccrm_marveen_connector_dir($connectorId);
        $trigFile = $dir . '/triggers.json';
        if (is_file($trigFile)) {
            $decoded = json_decode((string)@file_get_contents($trigFile), true);
            if (is_array($decoded)) {
                return array_values(array_map('ccrm_marveen_normalize_trigger_record', $decoded));
            }
        }
        if (!empty($settings['triggers']) && is_array($settings['triggers'])) {
            $norm = array_values(array_map('ccrm_marveen_normalize_trigger_record', $settings['triggers']));
            @file_put_contents($trigFile, json_encode($norm, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
            return $norm;
        }
        return [];
    }
}

if (!function_exists('ccrm_marveen_list_all_triggers')) {
    function ccrm_marveen_list_all_triggers(PDO $pdo): array {
        $all = [];
        try {
            $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
            $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
            foreach ($rows as $r) {
                $raw = json_decode((string)($r['settings_json'] ?? '{}'), true);
                $cType = strtolower((string)($raw['connectorType'] ?? ''));
                if (!ccrm_marveen_is_agent_connector_type($cType)) {
                    continue;
                }
                $r['settings'] = is_array($raw) ? $raw : [];
                foreach (ccrm_marveen_list_triggers($pdo, $r) as $t) {
                    $t['targetConnectorId'] = (string)$r['id'];
                    $t['targetConnectorName'] = (string)$r['name'];
                    $all[] = $t;
                }
            }
        } catch (\Throwable $e) {}
        return $all;
    }
}

if (!function_exists('ccrm_marveen_save_trigger')) {
    function ccrm_marveen_save_trigger(PDO $pdo, string $targetConnectorId, array $input): array {
        $dir = ccrm_marveen_connector_dir($targetConnectorId);
        $trigFile = $dir . '/triggers.json';
        $triggers = is_file($trigFile) ? (json_decode((string)@file_get_contents($trigFile), true) ?: []) : [];

        $sourceType = strtolower(trim((string)($input['sourceType'] ?? ($input['source_type'] ?? 'whatsapp'))));
        if (!in_array($sourceType, ['whatsapp', 'email', 'crm_event'], true)) {
            $sourceType = 'whatsapp';
        }

        $sourceConnectorId = trim((string)($input['sourceConnectorId'] ?? ($input['source_connector_id'] ?? '')));
        if ($sourceConnectorId === '' && $sourceType !== 'crm_event') {
            if ($sourceType === 'whatsapp') {
                $waList = ccrm_marveen_list_sibling_whatsapp_connectors($pdo);
                $sourceConnectorId = (string)($waList[0]['id'] ?? '');
            } elseif ($sourceType === 'email') {
                $emList = ccrm_marveen_list_sibling_email_connectors($pdo);
                $sourceConnectorId = (string)($emList[0]['id'] ?? '');
            }
        }

        $name = trim((string)($input['name'] ?? 'Event Trigger'));
        $rawTrigId = trim((string)($input['triggerId'] ?? ($input['trigger_id'] ?? '')));
        if ($rawTrigId === '' && !empty($input['id']) && (string)$input['id'] !== $targetConnectorId) {
            $rawTrigId = trim((string)$input['id']);
        }
        $id = $rawTrigId !== ''
            ? (preg_replace('/[^a-zA-Z0-9_-]/', '-', $rawTrigId) ?: ('trig-' . substr(bin2hex(random_bytes(4)), 0, 8)))
            : ('trig-' . substr(bin2hex(random_bytes(4)), 0, 8));

        $existingIdx = null;
        foreach ($triggers as $idx => $t) {
            if (($t['id'] ?? '') === $id) {
                $existingIdx = $idx;
                break;
            }
        }
        $prev = $existingIdx !== null ? $triggers[$existingIdx] : [];
        $nowIso = gmdate('c');
        $nowMs = (int)round(microtime(true) * 1000);

        $inFilter = is_array($input['filter'] ?? null) ? $input['filter'] : [];
        $chatMatchIn = trim((string)($inFilter['chatMatch'] ?? ($input['whatsappChatJid'] ?? ($input['whatsapp_chat'] ?? ''))));
        $whatsappChat = $chatMatchIn !== ''
            ? $chatMatchIn
            : (isset($inFilter['chatMatch']) ? '*' : trim((string)($prev['whatsappChatJid'] ?? '*')));
        $whatsappChatName = trim((string)($input['whatsappChatName'] ?? ($whatsappChat === '*' ? 'All Chats' : $whatsappChat)));

        $rawSubId = array_key_exists('targetSubagentId', $input)
            ? trim((string)($input['targetSubagentId'] ?? ''))
            : trim((string)($input['targetAgentId'] ?? ($input['target_agent_id'] ?? ($prev['targetSubagentId'] ?? ($prev['targetAgentId'] ?? '')))));
        $targetAgentId = ($rawSubId !== '' && $rawSubId !== 'main') ? $rawSubId : 'main';
        $targetSubagentId = $targetAgentId === 'main' ? null : $targetAgentId;

        $emailSenderFilter = trim((string)($inFilter['fromContains'] ?? ($input['emailSenderFilter'] ?? ($input['email_sender_filter'] ?? ($prev['emailSenderFilter'] ?? '')))));
        $emailSubjectFilter = trim((string)($inFilter['subjectContains'] ?? ($input['emailSubjectFilter'] ?? ($input['email_subject_filter'] ?? ($prev['emailSubjectFilter'] ?? '')))));
        $crmEventName = trim((string)($inFilter['eventType'] ?? ($input['crmEventName'] ?? ($input['crm_event_name'] ?? ($prev['crmEventName'] ?? 'lead_created')))));
        $keywordFilter = trim((string)($inFilter['keywordContains'] ?? ($input['keywordFilter'] ?? ($input['keyword_filter'] ?? ($prev['keywordFilter'] ?? '')))));
        $onlyGroup = array_key_exists('onlyGroup', $inFilter) ? (bool)$inFilter['onlyGroup'] : (bool)($prev['filter']['onlyGroup'] ?? false);
        $onlyDirect = array_key_exists('onlyDirect', $inFilter) ? (bool)$inFilter['onlyDirect'] : (bool)($prev['filter']['onlyDirect'] ?? false);

        $record = [
            'id' => $id,
            'name' => $name,
            'enabled' => array_key_exists('enabled', $input) ? (bool)$input['enabled'] : (bool)($prev['enabled'] ?? true),
            'sourceType' => $sourceType,
            'sourceConnectorId' => $sourceConnectorId,
            'whatsappChatJid' => $whatsappChat !== '' ? $whatsappChat : '*',
            'whatsappChatName' => $whatsappChatName !== '' ? $whatsappChatName : 'All Chats',
            'emailSenderFilter' => $emailSenderFilter,
            'emailSubjectFilter' => $emailSubjectFilter,
            'crmEventName' => $crmEventName !== '' ? $crmEventName : 'lead_created',
            'keywordFilter' => $keywordFilter,
            'filter' => [
                'chatMatch' => $whatsappChat !== '*' ? $whatsappChat : '',
                'onlyGroup' => $onlyGroup,
                'onlyDirect' => $onlyDirect,
                'subjectContains' => $emailSubjectFilter,
                'fromContains' => $emailSenderFilter,
                'keywordContains' => $keywordFilter,
                'eventType' => $crmEventName !== '' ? $crmEventName : 'lead_created',
            ],
            'targetConnectorId' => $targetConnectorId,
            'targetAgentId' => $targetAgentId,
            'targetSubagentId' => $targetSubagentId,
            'instructions' => trim((string)($input['instructions'] ?? ($prev['instructions'] ?? 'Read the full conversation context and reply helpfully.'))),
            'autoReply' => array_key_exists('autoReply', $input)
                ? (bool)$input['autoReply']
                : (array_key_exists('auto_reply', $input) ? (bool)$input['auto_reply'] : (bool)($prev['autoReply'] ?? true)),
            'proactiveEnabled' => array_key_exists('proactiveEnabled', $input)
                ? (bool)$input['proactiveEnabled']
                : (array_key_exists('proactive_enabled', $input) ? (bool)$input['proactive_enabled'] : (bool)($prev['proactiveEnabled'] ?? false)),
            'proactiveAfterMinutes' => max(1, (int)($input['proactiveAfterMinutes'] ?? ($input['proactive_after_minutes'] ?? ($prev['proactiveAfterMinutes'] ?? 120)))),
            'proactiveMaxAttempts' => max(1, min(5, (int)($input['proactiveMaxAttempts'] ?? ($input['proactive_max_attempts'] ?? ($prev['proactiveMaxAttempts'] ?? 1))))),
            'proactiveInstructions' => trim((string)($input['proactiveInstructions'] ?? ($input['proactive_instructions'] ?? ($prev['proactiveInstructions'] ?? 'Follow up politely on our last message if the conversation is still open. If the conversation ended naturally (e.g. thanks/goodbye/resolved), reply with [SKIP_FOLLOWUP] and do not send a message.')))),
            'proactiveState' => is_array($prev['proactiveState'] ?? null) ? $prev['proactiveState'] : [],
            'cooldownSeconds' => max(2, (int)($input['cooldownSeconds'] ?? ($prev['cooldownSeconds'] ?? 10))),
            'minContextMessages' => max(10, (int)($input['minContextMessages'] ?? ($prev['minContextMessages'] ?? 50))),
            'minContextDays' => max(1, (int)($input['minContextDays'] ?? ($prev['minContextDays'] ?? 5))),
            'maxContextChars' => max(2000, (int)($input['maxContextChars'] ?? ($prev['maxContextChars'] ?? 16000))),
            'watermarkTsMs' => isset($prev['watermarkTsMs']) ? (int)$prev['watermarkTsMs'] : 0,
            'lastEmailUid' => isset($prev['lastEmailUid']) ? (int)$prev['lastEmailUid'] : 0,
            'processedIds' => is_array($prev['processedIds'] ?? null) ? array_slice($prev['processedIds'], -200) : [],
            'triggerCount' => (int)($prev['triggerCount'] ?? 0),
            'lastTriggeredAt' => $prev['lastTriggeredAt'] ?? null,
            'lastTriggerSummary' => $prev['lastTriggerSummary'] ?? null,
            'lastTriggerStatus' => $prev['lastTriggerStatus'] ?? null,
            'createdAt' => (string)($prev['createdAt'] ?? $nowIso),
            'updatedAt' => $nowIso,
        ];

        // For newly created messaging triggers, initialize watermarkTsMs from existing store.json max tsMs (never host clock, avoiding provider clock skew).
        // Also clear stale "paused" session overrides on the target messaging connector when saving an enabled trigger.
        if ($sourceType === 'whatsapp' && $sourceConnectorId !== '') {
            try {
                $st = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `id` = ? LIMIT 1");
                $st->execute([$sourceConnectorId]);
                $srcRow = $st->fetch(PDO::FETCH_ASSOC);
                if ($srcRow) {
                    $srcRow['settings'] = json_decode((string)($srcRow['settings_json'] ?? '{}'), true) ?: [];
                    $waAccId = ccrm_waai_resolve_account_id($srcRow);
                    if ($existingIdx === null && $record['watermarkTsMs'] <= 0) {
                        $storeFile = ccrm_waai_storage_root() . '/accounts/' . $waAccId . '/store.json';
                        $store = is_file($storeFile) ? (json_decode((string)@file_get_contents($storeFile), true) ?: []) : [];
                        $maxStoreTs = 0;
                        foreach (($store['messages'] ?? []) as $tMsgs) {
                            foreach ((is_array($tMsgs) ? $tMsgs : []) as $m) {
                                $mTs = (int)($m['tsMs'] ?? 0);
                                if ($mTs > $maxStoreTs) $maxStoreTs = $mTs;
                            }
                        }
                        $record['watermarkTsMs'] = $maxStoreTs;
                    }
                    if (!empty($record['enabled'])) {
                        $tkMap = ccrm_waai_get_takeover_map($waAccId);
                        $tkChanged = false;
                        foreach ($tkMap as $tkCid => $tkVal) {
                            if (($tkVal['mode'] ?? '') === 'paused') {
                                unset($tkMap[$tkCid]);
                                $tkChanged = true;
                            }
                        }
                        if ($tkChanged) {
                            ccrm_waai_save_takeover_map($waAccId, $tkMap);
                        }
                    }
                }
            } catch (\Throwable $e) {}
        }

        // If this is a newly created Email trigger and lastEmailUid is 0, initialize lastEmailUid to current max UID in INBOX
        if ($sourceType === 'email' && $record['lastEmailUid'] <= 0 && $sourceConnectorId !== '') {
            try {
                $st = $pdo->prepare("SELECT MAX(`uid`) FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `folder` = 'INBOX'");
                $st->execute(['c:' . $sourceConnectorId]);
                $record['lastEmailUid'] = (int)$st->fetchColumn();
            } catch (\Throwable $e) {}
        }

        if ($existingIdx !== null) {
            $triggers[$existingIdx] = $record;
        } else {
            $triggers[] = $record;
        }

        @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        @chmod($trigFile, 0600);
        ccrm_marveen_update_connector_settings_mirror($pdo, $targetConnectorId, static function (array $s) use ($triggers): array {
            $s['triggers'] = array_values($triggers);
            return $s;
        });

        return $record;
    }
}

if (!function_exists('ccrm_marveen_delete_trigger')) {
    function ccrm_marveen_delete_trigger(PDO $pdo, string $targetConnectorId, string $triggerId): bool {
        $dir = ccrm_marveen_connector_dir($targetConnectorId);
        $trigFile = $dir . '/triggers.json';
        $triggers = is_file($trigFile) ? (json_decode((string)@file_get_contents($trigFile), true) ?: []) : [];
        $filtered = array_values(array_filter($triggers, static fn($t) => ($t['id'] ?? '') !== $triggerId));
        @file_put_contents($trigFile, json_encode($filtered, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $targetConnectorId, static function (array $s) use ($filtered): array {
            $s['triggers'] = $filtered;
            return $s;
        });
        return count($filtered) !== count($triggers);
    }
}

if (!function_exists('ccrm_marveen_execute_single_trigger_event')) {
    /**
     * Executes a single matched event trigger on its Target Agent with full 50-message / 5-day / 16k-char context.
     */
    function ccrm_marveen_execute_single_trigger_event(
        PDO $pdo,
        array $aiConnector,
        array &$trigger,
        array $eventContext
    ): array {
        $cid = (string)$aiConnector['id'];
        $settings = is_array($aiConnector['settings'] ?? null) ? $aiConnector['settings'] : [];
        $userIds = is_array($settings['userIds'] ?? null) ? array_values(array_filter(array_map('strval', $settings['userIds']))) : [];
        $runAsUser = $userIds[0] ?? (string)($aiConnector['owner_user_id'] ?? '');
        if ($runAsUser === '') {
            $uStmt = $pdo->query("SELECT `id` FROM `users` ORDER BY `role` = 'admin' DESC, `id` ASC LIMIT 1");
            $runAsUser = (string)($uStmt ? $uStmt->fetchColumn() : '');
        }

        $targetAgentId = trim((string)($trigger['targetAgentId'] ?? ($trigger['targetSubagentId'] ?? 'main')));
        $subIdForRun = ($targetAgentId !== '' && $targetAgentId !== 'main') ? $targetAgentId : null;

        $sourceType = (string)($trigger['sourceType'] ?? 'whatsapp');
        $autoReply = !empty($trigger['autoReply']);
        $instructions = trim((string)($trigger['instructions'] ?? ''));

        $promptLines = [
            "⚡ [REACTIVE EVENT TRIGGER FIRED: {$trigger['name']}]",
            "- Source Type: " . strtoupper($sourceType),
            "- Source Channel: " . ($eventContext['sourceLabel'] ?? ''),
            "- Trigger Summary: " . ($eventContext['summary'] ?? ''),
        ];
        if (!empty($eventContext['sender'])) {
            $promptLines[] = "- Incoming From: " . $eventContext['sender'];
        }
        if (!empty($eventContext['subject'])) {
            $promptLines[] = "- Subject: " . $eventContext['subject'];
        }
        if (!empty($eventContext['latestMessageText'])) {
            $promptLines[] = "\n## Latest Incoming Message That Triggered This Run\n" . $eventContext['latestMessageText'];
        }
        if (!empty($eventContext['conversationTranscript'])) {
            $promptLines[] = "\n## Full Conversation Context (Last 50 Messages & Last 5 Days, Capped at 16,000 Chars)\n```text\n"
                . $eventContext['conversationTranscript']
                . "\n```";
        }
        $promptLines[] = "\n## Your Trigger Instructions\n" . ($instructions !== '' ? $instructions : 'Respond appropriately to the incoming message based on your memory.md and the conversation context.');

        if ($autoReply) {
            if ($sourceType === 'whatsapp' && !empty($eventContext['chatId'])) {
                $promptLines[] = "\nIMPORTANT: Auto-Reply is ENABLED for this trigger. You MUST send your reply directly to this WhatsApp chat using `whatsapp_send_message` with `chat: \"{$eventContext['chatId']}\"` (and `connector_id: \"{$trigger['sourceConnectorId']}\"`). Do not reply to your own messages or repeat an already-sent answer.";
            } elseif ($sourceType === 'email' && !empty($eventContext['replyToAddress'])) {
                $uidParam = !empty($eventContext['emailUid']) ? ", `reply_to_uid: {$eventContext['emailUid']}`" : '';
                $promptLines[] = "\nIMPORTANT: Auto-Reply is ENABLED for this trigger. You MUST send your email reply using `email_send_reply` with `to: \"{$eventContext['replyToAddress']}\"`, `subject: \"{$eventContext['replySubject']}\"`{$uidParam}, and `connector_id: \"{$trigger['sourceConnectorId']}\"`.";
            }
        } else {
            $promptLines[] = "\nNote: Auto-Reply is OFF for this trigger. Analyze the event and draft/log your response here in the agent chat without sending an external message unless explicitly instructed.";
        }

        $fullPrompt = implode("\n", $promptLines);
        $res = ccrm_marveen_run_agent($pdo, $aiConnector, $runAsUser, $fullPrompt, '', $subIdForRun);

        $trigger['lastTriggeredAt'] = gmdate('c');
        $trigger['triggerCount'] = ((int)($trigger['triggerCount'] ?? 0)) + 1;
        $trigger['lastTriggerSummary'] = (string)($eventContext['summary'] ?? 'Triggered');
        $trigger['lastTriggerStatus'] = !empty($res['ok']) ? 'ok' : ('error: ' . ($res['error'] ?? 'failed'));

        $botMsg = [
            'id' => 'trig-' . uniqid('', false),
            'role' => 'assistant',
            'autonomous' => true,
            'triggerId' => $trigger['id'],
            'taskTitle' => '⚡ ' . ($trigger['name'] ?? 'Event Trigger') . ' · ' . ($eventContext['summary'] ?? ''),
            'subagentId' => $subIdForRun,
            'text' => !empty($res['ok'])
                ? (string)($res['text'] ?? 'Trigger executed.')
                : ('⚠️ Trigger error: ' . (string)($res['error'] ?? 'failed')),
            'steps' => $res['steps'] ?? [],
            'timestamp' => date('H:i'),
            'createdAt' => gmdate('c'),
        ];
        ccrm_marveen_append_chat_message($cid, $botMsg, $subIdForRun);

        return [
            'ok' => !empty($res['ok']),
            'triggerId' => $trigger['id'],
            'agentId' => $targetAgentId,
            'summary' => $eventContext['summary'] ?? '',
            'message' => $botMsg,
            'result' => $res,
        ];
    }
}

if (!function_exists('ccrm_marveen_process_event_triggers')) {
    /**
     * Zero-LLM-cost event detector for WhatsApp and Email triggers.
     * Inspects local WhatsApp `store.json` and `mail_envelopes` watermarks; ONLY invokes the LLM
     * when a genuine new incoming (!fromMe) message matches an active trigger rule.
     */
    function ccrm_marveen_process_event_triggers(PDO $pdo, ?string $onlySourceFilter = null): array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        $secretKeys = function_exists('ccrm_email_secret_keys')
            ? ccrm_email_secret_keys()
            : ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret', 'botmanToken', 'botmanAppSecret', 'botmanSigningSecret', 'botmanVerifyToken'];

        $aiConnectors = [];
        $waConnectorsById = [];
        $emailConnectorsById = [];

        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw) ? ccrm_decrypt_config_secrets($raw, $secretKeys) : [];
            $cType = strtolower((string)($settings['connectorType'] ?? ''));
            if ($cType === '') {
                $imapHost = strtolower((string)($settings['imapHost'] ?? ''));
                $cType = str_contains($imapHost, 'gmail') ? 'gmail' : (($settings['provider'] ?? '') === 'exchange' ? 'exchange' : 'smtp');
            }
            $settings['connectorType'] = $cType;
            $row['settings'] = $settings;

            if (ccrm_marveen_is_agent_connector_type($cType)) {
                $aiConnectors[(string)$row['id']] = $row;
            } elseif ($cType === 'whatsapp' || ccrm_is_botman_connector($cType)) {
                $waConnectorsById[(string)$row['id']] = $row;
            } elseif (in_array($cType, ['gmail', 'smtp', 'exchange'], true)) {
                $emailConnectorsById[(string)$row['id']] = $row;
            }
        }

        if (empty($aiConnectors)) {
            return ['ok' => true, 'fired' => []];
        }

        $fired = [];
        $nowSec = time();

        foreach ($aiConnectors as $aiId => $aiRow) {
            $dir = ccrm_marveen_connector_dir($aiId);
            $trigFile = $dir . '/triggers.json';
            $triggers = ccrm_marveen_list_triggers($pdo, $aiRow);
            if (empty($triggers)) {
                continue;
            }

            $lockFp = @fopen($dir . '/.triggers.lock', 'c');
            if ($lockFp && !@flock($lockFp, LOCK_EX | LOCK_NB)) {
                @fclose($lockFp);
                continue;
            }

            $dirty = false;
            try {
                foreach ($triggers as &$trig) {
                    if (empty($trig['enabled'])) {
                        continue;
                    }
                    $sType = (string)($trig['sourceType'] ?? 'whatsapp');
                    $sConnId = (string)($trig['sourceConnectorId'] ?? '');

                    // Cooldown check
                    $cooldownSec = max(2, (int)($trig['cooldownSeconds'] ?? 10));
                    $lastTrigTs = !empty($trig['lastTriggeredAt']) ? strtotime((string)$trig['lastTriggeredAt']) : 0;
                    if ($lastTrigTs > 0 && ($nowSec - $lastTrigTs) < $cooldownSec) {
                        continue;
                    }

                    $minMsgs = max(10, (int)($trig['minContextMessages'] ?? 50));
                    $minDays = max(1, (int)($trig['minContextDays'] ?? 5));
                    $maxChars = max(2000, (int)($trig['maxContextChars'] ?? 16000));
                    $processedIds = is_array($trig['processedIds'] ?? null) ? $trig['processedIds'] : [];
                    $kwFilter = mb_strtolower(trim((string)($trig['keywordFilter'] ?? '')), 'UTF-8');

                    if ($sType === 'whatsapp') {
                        $waRow = ($sConnId !== '' && isset($waConnectorsById[$sConnId]))
                            ? $waConnectorsById[$sConnId]
                            : (reset($waConnectorsById) ?: null);
                        if (!$waRow) {
                            continue;
                        }
                        $waAccountId = ccrm_waai_resolve_account_id($waRow);
                        if ($onlySourceFilter !== null && $onlySourceFilter !== '' && $onlySourceFilter !== (string)$waRow['id'] && $onlySourceFilter !== $waAccountId) {
                            continue;
                        }
                        if (ccrm_is_botman_connector((string)($waRow['settings']['connectorType'] ?? ''))) {
                            ccrm_botman_get_chats($waRow, $onlySourceFilter === null);
                        }

                        // Read store.json directly from disk at $0 cost (no worker spawn needed if already synced)
                        $storeFile = ccrm_waai_storage_root() . '/accounts/' . $waAccountId . '/store.json';
                        if (!is_file($storeFile)) {
                            continue;
                        }
                        $store = json_decode((string)@file_get_contents($storeFile), true);
                        if (!is_array($store)) {
                            continue;
                        }
                        $chats = is_array($store['chats'] ?? null) ? $store['chats'] : [];
                        $messagesMap = is_array($store['messages'] ?? null) ? $store['messages'] : [];
                        $takeoverMap = ccrm_waai_get_takeover_map($waAccountId);
                        $chatFilter = trim((string)($trig['whatsappChatJid'] ?? '*'));
                        $chatFilterLower = mb_strtolower($chatFilter, 'UTF-8');
                        $watermarkMs = (int)($trig['watermarkTsMs'] ?? 0);
                        $newMaxWatermarkMs = $watermarkMs;

                        foreach ($chats as $chatMeta) {
                            $chatId = (string)($chatMeta['id'] ?? '');
                            $chatName = (string)($chatMeta['name'] ?? $chatId);
                            if ($chatId === '' || $chatId === 'status@broadcast') {
                                continue;
                            }
                            // Skip if Agent Takeover was explicitly overridden (paused or assigned to a specific agent/subagent) for this session
                            if (in_array((string)($takeoverMap[$chatId]['mode'] ?? ''), ['paused', 'active'], true)) {
                                continue;
                            }
                            if (!empty($trig['filter']['onlyGroup']) && empty($chatMeta['isGroup'])) {
                                continue;
                            }
                            if (!empty($trig['filter']['onlyDirect']) && !empty($chatMeta['isGroup'])) {
                                continue;
                            }
                            // Check chat filter
                            if ($chatFilter !== '' && $chatFilter !== '*') {
                                if ($chatFilter === '@g.us' && empty($chatMeta['isGroup'])) {
                                    continue;
                                } elseif ($chatFilter === '@s.whatsapp.net' && !empty($chatMeta['isGroup'])) {
                                    continue;
                                } elseif ($chatFilter !== '@g.us' && $chatFilter !== '@s.whatsapp.net') {
                                    $matchId = strtolower($chatId) === strtolower($chatFilter);
                                    $matchName = mb_strpos(mb_strtolower($chatName, 'UTF-8'), $chatFilterLower) !== false;
                                    $matchTargetName = !empty($trig['whatsappChatName']) && $trig['whatsappChatName'] !== 'All Chats'
                                        && mb_strpos(mb_strtolower($chatName, 'UTF-8'), mb_strtolower((string)$trig['whatsappChatName'], 'UTF-8')) !== false;
                                    if (!$matchId && !$matchName && !$matchTargetName) {
                                        continue;
                                    }
                                }
                            }

                            $thread = is_array($messagesMap[$chatId] ?? null) ? $messagesMap[$chatId] : [];
                            if (empty($thread)) {
                                continue;
                            }

                            // If the very latest message in the thread is from us (fromMe), we already replied!
                            $lastThreadMsg = $thread[count($thread) - 1];
                            if (!empty($lastThreadMsg['fromMe'])) {
                                $lastTs = (int)($lastThreadMsg['tsMs'] ?? 0);
                                if ($lastTs > $newMaxWatermarkMs) {
                                    $newMaxWatermarkMs = $lastTs;
                                    $trig['watermarkTsMs'] = $newMaxWatermarkMs;
                                    $dirty = true;
                                }
                                continue;
                            }

                            // Find new incoming (!fromMe) messages after watermarkMs not yet in processedIds
                            $newIncoming = [];
                            foreach ($thread as $m) {
                                $mId = (string)($m['id'] ?? '');
                                $mTs = (int)($m['tsMs'] ?? 0);
                                if ($mTs <= $watermarkMs) {
                                    continue;
                                }
                                if (!empty($m['fromMe'])) {
                                    // Never trigger on our own outgoing messages! Advance watermark so we skip them.
                                    if ($mTs > $newMaxWatermarkMs) {
                                        $newMaxWatermarkMs = $mTs;
                                    }
                                    continue;
                                }
                                if ($mId !== '' && (in_array($mId, $processedIds, true) || in_array('wa:' . $mId, $processedIds, true))) {
                                    continue;
                                }
                                $mText = trim((string)($m['text'] ?? ''));
                                if ($mText === '') {
                                    continue;
                                }
                                if ($kwFilter !== '' && mb_strpos(mb_strtolower($mText, 'UTF-8'), $kwFilter) === false) {
                                    continue;
                                }
                                $newIncoming[] = $m;
                                if ($mTs > $newMaxWatermarkMs) {
                                    $newMaxWatermarkMs = $mTs;
                                }
                            }

                            if (!empty($newIncoming)) {
                                foreach ($newIncoming as $nm) {
                                    if (!empty($nm['id'])) {
                                        $processedIds[] = (string)$nm['id'];
                                        $processedIds[] = 'wa:' . (string)$nm['id'];
                                    }
                                }
                                $trig['processedIds'] = array_values(array_slice(array_unique($processedIds), -200));
                                $trig['watermarkTsMs'] = $newMaxWatermarkMs;
                                $dirty = true;

                                $ctxWindow = ccrm_marveen_build_conversation_context($thread, $minMsgs, $minDays, $maxChars);
                                $latestTexts = array_map(
                                    static fn(array $nm) => ($nm['senderName'] ?? 'Sender') . ': ' . ($nm['text'] ?? ''),
                                    $newIncoming
                                );
                                $lastSender = (string)($newIncoming[count($newIncoming) - 1]['senderName'] ?? $chatName);

                                $eventCtx = [
                                    'sourceLabel' => ($waRow['name'] ?? 'WhatsApp') . ' · ' . $chatName,
                                    'summary' => "WhatsApp ({$chatName}) from {$lastSender}",
                                    'sender' => $lastSender,
                                    'chatId' => $chatId,
                                    'chatName' => $chatName,
                                    'latestMessageText' => implode("\n", $latestTexts),
                                    'conversationTranscript' => $ctxWindow['transcript'],
                                ];

                                $execRes = ccrm_marveen_execute_single_trigger_event($pdo, $aiRow, $trig, $eventCtx);
                                $fired[] = $execRes;
                                break; // One trigger run per tick per rule
                            }
                        }
                    } elseif ($sType === 'email') {
                        $emRow = ($sConnId !== '' && isset($emailConnectorsById[$sConnId]))
                            ? $emailConnectorsById[$sConnId]
                            : (reset($emailConnectorsById) ?: null);
                        if (!$emRow) {
                            continue;
                        }
                        if ($onlySourceFilter !== null && $onlySourceFilter !== '' && $onlySourceFilter !== (string)$emRow['id']) {
                            continue;
                        }

                        $mailboxKey = 'c:' . $emRow['id'];
                        $ownAddress = strtolower(trim((string)($emRow['address'] ?? '')));
                        $lastUid = (int)($trig['lastEmailUid'] ?? 0);

                        try {
                            $st = $pdo->prepare(
                                "SELECT * FROM `mail_envelopes`
                                 WHERE `mailbox_key` = ? AND `folder` = 'INBOX' AND `uid` > ? AND `is_outgoing` = 0
                                 ORDER BY `uid` ASC LIMIT 10"
                            );
                            $st->execute([$mailboxKey, $lastUid]);
                            $newEmails = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
                        } catch (\Throwable $e) {
                            $newEmails = [];
                        }

                        foreach ($newEmails as $em) {
                            $eUid = (int)($em['uid'] ?? 0);
                            if ($eUid > $trig['lastEmailUid']) {
                                $trig['lastEmailUid'] = $eUid;
                                $dirty = true;
                            }
                            $emEventKey = 'email:' . $mailboxKey . ':' . $eUid;
                            $emMsgIdKey = !empty($em['message_id']) ? ('msgid:' . (string)$em['message_id']) : '';
                            if (
                                in_array($emEventKey, $processedIds, true) ||
                                ($emMsgIdKey !== '' && in_array($emMsgIdKey, $processedIds, true))
                            ) {
                                continue;
                            }

                            $fromAddr = strtolower(trim((string)($em['from_address'] ?? '')));
                            $subj = (string)($em['subject'] ?? '');
                            $preview = (string)($em['preview'] ?? '');

                            // Loop prevention: ignore our own address or automated bounces/no-reply
                            if (
                                $fromAddr === '' ||
                                ($ownAddress !== '' && $fromAddr === $ownAddress) ||
                                preg_match('/^(no-reply|noreply|mailer-daemon|postmaster|bounce)@/i', $fromAddr)
                            ) {
                                continue;
                            }

                            $senderFilter = mb_strtolower(trim((string)($trig['emailSenderFilter'] ?? '')), 'UTF-8');
                            if ($senderFilter !== '' && mb_strpos(mb_strtolower($fromAddr . ' ' . ($em['from_name'] ?? ''), 'UTF-8'), $senderFilter) === false) {
                                continue;
                            }
                            $subjFilter = mb_strtolower(trim((string)($trig['emailSubjectFilter'] ?? '')), 'UTF-8');
                            if ($subjFilter !== '' && mb_strpos(mb_strtolower($subj, 'UTF-8'), $subjFilter) === false) {
                                continue;
                            }
                            if ($kwFilter !== '' && mb_strpos(mb_strtolower($subj . ' ' . $preview, 'UTF-8'), $kwFilter) === false) {
                                continue;
                            }

                            // Build 50-message / 5-day email thread context with this sender
                            $threadRows = [];
                            try {
                                $tSt = $pdo->prepare(
                                    "SELECT * FROM `mail_envelopes`
                                     WHERE `mailbox_key` = ? AND (`from_address` = ? OR `to_address` LIKE ?)
                                     ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                                );
                                $tSt->execute([$mailboxKey, $fromAddr, '%' . $fromAddr . '%']);
                                $threadRows = $tSt->fetchAll(PDO::FETCH_ASSOC) ?: [];
                            } catch (\Throwable $e) {}

                            // If the latest email in the thread with this sender is already an outgoing reply, skip!
                            if (!empty($threadRows)) {
                                $latestThreadRow = $threadRows[count($threadRows) - 1];
                                if (!empty($latestThreadRow['is_outgoing'])) {
                                    $processedIds[] = $emEventKey;
                                    if ($emMsgIdKey !== '') {
                                        $processedIds[] = $emMsgIdKey;
                                    }
                                    $trig['processedIds'] = array_values(array_slice(array_unique($processedIds), -200));
                                    $dirty = true;
                                    continue;
                                }
                            }

                            $processedIds[] = $emEventKey;
                            if ($emMsgIdKey !== '') {
                                $processedIds[] = $emMsgIdKey;
                            }
                            $trig['processedIds'] = array_values(array_slice(array_unique($processedIds), -200));
                            $dirty = true;

                            $mappedForCtx = array_map(static fn(array $r) => [
                                'id' => 'uid-' . ($r['uid'] ?? ''),
                                'fromMe' => !empty($r['is_outgoing']),
                                'senderName' => !empty($r['is_outgoing']) ? 'Me' : (($r['from_name'] ?: $r['from_address']) ?: 'Sender'),
                                'text' => "[Subject: " . ($r['subject'] ?? '') . "] " . ($r['preview'] ?? ''),
                                'createdAt' => $r['email_date'] ?? '',
                            ], $threadRows);
                            $ctxWindow = ccrm_marveen_build_conversation_context($mappedForCtx, $minMsgs, $minDays, $maxChars);

                            $replySubj = preg_match('/^re:/i', $subj) ? $subj : ('Re: ' . $subj);
                            $eventCtx = [
                                'sourceLabel' => ($emRow['name'] ?? 'Email') . ' (' . ($emRow['address'] ?? '') . ')',
                                'summary' => "Email from {$fromAddr}: {$subj}",
                                'sender' => ($em['from_name'] ? "{$em['from_name']} <{$fromAddr}>" : $fromAddr),
                                'subject' => $subj,
                                'emailUid' => $eUid,
                                'replyToAddress' => $fromAddr,
                                'replySubject' => $replySubj,
                                'latestMessageText' => "Subject: {$subj}\nFrom: {$fromAddr}\n\n{$preview}",
                                'conversationTranscript' => $ctxWindow['transcript'],
                            ];

                            $execRes = ccrm_marveen_execute_single_trigger_event($pdo, $aiRow, $trig, $eventCtx);
                            $fired[] = $execRes;
                            break;
                        }
                    }
                }
                unset($trig);

                if ($dirty) {
                    @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
                    ccrm_marveen_update_connector_settings_mirror($pdo, $aiId, static function (array $s) use ($triggers): array {
                        $s['triggers'] = array_values($triggers);
                        return $s;
                    });
                }
            } finally {
                if ($lockFp) {
                    @flock($lockFp, LOCK_UN);
                    @fclose($lockFp);
                }
            }
        }

        // Evaluate per-conversation Agent Takeover sessions (`takeover.json` -> `mode === 'active'`)
        foreach ($waConnectorsById as $waId => $waRow) {
            $waAccountId = ccrm_waai_resolve_account_id($waRow);
            if ($onlySourceFilter !== null && $onlySourceFilter !== '' && $onlySourceFilter !== (string)$waRow['id'] && $onlySourceFilter !== $waAccountId) {
                continue;
            }
            $takeoverMap = ccrm_waai_get_takeover_map($waAccountId);
            if (empty($takeoverMap)) {
                continue;
            }
            $storeFile = ccrm_waai_storage_root() . '/accounts/' . $waAccountId . '/store.json';
            if (!is_file($storeFile)) {
                continue;
            }
            $store = json_decode((string)@file_get_contents($storeFile), true);
            if (!is_array($store)) {
                continue;
            }
            $messagesMap = is_array($store['messages'] ?? null) ? $store['messages'] : [];
            $tkDirty = false;

            foreach ($takeoverMap as $tkChatId => &$tkEntry) {
                if (!is_array($tkEntry) || (($tkEntry['mode'] ?? '') !== 'active')) {
                    continue;
                }
                $thread = is_array($messagesMap[$tkChatId] ?? null) ? $messagesMap[$tkChatId] : [];
                if (empty($thread)) {
                    continue;
                }
                $lastThreadMsg = $thread[count($thread) - 1];
                if (!empty($lastThreadMsg['fromMe'])) {
                    continue;
                }
                $tkWatermark = (int)($tkEntry['watermarkTsMs'] ?? 0);
                $tkProcessed = is_array($tkEntry['processedIds'] ?? null) ? $tkEntry['processedIds'] : [];
                $newIncoming = [];
                $newMaxWm = $tkWatermark;
                foreach ($thread as $m) {
                    $mId = (string)($m['id'] ?? '');
                    $mTs = (int)($m['tsMs'] ?? 0);
                    if ($mTs <= $tkWatermark) {
                        continue;
                    }
                    if (!empty($m['fromMe'])) {
                        if ($mTs > $newMaxWm) $newMaxWm = $mTs;
                        continue;
                    }
                    if ($mId !== '' && (in_array($mId, $tkProcessed, true) || in_array('wa:' . $mId, $tkProcessed, true))) {
                        continue;
                    }
                    $mText = trim((string)($m['text'] ?? ''));
                    if ($mText === '') {
                        continue;
                    }
                    $newIncoming[] = $m;
                    if ($mTs > $newMaxWm) {
                        $newMaxWm = $mTs;
                    }
                }
                if (empty($newIncoming)) {
                    continue;
                }
                $targetAiId = (string)($tkEntry['agentConnectorId'] ?? '');
                $targetAiRow = ($targetAiId !== '' && isset($aiConnectors[$targetAiId]))
                    ? $aiConnectors[$targetAiId]
                    : (reset($aiConnectors) ?: null);
                if (!$targetAiRow) {
                    continue;
                }
                foreach ($newIncoming as $nm) {
                    if (!empty($nm['id'])) {
                        $tkProcessed[] = (string)$nm['id'];
                        $tkProcessed[] = 'wa:' . (string)$nm['id'];
                    }
                }
                $tkEntry['processedIds'] = array_values(array_slice(array_unique($tkProcessed), -200));
                $tkEntry['watermarkTsMs'] = $newMaxWm;
                $tkDirty = true;

                $chatName = (string)($tkEntry['chatName'] ?? $tkChatId);
                $ctxWindow = ccrm_marveen_build_conversation_context($thread, 50, 5, 16000);
                $latestTexts = array_map(
                    static fn(array $nm) => ($nm['senderName'] ?? 'Sender') . ': ' . ($nm['text'] ?? ''),
                    $newIncoming
                );
                $lastSender = (string)($newIncoming[count($newIncoming) - 1]['senderName'] ?? $chatName);
                $syntheticTrig = [
                    'id' => 'takeover-' . md5($tkChatId),
                    'name' => 'Session Agent Takeover (' . $chatName . ')',
                    'sourceType' => 'whatsapp',
                    'sourceConnectorId' => (string)$waRow['id'],
                    'targetAgentId' => (string)($tkEntry['subagentId'] ?: 'main'),
                    'instructions' => (string)($tkEntry['instructions'] ?? 'You have taken over this conversation session. Read the conversation history and reply helpfully to the latest message.'),
                    'autoReply' => true,
                ];
                $eventCtx = [
                    'sourceLabel' => ($waRow['name'] ?? 'Messaging') . ' · ' . $chatName,
                    'summary' => "Agent Takeover ({$chatName}) from {$lastSender}",
                    'sender' => $lastSender,
                    'chatId' => (string)$tkChatId,
                    'chatName' => $chatName,
                    'latestMessageText' => implode("\n", $latestTexts),
                    'conversationTranscript' => $ctxWindow['transcript'],
                ];
                $fired[] = ccrm_marveen_execute_single_trigger_event($pdo, $targetAiRow, $syntheticTrig, $eventCtx);
                break;
            }
            unset($tkEntry);
            if ($tkDirty) {
                ccrm_waai_save_takeover_map($waAccountId, $takeoverMap);
            }
        }

        if ($onlySourceFilter === null || $onlySourceFilter === '') {
            $proactiveFired = ccrm_marveen_process_proactive_followups($pdo, $aiConnectors, $waConnectorsById, $emailConnectorsById);
            foreach ($proactiveFired as $pf) {
                $fired[] = $pf;
            }
        }

        return ['ok' => true, 'fired' => $fired];
    }
}
