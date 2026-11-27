<?php
/**
 * GitHub pushes per project (stored by api/github_webhook.php), read side. Session auth.
 *
 *   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   (both optional; company-timezone days, both inclusive)
 *     -> { success, projects: [{ projectId, pushes, lastPushAt }], lastPush: { projectId, pushedAt } | null, total }
 *        `pushes` counts the rows whose pushed_at is inside the range, `lastPushAt` is that project's
 *        latest push of ALL time, `lastPush` the latest push inside the range, `total` the sum of `pushes`.
 *        A project is listed once it has had a push at all. Instants are UTC ISO 8601 with `Z`.
 *   GET ?projectId=...&limit=100          (limit 1..500)
 *     -> { success, pushes: [{ id, deliveryId, branch, pushedAt, pusher, commitCount, headSha, headMessage, compareUrl }] }
 *        newest first. `id` is the push's own identity (hash of the delivered body); `deliveryId` is GitHub's
 *        header, for reference, null when it was missing.
 *
 * Who may call it: whoever sync.php sends projects to, i.e. the `projects` module at view level (admin
 * included). Those users see every project, so there is no per-project filter beyond that. No DDL: while
 * the table is missing (the schema has not been applied yet) it answers 503.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/github_pushes.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('GET, OPTIONS');

function ccrm_pp_reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode(['success' => $status < 400] + $body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    ccrm_pp_reply(405, ['message' => 'Method Not Allowed']);
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_pp_reply(503, ['message' => 'Not installed.']);
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_pp_reply(500, ['message' => 'Database connection failed.']);
}

// sync.php sends projects when ccrm_can($scope, 'projects').
if (!ccrm_can(ccrm_read_scope($pdo, $sessionUser), 'projects')) {
    ccrm_pp_reply(403, ['message' => 'You do not have permission to view projects.']);
}

try {
    if (!ccrm_table_exists($pdo, 'project_pushes')) {
        ccrm_pp_reply(503, ['message' => 'The database is being updated. Try again in a moment.']);
    }

    $projectId = trim((string)($_GET['projectId'] ?? ''));
    if ($projectId !== '') {
        $limit = isset($_GET['limit']) && ctype_digit((string)$_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100;
        $exists = $pdo->prepare("SELECT 1 FROM `projects` WHERE `id` = ? LIMIT 1");
        $exists->execute([$projectId]);
        if (!$exists->fetchColumn()) {
            ccrm_pp_reply(404, ['message' => 'Project not found.']);
        }
        $stmt = $pdo->prepare(
            "SELECT `body_hash`, `delivery_id`, `branch`, `pushed_at`, `pusher`, `commit_count`, `head_sha`, `head_message`, `compare_url`
               FROM `project_pushes` WHERE `project_id` = ? ORDER BY `pushed_at` DESC, `body_hash` DESC LIMIT " . $limit
        );
        $stmt->execute([$projectId]);
        $pushes = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $pushes[] = [
                'id' => (string)$r['body_hash'],
                'deliveryId' => $r['delivery_id'] !== null ? (string)$r['delivery_id'] : null,
                'branch' => (string)$r['branch'],
                'pushedAt' => ccrm_github_iso($r['pushed_at']),
                'pusher' => $r['pusher'] !== null ? (string)$r['pusher'] : null,
                'commitCount' => (int)$r['commit_count'],
                'headSha' => $r['head_sha'] !== null ? (string)$r['head_sha'] : null,
                'headMessage' => $r['head_message'] !== null ? (string)$r['head_message'] : null,
                'compareUrl' => $r['compare_url'] !== null ? (string)$r['compare_url'] : null,
            ];
        }
        ccrm_pp_reply(200, ['pushes' => $pushes]);
    }

    $from = isset($_GET['from']) && $_GET['from'] !== '' ? (string)$_GET['from'] : null;
    $to = isset($_GET['to']) && $_GET['to'] !== '' ? (string)$_GET['to'] : null;
    $range = ccrm_github_day_range($from, $to, new \DateTimeZone(date_default_timezone_get()));
    if ($range === null) {
        ccrm_pp_reply(400, ['message' => 'from and to must be dates (YYYY-MM-DD), from not after to.']);
    }
    [$lo, $hi] = $range;
    $inRange = [];
    $bind = [];
    if ($lo !== null) {
        $inRange[] = "pp.`pushed_at` >= ?";
        $bind[] = $lo;
    }
    if ($hi !== null) {
        $inRange[] = "pp.`pushed_at` < ?";
        $bind[] = $hi;
    }
    $cond = $inRange ? implode(' AND ', $inRange) : '1 = 1';

    // Joined to projects: a push of a project that no longer exists is not reported.
    $stmt = $pdo->prepare(
        "SELECT pp.`project_id`, SUM(CASE WHEN {$cond} THEN 1 ELSE 0 END) AS `n`, MAX(pp.`pushed_at`) AS `last_at`
           FROM `project_pushes` pp JOIN `projects` pr ON pr.`id` = pp.`project_id`
          GROUP BY pp.`project_id` ORDER BY `last_at` DESC, pp.`project_id`"
    );
    $stmt->execute($bind);
    $projects = [];
    $total = 0;
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $n = (int)$r['n'];
        $total += $n;
        $projects[] = ['projectId' => (string)$r['project_id'], 'pushes' => $n, 'lastPushAt' => ccrm_github_iso($r['last_at'])];
    }

    $stmt = $pdo->prepare(
        "SELECT pp.`project_id`, pp.`pushed_at` FROM `project_pushes` pp JOIN `projects` pr ON pr.`id` = pp.`project_id`
          WHERE {$cond} ORDER BY pp.`pushed_at` DESC, pp.`body_hash` DESC LIMIT 1"
    );
    $stmt->execute($bind);
    $last = $stmt->fetch(\PDO::FETCH_ASSOC);
    ccrm_pp_reply(200, [
        'projects' => $projects,
        'lastPush' => $last ? ['projectId' => (string)$last['project_id'], 'pushedAt' => ccrm_github_iso($last['pushed_at'])] : null,
        'total' => $total,
    ]);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_pp_reply(500, ['message' => 'The pushes could not be read.']);
}
