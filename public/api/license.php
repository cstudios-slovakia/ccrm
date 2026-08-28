<?php
/**
 * Licence status and administration endpoint.
 *
 * GET  ?action=status         — current licence state. Any authenticated user;
 *                               non-admins get the same state minus the key.
 * POST {action:"activate"}    — admin only. Sends a key (or an offline token) to
 *                               the licence server and stores the signed answer.
 * POST {action:"refresh"}     — admin only. Force an immediate re-check.
 * POST {action:"remove"}      — admin only. Forget the stored licence.
 *
 * Nothing here can disable the CRM. The worst outcome of every branch below is
 * that the licence reads as missing or expired, which shows a banner and blocks
 * `php ccrm update` — never a user's access to their own data.
 *
 * All user-facing wording is the frontend's job: this endpoint answers in stable
 * status/error CODES (see src/utils/license.ts) so the three interface languages
 * stay in one place and a server message can never leak untranslated into the UI.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
ccrm_send_cors('GET, POST, OPTIONS');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    $configFile = dirname(__DIR__) . '/public/config.php';
}
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'not_installed']);
    exit;
}
require_once $configFile;
require_once __DIR__ . '/license_client.php';

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    error_log('[ccrm licence] DB connection failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'db_unavailable']);
    exit;
}

// The licences table may not exist yet on an install that has not run a
// migration since this feature shipped. Creating it here (idempotent, from the
// shared schema) keeps the endpoint from 500-ing on exactly the installs the
// feature is meant to reach.
try {
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    error_log('[ccrm licence] schema check failed: ' . $e->getMessage());
}

/**
 * Public shape of the licence state.
 *
 * The full licence key is NEVER returned — not even to an admin. It is a bearer
 * credential for the vendor's server, the admin already has their copy from the
 * purchase, and an endpoint that hands it back turns any XSS into licence theft.
 * `keyMasked` is enough to confirm which key is installed.
 */
function ccrm_license_public_state(\PDO $pdo, bool $isAdmin): array {
    $state = ccrm_license_state($pdo);
    if (!$isAdmin) {
        // A viewer sees that the licence is lapsing (they get the banner too) but
        // nothing about the commercial relationship behind it.
        unset($state['keyMasked'], $state['customer'], $state['plan'], $state['lastError']);
        $state['keyMasked'] = '';
    }
    return $state;
}

/**
 * Activation rate limit.
 *
 * Two ceilings on purpose: a per-IP one that stops one workstation grinding
 * keys, and a global one so a set of compromised admin sessions cannot turn this
 * install into a distributed guesser against the vendor's server.
 */
function ccrm_license_rate_limited(\PDO $pdo, string $ip): bool {
    try {
        $pdo->exec("DELETE FROM `license_attempts` WHERE `created_at` < (NOW() - INTERVAL 1 DAY)");
        $perIp = $pdo->prepare(
            "SELECT COUNT(*) FROM `license_attempts` WHERE `ip` = ? AND `created_at` > (NOW() - INTERVAL 15 MINUTE)"
        );
        $perIp->execute([$ip]);
        if ((int) $perIp->fetchColumn() >= 10) {
            return true;
        }
        $global = $pdo->query(
            "SELECT COUNT(*) FROM `license_attempts` WHERE `created_at` > (NOW() - INTERVAL 60 MINUTE)"
        );
        return $global && (int) $global->fetchColumn() >= 40;
    } catch (\Throwable $e) {
        // A broken ledger must not block a legitimate activation.
        error_log('[ccrm licence] rate-limit check failed: ' . $e->getMessage());
        return false;
    }
}

