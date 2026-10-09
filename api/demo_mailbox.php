<?php
/**
 * The demo mailbox: fictive folders and messages for a demo install, served by
 * mail_broker.php in place of IMAP.
 *
 * The Mail module reads a live IMAP account, so seeded rows alone would never
 * show up. A demo install instead gives each demo user an `emailSettings`
 * profile that points at a reserved host (see ccrm_demo_mailbox_settings) and
 * carries `demoMailbox: true`. mail_broker.php hands every action for such a
 * profile to ccrm_demo_mailbox_handle(), which answers in exactly the shapes
 * the IMAP code returns, from the `demo_mail_messages` table.
 *
 * It can never shadow a real mailbox:
 *  - it needs DEMO_MODE = 'true', the flag AND the reserved `.invalid` host;
 *  - saving real settings in Personal Settings goes through
 *    normalizeEmailSettings(), which keeps only known keys, so the flag is
 *    dropped the moment anyone configures a real account.
 *
 * Nothing here opens a network connection: "sending" files the message into
 * the demo Sent folder, and attachments are generated on request.
 */

const CCRM_DEMO_MAIL_HOST = 'mail.demo.invalid';

/**
 * The demo team mailbox every demo user connects to. Shared on purpose: the
 * lead timeline and the RAG cache are keyed by mailbox, so private copies of
 * the same correspondence would show every message once per user.
 */
const CCRM_DEMO_TEAM_MAILBOX = 'team@crm.com';

/** The emailSettings profile seeded on a demo user. */
function ccrm_demo_mailbox_settings(): array {
    $userEmail = CCRM_DEMO_TEAM_MAILBOX;
    return [
        'provider' => 'smtp',
        'imapHost' => CCRM_DEMO_MAIL_HOST,
        'imapPort' => '993',
        'imapSecure' => 'ssl',
        'smtpHost' => CCRM_DEMO_MAIL_HOST,
        'smtpPort' => '465',
        'smtpSecure' => 'ssl',
        'imapUsername' => $userEmail,
        'imapPassword' => '',
        'smtpUsername' => $userEmail,
        'smtpPassword' => '',
        'isValidated' => true,
        'demoMailbox' => true,
    ];
}

function ccrm_demo_mailbox_active(PDO $pdo, $settings): bool {
    if (!is_array($settings) || empty($settings['demoMailbox'])) {
        return false;
    }
    if (strcasecmp(trim((string)($settings['imapHost'] ?? '')), CCRM_DEMO_MAIL_HOST) !== 0) {
        return false;
    }
    try {
        $mode = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'")->fetchColumn();
    } catch (\Throwable $e) {
        return false;
    }
    return $mode === 'true';
}

