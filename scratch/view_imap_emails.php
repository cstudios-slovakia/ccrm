<?php
require_once __DIR__ . '/../public/config.php';

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

try {
    $pdo = get_db_connection();
    
    // Get user with email settings
    $stmt = $pdo->query("SELECT email, metadata_json FROM users");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $emailSettings = null;
    
    foreach ($users as $u) {
        $meta = json_decode($u['metadata_json'] ?? '', true);
        if (isset($meta['emailSettings']) && $meta['emailSettings']['isValidated']) {
            $emailSettings = $meta['emailSettings'];
            break;
        }
    }
    
    if (!$emailSettings) {
        die("Error: No validated email settings found for any user.\n");
    }
    
    $folders = ['INBOX', 'Sent'];
    
    foreach ($folders as $folder) {
        echo "\nFolder: $folder\n";
        
        $mailbox = get_imap_mailbox_string($emailSettings, $folder);
        list($imapUser, $imapPass) = get_imap_credentials($emailSettings);
        
        $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
        if (!$imapStream) {
            echo "IMAP connection failed: " . imap_last_error() . "\n";
            continue;
        }
        
        $uids = imap_search($imapStream, 'ALL', SE_FREE);
        if (!$uids) {
            echo "No emails found.\n";
            @imap_close($imapStream);
            continue;
        }
        
        $overview = imap_fetch_overview($imapStream, implode(',', $uids), 0);
        foreach ($overview as $o) {
            echo "UID: {$o->uid}\n";
            echo "Subject: " . (isset($o->subject) ? imap_utf8($o->subject) : '(No Subject)') . "\n";
            echo "From: " . (isset($o->from) ? $o->from : '') . "\n";
            echo "To: " . (isset($o->to) ? $o->to : '') . "\n";
            echo "Date: " . (isset($o->date) ? $o->date : '') . "\n";
            echo "-------------------\n";
        }
        @imap_close($imapStream);
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
