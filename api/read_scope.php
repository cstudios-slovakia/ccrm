<?php
/**
 * Role-Based Read Scope & Projection helpers for CCRM.
 *
 * Single server-side authority for determining:
 * - What collections a session user may see
 * - How employee records are projected (field stripping)
 * - Task visibility predicate (tasks.view_all)
 * - Lead vs client classification
 * - Secret masking for employee and integration settings
 */

require_once __DIR__ . '/permissions.php';
require_once __DIR__ . '/employee_name.php';
require_once __DIR__ . '/auth.php';

/**
 * Resolve read scope for the given session user.
 *
 * @param \PDO $pdo
 * @param array $sessionUser [id => string, role => string, email => string]
 * @return array
 */
function ccrm_read_scope(\PDO $pdo, array $sessionUser): array {
    $roleName = $sessionUser['role'] ?? 'Viewer';
    $isAdmin = ccrm_is_admin_role_name($roleName);

    $userId = (string)($sessionUser['id'] ?? '');
    $userEmail = (string)($sessionUser['email'] ?? '');
    $userName = (string)($sessionUser['name'] ?? '');

    if ($userName === '' && $userId !== '') {
        try {
            $uStmt = $pdo->prepare("SELECT `name`, `email` FROM `users` WHERE `id` = ? LIMIT 1");
            $uStmt->execute([$userId]);
            if ($uRow = $uStmt->fetch(\PDO::FETCH_ASSOC)) {
                $userName = (string)($uRow['name'] ?? '');
                if ($userEmail === '') {
                    $userEmail = (string)($uRow['email'] ?? '');
                }
            }
        } catch (\Throwable $e) {}
    }

    if ($isAdmin) {
        $permissions = ccrm_admin_role_permissions();
    } else {
        $rolesJson = null;
        try {
            $stmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'ROLES_RBAC' LIMIT 1");
            $rolesJson = $stmt->fetchColumn();
        } catch (\Throwable $e) {}

        $rolesList = [];
        if (is_string($rolesJson) && $rolesJson !== '') {
            $decoded = json_decode($rolesJson, true);
            if (is_array($decoded)) {
                $rolesList = $decoded;
            }
        }
        if (empty($rolesList)) {
            $rolesList = ccrm_fallback_roles();
        }

        $matchedRole = ccrm_find_role($rolesList, $roleName);
        $permissions = ccrm_resolve_role_permissions($matchedRole);
    }

    $linkedEmployeeId = null;
    $linkedEmployeeRow = null;
    if ($userId !== '') {
        try {
            $eStmt = $pdo->prepare("SELECT * FROM `employees` WHERE `user_id` = ? LIMIT 1");
            $eStmt->execute([$userId]);
            $eRow = $eStmt->fetch(\PDO::FETCH_ASSOC);
            if ($eRow) {
                $linkedEmployeeId = $eRow['id'];
                $linkedEmployeeRow = $eRow;
            }
        } catch (\Throwable $e) {}
    }

    return [
        'isAdmin' => $isAdmin,
        'roleName' => $roleName,
        'permissions' => $permissions,
        'sessionUserId' => $userId,
        'sessionUserName' => $userName,
        'sessionUserEmail' => $userEmail,
        'linkedEmployeeId' => $linkedEmployeeId,
        'linkedEmployeeRow' => $linkedEmployeeRow,
    ];
}

/**
 * Check if the scope grants a permission key at the required level.
 */
function ccrm_can(array $scope, string $key, string $level = 'view'): bool {
    if (!empty($scope['isAdmin'])) {
        return true;
    }
    $resolved = $scope['permissions'] ?? [];
    if ($level === 'edit') {
        return ccrm_perm_can_edit($resolved, $key);
    }
    return ccrm_perm_can($resolved, $key);
}

/**
 * Check if the scope grants edit level for a permission key.
 */
