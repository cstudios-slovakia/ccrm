<?php
/**
 * PLAN D6: the old CRM's mailboxes become company mailboxes of the new CCRM, so the background
 * filing job (api/cron.php -> mail_filing.php) keeps filing customer mail onto timelines.
 * They have no owner: nobody browses them, exactly as in the old CRM.
 *
 *   php connect_mailboxes.php --since=2026-10-23 --old-host=... --old-port=... --old-db=... --old-user=... --old-pass=...
 *       [--config=../config.php] [--api-dir=../api] [--inactive] [--dry-run]
 *
 * Reads email_reader__account from the old DB (read-only session), writes company_mailboxes in the
 * new DB with the password encrypted by the app's own ccrm_encrypt_config_secrets(). Ids are
 * `cmb-vt-<oldId>`, so a second run updates. Passwords are never printed.
 * --since is the filing cut-off (YYYY-MM-DD): older mail is not scanned. The history up to the
 * import is already on the timelines, so use the cutover date.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$cli = vt_cli($argv);
$since = (string)($cli['since'] ?? '');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) { fwrite(STDERR, "--since=YYYY-MM-DD is required (the cut-off date for filing)\n"); exit(1); }
$dry = isset($cli['dry-run']);
$active = isset($cli['inactive']) ? 0 : 1;
$configPath = (string)($cli['config'] ?? dirname(__DIR__, 3) . '/config.php');
$apiDir = rtrim((string)($cli['api-dir'] ?? dirname(__DIR__, 3) . '/api'), '/');

$old = new PDO(
    sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $cli['old-host'] ?? '127.0.0.1', (int)($cli['old-port'] ?? 33061), $cli['old-db'] ?? 'vcrm_db'),
    $cli['old-user'] ?? 'root', $cli['old-pass'] ?? 'root',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
$old->exec('SET SESSION TRANSACTION READ ONLY');

require $configPath;
require_once $apiDir . '/auth.php';
require_once $apiDir . '/schema.php';
$pdo = get_db_connection();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
if (!$dry) ccrm_migrate_mail_filing($pdo);

$accounts = $old->query('SELECT * FROM email_reader__account WHERE active = 1 ORDER BY id')->fetchAll();
$done = 0;
foreach ($accounts as $a) {
    $address = strtolower(trim((string)$a['email']));
    $imapUser = trim((string)$a['imap_username']) ?: $address;
    $settings = [
        'provider' => 'smtp',
        'imapHost' => trim((string)$a['imap_host']), 'imapPort' => (string)(int)$a['imap_port'], 'imapSecure' => in_array($a['imap_encryption'], ['ssl', 'tls', 'none'], true) ? $a['imap_encryption'] : 'ssl',
        'imapUsername' => $imapUser, 'imapPassword' => (string)$a['imap_password'],
        // The old row of PredajBA 2 has the SMTP host in the username column; the login is the same as IMAP everywhere.
        'smtpHost' => trim((string)$a['smtp_host']) !== '' ? trim((string)$a['smtp_host']) : 'smtp.m1.websupport.sk',
        'smtpPort' => (string)((int)$a['smtp_port'] ?: 465), 'smtpSecure' => in_array($a['smtp_encryption'], ['ssl', 'tls', 'none'], true) ? $a['smtp_encryption'] : 'ssl',
        'smtpUsername' => $imapUser, 'smtpPassword' => (string)($a['smtp_password'] !== '' ? $a['smtp_password'] : $a['imap_password']),
        'exchangeUrl' => '', 'imapAllowSelfSigned' => false,
    ];
    if ($settings['imapHost'] === '' || $settings['imapPassword'] === '' || !filter_var($address, FILTER_VALIDATE_EMAIL)) {
        echo "SKIP  {$address}: incomplete login in the old CRM\n";
        continue;
    }
    $id = 'cmb-vt-' . (int)$a['id'];
    $name = mb_substr(trim((string)$a['name']) ?: $address, 0, 150, 'UTF-8');
    $blob = json_encode(ccrm_encrypt_config_secrets($settings, ccrm_email_secret_keys()), JSON_UNESCAPED_UNICODE);
    $exists = $pdo->prepare('SELECT 1 FROM company_mailboxes WHERE id = ?');
    $exists->execute([$id]);
    $found = (bool)$exists->fetchColumn();
    $other = $pdo->prepare('SELECT id FROM company_mailboxes WHERE address = ? AND id <> ?');
    $other->execute([$address, $id]);
    if ($other->fetchColumn()) { echo "SKIP  {$address}: a company mailbox with this address already exists\n"; continue; }
    echo sprintf("%s %-32s %s:%s %s, no owner, cut-off %s%s\n", $found ? 'UPDATE' : 'ADD   ', $address, $settings['imapHost'], $settings['imapPort'], $settings['imapSecure'], $since, $active ? '' : ', INACTIVE');
    if ($dry) { $done++; continue; }
    if ($found) {
        $pdo->prepare('UPDATE company_mailboxes SET name = ?, address = ?, settings_json = ?, is_active = ?, owner_user_id = NULL, backfill_since = ? WHERE id = ?')
            ->execute([$name, $address, $blob, $active, $since, $id]);
    } else {
        $pdo->prepare('INSERT INTO company_mailboxes (id, name, address, settings_json, is_active, owner_user_id, backfill_since) VALUES (?, ?, ?, ?, ?, NULL, ?)')
            ->execute([$id, $name, $address, $blob, $active, $since]);
    }
    $done++;
}
echo ($dry ? "DRY RUN: nothing written. " : '') . "{$done} of " . count($accounts) . " mailboxes " . ($dry ? 'would be ' : '') . "connected.\n";
