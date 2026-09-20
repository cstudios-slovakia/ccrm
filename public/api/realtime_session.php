<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// SECURITY: Authenticated users only
ccrm_require_auth();

require_once __DIR__ . '/agent_utils.php';

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// 1. Fetch integrations config to get OpenAI API key
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
$integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];

$openAiKey = $integrationsConfig['openAiKey'] ?? '';
if (empty($openAiKey)) {
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI API key is missing. Please configure your OpenAI API Key in CRM Settings > Integrations.'
    ]);
    exit;
}

// 2. Parse request payload
$input = file_get_contents('php://input');
$payload = json_decode($input, true) ?: [];

$action = $payload['action'] ?? 'create_session';

// 2.1. WebRTC SDP Exchange Proxy Action (bypasses browser CORS & preflight blocks)
if ($action === 'exchange_sdp') {
    $sdp = $payload['sdp'] ?? '';
    $token = !empty($payload['client_secret']) ? $payload['client_secret'] : $openAiKey;

    if (empty($sdp)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'SDP offer is required.']);
        exit;
    }

    $model = !empty($payload['model']) ? $payload['model'] : 'gpt-realtime-1.5';
    $ch = curl_init('https://api.openai.com/v1/realtime/calls?model=' . urlencode($model));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/sdp',
        'Authorization: Bearer ' . $token
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $sdp);
    $answerSdp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($httpCode !== 200 && $httpCode !== 201) {
        http_response_code($httpCode >= 400 && $httpCode <= 599 ? $httpCode : 500);
        echo json_encode([
            'success' => false,
            'message' => 'OpenAI WebRTC SDP exchange failed (HTTP ' . $httpCode . '): ' . (!empty($curlErr) ? $curlErr : $answerSdp)
        ]);
        exit;
    }

    echo json_encode([
        'success' => true,
        'sdp' => $answerSdp
    ]);
    exit;
}

// 2.2. Live RAG Query Action for Voice Tools & Function Calls
if ($action === 'query_rag') {
    $query = trim($payload['query'] ?? '');
    $agentId = $payload['agent_id'] ?? 'orchestrator';
    $systemLanguage = $payload['language'] ?? 'sk';

    $ragPdo = get_rag_db_connection($integrationsConfig);
    $chatDb = $ragPdo ?: $pdo;
    if ($chatDb) {
        init_rag_db_schemas($chatDb);
    }

    try {
        $ragData = build_comprehensive_crm_rag_context($pdo, $chatDb, $query, $systemLanguage, $agentId, ['limit' => 20]);
        $resultText = !empty($ragData['raw_context']) ? $ragData['raw_context'] : $ragData['sanitized_context'];
        if (empty(trim($resultText))) {
            $resultText = "No specific CRM records found matching query: " . $query;
        }
    } catch (\Exception $e) {
        $resultText = "Error querying CRM data: " . $e->getMessage();
    }

    echo json_encode([
        'success' => true,
        'result' => $resultText
    ]);
    exit;
}

$agentId = $payload['agent_id'] ?? 'orchestrator';
$systemLanguage = $payload['language'] ?? 'sk';
$userName = trim($payload['user_name'] ?? '');

if (empty($userName)) {
    // Try to get name from session user
    $sessionUser = $_SESSION['user'] ?? [];
    $userName = $sessionUser['name'] ?? explode('@', $sessionUser['email'] ?? 'Erik')[0];
    if (empty($userName)) {
        $userName = 'Erik';
    }
}

// Connect to Chat/RAG DB for context and custom agents
$ragPdo = get_rag_db_connection($integrationsConfig);
$chatDb = $ragPdo ?: $pdo;
if ($chatDb) {
    init_rag_db_schemas($chatDb);
}

// 3. Resolve version & executive prompts
$versionCodename = 'Kiwi';
$versionFile = dirname(__DIR__, 2) . '/src/utils/version.ts';
if (!file_exists($versionFile)) {
    $versionFile = dirname(__DIR__) . '/src/utils/version.ts';
}
if (file_exists($versionFile)) {
    $vContent = @file_get_contents($versionFile);
    if ($vContent && preg_match('/VERSION_CODENAME\s*=\s*["\']([^"\']+)["\']/', $vContent, $m)) {
        $versionCodename = $m[1];
    } elseif ($vContent && preg_match('/VERSION\s*=\s*["\'][^"\']*-([^"\']+)["\']/', $vContent, $m)) {
        $versionCodename = $m[1];
    }
}

