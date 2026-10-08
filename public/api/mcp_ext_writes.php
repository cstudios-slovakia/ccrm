<?php
/**
 * CCRM MCP gateway — write paths rebuilt to follow the app's own rules (audit Part B, F3/F4/F8).
 *
 * Required by mcp.php; the tool switch there delegates to these functions. Each one validates its
 * input, writes related rows in one transaction, and mirrors what the browser does:
 *
 *   invoices        src/utils/invoiceFinanceBridge.ts, documentNumbering.ts, InvoicingView.calculatedTotals
 *   stock           src/utils/warehousePricing.ts, WarehouseView purchase/sale handlers
 *   payroll         sync.php "Synchronize Employee Salaries & Auto-Expense Linkage"
 *   projects        src/utils/projects.ts finishedAtForStatus
 *   leads / tasks   LeadsDatagrid.handleUpdateLeadState, TaskDashboardView completion stamps
 *
 * Money-moving rules (decision D2): invoices are created as drafts and can only be sent or
 * cancelled, expenses are recorded as planned/pending, and nothing here marks money as received.
 * Settling money stays a decision made in the app.
 */

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
    static $allowed = ['leads', 'projects', 'tasks', 'warehouses', 'warehouse_items', 'employees', 'financial_categories', 'project_types'];
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
    $deadline = mcp_optional_date($a, 'deadline');
    if ($deadline !== null && $deadline < $start) throw new \InvalidArgumentException("'deadline' cannot be before 'start_date'.");

    if (!empty($a['project_type_id'])) {
        mcp_row_exists($pdo, 'project_types', (string)$a['project_type_id'], 'Project type');
        $typeId = (string)$a['project_type_id'];
    } else {
        $typeId = $pdo->query("SELECT id FROM project_types LIMIT 1")->fetchColumn();
        if (!$typeId) throw new \Exception('No project type is configured; create one in Settings first.');
    }

    $id = 'proj_' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO projects (id, project_type_id, name, lead_id, client_id, budget, value, start_date, deadline, status, finished_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())"
    )->execute([$id, $typeId, $name, $clientId, $clientId, $budget, $value, $start, $deadline, $status, mcp_finished_at_for_status($pdo, $status, null)]);
    return $id;
}

