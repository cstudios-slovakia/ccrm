<?php
/**
 * CCRM BotMan Multi-Channel Driver Engine (`botman/botman` compatible).
 *
 * Declarative, table-driven implementation of BotMan's DriverInterface across:
 *  - telegram  (BotMan\Drivers\Telegram\TelegramDriver)
 *  - messenger (BotMan\Drivers\Facebook\FacebookDriver — auto-falls back to INTEGRATIONS_CONFIG Meta credentials)
 *  - slack     (BotMan\Drivers\Slack\SlackDriver)
 *  - discord   (BotMan\Drivers\Discord\DiscordDriver)
 *  - teams     (BotMan\Drivers\BotFramework\BotFrameworkDriver)
 *  - viber     (BotMan\Drivers\Viber\ViberDriver)
 *  - twilio    (BotMan\Drivers\Twilio\TwilioMessageDriver — SMS)
 *  - webchat   (BotMan\Drivers\Web\WebDriver — embeddable live chat widget)
 *
 * Reuses CCRM's existing WAAI `store.json` (`chats[]` + `messages{}`) schema so
 * `EmailView.tsx`, 50-message / 5-day conversation context, single-reply guards,
 * Visual Trigger Studio, and `whatsapp_*` MCP tools work with zero duplication.
 *
 * HOW TO ADD A NEW BOTMAN DRIVER:
 *  1. Add the slug to `CCRM_BOTMAN_CONNECTOR_TYPES` and `ccrm_botman_drivers()` below.
 *  2. Add the frontend spec to `BOTMAN_DRIVER_SPECS` in `src/utils/companyMailboxes.ts`.
 */

if (!defined('CCRM_BOTMAN_CONNECTOR_TYPES')) {
    define('CCRM_BOTMAN_CONNECTOR_TYPES', [
        'telegram',
        'messenger',
        'slack',
        'discord',
        'teams',
        'viber',
        'twilio',
        'webchat',
    ]);
}

if (!function_exists('ccrm_is_botman_connector')) {
    function ccrm_is_botman_connector(string $type): bool {
        return in_array(strtolower(trim($type)), CCRM_BOTMAN_CONNECTOR_TYPES, true);
    }
}

if (!function_exists('ccrm_botman_http_request')) {
    /**
     * Lightweight cURL / stream HTTP helper for BotMan driver API calls.
     *
     * @param array<string, string> $headers
     * @param array<string, mixed>|string|null $body
     * @return array{ok: bool, status: int, data: mixed, raw: string, error: ?string}
     */
    function ccrm_botman_http_request(
        string $method,
        string $url,
        array $headers = [],
        $body = null,
        int $timeoutSec = 8,
        ?string $basicAuthUser = null,
        ?string $basicAuthPass = null
    ): array {
        $method = strtoupper($method);
        $payloadStr = null;
        if (is_array($body)) {
            $isForm = false;
            foreach ($headers as $hk => $hv) {
                if (strtolower($hk) === 'content-type' && stripos($hv, 'application/x-www-form-urlencoded') !== false) {
                    $isForm = true;
                    break;
                }
            }
            $payloadStr = $isForm ? http_build_query($body) : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (!$isForm && !isset($headers['Content-Type']) && !isset($headers['content-type'])) {
                $headers['Content-Type'] = 'application/json';
            }
        } elseif (is_string($body)) {
            $payloadStr = $body;
        }

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            $curlHeaders = [];
            foreach ($headers as $k => $v) {
                $curlHeaders[] = $k . ': ' . $v;
            }
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => $timeoutSec,
                CURLOPT_CONNECTTIMEOUT => min(4, $timeoutSec),
                CURLOPT_HTTPHEADER => $curlHeaders,
                CURLOPT_SSL_VERIFYPEER => true,
            ]);
            if ($basicAuthUser !== null) {
                curl_setopt($ch, CURLOPT_USERPWD, $basicAuthUser . ':' . ($basicAuthPass ?? ''));
            }
            if ($payloadStr !== null && $method !== 'GET') {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadStr);
            }
            $raw = curl_exec($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);

            if ($raw === false) {
                return ['ok' => false, 'status' => $status, 'data' => null, 'raw' => '', 'error' => $err ?: 'Network request failed'];
            }
            $decoded = json_decode((string)$raw, true);
            return [
                'ok' => $status >= 200 && $status < 300,
                'status' => $status,
                'data' => $decoded !== null ? $decoded : $raw,
                'raw' => (string)$raw,
                'error' => ($status >= 200 && $status < 300) ? null : ('HTTP ' . $status),
            ];
        }

        // Stream fallback if ext-curl is unavailable
        $headerLines = [];
        foreach ($headers as $k => $v) {
            $headerLines[] = $k . ': ' . $v;
        }
        if ($basicAuthUser !== null) {
            $headerLines[] = 'Authorization: Basic ' . base64_encode($basicAuthUser . ':' . ($basicAuthPass ?? ''));
        }
        $ctx = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $headerLines),
                'content' => $payloadStr ?? '',
                'timeout' => $timeoutSec,
                'ignore_errors' => true,
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
        $status = 0;
        $respHeaders = function_exists('http_get_last_response_headers') ? (http_get_last_response_headers() ?: []) : [];
        foreach ($respHeaders as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int)$m[1];
            }
        }
        if ($raw === false) {
            return ['ok' => false, 'status' => $status, 'data' => null, 'raw' => '', 'error' => 'Stream request failed'];
        }
        $decoded = json_decode((string)$raw, true);
        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'data' => $decoded !== null ? $decoded : $raw,
            'raw' => (string)$raw,
            'error' => ($status >= 200 && $status < 300) ? null : ('HTTP ' . $status),
        ];
    }
}

if (!function_exists('ccrm_botman_resolve_settings')) {
    /**
     * Resolve decrypted BotMan connector settings, automatically falling back to
     * `system_settings.INTEGRATIONS_CONFIG` for Meta (`metaAccessToken`, `metaAppSecret`, `metaAppId`)
     * when `connectorType === 'messenger'` has blank fields.
     */
    function ccrm_botman_resolve_settings(array $mailboxRow, ?\PDO $pdo = null): array {
        $settings = [];
        if (isset($mailboxRow['settings']) && is_array($mailboxRow['settings'])) {
            $settings = $mailboxRow['settings'];
        } elseif (!empty($mailboxRow['settings_json'])) {
            $raw = json_decode((string)$mailboxRow['settings_json'], true);
            if (is_array($raw)) {
                $settings = function_exists('ccrm_decrypt_config_secrets') && function_exists('ccrm_email_secret_keys')
                    ? ccrm_decrypt_config_secrets($raw, ccrm_email_secret_keys())
                    : $raw;
            }
        }

        $type = strtolower(trim((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? ''))));
        if ($type === 'messenger') {
            $needToken = trim((string)($settings['botmanToken'] ?? '')) === '';
            $needSecret = trim((string)($settings['botmanAppSecret'] ?? '')) === '';
            if ($needToken || $needSecret) {
                $db = $pdo ?: (function_exists('ccrm_auth_pdo') ? ccrm_auth_pdo() : null);
                if ($db instanceof \PDO) {
                    try {
                        $rawCfg = $db->query("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG' LIMIT 1")->fetchColumn();
                        $cfg = is_string($rawCfg) ? json_decode($rawCfg, true) : null;
                        if (is_array($cfg)) {
                            if (function_exists('ccrm_decrypt_config_secrets') && function_exists('ccrm_integration_secret_keys')) {
                                $cfg = ccrm_decrypt_config_secrets($cfg, ccrm_integration_secret_keys());
                            }
                            if ($needToken && !empty($cfg['metaAccessToken'])) {
                                $settings['botmanToken'] = (string)$cfg['metaAccessToken'];
                            }
                            if ($needSecret && !empty($cfg['metaAppSecret'])) {
                                $settings['botmanAppSecret'] = (string)$cfg['metaAppSecret'];
                            }
                            if (empty($settings['botmanAppId']) && !empty($cfg['metaAppId'])) {
                                $settings['botmanAppId'] = (string)$cfg['metaAppId'];
                            }
                        }
                    } catch (\Throwable $e) {
                        // Best-effort fallback
                    }
                }
            }
        }

        if (empty($settings['botmanVerifyToken'])) {
            $idSeed = (string)($mailboxRow['id'] ?? ($settings['connectorType'] ?? 'ccrm'));
            $settings['botmanVerifyToken'] = 'ccrm_' . substr(hash('sha256', $idSeed . '|botman-verify'), 0, 16);
        }

        return $settings;
    }
}

