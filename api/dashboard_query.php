<?php
/**
 * Dynamic Dashboard Data Querying API
 * Exposes secure, read-only analytics query actions.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    $sessionUser = ccrm_require_auth();
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

/**
 * Columns that must never leave the server through the ad-hoc `sql` action, and
 * are therefore stripped from every result row (see ccrm_redact_result_rows).
 *
 * A keyword blocklist alone cannot protect these: `SELECT * FROM users` mentions
 * neither "password" nor "password_hash" yet returns both the bcrypt hashes and
 * metadata_json (which holds the encrypted mailbox credentials). Filtering the
 * OUTPUT is the only check that cannot be worded around.
 */
function ccrm_sensitive_result_columns(): array {
    return ['password_hash', 'password', 'metadata_json', 'api_key', 'token', 'secret'];
}

/** Reads a JSON-encoded value from `system_settings`, or `$default` if unset. */
function ccrm_dashboard_db_setting($pdo, $key, $default) {
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
    $stmt->execute([$key]);
    $val = $stmt->fetchColumn();
    if ($val === false) {
        return $default;
    }
    $decoded = json_decode($val, true);
    return $decoded !== null ? $decoded : $val;
}

/** Drop sensitive columns from ad-hoc query results, whatever SQL produced them. */
function ccrm_redact_result_rows(array $rows): array {
    $sensitive = ccrm_sensitive_result_columns();
    foreach ($rows as $i => $row) {
        if (!is_array($row)) {
            continue;
        }
        foreach ($row as $col => $_) {
            if (in_array(strtolower((string)$col), $sensitive, true)) {
                $rows[$i][$col] = '[REDACTED]';
            }
        }
    }
    return $rows;
}

/**
 * The permission keys a raw SELECT needs, from the tables it names: a view right on every
 * module whose table it touches (the leads table holds leads AND clients, so both; the
 * task tables are not row-scoped here, so tasks.view_all; mail bodies sit in timeline_events
 * and rag_emails, so email). A table that is diagnostic rather than business data
 * (error_logs) is Admin-only and reported as 'admin'.
 *
 * @return string[]
 */
function ccrm_dashboard_sql_requirements(string $sql): array {
    $lower = strtolower($sql);
    $byTable = [
        'leads' => ['leads', 'clients'],
        'lead_categories' => ['leads', 'clients'],
        'timeline_events' => ['leads', 'clients', 'email'],
        'tasks' => ['tasks', 'tasks.view_all'],
        'task_assignees' => ['tasks', 'tasks.view_all'],
        'roles' => ['pm_managers'],
        'role_permissions' => ['pm_managers'],
        'meeting_notes' => ['meetings'],
        'meeting_tasks' => ['meetings'],
        // Indexed mail and mail summaries hold every user's mailbox; raw SQL cannot be narrowed
        // to the caller's own, so they are Admin-only here.
        'email_summaries' => ['admin'],
        'rag_emails' => ['admin'],
        'unified_entries' => ['unified_entries'],
        'custom_dashboards' => ['dashboard.custom'],
        'error_logs' => ['admin'],
        'project_types' => ['projects'],
        'projects' => ['projects'],
        'project_managers' => ['projects'],
    ];
    $needs = [];
    foreach ($byTable as $table => $keys) {
        if (preg_match('/\b' . preg_quote($table, '/') . '\b/', $lower)) {
            $needs = array_merge($needs, $keys);
        }
    }
    if (preg_match('/\bue_[a-z0-9_]+\b/', $lower)) {
        $needs[] = 'unified_entries';
    }
    if (preg_match('/\bproj_(data|timeline|gantt)_[a-z0-9_]+\b/', $lower)) {
        $needs[] = 'projects';
    }
    return array_values(array_unique($needs));
}

