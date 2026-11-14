<?php
/**
 * AI Lead / Client Summarization Endpoint.
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

// SECURITY: Authenticated users only, and only with a view of leads or clients.
$sessionUser = ccrm_require_auth();
ccrm_gate_any($sessionUser, ['leads', 'clients']);

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || empty($data['name'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing lead/client name']);
    exit;
}

$name = trim($data['name']);
$type = $data['type'] ?? 'client';
$tasks = $data['tasks'] ?? [];
$events = $data['events'] ?? [];
$priceOffers = $data['priceOffers'] ?? [];
$otherData = $data['otherData'] ?? [];
$systemLanguage = $data['systemLanguage'] ?? 'en';

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

if (!ccrm_ai_is_configured($pdo, $integrationsConfig)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'code' => 'ai_key_missing',
        'message' => 'AI provider is not configured. Please configure it in Settings.'
    ]);
    exit;
}

// Build text lists for the prompt
$tasksText = "";
if (!empty($tasks)) {
    foreach ($tasks as $t) {
        $status = $t['status'] ?? '';
        $title = $t['title'] ?? '';
        $deadline = $t['deadline'] ?? '';
        $priority = $t['priority'] ?? '';
        $tasksText .= "- [Status: $status, Priority: $priority] $title (Deadline: $deadline)\n";
    }
} else {
    $tasksText = "None pending/defined.\n";
}

$eventsText = "";
if (!empty($events)) {
    foreach ($events as $ev) {
        $timestamp = $ev['timestamp'] ?? '';
        $typeEv = $ev['type'] ?? '';
        $title = $ev['title'] ?? '';
        $content = $ev['content'] ?? '';
        $eventsText .= "- [$timestamp] ($typeEv) $title: $content\n";
    }
} else {
    $eventsText = "No previous interactions logged.\n";
}

$offersText = "";
if (!empty($priceOffers)) {
    foreach ($priceOffers as $off) {
        $timestamp = $off['timestamp'] ?? '';
        $title = $off['title'] ?? '';
        $amount = $off['amount'] ?? '';
        $content = $off['content'] ?? '';
        $offersText .= "- [$timestamp] $title - Amount: €$amount: $content\n";
    }
} else {
    $offersText = "No price offers made yet.\n";
}

$otherText = "";
if (!empty($otherData)) {
    foreach ($otherData as $k => $v) {
        if (is_array($v)) {
            $v = implode(', ', $v);
        }
        $otherText .= "$k: $v\n";
    }
} else {
    $otherText = "None.\n";
}

// Translate language parameter to full name
$langName = 'English';
if ($systemLanguage === 'sk') {
    $langName = 'Slovak';
} elseif ($systemLanguage === 'hu') {
    $langName = 'Hungarian';
}

$prompt = "You are a highly efficient CRM AI Assistant.
Create a concise status summary (2-3 sentences max) for a $type named \"$name\".

You MUST prioritize information in this exact order:
1. Tasks: Highlight any pending, overdue, or upcoming tasks first.
2. Events: Summarize key recent timeline events and interactions.
3. Price Offers: Mention recent proposals, quotes, or active financial offers and their values.
4. Other data: Mention categories of interest, location, owner (project manager), or total value.

Constraints:
- Output ONLY the raw summarized paragraph. Do not write a list, do not use bullet points, do not include any headers/labels, and do not use markdown bold/italic formatting.
- Keep it concise, natural, cohesive, and dense with information.
- Write the summary in the requested language: $langName. If the input data is in a different language, translate the summarized points into $langName.

Data:
---
TASKS:
$tasksText

TIMELINE EVENTS:
$eventsText

PRICE OFFERS:
$offersText

OTHER PROFILE DATA:
$otherText
---";

$leadModel = ccrm_ai_model($integrationsConfig);
$aiRes = ccrm_ai_chat_completion(
    $pdo,
    [
        'model' => $leadModel,
        'messages' => [
            [
                'role' => 'user',
                'content' => $prompt
            ]
        ],
        'temperature' => 0.3,
    ],
    [
        'feature' => 'client_summary',
        'timeout' => 30,
        'integrationsConfig' => $integrationsConfig,
    ]
);

if (empty($aiRes['ok'])) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'code' => $aiRes['code'] ?: 'ai_error',
        'message' => 'AI Error: ' . ($aiRes['error'] ?: 'AI API request failed'),
        'providerMessage' => $aiRes['error'] ?? '',
    ]);
    exit;
}

$aiReply = trim((string)($aiRes['content'] ?? ''));

if (empty($aiReply)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'code' => 'ai_empty',
        'message' => 'Received empty response from AI provider.'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'summary' => $aiReply
]);
