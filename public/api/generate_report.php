<?php
/**
 * AI Financial Report Generator.
 * Fetches all available statements for a company, extracts table details,
 * and uses OpenAI to generate a multi-year revenue history table and written analysis.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
if (function_exists('ccrm_send_cors')) {
    ccrm_send_cors('POST, OPTIONS');
}

/**
 * Every failure exit carries a stable machine-readable `code` next to the
 * English `message`. The browser only ever shows the code, translated into the
 * user's language (see translateAiApiError in src/utils/aiConfig.ts) — without
 * it the UI could not tell "no OpenAI key configured" apart from "this company
 * publishes no statements", and used to show one generic toast for both.
 */
function report_error(int $status, string $code, string $message, array $extra = []): void {
    http_response_code($status);
    echo json_encode(array_merge(['success' => false, 'code' => $code, 'message' => $message], $extra));
    exit;
}

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        report_error(405, 'method_not_allowed', 'Method Not Allowed');
    }
    // SECURITY: Authenticated users only
    if (function_exists('ccrm_require_auth')) {
        ccrm_require_auth();
    }
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    report_error(503, 'not_installed', 'CRM is not installed yet.', ['installed' => false]);
}
require_once $configFile;

$companyId = '';
$systemLanguage = 'en';

if (php_sapi_name() === 'cli' && isset($argv[1]) && !empty(trim($argv[1]))) {
    $companyId = trim($argv[1]);
    $systemLanguage = isset($argv[2]) ? trim($argv[2]) : 'en';
} else {
    $input = file_get_contents(php_sapi_name() === 'cli' ? 'php://stdin' : 'php://input');
    $data = json_decode($input, true);
    if ($data && !empty($data['companyId'])) {
        $companyId = trim($data['companyId']);
        $systemLanguage = $data['systemLanguage'] ?? 'en';
    }
}

if (empty($companyId)) {
    report_error(400, 'missing_company_id', 'Missing companyId parameter');
}

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    report_error(500, 'db_error', 'Database connection failed.');
}

// Fetch integrations config to get OpenAI API key
$integrationsConfig = ccrm_load_integrations_config($pdo);
$openAiKey = trim((string)($integrationsConfig['openAiKey'] ?? ''));

