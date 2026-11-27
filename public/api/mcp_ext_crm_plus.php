<?php
/**
 * CCRM MCP Gateway — Core CRM, Projects, Tasks & Meetings Extensions (WP2)
 *
 * Adds missing tools and shared helpers for Contacts, Client Categories,
 * Project Managers & Custom Attributes (`proj_data_*`), Gantt items (`proj_gantt_*`),
 * Project Timeline notes (`proj_timeline_*`), Lead Custom Fields (`LEAD_ATTRIBUTES`),
 * Recurring Task Templates, Tags, and Meeting Action Items (`meeting_tasks`).
 *
 * Loaded via require_once from public/api/mcp.php. Zero hard-delete SQL.
 */

function mcp_ext_crm_plus_permissions(): array {
    $v = fn(string ...$k) => ['view' => $k];
    $e = fn(string ...$k) => ['edit' => $k];
    return [
        'update_contact' => $e('clients'),
        'create_client_category' => $e('clients'),
        'update_client_category' => $e('clients'),
        'create_project_gantt_item' => $e('projects'),
        'update_project_gantt_item' => $e('projects'),
        'log_project_timeline_note' => $e('projects'),
        'update_recurring_task' => $e('tasks'),
        'list_tags' => $v('tasks'),
        'create_meeting_task' => $e('meetings'),
        'update_meeting_task' => $e('meetings'),
    ];
}

function mcp_ext_crm_plus_tool_definitions(): array {
    return [
        [
            'name' => 'update_contact',
            'description' => 'Update or archive/restore an individual contact person record linked to a client (or unlink it). Pass archived=true to soft-archive or archived=false to restore.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Contact person record ID'],
                    'first_name' => ['type' => 'string', 'description' => 'Contact first name'],
                    'last_name' => ['type' => 'string', 'description' => 'Contact last name'],
                    'name' => ['type' => 'string', 'description' => 'Full display name (if first/last omitted)'],
                    'email' => ['type' => 'string', 'description' => 'Email address'],
                    'phone' => ['type' => 'string', 'description' => 'Phone number'],
                    'role' => ['type' => 'string', 'description' => 'Position / contact role at the company'],
                    'function_tags' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Function / category tags (e.g. ["CEO", "Billing"])'],
                    'company_client_id' => ['type' => 'string', 'description' => 'Linked company client ID'],
                    'notes' => ['type' => 'string', 'description' => 'Notes'],
                    'archived' => ['type' => 'boolean', 'description' => 'true archives the contact, false restores it'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'create_client_category',
            'description' => 'Create a client classification category in client_categories (optionally nested under parent_id).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Category name'],
                    'parent_id' => ['type' => 'string', 'description' => 'Optional parent category ID'],
                    'color' => ['type' => 'string', 'description' => 'Hex color (e.g. #4f46e5)'],
                    'sort_order' => ['type' => 'integer', 'description' => 'Sort order (default 0)'],
                ],
                'required' => ['name'],
            ],
        ],
        [
            'name' => 'update_client_category',
            'description' => 'Rename, recolor, reorder, or reparent an existing client category.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Category ID'],
                    'name' => ['type' => 'string', 'description' => 'Category name'],
                    'parent_id' => ['type' => 'string', 'description' => 'Parent category ID (empty string clears)'],
                    'color' => ['type' => 'string', 'description' => 'Hex color'],
                    'sort_order' => ['type' => 'integer', 'description' => 'Sort order'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'create_project_gantt_item',
            'description' => 'Add a phase, bar, or milestone row to a project Gantt roadmap (proj_gantt_*). Bumps the parent project updated_at.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'project_id' => ['type' => 'string', 'description' => 'Project ID'],
                    'title' => ['type' => 'string', 'description' => 'Gantt row / phase title'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD'],
                    'end_date' => ['type' => 'string', 'description' => 'End date YYYY-MM-DD'],
                    'progress' => ['type' => 'number', 'description' => 'Completion percentage 0-100 (default 0)'],
                    'status' => ['type' => 'string', 'description' => 'Row status (default pending)'],
                    'color' => ['type' => 'string', 'description' => 'Hex color'],
                ],
                'required' => ['project_id', 'title'],
            ],
        ],
        [
            'name' => 'update_project_gantt_item',
            'description' => 'Update dates, progress, status, title, or color of an existing project Gantt row.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'project_id' => ['type' => 'string', 'description' => 'Project ID'],
                    'item_id' => ['type' => 'string', 'description' => 'Gantt row ID'],
                    'title' => ['type' => 'string', 'description' => 'Row title'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD (empty string clears)'],
                    'end_date' => ['type' => 'string', 'description' => 'End date YYYY-MM-DD (empty string clears)'],
                    'progress' => ['type' => 'number', 'description' => 'Completion 0-100'],
                    'status' => ['type' => 'string', 'description' => 'Row status (e.g. pending, in_progress, done, completed)'],
                    'color' => ['type' => 'string', 'description' => 'Hex color'],
                ],
                'required' => ['project_id', 'item_id'],
            ],
        ],
        [
            'name' => 'log_project_timeline_note',
            'description' => 'Add a note to a project (type note, the default: it appears in the Notes tab of the project and leaves a "Note added" entry on the timeline), or append another activity entry (any other type) to the project internal timeline (proj_timeline_*). Bumps project updated_at.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'project_id' => ['type' => 'string', 'description' => 'Project ID'],
                    'title' => ['type' => 'string', 'description' => 'Entry title'],
                    'content' => ['type' => 'string', 'description' => 'Detailed entry body'],
                    'type' => ['type' => 'string', 'description' => 'Entry type (default note)'],
                ],
                'required' => ['project_id', 'title'],
            ],
        ],
        [
            'name' => 'update_recurring_task',
            'description' => 'Update a recurring task template (schedule, title, owner, assignees, tags, pause/resume via active, or archive/restore via archived).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Recurring task template ID'],
                    'title' => ['type' => 'string', 'description' => 'Template title'],
                    'description' => ['type' => 'string', 'description' => 'Template description'],
                    'priority' => ['type' => 'string', 'enum' => ['low', 'medium', 'high']],
                    'owner' => ['type' => 'string', 'description' => 'Default owner'],
                    'frequency' => ['type' => 'string', 'enum' => ['daily', 'weekly', 'monthly', 'yearly']],
                    'interval' => ['type' => 'integer', 'description' => 'Repeat interval >= 1'],
                    'days_of_week' => ['type' => 'array', 'items' => ['type' => 'integer'], 'description' => 'Weekly days 0=Sun..6=Sat'],
                    'day_of_month' => ['type' => 'integer', 'description' => 'Monthly day 1-31'],
                    'time' => ['type' => 'string', 'description' => 'Deadline time HH:MM'],
                    'active' => ['type' => 'boolean', 'description' => 'true enables generation, false pauses it'],
                    'archived' => ['type' => 'boolean', 'description' => 'true archives the template, false restores it'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID; empty string clears'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked lead/client ID; empty string clears'],
                    'assignees' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Additional assignee names'],
                    'tags' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Tag names to attach'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'list_tags',
            'description' => 'List all task tags configured/used in the workspace along with their usage counts on open tasks.',
            'inputSchema' => ['type' => 'object', 'properties' => ['search' => ['type' => 'string', 'description' => 'Filter tags by name']]],
        ],
        [
            'name' => 'create_meeting_task',
            'description' => 'Add a follow-up action item directly to a meeting record (meeting_tasks).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'meeting_id' => ['type' => 'string', 'description' => 'Meeting ID'],
                    'title' => ['type' => 'string', 'description' => 'Action item title'],
                    'assigned_user' => ['type' => 'string', 'description' => 'Assigned team member name'],
                    'due_date' => ['type' => 'string', 'description' => 'Due date YYYY-MM-DD'],
                    'priority' => ['type' => 'string', 'enum' => ['low', 'medium', 'high']],
                    'status' => ['type' => 'string', 'enum' => ['todo', 'in_progress', 'done'], 'description' => 'Initial status (default todo)'],
                ],
                'required' => ['meeting_id', 'title'],
            ],
        ],
        [
            'name' => 'update_meeting_task',
            'description' => 'Update an action item on a meeting (mark done, change title, assignee, priority, or due_date).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Meeting action item ID'],
                    'title' => ['type' => 'string', 'description' => 'Action item title'],
                    'assigned_user' => ['type' => 'string', 'description' => 'Assignee name'],
                    'due_date' => ['type' => 'string', 'description' => 'Due date YYYY-MM-DD (empty string clears)'],
                    'priority' => ['type' => 'string', 'enum' => ['low', 'medium', 'high']],
                    'status' => ['type' => 'string', 'enum' => ['todo', 'in_progress', 'done']],
                ],
                'required' => ['id'],
            ],
        ],
    ];
}

