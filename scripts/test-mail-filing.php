<?php
/**
 * Checks for the background mail filing (api/mail_filing.php, company mailboxes).
 *
 *   php scripts/test-mail-filing.php        the matching rules only, no database, no mail server
 *
 *   CCRM_TEST_DSN=mysql:host=db;dbname=scratch CCRM_TEST_USER=root CCRM_TEST_PASS=x \
 *   CCRM_TEST_IMAP_HOST=imaptest CCRM_TEST_IMAP_PORT=143 \
 *   CCRM_TEST_IMAP_USER=info@test.local CCRM_TEST_IMAP_USER2=steel@test.local CCRM_TEST_IMAP_PASS=secret \
 *   php scripts/test-mail-filing.php        also files real messages from a test IMAP server into a SCRATCH database
 *
 * The IMAP part needs a plain-text IMAP server with two mailboxes that accept the same password
 * (a throw-away Dovecot container does; see docs/TESTING.md). Mail is put into it with IMAP APPEND, so
 * no shell access to the server is needed. The database part creates the whole CCRM schema in the
 * scratch database and writes its own leads, mailboxes and mail: never point it at real data.
 * CCRM_API_DIR overrides the folder that holds the api files (for running inside the dev container).
 */
$api = getenv('CCRM_API_DIR') ?: __DIR__ . '/../public/api';
require_once $api . '/auth.php';
require_once $api . '/mail_filing.php';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok || $detail === '' ? '' : "  [$detail]") . "\n";
    if (!$ok) { $fails++; }
};

// ── addresses and matching (no database) ──────────────────────────────────────
$check('addresses are lower-cased out of a header', ccrm_mail_addresses_in('Jan Novák <Jan@Acme.SK>, "x" <b@c.sk>') === ['jan@acme.sk', 'b@c.sk']);
$check('addresses are read from parsed header objects', ccrm_mail_addresses_in([(object)['mailbox' => 'A', 'host' => 'B.sk'], (object)['personal' => 'no address']]) === ['a@b.sk']);

$check('incoming mail looks at the sender first, outgoing at the recipients first',
    ccrm_mail_counterparties(['c@x.sk'], ['own@x.sk', 'p@x.sk'], ['q@x.sk'], ['own@x.sk'], false) === ['c@x.sk', 'p@x.sk', 'q@x.sk']
    && ccrm_mail_counterparties(['own@x.sk'], ['p@x.sk'], ['q@x.sk'], ['own@x.sk'], true) === ['p@x.sk', 'q@x.sk']);
$check('the mailbox\'s own addresses are never a customer', ccrm_mail_counterparties(['own@x.sk'], ['own@x.sk'], [], ['OWN@x.sk'], false) === []);

$row = fn($id, $archived = false, $created = '2026-01-01') => ['id' => $id, 'client' => strpos($id, 'client-') === 0, 'archived' => $archived, 'created_at' => $created];
$check('a lead row wins over the client record with the same address', ccrm_mail_pick_row([$row('client-1'), $row('lead-1')]) === 'lead-1');
$check('an active row wins over an archived one', ccrm_mail_pick_row([$row('lead-old', true, '2026-05-01'), $row('lead-new', false, '2026-01-01')]) === 'lead-new');
$check('an archived lead still beats nothing, and the client record beats an archived lead only when it is active',
    ccrm_mail_pick_row([$row('lead-old', true)]) === 'lead-old' && ccrm_mail_pick_row([$row('lead-old', true), $row('client-1')]) === 'client-1');
$check('among equal rows the newest wins', ccrm_mail_pick_row([$row('lead-a', false, '2026-01-01'), $row('lead-b', false, '2026-03-01')]) === 'lead-b');
$check('nothing to pick from is null', ccrm_mail_pick_row([]) === null);

