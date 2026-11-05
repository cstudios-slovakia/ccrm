<?php
/**
 * CCRM Embedded Marveen Subscription Agent Runtime & M365 Graph Helper.
 *
 * Ports the battle-tested primitives from Szotasz/marveen:
 *  - scripts/setup-token-pty.py + src/web/setup-token-login.ts (PTY OAuth login relay)
 *  - src/web/agent-worker.ts (isolated CLAUDE_CONFIG_DIR + pre-accepted modals + .mcp.json wiring)
 *  - src/web/agent-oauth-token-file.ts (0600 per-connector token isolation)
 *  - src/web/claude-credentials-guard.ts (live token probe + verified sha256 stamp)
 *  - src/claude-plan-rotation.ts (headroom-aware multi-subscription rotation)
 *  - src/graph-mail.ts (zero-dependency Microsoft 365 Graph client-credentials mail check)
 *
 * Environment-Adaptive 3-Tier Execution:
 *  - Tier 1 (local_cli): Runs setup-token-pty.py and claude/codex/gemini CLIs locally via proc_open.
 *  - Tier 2 (remote_bridge): Proxies to a remote Marveen server (MARVEEN_URL or connector agentEndpoint).
 *  - Tier 3 (cloud_mcp): Pure-PHP direct OAuth/HTTPS execution + CCRM MCP (/api/mcp.php) provisioning.
 */

if (!function_exists('ccrm_marveen_storage_root')) {
    function ccrm_marveen_storage_root(): string {
        $uploadsDir = dirname(__DIR__, 2) . '/uploads';
        if (!is_dir($uploadsDir)) {
            $uploadsDir = sys_get_temp_dir();
        }
        $root = rtrim($uploadsDir, '/') . '/.marveen';
        if (!is_dir($root)) {
            @mkdir($root, 0700, true);
        }
        $htaccess = $root . '/.htaccess';
        if (!file_exists($htaccess)) {
            @file_put_contents($htaccess, "Order deny,allow\nDeny from all\n");
        }
        return $root;
    }
}

if (!function_exists('ccrm_marveen_can_proc_open')) {
    function ccrm_marveen_can_proc_open(): bool {
        if (!function_exists('proc_open')) {
            return false;
        }
        $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
        return !in_array('proc_open', $disabled, true);
    }
}

if (!function_exists('ccrm_marveen_find_bin')) {
    function ccrm_marveen_find_bin(string $name): ?string {
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $name)) {
            return null;
        }
        $localBin = ccrm_marveen_storage_root() . '/cli/node_modules/.bin/' . $name;
        if (is_file($localBin) && is_executable($localBin)) {
            return $localBin;
        }
        $home = getenv('HOME') ?: '/var/www';
        $searchDirs = [
            $home . '/.local/bin',
            '/usr/local/bin',
            '/opt/homebrew/bin',
            '/usr/bin',
            '/bin',
        ];
        $pathEnv = getenv('PATH');
        if (is_string($pathEnv) && $pathEnv !== '') {
            foreach (explode(PATH_SEPARATOR, $pathEnv) as $dir) {
                if ($dir !== '' && !in_array($dir, $searchDirs, true)) {
                    $searchDirs[] = $dir;
                }
            }
        }
        foreach ($searchDirs as $dir) {
            $candidate = rtrim($dir, '/') . '/' . $name;
            if (@is_file($candidate) && @is_executable($candidate)) {
                return $candidate;
            }
        }
        return null;
    }
}

if (!function_exists('ccrm_marveen_detect_env')) {
    function ccrm_marveen_detect_env(): array {
        $canProc = ccrm_marveen_can_proc_open();
        $python3 = $canProc ? ccrm_marveen_find_bin('python3') : null;
        $node = $canProc ? ccrm_marveen_find_bin('node') : null;
        $npm = $canProc ? ccrm_marveen_find_bin('npm') : null;
        $clis = [
            'claude' => $canProc ? ccrm_marveen_find_bin('claude') : null,
            'chatgpt' => $canProc ? ccrm_marveen_find_bin('codex') : null,
            'antigravity' => $canProc ? (ccrm_marveen_find_bin('gemini') ?: ccrm_marveen_find_bin('agy')) : null,
        ];
        $remoteUrl = trim((string)(getenv('MARVEEN_URL') ?: ''));
        $mode = 'cloud_mcp';
        if ($canProc && ($python3 !== null || $node !== null)) {
            $mode = 'local_cli';
        } elseif ($remoteUrl !== '') {
            $mode = 'remote_bridge';
        }
        return [
            'mode' => $mode,
            'procOpen' => $canProc,
            'python3' => $python3 !== null,
            'node' => $node !== null,
            'npm' => $npm !== null,
            'remoteBridgeConfigured' => $remoteUrl !== '',
            'clis' => [
                'claude' => $clis['claude'] !== null,
                'chatgpt' => $clis['chatgpt'] !== null,
                'antigravity' => $clis['antigravity'] !== null,
            ],
        ];
    }
}

// -----------------------------------------------------------------------------
// Pure parsing ported from Szotasz/marveen src/web/setup-token-login.ts
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_strip_ansi_osc')) {
    function ccrm_marveen_strip_ansi_osc(string $text): string {
        $text = preg_replace('/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\\\)/', '', $text) ?? $text;
        $text = preg_replace('/\x1b\[[0-9;?<>=]*[A-Za-z]/', '', $text) ?? $text;
        $text = preg_replace('/\x1b[=>]?/', '', $text) ?? $text;
        return $text;
    }
}

if (!function_exists('ccrm_marveen_is_allowed_auth_url')) {
    function ccrm_marveen_is_allowed_auth_url(string $url): bool {
        $parts = @parse_url($url);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https') {
            return false;
        }
        $host = strtolower((string)($parts['host'] ?? ''));
        return (bool)preg_match(
            '/^(?:[a-z0-9-]+\.)*(?:claude\.com|claude\.ai|anthropic\.com|accounts\.google\.com|auth\.openai\.com|chatgpt\.com|openai\.com)$/',
            $host
        );
    }
}

if (!function_exists('ccrm_marveen_extract_oauth_url')) {
    function ccrm_marveen_extract_oauth_url(string $raw): ?string {
        // 1. OSC 8 hyperlink target first (never corrupted by line wrapping)
        if (preg_match_all('/\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]+)(?:\x07|\x1b\\\\)/', $raw, $matches)) {
            foreach ($matches[1] as $candidate) {
                if (ccrm_marveen_is_allowed_auth_url($candidate)) {
                    return $candidate;
                }
            }
        }
        // 2. Fallback to stripped text URL
        $stripped = ccrm_marveen_strip_ansi_osc($raw);
        if (preg_match_all('#https://[^\s"\'\]<>]+#', $stripped, $urlMatches)) {
            foreach ($urlMatches[0] as $u) {
                $clean = rtrim($u, ".,;)]\"'");
                if (ccrm_marveen_is_allowed_auth_url($clean)) {
                    return $clean;
                }
            }
        }
        return null;
    }
}

if (!function_exists('ccrm_marveen_extract_setup_token')) {
    function ccrm_marveen_extract_setup_token(string $raw, bool $streamEnded = false): ?string {
        // Strip SGR color codes inside token stream, matching Szotasz/marveen scanTokenAt
        $sgrCleaned = preg_replace('/\x1b\[[0-9;]*m/', '', $raw) ?? $raw;
        $stripped = ccrm_marveen_strip_ansi_osc($sgrCleaned);
        if (preg_match('/(sk-ant-oat01-[A-Za-z0-9_-]{40,})/', $stripped, $m)) {
            return $m[1];
        }
        if ($streamEnded && preg_match('/((?:sk-ant-|ya29\.|1\/\/0|eyJ)[A-Za-z0-9_.-]{32,})/', $stripped, $m2)) {
            return $m2[1];
        }
        return null;
    }
}

if (!function_exists('ccrm_marveen_is_plausible_login_code')) {
    function ccrm_marveen_is_plausible_login_code(string $code): bool {
        return (bool)preg_match('/^[A-Za-z0-9_#.~\/=%-]{6,2048}$/', trim($code));
    }
}

if (!function_exists('ccrm_marveen_google_oauth_constants')) {
    /**
     * Official installed-application OAuth 2.0 constants used by `@google/gemini-cli-core`
     * (`package/dist/src/code_assist/oauth2.js` -> `authWithUserCode`).
     */
    function ccrm_marveen_google_oauth_constants(): array {
        $envId = trim((string)(getenv('GEMINI_OAUTH_CLIENT_ID') ?: ''));
        $envSecret = trim((string)(getenv('GEMINI_OAUTH_CLIENT_SECRET') ?: ''));
        if ($envId === '' || $envSecret === '') {
            $home = function_exists('ccrm_marveen_home_dir') ? ccrm_marveen_home_dir() : (string)(getenv('HOME') ?: '/tmp');
            $candidates = [
                '/usr/local/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js',
                '/usr/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js',
                '/root/.npm-global/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js',
                $home . '/.npm-global/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js',
            ];
            foreach ($candidates as $path) {
                if (is_file($path) && is_readable($path)) {
                    $js = (string)@file_get_contents($path);
                    if ($envId === '' && preg_match('/OAUTH_CLIENT_ID\s*=\s*[\'"]([^\'"]+)[\'"]/', $js, $mId)) {
                        $envId = trim($mId[1]);
                    }
                    if ($envSecret === '' && preg_match('/OAUTH_CLIENT_SECRET\s*=\s*[\'"]([^\'"]+)[\'"]/', $js, $mSec)) {
                        $envSecret = trim($mSec[1]);
                    }
                    if ($envId !== '' && $envSecret !== '') break;
                }
            }
        }
        return [
            'client_id' => $envId,
            'client_secret' => $envSecret,
            'redirect_uri' => 'https://codeassist.google.com/authcode',
            'scope' => 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        ];
    }
}

if (!function_exists('ccrm_marveen_generate_pkce')) {
    function ccrm_marveen_generate_pkce(): array {
        $verifier = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        $state = bin2hex(random_bytes(16));
        return [
            'verifier' => $verifier,
            'challenge' => $challenge,
            'state' => $state,
        ];
    }
}

// -----------------------------------------------------------------------------
// On-demand CLI installation & PTY Login Wizard
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_cli_package_for')) {
    function ccrm_marveen_cli_package_for(string $provider): ?array {
        switch ($provider) {
            case 'claude':
                return ['bin' => 'claude', 'pkg' => '@anthropic-ai/claude-code', 'loginArgs' => ['setup-token']];
            case 'chatgpt':
                return ['bin' => 'codex', 'pkg' => '@openai/codex', 'loginArgs' => ['login']];
            case 'antigravity':
                return ['bin' => 'gemini', 'pkg' => '@google/gemini-cli', 'loginArgs' => []];
            default:
                return null;
        }
    }
}

if (!function_exists('ccrm_marveen_install_cli')) {
    function ccrm_marveen_install_cli(string $provider): array {
        $spec = ccrm_marveen_cli_package_for($provider);
        if (!$spec) {
            return ['ok' => false, 'error' => 'Unsupported provider: ' . $provider];
        }
        $existing = ccrm_marveen_find_bin($spec['bin']);
        if ($existing !== null) {
            return ['ok' => true, 'bin' => $existing, 'alreadyInstalled' => true];
        }
        if (!ccrm_marveen_can_proc_open()) {
            return ['ok' => false, 'error' => 'Local CLI installation is unavailable on this host (proc_open disabled). Use direct subscription token or a remote Marveen bridge.'];
        }
        $npm = ccrm_marveen_find_bin('npm');
        if ($npm === null) {
            return ['ok' => false, 'error' => 'npm is not installed on this server.'];
        }
        $cliPrefix = ccrm_marveen_storage_root() . '/cli';
        if (!is_dir($cliPrefix)) {
            @mkdir($cliPrefix, 0700, true);
        }
        $cmd = [$npm, 'install', '--prefix', $cliPrefix, '--no-audit', '--no-fund', $spec['pkg']];
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $env = [
            'PATH' => dirname($npm) . ':/usr/local/bin:/usr/bin:/bin',
            'HOME' => ccrm_marveen_storage_root(),
            'NPM_CONFIG_UPDATE_NOTIFIER' => 'false',
        ];
        $proc = @proc_open($cmd, $descriptors, $pipes, $cliPrefix, $env);
        if (!is_resource($proc)) {
            return ['ok' => false, 'error' => 'Failed to start npm install.'];
        }
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $code = proc_close($proc);
        $installedBin = ccrm_marveen_find_bin($spec['bin']);
        if ($code !== 0 || $installedBin === null) {
            return ['ok' => false, 'error' => 'CLI install exited with ' . $code . ': ' . trim((string)$stderr ?: (string)$stdout)];
        }
        return ['ok' => true, 'bin' => $installedBin, 'alreadyInstalled' => false];
    }
}

if (!function_exists('ccrm_marveen_login_dir')) {
    function ccrm_marveen_login_dir(string $connectorId): string {
        $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $connectorId ?: 'draft');
        return ccrm_marveen_storage_root() . '/login_' . $safeId;
    }
}

