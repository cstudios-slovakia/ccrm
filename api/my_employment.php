<?php
/**
 * "My employment" — self-service for the employee record linked to the caller's login.
 *
 *   GET  ?action=overview              own data, limited to what the self.* keys allow
 *   GET  ?action=hours&year=&month=    own tracked hours (also accepts &from=YYYY-MM-DD)
 *   POST action=update_contact         phone and address only        (self.profile = edit)
 *   POST action=request_leave          a leave request, status fixed (self.vacations = edit)
 *   POST action=cancel_leave           cancel an own still-pending request
 *
 * Rules that make this safe:
 *  - The employee is resolved HERE, from the session user id (employees.user_id). No
 *    request parameter names an employee or an external time-tracking user, so there is
 *    nothing to swap for a colleague's id.
 *  - Every answer is limited to the keys the caller holds; a field group they may not
 *    see is absent, not blank.
 *  - Writes go to ccrm_audit_log. They never touch sync.php, and sync.php never accepts
 *    them: a caller without `employees` = edit cannot write employee collections at all.
 *  - Errors cross the wire as stable codes (see .agents/rules/licensing.md §4); the
 *    client turns them into sentences. No user-facing string is returned from here.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/employee_files.php';
require_once __DIR__ . '/time_tracking_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

function ccrm_my_emp_respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload + ['success' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ccrm_my_emp_fail(string $code, int $status = 400): void {
    http_response_code($status);
    echo json_encode(['success' => false, 'code' => $code]);
    exit;
}

/** Strict Y-m-d, or null. */
function ccrm_my_emp_date(?string $value): ?string {
    if ($value === null) {
        return null;
    }
    $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return ($d !== false && $d->format('Y-m-d') === $value) ? $value : null;
}

/** Monday-to-Friday days in an inclusive range (calcWorkingDays in VacationRequestModal.tsx, without its minimum of 1). */
function ccrm_my_emp_working_days(string $start, string $end): int {
    $cur = new \DateTimeImmutable($start);
    $last = new \DateTimeImmutable($end);
    $count = 0;
    while ($cur <= $last) {
        if ((int)$cur->format('N') < 6) {
            $count++;
        }
        $cur = $cur->modify('+1 day');
    }
    return $count;
}

/** The configured leave types; the same defaults the HR modal falls back to when none are saved. */
function ccrm_my_emp_leave_types(array $employeeSettings): array {
    $types = $employeeSettings['vacationTypes'] ?? [];
    $out = [];
    foreach ((array)$types as $t) {
        if (is_array($t) && !empty($t['id'])) {
            $out[] = [
                'id' => (string)$t['id'],
                'name' => (string)($t['name'] ?? $t['id']),
                'color' => $t['color'] ?? null,
                'isPaid' => array_key_exists('isPaid', $t) ? (bool)$t['isPaid'] : null,
                'defaultAllowance' => $t['defaultAllowance'] ?? $t['defaultDays'] ?? null,
            ];
        }
    }
    if (!$out) {
        $out = [
            ['id' => 'annual', 'name' => 'Annual leave', 'color' => '#c29b62', 'isPaid' => true, 'defaultAllowance' => 25],
            ['id' => 'sick', 'name' => 'Sick leave', 'color' => '#ef4444', 'isPaid' => false, 'defaultAllowance' => 10],
            ['id' => 'doctor', 'name' => 'Doctor', 'color' => '#3b82f6', 'isPaid' => null, 'defaultAllowance' => 7],
            ['id' => 'unpaid', 'name' => 'Unpaid leave', 'color' => '#8b5cf6', 'isPaid' => false, 'defaultAllowance' => 0],
        ];
    }
    return $out;
}

function ccrm_my_emp_leave_row(array $row): array {
    return [
        'id' => $row['id'],
        'vacationTypeId' => $row['vacation_type_id'],
        'startDate' => $row['start_date'],
        'endDate' => $row['end_date'],
        'daysCount' => (float)($row['days_count'] ?? 1.0),
        'status' => $row['status'] ?? 'approved',
        'note' => $row['note'],
    ];
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_my_emp_fail('not_installed', 503);
}
require_once $configFile;
try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_my_emp_fail('database_unavailable', 503);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = [];
if ($method === 'POST') {
    $decoded = json_decode((string)file_get_contents('php://input'), true);
    $body = is_array($decoded) ? $decoded : [];
}
$action = trim((string)($body['action'] ?? $_GET['action'] ?? ''));

