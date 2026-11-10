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

require_once __DIR__ . '/task_done.php';

/** The shared "task is done" rule (task_done.php). */
function mcp_done_task_state(string $status, array $taskStates): bool {
    return ccrm_task_status_is_done($status, $taskStates);
}

/** SQL fragment (and params) for "task is open", the same rule as mcp_done_task_state. */
function mcp_open_task_sql(\PDO $pdo, string $alias = ''): array {
    $a = $alias === '' ? '' : $alias . '.';
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    return ccrm_sql_task_not_done(is_array($states) ? $states : [], "{$a}status");
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
    $stmt = $pdo->prepare("SELECT title FROM tasks WHERE related_lead_id = ? AND is_locking = 1 AND archived = 0 AND {$openSql} AND " . ccrm_sql_real_tasks());
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
        'SELECT *, ' . mcp_moment_select('updated_at', 'updated') . "
         FROM leads
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
        $archived = true; $total = 0.0; $created = null; $updatedTs = null;
        foreach ($leads as $l) {
            $archived = $archived && (int)$l['archived'] === 1;
            $total += (float)$l['value'];
            // A profile changes when any of its records does: its moment is the newest (a Unix value, see mcp_row_moments).
            if ($l['updated__ts'] !== null && ($updatedTs === null || (float)$l['updated__ts'] > $updatedTs)) $updatedTs = (float)$l['updated__ts'];
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
            'archived' => $archived, 'created_at' => $created, 'updated_at__ts' => $updatedTs,
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
            'description' => 'A client as the Clients register shows it: all leads/records with the same name rolled into one profile, with total value (sum of lead values plus the client\'s value adjustment), open tasks, projects and invoices. updated_at is the newest change of any of its records and last_activity_at adds its newest timeline entry (both ISO moments with the offset); each record under leads has its own updated_at.',
            'inputSchema' => ['type' => 'object', 'properties' => ['name' => $id('Client name (case-insensitive)'), 'id' => $id('Any lead/client record id of the client')]],
        ],
        [
            'name' => 'list_client_categories',
            'description' => 'The client category tree. updated_at is the ISO 8601 moment a category last changed, with the ' . KOPERNIQ_PRODUCT_NAME . ' time-zone offset.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'get_lead_pipeline_summary',
            'description' => 'Sales pipeline overview: lead count and value per stage in pipeline order, active (not closed) totals, and leads that breached the stage SLA (days in stage vs the limit set in Settings). Days in stage run from the date of the newest stage-change entry (else the creation date) to today in ' . mcp_zone() . ' (as_of); client records and archived leads are not pipeline leads.',
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
            'description' => 'Full meeting note: notes, AI summary, transcript (first 20,000 characters), automated notes, attendees, and its action items. created_at and updated_at are ISO moments with the offset; date is the meeting day.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $id('Meeting ID')], 'required' => ['id']],
        ],
        [
            'name' => 'list_meeting_tasks',
            'description' => 'Action items created from meetings, soonest due date first (items with no due date first). Filter by the due date with due_from/due_to or a bucket (open = status not done; overdue, today, tomorrow, upcoming, done), as in the task panel. Items carry no change moment of their own. Pages: limit + offset.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'meeting_id' => $id('Only this meeting'), 'status' => ['type' => 'string', 'enum' => ['todo', 'in_progress', 'done']],
                'limit' => ['type' => 'integer', 'description' => 'Max rows (default 50, at most 100)'], 'offset' => ['type' => 'integer', 'description' => 'Rows to skip, for the next page'],
            ] + mcp_bucket_prop('due date') + mcp_date_range_props('due', 'Due date')],
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
            'description' => 'Suppliers (contact and payment terms; bank details are not returned). ' . mcp_window_doc('suppliers', MCP_SUPPLIER_WINDOW),
            'inputSchema' => ['type' => 'object', 'properties' => ['search' => ['type' => 'string']] + mcp_window_props(MCP_SUPPLIER_WINDOW)],
        ],
        [
            'name' => 'list_stock_movements',
            'description' => 'Warehouse movement documents (receipts, issues, transfers, adjustments) with cost and sell values. issued_at is the document\'s own date and time; created_at / updated_at are when the record was saved and last changed. from/to filter issued_at (a bare date covers the whole day). ' . mcp_window_doc('documents', MCP_MOVEMENT_WINDOW),
            'inputSchema' => ['type' => 'object', 'properties' => [
                'type' => ['type' => 'string', 'enum' => ['inward', 'outward', 'transfer', 'adjustment']],
                'warehouse_id' => ['type' => 'string'], 'item_id' => ['type' => 'string'],
                'from' => ['type' => 'string', 'description' => 'Issued at or after: YYYY-MM-DD or YYYY-MM-DD HH:MM'],
                'to' => ['type' => 'string', 'description' => 'Issued before: YYYY-MM-DD HH:MM (exclusive), or YYYY-MM-DD for up to the end of that day'],
            ] + mcp_window_props(MCP_MOVEMENT_WINDOW)],
        ],
        [
            'name' => 'list_batches',
            'description' => 'Stock batches with expiry dates. ' . mcp_window_doc('batches', MCP_BATCH_WINDOW),
            'inputSchema' => ['type' => 'object', 'properties' => [
                'expiring_within_days' => ['type' => 'integer', 'description' => 'Only batches expiring within N days of today (includes already expired)'],
                'item_id' => ['type' => 'string'], 'warehouse_id' => ['type' => 'string'], 'include_empty' => ['type' => 'boolean'],
            ] + mcp_window_props(MCP_BATCH_WINDOW)],
        ],
        [
            'name' => 'get_vacation_balance',
            'description' => 'Vacation used / allowance / left per vacation type for the year (rejected requests do not count), plus who is on leave on on_date (default today in ' . KOPERNIQ_PRODUCT_NAME . ' time, ' . mcp_zone() . '): on_leave, and on_leave_today.',
            'inputSchema' => ['type' => 'object', 'properties' => ['employee_id' => $id('One employee; omit for all active employees'), 'year' => ['type' => 'integer'], 'on_date' => $id('Who is on leave on this day (YYYY-MM-DD); default today')]],
        ],
        [
            'name' => 'get_payroll_summary',
            'description' => 'Payroll totals per month for a year: planned (labour cost from the payslip, or the gross salary until it is entered), paid and remaining, for every payroll record of the year including people archived since, plus the nominal monthly payroll of active employees from their contracts.',
            'inputSchema' => ['type' => 'object', 'properties' => ['year' => ['type' => 'integer']]],
        ],
        [
            'name' => 'list_workflows',
            'description' => 'Automation workflows (name, trigger, active flag, size, last run). Workflow definitions are not returned. last_run, created_at and updated_at (the workflow was last edited) are ISO 8601 moments with the ' . KOPERNIQ_PRODUCT_NAME . ' time-zone offset (' . mcp_zone() . ').',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'get_workflow_runs',
            'description' => 'Recent runs of a workflow, newest first: status, duration and trigger. Execution logs are not returned. ' . mcp_window_doc('runs', MCP_WORKFLOW_RUN_WINDOW),
            'inputSchema' => ['type' => 'object', 'properties' => ['workflow_id' => $id('Workflow ID')] + mcp_window_props(MCP_WORKFLOW_RUN_WINDOW), 'required' => ['workflow_id']],
        ],
        [
            'name' => 'list_unified_entries',
            'description' => 'The custom registries (unified entries) configured in the workspace.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'get_unified_entry_rows',
            'description' => 'Rows of one custom registry (read only). due_from / due_to / bucket work on registries that have a due date. ' . mcp_window_doc('rows', MCP_REGISTRY_ROW_WINDOW),
            'inputSchema' => ['type' => 'object', 'properties' => ['registry_id' => $id('Registry ID from list_unified_entries')] + mcp_unified_rows_props(), 'required' => ['registry_id']],
        ],
        [
            'name' => 'list_documents',
            'description' => 'Documents filed on lead/client timelines (offers, orders, proforma invoices, advance receipts, invoices, delivery notes) with amount and file name; only records of the kind (leads or clients) your key may read are listed. Invoicing module documents are listed with list_invoices. '
                . 'timestamp is the event time as entered, in ' . KOPERNIQ_PRODUCT_NAME . ' local time (' . mcp_zone() . '); timestamp_iso is the same moment with the offset. Newest first; pages: limit + offset.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'lead_id' => $id('Only this lead/client record'),
                'type' => ['type' => 'string', 'enum' => ['offer', 'order', 'proforma_invoice', 'advance_receipt', 'invoice', 'delivery_note']],
                'limit' => ['type' => 'integer', 'description' => 'Max rows (default 50, at most 100)'],
                'offset' => ['type' => 'integer', 'description' => 'Rows to skip, for the next page'],
            ]],
        ],
        [
            'name' => 'list_files',
            'description' => 'File metadata (names, types, dates; never the content) attached to a lead/client, a project, or an employee (employee files need the employees.files permission). A lead/client record of a kind your key may not read returns nothing. For source=lead, newest first with limit (default 200, at most 200) + offset; timestamp is local time (' . mcp_zone() . '), timestamp_iso carries the offset.',
            'inputSchema' => ['type' => 'object', 'properties' => ['source' => ['type' => 'string', 'enum' => ['lead', 'project', 'employee']], 'id' => $id('Record ID'), 'limit' => ['type' => 'integer', 'description' => 'source=lead only: max rows (default 200)'], 'offset' => ['type' => 'integer', 'description' => 'source=lead only: rows to skip']], 'required' => ['source', 'id']],
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
        'get_vacation_balance' => $v('employees', 'employees.vacations'),
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
            $out['leads'] = array_map(fn($l) => ['id' => $l['id'], 'status' => $l['status'], 'value' => mcp_round2($l['value']), 'owner' => $l['owner'], 'created_at' => $l['created_at'], 'updated_at' => mcp_format_moment($l['updated__ts']), 'archived' => (int)$l['archived'] === 1], $found['_leads']);
            if (mcp_can('tasks')) {
                [$openSql, $openParams] = mcp_open_task_sql($pdo);
                [$scopeSql, $scopeParams] = mcp_task_scope($user);
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE related_lead_id IN ($ph) AND archived = 0 AND {$openSql} AND " . ccrm_sql_real_tasks() . ($scopeSql ? " AND $scopeSql" : ''));
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
            // updated_at (newest of its records) and last_activity_at (adds the timeline) as ISO moments.
            return mcp_row_moments(mcp_profiles_activity($pdo, [$out])[0]);
        }

        case 'list_client_categories':
            return mcp_list_client_categories($pdo);

        case 'get_lead_pipeline_summary': {
            $states = mcp_config_json($pdo, 'LEAD_STATES', []);
            $groups = mcp_config_json($pdo, 'LEAD_STAGE_GROUPS', []);
            $parents = mcp_config_json($pdo, 'LEAD_STATE_PARENTS', []);
            $sla = mcp_config_json($pdo, 'LEAD_STATE_SLA', []);
            $where = "archived = 0 AND id <> 'unassigned-docs' AND id NOT LIKE 'client-%'";
            $params = [];
            // The leads/clients module split: a leads-only key must not count a record that carries a client value adjustment.
            if (($scopeSql = mcp_lead_scope_sql($user, '')) !== '') $where .= " AND $scopeSql";
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
                'as_of' => mcp_today(),
                'stages' => array_values($rows),
                'active' => ['count' => $activeCount, 'value' => mcp_round2($activeValue)],
                'sla_breaches' => $breaches,
                'note' => 'Active = not archived and not in a closed stage. Client records (id client-*) are not pipeline leads and are excluded.',
            ];
        }

        case 'set_task_assignees': {
            $taskId = mcp_require_string($args, 'task_id');
            if (!is_array($args['assignees'] ?? null) || !$args['assignees']) throw new \InvalidArgumentException("'assignees' must be a non-empty list of user names.");
            // Adding an assignee also grants visibility of the task, so the stored
            // row must already be visible to this caller (same rule as sync.php).
            [$scopeSql, $scopeParams] = mcp_task_scope($user);
            $stmt = $pdo->prepare("SELECT id, owner FROM tasks WHERE id = ? AND " . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : ''));
            $stmt->execute(array_merge([$taskId], $scopeParams));
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
            $addedAny = false;
            foreach (array_keys($names) as $n) { $ins->execute([$taskId, $n]); $addedAny = $addedAny || $ins->rowCount() > 0; }
            // Assignees are not a column of tasks, so mark the task as changed by hand.
            if ($addedAny) $pdo->prepare("UPDATE tasks SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?")->execute([$taskId]); /* recurring-template: by-id touch, any task kind */
            mcp_audit($pdo, $user, 'task_assignees_add', "Task {$taskId}: assignees " . implode(', ', array_keys($names)));
            $cur = $pdo->prepare("SELECT user_name FROM task_assignees WHERE task_id = ? ORDER BY user_name");
            $cur->execute([$taskId]);
            return ['success' => true, 'task_id' => $taskId, 'assignees' => $cur->fetchAll(\PDO::FETCH_COLUMN)];
        }

        case 'set_task_tags': {
            $taskId = mcp_require_string($args, 'task_id');
            if (!is_array($args['tags'] ?? null) || !$args['tags']) throw new \InvalidArgumentException("'tags' must be a non-empty list.");
            // Tags travel with the task row in the app, so the same stored-row
            // visibility rule applies here.
            [$scopeSql, $scopeParams] = mcp_task_scope($user);
            $chk = $pdo->prepare("SELECT id FROM tasks WHERE id = ? AND " . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : ''));
            $chk->execute(array_merge([$taskId], $scopeParams));
            if (!$chk->fetchColumn()) throw new \Exception("Task not found with ID: {$taskId}");
            $insTag = $pdo->prepare("INSERT IGNORE INTO tags (id, name) VALUES (?, ?)");
            $insLink = $pdo->prepare("INSERT IGNORE INTO task_tags (task_id, tag_name) VALUES (?, ?)");
            $added = [];
            $linkedAny = false;
            foreach ($args['tags'] as $t) {
                $name = trim((string)$t);
                if ($name === '' || mb_strlen($name) > 100) throw new \InvalidArgumentException('Tag names must be 1-100 characters.');
                $insTag->execute(['tag-' . substr(sha1(strtolower($name)), 0, 16), $name]);
                $insLink->execute([$taskId, $name]);
                if ($insLink->rowCount() > 0) $linkedAny = true;
                $added[] = $name;
            }
            // Tags are not a column of tasks, so mark the task as changed by hand.
            if ($linkedAny) $pdo->prepare("UPDATE tasks SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?")->execute([$taskId]); /* recurring-template: by-id touch, any task kind */
            mcp_audit($pdo, $user, 'task_tags_add', "Task {$taskId}: tags " . implode(', ', $added));
            return ['success' => true, 'task_id' => $taskId, 'tags_added' => $added];
        }

        case 'get_meeting': {
            $id = mcp_require_string($args, 'id');
            $stmt = $pdo->prepare('SELECT *, ' . mcp_moment_select('created_at', 'created_at') . ', ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM meeting_notes WHERE id = ?');
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
                'created_at__ts' => $m['created_at__ts'], 'updated_at__ts' => $m['updated_at__ts'],
            ];
            $out = mcp_row_moments($out);
            $t = $pdo->prepare("SELECT id, title, description, assigned_user, due_date, priority, status FROM meeting_tasks WHERE meeting_id = ? ORDER BY due_date ASC");
            $t->execute([$id]);
            $out['action_items'] = $t->fetchAll(\PDO::FETCH_ASSOC);
            return $out;
        }

        case 'list_meeting_tasks':
            return mcp_list_meeting_tasks($pdo, $args);

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

        case 'list_suppliers':
            return mcp_list_suppliers($pdo, $user, $args);

        case 'list_stock_movements':
            return mcp_list_stock_movements($pdo, $user, $args);

        case 'list_batches':
            return mcp_list_batches($pdo, $user, $args);

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
            $onDate = mcp_optional_date($args, 'on_date') ?? mcp_today();
            $onLeave = mcp_vacation_on_leave($pdo, $onDate);
            return ['employees' => $out, 'on_date' => $onDate, 'on_leave' => $onLeave,
                'on_leave_today' => $onDate === mcp_today() ? $onLeave : mcp_vacation_on_leave($pdo, mcp_today())];
        }

        case 'get_payroll_summary': {
            $year = isset($args['year']) ? (int)$args['year'] : (int)date('Y');
            // Planned = what each month costs: Cena práce once the payslip is in, otherwise the gross
            // (ccrm_salary_due / salaryDue). Past months count every stored record, including those of
            // people archived since; only the nominal figure below is about current contracts.
            $stmt = $pdo->prepare("SELECT s.period_key, SUM(COALESCE(s.labor_cost, s.total_salary)) planned, SUM(s.total_paid) paid, COUNT(*) records FROM employee_salaries s WHERE s.year = ? GROUP BY s.period_key ORDER BY s.period_key");
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

        case 'list_workflows':
            return mcp_list_workflows($pdo);

        case 'get_workflow_runs':
            return mcp_get_workflow_runs($pdo, $user, $args);

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

        case 'get_unified_entry_rows':
            return mcp_get_unified_entry_rows($pdo, $user, $args);

        case 'list_documents':
            return mcp_list_documents($pdo, $user, $args);

        case 'list_files': {
            $source = mcp_enum($args, 'source', ['lead', 'project', 'employee']);
            $id = mcp_require_string($args, 'id');
            if ($source === 'lead') return mcp_list_lead_files($pdo, $user, $args, $id);
            if ($source === 'project') {
                $stmt = $pdo->prepare("SELECT custom_files_json FROM projects WHERE id = ?");
                $stmt->execute([$id]);
                $j = $stmt->fetchColumn();
                if ($j === false) throw new \Exception("Project not found with ID: {$id}");
                return mcp_file_slots(json_decode((string)$j, true));
            }
            if (!mcp_can('employees') || !mcp_can('employees.files')) throw new \Exception('Employee files need the employees.files permission.');
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
