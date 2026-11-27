<?php
/**
 * CCRM MCP Gateway — HR Leave Approval, Holidays, Employee Self-Service (`self.*`),
 * & Time Tracking v2 Triage/Submission Extensions (WP4)
 *
 * Loaded via require_once from public/api/mcp.php. Contains zero destructive SQL.
 */

function mcp_ext_self_permissions(): array {
    $v = fn(string ...$k) => ['view' => $k];
    $e = fn(string ...$k) => ['edit' => $k];
    return [
        'update_vacation' => $e('employees', 'employees.vacations'),
        'list_public_holidays' => ['any' => ['employees', 'time_tracking', 'self.vacations']],
        'get_my_employment' => $v('self.profile'),
        'update_my_contact_details' => $e('self.profile'),
        'list_my_vacations' => $v('self.vacations'),
        'create_my_vacation_request' => $e('self.vacations'),
        'update_my_vacation_request' => $e('self.vacations'),
        'list_my_payslips' => $v('self.payroll'),
        'record_timesheet_week_submission' => $e('time_tracking'),
        'list_unsorted_time_activities' => $v('time_tracking'),
        'update_unsorted_time_activity' => $e('time_tracking'),
    ];
}

function mcp_ext_self_tool_definitions(): array {
    return [
        [
            'name' => 'update_vacation',
            'description' => 'Update, approve, reject, or mark taken an employee leave entry (or adjust its dates/days_count/note).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Vacation entry ID (vac-...)'],
                    'status' => ['type' => 'string', 'enum' => ['requested', 'pending', 'approved', 'rejected', 'taken']],
                    'vacation_type_id' => ['type' => 'string'],
                    'start_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'end_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'days_count' => ['type' => 'number', 'description' => 'Working days (recomputed from holidays if dates change and omitted)'],
                    'note' => ['type' => 'string'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'list_public_holidays',
            'description' => 'List statutory public holidays for Slovakia (SK) or Hungary (HU) and optionally compute working days in a month.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'country' => ['type' => 'string', 'enum' => ['SK', 'HU'], 'description' => 'Default company country from settings'],
                    'year' => ['type' => 'integer', 'description' => 'Calendar year (default current year)'],
                    'month' => ['type' => 'integer', 'description' => 'Optional month 1-12 to also return working_days_in_month'],
                ],
            ],
        ],
        [
            'name' => 'get_my_employment',
            'description' => 'Self-service: get the authenticated user\'s linked employee profile (identity and contact/address fields; excludes HR notes and colleagues).',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'update_my_contact_details',
            'description' => 'Self-service: update your own phone number and residential address on your linked employee record.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'phone' => ['type' => 'string'],
                    'address_street' => ['type' => 'string'],
                    'address_city' => ['type' => 'string'],
                    'address_zip' => ['type' => 'string'],
                    'address_country' => ['type' => 'string'],
                ],
            ],
        ],
        [
            'name' => 'list_my_vacations',
            'description' => 'Self-service: list your own leave requests, configured vacation types, and per-type balances.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'year' => ['type' => 'integer', 'description' => 'Balance year (default current year)'],
                    'status' => ['type' => 'string', 'enum' => ['requested', 'pending', 'approved', 'rejected', 'taken']],
                ],
            ],
        ],
        [
            'name' => 'create_my_vacation_request',
            'description' => 'Self-service: submit a new leave request (always created with status requested; working days calculated excluding weekends and public holidays).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'vacation_type_id' => ['type' => 'string', 'description' => 'Vacation type ID (annual, sick, ...)'],
                    'start_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'end_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'note' => ['type' => 'string'],
                ],
                'required' => ['vacation_type_id', 'start_date', 'end_date'],
            ],
        ],
        [
            'name' => 'update_my_vacation_request',
            'description' => 'Self-service: update dates/type/note of your own requested/pending leave request, or cancel it (cancel=true sets status rejected with cancellation note).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Leave request ID'],
                    'vacation_type_id' => ['type' => 'string'],
                    'start_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'end_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'note' => ['type' => 'string'],
                    'cancel' => ['type' => 'boolean', 'description' => 'true withdraws/cancels the still-pending request'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'list_my_payslips',
            'description' => 'Self-service: view your own salary records, net pay (na výplatu), due/payment dates, and base compensation config.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => ['year' => ['type' => 'integer', 'description' => 'Filter by year']],
            ],
        ],
        [
            'name' => 'record_timesheet_week_submission',
            'description' => 'Submit/approve completed time entries in a Monday-Sunday week for weekly timesheet approval (requires weeklyApproval enabled).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'week_start' => ['type' => 'string', 'description' => 'Any date YYYY-MM-DD inside the Monday-Sunday week'],
                    'user_id' => ['type' => 'string', 'description' => 'Target user ID (requires time_tracking_team unless own ID)'],
                ],
                'required' => ['week_start'],
            ],
        ],
        [
            'name' => 'list_unsorted_time_activities',
            'description' => 'List captured desktop/extension time activity slices awaiting triage into time entries.',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'update_unsorted_time_activity',
            'description' => 'Assign captured unsorted activity slice(s) to a project as time entry(ies), or dismiss them.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action' => ['type' => 'string', 'enum' => ['assign', 'dismiss']],
                    'ids' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Unsorted time_activity IDs (max 50)'],
                    'project_id' => ['type' => 'string', 'description' => 'Target project ID (required when action=assign)'],
                ],
                'required' => ['action', 'ids'],
            ],
        ],
    ];
}

