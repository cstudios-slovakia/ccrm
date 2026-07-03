<?php
/**
 * AI Meeting Transcription & Synthesis Endpoint.
 * Transcribes audio via Whisper and generates automated meeting minutes via GPT.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

// SECURITY: Authenticated users only
ccrm_require_auth();

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

if (empty($meetingId)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing meetingId parameter']);
    exit;
}

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
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

// Resolve physical file path
$localPath = dirname(__DIR__) . $audioFile;
if (!file_exists($localPath)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Audio file not found on disk at ' . $audioFile]);
    exit;
}

// Fetch integrations config to get OpenAI API key
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
$openAiKey = $integrationsConfig['openAiKey'] ?? '';

if (empty($openAiKey)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'OpenAI API Key is not configured.']);
    exit;
}

// --- STEP 1: Whisper Transcription ---
$mimeType = 'audio/webm';
$ext = strtolower(pathinfo($localPath, PATHINFO_EXTENSION));
if ($ext === 'mp3') $mimeType = 'audio/mp3';
elseif ($ext === 'wav') $mimeType = 'audio/wav';
elseif ($ext === 'm4a') $mimeType = 'audio/m4a';
elseif ($ext === 'mp4') $mimeType = 'audio/mp4';

$cFile = new CURLFile($localPath, $mimeType, basename($localPath));

$whisperPayload = [
    'file' => $cFile,
    'model' => 'whisper-1'
];

$ch = curl_init('https://api.openai.com/v1/audio/transcriptions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 90); // Audio files can take longer to process
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $openAiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, $whisperPayload);

$whisperResponse = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($httpCode !== 200 || !$whisperResponse) {
    $errData = json_decode($whisperResponse, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI Whisper API request failed');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Whisper Transcription Error: ' . $errMsg]);
    exit;
}

$whisperJson = json_decode($whisperResponse, true);
$transcription = $whisperJson['text'] ?? '';

if (empty($transcription)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Whisper returned empty transcription text.']);
    exit;
}

// --- STEP 2: GPT Synthesis ---
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

$gptPayload = [
    'model' => 'gpt-4o-mini',
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ],
    'temperature' => 0.4
];

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($gptPayload, JSON_INVALID_UTF8_SUBSTITUTE));

$gptResponse = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($httpCode !== 200 || !$gptResponse) {
    $errData = json_decode($gptResponse, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI Chat Completion API request failed');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'AI Synthesis Error: ' . $errMsg]);
    exit;
}

$gptJson = json_decode($gptResponse, true);
$aiReply = $gptJson['choices'][0]['message']['content'] ?? '';

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