if (!function_exists('ccrm_botman_teams_access_token')) {
    /**
     * Obtain a Microsoft Bot Framework OAuth2 Bearer token from `botmanAppId` + `botmanAppSecret`.
     */
    function ccrm_botman_teams_access_token(array $settings): array {
        $appId = trim((string)($settings['botmanAppId'] ?? ''));
        $appSecret = trim((string)($settings['botmanAppSecret'] ?? ($settings['botmanToken'] ?? '')));
        if ($appId === '' || $appSecret === '') {
            return ['ok' => false, 'error' => 'Microsoft App ID and Client Secret are required.'];
        }
        $res = ccrm_botman_http_request(
            'POST',
            'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token',
            ['Content-Type' => 'application/x-www-form-urlencoded'],
            [
                'grant_type' => 'client_credentials',
                'client_id' => $appId,
                'client_secret' => $appSecret,
                'scope' => 'https://api.botframework.com/.default',
            ]
        );
        $token = is_array($res['data']) ? (string)($res['data']['access_token'] ?? '') : '';
        if ($token === '') {
            $errMsg = is_array($res['data']) ? (string)($res['data']['error_description'] ?? ($res['data']['error'] ?? '')) : '';
            return ['ok' => false, 'error' => $errMsg ?: ($res['error'] ?? 'Failed to authenticate with Microsoft Bot Framework.')];
        }
        return ['ok' => true, 'token' => $token];
    }
}