function mcp_ext_crm_plus_execute(\PDO $pdo, array $user, string $tool, array $args) {
    switch ($tool) {
        case 'update_contact':
            return mcp_crm_plus_update_contact($pdo, $user, $args);
        case 'create_client_category':
            return mcp_crm_plus_create_client_category($pdo, $user, $args);
        case 'update_client_category':
            return mcp_crm_plus_update_client_category($pdo, $user, $args);
        case 'create_project_gantt_item':
            return mcp_crm_plus_create_gantt_item($pdo, $user, $args);
        case 'update_project_gantt_item':
            return mcp_crm_plus_update_gantt_item($pdo, $user, $args);
        case 'log_project_timeline_note':
            return mcp_crm_plus_log_project_timeline($pdo, $user, $args);
        case 'update_recurring_task':
            return mcp_crm_plus_update_recurring_task($pdo, $user, $args);
        case 'list_tags':
            return mcp_crm_plus_list_tags($pdo, $args);
        case 'create_meeting_task':
            return mcp_crm_plus_create_meeting_task($pdo, $user, $args);
        case 'update_meeting_task':
            return mcp_crm_plus_update_meeting_task($pdo, $user, $args);
        default:
            return MCP_NOT_MINE;
    }
}

// ---------------------------------------------------------------------------
// Shared CRM / Project / Task Helpers used by core tools too
// ---------------------------------------------------------------------------

function mcp_crm_plus_safe_project_table(string $typeId, string $prefix): string {
    return $prefix . preg_replace('/[^a-z0-9_]/', '', strtolower($typeId));
}

function mcp_crm_plus_lead_attr_defs(\PDO $pdo): array {
    $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'LEAD_ATTRIBUTES'")->fetchColumn();
    $defs = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
    return function_exists('ccrm_normalize_lead_attributes') ? ccrm_normalize_lead_attributes($defs) : (is_array($defs) ? $defs : []);
}

function mcp_crm_plus_merge_lead_custom_fields(\PDO $pdo, array $incoming, array $existing = []): array {
    $byId = [];
    foreach (mcp_crm_plus_lead_attr_defs($pdo) as $a) {
        if (!empty($a['id'])) $byId[(string)$a['id']] = $a;
    }
    $merged = $existing;
    foreach ($incoming as $k => $v) {
        $key = trim((string)$k);
        if ($key === '') continue;
        if ($v === null || $v === '') {
            unset($merged[$key]);
            continue;
        }
        $def = $byId[$key] ?? null;
        if ($def && !empty($def['options']) && is_array($def['options'])) {
            $type = (string)($def['type'] ?? 'textfield');
            if ($type === 'select' || $type === 'radio') {
                $valStr = trim((string)$v);
                if ($valStr !== '' && !in_array($valStr, $def['options'], true)) {
                    throw new \InvalidArgumentException("Invalid option '{$valStr}' for lead custom field '{$def['name']}' ({$key}). Allowed: " . implode(', ', $def['options']));
                }
            } elseif ($type === 'checkbox' && is_array($v)) {
                $checked = isset($v['checked']) && is_array($v['checked']) ? $v['checked'] : (array_is_list($v) ? $v : []);
                foreach ($checked as $opt) {
                    $oStr = trim((string)$opt);
                    if ($oStr !== '' && !in_array($oStr, $def['options'], true)) {
                        throw new \InvalidArgumentException("Invalid checkbox option '{$oStr}' for lead custom field '{$def['name']}' ({$key}).");
                    }
                }
            }
        }
        $merged[$key] = $v;
    }
    return $merged;
}

function mcp_crm_plus_assert_stage_required_fields(\PDO $pdo, array $customFields, string $targetStatus): void {
    $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'LEAD_ATTRIBUTES'")->fetchColumn();
    $rawDefs = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($rawDefs)) return;
    $targetLow = strtolower($targetStatus);
    $missing = [];
    foreach ($rawDefs as $def) {
        if (!is_array($def) || empty($def['id']) || empty($def['requiredStages']) || !is_array($def['requiredStages'])) continue;
        $stages = array_map(fn($s) => strtolower(trim((string)$s)), $def['requiredStages']);
        if (!in_array($targetLow, $stages, true)) continue;
        $val = $customFields[(string)$def['id']] ?? null;
        $empty = $val === null || $val === '' || (is_array($val) && empty($val))
            || (is_array($val) && array_key_exists('amount', $val) && ($val['amount'] === null || $val['amount'] === ''));
        if ($empty) $missing[] = (string)($def['name'] ?? $def['id']);
    }
    if ($missing) {
        throw new \InvalidArgumentException("Stage '{$targetStatus}' requires lead custom field(s): " . implode(', ', $missing));
    }
}

function mcp_crm_plus_encode_email_whitelist($raw): ?string {
    $list = is_array($raw) ? $raw : [$raw];
    $clean = array_values(array_unique(array_filter(array_map(fn($x) => trim((string)$x), $list))));
    return $clean ? json_encode($clean, JSON_UNESCAPED_UNICODE) : null;
}

function mcp_crm_plus_decode_lead_custom_fields(array $row): array {
    $cfRaw = $row['custom_fields_json'] ?? null;
    $decoded = is_string($cfRaw) && $cfRaw !== '' ? json_decode($cfRaw, true) : null;
    $row['custom_fields'] = is_array($decoded) ? (object)$decoded : (object)[];
    return $row;
}

function mcp_crm_plus_resolve_manager_ids(\PDO $pdo, array $managers): array {
    $ids = [];
    $stmt = $pdo->prepare("SELECT `id` FROM `users` WHERE `id` = ? OR LOWER(TRIM(`name`)) = LOWER(TRIM(?)) LIMIT 1");
    foreach ($managers as $m) {
        $raw = trim((string)$m);
        if ($raw === '') continue;
        $stmt->execute([$raw, $raw]);
        $uid = $stmt->fetchColumn();
        if (!$uid) throw new \InvalidArgumentException("'{$raw}' is not a registered user.");
        $ids[] = (string)$uid;
    }
    return array_values(array_unique($ids));
}

function mcp_crm_plus_sync_project_managers(\PDO $pdo, string $projectId, array $managers): void {
    // Additive assignment without hard removals in mcp*.php
    $ins = $pdo->prepare("INSERT IGNORE INTO `project_managers` (`project_id`, `user_id`) VALUES (?, ?)");
    foreach (mcp_crm_plus_resolve_manager_ids($pdo, $managers) as $uid) {
        $ins->execute([$projectId, $uid]);
    }
}

function mcp_crm_plus_upsert_project_data(\PDO $pdo, string $typeId, string $projectId, array $customFields): void {
    $table = mcp_crm_plus_safe_project_table($typeId, 'proj_data_');
    try {
        if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->rowCount() === 0) return;
        $cols = ['`id`', '`project_id`'];
        $phs = ['?', '?'];
        $vals = [$projectId, $projectId];
        $upd = [];
        foreach ($customFields as $attrId => $val) {
            $col = 'attr_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$attrId));
            if ($col === 'attr_') continue;
            $chk = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . $pdo->quote($col));
            if (!$chk || $chk->rowCount() === 0) continue;
            $cols[] = "`{$col}`";
            $phs[] = '?';
            $vals[] = ($val === null || $val === '') ? null : (is_scalar($val) ? $val : json_encode($val, JSON_UNESCAPED_UNICODE));
            $upd[] = "`{$col}` = VALUES(`{$col}`)";
        }
        if ($upd) {
            $sql = "INSERT INTO `{$table}` (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $phs) . ") ON DUPLICATE KEY UPDATE " . implode(', ', $upd);
            $pdo->prepare($sql)->execute($vals);
        }
    } catch (\Throwable $e) {
        // Ignore missing optional dynamic table
    }
}

function mcp_crm_plus_load_project_extras(\PDO $pdo, array $proj): array {
    $extras = ['managers' => [], 'custom_fields' => (object)[], 'timeline' => []];
    $id = (string)$proj['id'];
    $typeId = (string)($proj['project_type_id'] ?? '');
    try {
        $mStmt = $pdo->prepare(
            "SELECT pm.`user_id`, u.`name`
             FROM `project_managers` pm
             LEFT JOIN `users` u ON u.`id` = pm.`user_id`
             WHERE pm.`project_id` = ?"
        );
        $mStmt->execute([$id]);
        $mgrs = [];
        foreach ($mStmt->fetchAll(\PDO::FETCH_ASSOC) as $mr) {
            $mgrs[] = ['user_id' => (string)$mr['user_id'], 'name' => $mr['name'] !== null ? (string)$mr['name'] : (string)$mr['user_id']];
        }
        $extras['managers'] = $mgrs;
    } catch (\Throwable $e) {}

    if ($typeId !== '') {
        try {
            $dataTbl = mcp_crm_plus_safe_project_table($typeId, 'proj_data_');
            if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($dataTbl))->rowCount() > 0) {
                $dStmt = $pdo->prepare("SELECT * FROM `{$dataTbl}` WHERE `project_id` = ? OR `id` = ? LIMIT 1");
                $dStmt->execute([$id, $id]);
                $dRow = $dStmt->fetch(\PDO::FETCH_ASSOC);
                if ($dRow) {
                    $cf = [];
                    foreach ($dRow as $k => $v) {
                        if (strpos($k, 'attr_') === 0 && $v !== null && $v !== '') {
                            $cf[substr($k, 5)] = $v;
                        }
                    }
                    $extras['custom_fields'] = $cf ? (object)$cf : (object)[];
                }
            }
        } catch (\Throwable $e) {}

        try {
            $tlTbl = mcp_crm_plus_safe_project_table($typeId, 'proj_timeline_');
            if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($tlTbl))->rowCount() > 0) {
                $tStmt = $pdo->prepare("SELECT * FROM `{$tlTbl}` WHERE `project_id` = ? ORDER BY `timestamp` DESC LIMIT 20");
                $tStmt->execute([$id]);
                $extras['timeline'] = $tStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            }
        } catch (\Throwable $e) {}
    }
    return $extras;
}

