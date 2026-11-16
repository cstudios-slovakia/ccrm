<?php
/**
 * Visual event triggers: test run and CRM event triggers.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

if (!function_exists('ccrm_marveen_test_trigger')) {
    /**
     * Runs a manual test of a specific trigger using the latest conversation context from its source connection.
     */
    function ccrm_marveen_test_trigger(PDO $pdo, array $aiConnector, string $triggerId): array {
        $cid = (string)$aiConnector['id'];
        $dir = ccrm_marveen_connector_dir($cid);
        $trigFile = $dir . '/triggers.json';
        $triggers = ccrm_marveen_list_triggers($pdo, $aiConnector);

        $foundIdx = null;
        foreach ($triggers as $idx => $t) {
            if (($t['id'] ?? '') === $triggerId) {
                $foundIdx = $idx;
                break;
            }
        }
        if ($foundIdx === null) {
            return ['ok' => false, 'error' => 'Trigger not found: ' . $triggerId];
        }

        $trig = &$triggers[$foundIdx];
        $sType = (string)($trig['sourceType'] ?? 'whatsapp');
        $sConnId = (string)($trig['sourceConnectorId'] ?? '');
        $minMsgs = max(10, (int)($trig['minContextMessages'] ?? 50));
        $minDays = max(1, (int)($trig['minContextDays'] ?? 5));
        $maxChars = max(2000, (int)($trig['maxContextChars'] ?? 16000));

        $eventCtx = [
            'sourceLabel' => strtoupper($sType),
            'summary' => "Manual Trigger Test ({$trig['name']})",
            'sender' => 'Test Contact',
            'latestMessageText' => '(Manual trigger test)',
            'conversationTranscript' => '',
        ];

        $processedIds = is_array($trig['processedIds'] ?? null) ? $trig['processedIds'] : [];
        $alreadyRepliedReason = null;
        $recordProcessedKeys = [];

        if ($sType === 'whatsapp') {
            $waConnectors = ccrm_marveen_list_sibling_whatsapp_connectors($pdo, $aiConnector);
            $waRow = $waConnectors[0] ?? null;
            foreach ($waConnectors as $cand) {
                if ((string)$cand['id'] === $sConnId) {
                    $waRow = $cand;
                    break;
                }
            }
            if ($waRow) {
                $waState = ccrm_waai_get_chats($waRow);
                $chatTarget = trim((string)($trig['whatsappChatJid'] ?? '*'));
                if ($chatTarget === '*' || $chatTarget === '@g.us' || $chatTarget === '@s.whatsapp.net') {
                    $chatTarget = (string)($trig['whatsappChatName'] !== 'All Chats' ? $trig['whatsappChatName'] : '');
                }
                $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $chatTarget);
                if ($resolved) {
                    $chatId = (string)$resolved['id'];
                    $chatName = (string)($resolved['name'] ?? $chatId);
                    $thread = is_array($waState['messages'][$chatId] ?? null) ? $waState['messages'][$chatId] : [];
                    $ctxWindow = ccrm_marveen_build_conversation_context($thread, $minMsgs, $minDays, $maxChars);
                    $lastMsg = !empty($thread) ? $thread[count($thread) - 1] : null;
                    $lastMsgId = (string)($lastMsg['id'] ?? '');
                    if (
                        !empty($lastMsg['fromMe']) ||
                        ($lastMsgId !== '' && (in_array($lastMsgId, $processedIds, true) || in_array('wa:' . $lastMsgId, $processedIds, true)))
                    ) {
                        $alreadyRepliedReason = "✓ Already replied to the latest message in {$chatName} — skipped duplicate reply.";
                    } elseif ($lastMsgId !== '') {
                        $recordProcessedKeys[] = $lastMsgId;
                        $recordProcessedKeys[] = 'wa:' . $lastMsgId;
                    }
                    $eventCtx = [
                        'sourceLabel' => ($waRow['name'] ?? 'WhatsApp') . ' · ' . $chatName,
                        'summary' => "WhatsApp ({$chatName})",
                        'sender' => (string)($lastMsg['senderName'] ?? $chatName),
                        'chatId' => $chatId,
                        'chatName' => $chatName,
                        'latestMessageText' => (string)($lastMsg['text'] ?? '(Latest conversation check)'),
                        'conversationTranscript' => $ctxWindow['transcript'],
                    ];
                }
            }
        } elseif ($sType === 'email') {
            $emConnectors = ccrm_marveen_list_sibling_email_connectors($pdo, $aiConnector);
            $emRow = $emConnectors[0] ?? null;
            foreach ($emConnectors as $cand) {
                if ((string)$cand['id'] === $sConnId) {
                    $emRow = $cand;
                    break;
                }
            }
            if ($emRow) {
                $mailboxKey = 'c:' . $emRow['id'];
                try {
                    // Find latest incoming message first
                    $st = $pdo->prepare("SELECT * FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `is_outgoing` = 0 ORDER BY `email_date` DESC, `uid` DESC LIMIT 1");
                    $st->execute([$mailboxKey]);
                    $lastEm = $st->fetch(PDO::FETCH_ASSOC);
                    if ($lastEm) {
                        $fromAddr = strtolower(trim((string)($lastEm['from_address'] ?? '')));
                        $subj = (string)($lastEm['subject'] ?? '');
                        $lastUid = (int)($lastEm['uid'] ?? 0);
                        $emEventKey = 'email:' . $mailboxKey . ':' . $lastUid;
                        $emMsgIdKey = !empty($lastEm['message_id']) ? ('msgid:' . (string)$lastEm['message_id']) : '';

                        // Load full thread (BOTH incoming and outgoing) with this sender so outgoing replies are visible
                        $tSt = $pdo->prepare(
                            "SELECT * FROM `mail_envelopes`
                             WHERE `mailbox_key` = ? AND (`from_address` = ? OR `to_address` LIKE ?)
                             ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                        );
                        $tSt->execute([$mailboxKey, $fromAddr, '%' . $fromAddr . '%']);
                        $threadRows = $tSt->fetchAll(PDO::FETCH_ASSOC) ?: [$lastEm];

                        $latestInThread = $threadRows[count($threadRows) - 1] ?? null;
                        if (
                            !empty($latestInThread['is_outgoing']) ||
                            in_array($emEventKey, $processedIds, true) ||
                            ($emMsgIdKey !== '' && in_array($emMsgIdKey, $processedIds, true))
                        ) {
                            $alreadyRepliedReason = "✓ Already replied to the latest email from {$fromAddr} — skipped duplicate reply.";
                        } else {
                            $recordProcessedKeys[] = $emEventKey;
                            if ($emMsgIdKey !== '') {
                                $recordProcessedKeys[] = $emMsgIdKey;
                            }
                        }

                        $mapped = array_map(static fn(array $r) => [
                            'id' => 'uid-' . ($r['uid'] ?? ''),
                            'fromMe' => !empty($r['is_outgoing']),
                            'senderName' => !empty($r['is_outgoing']) ? 'Me' : (($r['from_name'] ?: $r['from_address']) ?: 'Sender'),
                            'text' => "[Subject: " . ($r['subject'] ?? '') . "] " . ($r['preview'] ?? ''),
                            'createdAt' => $r['email_date'] ?? '',
                        ], $threadRows);
                        $ctxWindow = ccrm_marveen_build_conversation_context($mapped, $minMsgs, $minDays, $maxChars);
                        $eventCtx = [
                            'sourceLabel' => ($emRow['name'] ?? 'Email') . ' (' . ($emRow['address'] ?? '') . ')',
                            'summary' => "Email from {$fromAddr}: {$subj}",
                            'sender' => $fromAddr,
                            'subject' => $subj,
                            'emailUid' => $lastUid,
                            'replyToAddress' => $fromAddr,
                            'replySubject' => preg_match('/^re:/i', $subj) ? $subj : ('Re: ' . $subj),
                            'latestMessageText' => "Subject: {$subj}\nFrom: {$fromAddr}\n\n" . ($lastEm['preview'] ?? ''),
                            'conversationTranscript' => $ctxWindow['transcript'],
                        ];
                    }
                } catch (\Throwable $e) {}
            }
        }

        if ($alreadyRepliedReason !== null) {
            return [
                'ok' => true,
                'triggerId' => $triggerId,
                'alreadyReplied' => true,
                'text' => $alreadyRepliedReason,
                'steps' => [],
            ];
        }

        if (!empty($recordProcessedKeys)) {
            $processedIds = array_merge($processedIds, $recordProcessedKeys);
            $trig['processedIds'] = array_values(array_slice(array_unique($processedIds), -200));
        }

        $res = ccrm_marveen_execute_single_trigger_event($pdo, $aiConnector, $trig, $eventCtx);
        @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $cid, static function (array $s) use ($triggers): array {
            $s['triggers'] = array_values($triggers);
            return $s;
        });
        return $res;
    }
}