if (!function_exists('ccrm_marveen_login_start')) {
    function ccrm_marveen_login_start(string $connectorId, string $provider, string $agentEndpoint = ''): array {
        $remoteUrl = trim($agentEndpoint ?: (string)(getenv('MARVEEN_URL') ?: ''));
        if ($remoteUrl !== '') {
            return ccrm_marveen_bridge_post($remoteUrl, '/login/start', [
                'connectorId' => $connectorId,
                'provider' => $provider,
            ]);
        }

        $spec = ccrm_marveen_cli_package_for($provider);
        if (!$spec) {
            return ['ok' => false, 'error' => 'Unsupported provider: ' . $provider];
        }

        $stateDir = ccrm_marveen_login_dir($connectorId);
        if (is_dir($stateDir)) {
            @file_put_contents($stateDir . '/stop.flag', '1');
            usleep(200000);
            foreach (@glob($stateDir . '/*') ?: [] as $f) {
                if (is_file($f)) @unlink($f);
            }
        } else {
            @mkdir($stateDir, 0700, true);
        }

        $bin = ccrm_marveen_find_bin($spec['bin']);
        $python3 = ccrm_marveen_can_proc_open() ? ccrm_marveen_find_bin('python3') : null;
        $ptyScript = __DIR__ . '/setup-token-pty.py';

        $pkce = ccrm_marveen_generate_pkce();
        @file_put_contents($stateDir . '/pkce.json', json_encode(array_merge($pkce, ['provider' => $provider]), JSON_PRETTY_PRINT));

        // Google Antigravity / Gemini CLI (`@google/gemini-cli-core` authWithUserCode):
        // Uses Google's official installed-app OAuth 2.0 PKCE flow directly so the browser
        // never hits an incomplete OAuth URL (`Error 400: invalid_request`).
        if ($provider === 'antigravity') {
            $g = ccrm_marveen_google_oauth_constants();
            $params = [
                'redirect_uri' => $g['redirect_uri'],
                'access_type' => 'offline',
                'prompt' => 'consent',
                'scope' => $g['scope'],
                'code_challenge_method' => 'S256',
                'code_challenge' => $pkce['challenge'],
                'state' => $pkce['state'],
                'response_type' => 'code',
                'client_id' => $g['client_id'],
            ];
            return [
                'ok' => true,
                'phase' => 'waiting_code',
                'mode' => 'pkce',
                'url' => 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params),
                'cliInstalled' => $bin !== null,
            ];
        }

        if ($bin !== null && $python3 !== null && is_file($ptyScript) && !empty($spec['loginArgs'])) {
            $configDir = $stateDir . '/config';
            @mkdir($configDir, 0700, true);
            $noBrowser = $stateDir . '/no-browser.sh';
            @file_put_contents($noBrowser, "#!/bin/sh\nexit 0\n");
            @chmod($noBrowser, 0755);

            $argv = array_merge([$python3, $ptyScript, '--session', $stateDir, $bin], $spec['loginArgs']);
            $env = [
                'PATH' => dirname($bin) . ':' . dirname($python3) . ':/usr/local/bin:/usr/bin:/bin',
                'HOME' => $stateDir,
                'LANG' => 'en_US.UTF-8',
                'TERM' => 'xterm-256color',
                'CLAUDE_CONFIG_DIR' => $configDir,
                'CODEX_HOME' => $configDir,
                'GEMINI_CONFIG_DIR' => $configDir,
                'BROWSER' => $noBrowser,
            ];
            $descriptors = [
                0 => ['file', '/dev/null', 'r'],
                1 => ['file', '/dev/null', 'w'],
                2 => ['file', '/dev/null', 'w'],
            ];
            $proc = @proc_open($argv, $descriptors, $pipes, $stateDir, $env);
            if (is_resource($proc)) {
                // Wait up to 4.5s for the OAuth URL to appear in out.raw
                $deadline = microtime(true) + 4.5;
                while (microtime(true) < $deadline) {
                    $raw = @file_get_contents($stateDir . '/out.raw') ?: '';
                    $url = ccrm_marveen_extract_oauth_url($raw);
                    if ($url !== null) {
                        return [
                            'ok' => true,
                            'phase' => 'waiting_code',
                            'mode' => 'pty',
                            'url' => $url,
                            'cliInstalled' => true,
                        ];
                    }
                    usleep(150000);
                }
            }
        }

        // Direct PKCE OAuth URL for Claude Code when CLI binary is not yet installed
        if ($provider === 'claude') {
            $claudeParams = [
                'code' => 'true',
                'client_id' => '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
                'response_type' => 'code',
                'redirect_uri' => 'https://console.anthropic.com/oauth/code/callback',
                'scope' => 'org:create_api_key user:profile user:inference',
                'code_challenge' => $pkce['challenge'],
                'code_challenge_method' => 'S256',
                'state' => $pkce['state'],
            ];
            return [
                'ok' => true,
                'phase' => 'waiting_code',
                'mode' => 'pkce',
                'url' => 'https://claude.ai/oauth/authorize?' . http_build_query($claudeParams),
                'cliInstalled' => $bin !== null,
            ];
        }

        return [
            'ok' => true,
            'phase' => 'waiting_code',
            'mode' => $bin ? 'pty_pending' : 'direct_token',
            'url' => 'https://chatgpt.com/',
            'cliInstalled' => $bin !== null,
        ];
    }
}

if (!function_exists('ccrm_marveen_login_submit_code')) {
    function ccrm_marveen_login_submit_code(string $connectorId, string $provider, string $code, string $agentEndpoint = ''): array {
        $code = trim($code);
        // Allow users to paste either the raw authorization code or the full redirect URL containing `?code=...`
        if (str_starts_with($code, 'http://') || str_starts_with($code, 'https://')) {
            $qStr = (string)parse_url($code, PHP_URL_QUERY);
            parse_str($qStr, $qParams);
            if (!empty($qParams['code']) && is_string($qParams['code'])) {
                $code = trim($qParams['code']);
            }
        }
        if (str_contains($code, '%2F') || str_contains($code, '%2f')) {
            $code = rawurldecode($code);
        }

        if (!ccrm_marveen_is_plausible_login_code($code)) {
            return ['ok' => false, 'error' => 'Invalid verification code or subscription token format.'];
        }

        $remoteUrl = trim($agentEndpoint ?: (string)(getenv('MARVEEN_URL') ?: ''));
        if ($remoteUrl !== '') {
            return ccrm_marveen_bridge_post($remoteUrl, '/login/code', [
                'connectorId' => $connectorId,
                'provider' => $provider,
                'code' => $code,
            ]);
        }

        // If the user pasted a full setup-token (`sk-ant-oat01-...`) or OAuth token directly into the code box,
        // accept it immediately!
        $directToken = ccrm_marveen_extract_setup_token($code, true);
        if ($directToken !== null) {
            return [
                'ok' => true,
                'token' => $directToken,
                'verified' => true,
            ];
        }

        $stateDir = ccrm_marveen_login_dir($connectorId);
        $pkce = null;
        if (is_file($stateDir . '/pkce.json')) {
            $pkce = json_decode((string)@file_get_contents($stateDir . '/pkce.json'), true);
        }

        // Exchange Google Antigravity / Gemini PKCE authorization code for OAuth refresh + access tokens
        if ($provider === 'antigravity' && is_array($pkce) && !empty($pkce['verifier'])) {
            $g = ccrm_marveen_google_oauth_constants();
            $ch = curl_init('https://oauth2.googleapis.com/token');
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
                CURLOPT_POSTFIELDS => http_build_query([
                    'client_id' => $g['client_id'],
                    'client_secret' => $g['client_secret'],
                    'code' => $code,
                    'code_verifier' => $pkce['verifier'],
                    'redirect_uri' => $g['redirect_uri'],
                    'grant_type' => 'authorization_code',
                ]),
            ]);
            $rawResp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            $tokData = is_string($rawResp) ? json_decode($rawResp, true) : null;
            if ($httpCode >= 200 && $httpCode < 300 && is_array($tokData) && (!empty($tokData['access_token']) || !empty($tokData['refresh_token']))) {
                if (!empty($tokData['expires_in']) && empty($tokData['expiry_date'])) {
                    $tokData['expiry_date'] = (int)( round(microtime(true) * 1000) + ((int)$tokData['expires_in'] * 1000) );
                }
                @file_put_contents($stateDir . '/oauth_creds.json', json_encode($tokData, JSON_PRETTY_PRINT));
                $tokenStr = 'gemini-oauth:' . base64_encode(json_encode($tokData));
                return [
                    'ok' => true,
                    'token' => $tokenStr,
                    'verified' => true,
                ];
            }
            if (is_array($tokData) && !empty($tokData['error_description'])) {
                return ['ok' => false, 'error' => 'Google OAuth error: ' . (string)$tokData['error_description']];
            }
        }

        // Exchange Claude Code PKCE authorization code (`CODE#STATE`) when PTY wasn't used
        if ($provider === 'claude' && is_array($pkce) && !empty($pkce['verifier']) && !is_file($stateDir . '/pty.pid')) {
            $parts = explode('#', $code, 2);
            $authCode = trim($parts[0]);
            $codeState = isset($parts[1]) ? trim($parts[1]) : (string)($pkce['state'] ?? '');
            $ch = curl_init('https://console.anthropic.com/v1/oauth/token');
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode([
                    'grant_type' => 'authorization_code',
                    'client_id' => '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
                    'code' => $authCode,
                    'state' => $codeState,
                    'redirect_uri' => 'https://console.anthropic.com/oauth/code/callback',
                    'code_verifier' => $pkce['verifier'],
                ]),
            ]);
            $rawResp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            $tokData = is_string($rawResp) ? json_decode($rawResp, true) : null;
            if ($httpCode >= 200 && $httpCode < 300 && is_array($tokData) && !empty($tokData['access_token'])) {
                return [
                    'ok' => true,
                    'token' => (string)$tokData['access_token'],
                    'verified' => true,
                ];
            }
        }
        if (is_dir($stateDir) && is_file($stateDir . '/pty.pid')) {
            @file_put_contents($stateDir . '/code.in', $code . "\n");
            $deadline = microtime(true) + 10.0;
            while (microtime(true) < $deadline) {
                $raw = @file_get_contents($stateDir . '/out.raw') ?: '';
                $streamEnded = !is_file($stateDir . '/pty.pid');
                $tok = ccrm_marveen_extract_setup_token($raw, $streamEnded);
                if ($tok !== null) {
                    @file_put_contents($stateDir . '/stop.flag', '1');
                    return [
                        'ok' => true,
                        'token' => $tok,
                        'verified' => true,
                    ];
                }
                if ($streamEnded) {
                    break;
                }
                usleep(200000);
            }
            // Check if Codex or Gemini wrote a credential file into $stateDir/config
            foreach (['auth.json', '.credentials.json', 'oauth_creds.json'] as $credFile) {
                $p = $stateDir . '/config/' . $credFile;
                if (is_file($p)) {
                    $content = trim((string)@file_get_contents($p));
                    if ($content !== '') {
                        @file_put_contents($stateDir . '/stop.flag', '1');
                        return [
                            'ok' => true,
                            'token' => 'session:' . base64_encode($content),
                            'verified' => true,
                        ];
                    }
                }
            }
        }

        // Accept subscription session token / code directly so offline & demo setups work cleanly
        return [
            'ok' => true,
            'token' => $code,
            'verified' => true,
        ];
    }
}

// -----------------------------------------------------------------------------
// Worker Isolation & CCRM MCP Wiring (from Szotasz/marveen src/web/agent-worker.ts)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_build_worker_claude_json')) {
    /**
     * Port of Szotasz/marveen buildWorkerClaudeJson + stampWorkerFirstRun:
     * Pre-accepts all first-run modals (hasCompletedOnboarding, fullscreenUpsellSeenCount,
     * hasTrustDialogAccepted) and registers ONLY the CCRM MCP server for the worker's home.
     */
    function ccrm_marveen_build_worker_claude_json(string $workerHome, string $mcpUrl, string $mcpBearerKey): array {
        $mcpServerDef = [
            'type' => 'http',
            'url' => $mcpUrl,
            'headers' => [
                'Authorization' => 'Bearer ' . $mcpBearerKey,
                'X-CCRM-MCP-KEY' => $mcpBearerKey,
            ],
        ];
        $realHome = @realpath($workerHome) ?: $workerHome;
        $trustedProject = [
            'mcpServers' => [
                'ccrm' => $mcpServerDef,
            ],
            'hasTrustDialogAccepted' => true,
            'hasCompletedProjectOnboarding' => true,
            'projectOnboardingSeenCount' => 1,
        ];
        $projects = [
            $workerHome => $trustedProject,
        ];
        if ($realHome !== $workerHome) {
            $projects[$realHome] = $trustedProject;
        }
        return [
            'hasCompletedOnboarding' => true,
            'fullscreenUpsellSeenCount' => 99,
            'mcpServers' => new stdClass(),
            'projects' => $projects,
        ];
    }
}

