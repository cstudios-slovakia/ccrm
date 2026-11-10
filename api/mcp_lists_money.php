<?php
/**
 * MCP list tools rebuilt on the shared window (mcp_window.php), area: money. Projects, milestones,
 * invoices, expenses, ledger movements, the cash-flow forecast.
 *
 * See docs/audits/mcp-change-visibility-audit.md (RC1, RC3b, RC4, RC5, RC6, RC8, RC10, RC12).
 * Money rules: docs/audits/stored-vs-derived-audit.md Part P2 (overdue is derived from the due
 * date, never read from the stored flag alone; a recurring rule row is not a movement).
 *
 * The handlers live here and the `case` in mcp.php / mcp_ext.php / mcp_ext_intel.php is one line,
 * so mcp.php does not grow (.agents/rules/large-files.md). The tool definitions live here too
 * (mcp_money_tool_def) because their descriptions and filters are the contract of the window.
 */

// ============================================================================
// Windows (one per list, like MCP_TASK_WINDOW)
// ============================================================================

const MCP_PROJECT_WINDOW = [
    'created' => 'p.created_at', 'updated' => 'p.updated_at', 'id' => 'p.id',
    'sorts' => ['deadline' => ['p.completion_deadline', 'ASC']], 'default_sort' => 'created_at',
];

/** The later of the invoice document's own change and the change of its ledger movement (a payment). */
const MCP_INVOICE_ACTIVITY = 'GREATEST(UNIX_TIMESTAMP(io.updated_at), IFNULL(UNIX_TIMESTAMP(fr.updated_at), 0))';

const MCP_INVOICE_WINDOW = [
    'created' => 'io.created_at', 'updated' => 'io.updated_at', 'id' => 'io.id',
    'sorts' => [
        'issued_at' => ['io.issued_at', 'DESC'],
        'due_date' => ["COALESCE(io.due_date, '9999-12-31')", 'ASC'],
        'last_activity_at' => [MCP_INVOICE_ACTIVITY, 'DESC'],
    ],
    'default_sort' => 'issued_at',
];

const MCP_EXPENSE_WINDOW = [
    'created' => 'created_at', 'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['issue_date' => ['issue_date', 'DESC'], 'due_date' => ["COALESCE(due_date, '9999-12-31')", 'ASC']],
    'default_sort' => 'issue_date',
];

const MCP_MOVEMENT_WINDOW = [
    'created' => 'created_at', 'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['filed_on' => ['COALESCE(paid_date, due_date, issue_date)', 'DESC'], 'due_date' => ["COALESCE(due_date, '9999-12-31')", 'ASC']],
    'default_sort' => 'filed_on',
];

/** Milestones carry no change moment of their own, so the window here is limit + offset only. */
const MCP_MILESTONE_PAGE = ['default_limit' => 50, 'max_limit' => 100];

// ============================================================================
// Tool definitions
// ============================================================================

