<?php
/**
 * AI Meeting Transcription & Synthesis Endpoint.
 * Transcribes audio via gpt-transcribe and generates automated meeting minutes via GPT.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/ai_gateway.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

// SECURITY: Authenticated users only, and only with a view of a module that records audio:
// meetings, or the leads / clients whose timelines carry voice notes.
$sessionUser = ccrm_require_auth();
ccrm_gate_any($sessionUser, ['meetings', 'leads', 'clients']);

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

$input = file_get_contents('php://input');
$data = json_decode($input, true);

$meetingId = $data['meetingId'] ?? '';
$manualNotes = $data['manualNotes'] ?? '';
$audioPath = trim((string)($data['audioFile'] ?? ''));

// A voice note recorded onto a lead/client timeline entry has no meeting_notes row
// (upload_audio.php deliberately creates none for `note_event_*` ids), so it is
// transcribed straight from its stored recording. Only the exact path shape that
// upload_audio.php produces is accepted: no traversal, nothing outside uploads/.
$transcribeOnly = $audioPath !== '';

if (!$transcribeOnly && empty($meetingId)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing meetingId parameter']);
    exit;
}

if ($transcribeOnly) {
    if (!preg_match('#^/uploads/meeting_audio_[A-Za-z0-9_-]+\.(webm|mp3|wav|ogg|m4a|mp4|mpga)$#', $audioPath)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid audioFile path']);
        exit;
    }
    $audioFile = $audioPath;
} else {
    try {
        $pdo = get_db_connection();
    } catch (\Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
        exit;
    }

    // Fetch meeting details to find the audio file
    $stmt = $pdo->prepare("SELECT * FROM `meeting_notes` WHERE `id` = ?");
    $stmt->execute([$meetingId]);
    $meeting = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$meeting) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Meeting note not found']);
        exit;
    }

    $audioFile = $meeting['audio_file'] ?? '';
    if (empty($audioFile)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'This meeting does not have an associated audio recording']);
        exit;
    }
}

// Resolve physical file path
$localPath = dirname(__DIR__) . $audioFile;
if (!file_exists($localPath)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Audio file not found on disk at ' . $audioFile]);
    exit;
}

// Fetch integrations config to get OpenAI API key
if (!isset($pdo)) {
    try {
        $pdo = get_db_connection();
    } catch (\Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
        exit;
    }
}
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
$integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];

// --- STEP 1: Audio Transcription (OpenAI Whisper or Gemini connector) ---
$mimeType = 'audio/webm';
$ext = strtolower(pathinfo($localPath, PATHINFO_EXTENSION));
if ($ext === 'mp3') $mimeType = 'audio/mp3';
elseif ($ext === 'wav') $mimeType = 'audio/wav';
elseif ($ext === 'm4a') $mimeType = 'audio/m4a';
elseif ($ext === 'mp4') $mimeType = 'audio/mp4';
elseif ($ext === 'ogg') $mimeType = 'audio/ogg';

$tRes = ccrm_ai_transcribe_audio($pdo, $localPath, $mimeType, [
    'filename' => basename($localPath),
    'timeout' => 90,
    'integrationsConfig' => $integrationsConfig,
]);

if (empty($tRes['ok'])) {
    $status = (($tRes['code'] ?? '') === 'ai_key_missing') ? 400 : 500;
    http_response_code($status);
    echo json_encode([
        'success' => false,
        'code' => $tRes['code'] ?: 'ai_error',
        'message' => 'Transcription Error: ' . ($tRes['error'] ?: 'Audio transcription failed'),
    ]);
    exit;
}

$transcription = trim((string)($tRes['text'] ?? ''));
if (($tRes['provider'] ?? '') === 'openai') {
    $whisperJson = is_array($tRes['raw'] ?? null) ? $tRes['raw'] : [];
    $audioSeconds = ccrm_ai_resolve_audio_seconds($whisperJson, $localPath, $data['durationSeconds'] ?? null);
    if ($audioSeconds > 0) {
        ccrm_ai_record_usage($pdo, $transcribeOnly ? 'voice_note' : 'meeting_transcription', 'gpt-transcribe', 0, 0, 0, 0, 0, $audioSeconds);
    } else {
        ccrm_ai_capture_usage($pdo, $transcribeOnly ? 'voice_note' : 'meeting_transcription', $whisperJson, 'gpt-transcribe');
    }
} elseif (!empty($tRes['raw']) && is_array($tRes['raw'])) {
    ccrm_ai_capture_usage($pdo, $transcribeOnly ? 'voice_note' : 'meeting_transcription', $tRes['raw'], (string)$tRes['model']);
}

if (empty($transcription)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'code' => 'ai_empty', 'message' => 'Transcription returned empty text.']);
    exit;
}

// A timeline voice note only needs the text; the minutes/summary step below is
// for meetings and is one more call that could fail after the transcript exists.
if ($transcribeOnly) {
    echo json_encode(['success' => true, 'transcription' => $transcription]);
    exit;
}

// --- STEP 2: AI Synthesis ---
$prompt = "You are an expert CRM assistant. You are given a raw audio transcription and the user's manual notes from a meeting.
Your task is to compile a highly professional, detailed, and structured meeting minutes document in Markdown format, plus a concise summary, sentiment analysis, key topics, and action items.

You MUST detect the language in which the transcription and manual notes are written. Output the automatedNotes (detailed minutes in Markdown), summary, and action items in that SAME language (e.g., Slovak if notes are in Slovak, Hungarian if in Hungarian, English if in English).

You MUST respond ONLY with a valid JSON object matching the following structure:
{
  \"automatedNotes\": \"### Meeting Title\\nDetailed, professional meeting minutes in Markdown format, detailing discussed topics, decisions made, and follow-up notes.\",
  \"summary\": \"Concise 2-3 sentence overview.\",
  \"sentiment\": \"positive\" | \"neutral\" | \"negative\",
  \"topics\": [\"topic1\", \"topic2\", ...],
  \"actionItems\": [\"action1\", \"action2\", ...]
}

Do not wrap the JSON output in markdown code blocks or add any text outside of the JSON object.

Transcription:
" . $transcription . "

Manual Notes:
" . $manualNotes;

$transcribeModel = ccrm_ai_model($integrationsConfig);
$aiRes = ccrm_ai_chat_completion(
    $pdo,
    [
        'model' => $transcribeModel,
        'messages' => [
            [
                'role' => 'user',
                'content' => $prompt
            ]
        ],
        'temperature' => 0.4,
    ],
    [
        'feature' => 'meeting_minutes',
        'timeout' => 45,
        'integrationsConfig' => $integrationsConfig,
    ]
);

if (empty($aiRes['ok'])) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'code' => $aiRes['code'] ?: 'ai_error',
        'message' => 'AI Synthesis Error: ' . ($aiRes['error'] ?: 'AI Chat Completion request failed'),
        'providerMessage' => $aiRes['error'] ?? '',
    ]);
    exit;
}

$aiReply = (string)($aiRes['content'] ?? '');

// Try parsing AI reply to verify it's valid JSON
$cleanedReply = trim(preg_replace('/^```json|```$/i', '', trim($aiReply)));
$aiJson = json_decode($cleanedReply, true);

if (!$aiJson || empty($aiJson['summary'])) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to parse AI response as valid JSON.',
        'raw_reply' => $aiReply
    ]);
    exit;
}

// Return the transcription and synthesis results
echo json_encode([
    'success' => true,
    'transcription' => $transcription,
    'automatedNotes' => $aiJson['automatedNotes'] ?? '',
    'summary' => $aiJson['summary'],
    'sentiment' => $aiJson['sentiment'] ?? 'neutral',
    'topics' => $aiJson['topics'] ?? [],
    'actionItems' => $aiJson['actionItems'] ?? []
]);