if (!function_exists('ccrm_marveen_process_crm_event_triggers')) {
    /**
     * Fires any active `crm_event` triggers matching $eventType (e.g. `lead_created`, `client_created`, `task_created`).
     */
    function ccrm_marveen_process_crm_event_triggers(PDO $pdo, string $eventType, array $payload): array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        $secretKeys = function_exists('ccrm_email_secret_keys')
            ? ccrm_email_secret_keys()
            : ['imapPassword', 'smtpPassword', 'subscriptionToken', 'apiKey', 'graphClientSecret'];
        $fired = [];

        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw) ? ccrm_decrypt_config_secrets($raw, $secretKeys) : [];
            $cType = strtolower((string)($settings['connectorType'] ?? ''));
            if (!ccrm_marveen_is_agent_connector_type($cType)) {
                continue;
            }
            $row['settings'] = $settings;
            $aiId = (string)$row['id'];
            $dir = ccrm_marveen_connector_dir($aiId);
            $trigFile = $dir . '/triggers.json';
            $triggers = ccrm_marveen_list_triggers($pdo, $row);
            $dirty = false;

            foreach ($triggers as &$trig) {
                if (empty($trig['enabled']) || ($trig['sourceType'] ?? '') !== 'crm_event') {
                    continue;
                }
                $wantEvent = strtolower(trim((string)($trig['crmEventName'] ?? 'lead_created')));
                if ($wantEvent !== '*' && $wantEvent !== strtolower($eventType)) {
                    continue;
                }
                $dirty = true;
                $eventCtx = [
                    'sourceLabel' => 'CCRM Event · ' . $eventType,
                    'summary' => "CRM Event: {$eventType}",
                    'latestMessageText' => json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
                    'conversationTranscript' => '',
                ];
                $fired[] = ccrm_marveen_execute_single_trigger_event($pdo, $row, $trig, $eventCtx);
            }
            unset($trig);

            if ($dirty) {
                @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
            }
        }
        return $fired;
    }
}
