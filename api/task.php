<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('DELETE, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true) ?: [];
$taskId = trim((string)($payload['id'] ?? ''));
if ($taskId === '' || strlen($taskId) > 50) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A valid task id is required.']);
    exit;
}

$taskStmt = $pdo->prepare(
    "SELECT t.`id`, t.`title`, t.`created_by`,
            u.`name` AS session_user_name
       FROM `tasks` t
       JOIN `users` u ON u.`id` = ?
      WHERE t.`id` = ?
      LIMIT 1"
);
$taskStmt->execute([$sessionUser['id'], $taskId]);
$task = $taskStmt->fetch();
if (!$task) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Task not found.']);
    exit;
}

$isAdmin = ($sessionUser['role'] ?? '') === 'admin';
$isCreator = !empty($task['created_by'])
    && hash_equals((string)$task['created_by'], (string)$task['session_user_name']);

$hasDeletePermission = false;
if (!$isAdmin) {
    $rolesRaw = $pdo->query(
        "SELECT `value` FROM `system_settings` WHERE `key` = 'ROLES_RBAC' LIMIT 1"
    )->fetchColumn();
    $roles = $rolesRaw ? json_decode($rolesRaw, true) : [];
    if (is_array($roles)) {
        foreach ($roles as $role) {
            if (
                ccrm_normalize_role($role['name'] ?? '') === ($sessionUser['role'] ?? '')
                && (($role['permissions']['tasks.delete'] ?? 'nothing') === 'edit')
            ) {
                $hasDeletePermission = true;
                break;
            }
        }
    }
}

// Legacy tasks predate created_by. Preserve their previous behavior by allowing
// an assignee to delete them; new tasks use the immutable creator field.
$isLegacyAssignee = false;
if (empty($task['created_by'])) {
    $assigneeStmt = $pdo->prepare(
        "SELECT COUNT(*) FROM `task_assignees`
          WHERE `task_id` = ? AND `user_name` = ?"
    );
    $assigneeStmt->execute([$taskId, $task['session_user_name']]);
    $isLegacyAssignee = (int)$assigneeStmt->fetchColumn() > 0;
}

if (!$isAdmin && !$hasDeletePermission && !$isCreator && !$isLegacyAssignee) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'You do not have permission to delete this task.']);
    exit;
}

try {
    $pdo->beginTransaction();
    $deleteStmt = $pdo->prepare("DELETE FROM `tasks` WHERE `id` = ?");
    $deleteStmt->execute([$taskId]);
    if ($deleteStmt->rowCount() !== 1) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Task changed before it could be deleted.']);
        exit;
    }
    ccrm_audit_log(
        $pdo,
        $sessionUser,
        'tasks.delete',
        $taskId . ': ' . (string)$task['title']
    );
    $pdo->commit();
    echo json_encode(['success' => true, 'id' => $taskId]);
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Task deletion failed.']);
}
