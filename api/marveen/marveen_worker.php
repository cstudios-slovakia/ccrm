<?php
/**
 * Worker isolation and CCRM MCP wiring.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

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