if (!function_exists('ccrm_botman_drivers')) {
    /**
     * Declarative BotMan Driver Registry (`botman/botman` adapter table).
     *
     * Each entry defines:
     *  - `driverClass`: Official BotMan driver class identifier
     *  - `label`: Human-readable channel name
     *  - `test(array $settings)`: Verifies credentials via provider API
     *  - `registerWebhook(array $settings, string $webhookUrl)`: Registers webhook URL if supported
     *  - `verifyWebhook(array $query, array $payload, array $settings)`: Handles challenge handshakes
     *  - `parseWebhook(array $payload, array $headers, array $query, string $rawBody, array $settings)`: Extracts normalized messages
     *  - `poll(array $mailboxRow, array $settings)`: Polls recent messages for local/NAT setups
     *  - `send(string $chatId, string $text, array $settings, array $chatMeta)`: Sends outbound message
     */
    function ccrm_botman_drivers(): array {
        return [
            // 1. TELEGRAM (BotMan\Drivers\Telegram\TelegramDriver)
            'telegram' => [
                'driverClass' => 'BotMan\\Drivers\\Telegram\\TelegramDriver',
                'label' => 'Telegram Bot',
                'test' => static function (array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Telegram Bot Token (from @BotFather) is required.'];
                    }
                    $r = ccrm_botman_http_request('GET', "https://api.telegram.org/bot{$token}/getMe");
                    if (empty($r['data']['ok'])) {
                        return ['ok' => false, 'error' => (string)($r['data']['description'] ?? $r['error'] ?? 'Invalid Telegram Bot Token.')];
                    }
                    $bot = $r['data']['result'] ?? [];
                    $uname = !empty($bot['username']) ? '@' . $bot['username'] : ($bot['first_name'] ?? 'Telegram Bot');
                    return ['ok' => true, 'handle' => $uname, 'detail' => "Connected to Telegram bot {$uname}"];
                },
                'registerWebhook' => static function (array $s, string $url): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Telegram Bot Token is required first.'];
                    }
                    $r = ccrm_botman_http_request('POST', "https://api.telegram.org/bot{$token}/setWebhook", [], ['url' => $url]);
                    if (empty($r['data']['ok'])) {
                        return ['ok' => false, 'error' => (string)($r['data']['description'] ?? 'Telegram setWebhook failed (ensure URL is public HTTPS, or use local polling).')];
                    }
                    return ['ok' => true, 'detail' => 'Telegram webhook registered: ' . $url];
                },
                'verifyWebhook' => static fn(array $q, array $p, array $s): ?array => null,
                'parseWebhook' => static function (array $p, array $h, array $q, string $raw, array $s): array {
                    $msg = $p['message'] ?? ($p['edited_message'] ?? ($p['channel_post'] ?? null));
                    if (!is_array($msg)) {
                        return [];
                    }
                    $text = trim((string)($msg['text'] ?? ($msg['caption'] ?? '')));
                    if ($text === '') {
                        return [];
                    }
                    $chat = $msg['chat'] ?? [];
                    $from = $msg['from'] ?? [];
                    $chatId = (string)($chat['id'] ?? ($from['id'] ?? ''));
                    if ($chatId === '') {
                        return [];
                    }
                    $senderName = trim(((string)($from['first_name'] ?? '')) . ' ' . ((string)($from['last_name'] ?? '')));
                    if ($senderName === '') {
                        $senderName = (string)($from['username'] ?? ($chat['title'] ?? 'Telegram User'));
                    }
                    $chatName = (string)($chat['title'] ?? $senderName);
                    $handle = !empty($from['username']) ? '@' . $from['username'] : ('tg:' . $chatId);
                    return [[
                        'chatId' => $chatId,
                        'chatName' => $chatName,
                        'handle' => $handle,
                        'msgId' => 'tg-' . ($msg['message_id'] ?? uniqid()),
                        'senderName' => $senderName,
                        'text' => $text,
                        'timestamp' => (int)($msg['date'] ?? time()),
                        'fromMe' => !empty($from['is_bot']),
                    ]];
                },
                'poll' => static function (array $box, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return [];
                    }
                    $r = ccrm_botman_http_request('GET', "https://api.telegram.org/bot{$token}/getUpdates?limit=30&timeout=0", [], null, 5);
                    if (empty($r['data']['ok']) || !is_array($r['data']['result'] ?? null)) {
                        return [];
                    }
                    $items = [];
                    $parser = ccrm_botman_drivers()['telegram']['parseWebhook'];
                    foreach ($r['data']['result'] as $upd) {
                        if (is_array($upd)) {
                            foreach ($parser($upd, [], [], '', $s) as $m) {
                                $items[] = $m;
                            }
                        }
                    }
                    return $items;
                },
                'send' => static function (string $chatId, string $text, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Missing Telegram Bot Token.'];
                    }
                    $r = ccrm_botman_http_request('POST', "https://api.telegram.org/bot{$token}/sendMessage", [], [
                        'chat_id' => $chatId,
                        'text' => $text,
                    ]);
                    if (empty($r['data']['ok'])) {
                        return ['ok' => false, 'error' => (string)($r['data']['description'] ?? $r['error'] ?? 'Telegram sendMessage failed.')];
                    }
                    return ['ok' => true, 'msgId' => 'tg-' . ($r['data']['result']['message_id'] ?? uniqid())];
                },
            ],

            // 2. FACEBOOK MESSENGER (BotMan\Drivers\Facebook\FacebookDriver)
            'messenger' => [
                'driverClass' => 'BotMan\\Drivers\\Facebook\\FacebookDriver',
                'label' => 'Facebook Messenger',
                'test' => static function (array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Page Access Token is required (or configure Meta Access Token in Settings -> Integrations).'];
                    }
                    $r = ccrm_botman_http_request('GET', 'https://graph.facebook.com/v19.0/me?fields=id,name&access_token=' . urlencode($token));
                    if (empty($r['data']['id'])) {
                        $err = (string)($r['data']['error']['message'] ?? $r['error'] ?? 'Invalid Facebook Page Access Token.');
                        return ['ok' => false, 'error' => $err];
                    }
                    $name = (string)($r['data']['name'] ?? $r['data']['id']);
                    return ['ok' => true, 'handle' => $name, 'detail' => "Connected to Facebook Page: {$name}"];
                },
                'registerWebhook' => static fn(array $s, string $url): array => [
                    'ok' => true,
                    'detail' => "Copy the Webhook URL ({$url}) and Verify Token into Meta for Developers -> Messenger -> Webhooks.",
                ],
                'verifyWebhook' => static function (array $q, array $p, array $s): ?array {
                    $mode = (string)($q['hub_mode'] ?? ($q['hub.mode'] ?? ''));
                    $token = (string)($q['hub_verify_token'] ?? ($q['hub.verify_token'] ?? ''));
                    $challenge = (string)($q['hub_challenge'] ?? ($q['hub.challenge'] ?? ''));
                    if ($mode === 'subscribe') {
                        $expected = (string)($s['botmanVerifyToken'] ?? '');
                        if ($expected === '' || hash_equals($expected, $token)) {
                            return ['status' => 200, 'raw' => $challenge];
                        }
                        return ['status' => 403, 'raw' => 'Forbidden: Verify token mismatch'];
                    }
                    return null;
                },
                'parseWebhook' => static function (array $p, array $h, array $q, string $raw, array $s): array {
                    $items = [];
                    foreach (($p['entry'] ?? []) as $entry) {
                        foreach (($entry['messaging'] ?? []) as $ev) {
                            $senderId = (string)($ev['sender']['id'] ?? '');
                            $text = trim((string)($ev['message']['text'] ?? ($ev['postback']['title'] ?? ($ev['postback']['payload'] ?? ''))));
                            $isEcho = !empty($ev['message']['is_echo']);
                            if ($senderId === '' || $text === '') {
                                continue;
                            }
                            $items[] = [
                                'chatId' => $senderId,
                                'chatName' => 'Messenger User ' . substr($senderId, -4),
                                'handle' => 'fb:' . $senderId,
                                'msgId' => (string)($ev['message']['mid'] ?? ('fb-' . uniqid())),
                                'senderName' => $isEcho ? 'Page' : ('Messenger User ' . substr($senderId, -4)),
                                'text' => $text,
                                'timestamp' => !empty($ev['timestamp']) ? (int)floor(((float)$ev['timestamp']) / 1000) : time(),
                                'fromMe' => $isEcho,
                            ];
                        }
                    }
                    return $items;
                },
                'poll' => static function (array $box, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return [];
                    }
                    $r = ccrm_botman_http_request(
                        'GET',
                        'https://graph.facebook.com/v19.0/me/conversations?fields=participants,updated_time,messages.limit(5){message,from,created_time}&limit=10&access_token=' . urlencode($token),
                        [],
                        null,
                        5
                    );
                    if (empty($r['data']['data']) || !is_array($r['data']['data'])) {
                        return [];
                    }
                    $items = [];
                    foreach ($r['data']['data'] as $conv) {
                        $participants = $conv['participants']['data'] ?? [];
                        $peer = $participants[0] ?? [];
                        $chatId = (string)($peer['id'] ?? ($conv['id'] ?? ''));
                        $chatName = (string)($peer['name'] ?? ('Messenger ' . substr($chatId, -4)));
                        $msgs = array_reverse($conv['messages']['data'] ?? []);
                        foreach ($msgs as $m) {
                            $txt = trim((string)($m['message'] ?? ''));
                            if ($txt === '' || $chatId === '') continue;
                            $fromId = (string)($m['from']['id'] ?? '');
                            $fromName = (string)($m['from']['name'] ?? $chatName);
                            $items[] = [
                                'chatId' => $chatId,
                                'chatName' => $chatName,
                                'handle' => 'fb:' . $chatId,
                                'msgId' => (string)($m['id'] ?? ('fb-' . uniqid())),
                                'senderName' => $fromName,
                                'text' => $txt,
                                'timestamp' => !empty($m['created_time']) ? (int)strtotime((string)$m['created_time']) : time(),
                                'fromMe' => $fromId !== '' && $fromId !== $chatId,
                            ];
                        }
                    }
                    return $items;
                },
                'send' => static function (string $chatId, string $text, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Missing Facebook Page Access Token.'];
                    }
                    $r = ccrm_botman_http_request(
                        'POST',
                        'https://graph.facebook.com/v19.0/me/messages?access_token=' . urlencode($token),
                        [],
                        [
                            'recipient' => ['id' => $chatId],
                            'message' => ['text' => $text],
                            'messaging_type' => 'RESPONSE',
                        ]
                    );
                    if (empty($r['data']['message_id'])) {
                        return ['ok' => false, 'error' => (string)($r['data']['error']['message'] ?? $r['error'] ?? 'Messenger send failed.')];
                    }
                    return ['ok' => true, 'msgId' => (string)$r['data']['message_id']];
                },
            ],

            // 3. SLACK (BotMan\Drivers\Slack\SlackDriver)
            'slack' => [
                'driverClass' => 'BotMan\\Drivers\\Slack\\SlackDriver',
                'label' => 'Slack Workspace Bot',
                'test' => static function (array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Slack Bot User OAuth Token (xoxb-...) is required.'];
                    }
                    $r = ccrm_botman_http_request('POST', 'https://slack.com/api/auth.test', [
                        'Authorization' => 'Bearer ' . $token,
                    ]);
                    if (empty($r['data']['ok'])) {
                        return ['ok' => false, 'error' => 'Slack auth.test failed: ' . (string)($r['data']['error'] ?? $r['error'] ?? 'invalid_auth')];
                    }
                    $team = (string)($r['data']['team'] ?? 'Workspace');
                    $user = (string)($r['data']['user'] ?? 'bot');
                    return ['ok' => true, 'handle' => "@{$user} ({$team})", 'detail' => "Connected to Slack workspace {$team} as @{$user}"];
                },
                'registerWebhook' => static fn(array $s, string $url): array => [
                    'ok' => true,
                    'detail' => "Paste {$url} into api.slack.com/apps -> Event Subscriptions -> Request URL.",
                ],
                'verifyWebhook' => static function (array $q, array $p, array $s): ?array {
                    if (($p['type'] ?? '') === 'url_verification' && isset($p['challenge'])) {
                        return ['status' => 200, 'json' => ['challenge' => (string)$p['challenge']]];
                    }
                    return null;
                },
                'parseWebhook' => static function (array $p, array $h, array $q, string $raw, array $s): array {
                    $ev = $p['event'] ?? null;
                    if (!is_array($ev)) {
                        return [];
                    }
                    $type = (string)($ev['type'] ?? '');
                    if (!in_array($type, ['message', 'app_mention'], true) || !empty($ev['subtype']) && $ev['subtype'] === 'bot_message') {
                        return [];
                    }
                    $text = trim((string)($ev['text'] ?? ''));
                    $channel = (string)($ev['channel'] ?? '');
                    $user = (string)($ev['user'] ?? '');
                    $botId = (string)($ev['bot_id'] ?? '');
                    if ($text === '' || $channel === '') {
                        return [];
                    }
                    $ts = (string)($ev['ts'] ?? (string)time());
                    return [[
                        'chatId' => $channel,
                        'chatName' => 'Slack #' . $channel,
                        'handle' => 'slack:' . $channel,
                        'msgId' => 'sl-' . str_replace('.', '_', $ts),
                        'senderName' => $user !== '' ? "Slack User {$user}" : 'Slack Member',
                        'text' => $text,
                        'timestamp' => (int)floor((float)$ts),
                        'fromMe' => $botId !== '',
                    ]];
                },
                'poll' => static function (array $box, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    $channelsRaw = trim((string)($s['botmanChannelId'] ?? ''));
                    if ($token === '' || $channelsRaw === '') {
                        return [];
                    }
                    $items = [];
                    foreach (array_filter(array_map('trim', explode(',', $channelsRaw))) as $chId) {
                        $r = ccrm_botman_http_request(
                            'GET',
                            'https://slack.com/api/conversations.history?channel=' . urlencode($chId) . '&limit=15',
                            ['Authorization' => 'Bearer ' . $token],
                            null,
                            5
                        );
                        if (empty($r['data']['ok']) || !is_array($r['data']['messages'] ?? null)) {
                            continue;
                        }
                        foreach (array_reverse($r['data']['messages']) as $m) {
                            $txt = trim((string)($m['text'] ?? ''));
                            if ($txt === '') continue;
                            $ts = (string)($m['ts'] ?? (string)time());
                            $fromBot = !empty($m['bot_id']);
                            $items[] = [
                                'chatId' => $chId,
                                'chatName' => 'Slack #' . $chId,
                                'handle' => 'slack:' . $chId,
                                'msgId' => 'sl-' . str_replace('.', '_', $ts),
                                'senderName' => $fromBot ? 'Slack Bot' : ((string)($m['user'] ?? 'Slack User')),
                                'text' => $txt,
                                'timestamp' => (int)floor((float)$ts),
                                'fromMe' => $fromBot,
                            ];
                        }
                    }
                    return $items;
                },
                'send' => static function (string $chatId, string $text, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    $target = $chatId ?: trim((string)($s['botmanChannelId'] ?? ''));
                    if ($token === '' || $target === '') {
                        return ['ok' => false, 'error' => 'Slack Bot Token and target channel ID are required.'];
                    }
                    $r = ccrm_botman_http_request(
                        'POST',
                        'https://slack.com/api/chat.postMessage',
                        ['Authorization' => 'Bearer ' . $token],
                        ['channel' => $target, 'text' => $text]
                    );
                    if (empty($r['data']['ok'])) {
                        return ['ok' => false, 'error' => 'Slack chat.postMessage failed: ' . (string)($r['data']['error'] ?? 'unknown_error')];
                    }
                    return ['ok' => true, 'msgId' => 'sl-' . str_replace('.', '_', (string)($r['data']['ts'] ?? uniqid()))];
                },
            ],

            // 4. DISCORD (BotMan\Drivers\Discord\DiscordDriver)
            'discord' => [
                'driverClass' => 'BotMan\\Drivers\\Discord\\DiscordDriver',
                'label' => 'Discord Bot',
                'test' => static function (array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Discord Bot Token is required.'];
                    }
                    $r = ccrm_botman_http_request('GET', 'https://discord.com/api/v10/users/@me', [
                        'Authorization' => 'Bot ' . $token,
                    ]);
                    if (empty($r['data']['id'])) {
                        return ['ok' => false, 'error' => (string)($r['data']['message'] ?? $r['error'] ?? 'Invalid Discord Bot Token.')];
                    }
                    $uname = (string)($r['data']['username'] ?? 'DiscordBot');
                    return ['ok' => true, 'handle' => '@' . $uname, 'detail' => "Connected to Discord Bot @{$uname}"];
                },
                'registerWebhook' => static fn(array $s, string $url): array => [
                    'ok' => true,
                    'detail' => 'Discord channels are synced automatically via REST API & Interactions webhook: ' . $url,
                ],
                'verifyWebhook' => static function (array $q, array $p, array $s): ?array {
                    if (($p['type'] ?? 0) === 1) {
                        return ['status' => 200, 'json' => ['type' => 1]];
                    }
                    return null;
                },
                'parseWebhook' => static function (array $p, array $h, array $q, string $raw, array $s): array {
                    $content = trim((string)($p['content'] ?? ($p['data']['options'][0]['value'] ?? '')));
                    $channelId = (string)($p['channel_id'] ?? '');
                    if ($content === '' || $channelId === '') {
                        return [];
                    }
                    $author = $p['author'] ?? ($p['member']['user'] ?? []);
                    $senderName = (string)($author['global_name'] ?? ($author['username'] ?? 'Discord User'));
                    return [[
                        'chatId' => $channelId,
                        'chatName' => 'Discord #' . substr($channelId, -6),
                        'handle' => 'discord:' . $channelId,
                        'msgId' => 'dc-' . ($p['id'] ?? uniqid()),
                        'senderName' => $senderName,
                        'text' => $content,
                        'timestamp' => !empty($p['timestamp']) ? (int)strtotime((string)$p['timestamp']) : time(),
                        'fromMe' => !empty($author['bot']),
                    ]];
                },
                'poll' => static function (array $box, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    $channelsRaw = trim((string)($s['botmanChannelId'] ?? ''));
                    if ($token === '' || $channelsRaw === '') {
                        return [];
                    }
                    $items = [];
                    foreach (array_filter(array_map('trim', explode(',', $channelsRaw))) as $chId) {
                        $r = ccrm_botman_http_request(
                            'GET',
                            "https://discord.com/api/v10/channels/{$chId}/messages?limit=15",
                            ['Authorization' => 'Bot ' . $token],
                            null,
                            5
                        );
                        if (!$r['ok'] || !is_array($r['data'])) {
                            continue;
                        }
                        foreach (array_reverse($r['data']) as $m) {
                            $txt = trim((string)($m['content'] ?? ''));
                            if ($txt === '') continue;
                            $author = $m['author'] ?? [];
                            $isBot = !empty($author['bot']);
                            $items[] = [
                                'chatId' => $chId,
                                'chatName' => 'Discord #' . substr($chId, -6),
                                'handle' => 'discord:' . $chId,
                                'msgId' => 'dc-' . ($m['id'] ?? uniqid()),
                                'senderName' => (string)($author['global_name'] ?? ($author['username'] ?? 'Discord User')),
                                'text' => $txt,
                                'timestamp' => !empty($m['timestamp']) ? (int)strtotime((string)$m['timestamp']) : time(),
                                'fromMe' => $isBot,
                            ];
                        }
                    }
                    return $items;
                },
                'send' => static function (string $chatId, string $text, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    $target = $chatId ?: trim( explode(',', (string)($s['botmanChannelId'] ?? ''))[0] ?? '' );
                    if ($token === '' || $target === '') {
                        return ['ok' => false, 'error' => 'Discord Bot Token and Channel ID are required.'];
                    }
                    $r = ccrm_botman_http_request(
                        'POST',
                        "https://discord.com/api/v10/channels/{$target}/messages",
                        ['Authorization' => 'Bot ' . $token],
                        ['content' => $text]
                    );
                    if (empty($r['data']['id'])) {
                        return ['ok' => false, 'error' => (string)($r['data']['message'] ?? $r['error'] ?? 'Discord send failed.')];
                    }
                    return ['ok' => true, 'msgId' => 'dc-' . $r['data']['id']];
                },
            ],

            // 5. MICROSOFT TEAMS (BotMan\Drivers\BotFramework\BotFrameworkDriver)
            'teams' => [
                'driverClass' => 'BotMan\\Drivers\\BotFramework\\BotFrameworkDriver',
                'label' => 'Microsoft Teams',
                'test' => static function (array $s): array {
                    $tok = ccrm_botman_teams_access_token($s);
                    if (empty($tok['ok'])) {
                        return $tok;
                    }
                    $appId = trim((string)($s['botmanAppId'] ?? ''));
                    return ['ok' => true, 'handle' => 'teams:' . substr($appId, 0, 8), 'detail' => 'Microsoft Bot Framework OAuth2 token verified.'];
                },
                'registerWebhook' => static fn(array $s, string $url): array => [
                    'ok' => true,
                    'detail' => "Set {$url} as the Messaging Endpoint in Azure Bot Service -> Configuration.",
                ],
                'verifyWebhook' => static fn(array $q, array $p, array $s): ?array => null,
                'parseWebhook' => static function (array $p, array $h, array $q, string $raw, array $s): array {
                    if (($p['type'] ?? '') !== 'message') {
                        return [];
                    }
                    $text = trim((string)($p['text'] ?? ''));
                    $convId = (string)($p['conversation']['id'] ?? '');
                    if ($text === '' || $convId === '') {
                        return [];
                    }
                    $senderName = (string)($p['from']['name'] ?? 'Teams User');
                    $serviceUrl = rtrim((string)($p['serviceUrl'] ?? ($s['botmanServiceUrl'] ?? 'https://smba.trafficmanager.net/teams')), '/');
                    return [[
                        'chatId' => $convId,
                        'chatName' => $senderName . ' (Teams)',
                        'handle' => $serviceUrl . '|' . $convId,
                        'msgId' => 'ms-' . ($p['id'] ?? uniqid()),
                        'senderName' => $senderName,
                        'text' => $text,
                        'timestamp' => !empty($p['timestamp']) ? (int)strtotime((string)$p['timestamp']) : time(),
                        'fromMe' => false,
                    ]];
                },
                'poll' => static fn(array $box, array $s): array => [],
                'send' => static function (string $chatId, string $text, array $s, array $chatMeta = []): array {
                    $tok = ccrm_botman_teams_access_token($s);
                    if (empty($tok['ok'])) {
                        return $tok;
                    }
                    $serviceUrl = rtrim((string)($s['botmanServiceUrl'] ?? 'https://smba.trafficmanager.net/teams'), '/');
                    $handle = (string)($chatMeta['handle'] ?? '');
                    if (str_contains($handle, '|')) {
                        [$parsedUrl] = explode('|', $handle, 2);
                        if (str_starts_with($parsedUrl, 'http')) {
                            $serviceUrl = rtrim($parsedUrl, '/');
                        }
                    }
                    $endpoint = $serviceUrl . '/v3/conversations/' . rawurlencode($chatId) . '/activities';
                    $r = ccrm_botman_http_request(
                        'POST',
                        $endpoint,
                        ['Authorization' => 'Bearer ' . $tok['token']],
                        ['type' => 'message', 'text' => $text]
                    );
                    if (!$r['ok']) {
                        return ['ok' => false, 'error' => (string)($r['data']['error']['message'] ?? $r['error'] ?? 'Teams reply failed.')];
                    }
                    return ['ok' => true, 'msgId' => 'ms-' . ($r['data']['id'] ?? uniqid())];
                },
            ],

            // 6. VIBER (BotMan\Drivers\Viber\ViberDriver)
            'viber' => [
                'driverClass' => 'BotMan\\Drivers\\Viber\\ViberDriver',
                'label' => 'Viber Bot',
                'test' => static function (array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Viber Auth Token is required.'];
                    }
                    $r = ccrm_botman_http_request('POST', 'https://chatapi.viber.com/pa/get_account_info', [
                        'X-Viber-Auth-Token' => $token,
                    ], new \stdClass());
                    if (($r['data']['status'] ?? -1) !== 0) {
                        return ['ok' => false, 'error' => (string)($r['data']['status_message'] ?? $r['error'] ?? 'Invalid Viber Auth Token.')];
                    }
                    $name = (string)($r['data']['name'] ?? 'Viber Bot');
                    return ['ok' => true, 'handle' => $name, 'detail' => "Connected to Viber Bot: {$name}"];
                },
                'registerWebhook' => static function (array $s, string $url): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Viber Auth Token is required first.'];
                    }
                    $r = ccrm_botman_http_request('POST', 'https://chatapi.viber.com/pa/set_webhook', [
                        'X-Viber-Auth-Token' => $token,
                    ], [
                        'url' => $url,
                        'event_types' => ['delivered', 'seen', 'failed', 'subscribed', 'unsubscribed', 'conversation_started'],
                    ]);
                    if (($r['data']['status'] ?? -1) !== 0) {
                        return ['ok' => false, 'error' => (string)($r['data']['status_message'] ?? 'Viber set_webhook failed (ensure public HTTPS URL).')];
                    }
                    return ['ok' => true, 'detail' => 'Viber webhook registered: ' . $url];
                },
                'verifyWebhook' => static function (array $q, array $p, array $s): ?array {
                    if (($p['event'] ?? '') === 'webhook') {
                        return ['status' => 200, 'json' => ['status' => 0, 'status_message' => 'ok']];
                    }
                    return null;
                },
                'parseWebhook' => static function (array $p, array $h, array $q, string $raw, array $s): array {
                    if (($p['event'] ?? '') !== 'message') {
                        return [];
                    }
                    $sender = $p['sender'] ?? [];
                    $msg = $p['message'] ?? [];
                    $senderId = (string)($sender['id'] ?? '');
                    $text = trim((string)($msg['text'] ?? ''));
                    if ($senderId === '' || $text === '') {
                        return [];
                    }
                    $senderName = (string)($sender['name'] ?? 'Viber User');
                    return [[
                        'chatId' => $senderId,
                        'chatName' => $senderName,
                        'handle' => 'viber:' . $senderId,
                        'msgId' => 'vb-' . ($p['message_token'] ?? uniqid()),
                        'senderName' => $senderName,
                        'text' => $text,
                        'timestamp' => !empty($p['timestamp']) ? (int)floor(((float)$p['timestamp']) / 1000) : time(),
                        'fromMe' => false,
                    ]];
                },
                'poll' => static fn(array $box, array $s): array => [],
                'send' => static function (string $chatId, string $text, array $s): array {
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($token === '') {
                        return ['ok' => false, 'error' => 'Missing Viber Auth Token.'];
                    }
                    $senderName = trim((string)($s['botmanSenderName'] ?? 'CCRM Bot')) ?: 'CCRM Bot';
                    $r = ccrm_botman_http_request('POST', 'https://chatapi.viber.com/pa/send_message', [
                        'X-Viber-Auth-Token' => $token,
                    ], [
                        'receiver' => $chatId,
                        'min_api_version' => 1,
                        'sender' => ['name' => mb_substr($senderName, 0, 28)],
                        'type' => 'text',
                        'text' => $text,
                    ]);
                    if (($r['data']['status'] ?? -1) !== 0) {
                        return ['ok' => false, 'error' => (string)($r['data']['status_message'] ?? 'Viber send_message failed.')];
                    }
                    return ['ok' => true, 'msgId' => 'vb-' . ($r['data']['message_token'] ?? uniqid())];
                },
            ],

            // 7. TWILIO SMS (BotMan\Drivers\Twilio\TwilioMessageDriver)
            'twilio' => [
                'driverClass' => 'BotMan\\Drivers\\Twilio\\TwilioMessageDriver',
                'label' => 'Twilio SMS',
                'test' => static function (array $s): array {
                    $sid = trim((string)($s['botmanAppId'] ?? ''));
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    if ($sid === '' || $token === '') {
                        return ['ok' => false, 'error' => 'Twilio Account SID and Auth Token are required.'];
                    }
                    $r = ccrm_botman_http_request(
                        'GET',
                        "https://api.twilio.com/2010-04-01/Accounts/{$sid}.json",
                        [],
                        null,
                        8,
                        $sid,
                        $token
                    );
                    if (empty($r['data']['sid'])) {
                        return ['ok' => false, 'error' => (string)($r['data']['message'] ?? $r['error'] ?? 'Invalid Twilio Account SID or Auth Token.')];
                    }
                    $friendly = (string)($r['data']['friendly_name'] ?? $sid);
                    return ['ok' => true, 'handle' => (string)($s['botmanFromNumber'] ?: $friendly), 'detail' => "Connected to Twilio account: {$friendly}"];
                },
                'registerWebhook' => static fn(array $s, string $url): array => [
                    'ok' => true,
                    'detail' => "Paste {$url} into Twilio Console -> Phone Numbers -> Active Numbers -> Messaging Webhook.",
                ],
                'verifyWebhook' => static fn(array $q, array $p, array $s): ?array => null,
                'parseWebhook' => static function (array $p, array $h, array $q, string $raw, array $s): array {
                    $from = trim((string)($p['From'] ?? ''));
                    $body = trim((string)($p['Body'] ?? ''));
                    if ($from === '' || $body === '') {
                        return [];
                    }
                    return [[
                        'chatId' => $from,
                        'chatName' => $from,
                        'handle' => $from,
                        'msgId' => (string)($p['MessageSid'] ?? ('tw-' . uniqid())),
                        'senderName' => $from,
                        'text' => $body,
                        'timestamp' => time(),
                        'fromMe' => false,
                    ]];
                },
                'poll' => static function (array $box, array $s): array {
                    $sid = trim((string)($s['botmanAppId'] ?? ''));
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    $fromNum = trim((string)($s['botmanFromNumber'] ?? ''));
                    if ($sid === '' || $token === '') {
                        return [];
                    }
                    $r = ccrm_botman_http_request(
                        'GET',
                        "https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json?PageSize=20",
                        [],
                        null,
                        5,
                        $sid,
                        $token
                    );
                    if (empty($r['data']['messages']) || !is_array($r['data']['messages'])) {
                        return [];
                    }
                    $items = [];
                    foreach (array_reverse($r['data']['messages']) as $m) {
                        $dir = (string)($m['direction'] ?? '');
                        $fromMe = str_starts_with($dir, 'outbound');
                        $peer = $fromMe ? (string)($m['to'] ?? '') : (string)($m['from'] ?? '');
                        $txt = trim((string)($m['body'] ?? ''));
                        if ($peer === '' || $txt === '' || ($fromNum !== '' && $peer === $fromNum)) continue;
                        $items[] = [
                            'chatId' => $peer,
                            'chatName' => $peer,
                            'handle' => $peer,
                            'msgId' => (string)($m['sid'] ?? ('tw-' . uniqid())),
                            'senderName' => $fromMe ? 'Twilio SMS' : $peer,
                            'text' => $txt,
                            'timestamp' => !empty($m['date_created']) ? (int)strtotime((string)$m['date_created']) : time(),
                            'fromMe' => $fromMe,
                        ];
                    }
                    return $items;
                },
                'send' => static function (string $chatId, string $text, array $s): array {
                    $sid = trim((string)($s['botmanAppId'] ?? ''));
                    $token = trim((string)($s['botmanToken'] ?? ''));
                    $from = trim((string)($s['botmanFromNumber'] ?? ''));
                    if ($sid === '' || $token === '' || $from === '') {
                        return ['ok' => false, 'error' => 'Twilio Account SID, Auth Token, and From Phone Number are required.'];
                    }
                    $r = ccrm_botman_http_request(
                        'POST',
                        "https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json",
                        ['Content-Type' => 'application/x-www-form-urlencoded'],
                        ['From' => $from, 'To' => $chatId, 'Body' => $text],
                        8,
                        $sid,
                        $token
                    );
                    if (empty($r['data']['sid'])) {
                        return ['ok' => false, 'error' => (string)($r['data']['message'] ?? $r['error'] ?? 'Twilio SMS send failed.')];
                    }
                    return ['ok' => true, 'msgId' => (string)$r['data']['sid']];
                },
            ],

            // 8. BOTMAN WEB CHAT WIDGET (BotMan\Drivers\Web\WebDriver)
            'webchat' => [
                'driverClass' => 'BotMan\\Drivers\\Web\\WebDriver',
                'label' => 'BotMan Web Chat Widget',
                'test' => static function (array $s): array {
                    $title = trim((string)($s['botmanSenderName'] ?? 'Live Support'));
                    return [
                        'ok' => true,
                        'handle' => 'webchat:' . strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $title)),
                        'detail' => "BotMan WebDriver endpoint active ({$title}). Embed the <script> snippet on your site.",
                    ];
                },
                'registerWebhook' => static fn(array $s, string $url): array => [
                    'ok' => true,
                    'detail' => 'Web Chat Widget uses direct same-endpoint BotMan WebDriver calls: ' . $url,
                ],
                'verifyWebhook' => static fn(array $q, array $p, array $s): ?array => null,
                'parseWebhook' => static function (array $p, array $h, array $q, string $raw, array $s): array {
                    // Compatible with BotMan WebDriver (`driver=web`, `userId`, `message`, `senderName`)
                    $userId = trim((string)($p['userId'] ?? ($p['chatId'] ?? ($q['userId'] ?? ''))));
                    $text = trim((string)($p['message'] ?? ($p['text'] ?? '')));
                    if ($userId === '' || $text === '') {
                        return [];
                    }
                    $visitorName = trim((string)($p['senderName'] ?? ($p['visitorName'] ?? 'Website Visitor ' . substr($userId, -4))));
                    return [[
                        'chatId' => $userId,
                        'chatName' => $visitorName,
                        'handle' => 'web:' . $userId,
                        'msgId' => 'web-' . uniqid(),
                        'senderName' => $visitorName,
                        'text' => $text,
                        'timestamp' => time(),
                        'fromMe' => false,
                    ]];
                },
                'poll' => static fn(array $box, array $s): array => [],
                'send' => static function (string $chatId, string $text, array $s): array {
                    // WebChat replies are stored directly in `store.json` and read by the embedded widget
                    return ['ok' => true, 'msgId' => 'web-' . uniqid()];
                },
            ],
        ];
    }
}

