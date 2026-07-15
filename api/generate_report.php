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

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }
    // SECURITY: Authenticated users only
    if (function_exists('ccrm_require_auth')) {
        ccrm_require_auth();
    }
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'CRM is not installed yet.']);
    exit;
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
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing companyId parameter']);
    exit;
}

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
$integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];
$openAiKey = $integrationsConfig['openAiKey'] ?? '';

if (empty($openAiKey)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI API Key is not configured. Please configure it in Settings.'
    ]);
    exit;
}

// Helper function to fetch registeruz URLs
function fetch_registry_url(string $url): ?array {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
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
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Company not found in registry']);
    exit;
}

$unitId = $listResponse['id'][0];
$detailUrl = "https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=" . urlencode($unitId);
$unitDetail = fetch_registry_url($detailUrl);

if (!$unitDetail) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'Failed to retrieve company details from registry']);
    exit;
}

$statementIds = $unitDetail['idUctovnychZavierok'] ?? [];
if (empty($statementIds)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'No financial statements found for this company in registry']);
    exit;
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
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'No structured financial data was found to analyze']);
    exit;
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
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);

$payload = [
    'model' => ccrm_ai_model(),
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ],
    'temperature' => 0.2
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
    echo json_encode(['success' => false, 'message' => 'Empty response from OpenAI']);
    exit;
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
