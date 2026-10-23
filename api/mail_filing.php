<?php
/**
 * Background mail filing: read the company mailboxes and every user's mailbox over
 * IMAP and file each message from or to a known customer onto that customer's
 * timeline, readable by everyone who may see the timeline.
 *
 * Until 1.12.72 mail reached a timeline only lazily, when the owner of a mailbox
 * happened to open the lead (see fetch_imap_emails() in mail_broker.php), and a
 * mailbox nobody had connected was never read at all. This is the job the cron entry
 * point (api/cron.php) runs every few minutes.
 *
 * Incremental. For every mailbox and folder, `mail_sync_state` keeps the highest UID
 * seen (`last_uid`) and the UIDVALIDITY it belongs to. The first time a folder is seen
 * the high-water mark is set to what is already there and the existing mail is caught up
 * newest first, in chunks across runs, back to the mailbox's cut-off date; new mail is
 * always handled before the backlog.
 *
 * Same ids as the interactive path. A message gets `ccrm_mail_event_id(imap user,
 * folder, uid)`, exactly what the live read and the migration use, so the two never file
 * one message twice, and the hidden tombstone is honoured. A message that sits in two
 * mailboxes (sent to info@ and copied to a person) is filed once, by its Message-ID.
 *
 * Which row a message is filed to (the customer record, not an arbitrary one):
 *  1. Every address on the message except the mailbox's own is looked up. The sender
 *     comes first on incoming mail; the recipients (To, then Cc) first on outgoing mail.
 *  2. An address matches a row whose own `email` is that address; failing that, a row
 *     that lists it among its authorised contact addresses (`ticket_allowed_emails`,
 *     exact addresses only, a domain entry is not a customer).
 *  3. Several rows can carry one address (a lead, its later deals, its client record).
 *     The lead row wins over the client record, because a client's profile lists the
 *     timelines of all its rows while a lead's drawer shows only its own; an active row
 *     wins over an archived one; then the newest. See ccrm_mail_pick_row().
 *
 * Bounded. A run stops at CCRM_MAIL_RUN_MAX_SECONDS or CCRM_MAIL_RUN_MAX_MESSAGES,
 * whichever comes first; one broken mailbox is recorded and the others still run; an
 * advisory lock keeps two overlapping cron hits from filing the same mail.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/mail_broker.php';
require_once __DIR__ . '/mail_attachments.php';

const CCRM_MAIL_RUN_MAX_SECONDS = 45;
const CCRM_MAIL_RUN_MAX_MESSAGES = 300;
/** Characters of body kept per message; longer text is cut and flagged. */
const CCRM_MAIL_BODY_MAX_CHARS = 60000;

// ── addresses and matching ────────────────────────────────────────────────────

/** Lower-case e-mail addresses found in a header value or a list of address objects. */
function ccrm_mail_addresses_in($value): array {
    $out = [];
    if (is_array($value)) {
        foreach ($value as $a) {
            if (is_object($a) && !empty($a->mailbox) && !empty($a->host)) {
                $out[] = strtolower(trim($a->mailbox . '@' . $a->host));
            }
        }
    } elseif (is_string($value) && preg_match_all('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $value, $m)) {
        foreach ($m[0] as $a) $out[] = strtolower($a);
    }
    return array_values(array_unique($out));
}

/**
 * Every row a message could be filed to, by address: ['own' => [addr => rows], 'contact' => [addr => rows]].
 * Cached per request: the interactive read calls it once per listed message.
 */
function ccrm_mail_address_index(PDO $pdo, bool $refresh = false): array {
    static $cache = null;
    if ($cache !== null && !$refresh) {
        return $cache;
    }
    $index = ['own' => [], 'contact' => []];
    $stmt = $pdo->query(
        "SELECT `id`, `email`, `archived`, `created_at`, `ticket_allowed_emails` FROM `leads`
         WHERE (`email` IS NOT NULL AND `email` <> '') OR (`ticket_allowed_emails` IS NOT NULL AND `ticket_allowed_emails` <> '')"
    );
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $row = [
            'id' => (string)$r['id'],
            'client' => strpos((string)$r['id'], 'client-') === 0,
            'archived' => !empty($r['archived']),
            'created_at' => (string)$r['created_at'],
        ];
        foreach (ccrm_mail_addresses_in((string)($r['email'] ?? '')) as $addr) {
            $index['own'][$addr][] = $row;
        }
        $allowed = !empty($r['ticket_allowed_emails']) ? json_decode($r['ticket_allowed_emails'], true) : [];
        if (is_array($allowed)) {
            foreach ($allowed as $entry) {
                // an exact address; "@domain" or "domain.sk" entries name a whole company, not a person
                if (is_string($entry) && preg_match('/^[^@\s]+@[^@\s]+\.[^@\s]+$/', trim($entry))) {
                    $index['contact'][strtolower(trim($entry))][] = $row;
                }
            }
        }
    }
    $cache = $index;
    return $index;
}

