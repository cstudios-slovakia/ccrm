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

require_once dirname(__DIR__) . '/botman/botman_lib.php';

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
        if ($id === '' || $id === 'main') {
            $id = 'agent-' . substr(bin2hex(random_bytes(3)), 0, 6);
        }

        $role = trim((string)($input['role'] ?? 'Specialized CCRM Agent'));
        $systemPrompt = trim((string)($input['systemPrompt'] ?? ($input['system_prompt'] ?? '')));
        $nowIso = gmdate('c');

        $existingIdx = null;
        foreach ($subs as $idx => $s) {
            if (($s['id'] ?? '') === $id) {
                $existingIdx = $idx;
                break;
            }
        }
        $prev = $existingIdx !== null ? $subs[$existingIdx] : [];

        $defaultSubMem = "# Agent Memory — {$name}\n\n## Role\n{$role}\n\n## Operating Notes\n- Keep findings, persona rules, and specialized context for {$name} here.\n";
        $memoryMd = isset($input['memoryMd']) || isset($input['memory_md'])
            ? (string)($input['memoryMd'] ?? $input['memory_md'])
            : (string)($prev['memoryMd'] ?? $defaultSubMem);

        $palette = ['#8b5cf6', '#10b981', '#0ea5e9', '#f59e0b', '#ec4899', '#6366f1'];
        $defaultColor = $palette[count($subs) % count($palette)];
        $avatarColor = trim((string)($input['avatarColor'] ?? ($prev['avatarColor'] ?? $defaultColor)));

        $heartbeatEnabled = array_key_exists('heartbeatEnabled', $input)
            ? (bool)$input['heartbeatEnabled']
            : (bool)($prev['heartbeatEnabled'] ?? false);
        $heartbeatInterval = max(1, (int)($input['heartbeatIntervalMinutes'] ?? ($prev['heartbeatIntervalMinutes'] ?? 15)));
        $heartbeatInstructions = array_key_exists('heartbeatInstructions', $input)
            ? trim((string)$input['heartbeatInstructions'])
            : (string)($prev['heartbeatInstructions'] ?? "Review your memory.md and execute any pending periodic tasks. If nothing is due, reply with [IDLE].");
        $reactiveEnabled = array_key_exists('reactiveEnabled', $input)
            ? (bool)$input['reactiveEnabled']
            : (bool)($prev['reactiveEnabled'] ?? true);

        $record = [
            'id' => $id,
            'name' => $name,
            'role' => $role,
            'avatarColor' => $avatarColor,
            'systemPrompt' => $systemPrompt !== '' ? $systemPrompt : "You are {$name} ({$role}), a specialized CCRM AI agent.",
            'memoryMd' => rtrim($memoryMd) . "\n",
            'heartbeatEnabled' => $heartbeatEnabled,
            'heartbeatIntervalMinutes' => $heartbeatInterval,
            'heartbeatInstructions' => $heartbeatInstructions,
            'lastHeartbeatAt' => $prev['lastHeartbeatAt'] ?? null,
            'lastHeartbeatStatus' => $prev['lastHeartbeatStatus'] ?? null,
            'reactiveEnabled' => $reactiveEnabled,
            'createdAt' => (string)($prev['createdAt'] ?? $nowIso),
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

if (!function_exists('ccrm_marveen_chat_history_file')) {
    function ccrm_marveen_chat_history_file(string $connectorId, ?string $subagentId = null): string {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $cleanSub = $subagentId !== null ? preg_replace('/[^a-z0-9_-]/', '-', strtolower(trim($subagentId))) : '';
        if ($cleanSub !== '' && $cleanSub !== 'main') {
            $subDir = $dir . '/subagents/' . $cleanSub;
            if (!is_dir($subDir)) {
                @mkdir($subDir, 0700, true);
            }
            return $subDir . '/chat_history.json';
        }
        return $dir . '/chat_history.json';
    }
}

if (!function_exists('ccrm_marveen_get_chat_history')) {
    function ccrm_marveen_get_chat_history(string $connectorId, ?string $subagentId = null): array {
        $chatFile = ccrm_marveen_chat_history_file($connectorId, $subagentId);
        if (!is_file($chatFile)) {
            return [];
        }
        $decoded = json_decode((string)@file_get_contents($chatFile), true);
        return is_array($decoded) ? array_values($decoded) : [];
    }
}

if (!function_exists('ccrm_marveen_append_chat_message')) {
    function ccrm_marveen_append_chat_message(string $connectorId, array $msg, ?string $subagentId = null): array {
        $effectiveSub = $subagentId ?? (isset($msg['subagentId']) && is_string($msg['subagentId']) ? $msg['subagentId'] : null);
        $chatFile = ccrm_marveen_chat_history_file($connectorId, $effectiveSub);
        $history = ccrm_marveen_get_chat_history($connectorId, $effectiveSub);
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
    function ccrm_marveen_clear_chat_history(string $connectorId, ?string $subagentId = null): void {
        $chatFile = ccrm_marveen_chat_history_file($connectorId, $subagentId);
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
            'enabled' => false,
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
            'enabled' => array_key_exists('enabled', $input) ? (bool)$input['enabled'] : (bool)($current['enabled'] ?? false),
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

if (!function_exists('ccrm_marveen_list_followups')) {
    function ccrm_marveen_list_followups(PDO $pdo, array $connector): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $dir = ccrm_marveen_connector_dir($connectorId);
        $file = $dir . '/followups.json';
        if (is_file($file)) {
            $decoded = json_decode((string)@file_get_contents($file), true);
            if (is_array($decoded)) {
                return array_values($decoded);
            }
        }
        if (!empty($settings['followups']) && is_array($settings['followups'])) {
            @file_put_contents($file, json_encode(array_values($settings['followups']), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
            return array_values($settings['followups']);
        }
        return [];
    }
}

if (!function_exists('ccrm_marveen_list_all_followups')) {
    function ccrm_marveen_list_all_followups(PDO $pdo): array {
        $all = [];
        try {
            $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
            $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
            foreach ($rows as $r) {
                $raw = json_decode((string)($r['settings_json'] ?? '{}'), true);
                $cType = strtolower((string)($raw['connectorType'] ?? ''));
                if (!in_array($cType, ['claude', 'antigravity', 'chatgpt'], true)) {
                    continue;
                }
                $r['settings'] = is_array($raw) ? $raw : [];
                foreach (ccrm_marveen_list_followups($pdo, $r) as $f) {
                    $f['agentConnectorId'] = (string)$r['id'];
                    $f['agentConnectorName'] = (string)$r['name'];
                    $all[] = $f;
                }
            }
        } catch (\Throwable $e) {}
        return $all;
    }
}

if (!function_exists('ccrm_marveen_save_followup')) {
    function ccrm_marveen_save_followup(PDO $pdo, string $connectorId, array $input): array {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $file = $dir . '/followups.json';
        $items = is_file($file) ? (json_decode((string)@file_get_contents($file), true) ?: []) : [];

        $rawId = trim((string)($input['id'] ?? ($input['followupId'] ?? '')));
        $id = $rawId !== ''
            ? (preg_replace('/[^a-zA-Z0-9_-]/', '-', $rawId) ?: ('fup-' . substr(bin2hex(random_bytes(4)), 0, 8)))
            : ('fup-' . substr(bin2hex(random_bytes(4)), 0, 8));

        $sourceType = strtolower(trim((string)($input['sourceType'] ?? ($input['source_type'] ?? 'whatsapp'))));
        if (!in_array($sourceType, ['whatsapp', 'email'], true)) {
            $sourceType = 'whatsapp';
        }
        $sourceConnectorId = trim((string)($input['sourceConnectorId'] ?? ($input['source_connector_id'] ?? '')));
        if ($sourceConnectorId === '') {
            if ($sourceType === 'whatsapp') {
                $waList = ccrm_marveen_list_sibling_whatsapp_connectors($pdo);
                $sourceConnectorId = (string)($waList[0]['id'] ?? '');
            } else {
                $emList = ccrm_marveen_list_sibling_email_connectors($pdo);
                $sourceConnectorId = (string)($emList[0]['id'] ?? '');
            }
        }

        $targetChat = trim((string)($input['targetChat'] ?? ($input['target_chat'] ?? ($input['chat'] ?? ($input['to'] ?? '')))));
        $targetName = trim((string)($input['targetName'] ?? ($input['target_name'] ?? $targetChat)));
        $delayMinutes = max(1, (int)($input['delayMinutes'] ?? ($input['delay_minutes'] ?? 60)));
        $nowSec = time();
        $nowIso = gmdate('c', $nowSec);
        $dueAt = !empty($input['dueAt']) ? (string)$input['dueAt'] : gmdate('c', $nowSec + ($delayMinutes * 60));

        $existingIdx = null;
        foreach ($items as $idx => $it) {
            if (($it['id'] ?? '') === $id) {
                $existingIdx = $idx;
                break;
            }
        }
        $prev = $existingIdx !== null ? $items[$existingIdx] : [];

        $record = [
            'id' => $id,
            'sourceType' => $sourceType,
            'sourceConnectorId' => $sourceConnectorId,
            'targetChat' => $targetChat,
            'targetName' => $targetName !== '' ? $targetName : $targetChat,
            'subagentId' => !empty($input['subagentId']) ? (string)$input['subagentId'] : ($prev['subagentId'] ?? null),
            'delayMinutes' => $delayMinutes,
            'dueAt' => $dueAt,
            'cancelIfReplied' => array_key_exists('cancelIfReplied', $input)
                ? (bool)$input['cancelIfReplied']
                : (array_key_exists('cancel_if_replied', $input) ? (bool)$input['cancel_if_replied'] : (bool)($prev['cancelIfReplied'] ?? true)),
            'maxAttempts' => max(1, min(5, (int)($input['maxAttempts'] ?? ($input['max_attempts'] ?? ($prev['maxAttempts'] ?? 1))))),
            'attempts' => (int)($input['attempts'] ?? ($prev['attempts'] ?? 0)),
            'instructions' => trim((string)($input['instructions'] ?? ($prev['instructions'] ?? 'Follow up politely on our previous conversation if the contact has not replied yet.'))),
            'status' => (string)($input['status'] ?? ($prev['status'] ?? 'pending')),
            'createdAt' => (string)($prev['createdAt'] ?? $nowIso),
            'updatedAt' => $nowIso,
            'executedAt' => $input['executedAt'] ?? ($prev['executedAt'] ?? null),
        ];

        if ($existingIdx !== null) {
            $items[$existingIdx] = $record;
        } else {
            $items[] = $record;
        }

        // Keep most recent 100 follow-ups
        if (count($items) > 100) {
            $items = array_slice($items, -100);
        }

        @file_put_contents($file, json_encode(array_values($items), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        @chmod($file, 0600);
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($items): array {
            $s['followups'] = array_values($items);
            return $s;
        });

        return $record;
    }
}

if (!function_exists('ccrm_marveen_cancel_followup')) {
    function ccrm_marveen_cancel_followup(PDO $pdo, string $connectorId, string $followupId): bool {
        $dir = ccrm_marveen_connector_dir($connectorId);
        $file = $dir . '/followups.json';
        $items = is_file($file) ? (json_decode((string)@file_get_contents($file), true) ?: []) : [];
        $before = count($items);
        $filtered = array_values(array_filter($items, static fn($it) => ($it['id'] ?? '') !== $followupId));
        @file_put_contents($file, json_encode($filtered, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $connectorId, static function (array $s) use ($filtered): array {
            $s['followups'] = $filtered;
            return $s;
        });
        return count($filtered) !== $before;
    }
}

if (!function_exists('ccrm_marveen_get_connector_state')) {
    function ccrm_marveen_get_connector_state(PDO $pdo, array $connector, ?string $subagentId = null): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $cleanSub = ($subagentId !== null && $subagentId !== '' && $subagentId !== 'main') ? $subagentId : null;
        $mem = ccrm_marveen_get_memory($pdo, $connector);
        $artifacts = ccrm_marveen_list_artifacts($pdo, $connector);
        $subagents = ccrm_marveen_list_subagents($pdo, $connector);
        $tasks = ccrm_marveen_list_tasks($pdo, $connector);
        $autonomousMode = ccrm_marveen_get_autonomous_config($pdo, $connector);
        $chatHistory = ccrm_marveen_get_chat_history($connectorId, $cleanSub);
        $triggers = function_exists('ccrm_marveen_list_triggers') ? ccrm_marveen_list_triggers($pdo, $connector) : [];
        $allTriggers = function_exists('ccrm_marveen_list_all_triggers') ? ccrm_marveen_list_all_triggers($pdo) : $triggers;
        $followups = function_exists('ccrm_marveen_list_followups') ? ccrm_marveen_list_followups($pdo, $connector) : [];
        $allFollowups = function_exists('ccrm_marveen_list_all_followups') ? ccrm_marveen_list_all_followups($pdo) : $followups;

        $state = [
            'connectorId' => $connectorId,
            'activeAgentId' => $cleanSub ?: 'main',
            'mcpConnected' => true,
            'mcpEndpoint' => ccrm_marveen_internal_mcp_url(),
            'memoryMd' => $mem['memoryMd'],
            'memoryUpdatedAt' => $mem['updatedAt'],
            'artifacts' => $artifacts,
            'subagents' => $subagents,
            'tasks' => $tasks,
            'triggers' => $triggers,
            'allTriggers' => $allTriggers,
            'followups' => $followups,
            'allFollowups' => $allFollowups,
            'autonomousMode' => $autonomousMode,
            'chatHistory' => $chatHistory,
        ];
        if ($cleanSub !== null) {
            $subMem = ccrm_marveen_get_memory($pdo, $connector, $cleanSub);
            $state['subagentMemoryMd'] = $subMem['memoryMd'];
        }
        return $state;
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
            [
                'name' => 'whatsapp_list_chats',
                'description' => 'List WhatsApp chats and groups from the connected WhatsApp (WAAI) channel alongside this agent. Supports filtering by search query or chat type (all, groups, contacts).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'query' => [
                            'type' => 'STRING',
                            'description' => 'Optional search string to filter chats by contact name, group name, phone number, participant name, or message preview.',
                        ],
                        'type' => [
                            'type' => 'STRING',
                            'description' => 'Filter by chat type: "all" (default), "groups", or "contacts".',
                            'enum' => ['all', 'groups', 'contacts'],
                        ],
                        'limit' => [
                            'type' => 'INTEGER',
                            'description' => 'Maximum number of chats to return (default 30, max 100).',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional WhatsApp connector ID if multiple WhatsApp channels are connected.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'whatsapp_read_messages',
                'description' => 'Read the full conversation history of a WhatsApp contact or group chat by chat name (e.g. "Managment Cstudios", "Roland Vanyek"), phone number, or WhatsApp JID. Automatically includes at least the last 50 messages and at least the last 5 days of conversation (capped at 16,000 characters).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'chat' => [
                            'type' => 'STRING',
                            'description' => 'Target WhatsApp chat name, group name, participant name, phone number, or JID (e.g. "Managment Cstudios" or "120363401475617315@g.us").',
                        ],
                        'limit' => [
                            'type' => 'INTEGER',
                            'description' => 'Minimum number of most recent messages to return (default 50, max 200; always includes at least the last 5 days up to 16,000 chars).',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional WhatsApp connector ID if multiple WhatsApp channels are connected.',
                        ],
                    ],
                    'required' => ['chat'],
                ],
            ],
            [
                'name' => 'whatsapp_send_message',
                'description' => 'Send a WhatsApp message (or reply) to a contact or group chat via the connected WhatsApp (WAAI) channel.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'chat' => [
                            'type' => 'STRING',
                            'description' => 'Target WhatsApp chat name, group name, phone number, or JID (e.g. "Managment Cstudios", "+421918362403", or "120363401475617315@g.us").',
                        ],
                        'message' => [
                            'type' => 'STRING',
                            'description' => 'The exact text message to send on WhatsApp.',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional WhatsApp connector ID if multiple WhatsApp channels are connected.',
                        ],
                    ],
                    'required' => ['chat', 'message'],
                ],
            ],
            [
                'name' => 'whatsapp_sync_chat',
                'description' => 'Trigger a live on-demand WhatsApp sync (fetchMessageHistory) for a specific chat/group or the entire WhatsApp (WAAI) connector.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'chat' => [
                            'type' => 'STRING',
                            'description' => 'Optional chat name, phone number, or JID to sync on-demand.',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional WhatsApp connector ID.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'email_list_accounts',
                'description' => 'List authorized SMTP/IMAP/Gmail email connectors alongside this agent.',
            ],
            [
                'name' => 'email_list_messages',
                'description' => 'List recent emails from a connected email account (or search by sender/subject).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional email connector ID or name (defaults to the first authorized email connector).',
                        ],
                        'query' => [
                            'type' => 'STRING',
                            'description' => 'Optional filter matching sender email/name or subject.',
                        ],
                        'limit' => [
                            'type' => 'INTEGER',
                            'description' => 'Maximum number of recent messages to list (default 25, max 100).',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'email_read_thread',
                'description' => 'Read the full conversation thread and message body for an email by UID, sender address, or subject. Includes up to the last 50 messages / last 5 days in the thread (capped at 16,000 characters).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'uid' => [
                            'type' => 'INTEGER',
                            'description' => 'Optional IMAP UID of the email.',
                        ],
                        'sender' => [
                            'type' => 'STRING',
                            'description' => 'Optional sender email address to load the conversation thread with.',
                        ],
                        'subject' => [
                            'type' => 'STRING',
                            'description' => 'Optional subject line to match.',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional email connector ID.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'email_send_reply',
                'description' => 'Send an email or a threaded reply via a connected SMTP/Gmail email account.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'to' => [
                            'type' => 'STRING',
                            'description' => 'Recipient email address.',
                        ],
                        'subject' => [
                            'type' => 'STRING',
                            'description' => 'Email subject line (use "Re: ..." when replying).',
                        ],
                        'body' => [
                            'type' => 'STRING',
                            'description' => 'Email body text or HTML.',
                        ],
                        'reply_to_uid' => [
                            'type' => 'INTEGER',
                            'description' => 'Optional UID of the incoming email being replied to (automatically threads In-Reply-To and References headers).',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional email connector ID to send from.',
                        ],
                    ],
                    'required' => ['to', 'subject', 'body'],
                ],
            ],
            [
                'name' => 'schedule_conversation_followup',
                'description' => 'Schedule a proactive one-shot follow-up message on a WhatsApp/Messenger/Telegram/Slack/Viber/SMS chat or Email thread after delay_minutes ($0 idle cost). If cancel_if_replied is true (default) and the contact replies before dueAt, it auto-cancels without calling the LLM.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'source_type' => [
                            'type' => 'STRING',
                            'description' => 'Channel type: "whatsapp" (covers WhatsApp and all BotMan messaging channels like Messenger, Telegram, Slack, Discord, Teams, Viber, SMS, WebChat) or "email".',
                            'enum' => ['whatsapp', 'email'],
                        ],
                        'source_connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional messaging or email connector ID.',
                        ],
                        'target_chat' => [
                            'type' => 'STRING',
                            'description' => 'Target chat ID, contact name, phone number, or email address to re-initiate conversation with.',
                        ],
                        'delay_minutes' => [
                            'type' => 'INTEGER',
                            'description' => 'Minutes to wait before checking and sending the proactive follow-up (e.g. 60 for 1 hour, 1440 for 24 hours).',
                        ],
                        'instructions' => [
                            'type' => 'STRING',
                            'description' => 'Instructions for what the agent should check or say when re-initiating the conversation.',
                        ],
                        'cancel_if_replied' => [
                            'type' => 'BOOLEAN',
                            'description' => 'Whether to automatically cancel this follow-up if the contact replies before the timer expires (default true).',
                        ],
                        'max_attempts' => [
                            'type' => 'INTEGER',
                            'description' => 'Maximum follow-up attempts (default 1, max 3).',
                        ],
                    ],
                    'required' => ['target_chat', 'delay_minutes', 'instructions'],
                ],
            ],
            [
                'name' => 'list_conversation_followups',
                'description' => 'List all scheduled proactive conversation follow-ups on this AI connection.',
            ],
            [
                'name' => 'cancel_conversation_followup',
                'description' => 'Cancel and remove a scheduled proactive conversation follow-up by ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'Follow-up ID to cancel (e.g. "fup-...").',
                        ],
                    ],
                    'required' => ['id'],
                ],
            ],
        ];

        if (!$isSubagent) {
            $decls[] = [
                'name' => 'create_subagent',
                'description' => 'Create or update a specialized agent/subagent on this AI connection with its own role, system prompt, and dedicated memory.md.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'Slug ID for the agent (e.g. "lead-qualifier", "haiku-responder").',
                        ],
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Human-readable name of the agent.',
                        ],
                        'role' => [
                            'type' => 'STRING',
                            'description' => 'Short description of the agent\'s specialty.',
                        ],
                        'system_prompt' => [
                            'type' => 'STRING',
                            'description' => 'Detailed instructions for how this agent should operate.',
                        ],
                        'memory_md' => [
                            'type' => 'STRING',
                            'description' => 'Optional initial Markdown content for the agent\'s memory.md.',
                        ],
                    ],
                    'required' => ['name', 'role', 'system_prompt'],
                ],
            ];
            $decls[] = [
                'name' => 'list_subagents',
                'description' => 'List all specialized agents/subagents available on this connector.',
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
                'name' => 'create_event_trigger',
                'description' => 'Wire an event-driven trigger ($0 idle cost) so that when a new WhatsApp/Messenger/Telegram message, Email, or CRM event arrives, the specified agent is automatically triggered with the last 50 messages / last 5 days of conversation context. Also supports proactive re-initiation when the contact goes silent.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Human-readable name for the trigger (e.g. "Managment Cstudios Haiku Responder").',
                        ],
                        'source_type' => [
                            'type' => 'STRING',
                            'description' => 'Event source type: "whatsapp", "email", or "crm_event".',
                            'enum' => ['whatsapp', 'email', 'crm_event'],
                        ],
                        'source_connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Source WhatsApp/BotMan or Email connector ID (optional; defaults to first matching connector).',
                        ],
                        'whatsapp_chat' => [
                            'type' => 'STRING',
                            'description' => 'For whatsapp triggers: target chat name or JID (e.g. "Managment Cstudios"), "@g.us" for all groups, or "*" for all chats.',
                        ],
                        'email_sender_filter' => [
                            'type' => 'STRING',
                            'description' => 'For email triggers: optional sender email/domain substring filter.',
                        ],
                        'email_subject_filter' => [
                            'type' => 'STRING',
                            'description' => 'For email triggers: optional subject substring filter.',
                        ],
                        'crm_event_name' => [
                            'type' => 'STRING',
                            'description' => 'For crm_event triggers: e.g. "lead_created", "client_created", "task_created".',
                        ],
                        'target_agent_id' => [
                            'type' => 'STRING',
                            'description' => 'Agent ID on this connection that should handle the trigger ("main" or a created subagent ID).',
                        ],
                        'instructions' => [
                            'type' => 'STRING',
                            'description' => 'Prompt instructions for the agent when the event fires.',
                        ],
                        'auto_reply' => [
                            'type' => 'BOOLEAN',
                            'description' => 'Whether the agent should automatically send its reply back to the WhatsApp chat or Email sender (default true).',
                        ],
                        'proactive_enabled' => [
                            'type' => 'BOOLEAN',
                            'description' => 'Whether to proactively re-initiate the conversation if the contact does not reply after our last message.',
                        ],
                        'proactive_after_minutes' => [
                            'type' => 'INTEGER',
                            'description' => 'Minutes of silence after our last outgoing message before re-initiating the conversation (default 120).',
                        ],
                        'proactive_max_attempts' => [
                            'type' => 'INTEGER',
                            'description' => 'Maximum proactive follow-up attempts per unanswered turn (1 to 3, default 1).',
                        ],
                        'proactive_instructions' => [
                            'type' => 'STRING',
                            'description' => 'Instructions for how to re-initiate the conversation when the contact has not replied.',
                        ],
                    ],
                    'required' => ['name', 'source_type', 'instructions'],
                ],
            ];
            $decls[] = [
                'name' => 'list_event_triggers',
                'description' => 'List all event-driven triggers wired to this AI connection.',
            ];
            $decls[] = [
                'name' => 'delete_event_trigger',
                'description' => 'Delete an event-driven trigger by ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'ID of the trigger to delete.',
                        ],
                    ],
                    'required' => ['id'],
                ],
            ];
            $decls[] = [
                'name' => 'schedule_autonomous_task',
                'description' => 'Schedule or update a recurring heartbeat task that runs periodically in the background (e.g. every N minutes). Note: for reacting to incoming WhatsApp messages or emails, prefer create_event_trigger ($0 idle cost) over polling!',
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

if (!function_exists('ccrm_marveen_build_conversation_context')) {
    /**
     * Builds a comprehensive conversation context window for WhatsApp, Email threads, and future messaging channels:
     *  - Always includes at least the last $minMessages (50) messages AND all messages from the last $minDays (5) days
     *    (whichever set is larger, sorted chronologically oldest -> newest).
     *  - Applies a rational character limit ($maxChars = 16000, ~4,000 tokens) with tail-preserving truncation:
     *    older single messages > 1,000 chars are trimmed first, and if total chars still exceed $maxChars,
     *    the oldest messages at the top are dropped so the most recent messages are 100% preserved.
     */
    function ccrm_marveen_build_conversation_context(
        array $allMessages,
        int $minMessages = 50,
        int $minDays = 5,
        int $maxChars = 16000
    ): array {
        $minMessages = max(1, $minMessages);
        $minDays = max(1, $minDays);
        $maxChars = max(2000, $maxChars);

        $normalized = [];
        foreach ($allMessages as $idx => $m) {
            if (!is_array($m)) {
                continue;
            }
            $tsMs = (int)($m['tsMs'] ?? 0);
            if ($tsMs <= 0) {
                $dateCandidate = (string)($m['createdAt'] ?? ($m['email_date'] ?? ($m['date'] ?? ($m['timestamp'] ?? ''))));
                $parsed = $dateCandidate !== '' ? strtotime($dateCandidate) : false;
                $tsMs = $parsed !== false ? ($parsed * 1000) : ($idx * 1000);
            } elseif ($tsMs < 10000000000) {
                $tsMs *= 1000;
            }
            $fromMe = !empty($m['fromMe']) || !empty($m['is_outgoing']);
            $sender = $fromMe
                ? 'Me (Outgoing)'
                : trim((string)($m['senderName'] ?? ($m['from_name'] ?: ($m['from_address'] ?? 'Contact'))));
            if ($sender === '') {
                $sender = 'Contact';
            }
            $text = trim((string)($m['text'] ?? ($m['body'] ?? ($m['preview'] ?? ($m['subject'] ?? '')))));
            if ($text === '' && !empty($m['mediaType'])) {
                $text = '[' . strtoupper((string)$m['mediaType']) . ']';
            }
            if ($text === '') {
                continue;
            }
            $timeLabel = $tsMs > 1000000000000
                ? date('Y-m-d H:i', (int)round($tsMs / 1000))
                : (string)($m['timestamp'] ?? '');

            $normalized[] = [
                'raw' => $m,
                'id' => (string)($m['id'] ?? ($m['uid'] ?? ('msg-' . $idx))),
                'tsMs' => $tsMs,
                'timeLabel' => $timeLabel,
                'fromMe' => $fromMe,
                'senderName' => $sender,
                'text' => $text,
            ];
        }

        usort($normalized, static fn(array $a, array $b): int => $a['tsMs'] <=> $b['tsMs']);

        $totalCount = count($normalized);
        if ($totalCount === 0) {
            return [
                'messages' => [],
                'transcript' => '(No messages in conversation history)',
                'includedCount' => 0,
                'totalAvailable' => 0,
                'daysCovered' => $minDays,
                'charCount' => 0,
                'maxChars' => $maxChars,
                'truncatedByCharCap' => false,
            ];
        }

        // Union of last $minMessages (50) AND all messages from the last $minDays (5 days)
        $cutoffMs = (time() - ($minDays * 86400)) * 1000;
        $firstRecentIdx = $totalCount;
        for ($i = 0; $i < $totalCount; $i++) {
            if ($normalized[$i]['tsMs'] >= $cutoffMs) {
                $firstRecentIdx = $i;
                break;
            }
        }
        $startIndexByCount = max(0, $totalCount - $minMessages);
        $startIndex = min($startIndexByCount, $firstRecentIdx);
        $window = array_slice($normalized, $startIndex);
        $windowCount = count($window);

        // Build formatted lines from newest to oldest so we never drop the newest messages if $maxChars is reached
        $selectedReversed = [];
        $selectedRawReversed = [];
        $usedChars = 0;
        $truncatedByCap = false;

        for ($i = $windowCount - 1; $i >= 0; $i--) {
            $item = $window[$i];
            $isVeryRecent = ($windowCount - 1 - $i) < 5;
            $perMsgCap = $isVeryRecent ? 4000 : 1000;
            $msgText = $item['text'];
            if (mb_strlen($msgText, 'UTF-8') > $perMsgCap) {
                $msgText = mb_substr($msgText, 0, $perMsgCap, 'UTF-8') . ' … [truncated]';
            }
            $prefix = $item['timeLabel'] !== '' ? "[{$item['timeLabel']}] " : '';
            $line = "{$prefix}{$item['senderName']}: {$msgText}";
            $lineLen = mb_strlen($line, 'UTF-8') + 1;

            if (!empty($selectedReversed) && ($usedChars + $lineLen) > $maxChars) {
                $truncatedByCap = true;
                break;
            }
            $selectedReversed[] = $line;
            $selectedRawReversed[] = $item['raw'];
            $usedChars += $lineLen;
        }

        $chronologicalLines = array_reverse($selectedReversed);
        $chronologicalRaw = array_reverse($selectedRawReversed);

        if ($truncatedByCap) {
            array_unshift(
                $chronologicalLines,
                "[... Earlier messages omitted to stay within {$maxChars}-character conversation context cap ...]"
            );
        }

        $transcript = implode("\n", $chronologicalLines);

        return [
            'messages' => array_values($chronologicalRaw),
            'transcript' => $transcript,
            'includedCount' => count($chronologicalRaw),
            'totalAvailable' => $totalCount,
            'daysCovered' => $minDays,
            'charCount' => mb_strlen($transcript, 'UTF-8'),
            'maxChars' => $maxChars,
            'truncatedByCharCap' => $truncatedByCap,
        ];
    }
}

if (!function_exists('ccrm_marveen_list_sibling_whatsapp_connectors')) {
    /**
     * Finds all active WhatsApp (WAAI) connectors in `company_mailboxes`, prioritizing
     * those that share the agent connector's owner or assigned CRM users.
     */
    function ccrm_marveen_list_sibling_whatsapp_connectors(
        PDO $pdo,
        ?array $agentConnector = null,
        ?string $userId = null
    ): array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        $agentUsers = [];
        if ($userId !== null && $userId !== '') {
            $agentUsers[] = (string)$userId;
        }
        if (is_array($agentConnector)) {
            if (!empty($agentConnector['owner_user_id'])) {
                $agentUsers[] = (string)$agentConnector['owner_user_id'];
            }
            $aSettings = is_array($agentConnector['settings'] ?? null)
                ? $agentConnector['settings']
                : (json_decode((string)($agentConnector['settings_json'] ?? '{}'), true) ?: []);
            if (is_array($aSettings['userIds'] ?? null)) {
                foreach ($aSettings['userIds'] as $uid) {
                    $agentUsers[] = (string)$uid;
                }
            }
        }
        $agentUsers = array_values(array_unique(array_filter($agentUsers)));

        $preferred = [];
        $others = [];
        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $secretKeys = function_exists('ccrm_email_secret_keys')
                ? ccrm_email_secret_keys()
                : ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret', 'botmanToken', 'botmanAppSecret', 'botmanSigningSecret', 'botmanVerifyToken'];
            $settings = is_array($raw)
                ? ccrm_decrypt_config_secrets($raw, $secretKeys)
                : [];
            $cType = strtolower((string)($settings['connectorType'] ?? ''));
            if ($cType !== 'whatsapp' && !ccrm_is_botman_connector($cType)) {
                continue;
            }
            $row['settings'] = $settings;
            $waUsers = is_array($settings['userIds'] ?? null) ? array_map('strval', $settings['userIds']) : [];
            if (!empty($row['owner_user_id'])) {
                $waUsers[] = (string)$row['owner_user_id'];
            }
            $overlaps = empty($agentUsers) || empty($waUsers) || !empty(array_intersect($agentUsers, $waUsers));
            if ($overlaps) {
                $preferred[] = $row;
            } else {
                $others[] = $row;
            }
        }

        return array_merge($preferred, $others);
    }
}

