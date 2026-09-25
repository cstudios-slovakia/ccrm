<?php
/**
 * AI Voice Task Transcription & Task Extraction Endpoint.
 * Transcribes audio via OpenAI Whisper and parses structured CRM task(s) via OpenAI GPT.
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
$sessionUser = ccrm_require_auth();

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// Fetch integrations config to get OpenAI API key
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
$integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];
$openAiKey = trim((string)($integrationsConfig['openAiKey'] ?? ''));

// Check if audio file was uploaded in $_FILES or transcription text is sent directly
$transcription = '';
$rawText = trim((string)($_POST['text'] ?? ''));
if (empty($rawText)) {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $jsonData = json_decode($rawInput, true);
        if (!empty($jsonData['text'])) {
            $rawText = trim((string)$jsonData['text']);
        }
    }
}

if (!empty($rawText)) {
    $transcription = $rawText;
} elseif (isset($_FILES['audio'])) {
    if (empty($openAiKey)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'OpenAI API Key is not configured in Settings.']);
        exit;
    }

    $file = $_FILES['audio'];
    $fileName = basename($file['name'] ?? 'audio.webm');
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
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
    $tempFileName = 'voice_task_' . time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    $targetPath = $uploadDir . $tempFileName;

    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to save audio recording on server.']);
        exit;
    }

    // Step 1: Whisper transcription
    $mimeType = 'audio/webm';
    if ($ext === 'mp3') $mimeType = 'audio/mp3';
    elseif ($ext === 'wav') $mimeType = 'audio/wav';
    elseif ($ext === 'm4a') $mimeType = 'audio/m4a';
    elseif ($ext === 'mp4') $mimeType = 'audio/mp4';
    elseif ($ext === 'ogg') $mimeType = 'audio/ogg';

    $cFile = new CURLFile($targetPath, $mimeType, basename($targetPath));
    $whisperPayload = [
        'file' => $cFile,
        'model' => 'whisper-1'
    ];

    $ch = curl_init('https://api.openai.com/v1/audio/transcriptions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
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

    // Clean up temporary audio file after transcription
    @unlink($targetPath);

    if ($httpCode !== 200 || !$whisperResponse) {
        $errData = json_decode($whisperResponse, true);
        $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI Whisper API request failed');
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Whisper Transcription Error: ' . $errMsg]);
        exit;
    }

    $whisperJson = json_decode($whisperResponse, true);
    $transcription = trim((string)($whisperJson['text'] ?? ''));

    if (empty($transcription)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Whisper returned empty transcription text.']);
        exit;
    }
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing audio file or text']);
    exit;
}

// Step 2: Parse structured Task(s) using GPT
$knownUsers = [];
try {
    $uStmt = $pdo->query("SELECT `name` FROM `users` WHERE `status` = 'active'");
    $knownUsers = $uStmt->fetchAll(PDO::FETCH_COLUMN);
} catch (\Throwable $e) {
    // ignore
}

// User-provided context (today's date, preferred language, known users from client if available)
$todayDate = $_POST['today'] ?? date('Y-m-d');
$todayDayOfWeek = date('l', strtotime($todayDate));
$userContextList = !empty($_POST['users']) ? json_decode($_POST['users'], true) : $knownUsers;
if (!is_array($userContextList)) $userContextList = $knownUsers;
$usersString = implode(', ', array_unique(array_filter($userContextList)));

$parsedTasks = [];

if (!empty($openAiKey)) {
    $prompt = "You are an intelligent CRM task assistant. The user recorded a voice memo to create one or more tasks.
Analyze the transcribed voice recording and extract the structured task(s).

Current Date Reference: {$todayDate} ({$todayDayOfWeek}).
Available Team Members in CRM: {$usersString}.

Instructions:
1. Detect the language of the voice memo (e.g. Slovak, Hungarian, English, Czech, etc.).
2. The task 'title' must be a clean, concise, actionable task title in the SAME language spoken by the user.
3. If the user mentions notes or extra details, put them in 'description' (in the same language).
4. 'priority' must be one of: 'low', 'medium', 'high'. (If user mentions words like 'súrne', 'dôležité', 'urgent', 'nagyon fontos', 'urgentné', set to 'high'. Default to 'medium').
5. 'deadline': Calculate the date in 'YYYY-MM-DD' format relative to today ({$todayDate}).
   - If user says 'dnes' / 'today' / 'ma' -> '{$todayDate}'
   - If user says 'zajtra' / 'tomorrow' / 'holnap' -> next day
   - If user mentions a specific day (e.g. 'v piatok', 'on Friday', 'pénteken', 'do konca týždňa', '30-eho') calculate the upcoming date.
   - If no date is mentioned, default to '{$todayDate}'.
6. 'deadlineTime': If user mentions a specific time ('o 14:00', 'at 3pm', '15:30-kor', 'ráno o deviatej'), format as 'HH:MM' (24-hour format like '14:00'). Otherwise set to null.
7. 'assignedTo': If user mentions assigning to a team member (e.g. 'priraď Petrovi', 'assign to John', 'add to Roland'), match the name to the closest member in the Available Team Members list. Otherwise null.
8. If the voice memo contains multiple distinct tasks, output multiple objects in the 'tasks' array. Otherwise output 1 task object.

Respond ONLY with valid JSON in this exact structure:
{
  \"tasks\": [
    {
      \"title\": \"Task Title\",
      \"description\": \"Optional notes or details\",
      \"priority\": \"low\" | \"medium\" | \"high\",
      \"deadline\": \"YYYY-MM-DD\",
      \"deadlineTime\": \"HH:MM\" or null,
      \"assignedTo\": \"Member Name\" or null
    }
  ]
}

Transcription:
" . $transcription;

    $aiModel = ccrm_ai_model();
    $gptPayload = [
        'model' => $aiModel,
        'messages' => [
            ['role' => 'user', 'content' => $prompt]
        ]
    ];
    if (ccrm_ai_model_supports_temperature($aiModel)) {
        $gptPayload['temperature'] = 0.2;
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

    if ($httpCode === 200 && $gptResponse) {
        $gptJson = json_decode($gptResponse, true);
        $aiReply = $gptJson['choices'][0]['message']['content'] ?? '';
        $cleanedReply = trim(preg_replace('/^```json|```$/i', '', trim($aiReply)));
        $aiJson = json_decode($cleanedReply, true);
        if (!empty($aiJson['tasks']) && is_array($aiJson['tasks'])) {
            $parsedTasks = $aiJson['tasks'];
        }
    }
}

// Fallback if GPT parsing failed but transcription exists
if (empty($parsedTasks)) {
    $parsedTasks = [
        [
            'title' => mb_substr($transcription, 0, 120),
            'description' => strlen($transcription) > 120 ? $transcription : '',
            'priority' => 'medium',
            'deadline' => $todayDate,
            'deadlineTime' => null,
            'assignedTo' => null
        ]
    ];
}

echo json_encode([
    'success' => true,
    'transcription' => $transcription,
    'tasks' => $parsedTasks
]);
