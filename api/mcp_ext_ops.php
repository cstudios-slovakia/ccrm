<?php
/**
 * CCRM MCP gateway — operational tools (audit Part B): clients, pipeline, tasks, meetings,
 * warehouse, employees, automation, unified entries, files.
 *
 * Required by mcp.php. Helpers from mcp_ext.php are used throughout. Read tools only unless
 * stated; the two write tools here (set_task_assignees, set_task_tags) are additive on purpose:
 * no MCP tool deletes rows.
 */

// ============================================================================
// Shared helpers
// ============================================================================

function mcp_done_task_state(string $status, array $taskStates): bool {
    if (strtolower($status) === 'done') return true;
    return $taskStates && $status === end($taskStates);
}

/** SQL fragment (and params) for "task is open", mirroring isDoneState. */
function mcp_open_task_sql(\PDO $pdo, string $alias = ''): array {
    $a = $alias === '' ? '' : $alias . '.';
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    $sql = "(LOWER({$a}status) <> 'done'";
    $params = [];
    if (is_array($states) && $states) {
        $sql .= " AND {$a}status <> ?";
        $params[] = (string)end($states);
    }
    return [$sql . ')', $params];
}

/** Lead stages in the order the pipeline shows them (orderLeadStates). */
function mcp_order_lead_states(array $states, array $groups, array $parents): array {
    $resolve = function (string $s) use ($groups): string {
        $k = strtolower(trim($s));
        if (in_array($k, ['lost', 'rejected', 'accepted', 'won', 'client'], true)) return 'closed';
        $g = $groups[$k] ?? null;
        return ($g === 'new' || $g === 'closed') ? $g : 'in_progress';
    };
    $ordered = []; $seen = [];
    $push = function (string $s) use (&$ordered, &$seen) { if (!isset($seen[$s])) { $seen[$s] = true; $ordered[] = $s; } };
    foreach (['new', 'in_progress', 'closed'] as $group) {
        $inGroup = array_values(array_filter($states, fn($s) => $resolve($s) === $group));
        foreach ($inGroup as $major) {
            if (!empty($parents[strtolower($major)])) continue;
            $push($major);
            foreach ($inGroup as $sub) {
                if (strtolower((string)($parents[strtolower($sub)] ?? '')) === strtolower($major)) $push($sub);
            }
        }
        foreach ($inGroup as $s) $push($s);
    }
    foreach ($states as $s) $push($s);
    return $ordered;
}

/** The stage a lead moves to when it is won, following what the workspace has configured. */
function mcp_won_lead_state(\PDO $pdo): string {
    $states = mcp_config_json($pdo, 'LEAD_STATES', []);
    $lower = array_map('strtolower', is_array($states) ? $states : []);
    foreach (['accepted', 'won', 'client'] as $k) {
        $i = array_search($k, $lower, true);
        if ($i !== false) return $states[$i];
    }
    return 'accepted';
}

/** Throws unless $status is a configured lead stage (any case). Returns the configured spelling. */
function mcp_check_lead_state(\PDO $pdo, string $status): string {
    $states = mcp_config_json($pdo, 'LEAD_STATES', []);
    if (!is_array($states) || !$states) return $status;
    foreach ($states as $s) {
        if (strtolower($s) === strtolower($status)) return $s;
    }
    throw new \InvalidArgumentException("Unknown lead stage '{$status}'. Configured stages: " . implode(', ', $states) . '.');
}

/**
 * The pipeline guard from LeadsDatagrid.handleUpdateLeadState: a lead with open, non-archived
 * blocking (is_locking) tasks cannot change stage. Throws with the task titles.
 */
function mcp_assert_lead_unlocked(\PDO $pdo, string $leadId): void {
    [$openSql, $openParams] = mcp_open_task_sql($pdo);
    $stmt = $pdo->prepare("SELECT title FROM tasks WHERE related_lead_id = ? AND is_locking = 1 AND archived = 0 AND {$openSql}");
    $stmt->execute(array_merge([$leadId], $openParams));
    $titles = $stmt->fetchAll(\PDO::FETCH_COLUMN);
    if ($titles) {
        throw new \Exception('Cannot change this lead\'s stage: complete the blocking tasks first: ' . implode('; ', $titles));
    }
}

/** The employee defaults payouts need, without exposing the rest of EMPLOYEE_SETTINGS (it holds API keys). */
function mcp_employee_defaults(\PDO $pdo): array {
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'EMPLOYEE_SETTINGS'");
    $stmt->execute();
    $s = json_decode((string)$stmt->fetchColumn(), true);
    $s = is_array($s) ? $s : [];
    $types = [];
    foreach ((array)($s['vacationTypes'] ?? []) as $t) {
        if (is_array($t) && isset($t['id'])) {
            $types[] = ['id' => (string)$t['id'], 'name' => (string)($t['name'] ?? $t['id']), 'defaultAllowance' => $t['defaultAllowance'] ?? ($t['defaultDays'] ?? null)];
        }
    }
    if (!$types) {
        $types = [
            ['id' => 'annual', 'name' => 'Dovolenka', 'defaultAllowance' => 25],
            ['id' => 'sick', 'name' => 'PN', 'defaultAllowance' => 10],
            ['id' => 'doctor', 'name' => 'Lekár', 'defaultAllowance' => 7],
            ['id' => 'unpaid', 'name' => 'Neplatené', 'defaultAllowance' => 0],
        ];
    }
    return [
        'autoExpense' => (bool)($s['defaultAutoExpense'] ?? false),
        'expenseCategoryId' => $s['defaultExpenseCategoryId'] ?? 'fc-exp-payroll',
        'dueDay' => (int)($s['defaultSalaryDueDay'] ?? 15),
        'vacationTypes' => $types,
    ];
}

