<?php
ini_set('display_errors', '0');
require_once __DIR__ . '/auth.php';

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

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'CRM is not installed yet.']);
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
        $settings = ccrm_merge_secrets(is_array($settings) ? $settings : [], $storedEmail, ccrm_email_secret_keys());
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

// 2. The mailbox to operate on is ALWAYS the authenticated session user's own.
// SECURITY: the old X-User-Email header let any logged-in user open, read, send
// from or delete another user's mailbox just by supplying their address (IDOR).
// The header is now ignored entirely.
$sessionUser = ccrm_current_user();
$userEmail = $sessionUser['email'] ?? '';

if (empty($userEmail)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized.']);
    exit;
}

// Fetch user settings from DB
$stmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `email` = ?");
$stmt->execute([$userEmail]);
$metadataStr = $stmt->fetchColumn();

if (!$metadataStr) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'User not found or configured.']);
    exit;
}

$metadata = json_decode($metadataStr, true);
$emailSettings = ccrm_decrypt_email_settings($metadata['emailSettings'] ?? null);

if (!$emailSettings) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email integration has not been set up yet for this account.']);
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
            $folder = isset($_GET['folder']) ? $_GET['folder'] : 'INBOX';
            // Callers ask for the literal "Sent". Not every server calls it that,
            // and asking for a folder that does not exist reads as an empty one —
            // no error, and no outgoing mail on any timeline.
            $folder = ccrm_canonical_folder($emailSettings, $folder);
            $page = isset($_GET['page']) ? intval($_GET['page']) : 1;
            $filter = isset($_GET['filter']) ? $_GET['filter'] : 'all';
            $searchEmail = isset($_GET['email']) ? $_GET['email'] : null;
            $result = fetch_imap_emails($emailSettings, $folder, $page, 25, $filter, $searchEmail);
            echo json_encode(array_merge(['success' => true, 'folder' => $folder], $result));
            break;

        case 'get_email_detail':
            $uid = isset($_GET['uid']) ? $_GET['uid'] : '';
            $folder = ccrm_canonical_folder($emailSettings, isset($_GET['folder']) ? $_GET['folder'] : 'INBOX');
            if (empty($uid)) {
                throw new Exception('Missing email UID.');
            }
            $email = fetch_imap_email_detail($emailSettings, $folder, $uid);
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
            $folder = ccrm_canonical_folder($emailSettings, isset($payload['folder']) ? $payload['folder'] : 'INBOX');
            if ($uid === '' || !array_key_exists('seen', $payload)) {
                throw new Exception('Missing parameters.');
            }
            $seen = set_imap_email_seen($emailSettings, $folder, $uid, !empty($payload['seen']));
            echo json_encode(['success' => true, 'uid' => $uid, 'folder' => $folder, 'seen' => $seen]);
            break;

        case 'delete_email':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                throw new Exception('Invalid method.');
            }
            $uid = isset($_GET['uid']) ? $_GET['uid'] : '';
            $folder = ccrm_canonical_folder($emailSettings, isset($_GET['folder']) ? $_GET['folder'] : 'INBOX');
            delete_imap_email($emailSettings, $folder, $uid);
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