// -----------------------------------------------------------------------------
// Unified `store.json` Persistence (Shared with WAAI WhatsApp Pipeline)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_botman_account_dir')) {
    function ccrm_botman_account_dir(array $mailboxRow): string {
        $id = preg_replace('/[^a-zA-Z0-9_-]/', '_', (string)($mailboxRow['id'] ?? 'default'));
        $root = function_exists('ccrm_waai_storage_root')
            ? ccrm_waai_storage_root()
            : (rtrim(sys_get_temp_dir(), '/') . '/.waai');
        $dir = $root . '/accounts/botman-' . $id;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir;
    }
}

if (!function_exists('ccrm_botman_load_store')) {
    function ccrm_botman_load_store(array $mailboxRow): array {
        $dir = ccrm_botman_account_dir($mailboxRow);
        $file = $dir . '/store.json';
        if (is_file($file)) {
            $decoded = json_decode((string)@file_get_contents($file), true);
            if (is_array($decoded)) {
                $decoded['chats'] = is_array($decoded['chats'] ?? null) ? $decoded['chats'] : [];
                $decoded['messages'] = is_array($decoded['messages'] ?? null) ? $decoded['messages'] : [];
                return $decoded;
            }
        }

        // Seed a helpful starter conversation so newly added BotMan connectors immediately
        // show up in the Communication Hub and can be tested with "Test Trigger" right away.
        $settings = ccrm_botman_resolve_settings($mailboxRow);
        $type = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? 'telegram')));
        $drivers = ccrm_botman_drivers();
        $label = $drivers[$type]['label'] ?? ucfirst($type);
        $defaultChatId = trim((string)($settings['botmanChannelId'] ?? ($settings['botmanFromNumber'] ?? '')));
        if ($defaultChatId !== '' && str_contains($defaultChatId, ',')) {
            $defaultChatId = trim(explode(',', $defaultChatId)[0]);
        }
        if ($defaultChatId === '') {
            $defaultChatId = $type . '-channel';
        }
        $nowIso = gmdate('c');
        $nowMs = (int)round(microtime(true) * 1000);
        $initText = "Connected to {$label} via BotMan driver. Incoming webhook messages and AI Agent replies will appear here.";
        $initialStore = [
            'chats' => [[
                'id' => $defaultChatId,
                'name' => ((string)($mailboxRow['name'] ?? $label)) . ' Channel',
                'phone' => $type . ':' . $defaultChatId,
                'handle' => $type . ':' . $defaultChatId,
                'unread' => 0,
                'unreadCount' => 0,
                'lastMessage' => $initText,
                'lastMessageText' => $initText,
                'lastTimestamp' => date('H:i'),
                'lastMessageAt' => date('H:i'),
                'lastMessageTs' => $nowMs,
                'updatedAt' => $nowIso,
            ]],
            'messages' => [
                $defaultChatId => [[
                    'id' => 'bm-init-' . $type,
                    'chatId' => $defaultChatId,
                    'sender' => $label,
                    'senderName' => $label,
                    'text' => $initText,
                    'timestamp' => date('H:i'),
                    'createdAt' => $nowIso,
                    'tsMs' => $nowMs,
                    'fromMe' => false,
                ]],
            ],
            'updatedAt' => $nowIso,
        ];
        @file_put_contents($file, json_encode($initialStore, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        return $initialStore;
    }
}