/** The row a message goes to among several that carry one address; null for none. See the file header. */
function ccrm_mail_pick_row(array $rows): ?string {
    if (!$rows) return null;
    usort($rows, function ($a, $b) {
        $rank = fn($r) => ($r['archived'] ? 2 : 0) + ($r['client'] ? 1 : 0);
        return [$rank($a), $b['created_at'], $a['id']] <=> [$rank($b), $a['created_at'], $b['id']];
    });
    return $rows[0]['id'];
}

/**
 * The id of the lead / client record a message belongs to. `$addresses` is in priority
 * order and must not contain the mailbox's own addresses (see ccrm_mail_counterparties).
 */
function ccrm_mail_match_row(array $index, array $addresses): ?string {
    foreach (['own', 'contact'] as $tier) {
        foreach ($addresses as $addr) {
            $addr = strtolower(trim($addr));
            if ($addr !== '' && isset($index[$tier][$addr])) {
                return ccrm_mail_pick_row($index[$tier][$addr]);
            }
        }
    }
    return null;
}

/**
 * The addresses of a message worth looking up, best first, without the mailbox's own.
 * Incoming mail: the sender, then the other recipients. Outgoing mail: the recipients.
 */
function ccrm_mail_counterparties(array $from, array $to, array $cc, array $ownAddresses, bool $outgoing): array {
    $own = array_map('strtolower', $ownAddresses);
    $ordered = $outgoing ? array_merge($to, $cc, $from) : array_merge($from, $to, $cc);
    $out = [];
    foreach ($ordered as $a) {
        $a = strtolower(trim($a));
        if ($a !== '' && !in_array($a, $own, true) && !in_array($a, $out, true)) $out[] = $a;
    }
    return $out;
}

// ── filing one message ────────────────────────────────────────────────────────

/** Plain text of a mail body, tidied and cut; [text, truncated]. */
function ccrm_mail_clean_body(string $text): array {
    $text = str_replace(["\r\n", "\r"], "\n", safe_utf8($text));
    $text = preg_replace('/[ \t]+\n/', "\n", $text);
    $text = preg_replace("/\n{3,}/", "\n\n", $text);
    $text = trim($text);
    if (mb_strlen($text, 'UTF-8') > CCRM_MAIL_BODY_MAX_CHARS) {
        return [mb_substr($text, 0, CCRM_MAIL_BODY_MAX_CHARS, 'UTF-8'), true];
    }
    return [$text, false];
}

/**
 * Stores one message on a timeline. Returns 'filed', 'updated', 'hidden' (the user removed
 * it; the tombstone stays) or 'duplicate' (the same Message-ID is already on that timeline).
 * `$m`: lead_id, event_id, timestamp, title, content, is_outgoing, author, mail_account,
 * mail_owner, message_id, body (text|null), attachments (the list to store, or a callable that
 * takes the list stored before and returns it, called only when the message is actually filed),
 * truncated.
 */