function mcp_crm_plus_resolve_linked_tickets(\PDO $pdo, string $taskId): void {
    try {
        $tckStmt = $pdo->prepare("SELECT `ticket_id` FROM `ticket_task_links` WHERE `task_id` = ? AND `sync_mode` = 'auto_resolve'");
        $tckStmt->execute([$taskId]);
        $ticketIds = $tckStmt->fetchAll(\PDO::FETCH_COLUMN) ?: [];
        if (!$ticketIds) return;
        foreach ($ticketIds as $tckId) {
            // Only auto-resolve when every auto-resolved linked task is done
            $allStmt = $pdo->prepare(
                "SELECT tk.status FROM `tasks` tk
                 JOIN `ticket_task_links` l ON l.task_id = tk.id
                 WHERE l.ticket_id = ? AND l.sync_mode = 'auto_resolve' AND " . ccrm_sql_real_tasks('tk') . " AND (tk.archived = 0 OR tk.archived IS NULL)"
            );
            $allStmt->execute([$tckId]);
            $statuses = $allStmt->fetchAll(\PDO::FETCH_COLUMN) ?: [];
            if (!$statuses) continue;
            $states = (array)mcp_config_json($pdo, 'TASK_STATES', []);
            $allDone = true;
            foreach ($statuses as $st) {
                if (!mcp_done_task_state((string)$st, $states)) {
                    $allDone = false;
                    break;
                }
            }
            if (!$allDone) continue;
            $pdo->prepare("UPDATE `tickets` SET `status` = 'resolved', `resolved_at` = COALESCE(`resolved_at`, NOW()), `updated_at` = NOW() WHERE `id` = ? AND `status` NOT IN ('resolved', 'closed')")
                ->execute([$tckId]);
        }
    } catch (\Throwable $e) {
        // Non-fatal if ticket tables aren't present
    }
}

function mcp_crm_plus_bump_locking_projects(\PDO $pdo, string $taskId): void {
    $stmt = $pdo->prepare("SELECT `related_project_id`, `is_locking` FROM `tasks` WHERE `id` = ? AND " . ccrm_sql_real_tasks());
    $stmt->execute([$taskId]);
    $r = $stmt->fetch(\PDO::FETCH_ASSOC);
    if ($r && !empty($r['related_project_id']) && !empty($r['is_locking'])) {
        $pdo->prepare("UPDATE `projects` SET `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?")->execute([$r['related_project_id']]);
    }
}

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

function mcp_crm_plus_update_contact(\PDO $pdo, array $user, array $args): array {
    mcp_ensure_contact_tags_column($pdo);
    $id = mcp_require_string($args, 'id');
    $stmt = $pdo->prepare("SELECT * FROM `client_contacts` WHERE `id` = ? LIMIT 1");
    $stmt->execute([$id]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row) {
        throw new \Exception("Contact person not found with ID: {$id}");
    }

    $sets = [];
    $params = [];
    $first = array_key_exists('first_name', $args) ? trim((string)$args['first_name']) : (string)($row['first_name'] ?? '');
    $last = array_key_exists('last_name', $args) ? trim((string)$args['last_name']) : (string)($row['last_name'] ?? '');
    if (array_key_exists('first_name', $args)) { $sets[] = '`first_name` = ?'; $params[] = $first === '' ? null : $first; }
    if (array_key_exists('last_name', $args)) { $sets[] = '`last_name` = ?'; $params[] = $last === '' ? null : $last; }
    if (array_key_exists('name', $args)) {
        $n = mcp_require_string($args, 'name');
        $sets[] = '`name` = ?'; $params[] = $n;
    } elseif (array_key_exists('first_name', $args) || array_key_exists('last_name', $args)) {
        $full = trim($first . ' ' . $last);
        if ($full !== '') {
            $sets[] = '`name` = ?'; $params[] = $full;
        }
    }
    $map = [
        'email' => 'email',
        'phone' => 'phone',
        'company_client_id' => 'company_client_id',
        'notes' => 'notes',
    ];
    foreach ($map as $argKey => $col) {
        if (array_key_exists($argKey, $args)) {
            $v = $args[$argKey] === null ? null : trim((string)$args[$argKey]);
            if ($col === 'company_client_id' && $v !== null && $v !== '') {
                mcp_row_exists($pdo, 'leads', $v, 'Company client');
            }
            $sets[] = "`{$col}` = ?";
            $params[] = ($v === '' ? null : $v);
        }
    }
    $updatedTags = null;
    if (array_key_exists('function_tags', $args)) {
        $enc = mcp_encode_contact_tags($args['function_tags'], array_key_exists('role', $args) ? (string)$args['role'] : null);
        $sets[] = '`contact_tags` = ?'; $params[] = $enc['json'];
        $sets[] = '`contact_role` = ?'; $params[] = $enc['summary'];
        $updatedTags = $enc['tags'];
    } elseif (array_key_exists('role', $args)) {
        $v = $args['role'] === null ? null : trim((string)$args['role']);
        $enc = mcp_encode_contact_tags(null, $v);
        $sets[] = '`contact_role` = ?'; $params[] = ($v === '' ? null : $v);
        $sets[] = '`contact_tags` = ?'; $params[] = $enc['json'];
        $updatedTags = $enc['tags'];
    }
    if (array_key_exists('archived', $args)) {
        $sets[] = '`archived` = ?';
        $params[] = !empty($args['archived']) ? 1 : 0;
    }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE `client_contacts` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);
    mcp_audit($pdo, $user, 'contact_update', "Updated contact $id");
    $out = ['success' => true, 'id' => $id];
    if ($updatedTags !== null) $out['function_tags'] = $updatedTags;
    return $out;
}

function mcp_crm_plus_create_client_category(\PDO $pdo, array $user, array $args): array {
    $name = mcp_require_string($args, 'name');
    $parentId = !empty($args['parent_id']) ? trim((string)$args['parent_id']) : null;
    if ($parentId !== null) mcp_row_exists($pdo, 'client_categories', $parentId, 'Parent client category');
    $color = !empty($args['color']) ? trim((string)$args['color']) : '#4f46e5';
    $sortOrder = (int)($args['sort_order'] ?? 0);
    $id = 'ccat_' . bin2hex(random_bytes(8));
    $pdo->prepare("INSERT INTO `client_categories` (`id`, `name`, `parent_id`, `color`, `sort_order`) VALUES (?, ?, ?, ?, ?)")
        ->execute([$id, $name, $parentId, $color, $sortOrder]);
    mcp_audit($pdo, $user, 'client_category_create', "Created client category '$name' ($id)");
    return ['success' => true, 'id' => $id, 'name' => $name, 'parent_id' => $parentId, 'color' => $color];
}

function mcp_crm_plus_update_client_category(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    mcp_row_exists($pdo, 'client_categories', $id, 'Client category');
    $sets = [];
    $params = [];
    if (array_key_exists('name', $args)) { $sets[] = '`name` = ?'; $params[] = mcp_require_string($args, 'name'); }
    if (array_key_exists('parent_id', $args)) {
        $p = trim((string)$args['parent_id']);
        if ($p === $id) throw new \InvalidArgumentException('A category cannot be its own parent.');
        if ($p !== '') mcp_row_exists($pdo, 'client_categories', $p, 'Parent client category');
        $sets[] = '`parent_id` = ?';
        $params[] = $p === '' ? null : $p;
    }
    if (array_key_exists('color', $args)) { $sets[] = '`color` = ?'; $params[] = trim((string)$args['color']) ?: '#4f46e5'; }
    if (array_key_exists('sort_order', $args)) { $sets[] = '`sort_order` = ?'; $params[] = (int)$args['sort_order']; }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE `client_categories` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);
    mcp_audit($pdo, $user, 'client_category_update', "Updated client category $id");
    return ['success' => true, 'id' => $id];
}

function mcp_crm_plus_project_type_for(\PDO $pdo, string $projectId): string {
    $stmt = $pdo->prepare("SELECT `project_type_id` FROM `projects` WHERE `id` = ?");
    $stmt->execute([$projectId]);
    $typeId = $stmt->fetchColumn();
    if (!$typeId) throw new \Exception("Project not found with ID: {$projectId}");
    return (string)$typeId;
}

