<?php
/**
 * Unified AI Gateway for CCRM.
 *
 * Resolves the active AI provider source from `system_settings.INTEGRATIONS_CONFIG`:
 *   - Manual mode (`aiSourceMode = 'manual'`): uses `openAiKey` (default, backward compatible)
 *   - Connector mode (`aiSourceMode = 'connector'`): routes requests through the selected
 *     LLM connector in `company_mailboxes` across OpenAI, Anthropic, Google Gemini,
 *     or Marveen CLI / remote bridge transports.
 *
 * OpenAI-specific endpoints (Vector DB 768-d embeddings and Live Realtime WebRTC voice)
 * resolve an OpenAI key via `ccrm_ai_resolve_openai_key()`, using either an `openai_api`
 * connector or the optional fallback `openAiKey`.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/marveen/marveen_lib.php';

if (!defined('CCRM_AI_CONNECTOR_TYPES')) {
    define('CCRM_AI_CONNECTOR_TYPES', [
        'claude',
        'antigravity',
        'chatgpt',
        'claude_api',
        'gemini_api',
        'openai_api',
    ]);
}

if (!function_exists('ccrm_ai_load_config')) {
    /**
     * Load INTEGRATIONS_CONFIG with secret keys decrypted, reusing an already-fetched array if supplied.
     */
    function ccrm_ai_load_config(\PDO $pdo, ?array $integrationsConfig = null): array {
        if ($integrationsConfig !== null) {
            return ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys());
        }
        return ccrm_load_integrations_config($pdo);
    }
}

if (!function_exists('ccrm_ai_infer_connector_type')) {
    /**
     * Normalize the connectorType stored in a company_mailboxes settings blob.
     */
    function ccrm_ai_infer_connector_type(array $settings, string $address = ''): string {
        $raw = strtolower(trim((string)($settings['connectorType'] ?? '')));
        if ($raw !== '') {
            return $raw;
        }
        $host = strtolower(trim((string)($settings['imapHost'] ?? '')));
        if ($host !== '' && str_starts_with($host, 'agent://')) {
            return substr($host, strlen('agent://'));
        }
        if (str_starts_with(strtolower(trim($address)), 'agent://')) {
            return substr(strtolower(trim($address)), strlen('agent://'));
        }
        return '';
    }
}

if (!function_exists('ccrm_ai_default_model_for_connector')) {
    /**
     * Default model ID per LLM connector type when connector settings leave agentModel blank.
     */
    function ccrm_ai_default_model_for_connector(string $connectorType): string {
        return match (strtolower(trim($connectorType))) {
            'claude', 'claude_api' => 'claude-sonnet-4-5',
            'antigravity' => 'gemini-3.5-flash-lite',
            'gemini_api' => 'gemini-2.5-flash',
            'chatgpt' => 'gpt-5',
            'openai_api' => 'gpt-4o',
            default => 'gpt-6-luna',
        };
    }
}

if (!function_exists('ccrm_ai_has_worker_credentials')) {
    /**
     * Check whether a subscription/CLI connector already has stored credentials on disk.
     */
    function ccrm_ai_has_worker_credentials(string $connectorId, string $connectorType): bool {
        if (!function_exists('ccrm_marveen_connector_dir')) {
            return false;
        }
        $dir = ccrm_marveen_connector_dir($connectorId);
        if (
            is_file($dir . '/.oauth-token')
            || is_file($dir . '/.gemini/oauth_creds.json')
            || is_file($dir . '/.claude-config/.credentials.json')
            || is_file($dir . '/.gemini_api_key')
        ) {
            return true;
        }
        if ($connectorType === 'claude' && function_exists('ccrm_marveen_can_proc_open') && ccrm_marveen_can_proc_open()) {
            return ccrm_marveen_find_bin('claude') !== null;
        }
        return false;
    }
}

if (!function_exists('ccrm_ai_is_direct_openai_key')) {
    /**
     * Distinguish an OpenAI REST API key (`sk-...` non-JWT) from a Codex OAuth JWT token.
     */
    function ccrm_ai_is_direct_openai_key(string $token): bool {
        $t = trim($token);
        return $t !== ''
            && str_starts_with($t, 'sk-')
            && !str_starts_with($t, 'sk-ant-')
            && !str_contains($t, '.');
    }
}