/** The definition of one tool of this area (descriptions are the contract of each filter). */
function mcp_money_tool_def(string $name): array {
    $statusEnum = ['planned', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled'];
    $payEnum = ['paid', 'partially_paid', 'unpaid', 'overdue', 'planned', 'cancelled'];
    switch ($name) {
        case 'list_projects':
            return [
                'name' => 'list_projects',
                'description' => 'List and filter delivery projects with contract value, budget, rating, invoice date (invoice_date), deadline (completion_deadline), delay reason and finish date, plus project_type (name and the has_invoice_date / has_deadline switches: a null date on a type without the switch is not applicable rather than missing) and status_group. '
                    . 'Date filters (inclusive): deadline_from/deadline_to, invoice_date_from/invoice_date_to. bucket works on the deadline: overdue = open and past it, today, tomorrow, upcoming (later than tomorrow), done; "open" means not archived and not in a completed or cancelled status group, the rule get_client_dossier uses for active projects. '
                    . 'updated_at covers the project\'s own fields and the managers and milestones (Gantt rows) shown in its form; it does not move when a payment is booked or a task changes. '
                    . mcp_window_doc('projects', MCP_PROJECT_WINDOW) . ' sort_by=deadline lists the soonest deadline first and projects without one last.',
                'inputSchema' => ['type' => 'object', 'properties' => [
                    'status' => ['type' => 'string', 'description' => 'Filter by a configured project status'],
                    'client_id' => ['type' => 'string', 'description' => 'Filter by client ID'],
                    'search' => ['type' => 'string', 'description' => 'Search project names'],
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include archived projects (default false)'],
                ] + mcp_date_range_props('deadline', 'Deadline') + mcp_date_range_props('invoice_date', 'Invoice date')
                  + mcp_bucket_prop('deadline') + mcp_window_props(MCP_PROJECT_WINDOW)],
            ];
        case 'get_project':
            return [
                'name' => 'get_project',
                'description' => 'Retrieve project details (incl. start_date, invoice_date, completion_deadline = the Deadline, delay_reason, finished_at; project_type tells whether its type uses the invoice date and the deadline) with its client (from client_id, else the paired lead, else the client the project is named for — see client.linked_by), contract value, a financials block (contract value, invoiced, paid, outstanding, remaining billable, and the installment schedule: every income movement with due date, amount, invoice number, payment status and updated_at), milestones, linked tasks and a url. created_at and updated_at are ISO 8601 moments with the ' . KOPERNIQ_PRODUCT_NAME . ' time-zone offset (' . mcp_zone() . ').',
                'inputSchema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'string', 'description' => 'Project ID']], 'required' => ['id']],
            ];
        case 'list_milestones':
            return [
                'name' => 'list_milestones',
                'description' => 'Milestones: the rows of a project\'s Gantt timeline (start, end, progress) and its blocking milestone tasks (what create_milestone adds: deadline, priority, status, owner, created_at, updated_at). Each has a status, a done flag, project_id and project_name. '
                    . 'With project_id: that project\'s milestones. Without it: the milestones of every non-archived project (include_archived adds archived ones), soonest deadline first, undated last, paged with limit + offset (has_more says whether a next page exists). '
                    . 'Filters: open_only, deadline_from/deadline_to (inclusive), bucket on the deadline (overdue = open and past it, today, tomorrow, upcoming, done). Milestone tasks follow the key owner\'s task visibility. Gantt rows carry no change moment.',
                'inputSchema' => ['type' => 'object', 'properties' => [
                    'project_id' => ['type' => 'string', 'description' => 'One project; omit for the milestones of all projects'],
                    'open_only' => ['type' => 'boolean', 'description' => 'Leave out finished milestones (default false)'],
                    'include_archived' => ['type' => 'boolean', 'description' => 'Without project_id: include archived projects (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Without project_id: max rows (default 50, at most 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Without project_id: rows to skip, for the next page'],
                ] + mcp_date_range_props('deadline', 'Deadline') + mcp_bucket_prop('deadline')],
            ];
        case 'list_invoices':
            return [
                'name' => 'list_invoices',
                'description' => 'List issued invoices, proformas and price offers with their payment state. status is the DOCUMENT status; payment_status is derived from the invoice\'s ledger movement and its due date: paid, partially_paid, unpaid, overdue (not paid and past its due date, or flagged overdue), planned (a draft), cancelled; price offers have none. paid, open and paid_date come from the ledger movement. '
                    . 'Filters: type, status, payment_status, client_id, search, issued_from/issued_to and due_from/due_to (inclusive dates), activity_from/activity_to. "Which invoices are overdue across all clients, and how much is open": payment_status=overdue, then add up open over the pages. '
                    . 'updated_at changes with the document itself (its fields, status, items); recording a payment does NOT move it. A payment shows in last_activity_at = the later of updated_at and the last change of the invoice\'s ledger movement: use activity_from/activity_to, or sort_by=last_activity_at, to find invoices that changed or were paid in a period. '
                    . 'status_changed_at is the day the document status last changed (a date, no time of day). '
                    . mcp_window_doc('invoices', MCP_INVOICE_WINDOW),
                'inputSchema' => ['type' => 'object', 'properties' => [
                    'type' => ['type' => 'string', 'description' => 'Type: invoice, price_offer, proforma (default: all types)'],
                    'status' => ['type' => 'string', 'description' => 'Document status. Invoices and proformas: draft, sent, approved, rejected, invoiced, cancelled. Price offers use the statuses configured in the app (Price offers → Settings), so any key of that list is valid; the defaults are the same six.'],
                    'payment_status' => ['type' => 'string', 'enum' => $payEnum, 'description' => 'Derived payment state (never set on price offers)'],
                    'client_id' => ['type' => 'string', 'description' => 'Filter by client ID'],
                    'search' => ['type' => 'string', 'description' => 'Search document number or client name'],
                    'activity_from' => ['type' => 'string', 'description' => 'last_activity_at at or after: YYYY-MM-DD or YYYY-MM-DD HH:MM'],
                    'activity_to' => ['type' => 'string', 'description' => 'last_activity_at before: YYYY-MM-DD HH:MM (exclusive), or YYYY-MM-DD for up to the end of that day'],
                ] + mcp_date_range_props('issued', 'Issue date') + mcp_date_range_props('due', 'Due date') + mcp_window_props(MCP_INVOICE_WINDOW)],
            ];
        case 'get_invoice':
            return [
                'name' => 'get_invoice',
                'description' => 'Get full breakdown of an invoice or price offer with line items and its payment state: paid, open, paid_date and the derived payment_status (see list_invoices), status_changed_at, created_at / updated_at as ISO moments, and last_activity_at (the later of updated_at and the last change of the ledger movement: a payment moves only this one).',
                'inputSchema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'string', 'description' => 'Invoice document ID']], 'required' => ['id']],
            ];
        case 'list_expenses':
            return [
                'name' => 'list_expenses',
                'description' => 'Query recorded business expenses (stored movements; recurring rules are listed by list_recurring_movements). start_date/end_date filter the issue date, due_from/due_to the due date (all inclusive, YYYY-MM-DD). ' . mcp_window_doc('expenses', MCP_EXPENSE_WINDOW),
                'inputSchema' => ['type' => 'object', 'properties' => [
                    'category_id' => ['type' => 'string', 'description' => 'Filter by financial category ID'],
                    'start_date' => ['type' => 'string', 'description' => 'Issued on or after (YYYY-MM-DD)'],
                    'end_date' => ['type' => 'string', 'description' => 'Issued on or before (YYYY-MM-DD)'],
                    'search' => ['type' => 'string', 'description' => 'Search expense title/description'],
                ] + mcp_date_range_props('due', 'Due date') + mcp_window_props(MCP_EXPENSE_WINDOW)],
            ];
        case 'list_financial_movements':
            return [
                'name' => 'list_financial_movements',
                'description' => 'List ledger movements (income and expenses): invoices, payments, salaries, recurring rules. Each row shows the settled and still-expected amount, the date it is filed under (filed_on = paid date, else due date, else issue date), payment_status for one-off movements and updated_at. '
                    . 'status=overdue is derived: a one-off movement that is not paid and not cancelled or planned, and is flagged overdue or has a due date before today (' . KOPERNIQ_PRODUCT_NAME . ' date); recurring rules are never overdue. '
                    . 'Date filters (inclusive): from/to on filed_on, due_from/due_to, paid_from/paid_to ("what was paid yesterday"), issue_from/issue_to. '
                    . mcp_window_doc('movements', MCP_MOVEMENT_WINDOW),
                'inputSchema' => ['type' => 'object', 'properties' => [
                    'type' => ['type' => 'string', 'enum' => ['income', 'expense']],
                    'status' => ['type' => 'string', 'enum' => $statusEnum],
                    'category_id' => ['type' => 'string'], 'project_id' => ['type' => 'string'], 'client_id' => ['type' => 'string'],
                    'recurring' => ['type' => 'boolean', 'description' => 'true = only recurring rules, false = only one-off movements'],
                    'from' => ['type' => 'string', 'description' => 'Filed on/after (YYYY-MM-DD)'],
                    'to' => ['type' => 'string', 'description' => 'Filed on/before (YYYY-MM-DD)'],
                    'search' => ['type' => 'string'],
                ] + mcp_date_range_props('due', 'Due date') + mcp_date_range_props('paid', 'Paid date') + mcp_date_range_props('issue', 'Issue date')
                  + mcp_window_props(MCP_MOVEMENT_WINDOW)],
            ];
        case 'list_recurring_movements':
            return [
                'name' => 'list_recurring_movements',
                'description' => 'Recurring income/expense rules with their schedule, current amount, amount_history (superseded amounts: [{until, amountPlanned, amountReal}], the amount in force up to and including that day), whether they are paused and the next charge date.',
                'inputSchema' => ['type' => 'object', 'properties' => [
                    'type' => ['type' => 'string', 'enum' => ['income', 'expense']],
                    'include_paused' => ['type' => 'boolean', 'description' => 'Include rules that have ended or are paused (default false)'],
                ]],
            ];
        case 'get_cash_flow_forecast':
            return [
                'name' => 'get_cash_flow_forecast',
                'description' => 'Money that has not moved yet over the next N months: recurring charges, unpaid movements by due date, and scheduled ones. Returns month totals and the individual expected transactions (months and totals start tomorrow). '
                    . 'The overdue block holds what the months leave out: unpaid issued movements (pending, partially paid, flagged overdue) dated before today (due date, else issue date), with totals (income, expense, net), items oldest first (at most 100, truncated says more exist) and days_overdue. '
                    . 'planned_past counts planned (not yet issued) movements whose date has passed, due_today the unpaid money dated today. as_of is today\'s ' . KOPERNIQ_PRODUCT_NAME . ' date.',
                'inputSchema' => ['type' => 'object', 'properties' => [
                    'months' => ['type' => 'integer', 'description' => 'Months ahead (default 3, max 24)'],
                    'include_items' => ['type' => 'boolean', 'description' => 'List every expected transaction (default false, max 200)'],
                ]],
            ];
        case 'get_project_billing_summary':
            return [
                'name' => 'get_project_billing_summary',
                'description' => 'How much of each project\'s contract value has come in, is invoiced but unpaid, or is not invoiced yet (the Project page billing block). Same maths as the app: cancelled income rows count as nothing, a partially paid row counts its paid part as received and the rest as invoiced-open. The project value is the first positive of: project value, the project type\'s money attributes, the custom value attribute, the paired lead value (budget is never used). Projects come newest first, limit + offset page through them; truncated=true means a next page exists. totals cover the returned page only.',
                'inputSchema' => ['type' => 'object', 'properties' => [
                    'project_id' => ['type' => 'string', 'description' => 'One project; omit for all projects'],
                    'status' => ['type' => 'string', 'description' => 'Only projects in this status'],
                    'active_only' => ['type' => 'boolean', 'description' => 'Only projects in an open status group (default false)'],
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include archived projects (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Max projects (default 50, max 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Projects to skip, for the next page'],
                ]],
            ];
    }
    throw new \LogicException("No money tool definition for {$name}");
}

// ============================================================================
// Projects
// ============================================================================

/**
 * "Project is still open": not archived and not in a completed or cancelled status group. The rule
 * get_client_dossier uses for active projects (a status the settings no longer know counts as open).
 * @return array{0: string, 1: array} [sql, params]
 */
function mcp_project_open_sql(\PDO $pdo, string $alias = 'p'): array {
    $closed = array_keys(array_filter(mcp_project_status_groups($pdo), fn($g) => in_array($g, ['completed', 'cancelled'], true)));
    $sql = "({$alias}.archived = 0 OR {$alias}.archived IS NULL)";
    if ($closed) $sql .= " AND {$alias}.status NOT IN (" . implode(',', array_fill(0, count($closed), '?')) . ')';
    return [$sql, $closed];
}

function mcp_list_projects(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    if (!empty($args['status'])) { $where[] = 'p.status = ?'; $params[] = $args['status']; }
    if (!empty($args['client_id'])) {
        $where[] = '(p.client_id = ? OR p.lead_id = ?)';
        array_push($params, $args['client_id'], $args['client_id']);
    }
    if (!empty($args['search'])) { $where[] = 'p.name LIKE ?'; $params[] = '%' . $args['search'] . '%'; }
    if (empty($args['include_archived'])) $where[] = '(p.archived = 0 OR p.archived IS NULL)';

    $win = mcp_list_window($args, MCP_PROJECT_WINDOW);
    [$dlWhere, $dlParams] = mcp_date_range($args, 'deadline', 'p.completion_deadline');
    [$invWhere, $invParams] = mcp_date_range($args, 'invoice_date', 'p.invoice_date');
    $bucket = mcp_enum($args, 'bucket', ['overdue', 'today', 'tomorrow', 'upcoming', 'done']);
    [$bWhere, $bParams] = $bucket ? mcp_date_bucket($bucket, 'p.completion_deadline', mcp_project_open_sql($pdo)) : [[], []];
    $where = array_merge($where, $win['where'], $dlWhere, $invWhere, $bWhere);
    $params = array_merge($params, $win['params'], $dlParams, $invParams, $bParams);

    $tail = $win['tail'];
    if (($args['sort_by'] ?? '') === 'deadline') {
        // MySQL sorts NULL first ascending: undated projects always go last.
        $dir = strtolower((string)($args['sort_order'] ?? '')) === 'desc' ? 'DESC' : 'ASC';
        $tail = "ORDER BY (p.completion_deadline IS NULL), p.completion_deadline $dir, p.id ASC LIMIT {$win['limit']} OFFSET {$win['offset']}";
    }

    $stmt = $pdo->prepare(
        "SELECT p.id, p.name, p.status, p.division, p.rating, p.value, p.budget, p.invoice_date, p.completion_deadline, p.delay_reason, p.start_date, p.finished_at,
                p.project_type_id, p.lead_id, p.client_id, l.name AS client_name, p.archived, "
        . mcp_moment_select('p.created_at', 'created_at') . ', ' . mcp_moment_select('p.updated_at', 'updated_at') . "
         FROM projects p
         LEFT JOIN leads l ON l.id = COALESCE(p.lead_id, p.client_id)
         WHERE " . implode(' AND ', $where) . ' ' . $tail
    );
    $stmt->execute($params);
    $groups = mcp_project_status_groups($pdo);
    return array_map(fn($p) => mcp_row_moments($p) + [
        'status_group' => $groups[$p['status']] ?? null,
        'project_type' => mcp_project_type_info($pdo, $p['project_type_id']),
        'url' => mcp_project_url($pdo, (string)$p['id']),
    ], $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

/** id => ISO moment of the last change of these ledger movements (financial_records.updated_at). */
function mcp_movement_moments(\PDO $pdo, array $ids): array {
    $ids = array_values(array_unique(array_map('strval', $ids)));
    if (!$ids) return [];
    $stmt = $pdo->prepare('SELECT id, ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM financial_records WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $stmt->execute($ids);
    $out = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) $out[$r['id']] = mcp_format_moment($r['updated_at__ts']);
    return $out;
}

function mcp_get_project(\PDO $pdo, array $user, array $args): array {
    $stmt = $pdo->prepare('SELECT *, ' . mcp_moment_select('created_at', 'created_at') . ', ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM projects WHERE id = ?');
    $stmt->execute([$args['id']]);
    $proj = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$proj) {
        throw new \Exception('Project not found with ID: ' . $args['id']);
    }
    $proj = mcp_row_moments($proj);
    $proj['url'] = mcp_project_url($pdo, (string)$proj['id']);
    $proj['project_type'] = mcp_project_type_info($pdo, $proj['project_type_id'] ?? null);

    // The client: client_id, else the paired lead, else the client the project is named for.
    $owner = mcp_project_client($pdo, $proj);
    $proj['client'] = $owner ? mcp_client_summary($pdo, $owner['scope'], $owner['linked_by']) : null;

    $ctx = mcp_projects_ctx();
    $proj['contract_value'] = mcp_project_value($pdo, $proj, $ctx);
    if (mcp_can('financial')) {
        $proj['financials'] = mcp_project_financials($pdo, $proj, $ctx);
        $moments = mcp_movement_moments($pdo, array_column($proj['financials']['installments'], 'id'));
        foreach ($proj['financials']['installments'] as $i => $inst) {
            $proj['financials']['installments'][$i]['updated_at'] = $moments[$inst['id']] ?? null;
        }
    }
    $proj['milestones'] = mcp_project_milestones($pdo, $user, $proj);

    // Linked tasks (only for callers who can see the tasks module, scoped by tasks.view_all)
    if (mcp_can('tasks')) {
        [$scopeSql, $scopeParams] = mcp_task_scope($user);
        $tStmt = $pdo->prepare('SELECT id, title, priority, deadline, status, owner FROM tasks WHERE related_project_id = ? AND ' . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : '') . ' ORDER BY deadline ASC');
        $tStmt->execute(array_merge([$args['id']], $scopeParams));
        $proj['tasks'] = $tStmt->fetchAll(\PDO::FETCH_ASSOC);
    }
    return $proj;
}

// ============================================================================
// Milestones
// ============================================================================

/** Does this milestone row (the mcp_project_milestones shape) fall in the bucket? "Today" is mcp_today(). */
function mcp_milestone_in_bucket(array $m, string $bucket, string $today): bool {
    if ($bucket === 'done') return !empty($m['done']);
    if (!empty($m['done']) || !mcp_iso_ok($m['deadline'] ?? null)) return false;
    $tomorrow = mcp_iso_shift($today, 1);
    switch ($bucket) {
        case 'overdue': return $m['deadline'] < $today;
        case 'today': return $m['deadline'] === $today;
        case 'tomorrow': return $m['deadline'] === $tomorrow;
        default: return $m['deadline'] > $tomorrow;
    }
}

/** The part of a milestone sort order both sources share: soonest first, undated last, then id (byte order). */
function mcp_milestone_cmp(array $a, array $b): int {
    return strcmp((string)($a['deadline'] ?? '9999-12-31'), (string)($b['deadline'] ?? '9999-12-31')) ?: strcmp((string)$a['id'], (string)$b['id']);
}

function mcp_list_milestones(\PDO $pdo, array $user, array $args): array {
    $bucket = mcp_enum($args, 'bucket', ['overdue', 'today', 'tomorrow', 'upcoming', 'done']);
    $from = mcp_optional_date($args, 'deadline_from');
    $to = mcp_optional_date($args, 'deadline_to');
    if ($from !== null && $to !== null && $from > $to) throw new \InvalidArgumentException("'deadline_from' is after 'deadline_to'.");
    $openOnly = !empty($args['open_only']);
    $projectId = isset($args['project_id']) ? trim((string)$args['project_id']) : '';

    if ($projectId !== '') {
        $stmt = $pdo->prepare('SELECT *, ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM projects WHERE id = ?');
        $stmt->execute([$projectId]);
        $p = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$p) throw new \Exception("Project not found with ID: {$projectId}");
        $today = mcp_today();
        $rows = array_values(array_filter(mcp_project_milestones($pdo, $user, $p), function ($m) use ($openOnly, $from, $to, $bucket, $today) {
            if ($openOnly && $m['done']) return false;
            if ($from !== null && (!mcp_iso_ok($m['deadline']) || $m['deadline'] < $from)) return false;
            if ($to !== null && (!mcp_iso_ok($m['deadline']) || $m['deadline'] > $to)) return false;
            return $bucket === null || mcp_milestone_in_bucket($m, $bucket, $today);
        }));
        $rows = array_map(fn($m) => $m + ['project_id' => $p['id'], 'project_name' => $p['name']], $rows);
        return [
            'project' => ['id' => $p['id'], 'name' => $p['name'], 'status' => $p['status'], 'invoice_date' => $p['invoice_date'], 'completion_deadline' => $p['completion_deadline'], 'updated_at' => mcp_format_moment($p['updated_at__ts']), 'url' => mcp_project_url($pdo, (string)$p['id'])],
            'milestones' => $rows,
        ];
    }

    // Across projects: each source filters, orders and cuts in SQL (offset + limit + 1 rows), then the two are merged.
    $limit = mcp_limit($args, (int)MCP_MILESTONE_PAGE['default_limit'], (int)MCP_MILESTONE_PAGE['max_limit']);
    $offset = max(0, (int)($args['offset'] ?? 0));
    $need = $offset + $limit + 1;
    $archived = empty($args['include_archived']) ? '(p.archived = 0 OR p.archived IS NULL)' : '1=1';
    $today = mcp_today();
    $merged = [];

    // Gantt rows: one table per project type.
    $types = $pdo->query("SELECT DISTINCT p.project_type_id FROM projects p WHERE {$archived}")->fetchAll(\PDO::FETCH_COLUMN);
    foreach ($types as $typeId) {
        $table = 'proj_gantt_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$typeId));
        if ($pdo->query('SHOW TABLES LIKE ' . $pdo->quote($table))->rowCount() === 0) continue;
        $where = ["p.project_type_id = ?", $archived];
        $params = [$typeId];
        if ($openOnly) $where[] = 'g.progress < 100';
        [$rw, $rp] = mcp_date_range($args, 'deadline', 'g.end_date');
        [$bw, $bp] = $bucket ? mcp_date_bucket($bucket, 'g.end_date', ['g.progress < 100', []]) : [[], []];
        $stmt = $pdo->prepare(
            "SELECT g.id, g.title, g.contact_id, g.start_date, g.end_date, g.progress, p.id AS project_id, p.name AS project_name
             FROM `{$table}` g JOIN projects p ON p.id = g.project_id
             WHERE " . implode(' AND ', array_merge($where, $rw, $bw)) . "
             ORDER BY (g.end_date IS NULL), g.end_date, g.id COLLATE utf8mb4_bin LIMIT {$need}"
        );
        $stmt->execute(array_merge($params, $rp, $bp));
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $g) {
            $merged[] = mcp_gantt_milestone_row($g, $today) + ['project_id' => $g['project_id'], 'project_name' => $g['project_name']];
        }
    }

    // Blocking milestone tasks, for a key that sees the tasks module and only the tasks it may see.
    if (mcp_can('tasks')) {
        [$scopeSql, $scopeParams] = mcp_task_scope($user, 't');
        $taskStates = mcp_config_json($pdo, 'TASK_STATES', []);
        $taskStates = is_array($taskStates) ? $taskStates : [];
        $where = ['t.is_locking = 1', 't.archived = 0', $archived];
        $params = [];
        if ($scopeSql !== '') { $where[] = $scopeSql; $params = array_merge($params, $scopeParams); }
        $open = mcp_open_task_sql($pdo, 't');
        if ($openOnly) { $where[] = $open[0]; $params = array_merge($params, $open[1]); }
        [$rw, $rp] = mcp_date_range($args, 'deadline', 't.deadline');
        [$bw, $bp] = $bucket ? mcp_date_bucket($bucket, 't.deadline', $open) : [[], []];
        $stmt = $pdo->prepare(
            "SELECT t.id, t.title, t.description, t.priority, t.start_date, t.deadline, t.status, t.owner, t.completed_at, t.related_lead_id,
                    p.id AS project_id, p.name AS project_name, " . mcp_moment_select('t.created_at', 'created_at') . ', ' . mcp_moment_select('t.updated_at', 'updated_at') . "
             FROM tasks t JOIN projects p ON p.id = t.related_project_id
             WHERE " . ccrm_sql_real_tasks('t') . ' AND ' . implode(' AND ', array_merge($where, $rw, $bw)) . "
             ORDER BY (t.deadline IS NULL), t.deadline, t.id COLLATE utf8mb4_bin LIMIT {$need}"
        );
        $stmt->execute(array_merge($params, $rp, $bp));
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $t) {
            $merged[] = mcp_task_milestone_row($t, $taskStates) + ['project_id' => $t['project_id'], 'project_name' => $t['project_name']];
        }
    }

    usort($merged, 'mcp_milestone_cmp');
    return [
        'project' => null,
        'milestones' => array_slice($merged, $offset, $limit),
        'limit' => $limit, 'offset' => $offset,
        'has_more' => count($merged) > $offset + $limit,
    ];
}