function ccrm_can_edit(array $scope, string $key): bool {
    return ccrm_can($scope, $key, 'edit');
}

/**
 * Enforce permission or abort with 403 JSON response.
 */
function ccrm_require_perm(\PDO $pdo, array $sessionUser, string $key, string $level = 'view'): array {
    $scope = ccrm_read_scope($pdo, $sessionUser);
    if (!ccrm_can($scope, $key, $level)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Forbidden',
            'message' => "Permission '{$key}' at level '{$level}' required."
        ]);
        exit;
    }
    return $scope;
}

/**
 * Endpoint gate for scripts that have no database handle of their own yet: resolves the
 * caller's scope and stops with 403 unless they hold ANY of the given keys at `$level`.
 * Returns the scope for finer checks.
 *
 * @param string[] $keys
 */
function ccrm_gate_any(array $sessionUser, array $keys, string $level = 'view'): array {
    $pdo = ccrm_auth_pdo();
    if ($pdo === null) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
        exit;
    }
    $scope = ccrm_read_scope($pdo, $sessionUser);
    foreach ($keys as $key) {
        if (ccrm_can($scope, $key, $level)) {
            return $scope;
        }
    }
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden']);
    exit;
}

function ccrm_gate(array $sessionUser, string $key, string $level = 'view'): array {
    return ccrm_gate_any($sessionUser, [$key], $level);
}

/**
 * Lead vs Client record classifier.
 * A record is a client if its id starts with 'client-' OR adjustment > 0.
 */
function ccrm_is_client_record(array $record): bool {
    $id = (string)($record['id'] ?? '');
    if (str_starts_with($id, 'client-')) {
        return true;
    }
    $adj = (float)($record['adjustment'] ?? 0);
    return $adj > 0;
}

/**
 * Task visibility predicate.
 *
 * If tasks.view_all is granted, all tasks are visible.
 * Otherwise, only tasks owned by, created by, or assigned to the session user.
 */
function ccrm_can_view_task(array $task, array $scope): bool {
    if (!empty($scope['isAdmin']) || ccrm_can($scope, 'tasks.view_all')) {
        return true;
    }
    $userName = trim((string)($scope['sessionUserName'] ?? ''));
    $userEmail = trim((string)($scope['sessionUserEmail'] ?? ''));

    $owner = trim((string)($task['owner'] ?? ''));
    $createdBy = trim((string)($task['createdBy'] ?? $task['created_by'] ?? ''));
    $assignees = (array)($task['assignedUsers'] ?? []);

    if ($userName !== '') {
        if ($owner === $userName || $createdBy === $userName) {
            return true;
        }
        if (in_array($userName, $assignees, true)) {
            return true;
        }
    }
    if ($userEmail !== '') {
        if ($owner === $userEmail || $createdBy === $userEmail) {
            return true;
        }
        if (in_array($userEmail, $assignees, true)) {
            return true;
        }
    }

    return false;
}

/**
 * Company-wide projection of an employee row.
 *
 * Unallowed fields are completely omitted from the row, not set to null, 0 or [].
 */