if (!function_exists('ccrm_ai_resolve_source')) {
    /**
     * Resolve the active AI provider source (manual API keys or selected LLM connector).
     */
    function ccrm_ai_resolve_source(\PDO $pdo, ?array $integrationsConfig = null): array {
        $cfg = ccrm_ai_load_config($pdo, $integrationsConfig);
        $manualOpenAiKey = trim((string)($cfg['openAiKey'] ?? ''));
        $mode = strtolower(trim((string)($cfg['aiSourceMode'] ?? 'manual')));
        $connectorId = trim((string)($cfg['aiConnectorId'] ?? ''));

        $base = [
            'configured' => false,
            'mode' => $mode === 'connector' ? 'connector' : 'manual',
            'connectorId' => $connectorId,
            'connectorName' => (string)($cfg['aiConnectorName'] ?? ''),
            'connectorType' => (string)($cfg['aiConnectorType'] ?? ''),
            'transport' => 'none',
            'apiKey' => '',
            'subscriptionToken' => '',
            'endpoint' => '',
            'model' => ccrm_ai_model($cfg),
            'modelConfigured' => false,
            'openAiFallbackKey' => $manualOpenAiKey,
            'integrationsConfig' => $cfg,
            'errorCode' => 'ai_key_missing',
            'error' => 'AI provider is not configured.',
        ];

        if ($base['mode'] === 'connector' && $connectorId !== '') {
            try {
                $stmt = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `id` = ? AND `is_active` = 1 LIMIT 1");
                $stmt->execute([$connectorId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            } catch (\Throwable $e) {
                $row = false;
            }
            if (!$row) {
                $base['errorCode'] = 'ai_connector_unconfigured';
                $base['error'] = 'Selected AI connector is missing or inactive.';
                return $base;
            }

            $decoded = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = ccrm_decrypt_config_secrets(is_array($decoded) ? $decoded : [], ccrm_email_secret_keys());
            $cType = ccrm_ai_infer_connector_type($settings, (string)($row['address'] ?? ''));
            if (!in_array($cType, CCRM_AI_CONNECTOR_TYPES, true)) {
                $base['errorCode'] = 'ai_connector_unconfigured';
                $base['error'] = 'Selected connector is not an LLM connector.';
                return $base;
            }

            $rawKey = trim((string)(($settings['apiKey'] ?? '') !== '' ? $settings['apiKey'] : ($settings['subscriptionToken'] ?? '')));
            $endpoint = trim((string)($settings['agentEndpoint'] ?? ''));
            $configuredModel = trim((string)($settings['agentModel'] ?? ''));
            $model = $configuredModel !== '' ? $configuredModel : ccrm_ai_default_model_for_connector($cType);
            $resolvedKey = ccrm_marveen_resolve_provider_api_key($pdo, $connectorId, $cType, $settings);

            $base['connectorName'] = (string)($row['name'] ?? $base['connectorName']);
            $base['connectorType'] = $cType;
            $base['endpoint'] = $endpoint;
            $base['model'] = $model;
            $base['modelConfigured'] = $configuredModel !== '';

            if ($cType === 'openai_api') {
                $key = $resolvedKey !== '' ? $resolvedKey : $rawKey;
                if ($key !== '') {
                    $base['configured'] = true;
                    $base['transport'] = 'openai';
                    $base['apiKey'] = $key;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                }
            } elseif ($cType === 'claude_api') {
                $key = $resolvedKey !== '' ? $resolvedKey : $rawKey;
                if ($key !== '') {
                    $base['configured'] = true;
                    $base['transport'] = 'anthropic';
                    $base['apiKey'] = $key;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                }
            } elseif ($cType === 'gemini_api') {
                $key = $resolvedKey !== '' ? $resolvedKey : $rawKey;
                if ($key !== '') {
                    $base['configured'] = true;
                    $base['transport'] = 'gemini';
                    $base['apiKey'] = $key;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                }
            } elseif ($cType === 'claude') {
                if (str_starts_with($rawKey, 'sk-ant-api')) {
                    $base['configured'] = true;
                    $base['transport'] = 'anthropic';
                    $base['apiKey'] = $rawKey;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                } elseif (
                    $rawKey !== ''
                    || $endpoint !== ''
                    || trim((string)(getenv('MARVEEN_URL') ?: '')) !== ''
                    || ccrm_ai_has_worker_credentials($connectorId, $cType)
                ) {
                    $base['configured'] = true;
                    $base['transport'] = 'marveen_cli';
                    $base['subscriptionToken'] = $rawKey;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                }
            } elseif ($cType === 'antigravity') {
                if ($resolvedKey !== '' && str_starts_with($resolvedKey, 'AIza')) {
                    $base['configured'] = true;
                    $base['transport'] = 'gemini';
                    $base['apiKey'] = $resolvedKey;
                    $base['subscriptionToken'] = $rawKey;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                } elseif (
                    $rawKey !== ''
                    || $endpoint !== ''
                    || trim((string)(getenv('MARVEEN_URL') ?: '')) !== ''
                    || ccrm_ai_has_worker_credentials($connectorId, $cType)
                ) {
                    $base['configured'] = true;
                    $base['transport'] = 'marveen_cli';
                    $base['subscriptionToken'] = $rawKey;
                    $base['apiKey'] = $resolvedKey;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                }
            } elseif ($cType === 'chatgpt') {
                if (ccrm_ai_is_direct_openai_key($rawKey)) {
                    $base['configured'] = true;
                    $base['transport'] = 'openai';
                    $base['apiKey'] = $rawKey;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                } elseif (
                    $rawKey !== ''
                    || $endpoint !== ''
                    || trim((string)(getenv('MARVEEN_URL') ?: '')) !== ''
                    || ccrm_ai_has_worker_credentials($connectorId, $cType)
                ) {
                    $base['configured'] = true;
                    $base['transport'] = 'marveen_cli';
                    $base['subscriptionToken'] = $rawKey;
                    $base['errorCode'] = '';
                    $base['error'] = '';
                }
            }

            if (!$base['configured']) {
                $base['errorCode'] = 'ai_connector_unconfigured';
                $base['error'] = 'Selected AI connector has no active credentials.';
            }
            return $base;
        }

        // Manual mode fallback (default)
        if ($manualOpenAiKey !== '') {
            $base['configured'] = true;
            $base['mode'] = 'manual';
            $base['connectorType'] = 'openai_api';
            $base['transport'] = 'openai';
            $base['apiKey'] = $manualOpenAiKey;
            $base['errorCode'] = '';
            $base['error'] = '';
        }

        return $base;
    }
}

if (!function_exists('ccrm_ai_is_configured')) {
    /**
     * True when either an active LLM connector or manual openAiKey is configured.
     */
    function ccrm_ai_is_configured(\PDO $pdo, ?array $integrationsConfig = null): bool {
        $src = ccrm_ai_resolve_source($pdo, $integrationsConfig);
        return !empty($src['configured']);
    }
}

if (!function_exists('ccrm_ai_resolve_openai_key')) {
    /**
     * Resolve an OpenAI API key for OpenAI-only modalities (Vector embeddings, Live WebRTC, WAAI).
     */
    function ccrm_ai_resolve_openai_key(\PDO $pdo, ?array $integrationsConfig = null): string {
        $src = ccrm_ai_resolve_source($pdo, $integrationsConfig);
        if ($src['mode'] === 'connector' && $src['connectorType'] === 'openai_api' && $src['apiKey'] !== '') {
            return (string)$src['apiKey'];
        }
        if ($src['mode'] === 'connector' && $src['transport'] === 'openai' && $src['apiKey'] !== '') {
            return (string)$src['apiKey'];
        }
        return (string)($src['openAiFallbackKey'] ?? '');
    }
}

if (!function_exists('ccrm_ai_resolve_openai_base_url')) {
    /**
     * Base URL (ending at `/v1` by default) for OpenAI REST endpoints.
     */
    function ccrm_ai_resolve_openai_base_url(\PDO $pdo, ?array $integrationsConfig = null): string {
        $src = ccrm_ai_resolve_source($pdo, $integrationsConfig);
        if ($src['mode'] === 'connector' && $src['connectorType'] === 'openai_api' && $src['endpoint'] !== '') {
            $base = rtrim((string)$src['endpoint'], '/');
            if (str_ends_with($base, '/chat/completions')) {
                $base = substr($base, 0, -strlen('/chat/completions'));
            }
            return $base;
        }
        return 'https://api.openai.com/v1';
    }
}

if (!function_exists('ccrm_ai_classify_http_error')) {
    /**
     * Map HTTP / cURL failure status codes and upstream messages to canonical CCRM AI error codes.
     */
    function ccrm_ai_classify_http_error(int $httpCode, string $message, string $curlErr = ''): string {
        $lower = strtolower($message . ' ' . $curlErr);
        if (
            $httpCode === 401
            || $httpCode === 403
            || str_contains($lower, 'invalid_api_key')
            || str_contains($lower, 'incorrect api key')
            || str_contains($lower, 'authentication_error')
            || str_contains($lower, 'api key not valid')
        ) {
            return 'ai_key_invalid';
        }
        if (
            $httpCode === 429
            || str_contains($lower, 'rate_limit')
            || str_contains($lower, 'insufficient_quota')
            || str_contains($lower, 'quota exceeded')
        ) {
            return 'ai_rate_limited';
        }
        return 'ai_error';
    }
}

if (!function_exists('ccrm_ai_strip_code_fences')) {
    /**
     * Strip accidental markdown JSON fences from model responses when json_object output is expected.
     */
    function ccrm_ai_strip_code_fences(string $text): string {
        $trimmed = trim($text);
        $stripped = preg_replace('/^```(?:json)?\s*\r?\n?/i', '', $trimmed);
        $stripped = preg_replace('/\r?\n?```\s*$/', '', (string)$stripped);
        return trim((string)$stripped);
    }
}

if (!function_exists('ccrm_ai_parse_data_url')) {
    /**
     * Parse a `data:<mime>;base64,<data>` URI into [mimeType, base64Data].
     */
    function ccrm_ai_parse_data_url(string $url): ?array {
        if (preg_match('#^data:([^;]+);base64,(.+)$#s', trim($url), $m)) {
            return [
                'mime' => trim($m[1]),
                'data' => preg_replace('/\s+/', '', $m[2]),
            ];
        }
        return null;
    }
}

if (!function_exists('ccrm_ai_curl_post_json')) {
    /**
     * Execute an HTTP JSON POST with retries on transient 429 / 5xx / network errors.
     */
    function ccrm_ai_curl_post_json(string $url, array $headers, array $body, int $timeout = 45, int $retries = 2): array {
        $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
        if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
            $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
        }
        $json = json_encode($body, $flags);
        $attempts = max(1, $retries + 1);
        $last = ['httpCode' => 0, 'raw' => '', 'decoded' => null, 'curlErr' => ''];

        for ($i = 0; $i < $attempts; $i++) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_CONNECTTIMEOUT => 12,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_POSTFIELDS => $json,
            ]);
            $rawResp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            $decoded = is_string($rawResp) ? json_decode($rawResp, true) : null;
            $last = [
                'httpCode' => $httpCode,
                'raw' => is_string($rawResp) ? $rawResp : '',
                'decoded' => is_array($decoded) ? $decoded : null,
                'curlErr' => $curlErr,
            ];

            if ($httpCode >= 200 && $httpCode < 300) {
                return $last;
            }
            $isTransient = ($httpCode === 0 || $httpCode === 429 || $httpCode >= 500);
            if (!$isTransient || $i >= $attempts - 1) {
                return $last;
            }
            usleep(400000 * ($i + 1));
        }

        return $last;
    }
}

