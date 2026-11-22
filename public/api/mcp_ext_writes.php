<?php
/**
 * CCRM MCP gateway — write paths rebuilt to follow the app's own rules (audit Part B, F3/F4/F8).
 *
 * Required by mcp.php; the tool switch there delegates to these functions. Each one validates its
 * input, writes related rows in one transaction, and mirrors what the browser does:
 *
 *   invoices        src/utils/invoiceFinanceBridge.ts, documentNumbering.ts, PriceOffersView.calculatedTotals
 *   stock           src/utils/warehousePricing.ts, WarehouseView purchase/sale handlers
 *   payroll         sync.php "Synchronize Employee Salaries & Auto-Expense Linkage"
 *   projects        src/utils/projects.ts finishedAtForStatus
 *   leads / tasks   LeadsDatagrid.handleUpdateLeadState, TaskDashboardView completion stamps
 *
 * Money-moving rules (decision D2): invoices are created as drafts and can only be sent or
 * cancelled, expenses are recorded as planned/pending, and nothing here marks money as received.
 * Settling money stays a decision made in the app.
 */

// ccrm_column_exists(), and the payroll definitions (due, status, period key) shared with sync.php
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/payroll_lib.php';

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function mcp_user_exists(\PDO $pdo, string $name): string {
    $stmt = $pdo->prepare("SELECT name FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1");
    $stmt->execute([$name]);
    $canon = $stmt->fetchColumn();
    if (!$canon) throw new \InvalidArgumentException("'{$name}' is not a registered user.");
    return (string)$canon;
}

function mcp_row_exists(\PDO $pdo, string $table, string $id, string $label): void {
    static $allowed = [
        'leads', 'projects', 'tasks', 'warehouses', 'warehouse_items', 'warehouse_movements',
        'employees', 'employee_vacations', 'financial_categories', 'financial_records',
        'project_types', 'client_categories', 'offer_categories', 'meeting_notes', 'suppliers',
        'tickets', 'orders', 'invoices_offers', 'support_contracts', 'workflows',
        'agency_workers', 'agency_workplaces', 'newsletter_campaigns', 'unified_entries',
        'custom_dashboards', 'time_entries', 'weekly_plan_cards',
    ];
    if (!in_array($table, $allowed, true)) throw new \LogicException('table not allowed');
    $stmt = $pdo->prepare("SELECT 1 FROM `{$table}` WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    if (!$stmt->fetchColumn()) throw new \InvalidArgumentException("{$label} not found: {$id}");
}

/** Next "PREFIX-YYYY-NNNN" from the highest number already on file (nextDocumentNumber). */
function mcp_next_document_number(\PDO $pdo, string $table, string $column, string $prefix, int $year, int $pad): string {
    static $tables = ['invoices_offers' => 'document_number', 'warehouse_movements' => 'document_number'];
    if (($tables[$table] ?? null) !== $column) throw new \LogicException('table not allowed');
    $head = "{$prefix}-{$year}-";
    $stmt = $pdo->prepare("SELECT `{$column}` FROM `{$table}` WHERE `{$column}` LIKE ?");
    $stmt->execute([$head . '%']);
    $highest = 0;
    foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $no) {
        $seq = (int)substr((string)$no, strlen($head));
        if ($seq > $highest) $highest = $seq;
    }
    return $head . str_pad((string)($highest + 1), $pad, '0', STR_PAD_LEFT);
}

/** Run $fn holding a named MySQL lock so two callers cannot be handed the same document number. */
function mcp_with_lock(\PDO $pdo, string $name, callable $fn) {
    $got = $pdo->prepare("SELECT GET_LOCK(?, 10)");
    $got->execute([$name]);
    if ((int)$got->fetchColumn() !== 1) throw new \Exception('The system is busy numbering another document; please retry.');
    try {
        return $fn();
    } finally {
        $pdo->prepare("SELECT RELEASE_LOCK(?)")->execute([$name]);
    }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** Canonical configured status key, or an error naming the valid ones. */
function mcp_project_status_check(\PDO $pdo, string $status): string {
    foreach (ccrm_project_statuses($pdo) as $key) {
        if (strtolower($key) === strtolower($status)) return $key;
    }
    throw new \InvalidArgumentException("Unknown project status '{$status}'. Configured statuses: " . implode(', ', ccrm_project_statuses($pdo)) . '.');
}

/** finishedAtForStatus: a completed status stamps today, an open one clears the date, cancelled keeps it. */
function mcp_finished_at_for_status(\PDO $pdo, string $status, ?string $current): ?string {
    $group = ccrm_project_status_group($status, $pdo);
    $current = $current ? substr($current, 0, 10) : '';
    if ($group === 'completed') return $current !== '' ? $current : mcp_today();
    if ($group === 'cancelled') return $current !== '' ? $current : null;
    return null;
}

function mcp_create_project_row(\PDO $pdo, array $a): string {
    $name = trim((string)($a['name'] ?? ''));
    if ($name === '') throw new \InvalidArgumentException("'name' is required.");
    $clientId = !empty($a['client_id']) ? (string)$a['client_id'] : null;
    if ($clientId !== null) mcp_row_exists($pdo, 'leads', $clientId, 'Client/lead');
    $status = isset($a['status']) && $a['status'] !== '' ? mcp_project_status_check($pdo, (string)$a['status']) : ccrm_default_project_status($pdo);
    $budget = mcp_number($a, 'budget', false, 0);
    $value = mcp_number($a, 'value', false, 0);
    $start = mcp_optional_date($a, 'start_date') ?? mcp_today();
    $invoiceDate = mcp_optional_date($a, 'invoice_date');
    $completionDeadline = mcp_optional_date($a, 'completion_deadline');
    if ($completionDeadline !== null && $completionDeadline < $start) throw new \InvalidArgumentException("'completion_deadline' cannot be before 'start_date'.");

    if (!empty($a['project_type_id'])) {
        mcp_row_exists($pdo, 'project_types', (string)$a['project_type_id'], 'Project type');
        $typeId = (string)$a['project_type_id'];
    } else {
        $typeId = $pdo->query("SELECT id FROM project_types LIMIT 1")->fetchColumn();
        if (!$typeId) throw new \Exception('No project type is configured; create one in Settings first.');
    }

    $division = isset($a['division']) && trim((string)$a['division']) !== '' ? mb_substr(trim((string)$a['division']), 0, 100) : null;
    $contactPhone = isset($a['contact_phone']) ? trim((string)preg_replace('/[\x00-\x1F\x7F]/u', '', (string)$a['contact_phone'])) : '';
    $contactPhone = $contactPhone === '' ? null : mb_substr($contactPhone, 0, 50);

    $id = 'proj_' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO projects (id, project_type_id, name, lead_id, client_id, budget, value, division, contact_phone, start_date, invoice_date, completion_deadline, status, finished_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())"
    )->execute([$id, $typeId, $name, $clientId, $clientId, $budget, $value, $division, $contactPhone, $start, $invoiceDate, $completionDeadline, $status, mcp_finished_at_for_status($pdo, $status, null)]);
    if (!empty($a['managers']) && is_array($a['managers']) && function_exists('mcp_crm_plus_sync_project_managers')) {
        mcp_crm_plus_sync_project_managers($pdo, $id, $a['managers']);
    }
    if (!empty($a['custom_fields']) && is_array($a['custom_fields']) && function_exists('mcp_crm_plus_upsert_project_data')) {
        mcp_crm_plus_upsert_project_data($pdo, $typeId, $id, $a['custom_fields']);
    }
    return $id;
}