exit;

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

    $resolved = 'Sent';
    list($imapUser, $imapPass) = get_imap_credentials($settings);
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
            $candidates = ['Sent', 'INBOX.Sent', 'INBOX/Sent', 'Sent Items',
                           'Sent Messages', 'Odoslané', 'Odoslaná pošta', 'Elküldött elemek'];
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
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        throw new Exception('IMAP Connection failed: ' . imap_last_error());
    }
    
    // NOTE: always search with SE_UID. Without it IMAP returns message sequence
    // numbers, which shift every time a message is deleted, while the overview
    // below is keyed by the stable UID - the two stop matching and messages get
    // silently dropped from the listing.
    $uids = [];
    if (!empty($searchEmail)) {
        $uidsFrom = imap_search($imapStream, 'FROM "' . $searchEmail . '"', SE_UID);
        $uidsTo = imap_search($imapStream, 'TO "' . $searchEmail . '"', SE_UID);
        $uidsCombined = [];
        if (is_array($uidsFrom)) {
            $uidsCombined = array_merge($uidsCombined, $uidsFrom);
        }
        if (is_array($uidsTo)) {
            $uidsCombined = array_merge($uidsCombined, $uidsTo);
        }
        $uids = array_unique($uidsCombined);
    } else {
        $criteria = 'ALL';
        if ($filter === 'unread') {
            $criteria = 'UNSEEN';
        }
        $uids = imap_search($imapStream, $criteria, SE_UID);
    }
    $emails = [];
    $total = 0;
    $unseen = 0;
    
    // Get unseen count
    $status = imap_status($imapStream, $mailbox, SA_UNSEEN);
    if ($status) {
        $unseen = $status->unseen;
    }
    
    if ($uids) {
        $uids = array_map('intval', $uids);
        $total = count($uids);
        rsort($uids, SORT_NUMERIC); // Newest first

        $startIdx = ($page - 1) * $limit;
        $sliceUids = array_slice($uids, $startIdx, $limit);

        if (!empty($sliceUids)) {
            // FT_UID: the sequence above is a list of UIDs, not sequence numbers
            $overview = imap_fetch_overview($imapStream, implode(',', $sliceUids), FT_UID);
            if (!is_array($overview)) {
                $overview = [];
            }
            
            // Map headers to structured entities
            $emailsMap = [];
            foreach ($overview as $o) {
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
                if (isset($GLOBALS['pdo']) && isset($GLOBALS['userEmail'])) {
                    try {
                        $sumStmt = $GLOBALS['pdo']->prepare("SELECT `summary` FROM `email_summaries` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
                        $sumStmt->execute([$GLOBALS['userEmail'], $folder, $o->uid]);
                        $summary = $sumStmt->fetchColumn() ?: '';
                    } catch (\Exception $e) {
                        $summary = '';
                    }
                }

                // The canonical timeline id for this message, handed to the client
                // so both sides agree on it. The client used to mint its own
                // ("email-sent-<uid>") while the row below was stored under a
                // different one, so the de-duplication that merges the live IMAP
                // list with the stored timeline never matched and every imported
                // mail rendered twice.
                $mailEventId = ccrm_mail_event_id($imapUser, $folder, $o->uid);
                $listPreview = fetch_list_preview($imapStream, $o->uid);

                $emailsMap[$o->uid] = [
                    'uid' => $o->uid,
                    'event_id' => $mailEventId,
                    'subject' => isset($o->subject) ? safe_utf8(imap_utf8($o->subject)) : '(No Subject)',
                    'from' => [
                        'name' => safe_utf8($fromName),
                        'address' => safe_utf8($fromAddress)
                    ],
                    'to' => [
                        'name' => safe_utf8($toName),
                        'address' => safe_utf8($toAddress)
                    ],
                    'date' => isset($o->date) ? date('Y-m-d H:i:s', strtotime($o->date)) : '',
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
                if (isset($GLOBALS['pdo'])) {
                    $pdo = $GLOBALS['pdo'];
                    $matchedLeadId = null;

                    if (!empty($fromAddress)) {
                        $leadStmt = $pdo->prepare("SELECT `id` FROM `leads` WHERE LOWER(`email`) = ? LIMIT 1");
                        $leadStmt->execute([strtolower($fromAddress)]);
                        $matchedLeadId = $leadStmt->fetchColumn();
                    }
                    if (!$matchedLeadId && !empty($toAddress)) {
                        $leadStmt = $pdo->prepare("SELECT `id` FROM `leads` WHERE LOWER(`email`) = ? LIMIT 1");
                        $leadStmt->execute([strtolower($toAddress)]);
                        $matchedLeadId = $leadStmt->fetchColumn();
                    }
                    if (!$matchedLeadId && !empty($searchEmail)) {
                        $leadStmt = $pdo->prepare("SELECT `id` FROM `leads` WHERE LOWER(`email`) = ? LIMIT 1");
                        $leadStmt->execute([strtolower($searchEmail)]);
                        $matchedLeadId = $leadStmt->fetchColumn();
                    }

                    if ($matchedLeadId) {
                        $eventId = $mailEventId;
                        $timestamp = isset($o->date) ? date('Y-m-d H:i:s', strtotime($o->date)) : date('Y-m-d H:i:s');
                        $title = isset($o->subject) ? safe_utf8(imap_utf8($o->subject)) : '(No Subject)';
                        $content = "From: " . $fromName . " <" . $fromAddress . ">\nTo: " . $toName . " <" . $toAddress . ">\nSubject: " . $title;
                        // The timeline badge (and the folder its body is later
                        // fetched from) depends on who sent the message. The
                        // sender address is authoritative; the folder only
                        // decides when we have no account address to compare to.
                        $accountEmail = isset($GLOBALS['userEmail']) ? strtolower(trim($GLOBALS['userEmail'])) : '';
                        $isOutgoing = $accountEmail !== ''
                            ? (strtolower(trim($fromAddress)) === $accountEmail ? 1 : 0)
                            : (strcasecmp($folder, 'Sent') === 0 ? 1 : 0);

                        // Only a message we sent has an author inside the CRM:
                        // resolve the account address to the user behind it so the
                        // timeline names who wrote it. An incoming mail was nobody's
                        // action here and stays unattributed.
                        $eventAuthor = null;
                        if ($isOutgoing && $accountEmail !== '') {
                            $authorStmt = $pdo->prepare("SELECT `name` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1");
                            $authorStmt->execute([$accountEmail]);
                            $resolvedAuthor = $authorStmt->fetchColumn();
                            if ($resolvedAuthor !== false && trim((string)$resolvedAuthor) !== '') {
                                $eventAuthor = $resolvedAuthor;
                            }
                        }

                        $checkStmt = $pdo->prepare("SELECT 1 FROM `timeline_events` WHERE `id` = ?");
                        $checkStmt->execute([$eventId]);
                        if (!$checkStmt->fetchColumn()) {
                            $insStmt = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `is_outgoing`, `author`) VALUES (?, ?, 'email', ?, ?, ?, ?, ?)");
                            $insStmt->execute([$eventId, $matchedLeadId, $timestamp, $title, $content, $isOutgoing, $eventAuthor]);
                        } else {
                            // `lead_id` is refreshed too. It used to be left alone,
                            // so once a row existed the message stayed filed against
                            // whichever lead claimed it first — which, with the old
                            // colliding ids, was regularly the wrong customer. It
                            // also kept a message pinned to the old lead after a
                            // customer's address moved to another record.
                            $upStmt = $pdo->prepare("UPDATE `timeline_events` SET `lead_id` = ?, `timestamp` = ?, `title` = ?, `is_outgoing` = ?, `author` = ? WHERE `id` = ?");
                            $upStmt->execute([$matchedLeadId, $timestamp, $title, $isOutgoing, $eventAuthor, $eventId]);
                        }
                    }
                }

                // RAG Ingestion: Cache fetched email in RAG database tables (main DB and vector DB)
                if (isset($GLOBALS['pdo']) && isset($GLOBALS['userEmail'])) {
                    $mPdo = $GLOBALS['pdo'];
                    $uEmail = $GLOBALS['userEmail'];
                    
                    // Check if already in main DB's rag_emails
                    $checkRag = $mPdo->prepare("SELECT 1 FROM `rag_emails` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
                    $checkRag->execute([$uEmail, $folder, $o->uid]);
                    // Skip caching when the UID no longer resolves rather than
                    // risk storing another message's body under this UID
                    $ragMsgNo = @imap_msgno($imapStream, $o->uid);
                    if (!$checkRag->fetchColumn() && $ragMsgNo) {
                        // Fetch the body
                        $bodyText = safe_utf8(fetch_email_body_text($imapStream, $ragMsgNo));

                        $subject = isset($o->subject) ? safe_utf8(imap_utf8($o->subject)) : '(No Subject)';
                        $sender = safe_utf8($fromHeader);
                        $recipient = safe_utf8($toHeader);
                        $receivedAt = isset($o->date) ? date('Y-m-d H:i:s', strtotime($o->date)) : date('Y-m-d H:i:s');
                        
                        // Insert into main DB
                        $insRag = $mPdo->prepare("INSERT INTO `rag_emails` (`user_email`, `folder`, `email_uid`, `subject`, `sender`, `recipient`, `body`, `received_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                        $insRag->execute([$uEmail, $folder, $o->uid, $subject, $sender, $recipient, $bodyText, $receivedAt]);
                        
                        // Also insert into RAG DB if active
                        require_once __DIR__ . '/agent_utils.php';
                        // Retrieve integrations config
                        $stmtConfig = $mPdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
                        $stmtConfig->execute();
                        $configJsonStr = $stmtConfig->fetchColumn();
                        $integrationsConfigObj = $configJsonStr ? json_decode($configJsonStr, true) : [];
                        $integrationsConfigObj = is_array($integrationsConfigObj) ? ccrm_decrypt_config_secrets($integrationsConfigObj, ccrm_integration_secret_keys()) : [];
                        
                        $rPdo = get_rag_db_connection($integrationsConfigObj);
                        if ($rPdo) {
                            init_rag_db_schemas($rPdo);
                            $insRagVec = $rPdo->prepare("INSERT INTO `rag_emails` (`user_email`, `folder`, `email_uid`, `subject`, `sender`, `recipient`, `body`, `received_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `subject` = VALUES(`subject`), `body` = VALUES(`body`)");
                            $insRagVec->execute([$uEmail, $folder, $o->uid, $subject, $sender, $recipient, $bodyText, $receivedAt]);
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
    
    // Never fall back to treating the UID as a sequence number - that silently
    // opens a different message once the mailbox has had a deletion.
    $msgNo = @imap_msgno($imapStream, $uid);
    if (!$msgNo) {
        @imap_close($imapStream);
        throw new Exception('This message is no longer in ' . $folder . ' (it may have been moved or deleted).');
    }

    // Fetch body parts
    $html = '';
    $text = '';
    
    // Helper to get structured body parts
    $structure = imap_fetchstructure($imapStream, $msgNo);
    $attachments = [];
    if ($structure) {
        $attachments = get_attachments_from_structure($structure);
        if (isset($structure->parts) && count($structure->parts)) {
            foreach ($structure->parts as $partNo => $part) {
                // If nested parts
                if (isset($part->parts)) {
                    foreach ($part->parts as $nestedPartNo => $nestedPart) {
                        $partStr = ($partNo + 1) . '.' . ($nestedPartNo + 1);
                        $body = imap_fetchbody($imapStream, $msgNo, $partStr, FT_PEEK);
                        $body = decode_imap_body($body, $nestedPart->encoding, get_part_charset($nestedPart));
                        if (isset($nestedPart->subtype) && $nestedPart->subtype === 'HTML') {
                            $html = $body;
                        } elseif (isset($nestedPart->subtype) && $nestedPart->subtype === 'PLAIN') {
                            $text = $body;
                        }
                    }
                } else {
                    $body = imap_fetchbody($imapStream, $msgNo, (string)($partNo + 1), FT_PEEK);
                    $body = decode_imap_body($body, $part->encoding, get_part_charset($part));
                    if (isset($part->subtype) && $part->subtype === 'HTML') {
                        $html = $body;
                    } elseif (isset($part->subtype) && $part->subtype === 'PLAIN') {
                        $text = $body;
                    }
                }
            }
        } else {
            // Simple structure
            $body = imap_body($imapStream, $msgNo, FT_PEEK);
            $body = decode_imap_body($body, $structure->encoding, get_part_charset($structure));
            if (isset($structure->subtype) && $structure->subtype === 'HTML') {
                $html = $body;
            } else {
                $text = $body;
            }
        }
    }
    
    // Opening a message is the one thing that marks it read - and it is marked
    // by UID, the same way the user's mail client addresses it, so both agree.
    $seen = ccrm_set_seen_flag($imapStream, $uid, true);

    @imap_close($imapStream);
    @imap_errors();

    return [
        'uid' => $uid,
        'html' => safe_utf8($html),
        'text' => safe_utf8($text),
        'attachments' => $attachments,
        'seen' => $seen === null ? true : $seen
    ];
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
 * flag changes, and it does so only when a user opens a message or asks for
 * it explicitly.
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

/**
 * Send a message through the SYSTEM outbound profile (INTEGRATIONS_CONFIG).
 * Unlike send_smtp_email() this validates every SMTP reply code, so a rejected
 * auth/recipient/relay surfaces as a real error instead of a silent no-op —
 * that silent no-op is exactly why the previous front-end "simulation"
 * reported success while nothing was ever delivered, and why workflow
 * "Send e-mail" actions logged success with nothing in the inbox.
 *
 * Throws on any misconfiguration or SMTP-level rejection.
 */
function ccrm_send_system_mail(array $config, string $to, string $subject, string $html) {
    $to = trim($to);
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        throw new Exception('No valid recipient address: ' . ($to === '' ? '(empty)' : $to));
    }

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
        $subject = 'CCRM — testovací e-mail';
        $body    = 'Toto je testovacia správa z CRM. Ak ste ju dostali, odchádzajúci e-mailový server je nastavený správne.';
    } elseif ($lang === 'hu') {
        $subject = 'CCRM — teszt e-mail';
        $body    = 'Ez egy teszt üzenet a CRM-ből. Ha megkapta, a kimenő levelezőszerver helyesen van beállítva.';
    } else {
        $subject = 'CCRM — test email';
        $body    = 'This is a test message from your CRM. If you received it, the outgoing mail server is configured correctly.';
    }

    $html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">'
        . '<h2 style="font-size:18px;margin:0 0 16px">CCRM</h2>'
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
            'name' => safe_utf8(imap_utf8($finalName)),
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
    
    $msgNo = @imap_msgno($imapStream, $uid);
    if (!$msgNo) {
        @imap_close($imapStream);
        throw new Exception('This message is no longer in ' . $folder . ' (it may have been moved or deleted).');
    }

    $structure = imap_fetchstructure($imapStream, $msgNo);
    // Find the part encoding
    $encoding = 0;
    
    // Helper to find encoding
    $part = find_structure_part($structure, $partNum);
    if ($part) {
        $encoding = $part->encoding;
    }
    
    $data = imap_fetchbody($imapStream, $msgNo, $partNum, FT_PEEK);
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
    $msgNo = @imap_msgno($imapStream, (int)$uid);
    if (!$msgNo) {
        return $result;
    }
    $structure = @imap_fetchstructure($imapStream, $msgNo);
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
        ? @imap_body($imapStream, $msgNo, FT_PEEK)
        : @imap_fetchbody($imapStream, $msgNo, $partNum, FT_PEEK);
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
    
    $msgNo = @imap_msgno($imapStream, $uid);
    if (!$msgNo) {
        @imap_close($imapStream);
        return ['success' => false, 'error' => 'This message is no longer in ' . $folder . ' (it may have been moved or deleted).'];
    }

    $structure = @imap_fetchstructure($imapStream, $msgNo);

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

    $data = @imap_fetchbody($imapStream, $msgNo, $partNum, FT_PEEK);
    $data = decode_imap_body($data, $encoding);

    @imap_close($imapStream);

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
