<?php
require_once __DIR__ . '/brand.php';
ini_set('display_errors', '0');
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/mail_guard.php';

// This file is both the mailbox endpoint and the home of send_smtp_email(),
// which the workflow engine includes to deliver a "Send e-mail" action. When it
// is included rather than requested, stop before the endpoint body: it would
// read the caller's ?action=, fail to match it, print its own JSON error and
// exit() in the middle of the caller's response — killing the workflow run
// before its log was ever written. The helper functions below this point are
// bound at compile time, so they are available to the includer regardless.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') !== 'mail_broker.php') {
    return;
}

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS, DELETE');

// SECURITY: mailbox access is restricted to authenticated users.
ccrm_require_auth();
// Release the PHP session file lock immediately so concurrent IMAP requests
// (INBOX, Sent, detail, and 5-second sync.php polls) never block each other.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
if (function_exists('imap_timeout')) {
    @imap_timeout(IMAP_OPENTIMEOUT, 8);
    @imap_timeout(IMAP_READTIMEOUT, 8);
    @imap_timeout(IMAP_WRITETIMEOUT, 8);
    @imap_timeout(IMAP_CLOSETIMEOUT, 4);
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => (KOPERNIQ_PRODUCT_NAME . ' is not installed yet.')]);
    exit;
}

require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed.']);
    exit;
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. If test_credentials action, we receive settings in POST body
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'test_credentials') {
    $input = file_get_contents('php://input');
    $settings = json_decode($input, true);
    if (!$settings) {
        echo json_encode(['success' => false, 'error' => 'Invalid settings payload.']);
        exit;
    }
    // A Microsoft 365 mailbox has no host or password to test: it is connected by signing in.
    if (($settings['provider'] ?? '') === 'microsoft365') {
        echo json_encode(['success' => false, 'error' => 'Use "Sign in with Microsoft" to connect a Microsoft 365 mailbox.']);
        exit;
    }

    // The client never receives real passwords (they are masked in the sync GET),
    // so when it re-tests already-saved settings it posts the mask. Substitute the
    // authenticated user's stored password so the test works without ever exposing
    // the secret to the browser. A freshly typed password is used as-is.
    $sessionUser = ccrm_current_user();
    if ($sessionUser && !empty($sessionUser['email'])) {
        $stmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `email` = ?");
        $stmt->execute([$sessionUser['email']]);
        $storedMetaRaw = $stmt->fetchColumn();
        $storedMeta = $storedMetaRaw ? json_decode($storedMetaRaw, true) : [];
        $storedEmail = ccrm_decrypt_email_settings(
            (is_array($storedMeta) && isset($storedMeta['emailSettings'])) ? $storedMeta['emailSettings'] : []
        );

        // The stored password may only be used against the server it was saved
        // for (VULN-11). If the posted host, port, account or provider differ from
        // the stored ones, substituting it would deliver the saved secret to
        // whatever server the caller named — so the password must be typed again.
        $sameTarget = true;
        foreach (['provider', 'imapHost', 'imapPort', 'smtpHost', 'smtpPort', 'imapUsername', 'smtpUsername', 'username', 'exchangeUrl'] as $pinField) {
            $posted = strtolower(trim((string)($settings[$pinField] ?? '')));
            $saved  = strtolower(trim((string)($storedEmail[$pinField] ?? '')));
            if ($posted !== $saved) {
                $sameTarget = false;
                break;
            }
        }
        if ($sameTarget) {
            $settings = ccrm_merge_secrets(is_array($settings) ? $settings : [], $storedEmail, ccrm_email_secret_keys());
        } else {
            foreach (ccrm_email_secret_keys() as $secretKey) {
                if (isset($settings[$secretKey]) && $settings[$secretKey] === CCRM_SECRET_MASK) {
                    echo json_encode(['success' => false, 'error' => 'Please re-enter the password when changing the server, port or account.']);
                    exit;
                }
            }
        }
    }

    // SSRF guard (VULN-03): this endpoint opens connections to a host the caller
    // typed. Only public hosts on standard mail ports are allowed.
    try {
        $isExchange = (($settings['provider'] ?? '') === 'exchange');
        $imapPort = (int)($settings['imapPort'] ?? 0);
        if ($imapPort <= 0 && $isExchange) {
            $imapPort = 993;
        }
        $smtpPort = (int)($settings['smtpPort'] ?? 0);
        if ($smtpPort <= 0 && $isExchange) {
            $smtpPort = 587;
        }
        ccrm_validate_external_mail_target(ccrm_resolve_mail_host($settings, 'imap'), $imapPort);
        ccrm_validate_external_mail_target(ccrm_resolve_mail_host($settings, 'smtp'), $smtpPort);
    } catch (\Throwable $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }

    $result = test_mail_connections($settings);
    echo json_encode($result);
    exit;
}

// 1b. Actually SEND a test email through the SYSTEM outbound mail server
// (system_settings.INTEGRATIONS_CONFIG) — the profile used by password-reset
// and notifications. Admin-only. Unlike the old client-side "simulation", this
// really connects, authenticates and delivers, so a green result means the
// message left the server. The operator posts the settings currently in the
// form; masked/omitted secrets are merged from the stored config.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'send_test') {
    ccrm_require_admin();

    $input = json_decode(file_get_contents('php://input'), true);
    $recipient = is_array($input) ? trim((string)($input['recipient'] ?? '')) : '';
    if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'error' => 'A valid recipient address is required.']);
        exit;
    }

    $stored = ccrm_load_integrations_config($pdo);
    $posted = (is_array($input) && isset($input['settings']) && is_array($input['settings'])) ? $input['settings'] : null;
    $config = $posted !== null
        ? ccrm_merge_secrets($posted, $stored, ccrm_integration_secret_keys())
        : $stored;

    $lang = (is_array($input) && in_array(($input['lang'] ?? 'en'), ['sk', 'hu', 'en'], true)) ? $input['lang'] : 'en';

    try {
        send_system_test_email($config, $recipient, $lang);
        echo json_encode(['success' => true]);
    } catch (Throwable $ex) {
        // Deliberate exception: this action is admin-only and its whole purpose is
        // diagnosing outbound mail, so the SMTP server's own message ("535
        // authentication failed", "connection refused") is the useful answer.
        if (function_exists('ccrm_log_exception')) {
            ccrm_log_exception($ex);
        }
        echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
    }
    exit;
}

// 1c. The stored body of a message the background job filed (api/mail_filing.php). It is
// readable by everyone who may see e-mail on a timeline, whatever mailbox it came from,
// so it never needs the caller's own mailbox. The check is the same one that hides e-mail
// events from a role without the `email` permission in the sync.
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_filed_mail') {
    require_once __DIR__ . '/read_scope.php';
    $scopeUser = ccrm_current_user();
    $scope = $scopeUser ? ccrm_read_scope($pdo, $scopeUser) : [];
    if (!$scopeUser || !ccrm_can($scope, 'email')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'No access to e-mail.']);
        exit;
    }
    $eventId = (string)($_GET['id'] ?? '');
    $stmt = $pdo->prepare(
        "SELECT te.`id`, te.`title`, te.`content`, te.`mail_account`, te.`mail_owner`, b.`body`, b.`attachments_json`
         FROM `timeline_events` te JOIN `filed_mail_bodies` b ON b.`event_id` = te.`id`
         WHERE te.`id` = ? AND te.`type` = 'email' AND te.`hidden` = 0"
    );
    $stmt->execute([$eventId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'No stored body for this message.']);
        exit;
    }
    require_once __DIR__ . '/mail_attachments.php';
    $attachments = !empty($row['attachments_json']) ? json_decode($row['attachments_json'], true) : [];
    echo json_encode([
        'success' => true,
        'email' => [
            'uid' => $row['id'],
            'html' => '',
            'text' => (string)$row['body'],
            // Name, size and whether the file was kept (opened with get_filed_mail_attachment, by position).
            'attachments' => ccrm_mail_attachments_for_client($attachments),
            'stored' => true,
            'mail_account' => $row['mail_account'],
        ],
    ]);
    exit;
}

// 1d. One attachment of a filed message, streamed after the same check as the body. The
// request names the message and the attachment's position in its list, never a path.
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_filed_mail_attachment') {
    require_once __DIR__ . '/read_scope.php';
    require_once __DIR__ . '/mail_attachments.php';
    $scopeUser = ccrm_current_user();
    $scope = $scopeUser ? ccrm_read_scope($pdo, $scopeUser) : [];
    if (!$scopeUser || !ccrm_can($scope, 'email')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'No access to e-mail.']);
        exit;
    }
    $stmt = $pdo->prepare(
        "SELECT b.`attachments_json` FROM `timeline_events` te JOIN `filed_mail_bodies` b ON b.`event_id` = te.`id`
         WHERE te.`id` = ? AND te.`type` = 'email' AND te.`hidden` = 0"
    );
    $stmt->execute([(string)($_GET['id'] ?? '')]);
    $json = $stmt->fetchColumn();
    $list = $json ? json_decode((string)$json, true) : [];
    $index = filter_var($_GET['n'] ?? null, FILTER_VALIDATE_INT);
    $entry = ($index !== false && $index !== null && is_array($list) && isset($list[$index]) && is_array($list[$index])) ? $list[$index] : null;
    $path = $entry ? ccrm_mail_attachment_path($entry['key'] ?? null) : null;
    if ($path === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'This attachment was not kept.']);
        exit;
    }
    $displayName = ccrm_safe_upload_name((string)($entry['name'] ?? '')) ?? 'attachment';
    $contentType = ccrm_mail_attachment_content_type($displayName);
    // Only formats a browser shows without running anything of the sender's open in the tab.
    $inline = in_array($contentType, ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'], true) && empty($_GET['download']);
    header('Content-Type: ' . $contentType);
    header('X-Content-Type-Options: nosniff');
    header('Content-Security-Policy: default-src \'none\'; sandbox');
    header('Cache-Control: private, no-store');
    header('Content-Length: ' . (string)filesize($path));
    $asciiName = preg_replace('/[^A-Za-z0-9._\- ]+/', '_', $displayName);
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . rawurlencode($displayName));
    readfile($path);
    exit;
}

// 2. The mailbox to operate on is ALWAYS the authenticated session user's own.
// SECURITY: the old X-User-Email header let any logged-in user open, read, send
// from or delete another user's mailbox just by supplying their address (IDOR).
// The header is now ignored entirely.
$sessionUser = ccrm_current_user();
$userEmail = $sessionUser['email'] ?? '';
$userId = (string)($sessionUser['id'] ?? '');
$isAdminUser = strtolower((string)($sessionUser['role'] ?? '')) === 'admin';

if (empty($userEmail)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized.']);
    exit;
}

// Fetch user settings from DB
$stmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `email` = ?");
$stmt->execute([$userEmail]);
$metadataStr = $stmt->fetchColumn();
$metadata = $metadataStr ? json_decode($metadataStr, true) : [];
$personalEmailSettings = ccrm_decrypt_email_settings(is_array($metadata) ? ($metadata['emailSettings'] ?? null) : null);
$personalIsGraph = ($personalEmailSettings['provider'] ?? '') === 'microsoft365';
$hasPersonalMailbox = !empty($personalEmailSettings) && (
    !empty($personalEmailSettings['imapHost']) ||
    (($personalEmailSettings['provider'] ?? '') === 'exchange' && !empty($personalEmailSettings['exchangeUrl'])) ||
    // A Microsoft 365 mailbox has no host: it is signed in with Microsoft (graph_oauth.php).
    $personalIsGraph
);

