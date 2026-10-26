<?php
/**
 * AI PDF Template Generator Endpoint
 *
 * Reads an uploaded sample price offer (the PDF itself — text AND page images, so
 * colours, bands, table heads and card styles are visible to the model) and turns
 * it into a template blueprint: colours, a bounded set of layout variants, section
 * headings and block order. All eleven required blocks are always guaranteed.
 *
 * It never invents a template. If the AI call cannot be made or fails, the answer
 * is `success: false` with a stable `code` (the vocabulary of src/utils/aiConfig.ts)
 * and nothing is created: a template that silently ignores the uploaded PDF is
 * worse than an error.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';

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
const CCRM_PDF_TPL_HEADER_STYLES = ['light', 'dark-band', 'accent-band'];
const CCRM_PDF_TPL_TABLE_STYLES = ['filled-primary', 'filled-dark', 'underline'];
const CCRM_PDF_TPL_USP_STYLES = ['soft', 'left-border', 'outlined'];
const CCRM_PDF_TPL_BANNER_STYLES = ['gradient', 'solid-dark', 'outlined'];
const CCRM_PDF_TPL_FONTS = ['sans', 'serif', 'mono'];
const CCRM_PDF_TPL_BADGES = ['rounded', 'square', 'pill'];

/**
 * The blueprint is model output, so every field is untrusted. Colours end up in
 * a style attribute in the browser and are also used with an appended alpha
 * pair, so anything that is not a plain hex colour is replaced by the default.
 */
function ccrm_pdf_tpl_color($value, string $fallback): string {
    if (!is_string($value)) {
        return $fallback;
    }
    $v = trim($value);
    if (!preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $v)) {
        return $fallback;
    }
    if (strlen($v) === 4) {
        $v = '#' . $v[1] . $v[1] . $v[2] . $v[2] . $v[3] . $v[3];
    }
    return strtolower($v);
}

/** Trim an untrusted string field to a sane column length. */
function ccrm_pdf_tpl_text($value, string $fallback, int $max = 255): string {
    $v = is_string($value) ? trim($value) : '';
    if ($v === '') {
        return $fallback;
    }
    return mb_substr($v, 0, $max);
}

/** One of an allow-list, else the default. */
function ccrm_pdf_tpl_enum($value, array $allowed, string $fallback): string {
    return (is_string($value) && in_array($value, $allowed, true)) ? $value : $fallback;
}

