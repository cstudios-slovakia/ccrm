<?php
require_once __DIR__ . '/auth.php';

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
    
    $result = test_mail_connections($settings);
    echo json_encode($result);
    exit;
}

// 2. Otherwise, authenticate via X-User-Email header
$userEmail = '';
if (isset($_SERVER['HTTP_X_USER_EMAIL'])) {
    $userEmail = trim($_SERVER['HTTP_X_USER_EMAIL']);
} else {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    if (isset($headers['X-User-Email'])) {
        $userEmail = trim($headers['X-User-Email']);
    } elseif (isset($headers['x-user-email'])) {
        $userEmail = trim($headers['x-user-email']);
    }
}

if (empty($userEmail)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized: Missing X-User-Email header.']);
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
$emailSettings = isset($metadata['emailSettings']) ? $metadata['emailSettings'] : null;

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
            $page = isset($_GET['page']) ? intval($_GET['page']) : 1;
            $filter = isset($_GET['filter']) ? $_GET['filter'] : 'all';
            $searchEmail = isset($_GET['email']) ? $_GET['email'] : null;
            $result = fetch_imap_emails($emailSettings, $folder, $page, 25, $filter, $searchEmail);
            echo json_encode(array_merge(['success' => true], $result));
            break;

        case 'get_email_detail':
            $uid = isset($_GET['uid']) ? $_GET['uid'] : '';
            $folder = isset($_GET['folder']) ? $_GET['folder'] : 'INBOX';
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
            send_smtp_email($emailSettings, $payload['to'], $payload['subject'], $payload['html']);
            echo json_encode(['success' => true]);
            break;

        case 'delete_email':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                throw new Exception('Invalid method.');
            }
            $uid = isset($_GET['uid']) ? $_GET['uid'] : '';
            $folder = isset($_GET['folder']) ? $_GET['folder'] : 'INBOX';
            delete_imap_email($emailSettings, $folder, $uid);
            echo json_encode(['success' => true]);
            break;

        default:
            throw new Exception('Unsupported action: ' . $action);
    }
} catch (Exception $ex) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
}

exit;

// --- DEDICATED MAIL BROKER HELPER FUNCTIONS ---

