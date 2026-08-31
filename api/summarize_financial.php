<?php
/**
 * AI Financial Statement Summarization Endpoint.
 * Fetches statement details, retrieves associated report tables from RegisterUZ, and summarizes them using OpenAI.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

/**
 * Every failure exit carries a stable machine-readable `code` next to the
 * English `message`, so the browser can translate the real reason instead of
 * falling back to a single generic toast. See translateAiApiError in
 * src/utils/aiConfig.ts for the client half.
 */
function summary_error(int $status, string $code, string $message, array $extra = []): void {
    http_response_code($status);
    echo json_encode(array_merge(['success' => false, 'code' => $code, 'message' => $message], $extra));
    exit;
}

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        summary_error(405, 'method_not_allowed', 'Method Not Allowed');
    }
    // SECURITY: Authenticated users only
    ccrm_require_auth();
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    summary_error(503, 'not_installed', 'CRM is not installed yet.', ['installed' => false]);
}
require_once $configFile;

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || empty($data['statementId'])) {
    summary_error(400, 'missing_statement_id', 'Missing statementId parameter');
}

$statementId = trim($data['statementId']);
$systemLanguage = $data['systemLanguage'] ?? 'en';

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    summary_error(500, 'db_error', 'Database connection failed.');
}

// Fetch integrations config to get OpenAI API key
$integrationsConfig = ccrm_load_integrations_config($pdo);
$openAiKey = trim((string)($integrationsConfig['openAiKey'] ?? ''));

if ($openAiKey === '') {
    summary_error(400, 'ai_key_missing', 'OpenAI API Key is not configured. Please configure it in Settings.');
}

// Helper function to fetch registeruz URLs
function fetch_registry_url(string $url): ?array {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    $output = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200 || $output === false) {
        $context = stream_context_create([
            'http' => [
                'timeout' => 15,
                'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n"
            ]
        ]);
        $output = @file_get_contents($url, false, $context);
    }
    
    return $output ? json_decode($output, true) : null;
}

// 1. Fetch statement metadata
$statementUrl = "https://www.registeruz.sk/cruz-public/api/uctovna-zavierka?id=" . urlencode($statementId);
$statementMeta = fetch_registry_url($statementUrl);

if (!$statementMeta) {
    summary_error(502, 'registry_unavailable', 'Failed to retrieve statement metadata from RegisterUZ');
}

$reportIds = $statementMeta['idUctovnychVykazov'] ?? [];
if (empty($reportIds)) {
    summary_error(404, 'no_statements', 'No reports found for this financial statement');
}

// 2. Fetch and compile report contents
$compiledDataText = "";
foreach ($reportIds as $rId) {
    $reportUrl = "https://www.registeruz.sk/cruz-public/api/uctovny-vykaz?id=" . urlencode($rId);
    $reportData = fetch_registry_url($reportUrl);
    if ($reportData && isset($reportData['obsah']['tabulky'])) {
        foreach ($reportData['obsah']['tabulky'] as $table) {
            $tableName = $table['nazov']['sk'] ?? 'Vykaz';
            $compiledDataText .= "### Table: $tableName\n";
            $rowValues = [];
            if (isset($table['data']) && is_array($table['data'])) {
                foreach ($table['data'] as $val) {
                    $trimmed = trim($val);
                    if ($trimmed !== "") {
                        $rowValues[] = $trimmed;
                    }
                }
            }
            if (!empty($rowValues)) {
                $compiledDataText .= "Values: " . implode(", ", array_slice($rowValues, 0, 100)) . "\n\n";
            }
        }
    }
}

if (empty(trim($compiledDataText))) {
    $compiledDataText = "No structured table data was extracted from the registry reports. Please base the summary on general metadata.\n";
}

// Append statement metadata
$compiledDataText .= "\nStatement Metadata:\n";
$compiledDataText .= "- ID: " . ($statementMeta['id'] ?? '') . "\n";
$compiledDataText .= "- Type: " . ($statementMeta['typ'] ?? '') . "\n";
$compiledDataText .= "- Period: " . ($statementMeta['obdobieOd'] ?? '') . " to " . ($statementMeta['obdobieDo'] ?? '') . "\n";
$compiledDataText .= "- Created On: " . ($statementMeta['datumZostavenia'] ?? '') . "\n";
$compiledDataText .= "- Approved On: " . ($statementMeta['datumSchvalenia'] ?? '') . "\n";

// 3. Build OpenAI prompt
$langName = ($systemLanguage === 'sk') ? 'Slovak' : (($systemLanguage === 'hu') ? 'Hungarian' : 'English');

$prompt = "You are a professional financial analyst AI assistant.
Analyze the following raw structured financial statement data of a company from the Slovak Register of Financial Statements (RegisterÚZ).
Create a professional, highly detailed, yet clear and readable summary of the company's financial status, health, revenues, profit, assets, liabilities, and any key trends, ratios, or issues.

Provide the summary formatted in clean, elegant Markdown. Include:
1. **Základné údaje (General Info)**: Period, statement type, approval.
2. **Kľúčové finančné výsledky (Key Financial Indicators)**: Analyze assets, liabilities, equity, revenues, and net profit if available in the data values.
3. **Zhodnotenie finančného zdravia (Financial Health Evaluation)**: Comment on stability, growth, or potential risks based on the numbers.

Format with bold headers, bullet points, and clean spacing. Do not include introductory conversational text (like 'Here is the summary...'). Start directly with the markdown.
Write the summary in: $langName.

Financial Data:
---
$compiledDataText
---";

// 4. Call OpenAI API
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

$financialModel = ccrm_ai_model();
$payload = [
    'model' => $financialModel,
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ],
];
if (ccrm_ai_model_supports_temperature($financialModel)) {
    $payload['temperature'] = 0.3;
}

curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_INVALID_UTF8_SUBSTITUTE));
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    $errData = json_decode($response, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI API request failed');
    // 401/403 means the stored key exists but OpenAI rejected it — a different
    // problem from "no key at all", and one the user fixes in the same place.
    $code = ($httpCode === 401 || $httpCode === 403) ? 'ai_key_invalid'
          : (($httpCode === 429) ? 'ai_rate_limited' : 'ai_error');
    summary_error(502, $code, 'OpenAI Error: ' . $errMsg, ['providerMessage' => $errMsg]);
}

$resData = json_decode($response, true);
$aiReply = trim($resData['choices'][0]['message']['content'] ?? '');

if (empty($aiReply)) {
    summary_error(502, 'ai_empty', 'Empty response from OpenAI');
}

echo json_encode([
    'success' => true,
    'summary' => $aiReply
]);