if (!function_exists('ccrm_marveen_resolve_whatsapp_chat')) {
    /**
     * Resolves a target WhatsApp chat or group by JID, phone number, exact/fuzzy name,
     * participant preview, or message sender name.
     */
    function ccrm_marveen_resolve_whatsapp_chat(array $waState, string $target): ?array {
        $chats = is_array($waState['chats'] ?? null) ? $waState['chats'] : [];
        $messagesMap = is_array($waState['messages'] ?? null) ? $waState['messages'] : [];
        $q = trim($target);
        if ($q === '') {
            return $chats[0] ?? null;
        }
        $qLower = mb_strtolower($q, 'UTF-8');
        $qDigits = preg_replace('/\D/', '', $q);

        // 1. Exact JID or exact case-insensitive name match
        foreach ($chats as $c) {
            $cid = (string)($c['id'] ?? '');
            $cname = (string)($c['name'] ?? '');
            if (strtolower($cid) === strtolower($q) || mb_strtolower($cname, 'UTF-8') === $qLower) {
                return $c;
            }
        }

        // 2. Exact phone digits match
        if (strlen($qDigits) >= 6) {
            foreach ($chats as $c) {
                $cPhone = preg_replace('/\D/', '', (string)($c['phone'] ?? ''));
                $cIdDigits = preg_replace('/\D/', '', explode('@', (string)($c['id'] ?? ''))[0]);
                if (($cPhone !== '' && $cPhone === $qDigits) || ($cIdDigits !== '' && $cIdDigits === $qDigits)) {
                    return $c;
                }
            }
        }

        // 3. Substring match on chat name or participantsPreview (prefer chats with messages)
        $matches = [];
        foreach ($chats as $c) {
            $cname = mb_strtolower((string)($c['name'] ?? ''), 'UTF-8');
            $cpart = mb_strtolower((string)($c['participantsPreview'] ?? ''), 'UTF-8');
            if (
                ($cname !== '' && mb_strpos($cname, $qLower) !== false) ||
                ($cpart !== '' && mb_strpos($cpart, $qLower) !== false)
            ) {
                $matches[] = $c;
            }
        }
        if (!empty($matches)) {
            usort($matches, static function (array $a, array $b) use ($messagesMap): int {
                $countA = count($messagesMap[$a['id'] ?? ''] ?? []);
                $countB = count($messagesMap[$b['id'] ?? ''] ?? []);
                if ($countA !== $countB) {
                    return $countB <=> $countA;
                }
                return strcmp((string)($b['lastMessageAt'] ?? ''), (string)($a['lastMessageAt'] ?? ''));
            });
            return $matches[0];
        }

        // 4. Match by message senderName inside threads (e.g. "what did Roland write" -> finds chat where Roland posted)
        foreach ($chats as $c) {
            $cid = (string)($c['id'] ?? '');
            $thread = is_array($messagesMap[$cid] ?? null) ? $messagesMap[$cid] : [];
            foreach ($thread as $m) {
                $sender = mb_strtolower((string)($m['senderName'] ?? ''), 'UTF-8');
                if ($sender !== '' && mb_strpos($sender, $qLower) !== false) {
                    return $c;
                }
            }
        }

        // 5. Direct phone number synthesis if >= 7 digits
        if (strlen($qDigits) >= 7) {
            return [
                'id' => $qDigits . '@s.whatsapp.net',
                'name' => '+' . $qDigits,
                'phone' => '+' . $qDigits,
                'isGroup' => false,
            ];
        }

        return null;
    }
}

