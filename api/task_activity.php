<?php
/**
 * Task Activity, Chat Messages, Image Uploads & Emoji Reactions API
 *
 * Isolated from sync.php so 5-second global polling never carries chat history or
 * base64 images. Maintains `tasks.comment_count` and `tasks.reactions_json` with
 * `updated_at = updated_at` so task board badges stay instant without tripping
 * sync.php's concurrent form-edit conflict guard.
 */
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/permissions.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/task_activity_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
ccrm_send_cors('GET, POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        exit(0);
    }
    $user = ccrm_require_auth();
    // Release session lock immediately so active drawer polling never stalls sync.php.
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
} else {
    $user = ['id' => 'cli', 'name' => 'CLI', 'email' => 'cli@localhost', 'role' => 'Admin'];
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    $configFile = dirname(__DIR__, 2) . '/config.php';
}
if (file_exists($configFile)) {
    require_once $configFile;
}

try {
    $pdo = function_exists('get_db_connection') ? get_db_connection() : ccrm_auth_pdo();
    if (!$pdo) {
        throw new \RuntimeException('Database connection unavailable.');
    }
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed.']);
    exit;
}

// Pre-transaction DDL healing so stale OPcache workers never fail.
ccrm_migrate_task_activities($pdo);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

$fail = static function (int $status, string $msg): void {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
};

$scope = php_sapi_name() !== 'cli' ? ccrm_read_scope($pdo, $user) : ['isAdmin' => true];
if (empty($scope['isAdmin']) && !ccrm_can($scope, 'tasks', 'view')) {
    $fail(403, "Permission 'tasks' required.");
}

$isMultipart = $method === 'POST' && (
    isset($_FILES['file'])
    || stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') !== false
);

$jsonBody = null;
if ($method === 'POST' && !$isMultipart) {
    $raw = file_get_contents('php://input');
    $jsonBody = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($jsonBody)) {
        $fail(400, 'Invalid JSON payload.');
    }
}

$taskId = $method === 'GET'
    ? trim((string)($_GET['taskId'] ?? ''))
    : ($isMultipart ? trim((string)($_POST['taskId'] ?? '')) : trim((string)($jsonBody['taskId'] ?? '')));

if ($taskId === '' || strlen($taskId) > 50 || !preg_match('/^[A-Za-z0-9._\-]+$/', $taskId)) {
    $fail(400, 'Valid taskId is required.');
}

// Verify real task exists (never recurring template) and user can view it.
$taskStmt = $pdo->prepare(
    "SELECT `id`, `comment_count`, `reactions_json`
       FROM `tasks`
      WHERE `id` = ? AND " . ccrm_sql_real_tasks() . "
      LIMIT 1"
);
$taskStmt->execute([$taskId]);
$taskRow = $taskStmt->fetch(PDO::FETCH_ASSOC);
if (!$taskRow) {
    $fail(404, 'Task not found.');
}

if (empty($scope['isAdmin']) && !ccrm_can($scope, 'tasks.view_all')) {
    if (!isset(ccrm_visible_task_ids($pdo, $scope, [$taskId])[$taskId])) {
        $fail(403, 'You do not have permission to view this task.');
    }
}

$mapRow = static function (array $r): array {
    if (!empty($r['deleted_at'])) {
        return [
            'id' => (int)$r['id'],
            'taskId' => (string)$r['task_id'],
            'deleted' => true,
            'updatedAt' => (string)$r['updated_at'],
        ];
    }
    $meta = (!empty($r['meta_json']) && is_string($r['meta_json'])) ? json_decode($r['meta_json'], true) : null;
    if (!is_array($meta)) {
        $meta = null;
    }
    $rx = ccrm_normalize_reaction_map($r['reactions_json'] ?? null);
    return [
        'id' => (int)$r['id'],
        'taskId' => (string)$r['task_id'],
        'kind' => (string)$r['kind'],
        'eventType' => $r['event_type'] !== null ? (string)$r['event_type'] : null,
        'authorName' => (string)$r['author_name'],
        'body' => $r['body'] !== null ? (string)$r['body'] : '',
        'meta' => $meta,
        'reactions' => !empty($rx) ? $rx : (object)[],
        'createdAt' => (string)$r['created_at'],
        'updatedAt' => (string)$r['updated_at'],
    ];
};