if (!function_exists('ccrm_ai_run_openai_transport')) {
    /**
     * Execute chat completion over OpenAI (or OpenAI-compatible custom endpoint).
     */
    function ccrm_ai_run_openai_transport(array $src, array $payload, string $model, int $timeout, int $retries): array {
        $url = ccrm_marveen_build_api_url('openai_api', (string)$src['endpoint'], $model, (string)$src['apiKey']);
        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . (string)$src['apiKey'],
        ];

        $req = $payload;
        $req['model'] = $model;
        if (isset($req['temperature']) && !ccrm_ai_model_supports_temperature($model)) {
            unset($req['temperature']);
        }

        $res = ccrm_ai_curl_post_json($url, $headers, $req, $timeout, $retries);
        // Compatibility retry when a reasoning or proxy model rejects temperature / response_format with HTTP 400
        if ($res['httpCode'] === 400 && (isset($req['temperature']) || isset($req['response_format']))) {
            $stripped = $req;
            unset($stripped['temperature'], $stripped['response_format']);
            $res = ccrm_ai_curl_post_json($url, $headers, $stripped, $timeout, 0);
        }

        if ($res['httpCode'] < 200 || $res['httpCode'] >= 300 || !is_array($res['decoded'])) {
            $errMsg = (string)($res['decoded']['error']['message'] ?? ($res['curlErr'] !== '' ? $res['curlErr'] : ('OpenAI HTTP ' . $res['httpCode'])));
            return [
                'ok' => false,
                'httpCode' => $res['httpCode'],
                'code' => ccrm_ai_classify_http_error($res['httpCode'], $errMsg, $res['curlErr']),
                'content' => '',
                'raw' => $res['decoded'],
                'model' => $model,
                'provider' => 'openai',
                'error' => $errMsg,
            ];
        }

        $content = (string)($res['decoded']['choices'][0]['message']['content'] ?? '');
        return [
            'ok' => $content !== '',
            'httpCode' => $res['httpCode'],
            'code' => $content !== '' ? '' : 'ai_empty',
            'content' => $content,
            'raw' => $res['decoded'],
            'model' => (string)($res['decoded']['model'] ?? $model),
            'provider' => 'openai',
            'error' => $content !== '' ? '' : 'Empty AI response.',
        ];
    }
}