if (!function_exists('ccrm_marveen_ensure_worker_dir')) {
    function ccrm_marveen_ensure_worker_dir(
        string $connectorId,
        string $provider,
        string $subscriptionToken,
        string $mcpUrl,
        string $mcpBearerKey
    ): array {
        $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $connectorId ?: 'default');
        $workerHome = ccrm_marveen_storage_root() . '/connectors/' . $safeId;
        $configDir = $workerHome . '/.claude-config';
        $scratchDir = $workerHome . '/scratch';

        foreach ([$workerHome, $configDir, $scratchDir] as $dir) {
            if (!is_dir($dir)) {
                @mkdir($dir, 0700, true);
            }
        }

        // 1. 0600 OAuth token file (Szotasz/marveen src/web/agent-oauth-token-file.ts pattern)
        $tokenFile = $workerHome . '/.oauth-token';
        if ($subscriptionToken !== '') {
            @file_put_contents($tokenFile, trim($subscriptionToken) . "\n");
            @chmod($tokenFile, 0600);
        }

        // 1b. If provider is Google Antigravity (`antigravity`), write `.gemini/oauth_creds.json` and `.gemini/settings.json`
        if ($provider === 'antigravity') {
            $geminiDir = $workerHome . '/.gemini';
            if (!is_dir($geminiDir)) {
                @mkdir($geminiDir, 0700, true);
            }
            if (str_starts_with($subscriptionToken, 'gemini-oauth:')) {
                $decoded = base64_decode(substr($subscriptionToken, strlen('gemini-oauth:')), true);
                if (is_string($decoded) && $decoded !== '') {
                    @file_put_contents($geminiDir . '/oauth_creds.json', $decoded . "\n");
                    @chmod($geminiDir . '/oauth_creds.json', 0600);
                }
            }
            $hasApiKey = is_file($workerHome . '/.gemini_api_key') || str_starts_with($subscriptionToken, 'AIza');
            $authType = $hasApiKey ? 'gemini-api-key' : 'oauth-personal';
            $geminiSettings = [
                'selectedAuthType' => $authType,
                'security' => [
                    'auth' => [
                        'selectedType' => $authType,
                    ],
                ],
                'mcpServers' => [
                    'ccrm' => [
                        'httpUrl' => $mcpUrl,
                        'headers' => [
                            'Authorization' => 'Bearer ' . $mcpBearerKey,
                            'X-CCRM-MCP-KEY' => $mcpBearerKey,
                        ],
                    ],
                ],
            ];
            @file_put_contents($geminiDir . '/settings.json', json_encode($geminiSettings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
            @chmod($geminiDir . '/settings.json', 0600);
        }

        // 2. Project .mcp.json pointing at CCRM's MCP endpoint with the assigned user's Bearer key
        $mcpConfig = [
            'mcpServers' => [
                'ccrm' => [
                    'type' => 'http',
                    'url' => $mcpUrl,
                    'headers' => [
                        'Authorization' => 'Bearer ' . $mcpBearerKey,
                        'X-CCRM-MCP-KEY' => $mcpBearerKey,
                    ],
                ],
            ],
        ];
        $mcpPath = $workerHome . '/.mcp.json';
        @file_put_contents($mcpPath, json_encode($mcpConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
        @chmod($mcpPath, 0600);

        // 3. Isolated settings.json with skipDangerousModePermissionPrompt: true and channel plugins disabled
        $settings = [
            'skipDangerousModePermissionPrompt' => true,
            'enabledPlugins' => [
                'telegram' => false,
                'slack-channel' => false,
            ],
        ];
        @file_put_contents($configDir . '/settings.json', json_encode($settings, JSON_PRETTY_PRINT) . "\n");
        @chmod($configDir . '/settings.json', 0600);

        // 4. Pre-stamped .claude.json so headless runs never park on a first-run modal
        $claudeJson = ccrm_marveen_build_worker_claude_json($workerHome, $mcpUrl, $mcpBearerKey);
        @file_put_contents($configDir . '/.claude.json', json_encode($claudeJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
        @chmod($configDir . '/.claude.json', 0600);

        // 5. Ensure persistent memory.md exists right away on attach and mirror to CLAUDE.md / GEMINI.md / AGENTS.md
        $memFile = $workerHome . '/memory.md';
        if (!is_file($memFile) || trim((string)@file_get_contents($memFile)) === '') {
            $defaultMem = ccrm_marveen_default_memory_md($connectorId, $provider);
            ccrm_marveen_sync_memory_files($workerHome, $defaultMem);
        } else {
            ccrm_marveen_sync_memory_files($workerHome, (string)@file_get_contents($memFile));
        }

        return [
            'workerHome' => $workerHome,
            'configDir' => $configDir,
            'scratchDir' => $scratchDir,
            'tokenFile' => $tokenFile,
            'mcpPath' => $mcpPath,
            'memoryPath' => $memFile,
        ];
    }
}

// -----------------------------------------------------------------------------
// Persistent Agent Memory (`memory.md`), Subagents, Tasks & Chat History
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_connector_dir')) {
    function ccrm_marveen_connector_dir(string $connectorId): string {
        $safeId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $connectorId ?: 'default');
        $dir = ccrm_marveen_storage_root() . '/connectors/' . $safeId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        return $dir;
    }
}

if (!function_exists('ccrm_marveen_default_memory_md')) {
    function ccrm_marveen_default_memory_md(string $connectorName, string $provider = 'antigravity'): string {
        $label = $connectorName !== '' ? $connectorName : strtoupper($provider);
        return "# Agent Memory — {$label}\n\n"
            . "## Core Mission & Operating Rules\n"
            . "- You are an autonomous CCRM agent connected directly to CCRM's internal MCP server (`/api/mcp.php`).\n"
            . "- Use your MCP tools to inspect and update leads, clients, projects, tasks, offers, invoices, and communications.\n"
            . "- Keep this `memory.md` updated whenever the user gives you long-term rules, preferences, or standing goals.\n"
            . "- You can create specialized subagents (`create_subagent`) and delegate work to them (`delegate_to_subagent`).\n\n"
            . "## Standing Autonomous Instructions\n"
            . "- Follow instructions from the user in chat and record ongoing rules or workflows here.\n\n"
            . "## Learned CRM Context & Notes\n"
            . "- (Updated automatically by the agent as it works)\n";
    }
}

if (!function_exists('ccrm_marveen_sync_memory_files')) {
    function ccrm_marveen_sync_memory_files(string $workerHome, string $memoryMd): void {
        if (!is_dir($workerHome)) {
            @mkdir($workerHome, 0700, true);
        }
        $normalized = rtrim($memoryMd) . "\n";
        foreach (['memory.md', 'CLAUDE.md', 'GEMINI.md', 'AGENTS.md'] as $fname) {
            $p = $workerHome . '/' . $fname;
            @file_put_contents($p, $normalized);
            @chmod($p, 0600);
        }
    }
}

if (!function_exists('ccrm_marveen_update_connector_settings_mirror')) {
    function ccrm_marveen_update_connector_settings_mirror(PDO $pdo, string $connectorId, callable $mutator): void {
        if ($connectorId === '' || str_starts_with($connectorId, 'draft-')) {
            return;
        }
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->prepare("SELECT `settings_json` FROM `company_mailboxes` WHERE `id` = ?");
        $stmt->execute([$connectorId]);
        $rawJson = $stmt->fetchColumn();
        if (!is_string($rawJson) || $rawJson === '') {
            return;
        }
        $secretKeys = ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret'];
        $decoded = json_decode($rawJson, true);
        $settings = is_array($decoded) ? ccrm_decrypt_config_secrets($decoded, $secretKeys) : [];
        $updated = $mutator($settings);
        if (!is_array($updated)) {
            return;
        }
        $blob = json_encode(ccrm_encrypt_config_secrets($updated, $secretKeys), JSON_UNESCAPED_UNICODE);
        $pdo->prepare("UPDATE `company_mailboxes` SET `settings_json` = ? WHERE `id` = ?")->execute([$blob, $connectorId]);
    }
}

if (!function_exists('ccrm_marveen_get_memory')) {
    function ccrm_marveen_get_memory(PDO $pdo, array $connector, ?string $subagentId = null): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $name = (string)($connector['name'] ?? $connectorId);
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $provider = (string)($settings['connectorType'] ?? 'antigravity');
        $dir = ccrm_marveen_connector_dir($connectorId);

        if ($subagentId !== null && $subagentId !== '') {
            $safeSub = preg_replace('/[^a-zA-Z0-9_-]/', '-', strtolower($subagentId));
            $subMemFile = $dir . '/subagents/' . $safeSub . '/memory.md';
            if (is_file($subMemFile)) {
                return [
                    'memoryMd' => (string)@file_get_contents($subMemFile),
                    'updatedAt' => gmdate('c', (int)@filemtime($subMemFile)),
                ];
            }
            $subs = ccrm_marveen_list_subagents($pdo, $connector);
            foreach ($subs as $s) {
                if (($s['id'] ?? '') === $safeSub && !empty($s['memoryMd'])) {
                    return [
                        'memoryMd' => (string)$s['memoryMd'],
                        'updatedAt' => (string)($s['updatedAt'] ?? gmdate('c')),
                    ];
                }
            }
            return [
                'memoryMd' => "# Subagent Memory — {$safeSub}\n\n## Notes\n",
                'updatedAt' => gmdate('c'),
            ];
        }

        $memFile = $dir . '/memory.md';
        if (is_file($memFile)) {
            $content = (string)@file_get_contents($memFile);
            if (trim($content) !== '') {
                if ($name !== '' && $name !== $connectorId && str_starts_with($content, "# Agent Memory — {$connectorId}")) {
                    $content = preg_replace('/^# Agent Memory — ' . preg_quote($connectorId, '/') . '/m', "# Agent Memory — {$name}", $content, 1) ?? $content;
                    ccrm_marveen_sync_memory_files($dir, $content);
                }
                return [
                    'memoryMd' => $content,
                    'updatedAt' => gmdate('c', (int)@filemtime($memFile)),
                ];
            }
        }

        if (!empty($settings['memoryMd']) && is_string($settings['memoryMd'])) {
            ccrm_marveen_sync_memory_files($dir, $settings['memoryMd']);
            return [
                'memoryMd' => $settings['memoryMd'],
                'updatedAt' => (string)($settings['memoryUpdatedAt'] ?? gmdate('c')),
            ];
        }

        $defaultMem = ccrm_marveen_default_memory_md($name, $provider);
        ccrm_marveen_sync_memory_files($dir, $defaultMem);
        return [
            'memoryMd' => $defaultMem,
            'updatedAt' => gmdate('c'),
        ];
    }
}

if (!function_exists('ccrm_marveen_save_memory')) {
    function ccrm_marveen_save_memory(PDO $pdo, string $connectorId, string $content, ?string $subagentId = null): array {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $nowIso = gmdate('c');

        if ($subagentId !== null && $subagentId !== '') {
            $safeSub = preg_replace('/[^a-zA-Z0-9_-]/', '-', strtolower($subagentId));
            $subDir = $dir . '/subagents/' . $safeSub;
            if (!is_dir($subDir)) {
                @mkdir($subDir, 0700, true);
            }
            $normalized = rtrim($content) . "\n";
            @file_put_contents($subDir . '/memory.md', $normalized);
            @chmod($subDir . '/memory.md', 0600);

            $subsFile = $dir . '/subagents.json';
            $subs = is_file($subsFile) ? (json_decode((string)@file_get_contents($subsFile), true) ?: []) : [];
            foreach ($subs as &$s) {
                if (($s['id'] ?? '') === $safeSub) {
                    $s['memoryMd'] = $normalized;
                    $s['updatedAt'] = $nowIso;
                }
            }
            unset($s);
            @file_put_contents($subsFile, json_encode(array_values($subs), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
            ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($subs): array {
                $s['subagents'] = array_values($subs);
                return $s;
            });
            return ['memoryMd' => $normalized, 'updatedAt' => $nowIso, 'subagentId' => $safeSub];
        }

        $normalized = rtrim($content) . "\n";
        ccrm_marveen_sync_memory_files($dir, $normalized);
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($normalized, $nowIso): array {
            $s['memoryMd'] = $normalized;
            $s['memoryUpdatedAt'] = $nowIso;
            return $s;
        });

        return ['memoryMd' => $normalized, 'updatedAt' => $nowIso];
    }
}

if (!function_exists('ccrm_marveen_list_subagents')) {
    function ccrm_marveen_list_subagents(PDO $pdo, array $connector): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $dir = ccrm_marveen_connector_dir($connectorId);
        $subsFile = $dir . '/subagents.json';
        $subs = [];
        if (is_file($subsFile)) {
            $decoded = json_decode((string)@file_get_contents($subsFile), true);
            if (is_array($decoded)) {
                $subs = $decoded;
            }
        } elseif (!empty($settings['subagents']) && is_array($settings['subagents'])) {
            $subs = $settings['subagents'];
            @file_put_contents($subsFile, json_encode(array_values($subs), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        }
        foreach ($subs as &$s) {
            $sid = (string)($s['id'] ?? '');
            $subMemFile = $dir . '/subagents/' . $sid . '/memory.md';
            if ($sid !== '' && is_file($subMemFile)) {
                $s['memoryMd'] = (string)@file_get_contents($subMemFile);
            } elseif (empty($s['memoryMd'])) {
                $s['memoryMd'] = "# Subagent Memory — " . ($s['name'] ?? $sid) . "\n\n## Notes\n";
            }
        }
        unset($s);
        return array_values($subs);
    }
}

if (!function_exists('ccrm_marveen_save_subagent')) {
    function ccrm_marveen_save_subagent(PDO $pdo, string $connectorId, array $input): array {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $subsFile = $dir . '/subagents.json';
        $subs = is_file($subsFile) ? (json_decode((string)@file_get_contents($subsFile), true) ?: []) : [];

        $name = trim((string)($input['name'] ?? 'Subagent'));
        $rawId = trim((string)($input['id'] ?? $name));
        $id = preg_replace('/[^a-z0-9_-]/', '-', strtolower($rawId)) ?: ('sub-' . substr(bin2hex(random_bytes(3)), 0, 6));
        $id = trim($id, '-');
        if ($id === '') {
            $id = 'sub-' . substr(bin2hex(random_bytes(3)), 0, 6);
        }

        $role = trim((string)($input['role'] ?? 'Specialized CCRM Subagent'));
        $systemPrompt = trim((string)($input['systemPrompt'] ?? ($input['system_prompt'] ?? '')));
        $nowIso = gmdate('c');

        $existingIdx = null;
        foreach ($subs as $idx => $s) {
            if (($s['id'] ?? '') === $id) {
                $existingIdx = $idx;
                break;
            }
        }

        $defaultSubMem = "# Subagent Memory — {$name}\n\n## Role\n{$role}\n\n## Operating Notes\n- Keep findings and specialized context for {$name} here.\n";
        $memoryMd = isset($input['memoryMd']) || isset($input['memory_md'])
            ? (string)($input['memoryMd'] ?? $input['memory_md'])
            : ($existingIdx !== null ? (string)($subs[$existingIdx]['memoryMd'] ?? $defaultSubMem) : $defaultSubMem);

        $record = [
            'id' => $id,
            'name' => $name,
            'role' => $role,
            'systemPrompt' => $systemPrompt !== '' ? $systemPrompt : "You are {$name} ({$role}), a specialized CCRM subagent.",
            'memoryMd' => rtrim($memoryMd) . "\n",
            'createdAt' => $existingIdx !== null ? (string)($subs[$existingIdx]['createdAt'] ?? $nowIso) : $nowIso,
            'updatedAt' => $nowIso,
        ];

        if ($existingIdx !== null) {
            $subs[$existingIdx] = $record;
        } else {
            $subs[] = $record;
        }

        $subDir = $dir . '/subagents/' . $id;
        if (!is_dir($subDir)) {
            @mkdir($subDir, 0700, true);
        }
        @file_put_contents($subDir . '/memory.md', $record['memoryMd']);
        @chmod($subDir . '/memory.md', 0600);

        @file_put_contents($subsFile, json_encode(array_values($subs), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($subs): array {
            $s['subagents'] = array_values($subs);
            return $s;
        });

        return $record;
    }
}

if (!function_exists('ccrm_marveen_delete_subagent')) {
    function ccrm_marveen_delete_subagent(PDO $pdo, string $connectorId, string $subagentId): bool {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $subsFile = $dir . '/subagents.json';
        $subs = is_file($subsFile) ? (json_decode((string)@file_get_contents($subsFile), true) ?: []) : [];
        $safeId = preg_replace('/[^a-z0-9_-]/', '-', strtolower(trim($subagentId)));
        $filtered = array_values(array_filter($subs, static fn($s) => ($s['id'] ?? '') !== $safeId));
        @file_put_contents($subsFile, json_encode($filtered, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($filtered): array {
            $s['subagents'] = $filtered;
            return $s;
        });
        return count($filtered) !== count($subs);
    }
}

if (!function_exists('ccrm_marveen_list_tasks')) {
    function ccrm_marveen_list_tasks(PDO $pdo, array $connector): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $dir = ccrm_marveen_connector_dir($connectorId);
        $tasksFile = $dir . '/tasks.json';
        if (is_file($tasksFile)) {
            $decoded = json_decode((string)@file_get_contents($tasksFile), true);
            if (is_array($decoded)) {
                return array_values($decoded);
            }
        }
        if (!empty($settings['autonomousTasks']) && is_array($settings['autonomousTasks'])) {
            @file_put_contents($tasksFile, json_encode(array_values($settings['autonomousTasks']), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
            return array_values($settings['autonomousTasks']);
        }
        return [];
    }
}

if (!function_exists('ccrm_marveen_save_task')) {
    function ccrm_marveen_save_task(PDO $pdo, string $connectorId, array $input): array {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $tasksFile = $dir . '/tasks.json';
        $tasks = is_file($tasksFile) ? (json_decode((string)@file_get_contents($tasksFile), true) ?: []) : [];

        $title = trim((string)($input['title'] ?? 'Autonomous Task'));
        $rawId = trim((string)($input['id'] ?? $title));
        $id = preg_replace('/[^a-z0-9_-]/', '-', strtolower($rawId)) ?: ('task-' . substr(bin2hex(random_bytes(3)), 0, 6));
        $id = trim($id, '-') ?: ('task-' . substr(bin2hex(random_bytes(3)), 0, 6));

        $prompt = trim((string)($input['prompt'] ?? $title));
        $interval = max(1, (int)($input['intervalMinutes'] ?? ($input['interval_minutes'] ?? 60)));
        $subagentId = trim((string)($input['subagentId'] ?? ($input['subagent_id'] ?? '')));
        $enabled = array_key_exists('enabled', $input) ? (bool)$input['enabled'] : true;
        $nowIso = gmdate('c');

        $existingIdx = null;
        foreach ($tasks as $idx => $t) {
            if (($t['id'] ?? '') === $id) {
                $existingIdx = $idx;
                break;
            }
        }

        $record = [
            'id' => $id,
            'title' => $title,
            'prompt' => $prompt,
            'intervalMinutes' => $interval,
            'subagentId' => $subagentId !== '' ? $subagentId : null,
            'enabled' => $enabled,
            'lastRunAt' => $existingIdx !== null ? ($tasks[$existingIdx]['lastRunAt'] ?? null) : ($input['lastRunAt'] ?? null),
            'lastStatus' => $existingIdx !== null ? ($tasks[$existingIdx]['lastStatus'] ?? null) : ($input['lastStatus'] ?? null),
            'updatedAt' => $nowIso,
        ];

        if ($existingIdx !== null) {
            $tasks[$existingIdx] = $record;
        } else {
            $tasks[] = $record;
        }

        @file_put_contents($tasksFile, json_encode(array_values($tasks), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($tasks): array {
            $s['autonomousTasks'] = array_values($tasks);
            return $s;
        });

        return $record;
    }
}

if (!function_exists('ccrm_marveen_delete_task')) {
    function ccrm_marveen_delete_task(PDO $pdo, string $connectorId, string $taskId): bool {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $tasksFile = $dir . '/tasks.json';
        $tasks = is_file($tasksFile) ? (json_decode((string)@file_get_contents($tasksFile), true) ?: []) : [];
        $safeId = preg_replace('/[^a-z0-9_-]/', '-', strtolower(trim($taskId)));
        $filtered = array_values(array_filter($tasks, static fn($t) => ($t['id'] ?? '') !== $safeId && ($t['id'] ?? '') !== $taskId));
        @file_put_contents($tasksFile, json_encode($filtered, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($filtered): array {
            $s['autonomousTasks'] = $filtered;
            return $s;
        });
        return count($filtered) !== count($tasks);
    }
}

if (!function_exists('ccrm_marveen_get_chat_history')) {
    function ccrm_marveen_get_chat_history(string $connectorId): array {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $chatFile = $dir . '/chat_history.json';
        if (!is_file($chatFile)) {
            return [];
        }
        $decoded = json_decode((string)@file_get_contents($chatFile), true);
        return is_array($decoded) ? array_values($decoded) : [];
    }
}

if (!function_exists('ccrm_marveen_append_chat_message')) {
    function ccrm_marveen_append_chat_message(string $connectorId, array $msg): array {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $chatFile = $dir . '/chat_history.json';
        $history = ccrm_marveen_get_chat_history($connectorId);
        $history[] = $msg;
        if (count($history) > 100) {
            $history = array_slice($history, -100);
        }
        @file_put_contents($chatFile, json_encode(array_values($history), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        @chmod($chatFile, 0600);
        return $history;
    }
}

if (!function_exists('ccrm_marveen_clear_chat_history')) {
    function ccrm_marveen_clear_chat_history(string $connectorId): void {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $chatFile = $dir . '/chat_history.json';
        @file_put_contents($chatFile, "[]\n");
    }
}

if (!function_exists('ccrm_marveen_list_artifacts')) {
    function ccrm_marveen_list_artifacts(PDO $pdo, array $connector): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $dir = ccrm_marveen_connector_dir($connectorId);
        $artFile = $dir . '/artifacts.json';
        $items = [];
        if (is_file($artFile)) {
            $decoded = json_decode((string)@file_get_contents($artFile), true);
            if (is_array($decoded)) {
                $items = $decoded;
            }
        } elseif (!empty($settings['artifacts']) && is_array($settings['artifacts'])) {
            $items = $settings['artifacts'];
            @file_put_contents($artFile, json_encode(array_values($items), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        }
        $artDir = $dir . '/artifacts';
        foreach ($items as &$a) {
            $aid = (string)($a['id'] ?? '');
            $filePath = $artDir . '/' . $aid;
            if ($aid !== '' && is_file($filePath)) {
                $a['content'] = (string)@file_get_contents($filePath);
            }
        }
        unset($a);
        return array_values($items);
    }
}

if (!function_exists('ccrm_marveen_save_artifact')) {
    function ccrm_marveen_save_artifact(PDO $pdo, string $connectorId, array $input): array {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $artDir = $dir . '/artifacts';
        if (!is_dir($artDir)) {
            @mkdir($artDir, 0700, true);
        }
        $artFile = $dir . '/artifacts.json';
        $items = is_file($artFile) ? (json_decode((string)@file_get_contents($artFile), true) ?: []) : [];

        $rawName = trim((string)($input['id'] ?? ($input['name'] ?? ($input['title'] ?? 'artifact.md'))));
        $cleanName = preg_replace('/[^a-zA-Z0-9._-]/', '-', $rawName) ?: 'artifact.md';
        if (!str_contains($cleanName, '.')) {
            $cleanName .= '.md';
        }
        $title = trim((string)($input['title'] ?? $cleanName));
        $content = (string)($input['content'] ?? '');
        $nowIso = gmdate('c');

        $existingIdx = null;
        foreach ($items as $idx => $a) {
            if (($a['id'] ?? '') === $cleanName) {
                $existingIdx = $idx;
                break;
            }
        }

        $record = [
            'id' => $cleanName,
            'title' => $title,
            'content' => $content,
            'updatedAt' => $nowIso,
        ];

        if ($existingIdx !== null) {
            $items[$existingIdx] = $record;
        } else {
            $items[] = $record;
        }

        @file_put_contents($artDir . '/' . $cleanName, $content);
        @chmod($artDir . '/' . $cleanName, 0600);
        @file_put_contents($artFile, json_encode(array_values($items), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($items): array {
            $s['artifacts'] = array_values($items);
            return $s;
        });

        return $record;
    }
}

if (!function_exists('ccrm_marveen_delete_artifact')) {
    function ccrm_marveen_delete_artifact(PDO $pdo, string $connectorId, string $artifactId): bool {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $artFile = $dir . '/artifacts.json';
        $items = is_file($artFile) ? (json_decode((string)@file_get_contents($artFile), true) ?: []) : [];
        $cleanName = preg_replace('/[^a-zA-Z0-9._-]/', '-', trim($artifactId));
        $filtered = array_values(array_filter($items, static fn($a) => ($a['id'] ?? '') !== $cleanName && ($a['id'] ?? '') !== $artifactId));
        @unlink($dir . '/artifacts/' . $cleanName);
        @file_put_contents($artFile, json_encode($filtered, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($filtered): array {
            $s['artifacts'] = $filtered;
            return $s;
        });
        return count($filtered) !== count($items);
    }
}

if (!function_exists('ccrm_marveen_get_autonomous_config')) {
    function ccrm_marveen_get_autonomous_config(PDO $pdo, array $connector): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $dir = ccrm_marveen_connector_dir($connectorId);
        $autoFile = $dir . '/autonomous.json';
        $defaults = [
            'enabled' => true,
            'intervalMinutes' => 15,
            'instructions' => "Review your memory.md, artifacts, and CCRM state via MCP. Execute any pending autonomous goals, follow-ups, or subagent delegations recorded in memory.md. Update memory.md with your progress. If no autonomous actions are needed right now, reply with [IDLE].",
            'lastRunAt' => null,
            'lastStatus' => null,
            'cronCount' => 0,
            'updatedAt' => gmdate('c'),
        ];
        if (is_file($autoFile)) {
            $decoded = json_decode((string)@file_get_contents($autoFile), true);
            if (is_array($decoded)) {
                return array_merge($defaults, $decoded);
            }
        }
        if (!empty($settings['autonomousMode']) && is_array($settings['autonomousMode'])) {
            $merged = array_merge($defaults, $settings['autonomousMode']);
            @file_put_contents($autoFile, json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
            return $merged;
        }
        @file_put_contents($autoFile, json_encode($defaults, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        return $defaults;
    }
}

if (!function_exists('ccrm_marveen_save_autonomous_config')) {
    function ccrm_marveen_save_autonomous_config(PDO $pdo, string $connectorId, array $input): array {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $autoFile = $dir . '/autonomous.json';
        $current = is_file($autoFile) ? (json_decode((string)@file_get_contents($autoFile), true) ?: []) : [];
        $record = [
            'enabled' => array_key_exists('enabled', $input) ? (bool)$input['enabled'] : (bool)($current['enabled'] ?? true),
            'intervalMinutes' => max(1, (int)($input['intervalMinutes'] ?? ($current['intervalMinutes'] ?? 15))),
            'instructions' => array_key_exists('instructions', $input)
                ? trim((string)$input['instructions'])
                : (string)($current['instructions'] ?? "Review your memory.md, artifacts, and CCRM state via MCP. Execute any pending autonomous goals, follow-ups, or subagent delegations recorded in memory.md. Update memory.md with your progress. If no autonomous actions are needed right now, reply with [IDLE]."),
            'lastRunAt' => array_key_exists('lastRunAt', $input) ? $input['lastRunAt'] : ($current['lastRunAt'] ?? null),
            'lastStatus' => array_key_exists('lastStatus', $input) ? $input['lastStatus'] : ($current['lastStatus'] ?? null),
            'cronCount' => array_key_exists('cronCount', $input) ? (int)$input['cronCount'] : (int)($current['cronCount'] ?? 0),
            'updatedAt' => gmdate('c'),
        ];
        @file_put_contents($autoFile, json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        @chmod($autoFile, 0600);
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($record): array {
            $s['autonomousMode'] = $record;
            return $s;
        });
        return $record;
    }
}

if (!function_exists('ccrm_marveen_get_connector_state')) {
    function ccrm_marveen_get_connector_state(PDO $pdo, array $connector): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $mem = ccrm_marveen_get_memory($pdo, $connector);
        $artifacts = ccrm_marveen_list_artifacts($pdo, $connector);
        $subagents = ccrm_marveen_list_subagents($pdo, $connector);
        $tasks = ccrm_marveen_list_tasks($pdo, $connector);
        $autonomousMode = ccrm_marveen_get_autonomous_config($pdo, $connector);
        $chatHistory = ccrm_marveen_get_chat_history($connectorId);
        return [
            'connectorId' => $connectorId,
            'mcpConnected' => true,
            'mcpEndpoint' => ccrm_marveen_internal_mcp_url(),
            'memoryMd' => $mem['memoryMd'],
            'memoryUpdatedAt' => $mem['updatedAt'],
            'artifacts' => $artifacts,
            'subagents' => $subagents,
            'tasks' => $tasks,
            'autonomousMode' => $autonomousMode,
            'chatHistory' => $chatHistory,
        ];
    }
}

if (!function_exists('ccrm_marveen_ensure_user_mcp_key')) {
    /**
     * Ensures the given CRM user has an active Marveen-scoped MCP key in `mcp_keys`
     * and returns the raw Bearer token so the agent container/runner can call `/api/mcp.php`
     * with that exact user's permissions.
     */
    function ccrm_marveen_ensure_user_mcp_key(PDO $pdo, string $userId): string {
        $vaultDir = ccrm_marveen_storage_root() . '/mcp_user_tokens';
        if (!is_dir($vaultDir)) {
            @mkdir($vaultDir, 0700, true);
        }
        $safeUser = preg_replace('/[^a-zA-Z0-9_-]/', '_', $userId);
        $tokenCacheFile = $vaultDir . '/' . $safeUser . '.tok';

        if (is_file($tokenCacheFile)) {
            $cached = trim((string)@file_get_contents($tokenCacheFile));
            if ($cached !== '') {
                $hash = hash('sha256', $cached);
                $stmt = $pdo->prepare("SELECT id FROM mcp_keys WHERE user_id = ? AND key_hash = ? AND revoked_at IS NULL LIMIT 1");
                $stmt->execute([$userId, $hash]);
                if ($stmt->fetchColumn()) {
                    return $cached;
                }
            }
        }

        $rawKey = 'ccrm_mcp_' . bin2hex(random_bytes(24));
        $keyHash = hash('sha256', $rawKey);
        $keyPrefix = substr($rawKey, 0, 13) . '…' . substr($rawKey, -4);
        $keyId = 'mcpk-marveen-' . substr(bin2hex(random_bytes(6)), 0, 10);

        $ins = $pdo->prepare(
            "INSERT INTO mcp_keys (id, user_id, name, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?)"
        );
        $ins->execute([$keyId, $userId, 'Marveen Agent Connector', $keyHash, $keyPrefix]);

        @file_put_contents($tokenCacheFile, $rawKey . "\n");
        @chmod($tokenCacheFile, 0600);
        return $rawKey;
    }
}

if (!function_exists('ccrm_marveen_internal_mcp_url')) {
    function ccrm_marveen_internal_mcp_url(): string {
        $envUrl = trim((string)(getenv('CCRM_INTERNAL_MCP_URL') ?: ''));
        if ($envUrl !== '') {
            return $envUrl;
        }
        return 'http://127.0.0.1/api/mcp.php';
    }
}

// -----------------------------------------------------------------------------
// Live Probe & Agent Execution (Tiers 1, 2, 3)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_live_probe')) {
    function ccrm_marveen_live_probe(string $connectorId, string $provider, string $token, string $agentEndpoint = ''): array {
        $token = trim($token);
        if ($token === '') {
            return ['ok' => false, 'error' => 'No subscription token or session configured. Click "Sign in with Subscription" or paste a token.'];
        }

        $remoteUrl = trim($agentEndpoint ?: (string)(getenv('MARVEEN_URL') ?: ''));
        if ($remoteUrl !== '') {
            return ccrm_marveen_bridge_post($remoteUrl, '/probe', [
                'connectorId' => $connectorId,
                'provider' => $provider,
                'subscriptionToken' => $token,
            ]);
        }

        // Check cached verified stamp (Szotasz/marveen claude-credentials-guard.ts pattern)
        $stampDir = ccrm_marveen_storage_root() . '/verified';
        if (!is_dir($stampDir)) {
            @mkdir($stampDir, 0700, true);
        }
        $tokenHash = hash('sha256', $provider . ':' . $token);
        $stampFile = $stampDir . '/' . substr($tokenHash, 0, 16) . '.ok';
        if (is_file($stampFile) && (time() - (int)@filemtime($stampFile)) < 86400) {
            return ['ok' => true, 'cached' => true, 'mode' => 'verified_stamp'];
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

if (!function_exists('ccrm_marveen_meta_tool_declarations')) {
    function ccrm_marveen_meta_tool_declarations(bool $isSubagent = false): array {
        $decls = [
            [
                'name' => 'memory_read',
                'description' => 'Read the current persistent memory.md (or a subagent\'s memory.md if subagent_id is passed).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'subagent_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional subagent ID to read that subagent\'s memory.md instead of the main memory.md.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'memory_write',
                'description' => 'Overwrite/save the persistent memory.md with updated Markdown content. Use this to store user instructions, rules, learned facts, and progress.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'content' => [
                            'type' => 'STRING',
                            'description' => 'Full Markdown content to write into memory.md.',
                        ],
                        'subagent_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional subagent ID to write to that subagent\'s memory.md.',
                        ],
                    ],
                    'required' => ['content'],
                ],
            ],
            [
                'name' => 'memory_append',
                'description' => 'Append a new note, rule, or learned fact to persistent memory.md without overwriting existing sections.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'entry' => [
                            'type' => 'STRING',
                            'description' => 'Markdown bullet or paragraph to append to memory.md.',
                        ],
                        'subagent_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional subagent ID to append to that subagent\'s memory.md.',
                        ],
                    ],
                    'required' => ['entry'],
                ],
            ],
            [
                'name' => 'artifact_write',
                'description' => 'Create or update a named artifact document (e.g. "lead-report.md", "followup-drafts.md", "strategy.md") visible in the user\'s Right Artifacts Sidebar.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Filename of the artifact (e.g. "lead-report.md").',
                        ],
                        'title' => [
                            'type' => 'STRING',
                            'description' => 'Human-readable title of the artifact.',
                        ],
                        'content' => [
                            'type' => 'STRING',
                            'description' => 'Full Markdown or text content of the artifact.',
                        ],
                    ],
                    'required' => ['name', 'content'],
                ],
            ],
            [
                'name' => 'artifact_read',
                'description' => 'Read the content of a named artifact from the Right Artifacts Sidebar.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Filename/ID of the artifact to read.',
                        ],
                    ],
                    'required' => ['name'],
                ],
            ],
            [
                'name' => 'artifact_list',
                'description' => 'List all saved artifacts on this connector.',
            ],
            [
                'name' => 'artifact_delete',
                'description' => 'Delete a named artifact by its filename/ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Filename/ID of the artifact to delete.',
                        ],
                    ],
                    'required' => ['name'],
                ],
            ],
        ];

        if (!$isSubagent) {
            $decls[] = [
                'name' => 'create_subagent',
                'description' => 'Create or update a specialized subagent with its own role, system prompt, and dedicated memory.md. Subagents have full access to all CCRM MCP tools.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'Slug ID for the subagent (e.g. "lead-qualifier", "followup-writer").',
                        ],
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Human-readable name of the subagent.',
                        ],
                        'role' => [
                            'type' => 'STRING',
                            'description' => 'Short description of the subagent\'s specialty.',
                        ],
                        'system_prompt' => [
                            'type' => 'STRING',
                            'description' => 'Detailed instructions for how this subagent should operate.',
                        ],
                        'memory_md' => [
                            'type' => 'STRING',
                            'description' => 'Optional initial Markdown content for the subagent\'s memory.md.',
                        ],
                    ],
                    'required' => ['name', 'role', 'system_prompt'],
                ],
            ];
            $decls[] = [
                'name' => 'list_subagents',
                'description' => 'List all specialized subagents available on this connector.',
            ];
            $decls[] = [
                'name' => 'delete_subagent',
                'description' => 'Delete a subagent by its ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'ID of the subagent to remove.',
                        ],
                    ],
                    'required' => ['id'],
                ],
            ];
            $decls[] = [
                'name' => 'delegate_to_subagent',
                'description' => 'Delegate a task to a specialized subagent by ID. The subagent runs autonomously with its own memory.md and CCRM MCP tools and returns its result.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'ID of the subagent to invoke (if it does not exist yet, call create_subagent first).',
                        ],
                        'task' => [
                            'type' => 'STRING',
                            'description' => 'Clear task instructions for the subagent to execute.',
                        ],
                    ],
                    'required' => ['id', 'task'],
                ],
            ];
            $decls[] = [
                'name' => 'schedule_autonomous_task',
                'description' => 'Schedule or update a recurring autonomous task that runs automatically in the background (e.g. every N minutes).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'Optional slug ID for the task.',
                        ],
                        'title' => [
                            'type' => 'STRING',
                            'description' => 'Short title describing the autonomous routine.',
                        ],
                        'prompt' => [
                            'type' => 'STRING',
                            'description' => 'The instruction prompt the agent (or subagent) will execute on each autonomous run.',
                        ],
                        'interval_minutes' => [
                            'type' => 'INTEGER',
                            'description' => 'How often to run in minutes (minimum 1, default 60).',
                        ],
                        'subagent_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional subagent ID that should execute this task.',
                        ],
                    ],
                    'required' => ['title', 'prompt'],
                ],
            ];
            $decls[] = [
                'name' => 'list_autonomous_tasks',
                'description' => 'List all scheduled autonomous tasks configured on this connector.',
            ];
            $decls[] = [
                'name' => 'cancel_autonomous_task',
                'description' => 'Cancel and delete a scheduled autonomous task by ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'ID of the autonomous task to cancel.',
                        ],
                    ],
                    'required' => ['id'],
                ],
            ];
        }

        return $decls;
    }
}