// ============================================================================
// Invoices (Invoicing module documents with the payment state of their ledger movement)
// ============================================================================

const MCP_INVOICE_FROM = "invoices_offers io LEFT JOIN financial_records fr ON fr.id = CONCAT('fr-inv-', io.id)";

/** Document columns, the ledger movement mcp_invoice_doc_row reads, and the moments (ISO after mcp_row_moments). */
const MCP_INVOICE_SELECT = "io.id, io.document_number, io.type, io.mode, io.external_provider, io.external_id, io.client_id, io.lead_id, io.client_name, io.title,
        io.subtotal, io.vat_amount, io.total_price, io.currency, io.status, io.status_changed_at, io.issued_at, io.valid_until, io.due_date, io.created_by,
        fr.status AS fr_status, fr.amount_planned AS fr_planned, fr.amount_real AS fr_real, fr.paid_date AS fr_paid_date, fr.project_id AS fr_project_id,
        UNIX_TIMESTAMP(io.created_at) AS created_at__ts, UNIX_TIMESTAMP(io.updated_at) AS updated_at__ts";

/** The list_invoices row: the columns it always had, plus the payment state, status_changed_at and the moments. */
function mcp_invoice_list_row(array $d, string $today): array {
    $pay = mcp_invoice_doc_row($d, $today);
    $row = [
        'id' => $d['id'], 'document_number' => $d['document_number'], 'type' => $d['type'], 'mode' => $d['mode'],
        'client_id' => $d['client_id'], 'lead_id' => $d['lead_id'], 'client_name' => $d['client_name'], 'title' => $d['title'],
        'subtotal' => $d['subtotal'], 'vat_amount' => $d['vat_amount'], 'total_price' => $d['total_price'], 'currency' => $d['currency'],
        'status' => $d['status'], 'status_changed_at' => $d['status_changed_at'],
        'issued_at' => $d['issued_at'], 'valid_until' => $d['valid_until'], 'due_date' => $d['due_date'], 'created_by' => $d['created_by'],
        'payment_status' => $pay['payment_status'], 'paid' => $pay['paid'], 'open' => $pay['open'], 'paid_date' => $pay['paid_date'],
        'project_id' => $pay['project_id'],
        'created_at__ts' => $d['created_at__ts'], 'updated_at__ts' => $d['updated_at__ts'], 'last_activity_at__ts' => $d['last_activity_at__ts'],
    ];
    return mcp_row_moments($row);
}

