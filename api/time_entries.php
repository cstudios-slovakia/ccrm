<?php
/**
 * Time tracking entries — the module's own API (session auth, never the sync.php blob).
 *
 *   GET  ?from&to&userId&projectId&taskId&ticketId   list (userId: omitted = me, <id> or "all" need time_tracking_team)
 *   GET  ?running=1                                  the caller's running entry
 *   GET  ?action=settings                            TimeTrackingSettings + the caller's work calendar
 *   GET  ?action=taskPeople&taskId=                  per-person seconds on one task; cost follows B8
 *   POST action=start        in ONE transaction stop the caller's running entry and start a new one
 *   POST action=stop         {id?, projectId?}
 *   POST action=undo_start   {newId, stoppedId?}     the Undo of a start: drop the new entry, reopen the stopped one
 *   POST action=create       manual / hours-only / calendar / timesheet entries
 *   POST action=update       {id, ...fields}
 *   POST action=delete       {id}                    soft delete
 *   POST action=restore      {id}                    the Undo of a delete
 *   POST action=settings     {settings}              admin / general_config only
 *
 * Rules that make this safe:
 *  - Owner (`user_id`) is the caller unless a manager with time_tracking_team logs time for
 *    someone; `recorded_by_user_id` is always the caller. `employee_id` is RESOLVED from the
 *    owner, never chosen by the client.
 *  - Cost fields are stripped server-side: the owner always sees their own, anybody else's
 *    need time_tracking_costs; `billableRate` always needs it (ccrm_tt_entry_json).
 *  - The database allows one running timer per user (UNIQUE running_guard). A start that
 *    loses a race answers 409 with the entry that is already running.
 *  - The title of a linked entry is the task's / ticket's, joined live. Renaming goes
 *    through sync.php (the task / ticket save path); nothing here writes tasks.title.
 *  - Errors cross the wire as stable codes; the client turns them into sentences.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/time_entries_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

function ccrm_te_respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload + ['success' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function ccrm_te_fail(string $code, int $status = 400, array $extra = []): void {
    http_response_code($status);
    echo json_encode(['success' => false, 'code' => $code] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_te_fail('not_installed', 503);
}
require_once $configFile;
try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_te_fail('database_unavailable', 503);
}

$scope = ccrm_read_scope($pdo, $sessionUser);
if (!ccrm_can($scope, 'time_tracking')) {
    ccrm_te_fail('forbidden', 403);
}
$callerId = (string)$sessionUser['id'];
$canEdit = ccrm_can($scope, 'time_tracking', 'edit');
$canTeam = ccrm_can($scope, 'time_tracking_team');
$canCosts = ccrm_can($scope, 'time_tracking_costs');
$viewer = ['userId' => $callerId, 'canCosts' => $canCosts];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = [];
if ($method === 'POST') {
    $decoded = json_decode((string)file_get_contents('php://input'), true);
    $body = is_array($decoded) ? $decoded : [];
}
$action = trim((string)($body['action'] ?? $_GET['action'] ?? ''));
$settings = ccrm_tt_load_settings($pdo);

// ---------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------

/** May the caller touch this entry's owner's time? */
function ccrm_te_can_touch(string $ownerId, string $callerId, bool $canTeam): bool {
    return $ownerId === $callerId || $canTeam;
}

