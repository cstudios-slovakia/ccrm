<?php
/**
 * Push Subscription Endpoint (PWA & Browser Web Push).
 *
 * GET  — Returns the server's VAPID public key for navigator.serviceWorker.ready.pushManager.subscribe().
 * POST — Registers or updates a browser/device push subscription.
 *        Also handles ?action=test to send an immediate verification notification.
 * DELETE — Removes an active subscription when permissions are revoked or reset.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/webpush.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
ccrm_send_cors('GET, POST, DELETE, OPTIONS');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile) || @filesize($configFile) < 100) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'CCRM is not configured yet.']);
    exit;
}

require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    http_response_code(500);
    ccrm_log_exception($e);
    echo json_encode(['success' => false, 'error' => 'Database connection failed.']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

// Every method needs a signed-in user: a subscription is a URL the server later
// POSTs to, and it receives that user's notifications, so neither may be
// registered, tested or removed anonymously (VULN-10). The identity comes from
// the session only; a userName / userEmail / userId in the body is ignored.
$sessionUser = ccrm_require_auth();
$userId = (string)$sessionUser['id'];
$userName = '';
$userEmail = (string)($sessionUser['email'] ?? '');
try {
    $nameStmt = $pdo->prepare("SELECT `name`, `email` FROM `users` WHERE `id` = ? LIMIT 1");
    $nameStmt->execute([$userId]);
    $userRow = $nameStmt->fetch(PDO::FETCH_ASSOC);
    if ($userRow) {
        $userName = trim((string)($userRow['name'] ?? ''));
        $userEmail = trim((string)($userRow['email'] ?? $userEmail));
    }
} catch (\Throwable $e) {
    ccrm_log_exception($e);
}

// 1. GET: Retrieve VAPID Public Key
if ($method === 'GET' || $action === 'vapid_public_key') {
    try {
        $keys = ccrm_get_or_create_vapid_keys($pdo);
        echo json_encode([
            'success' => true,
            'publicKey' => $keys['publicKey']
        ], JSON_UNESCAPED_SLASHES);
    } catch (\Throwable $e) {
        http_response_code(500);
        ccrm_log_exception($e);
        echo json_encode(['success' => false, 'error' => 'Could not load the push key.']);
    }
    exit;
}

// Read JSON input for POST / DELETE
$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);
if (!is_array($body)) {
    $body = [];
}

// 2. POST: Test Notification Dispatch
if ($method === 'POST' && $action === 'test') {
    // Only ever the caller's own devices, matched on the account id.
    $userTarget = $userId;

    $title = 'CCRM Notification Test';
    $msg = 'Push notifications are working perfectly on this device! 🎉';
    $result = ccrm_send_push_notification($pdo, $userTarget, $title, $msg, '/#tasks', ['type' => 'test']);

    echo json_encode([
        'success' => true,
        'result' => $result
    ]);
    exit;
}

// 3. POST: Register / Update Push Subscription
if ($method === 'POST') {
    $endpoint = trim((string)($body['endpoint'] ?? ''));
    $keys = $body['keys'] ?? [];
    $p256dh = trim((string)($keys['p256dh'] ?? ''));
    $auth = trim((string)($keys['auth'] ?? ''));

    if ($endpoint === '' || $p256dh === '' || $auth === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid push subscription payload (endpoint, p256dh, auth required).']);
        exit;
    }

    $endpointError = ccrm_validate_push_endpoint($endpoint);
    if ($endpointError !== null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $endpointError]);
        exit;
    }

    $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

    $endpointHash = hash('sha256', $endpoint);
    $subId = 'ps_' . bin2hex(random_bytes(16));

    try {
        $stmt = $pdo->prepare(
            "INSERT INTO `push_subscriptions` (`id`, `user_id`, `user_name`, `user_email`, `endpoint`, `endpoint_hash`, `p256dh`, `auth`, `user_agent`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               `user_id` = VALUES(`user_id`),
               `user_name` = VALUES(`user_name`),
               `user_email` = VALUES(`user_email`),
               `p256dh` = VALUES(`p256dh`),
               `auth` = VALUES(`auth`),
               `user_agent` = VALUES(`user_agent`),
               `updated_at` = CURRENT_TIMESTAMP"
        );
        $stmt->execute([
            $subId,
            $userId,
            $userName !== '' ? $userName : null,
            $userEmail !== '' ? $userEmail : null,
            $endpoint,
            $endpointHash,
            $p256dh,
            $auth,
            $userAgent
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Push subscription registered successfully.'
        ]);
    } catch (\Throwable $e) {
        http_response_code(500);
        ccrm_log_exception($e);
        echo json_encode(['success' => false, 'error' => 'Database error.']);
    }
    exit;
}

// 4. DELETE: Unregister Push Subscription
if ($method === 'DELETE') {
    $endpoint = trim((string)($body['endpoint'] ?? ($_GET['endpoint'] ?? '')));
    if ($endpoint === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Endpoint is required to unregister.']);
        exit;
    }

    $endpointHash = hash('sha256', $endpoint);
    try {
        // Own subscriptions only (plus orphans that predate ownership checks).
        $stmt = $pdo->prepare("DELETE FROM `push_subscriptions` WHERE `endpoint_hash` = ? AND (`user_id` = ? OR `user_id` IS NULL)");
        $stmt->execute([$endpointHash, $userId]);

        echo json_encode([
            'success' => true,
            'message' => 'Push subscription removed successfully.'
        ]);
    } catch (\Throwable $e) {
        http_response_code(500);
        ccrm_log_exception($e);
        echo json_encode(['success' => false, 'error' => 'Database error.']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