if ($method === 'GET') {
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 40;
    if ($limit < 1) $limit = 1;
    if ($limit > 100) $limit = 100;

    $beforeId = isset($_GET['beforeId']) && is_numeric($_GET['beforeId']) ? (int)$_GET['beforeId'] : null;
    $afterId = isset($_GET['afterId']) && is_numeric($_GET['afterId']) ? (int)$_GET['afterId'] : null;
    $sinceUpdated = isset($_GET['sinceUpdated']) ? trim((string)$_GET['sinceUpdated']) : '';
    if ($sinceUpdated !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/', $sinceUpdated)) {
        $sinceUpdated = '';
    }

    $taskRx = ccrm_normalize_reaction_map($taskRow['reactions_json'] ?? null);

    if ($afterId !== null || $sinceUpdated !== '') {
        $clauses = ['`task_id` = ?'];
        $params = [$taskId];
        $deltaConds = [];
        if ($afterId !== null) {
            $deltaConds[] = '`id` > ?';
            $params[] = $afterId;
        }
        if ($sinceUpdated !== '') {
            $deltaConds[] = '`updated_at` > ?';
            $params[] = $sinceUpdated;
        }
        $clauses[] = '(' . implode(' OR ', $deltaConds) . ')';
        $sql = "SELECT `id`, `task_id`, `kind`, `event_type`, `author_name`, `body`, `meta_json`, `reactions_json`, `deleted_at`, `created_at`, `updated_at`
                  FROM `task_activities`
                 WHERE " . implode(' AND ', $clauses) . "
                 ORDER BY `id` ASC
                 LIMIT 100";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $items = array_map($mapRow, $rows);

        $cursorUpdated = $sinceUpdated !== '' ? $sinceUpdated : '1970-01-01 00:00:00.000';
        foreach ($rows as $r) {
            if ((string)$r['updated_at'] > $cursorUpdated) {
                $cursorUpdated = (string)$r['updated_at'];
            }
        }

        echo json_encode([
            'success' => true,
            'items' => $items,
            'hasMore' => false,
            'cursorUpdated' => $cursorUpdated,
            'commentCount' => (int)$taskRow['comment_count'],
            'taskReactions' => !empty($taskRx) ? $taskRx : (object)[],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $params = [$taskId];
    $where = "`task_id` = ? AND `deleted_at` IS NULL";
    if ($beforeId !== null && $beforeId > 0) {
        $where .= " AND `id` < ?";
        $params[] = $beforeId;
    }
    $fetchLimit = $limit + 1;
    $sql = "SELECT `id`, `task_id`, `kind`, `event_type`, `author_name`, `body`, `meta_json`, `reactions_json`, `deleted_at`, `created_at`, `updated_at`
              FROM `task_activities`
             WHERE {$where}
             ORDER BY `id` DESC
             LIMIT {$fetchLimit}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $hasMore = count($rows) > $limit;
    if ($hasMore) {
        $rows = array_slice($rows, 0, $limit);
    }
    $rows = array_reverse($rows);
    $items = array_map($mapRow, $rows);

    $maxStmt = $pdo->prepare("SELECT COALESCE(MAX(`updated_at`), '1970-01-01 00:00:00.000') FROM `task_activities` WHERE `task_id` = ?");
    $maxStmt->execute([$taskId]);
    $cursorUpdated = (string)($maxStmt->fetchColumn() ?: '1970-01-01 00:00:00.000');

    echo json_encode([
        'success' => true,
        'items' => $items,
        'hasMore' => $hasMore,
        'cursorUpdated' => $cursorUpdated,
        'commentCount' => (int)$taskRow['comment_count'],
        'taskReactions' => !empty($taskRx) ? $taskRx : (object)[],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// POST actions below
$userName = trim((string)($user['name'] ?? ($user['email'] ?? '')));
if ($userName === '') {
    $fail(403, 'Authenticated user identity is required.');
}
$isAdmin = ccrm_is_admin($user);

// 1. Multipart compressed image upload (skipping OCR)
if ($isMultipart) {
    $action = trim((string)($_POST['action'] ?? 'upload_image'));
    if ($action !== 'upload_image') {
        $fail(400, 'Invalid upload action.');
    }
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        $fail(400, 'No image file uploaded.');
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $errCode = (int)($file['error'] ?? 0);
        $msg = ($errCode === UPLOAD_ERR_INI_SIZE || $errCode === UPLOAD_ERR_FORM_SIZE)
            ? 'Image exceeds server upload limit.'
            : 'Upload failed (code ' . $errCode . ').';
        $fail(400, $msg);
    }
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > 10 * 1024 * 1024) {
        $fail(400, 'Image size must be between 1 byte and 10 MB.');
    }

    $safeName = ccrm_safe_upload_name((string)($file['name'] ?? 'image.webp'));
    if ($safeName === null) {
        $fail(415, 'Invalid filename.');
    }
    $ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
    if (!in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif'], true)) {
        $fail(415, 'Only PNG, JPG, WebP, and GIF images are allowed.');
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_file($tmpPath)) {
        $fail(400, 'Uploaded temporary file missing.');
    }
    if (!ccrm_stored_file_matches_extension($tmpPath, $safeName)) {
        $fail(422, 'Uploaded file header does not match image extension.');
    }
    if ($ext === 'webp') {
        $head = @file_get_contents($tmpPath, false, null, 0, 16);
        if (!is_string($head) || substr($head, 0, 4) !== 'RIFF' || substr($head, 8, 4) !== 'WEBP') {
            $fail(422, 'Uploaded file is not a valid WebP image.');
        }
    }
    $imgInfo = @getimagesize($tmpPath);
    if (!is_array($imgInfo) || empty($imgInfo[0]) || empty($imgInfo[1])) {
        $fail(422, 'Uploaded file is not a readable image.');
    }

    $ym = date('Y-m');
    $baseUploads = ccrm_uploads_dir();
    $subDir = $baseUploads . 'tasks/' . $ym . '/';
    if (!is_dir($subDir) && !@mkdir($subDir, 0775, true)) {
        $fail(500, 'Could not initialize task upload directory.');
    }

    $storedExt = $ext === 'jpeg' ? 'jpg' : $ext;
    $storedFile = 'ta_' . bin2hex(random_bytes(8)) . '.' . $storedExt;
    $destPath = $subDir . $storedFile;
    $moved = is_uploaded_file($tmpPath) ? @move_uploaded_file($tmpPath, $destPath) : @rename($tmpPath, $destPath);
    if (!$moved) {
        $fail(500, 'Failed to store uploaded image.');
    }

    echo json_encode([
        'success' => true,
        'image' => [
            'url' => '/uploads/tasks/' . $ym . '/' . $storedFile,
            'name' => $safeName,
            'w' => (int)$imgInfo[0],
            'h' => (int)$imgInfo[1],
            'size' => (int)(@filesize($destPath) ?: $size),
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$action = trim((string)($jsonBody['action'] ?? ''));

$sanitizeImages = static function ($raw) use ($fail): array {
    if ($raw === null) return [];
    if (!is_array($raw)) {
        $fail(400, 'Invalid images list.');
    }
    if (count($raw) > 6) {
        $fail(400, 'At most 6 images per comment are allowed.');
    }
    $out = [];
    foreach ($raw as $img) {
        if (!is_array($img) || empty($img['url']) || !is_string($img['url'])) continue;
        $url = trim($img['url']);
        if (!preg_match('#^/uploads/tasks/\d{4}-\d{2}/ta_[a-f0-9]{16}\.(?:png|jpe?g|webp|gif)$#i', $url)) {
            $fail(400, 'Invalid image attachment URL.');
        }
        $out[] = [
            'url' => $url,
            'name' => mb_substr(trim((string)($img['name'] ?? 'image')), 0, 180, 'UTF-8'),
            'w' => max(1, min(20000, (int)($img['w'] ?? 1))),
            'h' => max(1, min(20000, (int)($img['h'] ?? 1))),
            'size' => max(0, (int)($img['size'] ?? 0)),
        ];
    }
    return $out;
};

if ($action === 'post_comment') {
    $body = trim((string)($jsonBody['body'] ?? ''));
    if (mb_strlen($body, 'UTF-8') > 4000) {
        $fail(400, 'Message is too long (maximum 4000 characters).');
    }
    $images = $sanitizeImages($jsonBody['images'] ?? []);
    if ($body === '' && empty($images)) {
        $fail(400, 'Message text or an image is required.');
    }
    $metaJson = !empty($images) ? json_encode(['images' => $images], JSON_UNESCAPED_UNICODE) : null;

    try {
        $pdo->beginTransaction();
        $ins = $pdo->prepare(
            "INSERT INTO `task_activities` (`task_id`, `kind`, `event_type`, `author_name`, `body`, `meta_json`)
             VALUES (?, 'comment', NULL, ?, ?, ?)"
        );
        $ins->execute([$taskId, mb_substr($userName, 0, 100, 'UTF-8'), $body, $metaJson]);
        $newId = (int)$pdo->lastInsertId();

        // Keep updated_at intact so active form editors are never clobbered on Save.
        $pdo->prepare(
            "UPDATE `tasks`
                SET `comment_count` = `comment_count` + 1,
                    `updated_at` = `updated_at`
              WHERE `id` = ? AND " . ccrm_sql_real_tasks()
        )->execute([$taskId]);

        $cntStmt = $pdo->prepare("SELECT `comment_count` FROM `tasks` WHERE `id` = ? AND " . ccrm_sql_real_tasks() . " LIMIT 1");
        $cntStmt->execute([$taskId]);
        $commentCount = (int)$cntStmt->fetchColumn();

        $rowStmt = $pdo->prepare("SELECT * FROM `task_activities` WHERE `id` = ? LIMIT 1");
        $rowStmt->execute([$newId]);
        $createdRow = $rowStmt->fetch(PDO::FETCH_ASSOC);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        ccrm_log_exception($e);
        $fail(500, 'Failed to post comment.');
    }

    ccrm_notify_task_comment($pdo, $taskId, $userName, $body, $images);

    echo json_encode([
        'success' => true,
        'item' => $createdRow ? $mapRow($createdRow) : null,
        'commentCount' => $commentCount,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'edit_comment') {
    $activityId = (int)($jsonBody['activityId'] ?? 0);
    $body = trim((string)($jsonBody['body'] ?? ''));
    if ($activityId <= 0 || mb_strlen($body, 'UTF-8') > 4000) {
        $fail(400, 'Valid activityId and message body are required.');
    }

    $stmt = $pdo->prepare(
        "SELECT * FROM `task_activities` WHERE `id` = ? AND `task_id` = ? AND `kind` = 'comment' AND `deleted_at` IS NULL LIMIT 1"
    );
    $stmt->execute([$activityId, $taskId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $fail(404, 'Comment not found.');
    }
    if (!$isAdmin && strcasecmp((string)$row['author_name'], $userName) !== 0) {
        $fail(403, 'Only the author or an Admin can edit this comment.');
    }

    $meta = (!empty($row['meta_json']) && is_string($row['meta_json'])) ? json_decode($row['meta_json'], true) : [];
    if (!is_array($meta)) $meta = [];
    if ($body === '' && empty($meta['images'])) {
        $fail(400, 'Message cannot be empty unless it has an image.');
    }
    $meta['editedAt'] = gmdate('Y-m-d\TH:i:s\Z');
    $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE);

    $pdo->prepare("UPDATE `task_activities` SET `body` = ?, `meta_json` = ? WHERE `id` = ? AND `task_id` = ?")
        ->execute([$body, $metaJson, $activityId, $taskId]);

    $stmt->execute([$activityId, $taskId]);
    $updatedRow = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'item' => $updatedRow ? $mapRow($updatedRow) : null,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'delete_comment') {
    $activityId = (int)($jsonBody['activityId'] ?? 0);
    if ($activityId <= 0) {
        $fail(400, 'Valid activityId is required.');
    }

    $imgPaths = [];
    $commentCount = (int)$taskRow['comment_count'];
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare(
            "SELECT `id`, `author_name`, `meta_json`, `deleted_at`
               FROM `task_activities`
              WHERE `id` = ? AND `task_id` = ? AND `kind` = 'comment'
              FOR UPDATE"
        );
        $stmt->execute([$activityId, $taskId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || !empty($row['deleted_at'])) {
            $pdo->rollBack();
            $fail(404, 'Comment not found.');
        }
        if (!$isAdmin && strcasecmp((string)$row['author_name'], $userName) !== 0) {
            $pdo->rollBack();
            $fail(403, 'Only the author or an Admin can delete this comment.');
        }

        $imgPaths = ccrm_extract_task_upload_paths($row['meta_json'] ?? null);
        $pdo->prepare("UPDATE `task_activities` SET `deleted_at` = NOW() WHERE `id` = ?")->execute([$activityId]);
        $pdo->prepare(
            "UPDATE `tasks`
                SET `comment_count` = GREATEST(0, `comment_count` - 1),
                    `updated_at` = `updated_at`
              WHERE `id` = ? AND " . ccrm_sql_real_tasks()
        )->execute([$taskId]);

        $cntStmt = $pdo->prepare("SELECT `comment_count` FROM `tasks` WHERE `id` = ? AND " . ccrm_sql_real_tasks() . " LIMIT 1");
        $cntStmt->execute([$taskId]);
        $commentCount = (int)$cntStmt->fetchColumn();
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        ccrm_log_exception($e);
        $fail(500, 'Failed to delete comment.');
    }

    ccrm_unlink_task_activity_files($imgPaths);

    echo json_encode([
        'success' => true,
        'deletedId' => $activityId,
        'commentCount' => $commentCount,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'toggle_message_reaction') {
    $activityId = (int)($jsonBody['activityId'] ?? 0);
    $emoji = trim((string)($jsonBody['emoji'] ?? ''));
    if ($activityId <= 0 || $emoji === '') {
        $fail(400, 'Valid activityId and emoji are required.');
    }

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare(
            "SELECT `reactions_json` FROM `task_activities`
              WHERE `id` = ? AND `task_id` = ? AND `deleted_at` IS NULL
              FOR UPDATE"
        );
        $stmt->execute([$activityId, $taskId]);
        $rawRx = $stmt->fetchColumn();
        if ($rawRx === false) {
            $pdo->rollBack();
            $fail(404, 'Activity item not found.');
        }
        $next = ccrm_toggle_reaction_map(is_string($rawRx) ? $rawRx : null, $emoji, $userName);
        $pdo->prepare("UPDATE `task_activities` SET `reactions_json` = ? WHERE `id` = ?")
            ->execute([$next['json'], $activityId]);
        $pdo->commit();

        echo json_encode([
            'success' => true,
            'id' => $activityId,
            'reactions' => !empty($next['map']) ? $next['map'] : (object)[],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    } catch (\InvalidArgumentException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $fail(400, $e->getMessage());
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        ccrm_log_exception($e);
        $fail(500, 'Failed to update message reaction.');
    }
}

if ($action === 'toggle_task_reaction') {
    $emoji = trim((string)($jsonBody['emoji'] ?? ''));
    if ($emoji === '') {
        $fail(400, 'Emoji is required.');
    }

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare(
            "SELECT `reactions_json` FROM `tasks`
              WHERE `id` = ? AND " . ccrm_sql_real_tasks() . "
              FOR UPDATE"
        );
        $stmt->execute([$taskId]);
        $rawRx = $stmt->fetchColumn();
        if ($rawRx === false) {
            $pdo->rollBack();
            $fail(404, 'Task not found.');
        }
        $next = ccrm_toggle_reaction_map(is_string($rawRx) ? $rawRx : null, $emoji, $userName);
        $pdo->prepare(
            "UPDATE `tasks`
                SET `reactions_json` = ?,
                    `updated_at` = `updated_at`
              WHERE `id` = ? AND " . ccrm_sql_real_tasks()
        )->execute([$next['json'], $taskId]);
        $pdo->commit();

        echo json_encode([
            'success' => true,
            'taskReactions' => !empty($next['map']) ? $next['map'] : (object)[],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    } catch (\InvalidArgumentException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $fail(400, $e->getMessage());
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        ccrm_log_exception($e);
        $fail(500, 'Failed to update task reaction.');
    }
}

$fail(400, 'Unknown action.');
