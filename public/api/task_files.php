<?php
/**
 * Authenticated Task File Uploads, Listing, Download & Code/Text Preview API
 *
 *   GET  ?taskId=<id>                       list active files for task
 *   GET  ?action=download&id=<fileId>[&download=1]
 *   GET  ?action=preview_text&id=<fileId>   safe UTF-8 text/code preview (<= 512 KB)
 *   POST (multipart: taskId, file)          upload file (<= 25 MB; images, docs, archives, source code)
 *   POST (JSON: action=delete, taskId, fileId)
 */
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/permissions.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/task_activity_lib.php';
require_once __DIR__ . '/task_files_lib.php';

ccrm_send_cors('GET, POST, OPTIONS');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    exit(0);
}

$action = trim((string)($_GET['action'] ?? ''));

$fail = static function (int $status, string $msg): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
};

if (!in_array($method, ['GET', 'POST'], true)) {
    $fail(405, 'Method not allowed.');
}

if (php_sapi_name() !== 'cli') {
    $user = ccrm_require_auth();
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
    $fail(500, 'Database connection failed.');
}

ccrm_migrate_task_files($pdo);

$scope = php_sapi_name() !== 'cli' ? ccrm_read_scope($pdo, $user) : ['isAdmin' => true];
$isAdmin = !empty($scope['isAdmin']);
if (!$isAdmin && !ccrm_can($scope, 'tasks', 'view')) {
    $fail(403, "Permission 'tasks' required.");
}

