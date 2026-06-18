<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }

    // SECURITY: only authenticated users may delete files.
    ccrm_require_auth();
}

$input = file_get_contents('php://input');
$payload = json_decode($input, true);
$fileName = $payload['fileName'] ?? '';

if (empty($fileName)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing fileName parameter']);
    exit;
}

// Security check: strictly validate the filename to prevent directory traversal
$fileName = basename($fileName);

$uploadDir = dirname(__DIR__) . '/uploads/';
$filePath = $uploadDir . $fileName;

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
