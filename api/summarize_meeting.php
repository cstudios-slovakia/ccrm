<?php
/**
 * AI Meeting Note Summarization Endpoint.
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

if (!$data || empty($data['notes'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing meeting notes content']);
    exit;
}

$notesText = trim($data['notes']);

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

// Call OpenAI Chat Completion API to compile summary
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

$prompt = "You are an expert CRM assistant. Analyze the following meeting notes and output a JSON response containing a concise summary, sentiment classification, major topics, and action items.

You MUST detect the language in which the provided meeting notes are written. You MUST write the \"summary\" and all \"actionItems\" in that same language (for example: if notes are in Slovak, output summary/action items in Slovak; if in Hungarian, output in Hungarian; if in English, output in English).

You MUST respond ONLY with a valid JSON object. Do not wrap it in markdown code blocks or add extra explanation.
Output structure:
{
  \"summary\": \"A high-level summary of the meeting, discussing major topics and overall outcome (2-3 sentences).\",
  \"sentiment\": \"positive\" | \"neutral\" | \"negative\",
  \"topics\": [\"topic1\", \"topic2\", ...],
  \"actionItems\": [\"action1\", \"action2\", ...]
}

Meeting Notes:
" . $notesText;

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

curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
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
$aiReply = $resData['choices'][0]['message']['content'] ?? '';

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

echo json_encode([
    'success' => true,
    'summary' => $aiJson['summary'],
    'sentiment' => $aiJson['sentiment'] ?? 'neutral',
    'topics' => $aiJson['topics'] ?? [],
    'actionItems' => $aiJson['actionItems'] ?? []
]);
