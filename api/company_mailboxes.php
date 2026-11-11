<?php
/**
 * Unified External Connectors & Company Mailboxes (`#settings/email/mailboxes`).
 *
 * Supports all 7 external connector types in `company_mailboxes`:
 *   - Email: `gmail`, `smtp`, `exchange` (IMAP/SMTP + M365 Graph client-credentials)
 *   - Messaging: `whatsapp` (WAAI QR-code pairing)
 *   - Subscription AI Agents (Marveen runtime + CCRM MCP): `claude`, `antigravity`, `chatgpt`
 *
 * Actions:
 *   GET  ?action=list               Admin: all connectors (secrets masked), filing state, and environment capabilities
 *   GET  ?action=my                 Authenticated user: active connectors assigned to the current user (`userIds[]`)
 *   POST ?action=save               Admin: create or update a connector (masked secrets keep stored values)
 *   POST ?action=delete             Admin: {id}; mail already filed stays on its timelines
 *   POST ?action=test               Admin: {id?, ...settings}: test IMAP/SMTP, M365 Graph, WAAI, or Marveen subscription probe
 *   POST ?action=run                Admin: {id}: file that email mailbox now
 *   POST ?action=agent_login_start  Admin: {id?, connectorType, agentEndpoint?}: start PTY OAuth login for subscription agent
 *   POST ?action=agent_login_code   Admin: {id?, connectorType, code, agentEndpoint?}: submit OAuth code / token to PTY
 *   POST ?action=agent_install_cli  Admin: {connectorType}: on-demand install of claude / codex / gemini CLI
 *   POST ?action=agent_run          Assigned user / Admin: {id, prompt, systemPrompt?}: run prompt via Marveen + CCRM MCP
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/mail_filing.php';
require_once __DIR__ . '/botman/botman_lib.php';
require_once __DIR__ . '/marveen/marveen_lib.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];

// `my` and `agent_*` workspace actions are accessible to any signed-in CRM user (enforced per-connector via `userIds[]`);
// all other management actions require an administrator.
$sessionUser = in_array($action, [
    'my',
    'agent_run',
    'agent_state',
    'agent_memory_save',
    'agent_artifact_save',
    'agent_artifact_delete',
    'agent_subagent_save',
    'agent_subagent_delete',
    'agent_task_save',
    'agent_task_delete',
    'agent_task_run',
    'agent_autonomous_save',
    'agent_trigger_save',
    'agent_trigger_delete',
    'agent_trigger_test',
    'agent_heartbeat',
    'agent_chat_clear',
    'wa_chats',
    'wa_send',
    'wa_resync',
    'wa_agent_takeover',
], true)
    ? ccrm_require_auth()
    : ccrm_require_admin();
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed.']);
    exit;
}
ccrm_migrate_mail_filing($pdo);

const CCRM_CONNECTOR_TYPES = [
    'gmail', 'smtp', 'exchange', 'whatsapp',
    'telegram', 'messenger', 'slack', 'discord', 'teams', 'viber', 'twilio', 'webchat',
    'claude', 'antigravity', 'chatgpt',
];
const CCRM_EMAIL_CONNECTOR_TYPES = ['gmail', 'smtp', 'exchange'];
const CCRM_AGENT_CONNECTOR_TYPES = ['claude', 'antigravity', 'chatgpt'];

function ccrm_infer_connector_type(array $s, string $address = ''): string {
    $explicit = strtolower(trim((string)($s['connectorType'] ?? '')));
    if (in_array($explicit, CCRM_CONNECTOR_TYPES, true)) {
        return $explicit;
    }
    if (($s['provider'] ?? '') === 'exchange') {
        return 'exchange';
    }
    $imapHost = strtolower(trim((string)($s['imapHost'] ?? '')));
    if (str_contains($imapHost, 'gmail.com') || str_contains($imapHost, 'googlemail.com')) {
        return 'gmail';
    }
    foreach (CCRM_CONNECTOR_TYPES as $t) {
        if (str_starts_with($address, $t . ':')) {
            return $t;
        }
    }
    return 'smtp';
}

function ccrm_normalize_user_ids($rawUserIds, ?string $fallbackOwner = null): array {
    $out = [];
    if (is_array($rawUserIds)) {
        foreach ($rawUserIds as $uid) {
            $u = trim((string)$uid);
            if ($u !== '' && !in_array($u, $out, true)) {
                $out[] = $u;
            }
        }
    }
    $fb = trim((string)$fallbackOwner);
    if ($fb !== '' && !in_array($fb, $out, true)) {
        array_unshift($out, $fb);
    }
    return $out;
}

/** Clean connector settings payload while preserving backward compatibility for email connectors. */
function ccrm_company_mailbox_clean(array $in, string $address = '', ?string $fallbackOwner = null): array {
    $str = fn($k, $max = 255) => mb_substr(trim((string)($in[$k] ?? '')), 0, $max, 'UTF-8');
    $secure = fn($k) => in_array(($in[$k] ?? 'ssl'), ['ssl', 'tls', 'none'], true) ? $in[$k] : 'ssl';
    $connectorType = ccrm_infer_connector_type($in, $address);
    $provider = ($connectorType === 'exchange' || ($in['provider'] ?? 'smtp') === 'exchange') ? 'exchange' : 'smtp';

    $userIds = ccrm_normalize_user_ids($in['userIds'] ?? null, $fallbackOwner);

    $s = [
        'connectorType' => $connectorType,
        'provider' => $provider,
        'userIds' => $userIds,
        'imapHost' => $str('imapHost'),
        'imapPort' => $str('imapPort', 6),
        'imapSecure' => $secure('imapSecure'),
        'imapUsername' => $str('imapUsername'),
        'imapPassword' => (string)($in['imapPassword'] ?? ''),
        'smtpHost' => $str('smtpHost'),
        'smtpPort' => $str('smtpPort', 6),
        'smtpSecure' => $secure('smtpSecure'),
        'smtpUsername' => $str('smtpUsername'),
        'smtpPassword' => (string)($in['smtpPassword'] ?? ''),
        'exchangeUrl' => $str('exchangeUrl'),
        'exchangeMode' => in_array(($in['exchangeMode'] ?? 'imap'), ['imap', 'graph'], true) ? $in['exchangeMode'] : 'imap',
        'graphTenantId' => $str('graphTenantId', 120),
        'graphClientId' => $str('graphClientId', 120),
        'graphClientSecret' => (string)($in['graphClientSecret'] ?? ''),
        'imapAllowSelfSigned' => !empty($in['imapAllowSelfSigned']),
        // WhatsApp (WAAI) fields
        'waAccountId' => $str('waAccountId', 120),
        'waServiceUrl' => $str('waServiceUrl', 500),
        'waStatus' => in_array(($in['waStatus'] ?? ''), ['connected', 'qr_required', 'disconnected'], true)
            ? $in['waStatus']
            : ($str('waAccountId', 120) !== '' ? 'connected' : 'qr_required'),
        // Subscription AI Agent (Marveen) fields
        'subscriptionToken' => (string)($in['subscriptionToken'] ?? ''),
        'subscriptionPlan' => $str('subscriptionPlan', 80),
        'agentModel' => $str('agentModel', 120),
        'agentEndpoint' => $str('agentEndpoint', 500),
        // BotMan Multi-Channel Driver fields
        'botmanToken' => (string)($in['botmanToken'] ?? ''),
        'botmanAppId' => $str('botmanAppId', 160),
        'botmanAppSecret' => (string)($in['botmanAppSecret'] ?? ''),
        'botmanSigningSecret' => (string)($in['botmanSigningSecret'] ?? ''),
        'botmanVerifyToken' => (string)($in['botmanVerifyToken'] ?? ''),
        'botmanChannelId' => $str('botmanChannelId', 500),
        'botmanFromNumber' => $str('botmanFromNumber', 80),
        'botmanSenderName' => $str('botmanSenderName', 120),
        'botmanServiceUrl' => $str('botmanServiceUrl', 500),
        'botmanWebhookRegistered' => !empty($in['botmanWebhookRegistered']),
    ];

    if ($connectorType === 'gmail') {
        if ($s['imapHost'] === '') $s['imapHost'] = 'imap.gmail.com';
        if ($s['imapPort'] === '') $s['imapPort'] = '993';
        $s['imapSecure'] = 'ssl';
        if ($s['smtpHost'] === '') $s['smtpHost'] = 'smtp.gmail.com';
        if ($s['smtpPort'] === '') $s['smtpPort'] = '465';
        $s['smtpSecure'] = 'ssl';
        if ($s['imapUsername'] === '' && $address !== '' && str_contains($address, '@')) {
            $s['imapUsername'] = $address;
        }
    }

    if ($s['smtpUsername'] === '') {
        $s['smtpUsername'] = $s['imapUsername'];
    }
    if ($s['smtpPassword'] === '' && $s['imapPassword'] !== '' && $s['imapPassword'] !== CCRM_SECRET_MASK) {
        $s['smtpPassword'] = $s['imapPassword'];
    }

    foreach (ccrm_email_secret_keys() as $k) {
        if (($s[$k] ?? null) === '') {
            unset($s[$k]);
        }
    }
    return $s;
}