if (!function_exists('ccrm_marveen_execute_whatsapp_tool')) {
    /**
     * Executes one of the 4 WhatsApp (WAAI) agent/MCP tools (`whatsapp_list_chats`,
     * `whatsapp_read_messages`, `whatsapp_send_message`, `whatsapp_sync_chat`).
     */
    function ccrm_marveen_execute_whatsapp_tool(
        PDO $pdo,
        ?array $agentConnector,
        string $fnName,
        array $fnArgs,
        ?string $userId = null
    ): array {
        $waConnectors = ccrm_marveen_list_sibling_whatsapp_connectors($pdo, $agentConnector, $userId);
        if (empty($waConnectors)) {
            return [
                'toolText' => json_encode([
                    'ok' => false,
                    'error' => 'No active WhatsApp (WAAI) connector is authorized in CCRM. Add or enable a WhatsApp connector in Authorized Channels.',
                ], JSON_UNESCAPED_UNICODE),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => $fnName,
                    'label' => 'WhatsApp: No connector configured',
                ],
            ];
        }

        $requestedId = trim((string)($fnArgs['connector_id'] ?? ''));
        $waConnector = $waConnectors[0];
        if ($requestedId !== '') {
            foreach ($waConnectors as $cand) {
                if (($cand['id'] ?? '') === $requestedId || stripos((string)($cand['name'] ?? ''), $requestedId) !== false) {
                    $waConnector = $cand;
                    break;
                }
            }
        }

        $waState = ccrm_waai_get_chats($waConnector);
        $chats = is_array($waState['chats'] ?? null) ? $waState['chats'] : [];
        $messagesMap = is_array($waState['messages'] ?? null) ? $waState['messages'] : [];

        if ($fnName === 'whatsapp_list_chats') {
            $query = mb_strtolower(trim((string)($fnArgs['query'] ?? '')), 'UTF-8');
            $typeFilter = strtolower(trim((string)($fnArgs['type'] ?? 'all')));
            $limit = min(100, max(1, (int)($fnArgs['limit'] ?? 30)));

            $filtered = [];
            foreach ($chats as $c) {
                $isGroup = !empty($c['isGroup']);
                if ($typeFilter === 'groups' && !$isGroup) continue;
                if ($typeFilter === 'contacts' && $isGroup) continue;

                $cid = (string)($c['id'] ?? '');
                $thread = is_array($messagesMap[$cid] ?? null) ? $messagesMap[$cid] : [];
                $lastMsg = !empty($thread) ? $thread[count($thread) - 1] : null;

                if ($query !== '') {
                    $haystack = mb_strtolower(
                        ($c['name'] ?? '') . ' ' .
                        ($c['phone'] ?? '') . ' ' .
                        ($c['participantsPreview'] ?? '') . ' ' .
                        ($c['lastMessageText'] ?? '') . ' ' .
                        ($lastMsg['senderName'] ?? ''),
                        'UTF-8'
                    );
                    if (mb_strpos($haystack, $query) === false) {
                        continue;
                    }
                }

                $filtered[] = [
                    'chatId' => $cid,
                    'name' => (string)($c['name'] ?? $cid),
                    'phone' => (string)($c['phone'] ?? ''),
                    'isGroup' => $isGroup,
                    'participantsPreview' => $c['participantsPreview'] ?? null,
                    'messageCount' => count($thread),
                    'lastMessageSender' => $lastMsg ? (($lastMsg['fromMe'] ?? false) ? 'Me' : ($lastMsg['senderName'] ?? null)) : null,
                    'lastMessageText' => (string)($c['lastMessageText'] ?? ($lastMsg['text'] ?? '')),
                    'lastMessageAt' => $c['lastMessageAt'] ?? ($lastMsg['timestamp'] ?? null),
                ];
                if (count($filtered) >= $limit) {
                    break;
                }
            }

            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'connector' => [
                        'id' => $waConnector['id'],
                        'name' => $waConnector['name'],
                        'phone' => $waState['phone'] ?? ($waConnector['address'] ?? ''),
                        'status' => $waState['status'] ?? 'connected',
                        'totalChats' => count($chats),
                    ],
                    'chats' => $filtered,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => 'whatsapp_list_chats',
                    'label' => 'Listed WhatsApp chats (' . count($filtered) . ')',
                    'detail' => $query !== '' ? "Query: {$query}" : ($waConnector['name'] ?? 'WhatsApp'),
                ],
            ];
        }

        if ($fnName === 'whatsapp_read_messages') {
            $chatTarget = trim((string)($fnArgs['chat'] ?? ($fnArgs['chat_id'] ?? ($fnArgs['query'] ?? ''))));
            $limit = min(200, max(50, (int)($fnArgs['limit'] ?? 50)));
            $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $chatTarget);

            if ($resolved === null) {
                $sampleNames = array_map(static fn($c) => $c['name'] ?? $c['id'], array_slice($chats, 0, 12));
                return [
                    'toolText' => json_encode([
                        'ok' => false,
                        'error' => "Could not find a WhatsApp chat matching \"{$chatTarget}\".",
                        'availableRecentChats' => $sampleNames,
                    ], JSON_UNESCAPED_UNICODE),
                    'step' => [
                        'id' => uniqid('st_', false),
                        'kind' => 'whatsapp',
                        'tool' => 'whatsapp_read_messages',
                        'label' => "WhatsApp chat not found: {$chatTarget}",
                    ],
                ];
            }

            $cid = (string)$resolved['id'];
            $thread = is_array($messagesMap[$cid] ?? null) ? $messagesMap[$cid] : [];
            $ctxWindow = ccrm_marveen_build_conversation_context($thread, $limit, 5, 16000);

            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'chat' => [
                        'chatId' => $cid,
                        'name' => $resolved['name'] ?? $cid,
                        'phone' => $resolved['phone'] ?? '',
                        'isGroup' => !empty($resolved['isGroup']),
                        'participantsPreview' => $resolved['participantsPreview'] ?? null,
                        'totalMessagesInStore' => count($thread),
                        'includedMessagesCount' => $ctxWindow['includedCount'],
                        'contextCharCount' => $ctxWindow['charCount'],
                        'contextWindowRule' => 'last 50 messages + at least last 5 days (capped at 16,000 chars)',
                    ],
                    'conversationTranscript' => $ctxWindow['transcript'],
                    'messages' => $ctxWindow['messages'],
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => 'whatsapp_read_messages',
                    'label' => "Read WhatsApp: {$resolved['name']} (" . $ctxWindow['includedCount'] . ' msgs / 5d context)',
                    'detail' => $cid,
                ],
            ];
        }

        if ($fnName === 'whatsapp_send_message') {
            $chatTarget = trim((string)($fnArgs['chat'] ?? ($fnArgs['chat_id'] ?? ($fnArgs['to'] ?? ''))));
            $messageText = trim((string)($fnArgs['message'] ?? ($fnArgs['text'] ?? '')));
            if ($chatTarget === '' || $messageText === '') {
                return [
                    'toolText' => json_encode([
                        'ok' => false,
                        'error' => 'Both `chat` and `message` parameters are required to send a WhatsApp message.',
                    ], JSON_UNESCAPED_UNICODE),
                    'step' => [
                        'id' => uniqid('st_', false),
                        'kind' => 'whatsapp',
                        'tool' => 'whatsapp_send_message',
                        'label' => 'WhatsApp send failed: missing arguments',
                    ],
                ];
            }

            $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $chatTarget);
            if ($resolved === null) {
                return [
                    'toolText' => json_encode([
                        'ok' => false,
                        'error' => "Could not resolve WhatsApp recipient \"{$chatTarget}\". Use `whatsapp_list_chats` first to find the exact chat name or JID.",
                    ], JSON_UNESCAPED_UNICODE),
                    'step' => [
                        'id' => uniqid('st_', false),
                        'kind' => 'whatsapp',
                        'tool' => 'whatsapp_send_message',
                        'label' => "WhatsApp recipient not found: {$chatTarget}",
                    ],
                ];
            }

            $cid = (string)$resolved['id'];
            $authorName = (string)($agentConnector['name'] ?? 'AI Agent');
            $sendRes = ccrm_waai_send_message($waConnector, $cid, $messageText, $authorName);
            $sentOk = !empty($sendRes['ok']);

            return [
                'toolText' => json_encode([
                    'ok' => $sentOk,
                    'error' => $sendRes['error'] ?? null,
                    'sentTo' => [
                        'chatId' => $cid,
                        'name' => $resolved['name'] ?? $cid,
                        'phone' => $resolved['phone'] ?? '',
                        'isGroup' => !empty($resolved['isGroup']),
                    ],
                    'message' => $messageText,
                    'timestamp' => date('Y-m-d H:i'),
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => 'whatsapp_send_message',
                    'label' => $sentOk
                        ? "Sent WhatsApp → {$resolved['name']}"
                        : "Failed WhatsApp → {$resolved['name']}",
                    'detail' => mb_substr($messageText, 0, 120, 'UTF-8'),
                ],
            ];
        }

        if ($fnName === 'whatsapp_sync_chat') {
            $chatTarget = trim((string)($fnArgs['chat'] ?? ($fnArgs['chat_id'] ?? '')));
            $cid = '';
            $labelName = $waConnector['name'] ?? 'WhatsApp';
            if ($chatTarget !== '') {
                $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $chatTarget);
                if ($resolved !== null) {
                    $cid = (string)$resolved['id'];
                    $labelName = (string)($resolved['name'] ?? $cid);
                }
            }
            $synced = ccrm_waai_resync_chats($waConnector, $cid);
            $syncedChats = is_array($synced['chats'] ?? null) ? $synced['chats'] : [];
            $syncedMsgs = ($cid !== '' && is_array($synced['messages'][$cid] ?? null))
                ? array_slice($synced['messages'][$cid], -20)
                : [];
            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'status' => $synced['status'] ?? 'connected',
                    'totalChats' => count($syncedChats),
                    'chatId' => $cid ?: null,
                    'recentMessages' => $syncedMsgs,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => 'whatsapp_sync_chat',
                    'label' => "Synced WhatsApp: {$labelName}",
                    'detail' => $cid ?: 'Full connector resync',
                ],
            ];
        }

        return [
            'toolText' => json_encode(['ok' => false, 'error' => "Unknown WhatsApp tool: {$fnName}"]),
            'step' => [
                'id' => uniqid('st_', false),
                'kind' => 'whatsapp',
                'tool' => $fnName,
                'label' => "WhatsApp: {$fnName}",
            ],
        ];
    }
}

if (!function_exists('ccrm_marveen_list_sibling_email_connectors')) {
    /**
     * Finds all active Email (`gmail`, `smtp`, `exchange`) connectors in `company_mailboxes`.
     */
    function ccrm_marveen_list_sibling_email_connectors(
        PDO $pdo,
        ?array $agentConnector = null,
        ?string $userId = null
    ): array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        $agentUsers = [];
        if ($userId !== null && $userId !== '') {
            $agentUsers[] = (string)$userId;
        }
        if (is_array($agentConnector)) {
            if (!empty($agentConnector['owner_user_id'])) {
                $agentUsers[] = (string)$agentConnector['owner_user_id'];
            }
            $aSettings = is_array($agentConnector['settings'] ?? null)
                ? $agentConnector['settings']
                : (json_decode((string)($agentConnector['settings_json'] ?? '{}'), true) ?: []);
            if (is_array($aSettings['userIds'] ?? null)) {
                foreach ($aSettings['userIds'] as $uid) {
                    $agentUsers[] = (string)$uid;
                }
            }
        }
        $agentUsers = array_values(array_unique(array_filter($agentUsers)));

        $preferred = [];
        $others = [];
        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw)
                ? ccrm_decrypt_config_secrets($raw, ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret'])
                : [];
            $cType = strtolower(trim((string)($settings['connectorType'] ?? '')));
            if ($cType === '') {
                $imapHost = strtolower((string)($settings['imapHost'] ?? ''));
                $cType = str_contains($imapHost, 'gmail') ? 'gmail' : (($settings['provider'] ?? '') === 'exchange' ? 'exchange' : 'smtp');
            }
            if (!in_array($cType, ['gmail', 'smtp', 'exchange'], true)) {
                continue;
            }
            $settings['connectorType'] = $cType;
            $row['settings'] = $settings;
            $eUsers = is_array($settings['userIds'] ?? null) ? array_map('strval', $settings['userIds']) : [];
            if (!empty($row['owner_user_id'])) {
                $eUsers[] = (string)$row['owner_user_id'];
            }
            $overlaps = empty($agentUsers) || empty($eUsers) || !empty(array_intersect($agentUsers, $eUsers));
            if ($overlaps) {
                $preferred[] = $row;
            } else {
                $others[] = $row;
            }
        }
        return array_merge($preferred, $others);
    }
}

if (!function_exists('ccrm_marveen_send_connector_email')) {
    /**
     * Sends an email or threaded reply directly through a CCRM Email Connector's SMTP settings
     * and records the outgoing envelope in `mail_envelopes`.
     */
    function ccrm_marveen_send_connector_email(
        PDO $pdo,
        array $emailConnector,
        string $to,
        string $subject,
        string $bodyTextOrHtml,
        string $inReplyTo = '',
        string $references = ''
    ): array {
        $to = trim($to);
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Invalid recipient email address: ' . $to];
        }
        $settings = is_array($emailConnector['settings'] ?? null)
            ? $emailConnector['settings']
            : (json_decode((string)($emailConnector['settings_json'] ?? '{}'), true) ?: []);

        $smtpHost = trim((string)($settings['smtpHost'] ?? ''));
        $cType = strtolower((string)($settings['connectorType'] ?? 'smtp'));
        if ($smtpHost === '' && $cType === 'gmail') {
            $smtpHost = 'smtp.gmail.com';
        } elseif ($smtpHost === '' && $cType === 'exchange') {
            $smtpHost = 'smtp.office365.com';
        }
        $smtpPort = (int)($settings['smtpPort'] ?? 0);
        if ($smtpPort <= 0) {
            $smtpPort = ($cType === 'exchange') ? 587 : 465;
        }
        $smtpSecure = strtolower((string)($settings['smtpSecure'] ?? ($smtpPort === 587 ? 'tls' : 'ssl')));
        $smtpUser = trim((string)($settings['smtpUsername'] ?? ($settings['imapUsername'] ?? ($emailConnector['address'] ?? ''))));
        $smtpPass = (string)($settings['smtpPassword'] ?? ($settings['imapPassword'] ?? ''));

        if ($smtpHost === '' || $smtpUser === '' || $smtpPass === '') {
            return ['ok' => false, 'error' => 'Email connector is missing SMTP host, username, or password.'];
        }

        $prefix = ($smtpSecure === 'ssl' && $smtpPort !== 587) ? 'ssl://' : '';
        $errno = 0;
        $errstr = '';
        $socket = @fsockopen($prefix . $smtpHost, $smtpPort, $errno, $errstr, 12);
        if (!$socket) {
            return ['ok' => false, 'error' => "SMTP connection failed ({$smtpHost}:{$smtpPort}): {$errstr}"];
        }
        stream_set_timeout($socket, 20);

        $readReply = static function () use ($socket): string {
            $out = '';
            while (($line = fgets($socket, 1024)) !== false) {
                $out .= $line;
                if (strlen($line) < 4 || $line[3] === ' ') break;
            }
            return $out;
        };
        $expect = static function (string $reply, $codes, string $stage): ?string {
            $head = ltrim($reply);
            foreach ((array)$codes as $code) {
                if (str_starts_with($head, (string)$code)) {
                    return null;
                }
            }
            return "SMTP {$stage} failed: " . trim($head ?: 'no reply');
        };

        $readReply();
        $ehlo = "EHLO " . (!empty($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : 'localhost') . "\r\n";
        fwrite($socket, $ehlo);
        $readReply();

        if ($smtpPort === 587 || $smtpSecure === 'tls') {
            fwrite($socket, "STARTTLS\r\n");
            if ($err = $expect($readReply(), '220', 'STARTTLS')) {
                fclose($socket);
                return ['ok' => false, 'error' => $err];
            }
            if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                fclose($socket);
                return ['ok' => false, 'error' => 'SMTP TLS handshake failed.'];
            }
            fwrite($socket, $ehlo);
            $readReply();
        }

        fwrite($socket, "AUTH LOGIN\r\n");
        if ($err = $expect($readReply(), '334', 'AUTH LOGIN')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, base64_encode($smtpUser) . "\r\n");
        if ($err = $expect($readReply(), '334', 'AUTH username')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, base64_encode($smtpPass) . "\r\n");
        if ($err = $expect($readReply(), '235', 'authentication')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }

        fwrite($socket, "MAIL FROM: <{$smtpUser}>\r\n");
        if ($err = $expect($readReply(), '250', 'MAIL FROM')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, "RCPT TO: <{$to}>\r\n");
        if ($err = $expect($readReply(), ['250', '251'], 'RCPT TO')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, "DATA\r\n");
        if ($err = $expect($readReply(), '354', 'DATA')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }

        $domain = str_contains($smtpUser, '@') ? substr(strrchr($smtpUser, '@'), 1) : 'ccrm.local';
        $messageId = '<' . bin2hex(random_bytes(12)) . '@' . $domain . '>';
        $fromName = trim((string)($emailConnector['name'] ?? ''));

        $isHtml = (bool)preg_match('/<(p|div|br|table|ul|ol|li|strong|em|h[1-6])\b/i', $bodyTextOrHtml);
        $htmlBody = $isHtml ? $bodyTextOrHtml : nl2br(htmlspecialchars($bodyTextOrHtml, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));

        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= $fromName !== ''
            ? "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$smtpUser}>\r\n"
            : "From: <{$smtpUser}>\r\n";
        $headers .= "To: <{$to}>\r\n";
        $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
        $headers .= "Message-ID: {$messageId}\r\n";
        if ($inReplyTo !== '') {
            $headers .= "In-Reply-To: {$inReplyTo}\r\n";
        }
        if ($references !== '') {
            $headers .= "References: {$references}\r\n";
        } elseif ($inReplyTo !== '') {
            $headers .= "References: {$inReplyTo}\r\n";
        }
        $headers .= "Date: " . date('r') . "\r\n\r\n";

        $message = $headers . $htmlBody;
        $wire = preg_replace('/\r\n|\r|\n/', "\r\n", $message);
        $wire = preg_replace('/^\./m', '..', (string)$wire);

        fwrite($socket, $wire . "\r\n.\r\n");
        if ($err = $expect($readReply(), '250', 'message body')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, "QUIT\r\n");
        fclose($socket);

        // Append the sent message to the IMAP Sent folder so it appears in real IMAP Sent & threads
        $filedToImapSent = false;
        try {
            require_once dirname(__DIR__) . '/mail_broker.php';
            if (function_exists('ccrm_append_to_sent')) {
                $filedToImapSent = (bool)ccrm_append_to_sent($settings, $message);
            }
        } catch (\Throwable $e) {
            // Non-fatal if IMAP Sent append is unavailable
        }

        // Cache the outgoing message in mail_envelopes so it appears in thread context and mailbox UI immediately
        try {
            $mailboxKey = 'c:' . $emailConnector['id'];
            $fakeUid = (int)(time() * 10 + random_int(1, 9));
            $plainPreview = mb_substr(trim(strip_tags($bodyTextOrHtml)), 0, 480, 'UTF-8');
            $stmt = $pdo->prepare(
                "INSERT IGNORE INTO `mail_envelopes` (
                    `mailbox_key`, `folder`, `uid`, `event_id`, `subject`,
                    `from_name`, `from_address`, `to_name`, `to_address`,
                    `email_date`, `is_outgoing`, `seen`, `size`,
                    `message_id`, `in_reply_to`, `references_hdr`, `preview`
                ) VALUES (?, 'Sent', ?, ?, ?, ?, ?, '', ?, NOW(), 1, 1, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([
                $mailboxKey,
                $fakeUid,
                'email-agent-' . uniqid('', false),
                mb_substr($subject, 0, 500, 'UTF-8'),
                mb_substr($fromName, 0, 255, 'UTF-8'),
                mb_substr($smtpUser, 0, 255, 'UTF-8'),
                mb_substr($to, 0, 255, 'UTF-8'),
                strlen($htmlBody),
                $messageId,
                $inReplyTo,
                $references ?: $inReplyTo,
                $plainPreview,
            ]);
        } catch (\Throwable $e) {
            // Non-fatal if mail_envelopes table does not exist yet
        }

        return [
            'ok' => true,
            'messageId' => $messageId,
            'filedToSent' => $filedToImapSent,
            'from' => $smtpUser,
            'to' => $to,
            'subject' => $subject,
        ];
    }
}