// Load company email connectors (`gmail`, `smtp`, `exchange`) assigned to this user via `userIds[]`
$assignedCompanyMailboxes = [];
try {
    $cStmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `name`");
    foreach ($cStmt ? $cStmt->fetchAll(PDO::FETCH_ASSOC) : [] as $cRow) {
        $rawC = json_decode((string)($cRow['settings_json'] ?? '{}'), true);
        $cSettings = ccrm_decrypt_email_settings(is_array($rawC) ? $rawC : []);
        $cType = strtolower(trim((string)($cSettings['connectorType'] ?? (($cSettings['provider'] ?? '') === 'exchange' ? 'exchange' : 'smtp'))));
        if (in_array($cType, ['whatsapp', 'claude', 'antigravity', 'chatgpt', 'claude_api', 'gemini_api', 'openai_api'], true)) {
            continue;
        }
        $uIds = is_array($cSettings['userIds'] ?? null) ? array_values(array_filter(array_map('strval', $cSettings['userIds']))) : [];
        if (!empty($cRow['owner_user_id']) && !in_array((string)$cRow['owner_user_id'], $uIds, true)) {
            array_unshift($uIds, (string)$cRow['owner_user_id']);
        }
        $allowed = in_array($userId, $uIds, true) || ($isAdminUser && empty($uIds));
        if ($allowed) {
            if (!empty($cRow['backfill_since'])) {
                $cSettings['backfillSince'] = trim((string)$cRow['backfill_since']);
            }
            $cRow['decrypted_settings'] = $cSettings;
            $cRow['connector_type'] = $cType;
            $assignedCompanyMailboxes[$cRow['id']] = $cRow;
        }
    }
} catch (\Throwable $e) {
    // company_mailboxes table may not exist yet before first migration
}

if ($action === 'accounts') {
    $accounts = [];
    if ($hasPersonalMailbox) {
        $accounts[] = [
            'id' => 'personal',
            'name' => (string)($sessionUser['name'] ?? $userEmail),
            'address' => (string)($personalIsGraph
                ? (($personalEmailSettings['graphAccount'] ?? '') ?: $userEmail)
                : ($personalEmailSettings['imapUsername'] ?? $userEmail)),
            'connectorType' => in_array($personalEmailSettings['provider'] ?? '', ['exchange', 'microsoft365'], true) ? 'exchange' : 'smtp',
            'isPersonal' => true,
        ];
    }
    foreach ($assignedCompanyMailboxes as $cid => $cRow) {
        $accounts[] = [
            'id' => $cid,
            'name' => (string)$cRow['name'],
            'address' => (string)$cRow['address'],
            'connectorType' => (string)$cRow['connector_type'],
            'isPersonal' => false,
        ];
    }
    echo json_encode(['success' => true, 'accounts' => $accounts]);
    exit;
}

$requestedMailboxId = trim((string)($_GET['mailbox_id'] ?? ''));
$emailSettings = null;
$activeMailboxKey = 'u:' . strtolower(trim($userEmail));
if ($requestedMailboxId !== '' && $requestedMailboxId !== 'personal') {
    if (!isset($assignedCompanyMailboxes[$requestedMailboxId])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'You do not have access to this mailbox connector.']);
        exit;
    }
    $emailSettings = $assignedCompanyMailboxes[$requestedMailboxId]['decrypted_settings'];
    $userEmail = (string)$assignedCompanyMailboxes[$requestedMailboxId]['address'];
    $activeMailboxKey = 'c:' . $requestedMailboxId;
} elseif ($hasPersonalMailbox) {
    $emailSettings = $personalEmailSettings;
    $activeMailboxKey = 'u:' . strtolower(trim($userEmail));
} elseif (!empty($assignedCompanyMailboxes)) {
    $firstAssigned = reset($assignedCompanyMailboxes);
    $emailSettings = $firstAssigned['decrypted_settings'];
    $userEmail = (string)$firstAssigned['address'];
    $activeMailboxKey = 'c:' . (string)$firstAssigned['id'];
}

if (!$emailSettings) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email integration has not been set up yet for this account.']);
    exit;
}

// A demo install's seeded mailbox profile is answered from the demo store, never
// over IMAP. Only that exact profile qualifies (see demo_mailbox.php), so a real
// configured mailbox always takes the path below.
require_once __DIR__ . '/demo_mailbox.php';
if (ccrm_demo_mailbox_active($pdo, $emailSettings)) {
    ccrm_demo_mailbox_handle($pdo, $action, $emailSettings, $userEmail);
    exit;
}

// An Exchange Online mailbox has no password to log in with (Microsoft switched basic auth
// off): it is signed in with Microsoft and every action goes through Graph (graph_mail.php).
if (($emailSettings['provider'] ?? '') === 'microsoft365') {
    require_once __DIR__ . '/graph_mail.php';
    // A company connector refreshes its tokens into its own row, not into a user's profile.
    $graphMb = str_starts_with($activeMailboxKey, 'c:')
        ? ccrm_graph_mailbox($pdo, 'company', substr($activeMailboxKey, 2), $emailSettings, $userEmail)
        : null;
    ccrm_graph_broker_handle($pdo, $action, $emailSettings, $userEmail, $graphMb);
    exit;
}

// Perform action
try {
    switch ($action) {
        case 'get_folders':
            $folders = fetch_imap_folders($emailSettings);
            echo json_encode(['success' => true, 'folders' => $folders]);
            break;

        case 'get_emails':
            $requestedFolder = isset($_GET['folder']) ? trim((string)$_GET['folder']) : 'INBOX';
            $uiFolder = strcasecmp($requestedFolder, 'Sent') === 0 ? 'Sent' : ($requestedFolder === '' ? 'INBOX' : $requestedFolder);
            $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
            $filter = isset($_GET['filter']) ? $_GET['filter'] : 'all';
            $searchEmail = isset($_GET['email']) ? $_GET['email'] : null;

            // Fast DB-cached envelope read (`cached_only=1`) so opening a mailbox
            // displays already-received emails immediately without waiting for IMAP.
            if (!empty($_GET['cached_only'])) {
                $cachedResult = ccrm_read_cached_envelopes($pdo, $activeMailboxKey, $uiFolder, $emailSettings, $userEmail, $page, 25, $filter, $searchEmail);
                echo json_encode(array_merge(['success' => true, 'cached' => true, 'folder' => $uiFolder], $cachedResult));
                break;
            }

            // Callers ask for the literal "Sent". Not every server calls it that,
            // and asking for a folder that does not exist reads as an empty one —
            // no error, and no outgoing mail on any timeline.
            $folder = ccrm_canonical_folder($emailSettings, $requestedFolder);
            try {
                $result = fetch_imap_emails($emailSettings, $folder, $page, 25, $filter, $searchEmail);
            } catch (\Throwable $imapEx) {
                if ($uiFolder === 'Sent') {
                    $result = ['emails' => [], 'pagination' => ['total' => 0, 'unseen' => 0, 'page' => $page, 'limit' => 25, 'pages' => 1]];
                } else {
                    throw $imapEx;
                }
            }
            if (!empty($result['emails']) && is_array($result['emails'])) {
                ccrm_upsert_cached_envelopes($pdo, $activeMailboxKey, $uiFolder, $result['emails']);
            }
            // For Sent folder, also merge any locally recorded outgoing envelopes (e.g. AI agent replies or SMTP-only sends)
            // from `mail_envelopes` so sent emails are always visible in the mailbox and threads even if IMAP Sent wasn't appended.
            if ($uiFolder === 'Sent') {
                $cachedSent = ccrm_read_cached_envelopes($pdo, $activeMailboxKey, 'Sent', $emailSettings, $userEmail, $page, 50, $filter, $searchEmail);
                $seenUids = [];
                $seenMsgIds = [];
                foreach (($result['emails'] ?? []) as $emItem) {
                    $seenUids[(int)($emItem['uid'] ?? 0)] = true;
                    if (!empty($emItem['message_id'])) {
                        $seenMsgIds[(string)$emItem['message_id']] = true;
                    }
                }
                foreach (($cachedSent['emails'] ?? []) as $cItem) {
                    $cUid = (int)($cItem['uid'] ?? 0);
                    $cMsgId = (string)($cItem['message_id'] ?? '');
                    if (isset($seenUids[$cUid]) || ($cMsgId !== '' && isset($seenMsgIds[$cMsgId]))) {
                        continue;
                    }
                    $result['emails'][] = $cItem;
                }
                if (!empty($result['emails'])) {
                    usort($result['emails'], static function (array $a, array $b): int {
                        return strcmp((string)($b['date'] ?? ''), (string)($a['date'] ?? ''));
                    });
                }
            }
            echo json_encode(array_merge(['success' => true, 'folder' => $folder], $result));
            break;

        case 'get_email_detail':
            $uid = isset($_GET['uid']) ? $_GET['uid'] : '';
            $requestedFolder = isset($_GET['folder']) ? trim((string)$_GET['folder']) : 'INBOX';
            $uiFolder = strcasecmp($requestedFolder, 'Sent') === 0 ? 'Sent' : ($requestedFolder === '' ? 'INBOX' : $requestedFolder);
            $folder = ccrm_canonical_folder($emailSettings, $requestedFolder);
            if (empty($uid)) {
                throw new Exception('Missing email UID.');
            }
            try {
                $email = fetch_imap_email_detail($emailSettings, $folder, $uid);
            } catch (\Throwable $detailEx) {
                // Fallback to cached envelope preview when an outgoing reply was stored in `mail_envelopes`
                $envStmt = $pdo->prepare("SELECT `preview`, `seen` FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `uid` = ? LIMIT 1");
                $envStmt->execute([$activeMailboxKey, (int)$uid]);
                $envRow = $envStmt->fetch(PDO::FETCH_ASSOC);
                if ($envRow) {
                    $previewText = (string)($envRow['preview'] ?? '');
                    $email = [
                        'uid' => $uid,
                        'html' => nl2br(htmlspecialchars($previewText, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')),
                        'text' => $previewText,
                        'attachments' => [],
                        'seen' => !empty($envRow['seen']),
                    ];
                } else {
                    throw $detailEx;
                }
            }
            echo json_encode(['success' => true, 'email' => $email]);
            break;

        case 'send_email':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception('Invalid method.');
            }
            $input = file_get_contents('php://input');
            $payload = json_decode($input, true);
            if (!$payload) {
                throw new Exception('Invalid email payload.');
            }
            $sendResult = send_smtp_email($emailSettings, $payload['to'], $payload['subject'], $payload['html']);
            // Record the sent message in `mail_envelopes` immediately so it appears in the mailbox & thread right away
            try {
                ccrm_ensure_mail_envelopes_table($pdo);
                $fakeUid = (int)(time() * 10 + random_int(1, 9));
                $plainPreview = mb_substr(trim(strip_tags((string)($payload['html'] ?? ''))), 0, 480, 'UTF-8');
                $insStmt = $pdo->prepare(
                    "INSERT IGNORE INTO `mail_envelopes` (
                        `mailbox_key`, `folder`, `uid`, `event_id`, `subject`,
                        `from_name`, `from_address`, `to_name`, `to_address`,
                        `email_date`, `is_outgoing`, `seen`, `size`,
                        `message_id`, `in_reply_to`, `references_hdr`, `preview`
                    ) VALUES (?, 'Sent', ?, ?, ?, '', ?, '', ?, NOW(), 1, 1, ?, ?, '', '', ?)"
                );
                $insStmt->execute([
                    $activeMailboxKey,
                    $fakeUid,
                    'email-sent-' . uniqid('', false),
                    mb_substr((string)($payload['subject'] ?? ''), 0, 500, 'UTF-8'),
                    mb_substr($userEmail, 0, 255, 'UTF-8'),
                    mb_substr((string)($payload['to'] ?? ''), 0, 255, 'UTF-8'),
                    strlen((string)($payload['html'] ?? '')),
                    (string)($sendResult['message_id'] ?? ''),
                    $plainPreview,
                ]);
            } catch (\Throwable $e) {}
            // `filed_to_sent` is false when the message was delivered but the
            // archive copy could not be stored. The send still succeeded; the
            // client says so, because an unfiled copy will not reach the timeline.
            echo json_encode([
                'success' => true,
                'filed_to_sent' => !empty($sendResult['filed_to_sent']),
                'message_id' => $sendResult['message_id'] ?? ''
            ]);
            break;

        case 'set_seen':
            // Explicit read / unread, by UID. The response carries the flag as
            // the server reports it after the change, never as assumed.
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Exception('Invalid method.');
            }
            $payload = json_decode(file_get_contents('php://input'), true);
            if (!is_array($payload)) {
                throw new Exception('Invalid payload.');
            }
            $uid = isset($payload['uid']) ? trim((string)$payload['uid']) : '';
            $requestedFolder = isset($payload['folder']) ? trim((string)$payload['folder']) : 'INBOX';
            $uiFolder = strcasecmp($requestedFolder, 'Sent') === 0 ? 'Sent' : ($requestedFolder === '' ? 'INBOX' : $requestedFolder);
            $folder = ccrm_canonical_folder($emailSettings, $requestedFolder);
            if ($uid === '' || !array_key_exists('seen', $payload)) {
                throw new Exception('Missing parameters.');
            }
            $seen = set_imap_email_seen($emailSettings, $folder, $uid, !empty($payload['seen']));
            ccrm_update_cached_envelope_seen($pdo, $activeMailboxKey, $uiFolder, (int)$uid, (bool)$seen);
            echo json_encode(['success' => true, 'uid' => $uid, 'folder' => $folder, 'seen' => $seen]);
            break;

        case 'delete_email':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                throw new Exception('Invalid method.');
            }
            $uid = isset($_GET['uid']) ? $_GET['uid'] : '';
            $requestedFolder = isset($_GET['folder']) ? trim((string)$_GET['folder']) : 'INBOX';
            $uiFolder = strcasecmp($requestedFolder, 'Sent') === 0 ? 'Sent' : ($requestedFolder === '' ? 'INBOX' : $requestedFolder);
            $folder = ccrm_canonical_folder($emailSettings, $requestedFolder);
            delete_imap_email($emailSettings, $folder, $uid);
            ccrm_delete_cached_envelope($pdo, $activeMailboxKey, $uiFolder, (int)$uid);
            echo json_encode(['success' => true]);
            break;

        case 'get_attachment':
            $uid = isset($_GET['uid']) ? $_GET['uid'] : '';
            $folder = ccrm_canonical_folder($emailSettings, isset($_GET['folder']) ? $_GET['folder'] : 'INBOX');
            $partNum = isset($_GET['part']) ? $_GET['part'] : '';
            $name = isset($_GET['name']) ? $_GET['name'] : 'attachment';
            if (empty($uid) || empty($partNum)) {
                throw new Exception('Missing parameters.');
            }
            serve_imap_attachment($emailSettings, $folder, $uid, $partNum, $name);
            exit;

        case 'save_attachment':
            $uid = isset($_GET['uid']) ? $_GET['uid'] : '';
            $folder = ccrm_canonical_folder($emailSettings, isset($_GET['folder']) ? $_GET['folder'] : 'INBOX');
            $partNum = isset($_GET['part']) ? $_GET['part'] : '';
            $name = isset($_GET['name']) ? $_GET['name'] : 'attachment';
            // Timeline ids carry '-' now (email-sent-<scope>-<uid>); stripping it
            // turned every mail event id into one that matches no row.
            $eventId = isset($_GET['eventId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['eventId']) : '';
            if (empty($uid) || empty($partNum) || empty($eventId)) {
                throw new Exception('Missing parameters.');
            }
            $result = save_imap_attachment_to_uploads($emailSettings, $folder, $uid, $partNum, $name, $eventId);
            echo json_encode($result);
            break;

        default:
            throw new Exception('Unsupported action: ' . $action);
    }
} catch (Throwable $ex) {
    http_response_code(500);
    // The deliberate `throw new Exception(...)` calls in this file carry messages
    // meant for the user about their OWN mailbox ("IMAP connection failed",
    // "message no longer in this folder"), so those are worth showing. Anything
    // else is an internal PHP error whose message leaks file paths and internals.
    $isUserFacing = ($ex instanceof Exception) && !($ex instanceof \ErrorException);
    if (function_exists('ccrm_log_exception')) {
        ccrm_log_exception($ex);
    }
    echo json_encode([
        'success' => false,
        'error'   => $isUserFacing ? $ex->getMessage() : 'The mail server request failed.',
    ]);
}

