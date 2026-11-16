<?php
/**
 * Background mail filing for Microsoft 365 mailboxes: the Graph side of mail_filing.php.
 *
 * mail_filing.php picks the backend per mailbox and keeps everything that decides WHAT is
 * filed and WHERE: the matcher, the store (ccrm_mail_store_event: hidden tombstones, one
 * message in two mailboxes filed once by its Message-ID, stored bodies), the budget and the
 * per-mailbox bookkeeping. This file only reads a mailbox's Inbox and Sent Items through
 * Graph and hands each message over.
 *
 * Incremental, with the same two tracks as the IMAP job, kept in the same `mail_sync_state`
 * row per mailbox and folder ("INBOX", "Sent"):
 *
 *  1. New mail: a delta query (`delta_link`). The first time a folder is seen the query is
 *     opened with "received since now", so it only ever reports what arrives from then on;
 *     `last_uid` holds that start as a unix time. A run that is cut short keeps the link of
 *     the page it stopped on and re-reads that page next time (filing is idempotent).
 *  2. The backlog: an ordinary listing, newest first, of what was received before the start,
 *     back to the mailbox's cut-off date. `backfill_upper_uid` is the unix time of the oldest
 *     message handled so far; `backfill_done` is set when the listing runs out.
 *
 * New mail is always handled before the backlog, so a long catch-up never delays it.
 */

require_once __DIR__ . '/graph_mail.php';
require_once __DIR__ . '/mail_attachments.php';

const CCRM_GRAPH_FILING_SELECT = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isDraft,internetMessageId,hasAttachments';
const CCRM_GRAPH_FILING_PAGE = 50;
/** `mail_sync_state`.`uid_validity` of a row that holds Graph state (an IMAP UIDVALIDITY is never negative). */
const CCRM_GRAPH_STATE_MARK = -1;

/** `mail_sync_state`.`delta_link` on an install whose migration has not run yet (see database-schema-and-sync.md). */
function ccrm_graph_heal_state_table(\PDO $pdo): void {
    static $done = false;
    if ($done) {
        return;
    }
    try {
        if ($pdo->query("SHOW COLUMNS FROM `mail_sync_state` LIKE 'delta_link'")->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `mail_sync_state` ADD COLUMN `delta_link` TEXT NULL COMMENT 'Microsoft Graph delta / next link of the new-mail track'");
        }
        $done = true;
    } catch (\Throwable $e) {
        // The table itself is missing: the caller's first query says so.
    }
}

/**
 * Reads the attachments of one Graph message and keeps what is worth keeping, by the rules of
 * ccrm_mail_keep_attachments(). `$previous` is what an earlier read stored: a file that was
 * kept and is still on disk is reused. Returns [{name, size, part, key?}] in message order;
 * `part` is a short hash of the Graph attachment id.
 */