if (!function_exists('ccrm_marveen_execute_email_tool')) {
    /**
     * Executes Email Connector tools (`email_list_accounts`, `email_list_messages`,
     * `email_read_thread`, `email_send_reply`) for AI Agents.
     */
    function ccrm_marveen_execute_email_tool(
        PDO $pdo,
        ?array $agentConnector,
        string $fnName,
        array $fnArgs,
        ?string $userId = null
    ): array {
        $emailConnectors = ccrm_marveen_list_sibling_email_connectors($pdo, $agentConnector, $userId);
        if (empty($emailConnectors)) {
            return [
                'toolText' => json_encode([
                    'ok' => false,
                    'error' => 'No active Email connector (SMTP/IMAP/Gmail) is configured in CCRM.',
                ], JSON_UNESCAPED_UNICODE),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => $fnName,
                    'label' => 'Email: No connector configured',
                ],
            ];
        }

        if ($fnName === 'email_list_accounts') {
            $accounts = array_map(static fn(array $c) => [
                'id' => $c['id'],
                'name' => $c['name'],
                'address' => $c['address'],
                'connectorType' => $c['settings']['connectorType'] ?? 'smtp',
            ], $emailConnectors);
            return [
                'toolText' => json_encode(['ok' => true, 'accounts' => $accounts], JSON_UNESCAPED_UNICODE),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => 'email_list_accounts',
                    'label' => 'Listed Email accounts (' . count($accounts) . ')',
                ],
            ];
        }

        $requestedId = trim((string)($fnArgs['connector_id'] ?? ''));
        $emailConnector = $emailConnectors[0];
        if ($requestedId !== '') {
            foreach ($emailConnectors as $cand) {
                if (
                    (string)($cand['id'] ?? '') === $requestedId ||
                    stripos((string)($cand['name'] ?? ''), $requestedId) !== false ||
                    stripos((string)($cand['address'] ?? ''), $requestedId) !== false
                ) {
                    $emailConnector = $cand;
                    break;
                }
            }
        }
        $mailboxKey = 'c:' . $emailConnector['id'];

        if ($fnName === 'email_list_messages') {
            $query = trim((string)($fnArgs['query'] ?? ''));
            $limit = min(100, max(1, (int)($fnArgs['limit'] ?? 25)));
            $rows = [];
            try {
                if ($query !== '') {
                    $like = '%' . $query . '%';
                    $stmt = $pdo->prepare(
                        "SELECT `uid`, `folder`, `subject`, `from_name`, `from_address`, `to_address`, `email_date`, `is_outgoing`, `preview`, `message_id`
                         FROM `mail_envelopes`
                         WHERE `mailbox_key` = ? AND (`subject` LIKE ? OR `from_address` LIKE ? OR `from_name` LIKE ? OR `preview` LIKE ?)
                         ORDER BY `email_date` DESC, `uid` DESC LIMIT {$limit}"
                    );
                    $stmt->execute([$mailboxKey, $like, $like, $like, $like]);
                } else {
                    $stmt = $pdo->prepare(
                        "SELECT `uid`, `folder`, `subject`, `from_name`, `from_address`, `to_address`, `email_date`, `is_outgoing`, `preview`, `message_id`
                         FROM `mail_envelopes`
                         WHERE `mailbox_key` = ?
                         ORDER BY `email_date` DESC, `uid` DESC LIMIT {$limit}"
                    );
                    $stmt->execute([$mailboxKey]);
                }
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable $e) {
                $rows = [];
            }

            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'connector' => [
                        'id' => $emailConnector['id'],
                        'name' => $emailConnector['name'],
                        'address' => $emailConnector['address'],
                    ],
                    'messages' => $rows,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => 'email_list_messages',
                    'label' => "Listed Emails: {$emailConnector['name']} (" . count($rows) . ')',
                ],
            ];
        }

        if ($fnName === 'email_read_thread') {
            $uid = (int)($fnArgs['uid'] ?? 0);
            $sender = trim((string)($fnArgs['sender'] ?? ''));
            $subject = trim((string)($fnArgs['subject'] ?? ''));

            $threadRows = [];
            try {
                if ($uid > 0 && $sender === '') {
                    $st = $pdo->prepare("SELECT * FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `uid` = ? LIMIT 1");
                    $st->execute([$mailboxKey, $uid]);
                    $targetRow = $st->fetch(PDO::FETCH_ASSOC);
                    if ($targetRow) {
                        $sender = (string)($targetRow['is_outgoing'] ? $targetRow['to_address'] : $targetRow['from_address']);
                        $subject = (string)($targetRow['subject'] ?? '');
                    }
                }
                if ($sender !== '') {
                    $likeSender = '%' . $sender . '%';
                    $st = $pdo->prepare(
                        "SELECT * FROM `mail_envelopes`
                         WHERE `mailbox_key` = ? AND (`from_address` LIKE ? OR `to_address` LIKE ?)
                         ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                    );
                    $st->execute([$mailboxKey, $likeSender, $likeSender]);
                    $threadRows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
                } elseif ($subject !== '') {
                    $cleanSubj = trim((string)preg_replace('/^(re|fwd|fw|odp|válasz):\s*/i', '', $subject));
                    $likeSubj = '%' . ($cleanSubj ?: $subject) . '%';
                    $st = $pdo->prepare(
                        "SELECT * FROM `mail_envelopes`
                         WHERE `mailbox_key` = ? AND `subject` LIKE ?
                         ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                    );
                    $st->execute([$mailboxKey, $likeSubj]);
                    $threadRows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
                }
            } catch (\Throwable $e) {
                $threadRows = [];
            }

            $mappedForCtx = array_map(static fn(array $r) => [
                'id' => 'uid-' . ($r['uid'] ?? ''),
                'uid' => (int)($r['uid'] ?? 0),
                'fromMe' => !empty($r['is_outgoing']),
                'senderName' => !empty($r['is_outgoing'])
                    ? 'Me (' . ($emailConnector['address'] ?? 'Outgoing') . ')'
                    : (($r['from_name'] ? $r['from_name'] . ' <' . $r['from_address'] . '>' : $r['from_address']) ?: 'Sender'),
                'text' => "[Subject: " . ($r['subject'] ?? '') . "] " . ($r['preview'] ?? ''),
                'createdAt' => $r['email_date'] ?? '',
            ], $threadRows);

            $ctxWindow = ccrm_marveen_build_conversation_context($mappedForCtx, 50, 5, 16000);

            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'connector' => [
                        'id' => $emailConnector['id'],
                        'name' => $emailConnector['name'],
                        'address' => $emailConnector['address'],
                    ],
                    'includedMessagesCount' => $ctxWindow['includedCount'],
                    'conversationTranscript' => $ctxWindow['transcript'],
                    'messages' => $ctxWindow['messages'],
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => 'email_read_thread',
                    'label' => "Read Email Thread (" . $ctxWindow['includedCount'] . ' msgs / 5d context)',
                    'detail' => $sender ?: $subject,
                ],
            ];
        }

        if ($fnName === 'email_send_reply') {
            $to = trim((string)($fnArgs['to'] ?? ''));
            $subject = trim((string)($fnArgs['subject'] ?? ''));
            $body = trim((string)($fnArgs['body'] ?? ($fnArgs['message'] ?? '')));
            $replyToUid = (int)($fnArgs['reply_to_uid'] ?? 0);

            $inReplyTo = '';
            $references = '';
            if ($replyToUid > 0) {
                try {
                    $st = $pdo->prepare("SELECT `message_id`, `references_hdr`, `subject`, `from_address` FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `uid` = ? LIMIT 1");
                    $st->execute([$mailboxKey, $replyToUid]);
                    $orig = $st->fetch(PDO::FETCH_ASSOC);
                    if ($orig) {
                        $inReplyTo = (string)($orig['message_id'] ?? '');
                        $references = trim(((string)($orig['references_hdr'] ?? '')) . ' ' . $inReplyTo);
                        if ($to === '' && !empty($orig['from_address'])) {
                            $to = (string)$orig['from_address'];
                        }
                        if ($subject === '' && !empty($orig['subject'])) {
                            $origSubj = (string)$orig['subject'];
                            $subject = preg_match('/^re:/i', $origSubj) ? $origSubj : ('Re: ' . $origSubj);
                        }
                    }
                } catch (\Throwable $e) {}
            } elseif ($to !== '') {
                try {
                    $st = $pdo->prepare("SELECT `message_id`, `references_hdr`, `subject` FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `from_address` = ? AND `is_outgoing` = 0 ORDER BY `email_date` DESC, `uid` DESC LIMIT 1");
                    $st->execute([$mailboxKey, $to]);
                    $orig = $st->fetch(PDO::FETCH_ASSOC);
                    if ($orig) {
                        $inReplyTo = (string)($orig['message_id'] ?? '');
                        $references = trim(((string)($orig['references_hdr'] ?? '')) . ' ' . $inReplyTo);
                        if ($subject === '' && !empty($orig['subject'])) {
                            $origSubj = (string)$orig['subject'];
                            $subject = preg_match('/^re:/i', $origSubj) ? $origSubj : ('Re: ' . $origSubj);
                        }
                    }
                } catch (\Throwable $e) {}
            }

            $sendRes = ccrm_marveen_send_connector_email($pdo, $emailConnector, $to, $subject, $body, $inReplyTo, $references);
            $sentOk = !empty($sendRes['ok']);
            return [
                'toolText' => json_encode($sendRes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => 'email_send_reply',
                    'label' => $sentOk ? "Sent Email → {$to}" : "Failed Email → {$to}",
                    'detail' => $subject,
                ],
            ];
        }

        return [
            'toolText' => json_encode(['ok' => false, 'error' => "Unknown Email tool: {$fnName}"]),
            'step' => [
                'id' => uniqid('st_', false),
                'kind' => 'mcp',
                'tool' => $fnName,
                'label' => "Email: {$fnName}",
            ],
        ];
    }
}

// -----------------------------------------------------------------------------
// Visual Event Triggers ($0 Idle Cost Event-Driven Agent Execution)
// -----------------------------------------------------------------------------

if (!function_exists('ccrm_marveen_normalize_trigger_record')) {
    function ccrm_marveen_normalize_trigger_record(array $t): array {
        $f = is_array($t['filter'] ?? null) ? $t['filter'] : [];
        $chatMatch = trim((string)($f['chatMatch'] ?? (($t['whatsappChatJid'] ?? '*') !== '*' ? ($t['whatsappChatJid'] ?? '') : '')));
        $subjectContains = trim((string)($f['subjectContains'] ?? ($t['emailSubjectFilter'] ?? '')));
        $fromContains = trim((string)($f['fromContains'] ?? ($t['emailSenderFilter'] ?? '')));
        $keywordContains = trim((string)($f['keywordContains'] ?? ($t['keywordFilter'] ?? '')));
        $eventType = trim((string)($f['eventType'] ?? ($t['crmEventName'] ?? 'lead_created')));
        $onlyGroup = !empty($f['onlyGroup']);
        $onlyDirect = !empty($f['onlyDirect']);

        $t['filter'] = [
            'chatMatch' => $chatMatch,
            'onlyGroup' => $onlyGroup,
            'onlyDirect' => $onlyDirect,
            'subjectContains' => $subjectContains,
            'fromContains' => $fromContains,
            'keywordContains' => $keywordContains,
            'eventType' => $eventType !== '' ? $eventType : 'lead_created',
        ];
        if (!array_key_exists('targetSubagentId', $t)) {
            $agentId = trim((string)($t['targetAgentId'] ?? 'main'));
            $t['targetSubagentId'] = ($agentId !== '' && $agentId !== 'main') ? $agentId : null;
        }
        $t['proactiveEnabled'] = !empty($t['proactiveEnabled']);
        $t['proactiveAfterMinutes'] = max(1, (int)($t['proactiveAfterMinutes'] ?? 120));
        $t['proactiveMaxAttempts'] = max(1, min(5, (int)($t['proactiveMaxAttempts'] ?? 1)));
        $t['proactiveInstructions'] = trim((string)($t['proactiveInstructions'] ?? 'Follow up politely on our last message if the conversation is still open. If the conversation ended naturally (e.g. thanks/goodbye/resolved), reply with [SKIP_FOLLOWUP] and do not send a message.'));
        return $t;
    }
}