function safe_utf8($str) {
    if (!is_string($str)) {
        return '';
    }
    return mb_convert_encoding($str, 'UTF-8', 'UTF-8, ASCII, ISO-8859-1, ISO-8859-2, Windows-1252');
}

/**
 * Decode RFC 2047 MIME encoded-words (=?charset?Q|B?...?=) reliably, including
 * headers that mix encoded-words with raw UTF-8 text (where PHP's imap_utf8()
 * returns the raw undecoded string).
 */
function ccrm_decode_mime_header($raw): string {
    if (!is_string($raw) || $raw === '') {
        return '';
    }
    if (strpos($raw, '=?') === false) {
        return safe_utf8($raw);
    }
    $collapsed = preg_replace('/(\?=)\s+(=\?)/', '$1$2', $raw);
    $decoded = preg_replace_callback(
        '/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/',
        function ($m) {
            $charset = strtoupper(trim($m[1]));
            $enc = strtoupper($m[2]);
            $payload = $m[3];
            $bytes = ($enc === 'B')
                ? base64_decode($payload)
                : quoted_printable_decode(str_replace('_', ' ', $payload));
            if ($bytes === false) {
                return $m[0];
            }
            if ($charset !== '' && $charset !== 'UTF-8' && $charset !== 'UTF8') {
                $conv = @mb_convert_encoding($bytes, 'UTF-8', $charset);
                if ($conv !== false) {
                    return $conv;
                }
            }
            return $bytes;
        },
        $collapsed
    );
    return safe_utf8($decoded);
}

exit;

function ccrm_ensure_mail_envelopes_table(PDO $pdo): void {
    static $ensured = false;
    if ($ensured) {
        return;
    }
    $ensured = true;
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS `mail_envelopes` (
              `mailbox_key` VARCHAR(100) NOT NULL COMMENT 'c:<company mailbox id> or u:<user email>',
              `folder` VARCHAR(120) NOT NULL COMMENT 'Canonical UI folder key (INBOX, Sent, or custom folder)',
              `uid` BIGINT NOT NULL,
              `event_id` VARCHAR(64) NOT NULL,
              `subject` VARCHAR(500) NOT NULL DEFAULT '',
              `from_name` VARCHAR(255) NOT NULL DEFAULT '',
              `from_address` VARCHAR(255) NOT NULL DEFAULT '',
              `to_name` VARCHAR(255) NOT NULL DEFAULT '',
              `to_address` VARCHAR(255) NOT NULL DEFAULT '',
              `email_date` DATETIME NULL,
              `is_outgoing` TINYINT(1) NOT NULL DEFAULT 0,
              `seen` TINYINT(1) NOT NULL DEFAULT 0,
              `size` INT NOT NULL DEFAULT 0,
              `message_id` VARCHAR(255) NOT NULL DEFAULT '',
              `in_reply_to` VARCHAR(255) NOT NULL DEFAULT '',
              `references_hdr` TEXT NULL,
              `preview` VARCHAR(500) NOT NULL DEFAULT '',
              `attachment_count` INT NOT NULL DEFAULT 0,
              `timeline_hidden` TINYINT(1) NOT NULL DEFAULT 0,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`mailbox_key`, `folder`, `uid`),
              INDEX `idx_mail_envelopes_lookup` (`mailbox_key`, `folder`, `email_date` DESC, `uid` DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (\Throwable $e) {}
}

function ccrm_upsert_cached_envelopes(PDO $pdo, string $mailboxKey, string $uiFolder, array $emails): void {
    if (empty($emails)) {
        return;
    }
    ccrm_ensure_mail_envelopes_table($pdo);
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO `mail_envelopes` (
                `mailbox_key`, `folder`, `uid`, `event_id`, `subject`,
                `from_name`, `from_address`, `to_name`, `to_address`,
                `email_date`, `is_outgoing`, `seen`, `size`,
                `message_id`, `in_reply_to`, `references_hdr`,
                `preview`, `attachment_count`, `timeline_hidden`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                `event_id` = VALUES(`event_id`),
                `subject` = VALUES(`subject`),
                `from_name` = VALUES(`from_name`),
                `from_address` = VALUES(`from_address`),
                `to_name` = VALUES(`to_name`),
                `to_address` = VALUES(`to_address`),
                `email_date` = VALUES(`email_date`),
                `is_outgoing` = VALUES(`is_outgoing`),
                `seen` = VALUES(`seen`),
                `size` = VALUES(`size`),
                `message_id` = VALUES(`message_id`),
                `in_reply_to` = VALUES(`in_reply_to`),
                `references_hdr` = VALUES(`references_hdr`),
                `preview` = IF(VALUES(`preview`) <> '', VALUES(`preview`), `preview`),
                `attachment_count` = IF(VALUES(`preview`) <> '' OR VALUES(`attachment_count`) > 0, VALUES(`attachment_count`), `attachment_count`),
                `timeline_hidden` = VALUES(`timeline_hidden`)"
        );
        foreach ($emails as $m) {
            if (!is_array($m) || !isset($m['uid'])) {
                continue;
            }
            $dateStr = trim((string)($m['date'] ?? ''));
            $emailDate = ($dateStr !== '' && strtotime($dateStr) !== false) ? date('Y-m-d H:i:s', strtotime($dateStr)) : null;
            $stmt->execute([
                $mailboxKey,
                $uiFolder,
                (int)$m['uid'],
                mb_substr((string)($m['event_id'] ?? ''), 0, 64, 'UTF-8'),
                mb_substr((string)($m['subject'] ?? '(No Subject)'), 0, 500, 'UTF-8'),
                mb_substr((string)($m['from']['name'] ?? ''), 0, 255, 'UTF-8'),
                mb_substr((string)($m['from']['address'] ?? ''), 0, 255, 'UTF-8'),
                mb_substr((string)($m['to']['name'] ?? ''), 0, 255, 'UTF-8'),
                mb_substr((string)($m['to']['address'] ?? ''), 0, 255, 'UTF-8'),
                $emailDate,
                !empty($m['is_outgoing']) ? 1 : 0,
                !empty($m['seen']) ? 1 : 0,
                (int)($m['size'] ?? 0),
                mb_substr((string)($m['message_id'] ?? ''), 0, 255, 'UTF-8'),
                mb_substr((string)($m['in_reply_to'] ?? ''), 0, 255, 'UTF-8'),
                (string)($m['references'] ?? ''),
                mb_substr((string)($m['preview'] ?? ''), 0, 500, 'UTF-8'),
                (int)($m['attachment_count'] ?? 0),
                !empty($m['timeline_hidden']) ? 1 : 0,
            ]);
        }
    } catch (\Throwable $e) {
        error_log('[ccrm mail_envelopes] upsert failed: ' . $e->getMessage());
    }
}

function ccrm_update_cached_envelope_seen(PDO $pdo, string $mailboxKey, string $uiFolder, int $uid, bool $seen): void {
    ccrm_ensure_mail_envelopes_table($pdo);
    try {
        $stmt = $pdo->prepare("UPDATE `mail_envelopes` SET `seen` = ? WHERE `mailbox_key` = ? AND `folder` = ? AND `uid` = ?");
        $stmt->execute([$seen ? 1 : 0, $mailboxKey, $uiFolder, $uid]);
    } catch (\Throwable $e) {}
}

function ccrm_delete_cached_envelope(PDO $pdo, string $mailboxKey, string $uiFolder, int $uid): void {
    ccrm_ensure_mail_envelopes_table($pdo);
    try {
        $stmt = $pdo->prepare("DELETE FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `folder` = ? AND `uid` = ?");
        $stmt->execute([$mailboxKey, $uiFolder, $uid]);
    } catch (\Throwable $e) {}
}

