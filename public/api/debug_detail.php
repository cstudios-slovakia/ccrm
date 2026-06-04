<?php
header('Content-Type: text/plain');
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/../config.php';

function get_imap_credentials($settings) {
    $user = !empty($settings['imapUsername']) ? $settings['imapUsername'] : (isset($settings['username']) ? $settings['username'] : '');
    $pass = !empty($settings['imapPassword']) ? $settings['imapPassword'] : (isset($settings['password']) ? $settings['password'] : '');
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
    
    if ($settings['provider'] === 'exchange') {
        $host = !empty($settings['imapHost']) ? $settings['imapHost'] : 'outlook.office365.com';
        $port = '993';
        $ssl = '/ssl/novalidate-cert';
    }
    
    return "{" . "$host:$port/imap$ssl" . "}$folder";
}

function decode_imap_body($body, $encoding) {
    if ($encoding == 3) {
        return base64_decode($body);
    } elseif ($encoding == 4) {
        return quoted_printable_decode($body);
    }
    return $body;
}

try {
    $pdo = get_db_connection();
    
    $stmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `email` = ?");
    $stmt->execute(['admin@crm.com']);
    $metadataStr = $stmt->fetchColumn();
    
    $metadata = json_decode($metadataStr, true);
    $emailSettings = $metadata['emailSettings'];
    
    $uid = '1';
    $folder = 'INBOX';
    
    echo "Connecting to IMAP...\n";
    $mailbox = get_imap_mailbox_string($emailSettings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($emailSettings);
    
    echo "Mailbox: $mailbox\nUser: $imapUser\n";
    $imapStream = imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        throw new Exception('IMAP open failed: ' . imap_last_error());
    }
    echo "Connection successful!\n";
    
    echo "Resolving msgno...\n";
    $msgNo = imap_msgno($imapStream, $uid);
    echo "MsgNo: $msgNo\n";
    
    echo "Fetching structure...\n";
    $structure = imap_fetchstructure($imapStream, $msgNo);
    echo "Structure subtype: " . ($structure->subtype ?? 'NONE') . "\n";
    
    echo "Fetching body...\n";
    $body = imap_body($imapStream, $msgNo);
    echo "Body length: " . strlen($body) . "\n";
    
} catch (\Throwable $e) {
    echo "EXCEPTION CAUGHT: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . " on line " . $e->getLine() . "\n";
}