$scope = ccrm_read_scope($pdo, $sessionUser);
$canProfile = ccrm_can($scope, 'self.profile');
$canPayroll = ccrm_can($scope, 'self.payroll');
$canLeave = ccrm_can($scope, 'self.vacations');
$canFiles = ccrm_can($scope, 'self.files');
$canHours = ccrm_can($scope, 'self.hours');

if (!$canProfile && !$canPayroll && !$canLeave && !$canFiles && !$canHours) {
    ccrm_my_emp_fail('forbidden', 403);
}

$employee = $scope['linkedEmployeeRow'] ?? null;
if (!is_array($employee)) {
    // A state, not a malfunction: the page shows "ask your administrator to link you".
    echo json_encode(['success' => false, 'code' => 'not_linked']);
    exit;
}
$employeeId = (string)$employee['id'];

$settingsRaw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'EMPLOYEE_SETTINGS'")->fetchColumn();
$employeeSettings = ($settingsRaw !== false && $settingsRaw !== null) ? json_decode((string)$settingsRaw, true) : [];
if (!is_array($employeeSettings)) {
    $employeeSettings = [];
}

// ---------------------------------------------------------------------------- overview
if ($action === 'overview' && $method === 'GET') {
    $out = [
        'identity' => [
            'id' => $employeeId,
            'name' => $employee['name'],
            'email' => $employee['email'],
            'isActive' => (int)($employee['is_active'] ?? 1) === 1,
        ],
        // Which tabs and forms the page may show.
        'can' => [
            'profile' => $canProfile,
            'editProfile' => ccrm_can_edit($scope, 'self.profile'),
            'payroll' => $canPayroll,
            'leave' => $canLeave,
            'requestLeave' => ccrm_can_edit($scope, 'self.vacations'),
            'files' => $canFiles,
            'hours' => $canHours,
        ],
    ];

    if ($canProfile) {
        // Never `notes`: the HR note about a person is not theirs to read.
        $out['personal'] = [
            'pin' => $employee['pin'],
            'phone' => $employee['phone'],
            'addressStreet' => $employee['address_street'],
            'addressCity' => $employee['address_city'],
            'addressZip' => $employee['address_zip'],
            'addressCountry' => $employee['address_country'] ?? 'Slovakia',
        ];
    }

    if ($canPayroll) {
        $payroll = [];
        $stmt = $pdo->prepare("SELECT * FROM `employee_salaries` WHERE `employee_id` = ? ORDER BY `year` DESC, `period_number` DESC");
        $stmt->execute([$employeeId]);
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            // No financialRecordId: it points into the finance module.
            $payroll[] = [
                'id' => $row['id'],
                'periodType' => $row['period_type'] ?? 'monthly',
                'periodKey' => $row['period_key'],
                'year' => (int)$row['year'],
                'periodNumber' => (int)$row['period_number'],
                'items' => !empty($row['items_json']) ? json_decode($row['items_json'], true) : [],
                'totalSalary' => (float)($row['total_salary'] ?? 0),
                'totalPaid' => (float)($row['total_paid'] ?? 0),
                'status' => $row['status'] ?? 'pending',
                'dueDate' => $row['due_date'],
                'paymentDate' => $row['payment_date'],
                'paymentMethod' => $row['payment_method'] ?? 'bank_transfer',
                'note' => $row['note'],
            ];
        }
        $out['pay'] = [
            'salaryType' => $employee['salary_type'] ?? 'monthly',
            'salaryAmount' => (float)($employee['salary_amount'] ?? 0),
            'salaryDueDay' => $employee['salary_due_day'] !== null ? (int)$employee['salary_due_day'] : null,
            'payroll' => $payroll,
        ];
    }

    if ($canLeave) {
        $allowances = !empty($employee['vacation_allowances_json']) ? json_decode($employee['vacation_allowances_json'], true) : [];
        if (!is_array($allowances)) {
            $allowances = [];
        }
        $leaveRows = [];
        $stmt = $pdo->prepare("SELECT * FROM `employee_vacations` WHERE `employee_id` = ? ORDER BY `start_date` DESC");
        $stmt->execute([$employeeId]);
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $leaveRows[] = ccrm_my_emp_leave_row($row);
        }
        $types = ccrm_my_emp_leave_types($employeeSettings);
        // Per-type balance for the current year; the same rule the HR screen uses
        // (rejected leave does not count, a request counts against the year it starts in).
        $year = (int)date('Y');
        $balances = [];
        foreach ($types as $t) {
            $allowance = array_key_exists($t['id'], $allowances) ? (float)$allowances[$t['id']] : (float)($t['defaultAllowance'] ?? 25);
            $used = 0.0;
            foreach ($leaveRows as $lr) {
                if ($lr['status'] === 'rejected' || (int)substr((string)$lr['startDate'], 0, 4) !== $year) {
                    continue;
                }
                if ($lr['vacationTypeId'] === $t['id']) {
                    $used += $lr['daysCount'];
                }
            }
            $balances[] = ['typeId' => $t['id'], 'year' => $year, 'allowance' => $allowance, 'used' => $used, 'remaining' => max(0.0, $allowance - $used)];
        }
        $out['leave'] = [
            'vacationAllowances' => (object)$allowances,
            'types' => $types,
            'requests' => $leaveRows,
            'balances' => $balances,
        ];
    }

    if ($canFiles) {
        $files = [];
        $decoded = !empty($employee['files_json']) ? json_decode($employee['files_json'], true) : [];
        foreach ((array)$decoded as $f) {
            if (!is_array($f) || empty($f['id'])) {
                continue;
            }
            $files[] = [
                'id' => $f['id'],
                'name' => $f['name'] ?? '',
                'size' => $f['size'] ?? null,
                'type' => $f['type'] ?? null,
                'uploadedAt' => $f['uploadedAt'] ?? null,
                'downloadUrl' => '/api/employee_file.php?employee=' . rawurlencode($employeeId) . '&file=' . rawurlencode((string)$f['id']),
            ];
        }
        $out['documents'] = $files;
    }

    ccrm_my_emp_respond($out);
}