function ccrm_read_cached_envelopes(
    PDO $pdo,
    string $mailboxKey,
    string $uiFolder,
    array $settings,
    string $userEmail,
    int $page,
    int $limit,
    string $filter,
    ?string $searchEmail = null
): array {
    ccrm_ensure_mail_envelopes_table($pdo);
    $where = ["e.`mailbox_key` = ?", "e.`folder` = ?"];
    $params = [$mailboxKey, $uiFolder];

    if (!empty($settings['backfillSince'])) {
        $ts = strtotime(trim((string)$settings['backfillSince']) . ' 00:00:00');
        if ($ts !== false && $ts > 0) {
            $where[] = "(e.`email_date` IS NULL OR e.`email_date` >= ?)";
            $params[] = date('Y-m-d 00:00:00', $ts);
        }
    }

    if ($searchEmail !== null && trim($searchEmail) !== '') {
        $needle = '%' . strtolower(trim($searchEmail)) . '%';
        $where[] = "(LOWER(e.`from_address`) LIKE ? OR LOWER(e.`to_address`) LIKE ?)";
        $params[] = $needle;
        $params[] = $needle;
    }

    $baseWhereSql = implode(' AND ', $where);
    $unseenStmt = $pdo->prepare("SELECT COUNT(*) FROM `mail_envelopes` e WHERE {$baseWhereSql} AND e.`seen` = 0");
    $unseenStmt->execute($params);
    $unseen = (int)$unseenStmt->fetchColumn();

    if ($filter === 'unread') {
        $where[] = "e.`seen` = 0";
    }
    $whereSql = implode(' AND ', $where);

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM `mail_envelopes` e WHERE {$whereSql}");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $offset = max(0, ($page - 1) * $limit);
    $sql = "SELECT e.*, s.`summary`
            FROM `mail_envelopes` e
            LEFT JOIN `email_summaries` s
              ON s.`user_email` COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
             AND s.`folder` COLLATE utf8mb4_unicode_ci = e.`folder` COLLATE utf8mb4_unicode_ci
             AND s.`email_uid` COLLATE utf8mb4_unicode_ci = CAST(e.`uid` AS CHAR) COLLATE utf8mb4_unicode_ci
            WHERE {$whereSql}
            ORDER BY e.`uid` DESC
            LIMIT " . (int)$limit . " OFFSET " . (int)$offset;
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_merge([$userEmail], $params));
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $emails = [];
    foreach ($rows as $r) {
        $item = [
            'uid' => (int)$r['uid'],
            'event_id' => (string)$r['event_id'],
            'subject' => ccrm_decode_mime_header((string)$r['subject']),
            'from' => [
                'name' => ccrm_decode_mime_header((string)$r['from_name']),
                'address' => (string)$r['from_address'],
            ],
            'to' => [
                'name' => ccrm_decode_mime_header((string)$r['to_name']),
                'address' => (string)$r['to_address'],
            ],
            'date' => (string)($r['email_date'] ?? ''),
            'is_outgoing' => !empty($r['is_outgoing']),
            'seen' => !empty($r['seen']),
            'size' => (int)$r['size'],
            'message_id' => (string)$r['message_id'],
            'in_reply_to' => (string)$r['in_reply_to'],
            'references' => (string)($r['references_hdr'] ?? ''),
            'summary' => (string)($r['summary'] ?? ''),
            'preview' => (string)$r['preview'],
            'attachment_count' => (int)$r['attachment_count'],
        ];
        if (!empty($r['timeline_hidden'])) {
            $item['timeline_hidden'] = true;
        }
        $emails[] = $item;
    }

    return [
        'emails' => $emails,
        'pagination' => [
            'total' => $total,
            'unseen' => $unseen,
            'page' => $page,
            'limit' => $limit,
            'pages' => $limit > 0 ? (int)ceil($total / $limit) : 1,
        ],
    ];
}

function get_imap_credentials($settings) {
    $user = !empty($settings['imapUsername']) ? $settings['imapUsername'] : (isset($settings['username']) ? $settings['username'] : '');
    $pass = !empty($settings['imapPassword']) ? $settings['imapPassword'] : (isset($settings['password']) ? $settings['password'] : '');
    return [$user, $pass];
}

function get_smtp_credentials($settings) {
    $user = !empty($settings['smtpUsername']) ? $settings['smtpUsername'] : (isset($settings['username']) ? $settings['username'] : '');
    $pass = !empty($settings['smtpPassword']) ? $settings['smtpPassword'] : (isset($settings['password']) ? $settings['password'] : '');
    return [$user, $pass];
}

/**
 * The host a mailbox actually lives on.
 *
 * `provider = exchange` used to fall straight back to outlook.office365.com
 * whenever `imapHost`/`smtpHost` was blank, silently ignoring the `exchangeUrl`
 * the operator had typed into Personal Settings. A self-hosted Exchange profile
 * therefore dialled Microsoft, was refused there ("Server disables LOGIN, no
 * recognized SASL authenticator") and EVERY mailbox read failed — so no mail ever
 * reached a lead timeline, while the account still reported itself validated.
 * Read the configured address first, and refuse an empty one rather than guessing
 * a host the mailbox was never on.
 *
 * $kind is 'imap' or 'smtp'.
 */
function ccrm_resolve_mail_host($settings, $kind) {
    $key = ($kind === 'smtp') ? 'smtpHost' : 'imapHost';
    $explicit = trim((string)($settings[$key] ?? ''));
    if ($explicit !== '') {
        return $explicit;
    }

    if (($settings['provider'] ?? '') === 'exchange') {
        // Operators paste the OWA/autodiscover address here, sometimes with a
        // scheme and a path. Only the host part can be dialled.
        $exchange = trim((string)($settings['exchangeUrl'] ?? ''));
        if ($exchange !== '') {
            if (strpos($exchange, '//') === false) {
                $exchange = '//' . $exchange;
            }
            $parsed = @parse_url($exchange);
            $host = (is_array($parsed) && !empty($parsed['host'])) ? $parsed['host'] : $exchange;
            $host = trim($host, "/ \t\r\n");
            if ($host !== '') {
                return $host;
            }
        }
        // Nothing configured at all: hosted Microsoft 365 is the only defensible
        // guess left, and a wrong guess now surfaces as a visible error instead
        // of an empty timeline.
        return ($kind === 'smtp') ? 'smtp.office365.com' : 'outlook.office365.com';
    }

    throw new Exception(
        ($kind === 'smtp' ? 'Outgoing (SMTP)' : 'Mailbox (IMAP)')
        . ' server address is not configured. Set it in Personal Settings → E-mail.'
    );
}

function get_imap_mailbox_string($settings, $folder = '') {
    $host = ccrm_resolve_mail_host($settings, 'imap');
    $port = $settings['imapPort'];

    // Validate the server certificate by default. Every connection used to carry
    // /novalidate-cert, so anyone on the network path could present their own cert
    // and collect the mailbox password plus the whole mailbox. Operators running an
    // internal server with a self-signed cert can opt out per mailbox.
    $certOpt = !empty($settings['imapAllowSelfSigned']) ? '/novalidate-cert' : '/validate-cert';

    $sec = isset($settings['imapSecure']) ? $settings['imapSecure'] : 'ssl';
    $ssl = $certOpt;
    if ($sec === 'ssl' || $sec === true) {
        $ssl = '/ssl' . $certOpt;
    } elseif ($sec === 'tls') {
        $ssl = '/tls' . $certOpt;
    }

    // Exchange always speaks IMAPS. The host is whatever ccrm_resolve_mail_host()
    // worked out above — do not second-guess it here.
    if ($settings['provider'] === 'exchange') {
        $port = intval($port) > 0 ? $port : '993';
        $ssl = '/ssl' . $certOpt;
    }

    if (intval($port) <= 0) {
        throw new Exception('Mailbox (IMAP) port is not configured. Set it in Personal Settings → E-mail.');
    }

    return "{" . "$host:$port/imap$ssl" . "}$folder";
}

/**
 * The real name of this mailbox's "Sent" folder.
 *
 * Every caller used to hardcode the literal string "Sent". That is correct on
 * dovecot/websupport but wrong on plenty of servers (`INBOX.Sent`, `Sent Items`,
 * a localised name) — and a wrong folder name fails exactly the way an empty
 * mailbox looks: no error, and no outgoing mail on any timeline. Ask the server
 * instead, and fall back to the literal only when it tells us nothing.
 */
function ccrm_resolve_sent_folder($settings) {
    static $cache = [];
    $root = get_imap_mailbox_string($settings, '');
    if (isset($cache[$root])) {
        return $cache[$root];
    }

    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $cacheKey = sha1($root . '|' . strtolower((string)$imapUser));
    $cacheFile = sys_get_temp_dir() . '/ccrm_sent_folder_' . $cacheKey . '.txt';
    if (is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) < 86400) {
        $cachedFolder = trim((string)@file_get_contents($cacheFile));
        if ($cachedFolder !== '') {
            $cache[$root] = $cachedFolder;
            return $cachedFolder;
        }
    }

    $resolved = 'Sent';
    $stream = @imap_open($root, $imapUser, $imapPass, OP_HALFOPEN, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if ($stream) {
        $list = @imap_getmailboxes($stream, $root, '*');
        if (is_array($list)) {
            $names = [];
            foreach ($list as $box) {
                $names[] = str_replace($root, '', $box->name);
            }
            // Most specific first. Folder names travel as modified UTF-7, so a
            // localised name only matches once decoded.
            $candidates = [
                '[Gmail]/Sent Mail', '[Gmail]/Odoslaná pošta', '[Gmail]/Elküldött levelek',
                '[Gmail]/Gesendet', '[Google Mail]/Sent Mail',
                'Sent', 'INBOX.Sent', 'INBOX/Sent', 'Sent Items',
                'Sent Messages', 'Odoslané', 'Odoslaná pošta', 'Elküldött elemek',
            ];
            foreach ($candidates as $candidate) {
                foreach ($names as $n) {
                    if (strcasecmp($n, $candidate) === 0 || strcasecmp(@imap_utf8($n), $candidate) === 0) {
                        $resolved = $n;
                        break 2;
                    }
                }
            }
        }
        @imap_close($stream);
    }
    @imap_errors();

    @file_put_contents($cacheFile, $resolved);
    $cache[$root] = $resolved;
    return $resolved;
}

/**
 * Map a folder name the client asked for onto the one this server actually has.
 * Only "Sent" needs translating today — INBOX is universal, and anything else
 * came from the server's own folder listing already.
 */
function ccrm_canonical_folder($settings, $folder) {
    if (strcasecmp(trim((string)$folder), 'Sent') === 0) {
        return ccrm_resolve_sent_folder($settings);
    }
    return $folder;
}

/**
 * File a just-sent message into the mailbox's Sent folder.
 *
 * send_smtp_email() spoke SMTP and stopped there, so a mail composed inside CCRM
 * existed only at the recipient: it was in nobody's Sent folder, and the lead
 * timeline — which is rebuilt purely by re-reading IMAP — could never show it.
 * That is the "the e-mail we sent was not recorded" report.
 *
 * The message has already been accepted for delivery by the time this runs, so a
 * failure here is logged and swallowed: losing the archive copy must never be
 * reported to the user as a failed send.
 */
function ccrm_append_to_sent($settings, $rawMessage) {
    try {
        $folder = ccrm_resolve_sent_folder($settings);
        $mailbox = get_imap_mailbox_string($settings, $folder);
        list($imapUser, $imapPass) = get_imap_credentials($settings);

        $stream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
        if (!$stream) {
            error_log('CCRM: cannot open "' . $folder . '" to file a sent message: ' . imap_last_error());
            @imap_errors();
            return false;
        }

        $ok = @imap_append($stream, $mailbox, $rawMessage, "\\Seen");
        if (!$ok) {
            error_log('CCRM: IMAP APPEND to "' . $folder . '" failed: ' . imap_last_error());
        }
        @imap_close($stream);
        @imap_errors();
        return (bool) $ok;
    } catch (\Throwable $e) {
        error_log('CCRM: could not file sent message: ' . $e->getMessage());
        return false;
    }
}

/**
 * The stable timeline-event id for one IMAP message.
 *
 * This used to be "email-" . $uid. IMAP UIDs are scoped to one folder in one
 * mailbox, so Sent uid 133 collided with INBOX uid 133 and with every other
 * user's uid 133. The loser of a collision took the UPDATE branch of the upsert,
 * which rewrote title/timestamp/direction but left `lead_id` alone — filing a
 * message against a customer it was never about, and losing it from the customer
 * it WAS about. Scope the id by mailbox and folder so two messages can never
 * claim the same row.
 *
 * Stays inside `timeline_events`.`id` VARCHAR(50), and still starts with
 * "email-" so sync.php keeps recognising importer-owned rows.
 */
