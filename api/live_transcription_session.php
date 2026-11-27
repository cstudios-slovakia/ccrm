<?php
/**
 * Meeting Room "Focus helper": live transcript while a meeting is recorded.
 *
 * The recording itself and the official transcript (Soniox async or gpt-transcribe over the
 * whole file, transcribe_meeting.php) are separate. This endpoint only serves the live layer:
 *
 *   create_session  with a Soniox key configured: mint a Soniox TEMPORARY key for a real-time
 *                   WebSocket (model stt-rt-v6 and URL pinned here, speaker diarization on the
 *                   browser side) and answer {provider: "soniox", api_key, ws_url, ...}.
 *                   Without one: mint a short-lived Realtime client secret for a TRANSCRIPTION
 *                   session (session.type = "transcription", model gpt-live-transcribe, pinned
 *                   here) and answer {provider: "openai", client_secret, ...}.
 *   exchange_sdp    post the browser's WebRTC SDP offer to OpenAI with that client secret.
 *                   The master key never leaves the server and is never used as a fallback.
 *   catch_up        2-3 bullet recap of the last minutes of the live transcript (cheap text model).
 *
 * Either key starts a live session. The document and "catch me up" need the OpenAI key (text
 * model); with only a Soniox key the browser shows the transcript without them.
 * The Soniox master key never reaches the browser, only a temporary key (60 s to connect).
 *
 * Deliberately NOT realtime_session.php: that one carries the voice-assistant prompt and
 * write tools and is gated by rag_ai. A meeting transcript needs none of it.
 *
 * Access: the Meeting Room's own permission key `meetings`, at EDIT level. Recording a meeting
 * (upload_audio.php) already requires edit, so anyone who can record can use the helper and
 * nobody else can spend the key on it.
 */
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$sessionUser = ccrm_require_auth();

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => (KOPERNIQ_PRODUCT_NAME . ' is not installed yet.')]);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// The permission check runs BEFORE the integration config is read: a caller without the
// right gets a plain 403 and learns nothing about whether an OpenAI key is configured.
ccrm_require_perm($pdo, $sessionUser, 'meetings', 'edit');

$payload = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($payload)) {
    $payload = [];
}
$action = (string)($payload['action'] ?? 'create_session');
if (!in_array($action, ['create_session', 'exchange_sdp', 'catch_up'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Unknown action.']);
    exit;
}

$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
$integrationsConfig = is_array($integrationsConfig)
    ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys())
    : [];
$openAiKey = trim((string)($integrationsConfig['openAiKey'] ?? ''));
// The live transcript runs on either key (Soniox when set, else OpenAI). The SDP exchange is
// OpenAI's own transport, and "catch me up" needs OpenAI's text model.
$hasSonioxKey = trim((string)($integrationsConfig['sonioxApiKey'] ?? '')) !== '';
if ($openAiKey === '' && ($action !== 'create_session' || !$hasSonioxKey)) {
    echo json_encode([
        'success' => false,
        'message' => $action === 'create_session'
            ? 'No transcription key is configured. Add an OpenAI or Soniox API key in Settings > AI.'
            : 'OpenAI API key is missing. Please configure your OpenAI API Key in Settings > AI.',
    ]);
    exit;
}

/** POST a JSON/SDP body with a Bearer token (OpenAI, Soniox). Returns [httpCode, body, curlError]. */
function ccrm_live_post(string $url, string $authToken, string $body, string $contentType, int $timeout): array
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: ' . $contentType,
        'Authorization: Bearer ' . $authToken,
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$code, is_string($res) ? $res : '', $err];
}

/** The OpenAI-flavoured name the callers below use; same request. */
function ccrm_live_openai_post(string $url, string $authToken, string $body, string $contentType, int $timeout): array
{
    return ccrm_live_post($url, $authToken, $body, $contentType, $timeout);
}

