<?php
/**
 * Agent memory, subagents, tasks, chat history, followups and connector state.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

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
        $secretKeys = function_exists('ccrm_email_secret_keys')
            ? ccrm_email_secret_keys()
            : ['imapPassword', 'smtpPassword', 'subscriptionToken', 'apiKey', 'graphClientSecret'];
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
        $rawSubId = trim((string)($input['subagentId'] ?? ($input['subagent_id'] ?? '')));
        if ($rawSubId === '' && !empty($input['id']) && (string)$input['id'] !== $connectorId) {
            $rawSubId = trim((string)$input['id']);
        }
        $rawId = $rawSubId !== '' ? $rawSubId : $name;
        $id = preg_replace('/[^a-z0-9_-]/', '-', strtolower($rawId)) ?: ('sub-' . substr(bin2hex(random_bytes(3)), 0, 6));
        $id = trim($id, '-');
        if ($id === '' || $id === 'main' || $id === strtolower($connectorId)) {
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
                if (!ccrm_marveen_is_agent_connector_type($cType)) {
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