if (!function_exists('ccrm_botman_save_store')) {
    function ccrm_botman_save_store(array $mailboxRow, array $store): void {
        $dir = ccrm_botman_account_dir($mailboxRow);
        $store['updatedAt'] = gmdate('c');
        @file_put_contents($dir . '/store.json', json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
}

if (!function_exists('ccrm_botman_ingest_messages')) {
    /**
     * Append normalized BotMan messages into `store.json`, deduplicating by `msgId`.
     * Returns the count of newly added messages.
     */
    function ccrm_botman_ingest_messages(array $mailboxRow, array $items): int {
        if (empty($items)) {
            return 0;
        }
        $store = ccrm_botman_load_store($mailboxRow);
        $added = 0;

        foreach ($items as $item) {
            $chatId = trim((string)($item['chatId'] ?? ''));
            $text = trim((string)($item['text'] ?? ''));
            if ($chatId === '' || $text === '') {
                continue;
            }
            $msgId = (string)($item['msgId'] ?? ('bm-' . md5($chatId . '|' . $text . '|' . ($item['timestamp'] ?? ''))));
            $existingMsgs = $store['messages'][$chatId] ?? [];
            $dup = false;
            foreach ($existingMsgs as $em) {
                if (($em['id'] ?? '') === $msgId) {
                    $dup = true;
                    break;
                }
            }
            if ($dup) {
                continue;
            }

            $tsInt = !empty($item['timestamp']) ? (int)$item['timestamp'] : time();
            $tsMs = $tsInt * 1000;
            $iso = gmdate('c', $tsInt);
            $hm = date('H:i', $tsInt);
            $fromMe = !empty($item['fromMe']);
            $senderName = (string)($item['senderName'] ?? ($fromMe ? 'Me' : $chatId));

            $store['messages'][$chatId][] = [
                'id' => $msgId,
                'chatId' => $chatId,
                'sender' => $senderName,
                'senderName' => $senderName,
                'text' => $text,
                'timestamp' => $hm,
                'createdAt' => $iso,
                'tsMs' => $tsMs,
                'fromMe' => $fromMe,
            ];

            // Keep at most 200 messages per chat in store.json
            if (count($store['messages'][$chatId]) > 200) {
                $store['messages'][$chatId] = array_slice($store['messages'][$chatId], -200);
            }

            $chatFound = false;
            foreach ($store['chats'] as &$c) {
                if (($c['id'] ?? '') === $chatId) {
                    $c['lastMessage'] = $text;
                    $c['lastMessageText'] = $text;
                    $c['lastTimestamp'] = $hm;
                    $c['lastMessageAt'] = $hm;
                    $c['lastMessageTs'] = $tsMs;
                    $c['updatedAt'] = $iso;
                    if (!empty($item['chatName'])) {
                        $c['name'] = (string)$item['chatName'];
                    }
                    if (!empty($item['handle'])) {
                        $c['handle'] = (string)$item['handle'];
                        $c['phone'] = (string)$item['handle'];
                    }
                    if (!$fromMe) {
                        $nextUnread = (int)($c['unreadCount'] ?? ($c['unread'] ?? 0)) + 1;
                        $c['unread'] = $nextUnread;
                        $c['unreadCount'] = $nextUnread;
                    }
                    $chatFound = true;
                    break;
                }
            }
            unset($c);

            if (!$chatFound) {
                $hVal = (string)($item['handle'] ?? $chatId);
                array_unshift($store['chats'], [
                    'id' => $chatId,
                    'name' => (string)($item['chatName'] ?? $senderName),
                    'phone' => $hVal,
                    'handle' => $hVal,
                    'unread' => $fromMe ? 0 : 1,
                    'unreadCount' => $fromMe ? 0 : 1,
                    'lastMessage' => $text,
                    'lastMessageText' => $text,
                    'lastTimestamp' => $hm,
                    'lastMessageAt' => $hm,
                    'lastMessageTs' => $tsMs,
                    'updatedAt' => $iso,
                ]);
            }

            $added++;
        }

        if ($added > 0) {
            ccrm_botman_save_store($mailboxRow, $store);
        }
        return $added;
    }
}

if (!function_exists('ccrm_botman_get_chats')) {
    function ccrm_botman_get_chats(array $mailboxRow, bool $allowPoll = true): array {
        $settings = ccrm_botman_resolve_settings($mailboxRow);
        $type = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? 'telegram')));
        $drivers = ccrm_botman_drivers();
        $driver = $drivers[$type] ?? null;

        if ($allowPoll && $driver && isset($driver['poll'])) {
            $dir = ccrm_botman_account_dir($mailboxRow);
            $pollStampFile = $dir . '/last_poll.txt';
            $lastPoll = is_file($pollStampFile) ? (int)@file_get_contents($pollStampFile) : 0;
            // Throttle automatic provider polling to at most once every 10 seconds
            if (time() - $lastPoll >= 10) {
                @file_put_contents($pollStampFile, (string)time());
                try {
                    $polled = ($driver['poll'])($mailboxRow, $settings);
                    if (!empty($polled)) {
                        ccrm_botman_ingest_messages($mailboxRow, $polled);
                    }
                } catch (\Throwable $e) {
                    // Best-effort poll
                }
            }
        }

        $store = ccrm_botman_load_store($mailboxRow);
        return [
            'ok' => true,
            'accountId' => 'botman-' . ($mailboxRow['id'] ?? $type),
            'driver' => $driver['driverClass'] ?? ('BotMan\\Drivers\\' . ucfirst($type)),
            'status' => 'connected',
            'qr' => null,
            'phone' => (string)($mailboxRow['address'] ?? $type),
            'displayName' => (string)($mailboxRow['name'] ?? ($driver['label'] ?? ucfirst($type))),
            'chats' => $store['chats'],
            'messages' => !empty($store['messages']) ? $store['messages'] : new \stdClass(),
            'updatedAt' => $store['updatedAt'] ?? gmdate('c'),
        ];
    }
}