function ccrm_license_record_attempt(\PDO $pdo, string $ip, ?string $userId, string $outcome): void {
    try {
        $pdo->prepare("INSERT INTO `license_attempts` (`ip`, `user_id`, `outcome`) VALUES (?, ?, ?)")
            ->execute([$ip, $userId, substr($outcome, 0, 30)]);
    } catch (\Throwable $e) {
        error_log('[ccrm licence] could not record an activation attempt: ' . $e->getMessage());
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $user = ccrm_require_auth();
    $isAdmin = (($user['role'] ?? '') === 'admin');

    // Opportunistic background re-check, throttled inside ccrm_license_refresh:
    // at most one call every CCRM_LICENSE_REFRESH_HOURS across all requests. A
    // failure is absorbed — the cached claim stays in charge.
    try {
        ccrm_license_refresh($pdo, false);
    } catch (\Throwable $e) {
        error_log('[ccrm licence] background refresh failed: ' . $e->getMessage());
    }

    echo json_encode([
        'success' => true,
        'license' => ccrm_license_public_state($pdo, $isAdmin),
    ]);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'method_not_allowed']);
    exit;
}

$user = ccrm_require_admin();
$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

$raw = file_get_contents('php://input');
$payload = json_decode((string) $raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'bad_request']);
    exit;
}

$action = isset($payload['action']) && is_string($payload['action']) ? $payload['action'] : '';

if ($action === 'activate') {
    if (!ccrm_license_is_configured()) {
        echo json_encode([
            'success' => false,
            'error'   => 'not_configured',
            'license' => ccrm_license_public_state($pdo, true),
        ]);
        exit;
    }
    if (ccrm_license_rate_limited($pdo, $ip)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'rate_limited']);
        exit;
    }

    // Cap the input before it reaches any parsing: a licence key is ~24
    // characters and even a signed offline token stays well under 8 KB.
    $input = trim((string) ($payload['key'] ?? ''));
    if ($input === '' || strlen($input) > 8192) {
        ccrm_license_record_attempt($pdo, $ip, $user['id'] ?? null, 'malformed_key');
        echo json_encode(['success' => false, 'error' => 'malformed_key']);
        exit;
    }

    // One field, two shapes. A licence key is alphanumeric with separators; a
    // token minted for an offline install is two base64url segments joined by a
    // dot. Telling them apart here means the customer pastes whatever the vendor
    // sent them into the same box and it simply works.
    $looksLikeToken = (substr_count($input, '.') === 1 && strlen($input) > 80);

    $result = $looksLikeToken
        ? ccrm_license_import_token($pdo, $input, $user['id'] ?? null)
        : ccrm_license_activate($pdo, $input, $user['id'] ?? null);

    ccrm_license_record_attempt($pdo, $ip, $user['id'] ?? null, $result['ok'] ? 'ok' : (string) $result['error']);

    if ($result['ok']) {
        ccrm_audit_log($pdo, $user, 'license.activate',
            ($looksLikeToken ? 'Imported an offline licence token' : 'Activated licence ')
            . ccrm_license_mask_key((string) (ccrm_license_row($pdo)['license_key'] ?? '')));
    } else {
        ccrm_audit_log($pdo, $user, 'license.activate_failed', (string) $result['error']);
    }

    echo json_encode([
        'success' => $result['ok'],
        'error'   => $result['ok'] ? null : $result['error'],
        'license' => ccrm_license_public_state($pdo, true),
    ]);
    exit;
}

if ($action === 'refresh') {
    if (ccrm_license_rate_limited($pdo, $ip)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'rate_limited']);
        exit;
    }
    ccrm_license_record_attempt($pdo, $ip, $user['id'] ?? null, 'refresh');
    $result = ccrm_license_refresh($pdo, true);
    echo json_encode([
        'success' => $result['ok'],
        'error'   => $result['ok'] ? null : $result['error'],
        'license' => ccrm_license_public_state($pdo, true),
    ]);
    exit;
}

if ($action === 'remove') {
    try {
        ccrm_license_remove($pdo);
        ccrm_audit_log($pdo, $user, 'license.remove', 'Licence key removed from this installation');
        echo json_encode(['success' => true, 'license' => ccrm_license_public_state($pdo, true)]);
    } catch (\Throwable $e) {
        error_log('[ccrm licence] could not remove the licence: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'store_failed']);
    }
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'error' => 'unknown_action']);