function ccrm_mail_store_event(PDO $pdo, array $m): string {
    $existing = $pdo->prepare("SELECT `id`, `hidden`, `mail_has_body` FROM `timeline_events` WHERE `id` = ?");
    $existing->execute([$m['event_id']]);
    $row = $existing->fetch(PDO::FETCH_ASSOC);
    if ($row && !empty($row['hidden'])) {
        return 'hidden';
    }
    $hasBody = ($m['body'] ?? null) !== null && $m['body'] !== '';
    if (!$row && $m['message_id'] !== '') {
        $dup = $pdo->prepare("SELECT 1 FROM `timeline_events` WHERE `lead_id` = ? AND `mail_message_id` = ? AND `id` <> ? LIMIT 1");
        $dup->execute([$m['lead_id'], $m['message_id'], $m['event_id']]);
        if ($dup->fetchColumn()) {
            return 'duplicate';
        }
    }
    if (!$row) {
        $pdo->prepare(
            "INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `is_outgoing`, `author`, `mail_account`, `mail_owner`, `mail_has_body`, `mail_message_id`)
             VALUES (?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([
            $m['event_id'], $m['lead_id'], $m['timestamp'], $m['title'], $m['content'], $m['is_outgoing'] ? 1 : 0, $m['author'],
            $m['mail_account'], $m['mail_owner'], $hasBody ? 1 : 0, $m['message_id'] !== '' ? $m['message_id'] : null,
        ]);
        $result = 'filed';
    } else {
        // Re-read of a message that is already filed (the live read got there first, or a
        // second pass): refresh what the message owns, never the user's title / timestamp.
        $pdo->prepare(
            "UPDATE `timeline_events` SET `lead_id` = ?, `is_outgoing` = ?, `author` = COALESCE(`author`, ?),
                    `mail_account` = COALESCE(`mail_account`, ?), `mail_owner` = COALESCE(`mail_owner`, ?),
                    `mail_has_body` = ?, `mail_message_id` = COALESCE(`mail_message_id`, ?) WHERE `id` = ?"
        )->execute([
            $m['lead_id'], $m['is_outgoing'] ? 1 : 0, $m['author'], $m['mail_account'], $m['mail_owner'],
            ($hasBody || !empty($row['mail_has_body'])) ? 1 : 0, $m['message_id'] !== '' ? $m['message_id'] : null, $m['event_id'],
        ]);
        $result = 'updated';
    }
    if ($hasBody) {
        // The attachments are a callable when the files still have to be fetched: that is
        // deferred until here so a hidden or duplicate message never leaves files behind.
        $before = $pdo->prepare("SELECT `attachments_json` FROM `filed_mail_bodies` WHERE `event_id` = ?");
        $before->execute([$m['event_id']]);
        $previous = json_decode((string)$before->fetchColumn(), true);
        $previous = is_array($previous) ? $previous : [];
        $attachments = $m['attachments'] instanceof \Closure ? ($m['attachments'])($previous) : $m['attachments'];
        $keys = ccrm_mail_attachment_keys($attachments);
        try {
            $pdo->prepare(
                "INSERT INTO `filed_mail_bodies` (`event_id`, `body`, `attachments_json`) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE `body` = VALUES(`body`), `attachments_json` = VALUES(`attachments_json`)"
            )->execute([
                $m['event_id'],
                $m['body'] . (!empty($m['truncated']) ? "\n\n[…]" : ''),
                $attachments ? json_encode($attachments, JSON_UNESCAPED_UNICODE) : null,
            ]);
        } catch (\Throwable $e) {
            // Files nothing points to would never be cleaned up.
            ccrm_mail_attachment_delete(array_diff($keys, ccrm_mail_attachment_keys($previous)));
            throw $e;
        }
        // Files an earlier read kept that this one did not carry over.
        ccrm_mail_attachment_delete(array_diff(ccrm_mail_attachment_keys($previous), $keys));
    }
    return $result;
}

/**
 * One IMAP message of an open folder: look it up, and when it belongs to a customer,
 * read its body and file it. Returns the outcome of ccrm_mail_store_event(), or
 * 'skipped' (no customer, or gone from the server) / 'old' (before the cut-off date).
 */
function ccrm_mail_process_uid(PDO $pdo, $stream, int $uid, array $ctx): string {
    $msgNo = @imap_msgno($stream, $uid);
    if (!$msgNo) return 'skipped';
    $h = @imap_headerinfo($stream, $msgNo);
    if (!$h) return 'skipped';
    $timestamp = !empty($h->udate) ? (int)$h->udate : (isset($h->date) ? (int)strtotime($h->date) : time());
    if (!empty($ctx['cutoff']) && $timestamp < $ctx['cutoff']) return 'old';

    $from = ccrm_mail_addresses_in($h->from ?? []);
    $to = ccrm_mail_addresses_in($h->to ?? []);
    $cc = ccrm_mail_addresses_in($h->cc ?? []);
    $fromAddress = $from[0] ?? '';
    $isOutgoing = (bool)ccrm_mail_is_outgoing($ctx['own'], $fromAddress, $ctx['folder']);
    $leadId = ccrm_mail_match_row(
        $ctx['index'],
        ccrm_mail_counterparties($from, $to, $cc, array_merge($ctx['own'], $ctx['internal']), $isOutgoing)
    );
    if ($leadId === null) return 'skipped';

    $subject = isset($h->subject) ? safe_utf8(imap_utf8($h->subject)) : '(No Subject)';
    $personal = fn($list) => isset($list[0]->personal) ? safe_utf8(imap_utf8($list[0]->personal)) : '';
    $fromName = $personal($h->from ?? []);
    $toName = $personal($h->to ?? []);
    $content = "From: " . $fromName . " <" . $fromAddress . ">\nTo: " . $toName . " <" . ($to[0] ?? '') . ">\nSubject: " . $subject;

    $bodyRaw = '';
    $structure = null;
    try {
        $bodyRaw = fetch_email_body_text($stream, $msgNo);
        $structure = @imap_fetchstructure($stream, $msgNo);
    } catch (\Throwable $e) {
        // A message whose body cannot be read is still worth a timeline entry.
    }
    // Fetched only once the message is known to be filed (see ccrm_mail_store_event).
    $attachments = function (array $previous) use ($stream, $msgNo, $structure) {
        try {
            return ccrm_mail_keep_attachments($stream, $msgNo, $structure, $previous);
        } catch (\Throwable $e) {
            return $previous; // keep what an earlier read stored rather than lose it
        }
    };
    list($body, $truncated) = ccrm_mail_clean_body((string)$bodyRaw);

    return ccrm_mail_store_event($pdo, [
        'lead_id' => $leadId,
        'event_id' => ccrm_mail_event_id($ctx['imap_user'], $ctx['folder'], $uid),
        'timestamp' => date('Y-m-d H:i:s', $timestamp),
        'title' => mb_substr($subject, 0, 255, 'UTF-8'),
        'content' => $content,
        'is_outgoing' => $isOutgoing,
        'author' => ($isOutgoing && !empty($ctx['owner_name'])) ? $ctx['owner_name'] : null,
        'mail_account' => $ctx['label'],
        'mail_owner' => $ctx['owner_email'],
        'message_id' => isset($h->message_id) ? mb_substr(trim($h->message_id), 0, 255, 'UTF-8') : '',
        'body' => $body,
        'attachments' => $attachments,
        'truncated' => $truncated,
    ]);
}

// ── mailboxes and state ───────────────────────────────────────────────────────

/** The decrypted IMAP / SMTP profile of a company mailbox row. */
function ccrm_company_mailbox_settings(array $row): array {
    $decoded = json_decode((string)($row['settings_json'] ?? ''), true);
    return ccrm_decrypt_email_settings(is_array($decoded) ? $decoded : []);
}

/**
 * Everything the job reads: active company mailboxes, then every user mailbox. Each source:
 * key, kind, id, label, settings, owner_email / owner_name (a personal mailbox's user, or a
 * company mailbox's optional owner), cutoff (unix time or null).
 */
function ccrm_mail_filing_sources(PDO $pdo): array {
    $sources = [];
    foreach ($pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `name`")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $owner = null;
        if (!empty($r['owner_user_id'])) {
            $o = $pdo->prepare("SELECT `name`, `email` FROM `users` WHERE `id` = ?");
            $o->execute([$r['owner_user_id']]);
            $owner = $o->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        $sources[] = [
            'key' => 'c:' . $r['id'], 'kind' => 'company', 'id' => $r['id'], 'label' => $r['name'] !== '' ? $r['name'] : $r['address'],
            'address' => strtolower(trim((string)$r['address'])), 'settings' => ccrm_company_mailbox_settings($r),
            // A company mailbox is nobody's personal mail: everyone reads its filed mail from the stored body.
            'owner_email' => null, 'owner_name' => $owner['name'] ?? null,
            'cutoff' => !empty($r['backfill_since']) ? (int)strtotime($r['backfill_since'] . ' 00:00:00') : null,
        ];
    }
    require_once __DIR__ . '/demo_mailbox.php';
    foreach ($pdo->query("SELECT `id`, `name`, `email`, `metadata_json` FROM `users`")->fetchAll(PDO::FETCH_ASSOC) as $u) {
        $meta = !empty($u['metadata_json']) ? json_decode($u['metadata_json'], true) : null;
        $settings = ccrm_decrypt_email_settings(is_array($meta) ? ($meta['emailSettings'] ?? null) : null);
        $hasHost = !empty($settings['imapHost']) || (($settings['provider'] ?? '') === 'exchange' && !empty($settings['exchangeUrl']));
        if (!$settings || !$hasHost || empty($settings['imapUsername'] ?? $settings['username'] ?? '') || ccrm_demo_mailbox_active($pdo, $settings)) {
            continue;
        }
        $sources[] = [
            'key' => 'u:' . $u['id'], 'kind' => 'user', 'id' => $u['id'], 'label' => (string)($settings['imapUsername'] ?? $settings['username'] ?? $u['email']),
            'address' => '', 'settings' => $settings, 'owner_email' => strtolower((string)$u['email']), 'owner_name' => $u['name'], 'cutoff' => null,
        ];
    }
    return $sources;
}

function ccrm_mail_state_load(PDO $pdo, string $key, string $folder): array {
    $s = $pdo->prepare("SELECT * FROM `mail_sync_state` WHERE `mailbox_key` = ? AND `folder` = ?");
    $s->execute([$key, $folder]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: [];
}

function ccrm_mail_state_save(PDO $pdo, string $key, string $folder, array $st): void {
    $pdo->prepare(
        "INSERT INTO `mail_sync_state` (`mailbox_key`, `folder`, `uid_validity`, `last_uid`, `backfill_upper_uid`, `backfill_done`, `filed_count`, `last_run_at`, `last_error`)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE `uid_validity` = VALUES(`uid_validity`), `last_uid` = VALUES(`last_uid`), `backfill_upper_uid` = VALUES(`backfill_upper_uid`),
                                 `backfill_done` = VALUES(`backfill_done`), `filed_count` = VALUES(`filed_count`), `last_run_at` = NOW(), `last_error` = VALUES(`last_error`)"
    )->execute([
        $key, $folder, $st['uid_validity'] ?? null, (int)($st['last_uid'] ?? 0), $st['backfill_upper_uid'] ?? null,
        !empty($st['backfill_done']) ? 1 : 0, (int)($st['filed_count'] ?? 0), $st['last_error'] ?? null,
    ]);
}

/**
 * One folder of one mailbox: new mail first, then a chunk of the backlog. `$budget` is
 * shared with the caller: ['deadline' => float, 'left' => int messages]. Returns counters.
 */
function ccrm_mail_run_folder(PDO $pdo, array $source, string $folder, array $ctxBase, array &$budget): array {
    $counts = ['seen' => 0, 'filed' => 0, 'updated' => 0, 'duplicate' => 0, 'hidden' => 0];
    $settings = $source['settings'];
    $mailbox = get_imap_mailbox_string($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $stream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$stream) {
        $err = imap_last_error() ?: 'could not open the folder';
        @imap_errors();
        throw new \RuntimeException('IMAP "' . $folder . '": ' . $err);
    }
    $ctx = $ctxBase + ['folder' => $folder, 'imap_user' => $imapUser];
    $st = ccrm_mail_state_load($pdo, $source['key'], $folder);
    try {
        $status = @imap_status($stream, $mailbox, SA_UIDVALIDITY | SA_UIDNEXT);
        $validity = $status ? (int)$status->uidvalidity : null;
        $nextUid = $status ? (int)$status->uidnext : 0;

        // First sight of this folder, or the server renumbered it: what is there now is the
        // backlog, and everything that arrives from here on is "new".
        if (!$st || ($validity !== null && isset($st['uid_validity']) && $st['uid_validity'] !== null && (int)$st['uid_validity'] !== $validity)) {
            $st = [
                'uid_validity' => $validity, 'last_uid' => max(0, $nextUid - 1),
                'backfill_upper_uid' => $nextUid, 'backfill_done' => $nextUid <= 1 ? 1 : 0, 'filed_count' => 0,
            ];
        }
        $step = function (int $uid) use ($pdo, $stream, $ctx, &$counts, &$budget, &$st): ?string {
            if ($budget['left'] <= 0 || microtime(true) >= $budget['deadline']) return null;
            $budget['left']--;
            $counts['seen']++;
            $r = ccrm_mail_process_uid($pdo, $stream, $uid, $ctx);
            if (isset($counts[$r])) $counts[$r]++;
            if ($r === 'filed') $st['filed_count'] = (int)($st['filed_count'] ?? 0) + 1;
            return $r;
        };

        // 1. New mail (UIDs above the high-water mark), oldest first so the mark only moves up.
        if ($nextUid - 1 > (int)$st['last_uid']) {
            $overview = @imap_fetch_overview($stream, ((int)$st['last_uid'] + 1) . ':' . ($nextUid - 1), FT_UID);
            $uids = [];
            foreach (is_array($overview) ? $overview : [] as $o) {
                if ((int)$o->uid > (int)$st['last_uid']) $uids[] = (int)$o->uid;
            }
            sort($uids, SORT_NUMERIC);
            foreach ($uids as $uid) {
                if ($step($uid) === null) break;
                $st['last_uid'] = $uid;
            }
            // Everything up to the server's UIDNEXT was looked at when the list was exhausted.
            if (count($uids) === 0 || ($uids && $st['last_uid'] === end($uids))) {
                $st['last_uid'] = max((int)$st['last_uid'], $nextUid - 1);
            }
        }

        // 2. Backlog, newest first, in chunks, back to the cut-off date.
        if (empty($st['backfill_done']) && $budget['left'] > 0 && microtime(true) < $budget['deadline']) {
            $criteria = !empty($ctx['cutoff']) ? 'SINCE "' . date('d-M-Y', (int)$ctx['cutoff']) . '"' : 'ALL';
            $found = @imap_search($stream, $criteria, SE_UID);
            $upper = (int)($st['backfill_upper_uid'] ?? 0);
            $pool = [];
            foreach (is_array($found) ? $found : [] as $uid) {
                if ((int)$uid < $upper) $pool[] = (int)$uid;
            }
            rsort($pool, SORT_NUMERIC);
            $stoppedEarly = false;
            foreach ($pool as $uid) {
                $r = $step($uid);
                if ($r === null) { $stoppedEarly = true; break; }
                $st['backfill_upper_uid'] = $uid;
            }
            if (!$stoppedEarly) {
                $st['backfill_done'] = 1;
            }
        }
        $st['last_error'] = null;
    } catch (\Throwable $e) {
        $st['last_error'] = mb_substr($e->getMessage(), 0, 500, 'UTF-8');
        ccrm_mail_state_save($pdo, $source['key'], $folder, $st);
        @imap_close($stream);
        @imap_errors();
        throw $e;
    }
    ccrm_mail_state_save($pdo, $source['key'], $folder, $st);
    @imap_close($stream);
    @imap_errors();
    return $counts;
}

/** One mailbox: INBOX and Sent. Errors are recorded on the mailbox and rethrown to the caller. */
function ccrm_mail_run_source(PDO $pdo, array $source, array $index, array $internal, array &$budget): array {
    $settings = $source['settings'];
    $own = ccrm_mailbox_addresses($settings);
    if ($source['address'] !== '') $own[] = $source['address'];
    $ctxBase = [
        'index' => $index, 'own' => array_values(array_unique($own)), 'internal' => $internal, 'label' => $source['label'],
        'owner_email' => $source['owner_email'], 'owner_name' => $source['owner_name'], 'cutoff' => $source['cutoff'],
    ];
    $total = ['seen' => 0, 'filed' => 0, 'updated' => 0, 'duplicate' => 0, 'hidden' => 0];
    $errors = [];
    $folders = ['INBOX'];
    try {
        $folders[] = ccrm_resolve_sent_folder($settings);
    } catch (\Throwable $e) {
        $errors[] = $e->getMessage();
    }
    foreach (array_unique($folders) as $folder) {
        try {
            foreach (ccrm_mail_run_folder($pdo, $source, $folder, $ctxBase, $budget) as $k => $v) $total[$k] += $v;
        } catch (\Throwable $e) {
            $errors[] = $e->getMessage();
        }
    }
    if ($source['kind'] === 'company') {
        $pdo->prepare("UPDATE `company_mailboxes` SET `last_run_at` = NOW(), `last_success_at` = IF(?, `last_success_at`, NOW()), `last_error` = ? WHERE `id` = ?")
            ->execute([$errors ? 1 : 0, $errors ? mb_substr(implode(' | ', $errors), 0, 1000, 'UTF-8') : null, $source['id']]);
    }
    $total['errors'] = $errors;
    return $total;
}

/**
 * The job. `$opts`: max_seconds, max_messages, only (a source key such as "c:<id>").
 * Returns a summary with one entry per mailbox; never throws for a broken mailbox.
 */
function ccrm_run_mail_filing(PDO $pdo, array $opts = []): array {
    if (!function_exists('imap_open')) {
        return ['success' => false, 'ran' => false, 'message' => 'PHP IMAP extension is not available.'];
    }
    $lock = (int)$pdo->query("SELECT GET_LOCK('ccrm_mail_filing', 0)")->fetchColumn();
    if ($lock !== 1) {
        return ['success' => true, 'ran' => false, 'message' => 'Another filing run is in progress.'];
    }
    try {
        $deadline = microtime(true) + (int)($opts['max_seconds'] ?? CCRM_MAIL_RUN_MAX_SECONDS);
        $left = (int)($opts['max_messages'] ?? CCRM_MAIL_RUN_MAX_MESSAGES);
        $index = ccrm_mail_address_index($pdo, true);
        $sources = ccrm_mail_filing_sources($pdo);
        if (!empty($opts['only'])) {
            $sources = array_values(array_filter($sources, fn($s) => $s['key'] === $opts['only']));
        }
        // The mailboxes the company itself runs: mail between them is internal, not a customer.
        $internal = array_values(array_filter(array_map(fn($s) => $s['address'], $sources)));

        // Least recently run first, so a long backlog on one mailbox cannot starve the others.
        $lastRun = [];
        foreach ($pdo->query("SELECT `mailbox_key`, MAX(`last_run_at`) AS t FROM `mail_sync_state` GROUP BY `mailbox_key`")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $lastRun[$r['mailbox_key']] = (string)$r['t'];
        }
        usort($sources, fn($a, $b) => strcmp($lastRun[$a['key']] ?? '', $lastRun[$b['key']] ?? ''));

        $summary = ['success' => true, 'ran' => true, 'mailboxes' => [], 'filed' => 0, 'seen' => 0, 'errors' => 0];
        $remaining = count($sources);
        foreach ($sources as $source) {
            if (microtime(true) >= $deadline || $left <= 0) break;
            // an equal share of what is left, so unused budget flows to the next mailbox
            $budget = ['deadline' => $deadline, 'left' => min($left, max(10, (int)ceil($left / max(1, $remaining))))];
            $before = $budget['left'];
            try {
                $r = ccrm_mail_run_source($pdo, $source, $index, $internal, $budget);
            } catch (\Throwable $e) {
                $r = ['seen' => 0, 'filed' => 0, 'errors' => [$e->getMessage()]];
                if ($source['kind'] === 'company') {
                    $pdo->prepare("UPDATE `company_mailboxes` SET `last_run_at` = NOW(), `last_error` = ? WHERE `id` = ?")
                        ->execute([mb_substr($e->getMessage(), 0, 1000, 'UTF-8'), $source['id']]);
                }
            }
            $left -= ($before - $budget['left']);
            $remaining--;
            $summary['mailboxes'][$source['key']] = $r;
            $summary['filed'] += (int)($r['filed'] ?? 0);
            $summary['seen'] += (int)($r['seen'] ?? 0);
            $summary['errors'] += count($r['errors'] ?? []);
        }
        return $summary;
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('ccrm_mail_filing')")->fetchColumn();
    }
}