function mcp_do_update_project(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $cur = $pdo->prepare("SELECT status, finished_at, start_date, deadline FROM projects WHERE id = ?");
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
    foreach (['start_date', 'deadline'] as $f) {
        if (array_key_exists($f, $args)) $add($f, $args[$f] === null || $args[$f] === '' ? null : mcp_require_date($args, $f));
    }
    $start = array_key_exists('start_date', $args) ? ($args['start_date'] ?: null) : $row['start_date'];
    $deadline = array_key_exists('deadline', $args) ? ($args['deadline'] ?: null) : $row['deadline'];
    if ($start && $deadline && $deadline < $start) throw new \InvalidArgumentException("'deadline' cannot be before 'start_date'.");
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
    if (array_key_exists('archived', $args)) $add('archived', !empty($args['archived']) ? 1 : 0);

    if (!$sets) return ['success' => true, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE projects SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    mcp_audit($pdo, $user, 'project_update', "Updated project $id");
    return ['success' => true, 'id' => $id, 'updated_fields' => array_values(array_intersect(array_keys($args), ['name', 'status', 'budget', 'value', 'start_date', 'deadline', 'delay_reason', 'rating', 'division', 'archived']))];
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Canonical configured task state, or an error naming the valid ones. */
function mcp_task_state_check(\PDO $pdo, string $status): string {
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    if (!is_array($states) || !$states) return $status;
    foreach ($states as $s) { if (strtolower($s) === strtolower($status)) return $s; }
    if (strtolower($status) === 'done') return end($states);
    throw new \InvalidArgumentException("Unknown task status '{$status}'. Configured statuses: " . implode(', ', $states) . '.');
}

function mcp_task_done_state(\PDO $pdo): string {
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    return (is_array($states) && $states) ? (string)end($states) : 'done';
}

function mcp_do_create_task(\PDO $pdo, array $user, array $args): array {
    $title = mcp_require_string($args, 'title');
    $deadline = mcp_require_date($args, 'deadline');
    $time = isset($args['deadline_time']) && $args['deadline_time'] !== '' ? (string)$args['deadline_time'] : null;
    if ($time !== null && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) throw new \InvalidArgumentException("'deadline_time' must be HH:MM.");
    $priority = mcp_enum($args, 'priority', ['low', 'medium', 'high'], 'medium');
    $states = mcp_config_json($pdo, 'TASK_STATES', []);
    $status = isset($args['status']) && $args['status'] !== '' ? mcp_task_state_check($pdo, (string)$args['status']) : ((is_array($states) && $states) ? (string)$states[0] : 'todo');
    $owner = isset($args['owner']) && $args['owner'] !== '' ? mcp_user_exists($pdo, (string)$args['owner']) : $user['name'];
    $projId = !empty($args['project_id']) ? (string)$args['project_id'] : null;
    $leadId = !empty($args['client_id']) ? (string)$args['client_id'] : null;
    if ($projId !== null) mcp_row_exists($pdo, 'projects', $projId, 'Project');
    if ($leadId !== null) mcp_row_exists($pdo, 'leads', $leadId, 'Client/lead');
    $assignees = [$owner];
    if (is_array($args['assignees'] ?? null)) {
        foreach ($args['assignees'] as $a) { if (trim((string)$a) !== '') $assignees[] = mcp_user_exists($pdo, (string)$a); }
    }

    $id = 'tsk_' . bin2hex(random_bytes(8));
    mcp_tx($pdo, function () use ($pdo, $id, $title, $args, $priority, $deadline, $time, $status, $owner, $user, $projId, $leadId, $assignees) {
        $pdo->prepare(
            "INSERT INTO tasks (id, title, description, priority, deadline, deadline_time, status, owner, created_by, related_project_id, related_lead_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([$id, $title, $args['description'] ?? null, $priority, $deadline, $time, $status, $owner, $user['name'], $projId, $leadId]);
        $ins = $pdo->prepare("INSERT IGNORE INTO task_assignees (task_id, user_name) VALUES (?, ?)");
        foreach (array_unique($assignees) as $a) $ins->execute([$id, $a]);
    });
    mcp_audit($pdo, $user, 'task_create', "Created task '$title' (ID: $id, deadline: $deadline)");
    return ['success' => true, 'id' => $id, 'title' => $title, 'status' => $status, 'deadline' => $deadline, 'assignees' => array_values(array_unique($assignees))];
}

function mcp_do_update_task(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $cur = $pdo->prepare("SELECT status, completed_at FROM tasks WHERE id = ?");
    $cur->execute([$id]);
    $row = $cur->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \Exception("Task not found with ID: {$id}");

    $sets = []; $params = []; $newOwner = null;
    $add = function (string $col, $val) use (&$sets, &$params) { $sets[] = "`{$col}` = ?"; $params[] = $val; };
    if (array_key_exists('title', $args)) $add('title', mcp_require_string($args, 'title'));
    if (array_key_exists('description', $args)) $add('description', $args['description']);
    if (array_key_exists('priority', $args)) $add('priority', mcp_enum($args, 'priority', ['low', 'medium', 'high']));
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
        if ($isDone && !$wasDone) { $add('completed_by', $user['name']); $add('completed_at', date('Y-m-d H:i')); }
        if (!$isDone && $wasDone) { $add('completed_by', null); $add('completed_at', null); }
    }
    if (array_key_exists('owner', $args)) { $newOwner = mcp_user_exists($pdo, mcp_require_string($args, 'owner')); $add('owner', $newOwner); }
    foreach (['related_project_id' => 'project_id', 'related_lead_id' => 'client_id'] as $col => $arg) {
        foreach ([$col, $arg] as $k) {
            if (array_key_exists($k, $args)) {
                $v = $args[$k] === null || $args[$k] === '' ? null : (string)$args[$k];
                if ($v !== null) mcp_row_exists($pdo, $col === 'related_project_id' ? 'projects' : 'leads', $v, 'Linked record');
                $add($col, $v);
                break;
            }
        }
    }
    if (!$sets) return ['success' => true, 'message' => 'No fields updated'];
    $params[] = $id;
    mcp_tx($pdo, function () use ($pdo, $sets, $params, $id, $newOwner) {
        $pdo->prepare("UPDATE tasks SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
        // The assignee list is the visibility rule, so a new owner must be on it.
        if ($newOwner !== null) $pdo->prepare("INSERT IGNORE INTO task_assignees (task_id, user_name) VALUES (?, ?)")->execute([$id, $newOwner]);
    });
    mcp_audit($pdo, $user, 'task_update', "Updated task $id");
    return ['success' => true, 'id' => $id];
}

function mcp_do_complete_task(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $done = mcp_task_done_state($pdo);
    $stmt = $pdo->prepare("UPDATE tasks SET status = ?, completed_by = ?, completed_at = ? WHERE id = ?");
    $stmt->execute([$done, $user['name'], date('Y-m-d H:i'), $id]);
    $chk = $pdo->prepare("SELECT 1 FROM tasks WHERE id = ?");
    $chk->execute([$id]);
    if (!$chk->fetchColumn()) throw new \Exception("Task not found with ID: {$id}");
    mcp_audit($pdo, $user, 'task_complete', "Marked task $id as done");
    return ['success' => true, 'id' => $id, 'status' => $done, 'completed_by' => $user['name']];
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function mcp_do_list_clients(\PDO $pdo, array $args): array {
    $profiles = mcp_client_profiles($pdo, ['include_archived' => !empty($args['include_archived'])]);
    $term = isset($args['search']) ? strtolower(trim((string)$args['search'])) : '';
    $out = [];
    foreach ($profiles as $p) {
        if (!empty($args['city']) && strtolower((string)$p['city']) !== strtolower((string)$args['city'])) continue;
        if (!empty($args['client_type']) && $p['client_type'] !== $args['client_type']) continue;
        if ($term !== '') {
            $hay = strtolower(implode(' ', [$p['name'], $p['email'], $p['phone'], $p['company_id']]));
            if (strpos($hay, $term) === false) continue;
        }
        unset($p['_leads']);
        $out[] = $p;
    }
    $sort = in_array($args['sort_by'] ?? '', ['name', 'created_at', 'value'], true) ? $args['sort_by'] : 'name';
    $key = $sort === 'value' ? 'total_value' : $sort;
    $dir = strtolower((string)($args['sort_order'] ?? '')) === 'desc' ? -1 : 1;
    usort($out, fn($a, $b) => $dir * (is_numeric($a[$key]) ? $a[$key] <=> $b[$key] : strcasecmp((string)$a[$key], (string)$b[$key])));
    return array_slice($out, max(0, (int)($args['offset'] ?? 0)), mcp_limit($args));
}

function mcp_do_create_client(\PDO $pdo, array $user, array $args): array {
    $name = mcp_require_string($args, 'name');
    $dup = $pdo->prepare("SELECT id FROM leads WHERE id LIKE 'client-%' AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1");
    $dup->execute([$name]);
    if ($existing = $dup->fetchColumn()) throw new \Exception("A client named '{$name}' already exists ({$existing}).");

    // Same record the Clients register creates: id client-*, an accepted (won) stage, a registration note.
    $id = 'client-' . (int)round(microtime(true) * 1000);
    $won = mcp_won_lead_state($pdo);
    mcp_tx($pdo, function () use ($pdo, $user, $args, $id, $name, $won) {
        $pdo->prepare(
            "INSERT INTO leads (id, name, company_id, tax_id, vat_id, contact_person, email, phone, street, city, postal_code, country, interest_note, status, client_type, source, owner, value, adjustment, rating, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_assistant', ?, 0, 0, 5, ?)"
        )->execute([
            $id, $name, $args['company_id'] ?? null, $args['tax_id'] ?? null, $args['vat_id'] ?? null, $args['contact_person'] ?? null,
            $args['email'] ?? null, $args['phone'] ?? null, $args['street'] ?? null, $args['city'] ?? null, $args['postal_code'] ?? null,
            $args['country'] ?? 'Slovakia', $args['notes'] ?? null, $won,
            mcp_enum($args, 'client_type', ['business', 'person', 'partner'], 'business'), $user['name'], date('Y-m-d'),
        ]);
        $pdo->prepare(
            "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
             VALUES (?, ?, 'note', NOW(), 'Client Registered', 'Client profile registered via MCP.', ?)"
        )->execute([mcp_new_id('ev_'), $id, $user['name']]);
    });
    mcp_audit($pdo, $user, 'client_create', "Created client '$name' (IČO: " . ($args['company_id'] ?? '') . ", ID: $id)");
    return ['success' => true, 'id' => $id, 'name' => $name, 'company_id' => $args['company_id'] ?? null];
}

// ---------------------------------------------------------------------------
// Invoices  (invoiceFinanceBridge.ts, InvoicingView.calculatedTotals)
// ---------------------------------------------------------------------------

/** The company's default VAT rate (Settings → Billing); nothing else from that setting is read. */
function mcp_default_vat_rate(\PDO $pdo): float {
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'COMPANY_BILLING_SETTINGS'");
    $stmt->execute();
    $s = json_decode((string)$stmt->fetchColumn(), true);
    $r = is_array($s) ? (float)($s['defaultVatRate'] ?? 0) : 0.0;
    return $r > 0 ? $r : 20.0;
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
        $lines[] = ['name' => $name, 'qty' => $qty, 'price' => $price, 'vat' => $vat, 'disc' => $disc, 'net' => $net];
        $subtotal += $net;
        $vatTotal += $net * ($vat / 100);
    }
    $subtotal = round($subtotal, 2); $vatTotal = round($vatTotal, 2); $total = round($subtotal + $vatTotal, 2);

    $year = (int)substr($issuedAt, 0, 4);
    $invId = 'inv_' . bin2hex(random_bytes(8));

    $result = mcp_with_lock($pdo, 'ccrm_invoice_number', function () use ($pdo, $user, $args, $clientId, $client, $title, $issuedAt, $dueDate, $currency, $lines, $subtotal, $vatTotal, $total, $year, $invId) {
        if (!empty($args['document_number'])) {
            $docNum = trim((string)$args['document_number']);
            $dup = $pdo->prepare("SELECT 1 FROM invoices_offers WHERE document_number = ? LIMIT 1");
            $dup->execute([$docNum]);
            if ($dup->fetchColumn()) throw new \InvalidArgumentException("Document number {$docNum} is already used.");
        } else {
            $docNum = mcp_next_document_number($pdo, 'invoices_offers', 'document_number', 'FA', $year, 3);
        }
        $clientName = $client['name'] ?: ('Client ' . $clientId);

        mcp_tx($pdo, function () use ($pdo, $user, $clientId, $client, $clientName, $title, $docNum, $issuedAt, $dueDate, $currency, $lines, $subtotal, $vatTotal, $total, $invId) {
            $pdo->prepare(
                "INSERT INTO invoices_offers (id, document_number, type, mode, lead_id, client_id, client_name, client_email, client_phone, client_street, client_city, client_postal_code, client_country, client_ico, client_dic, client_icdph, title, subject, subtotal, vat_amount, total_price, currency, status, status_changed_at, issued_at, due_date, created_by)
                 VALUES (?, ?, 'invoice', 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)"
            )->execute([
                $invId, $docNum, $clientId, $clientId, $clientName, $client['email'], $client['phone'], $client['street'], $client['city'],
                $client['postal_code'], $client['country'] ?: 'Slovakia', $client['company_id'], $client['tax_id'], $client['vat_id'],
                $title, $title, $subtotal, $vatTotal, $total, $currency, mcp_today(), $issuedAt, $dueDate, $user['name'],
            ]);
            $ins = $pdo->prepare(
                "INSERT INTO invoice_offer_items (id, invoice_offer_id, name, quantity, unit, unit_price, vat_rate, discount_pct, total_price)
                 VALUES (?, ?, ?, ?, 'ks', ?, ?, ?, ?)"
            );
            foreach ($lines as $l) $ins->execute([mcp_new_id('it_'), $invId, $l['name'], $l['qty'], $l['price'], $l['vat'], $l['disc'], $l['net']]);

            // The linked ledger movement the app derives from every live invoice: pending, nothing received.
            // Skipped when the same invoice number was already entered by hand (double-entry guard).
            $hand = $pdo->prepare("SELECT 1 FROM financial_records WHERE type = 'income' AND id NOT LIKE 'fr-inv-%' AND LOWER(TRIM(invoice_number)) = LOWER(TRIM(?)) LIMIT 1");
            $hand->execute([$docNum]);
            if (!$hand->fetchColumn()) {
                $pdo->prepare(
                    "INSERT INTO financial_records (id, type, subtype, title, description, amount_planned, amount_real, currency, status, issue_date, due_date, client_id, invoice_number, tax_rate, payment_method, created_by)
                     VALUES (?, 'income', 'invoice', ?, ?, ?, 0, ?, 'pending', ?, ?, ?, ?, ?, 'bank_transfer', ?)"
                )->execute([
                    'fr-inv-' . $invId, $docNum . ' — ' . $clientName, $title, $total, $currency, $issuedAt, $dueDate, $clientId, $docNum,
                    $subtotal > 0 ? round($vatTotal / $subtotal * 100) : 20, $user['name'],
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
    $status = mcp_enum($args, 'status', ['draft', 'sent', 'cancelled', 'approved', 'rejected', 'invoiced', 'paid']);
    if ($status === null) throw new \InvalidArgumentException("'status' is required.");
    if (!in_array($status, ['draft', 'sent', 'cancelled'], true)) {
        throw new \InvalidArgumentException("Status '{$status}' can only be set in the app: approving, invoicing and settling money change the books. MCP may set a document to draft, sent or cancelled.");
    }
    $stmt = $pdo->prepare("SELECT id, document_number, type, status FROM invoices_offers WHERE id = ?");
    $stmt->execute([$id]);
    $doc = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$doc) throw new \Exception("Invoice not found with ID: {$id}");
    if ($doc['status'] === $status) return ['success' => true, 'id' => $id, 'status' => $status, 'message' => 'No change.'];
    if (in_array($doc['status'], ['cancelled', 'invoiced'], true)) {
        throw new \InvalidArgumentException("A {$doc['status']} document cannot be changed through MCP.");
    }

    mcp_tx($pdo, function () use ($pdo, $doc, $status, $id) {
        $pdo->prepare("UPDATE invoices_offers SET status = ?, status_changed_at = ? WHERE id = ?")->execute([$status, mcp_today(), $id]);
        // A cancelled invoice is no longer expected income. Money already recorded against it stays (the app's rule).
        if ($status === 'cancelled' && $doc['type'] === 'invoice') {
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

    $id = 'fin_' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO financial_records (id, type, subtype, title, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, paid_date, project_id, client_id, created_by)
         VALUES (?, 'expense', 'expense', ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?, ?, ?)"
    )->execute([$id, $title, $catId, $amount, $currency, $status, $issue, $due, $projId, $clientId, $user['name']]);
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
            $pdo->prepare(
                "INSERT INTO warehouse_movements (id, document_number, type, status, warehouse_id, total_cost_value, total_sell_value, total_profit_value, created_by, note, issued_at)
                 VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, NOW())"
            )->execute([$movId, $docNum, $type, $whId, round($costValue, 2), round($sellValue, 2), $type === 'outward' ? round($sellValue - $costValue, 2) : 0, $user['email'], trim("Reason: {$reason}. {$notes}")]);
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
    if ($existing) {
        if ($existing['status'] === 'paid') {
            throw new \InvalidArgumentException("The {$periodKey} payout for this employee is already paid; correct it in the app.");
        }
        $items = json_decode((string)$existing['items_json'], true);
        if (is_array($items) && (count($items) > 1 || (count($items) === 1 && ($items[0]['categoryId'] ?? 'base') !== 'base'))) {
            throw new \InvalidArgumentException('This period has a salary breakdown by component; edit it in the app.');
        }
        if (is_array($items) && !empty($items[0]['categoryName'])) $itemName = (string)$items[0]['categoryName'];
    }

    $salId = $existing['id'] ?? ('sal-' . $empId . '-' . $periodKey);
    $status = ($totalPaid >= $totalSalary && $totalSalary > 0) ? 'paid' : ($totalPaid > 0 ? 'partially_paid' : 'pending');

    if (!$dueDate) {
        $dueDay = (int)($emp['salary_due_day'] ?: $defaults['dueDay']);
        if ($dueDay < 1 || $dueDay > 31) $dueDay = 15;
        $dueDate = gmdate('Y-m-d', gmmktime(0, 0, 0, $month + 1, min($dueDay, 28), $year));
    }
    if ($totalPaid > 0 && !$payDate) $payDate = mcp_today();
    if ($totalPaid <= 0) $payDate = null;

    $autoExpense = $emp['auto_expense'] !== null ? ((int)$emp['auto_expense'] === 1) : $defaults['autoExpense'];
    $finId = $existing['financial_record_id'] ?? null;

    mcp_tx($pdo, function () use ($pdo, $user, $emp, $empId, $periodKey, $year, $month, $totalSalary, $totalPaid, $status, $dueDate, $payDate, $method, $args, $salId, $itemName, $autoExpense, $defaults, &$finId) {
        if ($autoExpense && ($totalSalary > 0 || $totalPaid > 0)) {
            $catId = $emp['expense_category_id'] ?: $defaults['expenseCategoryId'];
            $finId = $finId ?: ('fr-sal-' . $salId);
            $frStatus = $totalPaid >= $totalSalary && $totalSalary > 0 ? 'paid' : ($totalPaid > 0 ? 'partially_paid' : 'planned');
            $pdo->prepare(
                "INSERT INTO financial_records (id, type, subtype, title, description, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, paid_date, payment_method, created_by)
                 VALUES (?, 'expense', 'salary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), category_id = VALUES(category_id),
                    amount_planned = VALUES(amount_planned), amount_real = VALUES(amount_real), status = VALUES(status),
                    due_date = VALUES(due_date), paid_date = VALUES(paid_date), payment_method = VALUES(payment_method)"
            )->execute([
                $finId, "Salary: {$emp['name']} ({$periodKey})", "Monthly payroll salary payout for {$emp['name']}", $catId,
                $totalSalary, $totalPaid, mcp_currency($pdo), $frStatus, sprintf('%04d-%02d-01', $year, $month), $dueDate,
                $totalPaid > 0 ? $payDate : null, $method, $user['email'],
            ]);
        } else {
            $finId = null;
        }
        $items = json_encode([['categoryId' => 'base', 'categoryName' => $itemName, 'salary' => $totalSalary, 'paid' => $totalPaid]], JSON_UNESCAPED_UNICODE);
        $pdo->prepare(
            "INSERT INTO employee_salaries (id, employee_id, period_type, period_key, year, period_number, items_json, total_salary, total_paid, status, due_date, payment_date, payment_method, financial_record_id, note)
             VALUES (?, ?, 'monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE items_json = VALUES(items_json), total_salary = VALUES(total_salary), total_paid = VALUES(total_paid),
                status = VALUES(status), due_date = VALUES(due_date), payment_date = VALUES(payment_date), payment_method = VALUES(payment_method),
                financial_record_id = VALUES(financial_record_id), note = VALUES(note)"
        )->execute([$salId, $empId, $periodKey, $year, $month, $items, $totalSalary, $totalPaid, $status, $dueDate, $payDate, $method, $finId, $args['note'] ?? null]);
    });

    mcp_audit($pdo, $user, 'record_salary_payout', "Recorded salary payout {$salId} for employee {$empId} ({$periodKey}): {$totalPaid} of {$totalSalary}");
    return ['success' => true, 'id' => $salId, 'status' => $status, 'total_salary' => $totalSalary, 'total_paid' => $totalPaid, 'financial_record_id' => $finId, 'due_date' => $dueDate];
}

// ---------------------------------------------------------------------------
// Vacations
// ---------------------------------------------------------------------------

function mcp_do_record_vacation(\PDO $pdo, array $user, array $args): array {
    $empId = mcp_require_string($args, 'employee_id');
    mcp_row_exists($pdo, 'employees', $empId, 'Employee');
    $start = mcp_require_date($args, 'start_date');
    $end = mcp_require_date($args, 'end_date');
    if ($end < $start) throw new \InvalidArgumentException("'end_date' cannot be before 'start_date'.");
    $spanDays = (int)((strtotime($end) - strtotime($start)) / 86400) + 1;
    $days = mcp_number($args, 'days_count', false, 0.5, 366) ?? (float)$spanDays;
    if ($days > $spanDays) throw new \InvalidArgumentException("'days_count' ({$days}) is more than the {$spanDays} calendar days in the range.");

    $defaults = mcp_employee_defaults($pdo);
    $typeIds = array_column($defaults['vacationTypes'], 'id');
    $typeId = (string)($args['vacation_type_id'] ?? 'annual');
    if (!in_array($typeId, $typeIds, true)) throw new \InvalidArgumentException("Unknown vacation_type_id '{$typeId}'. Configured types: " . implode(', ', $typeIds) . '.');
    $status = mcp_enum($args, 'status', ['requested', 'approved', 'rejected', 'taken'], 'requested');

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

function mcp_financial_summary_connected(\PDO $pdo, int $year): array {
    $byId = mcp_fin_categories($pdo);
    $agg = mcp_fin_aggregate(mcp_fin_load($pdo, '1=1'), $byId, mcp_year_columns($year), mcp_today());
    $t = ['income' => ['real' => 0.0, 'estimated' => 0.0], 'expense' => ['real' => 0.0, 'estimated' => 0.0]];
    foreach (['income', 'expense'] as $type) {
        foreach ($agg['totalsByType'][$type] as $c) { $t[$type]['real'] += $c['real']; $t[$type]['estimated'] += $c['estimated']; }
    }
    $out = [
        'mode' => 'connected', 'year' => $year, 'currency' => mcp_currency($pdo),
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
