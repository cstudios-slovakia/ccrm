<?php
require_once __DIR__ . '/api/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

// SECURITY: only authenticated users may upload files.
ccrm_require_auth();

if (!isset($_FILES['file']) || !isset($_POST['eventId'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing file or eventId.']);
    exit;
}

$file = $_FILES['file'];
$eventId = preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['eventId']);
$fileName = basename($file['name']);

// Reject executable / script extensions that could be run by the web server.
$blocked = ['php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'pht', 'phar', 'cgi', 'pl', 'asp', 'aspx', 'jsp', 'sh', 'htaccess'];
$ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
if (in_array($ext, $blocked, true)) {
    http_response_code(415);
    echo json_encode(['success' => false, 'error' => 'File type not allowed.']);
    exit;
}

// Ensure uploads directory exists
$uploadDir = __DIR__ . '/uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0775, true);
}

// Prefix file name with eventId to keep it unique
$targetPath = $uploadDir . $eventId . '_' . $fileName;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    echo json_encode(['success' => true, 'fileName' => $fileName]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file.']);
}