$index = ['own' => ['a@x.sk' => [$row('lead-a')]], 'contact' => ['p@x.sk' => [$row('client-p')], 'a@x.sk' => [$row('client-z')]]];
$check('an address is matched on a row\'s own e-mail before it is matched as a contact address', ccrm_mail_match_row($index, ['a@x.sk']) === 'lead-a');
$check('a contact address matches when no row owns it', ccrm_mail_match_row($index, ['p@x.sk']) === 'client-p');
$check('the first address that matches decides', ccrm_mail_match_row($index, ['nobody@x.sk', 'a@x.sk', 'p@x.sk']) === 'lead-a');
$check('no match is null', ccrm_mail_match_row($index, ['nobody@x.sk']) === null);
[$cleaned, $cut] = ccrm_mail_clean_body("a  \r\n\r\n\r\n\r\nb");
$check('a body is tidied: line endings, trailing blanks and runs of empty lines', $cleaned === "a\n\nb" && $cut === false);
[$long, $cut] = ccrm_mail_clean_body(str_repeat('ž', CCRM_MAIL_BODY_MAX_CHARS + 10));
$check('a very long body is cut and flagged', mb_strlen($long, 'UTF-8') === CCRM_MAIL_BODY_MAX_CHARS && $cut === true);

$dsn = getenv('CCRM_TEST_DSN');
$imapHost = getenv('CCRM_TEST_IMAP_HOST');
if (!$dsn || !$imapHost) {
    echo "skip database / IMAP checks (set CCRM_TEST_DSN and CCRM_TEST_IMAP_HOST to run them)\n";
    echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
    exit($fails === 0 ? 0 : 1);
}