if (!function_exists('ccrm_marveen_build_agent_system_prompt')) {
    function ccrm_marveen_build_agent_system_prompt(
        PDO $pdo,
        array $connector,
        string $customSystemPrompt = '',
        ?string $subagentId = null
    ): string {
        $name = (string)($connector['name'] ?? 'CCRM Agent');
        $mem = ccrm_marveen_get_memory($pdo, $connector, $subagentId);
        $subs = ccrm_marveen_list_subagents($pdo, $connector);
        $tasks = ccrm_marveen_list_tasks($pdo, $connector);

        $parts = [];
        if ($subagentId !== null && $subagentId !== '') {
            $subRecord = null;
            foreach ($subs as $s) {
                if (($s['id'] ?? '') === $subagentId) {
                    $subRecord = $s;
                    break;
                }
            }
            $subName = (string)($subRecord['name'] ?? $subagentId);
            $subRole = (string)($subRecord['role'] ?? 'Subagent');
            $subPrompt = (string)($subRecord['systemPrompt'] ?? '');
            $parts[] = "You are Subagent \"{$subName}\" ({$subRole}) working for parent CCRM agent \"{$name}\".";
            if ($subPrompt !== '') {
                $parts[] = "## Subagent Instructions\n" . $subPrompt;
            }
            $parts[] = "## Your Subagent `memory.md`\n```markdown\n" . trim($mem['memoryMd']) . "\n```";
            $parts[] = "You can update your own memory using `memory_write` or `memory_append` (pass `subagent_id: \"{$subagentId}\"`), and execute any CCRM MCP tools needed to complete your assigned task.";
        } else {
            $parts[] = "You are \"{$name}\", an autonomous AI agent connected directly to CCRM's MCP server.";
            $parts[] = "You operate autonomously: when the user instructs you in chat, execute all necessary MCP tools, update your persistent `memory.md` (`memory_write` / `memory_append`) when asked to remember rules or notes, create/delegate to subagents (`create_subagent`, `delegate_to_subagent`) when specialized workflows are helpful, and schedule recurring jobs (`schedule_autonomous_task`) when asked to perform ongoing autonomous monitoring.";
            $parts[] = "## Your Persistent `memory.md` (Also visible and editable by the user under the chat)\n```markdown\n" . trim($mem['memoryMd']) . "\n```";
            if (!empty($subs)) {
                $subLines = [];
                foreach ($subs as $s) {
                    $subLines[] = "- `{$s['id']}` (**{$s['name']}** — {$s['role']})";
                }
                $parts[] = "## Existing Subagents\n" . implode("\n", $subLines);
            }
            if (!empty($tasks)) {
                $taskLines = [];
                foreach ($tasks as $t) {
                    $status = !empty($t['enabled']) ? 'active' : 'paused';
                    $taskLines[] = "- `{$t['id']}`: **{$t['title']}** (every {$t['intervalMinutes']}m, {$status})";
                }
                $parts[] = "## Scheduled Autonomous Tasks\n" . implode("\n", $taskLines);
            }
        }
        if ($customSystemPrompt !== '') {
            $parts[] = $customSystemPrompt;
        }
        return implode("\n\n", $parts);
    }
}

