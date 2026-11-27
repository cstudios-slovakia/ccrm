<?php
/**
 * WAAI WhatsApp QR pairing worker.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

// -----------------------------------------------------------------------------
// Direct WAAI WhatsApp Multi-Device QR Pairing Worker (Baileys)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_waai_storage_root')) {
    function ccrm_waai_storage_root(): string {
        $root = dirname(__DIR__, 2) . '/uploads/.waai';
        if (!is_dir($root)) {
            @mkdir($root, 0775, true);
        }
        return $root;
    }

    function ccrm_waai_sanitize_account_id(string $raw): string {
        $clean = preg_replace('/[^a-zA-Z0-9_-]/', '-', trim($raw)) ?: '';
        return $clean !== '' ? $clean : ('wa-' . substr(bin2hex(random_bytes(4)), 0, 8));
    }

    function ccrm_waai_ensure_deps(): array {
        $optMods = '/opt/ccrm-waai/node_modules/@whiskeysockets/baileys';
        if (is_dir($optMods)) {
            return ['ok' => true, 'path' => '/opt/ccrm-waai/node_modules'];
        }
        $root = ccrm_waai_storage_root();
        $localMods = $root . '/node_modules/@whiskeysockets/baileys';
        if (is_dir($localMods)) {
            return ['ok' => true, 'path' => $root . '/node_modules'];
        }
        $pkgJson = $root . '/package.json';
        if (!is_file($pkgJson)) {
            @file_put_contents($pkgJson, json_encode([
                'name' => 'ccrm-waai-worker',
                'private' => true,
            ], JSON_PRETTY_PRINT));
        }
        $cmd = 'cd ' . escapeshellarg($root) . ' && npm install @whiskeysockets/baileys qrcode pino --no-audit --no-fund 2>&1';
        $out = [];
        $code = 0;
        @exec($cmd, $out, $code);
        if (is_dir($localMods)) {
            return ['ok' => true, 'path' => $root . '/node_modules'];
        }
        return [
            'ok' => false,
            'error' => 'Failed to initialize WAAI Baileys QR worker dependencies: ' . implode("\n", array_slice($out, -5)),
        ];
    }

    function ccrm_waai_qr_start(string $rawAccountId, bool $reset = true): array {
        $deps = ccrm_waai_ensure_deps();
        if (empty($deps['ok'])) {
            return [
                'ok' => false,
                'status' => 'error',
                'error' => $deps['error'] ?? 'WAAI QR dependencies missing.',
            ];
        }
        $accountId = ccrm_waai_sanitize_account_id($rawAccountId);
        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        if (!is_dir($accountDir)) {
            @mkdir($accountDir, 0775, true);
        }

        // Remove stale status file before starting fresh worker
        $statusFile = $accountDir . '/status.json';
        if ($reset && is_file($statusFile)) {
            @unlink($statusFile);
        }

        $workerScript = __DIR__ . '/waai_qr_worker.cjs';
        $logFile = $accountDir . '/worker.log';
        $resetArg = $reset ? 'reset' : 'resume';
        $cmd = sprintf(
            'nohup node %s %s %s %s > %s 2>&1 &',
            escapeshellarg($workerScript),
            escapeshellarg($accountDir),
            escapeshellarg($accountId),
            escapeshellarg($resetArg),
            escapeshellarg($logFile)
        );
        @exec($cmd);

        // Wait up to 5.5 seconds for the first real WhatsApp QR code frame from wss://web.whatsapp.com/ws/chat
        $deadline = microtime(true) + 5.5;
        $lastState = null;
        while (microtime(true) < $deadline) {
            if (is_file($statusFile)) {
                $raw = @file_get_contents($statusFile);
                $decoded = is_string($raw) ? json_decode($raw, true) : null;
                if (is_array($decoded)) {
                    $lastState = $decoded;
                    $st = (string)($decoded['status'] ?? '');
                    if (!empty($decoded['qr']) || $st === 'connected' || $st === 'error') {
                        break;
                    }
                }
            }
            usleep(220_000);
        }

        if (is_array($lastState)) {
            return array_merge(['ok' => ($lastState['status'] ?? '') !== 'error'], $lastState);
        }

        return [
            'ok' => true,
            'accountId' => $accountId,
            'status' => 'starting',
            'qr' => null,
            'error' => null,
        ];
    }

    function ccrm_waai_qr_poll(string $rawAccountId): array {
        $accountId = ccrm_waai_sanitize_account_id($rawAccountId);
        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $statusFile = $accountDir . '/status.json';
        if (!is_file($statusFile)) {
            return [
                'ok' => true,
                'accountId' => $accountId,
                'status' => 'idle',
                'qr' => null,
            ];
        }
        $raw = @file_get_contents($statusFile);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            return [
                'ok' => true,
                'accountId' => $accountId,
                'status' => 'starting',
                'qr' => null,
            ];
        }
        return array_merge(['ok' => ($decoded['status'] ?? '') !== 'error'], $decoded);
    }

    function ccrm_waai_qr_stop(string $rawAccountId): array {
        $accountId = ccrm_waai_sanitize_account_id($rawAccountId);
        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $pidFile = $accountDir . '/worker.pid';
        if (is_file($pidFile)) {
            $pid = (int)trim((string)@file_get_contents($pidFile));
            if ($pid > 0) {
                @exec('kill -TERM ' . $pid . ' 2>/dev/null');
            }
            @unlink($pidFile);
        }
        return ['ok' => true, 'accountId' => $accountId];
    }

    function ccrm_waai_resolve_account_id(array $mailboxRow): string {
        $settings = is_array($mailboxRow['settings'] ?? null)
            ? $mailboxRow['settings']
            : (json_decode((string)($mailboxRow['settings_json'] ?? '{}'), true) ?: []);
        $cType = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        if (ccrm_is_botman_connector($cType)) {
            return 'botman-' . preg_replace('/[^a-zA-Z0-9_-]/', '_', (string)($mailboxRow['id'] ?? 'default'));
        }
        $explicit = trim((string)($settings['waAccountId'] ?? ''));
        $accountsRoot = ccrm_waai_storage_root() . '/accounts';
        if ($explicit !== '') {
            $sanitized = ccrm_waai_sanitize_account_id($explicit);
            if (is_dir($accountsRoot . '/' . $sanitized)) {
                return $sanitized;
            }
        }
        // Fallback: match by phone number or pick the most recently connected account directory
        $addrPhone = preg_replace('/\D/', '', (string)($mailboxRow['address'] ?? ''));
        if (is_dir($accountsRoot)) {
            $dirs = @scandir($accountsRoot) ?: [];
            $bestDir = '';
            $bestMtime = 0;
            foreach ($dirs as $d) {
                if ($d === '.' || $d === '..') continue;
                $full = $accountsRoot . '/' . $d;
                if (!is_dir($full)) continue;
                $stFile = $full . '/status.json';
                if (is_file($stFile)) {
                    $st = json_decode((string)@file_get_contents($stFile), true);
                    $stPhone = preg_replace('/\D/', '', (string)($st['phone'] ?? ''));
                    if ($addrPhone !== '' && $stPhone !== '' && $addrPhone === $stPhone) {
                        return $d;
                    }
                    $mtime = (int)@filemtime($stFile);
                    if ($mtime >= $bestMtime) {
                        $bestMtime = $mtime;
                        $bestDir = $d;
                    }
                }
            }
            if ($bestDir !== '') {
                return $bestDir;
            }
        }
        return $explicit !== '' ? ccrm_waai_sanitize_account_id($explicit) : ('wa-' . ccrm_waai_sanitize_account_id((string)($mailboxRow['id'] ?? 'default')));
    }

    function ccrm_waai_is_worker_alive(string $accountDir): bool {
        $pidFile = $accountDir . '/worker.pid';
        if (!is_file($pidFile)) return false;
        $pid = (int)trim((string)@file_get_contents($pidFile));
        if ($pid <= 0) return false;
        if (is_dir('/proc/' . $pid)) return true;
        if (function_exists('posix_kill')) {
            return @posix_kill($pid, 0);
        }
        $out = [];
        $code = 1;
        @exec('kill -0 ' . $pid . ' 2>/dev/null', $out, $code);
        return $code === 0;
    }

    function ccrm_waai_ensure_worker_running(string $accountId): void {
        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        if (!is_file($accountDir . '/auth/creds.json')) {
            return;
        }
        $storeFile = $accountDir . '/store.json';
        if (!ccrm_waai_is_worker_alive($accountDir)) {
            $workerScript = __DIR__ . '/waai_qr_worker.cjs';
            $logFile = $accountDir . '/worker.log';
            $cmd = sprintf(
                'nohup node %s %s %s resume > %s 2>&1 &',
                escapeshellarg($workerScript),
                escapeshellarg($accountDir),
                escapeshellarg($accountId),
                escapeshellarg($logFile)
            );
            @exec($cmd);

            // If store.json does not exist yet, wait up to 5.5s for initial contacts/groups sync
            if (!is_file($storeFile)) {
                $deadline = microtime(true) + 5.5;
                while (microtime(true) < $deadline) {
                    if (is_file($storeFile)) {
                        $raw = @file_get_contents($storeFile);
                        $dec = is_string($raw) ? json_decode($raw, true) : null;
                        if (is_array($dec) && !empty($dec['chats'])) {
                            break;
                        }
                    }
                    usleep(250_000);
                }
            }
        }
    }

    function ccrm_waai_get_takeover_map(string $accountId): array {
        $safeId = ccrm_waai_sanitize_account_id($accountId);
        $file = ccrm_waai_storage_root() . '/accounts/' . $safeId . '/takeover.json';
        if (!is_file($file)) {
            return [];
        }
        $decoded = json_decode((string)@file_get_contents($file), true);
        if (!is_array($decoded)) {
            return [];
        }
        // Session pauses ("Turned off for session") expire after 8 hours so Visual Triggers aren't blocked forever across days
        $now = time();
        $dirty = false;
        foreach ($decoded as $cid => $entry) {
            if (($entry['mode'] ?? '') === 'paused' && !empty($entry['updatedAt'])) {
                $ts = strtotime((string)$entry['updatedAt']);
                if ($ts > 0 && ($now - $ts) > 28800) {
                    unset($decoded[$cid]);
                    $dirty = true;
                }
            }
        }
        if ($dirty) {
            ccrm_waai_save_takeover_map($accountId, $decoded);
        }
        return $decoded;
    }

    function ccrm_waai_save_takeover_map(string $accountId, array $map): void {
        $safeId = ccrm_waai_sanitize_account_id($accountId);
        $dir = ccrm_waai_storage_root() . '/accounts/' . $safeId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        @file_put_contents($dir . '/takeover.json', json_encode($map, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    }

    function ccrm_waai_set_chat_agent_takeover(
        PDO $pdo,
        array $mailboxRow,
        string $chatId,
        string $chatName,
        string $mode,
        string $agentConnectorId = '',
        ?string $subagentId = null,
        string $author = ''
    ): array {
        $accountId = ccrm_waai_resolve_account_id($mailboxRow);
        $map = ccrm_waai_get_takeover_map($accountId);
        if ($mode === 'auto' || $mode === 'default') {
            unset($map[$chatId]);
            ccrm_waai_save_takeover_map($accountId, $map);
            $chatsState = ccrm_waai_get_chats($mailboxRow);
            $chatsState['takeover'] = null;
            return $chatsState;
        }
        $normalizedMode = ($mode === 'paused' || $mode === 'off') ? 'paused' : 'active';
        $prev = is_array($map[$chatId] ?? null) ? $map[$chatId] : [];

        // Resolve target AI Agent connector
        $rows = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `name`")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $secretKeys = function_exists('ccrm_email_secret_keys')
            ? ccrm_email_secret_keys()
            : ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret', 'botmanToken', 'botmanAppSecret', 'botmanSigningSecret', 'botmanVerifyToken'];
        $aiConnectors = [];
        foreach ($rows as $r) {
            $raw = json_decode((string)($r['settings_json'] ?? '{}'), true);
            $s = is_array($raw) ? ccrm_decrypt_config_secrets($raw, $secretKeys) : [];
            $cType = strtolower((string)($s['connectorType'] ?? ''));
            if (ccrm_marveen_is_agent_connector_type($cType)) {
                $r['settings'] = $s;
                $aiConnectors[(string)$r['id']] = $r;
            }
        }

        $resolvedAgentRow = null;
        if ($agentConnectorId !== '' && isset($aiConnectors[$agentConnectorId])) {
            $resolvedAgentRow = $aiConnectors[$agentConnectorId];
        } else {
            // Check if any AI Agent has a trigger targeting this messaging connector
            foreach ($aiConnectors as $aiId => $aiRow) {
                foreach (ccrm_marveen_list_triggers($pdo, $aiRow) as $t) {
                    if (($t['sourceConnectorId'] ?? '') === (string)($mailboxRow['id'] ?? '')) {
                        $resolvedAgentRow = $aiRow;
                        if ($subagentId === null && !empty($t['targetSubagentId'])) {
                            $subagentId = (string)$t['targetSubagentId'];
                        }
                        break 2;
                    }
                }
            }
            if (!$resolvedAgentRow && !empty($aiConnectors)) {
                $resolvedAgentRow = reset($aiConnectors);
            }
        }

        $resolvedAgentId = $resolvedAgentRow ? (string)$resolvedAgentRow['id'] : $agentConnectorId;

        $map[$chatId] = [
            'chatId' => $chatId,
            'chatName' => $chatName !== '' ? $chatName : ($prev['chatName'] ?? $chatId),
            'mode' => $normalizedMode,
            'agentConnectorId' => $resolvedAgentId,
            'subagentId' => $subagentId,
            'watermarkTsMs' => (int)($prev['watermarkTsMs'] ?? 0),
            'processedIds' => is_array($prev['processedIds'] ?? null) ? $prev['processedIds'] : [],
            'updatedAt' => gmdate('c'),
            'updatedBy' => $author,
        ];
        ccrm_waai_save_takeover_map($accountId, $map);

        if ($normalizedMode === 'paused') {
            // Cancel any pending scheduled follow-ups targeting this chat session
            foreach ($aiConnectors as $aiId => $aiRow) {
                $fups = ccrm_marveen_list_followups($pdo, $aiRow);
                foreach ($fups as $f) {
                    if (($f['status'] ?? '') === 'pending' && ($f['targetChat'] ?? '') === $chatId) {
                        ccrm_marveen_cancel_followup($pdo, (string)$aiId, (string)$f['id']);
                    }
                }
            }
        }

        $immediateExec = null;
        if ($normalizedMode === 'active' && $resolvedAgentRow) {
            $storeFile = ccrm_waai_storage_root() . '/accounts/' . $accountId . '/store.json';
            $store = is_file($storeFile) ? (json_decode((string)@file_get_contents($storeFile), true) ?: []) : [];
            $thread = is_array($store['messages'][$chatId] ?? null) ? $store['messages'][$chatId] : [];
            if (!empty($thread)) {
                $lastMsg = $thread[count($thread) - 1];
                if (empty($lastMsg['fromMe'])) {
                    $mId = (string)($lastMsg['id'] ?? '');
                    $mTs = (int)($lastMsg['tsMs'] ?? 0);
                    $proc = $map[$chatId]['processedIds'];
                    if ($mId !== '') {
                        $proc[] = $mId;
                        $proc[] = 'wa:' . $mId;
                    }
                    $map[$chatId]['processedIds'] = array_values(array_slice(array_unique($proc), -200));
                    $map[$chatId]['watermarkTsMs'] = $mTs;
                    ccrm_waai_save_takeover_map($accountId, $map);

                    $ctxWindow = ccrm_marveen_build_conversation_context($thread, 50, 5, 16000);
                    $lastSender = (string)($lastMsg['senderName'] ?? ($chatName ?: $chatId));
                    $syntheticTrig = [
                        'id' => 'takeover-' . md5($chatId),
                        'name' => 'Session Agent Takeover (' . ($chatName ?: $chatId) . ')',
                        'sourceType' => 'whatsapp',
                        'sourceConnectorId' => (string)($mailboxRow['id'] ?? ''),
                        'targetAgentId' => $subagentId ?: 'main',
                        'instructions' => 'You have been asked to take over this conversation session. Read the conversation history and reply helpfully to the latest message.',
                        'autoReply' => true,
                    ];
                    $eventCtx = [
                        'sourceLabel' => ($mailboxRow['name'] ?? 'Messaging') . ' · ' . ($chatName ?: $chatId),
                        'summary' => "Agent Takeover ({$chatName}) from {$lastSender}",
                        'sender' => $lastSender,
                        'chatId' => $chatId,
                        'chatName' => $chatName ?: $chatId,
                        'latestMessageText' => $lastSender . ': ' . ($lastMsg['text'] ?? ''),
                        'conversationTranscript' => $ctxWindow['transcript'],
                    ];
                    $immediateExec = ccrm_marveen_execute_single_trigger_event($pdo, $resolvedAgentRow, $syntheticTrig, $eventCtx);
                }
            }
        }

        $chatsState = ccrm_waai_get_chats($mailboxRow);
        $chatsState['takeover'] = $map[$chatId];
        $chatsState['immediateExec'] = $immediateExec;
        return $chatsState;
    }

    function ccrm_waai_get_chats(array $mailboxRow): array {
        $settings = is_array($mailboxRow['settings'] ?? null)
            ? $mailboxRow['settings']
            : (json_decode((string)($mailboxRow['settings_json'] ?? '{}'), true) ?: []);
        $cType = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        $accountId = ccrm_waai_resolve_account_id($mailboxRow);
        $takeoverMap = ccrm_waai_get_takeover_map($accountId);
        if (ccrm_is_botman_connector($cType)) {
            $bm = ccrm_botman_get_chats($mailboxRow, true);
            $bm['agentTakeover'] = !empty($takeoverMap) ? $takeoverMap : new \stdClass();
            return $bm;
        }
        ccrm_waai_ensure_worker_running($accountId);

        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $statusFile = $accountDir . '/status.json';
        $storeFile = $accountDir . '/store.json';

        $status = is_file($statusFile) ? (json_decode((string)@file_get_contents($statusFile), true) ?: []) : [];
        $store = is_file($storeFile) ? (json_decode((string)@file_get_contents($storeFile), true) ?: []) : [];

        return [
            'ok' => true,
            'accountId' => $accountId,
            'status' => (string)($status['status'] ?? 'connected'),
            'qr' => $status['qr'] ?? null,
            'phone' => $status['phone'] ?? null,
            'displayName' => $status['displayName'] ?? null,
            'historySyncChunks' => (int)($status['historySyncChunks'] ?? 0),
            'lastHistorySyncAt' => $status['lastHistorySyncAt'] ?? null,
            'chats' => is_array($store['chats'] ?? null) ? $store['chats'] : [],
            'messages' => is_array($store['messages'] ?? null) ? $store['messages'] : new \stdClass(),
            'agentTakeover' => !empty($takeoverMap) ? $takeoverMap : new \stdClass(),
            'updatedAt' => $store['updatedAt'] ?? ($status['updatedAt'] ?? null),
        ];
    }

    function ccrm_waai_send_message(array $mailboxRow, string $chatId, string $text, string $author = ''): array {
        $settings = is_array($mailboxRow['settings'] ?? null)
            ? $mailboxRow['settings']
            : (json_decode((string)($mailboxRow['settings_json'] ?? '{}'), true) ?: []);
        $cType = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        if (ccrm_is_botman_connector($cType)) {
            return ccrm_botman_send_message($mailboxRow, $chatId, $text, $author);
        }
        $accountId = ccrm_waai_resolve_account_id($mailboxRow);
        ccrm_waai_ensure_worker_running($accountId);

        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $outboxDir = $accountDir . '/outbox';
        if (!is_dir($outboxDir)) {
            @mkdir($outboxDir, 0775, true);
        }

        $cmdId = 'send-' . bin2hex(random_bytes(5));
        $cmdFile = $outboxDir . '/' . $cmdId . '.json';
        $resFile = $outboxDir . '/' . $cmdId . '.result.json';

        @file_put_contents($cmdFile, json_encode([
            'id' => $cmdId,
            'action' => 'send',
            'chatId' => $chatId,
            'text' => $text,
            'author' => $author,
        ], JSON_UNESCAPED_UNICODE));

        $deadline = microtime(true) + 4.5;
        $sendResult = null;
        while (microtime(true) < $deadline) {
            if (is_file($resFile)) {
                $sendResult = json_decode((string)@file_get_contents($resFile), true);
                @unlink($resFile);
                break;
            }
            usleep(180_000);
        }

        $state = ccrm_waai_get_chats($mailboxRow);
        if (is_array($sendResult) && empty($sendResult['ok'])) {
            $state['ok'] = false;
            $state['error'] = $sendResult['error'] ?? 'Failed to send WhatsApp message.';
        }
        return $state;
    }

    function ccrm_waai_resync_chats(array $mailboxRow, string $chatId = ''): array {
        $settings = is_array($mailboxRow['settings'] ?? null)
            ? $mailboxRow['settings']
            : (json_decode((string)($mailboxRow['settings_json'] ?? '{}'), true) ?: []);
        $cType = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        if (ccrm_is_botman_connector($cType)) {
            return ccrm_botman_resync_chats($mailboxRow, $chatId);
        }
        $accountId = ccrm_waai_resolve_account_id($mailboxRow);
        ccrm_waai_ensure_worker_running($accountId);

        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $outboxDir = $accountDir . '/outbox';
        if (!is_dir($outboxDir)) {
            @mkdir($outboxDir, 0775, true);
        }
        $cmdId = 'resync-' . bin2hex(random_bytes(4));
        @file_put_contents($outboxDir . '/' . $cmdId . '.json', json_encode([
            'id' => $cmdId,
            'action' => 'resync',
            'chatId' => $chatId,
        ]));
        usleep(3_200_000);
        return ccrm_waai_get_chats($mailboxRow);
    }
}
