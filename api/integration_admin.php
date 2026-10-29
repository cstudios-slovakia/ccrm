<?php
/**
 * Management of the machine API (Settings -> WhatsApp (WAAI)). Session-authenticated, admin only.
 *
 * GET                           — the WAAI client (or null), its tokens, the scopes that exist, the users.
 * POST {action: save_client}    — create or update the client (config only, never secrets).
 * POST {action: issue_token}    — a new API token. The plaintext is in this one response and nowhere else.
 * POST {action: revoke_token}   — revoke one token by id.
 *
 * The token-authenticated API itself is integration.php.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/integration_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
ccrm_send_cors('GET, POST, OPTIONS');

$actor = ccrm_require_admin();

const CCRM_INT_ADMIN_CODE = 'waai';

function ccrm_int_admin_reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ccrm_int_admin_invalid(array $fields): never {
    ccrm_int_admin_reply(422, ['success' => false, 'message' => 'Validation failed.', 'fields' => (object)$fields]);
}

/** The raw client row for a code, or null. */
function ccrm_int_admin_client_row(\PDO $pdo): ?array {
    $stmt = $pdo->prepare("SELECT * FROM `integration_clients` WHERE `code` = ? LIMIT 1");
    $stmt->execute([CCRM_INT_ADMIN_CODE]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * The status shown for a token, from the stored columns: active, revoked or expired.
 * (Expiry is evaluated here, in PHP, in the same time zone it was written in.)
 */
function ccrm_int_admin_token_state(array $t): string {
    if ($t['revoked_at'] !== null) return 'revoked';
    return ccrm_int_token_expired($t['expires_at']) ? 'expired' : 'active';
}

function ccrm_int_admin_status(\PDO $pdo): array {
    $row = ccrm_int_admin_client_row($pdo);
    $tokens = [];
    if ($row) {
        $stmt = $pdo->prepare(
            "SELECT `id`, `prefix`, `expires_at`, `revoked_at`, `last_used_at`, `last_used_ip`, `created_at`
               FROM `integration_tokens` WHERE `client_id` = ? ORDER BY `created_at` DESC, `id`"
        );
        $stmt->execute([$row['id']]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $t) {
            $tokens[] = [
                'id' => $t['id'],
                'prefix' => $t['prefix'],
                'state' => ccrm_int_admin_token_state($t),
                'created_at' => $t['created_at'],
                'expires_at' => $t['expires_at'],
                'revoked_at' => $t['revoked_at'],
                'last_used_at' => $t['last_used_at'],
                'last_used_ip' => $t['last_used_ip'],
            ];
        }
    }
    $users = $pdo->query("SELECT `id`, `name` FROM `users` ORDER BY `name`")->fetchAll(\PDO::FETCH_ASSOC);
    return [
        'success' => true,
        'client' => $row ? ccrm_int_client_view($row) : null,
        'tokens' => $tokens,
        'scopes_available' => ccrm_int_scopes(),
        'users' => $users,
    ];
}

/** `https://host[:port]` — an origin, nothing else. Plain http only for a local development host. */
function ccrm_int_admin_origin(string $value): ?string {
    $p = parse_url($value);
    if (!is_array($p) || empty($p['host']) || isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment'])) {
        return null;
    }
    if (isset($p['path']) && $p['path'] !== '' && $p['path'] !== '/') {
        return null;
    }
    $scheme = strtolower((string)($p['scheme'] ?? ''));
    $host = strtolower((string)$p['host']);
    $local = $host === 'localhost' || $host === '127.0.0.1' || $host === '[::1]'
        || substr($host, -10) === '.localhost' || substr($host, -13) === '.localtest.me' || $host === 'localtest.me';
    if ($scheme !== 'https' && !($scheme === 'http' && $local)) {
        return null;
    }
    return $scheme . '://' . $host . (isset($p['port']) ? ':' . (int)$p['port'] : '');
}

/** Validates the editable fields. Returns the values ready to store, or answers 422. */
function ccrm_int_admin_validate(\PDO $pdo, array $in): array {
    $errors = [];

    $name = trim((string)($in['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100) {
        $errors['name'] = 'Must be 1–100 characters.';
    }

    $scopes = $in['scopes'] ?? [];
    if (!is_array($scopes) || array_diff(array_map('strval', $scopes), ccrm_int_scopes()) !== []) {
        $errors['scopes'] = 'Unknown scope.';
        $scopes = [];
    }
    // Keep the canonical order so the stored value does not flap.
    $scopes = array_values(array_intersect(ccrm_int_scopes(), array_map('strval', $scopes)));

    $ips = $in['allowed_ips'] ?? [];
    if (!is_array($ips) || count($ips) > 20) {
        $errors['allowed_ips'] = 'Must be a list of at most 20 addresses.';
        $ips = [];
    }
    $ips = array_values(array_unique(array_map(static fn($v) => trim((string)$v), $ips)));
    foreach ($ips as $ip) {
        if (!ccrm_int_valid_ip_range($ip)) {
            $errors['allowed_ips'] = 'Not an IP address or CIDR block: ' . mb_substr($ip, 0, 60);
            break;
        }
    }

    $owners = $in['owner_user_ids'] ?? [];
    if (!is_array($owners) || count($owners) > 50) {
        $errors['owner_user_ids'] = 'Must be a list of at most 50 users.';
        $owners = [];
    }
    $owners = array_values(array_unique(array_map('strval', $owners)));
    if ($owners !== []) {
        $marks = implode(',', array_fill(0, count($owners), '?'));
        $stmt = $pdo->prepare("SELECT `id` FROM `users` WHERE `id` IN ($marks)");
        $stmt->execute($owners);
        if (count($stmt->fetchAll(\PDO::FETCH_COLUMN)) !== count($owners)) {
            $errors['owner_user_ids'] = 'Unknown user.';
        }
    }

    $feedScope = (string)($in['feed_scope'] ?? 'owners');
    if (!in_array($feedScope, ['owners', 'all'], true)) {
        $errors['feed_scope'] = 'Must be "owners" or "all".';
    }

    $embed = trim((string)($in['embed_url'] ?? ''));
    if ($embed !== '') {
        $origin = ccrm_int_admin_origin($embed);
        if ($origin === null) {
            $errors['embed_url'] = 'Must be an https:// address with no path.';
        }
        $embed = $origin ?? '';
    }

    $days = $in['default_deadline_days'] ?? 7;
    if (!is_int($days) && !(is_string($days) && ctype_digit($days))) {
        $errors['default_deadline_days'] = 'Must be a whole number of days.';
        $days = 7;
    }
    $days = (int)$days;
    if ($days < 0 || $days > 365) {
        $errors['default_deadline_days'] = 'Must be between 0 and 365.';
    }

    if ($errors) {
        ccrm_int_admin_invalid($errors);
    }
    return [
        'name' => $name,
        'is_active' => !empty($in['is_active']) ? 1 : 0,
        'scopes' => json_encode($scopes),
        'allowed_ips' => json_encode($ips),
        'require_direct' => !empty($in['require_direct']) ? 1 : 0,
        'owner_user_ids' => json_encode($owners),
        'feed_scope' => $feedScope,
        'embed_url' => $embed !== '' ? $embed : null,
        'default_deadline_days' => $days,
    ];
}

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    error_log('[integration_admin] database connection failed: ' . $e->getMessage());
    ccrm_int_admin_reply(500, ['success' => false, 'message' => 'Database connection failed.']);
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$auditActor = ['id' => (string)($actor['id'] ?? ''), 'email' => (string)($actor['email'] ?? '')];

try {
    if ($method === 'GET') {
        ccrm_int_admin_reply(200, ccrm_int_admin_status($pdo));
    }
    if ($method !== 'POST') {
        header('Allow: GET, POST');
        ccrm_int_admin_reply(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $in = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($in)) {
        ccrm_int_admin_reply(400, ['success' => false, 'message' => 'A JSON body is required.']);
    }
    $action = (string)($in['action'] ?? '');

    if ($action === 'save_client') {
        $v = ccrm_int_admin_validate($pdo, $in);
        $row = ccrm_int_admin_client_row($pdo);
        if ($row) {
            $pdo->prepare(
                "UPDATE `integration_clients` SET `name`=?, `is_active`=?, `scopes`=?, `allowed_ips`=?, `require_direct`=?,
                        `owner_user_ids`=?, `feed_scope`=?, `embed_url`=?, `default_deadline_days`=? WHERE `id`=?"
            )->execute([$v['name'], $v['is_active'], $v['scopes'], $v['allowed_ips'], $v['require_direct'],
                        $v['owner_user_ids'], $v['feed_scope'], $v['embed_url'], $v['default_deadline_days'], $row['id']]);
        } else {
            $pdo->prepare(
                "INSERT INTO `integration_clients` (`id`, `code`, `name`, `is_active`, `scopes`, `allowed_ips`, `require_direct`,
                        `owner_user_ids`, `feed_scope`, `embed_url`, `default_deadline_days`) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
            )->execute(['intc_' . bin2hex(random_bytes(8)), CCRM_INT_ADMIN_CODE, $v['name'], $v['is_active'], $v['scopes'], $v['allowed_ips'],
                        $v['require_direct'], $v['owner_user_ids'], $v['feed_scope'], $v['embed_url'], $v['default_deadline_days']]);
        }
        ccrm_audit_log($pdo, $auditActor, 'integration.client_save', 'Saved integration client ' . CCRM_INT_ADMIN_CODE);
        ccrm_int_admin_reply(200, ccrm_int_admin_status($pdo));
    }

    if ($action === 'issue_token') {
        $row = ccrm_int_admin_client_row($pdo);
        if (!$row) {
            ccrm_int_admin_reply(409, ['success' => false, 'message' => 'Save the connection settings first.']);
        }
        $expires = null;
        $rawExpiry = trim((string)($in['expires_at'] ?? ''));
        if ($rawExpiry !== '') {
            $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $rawExpiry);
            if (!$d || $d->format('Y-m-d') !== $rawExpiry || $d->getTimestamp() <= time()) {
                ccrm_int_admin_invalid(['expires_at' => 'Must be a future date (YYYY-MM-DD).']);
            }
            $expires = $rawExpiry . ' 23:59:59';
        }
        $active = $pdo->prepare("SELECT COUNT(*) FROM `integration_tokens` WHERE `client_id` = ? AND `revoked_at` IS NULL");
        $active->execute([$row['id']]);
        if ((int)$active->fetchColumn() >= 10) {
            ccrm_int_admin_reply(409, ['success' => false, 'message' => 'Revoke an old token first (at most 10 active).']);
        }
        $issued = ccrm_int_token_issue($pdo, $row['id'], $expires);
        ccrm_audit_log($pdo, $auditActor, 'integration.token_issue', 'Issued API token ' . $issued['id'] . ' (' . $issued['prefix'] . ') for ' . CCRM_INT_ADMIN_CODE);
        $status = ccrm_int_admin_status($pdo);
        $status['token'] = $issued['token'];
        $status['token_id'] = $issued['id'];
        ccrm_int_admin_reply(200, $status);
    }

    if ($action === 'revoke_token') {
        $id = (string)($in['id'] ?? '');
        $row = ccrm_int_admin_client_row($pdo);
        $stmt = $pdo->prepare("SELECT `id`, `prefix` FROM `integration_tokens` WHERE `id` = ? AND `client_id` = ?");
        $stmt->execute([$id, $row['id'] ?? '']);
        $tok = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$tok) {
            ccrm_int_admin_reply(404, ['success' => false, 'message' => 'No such token.']);
        }
        $pdo->prepare("UPDATE `integration_tokens` SET `revoked_at` = ? WHERE `id` = ? AND `revoked_at` IS NULL")
            ->execute([date('Y-m-d H:i:s'), $tok['id']]);
        ccrm_audit_log($pdo, $auditActor, 'integration.token_revoke', 'Revoked API token ' . $tok['id'] . ' (' . $tok['prefix'] . ')');
        ccrm_int_admin_reply(200, ccrm_int_admin_status($pdo));
    }

    ccrm_int_admin_reply(400, ['success' => false, 'message' => 'Unknown action.']);
} catch (\Throwable $e) {
    error_log('[integration_admin] ' . get_class($e) . ': ' . $e->getMessage());
    ccrm_int_admin_reply(500, ['success' => false, 'message' => 'Server error.']);
}