/** A section title override: one line, control characters gone, length-capped; '' keeps the built-in label. */
function ccrm_pdf_tpl_heading($value): string {
    if (!is_string($value)) {
        return '';
    }
    $v = preg_replace('/[\x00-\x1f\x7f\s]+/u', ' ', $value);
    return mb_substr(trim((string)$v), 0, 90);
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
 * Turn the model's JSON into the template the app stores. Pure: no I/O, so it can
 * be exercised from the CLI (scripts/test-pdf-template-blueprint.php).
 */
function ccrm_pdf_tpl_build(array $blueprint, string $pdfName, string $pdfUrl): array {
    // Only known section ids survive — the renderer has no notion of any other —
    // and every required block the order left out is appended.
    $sectionsOrder = is_array($blueprint['sectionsOrder'] ?? null) ? array_filter($blueprint['sectionsOrder'], 'is_string') : [];
    $sectionsOrder = array_values(array_unique(array_intersect($sectionsOrder, CCRM_PDF_TPL_SECTIONS)));
    foreach (CCRM_PDF_TPL_SECTIONS as $req) {
        if (!in_array($req, $sectionsOrder, true)) {
            $sectionsOrder[] = $req;
        }
    }

    $colors = is_array($blueprint['colors'] ?? null) ? $blueprint['colors'] : [];
    $layoutIn = is_array($blueprint['layout'] ?? null) ? $blueprint['layout'] : [];
    $headingsIn = is_array($layoutIn['headings'] ?? null) ? $layoutIn['headings'] : [];
    $font = ccrm_pdf_tpl_enum($layoutIn['fontFamily'] ?? null, CCRM_PDF_TPL_FONTS, 'sans');

    return [
        'id' => 'act-' . bin2hex(random_bytes(6)),
        'name' => ccrm_pdf_tpl_text($blueprint['name'] ?? null, pathinfo($pdfName, PATHINFO_FILENAME) ?: 'AI Custom Template', 150),
        'description' => ccrm_pdf_tpl_text($blueprint['description'] ?? null, 'AI-analyzed custom price offer template', 500),
        'sourcePdfUrl' => $pdfUrl,
        'sourcePdfName' => $pdfName,
        'colors' => [
            'primary' => ccrm_pdf_tpl_color($colors['primary'] ?? null, '#0f172a'),
            'secondary' => ccrm_pdf_tpl_color($colors['secondary'] ?? null, '#334155'),
            'background' => ccrm_pdf_tpl_color($colors['background'] ?? null, '#ffffff'),
            'accent' => ccrm_pdf_tpl_color($colors['accent'] ?? null, '#f97316'),
            'text' => ccrm_pdf_tpl_color($colors['text'] ?? null, '#1e293b')
        ],
        // Fixed columns of the table; the font is an allow-listed name, not a CSS stack.
        'typography' => ['fontFamily' => $font, 'headingStyle' => 'bold'],
        'layout' => [
            'headerStyle' => ccrm_pdf_tpl_enum($layoutIn['headerStyle'] ?? null, CCRM_PDF_TPL_HEADER_STYLES, 'light'),
            'tableHeaderStyle' => ccrm_pdf_tpl_enum($layoutIn['tableHeaderStyle'] ?? null, CCRM_PDF_TPL_TABLE_STYLES, 'filled-primary'),
            'uspCardStyle' => ccrm_pdf_tpl_enum($layoutIn['uspCardStyle'] ?? null, CCRM_PDF_TPL_USP_STYLES, 'soft'),
            'totalBannerStyle' => ccrm_pdf_tpl_enum($layoutIn['totalBannerStyle'] ?? null, CCRM_PDF_TPL_BANNER_STYLES, 'gradient'),
            'fontFamily' => $font,
            'headings' => [
                'usp' => ccrm_pdf_tpl_heading($headingsIn['usp'] ?? null),
                'items' => ccrm_pdf_tpl_heading($headingsIn['items'] ?? null),
                'nextStep' => ccrm_pdf_tpl_heading($headingsIn['nextStep'] ?? null)
            ]
        ],
        'sectionsOrder' => $sectionsOrder,
        'customBannerText' => ccrm_pdf_tpl_text($blueprint['customBannerText'] ?? null, '', 255),
        'badgeStyle' => ccrm_pdf_tpl_enum($blueprint['badgeStyle'] ?? null, CCRM_PDF_TPL_BADGES, 'rounded'),
        'createdAt' => date('Y-m-d H:i:s')
    ];
}

/** The instructions for the model: the exact schema, and where to read each value from. */
function ccrm_pdf_tpl_prompt(string $pdfText, string $langName): string {
    $hint = $pdfText !== '' ? "\n\nText extracted from the PDF (a hint only — the attached PDF pages are the source of truth):\n```\n" . mb_substr($pdfText, 0, 4000) . "\n```" : '';
    return "You are a document designer. The attached PDF is a sample business price offer. Read how it LOOKS from its pages — its colours, header, table, cards and price banner — and describe that look as a template blueprint. Do not invent a style that the pages do not show; copy the colours you can see.

The blueprint describes a fixed document with these blocks, which the app always prints:
header, client_metadata, greeting, usp_grid (four value cards), reassurance, items_table, total_box (the price banner), key_parameters (three highlight boxes), next_steps, signoff, footer.
You choose HOW each is styled from the allowed values below. You cannot add or remove blocks.

Return ONLY a JSON object with exactly this structure:
{
  \"name\": \"Short template name (max 60 characters)\",
  \"description\": \"One sentence describing the look\",
  \"colors\": {
    \"primary\": \"#rrggbb main brand colour used for headings\",
    \"secondary\": \"#rrggbb second brand colour\",
    \"accent\": \"#rrggbb highlight colour (the orange, green, ... used for accents)\",
    \"background\": \"#rrggbb page colour (almost always #ffffff)\",
    \"text\": \"#rrggbb body text colour (a dark colour)\"
  },
  \"layout\": {
    \"headerStyle\": \"light | dark-band | accent-band\",
    \"tableHeaderStyle\": \"filled-primary | filled-dark | underline\",
    \"uspCardStyle\": \"soft | left-border | outlined\",
    \"totalBannerStyle\": \"gradient | solid-dark | outlined\",
    \"fontFamily\": \"sans | serif | mono\",
    \"headings\": {
      \"usp\": \"the sample's own title of the benefits/why-us section, or empty\",
      \"items\": \"the sample's own title of the scope/items section, or empty\",
      \"nextStep\": \"the sample's own title of the next-step section, or empty\"
    }
  },
  \"sectionsOrder\": [\"header\", \"client_metadata\", \"greeting\", \"usp_grid\", \"reassurance\", \"items_table\", \"total_box\", \"key_parameters\", \"next_steps\", \"signoff\", \"footer\"],
  \"customBannerText\": \"the sample's wording above the total price, or empty\",
  \"badgeStyle\": \"rounded | square | pill\"
}

How to choose:
- headerStyle: dark-band = a full-width dark header with the logo/name and contacts on it; accent-band = the same in the accent colour; light = a plain header on white.
- tableHeaderStyle: filled-primary = coloured header row; filled-dark = black/charcoal header row; underline = no fill, only a line.
- uspCardStyle: soft = grey boxes; left-border = cards with a thick coloured left edge; outlined = cards with a coloured outline.
- totalBannerStyle: gradient = colour gradient; solid-dark = a solid black/charcoal bar; outlined = white with a coloured border.
- fontFamily: serif only if the sample is clearly set in a serif face, mono only for a monospaced face; otherwise sans.
- badgeStyle: the corner shape of the cards: rounded, square (sharp), or pill.
- sectionsOrder: keep the order in which the sample prints these blocks; use only the ids above.
- Write the human-readable values (name, description, headings, customBannerText) in {$langName}. Copy headings and banner wording from the sample when it has them; leave the string empty when it does not.
- Colours are hex only, never names." . $hint;
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
$aiContent = trim((string)($parsedAi['choices'][0]['message']['content'] ?? ''));
$blueprint = $aiContent !== '' ? json_decode($aiContent, true) : null;
if (!is_array($blueprint) || $blueprint === []) {
    error_log('[generate_pdf_template] OpenAI returned no usable JSON (model ' . $model . ')');
    tpl_error(502, 'ai_empty', 'OpenAI returned no usable template.');
}

echo json_encode([
    'success' => true,
    'template' => ccrm_pdf_tpl_build($blueprint, $pdfName, $pdfUrl)
], JSON_UNESCAPED_UNICODE);
