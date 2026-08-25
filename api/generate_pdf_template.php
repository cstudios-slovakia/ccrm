<?php
/**
 * AI PDF Template Generator Endpoint (Version 1.9)
 * Analyzes uploaded price offer / invoice PDF content and generates a custom template blueprint
 * while enforcing that all required fields from the default template are preserved.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }
    ccrm_require_auth();
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

$pdfText = trim($data['pdfText'] ?? '');
$pdfName = trim($data['pdfName'] ?? 'Sample Template');
$pdfUrl = trim($data['pdfUrl'] ?? '');
$systemLanguage = $data['systemLanguage'] ?? 'sk';

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// Fetch integrations config for OpenAI API key
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
if (function_exists('ccrm_decrypt_config_secrets') && function_exists('ccrm_integration_secret_keys')) {
    $integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];
}
$openAiKey = $integrationsConfig['openAiKey'] ?? '';

// If no OpenAI key configured or if text is empty, generate smart fallback blueprint based on analysis
if (empty($openAiKey)) {
    // Return structured template generated from heuristic analysis
    $defaultTemplate = [
        'id' => 'act-' . bin2hex(random_bytes(6)),
        'name' => pathinfo($pdfName, PATHINFO_FILENAME) ?: 'Custom PDF Template',
        'description' => 'Automaticky odvodená šablóna cenovej ponuky',
        'sourcePdfUrl' => $pdfUrl,
        'sourcePdfName' => $pdfName,
        'colors' => [
            'primary' => '#0f172a',
            'secondary' => '#334155',
            'background' => '#ffffff',
            'accent' => '#f97316',
            'text' => '#1e293b'
        ],
        'typography' => [
            'fontFamily' => 'Inter, sans-serif',
            'headingStyle' => 'bold'
        ],
        'sectionsOrder' => [
            'header',
            'client_metadata',
            'greeting',
            'usp_grid',
            'reassurance',
            'items_table',
            'total_box',
            'key_parameters',
            'next_steps',
            'signoff',
            'footer'
        ],
        'customBannerText' => 'Predbežná cena za komplexnú dodávku a montáž',
        'badgeStyle' => 'rounded',
        'createdAt' => date('Y-m-d H:i:s'),
        'notice' => 'OpenAI kľúč nie je nastavený. Bola vytvorená optimalizovaná šablóna s kompletnou štruktúrou.'
    ];

    echo json_encode([
        'success' => true,
        'template' => $defaultTemplate
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Call OpenAI to analyze the PDF text and generate customized styling & section tuning
$prompt = "You are an expert document design and layout AI. Analyze the following text extracted from a business price offer/invoice PDF.
Extract the styling characteristics, visual tone, brand color scheme suggestions, custom wording for banners/headings, and structure preferences.
You MUST ensure that the resulting JSON adheres to the required template schema containing all 10 essential fields:
1. header
2. client_metadata
3. greeting
4. usp_grid (4 value proposition cards)
5. reassurance
6. items_table
7. total_box
8. key_parameters (3 highlight parameters: duration, start date, warranty)
9. next_steps (CTA)
10. signoff and footer

Extracted text from PDF:
```
" . mb_substr($pdfText, 0, 8000) . "
```

Return ONLY a valid JSON object with this exact structure:
{
  \"name\": \"Short descriptive template name\",
  \"description\": \"Brief description of the template style and source\",
  \"colors\": {
    \"primary\": \"#hex color for headers/accents\",
    \"secondary\": \"#hex color for subtitles/borders\",
    \"background\": \"#hex background color\",
    \"accent\": \"#hex accent/highlight color (e.g. orange, purple, navy, emerald)\",
    \"text\": \"#hex body text color\"
  },
  \"typography\": {
    \"fontFamily\": \"Inter, Arial, sans-serif\",
    \"headingStyle\": \"bold\"
  },
  \"sectionsOrder\": [
    \"header\", \"client_metadata\", \"greeting\", \"usp_grid\", \"reassurance\",
    \"items_table\", \"total_box\", \"key_parameters\", \"next_steps\", \"signoff\", \"footer\"
  ],
  \"customBannerText\": \"Custom heading for price box if detected, e.g. Predbežná cena za komplexnú dodávku a montáž\",
  \"badgeStyle\": \"rounded\"
}";

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model' => 'gpt-4o-mini',
    'messages' => [
        ['role' => 'system', 'content' => 'You are a professional PDF document design analyzer. Output only valid JSON.'],
        ['role' => 'user', 'content' => $prompt]
    ],
    'temperature' => 0.2,
    'response_format' => ['type' => 'json_object']
]));

$res = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($httpCode !== 200 || !$res) {
    // Fallback if OpenAI call fails
    $fallbackTemplate = [
        'id' => 'act-' . bin2hex(random_bytes(6)),
        'name' => pathinfo($pdfName, PATHINFO_FILENAME) ?: 'Custom PDF Template',
        'description' => 'Šablóna cenovej ponuky odvodená z nahraného PDF',
        'sourcePdfUrl' => $pdfUrl,
        'sourcePdfName' => $pdfName,
        'colors' => [
            'primary' => '#0f172a',
            'secondary' => '#334155',
            'background' => '#ffffff',
            'accent' => '#f97316',
            'text' => '#1e293b'
        ],
        'typography' => [
            'fontFamily' => 'Inter, sans-serif',
            'headingStyle' => 'bold'
        ],
        'sectionsOrder' => [
            'header', 'client_metadata', 'greeting', 'usp_grid', 'reassurance',
            'items_table', 'total_box', 'key_parameters', 'next_steps', 'signoff', 'footer'
        ],
        'customBannerText' => 'Predbežná cena za komplexnú dodávku a montáž',
        'badgeStyle' => 'rounded',
        'createdAt' => date('Y-m-d H:i:s'),
        'warning' => 'AI analýza zlyhala (' . ($curlError ?: 'HTTP ' . $httpCode) . '). Bola použitá štandardná štruktúra.'
    ];

    echo json_encode([
        'success' => true,
        'template' => $fallbackTemplate
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$parsedAi = json_decode($res, true);
$aiContent = $parsedAi['choices'][0]['message']['content'] ?? '{}';
$blueprint = json_decode($aiContent, true) ?: [];

// Inject required standard sections to ensure nothing is omitted
$requiredSections = [
    'header', 'client_metadata', 'greeting', 'usp_grid', 'reassurance',
    'items_table', 'total_box', 'key_parameters', 'next_steps', 'signoff', 'footer'
];

$sectionsOrder = $blueprint['sectionsOrder'] ?? $requiredSections;
foreach ($requiredSections as $req) {
    if (!in_array($req, $sectionsOrder)) {
        $sectionsOrder[] = $req;
    }
}

$template = [
    'id' => 'act-' . bin2hex(random_bytes(6)),
    'name' => $blueprint['name'] ?? (pathinfo($pdfName, PATHINFO_FILENAME) ?: 'AI Custom Template'),
    'description' => $blueprint['description'] ?? 'AI-analyzed custom price offer template',
    'sourcePdfUrl' => $pdfUrl,
    'sourcePdfName' => $pdfName,
    'colors' => [
        'primary' => $blueprint['colors']['primary'] ?? '#0f172a',
        'secondary' => $blueprint['colors']['secondary'] ?? '#334155',
        'background' => $blueprint['colors']['background'] ?? '#ffffff',
        'accent' => $blueprint['colors']['accent'] ?? '#f97316',
        'text' => $blueprint['colors']['text'] ?? '#1e293b'
    ],
    'typography' => [
        'fontFamily' => $blueprint['typography']['fontFamily'] ?? 'Inter, Arial, sans-serif',
        'headingStyle' => $blueprint['typography']['headingStyle'] ?? 'bold'
    ],
    'sectionsOrder' => $sectionsOrder,
    'customBannerText' => $blueprint['customBannerText'] ?? 'Predbežná cena za komplexnú dodávku a montáž',
    'badgeStyle' => $blueprint['badgeStyle'] ?? 'rounded',
    'createdAt' => date('Y-m-d H:i:s')
];

echo json_encode([
    'success' => true,
    'template' => $template
], JSON_UNESCAPED_UNICODE);
