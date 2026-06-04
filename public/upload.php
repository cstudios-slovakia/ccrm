<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

if (!isset($_FILES['file']) || !isset($_POST['eventId'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing file or eventId.']);
    exit;
}

$file = $_FILES['file'];
$eventId = preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['eventId']);
$fileName = basename($file['name']);

// Ensure uploads directory exists
$uploadDir = __DIR__ . '/uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

// Prefix file name with eventId to keep it unique
$targetPath = $uploadDir . $eventId . '_' . $fileName;

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    echo json_encode(['success' => true, 'fileName' => $fileName]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file.']);
}