/** Refuses a host / port the server must not connect to for IMAP/SMTP email connectors. */
function ccrm_company_mailbox_validate(array $s): void {
    $connectorType = $s['connectorType'] ?? 'smtp';
    if (!in_array($connectorType, CCRM_EMAIL_CONNECTOR_TYPES, true)) {
        return;
    }
    if ($connectorType === 'exchange' && ($s['exchangeMode'] ?? 'imap') === 'graph') {
        return;
    }
    $isExchange = $s['provider'] === 'exchange';
    $imapPort = (int)$s['imapPort'] > 0 ? (int)$s['imapPort'] : ($isExchange ? 993 : 0);
    $smtpPort = (int)$s['smtpPort'] > 0 ? (int)$s['smtpPort'] : ($isExchange ? 587 : 0);
    ccrm_validate_external_mail_target(ccrm_resolve_mail_host($s, 'imap'), $imapPort);
    if ($s['smtpHost'] !== '' || $isExchange) {
        ccrm_validate_external_mail_target(ccrm_resolve_mail_host($s, 'smtp'), $smtpPort);
    }
}

function ccrm_company_mailbox_public(array $r, array $state): array {
    $settings = ccrm_company_mailbox_settings($r);
    $connectorType = ccrm_infer_connector_type($settings, (string)($r['address'] ?? ''));
    $settings['connectorType'] = $connectorType;
    $userIds = ccrm_normalize_user_ids($settings['userIds'] ?? null, $r['owner_user_id'] ?? null);
    $settings['userIds'] = $userIds;
    $masked = ccrm_mask_secrets($settings, ccrm_email_secret_keys());
    $out = [
        'id' => $r['id'],
        'name' => $r['name'],
        'address' => $r['address'],
        'connectorType' => $connectorType,
        'userIds' => $userIds,
        'isActive' => (bool)$r['is_active'],
        'ownerUserId' => $r['owner_user_id'],
        'backfillSince' => $r['backfill_since'],
        'settings' => $masked,
        'lastRunAt' => $r['last_run_at'],
        'lastSuccessAt' => $r['last_success_at'],
        'lastError' => $r['last_error'],
        'folders' => $state,
    ];
    if (in_array($connectorType, CCRM_AGENT_CONNECTOR_TYPES, true) && isset($GLOBALS['pdo']) && $GLOBALS['pdo'] instanceof PDO) {
        $rWithSettings = $r;
        $rWithSettings['settings'] = $settings;
        $out['subagents'] = ccrm_marveen_list_subagents($GLOBALS['pdo'], $rWithSettings);
        $out['triggers'] = ccrm_marveen_list_triggers($GLOBALS['pdo'], $rWithSettings);
    }
    return $out;
}