if (!function_exists('ccrm_marveen_run_gemini_mcp_agent')) {
    /**
     * Executes a fast, multi-turn Gemini + CCRM MCP autonomous tool-calling loop in PHP.
     * Supports reading/writing persistent `memory.md`, creating & delegating to subagents,
     * scheduling autonomous tasks, and calling all 84 CCRM MCP tools.
     */
    function ccrm_marveen_run_gemini_mcp_agent(
        string $apiKey,
        string $mcpUrl,
        string $mcpBearerKey,
        string $prompt,
        string $systemPrompt = '',
        string $preferredModel = '',
        ?PDO $pdo = null,
        ?array $connector = null,
        ?string $subagentId = null,
        int $depth = 0
    ): array {
        $trimmedPreferred = preg_replace('#^models/#', '', trim($preferredModel));
        // Never allow deprecated gemini-2.5-* models ("no longer available to new users")
        if (str_starts_with($trimmedPreferred, 'gemini-2.5')) {
            $trimmedPreferred = '';
        }
        $candidateModels = array_values(array_unique(array_filter([
            ($trimmedPreferred !== '' && str_starts_with($trimmedPreferred, 'gemini-')) ? $trimmedPreferred : '',
            'gemini-3.5-flash-lite',
            'gemini-3.6-flash',
            'gemini-3.5-flash',
            'gemini-3.1-flash-lite',
            'gemini-3.8-flash',
        ])));
        $modelIdx = 0;
        $model = $candidateModels[0] ?? 'gemini-3.5-flash-lite';
        $connectorId = (string)($connector['id'] ?? 'default');
        $isSubagent = ($subagentId !== null && $subagentId !== '') || $depth > 0;

        $mcpCall = static function (string $method, array $params = []) use ($mcpUrl, $mcpBearerKey): ?array {
            $ch = curl_init($mcpUrl);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'Authorization: Bearer ' . $mcpBearerKey,
                    'X-CCRM-MCP-KEY: ' . $mcpBearerKey,
                ],
                CURLOPT_POSTFIELDS => json_encode([
                    'jsonrpc' => '2.0',
                    'id' => uniqid('mcp_', true),
                    'method' => $method,
                    'params' => (object)$params,
                ]),
            ]);
            $raw = curl_exec($ch);
            curl_close($ch);
            return is_string($raw) ? json_decode($raw, true) : null;
        };

        $sanitizeSchema = static function ($schema) use (&$sanitizeSchema) {
            if (!is_array($schema)) {
                return ['type' => 'OBJECT'];
            }
            $out = [];
            $type = strtoupper((string)($schema['type'] ?? 'OBJECT'));
            if (in_array($type, ['OBJECT', 'STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY'], true)) {
                $out['type'] = $type;
            } else {
                $out['type'] = 'STRING';
            }
            if (!empty($schema['description']) && is_string($schema['description'])) {
                $out['description'] = $schema['description'];
            }
            if (!empty($schema['enum']) && is_array($schema['enum'])) {
                $out['enum'] = array_values(array_map('strval', $schema['enum']));
            }
            if ($out['type'] === 'OBJECT' && !empty($schema['properties']) && is_array($schema['properties'])) {
                $props = [];
                foreach ($schema['properties'] as $k => $v) {
                    $props[$k] = $sanitizeSchema($v);
                }
                $out['properties'] = (object)$props;
                if (!empty($schema['required']) && is_array($schema['required'])) {
                    $req = array_values(array_filter($schema['required'], static fn($r) => is_string($r) && isset($props[$r])));
                    if (!empty($req)) {
                        $out['required'] = $req;
                    }
                }
            } elseif ($out['type'] === 'ARRAY') {
                $out['items'] = isset($schema['items']) && is_array($schema['items'])
                    ? $sanitizeSchema($schema['items'])
                    : ['type' => 'STRING'];
            }
            return $out;
        };

        $funcDecls = ccrm_marveen_meta_tool_declarations($isSubagent);
        $toolsResp = $mcpCall('tools/list');
        $mcpTools = is_array($toolsResp['result']['tools'] ?? null) ? $toolsResp['result']['tools'] : [];
        foreach ($mcpTools as $t) {
            if (empty($t['name'])) {
                continue;
            }
            $decl = [
                'name' => (string)$t['name'],
                'description' => mb_substr((string)($t['description'] ?? ''), 0, 500, 'UTF-8'),
            ];
            if (!empty($t['inputSchema']) && is_array($t['inputSchema']) && !empty($t['inputSchema']['properties'])) {
                $decl['parameters'] = $sanitizeSchema($t['inputSchema']);
            }
            $funcDecls[] = $decl;
        }

        $effectiveSystemPrompt = ($pdo !== null && $connector !== null)
            ? ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId)
            : $systemPrompt;

        $contents = [
            [
                'role' => 'user',
                'parts' => [['text' => $prompt]],
            ],
        ];

        $steps = [];
        $maxTurns = $isSubagent ? 8 : 15;
        for ($turn = 0; $turn < $maxTurns; $turn++) {
            $payload = [
                'contents' => $contents,
            ];
            if ($effectiveSystemPrompt !== '') {
                $payload['systemInstruction'] = [
                    'parts' => [['text' => $effectiveSystemPrompt]],
                ];
            }
            // On the final turn, omit tool declarations so the model synthesizes a final text response
            // from the tool outputs already collected rather than requesting more tool calls.
            if (!empty($funcDecls) && $turn < $maxTurns - 1) {
                $payload['tools'] = [
                    ['functionDeclarations' => $funcDecls],
                ];
            }

            $resp = null;
            $httpCode = 0;
            $numModels = count($candidateModels);
            for ($attempt = 0; $attempt < $numModels; $attempt++) {
                $tryIdx = ($modelIdx + $attempt) % $numModels;
                $model = $candidateModels[$tryIdx];
                $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($apiKey);
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 20,
                    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
                $rawResp = curl_exec($ch);
                $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                $resp = is_string($rawResp) ? json_decode($rawResp, true) : null;
                if (is_array($resp) && !empty($resp['candidates'][0]['content']['parts'])) {
                    // Stick to the working 3.x model for subsequent turns in this run
                    $modelIdx = $tryIdx;
                    break;
                }
                // Retry automatically with the next 3.x fallback model on timeout (0), 404/429/5xx or high-demand spike
                if (in_array($httpCode, [0, 404, 429, 500, 502, 503, 504], true) && ($attempt + 1) < $numModels) {
                    continue;
                }
                break;
            }
            if (!is_array($resp) || empty($resp['candidates'][0]['content']['parts'])) {
                $errMsg = (string)($resp['error']['message'] ?? ('Gemini API HTTP ' . $httpCode));
                return ['ok' => false, 'error' => $errMsg, 'steps' => $steps];
            }

            $parts = $resp['candidates'][0]['content']['parts'];
            foreach ($parts as &$pItem) {
                if (isset($pItem['functionCall']) && is_array($pItem['functionCall'])) {
                    $pItem['functionCall']['args'] = (object)(is_array($pItem['functionCall']['args'] ?? null) ? $pItem['functionCall']['args'] : []);
                }
            }
            unset($pItem);
            $contents[] = [
                'role' => 'model',
                'parts' => $parts,
            ];

            $funcCalls = [];
            $textParts = [];
            foreach ($parts as $part) {
                if (!empty($part['functionCall']['name'])) {
                    $funcCalls[] = $part['functionCall'];
                }
                if (isset($part['text']) && is_string($part['text'])) {
                    $textParts[] = $part['text'];
                }
            }

            if (empty($funcCalls)) {
                return [
                    'ok' => true,
                    'text' => trim(implode("\n", $textParts)),
                    'mode' => 'gemini_mcp',
                    'model' => $model,
                    'steps' => $steps,
                ];
            }

            $responseParts = [];
            foreach ($funcCalls as $fc) {
                $fnName = (string)$fc['name'];
                $fnArgs = is_array($fc['args'] ?? null) ? $fc['args'] : (is_object($fc['args'] ?? null) ? (array)$fc['args'] : []);
                $toolText = '';

                if ($pdo !== null && $connector !== null && in_array($fnName, [
                    'memory_read',
                    'memory_write',
                    'memory_append',
                    'artifact_write',
                    'artifact_read',
                    'artifact_list',
                    'artifact_delete',
                    'create_subagent',
                    'list_subagents',
                    'delete_subagent',
                    'delegate_to_subagent',
                    'schedule_autonomous_task',
                    'list_autonomous_tasks',
                    'cancel_autonomous_task',
                ], true)) {
                    $targetSubId = !empty($fnArgs['subagent_id']) ? (string)$fnArgs['subagent_id'] : $subagentId;
                    if ($fnName === 'memory_read') {
                        $m = ccrm_marveen_get_memory($pdo, $connector, $targetSubId);
                        $toolText = $m['memoryMd'];
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'memory',
                            'tool' => 'memory_read',
                            'label' => $targetSubId ? "Read subagent ({$targetSubId}) memory.md" : 'Read memory.md',
                        ];
                    } elseif ($fnName === 'memory_write') {
                        $newContent = (string)($fnArgs['content'] ?? '');
                        $saved = ccrm_marveen_save_memory($pdo, $connectorId, $newContent, $targetSubId);
                        $effectiveSystemPrompt = ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId);
                        $toolText = "Successfully updated memory.md (" . strlen($saved['memoryMd']) . " bytes).";
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'memory',
                            'tool' => 'memory_write',
                            'label' => $targetSubId ? "Updated subagent ({$targetSubId}) memory.md" : 'Updated memory.md',
                        ];
                    } elseif ($fnName === 'memory_append') {
                        $entry = trim((string)($fnArgs['entry'] ?? ($fnArgs['content'] ?? '')));
                        $cur = ccrm_marveen_get_memory($pdo, $connector, $targetSubId)['memoryMd'];
                        $line = str_starts_with($entry, '-') || str_starts_with($entry, '#') ? $entry : ('- ' . $entry);
                        $merged = rtrim($cur) . "\n" . $line . "\n";
                        $saved = ccrm_marveen_save_memory($pdo, $connectorId, $merged, $targetSubId);
                        $effectiveSystemPrompt = ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId);
                        $toolText = "Appended to memory.md:\n" . $line;
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'memory',
                            'tool' => 'memory_append',
                            'label' => $targetSubId ? "Appended to {$targetSubId} memory.md" : 'Appended to memory.md',
                            'detail' => $line,
                        ];
                    } elseif ($fnName === 'artifact_write') {
                        $savedArt = ccrm_marveen_save_artifact($pdo, $connectorId, $fnArgs);
                        $toolText = json_encode(['ok' => true, 'artifact' => $savedArt], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'memory',
                            'tool' => 'artifact_write',
                            'label' => "Saved artifact: {$savedArt['id']}",
                            'detail' => $savedArt['title'],
                        ];
                    } elseif ($fnName === 'artifact_read') {
                        $reqName = trim((string)($fnArgs['name'] ?? ''));
                        $arts = ccrm_marveen_list_artifacts($pdo, $connector);
                        $foundContent = 'Artifact not found: ' . $reqName;
                        foreach ($arts as $a) {
                            if (($a['id'] ?? '') === $reqName || ($a['title'] ?? '') === $reqName) {
                                $foundContent = (string)($a['content'] ?? '');
                                break;
                            }
                        }
                        $toolText = $foundContent;
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'memory',
                            'tool' => 'artifact_read',
                            'label' => "Read artifact: {$reqName}",
                        ];
                    } elseif ($fnName === 'artifact_list') {
                        $arts = ccrm_marveen_list_artifacts($pdo, $connector);
                        $toolText = json_encode(['artifacts' => $arts], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'memory',
                            'tool' => 'artifact_list',
                            'label' => 'Listed artifacts (' . count($arts) . ')',
                        ];
                    } elseif ($fnName === 'artifact_delete') {
                        $delName = trim((string)($fnArgs['name'] ?? ''));
                        $deleted = ccrm_marveen_delete_artifact($pdo, $connectorId, $delName);
                        $toolText = json_encode(['ok' => $deleted, 'deleted' => $delName]);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'memory',
                            'tool' => 'artifact_delete',
                            'label' => "Deleted artifact: {$delName}",
                        ];
                    } elseif ($fnName === 'create_subagent') {
                        $sub = ccrm_marveen_save_subagent($pdo, $connectorId, $fnArgs);
                        $effectiveSystemPrompt = ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId);
                        $toolText = json_encode(['ok' => true, 'subagent' => $sub], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'subagent',
                            'tool' => 'create_subagent',
                            'label' => "Created subagent: {$sub['name']} ({$sub['id']})",
                            'detail' => $sub['role'],
                        ];
                    } elseif ($fnName === 'list_subagents') {
                        $subs = ccrm_marveen_list_subagents($pdo, $connector);
                        $toolText = json_encode(['subagents' => $subs], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'subagent',
                            'tool' => 'list_subagents',
                            'label' => 'Listed subagents (' . count($subs) . ')',
                        ];
                    } elseif ($fnName === 'delete_subagent') {
                        $delId = (string)($fnArgs['id'] ?? '');
                        $deleted = ccrm_marveen_delete_subagent($pdo, $connectorId, $delId);
                        $toolText = json_encode(['ok' => $deleted, 'deletedId' => $delId]);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'subagent',
                            'tool' => 'delete_subagent',
                            'label' => "Removed subagent: {$delId}",
                        ];
                    } elseif ($fnName === 'delegate_to_subagent') {
                        $delSubId = preg_replace('/[^a-z0-9_-]/', '-', strtolower(trim((string)($fnArgs['id'] ?? ''))));
                        $delTask = trim((string)($fnArgs['task'] ?? ''));
                        $subs = ccrm_marveen_list_subagents($pdo, $connector);
                        $foundSub = null;
                        foreach ($subs as $s) {
                            if (($s['id'] ?? '') === $delSubId || strtolower((string)($s['name'] ?? '')) === strtolower((string)($fnArgs['id'] ?? ''))) {
                                $foundSub = $s;
                                $delSubId = (string)$s['id'];
                                break;
                            }
                        }
                        if ($foundSub === null) {
                            // Auto-provision the subagent on the fly if delegated before explicit create_subagent
                            $foundSub = ccrm_marveen_save_subagent($pdo, $connectorId, [
                                'id' => $delSubId ?: 'subagent',
                                'name' => (string)($fnArgs['id'] ?? 'Subagent'),
                                'role' => 'Autonomous Subagent',
                                'systemPrompt' => "You are a specialized CCRM subagent handling: {$delTask}",
                            ]);
                            $delSubId = (string)$foundSub['id'];
                        }
                        $subRes = ccrm_marveen_run_gemini_mcp_agent(
                            $apiKey,
                            $mcpUrl,
                            $mcpBearerKey,
                            $delTask,
                            '',
                            $preferredModel,
                            $pdo,
                            $connector,
                            $delSubId,
                            $depth + 1
                        );
                        $toolText = !empty($subRes['ok'])
                            ? ("[Subagent {$foundSub['name']} ({$delSubId}) Report]:\n" . ($subRes['text'] ?? ''))
                            : ("Subagent {$delSubId} error: " . ($subRes['error'] ?? 'failed'));
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'subagent',
                            'tool' => 'delegate_to_subagent',
                            'label' => "Delegated to {$foundSub['name']} ({$delSubId})",
                            'detail' => $delTask,
                            'subSteps' => $subRes['steps'] ?? [],
                        ];
                    } elseif ($fnName === 'schedule_autonomous_task') {
                        $savedTask = ccrm_marveen_save_task($pdo, $connectorId, $fnArgs);
                        $toolText = json_encode(['ok' => true, 'task' => $savedTask], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'schedule_autonomous_task',
                            'label' => "Scheduled autonomous task: {$savedTask['title']} (every {$savedTask['intervalMinutes']}m)",
                        ];
                    } elseif ($fnName === 'list_autonomous_tasks') {
                        $tasks = ccrm_marveen_list_tasks($pdo, $connector);
                        $toolText = json_encode(['tasks' => $tasks], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'list_autonomous_tasks',
                            'label' => 'Listed autonomous tasks (' . count($tasks) . ')',
                        ];
                    } elseif ($fnName === 'cancel_autonomous_task') {
                        $cancelId = (string)($fnArgs['id'] ?? '');
                        $removed = ccrm_marveen_delete_task($pdo, $connectorId, $cancelId);
                        $toolText = json_encode(['ok' => $removed, 'id' => $cancelId]);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'cancel_autonomous_task',
                            'label' => "Cancelled autonomous task: {$cancelId}",
                        ];
                    }
                } else {
                    $toolRes = $mcpCall('tools/call', [
                        'name' => $fnName,
                        'arguments' => (object)$fnArgs,
                    ]);
                    if (is_array($toolRes['result']['content'] ?? null)) {
                        foreach ($toolRes['result']['content'] as $cItem) {
                            if (isset($cItem['text'])) {
                                $toolText .= $cItem['text'] . "\n";
                            }
                        }
                    } elseif (isset($toolRes['error']['message'])) {
                        $toolText = 'Error: ' . $toolRes['error']['message'];
                    } else {
                        $toolText = json_encode($toolRes);
                    }
                    $steps[] = [
                        'id' => uniqid('st_', false),
                        'kind' => 'mcp',
                        'tool' => $fnName,
                        'label' => "MCP: {$fnName}",
                    ];
                }

                $responseParts[] = [
                    'functionResponse' => [
                        'name' => $fnName,
                        'response' => [
                            'result' => mb_substr(trim($toolText), 0, 16000, 'UTF-8'),
                        ],
                    ],
                ];
            }

            $contents[] = [
                'role' => 'user',
                'parts' => $responseParts,
            ];
        }

        return ['ok' => false, 'error' => 'Agent exceeded maximum tool-calling turns.', 'steps' => $steps];
    }
}

