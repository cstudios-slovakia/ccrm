<?php
/**
 * CCRM MCP gateway — shared helpers and the finance / project tools (audit Part B).
 *
 * Required by mcp.php. Functions and constants only: nothing here runs on include.
 *
 * Every figure in this file is a PHP port of a TypeScript function the app uses, and the
 * port names its source so a change on one side is found on the other:
 *
 *   splitRecordAmounts, overviewRecordDate, recurringOwnRowCharge   src/utils/financialOverviewTable.ts
 *   recurringOccurrences, recurringAmountsAt, effectiveRecurringEndDate   src/utils/recurringExpenses.ts
 *   projectFutureMovements                                          src/utils/futureMovements.ts
 *   resolveProjectValue, projectBilling                             src/utils/projectBilling.ts
 *
 * scripts/probe-mcp-parity.mjs runs the TypeScript originals and these ports on the same
 * fixture and fails when they disagree.
 */

/**
 * System settings the tools may read *internally* to classify records (decision D1). They are
 * never returned as stored. Anything not listed here (integration tokens, mail credentials,
 * RBAC, licence) is unreachable from MCP.
 */
const MCP_CONFIG_KEYS = [
    'LEAD_STATES', 'LEAD_STAGE_GROUPS', 'LEAD_STATE_PARENTS', 'LEAD_STATE_SLA',
    'TASK_STATES', 'SYSTEM_CURRENCY', 'FINANCIAL_MODE',
];

/**
 * Employee columns only holders of employees.salaries may see or write.
 * Declared here, not in mcp.php: a top-level const runs when execution reaches it, and mcp.php exits
 * from its request handler before reaching anything declared below it.
 */
const MCP_EMPLOYEE_SENSITIVE = ['pin', 'salary_type', 'salary_amount', 'salary_due_day', 'vacation_allowances_json', 'files_json', 'notes'];

function mcp_config_raw(\PDO $pdo, string $key): ?string {
    static $cache = [];
    if (!in_array($key, MCP_CONFIG_KEYS, true)) {
        throw new \LogicException("MCP may not read setting {$key}.");
    }
    if (!array_key_exists($key, $cache)) {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
        $stmt->execute([$key]);
        $v = $stmt->fetchColumn();
        $cache[$key] = ($v === false || $v === null || $v === '') ? null : (string)$v;
    }
    return $cache[$key];
}

function mcp_config_json(\PDO $pdo, string $key, $default = []) {
    $raw = mcp_config_raw($pdo, $key);
    if ($raw === null) return $default;
    $decoded = json_decode($raw, true);
    return $decoded === null ? $default : $decoded;
}

/** The workspace's finance mode: 'connected' (live ledger) or 'simplified' (spreadsheet matrix). */
function mcp_finance_mode(\PDO $pdo): string {
    return mcp_config_raw($pdo, 'FINANCIAL_MODE') === 'simplified' ? 'simplified' : 'connected';
}

function mcp_currency(\PDO $pdo): string {
    $raw = mcp_config_raw($pdo, 'SYSTEM_CURRENCY');
    if ($raw === null) return 'EUR';
    $decoded = json_decode($raw, true);
    $code = is_string($decoded) ? $decoded : $raw;
    return preg_match('/^[A-Za-z]{3}$/', $code) ? strtoupper($code) : 'EUR';
}

function mcp_today(): string { return date('Y-m-d'); }

function mcp_round2($n): float { return round((float)$n, 2); }

function mcp_iso_ok($v): bool {
    return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) === 1;
}

/** Ids / amounts / enums arrive from an AI client: say what is wrong instead of a SQL error. */
function mcp_require_string(array $args, string $key): string {
    $v = isset($args[$key]) ? trim((string)$args[$key]) : '';
    if ($v === '') throw new \InvalidArgumentException("'{$key}' is required.");
    return $v;
}

function mcp_require_date(array $args, string $key): string {
    $v = mcp_require_string($args, $key);
    if (!mcp_iso_ok($v) || !checkdate((int)substr($v, 5, 2), (int)substr($v, 8, 2), (int)substr($v, 0, 4))) {
        throw new \InvalidArgumentException("'{$key}' must be a date in YYYY-MM-DD format.");
    }
    return $v;
}

function mcp_optional_date(array $args, string $key): ?string {
    if (!isset($args[$key]) || $args[$key] === '') return null;
    return mcp_require_date($args, $key);
}

function mcp_number(array $args, string $key, bool $required = false, ?float $min = null, ?float $max = null): ?float {
    if (!isset($args[$key]) || $args[$key] === '') {
        if ($required) throw new \InvalidArgumentException("'{$key}' is required.");
        return null;
    }
    if (!is_numeric($args[$key]) || !is_finite((float)$args[$key])) {
        throw new \InvalidArgumentException("'{$key}' must be a number.");
    }
    $n = (float)$args[$key];
    if ($min !== null && $n < $min) throw new \InvalidArgumentException("'{$key}' must be at least {$min}.");
    if ($max !== null && $n > $max) throw new \InvalidArgumentException("'{$key}' must be at most {$max}.");
    return $n;
}

function mcp_enum(array $args, string $key, array $allowed, ?string $default = null): ?string {
    if (!isset($args[$key]) || $args[$key] === '') return $default;
    $v = (string)$args[$key];
    if (!in_array($v, $allowed, true)) {
        throw new \InvalidArgumentException("'{$key}' must be one of: " . implode(', ', $allowed) . '.');
    }
    return $v;
}

function mcp_limit(array $args, int $default = 50, int $max = 100): int {
    return min(max(1, (int)($args['limit'] ?? $default)), $max);
}

function mcp_new_id(string $prefix): string { return $prefix . bin2hex(random_bytes(8)); }