$assertTaskVisible = static function (string $taskId) use ($pdo, $scope, $isAdmin, $fail): array {
    if ($taskId === '' || strlen($taskId) > 50 || !preg_match('/^[A-Za-z0-9._\-]+$/', $taskId)) {
        $fail(400, 'Valid taskId is required.');
    }
    $stmt = $pdo->prepare("SELECT `id`, `file_count` FROM `tasks` WHERE `id` = ? AND " . ccrm_sql_real_tasks() . " LIMIT 1");
    $stmt->execute([$taskId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $fail(404, 'Task not found.');
    }
    if (!$isAdmin && !ccrm_can($scope, 'tasks.view_all')) {
        if (!isset(ccrm_visible_task_ids($pdo, $scope, [$taskId])[$taskId])) {
            $fail(403, 'You do not have permission to view this task.');
        }
    }
    return $row;
};

if ($method === 'GET' && $action === 'download') {
    $fileId = trim((string)($_GET['id'] ?? ''));
    if ($fileId === '' || strlen($fileId) > 64) {
        $fail(400, 'Valid file id is required.');
    }
    $stmt = $pdo->prepare("SELECT * FROM `task_files` WHERE `id` = ? AND `deleted_at` IS NULL LIMIT 1");
    $stmt->execute([$fileId]);
    $fileRow = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$fileRow) {
        $fail(404, 'File not found.');
    }
    $assertTaskVisible((string)$fileRow['task_id']);

    $path = ccrm_task_files_private_path((string)$fileRow['storage_name']);
    if ($path === null) {
        $fail(404, 'Stored file unavailable.');
    }

    $forceDownload = !empty($_GET['download']);
    $fileName = str_replace(["\r", "\n", '"'], '', (string)$fileRow['file_name']);
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    $safeInline = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf'];

    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Cache-Control: private, max-age=300');
    header('Content-Length: ' . filesize($path));

    if (!$forceDownload && isset($safeInline[$ext])) {
        header('Content-Type: ' . $safeInline[$ext]);
        header('Content-Disposition: inline; filename="' . $fileName . '"');
    } else {
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $fileName . '"');
    }
    readfile($path);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($method === 'GET' && $action === 'preview_text') {
    $fileId = trim((string)($_GET['id'] ?? ''));
    if ($fileId === '' || strlen($fileId) > 64) {
        $fail(400, 'Valid file id is required.');
    }
    $stmt = $pdo->prepare("SELECT * FROM `task_files` WHERE `id` = ? AND `deleted_at` IS NULL LIMIT 1");
    $stmt->execute([$fileId]);
    $fileRow = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$fileRow) {
        $fail(404, 'File not found.');
    }
    $assertTaskVisible((string)$fileRow['task_id']);

    $fileName = (string)$fileRow['file_name'];
    $mime = (string)($fileRow['mime_type'] ?? '');
    if (!ccrm_task_file_is_code_or_text($fileName, $mime)) {
        $fail(415, 'Text preview is not available for this binary file type.');
    }
    $path = ccrm_task_files_private_path((string)$fileRow['storage_name']);
    if ($path === null) {
        $fail(404, 'Stored file unavailable.');
    }

    $maxBytes = 524288; // 512 KB
    $totalSize = (int)(@filesize($path) ?: 0);
    $raw = @file_get_contents($path, false, null, 0, $maxBytes);
    if (!is_string($raw)) {
        $fail(500, 'Could not read stored file.');
    }
    if (function_exists('mb_check_encoding') && !mb_check_encoding($raw, 'UTF-8')) {
        $raw = mb_convert_encoding($raw, 'UTF-8', 'UTF-8, ISO-8859-1, Windows-1250');
    }

    echo json_encode([
        'success' => true,
        'text' => $raw,
        'truncated' => $totalSize > $maxBytes,
        'language' => ccrm_task_file_guess_language($fileName),
        'fileName' => $fileName,
        'sizeBytes' => $totalSize,
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if ($method === 'GET') {
    $taskId = trim((string)($_GET['taskId'] ?? ''));
    $taskRow = $assertTaskVisible($taskId);

    $stmt = $pdo->prepare(
        "SELECT * FROM `task_files`
          WHERE `task_id` = ? AND `deleted_at` IS NULL
          ORDER BY `created_at` DESC, `id` DESC
          LIMIT 200"
    );
    $stmt->execute([$taskId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $files = array_map('ccrm_task_file_to_json', $rows);
    $count = count($files);

    if ((int)($taskRow['file_count'] ?? 0) !== $count) {
        $pdo->prepare("UPDATE `tasks` SET `file_count` = ?, `updated_at` = `updated_at` WHERE `id` = ? AND " . ccrm_sql_real_tasks())
            ->execute([$count, $taskId]);
    }

    echo json_encode([
        'success' => true,
        'files' => $files,
        'fileCount' => $count,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!$isAdmin && !ccrm_can_edit($scope, 'tasks')) {
    $fail(403, "Editing 'tasks' is required.");
}

$userName = trim((string)($user['name'] ?? $user['email'] ?? 'User')) ?: 'User';

$isMultipart = isset($_FILES['file']) || stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') !== false;
if ($isMultipart) {
    $taskId = trim((string)($_POST['taskId'] ?? ''));
    $assertTaskVisible($taskId);

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        $fail(400, 'No file uploaded.');
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $errCode = (int)($file['error'] ?? 0);
        $msg = ($errCode === UPLOAD_ERR_INI_SIZE || $errCode === UPLOAD_ERR_FORM_SIZE)
            ? 'File exceeds server upload limit.'
            : 'Upload failed (code ' . $errCode . ').';
        $fail(400, $msg);
    }

    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > 25 * 1024 * 1024) {
        $fail(400, 'File size must be between 1 byte and 25 MB.');
    }

    $safeName = ccrm_task_file_validate_name((string)($file['name'] ?? ''));
    if ($safeName === null) {
        $fail(415, 'File name or extension is not allowed.');
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_file($tmpPath)) {
        $fail(400, 'Uploaded temporary file missing.');
    }

    $ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
    $rasterExts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    $isImage = in_array($ext, $rasterExts, true);
    $imgW = null;
    $imgH = null;

    if ($isImage) {
        if (function_exists('ccrm_stored_file_matches_extension') && !ccrm_stored_file_matches_extension($tmpPath, $safeName)) {
            $fail(422, 'Uploaded image header does not match extension.');
        }
        $imgInfo = @getimagesize($tmpPath);
        if (!is_array($imgInfo) || empty($imgInfo[0]) || empty($imgInfo[1])) {
            $fail(422, 'Uploaded file is not a valid image.');
        }
        $imgW = (int)$imgInfo[0];
        $imgH = (int)$imgInfo[1];
    } elseif ($ext === 'pdf') {
        if (function_exists('ccrm_stored_file_matches_extension') && !ccrm_stored_file_matches_extension($tmpPath, $safeName)) {
            $fail(422, 'Uploaded file is not a valid PDF document.');
        }
    }

    $mime = trim((string)($file['type'] ?? 'application/octet-stream')) ?: 'application/octet-stream';
    if (!preg_match('/^[a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+$/', $mime)) {
        $mime = 'application/octet-stream';
    }

    $dir = ccrm_task_files_private_dir();
    $storageName = 'tf_' . bin2hex(random_bytes(12)) . '.bin';
    $destPath = $dir . $storageName;
    $moved = is_uploaded_file($tmpPath) ? @move_uploaded_file($tmpPath, $destPath) : @rename($tmpPath, $destPath);
    if (!$moved) {
        $fail(500, 'Failed to store uploaded file.');
    }

    $fileId = 'tf_' . bin2hex(random_bytes(10));
    $storedSize = (int)(@filesize($destPath) ?: $size);

    try {
        $pdo->beginTransaction();
        $pdo->prepare(
            "INSERT INTO `task_files` (`id`, `task_id`, `file_name`, `mime_type`, `size_bytes`, `storage_name`, `is_image`, `image_width`, `image_height`, `uploaded_by`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([$fileId, $taskId, $safeName, $mime, $storedSize, $storageName, $isImage ? 1 : 0, $imgW, $imgH, $userName]);

        $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM `task_files` WHERE `task_id` = ? AND `deleted_at` IS NULL");
        $cntStmt->execute([$taskId]);
        $fileCount = (int)$cntStmt->fetchColumn();

        $pdo->prepare("UPDATE `tasks` SET `file_count` = ?, `updated_at` = `updated_at` WHERE `id` = ? AND " . ccrm_sql_real_tasks())
            ->execute([$fileCount, $taskId]);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        @unlink($destPath);
        ccrm_log_exception($e);
        $fail(500, 'Failed to save file metadata.');
    }

    try {
        ccrm_migrate_task_activities($pdo);
        $metaJson = json_encode(['field' => 'file', 'action' => 'uploaded', 'fileName' => $safeName], JSON_UNESCAPED_UNICODE);
        $pdo->prepare(
            "INSERT INTO `task_activities` (`task_id`, `kind`, `event_type`, `author_name`, `meta_json`)
             VALUES (?, 'state_change', 'file_uploaded', ?, ?)"
        )->execute([$taskId, $userName, $metaJson]);
    } catch (\Throwable $e) {
        // Non-fatal: audit log failure shouldn't break upload
    }

    $rowStmt = $pdo->prepare("SELECT * FROM `task_files` WHERE `id` = ? LIMIT 1");
    $rowStmt->execute([$fileId]);
    $created = $rowStmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'file' => $created ? ccrm_task_file_to_json($created) : null,
        'fileCount' => $fileCount,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$jsonBody = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
if (!is_array($jsonBody)) {
    $fail(400, 'Invalid JSON payload.');
}
$postAction = trim((string)($jsonBody['action'] ?? ''));
if ($postAction !== 'delete') {
    $fail(400, 'Unknown action.');
}

$taskId = trim((string)($jsonBody['taskId'] ?? ''));
$fileId = trim((string)($jsonBody['fileId'] ?? ''));
$assertTaskVisible($taskId);
if ($fileId === '' || strlen($fileId) > 64) {
    $fail(400, 'Valid fileId is required.');
}

$stmt = $pdo->prepare("SELECT * FROM `task_files` WHERE `id` = ? AND `task_id` = ? AND `deleted_at` IS NULL LIMIT 1");
$stmt->execute([$fileId, $taskId]);
$fileRow = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$fileRow) {
    $fail(404, 'File not found.');
}
if (!$isAdmin && strcasecmp((string)$fileRow['uploaded_by'], $userName) !== 0) {
    $fail(403, 'Only the uploader or an Admin can delete this file.');
}

$path = ccrm_task_files_private_path((string)$fileRow['storage_name']);

try {
    $pdo->beginTransaction();
    $pdo->prepare("UPDATE `task_files` SET `deleted_at` = NOW() WHERE `id` = ? AND `task_id` = ?")
        ->execute([$fileId, $taskId]);

    $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM `task_files` WHERE `task_id` = ? AND `deleted_at` IS NULL");
    $cntStmt->execute([$taskId]);
    $fileCount = (int)$cntStmt->fetchColumn();

    $pdo->prepare("UPDATE `tasks` SET `file_count` = ?, `updated_at` = `updated_at` WHERE `id` = ? AND " . ccrm_sql_real_tasks())
        ->execute([$fileCount, $taskId]);
    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    ccrm_log_exception($e);
    $fail(500, 'Failed to delete file.');
}

if ($path !== null) {
    @unlink($path);
}

try {
    ccrm_migrate_task_activities($pdo);
    $metaJson = json_encode(['field' => 'file', 'action' => 'deleted', 'fileName' => (string)$fileRow['file_name']], JSON_UNESCAPED_UNICODE);
    $pdo->prepare(
        "INSERT INTO `task_activities` (`task_id`, `kind`, `event_type`, `author_name`, `meta_json`)
         VALUES (?, 'state_change', 'file_deleted', ?, ?)"
    )->execute([$taskId, $userName, $metaJson]);
} catch (\Throwable $e) {
    // Non-fatal
}

echo json_encode([
    'success' => true,
    'fileId' => $fileId,
    'fileCount' => $fileCount,
], JSON_UNESCAPED_UNICODE);
