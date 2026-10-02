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
    echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

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
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
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
    ccrm_start_session();
    $sessionUser = ccrm_current_user();
    $targetUser = $body['userName'] ?? ($sessionUser['name'] ?? null);
    $targetEmail = $body['userEmail'] ?? ($sessionUser['email'] ?? null);

    $userTarget = $targetUser ?: $targetEmail;
    if (!$userTarget) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Target user name or email is required.']);
        exit;
    }

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

    ccrm_start_session();
    $sessionUser = ccrm_current_user();
    $userId = $sessionUser['id'] ?? null;
    $userName = trim((string)($body['userName'] ?? ($sessionUser['name'] ?? '')));
    $userEmail = trim((string)($body['userEmail'] ?? ($sessionUser['email'] ?? '')));
    $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

    $endpointHash = hash('sha256', $endpoint);
    $subId = 'ps_' . bin2hex(random_bytes(16));

    try {
        $stmt = $pdo->prepare(
            "INSERT INTO `push_subscriptions` (`id`, `user_id`, `user_name`, `user_email`, `endpoint`, `endpoint_hash`, `p256dh`, `auth`, `user_agent`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               `user_id` = COALESCE(VALUES(`user_id`), `user_id`),
               `user_name` = COALESCE(NULLIF(VALUES(`user_name`), ''), `user_name`),
               `user_email` = COALESCE(NULLIF(VALUES(`user_email`), ''), `user_email`),
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
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
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
        $stmt = $pdo->prepare("DELETE FROM `push_subscriptions` WHERE `endpoint_hash` = ?");
        $stmt->execute([$endpointHash]);

        echo json_encode([
            'success' => true,
            'message' => 'Push subscription removed successfully.'
        ]);
    } catch (\Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