function mcp_list_invoices(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    foreach (['type', 'status'] as $k) {
        if (!empty($args[$k])) { $where[] = "io.$k = ?"; $params[] = $args[$k]; }
    }
    if (!empty($args['client_id'])) {
        $where[] = '(io.client_id = ? OR io.lead_id = ?)';
        array_push($params, $args['client_id'], $args['client_id']);
    }
    if (!empty($args['search'])) {
        $term = '%' . $args['search'] . '%';
        $where[] = '(io.document_number LIKE ? OR io.client_name LIKE ? OR io.title LIKE ?)';
        array_push($params, $term, $term, $term);
    }
    $win = mcp_list_window($args, MCP_INVOICE_WINDOW);
    [$issWhere, $issParams] = mcp_date_range($args, 'issued', 'io.issued_at');
    [$dueWhere, $dueParams] = mcp_date_range($args, 'due', 'io.due_date');
    $where = array_merge($where, $win['where'], $issWhere, $dueWhere);
    $params = array_merge($params, $win['params'], $issParams, $dueParams);
    $actFrom = mcp_optional_moment($args, 'activity_from', false);
    $actTo = mcp_optional_moment($args, 'activity_to', true);
    if ($actFrom !== null) { $where[] = MCP_INVOICE_ACTIVITY . ' >= ?'; $params[] = $actFrom; }
    if ($actTo !== null) { $where[] = MCP_INVOICE_ACTIVITY . ' < ?'; $params[] = $actTo; }
    $payment = mcp_enum($args, 'payment_status', ['paid', 'partially_paid', 'unpaid', 'overdue', 'planned', 'cancelled']);

    $base = 'SELECT ' . MCP_INVOICE_SELECT . ', ' . MCP_INVOICE_ACTIVITY . ' AS last_activity_at__ts FROM ' . MCP_INVOICE_FROM
        . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY ' . $win['order'];
    $today = mcp_today();

    if ($payment === null) {
        $stmt = $pdo->prepare("$base LIMIT {$win['limit']} OFFSET {$win['offset']}");
        $stmt->execute($params);
        return array_map(fn($d) => mcp_invoice_list_row($d, $today), $stmt->fetchAll(\PDO::FETCH_ASSOC));
    }

    // The payment state is derived in PHP (mcp_payment_status, one rule for every tool), so it cannot
    // be filtered in SQL without writing the rule twice: scan the filtered, ordered rows in chunks.
    $out = [];
    $skip = $win['offset'];
    $chunk = 200;
    for ($at = 0; count($out) < $win['limit']; $at += $chunk) {
        $stmt = $pdo->prepare("$base LIMIT $chunk OFFSET $at");
        $stmt->execute($params);
        $batch = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($batch as $d) {
            if (mcp_invoice_doc_row($d, $today)['payment_status'] !== $payment) continue;
            if ($skip > 0) { $skip--; continue; }
            $out[] = mcp_invoice_list_row($d, $today);
            if (count($out) >= $win['limit']) break;
        }
        if (count($batch) < $chunk) break;
    }
    return $out;
}

