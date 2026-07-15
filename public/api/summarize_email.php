<?php
/**
 * AI Email Summarization Endpoint.
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
$sessionUser = ccrm_require_auth();
$userEmail = $sessionUser['email'] ?? '';

if (empty($userEmail)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing authenticated user email']);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || empty($data['email_uid']) || !isset($data['folder'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing email UID or folder information']);
    exit;
}

$emailUid = trim($data['email_uid']);
$folder = trim($data['folder']);
$subject = trim($data['subject'] ?? '(No Subject)');
$body = trim($data['body'] ?? '');

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
    exit;
}

// Helper functions to fetch email detail from IMAP if body is not supplied
function get_imap_credentials_helper($settings) {
    $user = !empty($settings['imapUsername']) ? $settings['imapUsername'] : (isset($settings['username']) ? $settings['username'] : '');
    $pass = !empty($settings['imapPassword']) ? $settings['imapPassword'] : (isset($settings['password']) ? $settings['password'] : '');
    return [$user, $pass];
}

function get_imap_mailbox_string_helper($settings, $folder = '') {
    $host = $settings['imapHost'];
    $port = $settings['imapPort'];
    $sec = isset($settings['imapSecure']) ? $settings['imapSecure'] : 'ssl';
    $ssl = '/novalidate-cert';
    if ($sec === 'ssl' || $sec === true) {
        $ssl = '/ssl/novalidate-cert';
    } elseif ($sec === 'tls') {
        $ssl = '/tls/novalidate-cert';
    }
    if ($settings['provider'] === 'exchange') {
        $host = !empty($settings['imapHost']) ? $settings['imapHost'] : 'outlook.office365.com';
        $port = '993';
        $ssl = '/ssl/novalidate-cert';
    }
    return "{" . "$host:$port/imap$ssl" . "}$folder";
}

function decode_imap_body_helper($body, $encoding) {
    if ($encoding == 3) { // BASE64
        return base64_decode($body);
    } elseif ($encoding == 4) { // QUOTED-PRINTABLE
        return quoted_printable_decode($body);
    }
    return $body;
}

function fetch_imap_email_body_helper($settings, $folder, $uid) {
    $mailbox = get_imap_mailbox_string_helper($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials_helper($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        return '';
    }
    
    $msgNo = @imap_msgno($imapStream, $uid);
    if (!$msgNo) {
        $msgNo = $uid;
    }
    
    $html = '';
    $text = '';
    
    $structure = imap_fetchstructure($imapStream, $msgNo);
    if ($structure) {
        if (isset($structure->parts) && count($structure->parts)) {
            foreach ($structure->parts as $partNo => $part) {
                if (isset($part->parts)) {
                    foreach ($part->parts as $nestedPartNo => $nestedPart) {
                        $partStr = ($partNo + 1) . '.' . ($nestedPartNo + 1);
                        $body = imap_fetchbody($imapStream, $msgNo, $partStr);
                        $body = decode_imap_body_helper($body, $nestedPart->encoding);
                        if (isset($nestedPart->subtype) && $nestedPart->subtype === 'HTML') {
                            $html = $body;
                        } elseif (isset($nestedPart->subtype) && $nestedPart->subtype === 'PLAIN') {
                            $text = $body;
                        }
                    }
                } else {
                    $body = imap_fetchbody($imapStream, $msgNo, (string)($partNo + 1));
                    $body = decode_imap_body_helper($body, $part->encoding);
                    if (isset($part->subtype) && $part->subtype === 'HTML') {
                        $html = $body;
                    } elseif (isset($part->subtype) && $part->subtype === 'PLAIN') {
                        $text = $body;
                    }
                }
            }
        } else {
            $body = imap_body($imapStream, $msgNo);
            $body = decode_imap_body_helper($body, $structure->encoding);
            if (isset($structure->subtype) && $structure->subtype === 'HTML') {
                $html = $body;
            } else {
                $text = $body;
            }
        }
    }
    
    @imap_close($imapStream);
    return !empty($html) ? $html : $text;
}

if (empty($body) && $folder !== 'thread') {
    $userStmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `email` = ?");
    $userStmt->execute([$userEmail]);
    $metadataStr = $userStmt->fetchColumn();
    if ($metadataStr) {
        $metadata = json_decode($metadataStr, true);
        $emailSettings = ccrm_decrypt_email_settings($metadata['emailSettings'] ?? null);
        if ($emailSettings && ($emailSettings['isValidated'] ?? false)) {
            try {
                $imapBody = fetch_imap_email_body_helper($emailSettings, $folder, $emailUid);
                if ($imapBody) {
                    $body = $imapBody;
                }
            } catch (\Exception $ex) {
                // fallback
            }
        }
    }
}

// 1. Check if summary already exists in database
try {
    $checkStmt = $pdo->prepare("SELECT `summary` FROM `email_summaries` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
    $checkStmt->execute([$userEmail, $folder, $emailUid]);
    $existingSummary = $checkStmt->fetchColumn();
    if ($existingSummary !== false) {
        $decoded = json_decode($existingSummary, true);
        if (is_array($decoded) && isset($decoded['summary'])) {
            echo json_encode([
                'success' => true,
                'summary' => $decoded['summary'],
                'actionItems' => $decoded['actionItems'] ?? []
            ]);
        } else {
            echo json_encode([
                'success' => true,
                'summary' => $existingSummary,
                'actionItems' => []
            ]);
        }
        exit;
    }
} catch (\Exception $e) {
    // If table not updated/created yet, proceed, but it should be auto-created by schema.php
}

// 2. Fetch integrations config to get OpenAI API key
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

// 3. Strip HTML tags from email body for efficiency/token saving if body is large
$plainTextBody = strip_tags($body);
if (strlen($plainTextBody) > 4000) {
    $plainTextBody = substr($plainTextBody, 0, 4000) . '... [TRUNCATED]';
}

$openAiHeaders = [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
];

$prompt = "You are an expert CRM assistant. Analyze the following email details or conversation flow and output a JSON response containing a concise summary (1-2 sentences) and a list of action items / suggested tasks (up to 4 items).
   
You MUST detect the language in which the provided email is written and write the \"summary\" and all \"actionItems\" in that same language (e.g. Slovak if Slovak, English if English).

You MUST respond ONLY with a valid JSON object. Do not wrap it in markdown code blocks.
Output structure:
{
  \"summary\": \"Concise 1-2 sentence summary of the email.\",
  \"actionItems\": [\"action1\", \"action2\", ...]
}

Email Subject: " . $subject . "\n\nEmail Content:\n" . $plainTextBody;

$payload = [
    'model' => ccrm_ai_model(),
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ],
    'temperature' => 0.3
];

// IMAP-fetched bodies frequently contain bytes that are not valid UTF-8 (e.g.
// Slovak text in ISO-8859-2 / Windows-1250). json_encode() returns false on
// invalid UTF-8, which would send an empty POST body and make OpenAI reject the
// request with "could not parse the JSON body". Substitute invalid sequences so
// encoding always succeeds.
$jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

if ($jsonPayload === false) {
    // Fallback for PHP builds where the flag is unavailable: scrub the prompt.
    $payload['messages'][0]['content'] = mb_convert_encoding($prompt, 'UTF-8', 'UTF-8');
    $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE);
}

if ($jsonPayload === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to encode AI request payload.']);
    exit;
}

// OpenAI occasionally rejects a request transiently (HTTP 429 rate limit, or a
// sporadic 5xx / network blip). The email view fires several summaries at once,
// so a single transient failure should not surface to the user as a hard 500.
// Retry transient failures a few times with exponential backoff; fail fast on
// deterministic errors (e.g. 400/401) so we don't waste time or quota.
$response = false; $httpCode = 0; $curlErr = '';
$maxAttempts = 3;
for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $openAiHeaders);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        break;
    }
    $isTransient = ($httpCode === 429 || $httpCode >= 500 || $response === false || $response === '' || !empty($curlErr));
    if (!$isTransient || $attempt === $maxAttempts) {
        break;
    }
    // Exponential backoff with jitter: ~0.8s, then ~1.6s.
    usleep((int)(pow(2, $attempt - 1) * 800000) + rand(0, 250000));
}

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
        'message' => 'Failed to generate summary from OpenAI.',
        'raw_reply' => $response
    ]);
    exit;
}

$cleanedReply = trim(preg_replace('/^```json|```$/i', '', trim($aiReply)));
$aiJson = json_decode($cleanedReply, true);

if (!is_array($aiJson) || empty($aiJson['summary'])) {
    $aiJson = [
        'summary' => $aiReply,
        'actionItems' => []
    ];
}

$dbSaveValue = json_encode($aiJson, JSON_UNESCAPED_UNICODE);

// 4. Save generated summary JSON to database
try {
    $saveStmt = $pdo->prepare("INSERT INTO `email_summaries` (`user_email`, `folder`, `email_uid`, `summary`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE `summary` = VALUES(`summary`)");
    $saveStmt->execute([$userEmail, $folder, $emailUid, $dbSaveValue]);
} catch (\Exception $e) {
    // Log or handle database save errors
}

echo json_encode([
    'success' => true,
    'summary' => $aiJson['summary'],
    'actionItems' => $aiJson['actionItems'] ?? []
]);