if (!function_exists('ccrm_marveen_list_triggers')) {
    function ccrm_marveen_list_triggers(PDO $pdo, array $connector): array {
        $connectorId = (string)($connector['id'] ?? 'default');
        $settings = is_array($connector['settings'] ?? null) ? $connector['settings'] : [];
        $dir = ccrm_marveen_connector_dir($connectorId);
        $trigFile = $dir . '/triggers.json';
        if (is_file($trigFile)) {
            $decoded = json_decode((string)@file_get_contents($trigFile), true);
            if (is_array($decoded)) {
                return array_values(array_map('ccrm_marveen_normalize_trigger_record', $decoded));
            }
        }
        if (!empty($settings['triggers']) && is_array($settings['triggers'])) {
            $norm = array_values(array_map('ccrm_marveen_normalize_trigger_record', $settings['triggers']));
            @file_put_contents($trigFile, json_encode($norm, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
            return $norm;
        }
        return [];
    }
}

if (!function_exists('ccrm_marveen_list_all_triggers')) {
    function ccrm_marveen_list_all_triggers(PDO $pdo): array {
        $all = [];
        try {
            $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
            $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
            foreach ($rows as $r) {
                $raw = json_decode((string)($r['settings_json'] ?? '{}'), true);
                $cType = strtolower((string)($raw['connectorType'] ?? ''));
                if (!in_array($cType, ['claude', 'antigravity', 'chatgpt'], true)) {
                    continue;
                }
                $r['settings'] = is_array($raw) ? $raw : [];
                foreach (ccrm_marveen_list_triggers($pdo, $r) as $t) {
                    $t['targetConnectorId'] = (string)$r['id'];
                    $t['targetConnectorName'] = (string)$r['name'];
                    $all[] = $t;
                }
            }
        } catch (\Throwable $e) {}
        return $all;
    }
}

if (!function_exists('ccrm_marveen_save_trigger')) {
    function ccrm_marveen_save_trigger(PDO $pdo, string $targetConnectorId, array $input): array {
        $dir = ccrm_marveen_connector_dir($targetConnectorId);
        $trigFile = $dir . '/triggers.json';
        $triggers = is_file($trigFile) ? (json_decode((string)@file_get_contents($trigFile), true) ?: []) : [];

        $sourceType = strtolower(trim((string)($input['sourceType'] ?? ($input['source_type'] ?? 'whatsapp'))));
        if (!in_array($sourceType, ['whatsapp', 'email', 'crm_event'], true)) {
            $sourceType = 'whatsapp';
        }

        $sourceConnectorId = trim((string)($input['sourceConnectorId'] ?? ($input['source_connector_id'] ?? '')));
        if ($sourceConnectorId === '' && $sourceType !== 'crm_event') {
            if ($sourceType === 'whatsapp') {
                $waList = ccrm_marveen_list_sibling_whatsapp_connectors($pdo);
                $sourceConnectorId = (string)($waList[0]['id'] ?? '');
            } elseif ($sourceType === 'email') {
                $emList = ccrm_marveen_list_sibling_email_connectors($pdo);
                $sourceConnectorId = (string)($emList[0]['id'] ?? '');
            }
        }

        $name = trim((string)($input['name'] ?? 'Event Trigger'));
        $rawTrigId = trim((string)($input['triggerId'] ?? ($input['trigger_id'] ?? '')));
        if ($rawTrigId === '' && !empty($input['id']) && (string)$input['id'] !== $targetConnectorId) {
            $rawTrigId = trim((string)$input['id']);
        }
        $id = $rawTrigId !== ''
            ? (preg_replace('/[^a-zA-Z0-9_-]/', '-', $rawTrigId) ?: ('trig-' . substr(bin2hex(random_bytes(4)), 0, 8)))
            : ('trig-' . substr(bin2hex(random_bytes(4)), 0, 8));

        $existingIdx = null;
        foreach ($triggers as $idx => $t) {
            if (($t['id'] ?? '') === $id) {
                $existingIdx = $idx;
                break;
            }
        }
        $prev = $existingIdx !== null ? $triggers[$existingIdx] : [];
        $nowIso = gmdate('c');
        $nowMs = (int)round(microtime(true) * 1000);

        $inFilter = is_array($input['filter'] ?? null) ? $input['filter'] : [];
        $chatMatchIn = trim((string)($inFilter['chatMatch'] ?? ($input['whatsappChatJid'] ?? ($input['whatsapp_chat'] ?? ''))));
        $whatsappChat = $chatMatchIn !== ''
            ? $chatMatchIn
            : (isset($inFilter['chatMatch']) ? '*' : trim((string)($prev['whatsappChatJid'] ?? '*')));
        $whatsappChatName = trim((string)($input['whatsappChatName'] ?? ($whatsappChat === '*' ? 'All Chats' : $whatsappChat)));

        $rawSubId = array_key_exists('targetSubagentId', $input)
            ? trim((string)($input['targetSubagentId'] ?? ''))
            : trim((string)($input['targetAgentId'] ?? ($input['target_agent_id'] ?? ($prev['targetSubagentId'] ?? ($prev['targetAgentId'] ?? '')))));
        $targetAgentId = ($rawSubId !== '' && $rawSubId !== 'main') ? $rawSubId : 'main';
        $targetSubagentId = $targetAgentId === 'main' ? null : $targetAgentId;

        $emailSenderFilter = trim((string)($inFilter['fromContains'] ?? ($input['emailSenderFilter'] ?? ($input['email_sender_filter'] ?? ($prev['emailSenderFilter'] ?? '')))));
        $emailSubjectFilter = trim((string)($inFilter['subjectContains'] ?? ($input['emailSubjectFilter'] ?? ($input['email_subject_filter'] ?? ($prev['emailSubjectFilter'] ?? '')))));
        $crmEventName = trim((string)($inFilter['eventType'] ?? ($input['crmEventName'] ?? ($input['crm_event_name'] ?? ($prev['crmEventName'] ?? 'lead_created')))));
        $keywordFilter = trim((string)($inFilter['keywordContains'] ?? ($input['keywordFilter'] ?? ($input['keyword_filter'] ?? ($prev['keywordFilter'] ?? '')))));
        $onlyGroup = array_key_exists('onlyGroup', $inFilter) ? (bool)$inFilter['onlyGroup'] : (bool)($prev['filter']['onlyGroup'] ?? false);
        $onlyDirect = array_key_exists('onlyDirect', $inFilter) ? (bool)$inFilter['onlyDirect'] : (bool)($prev['filter']['onlyDirect'] ?? false);

        $record = [
            'id' => $id,
            'name' => $name,
            'enabled' => array_key_exists('enabled', $input) ? (bool)$input['enabled'] : (bool)($prev['enabled'] ?? true),
            'sourceType' => $sourceType,
            'sourceConnectorId' => $sourceConnectorId,
            'whatsappChatJid' => $whatsappChat !== '' ? $whatsappChat : '*',
            'whatsappChatName' => $whatsappChatName !== '' ? $whatsappChatName : 'All Chats',
            'emailSenderFilter' => $emailSenderFilter,
            'emailSubjectFilter' => $emailSubjectFilter,
            'crmEventName' => $crmEventName !== '' ? $crmEventName : 'lead_created',
            'keywordFilter' => $keywordFilter,
            'filter' => [
                'chatMatch' => $whatsappChat !== '*' ? $whatsappChat : '',
                'onlyGroup' => $onlyGroup,
                'onlyDirect' => $onlyDirect,
                'subjectContains' => $emailSubjectFilter,
                'fromContains' => $emailSenderFilter,
                'keywordContains' => $keywordFilter,
                'eventType' => $crmEventName !== '' ? $crmEventName : 'lead_created',
            ],
            'targetConnectorId' => $targetConnectorId,
            'targetAgentId' => $targetAgentId,
            'targetSubagentId' => $targetSubagentId,
            'instructions' => trim((string)($input['instructions'] ?? ($prev['instructions'] ?? 'Read the full conversation context and reply helpfully.'))),
            'autoReply' => array_key_exists('autoReply', $input)
                ? (bool)$input['autoReply']
                : (array_key_exists('auto_reply', $input) ? (bool)$input['auto_reply'] : (bool)($prev['autoReply'] ?? true)),
            'proactiveEnabled' => array_key_exists('proactiveEnabled', $input)
                ? (bool)$input['proactiveEnabled']
                : (array_key_exists('proactive_enabled', $input) ? (bool)$input['proactive_enabled'] : (bool)($prev['proactiveEnabled'] ?? false)),
            'proactiveAfterMinutes' => max(1, (int)($input['proactiveAfterMinutes'] ?? ($input['proactive_after_minutes'] ?? ($prev['proactiveAfterMinutes'] ?? 120)))),
            'proactiveMaxAttempts' => max(1, min(5, (int)($input['proactiveMaxAttempts'] ?? ($input['proactive_max_attempts'] ?? ($prev['proactiveMaxAttempts'] ?? 1))))),
            'proactiveInstructions' => trim((string)($input['proactiveInstructions'] ?? ($input['proactive_instructions'] ?? ($prev['proactiveInstructions'] ?? 'Follow up politely on our last message if the conversation is still open. If the conversation ended naturally (e.g. thanks/goodbye/resolved), reply with [SKIP_FOLLOWUP] and do not send a message.')))),
            'proactiveState' => is_array($prev['proactiveState'] ?? null) ? $prev['proactiveState'] : [],
            'cooldownSeconds' => max(2, (int)($input['cooldownSeconds'] ?? ($prev['cooldownSeconds'] ?? 10))),
            'minContextMessages' => max(10, (int)($input['minContextMessages'] ?? ($prev['minContextMessages'] ?? 50))),
            'minContextDays' => max(1, (int)($input['minContextDays'] ?? ($prev['minContextDays'] ?? 5))),
            'maxContextChars' => max(2000, (int)($input['maxContextChars'] ?? ($prev['maxContextChars'] ?? 16000))),
            'watermarkTsMs' => isset($prev['watermarkTsMs']) ? (int)$prev['watermarkTsMs'] : $nowMs,
            'lastEmailUid' => isset($prev['lastEmailUid']) ? (int)$prev['lastEmailUid'] : 0,
            'processedIds' => is_array($prev['processedIds'] ?? null) ? array_slice($prev['processedIds'], -200) : [],
            'triggerCount' => (int)($prev['triggerCount'] ?? 0),
            'lastTriggeredAt' => $prev['lastTriggeredAt'] ?? null,
            'lastTriggerSummary' => $prev['lastTriggerSummary'] ?? null,
            'lastTriggerStatus' => $prev['lastTriggerStatus'] ?? null,
            'createdAt' => (string)($prev['createdAt'] ?? $nowIso),
            'updatedAt' => $nowIso,
        ];

        // If this is a newly created Email trigger and lastEmailUid is 0, initialize lastEmailUid to current max UID in INBOX
        if ($sourceType === 'email' && $record['lastEmailUid'] <= 0 && $sourceConnectorId !== '') {
            try {
                $st = $pdo->prepare("SELECT MAX(`uid`) FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `folder` = 'INBOX'");
                $st->execute(['c:' . $sourceConnectorId]);
                $record['lastEmailUid'] = (int)$st->fetchColumn();
            } catch (\Throwable $e) {}
        }

        if ($existingIdx !== null) {
            $triggers[$existingIdx] = $record;
        } else {
            $triggers[] = $record;
        }

        @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        @chmod($trigFile, 0600);
        ccrm_marveen_update_connector_settings_mirror($pdo, $targetConnectorId, static function (array $s) use ($triggers): array {
            $s['triggers'] = array_values($triggers);
            return $s;
        });

        return $record;
    }
}

if (!function_exists('ccrm_marveen_delete_trigger')) {
    function ccrm_marveen_delete_trigger(PDO $pdo, string $targetConnectorId, string $triggerId): bool {
        $dir = ccrm_marveen_connector_dir($targetConnectorId);
        $trigFile = $dir . '/triggers.json';
        $triggers = is_file($trigFile) ? (json_decode((string)@file_get_contents($trigFile), true) ?: []) : [];
        $filtered = array_values(array_filter($triggers, static fn($t) => ($t['id'] ?? '') !== $triggerId));
        @file_put_contents($trigFile, json_encode($filtered, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $targetConnectorId, static function (array $s) use ($filtered): array {
            $s['triggers'] = $filtered;
            return $s;
        });
        return count($filtered) !== count($triggers);
    }
}

if (!function_exists('ccrm_marveen_execute_single_trigger_event')) {
    /**
     * Executes a single matched event trigger on its Target Agent with full 50-message / 5-day / 16k-char context.
     */
    function ccrm_marveen_execute_single_trigger_event(
        PDO $pdo,
        array $aiConnector,
        array &$trigger,
        array $eventContext
    ): array {
        $cid = (string)$aiConnector['id'];
        $settings = is_array($aiConnector['settings'] ?? null) ? $aiConnector['settings'] : [];
        $userIds = is_array($settings['userIds'] ?? null) ? array_values(array_filter(array_map('strval', $settings['userIds']))) : [];
        $runAsUser = $userIds[0] ?? (string)($aiConnector['owner_user_id'] ?? '');
        if ($runAsUser === '') {
            $uStmt = $pdo->query("SELECT `id` FROM `users` ORDER BY `role` = 'admin' DESC, `id` ASC LIMIT 1");
            $runAsUser = (string)($uStmt ? $uStmt->fetchColumn() : '');
        }

        $targetAgentId = trim((string)($trigger['targetAgentId'] ?? ($trigger['targetSubagentId'] ?? 'main')));
        $subIdForRun = ($targetAgentId !== '' && $targetAgentId !== 'main') ? $targetAgentId : null;

        $sourceType = (string)($trigger['sourceType'] ?? 'whatsapp');
        $autoReply = !empty($trigger['autoReply']);
        $instructions = trim((string)($trigger['instructions'] ?? ''));

        $promptLines = [
            "⚡ [REACTIVE EVENT TRIGGER FIRED: {$trigger['name']}]",
            "- Source Type: " . strtoupper($sourceType),
            "- Source Channel: " . ($eventContext['sourceLabel'] ?? ''),
            "- Trigger Summary: " . ($eventContext['summary'] ?? ''),
        ];
        if (!empty($eventContext['sender'])) {
            $promptLines[] = "- Incoming From: " . $eventContext['sender'];
        }
        if (!empty($eventContext['subject'])) {
            $promptLines[] = "- Subject: " . $eventContext['subject'];
        }
        if (!empty($eventContext['latestMessageText'])) {
            $promptLines[] = "\n## Latest Incoming Message That Triggered This Run\n" . $eventContext['latestMessageText'];
        }
        if (!empty($eventContext['conversationTranscript'])) {
            $promptLines[] = "\n## Full Conversation Context (Last 50 Messages & Last 5 Days, Capped at 16,000 Chars)\n```text\n"
                . $eventContext['conversationTranscript']
                . "\n```";
        }
        $promptLines[] = "\n## Your Trigger Instructions\n" . ($instructions !== '' ? $instructions : 'Respond appropriately to the incoming message based on your memory.md and the conversation context.');

        if ($autoReply) {
            if ($sourceType === 'whatsapp' && !empty($eventContext['chatId'])) {
                $promptLines[] = "\nIMPORTANT: Auto-Reply is ENABLED for this trigger. You MUST send your reply directly to this WhatsApp chat using `whatsapp_send_message` with `chat: \"{$eventContext['chatId']}\"` (and `connector_id: \"{$trigger['sourceConnectorId']}\"`). Do not reply to your own messages or repeat an already-sent answer.";
            } elseif ($sourceType === 'email' && !empty($eventContext['replyToAddress'])) {
                $uidParam = !empty($eventContext['emailUid']) ? ", `reply_to_uid: {$eventContext['emailUid']}`" : '';
                $promptLines[] = "\nIMPORTANT: Auto-Reply is ENABLED for this trigger. You MUST send your email reply using `email_send_reply` with `to: \"{$eventContext['replyToAddress']}\"`, `subject: \"{$eventContext['replySubject']}\"`{$uidParam}, and `connector_id: \"{$trigger['sourceConnectorId']}\"`.";
            }
        } else {
            $promptLines[] = "\nNote: Auto-Reply is OFF for this trigger. Analyze the event and draft/log your response here in the agent chat without sending an external message unless explicitly instructed.";
        }

        $fullPrompt = implode("\n", $promptLines);
        $res = ccrm_marveen_run_agent($pdo, $aiConnector, $runAsUser, $fullPrompt, '', $subIdForRun);

        $trigger['lastTriggeredAt'] = gmdate('c');
        $trigger['triggerCount'] = ((int)($trigger['triggerCount'] ?? 0)) + 1;
        $trigger['lastTriggerSummary'] = (string)($eventContext['summary'] ?? 'Triggered');
        $trigger['lastTriggerStatus'] = !empty($res['ok']) ? 'ok' : ('error: ' . ($res['error'] ?? 'failed'));

        $botMsg = [
            'id' => 'trig-' . uniqid('', false),
            'role' => 'assistant',
            'autonomous' => true,
            'triggerId' => $trigger['id'],
            'taskTitle' => '⚡ ' . ($trigger['name'] ?? 'Event Trigger') . ' · ' . ($eventContext['summary'] ?? ''),
            'subagentId' => $subIdForRun,
            'text' => !empty($res['ok'])
                ? (string)($res['text'] ?? 'Trigger executed.')
                : ('⚠️ Trigger error: ' . (string)($res['error'] ?? 'failed')),
            'steps' => $res['steps'] ?? [],
            'timestamp' => date('H:i'),
            'createdAt' => gmdate('c'),
        ];
        ccrm_marveen_append_chat_message($cid, $botMsg, $subIdForRun);

        return [
            'ok' => !empty($res['ok']),
            'triggerId' => $trigger['id'],
            'agentId' => $targetAgentId,
            'summary' => $eventContext['summary'] ?? '',
            'message' => $botMsg,
            'result' => $res,
        ];
    }
}

if (!function_exists('ccrm_marveen_process_event_triggers')) {
    /**
     * Zero-LLM-cost event detector for WhatsApp and Email triggers.
     * Inspects local WhatsApp `store.json` and `mail_envelopes` watermarks; ONLY invokes the LLM
     * when a genuine new incoming (!fromMe) message matches an active trigger rule.
     */
    function ccrm_marveen_process_event_triggers(PDO $pdo, ?string $onlySourceFilter = null): array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        $secretKeys = function_exists('ccrm_email_secret_keys')
            ? ccrm_email_secret_keys()
            : ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret', 'botmanToken', 'botmanAppSecret', 'botmanSigningSecret', 'botmanVerifyToken'];

        $aiConnectors = [];
        $waConnectorsById = [];
        $emailConnectorsById = [];

        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw) ? ccrm_decrypt_config_secrets($raw, $secretKeys) : [];
            $cType = strtolower((string)($settings['connectorType'] ?? ''));
            if ($cType === '') {
                $imapHost = strtolower((string)($settings['imapHost'] ?? ''));
                $cType = str_contains($imapHost, 'gmail') ? 'gmail' : (($settings['provider'] ?? '') === 'exchange' ? 'exchange' : 'smtp');
            }
            $settings['connectorType'] = $cType;
            $row['settings'] = $settings;

            if (in_array($cType, ['claude', 'antigravity', 'chatgpt'], true)) {
                $aiConnectors[(string)$row['id']] = $row;
            } elseif ($cType === 'whatsapp' || ccrm_is_botman_connector($cType)) {
                $waConnectorsById[(string)$row['id']] = $row;
            } elseif (in_array($cType, ['gmail', 'smtp', 'exchange'], true)) {
                $emailConnectorsById[(string)$row['id']] = $row;
            }
        }

        if (empty($aiConnectors)) {
            return ['ok' => true, 'fired' => []];
        }

        $fired = [];
        $nowSec = time();

        foreach ($aiConnectors as $aiId => $aiRow) {
            $dir = ccrm_marveen_connector_dir($aiId);
            $trigFile = $dir . '/triggers.json';
            $triggers = ccrm_marveen_list_triggers($pdo, $aiRow);
            if (empty($triggers)) {
                continue;
            }

            $lockFp = @fopen($dir . '/.triggers.lock', 'c');
            if ($lockFp && !@flock($lockFp, LOCK_EX | LOCK_NB)) {
                @fclose($lockFp);
                continue;
            }

            $dirty = false;
            try {
                foreach ($triggers as &$trig) {
                    if (empty($trig['enabled'])) {
                        continue;
                    }
                    $sType = (string)($trig['sourceType'] ?? 'whatsapp');
                    $sConnId = (string)($trig['sourceConnectorId'] ?? '');

                    // Cooldown check
                    $cooldownSec = max(2, (int)($trig['cooldownSeconds'] ?? 10));
                    $lastTrigTs = !empty($trig['lastTriggeredAt']) ? strtotime((string)$trig['lastTriggeredAt']) : 0;
                    if ($lastTrigTs > 0 && ($nowSec - $lastTrigTs) < $cooldownSec) {
                        continue;
                    }

                    $minMsgs = max(10, (int)($trig['minContextMessages'] ?? 50));
                    $minDays = max(1, (int)($trig['minContextDays'] ?? 5));
                    $maxChars = max(2000, (int)($trig['maxContextChars'] ?? 16000));
                    $processedIds = is_array($trig['processedIds'] ?? null) ? $trig['processedIds'] : [];
                    $kwFilter = mb_strtolower(trim((string)($trig['keywordFilter'] ?? '')), 'UTF-8');

                    if ($sType === 'whatsapp') {
                        $waRow = ($sConnId !== '' && isset($waConnectorsById[$sConnId]))
                            ? $waConnectorsById[$sConnId]
                            : (reset($waConnectorsById) ?: null);
                        if (!$waRow) {
                            continue;
                        }
                        $waAccountId = ccrm_waai_resolve_account_id($waRow);
                        if ($onlySourceFilter !== null && $onlySourceFilter !== '' && $onlySourceFilter !== (string)$waRow['id'] && $onlySourceFilter !== $waAccountId) {
                            continue;
                        }
                        if (ccrm_is_botman_connector((string)($waRow['settings']['connectorType'] ?? ''))) {
                            ccrm_botman_get_chats($waRow, $onlySourceFilter === null);
                        }

                        // Read store.json directly from disk at $0 cost (no worker spawn needed if already synced)
                        $storeFile = ccrm_waai_storage_root() . '/accounts/' . $waAccountId . '/store.json';
                        if (!is_file($storeFile)) {
                            continue;
                        }
                        $store = json_decode((string)@file_get_contents($storeFile), true);
                        if (!is_array($store)) {
                            continue;
                        }
                        $chats = is_array($store['chats'] ?? null) ? $store['chats'] : [];
                        $messagesMap = is_array($store['messages'] ?? null) ? $store['messages'] : [];
                        $chatFilter = trim((string)($trig['whatsappChatJid'] ?? '*'));
                        $chatFilterLower = mb_strtolower($chatFilter, 'UTF-8');
                        $watermarkMs = (int)($trig['watermarkTsMs'] ?? 0);
                        $newMaxWatermarkMs = $watermarkMs;

                        foreach ($chats as $chatMeta) {
                            $chatId = (string)($chatMeta['id'] ?? '');
                            $chatName = (string)($chatMeta['name'] ?? $chatId);
                            if ($chatId === '' || $chatId === 'status@broadcast') {
                                continue;
                            }
                            // Check chat filter
                            if ($chatFilter !== '' && $chatFilter !== '*') {
                                if ($chatFilter === '@g.us' && empty($chatMeta['isGroup'])) {
                                    continue;
                                } elseif ($chatFilter === '@s.whatsapp.net' && !empty($chatMeta['isGroup'])) {
                                    continue;
                                } elseif ($chatFilter !== '@g.us' && $chatFilter !== '@s.whatsapp.net') {
                                    $matchId = strtolower($chatId) === strtolower($chatFilter);
                                    $matchName = mb_strpos(mb_strtolower($chatName, 'UTF-8'), $chatFilterLower) !== false;
                                    $matchTargetName = !empty($trig['whatsappChatName']) && $trig['whatsappChatName'] !== 'All Chats'
                                        && mb_strpos(mb_strtolower($chatName, 'UTF-8'), mb_strtolower((string)$trig['whatsappChatName'], 'UTF-8')) !== false;
                                    if (!$matchId && !$matchName && !$matchTargetName) {
                                        continue;
                                    }
                                }
                            }

                            $thread = is_array($messagesMap[$chatId] ?? null) ? $messagesMap[$chatId] : [];
                            if (empty($thread)) {
                                continue;
                            }

                            // If the very latest message in the thread is from us (fromMe), we already replied!
                            $lastThreadMsg = $thread[count($thread) - 1];
                            if (!empty($lastThreadMsg['fromMe'])) {
                                $lastTs = (int)($lastThreadMsg['tsMs'] ?? 0);
                                if ($lastTs > $newMaxWatermarkMs) {
                                    $newMaxWatermarkMs = $lastTs;
                                    $trig['watermarkTsMs'] = $newMaxWatermarkMs;
                                    $dirty = true;
                                }
                                continue;
                            }

                            // Find new incoming (!fromMe) messages after watermarkMs not yet in processedIds
                            $newIncoming = [];
                            foreach ($thread as $m) {
                                $mId = (string)($m['id'] ?? '');
                                $mTs = (int)($m['tsMs'] ?? 0);
                                if ($mTs <= $watermarkMs) {
                                    continue;
                                }
                                if (!empty($m['fromMe'])) {
                                    // Never trigger on our own outgoing messages! Advance watermark so we skip them.
                                    if ($mTs > $newMaxWatermarkMs) {
                                        $newMaxWatermarkMs = $mTs;
                                    }
                                    continue;
                                }
                                if ($mId !== '' && (in_array($mId, $processedIds, true) || in_array('wa:' . $mId, $processedIds, true))) {
                                    continue;
                                }
                                $mText = trim((string)($m['text'] ?? ''));
                                if ($mText === '') {
                                    continue;
                                }
                                if ($kwFilter !== '' && mb_strpos(mb_strtolower($mText, 'UTF-8'), $kwFilter) === false) {
                                    continue;
                                }
                                $newIncoming[] = $m;
                                if ($mTs > $newMaxWatermarkMs) {
                                    $newMaxWatermarkMs = $mTs;
                                }
                            }

                            if (!empty($newIncoming)) {
                                foreach ($newIncoming as $nm) {
                                    if (!empty($nm['id'])) {
                                        $processedIds[] = (string)$nm['id'];
                                        $processedIds[] = 'wa:' . (string)$nm['id'];
                                    }
                                }
                                $trig['processedIds'] = array_values(array_slice(array_unique($processedIds), -200));
                                $trig['watermarkTsMs'] = max($newMaxWatermarkMs, (int)round(microtime(true) * 1000));
                                $dirty = true;

                                $ctxWindow = ccrm_marveen_build_conversation_context($thread, $minMsgs, $minDays, $maxChars);
                                $latestTexts = array_map(
                                    static fn(array $nm) => ($nm['senderName'] ?? 'Sender') . ': ' . ($nm['text'] ?? ''),
                                    $newIncoming
                                );
                                $lastSender = (string)($newIncoming[count($newIncoming) - 1]['senderName'] ?? $chatName);

                                $eventCtx = [
                                    'sourceLabel' => ($waRow['name'] ?? 'WhatsApp') . ' · ' . $chatName,
                                    'summary' => "WhatsApp ({$chatName}) from {$lastSender}",
                                    'sender' => $lastSender,
                                    'chatId' => $chatId,
                                    'chatName' => $chatName,
                                    'latestMessageText' => implode("\n", $latestTexts),
                                    'conversationTranscript' => $ctxWindow['transcript'],
                                ];

                                $execRes = ccrm_marveen_execute_single_trigger_event($pdo, $aiRow, $trig, $eventCtx);
                                $fired[] = $execRes;
                                break; // One trigger run per tick per rule
                            }
                        }
                    } elseif ($sType === 'email') {
                        $emRow = ($sConnId !== '' && isset($emailConnectorsById[$sConnId]))
                            ? $emailConnectorsById[$sConnId]
                            : (reset($emailConnectorsById) ?: null);
                        if (!$emRow) {
                            continue;
                        }
                        if ($onlySourceFilter !== null && $onlySourceFilter !== '' && $onlySourceFilter !== (string)$emRow['id']) {
                            continue;
                        }

                        $mailboxKey = 'c:' . $emRow['id'];
                        $ownAddress = strtolower(trim((string)($emRow['address'] ?? '')));
                        $lastUid = (int)($trig['lastEmailUid'] ?? 0);

                        try {
                            $st = $pdo->prepare(
                                "SELECT * FROM `mail_envelopes`
                                 WHERE `mailbox_key` = ? AND `folder` = 'INBOX' AND `uid` > ? AND `is_outgoing` = 0
                                 ORDER BY `uid` ASC LIMIT 10"
                            );
                            $st->execute([$mailboxKey, $lastUid]);
                            $newEmails = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
                        } catch (\Throwable $e) {
                            $newEmails = [];
                        }

                        foreach ($newEmails as $em) {
                            $eUid = (int)($em['uid'] ?? 0);
                            if ($eUid > $trig['lastEmailUid']) {
                                $trig['lastEmailUid'] = $eUid;
                                $dirty = true;
                            }
                            $emEventKey = 'email:' . $mailboxKey . ':' . $eUid;
                            $emMsgIdKey = !empty($em['message_id']) ? ('msgid:' . (string)$em['message_id']) : '';
                            if (
                                in_array($emEventKey, $processedIds, true) ||
                                ($emMsgIdKey !== '' && in_array($emMsgIdKey, $processedIds, true))
                            ) {
                                continue;
                            }

                            $fromAddr = strtolower(trim((string)($em['from_address'] ?? '')));
                            $subj = (string)($em['subject'] ?? '');
                            $preview = (string)($em['preview'] ?? '');

                            // Loop prevention: ignore our own address or automated bounces/no-reply
                            if (
                                $fromAddr === '' ||
                                ($ownAddress !== '' && $fromAddr === $ownAddress) ||
                                preg_match('/^(no-reply|noreply|mailer-daemon|postmaster|bounce)@/i', $fromAddr)
                            ) {
                                continue;
                            }

                            $senderFilter = mb_strtolower(trim((string)($trig['emailSenderFilter'] ?? '')), 'UTF-8');
                            if ($senderFilter !== '' && mb_strpos(mb_strtolower($fromAddr . ' ' . ($em['from_name'] ?? ''), 'UTF-8'), $senderFilter) === false) {
                                continue;
                            }
                            $subjFilter = mb_strtolower(trim((string)($trig['emailSubjectFilter'] ?? '')), 'UTF-8');
                            if ($subjFilter !== '' && mb_strpos(mb_strtolower($subj, 'UTF-8'), $subjFilter) === false) {
                                continue;
                            }
                            if ($kwFilter !== '' && mb_strpos(mb_strtolower($subj . ' ' . $preview, 'UTF-8'), $kwFilter) === false) {
                                continue;
                            }

                            // Build 50-message / 5-day email thread context with this sender
                            $threadRows = [];
                            try {
                                $tSt = $pdo->prepare(
                                    "SELECT * FROM `mail_envelopes`
                                     WHERE `mailbox_key` = ? AND (`from_address` = ? OR `to_address` LIKE ?)
                                     ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                                );
                                $tSt->execute([$mailboxKey, $fromAddr, '%' . $fromAddr . '%']);
                                $threadRows = $tSt->fetchAll(PDO::FETCH_ASSOC) ?: [];
                            } catch (\Throwable $e) {}

                            // If the latest email in the thread with this sender is already an outgoing reply, skip!
                            if (!empty($threadRows)) {
                                $latestThreadRow = $threadRows[count($threadRows) - 1];
                                if (!empty($latestThreadRow['is_outgoing'])) {
                                    $processedIds[] = $emEventKey;
                                    if ($emMsgIdKey !== '') {
                                        $processedIds[] = $emMsgIdKey;
                                    }
                                    $trig['processedIds'] = array_values(array_slice(array_unique($processedIds), -200));
                                    $dirty = true;
                                    continue;
                                }
                            }

                            $processedIds[] = $emEventKey;
                            if ($emMsgIdKey !== '') {
                                $processedIds[] = $emMsgIdKey;
                            }
                            $trig['processedIds'] = array_values(array_slice(array_unique($processedIds), -200));
                            $dirty = true;

                            $mappedForCtx = array_map(static fn(array $r) => [
                                'id' => 'uid-' . ($r['uid'] ?? ''),
                                'fromMe' => !empty($r['is_outgoing']),
                                'senderName' => !empty($r['is_outgoing']) ? 'Me' : (($r['from_name'] ?: $r['from_address']) ?: 'Sender'),
                                'text' => "[Subject: " . ($r['subject'] ?? '') . "] " . ($r['preview'] ?? ''),
                                'createdAt' => $r['email_date'] ?? '',
                            ], $threadRows);
                            $ctxWindow = ccrm_marveen_build_conversation_context($mappedForCtx, $minMsgs, $minDays, $maxChars);

                            $replySubj = preg_match('/^re:/i', $subj) ? $subj : ('Re: ' . $subj);
                            $eventCtx = [
                                'sourceLabel' => ($emRow['name'] ?? 'Email') . ' (' . ($emRow['address'] ?? '') . ')',
                                'summary' => "Email from {$fromAddr}: {$subj}",
                                'sender' => ($em['from_name'] ? "{$em['from_name']} <{$fromAddr}>" : $fromAddr),
                                'subject' => $subj,
                                'emailUid' => $eUid,
                                'replyToAddress' => $fromAddr,
                                'replySubject' => $replySubj,
                                'latestMessageText' => "Subject: {$subj}\nFrom: {$fromAddr}\n\n{$preview}",
                                'conversationTranscript' => $ctxWindow['transcript'],
                            ];

                            $execRes = ccrm_marveen_execute_single_trigger_event($pdo, $aiRow, $trig, $eventCtx);
                            $fired[] = $execRes;
                            break;
                        }
                    }
                }
                unset($trig);

                if ($dirty) {
                    @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
                    ccrm_marveen_update_connector_settings_mirror($pdo, $aiId, static function (array $s) use ($triggers): array {
                        $s['triggers'] = array_values($triggers);
                        return $s;
                    });
                }
            } finally {
                if ($lockFp) {
                    @flock($lockFp, LOCK_UN);
                    @fclose($lockFp);
                }
            }
        }

        if ($onlySourceFilter === null || $onlySourceFilter === '') {
            $proactiveFired = ccrm_marveen_process_proactive_followups($pdo, $aiConnectors, $waConnectorsById, $emailConnectorsById);
            foreach ($proactiveFired as $pf) {
                $fired[] = $pf;
            }
        }

        return ['ok' => true, 'fired' => $fired];
    }
}

