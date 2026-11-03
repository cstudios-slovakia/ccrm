<?php
/**
 * Assertions for the `email` demo module (phase 4D). Format: scripts/demo-assert/company.php.
 */
return [
    'minRows' => [
        'demo_mail_messages' => 24,
    ],
    // insert() files a message on the lead timeline under ccrm_mail_event_id() ids, as an IMAP import does.
    'idAllow' => [
        'timeline_events' => '/^(demo-|email-)/',
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $rows = $db->rows('demo_mail_messages');
        $pack = demo_pack_for($ctx['lang'], 'email');
        $users = demo_company_pack($ctx['lang'])['users'];
        $own = array_map(static fn($u) => strtolower($u['email']), $users);

        $check('one demo message per pack message', count($rows) === count($pack['messages']), count($rows) . ' vs ' . count($pack['messages']));

        // Every message is between two real addresses, one side being a demo login or a cast record.
        $bad = [];
        foreach ($rows as $r) {
            foreach (['from_address', 'to_address'] as $col) {
                if (!preg_match('/^[^@\s]+@[^@\s]+\.example$/', (string)$r[$col])) $bad[] = $r['id'] . ' ' . $col . '=' . $r[$col];
            }
            if (!in_array(strtolower($r['from_address']), $own, true) && !in_array(strtolower($r['to_address']), $own, true)) $bad[] = $r['id'] . ' has no demo login on either side';
        }
        $check('every message has fictional .example addresses and a demo login on one side', !$bad, implode("\n", array_slice($bad, 0, 5)));

        // The legacy sender names/addresses must be gone.
        $legacy = [];
        foreach ($rows as $r) {
            $hay = $r['from_address'] . ' ' . $r['to_address'] . ' ' . $r['from_name'] . ' ' . $r['body_text'];
            if (preg_match('/crm\.com|example\.sk|example\.hu|Fiorano Stone|Akemi|Horák|Ján Novák/u', $hay)) $legacy[] = $r['id'];
        }
        $check('nothing of the pre-pack mailbox story is left', !$legacy, implode(', ', $legacy));

        // Replies point at an earlier message of the same thread.
        $ids = [];
        foreach ($rows as $r) $ids[$r['message_id']] = strtotime($r['sent_at']);
        $badRe = [];
        foreach ($rows as $r) {
            if ($r['in_reply_to'] === null || $r['in_reply_to'] === '') continue;
            if (!isset($ids[$r['in_reply_to']]) || $ids[$r['in_reply_to']] > strtotime($r['sent_at'])) $badRe[] = $r['id'];
        }
        $check('every reply answers an earlier message', !$badRe, implode(', ', $badRe));

        $unread = array_filter($rows, static fn($r) => $r['folder'] === 'INBOX' && !$r['seen']);
        $check('exactly two unread mails, both in the inbox', count($unread) === 2, (string)count($unread));
        $check('Sent messages are marked read', !array_filter($rows, static fn($r) => $r['folder'] === 'Sent' && !$r['seen']));

        $days = array_map(static fn($r) => (int)floor((strtotime(substr($r['sent_at'], 0, 10)) - strtotime(date('Y-m-d'))) / 86400), $rows);
        $check('mails span about three weeks, none in the future', min($days) <= -18 && min($days) >= -25 && max($days) <= 0, min($days) . '..' . max($days));

        $withAtt = array_filter($rows, static fn($r) => !empty($r['attachments_json']));
        $check('attachments are present (csv, pdf, png, ics)', count($withAtt) >= 8);
        $names = [];
        foreach ($withAtt as $r) foreach (json_decode((string)$r['attachments_json'], true) ?: [] as $a) $names[] = strtolower(pathinfo((string)$a['name'], PATHINFO_EXTENSION));
        $check('all four attachment kinds occur', count(array_intersect(['csv', 'pdf', 'png', 'ics'], $names)) === 4, implode(',', array_unique($names)));

        // The shared mailbox is attached to the three demo users.
        $attached = 0;
        foreach ($db->rows('users') as $u) {
            if (in_array(strtolower($u['email']), $own, true) && strpos((string)$u['metadata_json'], 'emailSettings') !== false) $attached++;
        }
        $check('the demo mailbox is attached to all three demo users', $attached === 3, (string)$attached);
    },
];