function is_safe_select_query($sql, $pdo) {
    if (!is_string($sql)) {
        return false;
    }
    // 0. Reject SQL comments outright. `/*!50000UNION*/` is executed by MySQL but
    //    slips past a \bunion\b test (the digits kill the word boundary), and
    //    `-- ` / `#` let the rest of a statement be hidden from every check below.
    if (preg_match('~/\*|\*/|--|#~', $sql)) {
        return false;
    }
    // 1. Must start with SELECT (allow a leading open paren for `(SELECT ...)`).
    if (!preg_match('/^\s*\(?\s*SELECT\b/i', $sql)) {
        return false;
    }
    // 2. Disallow stacked queries (no semicolons)
    if (strpos($sql, ';') !== false) {
        return false;
    }
    // 3. Disallow write/DDL/file keywords. Matched on a whitespace-normalised copy
    //    so multi-word forms cannot be split with extra spaces, tabs or newlines
    //    ("INTO  OUTFILE" used to sail through and gives arbitrary file write).
    $lowerSql = strtolower($sql);
    $normalised = preg_replace('/\s+/', ' ', $lowerSql);
    $dangerous = [
        'insert', 'update', 'delete', 'drop', 'alter', 'create',
        'replace', 'truncate', 'rename', 'grant', 'revoke', 'lock',
        'execute', 'handler', 'call', 'do', 'set', 'prepare', 'union',
        'into outfile', 'into dumpfile', 'load_file', 'load data',
        'benchmark', 'sleep', 'get_lock', 'sys_exec', 'user', 'version',
    ];
    foreach ($dangerous as $word) {
        if (preg_match('/\b' . preg_quote($word, '/') . '\b/', $normalised)) {
            return false;
        }
    }
    // 4. Prevent reading password columns by name. Output redaction below is the
    //    real guarantee; this just fails the obvious attempt early and loudly.
    if (preg_match('/\bpassword(_hash)?\b/', $lowerSql)) {
        return false;
    }
    // 5. Never let the server's own catalogues be read. These are not returned by
    //    SHOW TABLES, so the per-table check below never saw them and
    //    `SELECT ... FROM information_schema.columns` mapped the whole schema.
    foreach (['information_schema', 'performance_schema', 'mysql', 'sys'] as $catalogue) {
        if (strpos($normalised, $catalogue) !== false) {
            return false;
        }
    }

    // 6. Check all table names in SQL against the database list
    $allowed = ['leads', 'tasks', 'users', 'roles', 'role_permissions', 'meeting_notes', 'meeting_tasks', 'email_summaries', 'rag_emails', 'unified_entries', 'custom_dashboards', 'error_logs', 'lead_categories', 'task_assignees', 'timeline_events', 'project_types', 'projects', 'project_managers'];

    try {
        $stmt = $pdo->query("SHOW TABLES");
        $allDbTables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (\Exception $e) {
        return false; // DB query failed
    }

    foreach ($allDbTables as $dbTable) {
        $dbTableLower = strtolower($dbTable);
        // If this table appears in the SQL query
        if (preg_match('/\b' . preg_quote($dbTableLower, '/') . '\b/i', $lowerSql)) {
            // Check if it's allowed
            if (in_array($dbTableLower, $allowed) ||
                strpos($dbTableLower, 'ue_') === 0 ||
                strpos($dbTableLower, 'proj_data_') === 0 ||
                strpos($dbTableLower, 'proj_timeline_') === 0 ||
                strpos($dbTableLower, 'proj_gantt_') === 0) {
                continue;
            }
            return false; // Found disallowed table in SQL
        }
    }

    // 7. Every identifier the query reads must resolve to a table we just cleared.
    //    Without this, a FROM target that exists but is not in SHOW TABLES (a view,
    //    a table in another schema reachable by the DB user) was never examined.
    if (preg_match_all('/\b(?:from|join)\s+`?([a-z0-9_\.]+)`?/i', $normalised, $m)) {
        foreach ($m[1] as $ref) {
            if (strpos($ref, '.') !== false) {
                return false; // schema-qualified reference — always out of scope
            }
            $ref = strtolower($ref);
            $known = in_array($ref, $allowed, true)
                || strpos($ref, 'ue_') === 0
                || strpos($ref, 'proj_data_') === 0
                || strpos($ref, 'proj_timeline_') === 0
                || strpos($ref, 'proj_gantt_') === 0;
            if (!$known) {
                return false;
            }
        }
    }

    return true;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);
$action = $data['action'] ?? $_GET['action'] ?? '';

if (empty($action)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing action parameter']);
    exit;
}

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// What the caller may read. The command-line run has no user and is unrestricted.
$scope = isset($sessionUser) ? ccrm_read_scope($pdo, $sessionUser) : null;
$ccrmDenied = function (): void {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden']);
    exit;
};
$ccrmCan = function (string $key) use ($scope): bool {
    return $scope === null || ccrm_can($scope, $key);
};
// A preset needs a view right on the module it reads (leads and clients share a table and
// are narrowed by row below; tasks are narrowed to the caller's own without view_all).
$ccrmPresetModules = [
    'leads_count' => ['leads', 'clients'],
    'leads_by_status' => ['leads', 'clients'],
    'leads_by_source' => ['leads', 'clients'],
    'pipeline_value' => ['leads', 'clients'],
    'recent_leads' => ['leads', 'clients'],
    'tasks_summary' => ['tasks'],
    'tasks_by_owner' => ['tasks'],
    'recent_tasks' => ['tasks'],
    'recent_meetings' => ['meetings'],
];
if (isset($ccrmPresetModules[$action])) {
    $any = false;
    foreach ($ccrmPresetModules[$action] as $key) {
        $any = $any || $ccrmCan($key);
    }
    if (!$any) {
        $ccrmDenied();
    }
}
$leadScope = ccrm_lead_scope_sql($scope);
$leadScopeAnd = $leadScope === '' ? '' : " AND {$leadScope}";
$leadScopeWhere = $leadScope === '' ? '' : " WHERE {$leadScope}";
[$taskScope, $taskScopeBind] = ccrm_task_scope_sql($scope, 't');

try {
    $result = [];
    switch ($action) {
        case 'sql':
            // The ad-hoc query runs raw SQL, which cannot be narrowed row by row, so it needs
            // Admin, or custom-dashboard editing together with a view right on every module
            // whose table it names.
            if ($scope !== null && empty($scope['isAdmin'])) {
                if (!ccrm_can_edit($scope, 'dashboard.custom')) {
                    $ccrmDenied();
                }
                foreach (ccrm_dashboard_sql_requirements((string)($data['sql'] ?? $data['params']['sql'] ?? '')) as $needKey) {
                    if ($needKey === 'admin' || !ccrm_can($scope, $needKey)) {
                        $ccrmDenied();
                    }
                }
            }
            $sql = $data['sql'] ?? $data['params']['sql'] ?? '';
            $params = $data['params']['bind'] ?? $data['params'] ?? [];
            if (isset($params['sql'])) {
                unset($params['sql']);
            }

            if (empty($sql)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Missing sql query parameter']);
                exit;
            }

            if (!is_safe_select_query($sql, $pdo)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Unauthorized or unsafe SQL query detected. Query must be a read-only SELECT and reference only allowed tables.']);
                exit;
            }

            $stmt = $pdo->prepare($sql);
            $stmt->execute(is_array($params) ? $params : []);
            // Redact secret columns from whatever came back. The filter above works
            // on the query text and can always be worded around; this works on the
            // result and cannot.
            $result = ccrm_redact_result_rows($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'leads_count':
            $status = $data['params']['status'] ?? null;
            if ($status) {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM `leads` WHERE `status` = ?{$leadScopeAnd}");
                $stmt->execute([$status]);
            } else {
                $stmt = $pdo->query("SELECT COUNT(*) FROM `leads`{$leadScopeWhere}");
            }
            $result = ['count' => (int)$stmt->fetchColumn()];
            break;

        case 'leads_by_status':
            // Optional `statuses` filter, written by the dashboard editor's phase
            // picker. GROUP BY can only ever return phases that some lead sits in,
            // so a picked phase with no leads is filled in as a zero row here —
            // otherwise an empty phase would silently drop out of the widget. The
            // rows also come back in the picked (pipeline) order rather than by
            // count, so the widget reads like the pipeline it describes.
            $wanted = $data['params']['statuses'] ?? null;
            $wanted = is_array($wanted)
                ? array_values(array_filter(array_map(fn($s) => trim((string)$s), $wanted), fn($s) => $s !== ''))
                : [];

            $stmt = $pdo->query("SELECT `status`, COUNT(*) as `count`, SUM(`value`) as `total_value` FROM `leads`{$leadScopeWhere} GROUP BY `status` ORDER BY `count` DESC");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($wanted)) {
                $result = $rows;
                break;
            }

            $byStatus = [];
            foreach ($rows as $row) {
                $byStatus[mb_strtolower(trim((string)($row['status'] ?? '')))] = $row;
            }
            $result = [];
            foreach ($wanted as $status) {
                $result[] = $byStatus[mb_strtolower($status)]
                    ?? ['status' => $status, 'count' => 0, 'total_value' => 0];
            }
            break;

        case 'leads_by_source':
            $stmt = $pdo->query("SELECT `source`, COUNT(*) as `count`, SUM(`value`) as `total_value` FROM `leads`{$leadScopeWhere} GROUP BY `source` ORDER BY `count` DESC");
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'pipeline_value':
            // Optional `statuses` filter, same shape as `leads_by_status`. When
            // the widget sends none, fall back to every status whose configured
            // stage group is not "closed" (LEAD_STAGE_GROUPS), so this agrees
            // with the overview's "active pipeline" total instead of summing
            // every lead regardless of stage or archive state.
            $wanted = $data['params']['statuses'] ?? null;
            $wanted = is_array($wanted)
                ? array_values(array_filter(array_map(fn($s) => trim((string)$s), $wanted), fn($s) => $s !== ''))
                : [];

            if (empty($wanted)) {
                $leadStates = ccrm_dashboard_db_setting($pdo, 'LEAD_STATES', []);
                $stageGroups = ccrm_dashboard_db_setting($pdo, 'LEAD_STAGE_GROUPS', []);
                $wanted = array_values(array_filter(
                    is_array($leadStates) ? $leadStates : [],
                    fn($s) => ($stageGroups[$s] ?? 'new') !== 'closed'
                ));
            }

            if (empty($wanted)) {
                $stmt = $pdo->query("SELECT SUM(`value`) FROM `leads` WHERE `archived` = 0{$leadScopeAnd}");
            } else {
                $placeholders = implode(',', array_fill(0, count($wanted), '?'));
                $stmt = $pdo->prepare("SELECT SUM(`value`) FROM `leads` WHERE `archived` = 0 AND LOWER(`status`) IN ({$placeholders}){$leadScopeAnd}");
                $stmt->execute(array_map(fn($s) => mb_strtolower($s), $wanted));
            }
            $result = ['value' => (float)($stmt->fetchColumn() ?: 0)];
            break;

        case 'tasks_summary':
            $stmt = $pdo->prepare("SELECT `status`, COUNT(*) as `count` FROM `tasks` `t`" . ($taskScope !== '' ? " WHERE {$taskScope}" : '') . " GROUP BY `status` ORDER BY `count` DESC");
            $stmt->execute($taskScopeBind);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'tasks_by_owner':
            $stmt = $pdo->prepare("SELECT `owner`, COUNT(*) as `count` FROM `tasks` `t`" . ($taskScope !== '' ? " WHERE {$taskScope}" : '') . " GROUP BY `owner` ORDER BY `count` DESC");
            $stmt->execute($taskScopeBind);
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'recent_leads':
            // The Dashboard's lead table is a designed card, not a raw dump: it
            // shows what kind of client the lead is and where it sits, sorts by
            // newest or by worth, and prints "5 of 44" under itself. All of that
            // is decided here so the widget stays one request.
            $limit = (int)($data['params']['limit'] ?? 5);
            $limit = max(1, min($limit, 50));
            $order = ($data['params']['order'] ?? 'recent') === 'value'
                ? "`l`.`value` DESC, `l`.`created_at` DESC"
                : "`l`.`created_at` DESC, `l`.`id` DESC";

            $wanted = $data['params']['statuses'] ?? null;
            $wanted = is_array($wanted)
                ? array_values(array_filter(array_map(fn($s) => trim((string)$s), $wanted), fn($s) => $s !== ''))
                : [];

            $whereParts = [];
            $bind = [];
            if (!empty($wanted)) {
                $whereParts[] = 'LOWER(`l`.`status`) IN (' . implode(',', array_fill(0, count($wanted), '?')) . ')';
                $bind = array_map(fn($s) => mb_strtolower($s), $wanted);
            }
            $recentLeadScope = ccrm_lead_scope_sql($scope, 'l');
            if ($recentLeadScope !== '') {
                $whereParts[] = $recentLeadScope;
            }
            $where = $whereParts ? ' WHERE ' . implode(' AND ', $whereParts) : '';

            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM `leads` `l`{$where}");
            $countStmt->execute($bind);
            $total = (int)$countStmt->fetchColumn();

            $sql = "SELECT `l`.`id`, `l`.`name`, `l`.`status`, `l`.`value`, `l`.`owner`, `l`.`source`,
                           `l`.`city`, `l`.`client_type`, `l`.`created_at`, `c`.`name` AS `category`
                      FROM `leads` `l`
                      LEFT JOIN `client_categories` `c` ON `c`.`id` = `l`.`client_category_id`
                      {$where}
                     ORDER BY {$order}
                     LIMIT ?";
            $stmt = $pdo->prepare($sql);
            foreach ($bind as $i => $value) {
                $stmt->bindValue($i + 1, $value);
            }
            $stmt->bindValue(count($bind) + 1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            // Carried on every row rather than wrapped in an envelope: the widget
            // format is "an array of rows", and a generic table simply ignores a
            // column it was not told to print.
            foreach ($result as &$row) { $row['total_count'] = $total; }
            unset($row);
            break;

        case 'recent_meetings':
            $limit = (int)($data['params']['limit'] ?? 5);
            $limit = max(1, min($limit, 50));
            $stmt = $pdo->prepare("SELECT `id`, `title`, `created_at` FROM `meeting_notes` ORDER BY `created_at` DESC LIMIT ?");
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'recent_tasks':
            // Same shape as `recent_leads`: the row carries what the task card
            // draws (the lead and project it hangs off), and the widget's own
            // filters — whose tasks, which states, which order — are parameters.
            $limit = (int)($data['params']['limit'] ?? 5);
            $limit = max(1, min($limit, 50));
            $order = ($data['params']['order'] ?? 'created') === 'deadline'
                ? "`t`.`deadline` ASC, `t`.`created_at` DESC"
                : "`t`.`created_at` DESC, `t`.`id` DESC";

            $where = ['`t`.`archived` = 0'];
            $bind = [];

            $wanted = $data['params']['statuses'] ?? null;
            $wanted = is_array($wanted)
                ? array_values(array_filter(array_map(fn($s) => trim((string)$s), $wanted), fn($s) => $s !== ''))
                : [];
            if (!empty($wanted)) {
                $where[] = 'LOWER(`t`.`status`) IN (' . implode(',', array_fill(0, count($wanted), '?')) . ')';
                foreach ($wanted as $status) { $bind[] = mb_strtolower($status); }
            }

            $owner = trim((string)($data['params']['owner'] ?? ''));
            if ($owner !== '') {
                // "My tasks" means assigned to me, which for a shared task is the
                // assignee table rather than the single `owner` column.
                $where[] = '(`t`.`owner` = ? OR EXISTS (SELECT 1 FROM `task_assignees` `ta` WHERE `ta`.`task_id` = `t`.`id` AND `ta`.`user_name` = ?))';
                $bind[] = $owner;
                $bind[] = $owner;
            }

            // Without tasks.view_all only the caller's own, created and assigned tasks.
            if ($taskScope !== '') {
                $where[] = $taskScope;
                // The scope's bind values come AFTER the filters' placeholders in the SQL
                // text only when appended last, which is where its condition sits.
                foreach ($taskScopeBind as $tb) { $bind[] = $tb; }
            }
            $whereSql = ' WHERE ' . implode(' AND ', $where);

            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM `tasks` `t`{$whereSql}");
            $countStmt->execute($bind);
            $total = (int)$countStmt->fetchColumn();

            $sql = "SELECT `t`.`id`, `t`.`title`, `t`.`status`, `t`.`priority`, `t`.`owner`,
                           `t`.`deadline`, `t`.`deadline_time`, `t`.`related_lead_id`,
                           `l`.`name` AS `lead_name`, `p`.`name` AS `project_name`
                      FROM `tasks` `t`
                      LEFT JOIN `leads` `l` ON `l`.`id` = `t`.`related_lead_id`
                      LEFT JOIN `projects` `p` ON `p`.`id` = `t`.`related_project_id`
                      {$whereSql}
                     ORDER BY {$order}
                     LIMIT ?";
            $stmt = $pdo->prepare($sql);
            foreach ($bind as $i => $value) {
                $stmt->bindValue($i + 1, $value);
            }
            $stmt->bindValue(count($bind) + 1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($result as &$row) { $row['total_count'] = $total; }
            unset($row);
            break;

        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Unknown action: {$action}"]);
            exit;
    }

    echo json_encode(['success' => true, 'data' => $result]);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Query execution failed.']);
}
