<?php
/**
 * AI Email Summarization Endpoint.
 */
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

// SECURITY: Authenticated users only
$sessionUser = ccrm_require_auth();
ccrm_gate($sessionUser, 'email');
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
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
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// The mailbox code lives in mail_broker.php and is shared, not copied: this
// file used to carry its own IMAP fetch, which is how it kept marking messages
// read (a BODY[] fetch without FT_PEEK) after the broker had been fixed. The
// broker returns early when included from another endpoint, so only its helpers
// are picked up here.
require_once __DIR__ . '/mail_broker.php';

// Plain text of one message, for the AI prompt only. Never marks it read.
function ccrm_summary_body_from_mailbox($settings, $folder, $uid) {
    $mailbox = get_imap_mailbox_string($settings, $folder);
    list($imapUser, $imapPass) = get_imap_credentials($settings);
    $imapStream = @imap_open($mailbox, $imapUser, $imapPass, 0, 1, ['DISABLE_AUTHENTICATOR' => 'GSSAPI']);
    if (!$imapStream) {
        return '';
    }
    // Never fall back to treating the UID as a sequence number - that reads
    // (and summarises) a different message once the mailbox has had a deletion.
    $msgNo = @imap_msgno($imapStream, (int)$uid);
    $text = $msgNo ? fetch_email_body_text($imapStream, $msgNo) : '';
    @imap_close($imapStream);
    @imap_errors();
    return $text;
}

if (empty($body) && $folder !== 'thread') {
    $userStmt = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `email` = ?");
    $userStmt->execute([$userEmail]);
    $metadataStr = $userStmt->fetchColumn();
    if ($metadataStr) {
        $metadata = json_decode($metadataStr, true);
        $emailSettings = ccrm_decrypt_email_settings($metadata['emailSettings'] ?? null);
        require_once __DIR__ . '/demo_mailbox.php';
        if ($emailSettings && ccrm_demo_mailbox_active($pdo, $emailSettings)) {
            $body = ccrm_demo_mailbox_body_text($pdo, strtolower((string)$emailSettings['imapUsername']), $folder, $emailUid);
        } elseif ($emailSettings && ($emailSettings['isValidated'] ?? false)) {
            try {
                $imapBody = ccrm_summary_body_from_mailbox($emailSettings, $folder, $emailUid);
                if ($imapBody) {
                    $body = $imapBody;
                }
            } catch (\Exception $ex) {
                // fallback
            }
        }
    }
}

$existingSummary = false;
if (empty($data['force'])) {
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
                    'problems' => is_array($decoded['problems'] ?? null) ? $decoded['problems'] : [],
                    'actionItems' => $decoded['actionItems'] ?? []
                ]);
            } else {
                echo json_encode([
                    'success' => true,
                    'summary' => $existingSummary,
                    'problems' => [],
                    'actionItems' => []
                ]);
            }
            exit;
        }
    } catch (\Exception $e) {
        // If table not updated/created yet, proceed, but it should be auto-created by schema.php
    }
}

// 2. Fetch integrations config to get OpenAI API key
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
        'message' => 'AI provider is not configured. Please configure an API key or LLM connector in Settings.'
    ]);
    exit;
}

// 3. Strip HTML tags from email body for efficiency/token saving if body is large
$plainTextBody = strip_tags($body);
if (strlen($plainTextBody) > 4000) {
    $plainTextBody = substr($plainTextBody, 0, 4000) . '... [TRUNCATED]';
}

$prompt = "You are an expert CRM assistant. Analyze the following communication message or conversation flow and output a JSON response containing:
1. \"summary\": A concise summary (1-2 sentences) highlighting the core status and any problems or blockers first.
2. \"problems\": An array of specific problems, complaints, delays, risks, unanswered questions, or urgent blockers found in the communication (up to 4 items; empty array [] if everything is fine).
3. \"actionItems\": A list of concrete action items / suggested follow-up tasks (up to 4 items).

You MUST detect the language in which the provided communication is written and write the \"summary\", \"problems\", and \"actionItems\" in that same language (e.g. Slovak if Slovak, Hungarian if Hungarian, English if English).

You MUST respond ONLY with a valid JSON object. Do not wrap it in markdown code blocks.
Output structure:
{
  \"summary\": \"Concise 1-2 sentence summary highlighting any problems.\",
  \"problems\": [\"problem1\", \"problem2\"],
  \"actionItems\": [\"action1\", \"action2\"]
}

Subject / Thread: " . $subject . "\n\nContent:\n" . $plainTextBody;

$emailModel = ccrm_ai_model($integrationsConfig);
$aiRes = ccrm_ai_chat_completion(
    $pdo,
    [
        'model' => $emailModel,
        'messages' => [
            [
                'role' => 'user',
                'content' => $prompt
            ]
        ],
        'temperature' => 0.3,
    ],
    [
        'feature' => 'email_summary',
        'timeout' => 25,
        'retries' => 2,
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

$aiReply = trim((string)($aiRes['content'] ?? ''));

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
        'problems' => [],
        'actionItems' => []
    ];
} else {
    $aiJson['problems'] = is_array($aiJson['problems'] ?? null) ? array_values($aiJson['problems']) : [];
    $aiJson['actionItems'] = is_array($aiJson['actionItems'] ?? null) ? array_values($aiJson['actionItems']) : [];
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
    'problems' => $aiJson['problems'],
    'actionItems' => $aiJson['actionItems']
]);