// ============================================================================
// Client profiles  (aggregated by name, as ClientsView does)
// ============================================================================

/** @return array[] profiles; a profile is a client when any of its leads has id client-* or an adjustment > 0 */
function mcp_client_profiles(\PDO $pdo, array $opts = []): array {
    $rows = $pdo->query(
        "SELECT * FROM leads
         WHERE LOWER(TRIM(name)) IN (SELECT k FROM (SELECT LOWER(TRIM(name)) k FROM leads WHERE id LIKE 'client-%' OR adjustment > 0) x)
         ORDER BY created_at ASC, id ASC"
    )->fetchAll(\PDO::FETCH_ASSOC);

    $profiles = [];
    foreach ($rows as $l) {
        $key = strtolower(trim($l['name']));
        $profiles[$key]['leads'][] = $l;
    }
    $out = [];
    foreach ($profiles as $key => $p) {
        $leads = $p['leads'];
        $base = $leads[0];
        foreach ($leads as $l) { if (strpos($l['id'], 'client-') === 0) { $base = $l; break; } }
        $adjustment = 0.0;
        foreach ($leads as $l) { if ((float)$l['adjustment'] != 0.0) { $adjustment = (float)$l['adjustment']; break; } }
        $archived = true; $total = 0.0; $created = null;
        foreach ($leads as $l) {
            $archived = $archived && (int)$l['archived'] === 1;
            $total += (float)$l['value'];
            if ($l['created_at'] && ($created === null || $l['created_at'] < $created)) $created = $l['created_at'];
        }
        $isClient = $adjustment > 0;
        foreach ($leads as $l) { if (strpos($l['id'], 'client-') === 0) $isClient = true; }
        if (!$isClient) continue;
        if ($archived && empty($opts['include_archived'])) continue;
        $out[] = [
            'id' => $base['id'], 'name' => $base['name'], 'client_type' => $base['client_type'], 'owner' => $base['owner'],
            'city' => $base['city'], 'street' => $base['street'], 'postal_code' => $base['postal_code'], 'country' => $base['country'],
            'email' => $base['email'], 'phone' => $base['phone'], 'contact_person' => $base['contact_person'],
            'company_id' => $base['company_id'], 'tax_id' => $base['tax_id'], 'vat_id' => $base['vat_id'], 'website' => $base['website'],
            'client_category_id' => $base['client_category_id'] ?? null, 'rating' => $base['rating'],
            'leads_count' => count($leads), 'adjustment' => mcp_round2($adjustment), 'total_value' => mcp_round2($total + $adjustment),
            'archived' => $archived, 'created_at' => $created,
            'lead_ids' => array_column($leads, 'id'),
            '_leads' => $leads,
        ];
    }
    return $out;
}

// ============================================================================
// Definitions & permissions
// ============================================================================