/** The caller's running entry row (time_entries columns only), optionally locking it. */
function ccrm_te_running_row(\PDO $pdo, string $userId, bool $lock = false): ?array {
    $stmt = $pdo->prepare("SELECT * FROM `time_entries` WHERE `user_id` = ? AND `start_at` IS NOT NULL AND `end_at` IS NULL AND `deleted_at` IS NULL LIMIT 1" . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([$userId]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    return $row ?: null;
}

function ccrm_te_user_exists(\PDO $pdo, string $userId): bool {
    $stmt = $pdo->prepare("SELECT 1 FROM `users` WHERE `id` = ? LIMIT 1");
    $stmt->execute([$userId]);
    return (bool)$stmt->fetchColumn();
}

function ccrm_te_json(\PDO $pdo, string $id, array $viewer): ?array {
    $row = ccrm_tt_fetch_entry($pdo, $id);
    return $row ? ccrm_tt_entry_json($row, $viewer) : null;
}

/**
 * Link rules that depend on who is asking: a task must be visible to the caller, a ticket needs
 * the tickets module, and an explicit project needs the projects module unless it is the one
 * the task or ticket already points at.
 */
function ccrm_te_check_link_access(\PDO $pdo, array $scope, array $links, ?string $explicitProject): ?string {
    if ($links['task_id'] !== null && !isset(ccrm_visible_task_ids($pdo, $scope, [$links['task_id']])[$links['task_id']])) {
        return 'task_not_found';
    }
    if ($links['task_id'] === null && $links['ticket_id'] !== null && !ccrm_can($scope, 'tickets')) {
        return 'forbidden_ticket';
    }
    if ($explicitProject !== null && $explicitProject !== $links['derivedProject'] && !ccrm_can($scope, 'projects')) {
        return 'forbidden_project';
    }
    return null;
}

const CCRM_TE_SOURCES = ['timer', 'manual', 'day', 'calendar', 'timesheet', 'extension', 'activity'];
const CCRM_TE_ORIGINS = ['task', 'ticket', 'project', 'calendar', 'activity'];

function ccrm_te_source($v, string $default): string {
    return in_array($v, CCRM_TE_SOURCES, true) ? $v : $default;
}

function ccrm_te_origin($v): ?string {
    return in_array($v, CCRM_TE_ORIGINS, true) ? $v : null;
}

/* PHASE6-LOCK-START */
/**
 * Calendar age in days of an entry date against a company-timezone today.
 * Mirrors entryAgeDays() in src/utils/timeLock.ts (strictly greater than lockAfterDays locks).
 */
function ccrm_te_age_days(string $entryDate, string $today): ?int {
    $a = \DateTimeImmutable::createFromFormat('!Y-m-d', substr($entryDate, 0, 10));
    $b = \DateTimeImmutable::createFromFormat('!Y-m-d', substr($today, 0, 10));
    if (!$a || !$b || $a->format('Y-m-d') !== substr($entryDate, 0, 10) || $b->format('Y-m-d') !== substr($today, 0, 10)) {
        return null;
    }
    return (int)$a->diff($b)->format('%r%a');
}

/** True when a paid salary period key covers this entry's YYYY-MM. */
function ccrm_te_month_is_paid(string $entryDate, array $keys): bool {
    $month = substr($entryDate, 0, 7);
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return false;
    }
    foreach ($keys as $key) {
        $key = (string)$key;
        if ($key === $month || str_starts_with($key, $month . '-') || str_starts_with($key, $month . 'W')) {
            return true;
        }
    }
    return false;
}

/** Paid payroll period keys for one employee. A missing table does not lock anyone. */
function ccrm_te_paid_keys(\PDO $pdo, ?string $employeeId): array {
    if ($employeeId === null || $employeeId === '') {
        return [];
    }
    try {
        $stmt = $pdo->prepare("SELECT `period_key` FROM `employee_salaries` WHERE `employee_id` = ? AND `status` = 'paid'");
        $stmt->execute([$employeeId]);
        return array_map('strval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    } catch (\Throwable $e) {
        return [];
    }
}

/**
 * Why a stored (or about-to-be-written) row is locked: age, paid payroll month, or approved.
 * A running timer skips the age rule. Null means a non-admin may still edit it.
 */
function ccrm_te_lock_reason_of(\PDO $pdo, array $row, array $settings, string $today): ?string {
    $running = !empty($row['start_at']) && empty($row['end_at']);
    $lockAfter = $settings['lockAfterDays'] ?? null;
    if (!$running && $lockAfter !== null) {
        $age = ccrm_te_age_days((string)($row['entry_date'] ?? ''), $today);
        if ($age !== null && $age > (int)$lockAfter) {
            return 'age';
        }
    }
    $employeeId = $row['employee_id'] ?? null;
    if (($employeeId === null || $employeeId === '') && !empty($row['user_id'])) {
        $emp = ccrm_tt_employee_for_user($pdo, (string)$row['user_id']);
        $employeeId = $emp['id'] ?? null;
    }
    if (ccrm_te_month_is_paid((string)($row['entry_date'] ?? ''), ccrm_te_paid_keys($pdo, $employeeId !== null ? (string)$employeeId : null))) {
        return 'paid_payroll';
    }
    if (strtolower(trim((string)($row['approval_status'] ?? ''))) === 'approved') {
        return 'approved';
    }
    return null;
}

/**
 * Non-admins cannot create, edit, delete or restore a locked entry.
 * An admin can; that override is written to the audit log.
 *
 * @param list<array<string, mixed>> $rows
 */
function ccrm_te_refuse_locked(\PDO $pdo, array $sessionUser, array $rows, array $settings): void {
    $today = ccrm_tt_local_date(ccrm_tt_now_utc());
    $reason = null;
    $id = 'new';
    foreach ($rows as $row) {
        $found = ccrm_te_lock_reason_of($pdo, $row, $settings, $today);
        if ($found !== null) {
            $reason = $found;
            $id = (string)($row['id'] ?? 'new');
            break;
        }
    }
    if ($reason === null) {
        return;
    }
    if (ccrm_is_admin($sessionUser)) {
        ccrm_audit_log($pdo, $sessionUser, 'time_entry.lock_override', "Admin changed locked time entry {$id} ({$reason})");
        return;
    }
    ccrm_te_fail('entry_locked', 403, ['reason' => $reason]);
}

/** Flag each listed entry whose employee has a paid salary for that month. */
function ccrm_te_stamp_paid_months(\PDO $pdo, array $entries): array {
    $ids = [];
    foreach ($entries as $e) {
        if (!empty($e['employeeId'])) {
            $ids[(string)$e['employeeId']] = true;
        }
    }
    $map = [];
    if ($ids) {
        try {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $pdo->prepare("SELECT `employee_id`, `period_key` FROM `employee_salaries` WHERE `status` = 'paid' AND `employee_id` IN ($placeholders)");
            $stmt->execute(array_keys($ids));
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $map[(string)$row['employee_id']][] = (string)$row['period_key'];
            }
        } catch (\Throwable $e) {
            $map = [];
        }
    }
    foreach ($entries as $i => $e) {
        $keys = $map[(string)($e['employeeId'] ?? '')] ?? [];
        $entries[$i]['paidPayrollMonth'] = ccrm_te_month_is_paid((string)($e['entryDate'] ?? ''), $keys);
    }
    return $entries;
}
/* PHASE6-LOCK-END */

/** The longest stretch a single entry may span; a timer left running is stopped by the cron, not capped here. */
const CCRM_TE_MAX_SECONDS = 86400;

// ---------------------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------------------

if ($method === 'GET') {
    if ($action === 'settings') {
        $employee = ccrm_tt_employee_for_user($pdo, $callerId);
        ccrm_te_respond([
            'settings' => $settings,
            'defaultCountry' => ccrm_holiday_company_country($pdo),
            'me' => [
                'userId' => $callerId,
                'employeeId' => $employee['id'] ?? null,
                'workCountry' => ccrm_tt_work_country($pdo, $employee),
            ],
            'viewer' => ['canEdit' => $canEdit, 'canTeam' => $canTeam, 'canCosts' => $canCosts],
        ]);
    }

    if (isset($_GET['running']) || $action === 'running') {
        $row = ccrm_te_running_row($pdo, $callerId);
        ccrm_te_respond(['entry' => $row ? ccrm_te_json($pdo, $row['id'], $viewer) : null]);
    }

    // Aggregates for the task chip, the project Time tab and the labour line.
    // Hours of every user (a task's tracked time is not a private entry). Cost is
    // included only when every contributing row is one the caller may see — their
    // own always, anyone else's only with time_tracking_costs — so a partial sum
    // is never presented as the project's labour.
    if ($action === 'totals') {
        $stmt = $pdo->query("SELECT `task_id`, `ticket_id`, `project_id`, `user_id`, COALESCE(SUM(`duration_sec`), 0) AS `sec`, SUM(`cost`) AS `cost`, SUM(`cost` IS NULL) AS `missing`
            FROM `time_entries` WHERE `deleted_at` IS NULL AND `duration_sec` IS NOT NULL
            GROUP BY `task_id`, `ticket_id`, `project_id`, `user_id`");
        $byTask = [];
        $byTicket = [];
        $byProject = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $own = (string)$r['user_id'] === $callerId;
            $sec = (int)$r['sec'];
            if ($r['task_id']) {
                $byTask[$r['task_id']] = ($byTask[$r['task_id']] ?? 0) + $sec;
            }
            if ($r['ticket_id']) {
                $byTicket[$r['ticket_id']] = ($byTicket[$r['ticket_id']] ?? 0) + $sec;
            }
            if ($r['project_id']) {
                if (!isset($byProject[$r['project_id']])) {
                    $byProject[$r['project_id']] = ['seconds' => 0, 'cost' => 0.0, 'complete' => true];
                }
                $byProject[$r['project_id']]['seconds'] += $sec;
                if ($own || $canCosts) {
                    if ((int)$r['missing'] > 0) {
                        $byProject[$r['project_id']]['complete'] = false;
                    } else {
                        $byProject[$r['project_id']]['cost'] += (float)$r['cost'];
                    }
                } else {
                    $byProject[$r['project_id']]['complete'] = false;
                }
            }
        }
        foreach ($byProject as &$proj) {
            $proj['cost'] = $proj['complete'] ? round($proj['cost'], 2) : null;
            unset($proj['complete']);
        }
        unset($proj);
        ccrm_te_respond(['byTask' => $byTask ?: new stdClass(), 'byTicket' => $byTicket ?: new stdClass(), 'byProject' => $byProject ?: new stdClass()]);
    }

    /* PHASE2-TASK-PEOPLE-START — phase 2 task drawer. Do not delete this block. */
    // Per-person hours on one task. Hours are not private (same rule as totals).
    // Cost is sent for the caller always, and for anyone else only with
    // time_tracking_costs. null cost = no rate; an omitted cost = hidden.
    if ($action === 'taskPeople') {
        $taskId = trim((string)($_GET['taskId'] ?? ''));
        if ($taskId === '') {
            ccrm_te_fail('bad_request', 400);
        }
        if (!isset(ccrm_visible_task_ids($pdo, $scope, [$taskId])[$taskId])) {
            ccrm_te_respond(['people' => []]);
        }
        $stmt = $pdo->prepare("SELECT `user_id`, COALESCE(SUM(`duration_sec`), 0) AS `sec`, SUM(`cost`) AS `cost`, SUM(`cost` IS NULL) AS `missing`
            FROM `time_entries`
            WHERE `deleted_at` IS NULL AND `duration_sec` IS NOT NULL AND `task_id` = ?
            GROUP BY `user_id`
            ORDER BY `sec` DESC, `user_id`");
        $stmt->execute([$taskId]);
        $people = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $uid = (string)$r['user_id'];
            $person = ['userId' => $uid, 'seconds' => (int)$r['sec']];
            if ($uid === $callerId || $canCosts) {
                $person['cost'] = (int)$r['missing'] > 0 ? null : round((float)$r['cost'], 2);
            }
            $people[] = $person;
        }
        ccrm_te_respond(['people' => $people]);
    }
    /* PHASE2-TASK-PEOPLE-END */

    // Retainer maths: billable rows of a project, without titles, names or cost.
    // Reading a ticket's time requires tickets.time (B15).
    if ($action === 'usage') {
        if (!ccrm_can($scope, 'tickets.time')) {
            ccrm_te_fail('forbidden', 403);
        }
        $projectId = trim((string)($_GET['projectId'] ?? ''));
        if ($projectId === '') {
            ccrm_te_fail('bad_request', 400);
        }
        $stmt = $pdo->prepare("SELECT te.`id`, te.`project_id`, te.`ticket_id`, te.`task_id`, te.`billable`, te.`entry_date`, te.`duration_sec`
            FROM `time_entries` te
            WHERE te.`deleted_at` IS NULL AND te.`duration_sec` IS NOT NULL
              AND (te.`project_id` = ? OR te.`ticket_id` IN (SELECT `id` FROM `tickets` WHERE `project_id` = ?))");
        $stmt->execute([$projectId, $projectId]);
        $rows = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $rows[] = [
                'id' => $r['id'],
                'projectId' => $r['project_id'],
                'ticketId' => $r['ticket_id'],
                'taskId' => $r['task_id'],
                'billable' => (bool)$r['billable'],
                'entryDate' => $r['entry_date'],
                'durationSec' => (int)$r['duration_sec'],
            ];
        }
        ccrm_te_respond(['entries' => $rows]);
    }

    // List.
    $from = isset($_GET['from']) && ccrm_tt_valid_date((string)$_GET['from']) ? (string)$_GET['from'] : gmdate('Y-m-d', strtotime('-30 days'));
    $to = isset($_GET['to']) && ccrm_tt_valid_date((string)$_GET['to']) ? (string)$_GET['to'] : gmdate('Y-m-d', strtotime('+1 day'));
    $where = ["te.`deleted_at` IS NULL", "te.`entry_date` BETWEEN ? AND ?"];
    $params = [$from, $to];

    $ticketFilter = trim((string)($_GET['ticketId'] ?? ''));
    if ($ticketFilter !== '' && !ccrm_can($scope, 'tickets.time')) {
        ccrm_te_fail('forbidden', 403);
    }
    $who = isset($_GET['userId']) ? trim((string)$_GET['userId']) : '';
    // A ticket's time list is everyone's entries on that ticket. Any other list
    // without time_tracking_team is forced to the caller.
    if ($ticketFilter === '' && ($who === '' || $who === $callerId || !$canTeam)) {
        $where[] = "te.`user_id` = ?";
        $params[] = $callerId;
    } elseif ($ticketFilter === '' && $who !== 'all' && $who !== '') {
        $where[] = "te.`user_id` = ?";
        $params[] = $who;
    }
    foreach (['projectId' => 'project_id', 'taskId' => 'task_id', 'ticketId' => 'ticket_id'] as $param => $col) {
        $v = trim((string)($_GET[$param] ?? ''));
        if ($v !== '') {
            $where[] = "te.`{$col}` = ?";
            $params[] = $v;
        }
    }
    $sql = ccrm_tt_entry_select() . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY te.`entry_date` DESC, COALESCE(te.`start_at`, te.`created_at`) DESC LIMIT 5000';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $entries = array_map(fn($r) => ccrm_tt_entry_json($r, $viewer), $stmt->fetchAll(\PDO::FETCH_ASSOC));
    /* PHASE6-LOCK-START */
    $entries = ccrm_te_stamp_paid_months($pdo, $entries);
    /* PHASE6-LOCK-END */
    ccrm_te_respond([
        'entries' => $entries,
        'viewer' => ['userId' => $callerId, 'canEdit' => $canEdit, 'canTeam' => $canTeam, 'canCosts' => $canCosts],
    ]);
}

if ($method !== 'POST') {
    ccrm_te_fail('method_not_allowed', 405);
}

// ---------------------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------------------

if ($action === 'settings') {
    if (!ccrm_is_admin($sessionUser) && !ccrm_can($scope, 'general_config', 'edit')) {
        ccrm_te_fail('forbidden', 403);
    }
    $next = ccrm_tt_sanitize_settings(is_array($body['settings'] ?? null) ? $body['settings'] : [], $settings);
    ccrm_tt_save_settings($pdo, $next);
    ccrm_audit_log($pdo, $sessionUser, 'time_tracking.settings', 'Time tracking settings changed');
    ccrm_te_respond(['settings' => $next]);
}

/* PHASE6-LOCK-START */
/** String map from the import body. An empty value is an explicit "do not map". */
function ccrm_te_import_map($raw): array {
    if (!is_array($raw)) {
        return [];
    }
    $out = [];
    foreach ($raw as $k => $v) {
        $key = trim((string)$k);
        if ($key === '') {
            continue;
        }
        $out[$key] = trim((string)$v);
    }
    return $out;
}

if ($action === 'import') {
    if (!ccrm_is_admin($sessionUser) && !ccrm_can($scope, 'general_config', 'edit')) {
        ccrm_te_fail('forbidden', 403);
    }
    require_once __DIR__ . '/time_tracking_lib.php';
    $stored = ccrm_time_tracking_stored_settings($pdo);
    $ttCfg = is_array($stored['timeTracking'] ?? null) ? $stored['timeTracking'] : [];
    $provider = strtolower(trim((string)($ttCfg['provider'] ?? ($stored['provider'] ?? 'toggl'))));
    if ($provider === 'clockify') {
        ccrm_te_fail('unsupported_provider', 422);
    }
    $token = ccrm_time_tracking_toggl_token($stored);
    $workspace = ccrm_time_tracking_toggl_workspace($stored);

    $saved = [];
    try {
        $mapStmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'TOGGL_IMPORT_MAP'");
        $mapStmt->execute();
        $rawMap = $mapStmt->fetchColumn();
        $decodedMap = $rawMap ? json_decode((string)$rawMap, true) : null;
        if (is_array($decodedMap)) {
            $saved = $decodedMap;
        }
    } catch (\Throwable $e) {
        $saved = [];
    }

    $defaultUsers = [];
    try {
        $defStmt = $pdo->query("SELECT `time_tracking_user_id`, `user_id` FROM `employees` WHERE `time_tracking_provider` = 'toggl' AND `time_tracking_user_id` IS NOT NULL AND `time_tracking_user_id` <> '' AND `user_id` IS NOT NULL AND `user_id` <> ''");
        foreach ($defStmt->fetchAll(\PDO::FETCH_ASSOC) as $empRow) {
            $defaultUsers[(string)$empRow['time_tracking_user_id']] = (string)$empRow['user_id'];
        }
    } catch (\Throwable $e) {
        $defaultUsers = [];
    }

    $mode = trim((string)($body['mode'] ?? 'preview'));
    if ($mode === 'catalog') {
        $cat = ccrm_toggl_import_catalog($token, $workspace);
        if (empty($cat['ok'])) {
            ccrm_te_fail($cat['code'] ?? 'toggl_not_configured', 422);
        }
        $ccrmProjects = $pdo->query("SELECT `id`, `name` FROM `projects` ORDER BY `name` LIMIT 2000")->fetchAll(\PDO::FETCH_ASSOC);
        $ccrmUsers = $pdo->query("SELECT `id`, `name`, `email` FROM `users` ORDER BY `name`")->fetchAll(\PDO::FETCH_ASSOC);
        $savedProjects = is_array($saved['projects'] ?? null) ? $saved['projects'] : [];
        $savedUsers = is_array($saved['users'] ?? null) ? $saved['users'] : [];
        ccrm_te_respond([
            'projects' => $cat['projects'],
            'users' => $cat['users'],
            'ccrmProjects' => array_map(fn($r) => ['id' => $r['id'], 'name' => (string)($r['name'] ?? '')], $ccrmProjects),
            'ccrmUsers' => array_map(fn($r) => ['id' => $r['id'], 'name' => (string)($r['name'] ?? ''), 'email' => (string)($r['email'] ?? '')], $ccrmUsers),
            'projectMap' => (object)$savedProjects,
            'userMap' => (object)$savedUsers,
            'defaultUserMap' => (object)$defaultUsers,
        ]);
    }

    $from = (string)($body['from'] ?? '');
    $to = (string)($body['to'] ?? '');
    if (!ccrm_tt_valid_date($from) || !ccrm_tt_valid_date($to) || $from > $to) {
        ccrm_te_fail('bad_request', 400);
    }
    $span = (int)(new \DateTimeImmutable($from))->diff(new \DateTimeImmutable($to))->days;
    if ($span > 366) {
        ccrm_te_fail('bad_request', 400);
    }

    $projectMap = ccrm_te_import_map($body['projectMap'] ?? ($saved['projects'] ?? []));
    $userMap = ccrm_te_import_map($body['userMap'] ?? ($saved['users'] ?? []));
    foreach ($defaultUsers as $extId => $uid) {
        if (!array_key_exists($extId, $userMap)) {
            $userMap[$extId] = $uid;
        }
    }
    try {
        $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TOGGL_IMPORT_MAP', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
            ->execute([json_encode(['projects' => $projectMap, 'users' => $userMap], JSON_UNESCAPED_UNICODE)]);
    } catch (\Throwable $e) {
        /* the import still proceeds; the map is in this request */
    }

    $fetched = ccrm_toggl_import_fetch($token, $workspace, $from, $to);
    if (empty($fetched['ok'])) {
        ccrm_te_fail($fetched['code'] ?? 'toggl_not_configured', 422);
    }
    $rows = $fetched['entries'];
    $ids = [];
    foreach ($rows as $r) {
        $ids[] = $r['id'];
    }
    $existing = [];
    foreach (array_chunk($ids, 200) as $chunk) {
        if ($chunk === []) {
            continue;
        }
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        $ex = $pdo->prepare("SELECT `external_id` FROM `time_entries` WHERE `source` = 'toggl' AND `external_id` IN ($ph)");
        $ex->execute($chunk);
        foreach ($ex->fetchAll(\PDO::FETCH_COLUMN) as $eid) {
            $existing[(string)$eid] = true;
        }
    }
    $knownUsers = [];
    foreach ($pdo->query("SELECT `id` FROM `users`")->fetchAll(\PDO::FETCH_COLUMN) as $uid) {
        $knownUsers[(string)$uid] = true;
    }
    $knownProjects = [];
    foreach ($pdo->query("SELECT `id` FROM `projects`")->fetchAll(\PDO::FETCH_COLUMN) as $pid) {
        $knownProjects[(string)$pid] = true;
    }

    $already = 0;
    $ready = [];
    $skippedUsers = 0;
    $unmappedProjects = 0;
    foreach ($rows as $r) {
        if (isset($existing[$r['id']])) {
            $already++;
            continue;
        }
        $ccrmUser = $userMap[$r['userId']] ?? '';
        if ($ccrmUser === '' || !isset($knownUsers[$ccrmUser])) {
            $skippedUsers++;
            continue;
        }
        $ccrmProject = null;
        if (!empty($r['projectId'])) {
            $mapped = $projectMap[$r['projectId']] ?? '';
            if ($mapped !== '' && isset($knownProjects[$mapped])) {
                $ccrmProject = $mapped;
            } else {
                $unmappedProjects++;
            }
        }
        $ready[] = $r + ['ccrmUser' => $ccrmUser, 'ccrmProject' => $ccrmProject];
    }

    $commit = $mode === 'commit';
    $imported = 0;
    if ($commit && $ready) {
        $ins = $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `billable`, `billable_rate`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`, `cost`, `tags`, `source`, `external_id`)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'toggl', ?)"
        );
        foreach ($ready as $r) {
            if (isset($existing[$r['id']])) {
                $already++;
                continue;
            }
            $startUtc = ccrm_tt_to_utc($r['start']);
            $endUtc = ccrm_tt_to_utc($r['stop']);
            if ($startUtc === null || $endUtc === null) {
                continue;
            }
            $entryDate = ccrm_tt_local_date($startUtc);
            $desc = $r['description'] !== '' ? $r['description'] : null;
            $price = ccrm_tt_price($pdo, $r['ccrmUser'], $entryDate, (int)$r['seconds'], $settings, true);
            $rate = ccrm_tt_lookup_billable_rate($pdo, $r['ccrmProject'], null, $entryDate);
            try {
                $ins->execute([
                    ccrm_tt_new_id(), $r['ccrmUser'], $callerId, $price['employee_id'], $r['ccrmProject'],
                    $desc, $desc, $entryDate, $startUtc, $endUtc, (int)$r['seconds'], $r['billable'] ? 1 : 0, $rate,
                    $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'],
                    $r['id'],
                ]);
                $existing[$r['id']] = true;
                $imported++;
            } catch (\PDOException $e) {
                if ((int)($e->errorInfo[1] ?? 0) === 1062) {
                    $already++;
                    continue;
                }
                ccrm_log_exception($e);
                ccrm_te_fail('save_failed', 500);
            }
        }
        ccrm_audit_log($pdo, $sessionUser, 'time_tracking.toggl_import', "Imported {$imported} Toggl entries from {$from} to {$to} ({$already} already imported)");
    }

    ccrm_te_respond([
        'preview' => !$commit,
        'total' => count($rows),
        'alreadyImported' => $already,
        'ready' => count($ready),
        'imported' => $imported,
        'skippedUsers' => $skippedUsers,
        'unmappedProjects' => $unmappedProjects,
    ]);
}
/* PHASE6-LOCK-END */

if (!$canEdit) {
    ccrm_te_fail('forbidden', 403);
}

/** The owner of the entry being written, with the team rule applied. */
function ccrm_te_owner(\PDO $pdo, array $body, string $callerId, bool $canTeam): string {
    $owner = trim((string)($body['userId'] ?? ''));
    if ($owner === '' || $owner === $callerId) {
        return $callerId;
    }
    if (!$canTeam) {
        ccrm_te_fail('forbidden', 403);
    }
    if (!ccrm_te_user_exists($pdo, $owner)) {
        ccrm_te_fail('user_not_found', 404);
    }
    return $owner;
}

if ($action === 'reprice') {
    // Admin only: recompute the frozen rate and cost of the finished entries in a period. Fills in
    // entries priced 'none' once an employee was linked, and follows salary or calendar changes.
    if (!ccrm_is_admin($sessionUser)) {
        ccrm_te_fail('forbidden', 403);
    }
    $from = (string)($body['from'] ?? '');
    $to = (string)($body['to'] ?? '');
    // Month pickers send "YYYY-MM-31"; clamp it to the real last day.
    if (preg_match('/^(\d{4})-(\d{2})-\d{2}$/', $to, $m) && !ccrm_tt_valid_date($to)) {
        $to = sprintf('%s-%s-%02d', $m[1], $m[2], (int)date('t', strtotime("{$m[1]}-{$m[2]}-01")));
    }
    if (!ccrm_tt_valid_date($from) || !ccrm_tt_valid_date($to) || $from > $to) {
        ccrm_te_fail('bad_request', 400);
    }
    $where = ["`deleted_at` IS NULL", "`entry_date` BETWEEN ? AND ?", "(`start_at` IS NULL OR `end_at` IS NOT NULL)"];
    $params = [$from, $to];
    $only = array_values(array_filter(array_map('strval', (array)($body['userIds'] ?? []))));
    if ($only) {
        $where[] = '`user_id` IN (' . implode(',', array_fill(0, count($only), '?')) . ')';
        array_push($params, ...$only);
    }
    $sel = $pdo->prepare('SELECT `id`, `user_id`, `entry_date`, `duration_sec` FROM `time_entries` WHERE ' . implode(' AND ', $where));
    $sel->execute($params);
    $upd = $pdo->prepare("UPDATE `time_entries` SET `employee_id` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?, `cost` = ? WHERE `id` = ?");
    $count = 0;
    foreach ($sel->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $price = ccrm_tt_price($pdo, (string)$r['user_id'], (string)$r['entry_date'], $r['duration_sec'] === null ? null : (int)$r['duration_sec'], $settings, true);
        $upd->execute([$price['employee_id'], $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'], $r['id']]);
        $count++;
    }
    ccrm_audit_log($pdo, $sessionUser, 'time_tracking.reprice', "Re-priced {$count} time entries from {$from} to {$to}");
    ccrm_te_respond(['repriced' => $count]);
}

if ($action === 'start') {
    $owner = ccrm_te_owner($pdo, $body, $callerId, $canTeam);
    $explicitProject = ccrm_tt_nullable_id($body['projectId'] ?? null);
    $links = ccrm_tt_resolve_links($pdo, $body);
    if (!$links['ok']) {
        ccrm_te_fail($links['code'], 422);
    }
    if ($denied = ccrm_te_check_link_access($pdo, $scope, $links, $explicitProject)) {
        ccrm_te_fail($denied, 403);
    }
    $nowUtc = ccrm_tt_now_utc();
    $startUtc = $nowUtc;
    // A client clock (the extension queues offline) may back-date a start by up to 24 h, never forward.
    if (!empty($body['startedAt'])) {
        $given = ccrm_tt_to_utc($body['startedAt']);
        if ($given !== null && $given <= $nowUtc && ccrm_tt_seconds_between($given, $nowUtc) <= CCRM_TE_MAX_SECONDS) {
            $startUtc = $given;
        }
    }
    $billable = array_key_exists('billable', $body) ? (int)(bool)$body['billable'] : (int)$settings['billableByDefault'];
    $employee = ccrm_tt_employee_for_user($pdo, $owner);
    $newId = ccrm_tt_new_id();

    // Warm the holiday cache for the month of the entry that is about to be stopped, so pricing
    // inside the transaction never needs the network.
    $previous = ccrm_te_running_row($pdo, $owner);
    if ($previous) {
        ccrm_tt_price($pdo, $owner, $previous['entry_date'], null, $settings, true);
    }

    try {
        $pdo->beginTransaction();
        $stopped = null;
        $old = ccrm_te_running_row($pdo, $owner, true);
        if ($old) {
            $endUtc = max($startUtc, $old['start_at']);
            $dur = ccrm_tt_seconds_between($old['start_at'], $endUtc);
            $price = ccrm_tt_price($pdo, $owner, $old['entry_date'], $dur, $settings, false);
            $stoppedRate = $old['billable_rate'] !== null ? $old['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $old['project_id'], $old['ticket_id'], (string)$old['entry_date']);
            $upd = $pdo->prepare("UPDATE `time_entries` SET `end_at` = ?, `duration_sec` = ?, `employee_id` = ?, `billable_rate` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?, `cost` = ? WHERE `id` = ?");
            $upd->execute([$endUtc, $dur, $price['employee_id'], $stoppedRate, $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'], $old['id']]);
            $stopped = $old['id'];
        }
        $ins = $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `entry_date`, `start_at`, `billable`, `tags`, `source`, `origin_type`, `origin_id`, `device_id`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $ins->execute([
            $newId, $owner, $callerId, $employee['id'] ?? null, $links['project_id'], $links['task_id'], $links['ticket_id'],
            $links['description'], $links['title_snapshot'], ccrm_tt_local_date($startUtc), $startUtc, $billable,
            json_encode(ccrm_tt_clean_tags($body['tags'] ?? []), JSON_UNESCAPED_UNICODE),
            ccrm_te_source($body['source'] ?? null, 'timer'), ccrm_te_origin($body['originType'] ?? null), ccrm_tt_nullable_id($body['originId'] ?? null),
            ccrm_tt_nullable_id($body['deviceId'] ?? null),
        ]);
        $pdo->commit();
    } catch (\PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // 1062 on uq_te_running: another client started a timer for this user at the same moment.
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            $row = ccrm_te_running_row($pdo, $owner);
            ccrm_te_fail('already_running', 409, ['entry' => $row ? ccrm_te_json($pdo, $row['id'], $viewer) : null]);
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
    }
    ccrm_te_respond([
        'entry' => ccrm_te_json($pdo, $newId, $viewer),
        'stopped' => $stopped ? ccrm_te_json($pdo, $stopped, $viewer) : null,
    ], 201);
}

if ($action === 'stop') {
    $id = ccrm_tt_nullable_id($body['id'] ?? null);
    $row = $id !== null
        ? (function () use ($pdo, $id) { $s = $pdo->prepare("SELECT * FROM `time_entries` WHERE `id` = ? AND `deleted_at` IS NULL"); $s->execute([$id]); return $s->fetch(\PDO::FETCH_ASSOC) ?: null; })()
        : ccrm_te_running_row($pdo, $callerId);
    if (!$row || $row['start_at'] === null) {
        ccrm_te_fail('not_found', 404);
    }
    if (!ccrm_te_can_touch((string)$row['user_id'], $callerId, $canTeam)) {
        ccrm_te_fail('forbidden', 403);
    }
    if ($row['end_at'] !== null) {
        // Already stopped (another device, or a double click): idempotent.
        ccrm_te_respond(['entry' => ccrm_te_json($pdo, $row['id'], $viewer)]);
    }

    // A project may be chosen at the moment of stopping (the "require a project" picker).
    $projectId = $row['project_id'];
    if (!empty($body['projectId'])) {
        $explicit = ccrm_tt_nullable_id($body['projectId']);
        $links = ccrm_tt_resolve_links($pdo, ['taskId' => $row['task_id'], 'ticketId' => $row['ticket_id'], 'projectId' => $explicit, 'description' => $row['description']]);
        if (!$links['ok']) {
            ccrm_te_fail($links['code'], 422);
        }
        if ($denied = ccrm_te_check_link_access($pdo, $scope, $links, $explicit)) {
            ccrm_te_fail($denied, 403);
        }
        $projectId = $links['project_id'];
    }
    // Only someone who can pick a project is asked for one: an Employee without the projects module
    // would otherwise never be able to stop a free-text timer.
    if ($settings['requireProjectToStop'] && $projectId === null && ccrm_can($scope, 'projects')) {
        ccrm_te_fail('project_required', 422);
    }
    if ($settings['requireTask'] && $row['task_id'] === null && $row['ticket_id'] === null) {
        ccrm_te_fail('task_required', 422);
    }

    $nowUtc = ccrm_tt_now_utc();
    $endUtc = $nowUtc;
    if (!empty($body['stoppedAt'])) {
        $given = ccrm_tt_to_utc($body['stoppedAt']);
        if ($given !== null && $given >= $row['start_at'] && $given <= $nowUtc) {
            $endUtc = $given;
        }
    }
    $dur = ccrm_tt_seconds_between($row['start_at'], $endUtc);
    $price = ccrm_tt_price($pdo, (string)$row['user_id'], $row['entry_date'], $dur, $settings, true);
    $stoppedRate = $row['billable_rate'] !== null ? $row['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $projectId, $row['ticket_id'], (string)$row['entry_date']);
    $upd = $pdo->prepare("UPDATE `time_entries` SET `end_at` = ?, `duration_sec` = ?, `project_id` = ?, `employee_id` = ?, `billable_rate` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?, `cost` = ? WHERE `id` = ? AND `end_at` IS NULL");
    $upd->execute([$endUtc, $dur, $projectId, $price['employee_id'], $stoppedRate, $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'], $row['id']]);
    ccrm_te_respond(['entry' => ccrm_te_json($pdo, $row['id'], $viewer)]);
}

if ($action === 'undo_start') {
    $newId = ccrm_tt_nullable_id($body['newId'] ?? null);
    $stoppedId = ccrm_tt_nullable_id($body['stoppedId'] ?? null);
    if ($newId === null) {
        ccrm_te_fail('bad_request', 400);
    }
    $new = ccrm_tt_fetch_entry($pdo, $newId);
    if (!$new || !ccrm_te_can_touch((string)$new['user_id'], $callerId, $canTeam)) {
        ccrm_te_fail('not_found', 404);
    }
    try {
        $pdo->beginTransaction();
        // The accidental start is removed outright; there is nothing to restore it to.
        $pdo->prepare("DELETE FROM `time_entries` WHERE `id` = ? AND `end_at` IS NULL")->execute([$newId]);
        if ($stoppedId !== null) {
            $reopen = $pdo->prepare("UPDATE `time_entries` SET `end_at` = NULL, `duration_sec` = NULL, `cost_rate` = NULL, `cost_rate_source` = 'none', `cost_rate_basis_days` = NULL, `cost` = NULL WHERE `id` = ? AND `user_id` = ? AND `deleted_at` IS NULL AND `start_at` IS NOT NULL");
            $reopen->execute([$stoppedId, $new['user_id']]);
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
    }
    ccrm_te_respond(['entry' => $stoppedId ? ccrm_te_json($pdo, $stoppedId, $viewer) : null]);
}

if ($action === 'delete' || $action === 'restore') {
    $id = ccrm_tt_nullable_id($body['id'] ?? null);
    if ($id === null) {
        ccrm_te_fail('bad_request', 400);
    }
    $stmt = $pdo->prepare("SELECT * FROM `time_entries` WHERE `id` = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row) {
        ccrm_te_fail('not_found', 404);
    }
    if (!ccrm_te_can_touch((string)$row['user_id'], $callerId, $canTeam)) {
        ccrm_te_fail('forbidden', 403);
    }
    /* PHASE6-LOCK-START */
    ccrm_te_refuse_locked($pdo, $sessionUser, [$row], $settings);
    /* PHASE6-LOCK-END */
    if ($action === 'delete') {
        $pdo->prepare("UPDATE `time_entries` SET `deleted_at` = UTC_TIMESTAMP() WHERE `id` = ? AND `deleted_at` IS NULL")->execute([$id]);
        if ((string)$row['user_id'] !== $callerId) {
            ccrm_audit_log($pdo, $sessionUser, 'time_entry.delete', "Deleted time entry {$id} of user {$row['user_id']}");
        }
        ccrm_te_respond(['id' => $id]);
    }
    try {
        $pdo->prepare("UPDATE `time_entries` SET `deleted_at` = NULL WHERE `id` = ?")->execute([$id]);
    } catch (\PDOException $e) {
        // Restoring a deleted running timer while another one runs.
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            ccrm_te_fail('already_running', 409);
        }
        throw $e;
    }
    ccrm_te_respond(['entry' => ccrm_te_json($pdo, $id, $viewer)]);
}

/**
 * Work out the time columns of a new or edited entry from the incoming fields and what is
 * already stored. Returns [startUtc, endUtc, durationSec, entryDate] or a failure code.
 *
 * @return array{0: ?string, 1: ?string, 2: ?int, 3: string}|string
 */
function ccrm_te_resolve_time(array $in, ?array $existing, bool $isRunningWrite) {
    $has = fn(string $k) => array_key_exists($k, $in);
    $start = $has('startAt') ? ccrm_tt_to_utc($in['startAt']) : ($existing['start_at'] ?? null);
    $end = $has('endAt') ? ccrm_tt_to_utc($in['endAt']) : ($existing['end_at'] ?? null);
    if ($has('startAt') && $in['startAt'] !== null && $in['startAt'] !== '' && $start === null) {
        return 'bad_time';
    }
    if ($has('endAt') && $in['endAt'] !== null && $in['endAt'] !== '' && $end === null) {
        return 'bad_time';
    }
    // Clearing the start makes the entry hours-only again.
    if ($start === null) {
        $end = null;
    }
    $duration = $existing['duration_sec'] ?? null;
    $duration = $duration === null ? null : (int)$duration;
    if ($has('durationSec')) {
        $duration = is_numeric($in['durationSec']) ? (int)round((float)$in['durationSec']) : null;
    }

    if ($start !== null && $end !== null) {
        if ($end < $start) {
            return 'end_before_start';
        }
        $duration = ccrm_tt_seconds_between($start, $end);
    } elseif ($start !== null && $end === null && $duration !== null && !$isRunningWrite) {
        // Start + duration (calendar drag, manual): derive the end.
        $end = gmdate('Y-m-d H:i:s', strtotime($start . ' UTC') + $duration);
    } elseif ($start !== null && $end === null && !$isRunningWrite) {
        return 'duration_required';
    } elseif ($start === null) {
        if ($duration === null) {
            return 'duration_required';
        }
    }
    if ($duration !== null && ($duration < 0 || $duration > CCRM_TE_MAX_SECONDS)) {
        return 'duration_out_of_range';
    }

    if ($has('entryDate') && ccrm_tt_valid_date((string)$in['entryDate'])) {
        $entryDate = (string)$in['entryDate'];
    } elseif ($start !== null && ($has('startAt') || $existing === null)) {
        $entryDate = ccrm_tt_local_date($start);
    } elseif ($existing !== null) {
        $entryDate = (string)$existing['entry_date'];
    } else {
        return 'entry_date_required';
    }
    return [$start, $end, $duration, $entryDate];
}

if ($action === 'create') {
    $owner = ccrm_te_owner($pdo, $body, $callerId, $canTeam);
    $explicitProject = ccrm_tt_nullable_id($body['projectId'] ?? null);
    $links = ccrm_tt_resolve_links($pdo, $body);
    if (!$links['ok']) {
        ccrm_te_fail($links['code'], 422);
    }
    if ($denied = ccrm_te_check_link_access($pdo, $scope, $links, $explicitProject)) {
        ccrm_te_fail($denied, 403);
    }
    $time = ccrm_te_resolve_time($body, null, false);
    if (is_string($time)) {
        ccrm_te_fail($time, 422);
    }
    [$startUtc, $endUtc, $duration, $entryDate] = $time;
    /* PHASE6-LOCK-START */
    ccrm_te_refuse_locked($pdo, $sessionUser, [[
        'id' => null,
        'user_id' => $owner,
        'employee_id' => null,
        'entry_date' => $entryDate,
        'approval_status' => null,
        'start_at' => $startUtc,
        'end_at' => $endUtc,
    ]], $settings);
    /* PHASE6-LOCK-END */
    $price = ccrm_tt_price($pdo, $owner, $entryDate, $duration, $settings, true);
    $billable = array_key_exists('billable', $body) ? (int)(bool)$body['billable'] : (int)$settings['billableByDefault'];
    $id = ccrm_tt_new_id();
    try {
        $ins = $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `billable`, `billable_rate`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`, `cost`, `tags`, `source`, `origin_type`, `origin_id`, `device_id`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $ins->execute([
            $id, $owner, $callerId, $price['employee_id'], $links['project_id'], $links['task_id'], $links['ticket_id'], $links['description'], $links['title_snapshot'],
            $entryDate, $startUtc, $endUtc, $duration, $billable,
            ($canCosts && isset($body['billableRate']) && is_numeric($body['billableRate']))
                ? round((float)$body['billableRate'], 2)
                : ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $entryDate),
            $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'],
            json_encode(ccrm_tt_clean_tags($body['tags'] ?? []), JSON_UNESCAPED_UNICODE),
            ccrm_te_source($body['source'] ?? null, 'manual'), ccrm_te_origin($body['originType'] ?? null), ccrm_tt_nullable_id($body['originId'] ?? null),
            ccrm_tt_nullable_id($body['deviceId'] ?? null),
        ]);
    } catch (\PDOException $e) {
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            ccrm_te_fail('already_running', 409);
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
    }
    ccrm_te_respond(['entry' => ccrm_te_json($pdo, $id, $viewer)], 201);
}

