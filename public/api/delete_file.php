<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

/**
 * Record who removed which upload.
 *
 * This endpoint deletes by filename with no ownership model — any authenticated
 * user can remove any file in uploads/, which mirrors how the CRM treats
 * documents (shared across the workspace) but leaves no trace of who did it.
 * An audit entry is the proportionate control here; adding per-file ownership
 * would need a schema and UI change beyond a security fix.
 */
function ccrm_audit_log_file_delete(array $actor, string $fileName): void {
    try {
        $pdo = ccrm_auth_pdo();
        if ($pdo !== null) {
            ccrm_audit_log($pdo, $actor, 'file.delete', $fileName);
        }
    } catch (\Throwable $e) {
        error_log('[ccrm delete_file] audit failed: ' . $e->getMessage());
    }
}

$sessionUser = null;
if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }

    // SECURITY: only authenticated users may delete files.
    $sessionUser = ccrm_require_auth();
}

$input = file_get_contents('php://input');
$payload = json_decode($input, true);
$fileName = $payload['fileName'] ?? '';

if (empty($fileName)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing fileName parameter']);
    exit;
}

// Security check: strictly validate the filename to prevent directory traversal.
// basename() alone stops `../`, but the resolved path is re-checked against the
// uploads root below so a symlink inside uploads/ cannot redirect the unlink.
$fileName = basename(str_replace(["\0", '\\'], ['', '/'], (string)$fileName));
if ($fileName === '' || $fileName === '.' || $fileName === '..') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid fileName parameter']);
    exit;
}

$uploadDir = ccrm_uploads_dir();
$filePath = $uploadDir . $fileName;

// Never delete the directory's own guard file — it is what keeps uploads/ from
// executing what it stores.
if ($fileName === '.htaccess') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'This file cannot be deleted.']);
    exit;
}

$realBase = realpath($uploadDir);
$realTarget = realpath($filePath);
if ($realTarget !== false && ($realBase === false || strpos($realTarget, $realBase) !== 0)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'This file cannot be deleted.']);
    exit;
}

if ($sessionUser !== null) {
    ccrm_audit_log_file_delete($sessionUser, $fileName);
}

if (file_exists($filePath)) {
    if (unlink($filePath)) {
        echo json_encode(['success' => true, 'message' => 'File deleted successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to delete file from disk']);
    }
} else {
    // If the file doesn't exist on disk, we can still report success to clean up database state
    echo json_encode(['success' => true, 'message' => 'File not found on disk, proceeding with database sync cleanup']);
}
