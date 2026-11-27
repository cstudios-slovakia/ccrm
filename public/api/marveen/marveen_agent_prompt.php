<?php
/**
 * Agent system prompt, CRM snapshot and tool collection.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

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

if (!function_exists('ccrm_marveen_mcp_rpc_caller')) {
    function ccrm_marveen_mcp_rpc_caller(string $mcpUrl, string $mcpBearerKey): callable {
        return static function (string $method, array $params = []) use ($mcpUrl, $mcpBearerKey): ?array {
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
    }
}

if (!function_exists('ccrm_marveen_sanitize_json_schema')) {
    /**
     * Normalizes JSON Schema tool definitions for Gemini (uppercase types)
     * or Anthropic/OpenAI (standard lowercase JSON Schema types).
     */
    function ccrm_marveen_sanitize_json_schema($schema, bool $uppercaseTypes = true): array {
        $normType = static function (string $t) use ($uppercaseTypes): string {
            $upper = strtoupper(trim($t));
            if (!in_array($upper, ['OBJECT', 'STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY'], true)) {
                $upper = 'STRING';
            }
            return $uppercaseTypes ? $upper : strtolower($upper);
        };

        if (!is_array($schema)) {
            $out = ['type' => $normType('OBJECT')];
            if (!$uppercaseTypes) {
                $out['properties'] = (object)[];
            }
            return $out;
        }

        $out = ['type' => $normType((string)($schema['type'] ?? 'OBJECT'))];
        if (!empty($schema['description']) && is_string($schema['description'])) {
            $out['description'] = $schema['description'];
        }
        if (!empty($schema['enum']) && is_array($schema['enum'])) {
            $out['enum'] = array_values(array_map('strval', $schema['enum']));
        }

        $typeUpper = strtoupper($out['type']);
        if ($typeUpper === 'OBJECT') {
            $props = [];
            if (!empty($schema['properties']) && is_array($schema['properties'])) {
                foreach ($schema['properties'] as $k => $v) {
                    $props[$k] = ccrm_marveen_sanitize_json_schema($v, $uppercaseTypes);
                }
            }
            if (!empty($props) || !$uppercaseTypes) {
                $out['properties'] = (object)$props;
            }
            if (!empty($props) && !empty($schema['required']) && is_array($schema['required'])) {
                $req = array_values(array_filter($schema['required'], static fn($r) => is_string($r) && isset($props[$r])));
                if (!empty($req)) {
                    $out['required'] = $req;
                }
            }
        } elseif ($typeUpper === 'ARRAY') {
            $out['items'] = isset($schema['items']) && is_array($schema['items'])
                ? ccrm_marveen_sanitize_json_schema($schema['items'], $uppercaseTypes)
                : ['type' => $normType('STRING')];
        }

        return $out;
    }
}

if (!function_exists('ccrm_marveen_collect_agent_tools')) {
    /**
     * Collects built-in Marveen meta-tools + CCRM MCP tools normalized for the requested schema casing.
     */
    function ccrm_marveen_collect_agent_tools(callable $mcpCall, bool $isSubagent, bool $uppercaseSchema = true): array {
        $decls = [];
        $seen = [];
        foreach (ccrm_marveen_meta_tool_declarations($isSubagent) as $fd) {
            $name = (string)($fd['name'] ?? '');
            if ($name === '' || isset($seen[$name])) {
                continue;
            }
            $seen[$name] = true;
            $entry = [
                'name' => $name,
                'description' => (string)($fd['description'] ?? ''),
            ];
            if (!empty($fd['parameters']) && is_array($fd['parameters'])) {
                $entry['parameters'] = ccrm_marveen_sanitize_json_schema($fd['parameters'], $uppercaseSchema);
            } elseif (!$uppercaseSchema) {
                $entry['parameters'] = ['type' => 'object', 'properties' => (object)[]];
            }
            $decls[] = $entry;
        }

        $toolsResp = $mcpCall('tools/list');
        $mcpTools = is_array($toolsResp['result']['tools'] ?? null) ? $toolsResp['result']['tools'] : [];
        foreach ($mcpTools as $t) {
            $tName = (string)($t['name'] ?? '');
            if ($tName === '' || isset($seen[$tName])) {
                continue;
            }
            $seen[$tName] = true;
            $decl = [
                'name' => $tName,
                'description' => mb_substr((string)($t['description'] ?? ''), 0, 500, 'UTF-8'),
            ];
            if (!empty($t['inputSchema']) && is_array($t['inputSchema']) && !empty($t['inputSchema']['properties'])) {
                $decl['parameters'] = ccrm_marveen_sanitize_json_schema($t['inputSchema'], $uppercaseSchema);
            } elseif (!$uppercaseSchema) {
                $decl['parameters'] = ['type' => 'object', 'properties' => (object)[]];
            }
            $decls[] = $decl;
        }

        return $decls;
    }
}