if (!function_exists('ccrm_ai_run_anthropic_transport')) {
    /**
     * Execute chat completion over the Anthropic Messages REST API.
     */
    function ccrm_ai_run_anthropic_transport(array $src, array $payload, string $model, int $timeout, int $retries): array {
        $url = ccrm_marveen_build_api_url('claude_api', (string)$src['endpoint'], $model, (string)$src['apiKey']);
        $headers = [
            'Content-Type: application/json',
            'x-api-key: ' . (string)$src['apiKey'],
            'anthropic-version: 2023-06-01',
        ];

        $wantsJson = (($payload['response_format']['type'] ?? '') === 'json_object');
        $systemParts = [];
        $messages = [];

        foreach ((array)($payload['messages'] ?? []) as $m) {
            if (!is_array($m)) continue;
            $role = strtolower((string)($m['role'] ?? 'user'));
            $content = $m['content'] ?? '';

            if ($role === 'system') {
                if (is_string($content) && trim($content) !== '') {
                    $systemParts[] = trim($content);
                } elseif (is_array($content)) {
                    foreach ($content as $part) {
                        if (is_array($part) && ($part['type'] ?? '') === 'text' && trim((string)($part['text'] ?? '')) !== '') {
                            $systemParts[] = trim((string)$part['text']);
                        }
                    }
                }
                continue;
            }

            $antRole = $role === 'assistant' ? 'assistant' : 'user';
            $blocks = [];
            if (is_string($content)) {
                if ($content !== '') {
                    $blocks[] = ['type' => 'text', 'text' => $content];
                }
            } elseif (is_array($content)) {
                foreach ($content as $part) {
                    if (!is_array($part)) continue;
                    $pType = (string)($part['type'] ?? '');
                    if ($pType === 'text') {
                        $blocks[] = ['type' => 'text', 'text' => (string)($part['text'] ?? '')];
                    } elseif ($pType === 'image_url') {
                        $imgUrl = (string)($part['image_url']['url'] ?? '');
                        $parsed = ccrm_ai_parse_data_url($imgUrl);
                        if ($parsed) {
                            $blocks[] = [
                                'type' => 'image',
                                'source' => [
                                    'type' => 'base64',
                                    'media_type' => $parsed['mime'],
                                    'data' => $parsed['data'],
                                ],
                            ];
                        } elseif ($imgUrl !== '') {
                            $blocks[] = [
                                'type' => 'image',
                                'source' => [
                                    'type' => 'url',
                                    'url' => $imgUrl,
                                ],
                            ];
                        }
                    } elseif ($pType === 'file') {
                        $fileData = (string)($part['file']['file_data'] ?? '');
                        $parsed = ccrm_ai_parse_data_url($fileData);
                        if ($parsed) {
                            $blocks[] = [
                                'type' => 'document',
                                'source' => [
                                    'type' => 'base64',
                                    'media_type' => $parsed['mime'] ?: 'application/pdf',
                                    'data' => $parsed['data'],
                                ],
                            ];
                        }
                    }
                }
            }

            if (empty($blocks)) continue;
            // Anthropic requires alternating user/assistant turns
            if (!empty($messages) && $messages[count($messages) - 1]['role'] === $antRole) {
                $messages[count($messages) - 1]['content'] = array_merge($messages[count($messages) - 1]['content'], $blocks);
            } else {
                $messages[] = ['role' => $antRole, 'content' => $blocks];
            }
        }

        if ($wantsJson) {
            $systemParts[] = 'Respond ONLY with a valid raw JSON object matching the requested schema. Do not wrap in markdown code fences or add extra text.';
        }

        $maxTokens = (int)($payload['max_completion_tokens'] ?? $payload['max_tokens'] ?? 4096);
        if ($maxTokens <= 0) {
            $maxTokens = 4096;
        }
        $body = [
            'model' => $model,
            'max_tokens' => $maxTokens,
            'messages' => $messages,
        ];
        if (!empty($systemParts)) {
            $body['system'] = implode("\n\n", $systemParts);
        }
        if (isset($payload['temperature']) && is_numeric($payload['temperature'])) {
            $body['temperature'] = max(0.0, min(1.0, (float)$payload['temperature']));
        }

        $res = ccrm_ai_curl_post_json($url, $headers, $body, $timeout, $retries);
        $decoded = $res['decoded'];
        if ($res['httpCode'] < 200 || $res['httpCode'] >= 300 || !is_array($decoded)) {
            $errMsg = (string)($decoded['error']['message'] ?? ($res['curlErr'] !== '' ? $res['curlErr'] : ('Anthropic HTTP ' . $res['httpCode'])));
            return [
                'ok' => false,
                'httpCode' => $res['httpCode'],
                'code' => ccrm_ai_classify_http_error($res['httpCode'], $errMsg, $res['curlErr']),
                'content' => '',
                'raw' => $decoded,
                'model' => $model,
                'provider' => 'anthropic',
                'error' => $errMsg,
            ];
        }

        $texts = [];
        foreach ((array)($decoded['content'] ?? []) as $blk) {
            if (is_array($blk) && ($blk['type'] ?? '') === 'text' && isset($blk['text'])) {
                $texts[] = (string)$blk['text'];
            }
        }
        $text = implode('', $texts);
        if ($wantsJson && $text !== '') {
            $text = ccrm_ai_strip_code_fences($text);
        }

        $usage = is_array($decoded['usage'] ?? null) ? $decoded['usage'] : [];
        $usedModel = (string)($decoded['model'] ?? $model);
        $normalized = [
            'model' => $usedModel,
            'choices' => [['message' => ['role' => 'assistant', 'content' => $text]]],
            'usage' => [
                'prompt_tokens' => (int)($usage['input_tokens'] ?? 0),
                'completion_tokens' => (int)($usage['output_tokens'] ?? 0),
                'prompt_tokens_details' => [
                    'cached_tokens' => (int)($usage['cache_read_input_tokens'] ?? 0),
                ],
            ],
        ];

        return [
            'ok' => $text !== '',
            'httpCode' => $res['httpCode'],
            'code' => $text !== '' ? '' : 'ai_empty',
            'content' => $text,
            'raw' => $normalized,
            'model' => $usedModel,
            'provider' => 'anthropic',
            'error' => $text !== '' ? '' : 'Empty AI response.',
        ];
    }
}

