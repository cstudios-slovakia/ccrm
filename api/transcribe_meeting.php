<?php
/**
 * AI Meeting Transcription & Synthesis Endpoint.
 *
 * Step 1, the transcript, works with either key:
 *   - Soniox key set: Soniox async (stt-async-v6, soniox_async.php). Meetings get speaker
 *     diarization as "[mm:ss] Participant N: text" lines; voice notes get plain text.
 *     If Soniox fails and an OpenAI key exists, OpenAI takes over (without speakers).
 *   - otherwise: OpenAI gpt-transcribe, plain text.
 * Step 2, the minutes/summary, needs the OpenAI key (the configured text model). Without
 * it, or when it fails, the answer still carries the transcript, with `minutes: false`.
 */
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';

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
    echo json_encode(['success' => false, 'message' => (KOPERNIQ_PRODUCT_NAME . ' is not installed yet.')]);
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
$openAiKey = trim((string)($integrationsConfig['openAiKey'] ?? ''));
$sonioxKey = trim((string)($integrationsConfig['sonioxApiKey'] ?? ''));

// Either key transcribes. Soniox (when set) also tells speakers apart; OpenAI writes plain
// text. The minutes step further down needs the OpenAI key and is skipped without it.
if ($openAiKey === '' && $sonioxKey === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'code' => 'no_transcription_key', 'message' => 'No transcription key is configured. Add an OpenAI or Soniox API key in Settings > AI.']);
    exit;
}

// The recording may be long and Soniox is a job we wait for; never let PHP's default limit
// cut it off halfway (the browser waits up to 5 minutes).
@set_time_limit(330);

$mimeType = 'audio/webm';
$ext = strtolower(pathinfo($localPath, PATHINFO_EXTENSION));
if ($ext === 'mp3') $mimeType = 'audio/mp3';
elseif ($ext === 'wav') $mimeType = 'audio/wav';
elseif ($ext === 'm4a') $mimeType = 'audio/m4a';
elseif ($ext === 'mp4') $mimeType = 'audio/mp4';
elseif ($ext === 'ogg') $mimeType = 'audio/ogg';

$usageFeature = $transcribeOnly ? 'voice_note' : 'meeting_transcription';
$transcription = '';
$speakers = false;
$sonioxError = '';

// --- STEP 1a: Soniox (speaker diarization for meetings) ---
if ($sonioxKey !== '') {
    require_once __DIR__ . '/soniox_async.php';
    $lang = strtolower(trim((string)($data['language'] ?? '')));
    if (!in_array($lang, ['sk', 'en', 'hu'], true)) {
        $lang = 'sk';
    }
    $hints = $lang === 'en' ? ['en'] : [$lang, 'en'];
    $participantLabel = ['en' => 'Participant', 'sk' => 'Účastník', 'hu' => 'Résztvevő'][$lang];
    $refId = 'ccrm-' . ($transcribeOnly ? 'voice-note' : 'meeting') . '-' . preg_replace('/[^A-Za-z0-9_-]/', '', (string)($transcribeOnly ? basename($audioFile) : $meetingId));
    // A voice note is one person speaking; diarization would only add "Participant 1:".
    $diarize = !$transcribeOnly;
    // Names given to speakers in the live Focus helper carry over (matched by time).
    $liveTimeline = $diarize ? ccrm_soniox_clean_timeline($data['speakerTimeline'] ?? null) : null;
    $result = ccrm_soniox_transcribe_file($sonioxKey, $localPath, $mimeType, $hints, $diarize, $participantLabel, $refId, $liveTimeline);
    if ($result['ok'] && $result['text'] !== '') {
        $transcription = $result['text'];
        $speakers = $diarize;
        $audioSeconds = (float)$result['seconds'] > 0
            ? (float)$result['seconds']
            : ccrm_ai_resolve_audio_seconds([], $localPath, $data['durationSeconds'] ?? null);
        if ($audioSeconds > 0) {
            ccrm_ai_record_usage($pdo, $usageFeature, $result['model'], 0, 0, 0, 0, 0, $audioSeconds);
        }
    } else {
        $sonioxError = $result['ok'] ? 'Soniox returned an empty transcript.' : (string)$result['message'];
        if ($openAiKey === '') {
            http_response_code(502);
            echo json_encode(['success' => false, 'message' => 'Transcription error: ' . $sonioxError]);
            exit;
        }
        // An OpenAI key is there too: the recording still gets a transcript, without speakers.
    }
}

