<?php
/**
 * Read-only viewer for the audit_log table (administrators only).
 *
 * The audit trail was write-only: eighteen call sites appended to it and nothing
 * could read it back without a database shell. This endpoint closes that loop.
 *
 *   GET /api/audit_log.php
 *       ?page=1            1-based page
 *       &per_page=50       1..200
 *       &action=auth.      action prefix (e.g. "auth." or "user.role_change")
 *       &actor=anna@       substring of the actor e-mail
 *       &from=2026-10-01   created on/after (YYYY-MM-DD)
 *       &to=2026-10-31     created on/before (YYYY-MM-DD)
 *       &format=csv        download the filtered rows as CSV (capped at 5000)
 *
 * It never modifies anything: no row can be edited or deleted through the API.
 */
require_once __DIR__ . '/auth.php';

header('Cache-Control: no-store');
ccrm_send_cors('GET, OPTIONS');

$user = ccrm_require_admin();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Content-Type: application/json');
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    header('Content-Type: application/json');
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();

    $where = [];
    $params = [];

    $actionPrefix = trim((string)($_GET['action'] ?? ''));
    if ($actionPrefix !== '') {
        // Escape LIKE wildcards so the filter is a plain prefix match.
        $where[] = "`action` LIKE ? ESCAPE '\\\\'";
        $params[] = addcslashes($actionPrefix, '%_\\') . '%';
    }
    $actor = trim((string)($_GET['actor'] ?? ''));
    if ($actor !== '') {
        $where[] = "`actor_email` LIKE ? ESCAPE '\\\\'";
        $params[] = '%' . addcslashes($actor, '%_\\') . '%';
    }
    $from = trim((string)($_GET['from'] ?? ''));
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
        $where[] = '`created_at` >= ?';
        $params[] = $from . ' 00:00:00';
    }
    $to = trim((string)($_GET['to'] ?? ''));
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
        $where[] = '`created_at` <= ?';
        $params[] = $to . ' 23:59:59';
    }
    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    if (($_GET['format'] ?? '') === 'csv') {
        $stmt = $pdo->prepare("SELECT `id`, `created_at`, `actor_id`, `actor_email`, `action`, `detail`, `ip` FROM `audit_log` {$whereSql} ORDER BY `id` DESC LIMIT 5000");
        $stmt->execute($params);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="audit-log-' . date('Y-m-d') . '.csv"');
        $out = fopen('php://output', 'w');
        fputcsv($out, ['id', 'created_at', 'actor_id', 'actor_email', 'action', 'detail', 'ip']);
        while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
            // Neutralise spreadsheet formula injection in the free-text columns.
            foreach ($row as $i => $cell) {
                if (is_string($cell) && $cell !== '' && strpbrk($cell[0], "=+-@\t\r") !== false) {
                    $row[$i] = "'" . $cell;
                }
            }
            fputcsv($out, $row);
        }
        fclose($out);
        exit;
    }

    header('Content-Type: application/json');
    $perPage = max(1, min(200, (int)($_GET['per_page'] ?? 50)));
    $page = max(1, (int)($_GET['page'] ?? 1));
    $offset = ($page - 1) * $perPage;

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM `audit_log` {$whereSql}");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare(
        "SELECT `id`, `created_at`, `actor_id`, `actor_email`, `action`, `detail`, `ip`
           FROM `audit_log` {$whereSql}
          ORDER BY `id` DESC
          LIMIT {$perPage} OFFSET {$offset}"
    );
    $stmt->execute($params);

    echo json_encode([
        'success' => true,
        'page' => $page,
        'per_page' => $perPage,
        'total' => $total,
        'entries' => $stmt->fetchAll(PDO::FETCH_ASSOC),
    ]);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Could not read the audit log.']);
}