if ($action === 'update') {
    $id = ccrm_tt_nullable_id($body['id'] ?? null);
    if ($id === null) {
        ccrm_te_fail('bad_request', 400);
    }
    $stmt = $pdo->prepare("SELECT * FROM `time_entries` WHERE `id` = ? AND `deleted_at` IS NULL");
    $stmt->execute([$id]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row) {
        ccrm_te_fail('not_found', 404);
    }
    if (!ccrm_te_can_touch((string)$row['user_id'], $callerId, $canTeam)) {
        ccrm_te_fail('forbidden', 403);
    }
    $has = fn(string $k) => array_key_exists($k, $body);
    $wasRunning = $row['start_at'] !== null && $row['end_at'] === null;

    // Owner: only a manager may hand the entry to somebody else.
    $owner = (string)$row['user_id'];
    if ($has('userId') && trim((string)$body['userId']) !== '' && trim((string)$body['userId']) !== $owner) {
        $owner = ccrm_te_owner($pdo, $body, $callerId, $canTeam);
    }

    // Links. Keys that were not sent keep what is stored; a null unlinks.
    $wasLinked = $row['task_id'] !== null || $row['ticket_id'] !== null;
    $in = [
        'taskId' => $has('taskId') ? $body['taskId'] : $row['task_id'],
        'ticketId' => $has('ticketId') ? $body['ticketId'] : ($has('taskId') ? null : $row['ticket_id']),
        'projectId' => $has('projectId') ? $body['projectId'] : (($has('taskId') && ($body['taskId'] ?? null) !== $row['task_id']) ? null : $row['project_id']),
        'description' => $has('description') ? $body['description'] : $row['description'],
    ];
    $links = ccrm_tt_resolve_links($pdo, $in);
    if (!$links['ok']) {
        ccrm_te_fail($links['code'], 422);
    }
    $linksChanged = ($links['task_id'] !== $row['task_id']) || ($links['ticket_id'] !== $row['ticket_id']) || ($links['project_id'] !== $row['project_id']);
    if ($linksChanged) {
        $explicit = $has('projectId') ? ccrm_tt_nullable_id($body['projectId']) : null;
        if ($denied = ccrm_te_check_link_access($pdo, $scope, $links, $explicit)) {
            ccrm_te_fail($denied, 403);
        }
    }
    $isLinkedNow = $links['task_id'] !== null || $links['ticket_id'] !== null;
    if ($wasLinked && !$isLinkedNow && !$has('description')) {
        // Unlinking: the entry's own title starts as the task's title at this moment.
        $current = ccrm_tt_fetch_entry($pdo, $id);
        $currentTitle = $current ? ccrm_tt_entry_json($current, ['userId' => $callerId, 'canCosts' => false])['title'] : '';
        $currentTitle = mb_substr((string)$currentTitle, 0, 500);
        $links['description'] = $currentTitle !== '' ? $currentTitle : null;
        $links['title_snapshot'] = $links['description'];
    }

    $time = ccrm_te_resolve_time($body, $row, $wasRunning && !$has('endAt'));
    if (is_string($time)) {
        ccrm_te_fail($time, 422);
    }
    [$startUtc, $endUtc, $duration, $entryDate] = $time;
    /* PHASE6-LOCK-START */
    $lockedRows = [$row];
    if ($entryDate !== (string)$row['entry_date']) {
        $lockedRows[] = [
            'id' => $row['id'],
            'user_id' => $owner,
            'employee_id' => null,
            'entry_date' => $entryDate,
            'approval_status' => $row['approval_status'] ?? null,
            'start_at' => $startUtc,
            'end_at' => $endUtc,
        ];
    }
    ccrm_te_refuse_locked($pdo, $sessionUser, $lockedRows, $settings);
    /* PHASE6-LOCK-END */

    // The frozen rate is never recomputed silently: only when the owner or the month changes,
    // or a running entry just got its end.
    $stoppedNow = $wasRunning && $endUtc !== null;
    $repriceNeeded = $stoppedNow || $owner !== (string)$row['user_id'] || substr($entryDate, 0, 7) !== substr((string)$row['entry_date'], 0, 7);
    if ($repriceNeeded) {
        $price = ccrm_tt_price($pdo, $owner, $entryDate, $duration, $settings, true);
    } else {
        $rate = $row['cost_rate'] === null ? null : (float)$row['cost_rate'];
        $price = [
            'employee_id' => $row['employee_id'], 'cost_rate' => $rate, 'cost_rate_source' => $row['cost_rate_source'],
            'cost_rate_basis_days' => $row['cost_rate_basis_days'] === null ? null : (int)$row['cost_rate_basis_days'],
            'cost' => ($endUtc !== null || $startUtc === null) ? ccrm_tc_entry_cost($duration, $rate) : null,
        ];
    }
    if ($startUtc !== null && $endUtc === null) {
        // Still running: nothing is priced yet.
        $price = ['employee_id' => $price['employee_id'], 'cost_rate' => null, 'cost_rate_source' => 'none', 'cost_rate_basis_days' => null, 'cost' => null];
    }

    $billable = $has('billable') ? (int)(bool)$body['billable'] : (int)$row['billable'];
    $billableRate = $row['billable_rate'];
    if ($canCosts && $has('billableRate')) {
        $billableRate = is_numeric($body['billableRate']) ? round((float)$body['billableRate'], 2) : null;
    } elseif ($billableRate === null && ($endUtc !== null || $startUtc === null)) {
        $billableRate = ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $entryDate);
    }
    $tags = $has('tags') ? json_encode(ccrm_tt_clean_tags($body['tags']), JSON_UNESCAPED_UNICODE) : $row['tags'];

    try {
        $upd = $pdo->prepare(
            "UPDATE `time_entries` SET `user_id` = ?, `employee_id` = ?, `project_id` = ?, `task_id` = ?, `ticket_id` = ?, `description` = ?, `title_snapshot` = ?, `entry_date` = ?,
               `start_at` = ?, `end_at` = ?, `duration_sec` = ?, `billable` = ?, `billable_rate` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?, `cost` = ?, `tags` = ?
             WHERE `id` = ? AND `deleted_at` IS NULL"
        );
        $upd->execute([
            $owner, $price['employee_id'], $links['project_id'], $links['task_id'], $links['ticket_id'], $links['description'], $links['title_snapshot'], $entryDate,
            $startUtc, $endUtc, $duration, $billable, $billableRate, $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $price['cost'], $tags, $id,
        ]);
    } catch (\PDOException $e) {
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            ccrm_te_fail('already_running', 409);
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
    }
    if ($owner !== (string)$row['user_id'] || (string)$row['user_id'] !== $callerId) {
        ccrm_audit_log($pdo, $sessionUser, 'time_entry.update', "Edited time entry {$id} of user {$row['user_id']}");
    }
    ccrm_te_respond(['entry' => ccrm_te_json($pdo, $id, $viewer)]);
}