// --- STEP 1b: OpenAI gpt-transcribe (no Soniox key, or Soniox failed) ---
if ($transcription === '') {
    $cFile = new CURLFile($localPath, $mimeType, basename($localPath));

    $whisperPayload = [
        'file' => $cFile,
        'model' => 'gpt-transcribe'
    ];

    $ch = curl_init('https://api.openai.com/v1/audio/transcriptions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 90); // Audio files can take longer to process
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
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
        echo json_encode(['success' => false, 'message' => 'Whisper Transcription Error: ' . $errMsg . ($sonioxError !== '' ? ' (Soniox: ' . $sonioxError . ')' : '')]);
        exit;
    }

    $whisperJson = json_decode($whisperResponse, true);
    $transcription = $whisperJson['text'] ?? '';
    $audioSeconds = ccrm_ai_resolve_audio_seconds($whisperJson, $localPath, $data['durationSeconds'] ?? null);
    if ($audioSeconds > 0) {
        ccrm_ai_record_usage($pdo, $usageFeature, 'gpt-transcribe', 0, 0, 0, 0, 0, $audioSeconds);
    } else {
        ccrm_ai_capture_usage($pdo, $usageFeature, $whisperJson, 'gpt-transcribe');
    }

    if (empty($transcription)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Whisper returned empty transcription text.']);
        exit;
    }
}

// A timeline voice note only needs the text; the minutes/summary step below is
// for meetings and is one more call that could fail after the transcript exists.
if ($transcribeOnly) {
    echo json_encode(['success' => true, 'transcription' => $transcription]);
    exit;
}

// Without an OpenAI key there is no text model for the minutes: the meeting still gets its
// transcript, and the summary can be generated later once a key is added.
if ($openAiKey === '') {
    echo json_encode([
        'success' => true,
        'transcription' => $transcription,
        'speakers' => $speakers,
        'minutes' => false,
    ]);
    exit;
}

// --- STEP 2: GPT Synthesis ---
$prompt = ("You are an expert " . KOPERNIQ_PRODUCT_NAME . " assistant. You are given a raw audio transcription and the user's manual notes from a meeting.
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
") . ($speakers ? "
Transcription lines start with a timestamp and a speaker label: a person's name or a label such as \"Participant 1:\" (or its translation). Keep who said what where it matters (decisions, commitments, owners of action items), using those labels.
" : "") . "
Transcription:
" . $transcription . "

Manual Notes:
" . $manualNotes;

$transcribeModel = ccrm_ai_model();
$gptPayload = [
    'model' => $transcribeModel,
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ],
];
if (ccrm_ai_model_supports_temperature($transcribeModel)) {
    $gptPayload['temperature'] = 0.4;
}

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($gptPayload, JSON_INVALID_UTF8_SUBSTITUTE));

$gptResponse = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

// From here on the transcript exists and is paid for: a failed summary returns it anyway,
// with `minutes: false`, instead of throwing it away.
if ($httpCode !== 200 || !$gptResponse) {
    $errData = json_decode($gptResponse, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI Chat Completion API request failed');
    echo json_encode([
        'success' => true,
        'transcription' => $transcription,
        'speakers' => $speakers,
        'minutes' => false,
        'minutesError' => 'AI Synthesis Error: ' . $errMsg,
    ]);
    exit;
}

$gptJson = json_decode($gptResponse, true);
ccrm_ai_capture_usage($pdo, 'meeting_minutes', $gptJson, $transcribeModel);
$aiReply = $gptJson['choices'][0]['message']['content'] ?? '';

// Try parsing AI reply to verify it's valid JSON
$cleanedReply = trim(preg_replace('/^```json|```$/i', '', trim($aiReply)));
$aiJson = json_decode($cleanedReply, true);

if (!$aiJson || empty($aiJson['summary'])) {
    echo json_encode([
        'success' => true,
        'transcription' => $transcription,
        'speakers' => $speakers,
        'minutes' => false,
        'minutesError' => 'Failed to parse AI response as valid JSON.',
    ]);
    exit;
}

// Return the transcription and synthesis results
echo json_encode([
    'success' => true,
    'transcription' => $transcription,
    'speakers' => $speakers,
    'minutes' => true,
    'automatedNotes' => $aiJson['automatedNotes'] ?? '',
    'summary' => $aiJson['summary'],
    'sentiment' => $aiJson['sentiment'] ?? 'neutral',
    'topics' => $aiJson['topics'] ?? [],
    'actionItems' => $aiJson['actionItems'] ?? []
]);