// ---------------------------------------------------------------------------- hours
if ($action === 'hours' && $method === 'GET') {
    if (!$canHours) {
        ccrm_my_emp_fail('forbidden', 403);
    }
    $year = (int)($_GET['year'] ?? date('Y'));
    $month = (int)($_GET['month'] ?? date('n'));
    $from = ccrm_my_emp_date(isset($_GET['from']) ? (string)$_GET['from'] : null);
    if ($from !== null) {
        $year = (int)substr($from, 0, 4);
        $month = (int)substr($from, 5, 2);
    }
    // The external user id is the one stored on the caller's OWN linked row. It never comes
    // from the request, so there is no parameter that could ask for a colleague's hours.
    $extUserId = trim((string)($employee['time_tracking_user_id'] ?? ''));
    if ($extUserId === '' || $extUserId === '0' || $extUserId === 'none') {
        ccrm_my_emp_respond(['no_user_attached' => true, 'data' => null]);
    }
    $token = ccrm_time_tracking_toggl_token($employeeSettings);
    $workspace = ccrm_time_tracking_toggl_workspace($employeeSettings);
    $result = ccrm_time_tracking_month_hours($token, $workspace, $extUserId, $year, $month);
    if (empty($result['success'])) {
        // The upstream message can name the workspace or token problem; the page only needs to know it failed.
        ccrm_my_emp_fail('hours_unavailable', 502);
    }
    echo json_encode($result);
    exit;
}

// ---------------------------------------------------------------------------- writes
if ($method !== 'POST') {
    ccrm_my_emp_fail('unknown_action', 400);
}

