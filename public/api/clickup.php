<?php
/**
 * ClickUp integration API endpoint. Session-authenticated.
 *
 *   GET  ?action=status                    -> config (masked), connected, counts
 *   GET  ?action=hierarchy[&refresh=1]     -> Spaces -> Folders -> Lists tree
 *   POST { action: "test_connection" }     -> tests unsaved or stored token + lists workspaces
 *   POST { action: "save_config" }         -> saves encrypted config + ensures/deletes webhook
 *   POST { action: "sync_project", projectId } -> mirrors tasks & subtasks for one project
 *   POST { action: "sync_all" }            -> mirrors all active projects with ClickUp lists
 */

require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/clickup_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
ccrm_send_cors('GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function ccrm_clickup_reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode(['success' => $status < 400] + $body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_clickup_reply(503, ['message' => (KOPERNIQ_PRODUCT_NAME . ' is not installed yet.')]);
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_clickup_reply(500, ['message' => 'Database connection failed.']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$rawBody = $method === 'POST' ? (string)file_get_contents('php://input') : '';
$data = $rawBody !== '' ? json_decode($rawBody, true) : [];
if (!is_array($data)) {
    $data = [];
}

$action = trim((string)($_GET['action'] ?? $data['action'] ?? ''));
if ($action === '') {
    ccrm_clickup_reply(400, ['message' => 'Missing action parameter.']);
}

if ($action === 'status') {
    if ($method !== 'GET') {
        ccrm_clickup_reply(405, ['message' => 'Method Not Allowed']);
    }
    ccrm_gate($sessionUser, 'general_config', 'view');
    $cfg = ccrm_clickup_load_config($pdo, true);
    $counts = ccrm_clickup_status_counts($pdo);
    ccrm_clickup_reply(200, [
        'config' => ccrm_clickup_mask_config($cfg),
        'connected' => ccrm_clickup_is_connected($pdo),
        'linkedProjectsCount' => $counts['linkedProjectsCount'],
        'syncedTasksCount' => $counts['syncedTasksCount'],
    ]);
}

if ($action === 'test_connection') {
    if ($method !== 'POST') {
        ccrm_clickup_reply(405, ['message' => 'Method Not Allowed']);
    }
    ccrm_gate($sessionUser, 'general_config', 'edit');
    $cfg = ccrm_clickup_load_config($pdo, true);
    $inToken = trim((string)($data['apiToken'] ?? ''));
    $token = ($inToken !== '' && $inToken !== CCRM_SECRET_MASK) ? $inToken : trim((string)($cfg['apiToken'] ?? ''));
    if ($token === '') {
        ccrm_clickup_reply(400, ['message' => 'Enter a ClickUp API token first.']);
    }
    $probe = ccrm_clickup_test_token($token);
    if (!$probe['ok']) {
        ccrm_clickup_reply(400, ['message' => $probe['error'] ?: 'ClickUp connection failed.']);
    }
    ccrm_clickup_reply(200, [
        'user' => $probe['user'],
        'teams' => $probe['teams'],
    ]);
}

if ($action === 'save_config') {
    if ($method !== 'POST') {
        ccrm_clickup_reply(405, ['message' => 'Method Not Allowed']);
    }
    ccrm_gate($sessionUser, 'general_config', 'edit');
    try {
        $saved = ccrm_clickup_save_config($pdo, $data);
        $webhookRes = ccrm_clickup_ensure_webhook($pdo, $saved);
        $finalCfg = $webhookRes['cfg'] ?? ccrm_clickup_load_config($pdo, true);
        ccrm_audit_log(
            $pdo,
            ['id' => (string)($sessionUser['id'] ?? ''), 'email' => (string)($sessionUser['email'] ?? '')],
            'clickup.config_updated',
            'Updated ClickUp settings (enabled=' . (!empty($finalCfg['enabled']) ? '1' : '0') . ', team=' . ($finalCfg['teamId'] ?: 'none') . ')'
        );
        $counts = ccrm_clickup_status_counts($pdo);
        ccrm_clickup_reply(200, [
            'config' => ccrm_clickup_mask_config($finalCfg),
            'connected' => ccrm_clickup_is_connected($pdo),
            'webhook' => [
                'registered' => !empty($webhookRes['registered']),
                'reason' => (string)($webhookRes['reason'] ?? ''),
            ],
            'linkedProjectsCount' => $counts['linkedProjectsCount'],
            'syncedTasksCount' => $counts['syncedTasksCount'],
        ]);
    } catch (\Throwable $e) {
        ccrm_log_exception($e);
        ccrm_clickup_reply(500, ['message' => 'Failed saving ClickUp configuration.']);
    }
}

if ($action === 'hierarchy') {
    if ($method !== 'GET') {
        ccrm_clickup_reply(405, ['message' => 'Method Not Allowed']);
    }
    ccrm_gate_any($sessionUser, ['projects', 'general_config'], 'view');
    $forceRefresh = !empty($_GET['refresh']);
    $res = ccrm_clickup_fetch_hierarchy($pdo, $forceRefresh);
    if (!$res['ok']) {
        ccrm_clickup_reply(400, ['message' => $res['error'] ?: 'Could not load ClickUp lists.', 'spaces' => []]);
    }
    ccrm_clickup_reply(200, [
        'spaces' => $res['spaces'],
        'cached' => !empty($res['cached']),
    ]);
}

if ($action === 'sync_project') {
    if ($method !== 'POST') {
        ccrm_clickup_reply(405, ['message' => 'Method Not Allowed']);
    }
    ccrm_gate($sessionUser, 'projects', 'view');
    $projectId = trim((string)($data['projectId'] ?? ''));
    if ($projectId === '' || strlen($projectId) > 50) {
        ccrm_clickup_reply(400, ['message' => 'Valid projectId is required.']);
    }
    if (array_key_exists('lists', $data) && is_array($data['lists'])) {
        ccrm_gate($sessionUser, 'projects', 'edit');
        ccrm_heal_clickup_columns($pdo);
        $encoded = ccrm_encode_clickup_lists($data['lists']);
        $pdo->prepare("UPDATE `projects` SET `clickup_lists_json` = ? WHERE `id` = ?")->execute([$encoded, $projectId]);
    }
    $res = ccrm_clickup_sync_project($pdo, $projectId, true);
    if (!$res['ok']) {
        ccrm_clickup_reply(400, ['message' => $res['error'] ?: 'ClickUp sync failed.', 'synced' => 0, 'pruned' => 0]);
    }
    ccrm_clickup_reply(200, [
        'synced' => (int)$res['synced'],
        'pruned' => (int)$res['pruned'],
    ]);
}

if ($action === 'sync_all') {
    if ($method !== 'POST') {
        ccrm_clickup_reply(405, ['message' => 'Method Not Allowed']);
    }
    ccrm_gate($sessionUser, 'general_config', 'edit');
    $res = ccrm_clickup_sync_all_projects($pdo, true);
    $cfg = ccrm_clickup_load_config($pdo, true);
    $counts = ccrm_clickup_status_counts($pdo);
    if (!$res['ok'] && $res['projects'] === 0) {
        ccrm_clickup_reply(400, ['message' => $res['errors'][0] ?? 'ClickUp sync failed.']);
    }
    ccrm_clickup_reply(200, [
        'projects' => (int)$res['projects'],
        'synced' => (int)$res['synced'],
        'pruned' => (int)$res['pruned'],
        'errors' => $res['errors'],
        'config' => ccrm_clickup_mask_config($cfg),
        'linkedProjectsCount' => $counts['linkedProjectsCount'],
        'syncedTasksCount' => $counts['syncedTasksCount'],
    ]);
}

ccrm_clickup_reply(400, ['message' => 'Unknown action.']);