function ccrm_project_employee_row(array $row, array $scope): ?array {
    if (!ccrm_can($scope, 'employees', 'view')) {
        return null;
    }

    // 1. Directory Group (Always present with employees >= view)
    $projected = [
        'id' => $row['id'],
        'name' => $row['name'],
        'firstName' => $row['firstName'] ?? $row['first_name'] ?? null,
        'lastName' => $row['lastName'] ?? $row['last_name'] ?? null,
        'kind' => $row['kind'] ?? 'employee',
        'companyId' => $row['companyId'] ?? $row['company_id'] ?? null,
        'taxId' => $row['taxId'] ?? $row['tax_id'] ?? null,
        'vatId' => $row['vatId'] ?? $row['vat_id'] ?? null,
        'position' => $row['position'] ?? null,
        'department' => $row['department'] ?? null,
        'email' => $row['email'] ?? null,
        'isActive' => isset($row['isActive'])
            ? (bool)$row['isActive']
            : ((int)($row['is_active'] ?? 1) === 1),
        'userId' => $row['userId'] ?? $row['user_id'] ?? null,
        'workCountry' => $row['workCountry'] ?? $row['work_country'] ?? null,
        'timeTrackingProvider' => $row['timeTrackingProvider'] ?? $row['time_tracking_provider'] ?? 'toggl',
        'timeTrackingUserId' => $row['timeTrackingUserId'] ?? $row['time_tracking_user_id'] ?? null,
        'timeTrackingUserName' => $row['timeTrackingUserName'] ?? $row['time_tracking_user_name'] ?? null,
        'createdAt' => $row['createdAt'] ?? $row['created_at'] ?? null,
        'updatedAt' => $row['updatedAt'] ?? $row['updated_at'] ?? null,
    ];

    // 2. Personal Group (requires employees.personal)
    if (ccrm_can($scope, 'employees.personal')) {
        $projected['pin'] = $row['pin'] ?? null;
        $projected['phone'] = $row['phone'] ?? null;
        $projected['addressStreet'] = $row['addressStreet'] ?? $row['address_street'] ?? null;
        $projected['addressCity'] = $row['addressCity'] ?? $row['address_city'] ?? null;
        $projected['addressZip'] = $row['addressZip'] ?? $row['address_zip'] ?? null;
        $projected['addressCountry'] = $row['addressCountry'] ?? $row['address_country'] ?? 'Slovakia';
        $projected['notes'] = $row['notes'] ?? null;
    }

    // 3. Pay Group (requires employees.salaries)
    if (ccrm_can($scope, 'employees.salaries')) {
        $projected['salaryType'] = $row['salaryType'] ?? $row['salary_type'] ?? 'monthly';
        $projected['salaryAmount'] = isset($row['salaryAmount'])
            ? (float)$row['salaryAmount']
            : (float)($row['salary_amount'] ?? 0);
        $projected['salaryDueDay'] = isset($row['salaryDueDay'])
            ? $row['salaryDueDay']
            : ($row['salary_due_day'] !== null ? (int)$row['salary_due_day'] : null);
        $projected['autoExpense'] = isset($row['autoExpense'])
            ? (bool)$row['autoExpense']
            : ((int)($row['auto_expense'] ?? 0) === 1);
        $projected['expenseCategoryId'] = $row['expenseCategoryId'] ?? $row['expense_category_id'] ?? null;
    }

    // 4. Leave Group (requires employees.vacations)
    if (ccrm_can($scope, 'employees.vacations')) {
        if (isset($row['vacationAllowances'])) {
            $projected['vacationAllowances'] = $row['vacationAllowances'];
        } elseif (!empty($row['vacation_allowances_json'])) {
            $projected['vacationAllowances'] = json_decode($row['vacation_allowances_json'], true);
        } else {
            $projected['vacationAllowances'] = (object)[];
        }
    }

    // 5. Documents Group (requires employees.files)
    if (ccrm_can($scope, 'employees.files')) {
        if (isset($row['files'])) {
            $projected['files'] = $row['files'];
        } elseif (!empty($row['files_json'])) {
            $projected['files'] = json_decode($row['files_json'], true);
        } else {
            $projected['files'] = [];
        }
    }

    return $projected;
}

/** Secret keys inside EMPLOYEE_SETTINGS.timeTracking: masked on the way out, merged on the way in. */
function ccrm_employee_settings_secret_keys(): array {
    return ['togglApiToken', 'clockifyApiKey'];
}

/**
 * Mask secret tokens in EMPLOYEE_SETTINGS.
 */
function ccrm_mask_employee_settings(?array $settings): ?array {
    if (!is_array($settings)) {
        return null;
    }
    if (isset($settings['timeTracking']) && is_array($settings['timeTracking'])) {
        $settings['timeTracking'] = ccrm_mask_secrets(
            $settings['timeTracking'],
            ccrm_employee_settings_secret_keys()
        );
    }
    return $settings;
}