if (!function_exists('ccrm_ai_run_gemini_transport')) {
    /**
     * Execute chat completion over Google Gemini generateContent REST API.
     */
    function ccrm_ai_run_gemini_transport(array $src, array $payload, string $model, int $timeout, int $retries): array {
        $url = ccrm_marveen_build_api_url('gemini_api', (string)$src['endpoint'], $model, (string)$src['apiKey']);
        $headers = ['Content-Type: application/json'];
        $wantsJson = (($payload['response_format']['type'] ?? '') === 'json_object');

        $systemParts = [];
        $contents = [];

        foreach ((array)($payload['messages'] ?? []) as $m) {
            if (!is_array($m)) continue;
            $role = strtolower((string)($m['role'] ?? 'user'));
            $content = $m['content'] ?? '';

            if ($role === 'system') {
                if (is_string($content) && trim($content) !== '') {
                    $systemParts[] = ['text' => trim($content)];
                } elseif (is_array($content)) {
                    foreach ($content as $part) {
                        if (is_array($part) && ($part['type'] ?? '') === 'text' && trim((string)($part['text'] ?? '')) !== '') {
                            $systemParts[] = ['text' => trim((string)$part['text'])];
                        }
                    }
                }
                continue;
            }

            $parts = [];
            if (is_string($content)) {
                if ($content !== '') {
                    $parts[] = ['text' => $content];
                }
            } elseif (is_array($content)) {
                foreach ($content as $part) {
                    if (!is_array($part)) continue;
                    $pType = (string)($part['type'] ?? '');
                    if ($pType === 'text') {
                        $parts[] = ['text' => (string)($part['text'] ?? '')];
                    } elseif ($pType === 'image_url') {
                        $parsed = ccrm_ai_parse_data_url((string)($part['image_url']['url'] ?? ''));
                        if ($parsed) {
                            $parts[] = [
                                'inlineData' => [
                                    'mimeType' => $parsed['mime'],
                                    'data' => $parsed['data'],
                                ],
                            ];
                        }
                    } elseif ($pType === 'file') {
                        $parsed = ccrm_ai_parse_data_url((string)($part['file']['file_data'] ?? ''));
                        if ($parsed) {
                            $parts[] = [
                                'inlineData' => [
                                    'mimeType' => $parsed['mime'] ?: 'application/pdf',
                                    'data' => $parsed['data'],
                                ],
                            ];
                        }
                    }
                }
            }

            if (empty($parts)) continue;
            $gemRole = $role === 'assistant' ? 'model' : 'user';
            if (!empty($contents) && $contents[count($contents) - 1]['role'] === $gemRole) {
                $contents[count($contents) - 1]['parts'] = array_merge($contents[count($contents) - 1]['parts'], $parts);
            } else {
                $contents[] = ['role' => $gemRole, 'parts' => $parts];
            }
        }

        $genConfig = [];
        if (isset($payload['temperature']) && is_numeric($payload['temperature'])) {
            $genConfig['temperature'] = (float)$payload['temperature'];
        }
        $maxTokens = (int)($payload['max_completion_tokens'] ?? $payload['max_tokens'] ?? 0);
        if ($maxTokens > 0) {
            $genConfig['maxOutputTokens'] = $maxTokens;
        }
        if ($wantsJson) {
            $genConfig['responseMimeType'] = 'application/json';
        }

        $body = ['contents' => $contents];
        if (!empty($systemParts)) {
            $body['systemInstruction'] = ['parts' => $systemParts];
        }
        if (!empty($genConfig)) {
            $body['generationConfig'] = $genConfig;
        }

        $res = ccrm_ai_curl_post_json($url, $headers, $body, $timeout, $retries);
        $decoded = $res['decoded'];
        if ($res['httpCode'] < 200 || $res['httpCode'] >= 300 || !is_array($decoded)) {
            $errMsg = (string)($decoded['error']['message'] ?? ($res['curlErr'] !== '' ? $res['curlErr'] : ('Gemini HTTP ' . $res['httpCode'])));
            return [
                'ok' => false,
                'httpCode' => $res['httpCode'],
                'code' => ccrm_ai_classify_http_error($res['httpCode'], $errMsg, $res['curlErr']),
                'content' => '',
                'raw' => $decoded,
                'model' => $model,
                'provider' => 'gemini',
                'error' => $errMsg,
            ];
        }

        $texts = [];
        foreach ((array)($decoded['candidates'][0]['content']['parts'] ?? []) as $part) {
            if (is_array($part) && empty($part['thought']) && isset($part['text'])) {
                $texts[] = (string)$part['text'];
            }
        }
        $text = implode('', $texts);
        if ($wantsJson && $text !== '') {
            $text = ccrm_ai_strip_code_fences($text);
        }

        $meta = is_array($decoded['usageMetadata'] ?? null) ? $decoded['usageMetadata'] : [];
        $normalized = [
            'model' => $model,
            'choices' => [['message' => ['role' => 'assistant', 'content' => $text]]],
            'usage' => [
                'prompt_tokens' => (int)($meta['promptTokenCount'] ?? 0),
                'completion_tokens' => (int)($meta['candidatesTokenCount'] ?? 0),
                'prompt_tokens_details' => [
                    'cached_tokens' => (int)($meta['cachedContentTokenCount'] ?? 0),
                ],
            ],
        ];

        return [
            'ok' => $text !== '',
            'httpCode' => $res['httpCode'],
            'code' => $text !== '' ? '' : 'ai_empty',
            'content' => $text,
            'raw' => $normalized,
            'model' => $model,
            'provider' => 'gemini',
            'error' => $text !== '' ? '' : 'Empty AI response.',
        ];
    }
}

