<?php
/**
 * AI PDF Template Generator Endpoint
 *
 * Reads an uploaded sample price offer (the PDF itself — text AND page images)
 * and reconstructs it as a block document: the blocks the PDF actually has,
 * in its reading order. The rules live in offer_document.php, the same ones
 * src/utils/offerDocument.ts enforces. A theme-shaped answer is not a template.
 *
 * It never invents a template. If the AI call cannot be made or fails, the answer
 * is `success: false` with a stable `code` (the vocabulary of src/utils/aiConfig.ts)
 * and nothing is created: a template that silently ignores the uploaded PDF is
 * worse than an error.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/offer_document.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

/** Failure answer: stable `code` for the client to translate, English `message` for the log. */
function tpl_error(int $status, string $code, string $message, array $extra = []): void {
    http_response_code($status);
    echo json_encode(array_merge(['success' => false, 'code' => $code, 'message' => $message], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

/** Largest sample PDF sent to the model. Bigger files are refused, not truncated. */
const CCRM_PDF_TEMPLATE_MAX_BYTES = 10 * 1024 * 1024;
/** Prefix upload.php gives the stored sample (the client sends eventId `custom-template-pdf`). */
const CCRM_PDF_TEMPLATE_UPLOAD_PREFIX = 'custom-template-pdf_';

const CCRM_PDF_TPL_SECTIONS = [
    'header', 'client_metadata', 'greeting', 'usp_grid', 'reassurance',
    'items_table', 'total_box', 'key_parameters', 'next_steps', 'signoff', 'footer'
];

/** Trim an untrusted string field to a sane column length. */
function ccrm_pdf_tpl_text($value, string $fallback, int $max = 255): string {
    $v = is_string($value) ? trim($value) : '';
    if ($v === '') {
        return $fallback;
    }
    return mb_substr($v, 0, $max);
}

/**
 * Resolve the stored sample PDF from the path upload.php handed back and read it.
 * The path comes from the client, so it is never opened as given: only a bare
 * `/uploads/custom-template-pdf_*.pdf` name inside the uploads directory is
 * accepted — no other folder, no `..`, no other upload, no other file type.
 *
 * @return string|array raw PDF bytes, or [errorCode, message] when it cannot be used
 */
function ccrm_pdf_tpl_read_sample(string $pdfUrl) {
    if (!preg_match('#^/uploads/([^/\\\\\0]+)$#', $pdfUrl, $m)) {
        return ['pdf_unreadable', 'The sample PDF path is not an uploaded file.'];
    }
    $name = $m[1];
    if ($name === '.' || $name === '..' || strpos($name, '..') !== false
        || strpos($name, CCRM_PDF_TEMPLATE_UPLOAD_PREFIX) !== 0
        || strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== 'pdf') {
        return ['pdf_unreadable', 'The sample is not an uploaded template PDF.'];
    }
    $dir = realpath(ccrm_uploads_dir());
    $path = $dir !== false ? realpath($dir . DIRECTORY_SEPARATOR . $name) : false;
    if ($dir === false || $path === false || dirname($path) !== $dir || !is_file($path)) {
        return ['pdf_unreadable', 'The uploaded sample PDF was not found on the server.'];
    }
    $size = filesize($path);
    if ($size === false || $size <= 0) {
        return ['pdf_unreadable', 'The uploaded sample PDF is empty.'];
    }
    if ($size > CCRM_PDF_TEMPLATE_MAX_BYTES) {
        return ['pdf_too_large', 'The sample PDF is larger than ' . (CCRM_PDF_TEMPLATE_MAX_BYTES / 1024 / 1024) . ' MB.'];
    }
    $bytes = @file_get_contents($path);
    if ($bytes === false || strncmp($bytes, '%PDF-', 5) !== 0) {
        return ['pdf_unreadable', 'The uploaded file is not a valid PDF.'];
    }
    return $bytes;
}

/**
 * Turn the model's JSON into the template the app stores. Pure: no I/O.
 * A payload with no usable block document (including the old theme JSON) is
 * not a template — the caller answers `ai_unusable` and stores nothing.
 * The colour / layout columns stay filled with the safe defaults because those
 * columns are NOT NULL; a reconstruction does not read them.
 *
 * @return array|null
 */
function ccrm_pdf_tpl_build(array $blueprint, string $pdfName, string $pdfUrl): ?array {
    $document = ccrm_offer_document_normalize($blueprint);
    if ($document === null) return null;
    return [
        'id' => 'act-' . bin2hex(random_bytes(6)),
        'name' => ccrm_pdf_tpl_text($blueprint['name'] ?? null, pathinfo($pdfName, PATHINFO_FILENAME) ?: 'AI Custom Template', 150),
        'description' => ccrm_pdf_tpl_text($blueprint['description'] ?? null, 'Reconstructed from the uploaded price offer', 500),
        'sourcePdfUrl' => $pdfUrl,
        'sourcePdfName' => $pdfName,
        'colors' => [
            'primary' => '#0f172a',
            'secondary' => '#334155',
            'background' => '#ffffff',
            'accent' => '#f97316',
            'text' => '#1e293b'
        ],
        'typography' => ['fontFamily' => 'sans', 'headingStyle' => 'bold'],
        'layout' => [
            'headerStyle' => 'light',
            'tableHeaderStyle' => 'filled-primary',
            'uspCardStyle' => 'soft',
            'totalBannerStyle' => 'gradient',
            'fontFamily' => 'sans',
            'headings' => ['usp' => '', 'items' => '', 'nextStep' => '']
        ],
        'sectionsOrder' => CCRM_PDF_TPL_SECTIONS,
        'customBannerText' => '',
        'badgeStyle' => 'rounded',
        'document' => $document,
        'createdAt' => date('Y-m-d H:i:s')
    ];
}

/** The instructions for the model. The normaliser, not this text, is what gets stored. */
function ccrm_pdf_tpl_prompt(string $pdfText, string $langName): string {
    $hint = $pdfText !== '' ? "\n\nText extracted from the PDF (a hint only — the attached PDF pages are the source of truth):\n```\n" . mb_substr($pdfText, 0, 4000) . "\n```" : '';
    return "You reconstruct the attached price-offer PDF as a block document. The PDF is the only source of the layout. Copy its reading order, the colours you can see, its headings and its sentences. Reconstruct the first four pages and ignore the rest.

Return ONLY a JSON object. Human-readable strings (name, description, labels, text) are in {$langName}. No HTML. No CSS. Colours are #rrggbb. fontSize is one of sm, md, lg, xl, title.

{
  \"name\": \"short template name\",
  \"description\": \"one sentence\",
  \"customFields\": [{\"key\": \"site_code\", \"label\": \"label copied from the PDF\"}],
  \"blocks\": []
}

A block is one of:
- {\"type\":\"stack\",\"children\":[blocks]}
- {\"type\":\"columns\",\"columns\":[[blocks],[blocks]]} — exactly 2 or 3 columns, never a column inside a column
- {\"type\":\"text\",\"text\":\"a sentence from the PDF\",\"style\":{optional}}
- {\"type\":\"field\",\"fieldId\":\"catalog id\",\"label\":\"optional\",\"style\":{optional}}
- {\"type\":\"itemsTable\",\"columns\":[\"name\",\"quantity\",\"unit\",\"unitPrice\",\"totalPrice\"],\"style\":{optional}}
- {\"type\":\"totals\",\"subtotal\":true,\"vat\":true,\"total\":true,\"priceRange\":false,\"style\":{optional}}
- {\"type\":\"uspCards\",\"style\":{optional}}
- {\"type\":\"customField\",\"key\":\"site_code\",\"label\":\"Label\",\"style\":{optional}}
- {\"type\":\"divider\",\"style\":{optional}}
- {\"type\":\"spacer\"}

style, when present, is an object: color, background, borderColor (#rrggbb); fontSize (sm|md|lg|xl|title); weight (regular|medium|bold); align (left|center|right); radius (none|sm|md|pill); border (none|left|all).

Catalog ids — bind a value you can see to one of these, and never copy the sample company's name, IČO, IBAN, phone or address into a text block (those bind to company.*):
company.name company.subtitle company.logo company.street company.city company.postalCode company.country company.companyId company.taxId company.vatId company.email company.phone company.phoneSecondary company.website company.iban company.swift company.bankName company.socialProof
offer.documentNumber offer.title offer.subject offer.location offer.issuedAt offer.validUntil offer.clientName offer.clientEmail offer.clientPhone offer.clientStreet offer.clientCity offer.clientPostalCode offer.clientCountry offer.clientIco offer.clientDic offer.clientIcdph offer.greetingNote offer.introNote offer.reassuranceNote offer.nextStepsNote offer.closingNote offer.signOffTeam offer.durationText offer.startDateText offer.warrantyText

itemsTable columns, and only these: name description quantity unit unitPrice vatRate discountPct totalPrice.
A labelled value that matches no catalog id is a customField block plus a customFields entry. key is lowercase letters, digits and underscores. Static text is for sentences only.

Do not invent a benefits grid, a reassurance line, three parameter cards, or a next-step section unless they are on the page. Leave out any block the PDF does not have." . $hint;
}

if (defined('CCRM_PDF_TEMPLATE_LIB')) {
    // Included by a test (scripts/test-pdf-template.php): the helpers above are all it needs.
    return;
}

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        tpl_error(405, 'method_not_allowed', 'Method Not Allowed');
    }
    $sessionUser = ccrm_require_auth();
    // Same gate as storing the result: aiCustomTemplates is written by general_config
    // editors only, so a role that could pay for a generation but not save it is refused up front.
    ccrm_gate($sessionUser, 'general_config', 'edit');
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    tpl_error(503, 'not_installed', 'CRM is not installed yet.');
}
require_once $configFile;

$data = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($data)) {
    tpl_error(400, 'bad_request', 'Invalid JSON input');
}

$pdfText = trim((string)($data['pdfText'] ?? ''));
$pdfName = mb_substr(trim((string)($data['pdfName'] ?? 'Sample Template')), 0, 255);
$pdfUrl = trim((string)($data['pdfUrl'] ?? ''));
$systemLanguage = in_array(($data['systemLanguage'] ?? 'sk'), ['sk', 'hu', 'en'], true) ? $data['systemLanguage'] : 'sk';
$langName = ['sk' => 'Slovak', 'hu' => 'Hungarian', 'en' => 'English'][$systemLanguage];

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    tpl_error(500, 'db_error', 'Database connection failed.');
}

// OpenAI API key from the integrations config.
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
if (function_exists('ccrm_decrypt_config_secrets') && function_exists('ccrm_integration_secret_keys')) {
    $integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];
}
$openAiKey = is_array($integrationsConfig) ? trim((string)($integrationsConfig['openAiKey'] ?? '')) : '';
if ($openAiKey === '') {
    tpl_error(422, 'ai_key_missing', 'The OpenAI API key is not configured (Settings → AI integration).');
}

// The sample itself, read from the upload — never from a client-supplied path.
$pdfBytes = ccrm_pdf_tpl_read_sample($pdfUrl);
if (is_array($pdfBytes)) {
    tpl_error($pdfBytes[0] === 'pdf_too_large' ? 413 : 422, $pdfBytes[0], $pdfBytes[1]);
}

$model = ccrm_ai_model(is_array($integrationsConfig) ? $integrationsConfig : []);
$payload = [
    'model' => $model,
    'messages' => [
        ['role' => 'system', 'content' => 'You are a professional document design analyzer. Output only valid JSON.'],
        ['role' => 'user', 'content' => [
            ['type' => 'text', 'text' => ccrm_pdf_tpl_prompt($pdfText, $langName)],
            ['type' => 'file', 'file' => [
                'filename' => 'sample-offer.pdf',
                'file_data' => 'data:application/pdf;base64,' . base64_encode($pdfBytes)
            ]]
        ]]
    ],
    'response_format' => ['type' => 'json_object']
];
// OpenAI's gpt-5 / o-series reject a non-default temperature with a 400.
if (ccrm_ai_model_supports_temperature($model)) {
    $payload['temperature'] = 0.2;
}
unset($pdfBytes);

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
// Reading page images takes longer than a text-only call.
curl_setopt($ch, CURLOPT_TIMEOUT, 90);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_UNICODE));

$res = curl_exec($ch);
$httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($res === false || $httpCode !== 200) {
    $errData = is_string($res) ? json_decode($res, true) : null;
    $providerText = $errData['error']['message'] ?? ($curlError !== '' ? $curlError : 'no response');
    $providerMessage = mb_substr(($httpCode > 0 ? "HTTP {$httpCode}: " : '') . $providerText, 0, 400);
    // 401/403: a key exists but OpenAI rejected it. 429: quota or rate limit.
    $code = ($httpCode === 401 || $httpCode === 403) ? 'ai_key_invalid'
          : (($httpCode === 429) ? 'ai_rate_limited' : 'ai_error');
    // The key is never part of what is logged or returned.
    error_log('[generate_pdf_template] OpenAI call failed (model ' . $model . '): ' . $providerMessage);
    tpl_error(502, $code, 'OpenAI Error: ' . $providerMessage, ['providerMessage' => $providerMessage]);
}

$parsedAi = json_decode((string)$res, true);
ccrm_ai_capture_usage($pdo, 'offer_template', $parsedAi, $model);
$aiContent = trim((string)($parsedAi['choices'][0]['message']['content'] ?? ''));
$blueprint = $aiContent !== '' ? json_decode($aiContent, true) : null;
if (!is_array($blueprint) || $blueprint === []) {
    error_log('[generate_pdf_template] OpenAI returned no usable JSON (model ' . $model . ')');
    tpl_error(502, 'ai_empty', 'OpenAI returned no usable template.');
}

$template = ccrm_pdf_tpl_build($blueprint, $pdfName, $pdfUrl);
if ($template === null) {
    error_log('[generate_pdf_template] model JSON had no usable document (model ' . $model . ')');
    tpl_error(502, 'ai_unusable', 'The model did not return a usable document.');
}
echo json_encode(['success' => true, 'template' => $template], JSON_UNESCAPED_UNICODE);
