<?php
/**
 * AI Voice Task Transcription & Task Extraction Endpoint.
 * Transcribes audio via OpenAI gpt-transcribe and parses structured CRM task(s) via OpenAI GPT.
 */
require_once __DIR__ . '/brand.php';
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

// SECURITY: Authenticated users only
$sessionUser = ccrm_require_auth();
// A transcribed task is a task about to be created.
ccrm_gate($sessionUser, 'tasks', 'edit');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => (KOPERNIQ_PRODUCT_NAME . ' is not installed yet.')]);
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

    // Step 1: Transcribe audio via configured provider (OpenAI Whisper or Gemini connector)
    $mimeType = 'audio/webm';
    if ($ext === 'mp3') $mimeType = 'audio/mp3';
    elseif ($ext === 'wav') $mimeType = 'audio/wav';
    elseif ($ext === 'm4a') $mimeType = 'audio/m4a';
    elseif ($ext === 'mp4') $mimeType = 'audio/mp4';
    elseif ($ext === 'ogg') $mimeType = 'audio/ogg';

    $tRes = ccrm_ai_transcribe_audio($pdo, $targetPath, $mimeType, [
        'filename' => basename($targetPath),
        'timeout' => 60,
        'integrationsConfig' => $integrationsConfig,
    ]);

    if (!empty($tRes['ok'])) {
        if (($tRes['provider'] ?? '') === 'openai') {
            $whisperForUsage = is_array($tRes['raw'] ?? null) ? $tRes['raw'] : [];
            $taskAudioSeconds = ccrm_ai_resolve_audio_seconds($whisperForUsage, $targetPath, $_POST['durationSeconds'] ?? null);
            if ($taskAudioSeconds > 0) {
                ccrm_ai_record_usage($pdo, 'task_transcription', 'gpt-transcribe', 0, 0, 0, 0, 0, $taskAudioSeconds);
            } else {
                ccrm_ai_capture_usage($pdo, 'task_transcription', $whisperForUsage, 'gpt-transcribe');
            }
        } elseif (!empty($tRes['raw']) && is_array($tRes['raw'])) {
            ccrm_ai_capture_usage($pdo, 'task_transcription', $tRes['raw'], (string)$tRes['model']);
        }
    }

    // Clean up temporary audio file after transcription
    @unlink($targetPath);

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

    if (empty($transcription)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'code' => 'ai_empty', 'message' => 'Nebol rozpoznaný žiadny hlasový záznam. Skúste prosím hovoriť zreteľnejšie alebo bližšie k mikrofónu.']);
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
// Lead / client names the client sent, so the memo can link the task ("call Novák about the offer").
$leadContextList = !empty($_POST['leads']) ? json_decode($_POST['leads'], true) : [];
if (!is_array($leadContextList)) $leadContextList = [];
$leadContextList = array_slice(array_values(array_unique(array_filter(array_map(function ($n) {
    return is_string($n) ? trim(mb_substr($n, 0, 120)) : '';
}, $leadContextList)))), 0, 400);
$leadsString = $leadContextList ? implode('; ', $leadContextList) : '(none)';

$parsedTasks = [];

if (ccrm_ai_is_configured($pdo, $integrationsConfig)) {
    $prompt = "You are an intelligent CRM task assistant. The user recorded a voice memo to create one or more tasks.
Analyze the transcribed voice recording and extract the structured task(s).

Current Date Reference: {$todayDate} ({$todayDayOfWeek}).
Available Team Members in CRM: {$usersString}.
Known Leads / Clients in CRM: {$leadsString}.

CRITICAL LANGUAGE REQUIREMENT:
- You MUST write the task 'title' and 'description' in the EXACT SAME LANGUAGE that the user spoke in the voice memo (e.g. Slovak, Hungarian, English, Czech, German, etc.).
- NEVER translate the task title or description into another language. If spoken in Slovak, output in Slovak. If spoken in Hungarian, output in Hungarian. If spoken in English, output in English. If spoken in Czech, output in Czech.

Instructions:
1. Detect the spoken language of the voice memo.
2. The task 'title' must be a clean, concise, actionable task title in the SAME language spoken by the user.
3. If the user mentions notes or extra details, put them in 'description' in the same language.
4. 'priority' must be one of: 'low', 'medium', 'high'. (If user mentions words like 'súrne', 'dôležité', 'urgent', 'nagyon fontos', 'urgentné', set to 'high'. Default to 'medium').
5. 'deadline': Calculate the date in 'YYYY-MM-DD' format relative to today ({$todayDate}).
   - If user says 'dnes' / 'today' / 'ma' -> '{$todayDate}'
   - If user says 'zajtra' / 'tomorrow' / 'holnap' -> next day
   - If user mentions a specific day (e.g. 'v piatok', 'on Friday', 'pénteken', 'do konca týždňa', '30-eho') calculate the upcoming date.
   - If no date is mentioned, default to '{$todayDate}'.
6. 'deadlineTime': If user mentions a specific time ('o 14:00', 'at 3pm', '15:30-kor', 'ráno o deviatej'), format as 'HH:MM' (24-hour format like '14:00'). Otherwise set to null.
7. 'assignedTo': If user mentions assigning to a team member (e.g. 'priraď Petrovi', 'assign to John', 'add to Roland', 'küldd Attilának'), match the name to the closest member in the Available Team Members list. Otherwise null.
8. 'lead': If the task is about one of the Known Leads / Clients (a company or person named in the memo), return that entry's name exactly as listed. Otherwise null.
9. If the voice memo contains multiple distinct tasks, output multiple objects in the 'tasks' array. Otherwise output 1 task object.

Respond ONLY with valid JSON in this exact structure:
{
  \"tasks\": [
    {
      \"title\": \"Task Title in the Spoken Language\",
      \"description\": \"Optional notes or details in the Spoken Language\",
      \"priority\": \"low\" | \"medium\" | \"high\",
      \"deadline\": \"YYYY-MM-DD\",
      \"deadlineTime\": \"HH:MM\" or null,
      \"assignedTo\": \"Member Name\" or null,
      \"lead\": \"Lead or Client Name\" or null
    }
  ]
}

Transcription:
" . $transcription;

    $aiModel = ccrm_ai_model($integrationsConfig);
    $aiRes = ccrm_ai_chat_completion(
        $pdo,
        [
            'model' => $aiModel,
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => 0.2,
        ],
        [
            'feature' => 'task_extraction',
            'timeout' => 30,
            'integrationsConfig' => $integrationsConfig,
        ]
    );

    if (!empty($aiRes['ok'])) {
        $aiReply = (string)($aiRes['content'] ?? '');
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
            'assignedTo' => null,
            'lead' => null
        ]
    ];
}

echo json_encode([
    'success' => true,
    'transcription' => $transcription,
    'tasks' => $parsedTasks
]);
