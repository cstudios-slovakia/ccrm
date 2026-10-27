<?php
/**
 * Chrome time tracker HTTP API.
 *
 * Device calls (pair, running, start, stop, recent, projects, tasks, activity,
 * unsortedCount, capture, and GET rules with a bearer) authenticate with
 * `Authorization: Bearer ttk_…` and never with the session cookie.
 * Management calls (code, devices, revoke, unsorted, assign, dismiss, rules,
 * projectSearch) authenticate with the session and never with a device key.
 *
 * CORS reflects `chrome-extension://<id>` only. Never `*`.
 *
 * Contract: docs/.time-tracking-coord/phase-5.md
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/time_tracker_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if (preg_match('#^chrome-extension://[a-p]{32}$#', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, X-CCRM-Extension-Version');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Max-Age: 600');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function ccrm_ttx_out(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload + ['success' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ccrm_ttx_fail(string $code, int $status = 400, array $extra = []): void {
    http_response_code($status);
    echo json_encode(['success' => false, 'code' => $code] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_ttx_fail('not_installed', 503);
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_ttx_fail('database_unavailable', 503);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);
if (!is_array($body)) {
    $body = [];
}
$action = (string)($_GET['action'] ?? ($body['action'] ?? ''));
$authHeader = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '')));
$bearer = '';
if (preg_match('/^Bearer\s+(ttk_[a-f0-9]{64})$/i', $authHeader, $m)) {
    $bearer = $m[1];
}
$extVersion = (string)($_SERVER['HTTP_X_CCRM_EXTENSION_VERSION'] ?? ($body['version'] ?? ''));

$deviceActions = ['pair', 'running', 'start', 'stop', 'recent', 'projects', 'tasks', 'activity', 'unsortedCount', 'capture'];
$rulesAsDevice = $action === 'rules' && $bearer !== '' && $method === 'GET';

try {
    $settings = ccrm_tt_load_settings($pdo);

    if ($action === 'pair' || in_array($action, $deviceActions, true) || $rulesAsDevice) {
        if ($action === 'pair') {
            if ($method !== 'POST') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
            if (ccrm_rate_limit_exceeded($pdo, 'tt_pair', hash('sha256', $ip), 10, 600)) {
                header('Retry-After: 600');
                ccrm_ttx_fail('rate_limited', 429);
            }
            if (!ccrm_ttx_extension_on($settings)) {
                ccrm_ttx_fail('extension_disabled', 403);
            }
            $paired = ccrm_ttx_pair($pdo, (string)($body['code'] ?? ''), $body);
            if (!$paired['ok']) {
                ccrm_ttx_fail($paired['code'], (int)($paired['status'] ?? 401));
            }
            $owner = ccrm_ttx_user($pdo, $paired['userId']);
            ccrm_audit_log($pdo, $owner, 'time_tracker.pair', 'Paired browser ' . $paired['deviceId']);
            ccrm_ttx_out([
                'deviceKey' => $paired['deviceKey'],
                'deviceId' => $paired['deviceId'],
                'user' => $paired['user'],
                'ccrmUrl' => ccrm_ttx_public_url(),
            ]);
        }

        if ($bearer === '') {
            ccrm_ttx_fail('not_paired', 401);
        }
        $device = ccrm_ttx_device_by_key($pdo, $bearer);
        if (!$device) {
            ccrm_ttx_fail('not_paired', 401);
        }
        ccrm_ttx_touch($pdo, (string)$device['id'], $extVersion !== '' ? $extVersion : null);
        $user = ccrm_ttx_user($pdo, (string)$device['user_id']);
        if (!$user) {
            ccrm_ttx_fail('not_paired', 401);
        }
        if (!ccrm_ttx_extension_on($settings)) {
            ccrm_ttx_fail('extension_disabled', 403);
        }
        $scope = ccrm_read_scope($pdo, $user);
        if (!ccrm_can($scope, 'time_tracking')) {
            ccrm_ttx_fail('forbidden', 403);
        }
        $userId = (string)$user['id'];
        $viewer = ccrm_ttx_viewer($scope, $userId);
        $rules = ccrm_ttx_load_rules($pdo, $userId);

        if ($action === 'rules') {
            ccrm_ttx_out(ccrm_ttx_rules_payload($rules, $settings));
        }
        if ($action === 'running') {
            if ($method !== 'GET') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            $row = ccrm_ttx_running($pdo, $userId);
            ccrm_ttx_out(['entry' => $row ? ccrm_ttx_entry($pdo, $row['id'], $viewer) : null]);
        }
        if ($action === 'recent') {
            if ($method !== 'GET') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            ccrm_ttx_out(ccrm_ttx_recent($pdo, $userId, $viewer));
        }
        if ($action === 'projects') {
            if ($method !== 'GET') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            $host = isset($_GET['host']) ? (string)$_GET['host'] : null;
            ccrm_ttx_out(['projects' => ccrm_ttx_search_projects($pdo, $userId, (string)($_GET['q'] ?? ''), $host, $rules)]);
        }
        if ($action === 'tasks') {
            if ($method !== 'GET') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            $projectId = ccrm_tt_nullable_id($_GET['projectId'] ?? null);
            if ($projectId === null) {
                ccrm_ttx_fail('project_required', 422);
            }
            ccrm_ttx_out(['tasks' => ccrm_ttx_tasks($pdo, $scope, $projectId)]);
        }
        if ($action === 'unsortedCount') {
            if ($method !== 'GET') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            ccrm_ttx_out(['count' => ccrm_ttx_unsorted_count($pdo, $userId)]);
        }
        if ($action === 'start') {
            if ($method !== 'POST') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            $result = ccrm_ttx_start($pdo, $user, $device, $body, $settings, $scope);
            if (!$result['ok']) {
                ccrm_ttx_fail($result['code'], (int)$result['status'], isset($result['entry']) ? ['entry' => $result['entry']] : []);
            }
            ccrm_ttx_out(['entry' => $result['entry'], 'stopped' => $result['stopped']], 201);
        }
        if ($action === 'stop') {
            if ($method !== 'POST') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            $result = ccrm_ttx_stop($pdo, $user, $device, $body, $settings, $scope);
            if (!$result['ok']) {
                ccrm_ttx_fail($result['code'], (int)$result['status']);
            }
            ccrm_ttx_out(['entry' => $result['entry']]);
        }
        if ($action === 'activity') {
            if ($method !== 'POST') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            if (empty($rules['enabled']) || !ccrm_ttx_capture_allowed($settings)) {
                ccrm_ttx_fail('capture_disabled', 403);
            }
            $blocks = is_array($body['blocks'] ?? null) ? $body['blocks'] : [];
            ccrm_ttx_out(ccrm_ttx_store_activity($pdo, $userId, (string)$device['id'], $blocks, $rules));
        }
        if ($action === 'capture') {
            if ($method !== 'POST') {
                ccrm_ttx_fail('method_not_allowed', 405);
            }
            $saved = ccrm_ttx_save_rules($pdo, $userId, ['enabled' => (bool)($body['enabled'] ?? false)]);
            ccrm_ttx_out(ccrm_ttx_rules_payload($saved, $settings));
        }
        ccrm_ttx_fail('bad_request', 400);
    }

    // Session management. A device key is not a substitute for being signed in.
    $sessionUser = ccrm_require_auth();
    $scope = ccrm_read_scope($pdo, $sessionUser);
    if (!ccrm_can($scope, 'time_tracking')) {
        ccrm_ttx_fail('forbidden', 403);
    }
    $userId = (string)$sessionUser['id'];
    $canEdit = ccrm_can($scope, 'time_tracking', 'edit');

    if ($action === 'code') {
        if ($method !== 'POST' || !$canEdit) {
            ccrm_ttx_fail($canEdit ? 'method_not_allowed' : 'forbidden', $canEdit ? 405 : 403);
        }
        if (!ccrm_ttx_extension_on($settings)) {
            ccrm_ttx_fail('extension_disabled', 403);
        }
        if (ccrm_rate_limit_exceeded($pdo, 'tt_code', hash('sha256', $userId), 30, 3600)) {
            ccrm_ttx_fail('rate_limited', 429);
        }
        $issued = ccrm_ttx_issue_code($pdo, $userId);
        ccrm_ttx_out(['code' => $issued['code'], 'expiresAt' => $issued['expiresAt']]);
    }
    if ($action === 'devices') {
        if ($method !== 'GET') {
            ccrm_ttx_fail('method_not_allowed', 405);
        }
        ccrm_ttx_out(['devices' => ccrm_ttx_list_devices($pdo, $userId), 'currentVersion' => CCRM_TT_EXT_VERSION]);
    }
    if ($action === 'revoke') {
        if ($method !== 'POST' || !$canEdit) {
            ccrm_ttx_fail($canEdit ? 'method_not_allowed' : 'forbidden', $canEdit ? 405 : 403);
        }
        $deviceId = ccrm_tt_nullable_id($body['deviceId'] ?? null);
        if ($deviceId === null || !ccrm_ttx_revoke($pdo, $userId, $deviceId)) {
            ccrm_ttx_fail('not_found', 404);
        }
        ccrm_audit_log($pdo, $sessionUser, 'time_tracker.revoke', 'Revoked browser ' . $deviceId);
        ccrm_ttx_out(['revoked' => true]);
    }
    if ($action === 'unsorted') {
        if ($method !== 'GET') {
            ccrm_ttx_fail('method_not_allowed', 405);
        }
        ccrm_ttx_out(ccrm_ttx_unsorted($pdo, $userId));
    }
    if ($action === 'assign') {
        if ($method !== 'POST' || !$canEdit) {
            ccrm_ttx_fail($canEdit ? 'method_not_allowed' : 'forbidden', $canEdit ? 405 : 403);
        }
        $ids = is_array($body['ids'] ?? null) ? $body['ids'] : [];
        $result = ccrm_ttx_assign($pdo, $sessionUser, $scope, $ids, ccrm_tt_nullable_id($body['projectId'] ?? null), $settings);
        if (!$result['ok']) {
            ccrm_ttx_fail($result['code'], (int)$result['status']);
        }
        ccrm_ttx_out(['assigned' => $result['assigned'], 'entries' => $result['entries']]);
    }
    if ($action === 'dismiss') {
        if ($method !== 'POST' || !$canEdit) {
            ccrm_ttx_fail($canEdit ? 'method_not_allowed' : 'forbidden', $canEdit ? 405 : 403);
        }
        $ids = is_array($body['ids'] ?? null) ? $body['ids'] : [];
        ccrm_ttx_out(['dismissed' => ccrm_ttx_dismiss($pdo, $userId, $ids)]);
    }
    if ($action === 'rules') {
        if ($method === 'GET') {
            ccrm_ttx_out(ccrm_ttx_rules_payload(ccrm_ttx_load_rules($pdo, $userId), $settings));
        }
        if ($method !== 'POST' || !$canEdit) {
            ccrm_ttx_fail($canEdit ? 'method_not_allowed' : 'forbidden', $canEdit ? 405 : 403);
        }
        $saved = ccrm_ttx_save_rules($pdo, $userId, $body);
        ccrm_ttx_out(ccrm_ttx_rules_payload($saved, $settings));
    }
    if ($action === 'projectSearch') {
        if ($method !== 'GET') {
            ccrm_ttx_fail('method_not_allowed', 405);
        }
        ccrm_ttx_out(['projects' => ccrm_ttx_search_projects($pdo, $userId, (string)($_GET['q'] ?? ''), null, ccrm_ttx_load_rules($pdo, $userId))]);
    }
    ccrm_ttx_fail('bad_request', 400);
} catch (\Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    ccrm_log_exception($e);
    ccrm_ttx_fail('save_failed', 500);
}
