<?php
/**
 * Translates an existing AI-generated dashboard layout's display text
 * (widget titles, table column labels) into en/sk/hu, so panels generated
 * before multi-language support (or from a prompt written in one language)
 * become readable in every app language instead of staying frozen in
 * whichever language the original prompt happened to use.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    ccrm_require_auth();
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
    $stmt->execute();
    $configJson = $stmt->fetchColumn();
    $integrationsConfig = $configJson ? json_decode($configJson, true) : [];
    $integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$openAiKey = $integrationsConfig['openAiKey'] ?? '';
if (empty($openAiKey)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI API Key is not configured. Please configure it in Settings.'
    ]);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

$layout = $data['layout'] ?? null;
$model = $data['model'] ?? 'gpt-5.6-terra';

if (!is_array($layout) || !isset($layout['widgets']) || !is_array($layout['widgets'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A dashboard layout is required.']);
    exit;
}

$systemInstruction = "You translate display text inside a dashboard layout JSON object into English (en), Slovak (sk) and Hungarian (hu).

You MUST output ONLY the same JSON object back, with no markdown formatting, no ```json wrapper, and no text outside of the JSON.

Rules:
- For every widget, replace the `title` field with an object { \"en\": \"...\", \"sk\": \"...\", \"hu\": \"...\" }.
  - If `title` is already such an object, keep any language keys that are already filled in and only fill in the missing ones — do not change the existing translations.
  - If `title` is a plain string, treat it as the source text (in whichever language it is written) and produce all three translations from it.
- For every table widget's `columns[].label`, apply the exact same rule.
- Do NOT change, translate, or remove any other field: `id`, `type`, `size`, `color`, `chartType`, `mapping`, `columns[].key`, `columns[].format`, `query`, `metricValue`, etc. must be returned byte-for-byte identical.
- Do NOT add, remove, or reorder widgets or columns.
- Keep translations concise and consistent with normal CRM/dashboard terminology.";

$messages = [
    ['role' => 'system', 'content' => $systemInstruction],
    ['role' => 'user', 'content' => json_encode($layout)]
];

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);
$payload = [
    'model' => $model,
    'messages' => $messages,
];
if (ccrm_ai_model_supports_temperature($model)) {
    $payload['temperature'] = 0.2;
}
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($httpCode !== 200) {
    $errData = json_decode($response, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI API request failed');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'OpenAI Error: ' . $errMsg]);
    exit;
}

$resData = json_decode($response, true);
$rawText = $resData['choices'][0]['message']['content'] ?? '';

$cleanedText = trim($rawText);
if (strpos($cleanedText, '```') === 0) {
    $cleanedText = preg_replace('/^```(?:json)?\s*/i', '', $cleanedText);
    $cleanedText = preg_replace('/\s*```$/i', '', $cleanedText);
}
$cleanedText = trim($cleanedText);

$translatedLayout = json_decode($cleanedText, true);
if (!$translatedLayout || !isset($translatedLayout['widgets'])) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI generated invalid JSON layout format.',
        'raw' => $rawText
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'layout' => $translatedLayout
]);