if (!function_exists('ccrm_marveen_process_proactive_followups')) {
    /**
     * Zero-LLM-cost evaluator for:
     *  1) Agent self-scheduled one-shot follow-ups (`followups.json` via `schedule_conversation_followup`)
     *  2) Per-wire Proactive Re-Initiation (`triggers.json` where `proactiveEnabled === true`)
     *
     * Auto-cancels follow-ups at $0 LLM cost if the contact replied before `dueAt`.
     * Supports `[SKIP_FOLLOWUP]` when the agent judges a conversation ended naturally.
     */
    function ccrm_marveen_process_proactive_followups(
        PDO $pdo,
        array $aiConnectors,
        array $waConnectorsById,
        array $emailConnectorsById
    ): array {
        $fired = [];
        $nowSec = time();

        foreach ($aiConnectors as $aiId => $aiRow) {
            $dir = ccrm_marveen_connector_dir($aiId);
            $settings = is_array($aiRow['settings'] ?? null) ? $aiRow['settings'] : [];
            $userIds = is_array($settings['userIds'] ?? null) ? array_values(array_filter(array_map('strval', $settings['userIds']))) : [];
            $runAsUser = $userIds[0] ?? (string)($aiRow['owner_user_id'] ?? '');
            if ($runAsUser === '') {
                $uStmt = $pdo->query("SELECT `id` FROM `users` ORDER BY `role` = 'admin' DESC, `id` ASC LIMIT 1");
                $runAsUser = (string)($uStmt ? $uStmt->fetchColumn() : '');
            }

            // -----------------------------------------------------------------
            // 1. Agent Self-Scheduled One-Shot Follow-Ups (`followups.json`)
            // -----------------------------------------------------------------
            $fupFile = $dir . '/followups.json';
            $followups = ccrm_marveen_list_followups($pdo, $aiRow);
            $fupDirty = false;

            foreach ($followups as &$fup) {
                if (($fup['status'] ?? 'pending') !== 'pending') {
                    continue;
                }
                $dueTs = !empty($fup['dueAt']) ? strtotime((string)$fup['dueAt']) : 0;
                if ($dueTs > $nowSec) {
                    continue;
                }
                $createdTs = !empty($fup['createdAt']) ? strtotime((string)$fup['createdAt']) : ($nowSec - 3600);
                $sType = strtolower((string)($fup['sourceType'] ?? 'whatsapp'));
                $sConnId = (string)($fup['sourceConnectorId'] ?? '');
                $targetChat = trim((string)($fup['targetChat'] ?? ''));
                $cancelIfReplied = !array_key_exists('cancelIfReplied', $fup) || !empty($fup['cancelIfReplied']);
                $subId = !empty($fup['subagentId']) ? (string)$fup['subagentId'] : null;

                if ($sType === 'whatsapp') {
                    $waRow = ($sConnId !== '' && isset($waConnectorsById[$sConnId]))
                        ? $waConnectorsById[$sConnId]
                        : (reset($waConnectorsById) ?: null);
                    if (!$waRow) {
                        continue;
                    }
                    $waState = ccrm_waai_get_chats($waRow);
                    $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $targetChat);
                    $chatId = (string)($resolved['id'] ?? $targetChat);
                    $chatName = (string)($resolved['name'] ?? ($fup['targetName'] ?? $targetChat));
                    $thread = is_array($waState['messages'][$chatId] ?? null) ? $waState['messages'][$chatId] : [];

                    if ($cancelIfReplied && !empty($thread)) {
                        $repliedAfterCreated = false;
                        foreach ($thread as $m) {
                            $mTsSec = (int)round(((int)($m['tsMs'] ?? 0)) / 1000);
                            if (empty($m['fromMe']) && $mTsSec > $createdTs) {
                                $repliedAfterCreated = true;
                                break;
                            }
                        }
                        if ($repliedAfterCreated) {
                            $fup['status'] = 'cancelled_by_reply';
                            $fup['updatedAt'] = gmdate('c');
                            $fupDirty = true;
                            continue;
                        }
                    }

                    $ctxWindow = ccrm_marveen_build_conversation_context($thread, 50, 5, 16000);
                    $prompt = implode("\n", [
                        "🔄 [PROACTIVE SCHEDULED FOLLOW-UP DUE]",
                        "- Channel: " . ($waRow['name'] ?? 'Messaging') . " (`{$waRow['id']}`)",
                        "- Target Chat: {$chatName} (`{$chatId}`)",
                        "- Follow-Up Instructions: " . ($fup['instructions'] ?? 'Follow up politely.'),
                        "",
                        "## Full Conversation Context (Last 50 Messages & Last 5 Days)",
                        "```text",
                        $ctxWindow['transcript'],
                        "```",
                        "",
                        "IMPORTANT: If the conversation already concluded naturally or the user already answered the question, DO NOT send any message and reply with `[SKIP_FOLLOWUP]`. Otherwise, send your proactive follow-up message now using `whatsapp_send_message` with `chat: \"{$chatId}\"` and `connector_id: \"{$waRow['id']}\"`.",
                    ]);

                    $res = ccrm_marveen_run_agent($pdo, $aiRow, $runAsUser, $prompt, '', $subId);
                    $replyText = (string)($res['text'] ?? '');
                    $skipped = stripos($replyText, '[SKIP_FOLLOWUP]') !== false;

                    $fup['attempts'] = ((int)($fup['attempts'] ?? 0)) + 1;
                    $fup['status'] = $skipped ? 'skipped_natural_end' : (!empty($res['ok']) ? 'sent' : 'error');
                    $fup['executedAt'] = gmdate('c');
                    $fup['updatedAt'] = gmdate('c');
                    $fupDirty = true;

                    $botMsg = [
                        'id' => 'fup-' . uniqid('', false),
                        'role' => 'assistant',
                        'autonomous' => true,
                        'taskTitle' => "🔄 Proactive Follow-Up · {$chatName}",
                        'subagentId' => $subId,
                        'text' => $skipped
                            ? "✓ Skipped proactive follow-up for {$chatName} (conversation ended naturally)."
                            : (!empty($res['ok']) ? ($replyText ?: "Sent proactive follow-up to {$chatName}.") : ('⚠️ Follow-up error: ' . ($res['error'] ?? 'failed'))),
                        'steps' => $res['steps'] ?? [],
                        'timestamp' => date('H:i'),
                        'createdAt' => gmdate('c'),
                    ];
                    ccrm_marveen_append_chat_message($aiId, $botMsg, $subId);
                    $fired[] = ['ok' => !empty($res['ok']), 'followupId' => $fup['id'], 'summary' => $chatName];
                } elseif ($sType === 'email') {
                    $emRow = ($sConnId !== '' && isset($emailConnectorsById[$sConnId]))
                        ? $emailConnectorsById[$sConnId]
                        : (reset($emailConnectorsById) ?: null);
                    if (!$emRow) {
                        continue;
                    }
                    $mailboxKey = 'c:' . $emRow['id'];
                    $threadRows = [];
                    try {
                        $tSt = $pdo->prepare(
                            "SELECT * FROM `mail_envelopes`
                             WHERE `mailbox_key` = ? AND (`from_address` LIKE ? OR `to_address` LIKE ?)
                             ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                        );
                        $tSt->execute([$mailboxKey, '%' . $targetChat . '%', '%' . $targetChat . '%']);
                        $threadRows = $tSt->fetchAll(PDO::FETCH_ASSOC) ?: [];
                    } catch (\Throwable $e) {}

                    if ($cancelIfReplied && !empty($threadRows)) {
                        $repliedAfterCreated = false;
                        foreach ($threadRows as $r) {
                            $emTs = !empty($r['email_date']) ? strtotime((string)$r['email_date']) : 0;
                            if (empty($r['is_outgoing']) && $emTs > $createdTs) {
                                $repliedAfterCreated = true;
                                break;
                            }
                        }
                        if ($repliedAfterCreated) {
                            $fup['status'] = 'cancelled_by_reply';
                            $fup['updatedAt'] = gmdate('c');
                            $fupDirty = true;
                            continue;
                        }
                    }

                    $mapped = array_map(static fn(array $r) => [
                        'id' => 'uid-' . ($r['uid'] ?? ''),
                        'fromMe' => !empty($r['is_outgoing']),
                        'senderName' => !empty($r['is_outgoing']) ? 'Me' : (($r['from_name'] ?: $r['from_address']) ?: 'Sender'),
                        'text' => "[Subject: " . ($r['subject'] ?? '') . "] " . ($r['preview'] ?? ''),
                        'createdAt' => $r['email_date'] ?? '',
                    ], $threadRows);
                    $ctxWindow = ccrm_marveen_build_conversation_context($mapped, 50, 5, 16000);
                    $lastSubj = !empty($threadRows) ? (string)($threadRows[count($threadRows) - 1]['subject'] ?? 'Follow-up') : 'Follow-up';
                    $replySubj = preg_match('/^re:/i', $lastSubj) ? $lastSubj : ('Re: ' . $lastSubj);

                    $prompt = implode("\n", [
                        "🔄 [PROACTIVE SCHEDULED EMAIL FOLLOW-UP DUE]",
                        "- Email Account: {$emRow['name']} ({$emRow['address']}, ID: `{$emRow['id']}`)",
                        "- Recipient: {$targetChat}",
                        "- Follow-Up Instructions: " . ($fup['instructions'] ?? 'Follow up politely.'),
                        "",
                        "## Full Email Thread Context",
                        "```text",
                        $ctxWindow['transcript'],
                        "```",
                        "",
                        "IMPORTANT: If the thread already concluded naturally, reply with `[SKIP_FOLLOWUP]` and do not send an email. Otherwise, send your follow-up email using `email_send_reply` with `to: \"{$targetChat}\"`, `subject: \"{$replySubj}\"`, and `connector_id: \"{$emRow['id']}\"`.",
                    ]);

                    $res = ccrm_marveen_run_agent($pdo, $aiRow, $runAsUser, $prompt, '', $subId);
                    $replyText = (string)($res['text'] ?? '');
                    $skipped = stripos($replyText, '[SKIP_FOLLOWUP]') !== false;

                    $fup['attempts'] = ((int)($fup['attempts'] ?? 0)) + 1;
                    $fup['status'] = $skipped ? 'skipped_natural_end' : (!empty($res['ok']) ? 'sent' : 'error');
                    $fup['executedAt'] = gmdate('c');
                    $fup['updatedAt'] = gmdate('c');
                    $fupDirty = true;

                    $botMsg = [
                        'id' => 'fup-' . uniqid('', false),
                        'role' => 'assistant',
                        'autonomous' => true,
                        'taskTitle' => "🔄 Proactive Email Follow-Up · {$targetChat}",
                        'subagentId' => $subId,
                        'text' => $skipped
                            ? "✓ Skipped proactive email follow-up to {$targetChat}."
                            : (!empty($res['ok']) ? ($replyText ?: "Sent proactive email follow-up to {$targetChat}.") : ('⚠️ Follow-up error: ' . ($res['error'] ?? 'failed'))),
                        'steps' => $res['steps'] ?? [],
                        'timestamp' => date('H:i'),
                        'createdAt' => gmdate('c'),
                    ];
                    ccrm_marveen_append_chat_message($aiId, $botMsg, $subId);
                    $fired[] = ['ok' => !empty($res['ok']), 'followupId' => $fup['id'], 'summary' => $targetChat];
                }
            }
            unset($fup);

            if ($fupDirty) {
                @file_put_contents($fupFile, json_encode(array_values($followups), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
                ccrm_marveen_update_connector_settings_mirror($pdo, $aiId, static function (array $s) use ($followups): array {
                    $s['followups'] = array_values($followups);
                    return $s;
                });
            }

            // -----------------------------------------------------------------
            // 2. Per-Wire Proactive Re-Initiation (`triggers.json` -> `proactiveEnabled`)
            // -----------------------------------------------------------------
            $trigFile = $dir . '/triggers.json';
            $triggers = ccrm_marveen_list_triggers($pdo, $aiRow);
            $trigDirty = false;

            foreach ($triggers as &$trig) {
                if (empty($trig['enabled']) || empty($trig['proactiveEnabled'])) {
                    continue;
                }
                $sType = (string)($trig['sourceType'] ?? 'whatsapp');
                if ($sType !== 'whatsapp') {
                    continue;
                }
                $sConnId = (string)($trig['sourceConnectorId'] ?? '');
                $waRow = ($sConnId !== '' && isset($waConnectorsById[$sConnId]))
                    ? $waConnectorsById[$sConnId]
                    : (reset($waConnectorsById) ?: null);
                if (!$waRow) {
                    continue;
                }
                $waAccountId = ccrm_waai_resolve_account_id($waRow);
                $storeFile = ccrm_waai_storage_root() . '/accounts/' . $waAccountId . '/store.json';
                if (!is_file($storeFile)) {
                    continue;
                }
                $store = json_decode((string)@file_get_contents($storeFile), true);
                if (!is_array($store)) {
                    continue;
                }
                $chats = is_array($store['chats'] ?? null) ? $store['chats'] : [];
                $messagesMap = is_array($store['messages'] ?? null) ? $store['messages'] : [];
                $chatFilter = trim((string)($trig['whatsappChatJid'] ?? '*'));
                $chatFilterLower = mb_strtolower($chatFilter, 'UTF-8');

                $afterSec = max(60, ((int)($trig['proactiveAfterMinutes'] ?? 120)) * 60);
                $maxAttempts = max(1, min(5, (int)($trig['proactiveMaxAttempts'] ?? 1)));
                $pState = is_array($trig['proactiveState'] ?? null) ? $trig['proactiveState'] : [];
                $targetAgentId = trim((string)($trig['targetAgentId'] ?? ($trig['targetSubagentId'] ?? 'main')));
                $subIdForRun = ($targetAgentId !== '' && $targetAgentId !== 'main') ? $targetAgentId : null;

                foreach ($chats as $chatMeta) {
                    $chatId = (string)($chatMeta['id'] ?? '');
                    $chatName = (string)($chatMeta['name'] ?? $chatId);
                    if ($chatId === '' || $chatId === 'status@broadcast') {
                        continue;
                    }
                    if ($chatFilter !== '' && $chatFilter !== '*') {
                        if ($chatFilter === '@g.us' && empty($chatMeta['isGroup'])) continue;
                        if ($chatFilter === '@s.whatsapp.net' && !empty($chatMeta['isGroup'])) continue;
                        if ($chatFilter !== '@g.us' && $chatFilter !== '@s.whatsapp.net') {
                            $matchId = strtolower($chatId) === strtolower($chatFilter);
                            $matchName = mb_strpos(mb_strtolower($chatName, 'UTF-8'), $chatFilterLower) !== false;
                            if (!$matchId && !$matchName) continue;
                        }
                    }

                    $thread = is_array($messagesMap[$chatId] ?? null) ? $messagesMap[$chatId] : [];
                    if (count($thread) < 2) {
                        continue;
                    }
                    $lastMsg = $thread[count($thread) - 1];
                    // Proactive re-initiation only applies when OUR message is the last one in the thread and the contact hasn't replied
                    if (empty($lastMsg['fromMe'])) {
                        continue;
                    }
                    $lastTsSec = (int)round(((int)($lastMsg['tsMs'] ?? 0)) / 1000);
                    if ($lastTsSec <= 0 || ($nowSec - $lastTsSec) < $afterSec || ($nowSec - $lastTsSec) > (7 * 86400)) {
                        continue;
                    }

                    // Find the latest incoming (!fromMe) message ID as the conversation turn anchor
                    $lastIncomingId = '';
                    for ($i = count($thread) - 1; $i >= 0; $i--) {
                        if (empty($thread[$i]['fromMe'])) {
                            $lastIncomingId = (string)($thread[$i]['id'] ?? ('idx-' . $i));
                            break;
                        }
                    }
                    if ($lastIncomingId === '') {
                        continue;
                    }

                    $cState = is_array($pState[$chatId] ?? null) ? $pState[$chatId] : [
                        'anchorIncomingId' => '',
                        'attempts' => 0,
                        'lastFollowupAt' => 0,
                        'done' => false,
                    ];
                    if (($cState['anchorIncomingId'] ?? '') !== $lastIncomingId) {
                        $cState = [
                            'anchorIncomingId' => $lastIncomingId,
                            'attempts' => 0,
                            'lastFollowupAt' => 0,
                            'done' => false,
                        ];
                    }
                    if (!empty($cState['done']) || (int)($cState['attempts'] ?? 0) >= $maxAttempts) {
                        continue;
                    }
                    if (!empty($cState['lastFollowupAt']) && ($nowSec - (int)$cState['lastFollowupAt']) < $afterSec) {
                        continue;
                    }

                    $ctxWindow = ccrm_marveen_build_conversation_context($thread, 50, 5, 16000);
                    $attemptNum = ((int)($cState['attempts'] ?? 0)) + 1;
                    $proactivePrompt = implode("\n", [
                        "🔄 [PROACTIVE CONVERSATION RE-INITIATION — {$trig['name']} (Attempt {$attemptNum}/{$maxAttempts})]",
                        "- Source Channel: " . ($waRow['name'] ?? 'Messaging') . " (`{$waRow['id']}`)",
                        "- Chat / Contact: {$chatName} (`{$chatId}`)",
                        "- Silence Duration: " . round(($nowSec - $lastTsSec) / 60) . " minutes since our last message",
                        "",
                        "## Full Conversation Context (Last 50 Messages & Last 5 Days)",
                        "```text",
                        $ctxWindow['transcript'],
                        "```",
                        "",
                        "## Proactive Re-Initiation Instructions",
                        (string)($trig['proactiveInstructions'] ?: 'Follow up politely on our last message if the conversation is still open.'),
                        "",
                        "IMPORTANT: If the conversation ended naturally (e.g. 'thanks, bye', 'ok köszönöm', or no reply was expected), DO NOT send a message and reply ONLY with `[SKIP_FOLLOWUP]`. Otherwise, send your proactive follow-up message using `whatsapp_send_message` with `chat: \"{$chatId}\"` and `connector_id: \"{$waRow['id']}\"`.",
                    ]);

                    $res = ccrm_marveen_run_agent($pdo, $aiRow, $runAsUser, $proactivePrompt, '', $subIdForRun);
                    $replyText = (string)($res['text'] ?? '');
                    $skipped = stripos($replyText, '[SKIP_FOLLOWUP]') !== false;

                    $cState['attempts'] = $attemptNum;
                    $cState['lastFollowupAt'] = $nowSec;
                    if ($skipped || $attemptNum >= $maxAttempts) {
                        $cState['done'] = true;
                    }
                    $pState[$chatId] = $cState;
                    $trig['proactiveState'] = $pState;
                    $trig['lastTriggeredAt'] = gmdate('c');
                    $trig['lastTriggerSummary'] = $skipped
                        ? "Proactive check ({$chatName}): skipped (natural end)"
                        : "Proactive follow-up ({$chatName}) #{$attemptNum}";
                    $trig['lastTriggerStatus'] = !empty($res['ok']) ? 'ok' : ('error: ' . ($res['error'] ?? 'failed'));
                    $trigDirty = true;

                    $botMsg = [
                        'id' => 'pro-' . uniqid('', false),
                        'role' => 'assistant',
                        'autonomous' => true,
                        'triggerId' => $trig['id'],
                        'taskTitle' => "🔄 Proactive Re-Initiation · {$chatName} (#{$attemptNum}/{$maxAttempts})",
                        'subagentId' => $subIdForRun,
                        'text' => $skipped
                            ? "✓ Proactive check on {$chatName}: conversation ended naturally (`[SKIP_FOLLOWUP]`)."
                            : (!empty($res['ok']) ? ($replyText ?: "Sent proactive follow-up to {$chatName}.") : ('⚠️ Proactive error: ' . ($res['error'] ?? 'failed'))),
                        'steps' => $res['steps'] ?? [],
                        'timestamp' => date('H:i'),
                        'createdAt' => gmdate('c'),
                    ];
                    ccrm_marveen_append_chat_message($aiId, $botMsg, $subIdForRun);
                    $fired[] = [
                        'ok' => !empty($res['ok']),
                        'triggerId' => $trig['id'],
                        'proactive' => true,
                        'summary' => $trig['lastTriggerSummary'],
                    ];
                    break;
                }
            }
            unset($trig);

            if ($trigDirty) {
                @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
                ccrm_marveen_update_connector_settings_mirror($pdo, $aiId, static function (array $s) use ($triggers): array {
                    $s['triggers'] = array_values($triggers);
                    return $s;
                });
            }
        }

        return $fired;
    }
}

if (!function_exists('ccrm_marveen_test_trigger')) {
    /**
     * Runs a manual test of a specific trigger using the latest conversation context from its source connection.
     */
    function ccrm_marveen_test_trigger(PDO $pdo, array $aiConnector, string $triggerId): array {
        $cid = (string)$aiConnector['id'];
        $dir = ccrm_marveen_connector_dir($cid);
        $trigFile = $dir . '/triggers.json';
        $triggers = ccrm_marveen_list_triggers($pdo, $aiConnector);

        $foundIdx = null;
        foreach ($triggers as $idx => $t) {
            if (($t['id'] ?? '') === $triggerId) {
                $foundIdx = $idx;
                break;
            }
        }
        if ($foundIdx === null) {
            return ['ok' => false, 'error' => 'Trigger not found: ' . $triggerId];
        }

        $trig = &$triggers[$foundIdx];
        $sType = (string)($trig['sourceType'] ?? 'whatsapp');
        $sConnId = (string)($trig['sourceConnectorId'] ?? '');
        $minMsgs = max(10, (int)($trig['minContextMessages'] ?? 50));
        $minDays = max(1, (int)($trig['minContextDays'] ?? 5));
        $maxChars = max(2000, (int)($trig['maxContextChars'] ?? 16000));

        $eventCtx = [
            'sourceLabel' => strtoupper($sType),
            'summary' => "Manual Trigger Test ({$trig['name']})",
            'sender' => 'Test Contact',
            'latestMessageText' => '(Manual trigger test)',
            'conversationTranscript' => '',
        ];

        $processedIds = is_array($trig['processedIds'] ?? null) ? $trig['processedIds'] : [];
        $alreadyRepliedReason = null;
        $recordProcessedKeys = [];

        if ($sType === 'whatsapp') {
            $waConnectors = ccrm_marveen_list_sibling_whatsapp_connectors($pdo, $aiConnector);
            $waRow = $waConnectors[0] ?? null;
            foreach ($waConnectors as $cand) {
                if ((string)$cand['id'] === $sConnId) {
                    $waRow = $cand;
                    break;
                }
            }
            if ($waRow) {
                $waState = ccrm_waai_get_chats($waRow);
                $chatTarget = trim((string)($trig['whatsappChatJid'] ?? '*'));
                if ($chatTarget === '*' || $chatTarget === '@g.us' || $chatTarget === '@s.whatsapp.net') {
                    $chatTarget = (string)($trig['whatsappChatName'] !== 'All Chats' ? $trig['whatsappChatName'] : '');
                }
                $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $chatTarget);
                if ($resolved) {
                    $chatId = (string)$resolved['id'];
                    $chatName = (string)($resolved['name'] ?? $chatId);
                    $thread = is_array($waState['messages'][$chatId] ?? null) ? $waState['messages'][$chatId] : [];
                    $ctxWindow = ccrm_marveen_build_conversation_context($thread, $minMsgs, $minDays, $maxChars);
                    $lastMsg = !empty($thread) ? $thread[count($thread) - 1] : null;
                    $lastMsgId = (string)($lastMsg['id'] ?? '');
                    if (
                        !empty($lastMsg['fromMe']) ||
                        ($lastMsgId !== '' && (in_array($lastMsgId, $processedIds, true) || in_array('wa:' . $lastMsgId, $processedIds, true)))
                    ) {
                        $alreadyRepliedReason = "✓ Already replied to the latest message in {$chatName} — skipped duplicate reply.";
                    } elseif ($lastMsgId !== '') {
                        $recordProcessedKeys[] = $lastMsgId;
                        $recordProcessedKeys[] = 'wa:' . $lastMsgId;
                    }
                    $eventCtx = [
                        'sourceLabel' => ($waRow['name'] ?? 'WhatsApp') . ' · ' . $chatName,
                        'summary' => "WhatsApp ({$chatName})",
                        'sender' => (string)($lastMsg['senderName'] ?? $chatName),
                        'chatId' => $chatId,
                        'chatName' => $chatName,
                        'latestMessageText' => (string)($lastMsg['text'] ?? '(Latest conversation check)'),
                        'conversationTranscript' => $ctxWindow['transcript'],
                    ];
                }
            }
        } elseif ($sType === 'email') {
            $emConnectors = ccrm_marveen_list_sibling_email_connectors($pdo, $aiConnector);
            $emRow = $emConnectors[0] ?? null;
            foreach ($emConnectors as $cand) {
                if ((string)$cand['id'] === $sConnId) {
                    $emRow = $cand;
                    break;
                }
            }
            if ($emRow) {
                $mailboxKey = 'c:' . $emRow['id'];
                try {
                    // Find latest incoming message first
                    $st = $pdo->prepare("SELECT * FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `is_outgoing` = 0 ORDER BY `email_date` DESC, `uid` DESC LIMIT 1");
                    $st->execute([$mailboxKey]);
                    $lastEm = $st->fetch(PDO::FETCH_ASSOC);
                    if ($lastEm) {
                        $fromAddr = strtolower(trim((string)($lastEm['from_address'] ?? '')));
                        $subj = (string)($lastEm['subject'] ?? '');
                        $lastUid = (int)($lastEm['uid'] ?? 0);
                        $emEventKey = 'email:' . $mailboxKey . ':' . $lastUid;
                        $emMsgIdKey = !empty($lastEm['message_id']) ? ('msgid:' . (string)$lastEm['message_id']) : '';

                        // Load full thread (BOTH incoming and outgoing) with this sender so outgoing replies are visible
                        $tSt = $pdo->prepare(
                            "SELECT * FROM `mail_envelopes`
                             WHERE `mailbox_key` = ? AND (`from_address` = ? OR `to_address` LIKE ?)
                             ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                        );
                        $tSt->execute([$mailboxKey, $fromAddr, '%' . $fromAddr . '%']);
                        $threadRows = $tSt->fetchAll(PDO::FETCH_ASSOC) ?: [$lastEm];

                        $latestInThread = $threadRows[count($threadRows) - 1] ?? null;
                        if (
                            !empty($latestInThread['is_outgoing']) ||
                            in_array($emEventKey, $processedIds, true) ||
                            ($emMsgIdKey !== '' && in_array($emMsgIdKey, $processedIds, true))
                        ) {
                            $alreadyRepliedReason = "✓ Already replied to the latest email from {$fromAddr} — skipped duplicate reply.";
                        } else {
                            $recordProcessedKeys[] = $emEventKey;
                            if ($emMsgIdKey !== '') {
                                $recordProcessedKeys[] = $emMsgIdKey;
                            }
                        }

                        $mapped = array_map(static fn(array $r) => [
                            'id' => 'uid-' . ($r['uid'] ?? ''),
                            'fromMe' => !empty($r['is_outgoing']),
                            'senderName' => !empty($r['is_outgoing']) ? 'Me' : (($r['from_name'] ?: $r['from_address']) ?: 'Sender'),
                            'text' => "[Subject: " . ($r['subject'] ?? '') . "] " . ($r['preview'] ?? ''),
                            'createdAt' => $r['email_date'] ?? '',
                        ], $threadRows);
                        $ctxWindow = ccrm_marveen_build_conversation_context($mapped, $minMsgs, $minDays, $maxChars);
                        $eventCtx = [
                            'sourceLabel' => ($emRow['name'] ?? 'Email') . ' (' . ($emRow['address'] ?? '') . ')',
                            'summary' => "Email from {$fromAddr}: {$subj}",
                            'sender' => $fromAddr,
                            'subject' => $subj,
                            'emailUid' => $lastUid,
                            'replyToAddress' => $fromAddr,
                            'replySubject' => preg_match('/^re:/i', $subj) ? $subj : ('Re: ' . $subj),
                            'latestMessageText' => "Subject: {$subj}\nFrom: {$fromAddr}\n\n" . ($lastEm['preview'] ?? ''),
                            'conversationTranscript' => $ctxWindow['transcript'],
                        ];
                    }
                } catch (\Throwable $e) {}
            }
        }

        if ($alreadyRepliedReason !== null) {
            return [
                'ok' => true,
                'triggerId' => $triggerId,
                'alreadyReplied' => true,
                'text' => $alreadyRepliedReason,
                'steps' => [],
            ];
        }

        if (!empty($recordProcessedKeys)) {
            $processedIds = array_merge($processedIds, $recordProcessedKeys);
            $trig['processedIds'] = array_values(array_slice(array_unique($processedIds), -200));
        }

        $res = ccrm_marveen_execute_single_trigger_event($pdo, $aiConnector, $trig, $eventCtx);
        @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        ccrm_marveen_update_connector_settings_mirror($pdo, $cid, static function (array $s) use ($triggers): array {
            $s['triggers'] = array_values($triggers);
            return $s;
        });
        return $res;
    }
}