/** Run $fn in a transaction; the caller's exception is rethrown after the rollback. */
function mcp_tx(\PDO $pdo, callable $fn) {
    $owns = !$pdo->inTransaction();
    if ($owns) $pdo->beginTransaction();
    try {
        $r = $fn();
        if ($owns) $pdo->commit();
        return $r;
    } catch (\Throwable $e) {
        if ($owns && $pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

/** UTC date arithmetic on YYYY-MM-DD strings (the TS code works in UTC for the same reason). */
function mcp_iso_shift(string $iso, int $days): string {
    $d = new \DateTimeImmutable($iso . ' 00:00:00', new \DateTimeZone('UTC'));
    return $d->modify(($days >= 0 ? '+' : '') . $days . ' days')->format('Y-m-d');
}

/** addIsoMonths: keeps the day of month where the target month is long enough. */
function mcp_iso_add_months(string $iso, int $months): string {
    if (!mcp_iso_ok($iso)) return $iso;
    [$y, $m, $d] = array_map('intval', explode('-', $iso));
    $firstOfTarget = gmmktime(0, 0, 0, $m + $months, 1, $y);
    $last = (int)gmdate('t', $firstOfTarget);
    return gmdate('Y-m', $firstOfTarget) . '-' . str_pad((string)min($d, $last), 2, '0', STR_PAD_LEFT);
}

// ============================================================================
// Recurring rules  (port of src/utils/recurringExpenses.ts)
// ============================================================================

function mcp_dim(int $year, int $month0): int {
    return (int)gmdate('t', gmmktime(0, 0, 0, $month0 + 1, 1, $year));
}

function mcp_clamp_day(int $year, int $month0, $day): int {
    $d = (int)round((float)$day);
    if ($d === 0) $d = 1;
    return min(max($d, 1), mcp_dim($year, $month0));
}

function mcp_iso_ymd(int $year, int $month0, int $day): string {
    return gmdate('Y-m-d', gmmktime(0, 0, 0, $month0 + 1, $day, $year));
}

function mcp_nth_weekday(int $year, int $month0, int $weekday, int $nth): string {
    $firstDow = (int)gmdate('w', gmmktime(0, 0, 0, $month0 + 1, 1, $year));
    $offset = ($weekday - $firstDow + 7) % 7;
    $dim = mcp_dim($year, $month0);
    if ($nth <= 0 || $nth > 4) {
        $day = 1 + $offset;
        while ($day + 7 <= $dim) $day += 7;
        return mcp_iso_ymd($year, $month0, $day);
    }
    $day = 1 + $offset + ($nth - 1) * 7;
    return mcp_iso_ymd($year, $month0, $day > $dim ? $day - 7 : $day);
}

function mcp_monthly_occurrence(array $config, int $year, int $month0): string {
    if (($config['monthlyType'] ?? null) === 'nth_weekday') {
        return mcp_nth_weekday($year, $month0, ((int)($config['dayOfWeek'] ?? 1)) % 7, (int)($config['weekOfMonth'] ?? 1));
    }
    return mcp_iso_ymd($year, $month0, mcp_clamp_day($year, $month0, $config['dayOfMonth'] ?? 1));
}

/** effectiveRecurringEndDate */
function mcp_rec_end_date(array $rule): ?string {
    $explicit = mcp_iso_ok($rule['recurringEndDate'] ?? null) ? $rule['recurringEndDate'] : null;
    if (($rule['status'] ?? null) !== 'cancelled') return $explicit;
    $updated = isset($rule['updatedAt']) ? substr((string)$rule['updatedAt'], 0, 10) : '';
    $legacy = mcp_iso_ok($updated) ? $updated : (mcp_iso_ok($rule['issueDate'] ?? null) ? $rule['issueDate'] : null);
    if ($legacy === null) return $explicit;
    if ($explicit === null) return $legacy;
    return $legacy < $explicit ? $legacy : $explicit;
}

function mcp_rec_scheduled(array $rule, string $startIso, string $endIso): array {
    if (!mcp_iso_ok($startIso) || !mcp_iso_ok($endIso)) return [];
    $effectiveEnd = mcp_rec_end_date($rule);
    $from = (mcp_iso_ok($rule['recurringStartDate'] ?? null) && $rule['recurringStartDate'] > $startIso) ? $rule['recurringStartDate'] : $startIso;
    $to = ($effectiveEnd !== null && $effectiveEnd < $endIso) ? $effectiveEnd : $endIso;
    if ($from > $to) return [];

    $config = is_array($rule['recurringConfig'] ?? null) ? $rule['recurringConfig'] : [];
    $frequency = $rule['recurringFrequency'] ?: 'monthly';
    $dates = [];
    $max = 1000;

    if ($frequency === 'weekly') {
        $weekday = ((int)($config['dayOfWeek'] ?? 1)) % 7;
        $cursor = new \DateTimeImmutable($from . ' 00:00:00', new \DateTimeZone('UTC'));
        $dow = (int)$cursor->format('w');
        $cursor = $cursor->modify('+' . (($weekday - $dow + 7) % 7) . ' days');
        while ($cursor->format('Y-m-d') <= $to && count($dates) < $max) {
            $dates[] = $cursor->format('Y-m-d');
            $cursor = $cursor->modify('+7 days');
        }
        return $dates;
    }

    $fy = (int)substr($from, 0, 4); $fm = (int)substr($from, 5, 2) - 1;
    $ty = (int)substr($to, 0, 4);   $tm = (int)substr($to, 5, 2) - 1;

    if ($frequency === 'yearly') {
        $month0 = min(max(((int)($config['month'] ?? 1)) - 1, 0), 11);
        for ($year = $fy; $year <= $ty; $year++) {
            $occ = mcp_iso_ymd($year, $month0, mcp_clamp_day($year, $month0, $config['dayOfMonth'] ?? 1));
            if ($occ >= $from && $occ <= $to) $dates[] = $occ;
        }
        return $dates;
    }

    $year = $fy; $month = $fm;
    while (($year < $ty || ($year === $ty && $month <= $tm)) && count($dates) < $max) {
        $occ = mcp_monthly_occurrence($config, $year, $month);
        if ($occ >= $from && $occ <= $to) $dates[] = $occ;
        $month++;
        if ($month > 11) { $month = 0; $year++; }
    }
    return $dates;
}

function mcp_rec_occurrences(array $rule, string $startIso, string $endIso): array {
    $scheduled = mcp_rec_scheduled($rule, $startIso, $endIso);
    $skipped = $rule['recurringSkippedDates'] ?? null;
    if (!is_array($skipped) || !$skipped) return $scheduled;
    return array_values(array_filter($scheduled, fn($d) => !in_array($d, $skipped, true)));
}

/** recurringAmountsAt: the planned / real pair in force on $dateIso. */
function mcp_rec_amounts_at(array $rule, string $dateIso): array {
    $current = ['amountPlanned' => (float)($rule['amountPlanned'] ?? 0), 'amountReal' => (float)($rule['amountReal'] ?? 0)];
    $history = $rule['recurringAmountHistory'] ?? null;
    if (!is_array($history) || !$history || !mcp_iso_ok($dateIso)) return $current;
    $match = null;
    foreach ($history as $p) {
        if (!is_array($p) || !mcp_iso_ok($p['until'] ?? null) || $dateIso > $p['until']) continue;
        if ($match === null || $p['until'] < $match['until']) $match = $p;
    }
    return $match
        ? ['amountPlanned' => (float)($match['amountPlanned'] ?? 0), 'amountReal' => (float)($match['amountReal'] ?? 0)]
        : $current;
}

/** recurringPlannedAmountAt: paid-first, falling back to the budget. */
function mcp_rec_amount_at(array $rule, string $dateIso): float {
    $a = mcp_rec_amounts_at($rule, $dateIso);
    return $a['amountReal'] > 0 ? $a['amountReal'] : $a['amountPlanned'];
}

/** recurringCharges: one entry per charge, priced at the amount in force that day. */
function mcp_rec_charges(array $rule, string $startIso, string $endIso): array {
    return array_map(
        fn($d) => ['date' => $d, 'amount' => mcp_rec_amount_at($rule, $d)],
        mcp_rec_occurrences($rule, $startIso, $endIso)
    );
}

// ============================================================================
// Ledger records  (port of src/utils/financialOverviewTable.ts)
// ============================================================================

/** A financial_records row, shaped like the app's FinancialRecord (camelCase, decoded JSON). */
function mcp_fin_record(array $r): array {
    $cfg = json_decode((string)($r['recurring_config_json'] ?? ''), true);
    $hist = json_decode((string)($r['recurring_amount_history_json'] ?? ''), true);
    $skip = json_decode((string)($r['recurring_skipped_dates_json'] ?? ''), true);
    return [
        'id' => $r['id'],
        'type' => $r['type'],
        'subtype' => $r['subtype'],
        'title' => $r['title'],
        'description' => $r['description'] ?? null,
        'categoryId' => $r['category_id'] ?: null,
        'amountPlanned' => (float)$r['amount_planned'],
        'amountReal' => (float)$r['amount_real'],
        'currency' => $r['currency'],
        'status' => $r['status'],
        'issueDate' => $r['issue_date'],
        'dueDate' => $r['due_date'] ?: null,
        'paidDate' => $r['paid_date'] ?: null,
        'paymentMethod' => $r['payment_method'] ?? null,
        'isRecurring' => (int)$r['is_recurring'] === 1,
        'recurringFrequency' => $r['recurring_frequency'] ?: null,
        'recurringConfig' => is_array($cfg) ? $cfg : null,
        'recurringStartDate' => $r['recurring_start_date'] ?: null,
        'recurringEndDate' => $r['recurring_end_date'] ?: null,
        'recurringAmountHistory' => is_array($hist) ? $hist : null,
        'recurringSkippedDates' => is_array($skip) ? $skip : null,
        'projectId' => $r['project_id'] ?: null,
        'clientId' => $r['client_id'] ?: null,
        'invoiceNumber' => $r['invoice_number'] ?: null,
        'updatedAt' => $r['updated_at'] ?? null,
    ];
}

/** @return array[] */
function mcp_fin_load(\PDO $pdo, string $where = '1=1', array $params = [], string $order = 'issue_date DESC, id DESC', ?int $limit = null): array {
    $sql = "SELECT * FROM financial_records WHERE {$where} ORDER BY {$order}" . ($limit !== null ? " LIMIT " . (int)$limit : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return array_map('mcp_fin_record', $stmt->fetchAll(\PDO::FETCH_ASSOC));
}

/** overviewRecordDate: cash basis — paid date, else due date, else issue date. */
function mcp_fin_date(array $rec): string {
    $raw = $rec['paidDate'] ?: ($rec['dueDate'] ?: ($rec['issueDate'] ?: ''));
    return $raw ? substr((string)$raw, 0, 10) : '';
}

/** splitRecordAmounts: [real, estimated] of one record. */
function mcp_fin_split(array $rec): array {
    $amounts = (!empty($rec['isRecurring']) && !empty($rec['recurringAmountHistory']))
        ? mcp_rec_amounts_at($rec, mcp_fin_date($rec))
        : ['amountPlanned' => (float)$rec['amountPlanned'], 'amountReal' => (float)$rec['amountReal']];
    $planned = (float)$amounts['amountPlanned'];
    $real = (float)$amounts['amountReal'];
    $status = $rec['status'];
    if ($status === 'cancelled') return [0.0, 0.0];
    if ($status === 'paid') return [$real != 0.0 ? $real : $planned, 0.0];
    if ($status === 'partially_paid') {
        $expected = $planned != 0.0 ? $planned : $real;
        return [$real, $expected - $real];
    }
    return [0.0, $planned != 0.0 ? $planned : $real];
}

/** recurringOwnRowCharge: a rule's own ledger row when the schedule does not already account for it. */
function mcp_fin_recurring_own_row(array $rec): ?array {
    if (empty($rec['isRecurring'])) return null;
    $date = mcp_fin_date($rec);
    if ($date === '') return null;
    $skipped = $rec['recurringSkippedDates'] ?? null;
    if (is_array($skipped) && in_array($date, $skipped, true)) return null;
    if (count(mcp_rec_charges($rec, '0000-01-01', $date)) > 0) return null;
    [$real, $est] = mcp_fin_split($rec);
    if ($real == 0.0 && $est == 0.0) return null;
    return ['date' => $date, 'real' => $real, 'estimated' => $est];
}

function mcp_fin_categories(\PDO $pdo): array {
    $rows = $pdo->query("SELECT id, type, name, parent_id, level, sort_order, color FROM financial_categories ORDER BY sort_order ASC, name ASC")->fetchAll(\PDO::FETCH_ASSOC);
    $by = [];
    foreach ($rows as $r) { $by[$r['id']] = $r; }
    return $by;
}

/** effectiveParentId: a parent that is missing, itself, or on the other side of the ledger is no parent. */
function mcp_cat_parent(array $cat, array $byId): ?string {
    $pid = $cat['parent_id'] ?? null;
    if (!$pid || $pid === $cat['id']) return null;
    $parent = $byId[$pid] ?? null;
    return ($parent && $parent['type'] === $cat['type']) ? $pid : null;
}

/** @return array{0: string[], 1: string} [ancestor ids, root id] */
function mcp_cat_chain(array $cat, array $byId): array {
    $ancestors = [];
    $seen = [$cat['id'] => true];
    $current = $cat;
    for (;;) {
        $pid = mcp_cat_parent($current, $byId);
        if ($pid === null) return [$ancestors, $current['id']];
        if (isset($seen[$pid])) return [[], $cat['id']];
        $ancestors[] = $pid;
        $seen[$pid] = true;
        $current = $byId[$pid];
    }
}

const MCP_UNCAT = ['expense' => '__uncategorized__expense', 'income' => '__uncategorized__income'];

/** overviewRowIdFor */
function mcp_fin_row_id(array $rec, array $byId): string {
    $cat = $rec['categoryId'] ? ($byId[$rec['categoryId']] ?? null) : null;
    return ($cat && $cat['type'] === $rec['type']) ? $cat['id'] : MCP_UNCAT[$rec['type']];
}

/**
 * aggregateOverviewTable, reduced to what a tool returns: for every column the real / estimated
 * split per row (a category already includes its descendants), the column totals per type, and the
 * movements that fall outside every column.
 *
 * @param array[] $columns each ['id' => string, 'start' => iso, 'end' => iso]
 */
function mcp_fin_aggregate(array $records, array $byId, array $columns, string $todayIso): array {
    $direct = [];
    $addDirect = function (string $row, string $col, float $real, float $est) use (&$direct) {
        if ($real == 0.0 && $est == 0.0) return;
        $direct[$row][$col]['real'] = ($direct[$row][$col]['real'] ?? 0.0) + $real;
        $direct[$row][$col]['estimated'] = ($direct[$row][$col]['estimated'] ?? 0.0) + $est;
    };
    $outside = [
        'expense' => ['count' => 0, 'real' => 0.0, 'estimated' => 0.0],
        'income' => ['count' => 0, 'real' => 0.0, 'estimated' => 0.0],
    ];
    $colAt = function (string $date) use ($columns) {
        foreach ($columns as $c) { if ($date >= $c['start'] && $date <= $c['end']) return $c['id']; }
        return null;
    };

    foreach ($records as $rec) {
        $row = mcp_fin_row_id($rec, $byId);
        if (empty($rec['isRecurring'])) {
            $date = mcp_fin_date($rec);
            if ($date === '') continue;
            [$real, $est] = mcp_fin_split($rec);
            $col = $colAt($date);
            if ($col !== null) {
                $addDirect($row, $col, $real, $est);
            } elseif ($real != 0.0 || $est != 0.0) {
                $outside[$rec['type']]['count']++;
                $outside[$rec['type']]['real'] += $real;
                $outside[$rec['type']]['estimated'] += $est;
            }
            continue;
        }
        foreach ($columns as $c) {
            $real = 0.0; $est = 0.0;
            foreach (mcp_rec_charges($rec, $c['start'], $c['end']) as $ch) {
                if ($ch['date'] <= $todayIso) $real += $ch['amount']; else $est += $ch['amount'];
            }
            if ($real > 0 || $est > 0) $addDirect($row, $c['id'], $real, $est);
        }
        $own = mcp_fin_recurring_own_row($rec);
        if ($own) {
            $col = $colAt($own['date']);
            if ($col !== null) $addDirect($row, $col, $own['real'], $own['estimated']);
        }
    }

    // Roll every category up through its ancestors.
    $cells = [];
    $add = function (string $row, string $col, array $v) use (&$cells) {
        $cells[$row][$col]['real'] = ($cells[$row][$col]['real'] ?? 0.0) + $v['real'];
        $cells[$row][$col]['estimated'] = ($cells[$row][$col]['estimated'] ?? 0.0) + $v['estimated'];
    };
    foreach ($byId as $cat) {
        [$ancestors] = mcp_cat_chain($cat, $byId);
        foreach (array_merge([$cat['id']], $ancestors) as $target) {
            foreach ($columns as $c) {
                $v = $direct[$cat['id']][$c['id']] ?? null;
                if ($v) $add($target, $c['id'], $v);
            }
        }
    }
    foreach (['expense', 'income'] as $type) {
        foreach ($columns as $c) {
            $v = $direct[MCP_UNCAT[$type]][$c['id']] ?? null;
            if ($v) $add(MCP_UNCAT[$type], $c['id'], $v);
        }
    }

    // Section totals: the root rows of each type plus its uncategorized row.
    $byType = ['income' => [], 'expense' => []];
    foreach (['income', 'expense'] as $type) {
        $roots = [MCP_UNCAT[$type] => true];
        foreach ($byId as $cat) {
            if ($cat['type'] === $type) $roots[mcp_cat_chain($cat, $byId)[1]] = true;
        }
        foreach ($columns as $c) {
            $t = ['real' => 0.0, 'estimated' => 0.0];
            foreach (array_keys($roots) as $rowId) {
                $t['real'] += $cells[$rowId][$c['id']]['real'] ?? 0.0;
                $t['estimated'] += $cells[$rowId][$c['id']]['estimated'] ?? 0.0;
            }
            $byType[$type][$c['id']] = $t;
        }
    }

    return ['cells' => $cells, 'totalsByType' => $byType, 'outside' => $outside];
}

function mcp_cell_out(?array $c): array {
    $real = (float)($c['real'] ?? 0); $est = (float)($c['estimated'] ?? 0);
    return ['real' => mcp_round2($real), 'estimated' => mcp_round2($est), 'total' => mcp_round2($real + $est)];
}

/** The twelve monthly columns of a calendar year. */
function mcp_year_columns(int $year): array {
    $cols = [];
    for ($m = 1; $m <= 12; $m++) {
        $id = sprintf('%04d-%02d', $year, $m);
        $cols[] = ['id' => $id, 'start' => $id . '-01', 'end' => $id . '-' . sprintf('%02d', mcp_dim($year, $m - 1))];
    }
    return $cols;
}

// ============================================================================
// Projects  (port of src/utils/projectBilling.ts)
// ============================================================================

/** Column holding a custom project attribute (ccrm_attr_column in sync.php). */
function mcp_attr_column(string $attrId): string {
    return 'attr_' . preg_replace('/[^a-z0-9_]/', '', strtolower($attrId));
}

/** parseMoneyValue(raw).amount — null when the attribute holds no amount. */
function mcp_money_amount($raw): ?float {
    if ($raw === null || $raw === '') return null;
    if (is_int($raw) || is_float($raw)) return is_finite((float)$raw) ? (float)$raw : null;
    if (is_string($raw)) {
        $t = trim($raw);
        if ($t === '') return null;
        if ($t[0] === '{') {
            $raw = json_decode($t, true);
            if (!is_array($raw)) return null;
        } else {
            $n = str_replace(',', '.', $t);
            return is_numeric($n) ? (float)$n : null;
        }
    }
    if (!is_array($raw)) return null;
    $a = $raw['amount'] ?? null;
    if ($a === null || $a === '') return null;
    return is_numeric($a) ? (float)$a : null;
}

/**
 * resolveProjectValue: the contract value of a project. First positive result wins: projects.value,
 * the sum of the project type's money attributes, the custom value attribute, the paired lead's value.
 * `budget` is a cost ceiling and is never used.
 */
function mcp_project_value(\PDO $pdo, array $p, array &$ctx): float {
    $own = (float)($p['value'] ?? 0);
    if ($own > 0) return round($own, 2);

    $typeId = (string)$p['project_type_id'];
    if (!isset($ctx['types'][$typeId])) {
        $stmt = $pdo->prepare("SELECT attributes_json FROM project_types WHERE id = ?");
        $stmt->execute([$typeId]);
        $attrs = json_decode((string)$stmt->fetchColumn(), true);
        $ctx['types'][$typeId] = is_array($attrs) ? $attrs : [];
    }
    $safe = preg_replace('/[^a-z0-9_]/', '', strtolower($typeId));
    $row = null;
    if (!isset($ctx['dataTables'][$safe])) {
        $ctx['dataTables'][$safe] = $pdo->query("SHOW TABLES LIKE " . $pdo->quote('proj_data_' . $safe))->rowCount() > 0;
    }
    if ($ctx['dataTables'][$safe]) {
        $stmt = $pdo->prepare("SELECT * FROM `proj_data_{$safe}` WHERE project_id = ? LIMIT 1");
        $stmt->execute([$p['id']]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: null;
    }
    if ($row) {
        $sum = 0.0;
        foreach ($ctx['types'][$typeId] as $attr) {
            if (!is_array($attr) || ($attr['type'] ?? '') !== 'money' || !isset($attr['id'])) continue;
            $col = mcp_attr_column((string)$attr['id']);
            if (!array_key_exists($col, $row)) continue;
            $amt = mcp_money_amount($row[$col]);
            if ($amt !== null) $sum += $amt;
        }
        if ($sum > 0) return round($sum, 2);
        foreach (['_projectValue', 'value'] as $key) {
            $col = mcp_attr_column($key);
            if (array_key_exists($col, $row)) {
                $n = mcp_money_amount($row[$col]);
                if ($n !== null && $n > 0) return round($n, 2);
            }
        }
    }
    if (!empty($p['lead_id'])) {
        if (!array_key_exists($p['lead_id'], $ctx['leadValue'])) {
            $stmt = $pdo->prepare("SELECT value FROM leads WHERE id = ?");
            $stmt->execute([$p['lead_id']]);
            $ctx['leadValue'][$p['lead_id']] = (float)$stmt->fetchColumn();
        }
        $lv = $ctx['leadValue'][$p['lead_id']];
        if ($lv > 0) return round($lv, 2);
    }
    return 0.0;
}

/** projectBilling: received / invoicedOpen / invoiced / notInvoiced / stillToBePaid / overInvoiced. */
function mcp_project_billing(float $value, array $incomeRecords): array {
    $received = 0.0; $open = 0.0;
    foreach ($incomeRecords as $r) {
        [$real, $est] = mcp_fin_split($r);
        $received += $real;
        $open += $est;
    }
    $invoiced = $received + $open;
    $not = max(0.0, $value - $invoiced);
    return [
        'value' => mcp_round2($value),
        'received' => mcp_round2($received),
        'invoiced_open' => mcp_round2($open),
        'invoiced' => mcp_round2($invoiced),
        'not_invoiced' => mcp_round2($not),
        'still_to_be_paid' => mcp_round2($open + $not),
        'over_invoiced' => $value > 0 ? mcp_round2(max(0.0, $invoiced - $value)) : 0.0,
    ];
}

function mcp_projects_ctx(): array { return ['types' => [], 'dataTables' => [], 'leadValue' => []]; }

/** Income ledger rows grouped by project id. */
function mcp_income_by_project(\PDO $pdo, ?array $projectIds = null): array {
    $where = "type = 'income' AND project_id IS NOT NULL AND project_id <> ''";
    $params = [];
    if ($projectIds !== null) {
        if (!$projectIds) return [];
        $where .= ' AND project_id IN (' . implode(',', array_fill(0, count($projectIds), '?')) . ')';
        $params = array_values($projectIds);
    }
    $by = [];
    foreach (mcp_fin_load($pdo, $where, $params) as $r) { $by[$r['projectId']][] = $r; }
    return $by;
}

/** Lead stage keys that count as closed (isClosedLeadState). */
function mcp_lead_is_closed(string $state, array $groups, array $parents): bool {
    $key = strtolower(trim($state));
    if ($key === '') return false;
    $closed = ['lost', 'rejected', 'accepted', 'won', 'client'];
    if (in_array($key, $closed, true)) return true;
    if (($groups[$key] ?? null) === 'closed') return true;
    $parent = $parents[$key] ?? null;
    if ($parent) {
        $pk = strtolower(trim((string)$parent));
        if (in_array($pk, $closed, true)) return true;
        if (($groups[$pk] ?? null) === 'closed') return true;
    }
    return false;
}

// ============================================================================
// Tool definitions
// ============================================================================

function mcp_ext_fin_tool_definitions(): array {
    $year = ['type' => 'integer', 'description' => 'Calendar year (default: current year)'];
    return [
        [
            'name' => 'get_project_billing_summary',
            'description' => 'How much of each project\'s contract value has come in, is invoiced but unpaid, or is not invoiced yet (the Project page billing block). Same maths as the app: cancelled income rows count as nothing, a partially paid row counts its paid part as received and the rest as invoiced-open. The project value is the first positive of: project value, the project type\'s money attributes, the custom value attribute, the paired lead value (budget is never used).',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'project_id' => ['type' => 'string', 'description' => 'One project; omit for all projects'],
                'status' => ['type' => 'string', 'description' => 'Only projects in this status'],
                'active_only' => ['type' => 'boolean', 'description' => 'Only projects in an open status group (default false)'],
                'include_archived' => ['type' => 'boolean', 'description' => 'Include archived projects (default false)'],
                'limit' => ['type' => 'integer', 'description' => 'Max projects (default 50, max 100)'],
            ]],
        ],
        [
            'name' => 'get_invoicable_summary',
            'description' => 'The "Total Invoicable Active Value" figure: open pipeline value (leads in open stages) plus what can still be invoiced on projects in open statuses. Each project contributes max(0, value − invoiced). Returns groups per stage/status and the grand total. `dashboard_basis_total` reproduces the dashboard tile exactly (which still falls back to project budget and counts cancelled rows); `total` uses the project page maths. Groups you may not see are omitted.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'excluded_statuses' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Lead stages / project statuses to leave out (default: closed ones, as in the app)'],
                'include_rows' => ['type' => 'boolean', 'description' => 'Include one row per lead/project (default false)'],
            ]],
        ],
        [
            'name' => 'get_financial_overview',
            'description' => 'Connected-mode finance overview for a year: real (settled) and estimated (still expected) income and expenses per month and per category, recurring charges expanded on the calendar, cash basis (a movement counts on its paid date, else due date, else issue date). Same model as the Finance overview table.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'year' => $year,
                'by_month' => ['type' => 'boolean', 'description' => 'Add the monthly split to every category row (default false)'],
            ]],
        ],
        [
            'name' => 'list_financial_movements',
            'description' => 'List ledger movements (income and expenses): invoices, payments, salaries, recurring rules. Each row shows the settled and still-expected amount and the date it is filed under.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'type' => ['type' => 'string', 'enum' => ['income', 'expense']],
                'status' => ['type' => 'string', 'enum' => ['planned', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled']],
                'category_id' => ['type' => 'string'], 'project_id' => ['type' => 'string'], 'client_id' => ['type' => 'string'],
                'recurring' => ['type' => 'boolean', 'description' => 'true = only recurring rules, false = only one-off movements'],
                'from' => ['type' => 'string', 'description' => 'Filed on/after (YYYY-MM-DD)'],
                'to' => ['type' => 'string', 'description' => 'Filed on/before (YYYY-MM-DD)'],
                'search' => ['type' => 'string'],
                'limit' => ['type' => 'integer'], 'offset' => ['type' => 'integer'],
            ]],
        ],
        [
            'name' => 'list_financial_categories',
            'description' => 'The income and expense category tree used by the ledger.',
            'inputSchema' => ['type' => 'object', 'properties' => ['type' => ['type' => 'string', 'enum' => ['income', 'expense']]]],
        ],
        [
            'name' => 'list_recurring_movements',
            'description' => 'Recurring income/expense rules with their schedule, current amount, whether they are paused and the next charge date.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'type' => ['type' => 'string', 'enum' => ['income', 'expense']],
                'include_paused' => ['type' => 'boolean', 'description' => 'Include rules that have ended or are paused (default false)'],
            ]],
        ],
        [
            'name' => 'get_cash_flow_forecast',
            'description' => 'Money that has not moved yet over the next N months: recurring charges, unpaid movements by due date, and scheduled ones. Returns month totals and the individual expected transactions.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'months' => ['type' => 'integer', 'description' => 'Months ahead (default 3, max 24)'],
                'include_items' => ['type' => 'boolean', 'description' => 'List every expected transaction (default false, max 200)'],
            ]],
        ],
        [
            'name' => 'get_invoicing_metrics',
            'description' => 'Invoicing KPIs: total value of price offers, total invoiced value (invoices only), counts by type and status, and the offer win rate over decided offers.',
            'inputSchema' => ['type' => 'object', 'properties' => ['year' => ['type' => 'integer', 'description' => 'Only documents issued in this year']]],
        ],
    ];
}

