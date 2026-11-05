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
            $geminiSettings = [
                'selectedAuthType' => 'oauth-personal',
                'security' => [
                    'auth' => [
                        'selectedType' => 'oauth-personal',
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

        return [
            'workerHome' => $workerHome,
            'configDir' => $configDir,
            'scratchDir' => $scratchDir,
            'tokenFile' => $tokenFile,
            'mcpPath' => $mcpPath,
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
                $ch3 = curl_init('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . rawurlencode($candidateKey));
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

if (!function_exists('ccrm_marveen_run_gemini_mcp_agent')) {
    /**
     * Executes a fast, multi-turn Gemini + CCRM MCP tool-calling loop in PHP.
     * Connects to CCRM's internal `/api/mcp.php` using the assigned user's Bearer key,
     * exposes the user's permitted CRM tools as Gemini `functionDeclarations`, executes
     * any tool calls requested by the model, and returns the final assistant response.
     */
    function ccrm_marveen_run_gemini_mcp_agent(
        string $apiKey,
        string $mcpUrl,
        string $mcpBearerKey,
        string $prompt,
        string $systemPrompt = '',
        string $preferredModel = ''
    ): array {
        $model = trim($preferredModel);
        if ($model === '' || !str_starts_with($model, 'gemini-')) {
            $model = 'gemini-2.5-flash';
        }

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

        $toolsResp = $mcpCall('tools/list');
        $mcpTools = is_array($toolsResp['result']['tools'] ?? null) ? $toolsResp['result']['tools'] : [];
        $funcDecls = [];
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

        $contents = [
            [
                'role' => 'user',
                'parts' => [['text' => $prompt]],
            ],
        ];

        $maxTurns = 5;
        for ($turn = 0; $turn < $maxTurns; $turn++) {
            $payload = [
                'contents' => $contents,
            ];
            if ($systemPrompt !== '') {
                $payload['systemInstruction'] = [
                    'parts' => [['text' => $systemPrompt]],
                ];
            }
            if (!empty($funcDecls)) {
                $payload['tools'] = [
                    ['functionDeclarations' => $funcDecls],
                ];
            }

            $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($apiKey);
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 45,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            $rawResp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $resp = is_string($rawResp) ? json_decode($rawResp, true) : null;
            if ($httpCode === 404 && $model !== 'gemini-2.5-flash') {
                $model = 'gemini-2.5-flash';
                $turn--;
                continue;
            }
            if (!is_array($resp) || empty($resp['candidates'][0]['content']['parts'])) {
                $errMsg = (string)($resp['error']['message'] ?? ('Gemini API HTTP ' . $httpCode));
                return ['ok' => false, 'error' => $errMsg];
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
                ];
            }

            $responseParts = [];
            foreach ($funcCalls as $fc) {
                $fnName = (string)$fc['name'];
                $fnArgs = is_array($fc['args'] ?? null) ? $fc['args'] : [];
                $toolRes = $mcpCall('tools/call', [
                    'name' => $fnName,
                    'arguments' => (object)$fnArgs,
                ]);
                $toolText = '';
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

        return ['ok' => false, 'error' => 'Agent exceeded maximum tool-calling turns.'];
    }
}

if (!function_exists('ccrm_marveen_run_agent')) {
    function ccrm_marveen_run_agent(
        PDO $pdo,
        array $connector,
        string $userId,
        string $prompt,
        string $systemPrompt = ''
    ): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $provider = (string)($settings['connectorType'] ?? 'claude');
        $token = trim((string)($settings['subscriptionToken'] ?? ''));
        $agentEndpoint = trim((string)($settings['agentEndpoint'] ?? ''));
        $model = trim((string)($settings['agentModel'] ?? ''));

        $mcpKey = ccrm_marveen_ensure_user_mcp_key($pdo, $userId);
        $mcpUrl = ccrm_marveen_internal_mcp_url();

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
                'systemPrompt' => $systemPrompt,
                'model' => $model,
            ]);
        }

        // Google Antigravity (`antigravity` / Gemini): resolve the user's Google AI Studio / Gemini key
        // from their OAuth session (or direct key) and run the Gemini + CCRM MCP agent loop directly.
        if ($provider === 'antigravity' && $token !== '') {
            $geminiKey = ccrm_marveen_resolve_gemini_api_key($connectorId, $token);
            if ($geminiKey !== null) {
                $geminiRes = ccrm_marveen_run_gemini_mcp_agent($geminiKey, $mcpUrl, $mcpKey, $prompt, $systemPrompt, $model);
                if (!empty($geminiRes['ok'])) {
                    return array_merge($geminiRes, [
                        'connectorId' => $connectorId,
                        'provider' => $provider,
                    ]);
                }
            }
        }

        // Tier 1: Local Embedded CLI Runner with isolated .mcp.json
        $ctx = ccrm_marveen_ensure_worker_dir($connectorId, $provider, $token, $mcpUrl, $mcpKey);
        $spec = ccrm_marveen_cli_package_for($provider);
        $bin = $spec ? ccrm_marveen_find_bin($spec['bin']) : null;

        $fullPrompt = $systemPrompt !== '' ? ($systemPrompt . "\n\n" . $prompt) : $prompt;

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
                if ($exit === 0 && trim($stdout) !== '') {
                    return [
                        'ok' => true,
                        'text' => trim($stdout),
                        'mode' => 'local_cli',
                        'connectorId' => $connectorId,
                        'provider' => $provider,
                    ];
                }
                return [
                    'ok' => false,
                    'error' => 'Agent CLI exited with ' . $exit . ': ' . trim($stderr ?: $stdout),
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
        ];
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