function mcp_crm_plus_create_gantt_item(\PDO $pdo, array $user, array $args): array {
    $projectId = mcp_require_string($args, 'project_id');
    $title = mcp_require_string($args, 'title');
    $typeId = mcp_crm_plus_project_type_for($pdo, $projectId);
    $table = mcp_crm_plus_safe_project_table($typeId, 'proj_gantt_');
    if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->rowCount() === 0) {
        throw new \Exception("Gantt table does not exist for project type '{$typeId}'.");
    }
    $start = mcp_optional_date($args, 'start_date');
    $end = mcp_optional_date($args, 'end_date');
    if ($start && $end && $end < $start) throw new \InvalidArgumentException("'end_date' cannot be before 'start_date'.");
    $progress = max(0, min(100, (float)($args['progress'] ?? 0)));
    $status = trim((string)($args['status'] ?? 'pending')) ?: 'pending';
    $color = !empty($args['color']) ? trim((string)$args['color']) : null;
    $id = 'gantt_' . bin2hex(random_bytes(8));

    $colsStmt = $pdo->query("SHOW COLUMNS FROM `{$table}`");
    $colNames = $colsStmt->fetchAll(\PDO::FETCH_COLUMN);
    $rowCols = [];
    $rowVals = [];
    $candidates = [
        'id' => $id,
        'project_id' => $projectId,
        'title' => $title,
        'start_date' => $start,
        'end_date' => $end,
        'progress' => $progress,
        'status' => $status,
        'color' => $color,
    ];
    foreach ($candidates as $c => $v) {
        if (in_array($c, $colNames, true)) {
            $rowCols[] = "`{$c}`";
            $rowVals[] = $v;
        }
    }
    $phs = implode(', ', array_fill(0, count($rowCols), '?'));
    $pdo->prepare("INSERT INTO `{$table}` (" . implode(', ', $rowCols) . ") VALUES ($phs)")->execute($rowVals);
    $pdo->prepare("UPDATE `projects` SET `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?")->execute([$projectId]);
    mcp_audit($pdo, $user, 'project_gantt_create', "Added Gantt item '$title' on project $projectId");
    return ['success' => true, 'id' => $id, 'project_id' => $projectId, 'title' => $title];
}

function mcp_crm_plus_update_gantt_item(\PDO $pdo, array $user, array $args): array {
    $projectId = mcp_require_string($args, 'project_id');
    $itemId = mcp_require_string($args, 'item_id');
    $typeId = mcp_crm_plus_project_type_for($pdo, $projectId);
    $table = mcp_crm_plus_safe_project_table($typeId, 'proj_gantt_');
    if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->rowCount() === 0) {
        throw new \Exception("Gantt table does not exist for project type '{$typeId}'.");
    }
    $chk = $pdo->prepare("SELECT `id` FROM `{$table}` WHERE `id` = ? AND `project_id` = ? LIMIT 1");
    $chk->execute([$itemId, $projectId]);
    if (!$chk->fetchColumn()) throw new \Exception("Gantt item not found: {$itemId}");

    $colNames = $pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(\PDO::FETCH_COLUMN);
    $sets = [];
    $params = [];
    if (array_key_exists('title', $args) && in_array('title', $colNames, true)) {
        $sets[] = '`title` = ?'; $params[] = mcp_require_string($args, 'title');
    }
    foreach (['start_date', 'end_date'] as $df) {
        if (array_key_exists($df, $args) && in_array($df, $colNames, true)) {
            $sets[] = "`{$df}` = ?";
            $params[] = ($args[$df] === '' || $args[$df] === null) ? null : mcp_require_date($args, $df);
        }
    }
    if (array_key_exists('progress', $args) && in_array('progress', $colNames, true)) {
        $sets[] = '`progress` = ?';
        $params[] = max(0, min(100, (float)$args['progress']));
    }
    if (array_key_exists('status', $args) && in_array('status', $colNames, true)) {
        $sets[] = '`status` = ?'; $params[] = trim((string)$args['status']) ?: 'pending';
    }
    if (array_key_exists('color', $args) && in_array('color', $colNames, true)) {
        $sets[] = '`color` = ?'; $params[] = trim((string)$args['color']) ?: null;
    }
    if (!$sets) return ['success' => true, 'id' => $itemId, 'message' => 'No fields updated'];
    $params[] = $itemId;
    $params[] = $projectId;
    $pdo->prepare("UPDATE `{$table}` SET " . implode(', ', $sets) . " WHERE `id` = ? AND `project_id` = ?")->execute($params);
    $pdo->prepare("UPDATE `projects` SET `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?")->execute([$projectId]);
    mcp_audit($pdo, $user, 'project_gantt_update', "Updated Gantt item $itemId on project $projectId");
    return ['success' => true, 'id' => $itemId, 'project_id' => $projectId];
}

function mcp_crm_plus_log_project_timeline(\PDO $pdo, array $user, array $args): array {
    $projectId = mcp_require_string($args, 'project_id');
    $title = mcp_require_string($args, 'title');
    $typeId = mcp_crm_plus_project_type_for($pdo, $projectId);
    $table = mcp_crm_plus_safe_project_table($typeId, 'proj_timeline_');
    if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->rowCount() === 0) {
        throw new \Exception("Timeline table does not exist for project type '{$typeId}'.");
    }
    $id = 'ptl_' . bin2hex(random_bytes(8));
    $entryType = trim((string)($args['type'] ?? 'note')) ?: 'note';
    $loggedTitle = $title;
    $when = mcp_now_local();
    if ($entryType === 'note') {
        // A note is its own entity (table `notes`); the timeline only keeps a trace of it.
        require_once __DIR__ . '/notes_migration.php';
        ccrm_notes_ensure_table($pdo);
        $noteText = ccrm_notes_project_content($title, isset($args['content']) ? (string)$args['content'] : null);
        $pdo->prepare("INSERT INTO `notes` (`id`, `entity_type`, `entity_id`, `content`, `author`, `created_at`, `updated_at`) VALUES (?, 'project', ?, ?, ?, ?, ?)")
            ->execute(['note-' . $id, $projectId, $noteText, $user['name'], $when, $when]);
        $entryType = 'note_activity';
        $title = ccrm_notes_activity_title('added', 'en');
        $args['content'] = ccrm_notes_snippet($noteText);
    }
    $pdo->prepare("INSERT INTO `{$table}` (`id`, `project_id`, `type`, `timestamp`, `title`, `content`, `author`) VALUES (?, ?, ?, ?, ?, ?, ?)")
        ->execute([$id, $projectId, $entryType, $when, $title, $args['content'] ?? null, $user['name']]);
    $pdo->prepare("UPDATE `projects` SET `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?")->execute([$projectId]);
    mcp_audit($pdo, $user, 'project_timeline_log', "Logged note '$loggedTitle' on project $projectId");
    return ['success' => true, 'id' => $id, 'project_id' => $projectId];
}