$execPrompts = get_executive_prompts();
$assignedVoice = 'alloy';
$agentName = "Executive Leader (" . $versionCodename . ")";
$agentPosition = "Executive Orchestrator & Principal Advisor";
$skillInstructions = "";

if (isset($execPrompts[$agentId])) {
    $exec = $execPrompts[$agentId];
    $agentName = $exec['name'];
    $agentPosition = $exec['position'];
    $assignedVoice = $exec['voice'] ?? 'alloy';
    $skillInstructions = $exec['prompt'];
} elseif ($agentId === 'durian' || $agentId === 'orchestrator') {
    $exec = $execPrompts['orchestrator'];
    $agentName = "Executive Leader (" . $versionCodename . ")";
    $agentPosition = "Executive Orchestrator & Principal Advisor";
    $assignedVoice = 'alloy';
    $skillInstructions = $exec['prompt'];
} elseif ($chatDb) {
    try {
        $aStmt = $chatDb->prepare("SELECT `name`, `skill_content`, `position` FROM `rag_agents` WHERE `id` = ?");
        $aStmt->execute([$agentId]);
        $customAgent = $aStmt->fetch(PDO::FETCH_ASSOC);
        if ($customAgent) {
            $agentName = $customAgent['name'];
            $agentPosition = $customAgent['position'];
            $assignedVoice = 'alloy';
            $skillInstructions = "You are " . $customAgent['name'] . " (" . $customAgent['position'] . "), an AI executive specialist with the following custom skills/instructions:\n"
                               . $customAgent['skill_content'];
        }
    } catch (\Exception $e) {}
}

if (empty($skillInstructions)) {
    $skillInstructions = "You are " . $versionCodename . ", the executive advisor. You advise with executive precision based on CRM data.";
}

// 4. Gather live CRM context across all 16 domains via comprehensive RAG engine
try {
    $ragData = build_comprehensive_crm_rag_context($pdo, $chatDb, '', $systemLanguage, $agentId, ['limit' => 32]);
    $crmContext = !empty($ragData['raw_context']) ? $ragData['raw_context'] : $ragData['sanitized_context'];
} catch (\Exception $e) {
    $crmContext = "";
}

$todayFormatted = date('l, j. F Y');
$todayDate = date('Y-m-d');
$langName = $systemLanguage === 'sk' ? 'Slovak (Slovenčina)' : ($systemLanguage === 'hu' ? 'Hungarian (Magyar)' : 'English');

// 5. Build Spoken Prompt with Proactive Greeting and Anti-Refusal Directives
$voiceSystemPrompt = $skillInstructions . "\n\n"
    . "=== VOICE CALL OPERATIONAL DIRECTIVES ===\n"
    . "1. FORMAT & TONE: You are speaking in a high-bandwidth, live real-time audio phone call with {$userName}.\n"
    . "   - Speak naturally, warmly, concisely, and with executive confidence.\n"
    . "   - Do NOT use markdown symbols, bullet points, headers, or asterisks in spoken responses — speak in complete, fluid conversational sentences.\n"
    . "   - Keep turns crisp (1-3 sentences per turn) so the user can easily interact and converse.\n\n"
    . "2. MANDATORY FIRST ACTION (PICKUP GREETING):\n"
    . "   - When this call connects, you MUST proactively speak first immediately!\n"
    . "   - Greet {$userName} warmly by name in {$langName} (e.g. 'Dobrý deň {$userName}' in Slovak, 'Üdvözlöm {$userName}' in Hungarian, or 'Hello {$userName}' in English).\n"
    . "   - Introduce yourself as {$agentName} ({$agentPosition}).\n"
    . "   - Ask what strategic priority, financial review, or business decision they would like to discuss right now.\n\n"
    . "3. LIVE DATABASE ACCESS & ANTI-REFUSAL DIRECTIVE:\n"
    . "   - You have 100% DIRECT, LIVE, REAL-TIME access to the CCRM database.\n"
    . "   - NEVER refuse a request or state that you lack real-time access or cannot check the database. All records in your prompt and available via the 'query_crm_live_data' tool are live, current CRM records.\n"
    . "   - When asked about any client (e.g. Cstudios, s.r.o., Peter Kováč), company, invoice, cashflow, task, or project, answer immediately with exact figures, dates, managers, and details from your CRM knowledge base or call the 'query_crm_live_data' tool.\n\n"
    . "4. GROUNDING IN CRM DATA:\n"
    . "   - Current system date is {$todayFormatted} ({$todayDate}).\n"
    . "   - You have live grounding in CRM operations and financial records:\n"
    . "{$crmContext}\n\n"
    . "Answer and discuss exclusively in the user's language ({$langName}). Speak clearly, decisively, and concisely.";