function ccrm_sync_whatsapp_users_to_integration(PDO $pdo): void {
    try {
        $rows = $pdo->query("SELECT `owner_user_id`, `settings_json` FROM `company_mailboxes` WHERE `is_active` = 1")->fetchAll(PDO::FETCH_ASSOC);
        $waUsers = [];
        $hasWaConnector = false;
        foreach ($rows as $r) {
            $s = ccrm_company_mailbox_settings($r);
            if (ccrm_infer_connector_type($s) !== 'whatsapp') {
                continue;
            }
            $hasWaConnector = true;
            foreach (ccrm_normalize_user_ids($s['userIds'] ?? null, $r['owner_user_id'] ?? null) as $u) {
                if (!in_array($u, $waUsers, true)) {
                    $waUsers[] = $u;
                }
            }
        }
        if ($hasWaConnector && !empty($waUsers)) {
            $pdo->prepare("UPDATE `integration_clients` SET `owner_user_ids` = ? WHERE `name` = 'waai'")
                ->execute([json_encode(array_values($waUsers))]);
        }
    } catch (\Throwable $e) {
        // Non-fatal if integration_clients table is not yet initialized
    }
}

$input = $method === 'POST' ? json_decode((string)file_get_contents('php://input'), true) : [];
if (!is_array($input)) $input = [];