function mcp_get_invoice(\PDO $pdo, array $user, array $args): array {
    $stmt = $pdo->prepare(
        'SELECT io.*, fr.status AS fr_status, fr.amount_planned AS fr_planned, fr.amount_real AS fr_real, fr.paid_date AS fr_paid_date, fr.project_id AS fr_project_id, '
        . mcp_moment_select('io.created_at', 'created_at') . ', ' . mcp_moment_select('io.updated_at', 'updated_at') . ', '
        . MCP_INVOICE_ACTIVITY . ' AS last_activity_at__ts FROM ' . MCP_INVOICE_FROM . ' WHERE io.id = ?'
    );
    $stmt->execute([$args['id']]);
    $inv = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$inv) {
        throw new \Exception('Invoice not found with ID: ' . $args['id']);
    }
    $pay = mcp_invoice_doc_row($inv, mcp_today());
    $inv = mcp_row_moments($inv);
    unset($inv['fr_status'], $inv['fr_planned'], $inv['fr_real'], $inv['fr_paid_date'], $inv['fr_project_id']);
    $inv += ['payment_status' => $pay['payment_status'], 'paid' => $pay['paid'], 'open' => $pay['open'], 'paid_date' => $pay['paid_date'], 'project_id' => $pay['project_id']];

    $itStmt = $pdo->prepare('SELECT * FROM invoice_offer_items WHERE invoice_offer_id = ?');
    $itStmt->execute([$args['id']]);
    $inv['items'] = $itStmt->fetchAll(\PDO::FETCH_ASSOC);
    return $inv;
}

