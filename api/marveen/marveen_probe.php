<?php
/**
 * Provider API keys, URLs and the live probe.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

// -----------------------------------------------------------------------------
// Live Probe & Agent Execution (Tiers 1, 2, 3)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_is_api_key_connector_type')) {
    function ccrm_marveen_is_api_key_connector_type(string $cType): bool {
        return in_array(strtolower(trim($cType)), ['claude_api', 'gemini_api', 'openai_api'], true);
    }
}

if (!function_exists('ccrm_marveen_resolve_provider_api_key')) {
    /**
     * Resolves an API key for `claude_api`, `gemini_api`, `openai_api` connectors
     * (or subscription connectors configured with a direct API key).
     * Falls back to system Settings -> AI (`INTEGRATIONS_CONFIG`) only for `*_api` types.
     */
    function ccrm_marveen_resolve_provider_api_key(?PDO $pdo, string $connectorId, string $provider, array $settings): string {
        $provider = strtolower(trim($provider));
        $apiKey = trim((string)($settings['apiKey'] ?? ''));
        $subToken = trim((string)($settings['subscriptionToken'] ?? ''));
        $raw = $apiKey !== '' ? $apiKey : $subToken;

        if ($provider === 'gemini_api' || $provider === 'antigravity') {
            if ($raw !== '') {
                if (str_starts_with($raw, 'gemini-oauth:')) {
                    return ccrm_marveen_resolve_gemini_api_key($connectorId, $raw) ?? '';
                }
                return $raw;
            }
            if ($provider === 'gemini_api' && $pdo !== null && function_exists('ccrm_load_integrations_config')) {
                return trim((string)(ccrm_load_integrations_config($pdo)['geminiKey'] ?? ''));
            }
            return '';
        }

        if ($provider === 'claude_api' || $provider === 'claude') {
            if ($raw !== '') {
                return $raw;
            }
            if ($provider === 'claude_api' && $pdo !== null && function_exists('ccrm_load_integrations_config')) {
                return trim((string)(ccrm_load_integrations_config($pdo)['anthropicKey'] ?? ''));
            }
            return '';
        }

        if ($provider === 'openai_api' || $provider === 'chatgpt') {
            if ($raw !== '') {
                return $raw;
            }
            if ($provider === 'openai_api' && $pdo !== null && function_exists('ccrm_load_integrations_config')) {
                return trim((string)(ccrm_load_integrations_config($pdo)['openAiKey'] ?? ''));
            }
            return '';
        }

        return $raw;
    }
}

if (!function_exists('ccrm_marveen_build_api_url')) {
    function ccrm_marveen_build_api_url(string $provider, string $customEndpoint, string $model = '', string $apiKey = ''): string {
        $provider = strtolower(trim($provider));
        $base = rtrim(trim($customEndpoint), '/');

        if ($provider === 'claude_api' || $provider === 'claude') {
            if ($base === '') {
                return 'https://api.anthropic.com/v1/messages';
            }
            if (str_ends_with($base, '/messages')) {
                return $base;
            }
            return str_ends_with($base, '/v1') ? ($base . '/messages') : ($base . '/v1/messages');
        }

        if ($provider === 'openai_api' || $provider === 'chatgpt') {
            if ($base === '') {
                return 'https://api.openai.com/v1/chat/completions';
            }
            if (str_ends_with($base, '/chat/completions')) {
                return $base;
            }
            return preg_match('#/v\d+$#', $base) ? ($base . '/chat/completions') : ($base . '/v1/chat/completions');
        }

        // Gemini
        if ($base === '') {
            $base = 'https://generativelanguage.googleapis.com/v1beta';
        } elseif (!str_contains($base, ':generateContent') && !preg_match('#/v1(beta)?($|/)#', $base)) {
            $base .= '/v1beta';
        }
        $cleanModel = preg_replace('#^models/#', '', trim($model)) ?: 'gemini-2.5-flash';
        $url = str_contains($base, ':generateContent')
            ? $base
            : ($base . '/models/' . rawurlencode($cleanModel) . ':generateContent');
        if ($apiKey !== '' && !str_contains($url, 'key=')) {
            $url .= (str_contains($url, '?') ? '&' : '?') . 'key=' . rawurlencode($apiKey);
        }
        return $url;
    }
}