// ---------------------------------------------------------------------------------------
// create_session
// ---------------------------------------------------------------------------------------
if ($action === 'create_session') {
    // A meeting is long but a session is only the handshake; anything past a few dozen per
    // hour per person is a loop, not a person pressing Retry.
    if (ccrm_rate_limit_exceeded($pdo, 'live_transcription_session', (string)($sessionUser['id'] ?? ''), 40, 3600)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Too many live sessions. Try again later.']);
        exit;
    }

    // Language hints: ISO-639-1 only, at most two, never taken on trust from the browser.
    $hints = [];
    foreach ((array)($payload['languages'] ?? []) as $lang) {
        $lang = strtolower(trim((string)$lang));
        if (preg_match('/^[a-z]{2}$/', $lang) && !in_array($lang, $hints, true)) {
            $hints[] = $lang;
        }
        if (count($hints) >= 2) {
            break;
        }
    }

    // Soniox (live speaker diarization). Model and URL are pinned here, never read from the
    // request. The browser gets a temporary key that opens one WebSocket within 60 s and
    // closes it after at most 5 h (the stream limit is 300 minutes).
    $sonioxKey = trim((string)($integrationsConfig['sonioxApiKey'] ?? ''));
    if ($sonioxKey !== '') {
        $refId = 'ccrm-user-' . preg_replace('/[^A-Za-z0-9_-]/', '', (string)($sessionUser['id'] ?? ''));
        [$sCode, $sBody, $sCurlErr] = ccrm_live_post(
            'https://api.soniox.com/v1/auth/temporary-api-key',
            $sonioxKey,
            json_encode([
                'usage_type' => 'transcribe_websocket',
                'expires_in_seconds' => 60,
                'client_reference_id' => substr($refId, 0, 256),
                'max_session_duration_seconds' => 18000,
            ]),
            'application/json',
            15
        );
        if ($sCode !== 200 && $sCode !== 201) {
            $sErr = json_decode($sBody, true);
            $sMsg = is_array($sErr)
                ? (string)($sErr['error_message'] ?? $sErr['message'] ?? ($sErr['error']['message'] ?? ''))
                : '';
            if ($sMsg === '') {
                $sMsg = $sCurlErr !== '' ? $sCurlErr : 'Soniox API error';
            }
            http_response_code($sCode >= 400 && $sCode <= 599 ? $sCode : 502);
            echo json_encode(['success' => false, 'message' => 'Could not start the live transcript (Soniox, HTTP ' . $sCode . '): ' . $sMsg]);
            exit;
        }
        $sData = json_decode($sBody, true);
        $tempKey = is_array($sData) ? (string)($sData['api_key'] ?? '') : '';
        if ($tempKey === '') {
            http_response_code(502);
            echo json_encode(['success' => false, 'message' => 'Soniox did not return a temporary key.']);
            exit;
        }
        echo json_encode([
            'success' => true,
            'provider' => 'soniox',
            'api_key' => $tempKey,
            'model' => 'stt-rt-v6',
            'ws_url' => 'wss://stt-rt.soniox.com/transcribe-websocket',
            'expires_at' => $sData['expires_at'] ?? null,
        ]);
        exit;
    }

    // Model pinned here, not read from the request. Turn detection is null on purpose:
    // gpt-live-transcribe does not support server_vad / semantic_vad, so the browser
    // detects the end of speech itself and sends input_audio_buffer.commit.
    $transcription = ['model' => 'gpt-live-transcribe'];
    if ($hints) {
        $transcription['languages'] = $hints;
    }
    $transcription['delay'] = 'low';

    $build = static function (array $transcription): array {
        return [
            // Short expiry: the secret only has to survive until the SDP exchange.
            'expires_after' => ['anchor' => 'created_at', 'seconds' => 120],
            'session' => [
                'type' => 'transcription',
                'audio' => [
                    'input' => [
                        'format' => ['type' => 'audio/pcm', 'rate' => 24000],
                        'transcription' => $transcription,
                        'turn_detection' => null,
                    ],
                ],
            ],
        ];
    };

    [$code, $body, $curlErr] = ccrm_live_openai_post(
        'https://api.openai.com/v1/realtime/client_secrets',
        $openAiKey,
        json_encode($build($transcription), JSON_INVALID_UTF8_SUBSTITUTE),
        'application/json',
        15
    );

    // `delay` / `languages` are model options the reference lists unevenly; if the
    // account's API rejects them with a 400, fall back to the bare model.
    if ($code === 400) {
        [$code2, $body2, $curlErr2] = ccrm_live_openai_post(
            'https://api.openai.com/v1/realtime/client_secrets',
            $openAiKey,
            json_encode($build(['model' => 'gpt-live-transcribe']), JSON_INVALID_UTF8_SUBSTITUTE),
            'application/json',
            15
        );
        if ($code2 === 200 || $code2 === 201) {
            [$code, $body, $curlErr] = [$code2, $body2, $curlErr2];
        }
    }

    if ($code !== 200 && $code !== 201) {
        $err = json_decode($body, true);
        $msg = $err['error']['message'] ?? ($curlErr !== '' ? $curlErr : 'OpenAI Realtime API error');
        http_response_code($code >= 400 && $code <= 599 ? $code : 502);
        echo json_encode(['success' => false, 'message' => 'Could not start the live transcript (HTTP ' . $code . '): ' . $msg]);
        exit;
    }

    $data = json_decode($body, true);
    $secret = is_array($data) ? (string)($data['value'] ?? $data['client_secret']['value'] ?? '') : '';
    if ($secret === '') {
        http_response_code(502);
        echo json_encode(['success' => false, 'message' => 'OpenAI did not return a client secret.']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'provider' => 'openai',
        'client_secret' => $secret,
        'expires_at' => $data['expires_at'] ?? null,
    ]);
    exit;
}

