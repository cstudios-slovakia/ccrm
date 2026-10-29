<?php
/**
 * Single sign-on for the WhatsApp module (docs/WAAI-INTEGRATION.md §4.7). Session-authenticated.
 *
 *   GET   — what the module needs to know: is the connection set up, and where WAAI lives.
 *   POST  — a sign-in token for the signed-in user: HS256, 60 seconds, audience "waai",
 *           issuer = this CCRM's address, one use (the `jti` is spent on WAAI's side).
 *
 * The browser hands the token to the embedded WAAI page over postMessage; it is never put in a URL
 * and never logged. Needs the `whatsapp` permission (administrators always have it) and is rate
 * limited per user. The secret is the connection's own (Settings -> Integrations -> WhatsApp),
 * separate from the API token.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/integration_lib.php';
require_once __DIR__ . '/integration_tasks.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
ccrm_send_cors('GET, POST, OPTIONS');

if (!function_exists('ccrm_waai_sso_mint')) {

    define('CCRM_WAAI_SSO_LIFETIME', 60);
    define('CCRM_WAAI_SSO_PER_MINUTE', 20);

    function ccrm_waai_sso_b64(string $raw): string {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    /** An HS256 token over `$claims`. */
    function ccrm_waai_sso_mint(array $claims, string $secret): string {
        $head = ccrm_waai_sso_b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $body = ccrm_waai_sso_b64(json_encode($claims, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $head . '.' . $body . '.' . ccrm_waai_sso_b64(hash_hmac('sha256', $head . '.' . $body, $secret, true));
    }

    function ccrm_waai_sso_reply(int $status, array $body): never {
        http_response_code($status);
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** The address of this CCRM as WAAI is told it (`iss`): the pinned or remembered base URL, else this request's. */
    function ccrm_waai_sso_issuer(\PDO $pdo): string {
        $base = ccrm_int_base_url($pdo);
        if ($base !== '') {
            return rtrim($base, '/');
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        return ($https ? 'https' : 'http') . '://' . (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

$sessionUser = ccrm_require_auth();

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    error_log('[waai_sso] database connection failed: ' . $e->getMessage());
    ccrm_waai_sso_reply(500, ['success' => false, 'code' => 'server_error']);
}

try {
    $scope = ccrm_read_scope($pdo, $sessionUser);
    if (!ccrm_can($scope, 'whatsapp', 'view')) {
        ccrm_waai_sso_reply(403, ['success' => false, 'code' => 'forbidden']);
    }

    $stmt = $pdo->prepare("SELECT * FROM `integration_clients` WHERE `code` = 'waai' LIMIT 1");
    $stmt->execute();
    $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: null;
    $configured = $row !== null
        && (int)$row['is_active'] === 1
        && !empty($row['embed_url'])
        && !empty($row['sso_secret']);

    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        ccrm_waai_sso_reply(200, [
            'success' => true,
            'configured' => $configured,
            'embed_url' => $configured ? (string)$row['embed_url'] : null,
            'can_manage' => !empty($scope['isAdmin']),
            'user_id' => (string)($sessionUser['id'] ?? ''),
        ]);
    }
    if ($method !== 'POST') {
        header('Allow: GET, POST');
        ccrm_waai_sso_reply(405, ['success' => false, 'code' => 'method_not_allowed']);
    }
    if (!$configured) {
        ccrm_waai_sso_reply(409, ['success' => false, 'code' => 'not_configured']);
    }

    $userId = (string)($sessionUser['id'] ?? '');
    if ($userId === '' || ccrm_rate_limit_exceeded($pdo, 'waai_sso', $userId, CCRM_WAAI_SSO_PER_MINUTE, 60)) {
        header('Retry-After: 30');
        ccrm_waai_sso_reply(429, ['success' => false, 'code' => 'rate_limited']);
    }

    $secret = ccrm_decrypt_secret((string)$row['sso_secret']);
    if ($secret === '') {
        ccrm_waai_sso_reply(409, ['success' => false, 'code' => 'not_configured']);
    }
    $u = $pdo->prepare("SELECT `id`, `name`, `email` FROM `users` WHERE `id` = ? LIMIT 1");
    $u->execute([$userId]);
    $user = $u->fetch(\PDO::FETCH_ASSOC);
    if (!$user) {
        ccrm_waai_sso_reply(403, ['success' => false, 'code' => 'forbidden']);
    }

    $now = time();
    $token = ccrm_waai_sso_mint([
        'iss' => ccrm_waai_sso_issuer($pdo),
        'aud' => 'waai',
        'sub' => (string)$user['id'],
        'email' => (string)$user['email'],
        'name' => (string)$user['name'],
        'iat' => $now,
        'exp' => $now + CCRM_WAAI_SSO_LIFETIME,
        'jti' => bin2hex(random_bytes(16)),
    ], $secret);
    ccrm_waai_sso_reply(200, ['success' => true, 'token' => $token, 'expires_in' => CCRM_WAAI_SSO_LIFETIME]);
} catch (\Throwable $e) {
    // Never the token or the secret: the class and message of the failure only.
    error_log('[waai_sso] ' . get_class($e) . ': ' . $e->getMessage());
    ccrm_waai_sso_reply(500, ['success' => false, 'code' => 'server_error']);
}
