<?php
/**
 * Handles uploading meeting audio recordings.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

// SECURITY: Only authenticated users can upload recordings
ccrm_require_auth();

if (!isset($_FILES['audio']) || !isset($_POST['meetingId'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing audio file or meetingId']);
    exit;
}

$meetingId = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['meetingId']);
if (empty($meetingId)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid meetingId']);
    exit;
}

$file = $_FILES['audio'];
$fileName = basename($file['name']);
$ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

// Fallback to webm if no extension is detected
if (empty($ext)) {
    $ext = 'webm';
}

$allowedExtensions = ['webm', 'mp3', 'wav', 'ogg', 'm4a', 'mp4', 'mpga'];
if (!in_array($ext, $allowedExtensions, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid audio format. Allowed: ' . implode(', ', $allowedExtensions)]);
    exit;
}

// Ensure uploads directory exists
$uploadDir = dirname(__DIR__) . '/uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0775, true);
}

// Name file consistently: meeting_audio_{meetingId}.{ext}
$targetFileName = 'meeting_audio_' . $meetingId . '.' . $ext;
$targetPath = $uploadDir . $targetFileName;

$configFile = dirname(__DIR__) . '/config.php';
if (file_exists($configFile)) {
    require_once $configFile;
}

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    $filePath = '/uploads/' . $targetFileName;
    
    // Save/update the database directly to prevent sync latency issues
    try {
        if (function_exists('get_db_connection')) {
            $pdo = get_db_connection();
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `meeting_notes` WHERE `id` = ?");
            $stmt->execute([$meetingId]);
            $exists = $stmt->fetchColumn() > 0;
            
            if ($exists) {
                $stmt = $pdo->prepare("UPDATE `meeting_notes` SET `audio_file` = ? WHERE `id` = ?");
                $stmt->execute([$filePath, $meetingId]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO `meeting_notes` (`id`, `title`, `date`, `duration`, `notes`, `audio_file`) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([
                    $meetingId,
                    'Untitled Note',
                    date('Y-m-d'),
                    0,
                    '[]',
                    $filePath
                ]);
            }
        }
    } catch (\Exception $e) {
        // Silently log or ignore db error during direct save
    }

    echo json_encode([
        'success' => true,
        'message' => 'Audio uploaded successfully',
        'filePath' => $filePath
    ]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to save audio recording on server.']);
}
