<?php
/**
 * Attachments of mail the background job filed onto a timeline (api/mail_filing.php).
 *
 * Until 1.12.73 the job kept only each attachment's name and size, and the files stayed on
 * the mail server, which only the mailbox's owner can open. Now the files themselves are
 * kept, so anyone who may read e-mail on a timeline can open them.
 *
 * Stored like the private employee documents (employee_files.php): under
 * uploads/private/mail/ with a random name, behind a deny-all guard, and streamed by
 * mail_broker.php?action=get_filed_mail_attachment after the same permission check that
 * guards the stored body. The original name lives only in filed_mail_bodies.attachments_json,
 * as [{name, size, part, key?}], where `key` is the storage name and is never sent to the
 * client. An attachment without a `key` was not kept (too big, a blocked file type, an inline
 * image, or the message no longer had it); it is still listed by name.
 *
 * Bounded, because a mailbox can hold gigabytes of them: CCRM_MAIL_ATTACHMENT_MAX_BYTES per
 * file and CCRM_MAIL_ATTACHMENTS_MAX_TOTAL per message.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/employee_files.php';

/** Largest attachment kept, in bytes once decoded; a bigger one stays a name only. */
const CCRM_MAIL_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
/** Most attachment bytes kept for one message. */
const CCRM_MAIL_ATTACHMENTS_MAX_TOTAL = 50 * 1024 * 1024;

/** Absolute path of uploads/private/mail/ WITH a trailing slash, created on demand together with its guard. */
function ccrm_mail_attachment_dir(): string {
    ccrm_employee_private_dir(); // makes uploads/private/ and its deny-all guard
    $dir = ccrm_uploads_dir() . 'private/mail/';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    if (is_dir($dir)) {
        $guard = $dir . '.htaccess';
        $existing = @file_get_contents($guard);
        if ($existing === false || strpos($existing, ccrm_employee_private_guard_marker()) === false) {
            @file_put_contents($guard, ccrm_employee_private_guard_contents());
        }
    }
    return $dir;
}

/** Is this a storage name of our own making (and nothing that could leave the folder)? */
function ccrm_mail_attachment_key_ok($key): bool {
    return is_string($key) && preg_match('/^[a-f0-9]{32}\.[a-z0-9]{1,10}$/', $key) === 1;
}

/** Absolute path of a stored attachment, or null when the key is malformed or the file is missing. */
function ccrm_mail_attachment_path($key): ?string {
    if (!ccrm_mail_attachment_key_ok($key)) {
        return null;
    }
    $real = realpath(ccrm_mail_attachment_dir() . $key);
    $base = realpath(ccrm_mail_attachment_dir());
    if ($real === false || $base === false || strncmp($real, $base, strlen($base)) !== 0 || !is_file($real)) {
        return null;
    }
    return $real;
}

/** Removes stored attachment files by storage name; whatever is not ours or already gone is ignored. */
function ccrm_mail_attachment_delete(array $keys): void {
    foreach ($keys as $key) {
        $path = ccrm_mail_attachment_path($key);
        if ($path !== null) {
            @unlink($path);
        }
    }
}

/** The storage names in a stored attachment list. */
function ccrm_mail_attachment_keys($list): array {
    $keys = [];
    foreach (is_array($list) ? $list : [] as $a) {
        if (is_array($a) && ccrm_mail_attachment_key_ok($a['key'] ?? null)) {
            $keys[] = $a['key'];
        }
    }
    return $keys;
}

/** Image shown inside the message body itself (a signature logo): not worth keeping. */
function ccrm_mail_part_is_inline_image($part): bool {
    return is_object($part) && !empty($part->ifdisposition) && strtolower((string)$part->disposition) === 'inline' && (int)$part->type === 5;
}

/**
 * Reads the attachments of one open IMAP message and keeps what is worth keeping.
 * `$previous` is what an earlier read of the same message stored: a part that was kept
 * and is still on disk is reused rather than fetched again. Returns the list to store:
 * [{name, size, part, key?}] in message order.
 */