function mcp_do_update_project(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $cur = $pdo->prepare("SELECT project_type_id, status, finished_at, start_date, completion_deadline FROM projects WHERE id = ?");
    $cur->execute([$id]);
    $row = $cur->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \Exception("Project not found with ID: {$id}");

    $sets = []; $params = [];
    $add = function (string $col, $val) use (&$sets, &$params) { $sets[] = "`{$col}` = ?"; $params[] = $val; };

    if (array_key_exists('name', $args)) {
        $n = trim((string)$args['name']);
        if ($n === '') throw new \InvalidArgumentException("'name' cannot be empty.");
        $add('name', $n);
    }
    if (array_key_exists('status', $args)) {
        $status = mcp_project_status_check($pdo, mcp_require_string($args, 'status'));
        $add('status', $status);
        $add('finished_at', mcp_finished_at_for_status($pdo, $status, $row['finished_at']));
    }
    foreach (['budget', 'value'] as $f) {
        if (array_key_exists($f, $args)) $add($f, $args[$f] === null || $args[$f] === '' ? null : mcp_number($args, $f, true, 0));
    }
    foreach (['start_date', 'invoice_date', 'completion_deadline'] as $f) {
        if (array_key_exists($f, $args)) $add($f, $args[$f] === null || $args[$f] === '' ? null : mcp_require_date($args, $f));
    }
    $start = array_key_exists('start_date', $args) ? ($args['start_date'] ?: null) : $row['start_date'];
    $deadline = array_key_exists('completion_deadline', $args) ? ($args['completion_deadline'] ?: null) : $row['completion_deadline'];
    if ($start && $deadline && $deadline < $start) throw new \InvalidArgumentException("'completion_deadline' cannot be before 'start_date'.");
    if (array_key_exists('delay_reason', $args)) {
        $r = trim((string)$args['delay_reason']);
        if (mb_strlen($r) > 500) throw new \InvalidArgumentException("'delay_reason' is limited to 500 characters.");
        $add('delay_reason', $r === '' ? null : $r);
    }
    if (array_key_exists('rating', $args)) $add('rating', (int)mcp_number($args, 'rating', true, 0, 5));
    if (array_key_exists('division', $args)) {
        $d = trim((string)$args['division']);
        $add('division', $d === '' ? null : mb_substr($d, 0, 100));
    }
    if (array_key_exists('contact_phone', $args)) {
        $cp = trim((string)preg_replace('/[\x00-\x1F\x7F]/u', '', (string)$args['contact_phone']));
        $add('contact_phone', $cp === '' ? null : mb_substr($cp, 0, 50));
    }
    if (array_key_exists('archived', $args)) $add('archived', !empty($args['archived']) ? 1 : 0);

    $extraTouched = false;
    if (array_key_exists('managers', $args) && is_array($args['managers']) && function_exists('mcp_crm_plus_sync_project_managers')) {
        mcp_crm_plus_sync_project_managers($pdo, $id, $args['managers']);
        $extraTouched = true;
    }
    if (array_key_exists('custom_fields', $args) && is_array($args['custom_fields']) && function_exists('mcp_crm_plus_upsert_project_data')) {
        mcp_crm_plus_upsert_project_data($pdo, (string)$row['project_type_id'], $id, $args['custom_fields']);
        $extraTouched = true;
    }

    if (!$sets && !$extraTouched) return ['success' => true, 'message' => 'No fields updated'];
    if ($sets) {
        $params[] = $id;
        $pdo->prepare("UPDATE projects SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    } elseif ($extraTouched) {
        $pdo->prepare("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$id]);
    }
    mcp_audit($pdo, $user, 'project_update', "Updated project $id");
    return ['success' => true, 'id' => $id, 'updated_fields' => array_values(array_intersect(array_keys($args), ['name', 'status', 'budget', 'value', 'start_date', 'invoice_date', 'completion_deadline', 'delay_reason', 'rating', 'division', 'contact_phone', 'archived', 'managers', 'custom_fields']))];
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Canonical configured task state, or an error naming the valid ones. */
function mcp_task_state_check(\PDO $pdo, string $status): string {
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    if (!is_array($states) || !$states) return $status;
    foreach ($states as $s) { if (strtolower($s) === strtolower($status)) return $s; }
    if (strtolower($status) === 'done') return mcp_task_done_state($pdo);
    throw new \InvalidArgumentException("Unknown task status '{$status}'. Configured statuses: " . implode(', ', $states) . '.');
}

function mcp_task_done_state(\PDO $pdo): string {
    require_once __DIR__ . '/task_done.php';
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    return ccrm_task_done_state(is_array($states) ? $states : []) ?? 'done';
}

function mcp_do_create_task(\PDO $pdo, array $user, array $args): array {
    $title = mcp_require_string($args, 'title');
    $deadline = mcp_require_date($args, 'deadline');
    $startDate = mcp_optional_date($args, 'start_date');
    if ($startDate !== null && $startDate > $deadline) throw new \InvalidArgumentException("'start_date' cannot be after 'deadline'.");
    $time = isset($args['deadline_time']) && $args['deadline_time'] !== '' ? (string)$args['deadline_time'] : null;
    if ($time !== null && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) throw new \InvalidArgumentException("'deadline_time' must be HH:MM.");
    $priority = mcp_enum($args, 'priority', ['low', 'medium', 'high'], 'medium');
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    $status = isset($args['status']) && $args['status'] !== '' ? mcp_task_state_check($pdo, (string)$args['status']) : ((is_array($states) && $states) ? (string)$states[0] : 'todo');
    $owner = isset($args['owner']) && $args['owner'] !== '' ? mcp_user_exists($pdo, (string)$args['owner']) : $user['name'];
    $projId = !empty($args['project_id']) ? (string)$args['project_id'] : null;
    $leadId = !empty($args['client_id']) ? (string)$args['client_id'] : null;
    $agencyWorkerId = !empty($args['related_agency_worker_id']) ? (string)$args['related_agency_worker_id'] : null;
    $ticketId = !empty($args['ticket_id']) ? (string)$args['ticket_id'] : null;
    $isLocking = !empty($args['is_locking']) ? 1 : 0;
    $requiresConclusion = !empty($args['requires_conclusion']) ? 1 : 0;
    if ($projId !== null) mcp_row_exists($pdo, 'projects', $projId, 'Project');
    if ($leadId !== null) mcp_row_exists($pdo, 'leads', $leadId, 'Client/lead');
    if ($agencyWorkerId !== null) mcp_row_exists($pdo, 'agency_workers', $agencyWorkerId, 'Agency worker');
    if ($ticketId !== null) mcp_row_exists($pdo, 'tickets', $ticketId, 'Ticket');
    $assignees = [$owner];
    if (is_array($args['assignees'] ?? null)) {
        foreach ($args['assignees'] as $a) { if (trim((string)$a) !== '') $assignees[] = mcp_user_exists($pdo, (string)$a); }
    }

    $id = 'tsk_' . bin2hex(random_bytes(8));
    mcp_tx($pdo, function () use ($pdo, $id, $title, $args, $priority, $startDate, $deadline, $time, $status, $owner, $user, $projId, $leadId, $agencyWorkerId, $ticketId, $isLocking, $requiresConclusion, $assignees) {
        $pdo->prepare(
            "INSERT INTO tasks (id, title, description, priority, start_date, deadline, deadline_time, status, owner, created_by, related_project_id, related_lead_id, related_agency_worker_id, is_locking, requires_conclusion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" /* recurring-template: mcp creates normal tasks */
        )->execute([$id, $title, $args['description'] ?? null, $priority, $startDate, $deadline, $time, $status, $owner, $user['name'], $projId, $leadId, $agencyWorkerId, $isLocking, $requiresConclusion]);
        $ins = $pdo->prepare("INSERT IGNORE INTO task_assignees (task_id, user_name) VALUES (?, ?)");
        foreach (array_unique($assignees) as $a) $ins->execute([$id, $a]);
        if (!empty($args['tags']) && is_array($args['tags'])) {
            $insTag = $pdo->prepare("INSERT IGNORE INTO tags (name) VALUES (?)");
            $insLink = $pdo->prepare("INSERT IGNORE INTO task_tags (task_id, tag_name) VALUES (?, ?)");
            foreach ($args['tags'] as $tg) {
                $tg = trim((string)$tg);
                if ($tg !== '') { $insTag->execute([$tg]); $insLink->execute([$id, $tg]); }
            }
        }
        if ($ticketId !== null) {
            $pdo->prepare("INSERT IGNORE INTO ticket_task_links (ticket_id, task_id, sync_mode) VALUES (?, ?, 'auto_resolve')")
                ->execute([$ticketId, $id]);
        }
        if ($isLocking && $projId !== null) {
            $pdo->prepare("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$projId]);
        }
    });
    mcp_audit($pdo, $user, 'task_create', "Created task '$title' (ID: $id, deadline: $deadline)");
    // After the commit, so a rolled-back create never mails anyone.
    require_once __DIR__ . '/task_reminders.php';
    ccrm_notify_new_task_assignees($pdo, $id, $user['name']);
    return ['success' => true, 'id' => $id, 'title' => $title, 'status' => $status, 'deadline' => $deadline, 'assignees' => array_values(array_unique($assignees))];
}

/**
 * A task flagged "Requires conclusion" cannot be finished without one, whether
 * the conclusion is already stored or comes with this call. Same rule as the
 * app (src/utils/taskConclusion.ts) and the sync endpoint.
 */
function mcp_require_conclusion_to_finish(array $row, $incoming): void {
    if ((int)($row['requires_conclusion'] ?? 0) !== 1) return;
    if (trim((string)($row['conclusion'] ?? '')) !== '' || trim((string)$incoming) !== '') return;
    throw new \InvalidArgumentException("This task requires a conclusion before it can be completed. Pass 'conclusion' with a short note on how it was finished.");
}

function mcp_do_update_task(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $chkKind = $pdo->prepare("SELECT task_kind FROM tasks WHERE id = ? LIMIT 1"); /* recurring-template: template refusal */
    $chkKind->execute([$id]);
    if ($chkKind->fetchColumn() === 'recurring') {
        throw new \InvalidArgumentException("Recurring task templates cannot be updated through MCP: {$id}");
    }
    // Same visibility rule as the read tools: a caller without tasks.view_all may
    // only touch their own, created and assigned tasks (judged on the stored row,
    // like sync.php's visibleTaskIds check).
    [$scopeSql, $scopeParams] = mcp_task_scope($user);
    $cur = $pdo->prepare("SELECT status, completed_at, requires_conclusion, conclusion FROM tasks WHERE id = ? AND " . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : ''));
    $cur->execute(array_merge([$id], $scopeParams));
    $row = $cur->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \Exception("Task not found with ID: {$id}");

    $sets = []; $params = []; $newOwner = null; $becameDone = false;
    $add = function (string $col, $val) use (&$sets, &$params) { $sets[] = "`{$col}` = ?"; $params[] = $val; };
    if (array_key_exists('title', $args)) $add('title', mcp_require_string($args, 'title'));
    if (array_key_exists('description', $args)) $add('description', $args['description']);
    if (array_key_exists('priority', $args)) $add('priority', mcp_enum($args, 'priority', ['low', 'medium', 'high']));
    if (array_key_exists('start_date', $args)) {
        $add('start_date', $args['start_date'] === null || $args['start_date'] === '' ? null : mcp_require_date($args, 'start_date'));
    }
    if (array_key_exists('deadline', $args)) $add('deadline', mcp_require_date($args, 'deadline'));
    if (array_key_exists('deadline_time', $args)) {
        $t = $args['deadline_time'] === null || $args['deadline_time'] === '' ? null : (string)$args['deadline_time'];
        if ($t !== null && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) throw new \InvalidArgumentException("'deadline_time' must be HH:MM.");
        $add('deadline_time', $t);
    }
    if (array_key_exists('status', $args)) {
        $status = mcp_task_state_check($pdo, mcp_require_string($args, 'status'));
        $add('status', $status);
        $wasDone = mcp_done_task_state((string)$row['status'], (array)mcp_config_json($pdo, 'TASK_STATES', []));
        $isDone = mcp_done_task_state($status, (array)mcp_config_json($pdo, 'TASK_STATES', []));
        if ($isDone && !$wasDone) {
            mcp_require_conclusion_to_finish($row, $args['conclusion'] ?? null);
            $add('completed_by', $user['name']); $add('completed_at', date('Y-m-d H:i'));
            $becameDone = true;
        }
        if (!$isDone && $wasDone) { $add('completed_by', null); $add('completed_at', null); }
    }
    if (array_key_exists('requires_conclusion', $args)) $add('requires_conclusion', !empty($args['requires_conclusion']) ? 1 : 0);
    if (array_key_exists('is_locking', $args)) $add('is_locking', !empty($args['is_locking']) ? 1 : 0);
    if (array_key_exists('conclusion', $args)) {
        $c = trim((string)$args['conclusion']);
        $add('conclusion', $c === '' ? null : mb_substr($c, 0, 5000));
    }
    if (array_key_exists('owner', $args)) { $newOwner = mcp_user_exists($pdo, mcp_require_string($args, 'owner')); $add('owner', $newOwner); }
    foreach (['related_project_id' => 'project_id', 'related_lead_id' => 'client_id', 'related_agency_worker_id' => 'related_agency_worker_id'] as $col => $arg) {
        foreach ($col === $arg ? [$col] : [$col, $arg] as $k) {
            if (array_key_exists($k, $args)) {
                $v = $args[$k] === null || $args[$k] === '' ? null : (string)$args[$k];
                if ($v !== null) {
                    $refTable = $col === 'related_project_id' ? 'projects' : ($col === 'related_agency_worker_id' ? 'agency_workers' : 'leads');
                    mcp_row_exists($pdo, $refTable, $v, 'Linked record');
                }
                $add($col, $v);
                break;
            }
        }
    }
    // Archive instead of delete: MCP never deletes rows; list_tasks hides archived tasks by default.
    if (array_key_exists('archived', $args)) {
        $arch = filter_var($args['archived'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($arch === null) throw new \InvalidArgumentException("'archived' must be true or false.");
        $add('archived', $arch ? 1 : 0);
    }
    $ticketId = array_key_exists('ticket_id', $args) ? trim((string)$args['ticket_id']) : null;
    if ($ticketId !== null && $ticketId !== '') mcp_row_exists($pdo, 'tickets', $ticketId, 'Ticket');
    $hasTags = !empty($args['tags']) && is_array($args['tags']);
    if (!$sets && $ticketId === null && !$hasTags) return ['success' => true, 'message' => 'No fields updated'];
    $params[] = $id;
    mcp_tx($pdo, function () use ($pdo, $sets, $params, $id, $newOwner, $becameDone, $ticketId, $args, $hasTags) {
        if ($sets) {
            $pdo->prepare("UPDATE tasks SET " . implode(', ', $sets) . " WHERE id = ? AND " . ccrm_sql_real_tasks())->execute($params);
        }
        // The assignee list is the visibility rule, so a new owner must be on it.
        if ($newOwner !== null) $pdo->prepare("INSERT IGNORE INTO task_assignees (task_id, user_name) VALUES (?, ?)")->execute([$id, $newOwner]);
        if ($hasTags) {
            $insTag = $pdo->prepare("INSERT IGNORE INTO tags (name) VALUES (?)");
            $insLink = $pdo->prepare("INSERT IGNORE INTO task_tags (task_id, tag_name) VALUES (?, ?)");
            foreach ($args['tags'] as $tg) {
                $tg = trim((string)$tg);
                if ($tg !== '') { $insTag->execute([$tg]); $insLink->execute([$id, $tg]); }
            }
        }
        if ($ticketId !== null && $ticketId !== '') {
            $pdo->prepare("INSERT IGNORE INTO ticket_task_links (ticket_id, task_id, sync_mode) VALUES (?, ?, 'auto_resolve')")
                ->execute([$ticketId, $id]);
        }
        if (function_exists('mcp_crm_plus_bump_locking_projects')) mcp_crm_plus_bump_locking_projects($pdo, $id);
        if ($becameDone && function_exists('mcp_crm_plus_resolve_linked_tickets')) mcp_crm_plus_resolve_linked_tickets($pdo, $id);
    });
    mcp_audit($pdo, $user, 'task_update', "Updated task $id");
    return ['success' => true, 'id' => $id];
}

function mcp_do_complete_task(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $chkKind = $pdo->prepare("SELECT task_kind FROM tasks WHERE id = ? LIMIT 1"); /* recurring-template: template refusal */
    $chkKind->execute([$id]);
    if ($chkKind->fetchColumn() === 'recurring') {
        throw new \InvalidArgumentException("Recurring task templates cannot be completed through MCP: {$id}");
    }
    $done = mcp_task_done_state($pdo);
    // Judged on the stored row, like sync.php: without tasks.view_all only the
    // caller's own, created and assigned tasks may be completed.
    [$scopeSql, $scopeParams] = mcp_task_scope($user);
    $chk = $pdo->prepare("SELECT requires_conclusion, conclusion FROM tasks WHERE id = ? AND " . ccrm_sql_real_tasks() . ($scopeSql !== '' ? " AND $scopeSql" : ''));
    $chk->execute(array_merge([$id], $scopeParams));
    $row = $chk->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \Exception("Task not found with ID: {$id}");
    // `note` is the older name of the same field.
    $conclusion = trim((string)($args['conclusion'] ?? $args['note'] ?? ''));
    mcp_require_conclusion_to_finish($row, $conclusion);
    $stmt = $pdo->prepare("UPDATE tasks SET status = ?, completed_by = ?, completed_at = ?, conclusion = COALESCE(?, conclusion) WHERE id = ? AND " . ccrm_sql_real_tasks());
    $stmt->execute([$done, $user['name'], date('Y-m-d H:i'), $conclusion === '' ? null : mb_substr($conclusion, 0, 5000), $id]);
    if (function_exists('mcp_crm_plus_bump_locking_projects')) mcp_crm_plus_bump_locking_projects($pdo, $id);
    if (function_exists('mcp_crm_plus_resolve_linked_tickets')) mcp_crm_plus_resolve_linked_tickets($pdo, $id);
    mcp_audit($pdo, $user, 'task_complete', "Marked task $id as done");
    return ['success' => true, 'id' => $id, 'status' => $done, 'completed_by' => $user['name']];
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function mcp_do_list_clients(\PDO $pdo, array $args): array {
    $profiles = mcp_client_profiles($pdo, ['include_archived' => !empty($args['include_archived'])]);
    $term = isset($args['search']) ? strtolower(trim((string)$args['search'])) : '';
    // A profile's updated_at is the newest of its records (mcp_client_profiles): the window applies to that moment.
    $from = mcp_optional_moment($args, 'updated_from', false);
    $to = mcp_optional_moment($args, 'updated_to', true);
    $out = [];
    foreach ($profiles as $p) {
        $ts = $p['updated_at__ts'] ?? null;
        if ($from !== null && ($ts === null || $ts < $from)) continue;
        if ($to !== null && ($ts === null || $ts >= $to)) continue;
        if (!empty($args['city']) && strtolower((string)$p['city']) !== strtolower((string)$args['city'])) continue;
        if (!empty($args['client_type']) && $p['client_type'] !== $args['client_type']) continue;
        if ($term !== '') {
            $hay = strtolower(implode(' ', [$p['name'], $p['email'], $p['phone'], $p['company_id']]));
            if (strpos($hay, $term) === false) continue;
        }
        unset($p['_leads']);
        $p['url'] = mcp_client_url($pdo, (string)$p['name']);
        $out[] = $p;
    }
    $sort = in_array($args['sort_by'] ?? '', ['name', 'created_at', 'value', 'updated_at'], true) ? $args['sort_by'] : 'name';
    $key = ['value' => 'total_value', 'updated_at' => 'updated_at__ts'][$sort] ?? $sort;
    // name, value and created_at ascend (oldest first, as list_clients always did); updated_at starts with the newest.
    $dir = $sort === 'updated_at' ? -1 : 1;
    $order = strtolower((string)($args['sort_order'] ?? ''));
    if ($order === 'desc') $dir = -1; elseif ($order === 'asc') $dir = 1;
    // id breaks ties, so a row never moves between pages.
    usort($out, function ($a, $b) use ($key, $dir) {
        $c = ($key === 'total_value' || $key === 'updated_at__ts') ? ((float)($a[$key] ?? 0) <=> (float)($b[$key] ?? 0)) : strcasecmp((string)$a[$key], (string)$b[$key]);
        return $c !== 0 ? $dir * $c : strcmp((string)$a['id'], (string)$b['id']);
    });
    $page = array_slice($out, max(0, (int)($args['offset'] ?? 0)), mcp_limit($args));
    return array_map('mcp_row_moments', mcp_profiles_activity($pdo, $page));
}

function mcp_do_create_client(\PDO $pdo, array $user, array $args): array {
    $name = mcp_require_string($args, 'name');
    $dup = $pdo->prepare("SELECT id FROM leads WHERE id LIKE 'client-%' AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1");
    $dup->execute([$name]);
    if ($existing = $dup->fetchColumn()) throw new \Exception("A client named '{$name}' already exists ({$existing}).");

    $owner = !empty($args['owner']) ? mcp_user_exists($pdo, (string)$args['owner']) : $user['name'];
    $clientCategoryId = !empty($args['client_category_id']) ? trim((string)$args['client_category_id']) : null;
    if ($clientCategoryId !== null) mcp_row_exists($pdo, 'client_categories', $clientCategoryId, 'Client category');
    $companyClientId = !empty($args['company_client_id']) ? trim((string)$args['company_client_id']) : null;
    if ($companyClientId !== null) mcp_row_exists($pdo, 'leads', $companyClientId, 'Company client');

    $first = array_key_exists('contact_first_name', $args) ? (trim((string)$args['contact_first_name']) ?: null) : null;
    $last = array_key_exists('contact_last_name', $args) ? (trim((string)$args['contact_last_name']) ?: null) : null;
    $contactPerson = $args['contact_person'] ?? (($first !== null || $last !== null) ? trim(($first ?? '') . ' ' . ($last ?? '')) : null);
    $ticketEmails = null;
    if (array_key_exists('ticket_allowed_emails', $args)) {
        $rawList = is_array($args['ticket_allowed_emails']) ? $args['ticket_allowed_emails'] : [$args['ticket_allowed_emails']];
        $cleanList = array_values(array_filter(array_map(fn($x) => trim((string)$x), $rawList)));
        $ticketEmails = $cleanList ? json_encode($cleanList, JSON_UNESCAPED_UNICODE) : null;
    }
    $cfJson = null;
    if (!empty($args['custom_fields']) && is_array($args['custom_fields']) && function_exists('mcp_crm_plus_merge_lead_custom_fields')) {
        $mergedCf = mcp_crm_plus_merge_lead_custom_fields($pdo, $args['custom_fields'], []);
        $cfJson = $mergedCf ? json_encode($mergedCf, JSON_UNESCAPED_UNICODE) : null;
    }

    // Same record the Clients register creates: id client-*, an accepted (won) stage, a registration note.
    $id = 'client-' . (int)round(microtime(true) * 1000);
    $won = mcp_won_lead_state($pdo);
    mcp_tx($pdo, function () use ($pdo, $user, $args, $id, $name, $won, $owner, $clientCategoryId, $companyClientId, $first, $last, $contactPerson, $ticketEmails, $cfJson) {
        $pdo->prepare(
            "INSERT INTO leads (id, name, company_id, tax_id, vat_id, website, contact_person, contact_first_name, contact_last_name, email, phone, street, city, postal_code, country, interest_note, status, client_type, division, client_category_id, price_level_id, company_client_id, contact_role, ticket_allowed_emails, custom_fields_json, source, owner, value, adjustment, rating, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_assistant', ?, 0, ?, 5, ?)"
        )->execute([
            $id, $name, $args['company_id'] ?? null, $args['tax_id'] ?? null, $args['vat_id'] ?? null, $args['website'] ?? null,
            $contactPerson, $first, $last, $args['email'] ?? null, $args['phone'] ?? null,
            $args['street'] ?? null, $args['city'] ?? null, $args['postal_code'] ?? null, $args['country'] ?? 'Slovakia',
            $args['notes'] ?? null, $won, mcp_enum($args, 'client_type', ['business', 'person', 'partner'], 'business'),
            !empty($args['division']) ? trim((string)$args['division']) : null, $clientCategoryId,
            !empty($args['price_level_id']) ? trim((string)$args['price_level_id']) : null, $companyClientId,
            !empty($args['contact_role']) ? trim((string)$args['contact_role']) : null, $ticketEmails, $cfJson,
            $owner, (float)($args['adjustment'] ?? 0), date('Y-m-d'),
        ]);
        if ($first === null && $last === null) {
            ccrm_set_contact_parts_from_person($pdo, $id);
        }
        $pdo->prepare(
            "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
             VALUES (?, ?, 'note', ?, 'Client Registered', 'Client profile registered via MCP.', ?)"
        )->execute([mcp_new_id('ev_'), $id, mcp_now_local(), $user['name']]);
    });
    mcp_audit($pdo, $user, 'client_create', "Created client '$name' (IČO: " . ($args['company_id'] ?? '') . ", ID: $id)");
    return ['success' => true, 'id' => $id, 'name' => $name, 'company_id' => $args['company_id'] ?? null];
}

// ---------------------------------------------------------------------------
// Invoices  (invoiceFinanceBridge.ts, PriceOffersView.calculatedTotals)
// ---------------------------------------------------------------------------

/** The company's default VAT rate (Settings → Billing); nothing else from that setting is read. */
function mcp_default_vat_rate(\PDO $pdo): float {
    return ccrm_default_vat_rate($pdo);
}

/** Is an invoice's linked ledger movement settled (money recorded against it)? */
function mcp_movement_settled(array $rec): bool {
    return $rec['status'] === 'paid' || $rec['status'] === 'partially_paid' || (float)$rec['amountReal'] > 0;
}

function mcp_do_create_invoice(\PDO $pdo, array $user, array $args): array {
    $clientId = mcp_require_string($args, 'client_id');
    $title = mcp_require_string($args, 'title');
    $issuedAt = mcp_optional_date($args, 'issued_at') ?? mcp_today();
    $dueDate = mcp_optional_date($args, 'due_date') ?? mcp_iso_shift($issuedAt, 14);
    if ($dueDate < $issuedAt) throw new \InvalidArgumentException("'due_date' cannot be before 'issued_at'.");
    $currency = strtoupper(trim((string)($args['currency'] ?? mcp_currency($pdo))));
    if (!preg_match('/^[A-Z]{3}$/', $currency)) throw new \InvalidArgumentException("'currency' must be a 3-letter code.");
    $items = $args['items'] ?? null;
    if (!is_array($items) || !$items) throw new \InvalidArgumentException('Invoice must contain at least one line item.');
    if (count($items) > 200) throw new \InvalidArgumentException('An invoice can hold at most 200 line items.');

    $cl = $pdo->prepare("SELECT name, email, phone, street, city, postal_code, country, company_id, tax_id, vat_id FROM leads WHERE id = ?");
    $cl->execute([$clientId]);
    $client = $cl->fetch(\PDO::FETCH_ASSOC);
    if (!$client) throw new \InvalidArgumentException("Client not found: {$clientId}");

    // Line maths exactly as the Invoicing screen does: a line's total is net of discount, VAT is added per line.
    $defaultVat = mcp_default_vat_rate($pdo);
    $lines = []; $subtotal = 0.0; $vatTotal = 0.0;
    foreach ($items as $i => $item) {
        if (!is_array($item)) throw new \InvalidArgumentException('Each item must be an object.');
        $n = $i + 1;
        $name = trim((string)($item['title'] ?? $item['name'] ?? ''));
        if ($name === '') throw new \InvalidArgumentException("Item {$n}: 'title' is required.");
        $qty = mcp_number(['v' => $item['quantity'] ?? 1], 'v', true, 0.0001, 1000000);
        $price = mcp_number(['v' => $item['unit_price'] ?? null], 'v', true, 0, 100000000);
        $vat = mcp_number(['v' => $item['vat_rate'] ?? $defaultVat], 'v', true, 0, 100);
        $disc = mcp_number(['v' => $item['discount_pct'] ?? 0], 'v', true, 0, 100);
        $net = round($qty * $price * (1 - $disc / 100), 2);
        $lines[] = [
            'name' => $name,
            'description' => isset($item['description']) && trim((string)$item['description']) !== '' ? trim((string)$item['description']) : null,
            'unit' => isset($item['unit']) && trim((string)$item['unit']) !== '' ? mb_substr(trim((string)$item['unit']), 0, 20) : 'ks',
            'sku' => isset($item['sku']) && trim((string)$item['sku']) !== '' ? mb_substr(trim((string)$item['sku']), 0, 100) : null,
            'warehouse_item_id' => !empty($item['warehouse_item_id']) ? (string)$item['warehouse_item_id'] : null,
            'qty' => $qty, 'price' => $price, 'vat' => $vat, 'disc' => $disc, 'net' => $net,
        ];
        $subtotal += $net;
        $vatTotal += $net * ($vat / 100);
    }
    $subtotal = round($subtotal, 2); $vatTotal = round($vatTotal, 2); $total = round($subtotal + $vatTotal, 2);
    $projectId = !empty($args['project_id']) ? trim((string)$args['project_id']) : null;
    if ($projectId !== null) mcp_row_exists($pdo, 'projects', $projectId, 'Project');
    $notes = isset($args['notes']) && trim((string)$args['notes']) !== '' ? trim((string)$args['notes']) : null;

    $year = (int)substr($issuedAt, 0, 4);
    $invId = 'inv_' . bin2hex(random_bytes(8));

    $result = mcp_with_lock($pdo, 'ccrm_invoice_number', function () use ($pdo, $user, $args, $clientId, $client, $title, $notes, $projectId, $issuedAt, $dueDate, $currency, $lines, $subtotal, $vatTotal, $total, $year, $invId) {
        if (!empty($args['document_number'])) {
            $docNum = trim((string)$args['document_number']);
            $dup = $pdo->prepare("SELECT 1 FROM invoices_offers WHERE document_number = ? LIMIT 1");
            $dup->execute([$docNum]);
            if ($dup->fetchColumn()) throw new \InvalidArgumentException("Document number {$docNum} is already used.");
        } else {
            $docNum = mcp_next_document_number($pdo, 'invoices_offers', 'document_number', 'FA', $year, 3);
        }
        $clientName = $client['name'] ?: ('Client ' . $clientId);

        mcp_tx($pdo, function () use ($pdo, $user, $clientId, $client, $clientName, $title, $notes, $projectId, $docNum, $issuedAt, $dueDate, $currency, $lines, $subtotal, $vatTotal, $total, $invId) {
            $pdo->prepare(
                "INSERT INTO invoices_offers (id, document_number, type, mode, lead_id, client_id, client_name, client_email, client_phone, client_street, client_city, client_postal_code, client_country, client_ico, client_dic, client_icdph, title, subject, closing_note, subtotal, vat_amount, total_price, currency, status, status_changed_at, issued_at, due_date, created_by)
                 VALUES (?, ?, 'invoice', 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)"
            )->execute([
                $invId, $docNum, $clientId, $clientId, $clientName, $client['email'], $client['phone'], $client['street'], $client['city'],
                $client['postal_code'], $client['country'] ?: 'Slovakia', $client['company_id'], $client['tax_id'], $client['vat_id'],
                $title, $title, $notes, $subtotal, $vatTotal, $total, $currency, mcp_today(), $issuedAt, $dueDate, $user['name'],
            ]);
            $ins = $pdo->prepare(
                "INSERT INTO invoice_offer_items (id, invoice_offer_id, warehouse_item_id, sku, name, description, quantity, unit, unit_price, vat_rate, discount_pct, total_price)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            foreach ($lines as $l) $ins->execute([mcp_new_id('it_'), $invId, $l['warehouse_item_id'], $l['sku'], $l['name'], $l['description'], $l['qty'], $l['unit'], $l['price'], $l['vat'], $l['disc'], $l['net']]);

            // The linked ledger movement the app derives from every live invoice: pending, nothing received.
            // Skipped when the same invoice number was already entered by hand (double-entry guard).
            $hand = $pdo->prepare("SELECT 1 FROM financial_records WHERE type = 'income' AND id NOT LIKE 'fr-inv-%' AND LOWER(TRIM(invoice_number)) = LOWER(TRIM(?)) LIMIT 1");
            $hand->execute([$docNum]);
            if (!$hand->fetchColumn()) {
                $pdo->prepare(
                    "INSERT INTO financial_records (id, type, subtype, title, description, amount_planned, amount_real, currency, status, issue_date, due_date, project_id, client_id, invoice_number, tax_rate, payment_method, created_by)
                     VALUES (?, 'income', 'invoice', ?, ?, ?, 0, ?, 'pending', ?, ?, ?, ?, ?, ?, 'bank_transfer', ?)"
                )->execute([
                    'fr-inv-' . $invId, $docNum . ' — ' . $clientName, $title, $total, $currency, $issuedAt, $dueDate, $projectId, $clientId, $docNum,
                    $subtotal > 0 ? round($vatTotal / $subtotal * 100) : ccrm_default_vat_rate($pdo), $user['name'],
                ]);
            }
        });
        return ['docNum' => $docNum, 'clientName' => $clientName];
    });

    mcp_audit($pdo, $user, 'invoice_create', "Issued draft invoice {$result['docNum']} for {$total} {$currency} to {$result['clientName']}");
    return [
        'success' => true, 'id' => $invId, 'document_number' => $result['docNum'], 'status' => 'draft', 'client_name' => $result['clientName'],
        'subtotal' => $subtotal, 'vat_amount' => $vatTotal, 'total_price' => $total, 'currency' => $currency,
        'note' => 'Created as a draft. Sending, approving and settling money are done in the app.',
    ];
}

function mcp_do_update_invoice_status(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $stmt = $pdo->prepare("SELECT id, document_number, type, status FROM invoices_offers WHERE id = ?");
    $stmt->execute([$id]);
    $doc = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$doc) throw new \Exception("Invoice not found with ID: {$id}");

    if ($doc['type'] === 'price_offer') {
        // A price offer's statuses are configurable, so they are judged by group:
        // MCP may move an offer between draft, open (sent) and cancelled statuses.
        // Won and lost are verdicts, and are left to the app.
        $status = isset($args['status']) ? trim((string)$args['status']) : '';
        if ($status === '') throw new \InvalidArgumentException("'status' is required.");
        $group = ccrm_offer_status_group($status, $pdo);
        if ($group === null) {
            $keys = array_column(ccrm_offer_status_defs($pdo), 'key');
            throw new \InvalidArgumentException("Unknown offer status '{$status}'. Valid: " . implode(', ', $keys) . '.');
        }
        if (!in_array($group, ['draft', 'open', 'cancelled'], true)) {
            throw new \InvalidArgumentException("Status '{$status}' can only be set in the app: accepting or rejecting an offer is a verdict. MCP may set an offer to a draft, sent or cancelled status.");
        }
        if ($doc['status'] === $status) return ['success' => true, 'id' => $id, 'status' => $status, 'message' => 'No change.'];
        if (ccrm_offer_status_group((string)$doc['status'], $pdo) === 'cancelled' || $doc['status'] === 'invoiced') {
            throw new \InvalidArgumentException("A {$doc['status']} document cannot be changed through MCP.");
        }
    } else {
        if (!mcp_can_edit('financial')) {
            throw new \Exception("Updating invoice or proforma status requires 'financial' edit permission.");
        }
        // Proformas and invoices have a configurable list of their own (Price offers → Settings →
        // Invoice statuses), judged by group exactly like an offer's: approving, invoicing and
        // settling money change the books, so MCP may only move a document between draft, open
        // (sent) and cancelled statuses.
        $status = isset($args['status']) ? trim((string)$args['status']) : '';
        if ($status === '') throw new \InvalidArgumentException("'status' is required.");
        $group = ccrm_invoice_status_group($status, $pdo);
        if ($group === null) {
            $keys = array_column(ccrm_invoice_status_defs($pdo), 'key');
            throw new \InvalidArgumentException("Unknown invoice status '{$status}'. Valid: " . implode(', ', $keys) . '.');
        }
        if (!in_array($group, ['draft', 'open', 'cancelled'], true)) {
            throw new \InvalidArgumentException("Status '{$status}' can only be set in the app: approving, invoicing and settling money change the books. MCP may set a document to a draft, sent or cancelled status.");
        }
        if ($doc['status'] === $status) return ['success' => true, 'id' => $id, 'status' => $status, 'message' => 'No change.'];
        if (ccrm_invoice_status_group((string)$doc['status'], $pdo) === 'cancelled' || $doc['status'] === 'invoiced') {
            throw new \InvalidArgumentException("A {$doc['status']} document cannot be changed through MCP.");
        }
    }

    mcp_tx($pdo, function () use ($pdo, $doc, $status, $group, $id) {
        $pdo->prepare("UPDATE invoices_offers SET status = ?, status_changed_at = ? WHERE id = ?")->execute([$status, mcp_today(), $id]);
        // A cancelled invoice is no longer expected income. Money already recorded against it stays (the app's rule).
        if ($group === 'cancelled' && $doc['type'] === 'invoice') {
            $pdo->prepare(
                "UPDATE financial_records SET status = 'cancelled'
                 WHERE id = ? AND status NOT IN ('paid', 'partially_paid') AND amount_real = 0"
            )->execute(['fr-inv-' . $id]);
        }
    });
    mcp_audit($pdo, $user, 'invoice_status_update', "Updated document $id ({$doc['document_number']}) to '$status'");
    return ['success' => true, 'id' => $id, 'status' => $status];
}

function mcp_do_record_expense(\PDO $pdo, array $user, array $args): array {
    $title = mcp_require_string($args, 'title');
    $amount = mcp_number($args, 'amount', true, 0.01, 1000000000);
    $currency = strtoupper(trim((string)($args['currency'] ?? mcp_currency($pdo))));
    if (!preg_match('/^[A-Z]{3}$/', $currency)) throw new \InvalidArgumentException("'currency' must be a 3-letter code.");
    $issue = mcp_require_date($args, 'issue_date');
    $due = mcp_optional_date($args, 'due_date') ?? $issue;
    if (isset($args['status']) && $args['status'] === 'paid') {
        throw new \InvalidArgumentException("MCP records expenses as 'planned' or 'pending'; mark them paid in the app so the payment date and amount are confirmed.");
    }
    $status = mcp_enum($args, 'status', ['planned', 'pending'], 'planned');
    $catId = !empty($args['category_id']) ? (string)$args['category_id'] : null;
    if ($catId !== null) {
        $c = $pdo->prepare("SELECT type FROM financial_categories WHERE id = ?");
        $c->execute([$catId]);
        $type = $c->fetchColumn();
        if ($type === false) throw new \InvalidArgumentException("Category not found: {$catId}");
        if ($type !== 'expense') throw new \InvalidArgumentException("Category {$catId} is an income category.");
    }
    $projId = !empty($args['project_id']) ? (string)$args['project_id'] : null;
    $clientId = !empty($args['client_id']) ? (string)$args['client_id'] : null;
    if ($projId !== null) mcp_row_exists($pdo, 'projects', $projId, 'Project');
    if ($clientId !== null) mcp_row_exists($pdo, 'leads', $clientId, 'Client/lead');
    $desc = isset($args['description']) && trim((string)$args['description']) !== '' ? trim((string)$args['description']) : null;
    $taxRate = mcp_number($args, 'tax_rate', false, 0, 100) ?? ccrm_default_vat_rate($pdo);
    $payMethod = isset($args['payment_method']) && trim((string)$args['payment_method']) !== '' ? trim((string)$args['payment_method']) : 'bank_transfer';
    $invNum = isset($args['invoice_number']) && trim((string)$args['invoice_number']) !== '' ? trim((string)$args['invoice_number']) : null;

    $id = 'fin_' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO financial_records (id, type, subtype, title, description, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, paid_date, payment_method, project_id, client_id, invoice_number, tax_rate, created_by)
         VALUES (?, 'expense', 'expense', ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)"
    )->execute([$id, $title, $desc, $catId, $amount, $currency, $status, $issue, $due, $payMethod, $projId, $clientId, $invNum, $taxRate, $user['name']]);
    mcp_audit($pdo, $user, 'expense_record', "Recorded {$status} expense '{$title}' for {$amount} {$currency}");
    return ['success' => true, 'id' => $id, 'title' => $title, 'amount' => $amount, 'status' => $status];
}

// ---------------------------------------------------------------------------
// Stock  (WarehouseView purchase / sale handlers, warehousePricing.ts)
// ---------------------------------------------------------------------------

function mcp_do_adjust_stock(\PDO $pdo, array $user, array $args): array {
    $itemId = mcp_require_string($args, 'item_id');
    $change = mcp_number($args, 'quantity_change', true, -1000000000, 1000000000);
    if ($change == 0.0) throw new \InvalidArgumentException("'quantity_change' cannot be zero.");
    $reason = mcp_require_string($args, 'reason');
    $notes = trim((string)($args['notes'] ?? ''));

    $it = $pdo->prepare("SELECT id, name, avg_purchase_price, default_sell_price, default_location FROM warehouse_items WHERE id = ?");
    $it->execute([$itemId]);
    $item = $it->fetch(\PDO::FETCH_ASSOC);
    if (!$item) throw new \InvalidArgumentException("Warehouse item not found: {$itemId}");

    $whId = !empty($args['warehouse_id']) ? (string)$args['warehouse_id'] : null;
    if ($whId === null) {
        $whId = $pdo->query("SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1")->fetchColumn() ?: $pdo->query("SELECT id FROM warehouses LIMIT 1")->fetchColumn();
        if (!$whId) throw new \Exception('No warehouse exists to record the movement against.');
    } else {
        mcp_row_exists($pdo, 'warehouses', $whId, 'Warehouse');
    }

    $r = strtolower($reason);
    $type = in_array($r, ['receipt', 'purchase', 'inward'], true) ? 'inward' : (in_array($r, ['sale', 'issue', 'outward'], true) ? 'outward' : 'adjustment');
    if ($type === 'inward' && $change <= 0) throw new \InvalidArgumentException('A receipt needs a positive quantity_change.');
    if ($type === 'outward' && $change >= 0) throw new \InvalidArgumentException('A sale needs a negative quantity_change.');
    $unitPurchase = mcp_number($args, 'unit_purchase_price', false, 0);
    $unitSell = mcp_number($args, 'unit_sell_price', false, 0);
    $qty = abs($change);
    $prefix = $type === 'inward' ? 'PRI' : ($type === 'outward' ? 'VYD' : 'INV');

    $result = mcp_with_lock($pdo, 'ccrm_warehouse_number', function () use ($pdo, $user, $item, $itemId, $whId, $change, $qty, $type, $prefix, $reason, $notes, $unitPurchase, $unitSell) {
        return mcp_tx($pdo, function () use ($pdo, $user, $item, $itemId, $whId, $change, $qty, $type, $prefix, $reason, $notes, $unitPurchase, $unitSell) {
            $stk = $pdo->prepare("SELECT quantity, reserved_quantity FROM warehouse_stock WHERE warehouse_id = ? AND item_id = ? FOR UPDATE");
            $stk->execute([$whId, $itemId]);
            $row = $stk->fetch(\PDO::FETCH_ASSOC) ?: ['quantity' => 0, 'reserved_quantity' => 0];
            $onHand = (float)$row['quantity'];
            if ($change < 0) {
                $available = $type === 'outward' ? $onHand - (float)$row['reserved_quantity'] : $onHand;
                if ($qty > $available + 1e-9) {
                    throw new \Exception("Insufficient stock for '{$item['name']}': " . ($type === 'outward' ? 'available' : 'on hand') . " {$available}, requested {$qty}.");
                }
            }

            $totalOnHandAll = (float)$pdo->query("SELECT COALESCE(SUM(quantity), 0) FROM warehouse_stock WHERE item_id = " . $pdo->quote($itemId))->fetchColumn();
            $avg = (float)$item['avg_purchase_price'];
            $costValue = 0.0; $sellValue = 0.0; $unitCost = $avg; $unitSellUsed = (float)$item['default_sell_price'];

            if ($type === 'inward') {
                if ($unitPurchase !== null) {
                    // nextWeightedAveragePrice: weigh the new lot against the item's stock in every warehouse.
                    $newTotal = $totalOnHandAll + $qty;
                    $newAvg = $newTotal > 0 ? ($totalOnHandAll * $avg + $qty * $unitPurchase) / $newTotal : $unitPurchase;
                    $pdo->prepare("UPDATE warehouse_items SET avg_purchase_price = ?, last_purchase_price = ? WHERE id = ?")->execute([round($newAvg, 2), $unitPurchase, $itemId]);
                    $unitCost = $unitPurchase;
                    $costValue = $qty * $unitPurchase;
                } else {
                    $unitCost = 0.0;
                }
            } elseif ($type === 'outward') {
                $unitSellUsed = $unitSell ?? (float)$item['default_sell_price'];
                $costValue = $qty * $avg;
                $sellValue = $qty * $unitSellUsed;
            } else {
                $costValue = $qty * $avg;
            }

            $pdo->prepare(
                "INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, location) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)"
            )->execute([$whId, $itemId, $change, $item['default_location']]);

            $docNum = mcp_next_document_number($pdo, 'warehouse_movements', 'document_number', $prefix, (int)date('Y'), 4);
            $movId = 'mov-' . bin2hex(random_bytes(6));
            // issued_at is app-local wall time (the app writes nowLocalDateTime()), not MySQL NOW() (UTC on a server).
            $pdo->prepare(
                "INSERT INTO warehouse_movements (id, document_number, type, status, warehouse_id, total_cost_value, total_sell_value, total_profit_value, created_by, note, issued_at)
                 VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?)"
            )->execute([$movId, $docNum, $type, $whId, round($costValue, 2), round($sellValue, 2), $type === 'outward' ? round($sellValue - $costValue, 2) : 0, $user['email'], trim("Reason: {$reason}. {$notes}"), mcp_now_local()]);
            $pdo->prepare(
                "INSERT INTO warehouse_movement_items (id, movement_id, item_id, quantity, unit_purchase_price, unit_sell_price, total_price, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([mcp_new_id('mvi-'), $movId, $itemId, $qty, $unitCost, $unitSellUsed, round($type === 'outward' ? $sellValue : $costValue, 2), $reason]);

            return ['docNum' => $docNum, 'type' => $type, 'newQty' => $onHand + $change];
        });
    });

    mcp_audit($pdo, $user, 'stock_adjust', "Adjusted stock for item $itemId by $change ({$reason}) as {$result['type']} {$result['docNum']}");
    return [
        'success' => true, 'item_id' => $itemId, 'warehouse_id' => $whId, 'quantity_change' => $change,
        'new_quantity' => $result['newQty'], 'movement_type' => $result['type'], 'document_number' => $result['docNum'],
        'note' => $result['type'] === 'inward' && $unitPurchase === null ? 'No unit_purchase_price given: stock was added but the average purchase price was not updated.' : null,
    ];
}

// ---------------------------------------------------------------------------
// Payroll  (sync.php employee salaries + auto-expense linkage)
// ---------------------------------------------------------------------------

function mcp_do_record_salary_payout(\PDO $pdo, array $user, array $args): array {
    $empId = mcp_require_string($args, 'employee_id');
    $periodKey = mcp_require_string($args, 'period_key');
    if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $periodKey, $m)) {
        throw new \InvalidArgumentException("'period_key' must be a month in YYYY-MM format (weekly payroll is managed in the app).");
    }
    $year = (int)$m[1]; $month = (int)$m[2];
    $totalSalary = mcp_number($args, 'total_salary', true, 0, 100000000);
    $totalPaid = mcp_number($args, 'total_paid', false, 0, 100000000) ?? 0.0;
    $payDate = mcp_optional_date($args, 'payment_date');
    $dueDate = mcp_optional_date($args, 'due_date');
    $method = trim((string)($args['payment_method'] ?? 'bank_transfer')) ?: 'bank_transfer';

    $e = $pdo->prepare("SELECT id, name, auto_expense, expense_category_id, salary_due_day FROM employees WHERE id = ?");
    $e->execute([$empId]);
    $emp = $e->fetch(\PDO::FETCH_ASSOC);
    if (!$emp) throw new \InvalidArgumentException("Employee not found: {$empId}");
    $defaults = mcp_employee_defaults($pdo);

    $ex = $pdo->prepare("SELECT * FROM employee_salaries WHERE employee_id = ? AND period_key = ?");
    $ex->execute([$empId, $periodKey]);
    $existing = $ex->fetch(\PDO::FETCH_ASSOC);
    $itemName = 'Base salary';
    // A closed month (first paid in full, not reopened by an admin) is not changed from here
    $hasClosedAt = ccrm_column_exists($pdo, 'employee_salaries', 'closed_at');
    if ($existing) {
        $isClosed = $hasClosedAt ? !empty($existing['closed_at']) : $existing['status'] === 'paid';
        if ($isClosed) {
            throw new \InvalidArgumentException("The {$periodKey} payout for this employee is already paid and the month is closed; correct it in the app.");
        }
        $items = json_decode((string)$existing['items_json'], true);
        if (is_array($items) && (count($items) > 1 || (count($items) === 1 && ($items[0]['categoryId'] ?? 'base') !== 'base'))) {
            throw new \InvalidArgumentException('This period has a salary breakdown by component; edit it in the app.');
        }
        if (is_array($items) && !empty($items[0]['categoryName'])) $itemName = (string)$items[0]['categoryName'];
    }

    $salId = $existing['id'] ?? ('sal-' . $empId . '-' . $periodKey);
    // Paid against Cena práce once the payslip is in, otherwise the gross.
    $laborCost = array_key_exists('labor_cost', $args)
        ? ($args['labor_cost'] === null || $args['labor_cost'] === '' ? null : mcp_number($args, 'labor_cost', true, 0, 100000000))
        : ($existing['labor_cost'] ?? null);
    $netPay = array_key_exists('net_pay', $args)
        ? ($args['net_pay'] === null || $args['net_pay'] === '' ? null : mcp_number($args, 'net_pay', true, 0, 100000000))
        : ($existing['net_pay'] ?? null);
    $due = ccrm_salary_due(['labor_cost' => $laborCost, 'total_salary' => $totalSalary]);
    $status = ccrm_salary_status($due, $totalPaid);
    // The month closes the first time it becomes paid in full
    $closedAt = ($hasClosedAt && $status === 'paid' && ($existing['status'] ?? null) !== 'paid') ? date('Y-m-d H:i:s') : null;

    if (!$dueDate) {
        $dueDay = (int)($emp['salary_due_day'] ?: $defaults['dueDay']);
        if ($dueDay < 1 || $dueDay > 31) $dueDay = 15;
        $dueDate = gmdate('Y-m-d', gmmktime(0, 0, 0, $month + 1, min($dueDay, 28), $year));
    }
    if ($totalPaid > 0 && !$payDate) $payDate = mcp_today();
    if ($totalPaid <= 0) $payDate = null;

    $autoExpense = $emp['auto_expense'] !== null ? ((int)$emp['auto_expense'] === 1) : $defaults['autoExpense'];
    $finId = $existing['financial_record_id'] ?? null;

    mcp_tx($pdo, function () use ($pdo, $user, $emp, $empId, $periodKey, $year, $month, $totalSalary, $totalPaid, $laborCost, $netPay, $due, $status, $closedAt, $dueDate, $payDate, $method, $args, $salId, $itemName, $autoExpense, $defaults, &$finId) {
        if ($autoExpense && ($due > 0 || $totalPaid > 0)) {
            $catId = $emp['expense_category_id'] ?: $defaults['expenseCategoryId'];
            $finId = $finId ?: ('fr-sal-' . $salId);
            $frStatus = $status === 'pending' ? 'planned' : $status;
            // Like sync.php: amounts, status and dates follow the payroll month; title and category
            // are set when the expense is created only.
            $pdo->prepare(
                "INSERT INTO financial_records (id, type, subtype, title, description, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, paid_date, payment_method, created_by)
                 VALUES (?, 'expense', 'salary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    amount_planned = VALUES(amount_planned), amount_real = VALUES(amount_real), status = VALUES(status),
                    due_date = VALUES(due_date), paid_date = VALUES(paid_date), payment_method = VALUES(payment_method)"
            )->execute([
                $finId, "Salary: {$emp['name']} ({$periodKey})", "Monthly payroll salary payout for {$emp['name']}", $catId,
                $due, $totalPaid, mcp_currency($pdo), $frStatus, sprintf('%04d-%02d-01', $year, $month), $dueDate,
                $totalPaid > 0 ? $payDate : null, $method, $user['email'],
            ]);
        } else {
            $finId = null;
        }
        $items = json_encode([['categoryId' => 'base', 'categoryName' => $itemName, 'salary' => $totalSalary, 'paid' => $totalPaid]], JSON_UNESCAPED_UNICODE);
        $pdo->prepare(
            "INSERT INTO employee_salaries (id, employee_id, period_type, period_key, year, period_number, items_json, total_salary, total_paid, labor_cost, net_pay, status, due_date, payment_date, payment_method, financial_record_id, note)
             VALUES (?, ?, 'monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE items_json = VALUES(items_json), total_salary = VALUES(total_salary), total_paid = VALUES(total_paid),
                labor_cost = VALUES(labor_cost), net_pay = VALUES(net_pay), status = VALUES(status), due_date = VALUES(due_date), payment_date = VALUES(payment_date), payment_method = VALUES(payment_method),
                financial_record_id = VALUES(financial_record_id), note = VALUES(note)"
        )->execute([$salId, $empId, $periodKey, $year, $month, $items, $totalSalary, $totalPaid, $laborCost, $netPay, $status, $dueDate, $payDate, $method, $finId, $args['note'] ?? null]);
        if ($closedAt !== null) {
            $pdo->prepare("UPDATE employee_salaries SET closed_at = ?, closed_by = ? WHERE id = ? AND closed_at IS NULL")
                ->execute([$closedAt, $user['email'] ?? null, $salId]);
        }
    });

    mcp_audit($pdo, $user, 'record_salary_payout', "Recorded salary payout {$salId} for employee {$empId} ({$periodKey}): {$totalPaid} of {$due} due (gross {$totalSalary})");
    return ['success' => true, 'id' => $salId, 'status' => $status, 'total_salary' => $totalSalary, 'labor_cost' => $laborCost, 'net_pay' => $netPay, 'amount_due' => $due, 'total_paid' => $totalPaid, 'financial_record_id' => $finId, 'due_date' => $dueDate];
}

// ---------------------------------------------------------------------------
// Vacations
// ---------------------------------------------------------------------------

function mcp_working_days_between(\PDO $pdo, ?string $workCountry, string $start, string $end): int {
    require_once __DIR__ . '/holidays_lib.php';
    $country = ($workCountry === 'SK' || $workCountry === 'HU') ? $workCountry : ccrm_holiday_company_country($pdo);
    $hols = [];
    for ($y = (int)substr($start, 0, 4); $y <= (int)substr($end, 0, 4); $y++) {
        foreach (ccrm_holidays_year($pdo, $country, $y, false)['days'] as $d) {
            $hols[$d['date']] = true;
        }
    }
    $count = 0;
    $cur = new \DateTimeImmutable($start, new \DateTimeZone('UTC'));
    $last = new \DateTimeImmutable($end, new \DateTimeZone('UTC'));
    while ($cur <= $last) {
        $iso = $cur->format('Y-m-d');
        if (ccrm_holiday_is_weekday($iso) && !isset($hols[$iso])) $count++;
        $cur = $cur->modify('+1 day');
    }
    return $count;
}

function mcp_do_record_vacation(\PDO $pdo, array $user, array $args): array {
    $empId = mcp_require_string($args, 'employee_id');
    $empStmt = $pdo->prepare("SELECT id, work_country FROM employees WHERE id = ? LIMIT 1");
    $empStmt->execute([$empId]);
    $empRow = $empStmt->fetch(\PDO::FETCH_ASSOC);
    if (!$empRow) throw new \InvalidArgumentException("Employee not found: {$empId}");
    $start = mcp_require_date($args, 'start_date');
    $end = mcp_require_date($args, 'end_date');
    if ($end < $start) throw new \InvalidArgumentException("'end_date' cannot be before 'start_date'.");
    $spanDays = (int)((strtotime($end) - strtotime($start)) / 86400) + 1;
    if (array_key_exists('days_count', $args) && $args['days_count'] !== null && $args['days_count'] !== '') {
        $days = mcp_number($args, 'days_count', true, 0.5, 366);
    } else {
        $days = (float)max(0, mcp_working_days_between($pdo, $empRow['work_country'] ?? null, $start, $end));
        if ($days < 0.5) throw new \InvalidArgumentException("No working days in range {$start}..{$end}; pass 'days_count' explicitly if intentional.");
    }
    if ($days > $spanDays) throw new \InvalidArgumentException("'days_count' ({$days}) is more than the {$spanDays} calendar days in the range.");

    $defaults = mcp_employee_defaults($pdo);
    $typeIds = array_column($defaults['vacationTypes'], 'id');
    $typeId = (string)($args['vacation_type_id'] ?? 'annual');
    if (!in_array($typeId, $typeIds, true)) throw new \InvalidArgumentException("Unknown vacation_type_id '{$typeId}'. Configured types: " . implode(', ', $typeIds) . '.');
    $status = mcp_enum($args, 'status', ['requested', 'pending', 'approved', 'rejected', 'taken'], 'pending');

    $ov = $pdo->prepare("SELECT id, start_date, end_date FROM employee_vacations WHERE employee_id = ? AND status <> 'rejected' AND start_date <= ? AND end_date >= ? LIMIT 1");
    $ov->execute([$empId, $end, $start]);
    if ($clash = $ov->fetch(\PDO::FETCH_ASSOC)) {
        throw new \InvalidArgumentException("Overlaps an existing leave {$clash['id']} ({$clash['start_date']} to {$clash['end_date']}).");
    }

    $id = 'vac-' . bin2hex(random_bytes(6));
    $pdo->prepare(
        "INSERT INTO employee_vacations (id, employee_id, vacation_type_id, start_date, end_date, days_count, status, note, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([$id, $empId, $typeId, $start, $end, $days, $status, $args['note'] ?? null, in_array($status, ['approved', 'taken'], true) ? ($user['name'] ?: $user['email']) : null]);
    mcp_audit($pdo, $user, 'record_vacation', "Logged vacation {$id} for employee {$empId} ({$start} - {$end})");
    return ['id' => $id, 'success' => true, 'status' => $status, 'days_count' => $days];
}

// ---------------------------------------------------------------------------
// Finance summary  (same model as the overview table)
// ---------------------------------------------------------------------------

function mcp_financial_period_columns(\PDO $pdo, int $year, string $period): array {
    $p = strtolower(trim($period));
    if ($p === 'month') {
        $m = (int)date('n');
        $id = sprintf('%04d-%02d', $year, $m);
        return [['id' => $id, 'start' => $id . '-01', 'end' => $id . '-' . sprintf('%02d', mcp_dim($year, $m - 1))]];
    }
    if ($p === 'quarter') {
        $qStart = ((int)ceil((int)date('n') / 3) - 1) * 3 + 1;
        return array_slice(mcp_year_columns($year), $qStart - 1, 3);
    }
    if ($p === 'all') {
        $row = $pdo->query("SELECT MIN(YEAR(COALESCE(paid_date, due_date, issue_date))) AS min_y, MAX(YEAR(COALESCE(paid_date, due_date, issue_date))) AS max_y FROM financial_records")->fetch(\PDO::FETCH_ASSOC);
        $minY = max(2018, (int)($row['min_y'] ?: $year));
        $maxY = min((int)date('Y') + 2, max($year, (int)($row['max_y'] ?: $year)));
        $cols = [];
        for ($y = $minY; $y <= $maxY; $y++) {
            foreach (mcp_year_columns($y) as $c) $cols[] = $c;
        }
        return $cols;
    }
    return mcp_year_columns($year);
}

function mcp_financial_summary_connected(\PDO $pdo, int $year, string $period = 'year'): array {
    $period = in_array(strtolower($period), ['month', 'quarter', 'year', 'all'], true) ? strtolower($period) : 'year';
    $byId = mcp_fin_categories($pdo);
    $agg = mcp_fin_aggregate(mcp_fin_load($pdo, '1=1'), $byId, mcp_financial_period_columns($pdo, $year, $period), mcp_today());
    $t = ['income' => ['real' => 0.0, 'estimated' => 0.0], 'expense' => ['real' => 0.0, 'estimated' => 0.0]];
    foreach (['income', 'expense'] as $type) {
        foreach ($agg['totalsByType'][$type] as $c) { $t[$type]['real'] += $c['real']; $t[$type]['estimated'] += $c['estimated']; }
    }
    $out = [
        'mode' => 'connected', 'year' => $year, 'period' => $period, 'currency' => mcp_currency($pdo),
        'paid_revenue' => mcp_round2($t['income']['real']),
        'planned_revenue' => mcp_round2($t['income']['real'] + $t['income']['estimated']),
        'paid_expenses' => mcp_round2($t['expense']['real']),
        'planned_expenses' => mcp_round2($t['expense']['real'] + $t['expense']['estimated']),
        'net_profit' => mcp_round2($t['income']['real'] - $t['expense']['real']),
        'net_expected' => mcp_round2(($t['income']['real'] + $t['income']['estimated']) - ($t['expense']['real'] + $t['expense']['estimated'])),
        'basis' => 'cash basis: a movement counts in the year of its paid date, else due date, else issue date; cancelled movements count as nothing; recurring rules are expanded on the calendar.',
    ];
    if (mcp_can('invoices')) {
        // Open invoices: live invoice documents whose linked ledger movement is not fully paid.
        $stmt = $pdo->query(
            "SELECT COUNT(*) FROM invoices_offers io
             WHERE io.type = 'invoice' AND io.status NOT IN ('cancelled', 'rejected')
               AND NOT EXISTS (
                 SELECT 1 FROM financial_records fr
                 WHERE fr.type = 'income' AND fr.status = 'paid'
                   AND (fr.id = CONCAT('fr-inv-', io.id) OR (fr.invoice_number IS NOT NULL AND fr.invoice_number = io.document_number)))"
        );
        $out['unpaid_invoices_count'] = (int)$stmt->fetchColumn();
    }
    return $out;
}