try {
    if ($method === 'GET' && $action === 'my') {
        $uid = (string)($sessionUser['id'] ?? '');
        $isAdmin = strtolower((string)($sessionUser['role'] ?? '')) === 'admin';
        $connectors = [];

        // Include the user's personal mailbox if configured on their profile
        $uStmt = $pdo->prepare("SELECT `name`, `email`, `metadata_json` FROM `users` WHERE `id` = ? LIMIT 1");
        $uStmt->execute([$uid]);
        $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
        if ($uRow && !empty($uRow['metadata_json'])) {
            $meta = json_decode((string)$uRow['metadata_json'], true);
            $es = is_array($meta['emailSettings'] ?? null) ? $meta['emailSettings'] : [];
            if (!empty($es['imapHost']) && !empty($es['imapUsername'])) {
                $pType = str_contains(strtolower((string)$es['imapHost']), 'gmail')
                    ? 'gmail'
                    : (($es['provider'] ?? '') === 'exchange' ? 'exchange' : 'smtp');
                $connectors[] = [
                    'id' => 'personal',
                    'name' => ((string)$uRow['name']) . ' (Personal)',
                    'address' => (string)($es['imapUsername'] ?: $uRow['email']),
                    'connectorType' => $pType,
                    'userIds' => [$uid],
                    'isActive' => true,
                    'isPersonal' => true,
                    'ownerUserId' => $uid,
                    'backfillSince' => null,
                    'settings' => [
                        'connectorType' => $pType,
                        'provider' => $pType === 'exchange' ? 'exchange' : 'smtp',
                        'imapHost' => (string)($es['imapHost'] ?? ''),
                        'imapPort' => (string)($es['imapPort'] ?? '993'),
                        'smtpHost' => (string)($es['smtpHost'] ?? ''),
                        'smtpPort' => (string)($es['smtpPort'] ?? '465'),
                    ],
                    'lastRunAt' => null,
                    'lastSuccessAt' => null,
                    'lastError' => null,
                    'folders' => [],
                ];
            }
        }

        foreach ($pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `name`")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $pub = ccrm_company_mailbox_public($r, []);
            $assigned = $pub['userIds'];
            // If specific users are assigned to this connector, only those users see it;
            // if no users are explicitly assigned yet, admins see it by default.
            $allowed = !empty($assigned) ? in_array($uid, $assigned, true) : $isAdmin;
            if (!$allowed) {
                continue;
            }
            foreach (ccrm_email_secret_keys() as $sk) {
                unset($pub['settings'][$sk]);
            }
            $connectors[] = $pub;
        }
        echo json_encode(['success' => true, 'connectors' => $connectors, 'mailboxes' => $connectors]);
        exit;
    }

    if ($method === 'GET' && $action === 'list') {
        $state = [];
        foreach ($pdo->query("SELECT * FROM `mail_sync_state`")->fetchAll(PDO::FETCH_ASSOC) as $st) {
            $state[$st['mailbox_key']][] = [
                'folder' => $st['folder'], 'lastUid' => (int)$st['last_uid'], 'backfillDone' => (bool)$st['backfill_done'],
                'filedCount' => (int)$st['filed_count'], 'lastRunAt' => $st['last_run_at'], 'lastError' => $st['last_error'],
            ];
        }
        $boxes = [];
        foreach ($pdo->query("SELECT * FROM `company_mailboxes` ORDER BY `name`")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $boxes[] = ccrm_company_mailbox_public($r, $state['c:' . $r['id']] ?? []);
        }
        $users = [];
        foreach ($pdo->query("SELECT `id`, `name`, `email` FROM `users` ORDER BY `name`")->fetchAll(PDO::FETCH_ASSOC) as $u) {
            if (isset($state['u:' . $u['id']])) {
                $users[] = ['id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'folders' => $state['u:' . $u['id']]];
            }
        }
        echo json_encode([
            'success' => true,
            'mailboxes' => $boxes,
            'userMailboxes' => $users,
            'imapAvailable' => function_exists('imap_open'),
            'environment' => ccrm_marveen_detect_env(),
        ]);
        exit;
    }

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    $stored = null;
    $id = trim((string)($input['id'] ?? ''));
    if ($id !== '') {
        $q = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `id` = ?");
        $q->execute([$id]);
        $stored = $q->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if ($action === 'agent_install_cli') {
        $provider = strtolower(trim((string)($input['connectorType'] ?? 'claude')));
        $res = ccrm_marveen_install_cli($provider);
        echo json_encode(array_merge(['success' => !empty($res['ok']), 'environment' => ccrm_marveen_detect_env()], $res));
        exit;
    }

    if ($action === 'wa_qr_start') {
        $rawAccId = trim((string)($input['accountId'] ?? ($id ?: ('wa-' . substr(bin2hex(random_bytes(4)), 0, 8)))));
        $reset = !array_key_exists('reset', $input) || !empty($input['reset']);
        $res = ccrm_waai_qr_start($rawAccId, $reset);
        echo json_encode(array_merge(['success' => !empty($res['ok'])], $res));
        exit;
    }

    if ($action === 'wa_qr_poll') {
        $rawAccId = trim((string)($input['accountId'] ?? ($id ?: '')));
        if ($rawAccId === '') {
            echo json_encode(['success' => false, 'error' => 'accountId is required.']);
            exit;
        }
        $res = ccrm_waai_qr_poll($rawAccId);
        if (($res['status'] ?? '') === 'connected' && $stored) {
            $oldSettings = ccrm_company_mailbox_settings($stored);
            $oldSettings['waAccountId'] = (string)($res['accountId'] ?? $rawAccId);
            $oldSettings['waStatus'] = 'connected';
            $blob = json_encode(ccrm_encrypt_config_secrets($oldSettings, ccrm_email_secret_keys()), JSON_UNESCAPED_UNICODE);
            $newAddr = (string)$stored['address'];
            if ((!empty($res['phone'])) && ($newAddr === '' || str_starts_with($newAddr, 'whatsapp:'))) {
                $newAddr = (string)$res['phone'];
            }
            $pdo->prepare("UPDATE `company_mailboxes` SET `address` = ?, `settings_json` = ?, `last_success_at` = NOW(), `last_error` = NULL WHERE `id` = ?")
                ->execute([$newAddr, $blob, $id]);
        }
        echo json_encode(array_merge(['success' => !empty($res['ok'])], $res));
        exit;
    }

    if ($action === 'wa_qr_stop') {
        $rawAccId = trim((string)($input['accountId'] ?? ($id ?: '')));
        $res = $rawAccId !== '' ? ccrm_waai_qr_stop($rawAccId) : ['ok' => true];
        echo json_encode(array_merge(['success' => true], $res));
        exit;
    }

    if (in_array($action, ['wa_chats', 'wa_send', 'wa_resync', 'wa_agent_takeover'], true)) {
        if (!$stored) throw new \InvalidArgumentException('WhatsApp connector not found.');
        $settings = ccrm_company_mailbox_settings($stored);
        $userIds = ccrm_normalize_user_ids($settings['userIds'] ?? null, $stored['owner_user_id'] ?? null);
        $callerId = (string)($sessionUser['id'] ?? '');
        $isAdmin = strtolower((string)($sessionUser['role'] ?? '')) === 'admin';
        if (!$isAdmin && !empty($userIds) && !in_array($callerId, $userIds, true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'You are not assigned to this WhatsApp connector.']);
            exit;
        }
        $stored['settings'] = $settings;

        if ($action === 'wa_chats') {
            $res = ccrm_waai_get_chats($stored);
            $pollStampFile = ccrm_marveen_storage_root() . '/.last_trigger_poll';
            $lastPollTs = is_file($pollStampFile) ? (int)@filemtime($pollStampFile) : 0;
            $runGlobalTick = (time() - $lastPollTs) >= 15;
            if ($runGlobalTick) {
                @file_put_contents($pollStampFile, (string)time());
            }
            try {
                // Always inspect this connector's freshly synced store.json ($0 local read unless a new incoming message arrived)
                $trigRes = ccrm_marveen_process_event_triggers($pdo, $runGlobalTick ? null : $id);
                if (!empty($trigRes['fired'])) {
                    $res = ccrm_waai_get_chats($stored);
                }
            } catch (\Throwable $e) {
                // Non-fatal background trigger check
            }
            echo json_encode(array_merge(['success' => true], $res));
            exit;
        }

        if ($action === 'wa_agent_takeover') {
            $chatId = trim((string)($input['chatId'] ?? ''));
            $chatName = trim((string)($input['chatName'] ?? $chatId));
            $mode = trim((string)($input['mode'] ?? 'active'));
            $agentConnectorId = trim((string)($input['agentConnectorId'] ?? ''));
            $subagentId = trim((string)($input['subagentId'] ?? '')) ?: null;
            if ($chatId === '') {
                throw new \InvalidArgumentException('chatId is required.');
            }
            $author = (string)($sessionUser['name'] ?? 'User');
            $res = ccrm_waai_set_chat_agent_takeover(
                $pdo,
                $stored,
                $chatId,
                $chatName,
                $mode,
                $agentConnectorId,
                $subagentId,
                $author
            );
            echo json_encode(array_merge(['success' => true], $res));
            exit;
        }

        if ($action === 'wa_resync') {
            $resyncChatId = trim((string)($input['chatId'] ?? ''));
            $res = ccrm_waai_resync_chats($stored, $resyncChatId);
            try {
                $trigRes = ccrm_marveen_process_event_triggers($pdo, $id);
                if (!empty($trigRes['fired'])) {
                    $res = ccrm_waai_get_chats($stored);
                }
            } catch (\Throwable $e) {}
            echo json_encode(array_merge(['success' => true], $res));
            exit;
        }

        // $action === 'wa_send'
        $chatId = trim((string)($input['chatId'] ?? ''));
        $text = trim((string)($input['text'] ?? ''));
        if ($chatId === '' || $text === '') {
            throw new \InvalidArgumentException('chatId and text are required.');
        }
        $author = (string)($sessionUser['name'] ?? 'User');
        $res = ccrm_waai_send_message($stored, $chatId, $text, $author);
        echo json_encode(array_merge(['success' => !empty($res['ok'])], $res));
        exit;
    }

    if ($action === 'agent_login_start') {
        $provider = strtolower(trim((string)($input['connectorType'] ?? 'claude')));
        $endpoint = trim((string)($input['agentEndpoint'] ?? ''));
        $res = ccrm_marveen_login_start($id ?: ('draft-' . $provider), $provider, $endpoint);
        echo json_encode(array_merge(['success' => !empty($res['ok'])], $res));
        exit;
    }

    if ($action === 'agent_login_code') {
        $provider = strtolower(trim((string)($input['connectorType'] ?? 'claude')));
        $code = trim((string)($input['code'] ?? ''));
        $endpoint = trim((string)($input['agentEndpoint'] ?? ''));
        $res = ccrm_marveen_login_submit_code($id ?: ('draft-' . $provider), $provider, $code, $endpoint);
        if (!empty($res['ok']) && !empty($res['token'])) {
            $callerUid = (string)($sessionUser['id'] ?? '');
            $mcpKey = $callerUid !== '' ? ccrm_marveen_ensure_user_mcp_key($pdo, $callerUid) : 'provisioned';
            ccrm_marveen_ensure_worker_dir(
                $id ?: ('draft-' . $provider),
                $provider,
                (string)$res['token'],
                ccrm_marveen_internal_mcp_url(),
                $mcpKey
            );
            if ($stored) {
                $oldSettings = ccrm_company_mailbox_settings($stored);
                $oldSettings['subscriptionToken'] = (string)$res['token'];
                $blob = json_encode(ccrm_encrypt_config_secrets($oldSettings, ccrm_email_secret_keys()), JSON_UNESCAPED_UNICODE);
                $pdo->prepare("UPDATE `company_mailboxes` SET `settings_json` = ?, `last_success_at` = NOW(), `last_error` = NULL WHERE `id` = ?")
                    ->execute([$blob, $id]);
            }
        }
        // Never leak the raw token back in plaintext if already persisted; return masked indicator + token for unsaved drafts
        $out = [
            'success' => !empty($res['ok']),
            'ok' => !empty($res['ok']),
            'verified' => !empty($res['verified']),
            'token' => $stored ? CCRM_SECRET_MASK : ($res['token'] ?? ''),
            'error' => $res['error'] ?? null,
        ];
        echo json_encode($out);
        exit;
    }

    if (in_array($action, [
        'agent_state',
        'agent_memory_save',
        'agent_artifact_save',
        'agent_artifact_delete',
        'agent_subagent_save',
        'agent_subagent_delete',
        'agent_task_save',
        'agent_task_delete',
        'agent_task_run',
        'agent_autonomous_save',
        'agent_trigger_save',
        'agent_trigger_delete',
        'agent_trigger_test',
        'agent_followup_save',
        'agent_followup_cancel',
        'agent_heartbeat',
        'agent_chat_clear',
        'agent_run',
    ], true)) {
        if ($action === 'agent_heartbeat' && $id === '') {
            $hb = ccrm_marveen_run_autonomous_ticks($pdo, null, null);
            echo json_encode(array_merge(['success' => true], $hb));
            exit;
        }
        if (!$stored) throw new \InvalidArgumentException('Connector not found.');
        $settings = ccrm_company_mailbox_settings($stored);
        $userIds = ccrm_normalize_user_ids($settings['userIds'] ?? null, $stored['owner_user_id'] ?? null);
        $callerId = (string)($sessionUser['id'] ?? '');
        $isAdmin = strtolower((string)($sessionUser['role'] ?? '')) === 'admin';
        if (!$isAdmin && !empty($userIds) && !in_array($callerId, $userIds, true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'You are not assigned to this AI connector.']);
            exit;
        }
        $stored['settings'] = $settings;
        $provider = (string)($settings['connectorType'] ?? 'antigravity');

        // Ensure MCP key + worker dir + memory.md are provisioned immediately
        $mcpKey = $callerId !== '' ? ccrm_marveen_ensure_user_mcp_key($pdo, $callerId) : 'provisioned';
        ccrm_marveen_ensure_worker_dir(
            $id,
            $provider,
            (string)($settings['subscriptionToken'] ?? ''),
            ccrm_marveen_internal_mcp_url(),
            $mcpKey
        );

        $activeSubId = trim((string)($input['subagentId'] ?? ($_GET['subagentId'] ?? '')));
        $scopedSubId = ($activeSubId !== '' && $activeSubId !== 'main') ? $activeSubId : null;

        if ($action === 'agent_state') {
            $pollStampFile = ccrm_marveen_storage_root() . '/.last_trigger_poll';
            $lastPollTs = is_file($pollStampFile) ? (int)@filemtime($pollStampFile) : 0;
            if ((time() - $lastPollTs) >= 15) {
                @file_put_contents($pollStampFile, (string)time());
                try {
                    ccrm_marveen_process_event_triggers($pdo);
                } catch (\Throwable $e) {
                    // Non-fatal background trigger check
                }
            }
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true], $state));
            exit;
        }

        if ($action === 'agent_memory_save') {
            $memContent = (string)($input['memoryMd'] ?? '');
            $saved = ccrm_marveen_save_memory($pdo, $id, $memContent, $scopedSubId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true, 'saved' => $saved], $state));
            exit;
        }

        if ($action === 'agent_artifact_save') {
            $art = ccrm_marveen_save_artifact($pdo, $id, $input);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true, 'artifact' => $art], $state));
            exit;
        }

        if ($action === 'agent_artifact_delete') {
            $artId = trim((string)($input['artifactId'] ?? ($input['name'] ?? '')));
            ccrm_marveen_delete_artifact($pdo, $id, $artId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true], $state));
            exit;
        }

        if ($action === 'agent_subagent_save') {
            $sub = ccrm_marveen_save_subagent($pdo, $id, $input);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true, 'subagent' => $sub], $state));
            exit;
        }

        if ($action === 'agent_subagent_delete') {
            $delSubId = trim((string)($input['subagentId'] ?? ''));
            ccrm_marveen_delete_subagent($pdo, $id, $delSubId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, null);
            echo json_encode(array_merge(['success' => true], $state));
            exit;
        }

        if ($action === 'agent_task_save') {
            $task = ccrm_marveen_save_task($pdo, $id, $input);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true, 'task' => $task], $state));
            exit;
        }

        if ($action === 'agent_task_delete') {
            $taskId = trim((string)($input['taskId'] ?? ''));
            ccrm_marveen_delete_task($pdo, $id, $taskId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true], $state));
            exit;
        }

        if ($action === 'agent_autonomous_save') {
            $autoCfg = ccrm_marveen_save_autonomous_config($pdo, $id, $input);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true, 'autonomousMode' => $autoCfg], $state));
            exit;
        }

        if ($action === 'agent_trigger_save') {
            $trig = ccrm_marveen_save_trigger($pdo, $id, $input);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true, 'trigger' => $trig], $state));
            exit;
        }

        if ($action === 'agent_trigger_delete') {
            $trigId = trim((string)($input['triggerId'] ?? ($input['id'] ?? '')));
            ccrm_marveen_delete_trigger($pdo, $id, $trigId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true], $state));
            exit;
        }

        if ($action === 'agent_trigger_test') {
            $trigId = trim((string)($input['triggerId'] ?? ($input['id'] ?? '')));
            $testRes = ccrm_marveen_test_trigger($pdo, $stored, $trigId, $callerId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => !empty($testRes['ok']), 'testResult' => $testRes], $state));
            exit;
        }

        if ($action === 'agent_followup_save') {
            $fup = ccrm_marveen_save_followup($pdo, $id, $input);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true, 'followup' => $fup], $state));
            exit;
        }

        if ($action === 'agent_followup_cancel') {
            $fupId = trim((string)($input['followupId'] ?? ($input['id'] ?? '')));
            ccrm_marveen_cancel_followup($pdo, $id, $fupId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true], $state));
            exit;
        }

        if ($action === 'agent_task_run' || $action === 'agent_heartbeat') {
            $forceTaskId = $action === 'agent_task_run' ? (trim((string)($input['taskId'] ?? '')) ?: '__autonomous__') : null;
            $hb = ccrm_marveen_run_autonomous_ticks($pdo, $id, $forceTaskId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true, 'executed' => $hb['executed'] ?? []], $state));
            exit;
        }

        if ($action === 'agent_chat_clear') {
            ccrm_marveen_clear_chat_history($id, $scopedSubId);
            $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);
            echo json_encode(array_merge(['success' => true], $state));
            exit;
        }

        // $action === 'agent_run'
        $prompt = trim((string)($input['prompt'] ?? ''));
        if ($prompt === '') throw new \InvalidArgumentException('Prompt is required.');

        $userMsg = [
            'id' => 'u-' . uniqid('', false),
            'role' => 'user',
            'author' => (string)($sessionUser['name'] ?? 'User'),
            'subagentId' => $scopedSubId,
            'text' => $prompt,
            'timestamp' => date('H:i'),
            'createdAt' => gmdate('c'),
        ];
        ccrm_marveen_append_chat_message($id, $userMsg, $scopedSubId);

        $runRes = ccrm_marveen_run_agent(
            $pdo,
            $stored,
            $callerId,
            $prompt,
            trim((string)($input['systemPrompt'] ?? '')),
            $scopedSubId
        );
        if (!empty($runRes['ok'])) {
            $pdo->prepare("UPDATE `company_mailboxes` SET `last_run_at` = NOW(), `last_success_at` = NOW(), `last_error` = NULL WHERE `id` = ?")->execute([$id]);
        }

        $botMsg = [
            'id' => 'a-' . uniqid('', false),
            'role' => 'assistant',
            'subagentId' => $scopedSubId,
            'text' => !empty($runRes['ok'])
                ? (string)($runRes['text'] ?? 'Completed via CCRM MCP.')
                : ('⚠️ ' . (string)($runRes['error'] ?? 'Agent execution failed.')),
            'steps' => $runRes['steps'] ?? [],
            'timestamp' => date('H:i'),
            'createdAt' => gmdate('c'),
        ];
        ccrm_marveen_append_chat_message($id, $botMsg, $scopedSubId);
        $state = ccrm_marveen_get_connector_state($pdo, $stored, $scopedSubId);

        echo json_encode(array_merge(['success' => !empty($runRes['ok'])], $runRes, $state));
        exit;
    }

    if ($action === 'delete') {
        if (!$stored) throw new \InvalidArgumentException('Connector not found.');
        $pdo->prepare("DELETE FROM `company_mailboxes` WHERE `id` = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM `mail_sync_state` WHERE `mailbox_key` = ?")->execute(['c:' . $id]);
        ccrm_sync_whatsapp_users_to_integration($pdo);
        ccrm_audit_log($pdo, $sessionUser, 'company_mailbox.delete', 'Company connector ' . $stored['address'] . ' removed');
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'run') {
        if (!$stored) throw new \InvalidArgumentException('Mailbox not found.');
        $r = ccrm_run_mail_filing($pdo, ['only' => 'c:' . $id, 'max_seconds' => 25, 'max_messages' => 100]);
        echo json_encode(['success' => true, 'run' => $r['mailboxes']['c:' . $id] ?? $r]);
        exit;
    }

    if ($action === 'botman_register_webhook') {
        $rawAddress = strtolower(trim((string)($input['address'] ?? '')));
        $rawOwner = trim((string)($input['ownerUserId'] ?? ''));
        $rawSettings = is_array($input['settings'] ?? null) ? $input['settings'] : $input;
        if (isset($input['connectorType'])) {
            $rawSettings['connectorType'] = $input['connectorType'];
        }
        $settings = ccrm_company_mailbox_clean($rawSettings, $rawAddress, $rawOwner);
        if ($stored) {
            $old = ccrm_company_mailbox_settings($stored);
            $settings = ccrm_merge_secrets($settings, $old, ccrm_email_secret_keys());
        }
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost:8085';
        $webhookUrl = trim((string)($input['webhookUrl'] ?? ''));
        if ($webhookUrl === '') {
            $webhookUrl = $scheme . '://' . $host . '/api/botman_webhook.php?connector_id=' . urlencode($id ?: 'draft') . '&driver=' . urlencode((string)$settings['connectorType']);
        }
        $rowForReg = $stored ?: ['id' => $id ?: 'draft', 'connectorType' => $settings['connectorType']];
        $rowForReg['settings'] = $settings;
        $reg = ccrm_botman_register_webhook($rowForReg, $webhookUrl, $pdo);
        echo json_encode(array_merge(['success' => !empty($reg['ok']), 'webhookUrl' => $webhookUrl], $reg));
        exit;
    }

    if ($action === 'save' || $action === 'test') {
        $rawAddress = strtolower(trim((string)($input['address'] ?? '')));
        $rawOwner = trim((string)($input['ownerUserId'] ?? ''));
        $rawSettings = is_array($input['settings'] ?? null) ? $input['settings'] : $input;
        if (isset($input['userIds']) && is_array($input['userIds'])) {
            $rawSettings['userIds'] = $input['userIds'];
        }
        if (isset($input['connectorType'])) {
            $rawSettings['connectorType'] = $input['connectorType'];
        }
        $settings = ccrm_company_mailbox_clean($rawSettings, $rawAddress, $rawOwner);
        $connectorType = $settings['connectorType'];

        if ($stored) {
            $old = ccrm_company_mailbox_settings($stored);
            if (in_array($connectorType, CCRM_EMAIL_CONNECTOR_TYPES, true)) {
                $sameTarget = true;
                foreach (['provider', 'imapHost', 'imapPort', 'smtpHost', 'smtpPort', 'imapUsername', 'smtpUsername', 'exchangeUrl'] as $pin) {
                    if (strtolower(trim((string)($settings[$pin] ?? ''))) !== strtolower(trim((string)($old[$pin] ?? '')))) {
                        $sameTarget = false;
                        break;
                    }
                }
                if ($sameTarget) {
                    $settings = ccrm_merge_secrets($settings, $old, ccrm_email_secret_keys());
                } else {
                    foreach (['imapPassword', 'smtpPassword'] as $k) {
                        if (($settings[$k] ?? '') === CCRM_SECRET_MASK || ($settings[$k] ?? '') === '') {
                            throw new \InvalidArgumentException('Please re-enter the password when changing the server, port or account.');
                        }
                    }
                }
            } else {
                $settings = ccrm_merge_secrets($settings, $old, ccrm_email_secret_keys());
            }
        }
        ccrm_company_mailbox_validate($settings);

        if ($action === 'test') {
            if (in_array($connectorType, CCRM_AGENT_CONNECTOR_TYPES, true)) {
                $probe = ccrm_marveen_live_probe(
                    $id ?: 'test',
                    $connectorType,
                    (string)($settings['subscriptionToken'] ?? ''),
                    (string)($settings['agentEndpoint'] ?? '')
                );
                echo json_encode([
                    'success' => !empty($probe['ok']),
                    'imap' => ['ok' => !empty($probe['ok']), 'error' => $probe['error'] ?? null],
                    'smtp' => ['ok' => !empty($probe['ok']), 'error' => null],
                    'detail' => $probe['detail'] ?? null,
                    'error' => $probe['error'] ?? null,
                ]);
                exit;
            }
            if ($connectorType === 'whatsapp') {
                $waOk = ($settings['waStatus'] ?? '') === 'connected' || ($settings['waAccountId'] ?? '') !== '';
                echo json_encode([
                    'success' => $waOk,
                    'imap' => ['ok' => $waOk, 'error' => $waOk ? null : 'Scan the WhatsApp QR code first to link the session.'],
                    'smtp' => ['ok' => $waOk, 'error' => null],
                    'error' => $waOk ? null : 'Scan the WhatsApp QR code first to link the session.',
                ]);
                exit;
            }
            if (ccrm_is_botman_connector($connectorType)) {
                $bmTest = ccrm_botman_test_connection($settings, $pdo);
                $bmOk = !empty($bmTest['ok']);
                echo json_encode([
                    'success' => $bmOk,
                    'imap' => ['ok' => $bmOk, 'error' => $bmTest['error'] ?? null],
                    'smtp' => ['ok' => $bmOk, 'error' => null],
                    'handle' => $bmTest['handle'] ?? null,
                    'detail' => $bmTest['detail'] ?? null,
                    'error' => $bmTest['error'] ?? null,
                ]);
                exit;
            }
            if ($connectorType === 'exchange' && ($settings['exchangeMode'] ?? 'imap') === 'graph') {
                $g = ccrm_marveen_graph_mail_check($settings, $rawAddress ?: ($settings['imapUsername'] ?? ''));
                echo json_encode([
                    'success' => !empty($g['ok']),
                    'imap' => ['ok' => !empty($g['ok']), 'error' => $g['error'] ?? null],
                    'smtp' => ['ok' => !empty($g['ok']), 'error' => null],
                    'error' => $g['error'] ?? null,
                ]);
                exit;
            }
            echo json_encode(test_mail_connections($settings));
            exit;
        }

        $name = mb_substr(trim((string)($input['name'] ?? '')), 0, 150, 'UTF-8');
        if ($name === '') throw new \InvalidArgumentException('A name is required.');

        $address = $rawAddress;
        if (in_array($connectorType, CCRM_EMAIL_CONNECTOR_TYPES, true)) {
            if (!filter_var($address, FILTER_VALIDATE_EMAIL)) {
                throw new \InvalidArgumentException('A valid mailbox address is required.');
            }
            if (($settings['exchangeMode'] ?? 'imap') !== 'graph') {
                if ($settings['imapUsername'] === '' || (($settings['imapPassword'] ?? '') === '' && !$stored)) {
                    throw new \InvalidArgumentException('The IMAP login and password are required.');
                }
            }
        } else {
            // Non-email connectors (`whatsapp`, `claude`, `antigravity`, `chatgpt`) use phone or provider handle
            if ($address === '') {
                $slug = preg_replace('/[^a-z0-9_-]/', '-', strtolower($name)) ?: bin2hex(random_bytes(3));
                $address = $connectorType . ':' . $slug;
            } elseif (!str_contains($address, '@') && !str_starts_with($address, $connectorType . ':') && $connectorType !== 'whatsapp') {
                $address = $connectorType . ':' . $address;
            }
        }

        $validUserIds = [];
        foreach ($settings['userIds'] as $candidateUid) {
            $o = $pdo->prepare("SELECT 1 FROM `users` WHERE `id` = ?");
            $o->execute([$candidateUid]);
            if (!$o->fetchColumn()) {
                throw new \InvalidArgumentException('The owner is not a known user.');
            }
            $validUserIds[] = $candidateUid;
        }
        $settings['userIds'] = $validUserIds;
        $owner = $validUserIds[0] ?? '';

        $since = trim((string)($input['backfillSince'] ?? ''));
        if ($since !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) {
            throw new \InvalidArgumentException('The cut-off date must be YYYY-MM-DD.');
        }

        $dup = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `address` = ? AND `id` <> ?");
        $dup->execute([$address, $id]);
        $existingDup = $dup->fetch(PDO::FETCH_ASSOC);
        if ($existingDup) {
            if ($id === '' && !in_array($connectorType, CCRM_EMAIL_CONNECTOR_TYPES, true)) {
                $id = (string)$existingDup['id'];
                $stored = $existingDup;
            } else {
                throw new \InvalidArgumentException('A company mailbox with this address already exists.');
            }
        }

        $blob = json_encode(ccrm_encrypt_config_secrets($settings, ccrm_email_secret_keys()), JSON_UNESCAPED_UNICODE);
        $active = array_key_exists('isActive', $input) ? ($input['isActive'] ? 1 : 0) : 1;
        if ($stored) {
            $pdo->prepare(
                "UPDATE `company_mailboxes` SET `name` = ?, `address` = ?, `settings_json` = ?, `is_active` = ?, `owner_user_id` = ?, `backfill_since` = ? WHERE `id` = ?"
            )->execute([$name, $address, $blob, $active, $owner !== '' ? $owner : null, $since !== '' ? $since : null, $id]);
            $audit = 'updated';
        } else {
            $id = 'cmb-' . bin2hex(random_bytes(6));
            $pdo->prepare(
                "INSERT INTO `company_mailboxes` (`id`, `name`, `address`, `settings_json`, `is_active`, `owner_user_id`, `backfill_since`) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )->execute([$id, $name, $address, $blob, $active, $owner !== '' ? $owner : null, $since !== '' ? $since : null]);
            $audit = 'added';
        }

        // Provision MCP keys and isolated Marveen worker config for AI subscription connectors
        if (in_array($connectorType, CCRM_AGENT_CONNECTOR_TYPES, true)) {
            try {
                $targetUsers = !empty($validUserIds) ? $validUserIds : [(string)($sessionUser['id'] ?? '')];
                $firstMcpKey = '';
                foreach ($targetUsers as $uid) {
                    if ($uid !== '') {
                        $k = ccrm_marveen_ensure_user_mcp_key($pdo, $uid);
                        if ($firstMcpKey === '') $firstMcpKey = $k;
                    }
                }
                ccrm_marveen_ensure_worker_dir(
                    $id,
                    $connectorType,
                    (string)($settings['subscriptionToken'] ?? ''),
                    ccrm_marveen_internal_mcp_url(),
                    $firstMcpKey ?: 'provisioned'
                );
            } catch (\Throwable $e) {
                error_log('CCRM: Marveen worker provisioning warning for ' . $id . ': ' . $e->getMessage());
            }
        }

        if ($connectorType === 'whatsapp') {
            ccrm_sync_whatsapp_users_to_integration($pdo);
        }

        ccrm_audit_log($pdo, $sessionUser, 'company_mailbox.save', 'Company connector ' . $address . ' ' . $audit);
        $q = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `id` = ?");
        $q->execute([$id]);
        echo json_encode(['success' => true, 'mailbox' => ccrm_company_mailbox_public($q->fetch(PDO::FETCH_ASSOC), [])]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Unknown action.']);
} catch (\InvalidArgumentException $e) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
} catch (\Throwable $e) {
    if (function_exists('ccrm_log_exception')) ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'The request failed.']);
}