if ($openAiKey === '') {
    report_error(400, 'ai_key_missing', 'OpenAI API Key is not configured. Please configure it in Settings.');
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

// 1. Lookup accounting unit by IČO (companyId)
$listUrl = "https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=" . urlencode($companyId) . "&zmenene-od=2000-01-01";
$listResponse = fetch_registry_url($listUrl);

if (!$listResponse || empty($listResponse['id'])) {
    report_error(404, 'company_not_found', 'Company not found in registry');
}

$unitId = $listResponse['id'][0];
$detailUrl = "https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=" . urlencode($unitId);
$unitDetail = fetch_registry_url($detailUrl);

if (!$unitDetail) {
    report_error(502, 'registry_unavailable', 'Failed to retrieve company details from registry');
}

$statementIds = $unitDetail['idUctovnychZavierok'] ?? [];
if (empty($statementIds)) {
    report_error(404, 'no_statements', 'No financial statements found for this company in registry');
}

// Take the last 5 statements to compile multi-year history
$statementIds = array_slice($statementIds, -5);

$compiledDataText = "";
foreach ($statementIds as $stmtId) {
    $statementUrl = "https://www.registeruz.sk/cruz-public/api/uctovna-zavierka?id=" . urlencode($stmtId);
    $statementMeta = fetch_registry_url($statementUrl);
    if (!$statementMeta) continue;
    
    $year = 'N/A';
    if (!empty($statementMeta['obdobieOd'])) {
        $year = substr($statementMeta['obdobieOd'], 0, 4);
    }
    
    $compiledDataText .= "=== YEAR: $year (Period: " . ($statementMeta['obdobieOd'] ?? '') . " to " . ($statementMeta['obdobieDo'] ?? '') . ", Type: " . ($statementMeta['typ'] ?? '') . ") ===\n";
    
    $reportIds = $statementMeta['idUctovnychVykazov'] ?? [];
    foreach ($reportIds as $rId) {
        $reportUrl = "https://www.registeruz.sk/cruz-public/api/uctovny-vykaz?id=" . urlencode($rId);
        $reportData = fetch_registry_url($reportUrl);
        if ($reportData && isset($reportData['obsah']['tabulky'])) {
            foreach ($reportData['obsah']['tabulky'] as $table) {
                $tableName = $table['nazov']['sk'] ?? 'Vykaz';
                // Only include tables that are likely to contain revenue, sales, profit, turnover, or income details to keep payload size reasonable
                $lowerName = mb_strtolower($tableName, 'UTF-8');
                if (
                    strpos($lowerName, 'zisk') !== false ||
                    strpos($lowerName, 'strat') !== false ||
                    strpos($lowerName, 'výnos') !== false ||
                    strpos($lowerName, 'náklad') !== false ||
                    strpos($lowerName, 'obrat') !== false ||
                    strpos($lowerName, 'tržb') !== false ||
                    strpos($lowerName, 'súvaha') !== false ||
                    strpos($lowerName, 'majetok') !== false ||
                    strpos($lowerName, 'pasív') !== false ||
                    strpos($lowerName, 'aktív') !== false
                ) {
                    $compiledDataText .= "Table: $tableName\n";
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
                        $compiledDataText .= "Values: " . implode(", ", array_slice($rowValues, 0, 150)) . "\n";
                    }
                }
            }
        }
    }
    $compiledDataText .= "\n";
}

if (empty(trim($compiledDataText))) {
    report_error(404, 'no_financial_data', 'No structured financial data was found to analyze');
}

// 3. Build OpenAI prompt
$langName = ($systemLanguage === 'sk') ? 'Slovak' : (($systemLanguage === 'hu') ? 'Hungarian' : 'English');

$prompt = "You are a professional financial analyst AI assistant.
Analyze the following multi-year raw structured financial statement data of a company from the Slovak Register of Financial Statements (RegisterÚZ).

Generate a professional financial report formatted in clean, elegant Markdown. Include:
1. **Prehľad vývoja tržieb (Revenue History by Year)**: Create a beautiful Markdown table showing the annual revenue (Celkové výnosy / Tržby / Obrat) and net profit/loss (Výsledok hospodárenia) for each available year. Include a column for YoY growth/change in percentage where applicable.
2. **Finančná analýza (Written Analysis)**: Provide a detailed written analysis of the financial trend. Evaluate:
   - Revenue and profitability trends.
   - Financial stability, asset/liability structure.
   - Strengths, weaknesses, and potential risks (e.g. rising debt, falling margins).
   - Summary conclusion of the company's financial health.

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
curl_setopt($ch, CURLOPT_TIMEOUT, 45);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);

$reportModel = ccrm_ai_model();
$payload = [
    'model' => $reportModel,
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ],
];
if (ccrm_ai_model_supports_temperature($reportModel)) {
    $payload['temperature'] = 0.2;
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
    report_error(502, $code, 'OpenAI Error: ' . $errMsg, ['providerMessage' => $errMsg]);
}

$resData = json_decode($response, true);
$aiReply = trim($resData['choices'][0]['message']['content'] ?? '');

if (empty($aiReply)) {
    report_error(502, 'ai_empty', 'Empty response from OpenAI');
}

try {
    $updateStmt = $pdo->prepare("UPDATE `leads` SET `financial_summary` = ? WHERE `company_id` = ?");
    $updateStmt->execute([$aiReply, $companyId]);
} catch (\Exception $e) {
    // Ignore
}

echo json_encode([
    'success' => true,
    'report' => $aiReply
]);