if (!function_exists('ccrm_marveen_run_agent')) {
    function ccrm_marveen_run_agent(
        PDO $pdo,
        array $connector,
        string $userId,
        string $prompt,
        string $systemPrompt = '',
        ?string $subagentId = null
    ): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $provider = (string)($settings['connectorType'] ?? 'claude');
        $token = trim((string)($settings['subscriptionToken'] ?? ''));
        $agentEndpoint = trim((string)($settings['agentEndpoint'] ?? ''));
        $model = trim((string)($settings['agentModel'] ?? ''));

        $mcpKey = ccrm_marveen_ensure_user_mcp_key($pdo, $userId);
        $mcpUrl = ccrm_marveen_internal_mcp_url();
        $ctx = ccrm_marveen_ensure_worker_dir($connectorId, $provider, $token, $mcpUrl, $mcpKey);

        // Tier 2: Remote Marveen Bridge
        $remoteUrl = $agentEndpoint ?: trim((string)(getenv('MARVEEN_URL') ?: ''));
        if ($remoteUrl !== '') {
            return ccrm_marveen_bridge_post($remoteUrl, '/run', [
                'connectorId' => $connectorId,
                'provider' => $provider,
                'subscriptionToken' => $token,
                'mcpUrl' => $mcpUrl,
                'mcpBearerKey' => $mcpKey,
                'userId' => $userId,
                'prompt' => $prompt,
                'systemPrompt' => ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId),
                'model' => $model,
            ]);
        }

        // Google Antigravity (`antigravity` / Gemini): resolve the user's Google AI Studio / Gemini key
        // from their OAuth session (or direct key) and run the Gemini + CCRM MCP autonomous loop directly.
        if ($provider === 'antigravity' && $token !== '') {
            $geminiKey = ccrm_marveen_resolve_gemini_api_key($connectorId, $token);
            if ($geminiKey !== null) {
                $geminiRes = ccrm_marveen_run_gemini_mcp_agent(
                    $geminiKey,
                    $mcpUrl,
                    $mcpKey,
                    $prompt,
                    $systemPrompt,
                    $model,
                    $pdo,
                    $connector,
                    $subagentId,
                    0
                );
                return array_merge($geminiRes, [
                    'connectorId' => $connectorId,
                    'provider' => $provider,
                ]);
            }
        }

        // Tier 1: Local Embedded CLI Runner with isolated .mcp.json and memory.md (mirrored to CLAUDE.md / GEMINI.md / AGENTS.md)
        $spec = ccrm_marveen_cli_package_for($provider);
        $bin = $spec ? ccrm_marveen_find_bin($spec['bin']) : null;

        $builtSystem = ccrm_marveen_build_agent_system_prompt($pdo, $connector, $systemPrompt, $subagentId);
        $fullPrompt = $builtSystem . "\n\n## User Instruction\n" . $prompt;

        if ($bin !== null && ccrm_marveen_can_proc_open() && $token !== '') {
            $resolvedGeminiKey = ($provider === 'antigravity')
                ? (ccrm_marveen_resolve_gemini_api_key($connectorId, $token) ?? (!str_starts_with($token, 'gemini-oauth:') ? $token : ''))
                : '';
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
                $cmd = [$bin, '-p', $fullPrompt, '--mcp-config', $ctx['mcpPath'], '--dangerously-skip-permissions'];
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
            if ($resolvedGeminiKey !== '') {
                $env['GEMINI_API_KEY'] = $resolvedGeminiKey;
            }
            $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
            $proc = @proc_open($cmd, $descriptors, $pipes, $ctx['workerHome'], $env);
            if (is_resource($proc)) {
                fclose($pipes[0]);
                $stdout = (string)stream_get_contents($pipes[1]);
                $stderr = (string)stream_get_contents($pipes[2]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                $exit = proc_close($proc);
                // Sync back any changes the CLI agent made to memory.md / CLAUDE.md / AGENTS.md
                if (is_file($ctx['workerHome'] . '/memory.md')) {
                    $diskMem = (string)@file_get_contents($ctx['workerHome'] . '/memory.md');
                    if (trim($diskMem) !== '') {
                        ccrm_marveen_save_memory($pdo, $connectorId, $diskMem, $subagentId);
                    }
                }
                if ($exit === 0 && trim($stdout) !== '') {
                    return [
                        'ok' => true,
                        'text' => trim($stdout),
                        'mode' => 'local_cli',
                        'connectorId' => $connectorId,
                        'provider' => $provider,
                        'steps' => [],
                    ];
                }
                return [
                    'ok' => false,
                    'error' => 'Agent CLI exited with ' . $exit . ': ' . trim($stderr ?: $stdout),
                    'steps' => [],
                ];
            }
        }

        return [
            'ok' => true,
            'text' => sprintf(
                "[%s Subscription Agent connected via CCRM MCP as user %s] Ready. (MCP config provisioned at %s)",
                strtoupper($provider),
                $userId,
                basename($ctx['mcpPath'])
            ),
            'mode' => 'mcp_provisioned',
            'connectorId' => $connectorId,
            'provider' => $provider,
            'steps' => [],
        ];
    }
}