function mcp_ext_self_execute(\PDO $pdo, array $user, string $tool, array $args) {
    switch ($tool) {
        case 'update_vacation': return mcp_self_update_hr_vacation($pdo, $user, $args);
        case 'list_public_holidays': return mcp_self_list_holidays($pdo, $args);
        case 'get_my_employment': return mcp_self_get_employment($pdo, $user);
        case 'update_my_contact_details': return mcp_self_update_contact($pdo, $user, $args);
        case 'list_my_vacations': return mcp_self_list_my_vacations($pdo, $user, $args);
        case 'create_my_vacation_request': return mcp_self_create_my_vacation($pdo, $user, $args);
        case 'update_my_vacation_request': return mcp_self_update_my_vacation($pdo, $user, $args);
        case 'list_my_payslips': return mcp_self_list_my_payslips($pdo, $user, $args);
        case 'record_timesheet_week_submission': return mcp_self_submit_week($pdo, $user, $args);
        case 'list_unsorted_time_activities':
            require_once __DIR__ . '/time_tracker_lib.php';
            return ccrm_ttx_unsorted($pdo, (string)$user['id']);
        case 'update_unsorted_time_activity': return mcp_self_triage_activity($pdo, $user, $args);
        default:
            return MCP_NOT_MINE;
    }
}

function mcp_self_linked_employee(\PDO $pdo, array $user): array {
    $st = $pdo->prepare("SELECT * FROM `employees` WHERE `user_id` = ? LIMIT 1");
    $st->execute([(string)$user['id']]);
    $emp = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$emp) throw new \Exception('No employee profile is linked to the active user account.');
    return $emp;
}

