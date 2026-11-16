<?php
/**
 * The interactive mailbox of a Microsoft 365 profile: what mail_broker.php does over IMAP and
 * SMTP, done through Microsoft Graph, answering in exactly the same shapes so the mail screen
 * does not know the difference.
 *
 * What differs from IMAP, and how it is hidden:
 *  - A message's `uid` is its Graph id (a long opaque string, immutable across folder moves),
 *    and an attachment's `part_num` is its Graph attachment id.
 *  - The timeline id of a message is `email-g-<30 hex>` (ccrm_graph_event_id). Screens that
 *    open a timeline entry cut the last part off the id and ask for it as a uid; that hash is
 *    resolved back to the message through its stored Message-ID (ccrm_graph_resolve_id).
 *  - Folders are asked for by the names the client already uses ("INBOX", "Sent").
 */

require_once __DIR__ . '/graph_client.php';

const CCRM_GRAPH_LIST_SELECT = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,isDraft,internetMessageId,bodyPreview,hasAttachments';
/** In-Reply-To, References and the message size are not first-class Graph fields; these MAPI properties carry them. */
const CCRM_GRAPH_PROP_IN_REPLY_TO = 'String 0x1042';
const CCRM_GRAPH_PROP_REFERENCES = 'String 0x1039';
const CCRM_GRAPH_PROP_SIZE = 'Integer 0x0E08';

// ── names and ids ─────────────────────────────────────────────────────────────

/** The Graph folder for a name the client uses; anything else is taken as a folder id. */
function ccrm_graph_folder(string $folder): string {
    switch (strtolower(trim($folder))) {
        case '':
        case 'inbox':
            return 'inbox';
        case 'sent':
        case 'sent items':
        case 'sentitems':
            return 'sentitems';
        case 'drafts':
            return 'drafts';
        case 'trash':
        case 'deleted items':
        case 'deleteditems':
            return 'deleteditems';
    }
    return rawurlencode($folder);
}

/** The folder name as the rest of the app knows it: "INBOX", "Sent", or the name given. */
function ccrm_graph_folder_label(string $folder): string {
    $graph = ccrm_graph_folder($folder);
    return $graph === 'inbox' ? 'INBOX' : ($graph === 'sentitems' ? 'Sent' : $folder);
}

/**
 * The timeline id of a Graph message. It has to fit `timeline_events`.`id` VARCHAR(50), start
 * with "email-" (sync.php recognises importer-owned rows by it), and be the same for the live
 * read and the background job, so neither files a message the other already has.
 */
function ccrm_graph_event_id(string $mailboxAddress, string $messageId): string {
    return 'email-g-' . substr(sha1(strtolower(trim($mailboxAddress)) . '|' . $messageId), 0, 30);
}

/** Is this "uid" the tail of a Graph timeline id rather than a Graph message id? */
function ccrm_graph_is_event_hash($uid): bool {
    return is_string($uid) && preg_match('/^[a-f0-9]{30}$/', $uid) === 1;
}

/**
 * The key a message is stored under in `email_summaries` / `rag_emails` (`email_uid` VARCHAR(150)).
 * An IMAP uid is used as it is; a Graph id can be longer than the column, so it is hashed.
 */
function ccrm_mail_uid_key($uid): string {
    $uid = (string)$uid;
    return strlen($uid) <= 100 ? $uid : 'g' . sha1($uid);
}

/** [name, address] of a Graph recipient ({emailAddress: {name, address}}). */
function ccrm_graph_person($recipient): array {
    $e = (is_array($recipient) && isset($recipient['emailAddress']) && is_array($recipient['emailAddress'])) ? $recipient['emailAddress'] : [];
    return [trim((string)($e['name'] ?? '')), strtolower(trim((string)($e['address'] ?? '')))];
}

