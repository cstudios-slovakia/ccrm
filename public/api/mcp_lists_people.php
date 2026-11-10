<?php
/**
 * MCP list tools rebuilt on the shared window (mcp_window.php), area: people, stock, workflows, registries.
 * See docs/audits/mcp-change-visibility-audit.md (RC1, RC2, RC4, RC6, RC8). Each tool keeps its permission
 * gate (mcp.php / mcp_ext_ops.php tool table) and every scope clause it had; a window only narrows.
 *
 * The cases in mcp.php / mcp_ext_ops.php call the mcp_<tool>() functions below.
 */

/** Roster: name order as before, 200 rows a page (the old hard cap), the rest by offset. */
const MCP_EMPLOYEE_WINDOW = [
    'created' => 'created_at', 'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['name' => ['name', 'ASC']], 'default_sort' => 'name', 'default_limit' => 200, 'max_limit' => 200,
];

/** Payroll records: newest period first. Period = year * 100 + month/week number. */
const MCP_SALARY_WINDOW = [
    'created' => 'es.created_at', 'updated' => 'es.updated_at', 'id' => 'es.id',
    'sorts' => ['period' => ['(es.year * 100 + es.period_number)', 'DESC']], 'default_sort' => 'period', 'default_limit' => 500, 'max_limit' => 500,
];

/** Leave entries: latest start first. They had no LIMIT at all; the default is generous. */
const MCP_VACATION_WINDOW = [
    'created' => 'ev.created_at', 'updated' => 'ev.updated_at', 'id' => 'ev.id',
    'sorts' => ['start_date' => ['ev.start_date', 'DESC']], 'default_sort' => 'start_date', 'default_limit' => 1000, 'max_limit' => 1000,
];

/** Users, for assigning work. */
const MCP_TEAM_WINDOW = [
    'created' => 'created_at', 'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['name' => ['name', 'ASC']], 'default_sort' => 'name', 'default_limit' => 200, 'max_limit' => 500,
];

const MCP_INVENTORY_WINDOW = [
    'created' => 'i.created_at', 'updated' => 'i.updated_at', 'id' => 'i.id',
    'sorts' => ['name' => ['i.name', 'ASC']], 'default_sort' => 'name',
];

const MCP_SUPPLIER_WINDOW = [
    'created' => 'created_at', 'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['name' => ['name', 'ASC']], 'default_sort' => 'name',
];

/** Movement documents: business time (issued_at) first, change time through sort_by=updated_at. */
const MCP_STOCK_MOVEMENT_WINDOW = [
    'created' => 'm.created_at', 'updated' => 'm.updated_at', 'id' => 'm.id',
    'sorts' => ['issued_at' => ['m.issued_at', 'DESC']], 'default_sort' => 'issued_at',
];

/** Batches: soonest expiry first; they had a hard cap of 200. */
const MCP_BATCH_WINDOW = [
    'created' => 'b.created_at', 'updated' => 'b.updated_at', 'id' => 'b.id',
    'sorts' => ['expiration_date' => ['b.expiration_date', 'ASC']], 'default_sort' => 'expiration_date', 'default_limit' => 200, 'max_limit' => 200,
];

/** Runs of one workflow: newest first. workflow_logs rows are never edited, so there is no updated_at. */
const MCP_WORKFLOW_RUN_WINDOW = [
    'created' => 'created_at', 'updated' => null, 'id' => 'id', 'default_sort' => 'created_at', 'default_limit' => 20,
];

/** Rows of a custom registry. The columns that exist differ per registry: mcp_unified_rows_window() trims it. */
const MCP_REGISTRY_ROW_WINDOW = [
    'created' => 'created_at', 'updated' => 'updated_at', 'id' => 'id',
    'sorts' => ['due_date' => ['due_date', 'ASC']], 'default_sort' => 'created_at', 'default_limit' => 50,
];

/**
 * A DATETIME the app writes as local wall time (employee_salaries.closed_at: date('Y-m-d H:i:s') in sync.php)
 * as an ISO 8601 moment with the app's offset. UNIX_TIMESTAMP() would read it in the MySQL zone, which is wrong.
 */
