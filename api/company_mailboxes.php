<?php
/**
 * Company mailboxes: shared IMAP / SMTP mailboxes (info@, steel@, ...) an admin
 * defines once and the background job (mail_filing.php) reads on behalf of the whole
 * team. Admin only, every action.
 *
 *   GET  ?action=list     the mailboxes, passwords masked, with their filing state
 *   POST ?action=save     create or update one (a masked password keeps the stored one)
 *   POST ?action=delete   {id}; mail already filed stays on its timelines
 *   POST ?action=test     {id?, ...settings}: connect to IMAP and SMTP with those settings
 *   POST ?action=run      {id}: file that mailbox now, a small bounded batch
 *
 * The profile is stored in `company_mailboxes.settings_json` in the shape of a user's
 * `emailSettings`, secrets encrypted exactly as theirs are, so mail_broker.php reads it
 * unchanged. A password is never sent back to the browser.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/mail_filing.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;
$admin = ccrm_require_admin();

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed.']);
    exit;
}
// The tables belong to the schema; a request that lands before the first sync after an
// update would otherwise find none.
ccrm_migrate_mail_filing($pdo);

/** The mail fields of a payload, cleaned; everything else a caller sends is dropped. */
function ccrm_company_mailbox_clean(array $in): array {
    $str = fn($k, $max = 255) => mb_substr(trim((string)($in[$k] ?? '')), 0, $max, 'UTF-8');
    $secure = fn($k) => in_array(($in[$k] ?? 'ssl'), ['ssl', 'tls', 'none'], true) ? $in[$k] : 'ssl';
    $provider = (($in['provider'] ?? 'smtp') === 'exchange') ? 'exchange' : 'smtp';
    $s = [
        'provider' => $provider,
        'imapHost' => $str('imapHost'), 'imapPort' => $str('imapPort', 6), 'imapSecure' => $secure('imapSecure'),
        'imapUsername' => $str('imapUsername'), 'imapPassword' => (string)($in['imapPassword'] ?? ''),
        'smtpHost' => $str('smtpHost'), 'smtpPort' => $str('smtpPort', 6), 'smtpSecure' => $secure('smtpSecure'),
        'smtpUsername' => $str('smtpUsername'), 'smtpPassword' => (string)($in['smtpPassword'] ?? ''),
        'exchangeUrl' => $str('exchangeUrl'),
        'imapAllowSelfSigned' => !empty($in['imapAllowSelfSigned']),
    ];
    // Many providers use one login for both; fill it in rather than store two empty ones.
    if ($s['smtpUsername'] === '') $s['smtpUsername'] = $s['imapUsername'];
    if ($s['smtpPassword'] === '' && $s['imapPassword'] !== '' && $s['imapPassword'] !== CCRM_SECRET_MASK) $s['smtpPassword'] = $s['imapPassword'];
    // A password that was not sent is "keep the stored one" (ccrm_merge_secrets), not "blank it".
    foreach (ccrm_email_secret_keys() as $k) {
        if (($s[$k] ?? null) === '') unset($s[$k]);
    }
    return $s;
}

/** Refuses a host / port the server must not connect to (private addresses, non-mail ports). */
function ccrm_company_mailbox_validate(array $s): void {
    $isExchange = $s['provider'] === 'exchange';
    $imapPort = (int)$s['imapPort'] > 0 ? (int)$s['imapPort'] : ($isExchange ? 993 : 0);
    $smtpPort = (int)$s['smtpPort'] > 0 ? (int)$s['smtpPort'] : ($isExchange ? 587 : 0);
    ccrm_validate_external_mail_target(ccrm_resolve_mail_host($s, 'imap'), $imapPort);
    if ($s['smtpHost'] !== '' || $isExchange) {
        ccrm_validate_external_mail_target(ccrm_resolve_mail_host($s, 'smtp'), $smtpPort);
    }
}