/** The lower-case addresses of a Graph recipient list. */
function ccrm_graph_addresses($list): array {
    $out = [];
    foreach (is_array($list) ? $list : [] as $r) {
        $address = ccrm_graph_person($r)[1];
        if ($address !== '' && strpos($address, '@') !== false) {
            $out[] = $address;
        }
    }
    return array_values(array_unique($out));
}

/** Unix time of a message: when it arrived, or when it was sent. */
function ccrm_graph_message_time(array $m): int {
    $iso = (string)($m['receivedDateTime'] ?? ($m['sentDateTime'] ?? ''));
    $t = $iso !== '' ? strtotime($iso) : false;
    return $t === false ? time() : (int)$t;
}

/** A unix time as Graph wants it in a $filter. */
function ccrm_graph_iso(int $time): string {
    return gmdate('Y-m-d\TH:i:s\Z', $time);
}

function ccrm_graph_extended_property(array $m, string $id): string {
    foreach (is_array($m['singleValueExtendedProperties'] ?? null) ? $m['singleValueExtendedProperties'] : [] as $p) {
        if (is_array($p) && strcasecmp((string)($p['id'] ?? ''), $id) === 0) {
            return trim((string)($p['value'] ?? ''));
        }
    }
    return '';
}

/** The addresses this mailbox sends as: its own address and the account that signed in. */
function ccrm_graph_own_addresses(CcrmGraphMailbox $mb): array {
    $own = [];
    foreach ([$mb->address, strtolower(trim((string)($mb->settings['graphAccount'] ?? '')))] as $a) {
        if ($a !== '' && strpos($a, '@') !== false) {
            $own[$a] = true;
        }
    }
    return array_keys($own);
}

/**
 * Whether the mailbox sent a message. Its own address as the sender says so, and so does
 * Sent Items: Exchange files only sent mail there, and the mailbox's aliases (which Graph
 * does not list here) would otherwise read as somebody else's address.
 */
function ccrm_graph_is_outgoing(array $ownAddresses, string $fromAddress, string $folderLabel): bool {
    return $folderLabel === 'Sent' || in_array(strtolower(trim($fromAddress)), $ownAddresses, true);
}