function ccrm_graph_keep_attachments(CcrmGraphMailbox $mb, string $messageId, array $previous = []): array {
    $reusable = [];
    foreach ($previous as $p) {
        if (is_array($p) && isset($p['part']) && ccrm_mail_attachment_path($p['key'] ?? null) !== null) {
            $reusable[(string)$p['part'] . '|' . (string)($p['name'] ?? '')] = $p;
        }
    }
    $out = [];
    $left = CCRM_MAIL_ATTACHMENTS_MAX_TOTAL;
    foreach (ccrm_graph_attachment_list($mb, $messageId) as $a) {
        $part = substr(sha1((string)$a['part_num']), 0, 16);
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
        if ($safeName !== null && empty($a['inline_image']) && (int)$a['size'] <= CCRM_MAIL_ATTACHMENT_MAX_BYTES * 1.4 && $left > 0) {
            $data = ccrm_graph_attachment_bytes($mb, $messageId, (string)$a['part_num']);
            if ($data !== '' && strlen($data) <= CCRM_MAIL_ATTACHMENT_MAX_BYTES && strlen($data) <= $left) {
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
 * One Graph message of a folder: look it up, and when it belongs to a customer, read its
 * body and file it. Returns what ccrm_mail_process_uid() returns.
 */
function ccrm_graph_process_message(\PDO $pdo, CcrmGraphMailbox $mb, array $m, array $ctx): string {
    if (empty($m['id']) || !empty($m['isDraft'])) {
        return 'skipped';
    }
    $timestamp = ccrm_graph_message_time($m);
    if (!empty($ctx['cutoff']) && $timestamp < $ctx['cutoff']) {
        return 'old';
    }
    $from = ccrm_graph_addresses([$m['from'] ?? null]);
    $to = ccrm_graph_addresses($m['toRecipients'] ?? []);
    $cc = ccrm_graph_addresses($m['ccRecipients'] ?? []);
    $fromAddress = $from[0] ?? '';
    $isOutgoing = ccrm_graph_is_outgoing($ctx['own'], $fromAddress, $ctx['folder']);
    $leadId = ccrm_mail_match_row(
        $ctx['index'],
        ccrm_mail_counterparties($from, $to, $cc, array_merge($ctx['own'], $ctx['internal']), $isOutgoing)
    );
    if ($leadId === null) {
        return 'skipped';
    }

    $subject = trim((string)($m['subject'] ?? ''));
    $subject = $subject !== '' ? safe_utf8($subject) : '(No Subject)';
    $fromName = ccrm_graph_person($m['from'] ?? null)[0];
    $toList = is_array($m['toRecipients'] ?? null) ? $m['toRecipients'] : [];
    $toName = ccrm_graph_person($toList[0] ?? null)[0];
    $content = "From: " . $fromName . " <" . $fromAddress . ">\nTo: " . $toName . " <" . ($to[0] ?? '') . ">\nSubject: " . $subject;

    $id = (string)$m['id'];
    $bodyRaw = '';
    try {
        $bodyRaw = ccrm_graph_body_text($mb, $id);
    } catch (CcrmGraphReconnectException $e) {
        throw $e;
    } catch (\Throwable $e) {
        // A message whose body cannot be read is still worth a timeline entry.
    }
    // Fetched only once the message is known to be filed (see ccrm_mail_store_event).
    $attachments = empty($m['hasAttachments']) ? [] : function (array $previous) use ($mb, $id) {
        try {
            return ccrm_graph_keep_attachments($mb, $id, $previous);
        } catch (\Throwable $e) {
            return $previous; // keep what an earlier read stored rather than lose it
        }
    };
    list($body, $truncated) = ccrm_mail_clean_body($bodyRaw);

    return ccrm_mail_store_event($pdo, [
        'lead_id' => $leadId,
        'event_id' => ccrm_graph_event_id($mb->address, $id),
        'timestamp' => date('Y-m-d H:i:s', $timestamp),
        'title' => mb_substr($subject, 0, 255, 'UTF-8'),
        'content' => $content,
        'is_outgoing' => $isOutgoing,
        'author' => ($isOutgoing && !empty($ctx['owner_name'])) ? $ctx['owner_name'] : null,
        'mail_account' => $ctx['label'],
        'mail_owner' => $ctx['owner_email'],
        'message_id' => mb_substr(trim((string)($m['internetMessageId'] ?? '')), 0, 255, 'UTF-8'),
        'body' => $body,
        'attachments' => $attachments,
        'truncated' => $truncated,
    ]);
}

/**
 * One folder of one mailbox: new mail first, then a chunk of the backlog. `$label` is "INBOX"
 * or "Sent". `$budget` is shared with the caller, as in ccrm_mail_run_folder(). Returns counters.
 */
function ccrm_graph_run_folder(\PDO $pdo, CcrmGraphMailbox $mb, array $source, string $label, array $ctxBase, array &$budget): array {
    $counts = ['seen' => 0, 'filed' => 0, 'updated' => 0, 'duplicate' => 0, 'hidden' => 0];
    $ctx = $ctxBase + ['folder' => $label];
    $folder = ccrm_graph_folder($label);
    $st = ccrm_mail_state_load($pdo, $source['key'], $label);
    $now = time();
    // First sight of this folder: what is there now is the backlog, what arrives from here on is "new".
    // `uid_validity` = -1 marks the row as Graph state. A row left by IMAP (the mailbox was
    // switched to Microsoft 365) holds UIDs, not times, and is started over; the other way
    // round the IMAP job sees a UIDVALIDITY it does not know and starts over too.
    if (!$st || (int)($st['uid_validity'] ?? 0) !== CCRM_GRAPH_STATE_MARK) {
        $st = ['uid_validity' => CCRM_GRAPH_STATE_MARK, 'last_uid' => $now, 'backfill_upper_uid' => $now, 'backfill_done' => 0, 'filed_count' => (int)($st['filed_count'] ?? 0), 'delta_link' => null];
    }
    // Not an arrow function: that would copy the budget as it is now and never see it shrink.
    $outOfBudget = function () use (&$budget): bool {
        return $budget['left'] <= 0 || microtime(true) >= $budget['deadline'];
    };
    $step = function (array $m) use ($pdo, $mb, $ctx, &$counts, &$budget, &$st, $outOfBudget): ?string {
        if ($outOfBudget()) {
            return null;
        }
        $budget['left']--;
        $counts['seen']++;
        $r = ccrm_graph_process_message($pdo, $mb, $m, $ctx);
        if (isset($counts[$r])) {
            $counts[$r]++;
        }
        if ($r === 'filed') {
            $st['filed_count'] = (int)($st['filed_count'] ?? 0) + 1;
        }
        return $r;
    };
    $save = function () use ($pdo, $source, $label, &$st) {
        ccrm_mail_state_save($pdo, $source['key'], $label, $st);
        $pdo->prepare("UPDATE `mail_sync_state` SET `delta_link` = ? WHERE `mailbox_key` = ? AND `folder` = ?")
            ->execute([($st['delta_link'] ?? '') !== '' ? $st['delta_link'] : null, $source['key'], $label]);
    };
    $pageOpts = ['prefer' => ['odata.maxpagesize=' . CCRM_GRAPH_FILING_PAGE]];

    try {
        // 1. New mail: follow the delta query from where the last run left it.
        $url = (string)($st['delta_link'] ?? '');
        $query = [];
        if ($url === '') {
            $url = '/mailFolders/' . $folder . '/messages/delta';
            $query = ['$select' => CCRM_GRAPH_FILING_SELECT, '$filter' => 'receivedDateTime ge ' . ccrm_graph_iso((int)$st['last_uid'])];
        }
        while ($url !== '' && !$outOfBudget()) {
            try {
                $page = ccrm_graph_request($mb, 'GET', $url, $query, null, $pageOpts);
            } catch (CcrmGraphException $e) {
                // Graph forgot this sync state (it does after long silence): start a new one that
                // looks back a week. What was already filed is recognised by its id.
                if ($e->status === 410 || in_array($e->graphCode, ['SyncStateNotFound', 'syncStateNotFound', 'resyncRequired', 'SyncStateInvalid'], true)) {
                    $st['delta_link'] = null;
                    $st['last_uid'] = $now - 7 * 86400;
                    break;
                }
                throw $e;
            }
            $query = [];
            $complete = true;
            foreach (is_array($page['value'] ?? null) ? $page['value'] : [] as $m) {
                if (!is_array($m) || isset($m['@removed'])) {
                    continue;
                }
                if ($step($m) === null) {
                    $complete = false;
                    break;
                }
            }
            if (!$complete) {
                break; // the link of this page is kept: it is read again by the next run
            }
            if (!empty($page['@odata.nextLink'])) {
                $st['delta_link'] = (string)$page['@odata.nextLink'];
                $url = $st['delta_link'];
            } else {
                if (!empty($page['@odata.deltaLink'])) {
                    $st['delta_link'] = (string)$page['@odata.deltaLink'];
                }
                $url = '';
            }
        }

        // 2. Backlog, newest first, in chunks, back to the cut-off date.
        if (empty($st['backfill_done']) && !$outOfBudget()) {
            $filter = 'receivedDateTime le ' . ccrm_graph_iso((int)$st['backfill_upper_uid']);
            if (!empty($ctx['cutoff'])) {
                $filter .= ' and receivedDateTime ge ' . ccrm_graph_iso((int)$ctx['cutoff']);
            }
            $url = '/mailFolders/' . $folder . '/messages';
            $query = ['$select' => CCRM_GRAPH_FILING_SELECT, '$filter' => $filter, '$orderby' => 'receivedDateTime desc', '$top' => CCRM_GRAPH_FILING_PAGE];
            $stoppedEarly = false;
            while ($url !== '') {
                if ($outOfBudget()) {
                    $stoppedEarly = true;
                    break;
                }
                $page = ccrm_graph_request($mb, 'GET', $url, $query);
                $query = [];
                foreach (is_array($page['value'] ?? null) ? $page['value'] : [] as $m) {
                    if (!is_array($m)) {
                        continue;
                    }
                    if ($step($m) === null) {
                        $stoppedEarly = true;
                        break 2;
                    }
                    $st['backfill_upper_uid'] = ccrm_graph_message_time($m);
                }
                $url = (string)($page['@odata.nextLink'] ?? '');
            }
            if (!$stoppedEarly) {
                $st['backfill_done'] = 1;
            }
        }
        $st['last_error'] = null;
    } catch (\Throwable $e) {
        $st['last_error'] = mb_substr($e->getMessage(), 0, 500, 'UTF-8');
        $save();
        throw $e;
    }
    $save();
    return $counts;
}

/**
 * One Microsoft 365 mailbox: Inbox and Sent Items. Returns [counters, error messages], which
 * ccrm_mail_run_source() records exactly as it does for an IMAP mailbox.
 */
function ccrm_graph_run_source(\PDO $pdo, array $source, array $index, array $internal, array &$budget): array {
    ccrm_graph_heal_state_table($pdo);
    $mb = ccrm_graph_mailbox($pdo, $source['kind'], (string)$source['id'], $source['settings'], (string)$source['address']);
    $ctxBase = [
        'index' => $index, 'own' => ccrm_graph_own_addresses($mb), 'internal' => $internal, 'label' => $source['label'],
        'owner_email' => $source['owner_email'], 'owner_name' => $source['owner_name'], 'cutoff' => $source['cutoff'],
    ];
    $total = ['seen' => 0, 'filed' => 0, 'updated' => 0, 'duplicate' => 0, 'hidden' => 0];
    $errors = [];
    foreach (['INBOX', 'Sent'] as $label) {
        try {
            foreach (ccrm_graph_run_folder($pdo, $mb, $source, $label, $ctxBase, $budget) as $k => $v) {
                $total[$k] += $v;
            }
        } catch (\Throwable $e) {
            $errors[] = $e->getMessage();
            // A sign-in that has to be renewed fails the second folder the same way: say it once.
            if ($e instanceof CcrmGraphReconnectException) {
                break;
            }
        }
    }
    return [$total, $errors];
}
