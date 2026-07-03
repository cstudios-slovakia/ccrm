<?php
/**
 * AI Lead / Client Summarization Endpoint.
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
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
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
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI API Key is not configured. Please configure it in Settings.'
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

// Call OpenAI Chat Completion API
$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);

$payload = [
    'model' => 'gpt-4o-mini',
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ],
    'temperature' => 0.3
];

curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_INVALID_UTF8_SUBSTITUTE));
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    $errData = json_decode($response, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI API request failed');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'OpenAI Error: ' . $errMsg]);
    exit;
}

$resData = json_decode($response, true);
$aiReply = trim($resData['choices'][0]['message']['content'] ?? '');

if (empty($aiReply)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Received empty response from OpenAI API.'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'summary' => $aiReply
]);
