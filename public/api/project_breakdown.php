<?php
/**
 * Read-only pre-aggregated time & labor breakdown per project x person, plus
 * earliest time-entry timestamps per task and ticket (for queue wait time).
 *
 *   GET /api/project_breakdown.php[?from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * Resolves each entry's effective project via:
 *   COALESCE(NULLIF(te.project_id, ''), NULLIF(t.related_project_id, ''), NULLIF(tk.project_id, ''))
 * and enforces B8 cost privacy: the caller's own cost is always returned, while
 * other people's costs require `time_tracking_costs` or `employees.salaries` (or Admin).
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('GET, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'code' => 'method_not_allowed']);
    exit;
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'code' => 'not_installed']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(503);
    echo json_encode(['success' => false, 'code' => 'database_unavailable']);
    exit;
}

$scope = ccrm_read_scope($pdo, $sessionUser);
if (!ccrm_can($scope, 'projects')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'code' => 'forbidden']);
    exit;
}

$callerId = (string)$sessionUser['id'];
$canCosts = !empty($scope['isAdmin'])
    || ccrm_can($scope, 'time_tracking_costs')
    || ccrm_can($scope, 'employees.salaries');

$from = trim((string)($_GET['from'] ?? ''));
$to = trim((string)($_GET['to'] ?? ''));
if ($from !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'code' => 'bad_date']);
    exit;
}
if ($to !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'code' => 'bad_date']);
    exit;
}

$where = ['te.`deleted_at` IS NULL', 'te.`duration_sec` IS NOT NULL'];
$params = [];
if ($from !== '') {
    $where[] = 'te.`entry_date` >= ?';
    $params[] = $from;
}
if ($to !== '') {
    $where[] = 'te.`entry_date` <= ?';
    $params[] = $to;
}

$sql = "
    SELECT
        COALESCE(NULLIF(t.`related_project_id`, ''), NULLIF(te.`project_id`, ''), NULLIF(tk.`project_id`, '')) AS `eff_project_id`,
        te.`user_id`,
        te.`employee_id`,
        COALESCE(SUM(te.`duration_sec`), 0) AS `sec`,
        COALESCE(SUM(CASE WHEN te.`billable` = 1 THEN te.`duration_sec` ELSE 0 END), 0) AS `billable_sec`,
        SUM(te.`cost`) AS `cost`,
        COALESCE(SUM(CASE WHEN te.`cost` IS NULL THEN te.`duration_sec` ELSE 0 END), 0) AS `unpriced_sec`
    FROM `time_entries` te
    LEFT JOIN `tasks` t ON t.`id` = te.`task_id` AND /* recurring-template: lookup task project */ 1 = 1
    LEFT JOIN `tickets` tk ON tk.`id` = te.`ticket_id`
    WHERE " . implode(' AND ', $where) . "
    GROUP BY `eff_project_id`, te.`user_id`, te.`employee_id`
";

$byProject = [];
try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $pid = (string)($r['eff_project_id'] ?? '');
        if ($pid === '') continue;
        $uid = (string)($r['user_id'] ?? '');
        $empId = !empty($r['employee_id']) ? (string)$r['employee_id'] : null;
        $sec = (int)$r['sec'];
        $billSec = (int)$r['billable_sec'];
        $own = $uid !== '' && $uid === $callerId;
        $unpriced = (int)($r['unpriced_sec'] ?? 0);

        if (!isset($byProject[$pid])) {
            $byProject[$pid] = [
                'seconds' => 0,
                'billableSeconds' => 0,
                'cost' => 0.0,
                'unpricedSeconds' => 0,
                'complete' => true,
                'people' => [],
            ];
        }
        $byProject[$pid]['seconds'] += $sec;
        $byProject[$pid]['billableSeconds'] += $billSec;
        $byProject[$pid]['unpricedSeconds'] += $unpriced;

        $personKey = $uid . '|' . ($empId ?? '');
        if (!isset($byProject[$pid]['people'][$personKey])) {
            $byProject[$pid]['people'][$personKey] = [
                'userId' => $uid,
                'employeeId' => $empId,
                'seconds' => 0,
                'billableSeconds' => 0,
                'cost' => 0.0,
                'canSeeCost' => $own || $canCosts,
            ];
        }
        $pRef = &$byProject[$pid]['people'][$personKey];
        $pRef['seconds'] += $sec;
        $pRef['billableSeconds'] += $billSec;
        if ($own || $canCosts) {
            // An entry without a cost counts as no cost (SUM() skips it); `unpricedSeconds` reports it.
            $c = (float)($r['cost'] ?? 0);
            $pRef['cost'] += $c;
            $byProject[$pid]['cost'] += $c;
        } else {
            $byProject[$pid]['complete'] = false;
        }
        unset($pRef);
    }

    foreach ($byProject as &$proj) {
        $proj['cost'] = $proj['complete'] ? round((float)$proj['cost'], 2) : null;
        unset($proj['complete']);
        $peopleOut = [];
        foreach ($proj['people'] as $p) {
            $row = [
                'userId' => $p['userId'],
                'employeeId' => $p['employeeId'],
                'seconds' => $p['seconds'],
                'billableSeconds' => $p['billableSeconds'],
            ];
            if ($p['canSeeCost']) {
                $row['cost'] = round((float)$p['cost'], 2);
            }
            $peopleOut[] = $row;
        }
        usort($peopleOut, static fn($a, $b) => $b['seconds'] <=> $a['seconds']);
        $proj['people'] = $peopleOut;
    }
    unset($proj);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
}

$firstEntryAtByTask = [];
$firstEntryAtByTicket = [];
try {
    $tStmt = $pdo->query("
        SELECT `task_id`, MIN(COALESCE(`start_at`, `created_at`)) AS `first_at`
        FROM `time_entries`
        WHERE `deleted_at` IS NULL AND `task_id` IS NOT NULL AND `task_id` <> ''
        GROUP BY `task_id`
    ");
    foreach ($tStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [] as $row) {
        if (!empty($row['task_id']) && !empty($row['first_at'])) {
            $firstEntryAtByTask[(string)$row['task_id']] = (string)$row['first_at'];
        }
    }

    $tkStmt = $pdo->query("
        SELECT `ticket_id`, MIN(COALESCE(`start_at`, `created_at`)) AS `first_at`
        FROM `time_entries`
        WHERE `deleted_at` IS NULL AND `ticket_id` IS NOT NULL AND `ticket_id` <> ''
        GROUP BY `ticket_id`
    ");
    foreach ($tkStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [] as $row) {
        if (!empty($row['ticket_id']) && !empty($row['first_at'])) {
            $firstEntryAtByTicket[(string)$row['ticket_id']] = (string)$row['first_at'];
        }
    }
} catch (\Throwable $e) {
    ccrm_log_exception($e);
}

echo json_encode([
    'success' => true,
    'canSeeAllCosts' => $canCosts,
    'byProject' => $byProject ?: new \stdClass(),
    'firstEntryAtByTask' => $firstEntryAtByTask ?: new \stdClass(),
    'firstEntryAtByTicket' => $firstEntryAtByTicket ?: new \stdClass(),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
