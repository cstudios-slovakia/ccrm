<?php
/**
 * GitHub webhook: POST /api/github_webhook.php. The one endpoint of the GitHub integration that takes
 * no session; the HMAC signature of the body is the authentication.
 *
 *   ping          -> 200 { ok: true }
 *   push          -> 200 { ok: true, matchedProjects: n }   (n = 0 is fine: an unpaired repository)
 *   anything else -> 202 { ok: true, ignored: true }
 *
 * Refused: not POST 405, not application/json 415, over 5 MB 413, no secret configured / no or wrong
 * X-Hub-Signature-256 401 (one generic message, never the cause), table not there yet 503, database
 * error 500. The secret (system_settings GITHUB_WEBHOOK_SECRET, encrypted at rest, set in Settings ->
 * Integrations -> GitHub through api/github_integration.php) and the signature are never logged or
 * echoed. A push counts when it is to a branch (not a tag, not a deletion) of a repository a
 * non-archived project is paired with; it is stored once per (SHA-256 of the body, project): a
 * redelivery has the same body, and a replay of a signed body under a new X-GitHub-Delivery (which the
 * signature does not cover) is ignored too. `pushed_at` is the time this server received the push. Parsing and matching: api/github_pushes.php. No DDL here.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/github_pushes.php';

const CCRM_GITHUB_MAX_BODY = 5 * 1024 * 1024;

header('Content-Type: application/json');
header('Cache-Control: no-store');

function ccrm_github_reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    ccrm_github_reply(405, ['ok' => false, 'message' => 'Method Not Allowed']);
}

$contentType = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''))[0]));
if ($contentType !== 'application/json') {
    ccrm_github_reply(415, ['ok' => false, 'message' => 'Unsupported Media Type']);
}

// Never read more than the limit: the length header can be absent (chunked) or a lie.
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > CCRM_GITHUB_MAX_BODY) {
    ccrm_github_reply(413, ['ok' => false, 'message' => 'Payload Too Large']);
}
$in = fopen('php://input', 'r');
$rawBody = $in ? (string)stream_get_contents($in, CCRM_GITHUB_MAX_BODY + 1) : '';
if (strlen($rawBody) > CCRM_GITHUB_MAX_BODY) {
    ccrm_github_reply(413, ['ok' => false, 'message' => 'Payload Too Large']);
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_github_reply(503, ['ok' => false, 'message' => 'Service Unavailable']);
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'GITHUB_WEBHOOK_SECRET' LIMIT 1");
    $stmt->execute();
    $stored = $stmt->fetchColumn();
    $secret = ccrm_github_readable_secret($stored);
} catch (\Throwable $e) {
    // Before the signature is checked nothing of the (unauthenticated) request is stored.
    error_log('[github_webhook] database unavailable: ' . get_class($e));
    ccrm_github_reply(500, ['ok' => false, 'message' => 'Server error']);
}

$signature = (string)($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
if (!ccrm_github_signature_valid($rawBody, $secret, $signature)) {
    // Failed attempts only are counted; a valid delivery is never throttled. The ledger table is never
    // created here (no DDL on an unauthenticated path): while it is missing the throttle fails open.
    try {
        if (ccrm_rate_limit_exceeded($pdo, 'github_badsig', (string)($_SERVER['REMOTE_ADDR'] ?? ''), 30, 900, false)) {
            ccrm_github_reply(429, ['ok' => false, 'message' => 'Too Many Requests']);
        }
    } catch (\Throwable $e) {
        // fail open
    }
    ccrm_github_reply(401, ['ok' => false, 'message' => 'Unauthorized']);
}

$event = (string)($_SERVER['HTTP_X_GITHUB_EVENT'] ?? '');
if ($event === 'ping') {
    ccrm_github_reply(200, ['ok' => true]);
}
if ($event !== 'push') {
    ccrm_github_reply(202, ['ok' => true, 'ignored' => true]);
}

// Reference only (the signature does not cover it): the row's identity is the hash of the body.
$deliveryHeader = (string)($_SERVER['HTTP_X_GITHUB_DELIVERY'] ?? '');
$deliveryId = preg_match('/\A[A-Za-z0-9-]{8,64}\z/', $deliveryHeader) ? $deliveryHeader : null;
$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    ccrm_github_reply(400, ['ok' => false, 'message' => 'Bad Request']);
}

$push = ccrm_github_parse_push($payload, gmdate('Y-m-d H:i:s'));
if ($push === null) {
    // A tag, a deletion or a payload without a branch: nothing to count.
    ccrm_github_reply(200, ['ok' => true, 'matchedProjects' => 0]);
}

try {
    if (!ccrm_table_exists($pdo, 'project_pushes')
        || !ccrm_column_exists($pdo, 'projects', 'github_repo')
        || !ccrm_column_exists($pdo, 'projects', 'github_branch')) {
        ccrm_github_reply(503, ['ok' => false, 'message' => 'The database is being updated. Try again in a moment.']);
    }
    $projectIds = ccrm_github_match_projects(ccrm_github_projects_for_repo($pdo, $push['repo']), $push);
    if ($projectIds) {
        ccrm_github_store_push($pdo, hash('sha256', $rawBody), $deliveryId, $push, $projectIds);
    }
} catch (\Throwable $e) {
    // Not ccrm_log_exception(): it would store the request body (commit authors, e-mails) in error_logs.
    error_log('[github_webhook] ' . get_class($e) . ': ' . $e->getMessage());
    ccrm_github_reply(500, ['ok' => false, 'message' => 'Server error']);
}

ccrm_github_reply(200, ['ok' => true, 'matchedProjects' => count($projectIds)]);
