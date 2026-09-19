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

// 4. Gather live CRM context
list($to_placeholder, $to_real) = get_sanitization_maps($pdo);
$sanitized_context = "";

try {
    $context_blocks = [];
    
    // Overview metrics
    $total_leads = $pdo->query("SELECT COUNT(*) FROM `leads`")->fetchColumn();
    $total_projects = $pdo->query("SELECT COUNT(*) FROM `projects`")->fetchColumn();
    $total_clients = $pdo->query("SELECT COUNT(*) FROM `clients`")->fetchColumn();
    
    $overview_block = "CRM EXECUTIVE OVERVIEW METRICS:\n";
    $overview_block .= "- Total Leads in Pipeline: {$total_leads}\n";
    $overview_block .= "- Total Active Projects: {$total_projects}\n";
    $overview_block .= "- Total Registered Clients: {$total_clients}\n";
    $context_blocks[] = ['text' => $overview_block, 'is_match' => true];

    // Financial Overview
    try {
        $fin_count = $pdo->query("SELECT COUNT(*) FROM `financial_records`")->fetchColumn();
        if ($fin_count > 0) {
            $incStmt = $pdo->query("SELECT SUM(`amount`) FROM `financial_records` WHERE `type` = 'income' AND `status` = 'paid'");
            $total_income = (float)($incStmt->fetchColumn() ?: 0);

            $expStmt = $pdo->query("SELECT SUM(`amount`) FROM `financial_records` WHERE `type` = 'expense' AND `status` = 'paid'");
            $total_expenses = (float)($expStmt->fetchColumn() ?: 0);

            $recStmt = $pdo->query("SELECT SUM(`amount`) FROM `financial_records` WHERE `type` = 'income' AND `status` = 'unpaid'");
            $unpaid_income = (float)($recStmt->fetchColumn() ?: 0);

            $payStmt = $pdo->query("SELECT SUM(`amount`) FROM `financial_records` WHERE `type` = 'expense' AND `status` = 'unpaid'");
            $unpaid_expenses = (float)($payStmt->fetchColumn() ?: 0);

            $fin_block = "FINANCIAL MANAGEMENT OVERVIEW:\n";
            $fin_block .= "- Total Paid Income: €" . number_format($total_income, 2, '.', ' ') . "\n";
            $fin_block .= "- Total Paid Expenses: €" . number_format($total_expenses, 2, '.', ' ') . "\n";
            $fin_block .= "- Net Operating Balance: €" . number_format($total_income - $total_expenses, 2, '.', ' ') . "\n";
            $fin_block .= "- Outstanding Receivables (Unpaid Invoices): €" . number_format($unpaid_income, 2, '.', ' ') . "\n";
            $fin_block .= "- Pending Payables (Unpaid Vendor Bills): €" . number_format($unpaid_expenses, 2, '.', ' ') . "\n";
            $context_blocks[] = ['text' => $fin_block, 'is_match' => true];
        }
    } catch (\Exception $e) {}

    // Top recent projects
    try {
        $projStmt = $pdo->query("SELECT `id`, `name`, `status`, `price`, `deadline` FROM `projects` ORDER BY `id` DESC LIMIT 10");
        $projs = $projStmt->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($projs)) {
            $pb = "KEY ACTIVE PROJECTS:\n";
            foreach ($projs as $p) {
                $pb .= "- Project: " . $p['name'] . " | Status: " . $p['status'] . " | Price: €" . ($p['price'] ?: '0') . " | Deadline: " . ($p['deadline'] ?: 'TBD') . "\n";
            }
            $context_blocks[] = ['text' => $pb, 'is_match' => true];
        }
    } catch (\Exception $e) {}

    // Episodic decisions
    $episodicDecisions = get_episodic_decisions($pdo, $chatDb, $userName, 8);
    if (!empty($episodicDecisions)) {
        $db = "PAST EXECUTIVE DECISIONS & COMMITMENTS:\n";
        foreach ($episodicDecisions as $d) {
            $db .= "- [" . strtoupper($d['domain'] ?? 'STRATEGY') . "] " . ($d['title'] ?? 'Decision') . ": " . ($d['summary'] ?? '') . "\n";
        }
        $context_blocks[] = ['text' => $db, 'is_match' => true];
    }

    $raw_context = "";
    foreach ($context_blocks as $b) {
        $raw_context .= $b['text'] . "\n";
    }
    $sanitized_context = sanitize_text($raw_context, $to_placeholder);
} catch (\Exception $e) {
    // Context fallback
}

$todayFormatted = date('l, j. F Y');
$todayDate = date('Y-m-d');
$langName = $systemLanguage === 'sk' ? 'Slovak (Slovenčina)' : ($systemLanguage === 'hu' ? 'Hungarian (Magyar)' : 'English');

// 5. Build Spoken Prompt with Proactive Greeting
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
    . "3. GROUNDING IN CRM DATA:\n"
    . "   - Current system date is {$todayFormatted} ({$todayDate}).\n"
    . "   - You have live grounding in CRM operations and financial records:\n"
    . "{$sanitized_context}\n\n"
    . "Answer and discuss exclusively in the user's language ({$langName}). Speak clearly, decisively, and concisely.";

// 6. Request Ephemeral Session from OpenAI Realtime API
$sessionPayload = [
    'model' => 'gpt-4o-realtime-preview-2024-12-17',
    'voice' => $assignedVoice,
    'modalities' => ['audio', 'text'],
    'instructions' => $voiceSystemPrompt,
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

$ch = curl_init('https://api.openai.com/v1/realtime/sessions');
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
$clientSecret = $sessionData['client_secret']['value'] ?? '';

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
    'language' => $systemLanguage
]);