if (!function_exists('ccrm_botman_send_message')) {
    function ccrm_botman_send_message(array $mailboxRow, string $chatId, string $text, string $author = ''): array {
        $settings = ccrm_botman_resolve_settings($mailboxRow);
        $type = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? 'telegram')));
        $drivers = ccrm_botman_drivers();
        $driver = $drivers[$type] ?? null;
        if (!$driver) {
            return ['ok' => false, 'error' => 'Unsupported BotMan driver: ' . $type];
        }

        $store = ccrm_botman_load_store($mailboxRow);
        $chatMeta = [];
        foreach ($store['chats'] as $c) {
            if (($c['id'] ?? '') === $chatId) {
                $chatMeta = $c;
                break;
            }
        }

        $sendRes = ($driver['send'])($chatId, $text, $settings, $chatMeta);
        if (empty($sendRes['ok'])) {
            $state = ccrm_botman_get_chats($mailboxRow, false);
            $state['ok'] = false;
            $state['error'] = (string)($sendRes['error'] ?? 'BotMan driver send failed.');
            return $state;
        }

        ccrm_botman_ingest_messages($mailboxRow, [[
            'chatId' => $chatId,
            'chatName' => (string)($chatMeta['name'] ?? $chatId),
            'handle' => (string)($chatMeta['handle'] ?? ($type . ':' . $chatId)),
            'msgId' => (string)($sendRes['msgId'] ?? ('bm-out-' . uniqid())),
            'senderName' => $author !== '' ? $author : 'CCRM Agent',
            'text' => $text,
            'timestamp' => time(),
            'fromMe' => true,
        ]]);

        return ccrm_botman_get_chats($mailboxRow, false);
    }
}