function safe_utf8($str) {
    if (!is_string($str)) {
        return '';
    }
    return mb_convert_encoding($str, 'UTF-8', 'UTF-8, ASCII, ISO-8859-1, ISO-8859-2, Windows-1252');
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

function get_imap_mailbox_string($settings, $folder = '') {
    $host = $settings['imapHost'];
    $port = $settings['imapPort'];
    
    $sec = isset($settings['imapSecure']) ? $settings['imapSecure'] : 'ssl';
    $ssl = '/novalidate-cert';
    if ($sec === 'ssl' || $sec === true) {
        $ssl = '/ssl/novalidate-cert';
    } elseif ($sec === 'tls') {
        $ssl = '/tls/novalidate-cert';
    }
    
    // Autodetect MS Exchange URL or custom Exchange setup if provider is Exchange
    if ($settings['provider'] === 'exchange') {
        // Exchange autodiscover fallback configuration
        $host = !empty($settings['imapHost']) ? $settings['imapHost'] : 'outlook.office365.com';
        $port = '993';
        $ssl = '/ssl/novalidate-cert';
    }
    
    return "{" . "$host:$port/imap$ssl" . "}$folder";
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
    $host = $settings['smtpHost'];
    $port = intval($settings['smtpPort']);
    
    if ($settings['provider'] === 'exchange') {
        $host = 'smtp.office365.com';
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
    
    $uids = [];
    if (!empty($searchEmail)) {
        $uidsFrom = imap_search($imapStream, 'FROM "' . $searchEmail . '"', SE_FREE);
        $uidsTo = imap_search($imapStream, 'TO "' . $searchEmail . '"', SE_FREE);
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
        $uids = imap_search($imapStream, $criteria, SE_FREE);
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
        $total = count($uids);
        rsort($uids); // Newest first
        
        $startIdx = ($page - 1) * $limit;
        $sliceUids = array_slice($uids, $startIdx, $limit);
        
        if (!empty($sliceUids)) {
            $overview = imap_fetch_overview($imapStream, implode(',', $sliceUids), 0);
            
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
                
                $emailsMap[$o->uid] = [
                    'uid' => $o->uid,
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
                    'references' => isset($o->references) ? trim($o->references) : ''
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
                        $eventId = "email-" . $o->uid;
                        $timestamp = isset($o->date) ? date('Y-m-d H:i:s', strtotime($o->date)) : date('Y-m-d H:i:s');
                        $title = isset($o->subject) ? safe_utf8(imap_utf8($o->subject)) : '(No Subject)';
                        $content = "From: " . $fromName . " <" . $fromAddress . ">\nTo: " . $toName . " <" . $toAddress . ">\nSubject: " . $title;

                        $checkStmt = $pdo->prepare("SELECT 1 FROM `timeline_events` WHERE `id` = ?");
                        $checkStmt->execute([$eventId]);
                        if (!$checkStmt->fetchColumn()) {
                            $insStmt = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`) VALUES (?, ?, 'email', ?, ?, ?)");
                            $insStmt->execute([$eventId, $matchedLeadId, $timestamp, $title, $content]);
                        } else {
                            $upStmt = $pdo->prepare("UPDATE `timeline_events` SET `timestamp` = ?, `title` = ? WHERE `id` = ?");
                            $upStmt->execute([$timestamp, $title, $eventId]);
                        }
                    }
                }
            }
            
            // Retain sorting
            foreach ($sliceUids as $uid) {
                if (isset($emailsMap[$uid])) {
                    $emails[] = $emailsMap[$uid];
                }
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
    
    $msgNo = @imap_msgno($imapStream, $uid);
    if (!$msgNo) {
        $msgNo = $uid;
    }
    
    // Fetch body parts
    $html = '';
    $text = '';
    
    // Helper to get structured body parts
    $structure = imap_fetchstructure($imapStream, $msgNo);
    if ($structure) {
        if (isset($structure->parts) && count($structure->parts)) {
            foreach ($structure->parts as $partNo => $part) {
                // If nested parts
                if (isset($part->parts)) {
                    foreach ($part->parts as $nestedPartNo => $nestedPart) {
                        $partStr = ($partNo + 1) . '.' . ($nestedPartNo + 1);
                        $body = imap_fetchbody($imapStream, $msgNo, $partStr);
                        $body = decode_imap_body($body, $nestedPart->encoding);
                        if (isset($nestedPart->subtype) && $nestedPart->subtype === 'HTML') {
                            $html = $body;
                        } elseif (isset($nestedPart->subtype) && $nestedPart->subtype === 'PLAIN') {
                            $text = $body;
                        }
                    }
                } else {
                    $body = imap_fetchbody($imapStream, $msgNo, (string)($partNo + 1));
                    $body = decode_imap_body($body, $part->encoding);
                    if (isset($part->subtype) && $part->subtype === 'HTML') {
                        $html = $body;
                    } elseif (isset($part->subtype) && $part->subtype === 'PLAIN') {
                        $text = $body;
                    }
                }
            }
        } else {
            // Simple structure
            $body = imap_body($imapStream, $msgNo);
            $body = decode_imap_body($body, $structure->encoding);
            if (isset($structure->subtype) && $structure->subtype === 'HTML') {
                $html = $body;
            } else {
                $text = $body;
            }
        }
    }
    
    // Mark as read
    @imap_setflag_full($imapStream, $msgNo, "\\Seen");
    
    @imap_close($imapStream);
    
    return [
        'uid' => $uid,
        'html' => safe_utf8($html),
        'text' => safe_utf8($text)
    ];
}

function decode_imap_body($body, $encoding) {
    if ($encoding == 3) { // BASE64
        return base64_decode($body);
    } elseif ($encoding == 4) { // QUOTED-PRINTABLE
        return quoted_printable_decode($body);
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
    $host = $settings['smtpHost'];
    $port = intval($settings['smtpPort']);
    
    if ($settings['provider'] === 'exchange') {
        $host = 'smtp.office365.com';
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
        throw new Exception("Could not connect to SMTP server: $errstr ($errno)");
    }
    
    // Read welcome banner
    fgets($socket, 515);
    
    // SMTP Protocol handshake
    fwrite($socket, "EHLO " . $_SERVER['SERVER_NAME'] . "\r\n");
    fgets($socket, 515);
    
    // STARTTLS if Port 587 or security is tls
    if ($port === 587 || $sec === 'tls') {
        fwrite($socket, "STARTTLS\r\n");
        fgets($socket, 515);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception("TLS encryption handshake negotiation failed.");
        }
        // Send EHLO again after TLS start
        fwrite($socket, "EHLO " . $_SERVER['SERVER_NAME'] . "\r\n");
        fgets($socket, 515);
    }
    
    // Auth login
    fwrite($socket, "AUTH LOGIN\r\n");
    fgets($socket, 515);
    
    fwrite($socket, base64_encode($smtpUser) . "\r\n");
    fgets($socket, 515);
    
    fwrite($socket, base64_encode($smtpPass) . "\r\n");
    $authResponse = fgets($socket, 515);
    if (strpos($authResponse, '235') === false) {
        throw new Exception("SMTP Authentication failed: " . $authResponse);
    }
    
    // Headers
    fwrite($socket, "MAIL FROM: <" . $smtpUser . ">\r\n");
    fgets($socket, 515);
    
    fwrite($socket, "RCPT TO: <" . $to . ">\r\n");
    fgets($socket, 515);
    
    fwrite($socket, "DATA\r\n");
    fgets($socket, 515);
    
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: <" . $smtpUser . ">\r\n";
    $headers .= "To: <" . $to . ">\r\n";
    $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $headers .= "Date: " . date('r') . "\r\n\r\n";
    
    fwrite($socket, $headers . $html . "\r\n.\r\n");
    fgets($socket, 515);
    
    fwrite($socket, "QUIT\r\n");
    fclose($socket);
}