function mcp_ext_fin_permissions(): array {
    $v = fn(string ...$k) => ['view' => $k];
    return [
        'get_project_billing_summary' => $v('projects', 'financial'),
        // visible when the caller can see either side; each group is gated inside
        'get_invoicable_summary' => ['any' => ['leads', 'projects']],
        'get_financial_overview' => $v('financial'),
        'list_financial_movements' => $v('financial'),
        'list_financial_categories' => $v('financial'),
        'list_recurring_movements' => $v('financial'),
        'get_cash_flow_forecast' => $v('financial'),
        'get_invoicing_metrics' => $v('invoices'),
    ];
}

// ============================================================================
// Tool handlers
// ============================================================================

/** Returns the result, or the sentinel MCP_NOT_MINE when $tool belongs to another extension file. */
const MCP_NOT_MINE = '__mcp_not_mine__';

function mcp_ext_fin_execute(\PDO $pdo, array $user, string $tool, array $args) {
    switch ($tool) {
        case 'get_project_billing_summary': {
            $where = ['1=1']; $params = [];
            if (!empty($args['project_id'])) { $where[] = 'p.id = ?'; $params[] = (string)$args['project_id']; }
            if (!empty($args['status'])) { $where[] = 'p.status = ?'; $params[] = (string)$args['status']; }
            if (empty($args['include_archived'])) $where[] = '(p.archived = 0 OR p.archived IS NULL)';
            $stmt = $pdo->prepare("SELECT p.*, l.name AS client_name FROM projects p LEFT JOIN leads l ON l.id = COALESCE(p.client_id, p.lead_id) WHERE " . implode(' AND ', $where) . " ORDER BY p.created_at DESC LIMIT " . mcp_limit($args));
            $stmt->execute($params);
            $projects = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (!empty($args['project_id']) && !$projects) {
                throw new \Exception('Project not found with ID: ' . $args['project_id']);
            }
            $open = null;
            if (!empty($args['active_only'])) {
                $open = array_map(fn($d) => $d['key'], array_filter(ccrm_project_status_defs($pdo), fn($d) => in_array($d['group'], ['new', 'in_progress'], true)));
            }
            $ctx = mcp_projects_ctx();
            $income = mcp_income_by_project($pdo, array_column($projects, 'id'));
            $currency = mcp_currency($pdo);
            $rows = []; $tot = ['value' => 0.0, 'received' => 0.0, 'invoiced_open' => 0.0, 'invoiced' => 0.0, 'not_invoiced' => 0.0, 'still_to_be_paid' => 0.0, 'over_invoiced' => 0.0];
            foreach ($projects as $p) {
                if ($open !== null && !in_array($p['status'], $open, true)) continue;
                $b = mcp_project_billing(mcp_project_value($pdo, $p, $ctx), $income[$p['id']] ?? []);
                foreach ($tot as $k => $_) { $tot[$k] += $b[$k]; }
                $rows[] = array_merge(['project_id' => $p['id'], 'name' => $p['name'] ?: ($p['client_name'] ?: $p['id']), 'status' => $p['status'], 'client_name' => $p['client_name']], $b);
            }
            return ['currency' => $currency, 'projects' => $rows, 'totals' => array_map('mcp_round2', $tot)];
        }

        case 'get_invoicable_summary': {
            $excluded = is_array($args['excluded_statuses'] ?? null) ? array_map('strval', $args['excluded_statuses']) : null;
            $withRows = !empty($args['include_rows']);
            $groups = []; $total = 0.0; $dashTotal = 0.0;
            $currency = mcp_currency($pdo);

            if (mcp_can('leads')) {
                $states = mcp_config_json($pdo, 'LEAD_STATES', []);
                $sg = mcp_config_json($pdo, 'LEAD_STAGE_GROUPS', []);
                $sp = mcp_config_json($pdo, 'LEAD_STATE_PARENTS', []);
                $leadRows = $pdo->query("SELECT id, name, status, value, owner FROM leads WHERE archived = 0 AND id <> 'unassigned-docs' AND id NOT LIKE 'client-%'")->fetchAll(\PDO::FETCH_ASSOC);
                if (!$states) { $states = array_values(array_unique(array_map(fn($l) => $l['status'] ?: 'new', $leadRows))); }
                $items = [];
                foreach ($states as $state) {
                    $sl = strtolower($state);
                    if (!empty($sp[$sl]) || mcp_lead_is_closed($state, $sg, $sp)) continue;
                    if ($excluded !== null && in_array($state, $excluded, true)) continue;
                    $val = 0.0; $count = 0; $rows = [];
                    foreach ($leadRows as $l) {
                        $k = strtolower((string)$l['status']);
                        $target = !empty($sp[$k]) ? strtolower((string)$sp[$k]) : $k;
                        if ($target !== $sl) continue;
                        $val += (float)$l['value']; $count++;
                        if ($withRows) $rows[] = ['id' => $l['id'], 'name' => $l['name'], 'owner' => $l['owner'], 'invoicable' => mcp_round2($l['value'])];
                    }
                    $item = ['status' => $state, 'count' => $count, 'invoicable' => mcp_round2($val)];
                    if ($withRows) $item['rows'] = $rows;
                    $items[] = $item;
                    $total += $val; $dashTotal += $val;
                }
                $groups[] = ['group' => 'leads', 'label' => 'Sales & Pipeline', 'items' => $items, 'invoicable' => mcp_round2(array_sum(array_column($items, 'invoicable')))];
            }

            if (mcp_can('projects') && mcp_can('financial')) {
                $defs = ccrm_project_status_defs($pdo);
                $ctx = mcp_projects_ctx();
                $items = []; $groupTotal = 0.0;
                foreach ($defs as $d) {
                    if (!in_array($d['group'], ['new', 'in_progress'], true)) continue;
                    if ($excluded !== null && in_array($d['key'], $excluded, true)) continue;
                    $stmt = $pdo->prepare("SELECT p.*, l.name AS client_name FROM projects p LEFT JOIN leads l ON l.id = p.lead_id WHERE p.status = ? AND (p.archived = 0 OR p.archived IS NULL)");
                    $stmt->execute([$d['key']]);
                    $projects = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                    $income = mcp_income_by_project($pdo, array_column($projects, 'id'));
                    $val = 0.0; $dashVal = 0.0; $rows = [];
                    foreach ($projects as $p) {
                        $b = mcp_project_billing(mcp_project_value($pdo, $p, $ctx), $income[$p['id']] ?? []);
                        $val += $b['not_invoiced'];
                        // The dashboard tile: budget fallback; cancelled rows count; amountReal || amountPlanned.
                        $dv = $b['value'] > 0 ? $b['value'] : (float)($p['budget'] ?? 0);
                        $inv = 0.0;
                        foreach ($income[$p['id']] ?? [] as $r) { $inv += ($r['amountReal'] ?: $r['amountPlanned']); }
                        $dashVal += max(0.0, $dv - $inv);
                        if ($withRows) $rows[] = ['id' => $p['id'], 'name' => $p['name'] ?: $p['client_name'], 'value' => $b['value'], 'invoiced' => $b['invoiced'], 'invoicable' => $b['not_invoiced']];
                    }
                    $item = ['status' => $d['key'], 'count' => count($projects), 'invoicable' => mcp_round2($val)];
                    if ($withRows) $item['rows'] = $rows;
                    $items[] = $item;
                    $groupTotal += $val; $total += $val; $dashTotal += $dashVal;
                }
                $groups[] = ['group' => 'projects', 'label' => 'Projects & Deliverables', 'items' => $items, 'invoicable' => mcp_round2($groupTotal)];
            }

            if (!$groups) throw new \Exception('This key can see neither leads nor projects with finance.');
            return [
                'currency' => $currency,
                'total' => mcp_round2($total),
                'dashboard_basis_total' => mcp_round2($dashTotal),
                'groups' => $groups,
                'note' => 'Closed lead stages and completed/cancelled project statuses are excluded unless you list them in excluded_statuses. Projects count max(0, value − invoiced); leads count their full value.',
            ];
        }

        case 'get_financial_overview': {
            if (mcp_finance_mode($pdo) === 'simplified') {
                return ['mode' => 'simplified', 'message' => 'This workspace uses simplified finance; call get_financial_simplified_table instead.'];
            }
            $year = isset($args['year']) ? (int)$args['year'] : (int)date('Y');
            if ($year < 1990 || $year > 2100) throw new \InvalidArgumentException("'year' is out of range.");
            $cols = mcp_year_columns($year);
            $byId = mcp_fin_categories($pdo);
            $records = mcp_fin_load($pdo, '1=1');
            $agg = mcp_fin_aggregate($records, $byId, $cols, mcp_today());
            $byMonth = !empty($args['by_month']);

            $months = []; $sum = ['income' => ['real' => 0.0, 'estimated' => 0.0], 'expense' => ['real' => 0.0, 'estimated' => 0.0]];
            foreach ($cols as $c) {
                $inc = $agg['totalsByType']['income'][$c['id']]; $exp = $agg['totalsByType']['expense'][$c['id']];
                foreach (['real', 'estimated'] as $k) { $sum['income'][$k] += $inc[$k]; $sum['expense'][$k] += $exp[$k]; }
                $months[] = [
                    'month' => $c['id'], 'income' => mcp_cell_out($inc), 'expense' => mcp_cell_out($exp),
                    'net' => mcp_cell_out(['real' => $inc['real'] - $exp['real'], 'estimated' => $inc['estimated'] - $exp['estimated']]),
                ];
            }
            $rowsOut = [];
            $labelFor = fn($id) => $byId[$id]['name'] ?? ($id === MCP_UNCAT['income'] ? 'Uncategorized income' : 'Uncategorized expenses');
            $ids = array_unique(array_merge(array_keys($agg['cells']), []));
            foreach ($ids as $rowId) {
                $cat = $byId[$rowId] ?? null;
                $tot = ['real' => 0.0, 'estimated' => 0.0];
                foreach ($cols as $c) {
                    $tot['real'] += $agg['cells'][$rowId][$c['id']]['real'] ?? 0.0;
                    $tot['estimated'] += $agg['cells'][$rowId][$c['id']]['estimated'] ?? 0.0;
                }
                if ($tot['real'] == 0.0 && $tot['estimated'] == 0.0) continue;
                $row = [
                    'category_id' => $cat ? $rowId : null,
                    'name' => $labelFor($rowId),
                    'type' => $cat ? $cat['type'] : (array_search($rowId, MCP_UNCAT, true) ?: null),
                    'level' => $cat ? (int)$cat['level'] : 1,
                    'parent_id' => $cat ? mcp_cat_parent($cat, $byId) : null,
                    'year' => mcp_cell_out($tot),
                ];
                if ($byMonth) {
                    $row['months'] = array_map(fn($c) => ['month' => $c['id']] + mcp_cell_out($agg['cells'][$rowId][$c['id']] ?? null), $cols);
                }
                $rowsOut[] = $row;
            }
            usort($rowsOut, fn($a, $b) => [$a['type'], $a['level'], $a['name']] <=> [$b['type'], $b['level'], $b['name']]);
            return [
                'mode' => 'connected', 'year' => $year, 'currency' => mcp_currency($pdo), 'as_of' => mcp_today(),
                'basis' => 'cash basis: real = settled, estimated = still expected',
                'totals' => [
                    'income' => mcp_cell_out($sum['income']), 'expense' => mcp_cell_out($sum['expense']),
                    'net' => mcp_cell_out(['real' => $sum['income']['real'] - $sum['expense']['real'], 'estimated' => $sum['income']['estimated'] - $sum['expense']['estimated']]),
                ],
                'months' => $months,
                'categories' => $rowsOut,
                'outside_year' => array_map(fn($o) => ['count' => $o['count'], 'real' => mcp_round2($o['real']), 'estimated' => mcp_round2($o['estimated'])], $agg['outside']),
            ];
        }

        case 'list_financial_movements': {
            $where = ['1=1']; $params = [];
            foreach (['type' => ['income', 'expense'], 'status' => ['planned', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled']] as $k => $allowed) {
                $v = mcp_enum($args, $k, $allowed);
                if ($v !== null) { $where[] = "`$k` = ?"; $params[] = $v; }
            }
            foreach (['category_id', 'project_id', 'client_id'] as $k) {
                if (!empty($args[$k])) { $where[] = "`$k` = ?"; $params[] = (string)$args[$k]; }
            }
            if (isset($args['recurring'])) $where[] = !empty($args['recurring']) ? 'is_recurring = 1' : 'is_recurring = 0';
            $from = mcp_optional_date($args, 'from'); $to = mcp_optional_date($args, 'to');
            $dateExpr = "COALESCE(paid_date, due_date, issue_date)";
            if ($from) { $where[] = "$dateExpr >= ?"; $params[] = $from; }
            if ($to) { $where[] = "$dateExpr <= ?"; $params[] = $to; }
            if (!empty($args['search'])) {
                $t = '%' . $args['search'] . '%';
                $where[] = '(title LIKE ? OR description LIKE ? OR invoice_number LIKE ?)';
                array_push($params, $t, $t, $t);
            }
            $limit = mcp_limit($args); $offset = max(0, (int)($args['offset'] ?? 0));
            $recs = mcp_fin_load($pdo, implode(' AND ', $where), $params, "$dateExpr DESC, id DESC", $limit + $offset);
            $recs = array_slice($recs, $offset);
            return array_map(function ($r) {
                [$real, $est] = mcp_fin_split($r);
                return [
                    'id' => $r['id'], 'type' => $r['type'], 'subtype' => $r['subtype'], 'title' => $r['title'],
                    'status' => $r['status'], 'category_id' => $r['categoryId'], 'project_id' => $r['projectId'], 'client_id' => $r['clientId'],
                    'invoice_number' => $r['invoiceNumber'], 'currency' => $r['currency'],
                    'amount_planned' => $r['amountPlanned'], 'amount_real' => $r['amountReal'],
                    'settled' => mcp_round2($real), 'expected' => mcp_round2($est),
                    'filed_on' => mcp_fin_date($r), 'issue_date' => $r['issueDate'], 'due_date' => $r['dueDate'], 'paid_date' => $r['paidDate'],
                    'is_recurring' => $r['isRecurring'], 'recurring_frequency' => $r['recurringFrequency'],
                ];
            }, $recs);
        }

        case 'list_financial_categories': {
            $type = mcp_enum($args, 'type', ['income', 'expense']);
            $byId = mcp_fin_categories($pdo);
            $out = [];
            foreach ($byId as $c) {
                if ($type !== null && $c['type'] !== $type) continue;
                $out[] = ['id' => $c['id'], 'type' => $c['type'], 'name' => $c['name'], 'parent_id' => mcp_cat_parent($c, $byId), 'level' => (int)$c['level'], 'sort_order' => (int)$c['sort_order'], 'color' => $c['color']];
            }
            return $out;
        }

        case 'list_recurring_movements': {
            $type = mcp_enum($args, 'type', ['income', 'expense']);
            $today = mcp_today();
            $recs = mcp_fin_load($pdo, 'is_recurring = 1' . ($type ? ' AND type = ?' : ''), $type ? [$type] : [], 'title ASC');
            $out = [];
            foreach ($recs as $r) {
                $end = mcp_rec_end_date($r);
                $paused = $end !== null && $end <= $today;
                if ($paused && empty($args['include_paused'])) continue;
                $next = mcp_rec_occurrences($r, mcp_iso_shift($today, 1), mcp_iso_shift($today, 400))[0] ?? null;
                $out[] = [
                    'id' => $r['id'], 'type' => $r['type'], 'title' => $r['title'], 'category_id' => $r['categoryId'],
                    'frequency' => $r['recurringFrequency'], 'schedule' => $r['recurringConfig'],
                    'start_date' => $r['recurringStartDate'], 'end_date' => $end, 'paused_or_ended' => $paused,
                    'current_amount' => mcp_round2(mcp_rec_amount_at($r, $today)), 'currency' => $r['currency'],
                    'next_charge' => $next,
                ];
            }
            return $out;
        }

        case 'get_cash_flow_forecast': {
            $months = min(max(1, (int)($args['months'] ?? 3)), 24);
            $today = mcp_today();
            $start = mcp_iso_shift($today, 1); $end = mcp_iso_add_months($today, $months);
            $moves = [];
            foreach (mcp_fin_load($pdo, '1=1') as $rec) {
                if (!empty($rec['isRecurring'])) {
                    foreach (mcp_rec_charges($rec, $start, $end) as $ch) {
                        if ($ch['amount'] <= 0) continue;
                        $moves[] = ['date' => $ch['date'], 'source' => 'recurring', 'type' => $rec['type'], 'amount' => $ch['amount'], 'rec' => $rec];
                    }
                    continue;
                }
                if ($rec['status'] === 'paid' || $rec['status'] === 'cancelled') continue;
                $date = $rec['dueDate'] ?: $rec['issueDate'];
                if (!mcp_iso_ok($date) || $date < $start || $date > $end) continue;
                [, $est] = mcp_fin_split($rec);
                if ($est <= 0) continue;
                $moves[] = ['date' => $date, 'source' => $rec['dueDate'] ? 'due' : 'scheduled', 'type' => $rec['type'], 'amount' => $est, 'rec' => $rec];
            }
            usort($moves, fn($a, $b) => [$a['date'], $a['rec']['title']] <=> [$b['date'], $b['rec']['title']]);
            $byMonth = [];
            $tot = ['income' => 0.0, 'expense' => 0.0];
            foreach ($moves as $m) {
                $k = substr($m['date'], 0, 7);
                $byMonth[$k][$m['type']] = ($byMonth[$k][$m['type']] ?? 0.0) + $m['amount'];
                $tot[$m['type']] += $m['amount'];
            }
            ksort($byMonth);
            $out = [
                'currency' => mcp_currency($pdo), 'from' => $start, 'to' => $end,
                'totals' => ['income' => mcp_round2($tot['income']), 'expense' => mcp_round2($tot['expense']), 'net' => mcp_round2($tot['income'] - $tot['expense'])],
                'months' => array_map(fn($k, $v) => ['month' => $k, 'income' => mcp_round2($v['income'] ?? 0), 'expense' => mcp_round2($v['expense'] ?? 0), 'net' => mcp_round2(($v['income'] ?? 0) - ($v['expense'] ?? 0))], array_keys($byMonth), $byMonth),
            ];
            if (!empty($args['include_items'])) {
                $out['items'] = array_map(fn($m) => ['date' => $m['date'], 'source' => $m['source'], 'type' => $m['type'], 'amount' => mcp_round2($m['amount']), 'title' => $m['rec']['title'], 'record_id' => $m['rec']['id']], array_slice($moves, 0, 200));
                $out['items_truncated'] = count($moves) > 200;
            }
            return $out;
        }

        case 'get_invoicing_metrics': {
            $where = '1=1'; $params = [];
            if (!empty($args['year'])) { $where = 'YEAR(issued_at) = ?'; $params[] = (int)$args['year']; }
            $stmt = $pdo->prepare("SELECT type, status, COUNT(*) c, SUM(total_price) total FROM invoices_offers WHERE {$where} GROUP BY type, status");
            $stmt->execute($params);
            $byType = []; $offersVal = 0.0; $invoicedVal = 0.0; $won = 0; $decided = 0;
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $byType[$r['type']][$r['status']] = ['count' => (int)$r['c'], 'total' => mcp_round2($r['total'])];
                if ($r['type'] === 'price_offer') {
                    $offersVal += (float)$r['total'];
                    if (in_array($r['status'], ['approved', 'invoiced'], true)) { $won += (int)$r['c']; $decided += (int)$r['c']; }
                    elseif ($r['status'] === 'rejected') { $decided += (int)$r['c']; }
                }
                if ($r['type'] === 'invoice') $invoicedVal += (float)$r['total'];
            }
            return [
                'currency' => mcp_currency($pdo),
                'offers_value' => mcp_round2($offersVal),
                'invoiced_value' => mcp_round2($invoicedVal),
                'offer_win_rate_percent' => $decided > 0 ? (int)round($won / $decided * 100) : 0,
                'offers_decided' => $decided,
                'by_type_and_status' => $byType,
                'note' => 'Invoiced value counts invoices only (an offer marked invoiced and its invoice are one job). Win rate = approved or invoiced offers / offers that reached a verdict.',
            ];
        }
    }
    return MCP_NOT_MINE;
}