function mcp_ext_ops_tool_definitions(): array {
    $id = fn(string $d) => ['type' => 'string', 'description' => $d];
    return [
        [
            'name' => 'get_client_profile',
            'description' => 'A client as the Clients register shows it: all leads/records with the same name rolled into one profile, with total value (sum of lead values plus the client\'s value adjustment), open tasks, projects and invoices.',
            'inputSchema' => ['type' => 'object', 'properties' => ['name' => $id('Client name (case-insensitive)'), 'id' => $id('Any lead/client record id of the client')]],
        ],
        [
            'name' => 'list_client_categories',
            'description' => 'The client category tree.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'get_lead_pipeline_summary',
            'description' => 'Sales pipeline overview: lead count and value per stage in pipeline order, active (not closed) totals, and leads that breached the stage SLA (days in stage vs the limit set in Settings).',
            'inputSchema' => ['type' => 'object', 'properties' => ['owner' => $id('Only this owner\'s leads')]],
        ],
        [
            'name' => 'set_task_assignees',
            'description' => 'Add people to a task. Names must be existing users. Adds only: nobody is removed from a task through MCP. The task owner is always kept as an assignee so the task stays visible on their calendar.',
            'inputSchema' => ['type' => 'object', 'properties' => ['task_id' => $id('Task ID'), 'assignees' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'User names to add']], 'required' => ['task_id', 'assignees']],
        ],
        [
            'name' => 'set_task_tags',
            'description' => 'Add tags to a task (created if new). Adds only: tags are never removed through MCP.',
            'inputSchema' => ['type' => 'object', 'properties' => ['task_id' => $id('Task ID'), 'tags' => ['type' => 'array', 'items' => ['type' => 'string']]], 'required' => ['task_id', 'tags']],
        ],
        [
            'name' => 'get_meeting',
            'description' => 'Full meeting note: notes, AI summary, transcript (first 20,000 characters), automated notes, attendees, and its action items.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $id('Meeting ID')], 'required' => ['id']],
        ],
        [
            'name' => 'list_meeting_tasks',
            'description' => 'Action items created from meetings.',
            'inputSchema' => ['type' => 'object', 'properties' => ['meeting_id' => $id('Only this meeting'), 'status' => ['type' => 'string', 'enum' => ['todo', 'in_progress', 'done']], 'limit' => ['type' => 'integer']]],
        ],
        [
            'name' => 'get_warehouse_metrics',
            'description' => 'Warehouse KPIs: stock valuation (on-hand × average purchase price), item count, low-stock and out-of-stock counts, and this month\'s confirmed inward cost, outward sales, profit and average margin.',
            'inputSchema' => ['type' => 'object', 'properties' => ['warehouse_id' => $id('Limit stock figures to one warehouse')]],
        ],
        [
            'name' => 'list_warehouses',
            'description' => 'Warehouses.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'list_suppliers',
            'description' => 'Suppliers (contact and payment terms; bank details are not returned).',
            'inputSchema' => ['type' => 'object', 'properties' => ['search' => ['type' => 'string'], 'limit' => ['type' => 'integer']]],
        ],
        [
            'name' => 'list_stock_movements',
            'description' => 'Warehouse movement documents (receipts, issues, transfers, adjustments) with cost and sell values.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'type' => ['type' => 'string', 'enum' => ['inward', 'outward', 'transfer', 'adjustment']],
                'warehouse_id' => ['type' => 'string'], 'item_id' => ['type' => 'string'],
                'from' => ['type' => 'string', 'description' => 'YYYY-MM-DD'], 'to' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                'limit' => ['type' => 'integer'],
            ]],
        ],
        [
            'name' => 'list_batches',
            'description' => 'Stock batches with expiry dates.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'expiring_within_days' => ['type' => 'integer', 'description' => 'Only batches expiring within N days (includes already expired)'],
                'item_id' => ['type' => 'string'], 'warehouse_id' => ['type' => 'string'], 'include_empty' => ['type' => 'boolean'],
            ]],
        ],
        [
            'name' => 'get_vacation_balance',
            'description' => 'Vacation used / allowance / left per vacation type for the year (rejected requests do not count), plus who is on leave today.',
            'inputSchema' => ['type' => 'object', 'properties' => ['employee_id' => $id('One employee; omit for all active employees'), 'year' => ['type' => 'integer']]],
        ],
        [
            'name' => 'get_payroll_summary',
            'description' => 'Payroll totals per month for a year: salary planned, paid and remaining, for active employees, plus the nominal monthly payroll from the salary settings.',
            'inputSchema' => ['type' => 'object', 'properties' => ['year' => ['type' => 'integer']]],
        ],
        [
            'name' => 'list_workflows',
            'description' => 'Automation workflows (name, trigger, active flag, size, last run). Workflow definitions are not returned.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'get_workflow_runs',
            'description' => 'Recent runs of a workflow: status, duration and trigger. Execution logs are not returned.',
            'inputSchema' => ['type' => 'object', 'properties' => ['workflow_id' => $id('Workflow ID'), 'limit' => ['type' => 'integer']], 'required' => ['workflow_id']],
        ],
        [
            'name' => 'list_unified_entries',
            'description' => 'The custom registries (unified entries) configured in the workspace.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'get_unified_entry_rows',
            'description' => 'Rows of one custom registry (read only, up to 100).',
            'inputSchema' => ['type' => 'object', 'properties' => ['registry_id' => $id('Registry ID from list_unified_entries'), 'limit' => ['type' => 'integer']], 'required' => ['registry_id']],
        ],
        [
            'name' => 'list_documents',
            'description' => 'Documents filed on lead/client timelines (offers, orders, proforma invoices, advance receipts, invoices, delivery notes) with amount and file name. Invoicing module documents are listed with list_invoices.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'lead_id' => $id('Only this lead/client record'),
                'type' => ['type' => 'string', 'enum' => ['offer', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note']],
                'limit' => ['type' => 'integer'],
            ]],
        ],
        [
            'name' => 'list_files',
            'description' => 'File metadata (names, types, dates; never the content) attached to a lead/client, a project, or an employee (employee files need the salaries permission).',
            'inputSchema' => ['type' => 'object', 'properties' => ['source' => ['type' => 'string', 'enum' => ['lead', 'project', 'employee']], 'id' => $id('Record ID')], 'required' => ['source', 'id']],
        ],
    ];
}

function mcp_ext_ops_permissions(): array {
    $v = fn(string ...$k) => ['view' => $k];
    $e = fn(string ...$k) => ['edit' => $k];
    return [
        'get_client_profile' => $v('clients'), 'list_client_categories' => $v('clients'),
        'get_lead_pipeline_summary' => $v('leads'),
        'set_task_assignees' => $e('tasks'), 'set_task_tags' => $e('tasks'),
        'get_meeting' => $v('meetings'), 'list_meeting_tasks' => $v('meetings'),
        'get_warehouse_metrics' => $v('warehouse'), 'list_warehouses' => $v('warehouse'), 'list_suppliers' => $v('warehouse'),
        'list_stock_movements' => $v('warehouse'), 'list_batches' => $v('warehouse'),
        'get_vacation_balance' => $v('employees'),
        'get_payroll_summary' => $v('employees', 'employees.salaries'),
        'list_workflows' => $v('automation'), 'get_workflow_runs' => $v('automation'),
        'list_unified_entries' => $v('unified_entries'), 'get_unified_entry_rows' => $v('unified_entries'),
        'list_files' => $v('files'),
        'list_documents' => $v('leads'),
    ];
}

// ============================================================================
// Handlers
// ============================================================================

