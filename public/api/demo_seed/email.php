<?php
/**
 * Demo seed module: email.
 *
 * Fills the demo mailbox (api/demo_mailbox.php) with ~3 weeks of fictive mail for the
 * Lapidea story, in the install language, and points each demo user's mail profile at it.
 * It is one shared team mailbox: three private copies would file every message on a lead
 * timeline three times. Reading the messages then files them on lead timelines and in the
 * RAG cache exactly like an IMAP import, so the AI digests, the assistant and the timelines
 * all have realistic input: mixed urgency, RE: threads, unread mail, attachments.
 *
 * Code only: every string, sender and attachment lives in packs/<lang>/email.php; senders
 * are cast refs (owner, pm, sales, C1, S1 ...) or a key of the pack's `parties`.
 *
 * Idempotent: removes its own messages and their timeline/RAG rows first.
 * A user who already has a real mailbox configured is left alone.
 */
require_once __DIR__ . '/helpers.php';
require_once dirname(__DIR__) . '/mail_broker.php'; // ccrm_mail_event_id(); returns early when included
require_once dirname(__DIR__) . '/demo_mailbox.php';

function demo_seed_email(PDO $pdo): int {
    $pack = demo_pack($pdo, 'email');
    $users = demo_users($pdo);
    ccrm_demo_mailbox_ensure_table($pdo);

    $mailbox = CCRM_DEMO_TEAM_MAILBOX;

    // --- 1. Clean up a previous run --------------------------------------
    $old = $pdo->query("SELECT `mailbox`, `folder`, `uid` FROM `demo_mail_messages` WHERE `id` LIKE 'demo-%'")->fetchAll(PDO::FETCH_ASSOC);
    $delTl = $pdo->prepare("DELETE FROM `timeline_events` WHERE `id` = ?");
    $delRag = $pdo->prepare("DELETE FROM `rag_emails` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
    $delSum = $pdo->prepare("DELETE FROM `email_summaries` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
    foreach ($old as $o) {
        $delTl->execute([ccrm_mail_event_id($o['mailbox'], $o['folder'], $o['uid'])]);
        $delRag->execute([$o['mailbox'], $o['folder'], (string)$o['uid']]);
        $delSum->execute([$o['mailbox'], $o['folder'], (string)$o['uid']]);
    }
    $pdo->exec("DELETE FROM `demo_mail_messages` WHERE `id` LIKE 'demo-%'");

    // --- 2. Point the demo users at the demo mailbox ----------------------
    $getMeta = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `email` = ?");
    $setMeta = $pdo->prepare("UPDATE `users` SET `metadata_json` = ? WHERE `email` = ?");
    foreach ($users as $user) {
        $address = strtolower((string)$user['email']);
        $getMeta->execute([$address]);
        $raw = $getMeta->fetchColumn();
        if ($raw === false) continue; // user not provisioned
        $meta = json_decode((string)$raw, true);
        if (!is_array($meta)) $meta = [];
        $existing = $meta['emailSettings'] ?? null;
        $isReal = is_array($existing)
            && trim((string)($existing['imapHost'] ?? '')) !== ''
            && strcasecmp(trim((string)$existing['imapHost']), CCRM_DEMO_MAIL_HOST) !== 0;
        if ($isReal) continue; // never replace a real configured mailbox
        $meta['emailSettings'] = ccrm_demo_mailbox_settings();
        $setMeta->execute([json_encode($meta, JSON_UNESCAPED_UNICODE), $address]);
    }

    // --- 3. Messages ---------------------------------------------------------
    $messages = $pack['messages'];
    $byN = [];
    foreach ($messages as $m) $byN[$m['n']] = $m;

    $person = static function (string $key) use ($pdo, $users, $pack): array {
        if (isset($users[$key])) {
            return [(string)$users[$key]['name'], (string)$users[$key]['email']];
        }
        if (isset($pack['parties'][$key])) {
            return [(string)$pack['parties'][$key]['name'], (string)$pack['parties'][$key]['email']];
        }
        $rec = demo_ref($pdo, $key);
        return [(string)($rec['contact'] ?? $rec['name']), (string)$rec['email']];
    };
    $fill = static fn(string $s): string => demo_email_fill($pdo, $s);

    $uids = ['INBOX' => 0, 'Sent' => 0];
    $inserted = 0;
    foreach ($messages as $m) {
        $folder = $m['folder'];
        $uid = ++$uids[$folder];
        [$fromName, $fromAddr] = $person($m['from']);
        [$toName, $toAddr] = $person($m['to']);
        $subject = $fill($m['subject']);
        $body = $fill($m['body']);

        // Replies quote the message they answer, like a real mail client.
        $inReplyTo = null;
        $refs = null;
        if (!empty($m['re']) && isset($byN[$m['re']])) {
            $parent = $byN[$m['re']];
            $inReplyTo = demo_email_msgid($parent['n']);
            $chain = [];
            for ($q = $parent; $q; $q = (!empty($q['re']) && isset($byN[$q['re']])) ? $byN[$q['re']] : null) {
                array_unshift($chain, demo_email_msgid($q['n']));
            }
            $refs = implode(' ', $chain);
            [$pName] = $person($parent['from']);
            $quoteHead = sprintf($pack['quoteHead'], demo_date_fmt(demo_d((int)$parent['day']), demo_ctx_current()['lang']), $pName);
            $quoted = implode("\n", array_map(static fn($l) => '> ' . $l, explode("\n", $fill($parent['body']))));
            $body .= "\n\n" . $quoteHead . "\n" . $quoted;
        }

        $attachments = [];
        foreach ($m['att'] ?? [] as $att) {
            $att = demo_text_deep($att);
            if (isset($att['ics'])) {
                $att['ics'] = [demo_dt((int)$att['ics']['day'], $att['ics']['time']), (int)$att['ics']['minutes'], $att['ics']['title'], $att['ics']['location']];
            }
            $att['size'] = ccrm_demo_attachment_size($att);
            $attachments[] = $att;
        }

        ccrm_demo_mailbox_insert($pdo, [
            'id' => demo_id('mail', $m['n']),
            'mailbox' => $mailbox,
            'folder' => $folder,
            'uid' => $uid,
            'message_id' => demo_email_msgid($m['n']),
            'in_reply_to' => $inReplyTo,
            'references' => $refs,
            'from_name' => $fromName,
            'from_address' => $fromAddr,
            'to_name' => $toName,
            'to_address' => $toAddr,
            'subject' => $subject,
            'body_text' => $body,
            'sent_at' => demo_dt((int)$m['day'], $m['time']),
            'seen' => $folder === 'Sent' ? true : $m['seen'],
            'attachments' => $attachments,
        ]);
        $inserted++;
    }
    return $inserted;
}

function demo_email_msgid(int $n): string {
    return '<demo-' . $n . '@mail.demo.invalid>';
}

/**
 * demo_text() plus the two module-local placeholders `[[name:REF]]` / `[[contact:REF]]`,
 * which read a cast record (suppliers included) that demo_text() has no placeholder for.
 */
function demo_email_fill(PDO $pdo, string $s): string {
    $s = preg_replace_callback('/\[\[(name|contact):([A-Z]\d+)\]\]/', static function (array $m) use ($pdo): string {
        $rec = demo_ref($pdo, $m[2]);
        return (string)($m[1] === 'contact' ? ($rec['contact'] ?? $rec['name']) : $rec['name']);
    }, $s);
    return demo_text($s);
}