function mcp_crm_plus_update_recurring_task(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $stmt = $pdo->prepare("SELECT * FROM `tasks` WHERE `id` = ? AND `task_kind` = 'recurring' LIMIT 1"); /* recurring-template: update existing template */
    $stmt->execute([$id]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \Exception("Recurring task template not found with ID: {$id}");

    $rule = json_decode((string)($row['recurrence_json'] ?? '{}'), true) ?: [];
    if (array_key_exists('frequency', $args)) $rule['frequency'] = mcp_enum($args, 'frequency', ['daily', 'weekly', 'monthly', 'yearly'], 'weekly');
    if (array_key_exists('interval', $args)) $rule['interval'] = max(1, (int)$args['interval']);
    if (array_key_exists('days_of_week', $args) && is_array($args['days_of_week'])) {
        $rule['daysOfWeek'] = array_values(array_filter(array_map('intval', $args['days_of_week']), fn($d) => $d >= 0 && $d <= 6));
    }
    if (array_key_exists('day_of_month', $args)) $rule['dayOfMonth'] = max(1, min(31, (int)$args['day_of_month']));
    if (array_key_exists('active', $args)) $rule['active'] = !empty($args['active']);

    $sets = ['`recurrence_json` = ?'];
    $params = [json_encode($rule, JSON_UNESCAPED_UNICODE)];
    if (array_key_exists('title', $args)) { $sets[] = '`title` = ?'; $params[] = mcp_require_string($args, 'title'); }
    if (array_key_exists('description', $args)) { $sets[] = '`description` = ?'; $params[] = $args['description']; }
    if (array_key_exists('priority', $args)) { $sets[] = '`priority` = ?'; $params[] = mcp_enum($args, 'priority', ['low', 'medium', 'high']); }
    if (array_key_exists('owner', $args)) { $sets[] = '`owner` = ?'; $params[] = mcp_user_exists($pdo, mcp_require_string($args, 'owner')); }
    if (array_key_exists('time', $args)) {
        $t = trim((string)$args['time']);
        if ($t !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) throw new \InvalidArgumentException("'time' must be HH:MM.");
        $sets[] = '`deadline_time` = ?'; $params[] = $t === '' ? null : $t;
    }
    if (array_key_exists('archived', $args)) { $sets[] = '`archived` = ?'; $params[] = !empty($args['archived']) ? 1 : 0; }
    if (array_key_exists('project_id', $args)) {
        $pid = trim((string)$args['project_id']);
        if ($pid !== '') mcp_row_exists($pdo, 'projects', $pid, 'Project');
        $sets[] = '`related_project_id` = ?'; $params[] = $pid === '' ? null : $pid;
    }
    if (array_key_exists('client_id', $args)) {
        $cid = trim((string)$args['client_id']);
        if ($cid !== '') mcp_row_exists($pdo, 'leads', $cid, 'Client/lead');
        $sets[] = '`related_lead_id` = ?'; $params[] = $cid === '' ? null : $cid;
    }

    $params[] = $id;
    $pdo->prepare("UPDATE `tasks` SET " . implode(', ', $sets) . " WHERE `id` = ? AND `task_kind` = 'recurring'")->execute($params); /* recurring-template: update existing template */
    if (!empty($args['assignees']) && is_array($args['assignees'])) {
        $ins = $pdo->prepare("INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
        foreach ($args['assignees'] as $uName) {
            $uName = trim((string)$uName);
            if ($uName !== '') $ins->execute([$id, mcp_user_exists($pdo, $uName)]);
        }
    }
    if (!empty($args['tags']) && is_array($args['tags'])) {
        $insTag = $pdo->prepare("INSERT IGNORE INTO `tags` (`name`) VALUES (?)");
        $insLink = $pdo->prepare("INSERT IGNORE INTO `task_tags` (`task_id`, `tag_name`) VALUES (?, ?)");
        foreach ($args['tags'] as $tg) {
            $tg = trim((string)$tg);
            if ($tg !== '') {
                $insTag->execute([$tg]);
                $insLink->execute([$id, $tg]);
            }
        }
    }
    mcp_audit($pdo, $user, 'recurring_task_update', "Updated recurring task template $id");
    return ['success' => true, 'id' => $id, 'active' => (bool)($rule['active'] ?? true)];
}

function mcp_crm_plus_list_tags(\PDO $pdo, array $args): array {
    $search = trim((string)($args['search'] ?? ''));
    $where = $search !== '' ? 'WHERE t.`name` LIKE ?' : '';
    $params = $search !== '' ? ['%' . $search . '%'] : [];
    $sql = "SELECT t.`name`, COUNT(DISTINCT tk.`id`) AS open_tasks
            FROM `tags` t
            LEFT JOIN `task_tags` tt ON tt.`tag_name` = t.`name`
            LEFT JOIN `tasks` tk ON tk.`id` = tt.`task_id` AND " . ccrm_sql_real_tasks('tk') . " AND (tk.`archived` = 0 OR tk.`archived` IS NULL)
            $where
            GROUP BY t.`name`
            ORDER BY t.`name` ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return array_map(fn($r) => ['name' => (string)$r['name'], 'open_tasks' => (int)$r['open_tasks']], $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function mcp_crm_plus_create_meeting_task(\PDO $pdo, array $user, array $args): array {
    $meetingId = mcp_require_string($args, 'meeting_id');
    mcp_row_exists($pdo, 'meeting_notes', $meetingId, 'Meeting');
    $title = mcp_require_string($args, 'title');
    $assignee = isset($args['assigned_user']) && trim((string)$args['assigned_user']) !== '' ? mcp_user_exists($pdo, (string)$args['assigned_user']) : null;
    $dueDate = mcp_optional_date($args, 'due_date');
    $priority = mcp_enum($args, 'priority', ['low', 'medium', 'high'], 'medium');
    $status = mcp_enum($args, 'status', ['todo', 'in_progress', 'done'], 'todo');
    $id = 'mt_' . bin2hex(random_bytes(8));

    $pdo->prepare("INSERT INTO `meeting_tasks` (`id`, `meeting_id`, `title`, `assigned_user`, `due_date`, `priority`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?)")
        ->execute([$id, $meetingId, $title, $assignee, $dueDate, $priority, $status]);
    $pdo->prepare("UPDATE `meeting_notes` SET `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?")->execute([$meetingId]);
    mcp_audit($pdo, $user, 'meeting_task_create', "Added action item '$title' to meeting $meetingId");
    return ['success' => true, 'id' => $id, 'meeting_id' => $meetingId, 'title' => $title, 'status' => $status];
}

function mcp_crm_plus_update_meeting_task(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $stmt = $pdo->prepare("SELECT `meeting_id` FROM `meeting_tasks` WHERE `id` = ? LIMIT 1");
    $stmt->execute([$id]);
    $meetingId = $stmt->fetchColumn();
    if (!$meetingId) throw new \Exception("Meeting action item not found with ID: {$id}");

    $sets = [];
    $params = [];
    if (array_key_exists('title', $args)) { $sets[] = '`title` = ?'; $params[] = mcp_require_string($args, 'title'); }
    if (array_key_exists('assigned_user', $args)) {
        $u = trim((string)$args['assigned_user']);
        $sets[] = '`assigned_user` = ?';
        $params[] = $u === '' ? null : mcp_user_exists($pdo, $u);
    }
    if (array_key_exists('due_date', $args)) {
        $sets[] = '`due_date` = ?';
        $params[] = ($args['due_date'] === '' || $args['due_date'] === null) ? null : mcp_require_date($args, 'due_date');
    }
    if (array_key_exists('priority', $args)) { $sets[] = '`priority` = ?'; $params[] = mcp_enum($args, 'priority', ['low', 'medium', 'high']); }
    if (array_key_exists('status', $args)) { $sets[] = '`status` = ?'; $params[] = mcp_enum($args, 'status', ['todo', 'in_progress', 'done']); }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];

    $params[] = $id;
    $pdo->prepare("UPDATE `meeting_tasks` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);
    $pdo->prepare("UPDATE `meeting_notes` SET `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?")->execute([$meetingId]);
    mcp_audit($pdo, $user, 'meeting_task_update', "Updated meeting action item $id");
    return ['success' => true, 'id' => $id, 'meeting_id' => $meetingId];
}

// ---------------------------------------------------------------------------
// Core Tool Delegations (keeps mcp.php under the 2,500-line ceiling)
// ---------------------------------------------------------------------------

function mcp_crm_plus_create_lead(\PDO $pdo, array $user, array $args): array {
    $id = 'ld_' . bin2hex(random_bytes(8));
    $name = mcp_require_string($args, 'name');
    $value = (float)($args['value'] ?? 0);
    $status = isset($args['status']) && $args['status'] !== '' ? mcp_check_lead_state($pdo, (string)$args['status']) : 'new';
    $owner = isset($args['owner']) && trim((string)$args['owner']) !== '' ? trim((string)$args['owner']) : $user['name'];
    $clientType = mcp_enum($args, 'client_type', ['person', 'business', 'partner'], 'business');
    $first = array_key_exists('contact_first_name', $args) ? (trim((string)$args['contact_first_name']) ?: null) : null;
    $last = array_key_exists('contact_last_name', $args) ? (trim((string)$args['contact_last_name']) ?: null) : null;
    $contact = $args['contact_person'] ?? (($first !== null || $last !== null) ? trim(($first ?? '') . ' ' . ($last ?? '')) : null);
    $cf = [];
    if (!empty($args['custom_fields']) && is_array($args['custom_fields'])) {
        $cf = mcp_crm_plus_merge_lead_custom_fields($pdo, $args['custom_fields'], []);
    }
    $cfJson = $cf ? json_encode($cf, JSON_UNESCAPED_UNICODE) : null;
    $source = isset($args['source']) && trim((string)$args['source']) !== '' ? trim((string)$args['source']) : 'ai_assistant';
    $division = isset($args['division']) && trim((string)$args['division']) !== '' ? trim((string)$args['division']) : null;
    $priceLevelId = isset($args['price_level_id']) && trim((string)$args['price_level_id']) !== '' ? trim((string)$args['price_level_id']) : null;
    $today = date('Y-m-d');

    mcp_tx($pdo, function () use ($pdo, $id, $name, $args, $contact, $first, $last, $value, $status, $owner, $clientType, $source, $division, $priceLevelId, $cfJson, $today) {
        $pdo->prepare(
            "INSERT INTO leads (id, name, city, street, postal_code, country, phone, email, contact_person, contact_first_name, contact_last_name, company_id, tax_id, vat_id, website, value, status, owner, division, client_type, price_level_id, interest_note, custom_fields_json, source, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([
            $id, $name, $args['city'] ?? null, $args['street'] ?? null, $args['postal_code'] ?? null, $args['country'] ?? 'Slovakia',
            $args['phone'] ?? null, $args['email'] ?? null, $contact, $first, $last,
            $args['company_id'] ?? null, $args['tax_id'] ?? null, $args['vat_id'] ?? null, $args['website'] ?? null,
            $value, $status, $owner, $division, $clientType, $priceLevelId, $args['interest_note'] ?? null, $cfJson, $source, $today,
        ]);
        if ($first === null && $last === null) ccrm_set_contact_parts_from_person($pdo, $id);
        if (!empty($args['categories']) && is_array($args['categories'])) {
            require_once __DIR__ . '/lead_attributes.php';
            ccrm_replace_lead_categories($pdo, $id, $args['categories']);
        }
    });
    mcp_audit($pdo, $user, 'lead_create', "Created lead '{$name}' (ID: $id) with value €{$value}");
    return ['success' => true, 'id' => $id, 'name' => $name, 'status' => $status, 'value' => $value, 'custom_fields' => (object)$cf];
}

function mcp_crm_plus_update_lead(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $curStmt = $pdo->prepare("SELECT * FROM leads WHERE id = ? LIMIT 1");
    $curStmt->execute([$id]);
    $row = $curStmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row || !mcp_lead_module_visible($row)) throw new \Exception("Lead not found with ID: {$id}");

    $updates = []; $params = [];
    $allowedFields = ['name', 'contact_person', 'email', 'phone', 'city', 'street', 'postal_code', 'country', 'value', 'rating', 'owner', 'interest_note', 'division', 'source', 'company_id', 'tax_id', 'vat_id', 'website', 'contact_first_name', 'contact_last_name', 'price_level_id'];
    foreach ($allowedFields as $f) {
        if (array_key_exists($f, $args)) { $updates[] = "`$f` = ?"; $params[] = $args[$f]; }
    }
    if (array_key_exists('name', $args) && trim((string)$args['name']) === '') {
        throw new \InvalidArgumentException("'name' cannot be empty.");
    }
    if (array_key_exists('archived', $args)) {
        $updates[] = "`archived` = ?"; $params[] = !empty($args['archived']) ? 1 : 0;
    }
    if (array_key_exists('custom_fields', $args)) {
        if (!is_array($args['custom_fields'])) throw new \InvalidArgumentException("'custom_fields' must be an object.");
        $existingCf = is_string($row['custom_fields_json'] ?? null) ? (json_decode($row['custom_fields_json'], true) ?: []) : [];
        $mergedCf = mcp_crm_plus_merge_lead_custom_fields($pdo, $args['custom_fields'], $existingCf);
        $updates[] = "`custom_fields_json` = ?";
        $params[] = $mergedCf ? json_encode($mergedCf, JSON_UNESCAPED_UNICODE) : null;
    }
    $hasCats = array_key_exists('categories', $args) && is_array($args['categories']);
    if (!$updates && !$hasCats) return ['success' => true, 'message' => 'No fields updated'];

    $previousName = (string)($row['name'] ?? '');
    if ($updates) {
        $params[] = $id;
        $pdo->prepare("UPDATE leads SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
    }
    if ((array_key_exists('contact_person', $args) || array_key_exists('name', $args)) && !array_key_exists('contact_first_name', $args) && !array_key_exists('contact_last_name', $args)) {
        ccrm_set_contact_parts_from_person($pdo, $id, $previousName);
    }
    if ($hasCats) {
        require_once __DIR__ . '/lead_attributes.php';
        ccrm_replace_lead_categories($pdo, $id, $args['categories']);
    }
    mcp_audit($pdo, $user, 'lead_update', "Updated lead $id");
    return ['success' => true, 'id' => $id, 'updated_fields' => array_keys($args)];
}

function mcp_crm_plus_transition_lead_stage(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $status = mcp_check_lead_state($pdo, mcp_require_string($args, 'status'));
    $note = trim((string)($args['note'] ?? ''));

    $cur = $pdo->prepare("SELECT * FROM leads WHERE id = ? LIMIT 1");
    $cur->execute([$id]);
    $row = $cur->fetch(\PDO::FETCH_ASSOC);
    if (!$row || !mcp_lead_module_visible($row)) throw new \Exception("Lead not found with ID: {$id}");
    $fromStatus = (string)$row['status'];
    if (strtolower($fromStatus) === strtolower($status)) {
        return ['success' => true, 'id' => $id, 'new_status' => $fromStatus, 'message' => 'Lead is already in this stage.'];
    }
    mcp_assert_lead_unlocked($pdo, $id);
    $cf = is_string($row['custom_fields_json'] ?? null) ? (json_decode($row['custom_fields_json'], true) ?: []) : [];
    mcp_crm_plus_assert_stage_required_fields($pdo, $cf, $status);

    mcp_tx($pdo, function () use ($pdo, $user, $id, $status, $fromStatus, $note) {
        $pdo->prepare("UPDATE leads SET status = ? WHERE id = ?")->execute([$status, $id]);
        $content = $fromStatus . ' → ' . $status . ($note !== '' ? "\n\n" . $note : '');
        $pdo->prepare(
            "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
             VALUES (?, ?, 'status_change', ?, 'Lead state changed', ?, ?)"
        )->execute([mcp_new_id('ev_'), $id, mcp_now_local(), $content, $user['name']]);
    });
    mcp_audit($pdo, $user, 'lead_stage_transition', "Moved lead $id from '$fromStatus' to '$status'");
    return ['success' => true, 'id' => $id, 'previous_status' => $fromStatus, 'new_status' => $status];
}

function mcp_crm_plus_convert_lead(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $lStmt = $pdo->prepare("SELECT * FROM leads WHERE id = ? LIMIT 1");
    $lStmt->execute([$id]);
    $lead = $lStmt->fetch(\PDO::FETCH_ASSOC);
    if (!$lead || !mcp_lead_module_visible($lead)) throw new \Exception("Lead not found with ID: {$id}");
    if (strpos($lead['id'], 'client-') === 0) throw new \Exception('This record is already a client.');

    $won = mcp_won_lead_state($pdo);
    $needsMove = strtolower((string)$lead['status']) !== strtolower($won);
    if ($needsMove) mcp_assert_lead_unlocked($pdo, $id);

    $projectName = trim((string)($args['project_name'] ?? '')) ?: ($lead['name'] ?: ('Project for ' . $id));
    $result = mcp_tx($pdo, function () use ($pdo, $user, $lead, $id, $won, $needsMove, $args, $projectName) {
        if ($needsMove) {
            $pdo->prepare("UPDATE leads SET status = ? WHERE id = ?")->execute([$won, $id]);
            $pdo->prepare(
                "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                 VALUES (?, ?, 'status_change', ?, 'Lead state changed', ?, ?)"
            )->execute([mcp_new_id('ev_'), $id, mcp_now_local(), $lead['status'] . ' → ' . $won, $user['name']]);
        }
        $exists = $pdo->prepare("SELECT id FROM leads WHERE id LIKE 'client-%' AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1");
        $exists->execute([$lead['name']]);
        $clientId = $exists->fetchColumn() ?: null;
        if (!$clientId) {
            $clientId = 'client-' . (int)round(microtime(true) * 1000);
            $pdo->prepare(
                "INSERT INTO leads (id, name, city, street, postal_code, country, phone, email, contact_person, company_id, tax_id, vat_id, website, client_type, division, price_level_id, status, source, owner, value, adjustment, rating, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_assistant', ?, 0, 0, ?, ?)"
            )->execute([
                $clientId, $lead['name'], $lead['city'], $lead['street'], $lead['postal_code'], $lead['country'] ?: 'Slovakia',
                $lead['phone'], $lead['email'], $lead['contact_person'], $lead['company_id'], $lead['tax_id'], $lead['vat_id'], $lead['website'],
                $lead['client_type'] ?: 'business', $lead['division'] ?? null, $lead['price_level_id'] ?? null, $won,
                $lead['owner'] ?: $user['name'], $lead['rating'] ?: 5, date('Y-m-d'),
            ]);
            $pdo->prepare("UPDATE leads SET contact_first_name = ?, contact_last_name = ? WHERE id = ?")
                ->execute([$lead['contact_first_name'] ?? null, $lead['contact_last_name'] ?? null, $clientId]);
            $pdo->prepare(
                "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                 VALUES (?, ?, 'note', ?, 'Client Registered', ?, ?)"
            )->execute([mcp_new_id('ev_'), $clientId, mcp_now_local(), 'Converted from lead ' . $id . ' via MCP.', $user['name']]);
        }
        $pdo->prepare("UPDATE leads SET client_id = ? WHERE id = ?")->execute([$clientId, $id]);
        $projectId = null;
        if (!empty($args['create_project'])) {
            $projArgs = ['name' => $projectName, 'client_id' => $id];
            if (!empty($args['project_type_id'])) $projArgs['project_type_id'] = $args['project_type_id'];
            $projectId = mcp_create_project_row($pdo, $projArgs);
            $ptStmt = $pdo->prepare("SELECT project_type_id FROM projects WHERE id = ?");
            $ptStmt->execute([$projectId]);
            $typeId = (string)$ptStmt->fetchColumn();
            if ($typeId !== '') {
                require_once __DIR__ . '/lead_attributes.php';
                ccrm_copy_lead_custom_fields_to_project($pdo, $id, $typeId, $projectId);
            }
        }
        return ['client_id' => $clientId, 'project_id' => $projectId];
    });
    mcp_audit($pdo, $user, 'lead_convert', "Converted lead $id to client {$result['client_id']}" . ($result['project_id'] ? " with project {$result['project_id']}" : ""));
    return ['success' => true, 'lead_id' => $id, 'lead_status' => $won, 'client_id' => $result['client_id'], 'project_id' => $result['project_id']];
}

function mcp_crm_plus_get_client(\PDO $pdo, array $args): array {
    mcp_ensure_contact_tags_column($pdo);
    $id = mcp_require_string($args, 'id');
    $scope = mcp_client_scope($pdo, $id);
    if (!$scope || !mcp_lead_module_visible($scope['record'])) throw new \Exception("Client not found with ID: " . $id);
    $client = mcp_crm_plus_decode_lead_custom_fields($scope['record']);
    $client['kind'] = $scope['is_client'] ? 'client' : 'lead';
    $client['url'] = mcp_scope_url($pdo, $scope);
    $client['record_ids'] = $scope['ids'];
    $client['function_tags'] = mcp_contact_tags_from_row($scope['record']);
    $client = array_merge($client, mcp_moments_of($pdo, 'leads', (string)$client['id'], ['updated_at']));
    if (($client['client_type'] ?? '') !== 'person' && !empty($scope['ids'])) {
        $in = implode(',', array_fill(0, count($scope['ids']), '?'));
        $cStmt = $pdo->prepare(
            "SELECT id, company_client_id, name, first_name, last_name, contact_role, contact_tags, email, phone, notes "
            . "FROM `client_contacts` WHERE company_client_id IN ({$in}) AND archived = 0 ORDER BY name ASC, id ASC"
        );
        $cStmt->execute($scope['ids']);
        $contacts = [];
        foreach ($cStmt->fetchAll(\PDO::FETCH_ASSOC) as $c) {
            $tags = mcp_contact_tags_from_row($c);
            $contacts[] = [
                'id' => $c['id'],
                'name' => $c['name'],
                'first_name' => $c['first_name'],
                'last_name' => $c['last_name'],
                'email' => $c['email'],
                'phone' => $c['phone'],
                'role' => $c['contact_role'] ?: ($tags ? implode(', ', $tags) : 'Contact'),
                'function_tags' => $tags,
                'notes' => $c['notes'],
            ];
        }
        $client['contacts'] = $contacts;
    }
    if (mcp_can('projects')) {
        $ctx = mcp_projects_ctx();
        $groups = mcp_project_status_groups($pdo);
        $client['projects'] = array_map(fn($p) => mcp_project_row($pdo, $p, $ctx, $groups), mcp_scope_projects($pdo, $scope));
    }
    if (mcp_can('invoices')) {
        $client['invoices'] = mcp_scope_invoice_docs($pdo, $scope, true, 50);
    }
    return $client;
}

function mcp_crm_plus_update_client(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $curStmt = $pdo->prepare("SELECT * FROM leads WHERE id = ? LIMIT 1");
    $curStmt->execute([$id]);
    $row = $curStmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row || !mcp_lead_module_visible($row)) throw new \Exception("Client not found with ID: {$id}");

    $allowedFields = ['name', 'company_id', 'tax_id', 'vat_id', 'website', 'contact_person', 'contact_first_name', 'contact_last_name', 'email', 'phone', 'street', 'city', 'postal_code', 'country', 'interest_note', 'owner', 'division', 'rating', 'adjustment', 'client_category_id', 'price_level_id', 'company_client_id', 'contact_role'];
    $updates = []; $params = [];
    foreach ($allowedFields as $f) {
        if (array_key_exists($f, $args)) {
            $v = $args[$f];
            if ($f === 'owner' && trim((string)$v) !== '') $v = mcp_user_exists($pdo, (string)$v);
            if ($f === 'client_category_id' && trim((string)$v) !== '') mcp_row_exists($pdo, 'client_categories', trim((string)$v), 'Client category');
            if ($f === 'company_client_id' && trim((string)$v) !== '') mcp_row_exists($pdo, 'leads', trim((string)$v), 'Company client');
            $updates[] = "`$f` = ?"; $params[] = ($v === '' ? null : $v);
        }
    }
    if (array_key_exists('client_type', $args)) {
        $updates[] = "`client_type` = ?"; $params[] = mcp_enum($args, 'client_type', ['business', 'person', 'partner']);
    }
    if (!empty($args['notes']) && !array_key_exists('interest_note', $args)) {
        $updates[] = "`interest_note` = ?"; $params[] = $args['notes'];
    }
    if (array_key_exists('archived', $args)) {
        $updates[] = "`archived` = ?"; $params[] = !empty($args['archived']) ? 1 : 0;
    }
    if (array_key_exists('ticket_allowed_emails', $args)) {
        $updates[] = "`ticket_allowed_emails` = ?"; $params[] = mcp_crm_plus_encode_email_whitelist($args['ticket_allowed_emails']);
    }
    if (array_key_exists('custom_fields', $args)) {
        if (!is_array($args['custom_fields'])) throw new \InvalidArgumentException("'custom_fields' must be an object.");
        $existingCf = is_string($row['custom_fields_json'] ?? null) ? (json_decode($row['custom_fields_json'], true) ?: []) : [];
        $mergedCf = mcp_crm_plus_merge_lead_custom_fields($pdo, $args['custom_fields'], $existingCf);
        $updates[] = "`custom_fields_json` = ?";
        $params[] = $mergedCf ? json_encode($mergedCf, JSON_UNESCAPED_UNICODE) : null;
    }
    if (array_key_exists('name', $args) && trim((string)$args['name']) === '') {
        throw new \InvalidArgumentException("'name' cannot be empty.");
    }
    if (!$updates) return ['success' => true, 'message' => 'No fields updated'];

    $params[] = $id;
    $pdo->prepare("UPDATE leads SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
    if ((array_key_exists('contact_person', $args) || array_key_exists('name', $args)) && !array_key_exists('contact_first_name', $args) && !array_key_exists('contact_last_name', $args)) {
        ccrm_set_contact_parts_from_person($pdo, $id, (string)$row['name']);
    }
    mcp_audit($pdo, $user, 'client_update', "Updated client $id");
    return ['success' => true, 'id' => $id, 'updated_fields' => array_keys($args)];
}

function mcp_crm_plus_create_contact(\PDO $pdo, array $user, array $args): array {
    mcp_ensure_contact_tags_column($pdo);
    $clientId = trim((string)($args['client_id'] ?? ''));
    if ($clientId !== '') {
        mcp_row_exists($pdo, 'leads', $clientId, 'Client/lead');
    }
    $first = array_key_exists('first_name', $args) ? (trim((string)$args['first_name']) ?: null) : null;
    $last = array_key_exists('last_name', $args) ? (trim((string)$args['last_name']) ?: null) : null;
    $contactName = isset($args['name']) && trim((string)$args['name']) !== ''
        ? trim((string)$args['name'])
        : trim(($first ?? '') . ' ' . ($last ?? ''));
    if ($contactName === '') throw new \InvalidArgumentException("'name' (or 'first_name'/'last_name') is required.");
    if ($first === null && $last === null && strpos($contactName, ' ') !== false) {
        $parts = preg_split('/\s+/', $contactName, 2);
        $first = $parts[0] ?? null;
        $last = $parts[1] ?? null;
    }
    $email = trim((string)($args['email'] ?? '')) ?: null;
    $phone = trim((string)($args['phone'] ?? '')) ?: null;
    $notes = trim((string)($args['notes'] ?? '')) ?: null;
    $enc = mcp_encode_contact_tags($args['function_tags'] ?? null, array_key_exists('role', $args) ? (string)$args['role'] : null);
    $role = $enc['summary'];
    $tagsJson = $enc['json'];

    $contactId = 'cc_' . bin2hex(random_bytes(8));
    $companyIdOrNull = $clientId !== '' ? $clientId : null;
    mcp_tx($pdo, function () use ($pdo, $user, $companyIdOrNull, $contactId, $contactName, $first, $last, $email, $phone, $role, $tagsJson, $notes) {
        $pdo->prepare(
            "INSERT INTO `client_contacts` (`id`, `company_client_id`, `name`, `first_name`, `last_name`, `email`, `phone`, `contact_role`, `contact_tags`, `notes`, `archived`, `created_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
        )->execute([$contactId, $companyIdOrNull, $contactName, $first, $last, $email, $phone, $role, $tagsJson, $notes, date('Y-m-d')]);
        if ($companyIdOrNull !== null) {
            $roleLabel = $role ?: 'Contact';
            $content = "Added contact: $contactName ($roleLabel)" . ($email ? " - $email" : "") . ($phone ? " - $phone" : "");
            $pdo->prepare(
                "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                 VALUES (?, ?, 'note', ?, 'Contact Person Added', ?, ?)"
            )->execute([mcp_new_id('ev_'), $companyIdOrNull, mcp_now_local(), $content, $user['name']]);
        }
    });
    mcp_audit($pdo, $user, 'contact_create', "Added contact '$contactName' ($contactId)" . ($companyIdOrNull ? " to client $companyIdOrNull" : ''));
    return [
        'success' => true,
        'id' => $contactId,
        'client_id' => $companyIdOrNull,
        'contact_name' => $contactName,
        'role' => $role ?: 'Contact',
        'function_tags' => $enc['tags'],
    ];
}

function mcp_crm_plus_add_task_comment(\PDO $pdo, array $user, array $args): array {
    $taskId = mcp_require_string($args, 'task_id');
    $comment = mcp_require_string($args, 'comment');
    [$scopeSql, $scopeParams] = mcp_task_scope($user);
    $tStmt = $pdo->prepare("SELECT title, related_lead_id, related_project_id FROM tasks WHERE id = ? AND " . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : ''));
    $tStmt->execute(array_merge([$taskId], $scopeParams));
    $task = $tStmt->fetch(\PDO::FETCH_ASSOC);
    if (!$task) throw new \Exception("Task not found with ID: {$taskId}");

    if (!empty($task['related_lead_id'])) {
        mcp_ensure_task_link($pdo);
        $pdo->prepare(
            "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author, task_id)
             VALUES (?, ?, 'note', ?, ?, ?, ?, ?)"
        )->execute([mcp_new_id('ev_'), $task['related_lead_id'], mcp_now_local(), 'Comment on task: ' . $task['title'], $comment, $user['name'], $taskId]);
        mcp_audit($pdo, $user, 'task_comment', "Commented on task $taskId");
        return ['success' => true, 'task_id' => $taskId, 'comment' => $comment];
    }

    if (!empty($task['related_project_id']) && mcp_can('projects')) {
        $typeId = mcp_crm_plus_project_type_for($pdo, (string)$task['related_project_id']);
        $tlTbl = mcp_crm_plus_safe_project_table($typeId, 'proj_timeline_');
        if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($tlTbl))->rowCount() > 0) {
            $pdo->prepare("INSERT INTO `{$tlTbl}` (`id`, `project_id`, `type`, `timestamp`, `title`, `content`, `author`) VALUES (?, ?, 'note', ?, ?, ?, ?)")
                ->execute([mcp_new_id('ptl_'), $task['related_project_id'], mcp_now_local(), 'Comment on task: ' . $task['title'], $comment, $user['name']]);
            $pdo->prepare("UPDATE `projects` SET `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?")->execute([$task['related_project_id']]);
            mcp_audit($pdo, $user, 'task_comment', "Commented on project task $taskId");
            return ['success' => true, 'task_id' => $taskId, 'project_id' => $task['related_project_id'], 'comment' => $comment];
        }
    }
    throw new \Exception('This task is not linked to a lead or client (or project timeline), so the comment has nowhere to be stored. Link it first with update_task (client_id).');
}

