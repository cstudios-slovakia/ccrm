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

function is_safe_select_query($sql, $pdo) {
    // 1. Must start with SELECT
    if (!preg_match('/^\s*SELECT\b/i', $sql)) {
        return false;
    }
    // 2. Disallow stacked queries (no semicolons)
    if (strpos($sql, ';') !== false) {
        return false;
    }
    // 3. Disallow write/DDL keywords
    $dangerous = [
        'insert', 'update', 'delete', 'drop', 'alter', 'create', 
        'replace', 'truncate', 'rename', 'grant', 'revoke', 'lock', 
        'execute', 'into outfile', 'load_file', 'union'
    ];
    $lowerSql = strtolower($sql);
    foreach ($dangerous as $word) {
        if (preg_match('/\b' . preg_quote($word, '/') . '\b/i', $lowerSql)) {
            return false;
        }
    }
    // 4. Prevent reading password columns
    if (preg_match('/\bpassword_hash\b/i', $lowerSql) || preg_match('/\bpassword\b/i', $lowerSql)) {
        return false;
    }
    
    // 5. Check all table names in SQL against the database list
    $allowed = ['leads', 'tasks', 'users', 'roles', 'role_permissions', 'meeting_notes', 'meeting_tasks', 'email_summaries', 'rag_emails', 'unified_entries', 'custom_dashboards', 'error_logs', 'lead_categories', 'task_assignees', 'timeline_events'];
    
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
            if (in_array($dbTableLower, $allowed) || strpos($dbTableLower, 'ue_') === 0) {
                continue;
            }
            return false; // Found disallowed table in SQL
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
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
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
