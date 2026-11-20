<?php
/**
 * Scope approval of a project: POST { projectId, action: "approve" | "withdraw" }.
 *
 * The approval never travels in a project save (sync.php ignores it): a tab that loaded the project
 * before a colleague approved it would clear the approval on its next autosave, and the reverse. This
 * endpoint is the only writer of `projects.scope_approved_at` / `scope_approved_by`; the instant is the
 * server's clock and the name is the session user's. The rules live in ccrm_scope_apply_action()
 * (api/project_scope.php). Answers { success, scopeApprovedAt, scopeApprovedBy }.
 *
 * The caller needs the right to edit projects, the one sync.php applies to the projects upsert
 * (admin, or edit on the `projects` module). No DDL here: while the columns are missing (the schema
 * has not been applied yet) it answers 503 and the client shows the failure.
 */

require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/permissions.php';
require_once __DIR__ . '/project_scope.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => (KOPERNIQ_PRODUCT_NAME . ' is not installed.')]);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// The projects upsert in sync.php is skipped unless: admin || ccrm_perm_can_edit($perms, 'projects').
if (!ccrm_is_admin($sessionUser) && !ccrm_perm_can_edit(ccrm_user_permissions($pdo, $sessionUser), 'projects')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'You do not have permission to edit projects.']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
$payload = is_array($payload) ? $payload : [];
$projectId = trim((string)($payload['projectId'] ?? ''));
$action = (string)($payload['action'] ?? '');
if ($projectId === '' || strlen($projectId) > 50 || ($action !== 'approve' && $action !== 'withdraw')) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A projectId and an action (approve or withdraw) are required.']);
    exit;
}

try {
    if (!ccrm_column_exists($pdo, 'projects', 'scope_approved_at') || !ccrm_column_exists($pdo, 'projects', 'scope_approved_by')) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'The database is being updated. Try again in a moment.']);
        exit;
    }
    $nameStmt = $pdo->prepare("SELECT `name` FROM `users` WHERE `id` = ? LIMIT 1");
    $nameStmt->execute([$sessionUser['id']]);
    $userName = (string)($nameStmt->fetchColumn() ?: '');

    $result = ccrm_scope_apply_action($pdo, $projectId, $action, $userName !== '' ? $userName : null);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'The approval could not be saved.']);
    exit;
}

if ($result === null) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Project not found.']);
    exit;
}
echo json_encode(['success' => true] + $result);