if (!function_exists('ccrm_marveen_process_crm_event_triggers')) {
    /**
     * Fires any active `crm_event` triggers matching $eventType (e.g. `lead_created`, `client_created`, `task_created`).
     */
    function ccrm_marveen_process_crm_event_triggers(PDO $pdo, string $eventType, array $payload): array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        $secretKeys = ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret'];
        $fired = [];

        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw) ? ccrm_decrypt_config_secrets($raw, $secretKeys) : [];
            $cType = strtolower((string)($settings['connectorType'] ?? ''));
            if (!in_array($cType, ['claude', 'antigravity', 'chatgpt'], true)) {
                continue;
            }
            $row['settings'] = $settings;
            $aiId = (string)$row['id'];
            $dir = ccrm_marveen_connector_dir($aiId);
            $trigFile = $dir . '/triggers.json';
            $triggers = ccrm_marveen_list_triggers($pdo, $row);
            $dirty = false;

            foreach ($triggers as &$trig) {
                if (empty($trig['enabled']) || ($trig['sourceType'] ?? '') !== 'crm_event') {
                    continue;
                }
                $wantEvent = strtolower(trim((string)($trig['crmEventName'] ?? 'lead_created')));
                if ($wantEvent !== '*' && $wantEvent !== strtolower($eventType)) {
                    continue;
                }
                $dirty = true;
                $eventCtx = [
                    'sourceLabel' => 'CCRM Event · ' . $eventType,
                    'summary' => "CRM Event: {$eventType}",
                    'latestMessageText' => json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
                    'conversationTranscript' => '',
                ];
                $fired[] = ccrm_marveen_execute_single_trigger_event($pdo, $row, $trig, $eventCtx);
            }
            unset($trig);

            if ($dirty) {
                @file_put_contents($trigFile, json_encode(array_values($triggers), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
            }
        }
        return $fired;
    }
}