function mcp_ext_ops_execute(\PDO $pdo, array $user, string $tool, array $args) {
    switch ($tool) {
        case 'get_client_profile': {
            $profiles = mcp_client_profiles($pdo, ['include_archived' => true]);
            $found = null;
            $name = isset($args['name']) ? strtolower(trim((string)$args['name'])) : '';
            $id = isset($args['id']) ? (string)$args['id'] : '';
            if ($name === '' && $id === '') throw new \InvalidArgumentException("Provide 'name' or 'id'.");
            foreach ($profiles as $p) {
                if (($name !== '' && strtolower(trim($p['name'])) === $name) || ($id !== '' && in_array($id, $p['lead_ids'], true))) { $found = $p; break; }
            }
            if (!$found) throw new \Exception('No client profile found (a name must belong to a client record, not just a pipeline lead).');
            $leadIds = $found['lead_ids'];
            $ph = implode(',', array_fill(0, count($leadIds), '?'));
            $out = $found;
            unset($out['_leads']);
            $out['url'] = mcp_client_url($pdo, (string)$found['name']);
            $out['leads'] = array_map(fn($l) => ['id' => $l['id'], 'status' => $l['status'], 'value' => mcp_round2($l['value']), 'owner' => $l['owner'], 'created_at' => $l['created_at'], 'archived' => (int)$l['archived'] === 1], $found['_leads']);
            if (mcp_can('tasks')) {
                [$openSql, $openParams] = mcp_open_task_sql($pdo);
                [$scopeSql, $scopeParams] = mcp_task_scope($user);
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE related_lead_id IN ($ph) AND archived = 0 AND {$openSql}" . ($scopeSql ? " AND $scopeSql" : ''));
                $stmt->execute(array_merge($leadIds, $openParams, $scopeParams));
                $out['open_tasks'] = (int)$stmt->fetchColumn();
            }
            if (mcp_can('projects')) {
                $stmt = $pdo->prepare("SELECT id, name, status FROM projects WHERE (client_id IN ($ph) OR lead_id IN ($ph)) AND (archived = 0 OR archived IS NULL)");
                $stmt->execute(array_merge($leadIds, $leadIds));
                $out['projects'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }
            if (mcp_can('invoices')) {
                $stmt = $pdo->prepare("SELECT type, status, COUNT(*) c, SUM(total_price) total FROM invoices_offers WHERE client_id IN ($ph) OR lead_id IN ($ph) GROUP BY type, status");
                $stmt->execute(array_merge($leadIds, $leadIds));
                $out['documents'] = array_map(fn($r) => ['type' => $r['type'], 'status' => $r['status'], 'count' => (int)$r['c'], 'total' => mcp_round2($r['total'])], $stmt->fetchAll(\PDO::FETCH_ASSOC));
            }
            return $out;
        }

        case 'list_client_categories':
            return $pdo->query("SELECT id, name, parent_id, level, sort_order, color FROM client_categories ORDER BY level ASC, sort_order ASC, name ASC")->fetchAll(\PDO::FETCH_ASSOC);

        case 'get_lead_pipeline_summary': {
            $states = mcp_config_json($pdo, 'LEAD_STATES', []);
            $groups = mcp_config_json($pdo, 'LEAD_STAGE_GROUPS', []);
            $parents = mcp_config_json($pdo, 'LEAD_STATE_PARENTS', []);
            $sla = mcp_config_json($pdo, 'LEAD_STATE_SLA', []);
            $where = "archived = 0 AND id <> 'unassigned-docs' AND id NOT LIKE 'client-%'";
            $params = [];
            if (!empty($args['owner'])) { $where .= ' AND owner = ?'; $params[] = (string)$args['owner']; }
            $stmt = $pdo->prepare("SELECT id, name, status, value, owner, created_at FROM leads WHERE {$where}");
            $stmt->execute($params);
            $leads = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (!is_array($states) || !$states) $states = array_values(array_unique(array_map(fn($l) => $l['status'] ?: 'new', $leads)));
            $ordered = mcp_order_lead_states($states, $groups, $parents);

            $entered = [];
            $ev = $pdo->query("SELECT lead_id, MAX(timestamp) ts FROM timeline_events WHERE type = 'status_change' GROUP BY lead_id");
            foreach ($ev->fetchAll(\PDO::FETCH_ASSOC) as $r) { $entered[$r['lead_id']] = (string)$r['ts']; }

            $today = new \DateTimeImmutable(mcp_today() . ' 00:00:00', new \DateTimeZone('UTC'));
            $rows = []; $activeCount = 0; $activeValue = 0.0; $breaches = [];
            foreach ($ordered as $state) $rows[strtolower($state)] = ['state' => $state, 'group' => null, 'parent' => $parents[strtolower($state)] ?? null, 'count' => 0, 'value' => 0.0, 'sla_days' => (int)($sla[strtolower($state)] ?? 0) ?: null];
            foreach ($leads as $l) {
                $k = strtolower((string)$l['status']);
                if (!isset($rows[$k])) $rows[$k] = ['state' => $l['status'], 'group' => null, 'parent' => null, 'count' => 0, 'value' => 0.0, 'sla_days' => null];
                $rows[$k]['count']++; $rows[$k]['value'] += (float)$l['value'];
                $closed = mcp_lead_is_closed($k, $groups, $parents);
                if (!$closed) { $activeCount++; $activeValue += (float)$l['value']; }
                $limit = (int)($sla[$k] ?? 0);
                if ($limit > 0 && !$closed) {
                    $since = substr($entered[$l['id']] ?? (string)$l['created_at'], 0, 10);
                    if (mcp_iso_ok($since)) {
                        $days = max(0, (int)$today->diff(new \DateTimeImmutable($since . ' 00:00:00', new \DateTimeZone('UTC')))->days);
                        if ($days > $limit) $breaches[] = ['lead_id' => $l['id'], 'name' => $l['name'], 'owner' => $l['owner'], 'stage' => $l['status'], 'entered_stage' => $since, 'days_in_stage' => $days, 'sla_days' => $limit, 'overdue_days' => $days - $limit];
                    }
                }
            }
            foreach ($rows as $k => &$r) {
                $r['group'] = mcp_lead_is_closed($k, $groups, $parents) ? 'closed' : (($groups[$k] ?? null) === 'new' ? 'new' : 'in_progress');
                $r['value'] = mcp_round2($r['value']);
            }
            unset($r);
            usort($breaches, fn($a, $b) => $b['overdue_days'] <=> $a['overdue_days']);
            return [
                'currency' => mcp_currency($pdo),
                'stages' => array_values($rows),
                'active' => ['count' => $activeCount, 'value' => mcp_round2($activeValue)],
                'sla_breaches' => $breaches,
                'note' => 'Active = not archived and not in a closed stage. Client records (id client-*) are not pipeline leads and are excluded.',
            ];
        }

        case 'set_task_assignees': {
            $taskId = mcp_require_string($args, 'task_id');
            if (!is_array($args['assignees'] ?? null) || !$args['assignees']) throw new \InvalidArgumentException("'assignees' must be a non-empty list of user names.");
            $stmt = $pdo->prepare("SELECT id, owner FROM tasks WHERE id = ?");
            $stmt->execute([$taskId]);
            $task = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$task) throw new \Exception("Task not found with ID: {$taskId}");
            $users = $pdo->query("SELECT name FROM users")->fetchAll(\PDO::FETCH_COLUMN);
            $canon = [];
            foreach ($users as $n) { $canon[strtolower(trim($n))] = $n; }
            $names = [];
            foreach ($args['assignees'] as $a) {
                $k = strtolower(trim((string)$a));
                if (!isset($canon[$k])) throw new \InvalidArgumentException("'" . $a . "' is not a registered user.");
                $names[$canon[$k]] = true;
            }
            if ($task['owner'] !== null && $task['owner'] !== '') $names[$task['owner']] = true;
            $ins = $pdo->prepare("INSERT IGNORE INTO task_assignees (task_id, user_name) VALUES (?, ?)");
            foreach (array_keys($names) as $n) $ins->execute([$taskId, $n]);
            mcp_audit($pdo, $user, 'task_assignees_add', "Task {$taskId}: assignees " . implode(', ', array_keys($names)));
            $cur = $pdo->prepare("SELECT user_name FROM task_assignees WHERE task_id = ? ORDER BY user_name");
            $cur->execute([$taskId]);
            return ['success' => true, 'task_id' => $taskId, 'assignees' => $cur->fetchAll(\PDO::FETCH_COLUMN)];
        }

        case 'set_task_tags': {
            $taskId = mcp_require_string($args, 'task_id');
            if (!is_array($args['tags'] ?? null) || !$args['tags']) throw new \InvalidArgumentException("'tags' must be a non-empty list.");
            $chk = $pdo->prepare("SELECT id FROM tasks WHERE id = ?");
            $chk->execute([$taskId]);
            if (!$chk->fetchColumn()) throw new \Exception("Task not found with ID: {$taskId}");
            $insTag = $pdo->prepare("INSERT IGNORE INTO tags (id, name) VALUES (?, ?)");
            $insLink = $pdo->prepare("INSERT IGNORE INTO task_tags (task_id, tag_name) VALUES (?, ?)");
            $added = [];
            foreach ($args['tags'] as $t) {
                $name = trim((string)$t);
                if ($name === '' || mb_strlen($name) > 100) throw new \InvalidArgumentException('Tag names must be 1-100 characters.');
                $insTag->execute(['tag-' . substr(sha1(strtolower($name)), 0, 16), $name]);
                $insLink->execute([$taskId, $name]);
                $added[] = $name;
            }
            mcp_audit($pdo, $user, 'task_tags_add', "Task {$taskId}: tags " . implode(', ', $added));
            return ['success' => true, 'task_id' => $taskId, 'tags_added' => $added];
        }

        case 'get_meeting': {
            $id = mcp_require_string($args, 'id');
            $stmt = $pdo->prepare("SELECT * FROM meeting_notes WHERE id = ?");
            $stmt->execute([$id]);
            $m = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$m) throw new \Exception("Meeting not found with ID: {$id}");
            $dec = fn($j) => ($d = json_decode((string)$j, true)) === null ? null : $d;
            $tr = (string)($m['transcription'] ?? '');
            $out = [
                'id' => $m['id'], 'title' => $m['title'], 'date' => $m['date'], 'duration' => (int)$m['duration'],
                'lead_id' => $m['lead_id'], 'lead_name' => $m['lead_name'], 'notes' => $m['notes'],
                'ai_summary' => $dec($m['ai_summary_json']), 'summary_generated' => (int)$m['summary_generated'] === 1,
                'attached_leads' => $dec($m['attached_leads_json']), 'attached_clients' => $dec($m['attached_clients_json']), 'attendees' => $dec($m['attached_users_json']),
                'automated_notes' => $m['automated_notes'], 'archived' => (int)$m['archived'] === 1,
                'transcription' => mb_substr($tr, 0, 20000), 'transcription_truncated' => mb_strlen($tr) > 20000,
            ];
            $t = $pdo->prepare("SELECT id, title, description, assigned_user, due_date, priority, status FROM meeting_tasks WHERE meeting_id = ? ORDER BY due_date ASC");
            $t->execute([$id]);
            $out['action_items'] = $t->fetchAll(\PDO::FETCH_ASSOC);
            return $out;
        }

        case 'list_meeting_tasks': {
            $where = ['1=1']; $params = [];
            if (!empty($args['meeting_id'])) { $where[] = 'mt.meeting_id = ?'; $params[] = (string)$args['meeting_id']; }
            $st = mcp_enum($args, 'status', ['todo', 'in_progress', 'done']);
            if ($st) { $where[] = 'mt.status = ?'; $params[] = $st; }
            $stmt = $pdo->prepare("SELECT mt.id, mt.meeting_id, m.title AS meeting_title, mt.title, mt.assigned_user, mt.due_date, mt.priority, mt.status FROM meeting_tasks mt LEFT JOIN meeting_notes m ON m.id = mt.meeting_id WHERE " . implode(' AND ', $where) . " ORDER BY mt.due_date ASC LIMIT " . mcp_limit($args));
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        case 'get_warehouse_metrics': {
            $wh = !empty($args['warehouse_id']) ? (string)$args['warehouse_id'] : null;
            $stmt = $pdo->prepare(
                "SELECT i.id, i.min_stock, i.avg_purchase_price, COALESCE(SUM(s.quantity), 0) on_hand
                 FROM warehouse_items i LEFT JOIN warehouse_stock s ON s.item_id = i.id" . ($wh ? " AND s.warehouse_id = ?" : '') . "
                 GROUP BY i.id, i.min_stock, i.avg_purchase_price"
            );
            $stmt->execute($wh ? [$wh] : []);
            $val = 0.0; $low = 0; $out = 0; $n = 0;
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $n++;
                $val += (float)$r['on_hand'] * (float)$r['avg_purchase_price'];
                if ((float)$r['on_hand'] == 0.0) $out++;
                elseif ((float)$r['on_hand'] <= (float)$r['min_stock']) $low++;
            }
            $month = date('Y-m');
            $mv = $pdo->prepare("SELECT type, SUM(total_cost_value) cost, SUM(total_sell_value) sell, SUM(total_profit_value) profit FROM warehouse_movements WHERE status = 'confirmed' AND DATE_FORMAT(issued_at, '%Y-%m') = ? GROUP BY type");
            $mv->execute([$month]);
            $inward = 0.0; $outward = 0.0; $profit = 0.0;
            foreach ($mv->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                if ($r['type'] === 'inward') $inward += (float)$r['cost'];
                if ($r['type'] === 'outward') { $outward += (float)$r['sell']; $profit += (float)$r['profit']; }
            }
            return [
                'currency' => mcp_currency($pdo), 'month' => $month, 'warehouse_id' => $wh,
                'stock_valuation' => mcp_round2($val), 'item_count' => $n, 'low_stock_count' => $low, 'out_of_stock_count' => $out,
                'monthly_inward_cost' => mcp_round2($inward), 'monthly_outward_sales' => mcp_round2($outward), 'monthly_profit' => mcp_round2($profit),
                'average_margin_percent' => $outward > 0 ? round($profit / $outward * 100, 2) : 0.0,
            ];
        }

        case 'list_warehouses':
            return $pdo->query("SELECT id, name, code, address, is_default FROM warehouses ORDER BY name ASC")->fetchAll(\PDO::FETCH_ASSOC);

        case 'list_suppliers': {
            $where = ['1=1']; $params = [];
            if (!empty($args['search'])) { $t = '%' . $args['search'] . '%'; $where[] = '(name LIKE ? OR company_id LIKE ? OR email LIKE ?)'; array_push($params, $t, $t, $t); }
            $stmt = $pdo->prepare("SELECT id, name, company_id, tax_id, vat_id, street, city, postal_code, country, email, phone, website, payment_due_days FROM suppliers WHERE " . implode(' AND ', $where) . " ORDER BY name ASC LIMIT " . mcp_limit($args));
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        case 'list_stock_movements': {
            $where = ['1=1']; $params = [];
            $type = mcp_enum($args, 'type', ['inward', 'outward', 'transfer', 'adjustment']);
            if ($type) { $where[] = 'm.type = ?'; $params[] = $type; }
            if (!empty($args['warehouse_id'])) { $where[] = '(m.warehouse_id = ? OR m.target_warehouse_id = ?)'; array_push($params, (string)$args['warehouse_id'], (string)$args['warehouse_id']); }
            if (!empty($args['item_id'])) { $where[] = 'EXISTS (SELECT 1 FROM warehouse_movement_items mi WHERE mi.movement_id = m.id AND mi.item_id = ?)'; $params[] = (string)$args['item_id']; }
            if ($d = mcp_optional_date($args, 'from')) { $where[] = 'DATE(m.issued_at) >= ?'; $params[] = $d; }
            if ($d = mcp_optional_date($args, 'to')) { $where[] = 'DATE(m.issued_at) <= ?'; $params[] = $d; }
            $stmt = $pdo->prepare("SELECT m.id, m.document_number, m.type, m.status, m.warehouse_id, m.target_warehouse_id, m.supplier_id, m.lead_id, m.total_cost_value, m.total_sell_value, m.total_profit_value, m.created_by, m.note, m.issued_at, (SELECT COUNT(*) FROM warehouse_movement_items mi WHERE mi.movement_id = m.id) AS items_count FROM warehouse_movements m WHERE " . implode(' AND ', $where) . " ORDER BY m.issued_at DESC, m.id DESC LIMIT " . mcp_limit($args));
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        case 'list_batches': {
            $where = ['1=1']; $params = [];
            if (isset($args['expiring_within_days'])) { $where[] = 'b.expiration_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)'; $params[] = max(0, (int)$args['expiring_within_days']); }
            if (!empty($args['item_id'])) { $where[] = 'b.item_id = ?'; $params[] = (string)$args['item_id']; }
            if (!empty($args['warehouse_id'])) { $where[] = 'b.warehouse_id = ?'; $params[] = (string)$args['warehouse_id']; }
            if (empty($args['include_empty'])) $where[] = 'b.current_quantity > 0';
            $stmt = $pdo->prepare("SELECT b.id, b.item_id, i.name AS item_name, b.warehouse_id, b.batch_number, b.expiration_date, b.initial_quantity, b.current_quantity FROM warehouse_batches b JOIN warehouse_items i ON i.id = b.item_id WHERE " . implode(' AND ', $where) . " ORDER BY b.expiration_date ASC LIMIT 200");
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        case 'get_vacation_balance': {
            $year = isset($args['year']) ? (int)$args['year'] : (int)date('Y');
            $defaults = mcp_employee_defaults($pdo);
            $where = 'is_active = 1'; $params = [];
            if (!empty($args['employee_id'])) { $where = 'id = ?'; $params[] = (string)$args['employee_id']; }
            $stmt = $pdo->prepare("SELECT id, name, vacation_allowances_json FROM employees WHERE {$where} ORDER BY name ASC");
            $stmt->execute($params);
            $emps = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (!empty($args['employee_id']) && !$emps) throw new \Exception('Employee not found with ID: ' . $args['employee_id']);
            $vac = $pdo->prepare("SELECT vacation_type_id, SUM(days_count) used FROM employee_vacations WHERE employee_id = ? AND status <> 'rejected' AND YEAR(start_date) = ? GROUP BY vacation_type_id");
            $out = [];
            foreach ($emps as $e) {
                $allow = json_decode((string)$e['vacation_allowances_json'], true);
                $allow = is_array($allow) ? $allow : [];
                $vac->execute([$e['id'], $year]);
                $used = [];
                foreach ($vac->fetchAll(\PDO::FETCH_ASSOC) as $r) { $used[$r['vacation_type_id']] = (float)$r['used']; }
                $types = [];
                foreach ($defaults['vacationTypes'] as $t) {
                    $a = array_key_exists($t['id'], $allow) ? (float)$allow[$t['id']] : (float)($t['defaultAllowance'] ?? 25);
                    $u = $used[$t['id']] ?? 0.0;
                    $types[] = ['type_id' => $t['id'], 'name' => $t['name'], 'allowance' => $a, 'used' => $u, 'left' => max(0.0, $a - $u)];
                }
                $out[] = ['employee_id' => $e['id'], 'name' => $e['name'], 'year' => $year, 'types' => $types];
            }
            $on = $pdo->prepare("SELECT DISTINCT e.id, e.name FROM employee_vacations v JOIN employees e ON e.id = v.employee_id WHERE v.status <> 'rejected' AND CURDATE() BETWEEN v.start_date AND v.end_date AND e.is_active = 1");
            $on->execute();
            return ['employees' => $out, 'on_leave_today' => $on->fetchAll(\PDO::FETCH_ASSOC)];
        }

        case 'get_payroll_summary': {
            $year = isset($args['year']) ? (int)$args['year'] : (int)date('Y');
            $stmt = $pdo->prepare("SELECT s.period_key, SUM(s.total_salary) planned, SUM(s.total_paid) paid, COUNT(*) records FROM employee_salaries s JOIN employees e ON e.id = s.employee_id WHERE e.is_active = 1 AND s.year = ? GROUP BY s.period_key ORDER BY s.period_key");
            $stmt->execute([$year]);
            $months = []; $tp = 0.0; $tpaid = 0.0;
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $months[] = ['period' => $r['period_key'], 'planned' => mcp_round2($r['planned']), 'paid' => mcp_round2($r['paid']), 'remaining' => mcp_round2(max(0, (float)$r['planned'] - (float)$r['paid'])), 'records' => (int)$r['records']];
                $tp += (float)$r['planned']; $tpaid += (float)$r['paid'];
            }
            $nominal = 0.0;
            foreach ($pdo->query("SELECT salary_type, salary_amount FROM employees WHERE is_active = 1")->fetchAll(\PDO::FETCH_ASSOC) as $e) {
                $a = (float)$e['salary_amount'];
                $nominal += $e['salary_type'] === 'daily' ? $a * 21 : ($e['salary_type'] === 'hourly' ? $a * 168 : $a);
            }
            return [
                'currency' => mcp_currency($pdo), 'year' => $year, 'months' => $months,
                'year_total' => ['planned' => mcp_round2($tp), 'paid' => mcp_round2($tpaid), 'remaining' => mcp_round2(max(0, $tp - $tpaid))],
                'nominal_monthly_payroll' => mcp_round2($nominal),
            ];
        }

        case 'list_workflows': {
            $rows = $pdo->query("SELECT w.id, w.name, w.description, w.is_active, w.trigger_type, (SELECT MAX(created_at) FROM workflow_logs l WHERE l.workflow_id = w.id) AS last_run, (SELECT status FROM workflow_logs l WHERE l.workflow_id = w.id ORDER BY created_at DESC LIMIT 1) AS last_status, w.nodes_json FROM workflows w ORDER BY w.name ASC")->fetchAll(\PDO::FETCH_ASSOC);
            return array_map(function ($r) {
                $nodes = json_decode((string)$r['nodes_json'], true);
                unset($r['nodes_json']);
                $r['is_active'] = (int)$r['is_active'] === 1;
                $r['node_count'] = is_array($nodes) ? count($nodes) : 0;
                return $r;
            }, $rows);
        }

        case 'get_workflow_runs': {
            $wid = mcp_require_string($args, 'workflow_id');
            $stmt = $pdo->prepare("SELECT id, status, execution_time_ms, trigger_event, created_at FROM workflow_logs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT " . mcp_limit($args, 20));
            $stmt->execute([$wid]);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        case 'list_unified_entries': {
            $rows = $pdo->query("SELECT id, name, entry_name, folder_name, icon, color, modules_json, folders_enabled, warning_days, archived FROM unified_entries ORDER BY name ASC")->fetchAll(\PDO::FETCH_ASSOC);
            return array_map(function ($r) {
                $r['modules'] = json_decode((string)$r['modules_json'], true) ?: [];
                unset($r['modules_json']);
                $r['folders_enabled'] = (int)$r['folders_enabled'] === 1;
                $r['archived'] = (int)$r['archived'] === 1;
                return $r;
            }, $rows);
        }

        case 'get_unified_entry_rows': {
            $rid = mcp_require_string($args, 'registry_id');
            $chk = $pdo->prepare("SELECT id FROM unified_entries WHERE id = ?");
            $chk->execute([$rid]);
            $realId = $chk->fetchColumn();
            if (!$realId) throw new \Exception("Registry not found with ID: {$rid}");
            $table = 'ue_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$realId));
            if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->rowCount() === 0) return [];
            $rows = $pdo->query("SELECT * FROM `{$table}` LIMIT " . mcp_limit($args, 50))->fetchAll(\PDO::FETCH_ASSOC);
            return $rows;
        }

        case 'list_documents': {
            $where = ["type IN ('offer','order','proforma_invoice','advance_receipt','invoice','delivery_note')", 'hidden = 0']; $params = [];
            if (!empty($args['lead_id'])) { $where[] = 'lead_id = ?'; $params[] = (string)$args['lead_id']; }
            $t = mcp_enum($args, 'type', ['offer', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note']);
            if ($t) { $where[] = 'type = ?'; $params[] = $t; }
            $stmt = $pdo->prepare("SELECT id, lead_id, type, timestamp, title, amount, file_name, file_type, author FROM timeline_events WHERE " . implode(' AND ', $where) . " ORDER BY timestamp DESC LIMIT " . mcp_limit($args));
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        case 'list_files': {
            $source = mcp_enum($args, 'source', ['lead', 'project', 'employee']);
            $id = mcp_require_string($args, 'id');
            if ($source === 'lead') {
                $stmt = $pdo->prepare("SELECT id, type, title, timestamp, file_name, file_type, file_size FROM timeline_events WHERE lead_id = ? AND hidden = 0 AND file_name IS NOT NULL AND file_name <> '' ORDER BY timestamp DESC LIMIT 200");
                $stmt->execute([$id]);
                return $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }
            if ($source === 'project') {
                $stmt = $pdo->prepare("SELECT custom_files_json FROM projects WHERE id = ?");
                $stmt->execute([$id]);
                $j = $stmt->fetchColumn();
                if ($j === false) throw new \Exception("Project not found with ID: {$id}");
                return mcp_file_slots(json_decode((string)$j, true));
            }
            if (!mcp_can('employees') || !mcp_can('employees.salaries')) throw new \Exception('Employee files need the employees.salaries permission.');
            $stmt = $pdo->prepare("SELECT files_json FROM employees WHERE id = ?");
            $stmt->execute([$id]);
            $j = $stmt->fetchColumn();
            if ($j === false) throw new \Exception("Employee not found with ID: {$id}");
            return mcp_file_slots(json_decode((string)$j, true));
        }
    }
    return MCP_NOT_MINE;
}

/** File metadata only: names, types, sizes, dates. Paths and content never leave the server. */
function mcp_file_slots($decoded): array {
    $out = [];
    $walk = function ($node, $label = null) use (&$walk, &$out) {
        if (!is_array($node)) return;
        $isFile = isset($node['name']) || isset($node['fileName']);
        if ($isFile && (isset($node['path']) || isset($node['url']) || isset($node['size']) || isset($node['uploadedAt']))) {
            $out[] = [
                'slot' => $label,
                'name' => $node['name'] ?? $node['fileName'],
                'type' => $node['type'] ?? $node['mimeType'] ?? null,
                'size' => $node['size'] ?? null,
                'uploaded_at' => $node['uploadedAt'] ?? $node['date'] ?? null,
            ];
            return;
        }
        foreach ($node as $k => $v) { $walk($v, is_string($k) ? $k : ($node['label'] ?? $node['name'] ?? $label)); }
    };
    $walk($decoded);
    return $out;
}