// ── a scratch database and a test IMAP server ─────────────────────────────────
require_once $api . '/schema.php';
$pdo = new PDO($dsn, getenv('CCRM_TEST_USER') ?: 'root', getenv('CCRM_TEST_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$GLOBALS['pdo'] = $pdo;
foreach ($pdo->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")->fetchAll(PDO::FETCH_COLUMN) as $t) {
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $pdo->exec("DROP TABLE IF EXISTS `$t`");
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}
ccrm_apply_schema($pdo);
$check('the schema has the mail filing tables and columns', $pdo->query("SHOW TABLES LIKE 'company_mailboxes'")->rowCount() === 1
    && $pdo->query("SHOW TABLES LIKE 'mail_sync_state'")->rowCount() === 1 && $pdo->query("SHOW TABLES LIKE 'filed_mail_bodies'")->rowCount() === 1
    && ccrm_column_exists($pdo, 'timeline_events', 'mail_account') && ccrm_column_exists($pdo, 'timeline_events', 'mail_has_body'));
$pdo->exec("DELETE FROM `leads`");

$port = getenv('CCRM_TEST_IMAP_PORT') ?: '143';
$pass = getenv('CCRM_TEST_IMAP_PASS') ?: 'secret';
$userA = getenv('CCRM_TEST_IMAP_USER') ?: 'info@test.local';
$userB = getenv('CCRM_TEST_IMAP_USER2') ?: 'steel@test.local';
$profile = fn($user, $password = null) => [
    'provider' => 'smtp', 'imapHost' => $imapHost, 'imapPort' => $port, 'imapSecure' => 'none', 'imapAllowSelfSigned' => true,
    'imapUsername' => $user, 'imapPassword' => $password ?? $pass, 'smtpHost' => $imapHost, 'smtpPort' => '25', 'smtpSecure' => 'none',
    'smtpUsername' => $user, 'smtpPassword' => $password ?? $pass,
];

/** Puts a message into a folder of a test mailbox with IMAP APPEND; returns its UID. */
$append = function (string $user, string $folder, string $from, string $to, string $subject, string $body, ?string $messageId = null, ?string $date = null) use ($profile) {
    $settings = $profile($user);
    $mailbox = get_imap_mailbox_string($settings, $folder === 'INBOX' ? 'INBOX' : $folder);
    $stream = @imap_open(get_imap_mailbox_string($settings, ''), $user, $settings['imapPassword'], OP_HALFOPEN);
    if (!$stream) throw new RuntimeException('cannot open the test IMAP server: ' . imap_last_error());
    $when = $date ? date('r', strtotime($date)) : date('r');
    $raw = "From: $from\r\nTo: $to\r\nSubject: $subject\r\nDate: $when\r\n" . ($messageId ? "Message-ID: <$messageId>\r\n" : '')
        . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n$body\r\n";
    $ok = @imap_append($stream, $mailbox, $raw, '', $date ? date('d-M-Y H:i:s O', strtotime($date)) : null);
    if (!$ok) throw new RuntimeException('append failed: ' . imap_last_error());
    @imap_close($stream);
    $check = @imap_open($mailbox, $user, $settings['imapPassword']);
    $uids = imap_search($check, 'ALL', SE_UID);
    $uid = max($uids);
    @imap_close($check);
    return (int)$uid;
};
try {
    $append($userA, 'INBOX', 'warm@up.sk', $userA, 'warm up', 'x');
} catch (Throwable $e) {
    echo "skip IMAP checks: " . $e->getMessage() . "\n";
    exit($fails === 0 ? 0 : 1);
}

// customers
$lead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `created_at`, `archived`, `ticket_allowed_emails`) VALUES (?, ?, '', ?, 'new', 'web', 'x', 0, 3, '', ?, ?, ?, ?)");
$lead->execute(['lead-novak', 'Novák', 'person', 'novak@cust.sk', '2026-02-01', 0, null]);
$lead->execute(['client-novak', 'Novák', 'business', 'novak@cust.sk', '2026-01-01', 0, null]);
$lead->execute(['lead-old', 'Starý', 'person', 'stary@cust.sk', '2025-01-01', 1, null]);
$lead->execute(['client-firma', 'Firma', 'business', 'office@firma.sk', '2026-01-01', 0, json_encode(['jana@firma.sk', '@firma.sk'])]);

// the company mailbox, credentials encrypted like a user's
$box = $pdo->prepare("INSERT INTO `company_mailboxes` (`id`, `name`, `address`, `settings_json`, `is_active`, `backfill_since`) VALUES (?, ?, ?, ?, 1, ?)");
$store = fn($id, $name, $user, $password = null, $since = null) => $box->execute([
    $id, $name, $user, json_encode(ccrm_encrypt_config_secrets($profile($user, $password), ccrm_email_secret_keys())), $since,
]);
$check('a company mailbox profile is stored encrypted', (function () use ($profile, $userA, $pass) {
    $enc = ccrm_encrypt_config_secrets($profile($userA), ccrm_email_secret_keys());
    return strpos($enc['imapPassword'], 'enc:v1:') === 0 && ccrm_decrypt_email_settings($enc)['imapPassword'] === $pass;
})());

// mail that is already there when the mailbox is added: the backlog
$uidOld1 = $append($userA, 'INBOX', 'Novák <novak@cust.sk>', $userA, 'Backlog 1', 'oldest customer mail', 'm-old1@x', '2026-01-10 10:00:00');
$uidOld2 = $append($userA, 'INBOX', 'office@firma.sk', $userA, 'Backlog 2', 'firma mail', 'm-old2@x', '2026-02-10 10:00:00');
$uidOld3 = $append($userA, 'INBOX', 'nobody@random.sk', $userA, 'Backlog 3 (not a customer)', 'spam', 'm-old3@x', '2026-02-11 10:00:00');
$uidOld4 = $append($userA, 'INBOX', 'Starý <stary@cust.sk>', $userA, 'Backlog 4', 'archived lead mail', 'm-old4@x', '2026-02-12 10:00:00');
$uidAncient = $append($userA, 'INBOX', 'novak@cust.sk', $userA, 'Ancient', 'before the cut-off', 'm-anc@x', '2020-01-01 10:00:00');

$store('cmb-a', 'Info', $userA, null, '2025-06-01');
$store('cmb-b', 'Broken', 'broken@test.local', 'wrong-password');

$count = fn($where = '1=1', $params = []) => (function () use ($pdo, $where, $params) {
    $s = $pdo->prepare("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'email' AND $where");
    $s->execute($params);
    return (int)$s->fetchColumn();
})();
$eventId = fn($uid, $user = null, $folder = 'INBOX') => ccrm_mail_event_id($user ?? $userA, $folder, $uid);

// first run: high-water mark set, backlog caught up in chunks
$r = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-a', 'max_messages' => 2]);
$check('the first run is bounded by its message budget', ($r['seen'] ?? 0) <= 2 && $r['ran'] === true, json_encode($r));
$newestFirst = $pdo->query("SELECT `id` FROM `timeline_events` WHERE `type` = 'email' ORDER BY `timestamp` DESC")->fetchAll(PDO::FETCH_COLUMN);
$check('the backlog is caught up newest first', in_array($eventId($uidOld4), $newestFirst, true) && !in_array($eventId($uidOld1), $newestFirst, true), json_encode($newestFirst));
for ($i = 0; $i < 6; $i++) {
    ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-a', 'max_messages' => 2]);
}
$check('further runs finish the backlog', $count("`id` = ?", [$eventId($uidOld1)]) === 1 && $count("`id` = ?", [$eventId($uidOld2)]) === 1);
$check('mail from nobody we know is not filed', $count("`id` = ?", [$eventId($uidOld3)]) === 0);
$check('mail before the mailbox\'s cut-off date is not filed', $count("`id` = ?", [$eventId($uidAncient)]) === 0);
$st = $pdo->query("SELECT * FROM `mail_sync_state` WHERE `mailbox_key` = 'c:cmb-a' AND `folder` = 'INBOX'")->fetch();
$check('the backlog is marked done and the high-water mark stored', (int)$st['backfill_done'] === 1 && (int)$st['last_uid'] >= $uidAncient, json_encode($st));

$te = fn($uid) => (function () use ($pdo, $eventId, $uid) {
    $s = $pdo->prepare("SELECT * FROM `timeline_events` WHERE `id` = ?");
    $s->execute([$eventId($uid)]);
    return $s->fetch();
})();
$check('a lead row wins over a client record with the same address', ($te($uidOld1)['lead_id'] ?? '') === 'lead-novak');
$check('a contact address filed it on the client record that lists it', ($te($uidOld2)['lead_id'] ?? '') === 'client-firma');
$check('an archived lead still gets its mail when nothing else has the address', ($te($uidOld4)['lead_id'] ?? '') === 'lead-old');
$check('the id is the one the live read and the migration use', ($te($uidOld1)['id'] ?? '') === ccrm_mail_event_id($userA, 'INBOX', $uidOld1));
$check('the row says which mailbox it came from, and that no user owns it',
    ($te($uidOld1)['mail_account'] ?? '') === 'Info' && array_key_exists('mail_owner', $te($uidOld1)) && $te($uidOld1)['mail_owner'] === null && (int)($te($uidOld1)['mail_has_body'] ?? 0) === 1);
$body = $pdo->prepare("SELECT `body` FROM `filed_mail_bodies` WHERE `event_id` = ?");
$body->execute([$eventId($uidOld1)]);
$check('a readable body is stored for it', trim((string)$body->fetchColumn()) === 'oldest customer mail');
$check('the timeline text carries the header lines and the date of the mail', strpos((string)$te($uidOld1)['content'], 'Subject: Backlog 1') !== false && strpos((string)$te($uidOld1)['timestamp'], '2026-01-10') === 0);

// new mail after the first run is picked up without a re-scan
$before = (int)$pdo->query("SELECT SUM(filed_count) FROM mail_sync_state")->fetchColumn();
$uidNew = $append($userA, 'INBOX', 'novak@cust.sk', $userA, 'New mail', 'arrived later', 'm-new@x');
$r = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-a']);
$check('new mail is filed on the next run', $count("`id` = ?", [$eventId($uidNew)]) === 1, json_encode($r));
$r = ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-a']);
$check('a run with nothing new looks at nothing', (int)$r['seen'] === 0, json_encode($r));

// outgoing mail from the Sent folder
$sent = ccrm_resolve_sent_folder($profile($userA));
$uidSent = $append($userA, $sent, $userA, 'novak@cust.sk', 'Our answer', 'we replied', 'm-sent@x');
ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-a']);
$sentRow = $pdo->prepare("SELECT * FROM `timeline_events` WHERE `id` = ?");
$sentRow->execute([$eventId($uidSent, null, $sent)]);
$sentRow = $sentRow->fetch();
$check('mail we sent is filed as outgoing, from the Sent folder', $sentRow && (int)$sentRow['is_outgoing'] === 1 && $sentRow['lead_id'] === 'lead-novak', json_encode($sentRow));

// the same message in a second mailbox is filed once, by its Message-ID
$uidDup = $append($userA, 'INBOX', 'novak@cust.sk', 'info@test.local, steel@test.local', 'Both mailboxes', 'copied to steel', 'm-both@x');
ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-a']);
$store('cmb-c', 'Steel', $userB, $pass, '2026-01-01');
$append($userB, 'INBOX', 'novak@cust.sk', 'info@test.local, steel@test.local', 'Both mailboxes', 'copied to steel', 'm-both@x');
for ($i = 0; $i < 3; $i++) ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-c']);
$check('one message in two mailboxes is on the timeline once', $count("`mail_message_id` = ?", ['<m-both@x>']) === 1, (string)$count("`mail_message_id` LIKE '%m-both%'"));

// a user removed an entry: it stays a tombstone and is not filed again
$pdo->prepare("UPDATE `timeline_events` SET `hidden` = 1 WHERE `id` = ?")->execute([$eventId($uidOld1)]);
$pdo->prepare("DELETE FROM `mail_sync_state` WHERE `mailbox_key` = 'c:cmb-a'")->execute();
$pdo->exec("UPDATE `company_mailboxes` SET `backfill_since` = NULL WHERE `id` = 'cmb-a'");
for ($i = 0; $i < 12; $i++) ccrm_run_mail_filing($pdo, ['only' => 'c:cmb-a', 'max_messages' => 5]);
$hidden = $pdo->prepare("SELECT `hidden` FROM `timeline_events` WHERE `id` = ?");
$hidden->execute([$eventId($uidOld1)]);
$check('a removed entry stays removed when the mailbox is read again', (int)$hidden->fetchColumn() === 1 && $count("`id` = ?", [$eventId($uidOld1)]) === 1);

// one broken mailbox does not stop the others
$r = ccrm_run_mail_filing($pdo, ['max_messages' => 50]);
$err = $pdo->query("SELECT `last_error` FROM `company_mailboxes` WHERE `id` = 'cmb-b'")->fetchColumn();
$check('a mailbox with a wrong password is recorded as failed, with the reason', $err !== null && $err !== '' && $r['errors'] >= 1, (string)$err);
$ok = $pdo->query("SELECT `last_success_at` FROM `company_mailboxes` WHERE `id` = 'cmb-a'")->fetchColumn();
$check('...and the healthy mailboxes were still read', $ok !== null && isset($r['mailboxes']['c:cmb-a']));

// the interactive read agrees with the job: same ids, nothing filed twice
$GLOBALS['userEmail'] = 'someone@crm.test';
$pdo->exec("INSERT INTO `users` (`id`, `email`, `password_hash`, `name`, `role`, `color`) VALUES ('u-1', 'someone@crm.test', 'x', 'Someone', 'Admin', '#000')");
$rowsBefore = $count();
$list = fetch_imap_emails($profile($userA), 'INBOX', 1, 50, 'all', null);
$check('the live read of the same mailbox files nothing twice', $count() === $rowsBefore, $count() . ' vs ' . $rowsBefore);
$live = array_column($list['emails'], null, 'uid');
$check('...and hands the client the same event id', isset($live[$uidOld1]) && $live[$uidOld1]['event_id'] === $eventId($uidOld1));
$check('...and a removed entry is flagged so the client leaves its live copy out', !empty($live[$uidOld1]['timeline_hidden']));
$check('...and the stored body of the job survives the live read', (int)($te($uidNew)['mail_has_body'] ?? 0) === 1);

// the interactive read of a mailbox the job has already filed from another one does not duplicate it
$listB = fetch_imap_emails($profile($userB), 'INBOX', 1, 50, 'all', null);
$liveB = array_column($listB['emails'], null, 'subject');
$check('the live read marks a message that is already on the timeline from another mailbox', !empty($liveB['Both mailboxes']['timeline_hidden']));

echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
exit($fails === 0 ? 0 : 1);