/**
 * Project employeeSettings according to caller scope.
 */
function ccrm_project_employee_settings(?array $settings, array $scope): ?array {
    if (!is_array($settings)) {
        return null;
    }
    $masked = ccrm_mask_employee_settings($settings);

    // Full (with masked secrets) to Admin or general_config = edit
    if (!empty($scope['isAdmin']) || ccrm_can_edit($scope, 'general_config')) {
        return $masked;
    }

    // Anyone with employees >= view or any self.* key gets safe types only
    $hasSelf = false;
    foreach (['self.profile', 'self.payroll', 'self.vacations', 'self.files', 'self.hours', 'self.account'] as $sk) {
        if (ccrm_can($scope, $sk, 'view')) {
            $hasSelf = true;
            break;
        }
    }

    if (ccrm_can($scope, 'employees', 'view') || $hasSelf) {
        $safe = [
            'salaryPeriod' => $settings['salaryPeriod'] ?? 'monthly',
            'salaryTypes' => $settings['salaryTypes'] ?? ['monthly', 'hourly'],
            'vacationTypes' => $settings['vacationTypes'] ?? ['vacation', 'sick_leave'],
        ];
        // The defaults a "new employee" form pre-fills are plain configuration, not
        // secrets; HR roles without general_config still need them to create a record.
        if (ccrm_can($scope, 'employees', 'view')) {
            foreach (['salaryDueDay', 'defaultSalaryDueDay', 'defaultAutoExpense', 'defaultExpenseCategoryId'] as $k) {
                if (array_key_exists($k, $settings)) {
                    $safe[$k] = $settings[$k];
                }
            }
        }
        return $safe;
    }

    return null;
}

/**
 * SQL condition limiting a `leads` query to the rows the caller is sent (leads vs clients,
 * the same classifier as ccrm_is_client_record). Empty string when nothing is excluded.
 * `$alias` is the table alias, without a dot.
 */
function ccrm_lead_scope_sql(?array $scope, string $alias = ''): string {
    if ($scope === null || (ccrm_can($scope, 'leads') && ccrm_can($scope, 'clients'))) {
        return '';
    }
    $p = $alias === '' ? '' : "`{$alias}`.";
    $isClient = "({$p}`id` LIKE 'client-%' OR IFNULL({$p}`adjustment`, 0) > 0)";
    if (ccrm_can($scope, 'clients')) {
        return $isClient;
    }
    if (ccrm_can($scope, 'leads')) {
        return "NOT {$isClient}";
    }
    return '0 = 1';
}

/**
 * SQL condition limiting a `tasks` query to the tasks the caller sees (see
 * ccrm_can_view_task: owner, creator or assignee, by name or e-mail), plus its bind
 * values. Empty condition when the caller sees every task.
 *
 * @return array{0:string,1:array<int,string>}
 */
function ccrm_task_scope_sql(?array $scope, string $alias = 't'): array {
    if ($scope === null || !empty($scope['isAdmin']) || ccrm_can($scope, 'tasks.view_all')) {
        return ['', []];
    }
    $names = array_values(array_filter([
        trim((string)($scope['sessionUserName'] ?? '')),
        trim((string)($scope['sessionUserEmail'] ?? '')),
    ], fn($v) => $v !== ''));
    if (!$names) {
        return ['0 = 1', []];
    }
    $in = implode(',', array_fill(0, count($names), '?'));
    $sql = "(`{$alias}`.`owner` IN ({$in}) OR `{$alias}`.`created_by` IN ({$in}) OR EXISTS (SELECT 1 FROM `task_assignees` `ta_s` WHERE `ta_s`.`task_id` = `{$alias}`.`id` AND `ta_s`.`user_name` IN ({$in})))";
    return [$sql, array_merge($names, $names, $names)];
}

