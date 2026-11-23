<?php
/**
 * Time tracking: create a project from the project picker, for anyone who may log time
 * (owner decision 2026-11-23). Someone with the projects module creates projects through
 * sync.php as before; this endpoint is for people without it.
 *
 *   POST {name, clientId?, projectTypeId}   -> {project: {id, name, clientId, leadId, projectTypeId, status}}
 *
 * The project gets the default status and nothing else; the rest is filled in later by someone
 * with the projects module. Needs time_tracking = edit. Errors are stable codes:
 * name_required, type_not_found, client_not_found, forbidden.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

function ccrm_tp_fail(string $code, int $status = 400): void {
    http_response_code($status);
    echo json_encode(['success' => false, 'code' => $code], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    ccrm_tp_fail('method_not_allowed', 405);
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_tp_fail('not_installed', 503);
}
require_once $configFile;
try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_tp_fail('database_unavailable', 503);
}

$scope = ccrm_read_scope($pdo, $sessionUser);
if (!ccrm_can($scope, 'time_tracking', 'edit') && !ccrm_can($scope, 'projects', 'edit')) {
    ccrm_tp_fail('forbidden', 403);
}

$decoded = json_decode((string)file_get_contents('php://input'), true);
$body = is_array($decoded) ? $decoded : [];

$name = trim((string)preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($body['name'] ?? '')));
if ($name === '') {
    ccrm_tp_fail('name_required');
}
$name = mb_substr($name, 0, 200);

$typeId = trim((string)($body['projectTypeId'] ?? ''));
$typeStmt = $pdo->prepare("SELECT 1 FROM `project_types` WHERE `id` = ? LIMIT 1");
$typeStmt->execute([$typeId]);
if ($typeId === '' || !$typeStmt->fetchColumn()) {
    ccrm_tp_fail('type_not_found');
}

// The client form offers client records; a lead id is accepted too and goes to lead_id,
// the same split the app makes (App.tsx onCreateProject).
$clientId = null;
$leadId = null;
$recordId = trim((string)($body['clientId'] ?? ''));
if ($recordId !== '') {
    $rec = $pdo->prepare("SELECT `id`, `adjustment` FROM `leads` WHERE `id` = ? LIMIT 1");
    $rec->execute([$recordId]);
    $row = $rec->fetch(\PDO::FETCH_ASSOC);
    if (!$row) {
        ccrm_tp_fail('client_not_found');
    }
    if (ccrm_is_client_row($row)) {
        $clientId = $recordId;
    } else {
        $leadId = $recordId;
    }
}

$status = ccrm_default_project_status($pdo);
$id = 'proj-' . (int)round(microtime(true) * 1000) . '-' . bin2hex(random_bytes(3));
try {
    $pdo->prepare(
        "INSERT INTO `projects` (`id`, `project_type_id`, `name`, `lead_id`, `client_id`, `status`, `start_date`, `created_at`)
         VALUES (?, ?, ?, ?, ?, ?, CURDATE(), NOW())"
    )->execute([$id, $typeId, $name, $leadId, $clientId, $status]);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_tp_fail('save_failed', 500);
}

ccrm_audit_log($pdo, $sessionUser, 'project.create.time_tracking', json_encode(['id' => $id, 'name' => $name], JSON_UNESCAPED_UNICODE));

echo json_encode([
    'success' => true,
    'project' => [
        'id' => $id,
        'name' => $name,
        'clientId' => $clientId,
        'leadId' => $leadId,
        'projectTypeId' => $typeId,
        'status' => $status,
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
