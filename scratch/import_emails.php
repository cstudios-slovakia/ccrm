<?php
require_once __DIR__ . '/../public/config.php';

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
    $userEmail = null;
    
    foreach ($users as $u) {
        $meta = json_decode($u['metadata_json'] ?? '', true);
        if (isset($meta['emailSettings']) && $meta['emailSettings']['isValidated']) {
            $emailSettings = $meta['emailSettings'];
            $userEmail = $u['email'];
            break;
        }
    }
    
    if (!$emailSettings) {
        die("Error: No validated email settings found for any user.\n");
    }
    
    echo "Using email settings for user: $userEmail (Username: {$emailSettings['imapUsername']})\n";
    
    $folders = ['INBOX', 'Sent'];
    
    foreach ($folders as $folder) {
        echo "\nFetching folder: $folder...\n";
        
        $mailbox = get_imap_mailbox_string($emailSettings, $folder);
        list($imapUser, $imapPass) = get_imap_credentials($emailSettings);
        
        echo "Mailbox: $mailbox\n";
        $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
        if (!$imapStream) {
            echo "IMAP connection failed for folder $folder: " . imap_last_error() . "\n";
            continue;
        }
        
        $uids = imap_search($imapStream, 'ALL', SE_FREE);
        if (!$uids) {
            echo "No emails found in $folder.\n";
            @imap_close($imapStream);
            continue;
        }
        
        echo "Found " . count($uids) . " emails. Processing...\n";
        rsort($uids);
        
        $overview = imap_fetch_overview($imapStream, implode(',', $uids), 0);
        $importedCount = 0;
        
        foreach ($overview as $o) {
            // Parse "From"
            $fromHeader = isset($o->from) ? $o->from : '';
            $fromName = $fromHeader;
            $fromAddress = $fromHeader;
            if (preg_match('/^(.*?)\s*<(.*?)>$/', $fromHeader, $matches)) {
                $fromName = trim($matches[1], '"\' ');
                $fromAddress = trim($matches[2]);
            }
            
            // Parse "To"
            $toHeader = isset($o->to) ? $o->to : '';
            $toName = $toHeader;
            $toAddress = $toHeader;
            if (preg_match('/^(.*?)\s*<(.*?)>$/', $toHeader, $matches)) {
                $toName = trim($matches[1], '"\' ');
                $toAddress = trim($matches[2]);
            }
            
            // Match to leads
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
                    $importedCount++;
                } else {
                    $upStmt = $pdo->prepare("UPDATE `timeline_events` SET `timestamp` = ?, `title` = ? WHERE `id` = ?");
                    $upStmt->execute([$timestamp, $title, $eventId]);
                }
            }
        }
        
        echo "Done folder $folder. Imported $importedCount new email timeline events.\n";
        @imap_close($imapStream);
    }
    
    echo "\nAll email timeline events imported successfully!\n";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