if ($action === 'update_contact') {
    if (!ccrm_can_edit($scope, 'self.profile')) {
        ccrm_my_emp_fail('forbidden', 403);
    }
    // Whitelist. Anything else in the body (pay, PIN, name, notes, ...) is ignored.
    $columns = [
        'phone' => ['phone', 50],
        'addressStreet' => ['address_street', 255],
        'addressCity' => ['address_city', 100],
        'addressZip' => ['address_zip', 20],
        'addressCountry' => ['address_country', 100],
    ];
    $sets = [];
    $params = [];
    $changed = [];
    foreach ($columns as $field => [$column, $max]) {
        if (!array_key_exists($field, $body)) {
            continue;
        }
        $value = $body[$field];
        if ($value !== null && !is_string($value)) {
            ccrm_my_emp_fail('invalid_value', 422);
        }
        $value = $value === null ? null : mb_substr(trim($value), 0, $max, 'UTF-8');
        $sets[] = "`$column` = ?";
        $params[] = $value === '' ? null : $value;
        $changed[] = $field;
    }
    if ($sets) {
        $params[] = $employeeId;
        $pdo->prepare("UPDATE `employees` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);
        ccrm_audit_log($pdo, $sessionUser, 'self.update_contact', $employeeId . ': ' . implode(',', $changed));
    }
    ccrm_my_emp_respond(['updated' => $changed]);
}

if ($action === 'request_leave') {
    if (!ccrm_can_edit($scope, 'self.vacations')) {
        ccrm_my_emp_fail('forbidden', 403);
    }
    $typeId = trim((string)($body['vacationTypeId'] ?? ''));
    $known = array_column(ccrm_my_emp_leave_types($employeeSettings), 'id');
    if ($typeId === '' || !in_array($typeId, $known, true)) {
        ccrm_my_emp_fail('unknown_type', 422);
    }
    $start = ccrm_my_emp_date(isset($body['startDate']) ? (string)$body['startDate'] : null);
    $end = ccrm_my_emp_date(isset($body['endDate']) ? (string)$body['endDate'] : null);
    if ($start === null || $end === null || $start > $end) {
        ccrm_my_emp_fail('invalid_dates', 422);
    }
    if ((new \DateTimeImmutable($start))->diff(new \DateTimeImmutable($end))->days > 366) {
        ccrm_my_emp_fail('invalid_dates', 422);
    }
    // Computed here; whatever number the client sent is ignored.
    $days = ccrm_my_emp_working_days($start, $end);
    if ($days < 1) {
        ccrm_my_emp_fail('no_working_days', 422);
    }
    $overlap = $pdo->prepare(
        "SELECT COUNT(*) FROM `employee_vacations`
          WHERE `employee_id` = ? AND `status` <> 'rejected' AND `start_date` <= ? AND `end_date` >= ?"
    );
    $overlap->execute([$employeeId, $end, $start]);
    if ((int)$overlap->fetchColumn() > 0) {
        ccrm_my_emp_fail('overlap', 409);
    }
    $note = isset($body['note']) && is_string($body['note']) ? mb_substr(trim($body['note']), 0, 1000, 'UTF-8') : null;
    $id = 'vac-' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO `employee_vacations` (`id`, `employee_id`, `vacation_type_id`, `start_date`, `end_date`, `days_count`, `status`, `note`, `approved_by`)
         VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, NULL)"
    )->execute([$id, $employeeId, $typeId, $start, $end, $days, $note === '' ? null : $note]);
    ccrm_audit_log($pdo, $sessionUser, 'self.request_leave', $employeeId . ': ' . $typeId . ' ' . $start . '..' . $end . ' (' . $days . ' d)');
    $row = $pdo->prepare("SELECT * FROM `employee_vacations` WHERE `id` = ?");
    $row->execute([$id]);
    ccrm_my_emp_respond(['request' => ccrm_my_emp_leave_row($row->fetch(\PDO::FETCH_ASSOC))], 201);
}

if ($action === 'cancel_leave') {
    if (!ccrm_can_edit($scope, 'self.vacations')) {
        ccrm_my_emp_fail('forbidden', 403);
    }
    $leaveId = trim((string)($body['id'] ?? ''));
    $stmt = $pdo->prepare("SELECT * FROM `employee_vacations` WHERE `id` = ? AND `employee_id` = ? LIMIT 1");
    $stmt->execute([$leaveId, $employeeId]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    // Someone else's request answers exactly like one that does not exist.
    if (!$row) {
        ccrm_my_emp_fail('not_found', 404);
    }
    if (!in_array($row['status'], ['requested', 'pending'], true)) {
        ccrm_my_emp_fail('not_cancellable', 409);
    }
    $pdo->prepare("DELETE FROM `employee_vacations` WHERE `id` = ? AND `employee_id` = ? AND `status` IN ('requested', 'pending')")
        ->execute([$leaveId, $employeeId]);
    ccrm_audit_log($pdo, $sessionUser, 'self.cancel_leave', $employeeId . ': ' . $leaveId);
    ccrm_my_emp_respond(['cancelled' => $leaveId]);
}

ccrm_my_emp_fail('unknown_action', 400);
