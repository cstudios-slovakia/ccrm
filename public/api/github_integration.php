<?php
/**
 * Settings -> Integrations -> GitHub. Session-authenticated, administrators only.
 *
 *   GET                        -> { success, webhookUrl, hasSecret }
 *   POST { action: generate }  -> { success, secret }   a new random secret (32 bytes, hex)
 *
 * The secret is the key GitHub signs every delivery with (api/github_webhook.php verifies it). It is
 * stored encrypted at rest in system_settings GITHUB_WEBHOOK_SECRET, which no sync.php payload carries
 * (settings are sent by explicit key), and is returned exactly once, in the response that created it.
 * `hasSecret` is all a later GET says. Generating a new one replaces the old: GitHub must be given the
 * new one before deliveries verify again.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/schema.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
ccrm_send_cors('GET, POST, OPTIONS');

$actor = ccrm_require_admin();

function ccrm_github_int_reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode(['success' => $status < 400] + $body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $pdo = get_db_connection();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'GITHUB_WEBHOOK_SECRET' LIMIT 1");
        $stmt->execute();
        $stored = $stmt->fetchColumn();
        ccrm_github_int_reply(200, [
            'webhookUrl' => rtrim(ccrm_app_base_url($pdo), '/') . '/api/github_webhook.php',
            'hasSecret' => is_string($stored) && $stored !== '',
        ]);
    }

    if ($method === 'POST') {
        $body = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($body) || ($body['action'] ?? '') !== 'generate') {
            ccrm_github_int_reply(400, ['message' => 'Unknown action.']);
        }
        $secret = bin2hex(random_bytes(32));
        $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES ('GITHUB_WEBHOOK_SECRET', ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        )->execute([ccrm_encrypt_secret($secret)]);
        ccrm_audit_log($pdo, ['id' => (string)($actor['id'] ?? ''), 'email' => (string)($actor['email'] ?? '')], 'github.secret_generate', 'Generated a new GitHub webhook secret');
        ccrm_github_int_reply(200, ['secret' => $secret]);
    }

    ccrm_github_int_reply(405, ['message' => 'Method Not Allowed']);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_github_int_reply(500, ['message' => 'Server error.']);
}