if (!function_exists('ccrm_marveen_live_probe')) {
    function ccrm_marveen_live_probe(string $connectorId, string $provider, string $token, string $agentEndpoint = '', string $agentModel = ''): array {
        $provider = strtolower(trim($provider));
        $token = trim($token);
        $agentEndpoint = trim($agentEndpoint);
        $agentModel = trim($agentModel);
        $isApiKeyType = ccrm_marveen_is_api_key_connector_type($provider);

        if ($token === '') {
            return [
                'ok' => false,
                'error' => $isApiKeyType
                    ? 'No API key configured. Paste your API key in the connector settings.'
                    : 'No subscription token or session configured. Click "Sign in with Subscription" or paste a token.',
            ];
        }

        if (!$isApiKeyType) {
            $remoteUrl = trim($agentEndpoint ?: (string)(getenv('MARVEEN_URL') ?: ''));
            if ($remoteUrl !== '') {
                return ccrm_marveen_bridge_post($remoteUrl, '/probe', [
                    'connectorId' => $connectorId,
                    'provider' => $provider,
                    'subscriptionToken' => $token,
                ]);
            }
        }

        // Check cached verified stamp (Szotasz/marveen claude-credentials-guard.ts pattern)
        $stampDir = ccrm_marveen_storage_root() . '/verified';
        if (!is_dir($stampDir)) {
            @mkdir($stampDir, 0700, true);
        }
        $tokenHash = hash('sha256', $provider . ':' . $agentEndpoint . ':' . $agentModel . ':' . $token);
        $stampFile = $stampDir . '/' . substr($tokenHash, 0, 16) . '.ok';
        if (is_file($stampFile) && (time() - (int)@filemtime($stampFile)) < 86400) {
            return ['ok' => true, 'cached' => true, 'mode' => $isApiKeyType ? 'api_key' : 'verified_stamp'];
        }

        $isDirectClaudeApi = $provider === 'claude_api' || ($provider === 'claude' && str_starts_with($token, 'sk-ant-api'));
        $isDirectGeminiApi = $provider === 'gemini_api' || ($provider === 'antigravity' && (str_starts_with($token, 'AIza') || str_starts_with($token, 'gemini-oauth:')));
        $isDirectOpenAiApi = $provider === 'openai_api' || ($provider === 'chatgpt' && str_starts_with($token, 'sk-') && !str_contains($token, ' ') && substr_count($token, '.') !== 2);

        // Pure-PHP HTTPS probe for API-key connectors (works on any web hosting without CLI/Node/proc_open)
        if ($isDirectClaudeApi) {
            $probeModel = $agentModel !== '' ? $agentModel : 'claude-sonnet-4-6';
            $url = ccrm_marveen_build_api_url('claude_api', $agentEndpoint, $probeModel, $token);
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'x-api-key: ' . $token,
                    'anthropic-version: 2023-06-01',
                ],
                CURLOPT_POSTFIELDS => json_encode([
                    'model' => $probeModel,
                    'max_tokens' => 16,
                    'messages' => [['role' => 'user', 'content' => 'Reply with OK']],
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            $rawResp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);
            $resp = is_string($rawResp) ? json_decode($rawResp, true) : null;
            if ($httpCode >= 200 && $httpCode < 300 && is_array($resp) && empty($resp['error'])) {
                @file_put_contents($stampFile, $tokenHash . "\n");
                return ['ok' => true, 'mode' => 'api_key', 'model' => $probeModel, 'detail' => 'Anthropic API key verified (' . $probeModel . ')'];
            }
            $errMsg = (string)($resp['error']['message'] ?? ($curlErr !== '' ? $curlErr : ('Anthropic API HTTP ' . $httpCode)));
            return ['ok' => false, 'error' => $errMsg];
        }

        if ($isDirectGeminiApi) {
            $geminiKey = ccrm_marveen_resolve_gemini_api_key($connectorId, $token) ?? ($provider === 'gemini_api' ? $token : null);
            if ($geminiKey !== null && $geminiKey !== '') {
                $cleanModel = preg_replace('#^models/#', '', $agentModel);
                $probeModels = $cleanModel !== ''
                    ? [$cleanModel]
                    : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.5-flash-lite'];
                $lastErr = 'Gemini API probe failed';
                foreach ($probeModels as $idx => $tryModel) {
                    $url = ccrm_marveen_build_api_url('gemini_api', $agentEndpoint, $tryModel, $geminiKey);
                    $ch = curl_init($url);
                    curl_setopt_array($ch, [
                        CURLOPT_POST => true,
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT => 15,
                        CURLOPT_HTTPHEADER => [
                            'Content-Type: application/json',
                            'x-goog-api-key: ' . $geminiKey,
                        ],
                        CURLOPT_POSTFIELDS => json_encode([
                            'contents' => [['role' => 'user', 'parts' => [['text' => 'Reply with OK']]]],
                            'generationConfig' => ['maxOutputTokens' => 16],
                        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    ]);
                    $rawResp = curl_exec($ch);
                    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    $curlErr = curl_error($ch);
                    curl_close($ch);
                    $resp = is_string($rawResp) ? json_decode($rawResp, true) : null;
                    if ($httpCode >= 200 && $httpCode < 300 && is_array($resp) && empty($resp['error'])) {
                        @file_put_contents($stampFile, $tokenHash . "\n");
                        return ['ok' => true, 'mode' => 'api_key', 'model' => $tryModel, 'detail' => 'Gemini API key verified (' . $tryModel . ')'];
                    }
                    $lastErr = (string)($resp['error']['message'] ?? ($curlErr !== '' ? $curlErr : ('Gemini API HTTP ' . $httpCode)));
                    if (!in_array($httpCode, [404, 429, 500, 502, 503], true) || ($idx + 1) >= count($probeModels)) {
                        break;
                    }
                }
                return ['ok' => false, 'error' => $lastErr];
            }
        }

        if ($isDirectOpenAiApi) {
            $probeModel = $agentModel !== '' ? $agentModel : 'gpt-4o';
            $url = ccrm_marveen_build_api_url('openai_api', $agentEndpoint, $probeModel, $token);
            $callOpenAiProbe = static function (string $tokenParamName) use ($url, $token, $probeModel): array {
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 15,
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: application/json',
                        'Authorization: Bearer ' . $token,
                    ],
                    CURLOPT_POSTFIELDS => json_encode([
                        'model' => $probeModel,
                        $tokenParamName => 16,
                        'messages' => [['role' => 'user', 'content' => 'Reply with OK']],
                    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
                $rawResp = curl_exec($ch);
                $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $curlErr = curl_error($ch);
                curl_close($ch);
                $resp = is_string($rawResp) ? json_decode($rawResp, true) : null;
                return ['code' => $httpCode, 'resp' => $resp, 'curlErr' => $curlErr];
            };

            $probeRes = $callOpenAiProbe('max_completion_tokens');
            if ($probeRes['code'] === 400) {
                $errTxt = (string)($probeRes['resp']['error']['message'] ?? '');
                if (str_contains($errTxt, 'max_completion_tokens') || str_contains($errTxt, 'max_tokens')) {
                    $probeRes = $callOpenAiProbe('max_tokens');
                }
            }
            if ($probeRes['code'] >= 200 && $probeRes['code'] < 300 && is_array($probeRes['resp']) && empty($probeRes['resp']['error'])) {
                @file_put_contents($stampFile, $tokenHash . "\n");
                return ['ok' => true, 'mode' => 'api_key', 'model' => $probeModel, 'detail' => 'OpenAI API key verified (' . $probeModel . ')'];
            }
            $errMsg = (string)($probeRes['resp']['error']['message'] ?? ($probeRes['curlErr'] !== '' ? $probeRes['curlErr'] : ('OpenAI API HTTP ' . $probeRes['code'])));
            return ['ok' => false, 'error' => $errMsg];
        }

        $spec = ccrm_marveen_cli_package_for($provider);
        $bin = $spec ? ccrm_marveen_find_bin($spec['bin']) : null;
        if ($bin !== null && ccrm_marveen_can_proc_open()) {
            $ctx = ccrm_marveen_ensure_worker_dir($connectorId, $provider, $token, ccrm_marveen_internal_mcp_url(), 'probe');
            $cmd = $provider === 'claude'
                ? [$bin, '-p', 'Reply with exactly: OK', '--model', 'claude-haiku-4-5-20251001']
                : [$bin, '--version'];
            $env = [
                'PATH' => dirname($bin) . ':/usr/local/bin:/usr/bin:/bin',
                'HOME' => $ctx['workerHome'],
                'CLAUDE_CONFIG_DIR' => $ctx['configDir'],
                'CLAUDE_CODE_OAUTH_TOKEN' => $token,
                'DISABLE_AUTOUPDATER' => '1',
            ];
            $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
            $proc = @proc_open($cmd, $descriptors, $pipes, $ctx['workerHome'], $env);
            if (is_resource($proc)) {
                fclose($pipes[0]);
                $out = (string)stream_get_contents($pipes[1]);
                $err = (string)stream_get_contents($pipes[2]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                $exit = proc_close($proc);
                if ($exit === 0) {
                    @file_put_contents($stampFile, $tokenHash . "\n");
                    return ['ok' => true, 'mode' => 'local_cli', 'detail' => trim($out) ?: 'CLI verified'];
                }
                return ['ok' => false, 'error' => 'Subscription CLI probe failed: ' . trim($err ?: $out)];
            }
        }

        // Structural validation when CLI binary is not yet installed locally
        if ($provider === 'claude' && !preg_match('/^(?:sk-ant-oat01-|sk-ant-|session:)/', $token) && strlen($token) < 12) {
            return ['ok' => false, 'error' => 'Claude subscription token should start with sk-ant-oat01- (from claude setup-token).'];
        }
        @file_put_contents($stampFile, $tokenHash . "\n");
        return ['ok' => true, 'mode' => 'token_ready', 'detail' => 'Subscription credential stored & MCP endpoint ready'];
    }
}

if (!function_exists('ccrm_marveen_resolve_gemini_api_key')) {
    /**
     * Resolves a working Gemini API key (`AIzaSy...`) for a Google Antigravity connector.
     *
     * `@google/gemini-cli` ("Sign in with Google") uses OAuth client 681255809395, which
     * Google recently restricted on `cloudcode-pa.googleapis.com` for individual accounts
     * (`IneligibleTierError: Please migrate to the Antigravity suite`). However, the same
     * OAuth token holds `cloud-platform` scope and can read the user's Google AI Studio
     * project (`gen-lang-client-*`) API keys via `apikeys.googleapis.com`, which work
     * natively with both `@google/gemini-cli` (`GEMINI_API_KEY`) and the direct
     * `generativelanguage.googleapis.com` MCP tool-calling loop.
     */
    function ccrm_marveen_resolve_gemini_api_key(string $connectorId, string $subscriptionToken): ?string {
        $subscriptionToken = trim($subscriptionToken);
        if ($subscriptionToken === '') {
            return null;
        }
        if (str_starts_with($subscriptionToken, 'AIza')) {
            return $subscriptionToken;
        }
        if (!str_starts_with($subscriptionToken, 'gemini-oauth:')) {
            return null;
        }

        $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $connectorId ?: 'default');
        $cacheFile = ccrm_marveen_storage_root() . '/connectors/' . $safeId . '/.gemini_api_key';
        if (is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) < 86400) {
            $cached = trim((string)@file_get_contents($cacheFile));
            if (str_starts_with($cached, 'AIza')) {
                return $cached;
            }
        }

        $decoded = base64_decode(substr($subscriptionToken, strlen('gemini-oauth:')), true);
        $creds = is_string($decoded) ? json_decode($decoded, true) : null;
        if (!is_array($creds)) {
            return null;
        }
        if (!empty($creds['api_key']) && is_string($creds['api_key']) && str_starts_with($creds['api_key'], 'AIza')) {
            return $creds['api_key'];
        }

        $accessToken = (string)($creds['access_token'] ?? '');
        $expiryMs = (int)($creds['expiry_date'] ?? 0);
        if ((!empty($creds['refresh_token'])) && ($accessToken === '' || ($expiryMs > 0 && $expiryMs < (time() + 120) * 1000))) {
            $g = ccrm_marveen_google_oauth_constants();
            $ch = curl_init('https://oauth2.googleapis.com/token');
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_POSTFIELDS => http_build_query([
                    'client_id' => $g['client_id'],
                    'client_secret' => $g['client_secret'],
                    'refresh_token' => (string)$creds['refresh_token'],
                    'grant_type' => 'refresh_token',
                ]),
            ]);
            $respRaw = curl_exec($ch);
            curl_close($ch);
            $resp = is_string($respRaw) ? json_decode($respRaw, true) : null;
            if (is_array($resp) && !empty($resp['access_token'])) {
                $accessToken = (string)$resp['access_token'];
            }
        }
        if ($accessToken === '') {
            return null;
        }

        // List active GCP projects on this account, prioritizing `gen-lang-client-*` (Google AI Studio)
        $ch = curl_init('https://cloudresourcemanager.googleapis.com/v1/projects');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
        ]);
        $projRaw = curl_exec($ch);
        curl_close($ch);
        $projData = is_string($projRaw) ? json_decode($projRaw, true) : null;
        $projects = is_array($projData['projects'] ?? null) ? $projData['projects'] : [];
        if (empty($projects)) {
            return null;
        }

        $genLangProjects = [];
        $otherProjects = [];
        foreach ($projects as $p) {
            if (($p['lifecycleState'] ?? '') !== 'ACTIVE' || empty($p['projectId'])) {
                continue;
            }
            $pid = (string)$p['projectId'];
            if (str_starts_with($pid, 'gen-lang-client-')) {
                $genLangProjects[] = $pid;
            } else {
                $otherProjects[] = $pid;
            }
        }
        $orderedProjects = array_merge($genLangProjects, array_slice($otherProjects, 0, 5));

        // Find a quota project with `apikeys.googleapis.com` enabled
        $quotaProject = $orderedProjects[0] ?? '';
        foreach ($otherProjects as $candidatePid) {
            $ch = curl_init("https://apikeys.googleapis.com/v2/projects/{$candidatePid}/locations/global/keys?pageSize=1");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 6,
                CURLOPT_HTTPHEADER => [
                    'Authorization: Bearer ' . $accessToken,
                    'x-goog-user-project: ' . $candidatePid,
                ],
            ]);
            $kr = json_decode((string)curl_exec($ch), true);
            curl_close($ch);
            if (is_array($kr) && !isset($kr['error'])) {
                $quotaProject = $candidatePid;
                break;
            }
        }

        foreach ($orderedProjects as $pid) {
            $headers = ['Authorization: Bearer ' . $accessToken];
            if ($quotaProject !== '') {
                $headers[] = 'x-goog-user-project: ' . $quotaProject;
            }
            $ch = curl_init("https://apikeys.googleapis.com/v2/projects/{$pid}/locations/global/keys");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_HTTPHEADER => $headers,
            ]);
            $kr = json_decode((string)curl_exec($ch), true);
            curl_close($ch);
            if (!is_array($kr) || empty($kr['keys']) || !is_array($kr['keys'])) {
                continue;
            }
            foreach ($kr['keys'] as $k) {
                $keyName = (string)($k['name'] ?? '');
                if ($keyName === '') {
                    continue;
                }
                $ch2 = curl_init("https://apikeys.googleapis.com/v2/{$keyName}/keyString");
                curl_setopt_array($ch2, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 6,
                    CURLOPT_HTTPHEADER => $headers,
                ]);
                $ks = json_decode((string)curl_exec($ch2), true);
                curl_close($ch2);
                $candidateKey = (string)($ks['keyString'] ?? '');
                if (!str_starts_with($candidateKey, 'AIza')) {
                    continue;
                }
                // Verify the key works against generativelanguage.googleapis.com
                $ch3 = curl_init('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' . rawurlencode($candidateKey));
                curl_setopt_array($ch3, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 8,
                    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                    CURLOPT_POSTFIELDS => json_encode(['contents' => [['parts' => [['text' => 'OK']]]]]),
                ]);
                $testResp = json_decode((string)curl_exec($ch3), true);
                curl_close($ch3);
                if (is_array($testResp) && !empty($testResp['candidates'])) {
                    if (!is_dir(dirname($cacheFile))) {
                        @mkdir(dirname($cacheFile), 0700, true);
                    }
                    @file_put_contents($cacheFile, $candidateKey . "\n");
                    @chmod($cacheFile, 0600);
                    return $candidateKey;
                }
            }
        }

        return null;
    }
}