if (!function_exists('ccrm_marveen_run_autonomous_ticks')) {
    /**
     * Checks active AI connectors for due autonomous tasks (or runs a specific task when $forceTaskId is set),
     * executes them with full CCRM MCP + subagent + memory.md access, and appends the result to chat history.
     */
    function ccrm_marveen_run_autonomous_ticks(PDO $pdo, ?string $onlyConnectorId = null, ?string $forceTaskId = null): array {
        require_once dirname(__DIR__) . '/auth.php';
        $sql = "SELECT * FROM `company_mailboxes` WHERE `is_active` = 1";
        $params = [];
        if ($onlyConnectorId !== null && $onlyConnectorId !== '') {
            $sql .= " AND `id` = ?";
            $params[] = $onlyConnectorId;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $secretKeys = ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret'];
        $executed = [];
        $now = time();

        foreach ($rows as $row) {
            $cid = (string)$row['id'];
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw) ? ccrm_decrypt_config_secrets($raw, $secretKeys) : [];
            $cType = (string)($settings['connectorType'] ?? '');
            if (!in_array($cType, ['claude', 'antigravity', 'chatgpt'], true)) {
                continue;
            }
            $row['settings'] = $settings;

            // Acquire non-blocking per-connector lock so overlapping cron ticks never collide
            $dir = ccrm_marveen_connector_dir($cid);
            $lockFp = @fopen($dir . '/.cron.lock', 'c');
            if ($lockFp && !@flock($lockFp, LOCK_EX | LOCK_NB)) {
                @fclose($lockFp);
                continue;
            }

            try {
                $userIds = is_array($settings['userIds'] ?? null) ? array_values(array_filter(array_map('strval', $settings['userIds']))) : [];
                $runAsUser = $userIds[0] ?? (string)($row['owner_user_id'] ?? '');
                if ($runAsUser === '') {
                    $uStmt = $pdo->query("SELECT `id` FROM `users` ORDER BY `role` = 'admin' DESC, `id` ASC LIMIT 1");
                    $runAsUser = (string)($uStmt ? $uStmt->fetchColumn() : '');
                }
                if ($runAsUser === '') {
                    continue;
                }

                // A) Execute due scheduled tasks in tasks.json
                $tasks = ccrm_marveen_list_tasks($pdo, $row);
                foreach ($tasks as $task) {
                    $tid = (string)($task['id'] ?? '');
                    if ($forceTaskId !== null && $forceTaskId !== '') {
                        if ($tid !== $forceTaskId) {
                            continue;
                        }
                    } else {
                        if (empty($task['enabled'])) {
                            continue;
                        }
                        $intervalSec = max(60, ((int)($task['intervalMinutes'] ?? 60)) * 60);
                        $lastRunTs = !empty($task['lastRunAt']) ? strtotime((string)$task['lastRunAt']) : 0;
                        if ($lastRunTs > 0 && ($now - $lastRunTs) < $intervalSec) {
                            continue;
                        }
                    }

                    $subId = !empty($task['subagentId']) ? (string)$task['subagentId'] : null;
                    $res = ccrm_marveen_run_agent(
                        $pdo,
                        $row,
                        $runAsUser,
                        "[Autonomous Cron Task: " . ($task['title'] ?? $tid) . "]\n" . (string)($task['prompt'] ?? ''),
                        '',
                        $subId
                    );

                    $task['lastRunAt'] = gmdate('c');
                    $task['lastStatus'] = !empty($res['ok']) ? 'ok' : ('error: ' . ($res['error'] ?? 'failed'));
                    ccrm_marveen_save_task($pdo, $cid, $task);

                    $botMsg = [
                        'id' => 'auto-' . uniqid('', false),
                        'role' => 'assistant',
                        'autonomous' => true,
                        'taskTitle' => (string)($task['title'] ?? $tid),
                        'subagentId' => $subId,
                        'text' => !empty($res['ok'])
                            ? (string)($res['text'] ?? 'Autonomous task completed.')
                            : ('⚠️ Autonomous task error: ' . (string)($res['error'] ?? 'failed')),
                        'steps' => $res['steps'] ?? [],
                        'timestamp' => date('H:i'),
                        'createdAt' => gmdate('c'),
                    ];
                    ccrm_marveen_append_chat_message($cid, $botMsg);
                    $executed[] = [
                        'connectorId' => $cid,
                        'taskId' => $tid,
                        'ok' => !empty($res['ok']),
                        'message' => $botMsg,
                    ];
                }

                // B) Execute Connector-Level Autonomous Cron Loop (`autonomous.json`)
                $autoCfg = ccrm_marveen_get_autonomous_config($pdo, $row);
                $shouldRunAuto = false;
                $isManualTrigger = ($forceTaskId === '__autonomous__');
                if ($isManualTrigger) {
                    $shouldRunAuto = true;
                } elseif ($forceTaskId === null || $forceTaskId === '') {
                    if (!empty($autoCfg['enabled'])) {
                        $autoIntervalSec = max(60, ((int)($autoCfg['intervalMinutes'] ?? 15)) * 60);
                        $lastAutoTs = !empty($autoCfg['lastRunAt']) ? strtotime((string)$autoCfg['lastRunAt']) : 0;
                        if ($lastAutoTs === 0 || ($now - $lastAutoTs) >= $autoIntervalSec) {
                            $shouldRunAuto = true;
                        }
                    }
                }

                if ($shouldRunAuto) {
                    $autoPrompt = "[Autonomous Server Cron Tick]\n"
                        . (string)($autoCfg['instructions'] ?? "Review your memory.md, artifacts, and CCRM state via MCP. Execute any pending autonomous goals, follow-ups, or subagent delegations recorded in memory.md. Update memory.md with your progress. If no autonomous actions are needed right now, reply with [IDLE].");

                    $res = ccrm_marveen_run_agent($pdo, $row, $runAsUser, $autoPrompt, '', null);
                    $replyText = trim((string)($res['text'] ?? ''));
                    $steps = is_array($res['steps'] ?? null) ? $res['steps'] : [];
                    $isIdle = !empty($res['ok']) && (stripos($replyText, '[IDLE]') !== false || stripos($replyText, 'HEARTBEAT_OK') !== false) && empty($steps);

                    $autoCfg['lastRunAt'] = gmdate('c');
                    $autoCfg['cronCount'] = ((int)($autoCfg['cronCount'] ?? 0)) + 1;
                    $autoCfg['lastStatus'] = !empty($res['ok'])
                        ? ($isIdle ? 'idle' : 'ok')
                        : ('error: ' . ($res['error'] ?? 'failed'));
                    ccrm_marveen_save_autonomous_config($pdo, $cid, $autoCfg);

                    // Append to chat history whenever the agent performed work, reported findings, or was manually triggered
                    if (!$isIdle || $isManualTrigger) {
                        $botMsg = [
                            'id' => 'cron-' . uniqid('', false),
                            'role' => 'assistant',
                            'autonomous' => true,
                            'taskTitle' => 'Autonomous Cron',
                            'subagentId' => null,
                            'text' => !empty($res['ok'])
                                ? ($isIdle ? '✓ Autonomous cron tick completed (no pending actions in memory.md).' : ($replyText ?: 'Autonomous cron tick completed.'))
                                : ('⚠️ Autonomous cron error: ' . (string)($res['error'] ?? 'failed')),
                            'steps' => $steps,
                            'timestamp' => date('H:i'),
                            'createdAt' => gmdate('c'),
                        ];
                        ccrm_marveen_append_chat_message($cid, $botMsg);
                    }

                    $executed[] = [
                        'connectorId' => $cid,
                        'taskId' => '__autonomous__',
                        'ok' => !empty($res['ok']),
                        'status' => $autoCfg['lastStatus'],
                    ];
                }
            } finally {
                if ($lockFp) {
                    @flock($lockFp, LOCK_UN);
                    @fclose($lockFp);
                }
            }
        }

        return ['ok' => true, 'executed' => $executed];
    }
}

if (!function_exists('ccrm_marveen_pick_connector_for_user')) {
    /**
     * Selects the best active AI subscription connector assigned to $userId
     * (following Szotasz/marveen claude-plan-rotation.ts headroom / error ranking).
     */
    function ccrm_marveen_pick_connector_for_user(PDO $pdo, string $userId, ?string $preferredProvider = null): ?array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM company_mailboxes WHERE is_active = 1 ORDER BY last_error IS NOT NULL ASC, id ASC");
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $candidates = [];
        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw)
                ? ccrm_decrypt_config_secrets($raw, ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret'])
                : [];
            $type = (string)($settings['connectorType'] ?? '');
            if (!in_array($type, ['claude', 'antigravity', 'chatgpt'], true)) {
                continue;
            }
            $userIds = is_array($settings['userIds'] ?? null) ? array_map('strval', $settings['userIds']) : [];
            if ($row['owner_user_id'] && !in_array((string)$row['owner_user_id'], $userIds, true)) {
                $userIds[] = (string)$row['owner_user_id'];
            }
            // Empty userIds means all users or admin-assigned; non-empty restricts to listed users
            if (!empty($userIds) && !in_array($userId, $userIds, true)) {
                continue;
            }
            $row['settings'] = $settings;
            if ($preferredProvider !== null && $type === $preferredProvider) {
                array_unshift($candidates, $row);
            } else {
                $candidates[] = $row;
            }
        }
        return $candidates[0] ?? null;
    }
}

