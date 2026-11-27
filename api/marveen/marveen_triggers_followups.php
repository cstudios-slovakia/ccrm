<?php
/**
 * Visual event triggers: proactive followups.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

if (!function_exists('ccrm_marveen_process_proactive_followups')) {
    /**
     * Zero-LLM-cost evaluator for:
     *  1) Agent self-scheduled one-shot follow-ups (`followups.json` via `schedule_conversation_followup`)
     *  2) Per-wire Proactive Re-Initiation (`triggers.json` where `proactiveEnabled === true`)
     *
     * Auto-cancels follow-ups at $0 LLM cost if the contact replied before `dueAt`.
     * Supports `[SKIP_FOLLOWUP]` when the agent judges a conversation ended naturally.
     */
    function ccrm_marveen_process_proactive_followups(
        PDO $pdo,
        array $aiConnectors,
        array $waConnectorsById,
        array $emailConnectorsById
    ): array {
        $fired = [];
        $nowSec = time();

        foreach ($aiConnectors as $aiId => $aiRow) {
            $dir = ccrm_marveen_connector_dir($aiId);
            $settings = is_array($aiRow['settings'] ?? null) ? $aiRow['settings'] : [];
            $userIds = is_array($settings['userIds'] ?? null) ? array_values(array_filter(array_map('strval', $settings['userIds']))) : [];
            $runAsUser = $userIds[0] ?? (string)($aiRow['owner_user_id'] ?? '');
            if ($runAsUser === '') {
                $uStmt = $pdo->query("SELECT `id` FROM `users` ORDER BY `role` = 'admin' DESC, `id` ASC LIMIT 1");
                $runAsUser = (string)($uStmt ? $uStmt->fetchColumn() : '');
            }

            // -----------------------------------------------------------------
            // 1. Agent Self-Scheduled One-Shot Follow-Ups (`followups.json`)
            // -----------------------------------------------------------------
            $fupFile = $dir . '/followups.json';
            $followups = ccrm_marveen_list_followups($pdo, $aiRow);
            $fupDirty = false;

            foreach ($followups as &$fup) {
                if (($fup['status'] ?? 'pending') !== 'pending') {
                    continue;
                }
                $dueTs = !empty($fup['dueAt']) ? strtotime((string)$fup['dueAt']) : 0;
                if ($dueTs > $nowSec) {
                    continue;
                }
                $createdTs = !empty($fup['createdAt']) ? strtotime((string)$fup['createdAt']) : ($nowSec - 3600);
                $sType = strtolower((string)($fup['sourceType'] ?? 'whatsapp'));
                $sConnId = (string)($fup['sourceConnectorId'] ?? '');
                $targetChat = trim((string)($fup['targetChat'] ?? ''));
                $cancelIfReplied = !array_key_exists('cancelIfReplied', $fup) || !empty($fup['cancelIfReplied']);
                $subId = !empty($fup['subagentId']) ? (string)$fup['subagentId'] : null;

                if ($sType === 'whatsapp') {
                    $waRow = ($sConnId !== '' && isset($waConnectorsById[$sConnId]))
                        ? $waConnectorsById[$sConnId]
                        : (reset($waConnectorsById) ?: null);
                    if (!$waRow) {
                        continue;
                    }
                    $waState = ccrm_waai_get_chats($waRow);
                    $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $targetChat);
                    $chatId = (string)($resolved['id'] ?? $targetChat);
                    $chatName = (string)($resolved['name'] ?? ($fup['targetName'] ?? $targetChat));
                    $thread = is_array($waState['messages'][$chatId] ?? null) ? $waState['messages'][$chatId] : [];

                    if ($cancelIfReplied && !empty($thread)) {
                        $repliedAfterCreated = false;
                        foreach ($thread as $m) {
                            $mTsSec = (int)round(((int)($m['tsMs'] ?? 0)) / 1000);
                            if (empty($m['fromMe']) && $mTsSec > $createdTs) {
                                $repliedAfterCreated = true;
                                break;
                            }
                        }
                        if ($repliedAfterCreated) {
                            $fup['status'] = 'cancelled_by_reply';
                            $fup['updatedAt'] = gmdate('c');
                            $fupDirty = true;
                            continue;
                        }
                    }

                    $ctxWindow = ccrm_marveen_build_conversation_context($thread, 50, 5, 16000);
                    $prompt = implode("\n", [
                        "🔄 [PROACTIVE SCHEDULED FOLLOW-UP DUE]",
                        "- Channel: " . ($waRow['name'] ?? 'Messaging') . " (`{$waRow['id']}`)",
                        "- Target Chat: {$chatName} (`{$chatId}`)",
                        "- Follow-Up Instructions: " . ($fup['instructions'] ?? 'Follow up politely.'),
                        "",
                        "## Full Conversation Context (Last 50 Messages & Last 5 Days)",
                        "```text",
                        $ctxWindow['transcript'],
                        "```",
                        "",
                        "IMPORTANT: If the conversation already concluded naturally or the user already answered the question, DO NOT send any message and reply with `[SKIP_FOLLOWUP]`. Otherwise, send your proactive follow-up message now using `whatsapp_send_message` with `chat: \"{$chatId}\"` and `connector_id: \"{$waRow['id']}\"`.",
                    ]);

                    $res = ccrm_marveen_run_agent($pdo, $aiRow, $runAsUser, $prompt, '', $subId);
                    $replyText = (string)($res['text'] ?? '');
                    $skipped = stripos($replyText, '[SKIP_FOLLOWUP]') !== false;

                    $fup['attempts'] = ((int)($fup['attempts'] ?? 0)) + 1;
                    $fup['status'] = $skipped ? 'skipped_natural_end' : (!empty($res['ok']) ? 'sent' : 'error');
                    $fup['executedAt'] = gmdate('c');
                    $fup['updatedAt'] = gmdate('c');
                    $fupDirty = true;

                    $botMsg = [
                        'id' => 'fup-' . uniqid('', false),
                        'role' => 'assistant',
                        'autonomous' => true,
                        'taskTitle' => "🔄 Proactive Follow-Up · {$chatName}",
                        'subagentId' => $subId,
                        'text' => $skipped
                            ? "✓ Skipped proactive follow-up for {$chatName} (conversation ended naturally)."
                            : (!empty($res['ok']) ? ($replyText ?: "Sent proactive follow-up to {$chatName}.") : ('⚠️ Follow-up error: ' . ($res['error'] ?? 'failed'))),
                        'steps' => $res['steps'] ?? [],
                        'timestamp' => date('H:i'),
                        'createdAt' => gmdate('c'),
                    ];
                    ccrm_marveen_append_chat_message($aiId, $botMsg, $subId);
                    $fired[] = ['ok' => !empty($res['ok']), 'followupId' => $fup['id'], 'summary' => $chatName];
                } elseif ($sType === 'email') {
                    $emRow = ($sConnId !== '' && isset($emailConnectorsById[$sConnId]))
                        ? $emailConnectorsById[$sConnId]
                        : (reset($emailConnectorsById) ?: null);
                    if (!$emRow) {
                        continue;
                    }
                    $mailboxKey = 'c:' . $emRow['id'];
                    $threadRows = [];
                    try {
                        $tSt = $pdo->prepare(
                            "SELECT * FROM `mail_envelopes`
                             WHERE `mailbox_key` = ? AND (`from_address` LIKE ? OR `to_address` LIKE ?)
                             ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                        );
                        $tSt->execute([$mailboxKey, '%' . $targetChat . '%', '%' . $targetChat . '%']);
                        $threadRows = $tSt->fetchAll(PDO::FETCH_ASSOC) ?: [];
                    } catch (\Throwable $e) {}

                    if ($cancelIfReplied && !empty($threadRows)) {
                        $repliedAfterCreated = false;
                        foreach ($threadRows as $r) {
                            $emTs = !empty($r['email_date']) ? strtotime((string)$r['email_date']) : 0;
                            if (empty($r['is_outgoing']) && $emTs > $createdTs) {
                                $repliedAfterCreated = true;
                                break;
                            }
                        }
                        if ($repliedAfterCreated) {
                            $fup['status'] = 'cancelled_by_reply';
                            $fup['updatedAt'] = gmdate('c');
                            $fupDirty = true;
                            continue;
                        }
                    }

                    $mapped = array_map(static fn(array $r) => [
                        'id' => 'uid-' . ($r['uid'] ?? ''),
                        'fromMe' => !empty($r['is_outgoing']),
                        'senderName' => !empty($r['is_outgoing']) ? 'Me' : (($r['from_name'] ?: $r['from_address']) ?: 'Sender'),
                        'text' => "[Subject: " . ($r['subject'] ?? '') . "] " . ($r['preview'] ?? ''),
                        'createdAt' => $r['email_date'] ?? '',
                    ], $threadRows);
                    $ctxWindow = ccrm_marveen_build_conversation_context($mapped, 50, 5, 16000);
                    $lastSubj = !empty($threadRows) ? (string)($threadRows[count($threadRows) - 1]['subject'] ?? 'Follow-up') : 'Follow-up';
                    $replySubj = preg_match('/^re:/i', $lastSubj) ? $lastSubj : ('Re: ' . $lastSubj);

                    $prompt = implode("\n", [
                        "🔄 [PROACTIVE SCHEDULED EMAIL FOLLOW-UP DUE]",
                        "- Email Account: {$emRow['name']} ({$emRow['address']}, ID: `{$emRow['id']}`)",
                        "- Recipient: {$targetChat}",
                        "- Follow-Up Instructions: " . ($fup['instructions'] ?? 'Follow up politely.'),
                        "",
                        "## Full Email Thread Context",
                        "```text",
                        $ctxWindow['transcript'],
                        "```",
                        "",
                        "IMPORTANT: If the thread already concluded naturally, reply with `[SKIP_FOLLOWUP]` and do not send an email. Otherwise, send your follow-up email using `email_send_reply` with `to: \"{$targetChat}\"`, `subject: \"{$replySubj}\"`, and `connector_id: \"{$emRow['id']}\"`.",
                    ]);

                    $res = ccrm_marveen_run_agent($pdo, $aiRow, $runAsUser, $prompt, '', $subId);
                    $replyText = (string)($res['text'] ?? '');
                    $skipped = stripos($replyText, '[SKIP_FOLLOWUP]') !== false;

                    $fup['attempts'] = ((int)($fup['attempts'] ?? 0)) + 1;
                    $fup['status'] = $skipped ? 'skipped_natural_end' : (!empty($res['ok']) ? 'sent' : 'error');
                    $fup['executedAt'] = gmdate('c');
                    $fup['updatedAt'] = gmdate('c');
                    $fupDirty = true;

                    $botMsg = [
                        'id' => 'fup-' . uniqid('', false),
                        'role' => 'assistant',
                        'autonomous' => true,
                        'taskTitle' => "🔄 Proactive Email Follow-Up · {$targetChat}",
                        'subagentId' => $subId,
                        'text' => $skipped
                            ? "✓ Skipped proactive email follow-up to {$targetChat}."
                            : (!empty($res['ok']) ? ($replyText ?: "Sent proactive email follow-up to {$targetChat}.") : ('⚠️ Follow-up error: ' . ($res['error'] ?? 'failed'))),
                        'steps' => $res['steps'] ?? [],
                        'timestamp' => date('H:i'),
                        'createdAt' => gmdate('c'),
                    ];
                    ccrm_marveen_append_chat_message($aiId, $botMsg, $subId);
                    $fired[] = ['ok' => !empty($res['ok']), 'followupId' => $fup['id'], 'summary' => $targetChat];
                }
            }
            unset($fup);

            if ($fupDirty) {
                @file_put_contents($fupFile, json_encode(array_values($followups), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
                ccrm_marveen_update_connector_settings_mirror($pdo, $aiId, static function (array $s) use ($followups): array {
                    $s['followups'] = array_values($followups);
                    return $s;
                });
            }

            // -----------------------------------------------------------------
            // 2. Per-Wire Proactive Re-Initiation (`triggers.json` -> `proactiveEnabled`)
            // -----------------------------------------------------------------
            $trigFile = $dir . '/triggers.json';
            $triggers = ccrm_marveen_list_triggers($pdo, $aiRow);
            $trigDirty = false;

            foreach ($triggers as &$trig) {
                if (empty($trig['enabled']) || empty($trig['proactiveEnabled'])) {
                    continue;
                }
                $sType = (string)($trig['sourceType'] ?? 'whatsapp');
                if ($sType !== 'whatsapp') {
                    continue;
                }
                $sConnId = (string)($trig['sourceConnectorId'] ?? '');
                $waRow = ($sConnId !== '' && isset($waConnectorsById[$sConnId]))
                    ? $waConnectorsById[$sConnId]
                    : (reset($waConnectorsById) ?: null);
                if (!$waRow) {
                    continue;
                }
                $waAccountId = ccrm_waai_resolve_account_id($waRow);
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

                $afterSec = max(60, ((int)($trig['proactiveAfterMinutes'] ?? 120)) * 60);
                $maxAttempts = max(1, min(5, (int)($trig['proactiveMaxAttempts'] ?? 1)));
                $pState = is_array($trig['proactiveState'] ?? null) ? $trig['proactiveState'] : [];
                $targetAgentId = trim((string)($trig['targetAgentId'] ?? ($trig['targetSubagentId'] ?? 'main')));
                $subIdForRun = ($targetAgentId !== '' && $targetAgentId !== 'main') ? $targetAgentId : null;

                foreach ($chats as $chatMeta) {
                    $chatId = (string)($chatMeta['id'] ?? '');
                    $chatName = (string)($chatMeta['name'] ?? $chatId);
                    if ($chatId === '' || $chatId === 'status@broadcast') {
                        continue;
                    }
                    if (((string)($takeoverMap[$chatId]['mode'] ?? '')) === 'paused') {
                        continue;
                    }
                    if ($chatFilter !== '' && $chatFilter !== '*') {
                        if ($chatFilter === '@g.us' && empty($chatMeta['isGroup'])) continue;
                        if ($chatFilter === '@s.whatsapp.net' && !empty($chatMeta['isGroup'])) continue;
                        if ($chatFilter !== '@g.us' && $chatFilter !== '@s.whatsapp.net') {
                            $matchId = strtolower($chatId) === strtolower($chatFilter);
                            $matchName = mb_strpos(mb_strtolower($chatName, 'UTF-8'), $chatFilterLower) !== false;
                            if (!$matchId && !$matchName) continue;
                        }
                    }

                    $thread = is_array($messagesMap[$chatId] ?? null) ? $messagesMap[$chatId] : [];
                    if (count($thread) < 2) {
                        continue;
                    }
                    $lastMsg = $thread[count($thread) - 1];
                    // Proactive re-initiation only applies when OUR message is the last one in the thread and the contact hasn't replied
                    if (empty($lastMsg['fromMe'])) {
                        continue;
                    }
                    $lastTsSec = (int)round(((int)($lastMsg['tsMs'] ?? 0)) / 1000);
                    if ($lastTsSec <= 0 || ($nowSec - $lastTsSec) < $afterSec || ($nowSec - $lastTsSec) > (7 * 86400)) {
                        continue;
                    }

                    // Find the latest incoming (!fromMe) message ID as the conversation turn anchor
                    $lastIncomingId = '';
                    for ($i = count($thread) - 1; $i >= 0; $i--) {
                        if (empty($thread[$i]['fromMe'])) {
                            $lastIncomingId = (string)($thread[$i]['id'] ?? ('idx-' . $i));
                            break;
                        }
                    }
                    if ($lastIncomingId === '') {
                        continue;
                    }

                    $cState = is_array($pState[$chatId] ?? null) ? $pState[$chatId] : [
                        'anchorIncomingId' => '',
                        'attempts' => 0,
                        'lastFollowupAt' => 0,
                        'done' => false,
                    ];
                    if (($cState['anchorIncomingId'] ?? '') !== $lastIncomingId) {
                        $cState = [
                            'anchorIncomingId' => $lastIncomingId,
                            'attempts' => 0,
                            'lastFollowupAt' => 0,
                            'done' => false,
                        ];
                    }
                    if (!empty($cState['done']) || (int)($cState['attempts'] ?? 0) >= $maxAttempts) {
                        continue;
                    }
                    if (!empty($cState['lastFollowupAt']) && ($nowSec - (int)$cState['lastFollowupAt']) < $afterSec) {
                        continue;
                    }

                    $ctxWindow = ccrm_marveen_build_conversation_context($thread, 50, 5, 16000);
                    $attemptNum = ((int)($cState['attempts'] ?? 0)) + 1;
                    $proactivePrompt = implode("\n", [
                        "🔄 [PROACTIVE CONVERSATION RE-INITIATION — {$trig['name']} (Attempt {$attemptNum}/{$maxAttempts})]",
                        "- Source Channel: " . ($waRow['name'] ?? 'Messaging') . " (`{$waRow['id']}`)",
                        "- Chat / Contact: {$chatName} (`{$chatId}`)",
                        "- Silence Duration: " . round(($nowSec - $lastTsSec) / 60) . " minutes since our last message",
                        "",
                        "## Full Conversation Context (Last 50 Messages & Last 5 Days)",
                        "```text",
                        $ctxWindow['transcript'],
                        "```",
                        "",
                        "## Proactive Re-Initiation Instructions",
                        (string)($trig['proactiveInstructions'] ?: 'Follow up politely on our last message if the conversation is still open.'),
                        "",
                        "IMPORTANT: If the conversation ended naturally (e.g. 'thanks, bye', 'ok köszönöm', or no reply was expected), DO NOT send a message and reply ONLY with `[SKIP_FOLLOWUP]`. Otherwise, send your proactive follow-up message using `whatsapp_send_message` with `chat: \"{$chatId}\"` and `connector_id: \"{$waRow['id']}\"`.",
                    ]);

                    $res = ccrm_marveen_run_agent($pdo, $aiRow, $runAsUser, $proactivePrompt, '', $subIdForRun);
                    $replyText = (string)($res['text'] ?? '');
                    $skipped = stripos($replyText, '[SKIP_FOLLOWUP]') !== false;

                    $cState['attempts'] = $attemptNum;
                    $cState['lastFollowupAt'] = $nowSec;
                    if ($skipped || $attemptNum >= $maxAttempts) {
                        $cState['done'] = true;
                    }
                    $pState[$chatId] = $cState;
                    $trig['proactiveState'] = $pState;
                    $trig['lastTriggeredAt'] = gmdate('c');
                    $trig['lastTriggerSummary'] = $skipped
                        ? "Proactive check ({$chatName}): skipped (natural end)"
                        : "Proactive follow-up ({$chatName}) #{$attemptNum}";
                    $trig['lastTriggerStatus'] = !empty($res['ok']) ? 'ok' : ('error: ' . ($res['error'] ?? 'failed'));
                    $trigDirty = true;

                    $botMsg = [
                        'id' => 'pro-' . uniqid('', false),
                        'role' => 'assistant',
                        'autonomous' => true,
                        'triggerId' => $trig['id'],
                        'taskTitle' => "🔄 Proactive Re-Initiation · {$chatName} (#{$attemptNum}/{$maxAttempts})",
                        'subagentId' => $subIdForRun,
                        'text' => $skipped
                            ? "✓ Proactive check on {$chatName}: conversation ended naturally (`[SKIP_FOLLOWUP]`)."
                            : (!empty($res['ok']) ? ($replyText ?: "Sent proactive follow-up to {$chatName}.") : ('⚠️ Proactive error: ' . ($res['error'] ?? 'failed'))),
                        'steps' => $res['steps'] ?? [],
                        'timestamp' => date('H:i'),
                        'createdAt' => gmdate('c'),
                    ];
                    ccrm_marveen_append_chat_message($aiId, $botMsg, $subIdForRun);
                    $fired[] = [
                        'ok' => !empty($res['ok']),
                        'triggerId' => $trig['id'],
                        'proactive' => true,
                        'summary' => $trig['lastTriggerSummary'],
                    ];
                    break;
                }
            }
            unset($trig);

            if ($trigDirty) {
                @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
                ccrm_marveen_update_connector_settings_mirror($pdo, $aiId, static function (array $s) use ($triggers): array {
                    $s['triggers'] = array_values($triggers);
                    return $s;
                });
            }
        }

        return $fired;
    }
}