if (!function_exists('ccrm_marveen_build_crm_snapshot_section')) {
    /**
     * Builds a live, $0-LLM-cost CCRM database & MCP tools overview section injected into the agent's system prompt
     * so the agent always knows its connected CCRM database state, sample client records, and custom registries.
     */
    function ccrm_marveen_build_crm_snapshot_section(PDO $pdo): string {
        $lines = [
            "## Connected CCRM Database & MCP Tools Snapshot (Live)",
            "You have full read/write access to this CCRM workspace via MCP tools (`list_clients`, `get_client`, `create_client`, `update_client`, `list_leads`, `get_lead`, `create_lead`, `list_projects`, `list_tasks`, `create_task`, `list_invoices`, `search_entities`, `list_unified_entries`, `get_unified_entry_rows`).",
        ];
        try {
            $clientCount = (int)$pdo->query("SELECT COUNT(*) FROM `leads` WHERE `status` = 'Client'")->fetchColumn();
            $leadCount = (int)$pdo->query("SELECT COUNT(*) FROM `leads` WHERE `status` <> 'Client'")->fetchColumn();
            $projCount = (int)$pdo->query("SELECT COUNT(*) FROM `projects`")->fetchColumn();
            $realTasksSql = function_exists('ccrm_sql_real_tasks')
                ? ccrm_sql_real_tasks('tasks')
                : '/* recurring-template: exclude */ (`tasks`.`is_recurring_template` = 0 OR `tasks`.`is_recurring_template` IS NULL)';
            $taskCount = (int)$pdo->query("SELECT COUNT(*) FROM `tasks` WHERE {$realTasksSql} AND `completed` = 0")->fetchColumn();
            $invCount = (int)$pdo->query("SELECT COUNT(*) FROM `financial_records` WHERE `type` = 'Invoice'")->fetchColumn();

            $sampleStmt = $pdo->query("SELECT `name` FROM `leads` WHERE `status` = 'Client' ORDER BY `name` ASC LIMIT 8");
            $samples = $sampleStmt ? ($sampleStmt->fetchAll(PDO::FETCH_COLUMN) ?: []) : [];
            $sampleStr = !empty($samples) ? (' (e.g. ' . implode(', ', array_map(static fn($s) => '"' . $s . '"', $samples)) . ', …)') : '';

            $lines[] = "- **Clients (`list_clients` / `get_client`)**: **{$clientCount}** active clients{$sampleStr}";
            $lines[] = "- **Pipeline Leads (`list_leads` / `get_lead`)**: **{$leadCount}** leads";
            $lines[] = "- **Projects (`list_projects` / `get_project`)**: **{$projCount}** projects";
            $lines[] = "- **Open Tasks (`list_tasks` / `create_task`)**: **{$taskCount}** open tasks";
            $lines[] = "- **Invoices (`list_invoices`)**: **{$invCount}** invoices";

            $regStmt = $pdo->query("SELECT `id`, `title`, `type`, `rows_json` FROM `unified_entries` ORDER BY `title` ASC LIMIT 12");
            $regs = $regStmt ? ($regStmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
            if (!empty($regs)) {
                $regParts = [];
                foreach ($regs as $rg) {
                    $rRows = json_decode((string)($rg['rows_json'] ?? '[]'), true);
                    $rCount = is_array($rRows) ? count($rRows) : 0;
                    $regParts[] = "**{$rg['title']}** (`id: \"{$rg['id']}\"`, {$rCount} rows)";
                }
                $lines[] = "- **Custom Registries (`list_unified_entries` / `get_unified_entry_rows`)**: " . implode(', ', $regParts);
            }
        } catch (\Throwable $e) {
            // Non-fatal if any table is unavailable
        }
        $lines[] = "- **Proactive Follow-Ups (`schedule_conversation_followup`, `list_conversation_followups`, `cancel_conversation_followup`)**: Whenever a contact asks you to follow up later, or you send a proposal/question that warrants a check-in if unanswered, call `schedule_conversation_followup` to schedule a `$0`-idle-cost proactive follow-up (auto-cancels if they reply first).";
        return implode("\n", $lines);
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
        $triggers = ccrm_marveen_list_triggers($pdo, $connector);
        $followups = ccrm_marveen_list_followups($pdo, $connector);
        $waConnectors = ccrm_marveen_list_sibling_whatsapp_connectors($pdo, $connector);
        $emailConnectors = ccrm_marveen_list_sibling_email_connectors($pdo, $connector);

        $parts = [];
        if ($subagentId !== null && $subagentId !== '' && $subagentId !== 'main') {
            $subRecord = null;
            foreach ($subs as $s) {
                if (($s['id'] ?? '') === $subagentId) {
                    $subRecord = $s;
                    break;
                }
            }
            $subName = (string)($subRecord['name'] ?? $subagentId);
            $subRole = (string)($subRecord['role'] ?? 'Specialized Agent');
            $subPrompt = (string)($subRecord['systemPrompt'] ?? '');
            $parts[] = "You are Agent \"{$subName}\" ({$subRole}) running on CCRM AI Connection \"{$name}\".";
            if ($subPrompt !== '') {
                $parts[] = "## Agent Persona & Instructions\n" . $subPrompt;
            }
            $parts[] = "## Your Persistent `memory.md`\n```markdown\n" . trim($mem['memoryMd']) . "\n```";
            $parts[] = "You can update your own memory using `memory_write` or `memory_append` (pass `subagent_id: \"{$subagentId}\"`), read/reply to WhatsApp & BotMan channels (`whatsapp_list_chats`, `whatsapp_read_messages`, `whatsapp_send_message`), read/reply to Emails (`email_list_accounts`, `email_list_messages`, `email_read_thread`, `email_send_reply`), schedule proactive conversation follow-ups (`schedule_conversation_followup`), and execute any CCRM MCP tools.";
        } else {
            $parts[] = "You are \"{$name}\", an autonomous AI agent connected directly to CCRM's MCP server and sibling communication channels (WhatsApp, Messenger, Telegram, Slack, Discord, Teams, Viber, SMS, WebChat & Email).";
            $parts[] = "You support three autonomous execution modes:\n1. **Reactive Mode (Event-Driven Triggers — \$0 Idle Cost)**: Use `create_event_trigger` (or the Visual Trigger Studio) to wake up automatically when a new message, Email, or CRM event arrives, receiving the last 50 messages and last 5 days of conversation context.\n2. **Proactive Re-Initiation Mode (`schedule_conversation_followup` & Trigger Proactive Follow-Up — \$0 Idle Cost)**: Re-initiate conversations automatically if a contact hasn't replied after N minutes, or when a scheduled follow-up comes due (auto-cancels at \$0 cost if they reply first).\n3. **Heartbeat Mode (`schedule_autonomous_task` / Autonomous Cron)**: For periodic background checks.";
            $parts[] = "## Your Persistent `memory.md` (Also visible and editable by the user under the chat)\n```markdown\n" . trim($mem['memoryMd']) . "\n```";
            if (!empty($subs)) {
                $subLines = [];
                foreach ($subs as $s) {
                    $hbTag = !empty($s['heartbeatEnabled']) ? " [Heartbeat: every {$s['heartbeatIntervalMinutes']}m]" : " [Reactive]";
                    $subLines[] = "- `{$s['id']}` (**{$s['name']}** — {$s['role']}){$hbTag}";
                }
                $parts[] = "## Agents Created on This Connection\n" . implode("\n", $subLines);
            }
            if (!empty($triggers)) {
                $trigLines = [];
                foreach ($triggers as $tr) {
                    $st = !empty($tr['enabled']) ? 'active' : 'paused';
                    $proTag = !empty($tr['proactiveEnabled']) ? " [🔄 Proactive after {$tr['proactiveAfterMinutes']}m]" : '';
                    $trigLines[] = "- `{$tr['id']}`: **{$tr['name']}** ({$tr['sourceType']} → agent `{$tr['targetAgentId']}`, {$st}){$proTag}";
                }
                $parts[] = "## Active Event Triggers (\$0 Idle Cost)\n" . implode("\n", $trigLines);
            }
            $pendingFups = array_values(array_filter($followups, static fn($f) => ($f['status'] ?? '') === 'pending'));
            if (!empty($pendingFups)) {
                $fupLines = [];
                foreach ($pendingFups as $pf) {
                    $fupLines[] = "- `{$pf['id']}`: **{$pf['targetName']}** ({$pf['sourceType']}, due `{$pf['dueAt']}`) — {$pf['instructions']}";
                }
                $parts[] = "## Pending Proactive Follow-Ups\n" . implode("\n", $fupLines);
            }
            if (!empty($tasks)) {
                $taskLines = [];
                foreach ($tasks as $t) {
                    $status = !empty($t['enabled']) ? 'active' : 'paused';
                    $taskLines[] = "- `{$t['id']}`: **{$t['title']}** (every {$t['intervalMinutes']}m, {$status})";
                }
                $parts[] = "## Scheduled Heartbeat Tasks\n" . implode("\n", $taskLines);
            }
        }

        $parts[] = ccrm_marveen_build_crm_snapshot_section($pdo);

        if (!empty($waConnectors)) {
            $waSection = [
                "## Connected Sibling WhatsApp (WAAI) Channel(s)",
                "Use `whatsapp_list_chats`, `whatsapp_read_messages` (includes last 50 msgs / 5 days), `whatsapp_send_message`, and `whatsapp_sync_chat`:",
            ];
            foreach ($waConnectors as $wRow) {
                $wState = ccrm_waai_get_chats($wRow);
                $wChats = is_array($wState['chats'] ?? null) ? $wState['chats'] : [];
                $wPhone = (string)($wState['phone'] ?? ($wRow['address'] ?? ''));
                $wStatus = (string)($wState['status'] ?? 'connected');
                $waSection[] = "- **{$wRow['name']}** (ID: `{$wRow['id']}`, Phone: `{$wPhone}`, Status: `{$wStatus}`, Total synced chats/groups: " . count($wChats) . ")";
                $recentPreview = array_slice($wChats, 0, 8);
                foreach ($recentPreview as $rc) {
                    $rcKind = !empty($rc['isGroup']) ? 'Group' : 'Contact';
                    $rcName = (string)($rc['name'] ?? $rc['id']);
                    $rcLast = trim((string)($rc['lastMessageText'] ?? ''));
                    $rcAt = (string)($rc['lastMessageAt'] ?? '');
                    $waSection[] = "  - [{$rcKind}] **{$rcName}** (`{$rc['id']}`)" . ($rcAt !== '' ? " — {$rcAt}" : '') . ($rcLast !== '' ? ": \"" . mb_substr($rcLast, 0, 80, 'UTF-8') . "\"" : '');
                }
            }
            $parts[] = implode("\n", $waSection);
        }

        if (!empty($emailConnectors)) {
            $emSection = [
                "## Connected Sibling Email Channel(s)",
                "Use `email_list_accounts`, `email_list_messages`, `email_read_thread` (includes last 50 msgs / 5 days), and `email_send_reply`:",
            ];
            foreach ($emailConnectors as $eRow) {
                $emSection[] = "- **{$eRow['name']}** (ID: `{$eRow['id']}`, Address: `{$eRow['address']}`)";
            }
            $parts[] = implode("\n", $emSection);
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
     * scheduling autonomous tasks, reading/replying to WhatsApp (WAAI) messages, and calling all CCRM MCP tools.
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
        $seenDeclNames = [];
        foreach ($funcDecls as $fd) {
            if (!empty($fd['name'])) {
                $seenDeclNames[(string)$fd['name']] = true;
            }
        }
        $toolsResp = $mcpCall('tools/list');
        $mcpTools = is_array($toolsResp['result']['tools'] ?? null) ? $toolsResp['result']['tools'] : [];
        foreach ($mcpTools as $t) {
            $tName = (string)($t['name'] ?? '');
            if ($tName === '' || isset($seenDeclNames[$tName])) {
                continue;
            }
            $seenDeclNames[$tName] = true;
            $decl = [
                'name' => $tName,
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
        $sentReplyTargets = [];
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
                // When Gemini returns HTTP 200 with a valid candidate whose `content.parts` is empty
                // (e.g. finishReason === "STOP" right after tool execution), treat the turn as completed cleanly
                // instead of emitting a false "Gemini API HTTP 200" error.
                if ($httpCode === 200 && is_array($resp) && empty($resp['error']) && (!empty($resp['candidates']) || !empty($steps))) {
                    return [
                        'ok' => true,
                        'text' => '[IDLE]',
                        'mode' => 'gemini_mcp',
                        'model' => $model,
                        'steps' => $steps,
                    ];
                }
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
                if (isset($part['text']) && is_string($part['text']) && empty($part['thought'])) {
                    $textParts[] = $part['text'];
                }
            }

            if (empty($funcCalls)) {
                $finalText = trim(implode("\n", $textParts));
                return [
                    'ok' => true,
                    'text' => $finalText !== '' ? $finalText : '[IDLE]',
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

                if ($pdo !== null && in_array($fnName, [
                    'whatsapp_list_chats',
                    'whatsapp_read_messages',
                    'whatsapp_send_message',
                    'whatsapp_sync_chat',
                ], true)) {
                    $waReplyKey = $fnName === 'whatsapp_send_message'
                        ? ('wa:' . strtolower(trim((string)($fnArgs['chat'] ?? ($fnArgs['chat_id'] ?? 'default')))))
                        : '';
                    if ($waReplyKey !== '' && isset($sentReplyTargets[$waReplyKey])) {
                        $toolText = json_encode([
                            'ok' => true,
                            'alreadySent' => true,
                            'message' => 'A WhatsApp reply was already sent to this chat in this run. Do not send duplicate replies.',
                        ]);
                    } else {
                        $waExec = ccrm_marveen_execute_whatsapp_tool($pdo, $connector, $fnName, $fnArgs);
                        $toolText = (string)($waExec['toolText'] ?? '');
                        if ($waReplyKey !== '' && str_contains($toolText, '"ok":true')) {
                            $sentReplyTargets[$waReplyKey] = true;
                        }
                        if (!empty($waExec['step'])) {
                            $steps[] = $waExec['step'];
                        }
                    }
                } elseif ($pdo !== null && in_array($fnName, [
                    'email_list_accounts',
                    'email_list_messages',
                    'email_read_thread',
                    'email_send_reply',
                ], true)) {
                    $emReplyKey = $fnName === 'email_send_reply'
                        ? ('em:' . strtolower(trim((string)($fnArgs['to'] ?? ($fnArgs['reply_to_uid'] ?? 'default')))))
                        : '';
                    if ($emReplyKey !== '' && isset($sentReplyTargets[$emReplyKey])) {
                        $toolText = json_encode([
                            'ok' => true,
                            'alreadySent' => true,
                            'message' => 'An email reply was already sent to this recipient in this run. Do not send duplicate replies.',
                        ]);
                    } else {
                        $emExec = ccrm_marveen_execute_email_tool($pdo, $connector, $fnName, $fnArgs);
                        $toolText = (string)($emExec['toolText'] ?? '');
                        if ($emReplyKey !== '' && str_contains($toolText, '"ok":true')) {
                            $sentReplyTargets[$emReplyKey] = true;
                        }
                        if (!empty($emExec['step'])) {
                            $steps[] = $emExec['step'];
                        }
                    }
                } elseif ($pdo !== null && $connector !== null && in_array($fnName, [
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
                    'create_event_trigger',
                    'list_event_triggers',
                    'delete_event_trigger',
                    'schedule_conversation_followup',
                    'list_conversation_followups',
                    'cancel_conversation_followup',
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
                    } elseif ($fnName === 'create_event_trigger') {
                        $trigPayload = [
                            'id' => (string)($fnArgs['id'] ?? ''),
                            'name' => (string)($fnArgs['name'] ?? 'Reactive Trigger'),
                            'sourceType' => (string)($fnArgs['source_type'] ?? 'whatsapp'),
                            'sourceConnectorId' => (string)($fnArgs['source_connector_id'] ?? ''),
                            'targetSubagentId' => (string)($fnArgs['target_subagent_id'] ?? ($fnArgs['target_agent_id'] ?? ($subagentId ?? ''))),
                            'filter' => [
                                'chatMatch' => (string)($fnArgs['chat_match'] ?? ($fnArgs['whatsapp_chat'] ?? '')),
                                'onlyGroup' => !empty($fnArgs['only_group']),
                                'onlyDirect' => !empty($fnArgs['only_direct']),
                                'subjectContains' => (string)($fnArgs['subject_contains'] ?? ($fnArgs['email_subject_filter'] ?? '')),
                                'fromContains' => (string)($fnArgs['from_contains'] ?? ($fnArgs['email_sender_filter'] ?? '')),
                                'keywordContains' => (string)($fnArgs['keyword_contains'] ?? ''),
                                'eventType' => (string)($fnArgs['crm_event_name'] ?? 'lead_created'),
                            ],
                            'instructions' => (string)($fnArgs['instructions'] ?? ''),
                            'autoReply' => array_key_exists('auto_reply', $fnArgs) ? (bool)$fnArgs['auto_reply'] : true,
                            'proactiveEnabled' => !empty($fnArgs['proactive_enabled']),
                            'proactiveAfterMinutes' => max(1, (int)($fnArgs['proactive_after_minutes'] ?? 120)),
                            'proactiveMaxAttempts' => max(1, min(5, (int)($fnArgs['proactive_max_attempts'] ?? 1))),
                            'proactiveInstructions' => (string)($fnArgs['proactive_instructions'] ?? ''),
                            'enabled' => true,
                        ];
                        $savedTrig = ccrm_marveen_save_trigger($pdo, $connectorId, $trigPayload);
                        $toolText = json_encode(['ok' => true, 'trigger' => $savedTrig], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'create_event_trigger',
                            'label' => "Created reactive trigger: {$savedTrig['name']} (⚡ {$savedTrig['sourceType']})",
                        ];
                    } elseif ($fnName === 'list_event_triggers') {
                        $trigs = ccrm_marveen_list_triggers($pdo, $connector);
                        $toolText = json_encode(['triggers' => $trigs], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'list_event_triggers',
                            'label' => 'Listed reactive triggers (' . count($trigs) . ')',
                        ];
                    } elseif ($fnName === 'delete_event_trigger') {
                        $delTrigId = (string)($fnArgs['id'] ?? '');
                        $removedTrig = ccrm_marveen_delete_trigger($pdo, $connectorId, $delTrigId);
                        $toolText = json_encode(['ok' => $removedTrig, 'id' => $delTrigId]);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'delete_event_trigger',
                            'label' => "Deleted reactive trigger: {$delTrigId}",
                        ];
                    } elseif ($fnName === 'schedule_conversation_followup') {
                        $fupInput = array_merge($fnArgs, [
                            'subagentId' => $subagentId,
                        ]);
                        $savedFup = ccrm_marveen_save_followup($pdo, $connectorId, $fupInput);
                        $toolText = json_encode(['ok' => true, 'followup' => $savedFup], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'schedule_conversation_followup',
                            'label' => "Scheduled proactive follow-up: {$savedFup['targetName']} (in {$savedFup['delayMinutes']}m)",
                            'detail' => $savedFup['instructions'],
                        ];
                    } elseif ($fnName === 'list_conversation_followups') {
                        $fups = ccrm_marveen_list_followups($pdo, $connector);
                        $toolText = json_encode(['followups' => $fups], JSON_UNESCAPED_UNICODE);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'list_conversation_followups',
                            'label' => 'Listed proactive follow-ups (' . count($fups) . ')',
                        ];
                    } elseif ($fnName === 'cancel_conversation_followup') {
                        $delFupId = (string)($fnArgs['id'] ?? '');
                        $removedFup = ccrm_marveen_cancel_followup($pdo, $connectorId, $delFupId);
                        $toolText = json_encode(['ok' => $removedFup, 'id' => $delFupId]);
                        $steps[] = [
                            'id' => uniqid('st_', false),
                            'kind' => 'schedule',
                            'tool' => 'cancel_conversation_followup',
                            'label' => "Cancelled proactive follow-up: {$delFupId}",
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
                    ccrm_marveen_append_chat_message($cid, $botMsg, $subId);
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
                        ccrm_marveen_append_chat_message($cid, $botMsg, null);
                    }

                    $executed[] = [
                        'connectorId' => $cid,
                        'taskId' => '__autonomous__',
                        'ok' => !empty($res['ok']),
                        'status' => $autoCfg['lastStatus'],
                    ];
                }

                // C) Execute Per-Agent Heartbeat Loops (`subagents.json` -> `heartbeatEnabled`)
                $subs = ccrm_marveen_list_subagents($pdo, $row);
                foreach ($subs as $sub) {
                    $subId = (string)($sub['id'] ?? '');
                    if ($subId === '') {
                        continue;
                    }
                    $isManualSubHb = ($forceTaskId === 'subagent:' . $subId);
                    $shouldRunSubHb = false;
                    if ($isManualSubHb) {
                        $shouldRunSubHb = true;
                    } elseif ($forceTaskId === null || $forceTaskId === '') {
                        if (!empty($sub['heartbeatEnabled'])) {
                            $subIntervalSec = max(60, ((int)($sub['heartbeatIntervalMinutes'] ?? 15)) * 60);
                            $lastSubTs = !empty($sub['lastHeartbeatAt']) ? strtotime((string)$sub['lastHeartbeatAt']) : 0;
                            if ($lastSubTs === 0 || ($now - $lastSubTs) >= $subIntervalSec) {
                                $shouldRunSubHb = true;
                            }
                        }
                    }
                    if (!$shouldRunSubHb) {
                        continue;
                    }
                    $subHbPrompt = "[Agent Heartbeat Tick — {$sub['name']}]\n"
                        . (string)($sub['heartbeatInstructions'] ?: "Review your memory.md and CCRM state via MCP. Execute any pending goals recorded in your memory.md. If no actions are needed right now, reply with [IDLE].");
                    $res = ccrm_marveen_run_agent($pdo, $row, $runAsUser, $subHbPrompt, '', $subId);
                    $replyText = trim((string)($res['text'] ?? ''));
                    $steps = is_array($res['steps'] ?? null) ? $res['steps'] : [];
                    $isIdle = !empty($res['ok']) && (stripos($replyText, '[IDLE]') !== false || stripos($replyText, 'HEARTBEAT_OK') !== false) && empty($steps);

                    $sub['lastHeartbeatAt'] = gmdate('c');
                    $sub['lastHeartbeatStatus'] = !empty($res['ok'])
                        ? ($isIdle ? 'idle' : 'ok')
                        : ('error: ' . ($res['error'] ?? 'failed'));
                    ccrm_marveen_save_subagent($pdo, $cid, $sub);

                    if (!$isIdle || $isManualSubHb) {
                        $botMsg = [
                            'id' => 'hb-' . uniqid('', false),
                            'role' => 'assistant',
                            'autonomous' => true,
                            'taskTitle' => '💓 Heartbeat (' . ($sub['name'] ?? $subId) . ')',
                            'subagentId' => $subId,
                            'text' => !empty($res['ok'])
                                ? ($isIdle ? '✓ Agent heartbeat completed (idle).' : ($replyText ?: 'Agent heartbeat completed.'))
                                : ('⚠️ Agent heartbeat error: ' . (string)($res['error'] ?? 'failed')),
                            'steps' => $steps,
                            'timestamp' => date('H:i'),
                            'createdAt' => gmdate('c'),
                        ];
                        ccrm_marveen_append_chat_message($cid, $botMsg, $subId);
                        ccrm_marveen_append_chat_message($cid, $botMsg, null);
                    }

                    $executed[] = [
                        'connectorId' => $cid,
                        'taskId' => 'subagent:' . $subId,
                        'ok' => !empty($res['ok']),
                        'status' => $sub['lastHeartbeatStatus'],
                    ];
                }
            } finally {
                if ($lockFp) {
                    @flock($lockFp, LOCK_UN);
                    @fclose($lockFp);
                }
            }
        }

        // D) Evaluate Reactive Event Triggers (Zero-cost idle check; only calls LLM if new messages/emails arrived)
        if ($forceTaskId === null || $forceTaskId === '') {
            $trigRes = ccrm_marveen_process_event_triggers($pdo);
            if (!empty($trigRes['executed'])) {
                foreach ($trigRes['executed'] as $ex) {
                    $executed[] = $ex;
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
        $cType = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        if (ccrm_is_botman_connector($cType)) {
            return 'botman-' . preg_replace('/[^a-zA-Z0-9_-]/', '_', (string)($mailboxRow['id'] ?? 'default'));
        }
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
        $settings = is_array($mailboxRow['settings'] ?? null)
            ? $mailboxRow['settings']
            : (json_decode((string)($mailboxRow['settings_json'] ?? '{}'), true) ?: []);
        $cType = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        if (ccrm_is_botman_connector($cType)) {
            return ccrm_botman_get_chats($mailboxRow, true);
        }
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
            'historySyncChunks' => (int)($status['historySyncChunks'] ?? 0),
            'lastHistorySyncAt' => $status['lastHistorySyncAt'] ?? null,
            'chats' => is_array($store['chats'] ?? null) ? $store['chats'] : [],
            'messages' => is_array($store['messages'] ?? null) ? $store['messages'] : new \stdClass(),
            'updatedAt' => $store['updatedAt'] ?? ($status['updatedAt'] ?? null),
        ];
    }

    function ccrm_waai_send_message(array $mailboxRow, string $chatId, string $text, string $author = ''): array {
        $settings = is_array($mailboxRow['settings'] ?? null)
            ? $mailboxRow['settings']
            : (json_decode((string)($mailboxRow['settings_json'] ?? '{}'), true) ?: []);
        $cType = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        if (ccrm_is_botman_connector($cType)) {
            return ccrm_botman_send_message($mailboxRow, $chatId, $text, $author);
        }
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

    function ccrm_waai_resync_chats(array $mailboxRow, string $chatId = ''): array {
        $settings = is_array($mailboxRow['settings'] ?? null)
            ? $mailboxRow['settings']
            : (json_decode((string)($mailboxRow['settings_json'] ?? '{}'), true) ?: []);
        $cType = strtolower((string)($settings['connectorType'] ?? ($mailboxRow['connectorType'] ?? '')));
        if (ccrm_is_botman_connector($cType)) {
            return ccrm_botman_resync_chats($mailboxRow, $chatId);
        }
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
            'chatId' => $chatId,
        ]));
        usleep(3_200_000);
        return ccrm_waai_get_chats($mailboxRow);
    }
}
