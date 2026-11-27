<?php
/**
 * AI Meeting Note Summarization Endpoint.
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

// SECURITY: Authenticated users only, and only with a view of the meetings module.
$sessionUser = ccrm_require_auth();
ccrm_gate($sessionUser, 'meetings');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'installed' => false, 'message' => (KOPERNIQ_PRODUCT_NAME . ' is not installed yet.')]);
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

$prompt = ("You are an expert " . KOPERNIQ_PRODUCT_NAME . " assistant. Analyze the following meeting notes and output a JSON response containing a concise summary, sentiment classification, major topics, and action items.

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
") . $notesText;

$meetingModel = ccrm_ai_model($integrationsConfig);
$aiRes = ccrm_ai_chat_completion(
    $pdo,
    [
        'model' => $meetingModel,
        'messages' => [
            [
                'role' => 'user',
                'content' => $prompt
            ]
        ],
        'temperature' => 0.3,
    ],
    [
        'feature' => 'meeting_summary',
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

echo json_encode([
    'success' => true,
    'summary' => $aiJson['summary'],
    'sentiment' => $aiJson['sentiment'] ?? 'neutral',
    'topics' => $aiJson['topics'] ?? [],
    'actionItems' => $aiJson['actionItems'] ?? []
]);