// ============================================================================
// Expenses and ledger movements
// ============================================================================

function mcp_list_expenses(\PDO $pdo, array $user, array $args): array {
    // A recurring rule is not an expense of its own: its payments are stored rows.
    $where = ["type = 'expense'", 'is_recurring = 0'];
    $params = [];
    if (!empty($args['category_id'])) { $where[] = 'category_id = ?'; $params[] = $args['category_id']; }
    if (!empty($args['search'])) {
        $where[] = '(title LIKE ? OR description LIKE ?)';
        array_push($params, '%' . $args['search'] . '%', '%' . $args['search'] . '%');
    }
    $win = mcp_list_window($args, MCP_EXPENSE_WINDOW);
    // start_date / end_date are the long-standing names of the issue-date range; now validated.
    $start = mcp_optional_date($args, 'start_date');
    $end = mcp_optional_date($args, 'end_date');
    $issWhere = []; $issParams = [];
    if ($start !== null) { $issWhere[] = 'issue_date >= ?'; $issParams[] = $start; }
    if ($end !== null) { $issWhere[] = 'issue_date <= ?'; $issParams[] = $end; }
    if ($start !== null && $end !== null && $start > $end) throw new \InvalidArgumentException("'start_date' is after 'end_date'.");
    [$dueWhere, $dueParams] = mcp_date_range($args, 'due', 'due_date');
    $where = array_merge($where, $win['where'], $issWhere, $dueWhere);
    $params = array_merge($params, $win['params'], $issParams, $dueParams);

    $stmt = $pdo->prepare(
        'SELECT id, subtype, title, description, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, paid_date, project_id, client_id, created_by, '
        . mcp_moment_select('created_at', 'created_at') . ', ' . mcp_moment_select('updated_at', 'updated_at')
        . ' FROM financial_records WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']
    );
    $stmt->execute($params);
    $rows = array_map('mcp_row_moments', $stmt->fetchAll(\PDO::FETCH_ASSOC));
    if (!mcp_can('employees.salaries')) {
        $rows = array_map(fn($r) => ccrm_is_salary_finance_row($r) ? ccrm_anonymise_salary_finance_row($r) : $r, $rows);
    }
    return $rows;
}