if (!function_exists('ccrm_ai_run_marveen_cli_transport')) {
    /**
     * Execute a stateless single-shot completion via remote Marveen bridge or local subscription CLI.
     * No MCP write-tools are attached so standard AI features cannot trigger unintended side effects.
     */
    function ccrm_ai_run_marveen_cli_transport(array $src, array $payload, string $model): array {
        $connectorId = (string)$src['connectorId'];
        $provider = (string)$src['connectorType'];
        $token = (string)$src['subscriptionToken'];
        $endpoint = (string)$src['endpoint'];
        $wantsJson = (($payload['response_format']['type'] ?? '') === 'json_object');

        $systemParts = [];
        $turnTexts = [];
        $tempFiles = [];

        $scratchRoot = function_exists('ccrm_marveen_connector_dir')
            ? (ccrm_marveen_connector_dir($connectorId) . '/scratch')
            : sys_get_temp_dir();
        if (!is_dir($scratchRoot)) {
            @mkdir($scratchRoot, 0700, true);
        }

        foreach ((array)($payload['messages'] ?? []) as $m) {
            if (!is_array($m)) continue;
            $role = strtolower((string)($m['role'] ?? 'user'));
            $content = $m['content'] ?? '';
            $rendered = '';

            if (is_string($content)) {
                $rendered = $content;
            } elseif (is_array($content)) {
                $seg = [];
                foreach ($content as $part) {
                    if (!is_array($part)) continue;
                    $pType = (string)($part['type'] ?? '');
                    if ($pType === 'text') {
                        $seg[] = (string)($part['text'] ?? '');
                    } elseif ($pType === 'file') {
                        $parsed = ccrm_ai_parse_data_url((string)($part['file']['file_data'] ?? ''));
                        if ($parsed) {
                            $tmpPath = $scratchRoot . '/ai_gw_' . bin2hex(random_bytes(6)) . '.pdf';
                            @file_put_contents($tmpPath, base64_decode($parsed['data']));
                            $tempFiles[] = $tmpPath;
                            $seg[] = "[Attached PDF file saved at: {$tmpPath}]";
                        }
                    } elseif ($pType === 'image_url') {
                        $parsed = ccrm_ai_parse_data_url((string)($part['image_url']['url'] ?? ''));
                        if ($parsed) {
                            $ext = str_contains($parsed['mime'], 'png') ? 'png' : 'jpg';
                            $tmpPath = $scratchRoot . '/ai_gw_' . bin2hex(random_bytes(6)) . '.' . $ext;
                            @file_put_contents($tmpPath, base64_decode($parsed['data']));
                            $tempFiles[] = $tmpPath;
                            $seg[] = "[Attached image saved at: {$tmpPath}]";
                        }
                    }
                }
                $rendered = implode("\n\n", $seg);
            }

            if (trim($rendered) === '') continue;
            if ($role === 'system') {
                $systemParts[] = trim($rendered);
            } else {
                $label = $role === 'assistant' ? 'ASSISTANT' : 'USER';
                $turnTexts[] = [$role, $label, trim($rendered)];
            }
        }

        if ($wantsJson) {
            $systemParts[] = 'Respond ONLY with a valid JSON object matching the requested schema. Do not include markdown fences or commentary.';
        }

        $systemPrompt = implode("\n\n", $systemParts);
        if (count($turnTexts) === 1 && $turnTexts[0][0] === 'user') {
            $userPrompt = $turnTexts[0][2];
        } else {
            $lines = [];
            foreach ($turnTexts as $t) {
                $lines[] = $t[1] . ":\n" . $t[2];
            }
            $userPrompt = implode("\n\n", $lines);
        }
        $fullPrompt = $systemPrompt !== '' ? ($systemPrompt . "\n\n" . $userPrompt) : $userPrompt;

        try {
            $remoteUrl = trim($endpoint ?: (string)(getenv('MARVEEN_URL') ?: ''));
            if ($remoteUrl !== '' && function_exists('ccrm_marveen_bridge_post')) {
                $res = ccrm_marveen_bridge_post($remoteUrl, '/run', [
                    'connectorId' => $connectorId,
                    'provider' => $provider,
                    'subscriptionToken' => $token,
                    'mcpUrl' => '',
                    'mcpBearerKey' => '',
                    'prompt' => $userPrompt,
                    'systemPrompt' => $systemPrompt,
                    'model' => $model,
                ]);
                if (empty($res['ok'])) {
                    return [
                        'ok' => false,
                        'httpCode' => 502,
                        'code' => 'ai_error',
                        'content' => '',
                        'raw' => null,
                        'model' => $model,
                        'provider' => 'marveen_cli',
                        'error' => (string)($res['error'] ?? 'Marveen bridge failed.'),
                    ];
                }
                $text = (string)($res['text'] ?? '');
                if ($wantsJson && $text !== '') {
                    $text = ccrm_ai_strip_code_fences($text);
                }
                return [
                    'ok' => $text !== '',
                    'httpCode' => 200,
                    'code' => $text !== '' ? '' : 'ai_empty',
                    'content' => $text,
                    'raw' => [
                        'model' => (string)($res['model'] ?? $model),
                        'choices' => [['message' => ['role' => 'assistant', 'content' => $text]]],
                    ],
                    'model' => (string)($res['model'] ?? $model),
                    'provider' => 'marveen_cli',
                    'error' => $text !== '' ? '' : 'Empty AI response.',
                ];
            }

            if (!function_exists('ccrm_marveen_can_proc_open') || !ccrm_marveen_can_proc_open()) {
                return [
                    'ok' => false,
                    'httpCode' => 500,
                    'code' => 'ai_error',
                    'content' => '',
                    'raw' => null,
                    'model' => $model,
                    'provider' => 'marveen_cli',
                    'error' => 'Subscription CLI connector requires proc_open or a MARVEEN_URL bridge.',
                ];
            }

            $spec = ccrm_marveen_cli_package_for($provider);
            $bin = $spec ? ccrm_marveen_find_bin($spec['bin']) : null;
            if ($bin === null) {
                return [
                    'ok' => false,
                    'httpCode' => 500,
                    'code' => 'ai_connector_unconfigured',
                    'content' => '',
                    'raw' => null,
                    'model' => $model,
                    'provider' => 'marveen_cli',
                    'error' => "CLI binary for connector '{$provider}' is not installed.",
                ];
            }

            $ctx = ccrm_marveen_ensure_worker_dir($connectorId, $provider, $token, '', '');
            if ($provider === 'antigravity') {
                $cmd = [$bin, '-p', $fullPrompt, '--yolo'];
                if ($model !== '') {
                    $cmd[] = '-m';
                    $cmd[] = $model;
                }
            } elseif ($provider === 'chatgpt') {
                $cmd = [$bin, 'exec', $fullPrompt];
                if ($model !== '') {
                    $cmd[] = '-m';
                    $cmd[] = $model;
                }
            } else {
                $cmd = [$bin, '-p', $fullPrompt, '--output-format', 'text', '--dangerously-skip-permissions'];
                if ($model !== '') {
                    $cmd[] = '--model';
                    $cmd[] = $model;
                }
            }

            $env = [
                'PATH' => dirname($bin) . ':/usr/local/bin:/usr/bin:/bin',
                'HOME' => $ctx['workerHome'],
                'CLAUDE_CONFIG_DIR' => $ctx['configDir'],
                'CLAUDE_CODE_OAUTH_TOKEN' => $token,
                'OPENAI_API_KEY' => $token,
                'GEMINI_CLI_TRUST_WORKSPACE' => 'true',
                'DISABLE_AUTOUPDATER' => '1',
            ];
            $geminiKey = (string)($src['apiKey'] ?? '');
            if ($geminiKey !== '') {
                $env['GEMINI_API_KEY'] = $geminiKey;
            }

            // Execute inside scratchDir so project-level .mcp.json is not auto-loaded
            $cwd = is_dir($ctx['scratchDir']) ? $ctx['scratchDir'] : $ctx['workerHome'];
            $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
            $proc = @proc_open($cmd, $descriptors, $pipes, $cwd, $env);
            if (!is_resource($proc)) {
                return [
                    'ok' => false,
                    'httpCode' => 500,
                    'code' => 'ai_error',
                    'content' => '',
                    'raw' => null,
                    'model' => $model,
                    'provider' => 'marveen_cli',
                    'error' => 'Failed to start local CLI process.',
                ];
            }
            fclose($pipes[0]);
            $stdout = (string)stream_get_contents($pipes[1]);
            $stderr = (string)stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $exit = proc_close($proc);

            $text = trim($stdout);
            if ($exit !== 0 || $text === '') {
                $errMsg = trim($stderr) !== '' ? trim($stderr) : ("CLI exited with code {$exit}");
                return [
                    'ok' => false,
                    'httpCode' => 502,
                    'code' => ccrm_ai_classify_http_error(502, $errMsg),
                    'content' => '',
                    'raw' => null,
                    'model' => $model,
                    'provider' => 'marveen_cli',
                    'error' => $errMsg,
                ];
            }

            if ($wantsJson) {
                $text = ccrm_ai_strip_code_fences($text);
            }
            return [
                'ok' => true,
                'httpCode' => 200,
                'code' => '',
                'content' => $text,
                'raw' => [
                    'model' => $model,
                    'choices' => [['message' => ['role' => 'assistant', 'content' => $text]]],
                ],
                'model' => $model,
                'provider' => 'marveen_cli',
                'error' => '',
            ];
        } finally {
            foreach ($tempFiles as $tf) {
                @unlink($tf);
            }
        }
    }
}