/**
 * The addresses this mailbox sends as, lower-cased.
 *
 * A message is ours when its From: is one of these. It used to be compared with
 * the CRM login ($GLOBALS['userEmail']), which is a different address whenever
 * someone signs in to the CRM as alex@crm.com but reads peter@company.sk here —
 * then every mail they sent was badged as incoming. SMTP sends as smtpUser (see
 * send_smtp_email), so that and the IMAP login are the mailbox's own identity.
 * Usernames that are not addresses (an Exchange domain login) are skipped.
 */
function ccrm_mailbox_addresses($settings) {
    list($imapUser) = get_imap_credentials($settings);
    list($smtpUser) = get_smtp_credentials($settings);
    $addresses = [];
    foreach ([$smtpUser, $imapUser] as $candidate) {
        $candidate = strtolower(trim((string)$candidate));
        if ($candidate !== '' && strpos($candidate, '@') !== false) {
            $addresses[$candidate] = true;
        }
    }
    return array_keys($addresses);
}

/**
 * Whether a message was sent by this mailbox. The sender address is
 * authoritative; the folder only decides when the mailbox has no address to
 * compare against.
 */
function ccrm_mail_is_outgoing($mailboxAddresses, $fromAddress, $folder) {
    if (!empty($mailboxAddresses)) {
        return in_array(strtolower(trim((string)$fromAddress)), $mailboxAddresses, true) ? 1 : 0;
    }
    return strcasecmp((string)$folder, 'Sent') === 0 ? 1 : 0;
}

function ccrm_mail_event_id($accountUser, $folder, $uid) {
    $scope = substr(sha1(strtolower(trim((string)$accountUser)) . '|' . strtolower(trim((string)$folder))), 0, 12);
    $tag = strtolower(preg_replace('/[^a-z0-9]/i', '', (string)$folder));
    $tag = $tag === '' ? 'box' : substr($tag, 0, 8);
    return 'email-' . $tag . '-' . $scope . '-' . intval($uid);
}

function test_mail_connections($settings) {
    // 1. Test IMAP
    $mailbox = get_imap_mailbox_string($settings);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, OP_HALFOPEN, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    
    if (!$imapStream) {
        return ['success' => false, 'error' => 'IMAP connection failed: ' . imap_last_error()];
    }
    @imap_close($imapStream);
    
    // 2. Test SMTP socket
    $host = ccrm_resolve_mail_host($settings, 'smtp');
    $port = intval($settings['smtpPort']);

    if ($settings['provider'] === 'exchange' && $port === 0) {
        $port = 587;
    }

    $sec = isset($settings['smtpSecure']) ? $settings['smtpSecure'] : 'ssl';
    $secure = ($sec === 'ssl' || $sec === true) ? 'ssl://' : '';
    if ($port === 587 || $sec === 'tls') {
        $secure = '';
    }
    
    $socket = @fsockopen($secure . $host, $port, $errno, $errstr, 5);
    if (!$socket) {
        return ['success' => false, 'error' => "SMTP connection failed to $host:$port. Error: $errstr ($errno)"];
    }
    fclose($socket);
    
    return ['success' => true];
}

function fetch_imap_folders($settings) {
    $mailbox = get_imap_mailbox_string($settings);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, OP_HALFOPEN, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        throw new Exception('IMAP connection failed: ' . imap_last_error());
    }
    
    $list = imap_getmailboxes($imapStream, $mailbox, "*");
    $folders = [];
    if ($list) {
        foreach ($list as $key => $val) {
            $name = str_replace($mailbox, "", $val->name);
            $folders[] = [
                'path' => $name,
                'name' => empty($name) ? 'INBOX' : $name,
                'delimiter' => $val->delimiter
            ];
        }
    }
    
    @imap_close($imapStream);
    return $folders;
}