if (!function_exists('ccrm_botman_resync_chats')) {
    function ccrm_botman_resync_chats(array $mailboxRow, string $chatId = ''): array {
        $dir = ccrm_botman_account_dir($mailboxRow);
        @unlink($dir . '/last_poll.txt');
        return ccrm_botman_get_chats($mailboxRow, true);
    }
}

if (!function_exists('ccrm_botman_test_connection')) {
    function ccrm_botman_test_connection(array $settings, ?\PDO $pdo = null): array {
        $type = strtolower((string)($settings['connectorType'] ?? ''));
        $drivers = ccrm_botman_drivers();
        if (!isset($drivers[$type])) {
            return ['ok' => false, 'error' => 'Unknown BotMan connector type: ' . $type];
        }
        $resolved = ccrm_botman_resolve_settings(['settings' => $settings, 'connectorType' => $type], $pdo);
        return ($drivers[$type]['test'])($resolved);
    }
}

if (!function_exists('ccrm_botman_register_webhook')) {
    function ccrm_botman_register_webhook(array $mailboxRow, string $webhookUrl, ?\PDO $pdo = null): array {
        $settings = ccrm_botman_resolve_settings($mailboxRow, $pdo);
        $type = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        $drivers = ccrm_botman_drivers();
        if (!isset($drivers[$type])) {
            return ['ok' => false, 'error' => 'Unknown BotMan connector type: ' . $type];
        }
        return ($drivers[$type]['registerWebhook'])($settings, $webhookUrl);
    }
}