if (!function_exists('ccrm_ai_chat_completion')) {
    /**
     * Execute a chat completion against the configured AI source and record token usage.
     *
     * Options:
     *   - feature (string): Usage slug for ccrm_ai_capture_usage (e.g. 'email_summary')
     *   - timeout (int): HTTP timeout in seconds (default 45)
     *   - retries (int): Transient retry attempts (default 2)
     *   - integrationsConfig (array|null): Pre-loaded INTEGRATIONS_CONFIG
     */
    function ccrm_ai_chat_completion(\PDO $pdo, array $payload, array $options = []): array {
        $cfg = $options['integrationsConfig'] ?? null;
        $src = ccrm_ai_resolve_source($pdo, is_array($cfg) ? $cfg : null);
        if (empty($src['configured'])) {
            return [
                'ok' => false,
                'httpCode' => 422,
                'code' => (string)($src['errorCode'] ?? 'ai_key_missing'),
                'content' => '',
                'raw' => null,
                'model' => '',
                'provider' => 'none',
                'error' => (string)($src['error'] ?? 'AI credentials are not configured.'),
            ];
        }

        // Connector mode always inherits the connector's model so OpenAI-specific IDs
        // (e.g. gpt-6-luna) are never sent to Anthropic/Gemini unless manual mode is active.
        if ($src['mode'] === 'connector') {
            $model = (string)$src['model'];
        } else {
            $requested = trim((string)($payload['model'] ?? ''));
            $model = $requested !== '' ? ccrm_ai_upgrade_model($requested, (string)$src['model']) : (string)$src['model'];
        }

        $timeout = max(5, (int)($options['timeout'] ?? 45));
        $retries = max(0, (int)($options['retries'] ?? 2));

        $result = match ($src['transport']) {
            'openai' => ccrm_ai_run_openai_transport($src, $payload, $model, $timeout, $retries),
            'anthropic' => ccrm_ai_run_anthropic_transport($src, $payload, $model, $timeout, $retries),
            'gemini' => ccrm_ai_run_gemini_transport($src, $payload, $model, $timeout, $retries),
            'marveen_cli' => ccrm_ai_run_marveen_cli_transport($src, $payload, $model),
            default => [
                'ok' => false,
                'httpCode' => 422,
                'code' => 'ai_key_missing',
                'content' => '',
                'raw' => null,
                'model' => $model,
                'provider' => 'none',
                'error' => 'Unsupported AI transport.',
            ],
        };

        $feature = trim((string)($options['feature'] ?? ''));
        $captureUsage = !array_key_exists('captureUsage', $options) || !empty($options['captureUsage']);
        if (!empty($result['ok']) && $feature !== '' && $captureUsage && is_array($result['raw'] ?? null)) {
            if (function_exists('ccrm_ai_capture_usage')) {
                ccrm_ai_capture_usage($pdo, $feature, $result['raw'], (string)($result['model'] ?: $model));
            }
        }

        return $result;
    }
}