/** Plain text of a mail body Graph returned as HTML. */
function ccrm_graph_html_to_text(string $html): string {
    $html = preg_replace('#<(style|script|head)\b[^>]*>.*?</\1>#is', ' ', $html);
    $html = preg_replace('#<(br|/p|/div|/tr|/li|/h[1-6])\b[^>]*>#i', "\n", (string)$html);
    return trim(html_entity_decode(strip_tags((string)$html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

// ── reading ───────────────────────────────────────────────────────────────────

/** Same shape as fetch_imap_folders(). */
function ccrm_graph_folders(CcrmGraphMailbox $mb): array {
    $res = ccrm_graph_request($mb, 'GET', '/mailFolders', ['$select' => 'id,displayName', '$top' => 100]);
    $folders = [];
    foreach (is_array($res['value'] ?? null) ? $res['value'] : [] as $f) {
        $folders[] = ['path' => (string)($f['id'] ?? ''), 'name' => (string)($f['displayName'] ?? ''), 'delimiter' => '/'];
    }
    return $folders;
}

/** One list row in the shape of fetch_imap_emails(), without the summary. */
function ccrm_graph_list_entry(CcrmGraphMailbox $mb, array $m, string $folderLabel): array {
    list($fromName, $fromAddress) = ccrm_graph_person($m['from'] ?? null);
    $to = is_array($m['toRecipients'] ?? null) ? $m['toRecipients'] : [];
    list($toName, $toAddress) = ccrm_graph_person($to[0] ?? null);
    $subject = trim((string)($m['subject'] ?? ''));
    $preview = trim((string)preg_replace('/\s+/u', ' ', (string)($m['bodyPreview'] ?? '')));
    return [
        'uid' => (string)$m['id'],
        'event_id' => ccrm_graph_event_id($mb->address, (string)$m['id']),
        'subject' => $subject !== '' ? $subject : '(No Subject)',
        'from' => ['name' => $fromName !== '' ? $fromName : $fromAddress, 'address' => $fromAddress],
        'to' => ['name' => $toName !== '' ? $toName : $toAddress, 'address' => $toAddress],
        'date' => date('Y-m-d H:i:s', ccrm_graph_message_time($m)),
        'is_outgoing' => ccrm_graph_is_outgoing(ccrm_graph_own_addresses($mb), $fromAddress, $folderLabel),
        'seen' => !empty($m['isRead']),
        'size' => (int)ccrm_graph_extended_property($m, CCRM_GRAPH_PROP_SIZE),
        'message_id' => trim((string)($m['internetMessageId'] ?? '')),
        'in_reply_to' => ccrm_graph_extended_property($m, CCRM_GRAPH_PROP_IN_REPLY_TO),
        'references' => ccrm_graph_extended_property($m, CCRM_GRAPH_PROP_REFERENCES),
        'summary' => '',
        'preview' => mb_substr($preview, 0, 240, 'UTF-8'),
        // Graph only says whether there are any; the detail view lists them.
        'attachment_count' => !empty($m['hasAttachments']) ? 1 : 0,
    ];
}

/**
 * Same shape and side effects as fetch_imap_emails(): the page of messages, and for each one
 * that belongs to a customer the timeline entry, plus the copy the AI assistant searches.
 * `$sessionEmail` is the signed-in user's login (the key of summaries and of the assistant's copy).
 */
function ccrm_graph_emails(CcrmGraphMailbox $mb, string $folder, int $page, int $limit, string $filter, $searchEmail, string $sessionEmail): array {
    $pdo = $mb->pdo;
    $graphFolder = ccrm_graph_folder($folder);
    $label = ccrm_graph_folder_label($folder);
    $page = max(1, $page);
    $searchEmail = is_string($searchEmail) ? strtolower(trim($searchEmail)) : '';
    if ($searchEmail !== '' && !filter_var($searchEmail, FILTER_VALIDATE_EMAIL)) {
        $searchEmail = '';
    }

    $query = ['$select' => CCRM_GRAPH_LIST_SELECT . ',body', '$top' => $limit];
    if ($searchEmail !== '') {
        // A search is ordered newest first by Graph itself and takes neither $orderby nor $skip.
        $query['$search'] = '"participants:' . $searchEmail . '"';
        $query['$top'] = max($limit, 50);
    } else {
        $query['$orderby'] = 'receivedDateTime desc';
        $query['$skip'] = ($page - 1) * $limit;
        $query['$count'] = 'true';
        if ($filter === 'unread') {
            // A filter has to name the sort field first, or Graph refuses it as inefficient.
            $query['$filter'] = 'receivedDateTime ge 1970-01-01T00:00:00Z and isRead eq false';
        }
    }
    $expand = "singleValueExtendedProperties(\$filter=id eq '" . CCRM_GRAPH_PROP_IN_REPLY_TO . "' or id eq '" . CCRM_GRAPH_PROP_REFERENCES . "' or id eq '" . CCRM_GRAPH_PROP_SIZE . "')";
    $opts = ['prefer' => ['outlook.body-content-type="text"']];
    try {
        $res = ccrm_graph_request($mb, 'GET', '/mailFolders/' . $graphFolder . '/messages', $query + ['$expand' => $expand], null, $opts);
    } catch (CcrmGraphException $e) {
        if ($e->status !== 400) {
            throw $e;
        }
        // The thread headers are a nicety: without them the list still works.
        $res = ccrm_graph_request($mb, 'GET', '/mailFolders/' . $graphFolder . '/messages', $query, null, $opts);
    }
    $messages = is_array($res['value'] ?? null) ? $res['value'] : [];

    $unseen = 0;
    $total = isset($res['@odata.count']) ? (int)$res['@odata.count'] : count($messages);
    try {
        $info = ccrm_graph_request($mb, 'GET', '/mailFolders/' . $graphFolder, ['$select' => 'unreadItemCount,totalItemCount']);
        $unseen = (int)($info['unreadItemCount'] ?? 0);
    } catch (CcrmGraphException $e) {
        // the count is decoration
    }

    require_once __DIR__ . '/mail_filing.php';
    $own = ccrm_graph_own_addresses($mb);
    $accountEmail = strtolower(trim($sessionEmail));
    $author = null;
    $emails = [];
    foreach ($messages as $m) {
        if (!is_array($m) || empty($m['id']) || !empty($m['isDraft'])) {
            continue;
        }
        $entry = ccrm_graph_list_entry($mb, $m, $label);
        $key = ccrm_mail_uid_key($entry['uid']);
        try {
            $s = $pdo->prepare("SELECT `summary` FROM `email_summaries` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
            $s->execute([$sessionEmail, $label, $key]);
            $entry['summary'] = $s->fetchColumn() ?: '';
        } catch (\Throwable $e) {
            $entry['summary'] = '';
        }

        // The timeline entry, by the same matcher and the same store as the background job.
        $from = ccrm_graph_addresses([$m['from'] ?? null]);
        $to = ccrm_graph_addresses($m['toRecipients'] ?? []);
        $cc = ccrm_graph_addresses($m['ccRecipients'] ?? []);
        $match = ccrm_mail_counterparties($from, $to, $cc, $own, $entry['is_outgoing']);
        if ($searchEmail !== '') {
            $match[] = $searchEmail;
        }
        $leadId = ccrm_mail_match_row(ccrm_mail_address_index($pdo), $match);
        if ($leadId) {
            if ($entry['is_outgoing'] && $author === null && $accountEmail !== '') {
                $a = $pdo->prepare("SELECT `name` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1");
                $a->execute([$accountEmail]);
                $author = trim((string)$a->fetchColumn());
            }
            $stored = ccrm_mail_store_event($pdo, [
                'lead_id' => $leadId,
                'event_id' => $entry['event_id'],
                'timestamp' => $entry['date'],
                'title' => mb_substr($entry['subject'], 0, 255, 'UTF-8'),
                'content' => "From: " . $entry['from']['name'] . " <" . $entry['from']['address'] . ">\nTo: " . $entry['to']['name'] . " <" . $entry['to']['address'] . ">\nSubject: " . $entry['subject'],
                'is_outgoing' => $entry['is_outgoing'],
                'author' => ($entry['is_outgoing'] && $author) ? $author : null,
                'mail_account' => $mb->address,
                'mail_owner' => $accountEmail !== '' ? $accountEmail : null,
                'message_id' => mb_substr($entry['message_id'], 0, 255, 'UTF-8'),
                // The body and the files are stored by the background job; a live read never replaces them.
                'body' => null,
                'attachments' => [],
            ]);
            if ($stored === 'hidden' || $stored === 'duplicate') {
                $entry['timeline_hidden'] = true;
            }
        }

        $body = is_array($m['body'] ?? null) ? (string)($m['body']['content'] ?? '') : '';
        if (strcasecmp((string)($m['body']['contentType'] ?? 'text'), 'html') === 0) {
            $body = ccrm_graph_html_to_text($body);
        }
        ccrm_graph_rag_cache($pdo, $sessionEmail, $label, $key, $entry, safe_utf8($body));
        $emails[] = $entry;
    }

    return [
        'emails' => $emails,
        'pagination' => ['total' => $total, 'unseen' => $unseen, 'page' => $page, 'limit' => $limit, 'pages' => (int)ceil($total / max(1, $limit))],
    ];
}

/** Keeps a copy of a listed message for the AI assistant, once, as the IMAP read does. */
function ccrm_graph_rag_cache(\PDO $pdo, string $userEmail, string $folder, string $key, array $entry, string $body): void {
    if ($userEmail === '') {
        return;
    }
    try {
        $check = $pdo->prepare("SELECT 1 FROM `rag_emails` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
        $check->execute([$userEmail, $folder, $key]);
        if ($check->fetchColumn()) {
            return;
        }
        $row = [
            $userEmail, $folder, $key, mb_substr($entry['subject'], 0, 255, 'UTF-8'),
            mb_substr($entry['from']['name'] . ' <' . $entry['from']['address'] . '>', 0, 255, 'UTF-8'),
            mb_substr($entry['to']['name'] . ' <' . $entry['to']['address'] . '>', 0, 255, 'UTF-8'),
            $body, $entry['date'],
        ];
        $pdo->prepare("INSERT INTO `rag_emails` (`user_email`, `folder`, `email_uid`, `subject`, `sender`, `recipient`, `body`, `received_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute($row);
        require_once __DIR__ . '/agent_utils.php';
        $rag = get_rag_db_connection(ccrm_load_integrations_config($pdo));
        if ($rag) {
            init_rag_db_schemas($rag);
            $rag->prepare("INSERT INTO `rag_emails` (`user_email`, `folder`, `email_uid`, `subject`, `sender`, `recipient`, `body`, `received_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `subject` = VALUES(`subject`), `body` = VALUES(`body`)")
                ->execute($row);
        }
    } catch (\Throwable $e) {
        // The assistant's copy is a cache; the list must not fail over it.
    }
}

/**
 * The Graph id behind a uid the client sent. A Graph id is passed through; the tail of a
 * timeline id is looked up by the Message-ID stored with that timeline entry.
 */
function ccrm_graph_resolve_id(CcrmGraphMailbox $mb, $uid): string {
    $uid = trim((string)$uid);
    if ($uid === '') {
        throw new CcrmGraphException('Missing email UID.');
    }
    if (!ccrm_graph_is_event_hash($uid)) {
        return $uid;
    }
    $stmt = $mb->pdo->prepare("SELECT `mail_message_id` FROM `timeline_events` WHERE `id` = ? AND `type` = 'email'");
    $stmt->execute(['email-g-' . $uid]);
    $messageId = trim((string)$stmt->fetchColumn());
    if ($messageId !== '') {
        $res = ccrm_graph_request($mb, 'GET', '/messages', [
            '$filter' => "internetMessageId eq '" . str_replace("'", "''", $messageId) . "'",
            '$select' => 'id',
            '$top' => 1,
        ]);
        if (!empty($res['value'][0]['id'])) {
            return (string)$res['value'][0]['id'];
        }
    }
    throw new CcrmGraphException('This message is no longer in the mailbox (it may have been moved or deleted).', 404);
}

/** The downloadable attachments of a message: [{part_num, name, size, type}], `part_num` being the Graph attachment id. */
function ccrm_graph_attachment_list(CcrmGraphMailbox $mb, string $messageId): array {
    $res = ccrm_graph_request($mb, 'GET', '/messages/' . rawurlencode($messageId) . '/attachments', ['$select' => 'id,name,size,contentType,isInline']);
    $out = [];
    foreach (is_array($res['value'] ?? null) ? $res['value'] : [] as $a) {
        // Only real files: not a picture inside the body, not an attached message or a cloud link.
        if (!is_array($a) || empty($a['id']) || trim((string)($a['name'] ?? '')) === ''
            || stripos((string)($a['@odata.type'] ?? '#microsoft.graph.fileAttachment'), 'fileAttachment') === false) {
            continue;
        }
        $isImage = stripos((string)($a['contentType'] ?? ''), 'image/') === 0;
        $out[] = [
            'part_num' => (string)$a['id'],
            'name' => (string)$a['name'],
            'size' => (int)($a['size'] ?? 0),
            'type' => strtolower(pathinfo((string)$a['name'], PATHINFO_EXTENSION)),
            'inline_image' => !empty($a['isInline']) && $isImage,
        ];
    }
    return $out;
}

/** Same shape as fetch_imap_email_detail(). Reading never changes the read flag. */
function ccrm_graph_email_detail(CcrmGraphMailbox $mb, $uid): array {
    $id = ccrm_graph_resolve_id($mb, $uid);
    $m = ccrm_graph_request($mb, 'GET', '/messages/' . rawurlencode($id), ['$select' => 'id,isRead,body,hasAttachments']);
    $content = is_array($m['body'] ?? null) ? (string)($m['body']['content'] ?? '') : '';
    $isHtml = strcasecmp((string)($m['body']['contentType'] ?? 'text'), 'html') === 0;
    $attachments = [];
    if (!empty($m['hasAttachments'])) {
        foreach (ccrm_graph_attachment_list($mb, $id) as $a) {
            if (empty($a['inline_image'])) {
                unset($a['inline_image']);
                $attachments[] = $a;
            }
        }
    }
    return [
        'uid' => (string)$uid,
        'html' => $isHtml ? safe_utf8($content) : '',
        'text' => safe_utf8($isHtml ? ccrm_graph_html_to_text($content) : $content),
        'attachments' => $attachments,
        'seen' => !empty($m['isRead']),
    ];
}

/** The plain text of a message, for the summary and for the stored timeline body. */
function ccrm_graph_body_text(CcrmGraphMailbox $mb, string $messageId): string {
    $m = ccrm_graph_request($mb, 'GET', '/messages/' . rawurlencode($messageId), ['$select' => 'body'], null, ['prefer' => ['outlook.body-content-type="text"']]);
    $content = is_array($m['body'] ?? null) ? (string)($m['body']['content'] ?? '') : '';
    return strcasecmp((string)($m['body']['contentType'] ?? 'text'), 'html') === 0 ? ccrm_graph_html_to_text($content) : trim($content);
}

/** The bytes of one attachment. */
function ccrm_graph_attachment_bytes(CcrmGraphMailbox $mb, string $messageId, string $attachmentId): string {
    return (string)ccrm_graph_request(
        $mb, 'GET', '/messages/' . rawurlencode($messageId) . '/attachments/' . rawurlencode($attachmentId) . '/$value',
        [], null, ['raw' => true, 'timeout' => 120]
    );
}

// ── changing ──────────────────────────────────────────────────────────────────

/** Sets or clears the read flag and returns it as Graph reports it afterwards. */
function ccrm_graph_set_seen(CcrmGraphMailbox $mb, $uid, bool $seen): bool {
    $id = ccrm_graph_resolve_id($mb, $uid);
    $res = ccrm_graph_request($mb, 'PATCH', '/messages/' . rawurlencode($id), ['$select' => 'id,isRead'], ['isRead' => $seen]);
    $now = array_key_exists('isRead', $res) ? !empty($res['isRead']) : $seen;
    if ($now !== $seen) {
        throw new CcrmGraphException('The mail server did not accept the read-state change.');
    }
    return $now;
}

/** Moves a message to Deleted Items, as the IMAP delete moves it to Trash. */
function ccrm_graph_delete(CcrmGraphMailbox $mb, $uid): void {
    $id = ccrm_graph_resolve_id($mb, $uid);
    ccrm_graph_request($mb, 'POST', '/messages/' . rawurlencode($id) . '/move', [], ['destinationId' => 'deleteditems']);
}

/**
 * Sends a message as the mailbox. It is written as a draft first and then sent, because that
 * is the only way to learn its Message-ID; Exchange files the sent copy itself.
 * Returns what send_smtp_email() returns.
 */
function ccrm_graph_send(CcrmGraphMailbox $mb, $to, $subject, $html): array {
    $recipients = [];
    foreach (preg_split('/[,;]+/', (string)$to) as $address) {
        $address = trim($address);
        if ($address === '') {
            continue;
        }
        if (preg_match('/<([^>]+)>/', $address, $m)) {
            $address = trim($m[1]);
        }
        if (!filter_var($address, FILTER_VALIDATE_EMAIL)) {
            throw new CcrmGraphException('The recipient address is not valid: ' . $address);
        }
        $recipients[] = ['emailAddress' => ['address' => $address]];
    }
    if (!$recipients) {
        throw new CcrmGraphException('A recipient address is required.');
    }
    $draft = ccrm_graph_request($mb, 'POST', '/messages', [], [
        'subject' => (string)$subject,
        'body' => ['contentType' => 'HTML', 'content' => (string)$html],
        'toRecipients' => $recipients,
    ]);
    if (empty($draft['id'])) {
        throw new CcrmGraphException('Microsoft 365 did not accept the message.');
    }
    try {
        ccrm_graph_request($mb, 'POST', '/messages/' . rawurlencode((string)$draft['id']) . '/send');
    } catch (\Throwable $e) {
        // Not sent: do not leave the draft behind.
        try {
            ccrm_graph_request($mb, 'DELETE', '/messages/' . rawurlencode((string)$draft['id']));
        } catch (\Throwable $ignored) {
        }
        throw $e;
    }
    return ['message_id' => trim((string)($draft['internetMessageId'] ?? '')), 'filed_to_sent' => true];
}

/** Does the sign-in open the mailbox? Same answer shape as test_mail_connections(). */
function ccrm_graph_test(CcrmGraphMailbox $mb): array {
    try {
        ccrm_graph_request($mb, 'GET', '/mailFolders/inbox', ['$select' => 'id']);
        return ['success' => true];
    } catch (CcrmGraphReconnectException $e) {
        return ['success' => false, 'error' => $e->getMessage(), 'reconnect' => true];
    } catch (CcrmGraphException $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

// ── the mail_broker.php actions ───────────────────────────────────────────────

/**
 * Answers one mail_broker.php action for the signed-in user's Microsoft 365 mailbox and ends
 * the request. A sign-in that has to be renewed answers 409 with `reconnect: true`, so the
 * client can say so instead of showing a mail-server error.
 */
function ccrm_graph_broker_handle(\PDO $pdo, string $action, array $settings, string $userEmail, ?CcrmGraphMailbox $mb = null): void {
    // A company mailbox opened in the mail view comes with its own handle; otherwise it is the user's own.
    if ($mb === null) {
        $stmt = $pdo->prepare("SELECT `id` FROM `users` WHERE `email` = ?");
        $stmt->execute([$userEmail]);
        $mb = ccrm_graph_mailbox($pdo, 'user', (string)$stmt->fetchColumn(), $settings);
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    try {
        switch ($action) {
            case 'get_folders':
                echo json_encode(['success' => true, 'folders' => ccrm_graph_folders($mb)]);
                break;

            case 'get_emails':
                $folder = ccrm_graph_folder_label((string)($_GET['folder'] ?? 'INBOX'));
                $result = ccrm_graph_emails(
                    $mb, $folder, isset($_GET['page']) ? (int)$_GET['page'] : 1, 25,
                    (string)($_GET['filter'] ?? 'all'), $_GET['email'] ?? null, $userEmail
                );
                echo json_encode(array_merge(['success' => true, 'folder' => $folder], $result), JSON_INVALID_UTF8_SUBSTITUTE);
                break;

            case 'get_email_detail':
                echo json_encode(['success' => true, 'email' => ccrm_graph_email_detail($mb, $_GET['uid'] ?? '')], JSON_INVALID_UTF8_SUBSTITUTE);
                break;

            case 'send_email':
                if ($method !== 'POST') {
                    throw new Exception('Invalid method.');
                }
                $payload = json_decode((string)file_get_contents('php://input'), true);
                if (!is_array($payload)) {
                    throw new Exception('Invalid email payload.');
                }
                $sent = ccrm_graph_send($mb, $payload['to'] ?? '', $payload['subject'] ?? '', $payload['html'] ?? '');
                echo json_encode(['success' => true, 'filed_to_sent' => true, 'message_id' => $sent['message_id']]);
                break;

            case 'set_seen':
                if ($method !== 'POST') {
                    throw new Exception('Invalid method.');
                }
                $payload = json_decode((string)file_get_contents('php://input'), true);
                $uid = is_array($payload) ? trim((string)($payload['uid'] ?? '')) : '';
                if ($uid === '' || !array_key_exists('seen', $payload)) {
                    throw new Exception('Missing parameters.');
                }
                $seen = ccrm_graph_set_seen($mb, $uid, !empty($payload['seen']));
                echo json_encode(['success' => true, 'uid' => $uid, 'folder' => ccrm_graph_folder_label((string)($payload['folder'] ?? 'INBOX')), 'seen' => $seen]);
                break;

            case 'delete_email':
                if ($method !== 'DELETE') {
                    throw new Exception('Invalid method.');
                }
                ccrm_graph_delete($mb, $_GET['uid'] ?? '');
                echo json_encode(['success' => true]);
                break;

            case 'get_attachment':
                $part = (string)($_GET['part'] ?? '');
                if (($_GET['uid'] ?? '') === '' || $part === '') {
                    throw new Exception('Missing parameters.');
                }
                $data = ccrm_graph_attachment_bytes($mb, ccrm_graph_resolve_id($mb, $_GET['uid']), $part);
                header('Content-Description: File Transfer');
                header('Content-Type: application/octet-stream');
                header('X-Content-Type-Options: nosniff');
                header('Content-Disposition: attachment; filename="' . str_replace(['"', "\r", "\n"], '', basename((string)($_GET['name'] ?? 'attachment'))) . '"');
                header('Content-Transfer-Encoding: binary');
                header('Expires: 0');
                header('Cache-Control: must-revalidate');
                header('Pragma: public');
                header('Content-Length: ' . strlen($data));
                echo $data;
                break;

            case 'save_attachment':
                $part = (string)($_GET['part'] ?? '');
                $eventId = isset($_GET['eventId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$_GET['eventId']) : '';
                if (($_GET['uid'] ?? '') === '' || $part === '' || $eventId === '') {
                    throw new Exception('Missing parameters.');
                }
                // The name is checked before anything is downloaded (see save_imap_attachment_to_uploads).
                $safeName = ccrm_safe_upload_name((string)($_GET['name'] ?? 'attachment'));
                if ($safeName === null) {
                    echo json_encode(['success' => false, 'error' => 'This attachment type cannot be saved to documents.']);
                    break;
                }
                $data = ccrm_graph_attachment_bytes($mb, ccrm_graph_resolve_id($mb, $_GET['uid']), $part);
                echo json_encode(ccrm_store_mail_attachment_upload($data, $safeName, $eventId), JSON_INVALID_UTF8_SUBSTITUTE);
                break;

            default:
                throw new Exception('Unsupported action: ' . $action);
        }
    } catch (CcrmGraphReconnectException $ex) {
        http_response_code(409);
        echo json_encode(['success' => false, 'reconnect' => true, 'error' => $ex->getMessage()]);
    } catch (\Throwable $ex) {
        http_response_code(500);
        // As in mail_broker.php: a deliberate Exception is about the user's own mailbox and is
        // shown; anything else is an internal error whose text stays in the log.
        $isUserFacing = ($ex instanceof Exception) && !($ex instanceof \ErrorException);
        if (function_exists('ccrm_log_exception')) {
            ccrm_log_exception($ex);
        }
        echo json_encode(['success' => false, 'error' => $isUserFacing ? $ex->getMessage() : 'The mail server request failed.']);
    }
}