/** A finance row that records an employee's pay (auto-expense of a payroll run). */
function ccrm_is_salary_finance_row(array $row): bool {
    return (($row['subtype'] ?? '') === 'salary') || str_starts_with((string)($row['id'] ?? ''), 'fr-sal-');
}

/**
 * The same row without the employee's name: "Salary: Alice (2026-01)" becomes
 * "Payroll (2026-01)". The amount stays, because finance totals need it.
 */
function ccrm_anonymise_salary_finance_row(array $row): array {
    $title = (string)($row['title'] ?? '');
    if (preg_match('/\(([^)]+)\)/', $title, $pm)) {
        $period = $pm[1];
    } elseif (!empty($row['issue_date'])) {
        $period = substr((string)$row['issue_date'], 0, 7);
    } else {
        $period = 'Payroll';
    }
    $row['title'] = "Payroll ({$period})";
    $row['description'] = "Payroll ({$period})";
    return $row;
}

/**
 * May the caller see this STORED lead/client row? The same classifier the sync
 * GET filters by, applied to a raw `leads` row, so a write or delete is limited
 * to exactly the rows the caller was sent.
 */
function ccrm_lead_row_visible(array $dbRow, array $scope): bool {
    return ccrm_is_client_record($dbRow) ? ccrm_can($scope, 'clients') : ccrm_can($scope, 'leads');
}

/**
 * Of the given task ids, the ones the caller may see (set: id => true). Evaluated
 * against the STORED rows, never against what the payload claims, so a forged
 * owner / assignee list cannot widen the caller's reach. Ids that do not exist
 * are not in the result.
 *
 * @param string[] $taskIds
 * @return array<string,true>
 */
function ccrm_visible_task_ids(\PDO $pdo, array $scope, array $taskIds): array {
    $taskIds = array_values(array_unique(array_map('strval', $taskIds)));
    $visible = [];
    if (!$taskIds) {
        return $visible;
    }
    foreach (array_chunk($taskIds, 500) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        $stmt = $pdo->prepare("SELECT `id`, `owner`, `created_by` FROM `tasks` WHERE `id` IN ($in)");
        $stmt->execute($chunk);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows) {
            continue;
        }
        $assigned = [];
        $aStmt = $pdo->prepare("SELECT `task_id`, `user_name` FROM `task_assignees` WHERE `task_id` IN ($in)");
        $aStmt->execute($chunk);
        while ($a = $aStmt->fetch(\PDO::FETCH_ASSOC)) {
            $assigned[$a['task_id']][] = $a['user_name'];
        }
        foreach ($rows as $row) {
            $task = [
                'id' => $row['id'],
                'owner' => $row['owner'],
                'createdBy' => $row['created_by'],
                'assignedUsers' => $assigned[$row['id']] ?? [],
            ];
            if (ccrm_can_view_task($task, $scope)) {
                $visible[(string)$row['id']] = true;
            }
        }
    }
    return $visible;
}

/**
 * The employee field groups of §3.4, as the caller's right to each. Directory is
 * always writable with `employees` = edit; the rest sit behind a toggle.
 *
 * @return array{personal:bool,pay:bool,leave:bool,documents:bool}
 */
function ccrm_employee_group_rights(array $scope): array {
    return [
        'personal' => ccrm_can($scope, 'employees.personal'),
        'pay' => ccrm_can($scope, 'employees.salaries'),
        'leave' => ccrm_can($scope, 'employees.vacations'),
        'documents' => ccrm_can($scope, 'employees.files'),
    ];
}

/** Who may link or unlink a login and an employee record (§3.1): Admin, or employees = edit AND pm_managers = edit. */
function ccrm_can_link_employee_user(array $scope): bool {
    return !empty($scope['isAdmin']) || (ccrm_can_edit($scope, 'employees') && ccrm_can_edit($scope, 'pm_managers'));
}
