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

$uploadDir = ccrm_uploads_dir();

// Name file consistently: meeting_audio_{meetingId}.{ext}
$targetFileName = 'meeting_audio_' . $meetingId . '.' . $ext;
$targetPath = $uploadDir . $targetFileName;

$configFile = dirname(__DIR__) . '/config.php';
if (file_exists($configFile)) {
    require_once $configFile;
}

// The recording is written under an id the CALLER chose, so without this check any
// authenticated user could overwrite another meeting's audio just by naming its id.
// Only an existing note (which the caller may edit) or a brand-new id is accepted;
// the DB is the authority on which of the two it is.
$pdo = null;
$meetingExists = false;
try {
    if (function_exists('get_db_connection')) {
        $pdo = get_db_connection();
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM `meeting_notes` WHERE `id` = ?");
        $stmt->execute([$meetingId]);
        $meetingExists = (int)$stmt->fetchColumn() > 0;
    }
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Could not verify the meeting before saving the recording.']);
    exit;
}

if (move_uploaded_file($file['tmp_name'], $targetPath)) {
    $filePath = '/uploads/' . $targetFileName;

    // Save/update the database directly to prevent sync latency issues. A failure
    // here used to be swallowed, so the client was told the recording was saved
    // while the note had no reference to it and the audio was effectively lost.
    try {
        if ($pdo !== null) {
            if ($meetingExists) {
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
    } catch (\Throwable $e) {
        ccrm_log_exception($e);
        @unlink($targetPath);
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'The recording could not be attached to the meeting note.']);
        exit;
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
