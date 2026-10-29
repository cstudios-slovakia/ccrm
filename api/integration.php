<?php
/**
 * CCRM machine API v1 — front controller (docs/WAAI-INTEGRATION.md §4.1).
 *
 * Token-authenticated, sessionless, JSON only. `.htaccess` sends every `/api/v1/...` request here;
 * the route is read from REQUEST_URI. WAAI's `ai-worker` is the only expected caller.
 *
 * Order of checks: token -> network -> scope -> rate limit -> body size -> content type -> route.
 * An anonymous caller therefore only ever sees 401. No PHP session is started and no cookie is set;
 * bodies and query strings are never logged.
 */

@ini_set('display_errors', '0');
@ini_set('log_errors', '1');
error_reporting(E_ALL);

$ccrmIntStarted = microtime(true);
$ccrmIntRequestId = bin2hex(random_bytes(8));

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Request-Id: ' . $ccrmIntRequestId);

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    $configFile = dirname(__DIR__) . '/public/config.php';
}
if (file_exists($configFile)) {
    require_once $configFile;
}
require_once __DIR__ . '/integration_lib.php';
require_once __DIR__ . '/integration_directory.php';
require_once __DIR__ . '/integration_tasks.php';

/**
 * Documented routes: [method, path pattern, handler, scope]. Scope null = any valid token, an array =
 * any one of them. The pattern's capture groups reach the handler as `$req['params']`. A path that
 * matches with another method is a 405, not a 404.
 */
$ccrmIntRoutes = [
    ['GET', '#^ping$#', 'ccrm_int_handle_ping', null],
    ['GET', '#^users$#', 'ccrm_int_handle_users', 'users:read'],
    ['PUT', '#^tasks/external/([^/]+)$#', 'ccrm_int_handle_task_push', 'tasks:push'],
    ['GET', '#^tasks/feed$#', 'ccrm_int_handle_task_feed', 'tasks:pull'],
    ['POST', '#^tasks/lookup$#', 'ccrm_int_handle_task_lookup', ['tasks:push', 'tasks:pull']],
    ['POST', '#^tasks/([^/]+)/complete$#', 'ccrm_int_handle_task_complete', 'tasks:pull'],
];

function ccrm_int_handle_ping(\PDO $pdo, array $client, array $req): array {
    return [200, [
        'client' => $client['code'],
        'scopes' => $client['scopes'],
        'server_time' => date('c'),
    ]];
}

/** The part of the request path after `/api/v1/` (empty when the request is not under it). */
function ccrm_int_route_path(): string {
    $path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    if (!preg_match('#/api/v1(?:/(.*))?$#', $path, $m)) {
        return '';
    }
    return trim(implode('/', array_map('rawurldecode', explode('/', $m[1] ?? ''))), '/');
}

/** A request path made safe for the one-line log: encoded as received, printable ASCII only. */
function ccrm_int_log_path(): string {
    $path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    return substr((string)preg_replace('/[^\x21-\x7e]/', '?', $path), 0, 120);
}

$ccrmIntStatus = 500;
$ccrmIntBody = ['error' => ['code' => 'server_error', 'message' => 'Internal error.', 'fields' => new stdClass(), 'request_id' => $ccrmIntRequestId]];
$ccrmIntHeaders = [];
$ccrmIntLog = ['client' => '-', 'token' => '-'];

try {
    $pdo = function_exists('get_db_connection') ? get_db_connection() : null;
    if (!$pdo) {
        throw new RuntimeException('Database connection not established');
    }
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $path = ccrm_int_route_path();

    [$token, $client] = ccrm_int_authenticate($pdo);
    $ccrmIntLog = ['client' => $client['code'], 'token' => $token['prefix']];
    ccrm_int_check_network($client);

    $route = null;
    $allowed = [];
    $params = [];
    foreach ($ccrmIntRoutes as $candidate) {
        if (preg_match($candidate[1], $path, $m)) {
            if ($candidate[0] === $method) {
                $route = $candidate;
                $params = array_slice($m, 1);
                break;
            }
            $allowed[] = $candidate[0];
        }
    }
    if ($route !== null) {
        ccrm_int_check_scope($client, $route[3]);
    }
    ccrm_int_rate_limit($pdo, $token['prefix']);
    ccrm_int_record_usage($pdo, $token);
    $raw = ccrm_int_read_body();

    if ($route === null) {
        if ($allowed !== []) {
            ccrm_int_fail(405, 'method_not_allowed', 'Method not allowed.', [], ['Allow' => implode(', ', array_unique($allowed))]);
        }
        ccrm_int_fail(404, 'route_not_found', 'No such API route.');
    }

    [$ccrmIntStatus, $ccrmIntBody] = $route[2]($pdo, $client, [
        'method' => $method,
        'path' => $path,
        'raw' => $raw,
        'params' => $params,
        'query' => $_GET,
    ]);
} catch (CcrmIntApiException $e) {
    $ccrmIntStatus = $e->status;
    $ccrmIntHeaders = $e->headers;
    $ccrmIntBody = ['error' => [
        'code' => $e->errorCode,
        'message' => $e->getMessage(),
        'fields' => (object)$e->fields,
        'request_id' => $ccrmIntRequestId,
    ]];
} catch (Throwable $e) {
    // The message can carry SQL or paths: log it, never send it.
    error_log('[ccrm integration] req=' . $ccrmIntRequestId . ' ' . get_class($e) . ': ' . $e->getMessage());
}

http_response_code($ccrmIntStatus);
foreach ($ccrmIntHeaders as $name => $value) {
    header($name . ': ' . $value);
}
echo json_encode($ccrmIntBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);

// One line per request: never the token, the query string or the body.
error_log(sprintf(
    '[ccrm integration] req=%s client=%s token=%s %s %s status=%d ms=%d',
    $ccrmIntRequestId,
    $ccrmIntLog['client'],
    $ccrmIntLog['token'],
    preg_replace('/[^A-Z]/', '', strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? ''))),
    ccrm_int_log_path(),
    $ccrmIntStatus,
    (int)round((microtime(true) - $ccrmIntStarted) * 1000)
));