function fetch_imap_emails($settings, $folder, $page, $limit, $filter, $searchEmail = null) {
    $mailbox = get_imap_mailbox_string($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $mailboxAddresses = ccrm_mailbox_addresses($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        throw new Exception('IMAP Connection failed: ' . imap_last_error());
    }

    // Respect `backfillSince` ("Earliest mail to file" / earliest date to load emails from)
    // when configured on the connector so a 159k-message mailbox only loads emails from
    // the chosen cutoff date onwards.
    $sinceCriterion = '';
    $cutoffTs = null;
    if (!empty($settings['backfillSince'])) {
        $ts = strtotime(trim((string)$settings['backfillSince']) . ' 00:00:00');
        if ($ts !== false && $ts > 0) {
            $cutoffTs = $ts;
            $sinceCriterion = 'SINCE "' . date('d-M-Y', $ts) . '"';
        }
    }

    // IMPORTANT: Never pass SE_UID to imap_search() or FT_UID to multi-message
    // imap_fetch_overview() — in PHP's uw-imap (c-client) library, both trigger
    // `FETCH 1:N (UID)` across the entire mailbox (159k+ messages) before returning!
    // Searching by sequence number and calling imap_fetch_overview(..., 0) touches
    // ONLY the matching messages, and each returned overview object already carries
    // both `$o->uid` (the stable IMAP UID) and `$o->msgno`.
    $seqNums = [];
    if (!empty($searchEmail)) {
        $qFrom = 'FROM "' . $searchEmail . '"' . ($sinceCriterion !== '' ? ' ' . $sinceCriterion : '');
        $qTo = 'TO "' . $searchEmail . '"' . ($sinceCriterion !== '' ? ' ' . $sinceCriterion : '');
        $seqsFrom = @imap_search($imapStream, $qFrom);
        $seqsTo = @imap_search($imapStream, $qTo);
        $combined = [];
        if (is_array($seqsFrom)) {
            $combined = array_merge($combined, $seqsFrom);
        }
        if (is_array($seqsTo)) {
            $combined = array_merge($combined, $seqsTo);
        }
        $seqNums = array_unique(array_map('intval', $combined));
    } else {
        $parts = [];
        if ($filter === 'unread') {
            $parts[] = 'UNSEEN';
        }
        if ($sinceCriterion !== '') {
            $parts[] = $sinceCriterion;
        }
        $criteria = !empty($parts) ? implode(' ', $parts) : 'ALL';
        if ($criteria === 'ALL') {
            $numMsg = (int)@imap_num_msg($imapStream);
            $seqNums = $numMsg > 0 ? range(1, $numMsg) : [];
        } else {
            $found = @imap_search($imapStream, $criteria);
            $seqNums = is_array($found) ? array_map('intval', $found) : [];
        }
    }
    $emails = [];
    $total = 0;
    $unseen = 0;

    // Get unseen count (scoped to backfillSince when configured)
    if ($sinceCriterion !== '') {
        if ($filter === 'unread' && empty($searchEmail)) {
            $unseen = count($seqNums);
        } else {
            $unseenFound = @imap_search($imapStream, 'UNSEEN ' . $sinceCriterion);
            $unseen = is_array($unseenFound) ? count($unseenFound) : 0;
        }
    } else {
        $status = @imap_status($imapStream, $mailbox, SA_UNSEEN);
        if ($status) {
            $unseen = (int)$status->unseen;
        }
    }

    if (!empty($seqNums)) {
        $total = count($seqNums);
        rsort($seqNums, SORT_NUMERIC); // Newest first

        $startIdx = ($page - 1) * $limit;
        $sliceSeqs = array_slice($seqNums, $startIdx, $limit);

        if (!empty($sliceSeqs)) {
            // Fetch overviews by sequence number (0) so c-client never scans 1:N UIDs.
            // Every returned $o object includes $o->uid and $o->msgno.
            $overview = @imap_fetch_overview($imapStream, implode(',', $sliceSeqs), 0);
            if (!is_array($overview)) {
                $overview = [];
            }
            usort($overview, function ($a, $b) {
                return ((int)($b->uid ?? 0)) <=> ((int)($a->uid ?? 0));
            });

            // Preload address index and author once outside the loop instead of per message
            $addressIndex = null;
            $resolvedEventAuthor = null;
            $accountEmail = isset($GLOBALS['userEmail']) ? strtolower(trim($GLOBALS['userEmail'])) : '';
            if (isset($GLOBALS['pdo'])) {
                require_once __DIR__ . '/mail_filing.php';
                $addressIndex = ccrm_mail_address_index($GLOBALS['pdo']);
                if ($accountEmail !== '') {
                    $authorStmt = $GLOBALS['pdo']->prepare("SELECT `name` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1");
                    $authorStmt->execute([$accountEmail]);
                    $resolvedAuthor = $authorStmt->fetchColumn();
                    if ($resolvedAuthor !== false && trim((string)$resolvedAuthor) !== '') {
                        $resolvedEventAuthor = $resolvedAuthor;
                    }
                }
            }

            // Map headers to structured entities
            $emailsMap = [];
            $sliceUids = [];
            $livePreviewBudget = 5;
            foreach ($overview as $o) {
                $sliceUids[] = (int)$o->uid;
                // Parse "From" header
                $fromHeader = isset($o->from) ? $o->from : '';
                $fromName = $fromHeader;
                $fromAddress = $fromHeader;
                
                if (preg_match('/^(.*?)\s*<(.*?)>$/', $fromHeader, $matches)) {
                    $fromName = trim($matches[1], '"\' ');
                    $fromAddress = trim($matches[2]);
                }

                // Parse "To" header
                $toHeader = isset($o->to) ? $o->to : '';
                $toName = $toHeader;
                $toAddress = $toHeader;
                
                if (preg_match('/^(.*?)\s*<(.*?)>$/', $toHeader, $matches)) {
                    $toName = trim($matches[1], '"\' ');
                    $toAddress = trim($matches[2]);
                }
                
                $summary = '';
                $cachedBodyPreview = '';
                if (isset($GLOBALS['pdo']) && isset($GLOBALS['userEmail'])) {
                    try {
                        $sumStmt = $GLOBALS['pdo']->prepare("SELECT `summary` FROM `email_summaries` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
                        $sumStmt->execute([$GLOBALS['userEmail'], $folder, $o->uid]);
                        $summary = $sumStmt->fetchColumn() ?: '';
                        $ragStmt = $GLOBALS['pdo']->prepare("SELECT SUBSTRING(`body`, 1, 240) FROM `rag_emails` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ? LIMIT 1");
                        $ragStmt->execute([$GLOBALS['userEmail'], $folder, $o->uid]);
                        $cachedBodyPreview = trim((string)($ragStmt->fetchColumn() ?: ''));
                    } catch (\Exception $e) {
                        $summary = '';
                    }
                }

                // The canonical timeline id for this message, handed to the client
                // so both sides agree on it.
                $mailEventId = ccrm_mail_event_id($imapUser, $folder, $o->uid);
                if ($cachedBodyPreview !== '') {
                    $listPreview = ['preview' => safe_utf8(preg_replace('/\s+/u', ' ', $cachedBodyPreview)), 'attachment_count' => 0];
                } elseif ($livePreviewBudget > 0) {
                    $livePreviewBudget--;
                    $listPreview = fetch_list_preview($imapStream, $o->uid);
                } else {
                    $listPreview = ['preview' => '', 'attachment_count' => 0];
                }
                $isOutgoing = ccrm_mail_is_outgoing($mailboxAddresses, $fromAddress, $folder);

                $emailsMap[$o->uid] = [
                    'uid' => $o->uid,
                    'event_id' => $mailEventId,
                    'subject' => isset($o->subject) ? ccrm_decode_mime_header($o->subject) : '(No Subject)',
                    'from' => [
                        'name' => ccrm_decode_mime_header($fromName),
                        'address' => safe_utf8($fromAddress)
                    ],
                    'to' => [
                        'name' => ccrm_decode_mime_header($toName),
                        'address' => safe_utf8($toAddress)
                    ],
                    'date' => isset($o->date) ? date('Y-m-d H:i:s', strtotime($o->date)) : '',
                    // Decided here, where the mailbox's own address is known; the
                    // client only has the CRM login, which may be another address.
                    'is_outgoing' => (bool)$isOutgoing,
                    'seen' => isset($o->seen) ? (bool)$o->seen : false,
                    'size' => isset($o->size) ? intval($o->size) : 0,
                    'message_id' => isset($o->message_id) ? trim($o->message_id) : '',
                    'in_reply_to' => isset($o->in_reply_to) ? trim($o->in_reply_to) : '',
                    'references' => isset($o->references) ? trim($o->references) : '',
                    'summary' => $summary,
                    'preview' => $listPreview['preview'],
                    'attachment_count' => $listPreview['attachment_count']
                ];

                // Auto-upsert timeline email entries to database with email date and time
                if (isset($GLOBALS['pdo']) && is_array($addressIndex)) {
                    $pdo = $GLOBALS['pdo'];
                    $matchAddresses = ccrm_mail_counterparties(
                        ccrm_mail_addresses_in($fromHeader),
                        ccrm_mail_addresses_in($toHeader),
                        [],
                        $mailboxAddresses,
                        (bool)$isOutgoing
                    );
                    if (!empty($searchEmail)) {
                        $matchAddresses[] = strtolower(trim($searchEmail));
                    }
                    $matchedLeadId = ccrm_mail_match_row($addressIndex, $matchAddresses);

                    if ($matchedLeadId) {
                        $eventId = $mailEventId;
                        $timestamp = isset($o->date) ? date('Y-m-d H:i:s', strtotime($o->date)) : date('Y-m-d H:i:s');
                        $title = isset($o->subject) ? ccrm_decode_mime_header($o->subject) : '(No Subject)';
                        $content = "From: " . $fromName . " <" . $fromAddress . ">\nTo: " . $toName . " <" . $toAddress . ">\nSubject: " . $title;
                        $eventAuthor = $isOutgoing ? $resolvedEventAuthor : null;

                        $stored = ccrm_mail_store_event($pdo, [
                            'lead_id' => $matchedLeadId,
                            'event_id' => $eventId,
                            'timestamp' => $timestamp,
                            'title' => mb_substr($title, 0, 255, 'UTF-8'),
                            'content' => $content,
                            'is_outgoing' => (bool)$isOutgoing,
                            'author' => $eventAuthor,
                            'mail_account' => $imapUser,
                            'mail_owner' => $accountEmail !== '' ? $accountEmail : null,
                            'message_id' => isset($o->message_id) ? mb_substr(trim($o->message_id), 0, 255, 'UTF-8') : '',
                            'body' => null,
                            'attachments' => [],
                        ]);
                        if ($stored === 'hidden' || $stored === 'duplicate') {
                            $emailsMap[$o->uid]['timeline_hidden'] = true;
                        }
                    }
                }
            }
            
            // Retain sorting (newest first), then append anything the requested
            // order did not cover so a key mismatch can never hide a message
            foreach ($sliceUids as $uid) {
                if (isset($emailsMap[$uid])) {
                    $emails[] = $emailsMap[$uid];
                    unset($emailsMap[$uid]);
                }
            }
            foreach ($emailsMap as $leftover) {
                $emails[] = $leftover;
            }
        }
    }
    
    @imap_close($imapStream);
    
    return [
        'emails' => $emails,
        'pagination' => [
            'total' => $total,
            'unseen' => $unseen,
            'page' => $page,
            'limit' => $limit,
            'pages' => ceil($total / $limit)
        ]
    ];
}

function fetch_imap_email_detail($settings, $folder, $uid) {
    $mailbox = get_imap_mailbox_string($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        throw new Exception('IMAP Detail Connection failed: ' . imap_last_error());
    }

    $uidInt = (int)$uid;
    // Use FT_UID directly so c-client sends `UID FETCH <uid> ...` without
    // executing `FETCH 1:N (UID)` across the entire mailbox via imap_msgno().
    $structure = @imap_fetchstructure($imapStream, $uidInt, FT_UID);
    if (!$structure) {
        @imap_close($imapStream);
        @imap_errors();
        throw new Exception('This message is no longer in ' . $folder . ' (it may have been moved or deleted).');
    }

    // Fetch body parts
    $html = '';
    $text = '';
    $attachments = get_attachments_from_structure($structure);
    if (isset($structure->parts) && count($structure->parts)) {
        foreach ($structure->parts as $partNo => $part) {
            if (isset($part->parts)) {
                foreach ($part->parts as $nestedPartNo => $nestedPart) {
                    $partStr = ($partNo + 1) . '.' . ($nestedPartNo + 1);
                    $body = @imap_fetchbody($imapStream, $uidInt, $partStr, FT_UID | FT_PEEK);
                    $body = decode_imap_body($body, $nestedPart->encoding, get_part_charset($nestedPart));
                    if (isset($nestedPart->subtype) && $nestedPart->subtype === 'HTML') {
                        $html = $body;
                    } elseif (isset($nestedPart->subtype) && $nestedPart->subtype === 'PLAIN') {
                        $text = $body;
                    }
                }
            } else {
                $body = @imap_fetchbody($imapStream, $uidInt, (string)($partNo + 1), FT_UID | FT_PEEK);
                $body = decode_imap_body($body, $part->encoding, get_part_charset($part));
                if (isset($part->subtype) && $part->subtype === 'HTML') {
                    $html = $body;
                } elseif (isset($part->subtype) && $part->subtype === 'PLAIN') {
                    $text = $body;
                }
            }
        }
    } else {
        $body = @imap_body($imapStream, $uidInt, FT_UID | FT_PEEK);
        $body = decode_imap_body($body, $structure->encoding, get_part_charset($structure));
        if (isset($structure->subtype) && $structure->subtype === 'HTML') {
            $html = $body;
        } else {
            $text = $body;
        }
    }

    // Read the current seen state without altering it when the mailbox is small;
    // on huge mailboxes (>2000 messages) imap_fetch_overview(..., FT_UID) scans 1:N,
    // so let the client keep its envelope seen flag.
    $out = [
        'uid' => $uid,
        'html' => safe_utf8($html),
        'text' => safe_utf8($text),
        'attachments' => $attachments,
    ];
    if ((int)@imap_num_msg($imapStream) <= 2000) {
        $overview = @imap_fetch_overview($imapStream, (string)$uidInt, FT_UID);
        $out['seen'] = (is_array($overview) && !empty($overview) && is_object($overview[0]) && isset($overview[0]->seen))
            ? (bool)$overview[0]->seen
            : false;
    }

    @imap_close($imapStream);
    @imap_errors();

    return $out;
}

/**
 * Set or clear \Seen on one message, addressed by UID, and read the flag back.
 *
 * The IMAP flag is the single source of truth for "read": it is what the
 * user's mail client shows, so it is what the CRM shows and what the CRM
 * changes. Every body fetch in this file peeks (FT_PEEK), because a plain
 * BODY[] fetch makes the server set \Seen as a side effect - that is how the
 * background inbox poll and the RAG cache used to mark every message read
 * before anyone had opened it. This helper is therefore the ONLY place the
 * flag changes, and it does so only when a user explicitly requests to toggle
 * the read state via the set_seen endpoint.
 *
 * Returns the flag as the server reports it afterwards, or null when the
 * message could not be found under that UID.
 */
function ccrm_set_seen_flag($imapStream, $uid, $seen) {
    $uid = (int)$uid;
    if ($uid <= 0) {
        return null;
    }
    if ($seen) {
        @imap_setflag_full($imapStream, (string)$uid, "\\Seen", ST_UID);
    } else {
        @imap_clearflag_full($imapStream, (string)$uid, "\\Seen", ST_UID);
    }
    $overview = @imap_fetch_overview($imapStream, (string)$uid, FT_UID);
    if (!is_array($overview) || empty($overview) || !is_object($overview[0])) {
        return null;
    }
    return isset($overview[0]->seen) ? (bool)$overview[0]->seen : null;
}

function set_imap_email_seen($settings, $folder, $uid, $seen) {
    $mailbox = get_imap_mailbox_string($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        throw new Exception('IMAP connection failed: ' . imap_last_error());
    }
    $result = ccrm_set_seen_flag($imapStream, $uid, $seen);
    @imap_close($imapStream);
    @imap_errors();
    if ($result === null) {
        throw new Exception('This message is no longer in ' . $folder . ' (it may have been moved or deleted).');
    }
    if ($result !== (bool)$seen) {
        throw new Exception('The mail server did not accept the read-state change.');
    }
    return $result;
}

function get_part_charset($part) {
    if (isset($part->ifparameters) && $part->ifparameters && isset($part->parameters)) {
        foreach ($part->parameters as $object) {
            if (isset($object->attribute) && strcasecmp($object->attribute, 'charset') === 0) {
                return $object->value;
            }
        }
    }
    return null;
}

function decode_imap_body($body, $encoding, $charset = null) {
    if ($encoding == 3) { // BASE64
        $body = base64_decode($body);
    } elseif ($encoding == 4) { // QUOTED-PRINTABLE
        $body = quoted_printable_decode($body);
    }
    if ($charset && strcasecmp($charset, 'UTF-8') !== 0 && strcasecmp($charset, 'US-ASCII') !== 0) {
        $converted = @iconv($charset, 'UTF-8//IGNORE', $body);
        if ($converted === false) {
            $converted = @mb_convert_encoding($body, 'UTF-8', $charset);
        }
        if ($converted !== false) {
            return $converted;
        }
    }
    return $body;
}

function delete_imap_email($settings, $folder, $uid) {
    $mailbox = get_imap_mailbox_string($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        throw new Exception('IMAP connection failed.');
    }
    
    // Move to Trash or delete
    @imap_mail_move($imapStream, $uid, 'Trash', CP_UID);
    @imap_expunge($imapStream);
    @imap_close($imapStream);
}

function send_smtp_email($settings, $to, $subject, $html) {
    ccrm_mail_refuse_reserved((string)$to);
    $host = ccrm_resolve_mail_host($settings, 'smtp');
    $port = intval($settings['smtpPort']);

    if ($settings['provider'] === 'exchange' && $port === 0) {
        $port = 587;
    }

    list($smtpUser, $smtpPass) = get_smtp_credentials($settings);
    
    $sec = isset($settings['smtpSecure']) ? $settings['smtpSecure'] : 'ssl';
    $secure = ($sec === 'ssl' || $sec === true) ? 'ssl://' : '';
    if ($port === 587 || $sec === 'tls') {
        $secure = '';
    }
    
    $socket = @fsockopen($secure . $host, $port, $errno, $errstr, 10);
    if (!$socket) {
        throw new Exception("Could not connect to SMTP server $host:$port — $errstr ($errno)");
    }
    stream_set_timeout($socket, 20);

    // Read a WHOLE reply, not one line of it. EHLO answers with several lines
    // ("250-PIPELINING", "250-SIZE", ..., "250 HELP"); reading a single line left
    // the rest in the buffer, so every later read returned the previous command's
    // leftovers. With the protocol desynced like that no reply code could be
    // trusted — which is why they were almost all ignored, and why a rejected
    // recipient or body was still reported to the user as a successful send.
    $readReply = function () use ($socket) {
        $out = '';
        while (($line = fgets($socket, 1024)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break; // "250-" continues, "250 " ends
        }
        return $out;
    };
    // Accepts any of the listed codes: a recipient may come back 250 or 251
    // ("will forward"), and rejecting the second would fail a delivered message.
    $expect = function ($reply, $codes, $stage) {
        $head = ltrim($reply);
        foreach ((array) $codes as $code) {
            if (strpos($head, $code) === 0) {
                return;
            }
        }
        throw new Exception("SMTP $stage failed: " . ($head === '' ? 'no reply from the server' : trim($head)));
    };

    $readReply(); // welcome banner

    $ehlo = "EHLO " . (!empty($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : 'localhost') . "\r\n";
    fwrite($socket, $ehlo);
    $readReply();

    // STARTTLS if Port 587 or security is tls
    if ($port === 587 || $sec === 'tls') {
        fwrite($socket, "STARTTLS\r\n");
        $expect($readReply(), '220', 'STARTTLS');
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception("TLS encryption handshake negotiation failed.");
        }
        // Send EHLO again after TLS start
        fwrite($socket, $ehlo);
        $readReply();
    }

    // Auth login
    fwrite($socket, "AUTH LOGIN\r\n");
    $expect($readReply(), '334', 'AUTH LOGIN');

    fwrite($socket, base64_encode($smtpUser) . "\r\n");
    $expect($readReply(), '334', 'AUTH username');

    fwrite($socket, base64_encode($smtpPass) . "\r\n");
    $expect($readReply(), '235', 'authentication');

    fwrite($socket, "MAIL FROM: <" . $smtpUser . ">\r\n");
    $expect($readReply(), '250', 'MAIL FROM');

    fwrite($socket, "RCPT TO: <" . $to . ">\r\n");
    $expect($readReply(), ['250', '251'], 'RCPT TO <' . $to . '>');

    fwrite($socket, "DATA\r\n");
    $expect($readReply(), '354', 'DATA');

    // Build the message ONCE: the bytes handed to SMTP are the same bytes filed
    // into Sent below, so what the timeline shows is what the recipient got.
    $domain = strpos($smtpUser, '@') !== false ? substr(strrchr($smtpUser, '@'), 1) : 'ccrm.local';
    $messageId = '<' . bin2hex(random_bytes(12)) . '@' . $domain . '>';

    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: <" . $smtpUser . ">\r\n";
    $headers .= "To: <" . $to . ">\r\n";
    $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $headers .= "Message-ID: " . $messageId . "\r\n";
    $headers .= "Date: " . date('r') . "\r\n\r\n";

    $message = $headers . $html;
    // CRLF line endings, and dot-stuffing so a body line of "." cannot end DATA early.
    $wire = preg_replace('/\r\n|\r|\n/', "\r\n", $message);
    $wire = preg_replace('/^\./m', '..', $wire);

    fwrite($socket, $wire . "\r\n.\r\n");
    $expect($readReply(), '250', 'message body');

    fwrite($socket, "QUIT\r\n");
    fclose($socket);

    // Accepted for delivery. Filing the archive copy is best-effort from here on,
    // but it is what makes the send visible to the timeline importer at all.
    $filed = ccrm_append_to_sent($settings, $message);

    return ['message_id' => $messageId, 'filed_to_sent' => $filed];
}

/** True when the system outbound profile has enough in it to attempt a send. */
function ccrm_system_mail_configured(array $config): bool {
    $provider = $config['emailProvider'] ?? ($config['provider'] ?? 'smtp');
    if ($provider === 'exchange') {
        return ($config['exchMailbox'] ?? '') !== '' && ($config['exchPassword'] ?? '') !== '';
    }
    return ($config['smtpHost'] ?? '') !== '' && intval($config['smtpPort'] ?? 0) > 0;
}

/**
 * Send a message through the SYSTEM outbound profile (INTEGRATIONS_CONFIG).
 * Unlike send_smtp_email() this validates every SMTP reply code, so a rejected
 * auth/recipient/relay surfaces as a real error instead of a silent no-op —
 * that silent no-op is exactly why the previous front-end "simulation"
 * reported success while nothing was ever delivered, and why workflow
 * "Send e-mail" actions logged success with nothing in the inbox.
 *
 * Throws on any misconfiguration or SMTP-level rejection.
 *
 * `$extraHeaders` is a name => value map added to the message head, e.g. the
 * X-Priority / Importance pair from ccrm_task_priority_mail_headers(). Names
 * that are not plain header tokens are dropped and CR/LF is stripped from
 * values, so a caller cannot inject a header or end the head early.
 */
function ccrm_send_system_mail(array $config, string $to, string $subject, string $html, array $extraHeaders = []) {
    $to = trim($to);
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        throw new Exception('No valid recipient address: ' . ($to === '' ? '(empty)' : $to));
    }
    ccrm_mail_refuse_reserved($to);

    $provider = $config['emailProvider'] ?? ($config['provider'] ?? 'smtp');

    $host    = (string)($config['smtpHost'] ?? '');
    $port    = intval($config['smtpPort'] ?? 0);
    $sec     = $config['smtpSecure'] ?? 'ssl';
    $user    = (string)($config['smtpUser'] ?? '');
    $pass    = (string)($config['smtpPassword'] ?? '');
    $useAuth = ($config['smtpAuth'] ?? true) !== false;

    if ($provider === 'exchange') {
        // Server-side Exchange verification uses Office365 SMTP with basic auth
        // over STARTTLS. OAuth-only mailboxes cannot be exercised from here.
        $host    = 'smtp.office365.com';
        $port    = 587;
        $sec     = 'tls';
        $useAuth = true;
        $user    = (string)($config['exchMailbox'] ?? '');
        $pass    = (string)($config['exchPassword'] ?? '');
        if ($user === '' || $pass === '') {
            throw new Exception('Exchange test send needs a mailbox address and password (basic auth). OAuth-only profiles cannot be verified by sending from the server.');
        }
    }

    if ($host === '' || $port === 0) {
        throw new Exception('Outgoing mail server is not configured. Save the SMTP host and port first.');
    }
    if ($useAuth && ($user === '' || $pass === '')) {
        throw new Exception('SMTP authentication is enabled but the username or password is missing.');
    }

    $senderEmail = (string)($config['senderEmail'] ?? '');
    if ($senderEmail === '') {
        $senderEmail = $user;
    }
    $senderName = (string)($config['senderName'] ?? '');

    $secure = ($sec === 'ssl' || $sec === true) ? 'ssl://' : '';
    if ($port === 587 || $sec === 'tls') {
        $secure = '';
    }

    $socket = @fsockopen($secure . $host, $port, $errno, $errstr, 10);
    if (!$socket) {
        throw new Exception("Could not connect to SMTP server $host:$port — $errstr ($errno)");
    }
    stream_set_timeout($socket, 15);

    $read = function () use ($socket) {
        $data = '';
        while (($line = fgets($socket, 515)) !== false) {
            $data .= $line;
            // A multi-line reply keeps a hyphen at offset 3 ("250-...");
            // the final line uses a space ("250 ...").
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        return $data;
    };
    $expect = function ($prefixes, $stage) use ($read) {
        $resp = $read();
        foreach ((array)$prefixes as $p) {
            if (strncmp($resp, $p, strlen($p)) === 0) {
                return $resp;
            }
        }
        throw new Exception("SMTP $stage was rejected: " . trim($resp));
    };
    $send = function ($cmd) use ($socket) {
        fwrite($socket, $cmd . "\r\n");
    };

    $serverName = $_SERVER['SERVER_NAME'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost');

    $expect('220', 'greeting');
    $send('EHLO ' . $serverName);
    $expect('250', 'EHLO');

    if ($port === 587 || $sec === 'tls') {
        $send('STARTTLS');
        $expect('220', 'STARTTLS');
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception('TLS encryption handshake negotiation failed.');
        }
        $send('EHLO ' . $serverName);
        $expect('250', 'EHLO (after STARTTLS)');
    }

    if ($useAuth) {
        $send('AUTH LOGIN');
        $expect('334', 'AUTH LOGIN');
        $send(base64_encode($user));
        $expect('334', 'username');
        $send(base64_encode($pass));
        $expect('235', 'authentication');
    }

    $send('MAIL FROM: <' . $senderEmail . '>');
    $expect(['250'], 'MAIL FROM');
    $send('RCPT TO: <' . $to . '>');
    $expect(['250', '251'], 'RCPT TO');
    $send('DATA');
    $expect('354', 'DATA');

    $fromHeader = $senderName !== ''
        ? '=?UTF-8?B?' . base64_encode($senderName) . '?= <' . $senderEmail . '>'
        : '<' . $senderEmail . '>';

    $message  = "MIME-Version: 1.0\r\n";
    $message .= "Content-Type: text/html; charset=UTF-8\r\n";
    $message .= "From: " . $fromHeader . "\r\n";
    $message .= "To: <" . $to . ">\r\n";
    $message .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    foreach ($extraHeaders as $name => $value) {
        if (!is_string($name) || !preg_match('/^[A-Za-z][A-Za-z0-9-]*$/', $name)) continue;
        $message .= $name . ': ' . str_replace(["\r", "\n"], '', (string)$value) . "\r\n";
    }
    $message .= "Date: " . date('r') . "\r\n\r\n";
    $message .= $html;
    // Dot-stuff any line that begins with '.' so it is not read as end-of-data.
    $message = preg_replace('/^\./m', '..', $message);

    $send($message . "\r\n.");
    $expect('250', 'message body');
    $send('QUIT');
    fclose($socket);
}

/**
 * Send a diagnostic test message through the SYSTEM outbound profile.
 */
function send_system_test_email(array $config, string $to, string $lang = 'en') {
    if ($lang === 'sk') {
        $subject = (KOPERNIQ_PRODUCT_NAME . ' — testovací e-mail');
        $body    = ('Toto je testovacia správa z ' . KOPERNIQ_PRODUCT_NAME . '. Ak ste ju dostali, odchádzajúci e-mailový server je nastavený správne.');
    } elseif ($lang === 'hu') {
        $subject = (KOPERNIQ_PRODUCT_NAME . ' — teszt e-mail');
        $body    = ('Ez egy teszt üzenet a ' . KOPERNIQ_PRODUCT_NAME . '-ből. Ha megkapta, a kimenő levelezőszerver helyesen van beállítva.');
    } else {
        $subject = (KOPERNIQ_PRODUCT_NAME . ' — test email');
        $body    = ('This is a test message from ' . KOPERNIQ_PRODUCT_NAME . '. If you received it, the outgoing mail server is configured correctly.');
    }

    $html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">'
        . ('<h2 style="font-size:18px;margin:0 0 16px">' . KOPERNIQ_PRODUCT_NAME . '</h2>')
        . '<p style="font-size:14px;line-height:1.5;margin:0">' . htmlspecialchars($body, ENT_QUOTES, 'UTF-8') . '</p>'
        . '</div>';

    ccrm_send_system_mail($config, $to, $subject, $html);
}

function get_attachments_from_structure($structure) {
    $attachments = [];
    if (!isset($structure->parts) || !count($structure->parts)) {
        return $attachments;
    }
    foreach ($structure->parts as $partNo => $part) {
        $attachment = get_part_attachment($part, $partNo + 1);
        if ($attachment) {
            $attachments[] = $attachment;
        }
        // Check nested parts
        if (isset($part->parts) && count($part->parts)) {
            foreach ($part->parts as $nestedPartNo => $nestedPart) {
                $nestedAttachment = get_part_attachment($nestedPart, ($partNo + 1) . '.' . ($nestedPartNo + 1));
                if ($nestedAttachment) {
                    $attachments[] = $nestedAttachment;
                }
            }
        }
    }
    return $attachments;
}

function get_part_attachment($part, $partNum) {
    $filename = '';
    $name = '';
    
    if ($part->ifdparameters) {
        foreach ($part->dparameters as $object) {
            if (strtolower($object->attribute) == 'filename') {
                $filename = $object->value;
            }
        }
    }
    
    if ($part->ifparameters) {
        foreach ($part->parameters as $object) {
            if (strtolower($object->attribute) == 'name') {
                $name = $object->value;
            }
        }
    }
    
    $finalName = $filename ?: $name;
    if (empty($finalName)) {
        return null;
    }
    
    // Check if it's an attachment
    $isAttachment = false;
    if ($part->ifdisposition && (strtolower($part->disposition) == 'attachment' || strtolower($part->disposition) == 'inline')) {
        $isAttachment = true;
    }
    // Also fallback check for common types or size
    if (!$isAttachment && $part->type > 1) { // 0 = TEXT, 1 = MULTIPART
        $isAttachment = true;
    }
    
    if ($isAttachment) {
        return [
            'part_num' => $partNum,
            'name' => ccrm_decode_mime_header($finalName),
            'size' => isset($part->bytes) ? $part->bytes : 0,
            'type' => isset($part->subtype) ? strtolower($part->subtype) : ''
        ];
    }
    return null;
}

function serve_imap_attachment($settings, $folder, $uid, $partNum, $name) {
    $mailbox = get_imap_mailbox_string($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        throw new Exception('IMAP connection failed.');
    }

    $uidInt = (int)$uid;
    $structure = @imap_fetchstructure($imapStream, $uidInt, FT_UID);
    if (!$structure) {
        @imap_close($imapStream);
        throw new Exception('This message is no longer in ' . $folder . ' (it may have been moved or deleted).');
    }
    // Find the part encoding
    $encoding = 0;
    
    // Helper to find encoding
    $part = find_structure_part($structure, $partNum);
    if ($part) {
        $encoding = $part->encoding;
    }
    
    $data = @imap_fetchbody($imapStream, $uidInt, $partNum, FT_UID | FT_PEEK);
    $data = decode_imap_body($data, $encoding);
    
    @imap_close($imapStream);
    
    header('Content-Description: File Transfer');
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . basename($name) . '"');
    header('Content-Transfer-Encoding: binary');
    header('Expires: 0');
    header('Cache-Control: must-revalidate');
    header('Pragma: public');
    header('Content-Length: ' . strlen($data));
    echo $data;
    exit;
}

function find_structure_part($structure, $partNum) {
    if (empty($partNum)) {
        return $structure;
    }
    if (!$structure || !is_object($structure)) {
        return null;
    }
    $parts = explode('.', $partNum);
    $current = $structure;
    foreach ($parts as $p) {
        $idx = intval($p) - 1;
        if (is_object($current) && isset($current->parts) && is_array($current->parts) && isset($current->parts[$idx])) {
            $current = $current->parts[$idx];
        } else {
            return null;
        }
    }
    return $current;
}

function fetch_email_body_text($imapStream, $msgNo) {
    $structure = @imap_fetchstructure($imapStream, $msgNo);
    $html = '';
    $text = '';
    if ($structure) {
        if (isset($structure->parts) && count($structure->parts)) {
            foreach ($structure->parts as $partNo => $part) {
                if (isset($part->parts)) {
                    foreach ($part->parts as $nestedPartNo => $nestedPart) {
                        $partStr = ($partNo + 1) . '.' . ($nestedPartNo + 1);
                        $body = @imap_fetchbody($imapStream, $msgNo, $partStr, FT_PEEK);
                        $body = decode_imap_body($body, $nestedPart->encoding, get_part_charset($nestedPart));
                        if (isset($nestedPart->subtype) && $nestedPart->subtype === 'HTML') {
                            $html = $body;
                        } elseif (isset($nestedPart->subtype) && $nestedPart->subtype === 'PLAIN') {
                            $text = $body;
                        }
                    }
                } else {
                    $body = @imap_fetchbody($imapStream, $msgNo, (string)($partNo + 1), FT_PEEK);
                    $body = decode_imap_body($body, $part->encoding, get_part_charset($part));
                    if (isset($part->subtype) && $part->subtype === 'HTML') {
                        $html = $body;
                    } elseif (isset($part->subtype) && $part->subtype === 'PLAIN') {
                        $text = $body;
                    }
                }
            }
        } else {
            $body = @imap_body($imapStream, $msgNo, FT_PEEK);
            $body = decode_imap_body($body, $structure->encoding, get_part_charset($structure));
            if (isset($structure->subtype) && $structure->subtype === 'HTML') {
                $html = $body;
            } else {
                $text = $body;
            }
        }
    }
    
    if (!empty($text)) {
        return trim($text);
    }
    if (!empty($html)) {
        return trim(strip_tags($html));
    }
    return '';
}

// What the inbox list shows under the subject: a short plain-text preview and
// the attachment count. Unlike fetch_email_body_text() this downloads only the
// one text part it needs — never an attachment's bytes — since it runs for
// every row of every list page.
function fetch_list_preview($imapStream, $uid) {
    $result = ['preview' => '', 'attachment_count' => 0];
    $uidInt = (int)$uid;
    if ($uidInt <= 0) {
        return $result;
    }
    $structure = @imap_fetchstructure($imapStream, $uidInt, FT_UID);
    if (!$structure) {
        return $result;
    }
    $result['attachment_count'] = count(get_attachments_from_structure($structure));

    // Find the first plain-text part, falling back to the first HTML one.
    $plain = null;
    $html = null;
    $walk = function ($part, $partNum) use (&$walk, &$plain, &$html) {
        if (isset($part->parts) && count($part->parts)) {
            foreach ($part->parts as $i => $child) {
                $walk($child, $partNum === '' ? (string)($i + 1) : $partNum . '.' . ($i + 1));
            }
            return;
        }
        if ((int)$part->type !== 0 || get_part_attachment($part, $partNum ?: '1')) {
            return;
        }
        $subtype = isset($part->subtype) ? strtoupper($part->subtype) : 'PLAIN';
        if ($subtype === 'PLAIN' && $plain === null) {
            $plain = [$part, $partNum];
        } elseif ($subtype === 'HTML' && $html === null) {
            $html = [$part, $partNum];
        }
    };
    $walk($structure, '');
    $pick = $plain ?: $html;
    if (!$pick) {
        return $result;
    }
    list($part, $partNum) = $pick;
    $raw = $partNum === ''
        ? @imap_body($imapStream, $uidInt, FT_UID | FT_PEEK)
        : @imap_fetchbody($imapStream, $uidInt, $partNum, FT_UID | FT_PEEK);
    $text = decode_imap_body($raw, $part->encoding, get_part_charset($part));
    if ($pick === $html) {
        $text = preg_replace('#<(style|script|head)\b[^>]*>.*?</\1>#is', ' ', $text);
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
    // Drop quoted history ("> ...") and the "On <date>, X wrote:" line above it,
    // so a reply previews what was actually written.
    $lines = [];
    foreach (preg_split('/\R/u', (string)$text) as $line) {
        if (preg_match('/^\s*>/', $line)) {
            continue;
        }
        $lines[] = $line;
    }
    $text = preg_replace('/\s+/u', ' ', implode(' ', $lines));
    $text = preg_replace('/\s*(On|Dňa|Dna)\s.{0,120}?(wrote|napísal\(a\)|napísal|napísala|írta):\s*$/iu', '', $text);
    $text = trim(safe_utf8($text));
    if (function_exists('mb_substr')) {
        $text = mb_substr($text, 0, 240, 'UTF-8');
    } else {
        $text = substr($text, 0, 240);
    }
    $result['preview'] = $text;
    return $result;
}

function save_imap_attachment_to_uploads($settings, $folder, $uid, $partNum, $name, $eventId) {
    // The attachment name is caller-supplied (?name=) and the bytes come from an
    // email anyone can send. Writing that pair into the web-served uploads/ folder
    // without an extension check let an authenticated user drop an executable
    // .php file into the docroot — remote code execution. Validate BEFORE any
    // IMAP work so a rejected name costs nothing.
    $safeName = ccrm_safe_upload_name((string)$name);
    if ($safeName === null) {
        return ['success' => false, 'error' => 'This attachment type cannot be saved to documents.'];
    }

    $mailbox = get_imap_mailbox_string($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        return ['success' => false, 'error' => 'IMAP connection failed.'];
    }
    
    $uidInt = (int)$uid;
    $structure = @imap_fetchstructure($imapStream, $uidInt, FT_UID);
    if (!$structure) {
        @imap_close($imapStream);
        return ['success' => false, 'error' => 'This message is no longer in ' . $folder . ' (it may have been moved or deleted).'];
    }

    $part = $structure ? find_structure_part($structure, $partNum) : null;
    if (!$part || !is_object($part)) {
        // Without the part we do not know its transfer encoding, and the old
        // fallback (assume 7BIT) wrote the raw base64 text to disk under a .pdf
        // name. That file downloads and previews as a black page days later with
        // nothing to explain it, so refuse the save instead.
        @imap_close($imapStream);
        return ['success' => false, 'error' => 'This attachment could not be read from the message (its structure did not match).'];
    }
    $encoding = isset($part->encoding) ? $part->encoding : 0;

    $data = @imap_fetchbody($imapStream, $uidInt, $partNum, FT_UID | FT_PEEK);
    $data = decode_imap_body($data, $encoding);

    @imap_close($imapStream);

    return ccrm_store_mail_attachment_upload($data, $safeName, $eventId);
}

/**
 * Writes the bytes of a mail attachment into uploads/ as a document of a timeline entry and
 * reads what text it can out of it. Shared by the IMAP and the Microsoft 365 mailbox; the
 * caller has already validated the name with ccrm_safe_upload_name().
 */
function ccrm_store_mail_attachment_upload($data, string $safeName, string $eventId): array {
    if (!is_string($data) || $data === '') {
        return ['success' => false, 'error' => 'This attachment came back empty from the mail server.'];
    }

    $uploadDir = ccrm_uploads_dir();

    $targetPath = $uploadDir . $eventId . '_' . $safeName;
    if (@file_put_contents($targetPath, $data) !== false) {
        // Same guard as upload.php: never keep bytes that do not match the format
        // the file name promises.
        if (!ccrm_stored_file_matches_extension($targetPath, $safeName)) {
            @unlink($targetPath);
            return ['success' => false, 'error' => 'The attachment arrived damaged or incomplete and was not saved.'];
        }
        $extractedText = '';
        $ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
        if ($ext === 'txt') {
            $extractedText = $data;
        } elseif ($ext === 'docx') {
            if (class_exists('ZipArchive')) {
                $zip = new ZipArchive();
                if ($zip->open($targetPath) === true) {
                    $xmlContent = $zip->getFromName('word/document.xml');
                    $zip->close();
                    if ($xmlContent) {
                        $extractedText = html_entity_decode(strip_tags($xmlContent), ENT_QUOTES | ENT_HTML5, 'UTF-8');
                    }
                }
            }
        } elseif ($ext === 'pdf') {
            $texts = [];
            $objs = explode('endobj', $data);
            foreach ($objs as $obj) {
                if (preg_match('/stream[\r\n]+(.*?)[\r\n]+endstream/is', $obj, $streamMatch)) {
                    $stream = $streamMatch[1];
                    if (strpos($obj, '/FlateDecode') !== false) {
                        $decomp = @gzuncompress($stream);
                        if ($decomp === false) $decomp = @gzuncompress(substr($stream, 1));
                        if ($decomp === false) $decomp = @gzuncompress(substr($stream, 2));
                        if ($decomp !== false) $stream = $decomp;
                    }
                    preg_match_all('/(?<=\()([^\)]*)(?=\))/s', $stream, $textMatches);
                    if (!empty($textMatches[0])) {
                        foreach ($textMatches[0] as $txt) {
                            $txt = trim($txt);
                            if ($txt === '' || strpos($txt, '/') === 0 || strpos($txt, 'Identity-H') !== false) continue;
                            $txt = preg_replace_callback('/\\\\([0-7]{3})/', function($m) { return chr(octdec($m[1])); }, $txt);
                            $txt = str_replace(['\\(', '\\)', '\\\\'], ['(', ')', '\\'], $txt);
                            $texts[] = $txt;
                        }
                    }
                }
            }
            $extractedText = implode(' ', $texts);
        }

        // Raw PDF byte extraction can produce invalid UTF-8; scrub it so the
        // caller's json_encode() cannot return false and emit an empty body.
        $extractedText = mb_convert_encoding($extractedText, 'UTF-8', 'UTF-8');

        if (mb_strlen($extractedText) > 60000) {
            $extractedText = mb_substr($extractedText, 0, 60000) . '... [TRUNCATED]';
        }

        return [
            'success' => true,
            // Report the name actually written, not the requested one, so the
            // client's stored filePath matches what is on disk.
            'fileName' => $safeName,
            'filePath' => '/uploads/' . $eventId . '_' . $safeName,
            'extractedText' => $extractedText
        ];
    }

    return ['success' => false, 'error' => 'Failed to save file on server.'];
}