/**
 * Overdue as mcp_payment_status derives it, for a one-off movement, in SQL: not paid, cancelled or planned,
 * and flagged overdue or due before $today. A partly paid movement whose paid part covers it is paid.
 * @return array{0: string, 1: array}
 */
function mcp_overdue_movement_sql(string $today): array {
    return [
        "(is_recurring = 0 AND status NOT IN ('paid', 'cancelled', 'planned')
          AND (status = 'overdue' OR (due_date IS NOT NULL AND due_date < ?))
          AND (status <> 'partially_paid' OR (amount_planned <> 0 AND amount_real < amount_planned)))",
        [$today],
    ];
}

function mcp_list_financial_movements(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    $today = mcp_today();
    $type = mcp_enum($args, 'type', ['income', 'expense']);
    if ($type !== null) { $where[] = '`type` = ?'; $params[] = $type; }
    $status = mcp_enum($args, 'status', ['planned', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled']);
    if ($status === 'overdue') {
        [$ow, $op] = mcp_overdue_movement_sql($today);
        $where[] = $ow;
        $params = array_merge($params, $op);
    } elseif ($status !== null) {
        $where[] = '`status` = ?';
        $params[] = $status;
    }
    foreach (['category_id', 'project_id', 'client_id'] as $k) {
        if (!empty($args[$k])) { $where[] = "`$k` = ?"; $params[] = (string)$args[$k]; }
    }
    if (isset($args['recurring'])) $where[] = !empty($args['recurring']) ? 'is_recurring = 1' : 'is_recurring = 0';
    $from = mcp_optional_date($args, 'from');
    $to = mcp_optional_date($args, 'to');
    $dateExpr = 'COALESCE(paid_date, due_date, issue_date)';
    if ($from) { $where[] = "$dateExpr >= ?"; $params[] = $from; }
    if ($to) { $where[] = "$dateExpr <= ?"; $params[] = $to; }
    if (!empty($args['search'])) {
        $t = '%' . $args['search'] . '%';
        $where[] = '(title LIKE ? OR description LIKE ? OR invoice_number LIKE ?)';
        array_push($params, $t, $t, $t);
    }
    $win = mcp_list_window($args, MCP_MOVEMENT_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    foreach (['due' => 'due_date', 'paid' => 'paid_date', 'issue' => 'issue_date'] as $field => $col) {
        [$rw, $rp] = mcp_date_range($args, $field, $col);
        $where = array_merge($where, $rw);
        $params = array_merge($params, $rp);
    }

    $stmt = $pdo->prepare(
        'SELECT *, ' . mcp_moment_select('created_at', 'created_at') . ', ' . mcp_moment_select('updated_at', 'updated_at')
        . ' FROM financial_records WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']
    );
    $stmt->execute($params);
    return array_map(function ($raw) use ($today) {
        $r = mcp_fin_record($raw);
        // A recurring rule is listed, but it is not money of its own: its payments are stored rows.
        [$real, $est] = mcp_fin_movement_split($r);
        return [
            'id' => $r['id'], 'type' => $r['type'], 'subtype' => $r['subtype'], 'title' => $r['title'],
            'status' => $r['status'], 'category_id' => $r['categoryId'], 'project_id' => $r['projectId'], 'client_id' => $r['clientId'],
            'invoice_number' => $r['invoiceNumber'], 'currency' => $r['currency'],
            'amount_planned' => $r['amountPlanned'], 'amount_real' => $r['amountReal'],
            'settled' => mcp_round2($real), 'expected' => mcp_round2($est),
            'payment_status' => $r['isRecurring'] ? null : mcp_payment_status((string)$r['status'], $real, $est, $r['dueDate'], $today),
            'filed_on' => mcp_fin_date($r), 'issue_date' => $r['issueDate'], 'due_date' => $r['dueDate'], 'paid_date' => $r['paidDate'],
            'is_recurring' => $r['isRecurring'], 'recurring_frequency' => $r['recurringFrequency'],
            'created_at' => mcp_format_moment($raw['created_at__ts']), 'updated_at' => mcp_format_moment($raw['updated_at__ts']),
        ];
    }, $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

/**
 * The part of the cash-flow forecast the months leave out. $past: one-off movements the forecast
 * would list (unpaid, still expected) but whose date (due date, else issue date) is today or earlier:
 * [['date', 'type', 'amount', 'source', 'rec' => movement], ...].
 *
 * overdue      issued and unpaid, dated before today (planned ones are plans, not requests for money)
 * planned_past planned, dated before today
 * due_today    anything unpaid dated today: not overdue yet, but not in the months either
 */
function mcp_forecast_overdue_block(array $past, string $today, int $cap = 100): array {
    $sum = fn() => ['income' => 0.0, 'expense' => 0.0];
    $overdue = $sum(); $planned = $sum(); $dueToday = $sum();
    $counts = ['overdue' => 0, 'planned_past' => 0, 'due_today' => 0];
    $items = [];
    foreach ($past as $m) {
        if ($m['date'] === $today) { $dueToday[$m['type']] += $m['amount']; $counts['due_today']++; continue; }
        if ($m['rec']['status'] === 'planned') { $planned[$m['type']] += $m['amount']; $counts['planned_past']++; continue; }
        $overdue[$m['type']] += $m['amount']; $counts['overdue']++;
        $items[] = $m;
    }
    usort($items, fn($a, $b) => [$a['date'], $a['rec']['title'], $a['rec']['id']] <=> [$b['date'], $b['rec']['title'], $b['rec']['id']]);
    $totals = fn(array $s) => ['income' => mcp_round2($s['income']), 'expense' => mcp_round2($s['expense']), 'net' => mcp_round2($s['income'] - $s['expense'])];
    $todayTs = strtotime($today);
    return [
        'as_of' => $today,
        'count' => $counts['overdue'],
        'totals' => $totals($overdue),
        'items' => array_map(fn($m) => [
            'date' => $m['date'], 'due_date' => $m['rec']['dueDate'], 'type' => $m['type'], 'amount' => mcp_round2($m['amount']),
            'title' => $m['rec']['title'], 'record_id' => $m['rec']['id'], 'invoice_number' => $m['rec']['invoiceNumber'],
            'status' => $m['rec']['status'], 'client_id' => $m['rec']['clientId'], 'project_id' => $m['rec']['projectId'],
            'days_overdue' => (int)round(($todayTs - strtotime($m['date'])) / 86400),
        ], array_slice($items, 0, $cap)),
        'truncated' => count($items) > $cap,
        'planned_past' => ['count' => $counts['planned_past']] + $totals($planned),
        'due_today' => ['count' => $counts['due_today']] + $totals($dueToday),
        'basis' => 'Unpaid, issued movements (pending, partially paid, flagged overdue) dated before ' . $today . ': due date, else issue date. Amounts are what is still expected. Recurring rules and their schedule are not included.',
    ];
}

/** system_settings.updated_at of one setting as an ISO moment, or null when the setting was never stored. */
function mcp_setting_moment(\PDO $pdo, string $key): ?string {
    $stmt = $pdo->prepare('SELECT ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM `system_settings` WHERE `key` = ?');
    $stmt->execute([$key]);
    $ts = $stmt->fetchColumn();
    return $ts === false ? null : mcp_format_moment($ts);
}