function ccrm_demo_mailbox_ensure_table(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `demo_mail_messages` (
      `id` VARCHAR(50) NOT NULL,
      `mailbox` VARCHAR(150) NOT NULL,
      `folder` VARCHAR(50) NOT NULL,
      `uid` INT NOT NULL,
      `message_id` VARCHAR(150) NOT NULL,
      `in_reply_to` VARCHAR(150) NULL,
      `references_hdr` TEXT NULL,
      `from_name` VARCHAR(150) NOT NULL,
      `from_address` VARCHAR(150) NOT NULL,
      `to_name` VARCHAR(150) NOT NULL,
      `to_address` VARCHAR(150) NOT NULL,
      `subject` VARCHAR(255) NOT NULL,
      `body_text` LONGTEXT NOT NULL,
      `body_html` LONGTEXT NULL,
      `sent_at` DATETIME NOT NULL,
      `seen` TINYINT(1) NOT NULL DEFAULT 0,
      `attachments_json` TEXT NULL,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uq_demo_mail_uid` (`mailbox`, `folder`, `uid`),
      INDEX `idx_demo_mail_sent_at` (`mailbox`, `folder`, `sent_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function ccrm_demo_mailbox_table_exists(PDO $pdo): bool {
    try {
        return $pdo->query("SHOW TABLES LIKE 'demo_mail_messages'")->rowCount() > 0;
    } catch (\Throwable $e) {
        return false;
    }
}

/** The folder names the demo store knows, matched case-insensitively. */
function ccrm_demo_mailbox_folder(string $folder): string {
    foreach (['INBOX', 'Sent', 'Drafts', 'Trash'] as $known) {
        if (strcasecmp($folder, $known) === 0) return $known;
    }
    return $folder;
}

function ccrm_demo_mailbox_row(PDO $pdo, string $mailbox, string $folder, $uid): ?array {
    if (!ccrm_demo_mailbox_table_exists($pdo)) return null;
    $stmt = $pdo->prepare("SELECT * FROM `demo_mail_messages` WHERE `mailbox` = ? AND `folder` = ? AND `uid` = ?");
    $stmt->execute([$mailbox, ccrm_demo_mailbox_folder($folder), (int)$uid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function ccrm_demo_mailbox_attachments(array $row): array {
    $list = json_decode((string)($row['attachments_json'] ?? ''), true);
    if (!is_array($list)) return [];
    $out = [];
    foreach (array_values($list) as $i => $att) {
        if (!is_array($att) || empty($att['name'])) continue;
        $out[] = [
            // Part 1 is the body; attachments follow, like a multipart message.
            'part_num' => (string)($i + 2),
            'name' => (string)$att['name'],
            'size' => (int)($att['size'] ?? 0),
            'type' => strtolower(pathinfo((string)$att['name'], PATHINFO_EXTENSION)),
        ];
    }
    return $out;
}

/** List preview: what was written, without the quoted history. */
function ccrm_demo_mailbox_preview(string $text): string {
    $lines = [];
    foreach (preg_split('/\R/u', $text) as $line) {
        if (preg_match('/^\s*>/', $line)) continue;
        $lines[] = $line;
    }
    $flat = trim(preg_replace('/\s+/u', ' ', implode(' ', $lines)));
    return mb_substr($flat, 0, 240, 'UTF-8');
}

function ccrm_demo_mailbox_list_entry(PDO $pdo, array $row, string $sessionEmail): array {
    $summary = '';
    try {
        $s = $pdo->prepare("SELECT `summary` FROM `email_summaries` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
        $s->execute([$sessionEmail, $row['folder'], (string)$row['uid']]);
        $summary = $s->fetchColumn() ?: '';
    } catch (\Throwable $e) {}

    return [
        'uid' => (int)$row['uid'],
        'event_id' => ccrm_mail_event_id($row['mailbox'], $row['folder'], $row['uid']),
        'subject' => $row['subject'],
        'from' => ['name' => $row['from_name'], 'address' => $row['from_address']],
        'to' => ['name' => $row['to_name'], 'address' => $row['to_address']],
        'date' => $row['sent_at'],
        'is_outgoing' => strcasecmp($row['folder'], 'Sent') === 0,
        'seen' => (bool)$row['seen'],
        'size' => strlen((string)$row['body_text']),
        'message_id' => $row['message_id'],
        'in_reply_to' => (string)($row['in_reply_to'] ?? ''),
        'references' => (string)($row['references_hdr'] ?? ''),
        'summary' => $summary,
        'preview' => ccrm_demo_mailbox_preview((string)$row['body_text']),
        'attachment_count' => count(ccrm_demo_mailbox_attachments($row)),
    ];
}

/** Same shape as fetch_imap_emails(). */
function ccrm_demo_mailbox_emails(PDO $pdo, string $mailbox, string $sessionEmail, string $folder, int $page, int $limit, string $filter, $searchEmail = null): array {
    $folder = ccrm_demo_mailbox_folder($folder);
    $page = max(1, $page);
    $emails = [];
    $total = 0;
    $unseen = 0;

    if (ccrm_demo_mailbox_table_exists($pdo)) {
        $where = "`mailbox` = ? AND `folder` = ?";
        $params = [$mailbox, $folder];
        if (!empty($searchEmail)) {
            $where .= " AND (LOWER(`from_address`) = ? OR LOWER(`to_address`) = ?)";
            $params[] = strtolower(trim((string)$searchEmail));
            $params[] = strtolower(trim((string)$searchEmail));
        } elseif ($filter === 'unread') {
            $where .= " AND `seen` = 0";
        }

        $c = $pdo->prepare("SELECT COUNT(*) FROM `demo_mail_messages` WHERE $where");
        $c->execute($params);
        $total = (int)$c->fetchColumn();

        $u = $pdo->prepare("SELECT COUNT(*) FROM `demo_mail_messages` WHERE `mailbox` = ? AND `folder` = ? AND `seen` = 0");
        $u->execute([$mailbox, $folder]);
        $unseen = (int)$u->fetchColumn();

        $offset = ($page - 1) * $limit;
        $q = $pdo->prepare("SELECT * FROM `demo_mail_messages` WHERE $where ORDER BY `sent_at` DESC, `uid` DESC LIMIT " . (int)$limit . " OFFSET " . (int)$offset);
        $q->execute($params);
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $emails[] = ccrm_demo_mailbox_list_entry($pdo, $row, $sessionEmail);
        }
    }

    return [
        'emails' => $emails,
        'pagination' => [
            'total' => $total,
            'unseen' => $unseen,
            'page' => $page,
            'limit' => $limit,
            'pages' => (int)ceil($total / max(1, $limit)),
        ],
    ];
}

/** Same shape as fetch_imap_email_detail(). Reading never changes the seen flag. */
function ccrm_demo_mailbox_detail(PDO $pdo, string $mailbox, string $folder, $uid): array {
    $row = ccrm_demo_mailbox_row($pdo, $mailbox, $folder, $uid);
    if (!$row) {
        throw new Exception('This message is no longer in ' . $folder . ' (it may have been moved or deleted).');
    }
    $text = (string)$row['body_text'];
    $html = (string)($row['body_html'] ?? '');
    if ($html === '') {
        $html = '<div style="white-space:pre-wrap;font-family:inherit">' . htmlspecialchars($text, ENT_QUOTES, 'UTF-8') . '</div>';
    }
    return [
        'uid' => (int)$row['uid'],
        'html' => $html,
        'text' => $text,
        'attachments' => ccrm_demo_mailbox_attachments($row),
        'seen' => (bool)$row['seen'],
    ];
}

function ccrm_demo_mailbox_body_text(PDO $pdo, string $mailbox, string $folder, $uid): string {
    $row = ccrm_demo_mailbox_row($pdo, $mailbox, $folder, $uid);
    return $row ? (string)$row['body_text'] : '';
}

function ccrm_demo_mailbox_set_seen(PDO $pdo, string $mailbox, string $folder, $uid, bool $seen): bool {
    if (!ccrm_demo_mailbox_row($pdo, $mailbox, $folder, $uid)) {
        throw new Exception('This message is no longer in ' . $folder . ' (it may have been moved or deleted).');
    }
    $stmt = $pdo->prepare("UPDATE `demo_mail_messages` SET `seen` = ? WHERE `mailbox` = ? AND `folder` = ? AND `uid` = ?");
    $stmt->execute([$seen ? 1 : 0, $mailbox, ccrm_demo_mailbox_folder($folder), (int)$uid]);
    return $seen;
}

function ccrm_demo_mailbox_delete(PDO $pdo, string $mailbox, string $folder, $uid): void {
    if (!ccrm_demo_mailbox_table_exists($pdo)) return;
    $stmt = $pdo->prepare("DELETE FROM `demo_mail_messages` WHERE `mailbox` = ? AND `folder` = ? AND `uid` = ?");
    $stmt->execute([$mailbox, ccrm_demo_mailbox_folder($folder), (int)$uid]);
}

function ccrm_demo_mailbox_next_uid(PDO $pdo, string $mailbox, string $folder): int {
    $stmt = $pdo->prepare("SELECT COALESCE(MAX(`uid`), 0) FROM `demo_mail_messages` WHERE `mailbox` = ? AND `folder` = ?");
    $stmt->execute([$mailbox, $folder]);
    return (int)$stmt->fetchColumn() + 1;
}

/**
 * Insert one message, then do what reading it from IMAP would have done: file
 * it on the matching lead's timeline and cache it for the RAG assistant.
 * Used by the seeder and by "send" in demo mode.
 */
function ccrm_demo_mailbox_insert(PDO $pdo, array $m): void {
    $ins = $pdo->prepare("INSERT INTO `demo_mail_messages`
        (`id`, `mailbox`, `folder`, `uid`, `message_id`, `in_reply_to`, `references_hdr`, `from_name`, `from_address`, `to_name`, `to_address`, `subject`, `body_text`, `body_html`, `sent_at`, `seen`, `attachments_json`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $ins->execute([
        $m['id'], $m['mailbox'], $m['folder'], (int)$m['uid'], $m['message_id'], $m['in_reply_to'] ?? null, $m['references'] ?? null,
        $m['from_name'], $m['from_address'], $m['to_name'], $m['to_address'], $m['subject'], $m['body_text'], $m['body_html'] ?? null,
        $m['sent_at'], !empty($m['seen']) ? 1 : 0, isset($m['attachments']) ? json_encode(array_values($m['attachments']), JSON_UNESCAPED_UNICODE) : null,
    ]);

    $isOutgoing = strcasecmp($m['folder'], 'Sent') === 0 ? 1 : 0;

    // Lead timeline, as fetch_imap_emails() files it.
    $leadId = null;
    $find = $pdo->prepare("SELECT `id` FROM `leads` WHERE LOWER(`email`) = ? LIMIT 1");
    foreach ([$m['from_address'], $m['to_address']] as $address) {
        if ($leadId || trim((string)$address) === '') continue;
        $find->execute([strtolower(trim((string)$address))]);
        $leadId = $find->fetchColumn() ?: null;
    }
    if ($leadId) {
        $eventId = ccrm_mail_event_id($m['mailbox'], $m['folder'], $m['uid']);
        $author = null;
        if ($isOutgoing) {
            $a = $pdo->prepare("SELECT `name` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1");
            $a->execute([strtolower($m['from_address'])]);
            $author = $a->fetchColumn() ?: null;
        }
        $content = "From: {$m['from_name']} <{$m['from_address']}>\nTo: {$m['to_name']} <{$m['to_address']}>\nSubject: {$m['subject']}";
        $tl = $pdo->prepare("INSERT IGNORE INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `is_outgoing`, `author`) VALUES (?, ?, 'email', ?, ?, ?, ?, ?)");
        $tl->execute([$eventId, $leadId, $m['sent_at'], $m['subject'], $content, $isOutgoing, $author]);
    }

    // RAG cache (main database), keyed like the IMAP import.
    $rag = $pdo->prepare("INSERT IGNORE INTO `rag_emails` (`user_email`, `folder`, `email_uid`, `subject`, `sender`, `recipient`, `body`, `received_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $rag->execute([
        $m['mailbox'], $m['folder'], (string)$m['uid'], $m['subject'],
        $m['from_name'] . ' <' . $m['from_address'] . '>',
        $m['to_name'] . ' <' . $m['to_address'] . '>',
        $m['body_text'], $m['sent_at'],
    ]);
}

// ---------------------------------------------------------------------------
// Generated attachments. Only the name lives in the store; the bytes are made
// on request, in a format that passes ccrm_stored_file_matches_extension().
// ---------------------------------------------------------------------------

function ccrm_demo_ascii(string $s): string {
    $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    if ($t === false || $t === '') {
        $t = preg_replace('/[^\x20-\x7E]/', '', $s);
    }
    return preg_replace('/[^\x20-\x7E]/', '', (string)$t);
}

/** A one-page PDF with a title and a few lines of Helvetica text. */
function ccrm_demo_pdf(string $title, array $lines): string {
    $esc = function (string $s): string {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], ccrm_demo_ascii($s));
    };
    $stream = "BT /F1 18 Tf 56 780 Td (" . $esc($title) . ") Tj ET\n";
    $y = 748;
    foreach ($lines as $line) {
        $stream .= "BT /F1 11 Tf 56 {$y} Td (" . $esc((string)$line) . ") Tj ET\n";
        $y -= 18;
        if ($y < 60) break;
    }
    $stream .= "BT /F1 8 Tf 56 40 Td (CCRM demo document - generated sample, not a real record) Tj ET\n";

    $objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        "<< /Length " . strlen($stream) . " >>\nstream\n" . $stream . "endstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ];
    $pdf = "%PDF-1.4\n";
    $offsets = [];
    foreach ($objects as $i => $body) {
        $offsets[] = strlen($pdf);
        $pdf .= ($i + 1) . " 0 obj\n" . $body . "\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
    foreach ($offsets as $o) {
        $pdf .= sprintf("%010d 00000 n \n", $o);
    }
    $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
    return $pdf;
}

/** A stone-texture "photo" as a PNG, written without GD. $seed varies the slab. */
function ccrm_demo_png(int $seed, int $w = 320, int $h = 220): string {
    mt_srand($seed);
    $base = [mt_rand(170, 215), mt_rand(165, 205), mt_rand(155, 195)];
    $raw = '';
    $veins = [];
    for ($i = 0; $i < 4; $i++) {
        $veins[] = [mt_rand(0, $h), mt_rand(-60, 60) / 100, mt_rand(2, 5)];
    }
    for ($y = 0; $y < $h; $y++) {
        $raw .= "\0";
        for ($x = 0; $x < $w; $x++) {
            $n = mt_rand(-12, 12);
            $d = 0;
            foreach ($veins as [$v0, $slope, $width]) {
                $dist = abs($y - ($v0 + $slope * $x + 8 * sin($x / 23)));
                if ($dist < $width) $d -= (int)(55 * (1 - $dist / $width));
            }
            $raw .= chr(max(0, min(255, $base[0] + $n + $d)))
                  . chr(max(0, min(255, $base[1] + $n + $d)))
                  . chr(max(0, min(255, $base[2] + $n + $d)));
        }
    }
    mt_srand();
    $chunk = function (string $type, string $data): string {
        return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    };
    return "\x89PNG\r\n\x1a\n"
        . $chunk('IHDR', pack('NNCCCCC', $w, $h, 8, 2, 0, 0, 0))
        . $chunk('IDAT', gzcompress($raw, 6))
        . $chunk('IEND', '');
}

/** An iCalendar invite. $att['ics'] = [start 'Y-m-d H:i:s', minutes, title, location]. */
function ccrm_demo_ics(array $ics, string $organizer, string $attendee): string {
    $start = new \DateTimeImmutable($ics[0]);
    $end = $start->modify('+' . (int)$ics[1] . ' minutes');
    $fmt = function (\DateTimeImmutable $d) { return $d->format('Ymd\THis'); };
    $esc = function (string $s) { return str_replace([',', ';', "\n"], ['\\,', '\\;', '\\n'], $s); };
    return implode("\r\n", [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CCRM demo//EN', 'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:' . md5($ics[0] . $ics[2]) . '@demo.invalid',
        'DTSTAMP:' . gmdate('Ymd\THis\Z'),
        'DTSTART:' . $fmt($start),
        'DTEND:' . $fmt($end),
        'SUMMARY:' . $esc((string)$ics[2]),
        'LOCATION:' . $esc((string)($ics[3] ?? '')),
        'ORGANIZER:mailto:' . $organizer,
        'ATTENDEE;RSVP=TRUE:mailto:' . $attendee,
        'END:VEVENT', 'END:VCALENDAR', '',
    ]);
}

/** The bytes and MIME type of one demo attachment. */
function ccrm_demo_attachment_bytes(array $row, array $att): array {
    $name = (string)$att['name'];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    switch ($ext) {
        case 'pdf':
            return [ccrm_demo_pdf((string)($att['title'] ?? $row['subject']), (array)($att['lines'] ?? [])), 'application/pdf'];
        case 'png':
            return [ccrm_demo_png((int)($att['seed'] ?? crc32($name))), 'image/png'];
        case 'ics':
            return [ccrm_demo_ics((array)($att['ics'] ?? [$row['sent_at'], 60, $row['subject'], '']), $row['from_address'], $row['to_address']), 'text/calendar; charset=utf-8'];
        case 'csv':
            $out = "\xEF\xBB\xBF";
            foreach ((array)($att['rows'] ?? []) as $r) {
                $out .= implode(';', array_map(function ($c) { return '"' . str_replace('"', '""', (string)$c) . '"'; }, (array)$r)) . "\r\n";
            }
            return [$out, 'text/csv; charset=utf-8'];
        default:
            return [implode("\n", (array)($att['lines'] ?? [$row['subject']])) . "\n", 'text/plain; charset=utf-8'];
    }
}

/** Generated size of an attachment, recorded in the store so the list shows it. */
function ccrm_demo_attachment_size(array $att): int {
    $fake = ['subject' => '', 'sent_at' => date('Y-m-d H:i:s'), 'from_address' => 'a@demo.invalid', 'to_address' => 'b@demo.invalid'];
    return strlen(ccrm_demo_attachment_bytes($fake, $att)[0]);
}

function ccrm_demo_find_attachment(PDO $pdo, string $mailbox, string $folder, $uid, string $partNum): array {
    $row = ccrm_demo_mailbox_row($pdo, $mailbox, $folder, $uid);
    if (!$row) {
        throw new Exception('This message is no longer in ' . $folder . ' (it may have been moved or deleted).');
    }
    $list = json_decode((string)($row['attachments_json'] ?? ''), true);
    $idx = (int)$partNum - 2;
    if (!is_array($list) || !isset($list[$idx]) || !is_array($list[$idx])) {
        throw new Exception('Attachment not found.');
    }
    return [$row, $list[$idx]];
}

// ---------------------------------------------------------------------------
// The endpoint: every mail_broker.php action, answered from the store.
// ---------------------------------------------------------------------------

function ccrm_demo_mailbox_handle(PDO $pdo, string $action, array $settings, string $sessionEmail): void {
    $mailbox = strtolower(trim((string)($settings['imapUsername'] ?? $sessionEmail)));
    $folderParam = function ($value) {
        return ccrm_demo_mailbox_folder(trim((string)($value ?? 'INBOX')) ?: 'INBOX');
    };

    try {
        switch ($action) {
            case 'get_folders':
                $folders = [];
                foreach (['INBOX', 'Sent', 'Drafts', 'Trash'] as $f) {
                    $folders[] = ['path' => $f, 'name' => $f, 'delimiter' => '/'];
                }
                echo json_encode(['success' => true, 'folders' => $folders]);
                return;

            case 'get_emails':
                $folder = $folderParam($_GET['folder'] ?? 'INBOX');
                $result = ccrm_demo_mailbox_emails(
                    $pdo, $mailbox, $sessionEmail, $folder,
                    isset($_GET['page']) ? intval($_GET['page']) : 1, 25,
                    isset($_GET['filter']) ? (string)$_GET['filter'] : 'all',
                    $_GET['email'] ?? null
                );
                echo json_encode(array_merge(['success' => true, 'folder' => $folder], $result));
                return;

            case 'get_email_detail':
                $uid = $_GET['uid'] ?? '';
                if ($uid === '') throw new Exception('Missing email UID.');
                $email = ccrm_demo_mailbox_detail($pdo, $mailbox, $folderParam($_GET['folder'] ?? 'INBOX'), $uid);
                echo json_encode(['success' => true, 'email' => $email]);
                return;

            case 'set_seen':
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('Invalid method.');
                $payload = json_decode(file_get_contents('php://input'), true);
                if (!is_array($payload)) throw new Exception('Invalid payload.');
                $uid = trim((string)($payload['uid'] ?? ''));
                if ($uid === '' || !array_key_exists('seen', $payload)) throw new Exception('Missing parameters.');
                $folder = $folderParam($payload['folder'] ?? 'INBOX');
                $seen = ccrm_demo_mailbox_set_seen($pdo, $mailbox, $folder, $uid, !empty($payload['seen']));
                echo json_encode(['success' => true, 'uid' => $uid, 'folder' => $folder, 'seen' => $seen]);
                return;

            case 'delete_email':
                if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') throw new Exception('Invalid method.');
                ccrm_demo_mailbox_delete($pdo, $mailbox, $folderParam($_GET['folder'] ?? 'INBOX'), $_GET['uid'] ?? 0);
                echo json_encode(['success' => true]);
                return;

            case 'send_email':
                // Demo mode never delivers: the message is filed into the demo
                // Sent folder so the flow is visible end to end.
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception('Invalid method.');
                $payload = json_decode(file_get_contents('php://input'), true);
                if (!is_array($payload)) throw new Exception('Invalid email payload.');
                ccrm_demo_mailbox_ensure_table($pdo);
                $to = trim((string)($payload['to'] ?? ''));
                $toName = $to;
                if (preg_match('/^(.*?)\s*<(.*?)>$/', $to, $mm)) { $toName = trim($mm[1], "\"' "); $to = trim($mm[2]); }
                $html = (string)($payload['html'] ?? '');
                $text = trim(html_entity_decode(strip_tags(preg_replace('#<br\s*/?>|</p>#i', "\n", $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                $fromName = $sessionEmail;
                $n = $pdo->prepare("SELECT `name` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1");
                $n->execute([strtolower($sessionEmail)]);
                $fromName = $n->fetchColumn() ?: $sessionEmail;
                $uid = ccrm_demo_mailbox_next_uid($pdo, $mailbox, 'Sent');
                $messageId = '<demo-sent-' . bin2hex(random_bytes(6)) . '@demo.invalid>';
                ccrm_demo_mailbox_insert($pdo, [
                    'id' => 'demo-mail-s' . bin2hex(random_bytes(6)),
                    'mailbox' => $mailbox, 'folder' => 'Sent', 'uid' => $uid,
                    'message_id' => $messageId,
                    'from_name' => (string)$fromName, 'from_address' => $sessionEmail,
                    'to_name' => $toName ?: $to, 'to_address' => $to,
                    'subject' => (string)($payload['subject'] ?? ''),
                    'body_text' => $text, 'body_html' => $html,
                    'sent_at' => date('Y-m-d H:i:s'), 'seen' => 1,
                ]);
                echo json_encode(['success' => true, 'filed_to_sent' => true, 'message_id' => $messageId]);
                return;

            case 'get_attachment':
                $uid = $_GET['uid'] ?? '';
                $part = (string)($_GET['part'] ?? '');
                if ($uid === '' || $part === '') throw new Exception('Missing parameters.');
                [$row, $att] = ccrm_demo_find_attachment($pdo, $mailbox, $folderParam($_GET['folder'] ?? 'INBOX'), $uid, $part);
                [$bytes, $mime] = ccrm_demo_attachment_bytes($row, $att);
                $safe = ccrm_safe_upload_name((string)$att['name']) ?: 'attachment';
                header('Content-Type: ' . $mime);
                header('Content-Disposition: attachment; filename="' . $safe . '"');
                header('Content-Length: ' . strlen($bytes));
                echo $bytes;
                return;

            case 'save_attachment':
                $uid = $_GET['uid'] ?? '';
                $part = (string)($_GET['part'] ?? '');
                $eventId = isset($_GET['eventId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['eventId']) : '';
                if ($uid === '' || $part === '' || $eventId === '') throw new Exception('Missing parameters.');
                [$row, $att] = ccrm_demo_find_attachment($pdo, $mailbox, $folderParam($_GET['folder'] ?? 'INBOX'), $uid, $part);
                $safe = ccrm_safe_upload_name((string)$att['name']);
                if ($safe === null) {
                    echo json_encode(['success' => false, 'error' => 'This attachment type cannot be saved to documents.']);
                    return;
                }
                [$bytes] = ccrm_demo_attachment_bytes($row, $att);
                $target = ccrm_uploads_dir() . $eventId . '_' . $safe;
                if (@file_put_contents($target, $bytes) === false) {
                    echo json_encode(['success' => false, 'error' => 'Failed to save file on server.']);
                    return;
                }
                $ext = strtolower(pathinfo($safe, PATHINFO_EXTENSION));
                $extracted = in_array($ext, ['pdf', 'csv', 'ics', 'txt'], true)
                    ? implode("\n", array_merge([(string)($att['title'] ?? '')], array_map('strval', (array)($att['lines'] ?? []))))
                    : '';
                echo json_encode([
                    'success' => true,
                    'fileName' => $safe,
                    'filePath' => '/uploads/' . $eventId . '_' . $safe,
                    'extractedText' => trim($extracted),
                ]);
                return;

            default:
                throw new Exception('Unsupported action: ' . $action);
        }
    } catch (Throwable $ex) {
        http_response_code(500);
        $isUserFacing = ($ex instanceof Exception) && !($ex instanceof \ErrorException);
        if (function_exists('ccrm_log_exception')) {
            ccrm_log_exception($ex);
        }
        echo json_encode(['success' => false, 'error' => $isUserFacing ? $ex->getMessage() : 'The mail server request failed.']);
    }
}

/**
 * Remove the demo mailbox: its RAG and summary caches, the demo profile on any
 * user (users survive a wipe with keep_configs, and a leftover profile would
 * point IMAP at the reserved host once DEMO_MODE is off), and the store itself.
 * Runs outside a transaction — DROP TABLE commits implicitly.
 */
function ccrm_demo_mailbox_wipe(PDO $pdo): void {
    if (ccrm_demo_mailbox_table_exists($pdo)) {
        $pdo->prepare("DELETE FROM `rag_emails` WHERE `user_email` = ?")->execute([CCRM_DEMO_TEAM_MAILBOX]);
        // Matched in PHP: comparing email_uid with CAST(uid AS CHAR) in SQL
        // fails on a collation mismatch.
        $del = $pdo->prepare("DELETE FROM `email_summaries` WHERE `folder` = ? AND `email_uid` = ? AND `user_email` IN ('alex@crm.com', 'sam@crm.com', 'jordan@crm.com')");
        foreach ($pdo->query("SELECT `folder`, `uid` FROM `demo_mail_messages`")->fetchAll(PDO::FETCH_ASSOC) as $d) {
            $del->execute([$d['folder'], (string)$d['uid']]);
        }
        $pdo->exec("DELETE FROM `email_summaries` WHERE `folder` = 'thread' AND `user_email` IN ('alex@crm.com', 'sam@crm.com', 'jordan@crm.com')");
    }

    $rows = $pdo->query("SELECT `id`, `metadata_json` FROM `users` WHERE `metadata_json` LIKE '%demoMailbox%'")->fetchAll(PDO::FETCH_ASSOC);
    $upd = $pdo->prepare("UPDATE `users` SET `metadata_json` = ? WHERE `id` = ?");
    foreach ($rows as $r) {
        $meta = json_decode((string)$r['metadata_json'], true);
        if (!is_array($meta) || !is_array($meta['emailSettings'] ?? null)) continue;
        $host = trim((string)($meta['emailSettings']['imapHost'] ?? ''));
        if (empty($meta['emailSettings']['demoMailbox']) || strcasecmp($host, CCRM_DEMO_MAIL_HOST) !== 0) continue;
        unset($meta['emailSettings']);
        $upd->execute([json_encode($meta, JSON_UNESCAPED_UNICODE), $r['id']]);
    }

    $pdo->exec("DROP TABLE IF EXISTS `demo_mail_messages`");
}