function mcp_self_update_hr_vacation(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $st = $pdo->prepare("SELECT v.*, e.work_country FROM employee_vacations v LEFT JOIN employees e ON e.id = v.employee_id WHERE v.id = ? LIMIT 1");
    $st->execute([$id]);
    $row = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \InvalidArgumentException("Vacation entry not found: {$id}");

    $start = array_key_exists('start_date', $args) ? mcp_require_date($args, 'start_date') : (string)$row['start_date'];
    $end = array_key_exists('end_date', $args) ? mcp_require_date($args, 'end_date') : (string)$row['end_date'];
    if ($end < $start) throw new \InvalidArgumentException("'end_date' cannot be before 'start_date'.");

    $sets = []; $params = [];
    if (array_key_exists('start_date', $args)) { $sets[] = 'start_date = ?'; $params[] = $start; }
    if (array_key_exists('end_date', $args)) { $sets[] = 'end_date = ?'; $params[] = $end; }
    if (array_key_exists('vacation_type_id', $args)) {
        $defaults = mcp_employee_defaults($pdo);
        $typeIds = array_column($defaults['vacationTypes'], 'id');
        $tid = (string)$args['vacation_type_id'];
        if (!in_array($tid, $typeIds, true)) throw new \InvalidArgumentException("Unknown vacation_type_id '{$tid}'.");
        $sets[] = 'vacation_type_id = ?'; $params[] = $tid;
    }
    $spanDays = (int)((strtotime($end) - strtotime($start)) / 86400) + 1;
    if (array_key_exists('days_count', $args) && $args['days_count'] !== null && $args['days_count'] !== '') {
        $d = mcp_number($args, 'days_count', true, 0.5, 366);
        if ($d > $spanDays) throw new \InvalidArgumentException("'days_count' ({$d}) is more than the {$spanDays} calendar days.");
        $sets[] = 'days_count = ?'; $params[] = $d;
    } elseif (array_key_exists('start_date', $args) || array_key_exists('end_date', $args)) {
        $d = (float)max(1, mcp_working_days_between($pdo, $row['work_country'] ?? null, $start, $end));
        $sets[] = 'days_count = ?'; $params[] = min($spanDays, $d);
    }
    if (array_key_exists('status', $args)) {
        $ns = mcp_enum($args, 'status', ['requested', 'pending', 'approved', 'rejected', 'taken']);
        $sets[] = 'status = ?'; $params[] = $ns;
        if (in_array($ns, ['approved', 'taken'], true)) {
            $sets[] = 'approved_by = ?'; $params[] = $user['name'] ?: $user['email'];
        }
    }
    if (array_key_exists('note', $args)) { $sets[] = 'note = ?'; $params[] = $args['note']; }

    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    if (($args['status'] ?? $row['status']) !== 'rejected' && (array_key_exists('start_date', $args) || array_key_exists('end_date', $args) || array_key_exists('status', $args))) {
        $ov = $pdo->prepare("SELECT id, start_date, end_date FROM employee_vacations WHERE employee_id = ? AND id <> ? AND status <> 'rejected' AND start_date <= ? AND end_date >= ? LIMIT 1");
        $ov->execute([$row['employee_id'], $id, $end, $start]);
        if ($clash = $ov->fetch(\PDO::FETCH_ASSOC)) {
            throw new \InvalidArgumentException("Overlaps an existing leave {$clash['id']} ({$clash['start_date']} to {$clash['end_date']}).");
        }
    }
    $params[] = $id;
    $pdo->prepare("UPDATE employee_vacations SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    mcp_audit($pdo, $user, 'update_vacation', "Updated vacation {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_self_list_holidays(\PDO $pdo, array $args): array {
    require_once __DIR__ . '/holidays_lib.php';
    $country = !empty($args['country']) ? mcp_enum($args, 'country', ['SK', 'HU']) : ccrm_holiday_company_country($pdo);
    $year = isset($args['year']) ? max(2000, min(2100, (int)$args['year'])) : (int)date('Y');
    $res = ccrm_holidays_year($pdo, $country, $year, false);
    $out = ['country' => $country, 'year' => $year, 'fallback' => (bool)$res['fallback'], 'days' => $res['days']];
    if (isset($args['month'])) {
        $m = max(1, min(12, (int)$args['month']));
        $out['month'] = $m;
        $out['working_days_in_month'] = ccrm_holidays_working_days($pdo, $country, $year, $m, [], false);
    }
    return $out;
}

function mcp_self_get_employment(\PDO $pdo, array $user): array {
    $emp = mcp_self_linked_employee($pdo, $user);
    return [
        'identity' => [
            'id' => $emp['id'],
            'name' => $emp['name'],
            'first_name' => $emp['first_name'],
            'last_name' => $emp['last_name'],
            'email' => $emp['email'],
            'kind' => $emp['kind'],
            'position' => $emp['position'],
            'department' => $emp['department'],
            'work_country' => $emp['work_country'],
            'is_active' => (int)($emp['is_active'] ?? 1) === 1,
        ],
        'personal' => [
            'pin' => $emp['pin'],
            'phone' => $emp['phone'],
            'address_street' => $emp['address_street'],
            'address_city' => $emp['address_city'],
            'address_zip' => $emp['address_zip'],
            'address_country' => $emp['address_country'] ?? 'Slovakia',
        ],
        'can' => [
            'edit_profile' => mcp_can_edit('self.profile'),
            'view_payroll' => mcp_can('self.payroll'),
            'view_vacations' => mcp_can('self.vacations'),
            'request_vacation' => mcp_can_edit('self.vacations'),
        ],
    ];
}

function mcp_self_update_contact(\PDO $pdo, array $user, array $args): array {
    $emp = mcp_self_linked_employee($pdo, $user);
    $map = ['phone' => ['phone', 50], 'address_street' => ['address_street', 255], 'address_city' => ['address_city', 100], 'address_zip' => ['address_zip', 20], 'address_country' => ['address_country', 100]];
    $sets = []; $params = []; $changed = [];
    foreach ($map as $arg => [$col, $max]) {
        if (!array_key_exists($arg, $args)) continue;
        $val = $args[$arg] === null ? null : mb_substr(trim((string)$args[$arg]), 0, $max, 'UTF-8');
        $sets[] = "`$col` = ?"; $params[] = $val === '' ? null : $val;
        $changed[] = $arg;
    }
    if (!$sets) return ['success' => true, 'updated' => [], 'message' => 'No contact fields provided'];
    $params[] = $emp['id'];
    $pdo->prepare("UPDATE employees SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    mcp_audit($pdo, $user, 'self.update_contact', $emp['id'] . ': ' . implode(',', $changed));
    return ['success' => true, 'employee_id' => $emp['id'], 'updated' => $changed];
}

function mcp_self_list_my_vacations(\PDO $pdo, array $user, array $args): array {
    $emp = mcp_self_linked_employee($pdo, $user);
    $year = isset($args['year']) ? (int)$args['year'] : (int)date('Y');
    $where = ['employee_id = ?']; $params = [$emp['id']];
    if (!empty($args['status'])) {
        $where[] = 'status = ?';
        $params[] = mcp_enum($args, 'status', ['requested', 'pending', 'approved', 'rejected', 'taken']);
    }
    $st = $pdo->prepare("SELECT id, vacation_type_id, start_date, end_date, days_count, status, note FROM employee_vacations WHERE " . implode(' AND ', $where) . " ORDER BY start_date DESC");
    $st->execute($params);
    $rows = $st->fetchAll(\PDO::FETCH_ASSOC);

    $defaults = mcp_employee_defaults($pdo);
    $allowances = json_decode((string)($emp['vacation_allowances_json'] ?? '{}'), true);
    if (!is_array($allowances)) $allowances = [];
    $allStmt = $pdo->prepare("SELECT vacation_type_id, SUM(days_count) FROM employee_vacations WHERE employee_id = ? AND status <> 'rejected' AND YEAR(start_date) = ? GROUP BY vacation_type_id");
    $allStmt->execute([$emp['id'], $year]);
    $usedByType = $allStmt->fetchAll(\PDO::FETCH_KEY_PAIR);
    $balances = [];
    foreach ($defaults['vacationTypes'] as $t) {
        $a = array_key_exists($t['id'], $allowances) ? (float)$allowances[$t['id']] : (float)($t['defaultAllowance'] ?? 25);
        $u = (float)($usedByType[$t['id']] ?? 0);
        $balances[] = ['type_id' => $t['id'], 'name' => $t['name'], 'year' => $year, 'allowance' => $a, 'used' => $u, 'remaining' => max(0.0, $a - $u)];
    }
    return ['employee_id' => $emp['id'], 'year' => $year, 'requests' => $rows, 'balances' => $balances];
}

function mcp_self_create_my_vacation(\PDO $pdo, array $user, array $args): array {
    $emp = mcp_self_linked_employee($pdo, $user);
    $typeId = mcp_require_string($args, 'vacation_type_id');
    $defaults = mcp_employee_defaults($pdo);
    $typeIds = array_column($defaults['vacationTypes'], 'id');
    if (!in_array($typeId, $typeIds, true)) throw new \InvalidArgumentException("Unknown vacation_type_id '{$typeId}'. Configured types: " . implode(', ', $typeIds));
    $start = mcp_require_date($args, 'start_date');
    $end = mcp_require_date($args, 'end_date');
    if ($end < $start) throw new \InvalidArgumentException("'end_date' cannot be before 'start_date'.");
    $days = mcp_working_days_between($pdo, $emp['work_country'] ?? null, $start, $end);
    if ($days < 1) throw new \InvalidArgumentException("No working days in range {$start}..{$end}.");

    $ov = $pdo->prepare("SELECT id, start_date, end_date FROM employee_vacations WHERE employee_id = ? AND status <> 'rejected' AND start_date <= ? AND end_date >= ? LIMIT 1");
    $ov->execute([$emp['id'], $end, $start]);
    if ($clash = $ov->fetch(\PDO::FETCH_ASSOC)) {
        throw new \InvalidArgumentException("Overlaps an existing leave {$clash['id']} ({$clash['start_date']} to {$clash['end_date']}).");
    }
    $id = 'vac-' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO employee_vacations (id, employee_id, vacation_type_id, start_date, end_date, days_count, status, note, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, NULL)"
    )->execute([$id, $emp['id'], $typeId, $start, $end, $days, $args['note'] ?? null]);
    mcp_audit($pdo, $user, 'self.request_leave', "{$emp['id']}: {$typeId} {$start}..{$end} ({$days}d)");
    return ['success' => true, 'id' => $id, 'status' => 'requested', 'days_count' => $days];
}

function mcp_self_update_my_vacation(\PDO $pdo, array $user, array $args): array {
    $emp = mcp_self_linked_employee($pdo, $user);
    $id = mcp_require_string($args, 'id');
    $st = $pdo->prepare("SELECT * FROM employee_vacations WHERE id = ? AND employee_id = ? LIMIT 1");
    $st->execute([$id, $emp['id']]);
    $row = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \InvalidArgumentException("Leave request not found: {$id}");
    if (!in_array($row['status'], ['requested', 'pending'], true)) {
        throw new \InvalidArgumentException("Only requested/pending leave can be modified or cancelled (current status: {$row['status']}).");
    }
    if (!empty($args['cancel'])) {
        $note = trim((string)($row['note'] ?? '') . ' [Cancelled by employee]');
        $pdo->prepare("UPDATE employee_vacations SET status = 'rejected', note = ? WHERE id = ? AND employee_id = ?")
            ->execute([$note, $id, $emp['id']]);
        mcp_audit($pdo, $user, 'self.cancel_leave', "{$emp['id']}: {$id}");
        return ['success' => true, 'id' => $id, 'status' => 'rejected', 'cancelled' => true];
    }

    $start = array_key_exists('start_date', $args) ? mcp_require_date($args, 'start_date') : (string)$row['start_date'];
    $end = array_key_exists('end_date', $args) ? mcp_require_date($args, 'end_date') : (string)$row['end_date'];
    if ($end < $start) throw new \InvalidArgumentException("'end_date' cannot be before 'start_date'.");
    $days = mcp_working_days_between($pdo, $emp['work_country'] ?? null, $start, $end);
    if ($days < 1) throw new \InvalidArgumentException("No working days in range {$start}..{$end}.");
    $ov = $pdo->prepare("SELECT id FROM employee_vacations WHERE employee_id = ? AND id <> ? AND status <> 'rejected' AND start_date <= ? AND end_date >= ? LIMIT 1");
    $ov->execute([$emp['id'], $id, $end, $start]);
    if ($ov->fetchColumn()) throw new \InvalidArgumentException("Dates overlap an existing leave request.");

    $typeId = (string)($args['vacation_type_id'] ?? $row['vacation_type_id']);
    $defaults = mcp_employee_defaults($pdo);
    $typeIds = array_column($defaults['vacationTypes'], 'id');
    if (!in_array($typeId, $typeIds, true)) throw new \InvalidArgumentException("Unknown vacation_type_id '{$typeId}'.");
    $note = array_key_exists('note', $args) ? $args['note'] : $row['note'];

    $pdo->prepare("UPDATE employee_vacations SET vacation_type_id = ?, start_date = ?, end_date = ?, days_count = ?, note = ? WHERE id = ? AND employee_id = ?")
        ->execute([$typeId, $start, $end, $days, $note, $id, $emp['id']]);
    mcp_audit($pdo, $user, 'self.update_leave', "{$emp['id']}: {$id}");
    return ['success' => true, 'id' => $id, 'days_count' => $days];
}

function mcp_self_list_my_payslips(\PDO $pdo, array $user, array $args): array {
    $emp = mcp_self_linked_employee($pdo, $user);
    $where = ['employee_id = ?']; $params = [$emp['id']];
    if (!empty($args['year'])) { $where[] = 'year = ?'; $params[] = (int)$args['year']; }
    $st = $pdo->prepare(
        "SELECT id, period_type, period_key, year, period_number, total_salary, total_paid, net_pay, status, due_date, payment_date, payment_method, note
         FROM employee_salaries WHERE " . implode(' AND ', $where) . " ORDER BY year DESC, period_number DESC"
    );
    $st->execute($params);
    return [
        'employee_id' => $emp['id'],
        'salary_type' => $emp['salary_type'] ?? 'monthly',
        'salary_amount' => (float)($emp['salary_amount'] ?? 0),
        'salary_due_day' => $emp['salary_due_day'] !== null ? (int)$emp['salary_due_day'] : null,
        'payslips' => $st->fetchAll(\PDO::FETCH_ASSOC),
    ];
}

function mcp_self_submit_week(\PDO $pdo, array $user, array $args): array {
    require_once __DIR__ . '/time_entries_lib.php';
    $settings = ccrm_tt_load_settings($pdo);
    if (empty($settings['weeklyApproval'])) {
        throw new \InvalidArgumentException('Weekly timesheet approval is disabled in workspace settings.');
    }
    $raw = mcp_require_date($args, 'week_start');
    $dt = new \DateTimeImmutable($raw, new \DateTimeZone('UTC'));
    $monDt = $dt->modify('-' . ((int)$dt->format('N') - 1) . ' days');
    $monday = $monDt->format('Y-m-d');
    $sunday = $monDt->modify('+6 days')->format('Y-m-d');

    $targetUid = (string)$user['id'];
    $asked = trim((string)($args['user_id'] ?? ''));
    if ($asked !== '' && $asked !== $targetUid) {
        if (!mcp_can('time_tracking_team') && empty($GLOBALS['mcp_is_admin'])) {
            throw new \Exception('Submitting another user\'s week requires time_tracking_team permission.');
        }
        $chk = $pdo->prepare("SELECT id FROM users WHERE id = ? LIMIT 1");
        $chk->execute([$asked]);
        if (!$chk->fetchColumn()) throw new \InvalidArgumentException("User not found: {$asked}");
        $targetUid = $asked;
    }
    $upd = $pdo->prepare(
        "UPDATE `time_entries` SET `approval_status` = 'approved'
         WHERE `user_id` = ? AND `deleted_at` IS NULL AND `entry_date` BETWEEN ? AND ?
           AND NOT (`start_at` IS NOT NULL AND `end_at` IS NULL)
           AND (`approval_status` IS NULL OR `approval_status` <> 'approved')"
    );
    $upd->execute([$targetUid, $monday, $sunday]);
    $submitted = $upd->rowCount();
    mcp_audit($pdo, $user, 'time_tracking.submit_week', "Submitted week {$monday} for user {$targetUid} ({$submitted} entries)");
    return ['success' => true, 'user_id' => $targetUid, 'week_start' => $monday, 'week_end' => $sunday, 'submitted' => $submitted];
}

function mcp_self_triage_activity(\PDO $pdo, array $user, array $args): array {
    require_once __DIR__ . '/read_scope.php';
    require_once __DIR__ . '/time_tracker_lib.php';
    $action = mcp_enum($args, 'action', ['assign', 'dismiss']);
    $ids = is_array($args['ids'] ?? null) ? array_values($args['ids']) : [];
    if (!$ids) throw new \InvalidArgumentException("'ids' must contain at least one unsorted activity ID.");
    if ($action === 'dismiss') {
        $n = ccrm_ttx_dismiss($pdo, (string)$user['id'], $ids);
        mcp_audit($pdo, $user, 'time_activity_dismiss', "Dismissed {$n} unsorted activity slice(s)");
        return ['success' => true, 'action' => 'dismiss', 'dismissed' => $n];
    }
    $projectId = mcp_require_string($args, 'project_id');
    $scope = ccrm_read_scope($pdo, $user);
    $settings = ccrm_tt_load_settings($pdo);
    $res = ccrm_ttx_assign($pdo, $user, $scope, $ids, $projectId, $settings);
    if (empty($res['ok'])) {
        throw new \InvalidArgumentException("Activity assign failed: " . ($res['code'] ?? 'error'));
    }
    mcp_audit($pdo, $user, 'time_activity_assign', "Assigned {$res['assigned']} activity slice(s) to project {$projectId}");
    return ['success' => true, 'action' => 'assign', 'assigned' => $res['assigned'], 'entries' => $res['entries'] ?? []];
}