if (!function_exists('ccrm_ai_transcribe_audio')) {
    /**
     * Transcribe an audio file via OpenAI Whisper (`openai_api` connector or fallback key)
     * or Google Gemini multimodal audio (`gemini_api` / `antigravity` connector).
     */
    function ccrm_ai_transcribe_audio(\PDO $pdo, string $localFilePath, string $mimeType, array $options = []): array {
        if (!is_file($localFilePath)) {
            return [
                'ok' => false,
                'httpCode' => 400,
                'code' => 'audio_missing',
                'text' => '',
                'model' => '',
                'provider' => 'none',
                'raw' => null,
                'error' => 'Uploaded audio file is unreadable.',
            ];
        }

        $cfg = $options['integrationsConfig'] ?? null;
        $src = ccrm_ai_resolve_source($pdo, is_array($cfg) ? $cfg : null);
        $openAiKey = ccrm_ai_resolve_openai_key($pdo, is_array($cfg) ? $cfg : null);

        // Route 1: OpenAI Whisper (when OpenAI connector selected, manual openAiKey active, or non-Gemini fallback openAiKey set)
        $useGeminiAudio = ($src['mode'] === 'connector' && $src['transport'] === 'gemini' && $src['apiKey'] !== '');
        if (!$useGeminiAudio && $openAiKey !== '') {
            $base = ccrm_ai_resolve_openai_base_url($pdo, is_array($cfg) ? $cfg : null);
            $url = rtrim($base, '/') . '/audio/transcriptions';
            $filename = (string)($options['filename'] ?? basename($localFilePath));
            $cFile = new \CURLFile($localFilePath, $mimeType ?: 'audio/webm', $filename);

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_TIMEOUT => max(30, (int)($options['timeout'] ?? 120)),
                CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $openAiKey],
                CURLOPT_POSTFIELDS => [
                    'file' => $cFile,
                    'model' => 'gpt-transcribe',
                ],
            ]);
            $rawResp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            $decoded = is_string($rawResp) ? json_decode($rawResp, true) : null;
            if ($httpCode >= 200 && $httpCode < 300 && is_array($decoded) && isset($decoded['text'])) {
                return [
                    'ok' => true,
                    'httpCode' => $httpCode,
                    'code' => '',
                    'text' => trim((string)$decoded['text']),
                    'model' => (string)($decoded['model'] ?? 'gpt-transcribe'),
                    'provider' => 'openai',
                    'raw' => $decoded,
                    'error' => '',
                ];
            }
            $errMsg = (string)($decoded['error']['message'] ?? ($curlErr !== '' ? $curlErr : ('Whisper HTTP ' . $httpCode)));
            return [
                'ok' => false,
                'httpCode' => $httpCode,
                'code' => ccrm_ai_classify_http_error($httpCode, $errMsg, $curlErr),
                'text' => '',
                'model' => 'gpt-transcribe',
                'provider' => 'openai',
                'raw' => $decoded,
                'error' => $errMsg,
            ];
        }

        // Route 2: Gemini multimodal audio (`gemini_api` / `antigravity`)
        if ($useGeminiAudio) {
            $bytes = @file_get_contents($localFilePath);
            if ($bytes === false || $bytes === '') {
                return [
                    'ok' => false,
                    'httpCode' => 400,
                    'code' => 'audio_empty',
                    'text' => '',
                    'model' => '',
                    'provider' => 'gemini',
                    'raw' => null,
                    'error' => 'Audio file is empty.',
                ];
            }
            $cleanMime = preg_replace('/;.*$/', '', trim($mimeType)) ?: 'audio/webm';
            $payload = [
                'messages' => [
                    [
                        'role' => 'user',
                        'content' => [
                            [
                                'type' => 'text',
                                'text' => 'Transcribe this audio recording verbatim. Return only the plain transcript text in the original language(s), without markdown formatting or commentary.',
                            ],
                            [
                                'type' => 'file',
                                'file' => [
                                    'filename' => (string)($options['filename'] ?? basename($localFilePath)),
                                    'file_data' => 'data:' . $cleanMime . ';base64,' . base64_encode($bytes),
                                ],
                            ],
                        ],
                    ],
                ],
            ];
            $res = ccrm_ai_run_gemini_transport($src, $payload, (string)$src['model'], max(30, (int)($options['timeout'] ?? 120)), 1);
            return [
                'ok' => !empty($res['ok']),
                'httpCode' => (int)$res['httpCode'],
                'code' => (string)$res['code'],
                'text' => trim((string)$res['content']),
                'model' => (string)$res['model'],
                'provider' => 'gemini',
                'raw' => $res['raw'],
                'error' => (string)$res['error'],
            ];
        }

        return [
            'ok' => false,
            'httpCode' => 422,
            'code' => 'ai_key_missing',
            'text' => '',
            'model' => '',
            'provider' => 'none',
            'raw' => null,
            'error' => 'Audio transcription requires an OpenAI/Gemini connector or a fallback OpenAI API key in Settings → AI integration.',
        ];
    }
}