// ---------------------------------------------------------------------------------------
// exchange_sdp
// ---------------------------------------------------------------------------------------
if ($action === 'exchange_sdp') {
    // The browser must present the ephemeral secret it got from create_session. The master
    // key is never a fallback, or any editor could open a session of their own choosing.
    $token = trim((string)($payload['client_secret'] ?? ''));
    $sdp = (string)($payload['sdp'] ?? '');
    if ($token === '' || strpos($token, 'ek_') !== 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'client_secret is required.']);
        exit;
    }
    if ($sdp === '' || strlen($sdp) > 65536) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'SDP offer is required.']);
        exit;
    }

    // No model in the URL: the session (type, model, languages) is carried by the secret.
    [$code, $answer, $curlErr] = ccrm_live_openai_post(
        'https://api.openai.com/v1/realtime/calls',
        $token,
        $sdp,
        'application/sdp',
        20
    );
    if ($code !== 200 && $code !== 201) {
        http_response_code($code >= 400 && $code <= 599 ? $code : 502);
        echo json_encode([
            'success' => false,
            'message' => 'OpenAI WebRTC negotiation failed (HTTP ' . $code . '): ' . ($curlErr !== '' ? $curlErr : $answer),
        ]);
        exit;
    }
    echo json_encode(['success' => true, 'sdp' => $answer]);
    exit;
}

// ---------------------------------------------------------------------------------------
// catch_up
// ---------------------------------------------------------------------------------------
$text = trim((string)($payload['text'] ?? ''));
if ($text === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Nothing to summarise yet.']);
    exit;
}
// About two minutes of speech is well under this; the cap only guards the request size.
if (function_exists('mb_substr')) {
    $text = mb_substr($text, -8000);
} else {
    $text = substr($text, -8000);
}
$lang = (string)($payload['language'] ?? 'en');
$langName = $lang === 'sk' ? 'Slovak' : ($lang === 'hu' ? 'Hungarian' : 'English');

if (ccrm_rate_limit_exceeded($pdo, 'live_catch_up', (string)($sessionUser['id'] ?? ''), 60, 3600)) {
    http_response_code(429);
    echo json_encode(['success' => false, 'message' => 'Too many requests. Try again in a moment.']);
    exit;
}

$prompt = "Below is the most recent part of a live, automatically generated transcript of a meeting. "
    . "It may contain recognition mistakes. Lines may start with a speaker label such as \"Participant 1:\"; "
    . "keep who said what when it matters. "
    . "Someone lost focus and needs to catch up. Write 2 to 3 short bullet points (one line each) "
    . "saying what was just discussed, what was decided or asked, and what is open right now. "
    . "Write in {$langName}. Output only the bullets, each starting with \"- \". Do not invent anything that is not in the text.\n\n"
    . "Transcript:\n" . $text;

$model = ccrm_ai_model($integrationsConfig);
$chat = [
    'model' => $model,
    'messages' => [['role' => 'user', 'content' => $prompt]],
];
if (ccrm_ai_model_supports_temperature($model)) {
    $chat['temperature'] = 0.2;
}

[$code, $body, $curlErr] = ccrm_live_openai_post(
    'https://api.openai.com/v1/chat/completions',
    $openAiKey,
    json_encode($chat, JSON_INVALID_UTF8_SUBSTITUTE),
    'application/json',
    25
);
if ($code !== 200 || $body === '') {
    $err = json_decode($body, true);
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'message' => 'Catch-up failed: ' . ($err['error']['message'] ?? ($curlErr !== '' ? $curlErr : 'OpenAI request failed')),
    ]);
    exit;
}

$decoded = json_decode($body, true);
ccrm_ai_capture_usage($pdo, 'meeting_catch_up', $decoded, $model);
$reply = trim((string)($decoded['choices'][0]['message']['content'] ?? ''));

$bullets = [];
foreach (preg_split('/\R/u', $reply) ?: [] as $line) {
    $line = trim(preg_replace('/^\s*(?:[-*\x{2022}]|\d+[.)])\s*/u', '', $line) ?? '');
    if ($line !== '') {
        $bullets[] = $line;
    }
    if (count($bullets) >= 4) {
        break;
    }
}
if (!$bullets) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'The summary came back empty.']);
    exit;
}

echo json_encode(['success' => true, 'bullets' => $bullets]);