/* PHASE6-LOCK-START */
if ($action === 'submit_week') {
    if (empty($settings['weeklyApproval'])) {
        ccrm_te_fail('approval_off', 422);
    }
    $rawWeek = trim((string)($body['weekStart'] ?? ''));
    if (!ccrm_tt_valid_date($rawWeek)) {
        ccrm_te_fail('bad_request', 400);
    }
    $weekDt = \DateTimeImmutable::createFromFormat('!Y-m-d', $rawWeek);
    $weekN = (int)$weekDt->format('N');
    $mondayDt = $weekDt->modify('-' . ($weekN - 1) . ' days');
    $monday = $mondayDt->format('Y-m-d');
    $sunday = $mondayDt->modify('+6 days')->format('Y-m-d');
    $weekOwner = $callerId;
    $asked = trim((string)($body['userId'] ?? ''));
    if ($asked !== '' && $asked !== $callerId) {
        if (!$canTeam && !ccrm_is_admin($sessionUser)) {
            ccrm_te_fail('forbidden', 403);
        }
        if (!ccrm_te_user_exists($pdo, $asked)) {
            ccrm_te_fail('user_not_found', 404);
        }
        $weekOwner = $asked;
    }
    $weekUpd = $pdo->prepare(
        "UPDATE `time_entries` SET `approval_status` = 'approved'
         WHERE `user_id` = ? AND `deleted_at` IS NULL AND `entry_date` BETWEEN ? AND ?
           AND NOT (`start_at` IS NOT NULL AND `end_at` IS NULL)
           AND (`approval_status` IS NULL OR `approval_status` <> 'approved')"
    );
    $weekUpd->execute([$weekOwner, $monday, $sunday]);
    $submitted = $weekUpd->rowCount();
    ccrm_audit_log($pdo, $sessionUser, 'time_tracking.submit_week', "Submitted week {$monday} for user {$weekOwner} ({$submitted} entries)");
    ccrm_te_respond(['weekStart' => $monday, 'weekEnd' => $sunday, 'submitted' => $submitted]);
}
/* PHASE6-LOCK-END */

ccrm_te_fail('unknown_action', 400);
