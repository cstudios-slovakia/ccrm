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

if (!function_exists('ccrm_marveen_is_agent_connector_type')) {
    function ccrm_marveen_is_agent_connector_type(string $cType): bool {
        return in_array(strtolower(trim($cType)), [
            'claude', 'antigravity', 'chatgpt',
            'claude_api', 'gemini_api', 'openai_api',
        ], true);
    }
}

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

require_once __DIR__ . '/marveen_login.php';
require_once __DIR__ . '/marveen_worker.php';
require_once __DIR__ . '/marveen_memory.php';
require_once __DIR__ . '/marveen_probe.php';
require_once __DIR__ . '/marveen_tools.php';
require_once __DIR__ . '/marveen_triggers.php';
require_once __DIR__ . '/marveen_triggers_followups.php';
require_once __DIR__ . '/marveen_triggers_crm.php';
require_once __DIR__ . '/marveen_agent_prompt.php';
require_once __DIR__ . '/marveen_agent_run.php';
require_once __DIR__ . '/marveen_autonomous.php';
require_once __DIR__ . '/marveen_graph.php';
require_once __DIR__ . '/marveen_waai.php';