function ccrm_mail_keep_attachments($stream, int $msgNo, $structure, array $previous = []): array {
    $reusable = [];
    foreach ($previous as $p) {
        if (is_array($p) && isset($p['part']) && ccrm_mail_attachment_path($p['key'] ?? null) !== null) {
            $reusable[(string)$p['part'] . '|' . (string)($p['name'] ?? '')] = $p;
        }
    }
    $out = [];
    $left = CCRM_MAIL_ATTACHMENTS_MAX_TOTAL;
    foreach ($structure ? get_attachments_from_structure($structure) : [] as $a) {
        $part = (string)$a['part_num'];
        $entry = ['name' => $a['name'], 'size' => (int)$a['size'], 'part' => $part];

        $again = $reusable[$part . '|' . $a['name']] ?? null;
        if ($again !== null) {
            $entry['size'] = (int)($again['size'] ?? $entry['size']);
            $entry['key'] = $again['key'];
            $left -= $entry['size'];
            $out[] = $entry;
            continue;
        }

        $safeName = ccrm_safe_upload_name((string)$a['name']);
        $node = find_structure_part($structure, $part);
        // The size on the server is the encoded one (base64 is a third larger), so this only
        // spares a pointless download; the decoded size is checked again below.
        $keepable = $safeName !== null && is_object($node) && !ccrm_mail_part_is_inline_image($node)
            && (int)$a['size'] <= CCRM_MAIL_ATTACHMENT_MAX_BYTES * 1.4
            && $left > 0;
        if ($keepable) {
            $data = @imap_fetchbody($stream, $msgNo, $part, FT_PEEK);
            $data = is_string($data) ? decode_imap_body($data, $node->encoding ?? 0) : '';
            if (is_string($data) && $data !== '' && strlen($data) <= CCRM_MAIL_ATTACHMENT_MAX_BYTES && strlen($data) <= $left) {
                $key = ccrm_employee_private_new_name($safeName);
                $path = ccrm_mail_attachment_dir() . $key;
                // Same guard as upload.php: bytes that do not match the format the name promises are not kept.
                if (@file_put_contents($path, $data) !== false && ccrm_stored_file_matches_extension($path, $safeName)) {
                    $entry['size'] = strlen($data);
                    $entry['key'] = $key;
                    $left -= $entry['size'];
                } else {
                    @unlink($path);
                }
            }
        }
        $out[] = $entry;
    }
    return $out;
}

/**
 * The attachment list as the client may see it: no storage names, and whether the file was
 * kept. Position matters (an attachment is opened by its index), so nothing is dropped.
 */
function ccrm_mail_attachments_for_client($list): array {
    $out = [];
    foreach (is_array($list) ? array_values($list) : [] as $a) {
        $a = is_array($a) ? $a : [];
        $out[] = [
            'name' => (string)($a['name'] ?? ''),
            'size' => (int)($a['size'] ?? 0),
            'stored' => ccrm_mail_attachment_key_ok($a['key'] ?? null),
        ];
    }
    return $out;
}

/** Drops a filed message's stored body and deletes its attachment files. */
function ccrm_mail_purge_filed(PDO $pdo, string $eventId): void {
    $stmt = $pdo->prepare("SELECT `attachments_json` FROM `filed_mail_bodies` WHERE `event_id` = ?");
    $stmt->execute([$eventId]);
    $json = $stmt->fetchColumn();
    if ($json === false) {
        return;
    }
    ccrm_mail_attachment_delete(ccrm_mail_attachment_keys(json_decode((string)$json, true)));
    $pdo->prepare("DELETE FROM `filed_mail_bodies` WHERE `event_id` = ?")->execute([$eventId]);
    $pdo->prepare("UPDATE `timeline_events` SET `mail_has_body` = 0 WHERE `id` = ?")->execute([$eventId]);
}

/** Content type of a stored attachment, from the extension of its original name. */
function ccrm_mail_attachment_content_type(string $name): string {
    return ccrm_employee_file_content_type($name);
}