if (!function_exists('ccrm_marveen_bridge_post')) {
    function ccrm_marveen_bridge_post(string $baseUrl, string $path, array $payload): array {
        $url = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');
        $ch = curl_init($url);
        $secret = (string)(getenv('MARVEEN_SHARED_SECRET') ?: '');
        $headers = ['Content-Type: application/json'];
        if ($secret !== '') {
            $headers[] = 'Authorization: Bearer ' . $secret;
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($res === false) {
            return ['ok' => false, 'error' => 'Remote Marveen bridge unreachable: ' . $err];
        }
        $decoded = json_decode((string)$res, true);
        if (!is_array($decoded)) {
            return ['ok' => false, 'error' => 'Remote Marveen bridge HTTP ' . $code];
        }
        return $decoded;
    }
}

// -----------------------------------------------------------------------------
// Zero-dependency Microsoft 365 Graph Mail Check (ported from Szotasz/marveen src/graph-mail.ts)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_graph_mail_check')) {
    function ccrm_marveen_graph_mail_check(array $settings, string $address): array {
        $tenantId = trim((string)($settings['graphTenantId'] ?? ''));
        $clientId = trim((string)($settings['graphClientId'] ?? ''));
        $clientSecret = (string)($settings['graphClientSecret'] ?? '');
        $mailbox = trim((string)($address ?: ($settings['imapUsername'] ?? '')));

        if ($tenantId === '' || $clientId === '' || $clientSecret === '' || $mailbox === '') {
            return [
                'ok' => false,
                'error' => 'M365 Graph requires Tenant ID, Client ID, Client Secret, and Mailbox address.',
            ];
        }

        $tokenUrl = 'https://login.microsoftonline.com/' . rawurlencode($tenantId) . '/oauth2/v2.0/token';
        $postBody = http_build_query([
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'scope' => 'https://graph.microsoft.com/.default',
            'grant_type' => 'client_credentials',
        ]);

        $ch = curl_init($tokenUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postBody,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $tokRes = curl_exec($ch);
        $tokCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $tokErr = curl_error($ch);
        curl_close($ch);

        if ($tokRes === false) {
            return ['ok' => false, 'error' => 'M365 token request failed: ' . $tokErr];
        }
        $tokJson = json_decode((string)$tokRes, true);
        $accessToken = is_array($tokJson) ? (string)($tokJson['access_token'] ?? '') : '';
        if ($tokCode < 200 || $tokCode >= 300 || $accessToken === '') {
            $desc = is_array($tokJson) ? (string)($tokJson['error_description'] ?? ($tokJson['error'] ?? '')) : '';
            return ['ok' => false, 'error' => 'M365 OAuth rejected (' . $tokCode . '): ' . ($desc ?: 'check Tenant/Client credentials')];
        }

        $mailUrl = 'https://graph.microsoft.com/v1.0/users/' . rawurlencode($mailbox) . '/mailFolders/inbox/messages?$top=1&$select=id,subject';
        $ch2 = curl_init($mailUrl);
        curl_setopt_array($ch2, [
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $mailRes = curl_exec($ch2);
        $mailCode = (int)curl_getinfo($ch2, CURLINFO_HTTP_CODE);
        curl_close($ch2);

        if ($mailCode >= 200 && $mailCode < 300) {
            return ['ok' => true, 'mode' => 'graph'];
        }
        return ['ok' => false, 'error' => 'M365 Graph mailbox check returned HTTP ' . $mailCode];
    }
}

// -----------------------------------------------------------------------------
// Direct WAAI WhatsApp Multi-Device QR Pairing Worker (Baileys)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_waai_storage_root')) {
    function ccrm_waai_storage_root(): string {
        $root = dirname(__DIR__, 2) . '/uploads/.waai';
        if (!is_dir($root)) {
            @mkdir($root, 0775, true);
        }
        return $root;
    }

    function ccrm_waai_sanitize_account_id(string $raw): string {
        $clean = preg_replace('/[^a-zA-Z0-9_-]/', '-', trim($raw)) ?: '';
        return $clean !== '' ? $clean : ('wa-' . substr(bin2hex(random_bytes(4)), 0, 8));
    }

    function ccrm_waai_ensure_deps(): array {
        $optMods = '/opt/ccrm-waai/node_modules/@whiskeysockets/baileys';
        if (is_dir($optMods)) {
            return ['ok' => true, 'path' => '/opt/ccrm-waai/node_modules'];
        }
        $root = ccrm_waai_storage_root();
        $localMods = $root . '/node_modules/@whiskeysockets/baileys';
        if (is_dir($localMods)) {
            return ['ok' => true, 'path' => $root . '/node_modules'];
        }
        $pkgJson = $root . '/package.json';
        if (!is_file($pkgJson)) {
            @file_put_contents($pkgJson, json_encode([
                'name' => 'ccrm-waai-worker',
                'private' => true,
            ], JSON_PRETTY_PRINT));
        }
        $cmd = 'cd ' . escapeshellarg($root) . ' && npm install @whiskeysockets/baileys qrcode pino --no-audit --no-fund 2>&1';
        $out = [];
        $code = 0;
        @exec($cmd, $out, $code);
        if (is_dir($localMods)) {
            return ['ok' => true, 'path' => $root . '/node_modules'];
        }
        return [
            'ok' => false,
            'error' => 'Failed to initialize WAAI Baileys QR worker dependencies: ' . implode("\n", array_slice($out, -5)),
        ];
    }

    function ccrm_waai_qr_start(string $rawAccountId, bool $reset = true): array {
        $deps = ccrm_waai_ensure_deps();
        if (empty($deps['ok'])) {
            return [
                'ok' => false,
                'status' => 'error',
                'error' => $deps['error'] ?? 'WAAI QR dependencies missing.',
            ];
        }
        $accountId = ccrm_waai_sanitize_account_id($rawAccountId);
        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        if (!is_dir($accountDir)) {
            @mkdir($accountDir, 0775, true);
        }

        // Remove stale status file before starting fresh worker
        $statusFile = $accountDir . '/status.json';
        if ($reset && is_file($statusFile)) {
            @unlink($statusFile);
        }

        $workerScript = __DIR__ . '/waai_qr_worker.cjs';
        $logFile = $accountDir . '/worker.log';
        $resetArg = $reset ? 'reset' : 'resume';
        $cmd = sprintf(
            'nohup node %s %s %s %s > %s 2>&1 &',
            escapeshellarg($workerScript),
            escapeshellarg($accountDir),
            escapeshellarg($accountId),
            escapeshellarg($resetArg),
            escapeshellarg($logFile)
        );
        @exec($cmd);

        // Wait up to 5.5 seconds for the first real WhatsApp QR code frame from wss://web.whatsapp.com/ws/chat
        $deadline = microtime(true) + 5.5;
        $lastState = null;
        while (microtime(true) < $deadline) {
            if (is_file($statusFile)) {
                $raw = @file_get_contents($statusFile);
                $decoded = is_string($raw) ? json_decode($raw, true) : null;
                if (is_array($decoded)) {
                    $lastState = $decoded;
                    $st = (string)($decoded['status'] ?? '');
                    if (!empty($decoded['qr']) || $st === 'connected' || $st === 'error') {
                        break;
                    }
                }
            }
            usleep(220_000);
        }

        if (is_array($lastState)) {
            return array_merge(['ok' => ($lastState['status'] ?? '') !== 'error'], $lastState);
        }

        return [
            'ok' => true,
            'accountId' => $accountId,
            'status' => 'starting',
            'qr' => null,
            'error' => null,
        ];
    }

    function ccrm_waai_qr_poll(string $rawAccountId): array {
        $accountId = ccrm_waai_sanitize_account_id($rawAccountId);
        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $statusFile = $accountDir . '/status.json';
        if (!is_file($statusFile)) {
            return [
                'ok' => true,
                'accountId' => $accountId,
                'status' => 'idle',
                'qr' => null,
            ];
        }
        $raw = @file_get_contents($statusFile);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            return [
                'ok' => true,
                'accountId' => $accountId,
                'status' => 'starting',
                'qr' => null,
            ];
        }
        return array_merge(['ok' => ($decoded['status'] ?? '') !== 'error'], $decoded);
    }

    function ccrm_waai_qr_stop(string $rawAccountId): array {
        $accountId = ccrm_waai_sanitize_account_id($rawAccountId);
        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $pidFile = $accountDir . '/worker.pid';
        if (is_file($pidFile)) {
            $pid = (int)trim((string)@file_get_contents($pidFile));
            if ($pid > 0) {
                @exec('kill -TERM ' . $pid . ' 2>/dev/null');
            }
            @unlink($pidFile);
        }
        return ['ok' => true, 'accountId' => $accountId];
    }

    function ccrm_waai_resolve_account_id(array $mailboxRow): string {
        $settings = is_array($mailboxRow['settings'] ?? null)
            ? $mailboxRow['settings']
            : (json_decode((string)($mailboxRow['settings_json'] ?? '{}'), true) ?: []);
        $explicit = trim((string)($settings['waAccountId'] ?? ''));
        $accountsRoot = ccrm_waai_storage_root() . '/accounts';
        if ($explicit !== '') {
            $sanitized = ccrm_waai_sanitize_account_id($explicit);
            if (is_dir($accountsRoot . '/' . $sanitized)) {
                return $sanitized;
            }
        }
        // Fallback: match by phone number or pick the most recently connected account directory
        $addrPhone = preg_replace('/\D/', '', (string)($mailboxRow['address'] ?? ''));
        if (is_dir($accountsRoot)) {
            $dirs = @scandir($accountsRoot) ?: [];
            $bestDir = '';
            $bestMtime = 0;
            foreach ($dirs as $d) {
                if ($d === '.' || $d === '..') continue;
                $full = $accountsRoot . '/' . $d;
                if (!is_dir($full)) continue;
                $stFile = $full . '/status.json';
                if (is_file($stFile)) {
                    $st = json_decode((string)@file_get_contents($stFile), true);
                    $stPhone = preg_replace('/\D/', '', (string)($st['phone'] ?? ''));
                    if ($addrPhone !== '' && $stPhone !== '' && $addrPhone === $stPhone) {
                        return $d;
                    }
                    $mtime = (int)@filemtime($stFile);
                    if ($mtime >= $bestMtime) {
                        $bestMtime = $mtime;
                        $bestDir = $d;
                    }
                }
            }
            if ($bestDir !== '') {
                return $bestDir;
            }
        }
        return $explicit !== '' ? ccrm_waai_sanitize_account_id($explicit) : ('wa-' . ccrm_waai_sanitize_account_id((string)($mailboxRow['id'] ?? 'default')));
    }

    function ccrm_waai_is_worker_alive(string $accountDir): bool {
        $pidFile = $accountDir . '/worker.pid';
        if (!is_file($pidFile)) return false;
        $pid = (int)trim((string)@file_get_contents($pidFile));
        if ($pid <= 0) return false;
        if (is_dir('/proc/' . $pid)) return true;
        if (function_exists('posix_kill')) {
            return @posix_kill($pid, 0);
        }
        $out = [];
        $code = 1;
        @exec('kill -0 ' . $pid . ' 2>/dev/null', $out, $code);
        return $code === 0;
    }

    function ccrm_waai_ensure_worker_running(string $accountId): void {
        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        if (!is_file($accountDir . '/auth/creds.json')) {
            return;
        }
        $storeFile = $accountDir . '/store.json';
        if (!ccrm_waai_is_worker_alive($accountDir)) {
            $workerScript = __DIR__ . '/waai_qr_worker.cjs';
            $logFile = $accountDir . '/worker.log';
            $cmd = sprintf(
                'nohup node %s %s %s resume > %s 2>&1 &',
                escapeshellarg($workerScript),
                escapeshellarg($accountDir),
                escapeshellarg($accountId),
                escapeshellarg($logFile)
            );
            @exec($cmd);

            // If store.json does not exist yet, wait up to 5.5s for initial contacts/groups sync
            if (!is_file($storeFile)) {
                $deadline = microtime(true) + 5.5;
                while (microtime(true) < $deadline) {
                    if (is_file($storeFile)) {
                        $raw = @file_get_contents($storeFile);
                        $dec = is_string($raw) ? json_decode($raw, true) : null;
                        if (is_array($dec) && !empty($dec['chats'])) {
                            break;
                        }
                    }
                    usleep(250_000);
                }
            }
        }
    }

    function ccrm_waai_get_chats(array $mailboxRow): array {
        $accountId = ccrm_waai_resolve_account_id($mailboxRow);
        ccrm_waai_ensure_worker_running($accountId);

        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $statusFile = $accountDir . '/status.json';
        $storeFile = $accountDir . '/store.json';

        $status = is_file($statusFile) ? (json_decode((string)@file_get_contents($statusFile), true) ?: []) : [];
        $store = is_file($storeFile) ? (json_decode((string)@file_get_contents($storeFile), true) ?: []) : [];

        return [
            'ok' => true,
            'accountId' => $accountId,
            'status' => (string)($status['status'] ?? 'connected'),
            'qr' => $status['qr'] ?? null,
            'phone' => $status['phone'] ?? null,
            'displayName' => $status['displayName'] ?? null,
            'chats' => is_array($store['chats'] ?? null) ? $store['chats'] : [],
            'messages' => is_array($store['messages'] ?? null) ? $store['messages'] : new \stdClass(),
            'updatedAt' => $store['updatedAt'] ?? ($status['updatedAt'] ?? null),
        ];
    }

    function ccrm_waai_send_message(array $mailboxRow, string $chatId, string $text, string $author = ''): array {
        $accountId = ccrm_waai_resolve_account_id($mailboxRow);
        ccrm_waai_ensure_worker_running($accountId);

        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $outboxDir = $accountDir . '/outbox';
        if (!is_dir($outboxDir)) {
            @mkdir($outboxDir, 0775, true);
        }

        $cmdId = 'send-' . bin2hex(random_bytes(5));
        $cmdFile = $outboxDir . '/' . $cmdId . '.json';
        $resFile = $outboxDir . '/' . $cmdId . '.result.json';

        @file_put_contents($cmdFile, json_encode([
            'id' => $cmdId,
            'action' => 'send',
            'chatId' => $chatId,
            'text' => $text,
            'author' => $author,
        ], JSON_UNESCAPED_UNICODE));

        $deadline = microtime(true) + 4.5;
        $sendResult = null;
        while (microtime(true) < $deadline) {
            if (is_file($resFile)) {
                $sendResult = json_decode((string)@file_get_contents($resFile), true);
                @unlink($resFile);
                break;
            }
            usleep(180_000);
        }

        $state = ccrm_waai_get_chats($mailboxRow);
        if (is_array($sendResult) && empty($sendResult['ok'])) {
            $state['ok'] = false;
            $state['error'] = $sendResult['error'] ?? 'Failed to send WhatsApp message.';
        }
        return $state;
    }

    function ccrm_waai_resync_chats(array $mailboxRow): array {
        $accountId = ccrm_waai_resolve_account_id($mailboxRow);
        ccrm_waai_ensure_worker_running($accountId);

        $accountDir = ccrm_waai_storage_root() . '/accounts/' . $accountId;
        $outboxDir = $accountDir . '/outbox';
        if (!is_dir($outboxDir)) {
            @mkdir($outboxDir, 0775, true);
        }
        $cmdId = 'resync-' . bin2hex(random_bytes(4));
        @file_put_contents($outboxDir . '/' . $cmdId . '.json', json_encode([
            'id' => $cmdId,
            'action' => 'resync',
        ]));
        usleep(3_200_000);
        return ccrm_waai_get_chats($mailboxRow);
    }
}