function ccrm_company_mailbox_public(array $r, array $state): array {
    $settings = ccrm_company_mailbox_settings($r);
    $masked = ccrm_mask_secrets($settings, ccrm_email_secret_keys());
    return [
        'id' => $r['id'], 'name' => $r['name'], 'address' => $r['address'],
        'isActive' => (bool)$r['is_active'], 'ownerUserId' => $r['owner_user_id'],
        'backfillSince' => $r['backfill_since'],
        'settings' => $masked,
        'lastRunAt' => $r['last_run_at'], 'lastSuccessAt' => $r['last_success_at'], 'lastError' => $r['last_error'],
        'folders' => $state,
    ];
}

$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];
$input = $method === 'POST' ? json_decode((string)file_get_contents('php://input'), true) : [];
if (!is_array($input)) $input = [];

try {
    if ($method === 'GET' && $action === 'list') {
        $state = [];
        foreach ($pdo->query("SELECT * FROM `mail_sync_state`")->fetchAll(PDO::FETCH_ASSOC) as $st) {
            $state[$st['mailbox_key']][] = [
                'folder' => $st['folder'], 'lastUid' => (int)$st['last_uid'], 'backfillDone' => (bool)$st['backfill_done'],
                'filedCount' => (int)$st['filed_count'], 'lastRunAt' => $st['last_run_at'], 'lastError' => $st['last_error'],
            ];
        }
        $boxes = [];
        foreach ($pdo->query("SELECT * FROM `company_mailboxes` ORDER BY `name`")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $boxes[] = ccrm_company_mailbox_public($r, $state['c:' . $r['id']] ?? []);
        }
        // Personal mailboxes are read by the same job; their problems belong on the same screen.
        $users = [];
        foreach ($pdo->query("SELECT `id`, `name`, `email` FROM `users` ORDER BY `name`")->fetchAll(PDO::FETCH_ASSOC) as $u) {
            if (isset($state['u:' . $u['id']])) {
                $users[] = ['id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'folders' => $state['u:' . $u['id']]];
            }
        }
        echo json_encode(['success' => true, 'mailboxes' => $boxes, 'userMailboxes' => $users, 'imapAvailable' => function_exists('imap_open')]);
        exit;
    }

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    // The stored profile of `id`, decrypted, for merging a masked password; [] for a new mailbox.
    $stored = null;
    $id = trim((string)($input['id'] ?? ''));
    if ($id !== '') {
        $q = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `id` = ?");
        $q->execute([$id]);
        $stored = $q->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if ($action === 'delete') {
        if (!$stored) throw new \InvalidArgumentException('Mailbox not found.');
        $pdo->prepare("DELETE FROM `company_mailboxes` WHERE `id` = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM `mail_sync_state` WHERE `mailbox_key` = ?")->execute(['c:' . $id]);
        ccrm_audit_log($pdo, $admin, 'company_mailbox.delete', 'Company mailbox ' . $stored['address'] . ' removed');
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'run') {
        if (!$stored) throw new \InvalidArgumentException('Mailbox not found.');
        $r = ccrm_run_mail_filing($pdo, ['only' => 'c:' . $id, 'max_seconds' => 25, 'max_messages' => 100]);
        echo json_encode(['success' => true, 'run' => $r['mailboxes']['c:' . $id] ?? $r]);
        exit;
    }

    if ($action === 'save' || $action === 'test') {
        $settings = ccrm_company_mailbox_clean(is_array($input['settings'] ?? null) ? $input['settings'] : $input);
        // A password the browser echoes back masked (or leaves out) keeps the stored one. It is only
        // reused for the host it was saved for (the same rule the personal "test connection" applies).
        if ($stored) {
            $old = ccrm_company_mailbox_settings($stored);
            $sameTarget = true;
            foreach (['provider', 'imapHost', 'imapPort', 'smtpHost', 'smtpPort', 'imapUsername', 'smtpUsername', 'exchangeUrl'] as $pin) {
                if (strtolower(trim((string)($settings[$pin] ?? ''))) !== strtolower(trim((string)($old[$pin] ?? '')))) { $sameTarget = false; break; }
            }
            if ($sameTarget) {
                $settings = ccrm_merge_secrets($settings, $old, ccrm_email_secret_keys());
            } else {
                foreach (ccrm_email_secret_keys() as $k) {
                    if (($settings[$k] ?? '') === CCRM_SECRET_MASK || ($settings[$k] ?? '') === '') {
                        throw new \InvalidArgumentException('Please re-enter the password when changing the server, port or account.');
                    }
                }
            }
        }
        ccrm_company_mailbox_validate($settings);

        if ($action === 'test') {
            echo json_encode(test_mail_connections($settings));
            exit;
        }

        $name = mb_substr(trim((string)($input['name'] ?? '')), 0, 150, 'UTF-8');
        $address = strtolower(trim((string)($input['address'] ?? '')));
        if ($name === '') throw new \InvalidArgumentException('A name is required.');
        if (!filter_var($address, FILTER_VALIDATE_EMAIL)) throw new \InvalidArgumentException('A valid mailbox address is required.');
        if ($settings['imapUsername'] === '' || (($settings['imapPassword'] ?? '') === '' && !$stored)) {
            throw new \InvalidArgumentException('The IMAP login and password are required.');
        }
        $owner = trim((string)($input['ownerUserId'] ?? ''));
        if ($owner !== '') {
            $o = $pdo->prepare("SELECT 1 FROM `users` WHERE `id` = ?");
            $o->execute([$owner]);
            if (!$o->fetchColumn()) throw new \InvalidArgumentException('The owner is not a known user.');
        }
        $since = trim((string)($input['backfillSince'] ?? ''));
        if ($since !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) throw new \InvalidArgumentException('The cut-off date must be YYYY-MM-DD.');
        $dup = $pdo->prepare("SELECT `id` FROM `company_mailboxes` WHERE `address` = ? AND `id` <> ?");
        $dup->execute([$address, $id]);
        if ($dup->fetchColumn()) throw new \InvalidArgumentException('A company mailbox with this address already exists.');

        $blob = json_encode(ccrm_encrypt_config_secrets($settings, ccrm_email_secret_keys()), JSON_UNESCAPED_UNICODE);
        $active = array_key_exists('isActive', $input) ? ($input['isActive'] ? 1 : 0) : 1;
        if ($stored) {
            $pdo->prepare(
                "UPDATE `company_mailboxes` SET `name` = ?, `address` = ?, `settings_json` = ?, `is_active` = ?, `owner_user_id` = ?, `backfill_since` = ? WHERE `id` = ?"
            )->execute([$name, $address, $blob, $active, $owner !== '' ? $owner : null, $since !== '' ? $since : null, $id]);
            $audit = 'updated';
        } else {
            $id = 'cmb-' . bin2hex(random_bytes(6));
            $pdo->prepare(
                "INSERT INTO `company_mailboxes` (`id`, `name`, `address`, `settings_json`, `is_active`, `owner_user_id`, `backfill_since`) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )->execute([$id, $name, $address, $blob, $active, $owner !== '' ? $owner : null, $since !== '' ? $since : null]);
            $audit = 'added';
        }
        ccrm_audit_log($pdo, $admin, 'company_mailbox.save', 'Company mailbox ' . $address . ' ' . $audit);
        $q = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `id` = ?");
        $q->execute([$id]);
        echo json_encode(['success' => true, 'mailbox' => ccrm_company_mailbox_public($q->fetch(PDO::FETCH_ASSOC), [])]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Unknown action.']);
} catch (\InvalidArgumentException $e) {
    // A validation message the admin can act on (a private host, a bad port, a missing field).
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
} catch (\Throwable $e) {
    if (function_exists('ccrm_log_exception')) ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'The request failed.']);
}
