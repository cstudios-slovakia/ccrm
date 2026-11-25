<?php
/**
 * ClickUp webhook receiver: POST /api/clickup_webhook.php.
 *
 * Verifies X-Signature (HMAC-SHA256 hex digest of raw body with ClickUp webhook secret)
 * and immediately re-syncs any CCRM project referencing the affected list or task.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/clickup_lib.php';

const CCRM_CLICKUP_MAX_WEBHOOK_BODY = 5 * 1024 * 1024;

header('Content-Type: application/json');
header('Cache-Control: no-store');

function ccrm_clickup_wh_reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    ccrm_clickup_wh_reply(405, ['ok' => false, 'message' => 'Method Not Allowed']);
}

$contentType = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''))[0]));
if ($contentType !== 'application/json') {
    ccrm_clickup_wh_reply(415, ['ok' => false, 'message' => 'Unsupported Media Type']);
}

if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > CCRM_CLICKUP_MAX_WEBHOOK_BODY) {
    ccrm_clickup_wh_reply(413, ['ok' => false, 'message' => 'Payload Too Large']);
}
$in = fopen('php://input', 'r');
$rawBody = $in ? (string)stream_get_contents($in, CCRM_CLICKUP_MAX_WEBHOOK_BODY + 1) : '';
if (strlen($rawBody) > CCRM_CLICKUP_MAX_WEBHOOK_BODY) {
    ccrm_clickup_wh_reply(413, ['ok' => false, 'message' => 'Payload Too Large']);
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_clickup_wh_reply(503, ['ok' => false, 'message' => 'Service Unavailable']);
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    $cfg = ccrm_clickup_load_config($pdo, true);
} catch (\Throwable $e) {
    error_log('[clickup_webhook] database unavailable: ' . get_class($e));
    ccrm_clickup_wh_reply(500, ['ok' => false, 'message' => 'Server error']);
}

$secret = trim((string)($cfg['webhookSecret'] ?? ''));
$signature = strtolower(trim((string)($_SERVER['HTTP_X_SIGNATURE'] ?? '')));
$validSig = $secret !== '' && $signature !== '' && hash_equals(hash_hmac('sha256', $rawBody, $secret), $signature);
if (!$validSig) {
    try {
        if (ccrm_rate_limit_exceeded($pdo, 'clickup_badsig', (string)($_SERVER['REMOTE_ADDR'] ?? ''), 30, 900, false)) {
            ccrm_clickup_wh_reply(429, ['ok' => false, 'message' => 'Too Many Requests']);
        }
    } catch (\Throwable $e) {
        // fail open
    }
    ccrm_clickup_wh_reply(401, ['ok' => false, 'message' => 'Unauthorized']);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    ccrm_clickup_wh_reply(400, ['ok' => false, 'message' => 'Bad Request']);
}

if (!ccrm_clickup_is_connected($pdo)) {
    ccrm_clickup_wh_reply(202, ['ok' => true, 'ignored' => true]);
}

try {
    if (!ccrm_table_exists($pdo, 'projects')
        || !ccrm_column_exists($pdo, 'projects', 'clickup_lists_json')
        || !ccrm_column_exists($pdo, 'tasks', 'parent_task_id')) {
        ccrm_clickup_wh_reply(503, ['ok' => false, 'message' => 'The database is being updated.']);
    }

    $projectIds = ccrm_clickup_projects_for_webhook($pdo, $cfg, $payload);
    $synced = 0;
    foreach ($projectIds as $pid) {
        $res = ccrm_clickup_sync_project($pdo, $pid, true);
        $synced += (int)($res['synced'] ?? 0);
    }
    ccrm_clickup_wh_reply(200, [
        'ok' => true,
        'matchedProjects' => count($projectIds),
        'synced' => $synced,
    ]);
} catch (\Throwable $e) {
    error_log('[clickup_webhook] sync failed: ' . get_class($e));
    ccrm_clickup_wh_reply(500, ['ok' => false, 'message' => 'Server error']);
}