function mcp_people_local_iso($value): ?string {
    if ($value === null || $value === '') return null;
    $ts = strtotime((string)$value);
    return $ts === false ? (string)$value : date('c', $ts);
}

/** "UNIX_TIMESTAMP(a.created_at) AS created_at__ts, UNIX_TIMESTAMP(a.updated_at) AS updated_at__ts" for a table alias ('' = none). */
function mcp_people_moments_sql(string $alias = ''): string {
    $p = $alias === '' ? '' : $alias . '.';
    return mcp_moment_select($p . 'created_at', 'created_at') . ', ' . mcp_moment_select($p . 'updated_at', 'updated_at');
}

/** A payroll record: created_at / updated_at as ISO moments, closed_at (local DATETIME) as ISO. */
function mcp_people_salary_row(array $row): array {
    $row = mcp_row_moments($row);
    if (array_key_exists('closed_at', $row)) $row['closed_at'] = mcp_people_local_iso($row['closed_at']);
    return $row;
}

// ---------------------------------------------------------------------------------------- team

function mcp_list_team_members(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    if (!empty($args['role'])) {
        $where[] = 'role = ?';
        $params[] = $args['role'];
    }
    if (!empty($args['search'])) {
        $where[] = '(name LIKE ? OR email LIKE ?)';
        $params[] = '%' . $args['search'] . '%';
        $params[] = '%' . $args['search'] . '%';
    }
    $win = mcp_list_window($args, MCP_TEAM_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    // CRITICAL: NEVER select password_hash or session secrets!
    $stmt = $pdo->prepare('SELECT id, name, email, role, avatar, color, ' . mcp_people_moments_sql() . '
                           FROM users WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map('mcp_row_moments', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

// ---------------------------------------------------------------------------------------- employees

function mcp_list_employees(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    if (!empty($args['search'])) {
        $s = '%' . trim($args['search']) . '%';
        if (mcp_can('employees.personal')) {
            $where[] = '(name LIKE ? OR `position` LIKE ? OR `department` LIKE ? OR email LIKE ? OR pin LIKE ? OR phone LIKE ? OR company_id LIKE ? OR tax_id LIKE ? OR vat_id LIKE ?)';
            $params = array_merge($params, [$s, $s, $s, $s, $s, $s, $s, $s, $s]);
        } else {
            // A search that matched on a PIN or phone would confirm one to someone who may not read it.
            $where[] = '(name LIKE ? OR `position` LIKE ? OR `department` LIKE ? OR email LIKE ? OR company_id LIKE ? OR tax_id LIKE ? OR vat_id LIKE ?)';
            $params = array_merge($params, [$s, $s, $s, $s, $s, $s, $s]);
        }
    }
    if (!empty($args['kind'])) {
        if (!in_array($args['kind'], CCRM_EMPLOYEE_KINDS, true)) throw new \Exception('kind must be one of: ' . implode(', ', CCRM_EMPLOYEE_KINDS) . '.');
        $where[] = 'kind = ?';
        $params[] = $args['kind'];
    }
    foreach (['position', 'department'] as $f) {
        if (!empty($args[$f])) {
            $where[] = "`$f` = ?";
            $params[] = trim((string)$args[$f]);
        }
    }
    if (!isset($args['active_only']) || !empty($args['active_only'])) {
        $where[] = 'is_active = 1';
    }
    $win = mcp_list_window($args, MCP_EMPLOYEE_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    $stmt = $pdo->prepare('SELECT id, name, first_name, last_name, kind, company_id, tax_id, vat_id, `position`, `department`, user_id, pin, email, phone, address_street, address_city, address_zip, address_country, salary_type, salary_amount, salary_due_day, vacation_allowances_json, time_tracking_user_name, auto_expense, is_active, '
        . mcp_people_moments_sql() . ' FROM employees WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map(static fn($r) => mcp_label_employee(mcp_project_employee(mcp_row_moments($r))), $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function mcp_get_employee(\PDO $pdo, array $user, array $args): array {
    $stmt = $pdo->prepare('SELECT *, ' . mcp_people_moments_sql() . ' FROM employees WHERE id = ? LIMIT 1');
    $stmt->execute([$args['id']]);
    $emp = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$emp) throw new \Exception('Employee not found with ID: ' . $args['id']);
    $emp = mcp_row_moments($emp);

    // Pay records only with employees.salaries, leave only with employees.vacations
    if (mcp_can('employees.salaries')) {
        $salStmt = $pdo->prepare('SELECT *, ' . mcp_people_moments_sql() . ' FROM employee_salaries WHERE employee_id = ? ORDER BY year DESC, period_number DESC LIMIT 12');
        $salStmt->execute([$args['id']]);
        $emp['salaries'] = array_map('mcp_people_salary_row', $salStmt->fetchAll(\PDO::FETCH_ASSOC));
    }
    $emp = mcp_label_employee(mcp_project_employee($emp));

    if (mcp_can('employees.vacations')) {
        $vacStmt = $pdo->prepare('SELECT *, ' . mcp_people_moments_sql() . ' FROM employee_vacations WHERE employee_id = ? ORDER BY start_date DESC LIMIT 20');
        $vacStmt->execute([$args['id']]);
        $emp['vacations'] = array_map('mcp_row_moments', $vacStmt->fetchAll(\PDO::FETCH_ASSOC));
    }
    return $emp;
}

function mcp_list_salaries(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    if (!empty($args['employee_id'])) {
        $where[] = 'es.employee_id = ?';
        $params[] = $args['employee_id'];
    }
    if (!empty($args['year'])) {
        $where[] = 'es.year = ?';
        $params[] = (int)$args['year'];
    }
    if (!empty($args['period_key'])) {
        $where[] = 'es.period_key = ?';
        $params[] = $args['period_key'];
    }
    // Business dates (DATE columns): the payout's due day and the day it was paid.
    foreach (['due' => 'es.due_date', 'payment' => 'es.payment_date'] as $field => $col) {
        [$w, $p] = mcp_date_range($args, $field, $col);
        $where = array_merge($where, $w);
        $params = array_merge($params, $p);
    }
    $win = mcp_list_window($args, MCP_SALARY_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    $stmt = $pdo->prepare('SELECT es.*, e.name AS employee_name, ' . mcp_people_moments_sql('es') . '
        FROM employee_salaries es
        JOIN employees e ON es.employee_id = e.id
        WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map('mcp_people_salary_row', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function mcp_list_vacations(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    if (!empty($args['employee_id'])) {
        $where[] = 'ev.employee_id = ?';
        $params[] = $args['employee_id'];
    }
    if (!empty($args['status'])) {
        $where[] = 'ev.status = ?';
        $params[] = $args['status'];
    }
    if (!empty($args['year'])) {
        $where[] = 'YEAR(ev.start_date) = ?';
        $params[] = (int)$args['year'];
    }
    // Overlap, not containment: an entry counts when any of its days falls inside from..to.
    $from = mcp_optional_date($args, 'from');
    $to = mcp_optional_date($args, 'to');
    if ($from !== null && $to !== null && $from > $to) throw new \InvalidArgumentException("'from' is after 'to'.");
    if ($to !== null) { $where[] = 'ev.start_date <= ?'; $params[] = $to; }
    if ($from !== null) { $where[] = 'ev.end_date >= ?'; $params[] = $from; }
    $win = mcp_list_window($args, MCP_VACATION_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    $stmt = $pdo->prepare('SELECT ev.*, e.name AS employee_name, ' . mcp_people_moments_sql('ev') . '
        FROM employee_vacations ev
        JOIN employees e ON ev.employee_id = e.id
        WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map('mcp_row_moments', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

/** Vacation used / allowance / left per type, and who is on leave on $on_date (default today, the app's date). */
function mcp_vacation_on_leave(\PDO $pdo, string $date): array {
    $on = $pdo->prepare("SELECT DISTINCT e.id, e.name FROM employee_vacations v JOIN employees e ON e.id = v.employee_id WHERE v.status <> 'rejected' AND ? BETWEEN v.start_date AND v.end_date AND e.is_active = 1");
    $on->execute([$date]);
    return $on->fetchAll(\PDO::FETCH_ASSOC);
}

// ---------------------------------------------------------------------------------------- stock

function mcp_list_inventory_items(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    if (!empty($args['category'])) {
        $where[] = 'i.category = ?';
        $params[] = $args['category'];
    }
    if (!empty($args['search'])) {
        $term = '%' . $args['search'] . '%';
        $where[] = '(i.name LIKE ? OR i.sku LIKE ? OR i.barcode LIKE ? OR i.alt_codes_json LIKE ? OR i.external_id LIKE ?)';
        array_push($params, $term, $term, $term, $term, $term);
    }
    $having = !empty($args['low_stock_only']) ? 'HAVING current_stock <= i.min_stock' : '';
    $win = mcp_list_window($args, MCP_INVENTORY_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);

    $stmt = $pdo->prepare('SELECT i.id, i.sku, i.barcode, i.name, i.category, i.unit, i.min_stock, i.default_sell_price, i.avg_purchase_price,
                                  i.vat_rate, i.pack_quantity, i.pack_unit, i.weight_kg, i.external_source, i.external_id, i.alt_codes_json,
                                  COALESCE(SUM(s.quantity), 0) AS current_stock, ' . mcp_people_moments_sql('i') . '
           FROM warehouse_items i
           LEFT JOIN warehouse_stock s ON i.id = s.item_id
           WHERE ' . implode(' AND ', $where) . "
           GROUP BY i.id
           $having
           " . $win['tail']);
    $stmt->execute($params);
    return array_map(static fn($r) => mcp_inventory_row(mcp_row_moments($r)), $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function mcp_get_inventory_item(\PDO $pdo, array $user, array $args): array {
    $stmt = $pdo->prepare('SELECT *, ' . mcp_people_moments_sql() . ' FROM warehouse_items WHERE id = ?');
    $stmt->execute([$args['id']]);
    $item = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$item) {
        throw new \Exception('Warehouse item not found with ID: ' . $args['id']);
    }
    $item = mcp_row_moments($item);

    $stkStmt = $pdo->prepare(
        'SELECT s.warehouse_id, w.name AS warehouse_name, s.quantity, s.reserved_quantity, s.location
         FROM warehouse_stock s
         JOIN warehouses w ON s.warehouse_id = w.id
         WHERE s.item_id = ?'
    );
    $stkStmt->execute([$args['id']]);
    $item['stock_breakdown'] = $stkStmt->fetchAll(\PDO::FETCH_ASSOC);
    $item = mcp_inventory_row($item);
    // One price per price level (Settings → Price levels), named; default_sell_price stays the fallback.
    $priceStmt = $pdo->prepare('SELECT price_level_id, price FROM warehouse_item_prices WHERE item_id = ?');
    $priceStmt->execute([$args['id']]);
    $byLevel = $priceStmt->fetchAll(\PDO::FETCH_KEY_PAIR);
    $item['price_levels'] = [];
    foreach (ccrm_price_levels($pdo) as $level) {
        if (isset($byLevel[$level['id']])) {
            $item['price_levels'][] = ['id' => $level['id'], 'name' => $level['name'], 'price' => (float)$byLevel[$level['id']]];
        }
    }
    return $item;
}

function mcp_list_suppliers(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    if (!empty($args['search'])) {
        $t = '%' . $args['search'] . '%';
        $where[] = '(name LIKE ? OR company_id LIKE ? OR email LIKE ?)';
        array_push($params, $t, $t, $t);
    }
    $win = mcp_list_window($args, MCP_SUPPLIER_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    $stmt = $pdo->prepare('SELECT id, name, company_id, tax_id, vat_id, street, city, postal_code, country, email, phone, website, payment_due_days, ' . mcp_people_moments_sql()
        . ' FROM suppliers WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map('mcp_row_moments', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function mcp_list_stock_movements(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    $type = mcp_enum($args, 'type', ['inward', 'outward', 'transfer', 'adjustment']);
    if ($type) { $where[] = 'm.type = ?'; $params[] = $type; }
    if (!empty($args['warehouse_id'])) { $where[] = '(m.warehouse_id = ? OR m.target_warehouse_id = ?)'; array_push($params, (string)$args['warehouse_id'], (string)$args['warehouse_id']); }
    if (!empty($args['item_id'])) { $where[] = 'EXISTS (SELECT 1 FROM warehouse_movement_items mi WHERE mi.movement_id = m.id AND mi.item_id = ?)'; $params[] = (string)$args['item_id']; }
    // issued_at is a DATETIME the app fills with local wall time: filter it as such (a bare date still means the whole day).
    [$w, $p] = mcp_local_range($args, 'from', 'to', 'm.issued_at');
    $where = array_merge($where, $w);
    $params = array_merge($params, $p);
    $win = mcp_list_window($args, MCP_STOCK_MOVEMENT_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    $stmt = $pdo->prepare('SELECT m.id, m.document_number, m.type, m.status, m.warehouse_id, m.target_warehouse_id, m.supplier_id, m.lead_id, m.total_cost_value, m.total_sell_value, m.total_profit_value, m.created_by, m.note, m.issued_at,
                                  (SELECT COUNT(*) FROM warehouse_movement_items mi WHERE mi.movement_id = m.id) AS items_count, ' . mcp_people_moments_sql('m') . '
           FROM warehouse_movements m WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map('mcp_row_moments', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

function mcp_list_batches(\PDO $pdo, array $user, array $args): array {
    $where = ['1=1'];
    $params = [];
    if (isset($args['expiring_within_days'])) {
        // The app's "today" (PHP), not MySQL CURDATE(), which runs in the server's zone.
        $where[] = 'b.expiration_date <= ?';
        $params[] = mcp_iso_shift(mcp_today(), max(0, (int)$args['expiring_within_days']));
    }
    if (!empty($args['item_id'])) { $where[] = 'b.item_id = ?'; $params[] = (string)$args['item_id']; }
    if (!empty($args['warehouse_id'])) { $where[] = 'b.warehouse_id = ?'; $params[] = (string)$args['warehouse_id']; }
    if (empty($args['include_empty'])) $where[] = 'b.current_quantity > 0';
    $win = mcp_list_window($args, MCP_BATCH_WINDOW);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    $stmt = $pdo->prepare('SELECT b.id, b.item_id, i.name AS item_name, b.warehouse_id, b.batch_number, b.expiration_date, b.initial_quantity, b.current_quantity, ' . mcp_people_moments_sql('b') . '
           FROM warehouse_batches b JOIN warehouse_items i ON i.id = b.item_id WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map('mcp_row_moments', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

// ---------------------------------------------------------------------------------------- categories

function mcp_list_client_categories(\PDO $pdo): array {
    $rows = $pdo->query('SELECT id, name, parent_id, level, sort_order, color, ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM client_categories ORDER BY level ASC, sort_order ASC, name ASC, id ASC')->fetchAll(\PDO::FETCH_ASSOC);
    return array_map('mcp_row_moments', $rows);
}

/** The ledger's category tree with the moment each category last changed (mcp_fin_categories() does not select it). */
function mcp_financial_category_moments(\PDO $pdo): array {
    $out = [];
    foreach ($pdo->query('SELECT id, ' . mcp_moment_select('updated_at', 'updated_at') . ' FROM financial_categories')->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $out[$r['id']] = mcp_format_moment($r['updated_at__ts']);
    }
    return $out;
}

// ---------------------------------------------------------------------------------------- workflows

function mcp_list_workflows(\PDO $pdo): array {
    $rows = $pdo->query('SELECT w.id, w.name, w.description, w.is_active, w.trigger_type,
            (SELECT UNIX_TIMESTAMP(MAX(created_at)) FROM workflow_logs l WHERE l.workflow_id = w.id) AS last_run__ts,
            (SELECT status FROM workflow_logs l WHERE l.workflow_id = w.id ORDER BY created_at DESC, id ASC LIMIT 1) AS last_status,
            w.nodes_json, ' . mcp_people_moments_sql('w') . '
         FROM workflows w ORDER BY w.name ASC, w.id ASC')->fetchAll(\PDO::FETCH_ASSOC);
    return array_map(function ($r) {
        $nodes = json_decode((string)$r['nodes_json'], true);
        unset($r['nodes_json']);
        $r = mcp_row_moments($r);
        $r['is_active'] = (int)$r['is_active'] === 1;
        $r['node_count'] = is_array($nodes) ? count($nodes) : 0;
        return $r;
    }, $rows);
}

function mcp_get_workflow_runs(\PDO $pdo, array $user, array $args): array {
    $wid = mcp_require_string($args, 'workflow_id');
    $win = mcp_list_window($args, MCP_WORKFLOW_RUN_WINDOW);
    $where = array_merge(['workflow_id = ?'], $win['where']);
    $params = array_merge([$wid], $win['params']);
    $stmt = $pdo->prepare('SELECT id, status, execution_time_ms, trigger_event, ' . mcp_moment_select('created_at', 'created_at')
        . ' FROM workflow_logs WHERE ' . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map('mcp_row_moments', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

// ---------------------------------------------------------------------------------------- registries

function mcp_get_unified_entry_rows(\PDO $pdo, array $user, array $args): array {
    $rid = mcp_require_string($args, 'registry_id');
    $chk = $pdo->prepare('SELECT id FROM unified_entries WHERE id = ?');
    $chk->execute([$rid]);
    $realId = $chk->fetchColumn();
    if (!$realId) throw new \Exception("Registry not found with ID: {$rid}");
    $table = 'ue_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$realId));
    if ($pdo->query('SHOW TABLES LIKE ' . $pdo->quote($table))->rowCount() === 0) return [];

    // Each registry table has the columns its modules asked for: build the window from what is there.
    $types = [];
    foreach ($pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(\PDO::FETCH_ASSOC) as $c) {
        $types[$c['Field']] = strtolower((string)$c['Type']);
    }
    $cols = MCP_REGISTRY_ROW_WINDOW;
    if (!isset($types['created_at'])) { $cols['created'] = null; unset($cols['default_sort']); }
    if (!isset($types['updated_at'])) $cols['updated'] = null;
    $hasDue = ($types['due_date'] ?? '') === 'date';
    if (!$hasDue) unset($cols['sorts']);

    $where = ['1=1'];
    $params = [];
    $bucket = mcp_enum($args, 'bucket', ['overdue', 'today', 'tomorrow', 'upcoming']);
    $asked = $bucket !== null || ($args['due_from'] ?? '') !== '' || ($args['due_to'] ?? '') !== '';
    if ($asked && !$hasDue) {
        throw new \InvalidArgumentException("This registry has no due date column: 'due_from', 'due_to' and 'bucket' are not available.");
    }
    if ($hasDue) {
        [$w, $p] = mcp_date_range($args, 'due', 'due_date');
        [$bw, $bp] = mcp_date_bucket($bucket, 'due_date');
        $where = array_merge($where, $w, $bw);
        $params = array_merge($params, $p, $bp);
    }
    $win = mcp_list_window($args, $cols);
    $where = array_merge($where, $win['where']);
    $params = array_merge($params, $win['params']);
    $moments = array_filter([
        isset($types['created_at']) ? mcp_moment_select('created_at', 'created_at') : null,
        isset($types['updated_at']) ? mcp_moment_select('updated_at', 'updated_at') : null,
    ]);
    $stmt = $pdo->prepare("SELECT *" . ($moments ? ', ' . implode(', ', $moments) : '') . " FROM `{$table}` WHERE " . implode(' AND ', $where) . ' ' . $win['tail']);
    $stmt->execute($params);
    return array_map('mcp_row_moments', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

/** The window of get_unified_entry_rows as the tool definition can state it (the due-date filters depend on the registry). */
function mcp_unified_rows_props(): array {
    return mcp_window_props(MCP_REGISTRY_ROW_WINDOW)
        + mcp_date_range_props('due', 'Due date (registries with a due date column only)')
        + mcp_bucket_prop('due date (registries with a due date column only)', false);
}
