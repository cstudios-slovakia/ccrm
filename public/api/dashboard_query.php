<?php
/**
 * Dynamic Dashboard Data Querying API
 * Exposes secure, read-only analytics query actions.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    ccrm_require_auth();
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
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
    exit;
}

try {
    $result = [];
    switch ($action) {
        case 'sql':
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
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM `leads` WHERE `status` = ?");
                $stmt->execute([$status]);
            } else {
                $stmt = $pdo->query("SELECT COUNT(*) FROM `leads`");
            }
            $result = ['count' => (int)$stmt->fetchColumn()];
            break;

        case 'leads_by_status':
            $stmt = $pdo->query("SELECT `status`, COUNT(*) as `count`, SUM(`value`) as `total_value` FROM `leads` GROUP BY `status` ORDER BY `count` DESC");
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'leads_by_source':
            $stmt = $pdo->query("SELECT `source`, COUNT(*) as `count`, SUM(`value`) as `total_value` FROM `leads` GROUP BY `source` ORDER BY `count` DESC");
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'pipeline_value':
            $stmt = $pdo->query("SELECT SUM(`value`) FROM `leads`");
            $result = ['value' => (float)($stmt->fetchColumn() ?: 0)];
            break;

        case 'tasks_summary':
            $stmt = $pdo->query("SELECT `status`, COUNT(*) as `count` FROM `tasks` GROUP BY `status` ORDER BY `count` DESC");
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'tasks_by_owner':
            $stmt = $pdo->query("SELECT `owner`, COUNT(*) as `count` FROM `tasks` GROUP BY `owner` ORDER BY `count` DESC");
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        case 'recent_leads':
            $limit = (int)($data['params']['limit'] ?? 5);
            $limit = max(1, min($limit, 50));
            $stmt = $pdo->prepare("SELECT `id`, `name`, `status`, `value`, `owner`, `created_at` FROM `leads` ORDER BY `created_at` DESC LIMIT ?");
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
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
            $limit = (int)($data['params']['limit'] ?? 5);
            $limit = max(1, min($limit, 50));
            $stmt = $pdo->prepare("SELECT `id`, `title`, `status`, `priority`, `owner`, `deadline` FROM `tasks` ORDER BY `created_at` DESC LIMIT ?");
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            break;

        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Unknown action: {$action}"]);
            exit;
    }

    echo json_encode(['success' => true, 'data' => $result]);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Query execution failed: ' . $e->getMessage()]);
}