function mcp_crm_plus_create_milestone(\PDO $pdo, array $user, array $args): array {
    $projId = mcp_require_string($args, 'project_id');
    mcp_row_exists($pdo, 'projects', $projId, 'Project');
    $title = mcp_require_string($args, 'title');
    $deadline = mcp_require_date($args, 'deadline');
    $priority = mcp_enum($args, 'priority', ['low', 'medium', 'high'], 'high');
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    $openStatus = (is_array($states) && $states) ? (string)$states[0] : 'todo';

    $id = 'tsk_' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO tasks (id, title, description, priority, deadline, status, owner, created_by, related_project_id, is_locking)
         VALUES (?, ?, 'Project Milestone', ?, ?, ?, ?, ?, ?, 1)" /* recurring-template: milestone is a normal task */
    )->execute([$id, $title, $priority, $deadline, $openStatus, $user['name'], $user['name'], $projId]);
    $pdo->prepare("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$projId]);
    mcp_audit($pdo, $user, 'milestone_create', "Created milestone '$title' for project $projId");
    return ['success' => true, 'id' => $id, 'project_id' => $projId, 'title' => $title, 'status' => $openStatus, 'deadline' => $deadline];
}

function mcp_crm_plus_schedule_meeting(\PDO $pdo, array $user, array $args): array {
    $id = 'mtg_' . bin2hex(random_bytes(8));
    $title = mcp_require_string($args, 'title');
    $date = mcp_require_date($args, 'date');
    $duration = (int)(mcp_number($args, 'duration', false, 0, 1440) ?? 30);
    $leadId = !empty($args['lead_id']) ? (string)$args['lead_id'] : null;
    if ($leadId !== null) mcp_row_exists($pdo, 'leads', $leadId, 'Lead/client');
    $leadName = null;
    if ($leadId) {
        $lStmt = $pdo->prepare("SELECT name FROM leads WHERE id = ?");
        $lStmt->execute([$leadId]);
        $leadName = $lStmt->fetchColumn() ?: null;
    }
    $attendeesJson = isset($args['attendees']) ? json_encode($args['attendees'], JSON_UNESCAPED_UNICODE) : null;
    $attachedLeadsJson = isset($args['attached_leads']) ? json_encode($args['attached_leads'], JSON_UNESCAPED_UNICODE) : null;
    $attachedClientsJson = isset($args['attached_clients']) ? json_encode($args['attached_clients'], JSON_UNESCAPED_UNICODE) : null;

    $pdo->prepare(
        "INSERT INTO meeting_notes (id, title, date, duration, lead_id, lead_name, notes, attached_users_json, attached_leads_json, attached_clients_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([$id, $title, $date, $duration, $leadId, $leadName, $args['notes'] ?? null, $attendeesJson, $attachedLeadsJson, $attachedClientsJson]);
    mcp_audit($pdo, $user, 'meeting_schedule', "Scheduled meeting '$title' on $date");
    return ['success' => true, 'id' => $id, 'title' => $title, 'date' => $date, 'duration' => $duration];
}

function mcp_crm_plus_update_meeting(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    mcp_row_exists($pdo, 'meeting_notes', $id, 'Meeting');
    $updates = []; $params = [];
    if (array_key_exists('title', $args)) { $updates[] = "`title` = ?"; $params[] = mcp_require_string($args, 'title'); }
    if (array_key_exists('date', $args)) { $updates[] = "`date` = ?"; $params[] = mcp_require_date($args, 'date'); }
    if (array_key_exists('duration', $args)) { $updates[] = "`duration` = ?"; $params[] = (int)mcp_number($args, 'duration', true, 0, 1440); }
    if (array_key_exists('notes', $args)) { $updates[] = "`notes` = ?"; $params[] = $args['notes']; }
    if (array_key_exists('lead_id', $args)) {
        $lid = trim((string)$args['lead_id']);
        $lName = null;
        if ($lid !== '') {
            mcp_row_exists($pdo, 'leads', $lid, 'Lead/client');
            $ls = $pdo->prepare("SELECT name FROM leads WHERE id = ?"); $ls->execute([$lid]);
            $lName = $ls->fetchColumn() ?: null;
        }
        $updates[] = "`lead_id` = ?"; $params[] = $lid === '' ? null : $lid;
        $updates[] = "`lead_name` = ?"; $params[] = $lName;
    }
    if (array_key_exists('archived', $args)) { $updates[] = "`archived` = ?"; $params[] = !empty($args['archived']) ? 1 : 0; }
    if (array_key_exists('attendees', $args)) { $updates[] = "`attached_users_json` = ?"; $params[] = json_encode($args['attendees'], JSON_UNESCAPED_UNICODE); }
    if (array_key_exists('attached_leads', $args)) { $updates[] = "`attached_leads_json` = ?"; $params[] = json_encode($args['attached_leads'], JSON_UNESCAPED_UNICODE); }
    if (array_key_exists('attached_clients', $args)) { $updates[] = "`attached_clients_json` = ?"; $params[] = json_encode($args['attached_clients'], JSON_UNESCAPED_UNICODE); }
    if (!$updates) return ['success' => true, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE meeting_notes SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);
    mcp_audit($pdo, $user, 'meeting_update', "Updated meeting $id");
    return ['success' => true, 'id' => $id, 'updated_fields' => array_keys($args)];
}

function mcp_crm_plus_log_communication(\PDO $pdo, array $user, array $args): array {
    $leadId = mcp_require_string($args, 'lead_id');
    $lStmt = $pdo->prepare("SELECT * FROM leads WHERE id = ? LIMIT 1");
    $lStmt->execute([$leadId]);
    $row = $lStmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row || !mcp_lead_module_visible($row)) throw new \Exception("Lead or client not found with ID: {$leadId}");
    $needPerm = mcp_is_client_record($row) ? 'clients' : 'leads';
    if (!mcp_can_edit($needPerm)) throw new \Exception("Editing communication on this record requires '{$needPerm}' edit permission.");

    $type = in_array($args['type'] ?? '', ['phone', 'email', 'note', 'appointment'], true) ? $args['type'] : 'note';
    $title = mcp_require_string($args, 'title');
    $ts = mcp_now_local();
    if (!empty($args['timestamp'])) {
        $unix = mcp_optional_moment($args, 'timestamp', false);
        if ($unix !== null) $ts = date('Y-m-d H:i:s', $unix);
    }
    $id = 'ev_' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author, is_outgoing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([$id, $leadId, $type, $ts, $title, $args['content'] ?? null, $user['name'], !empty($args['is_outgoing']) ? 1 : 0]);
    mcp_audit($pdo, $user, 'communication_log', "Logged $type for lead $leadId: '$title'");
    return ['success' => true, 'id' => $id, 'lead_id' => $leadId, 'title' => $title, 'type' => $type, 'timestamp' => $ts];
}