// 6. Request Ephemeral Client Secret from OpenAI Realtime API (GA endpoint)
$sessionConfig = [
    'type' => 'webrtc',
    'model' => 'gpt-realtime-1.5',
    'voice' => $assignedVoice,
    'instructions' => $voiceSystemPrompt,
    'tools' => [
        [
            'type' => 'function',
            'name' => 'query_crm_live_data',
            'description' => 'Searches the live CCRM database across all 16 domains for deep records, client details, financial analysis, unpaid invoices, active projects, tasks, or inventory.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'query' => [
                        'type' => 'string',
                        'description' => 'The search query or entity name, e.g. "Cstudios", "unpaid invoices", "Peter Kovac", "project budget"'
                    ]
                ],
                'required' => ['query']
            ]
        ]
    ],
    'input_audio_transcription' => [
        'model' => 'whisper-1'
    ],
    'turn_detection' => [
        'type' => 'server_vad',
        'threshold' => 0.5,
        'prefix_padding_ms' => 300,
        'silence_duration_ms' => 500
    ]
];

$sessionPayload = [
    'expires_after' => [
        'anchor' => 'created_at',
        'seconds' => 600
    ],
    'session' => $sessionConfig
];

$ch = curl_init('https://api.openai.com/v1/realtime/client_secrets');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($sessionPayload, JSON_INVALID_UTF8_SUBSTITUTE));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

// If wrapped payload wasn't accepted, try minimal client_secrets payload
if ($httpCode !== 200 && $httpCode !== 201) {
    $chRetry = curl_init('https://api.openai.com/v1/realtime/client_secrets');
    curl_setopt($chRetry, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($chRetry, CURLOPT_POST, true);
    curl_setopt($chRetry, CURLOPT_TIMEOUT, 15);
    curl_setopt($chRetry, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($chRetry, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($chRetry, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $openAiKey
    ]);
    curl_setopt($chRetry, CURLOPT_POSTFIELDS, json_encode([
        'expires_after' => ['anchor' => 'created_at', 'seconds' => 600]
    ]));
    $retryRes = curl_exec($chRetry);
    $retryCode = curl_getinfo($chRetry, CURLINFO_HTTP_CODE);
    curl_close($chRetry);

    if ($retryCode === 200 || $retryCode === 201) {
        $response = $retryRes;
        $httpCode = $retryCode;
    }
}

if ($httpCode !== 200 && $httpCode !== 201) {
    $errData = json_decode($response, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI Realtime API error');
    http_response_code($httpCode >= 400 && $httpCode <= 599 ? $httpCode : 500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to initialize OpenAI Realtime session (HTTP ' . $httpCode . '): ' . $errMsg
    ]);
    exit;
}

$sessionData = json_decode($response, true);
$clientSecret = $sessionData['value'] ?? $sessionData['client_secret']['value'] ?? $sessionData['client_secret'] ?? $sessionData['id'] ?? '';

if (empty($clientSecret)) {
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI Realtime API did not return an ephemeral client secret token.'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'client_secret' => $clientSecret,
    'session_id' => $sessionData['id'] ?? '',
    'voice' => $assignedVoice,
    'agent_name' => $agentName,
    'agent_position' => $agentPosition,
    'user_name' => $userName,
    'language' => $systemLanguage,
    'instructions' => $voiceSystemPrompt
]);
