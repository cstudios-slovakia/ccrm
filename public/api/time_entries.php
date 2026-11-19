<?php
/**
 * Time tracking entries — the module's own API (session auth, never the sync.php blob).
 *
 *   GET  ?from&to&userId&projectId&taskId&ticketId   list (userId: omitted = me, <id> or "all" need time_tracking_team)
 *   GET  ?running=1                                  {running: Entry[] (oldest start first), paused: [], presence: null, serverNow, entry: running[0]|null}
 *   GET  ?action=settings                            TimeTrackingSettings + the caller's work calendar
 *   GET  ?action=totals                              byTask/byTicket/byProject{seconds,workedMs,cost}, workedByUserDay{userId:{date:ms}}
 *   GET  ?action=overlaps&from=YYYY-MM&to=YYYY-MM    admin/general_config: {months:[{month,entries,users}]} closed timed entries overlapping another of the same user
 *   GET  ?action=taskPeople&taskId=                  per-person seconds on one task; cost follows B8
 *   POST action=start        {..., mode?}            mode 'switch' (default): in ONE transaction stop every running entry of the
 *                                                    owner and start a new one -> {entry, stopped: first stopped|null, stoppedAll}.
 *                                                    'parallel': stop nothing; 409 parallel_disabled | parallel_forbidden |
 *                                                    parallel_limit | same_project | already_running (D5.3)
 *   POST action=stop         {id?, all?, projectId?} id: that entry; all: every running entry; neither: the single running
 *                                                    one, 409 ambiguous {running} when several run
 *   POST action=undo_start   {newId, stoppedIds?, stoppedId?}  the Undo of a start: drop the new entry, reopen every stopped one
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
 *  - Several entries of one user may run (D5.1, deliberately: mode 'parallel'). Every timer
 *    mutation takes the per-user lock first (time_lock.php), so two clients never interleave.
 *  - The title of a linked entry is the task's / ticket's, joined live. Renaming goes
 *    through sync.php (the task / ticket save path); nothing here writes tasks.title.
 *  - Errors cross the wire as stable codes; the client turns them into sentences.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/time_entries_lib.php';
require_once __DIR__ . '/time_settle.php';
require_once __DIR__ . '/time_locks.php';
require_once __DIR__ . '/time_lock.php';
require_once __DIR__ . '/time_parallel.php';

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
$canParallel = ccrm_can($scope, 'time_tracking_parallel'); // false while the key is unknown: parallel refused (C4)
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

/** Entries as JSON, in the order given. */
function ccrm_te_json_list(\PDO $pdo, array $ids, array $viewer): array {
    $out = [];
    foreach ($ids as $id) {
        if ($json = ccrm_te_json($pdo, (string)$id, $viewer)) {
            $out[] = $json;
        }
    }
    return $out;
}

/**
 * End one running row at $endUtc (never before its start): duration, the frozen cost rate, the
 * billable rate, and the project chosen at the moment of stopping when given. Call inside the
 * transaction, under the owner's lock; warm the holiday cache first (ccrm_tt_price with fetch).
 */
function ccrm_te_close_row(\PDO $pdo, array $row, string $endUtc, array $settings, ?string $projectId = null): void {
    $endUtc = max($endUtc, (string)$row['start_at']);
    $dur = ccrm_tt_seconds_between($row['start_at'], $endUtc);
    $project = $projectId ?? $row['project_id'];
    $price = ccrm_tt_price($pdo, (string)$row['user_id'], $row['entry_date'], $dur, $settings, false);
    $rate = $row['billable_rate'] !== null ? $row['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $project, $row['ticket_id'], (string)$row['entry_date']);
    $upd = $pdo->prepare("UPDATE `time_entries` SET `end_at` = ?, `duration_sec` = ?, `project_id` = ?, `employee_id` = ?, `billable_rate` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ? WHERE `id` = ? AND `end_at` IS NULL");
    $upd->execute([$endUtc, $dur, $project, $price['employee_id'], $rate, $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $row['id']]);
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
    if ($explicitProject !== null && $explicitProject !== $links['derivedProject'] && !ccrm_can($scope, 'projects') && !ccrm_works_on_project($pdo, $scope, $explicitProject)) {
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
// The lock rules (age, paid payroll month, approved) live in time_locks.php: ccrm_tt_settle() uses them too.

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

/** D3.3 for REST: refuse (entry_locked, 403) when an interval of $userId overlaps a locked entry; admins pass. */
function ccrm_te_refuse_neighbours(\PDO $pdo, array $sessionUser, string $userId, array $intervals, array $settings, ?string $excludeId = null): void {
    $hit = ccrm_te_refuse_locked_neighbours($pdo, $sessionUser, $userId, $intervals, $settings, $excludeId);
    if ($hit !== null) {
        ccrm_te_fail('entry_locked', 403, ['reason' => $hit['reason']]);
    }
}

/** [startUtc, endUtc|null] of a stored row by the D2 interval (start + duration); null end = running. */
function ccrm_te_interval_of(array $row): array {
    $start = $row['start_at'] ?? null;
    if ($start === null || $start === '' || empty($row['end_at'])) {
        return [$start ?: null, null];
    }
    $dur = $row['duration_sec'] ?? null;
    return [$start, is_numeric($dur) ? gmdate('Y-m-d H:i:s', strtotime($start . ' UTC') + (int)$dur) : $row['end_at']];
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
            $stmt = $pdo->prepare("SELECT `employee_id`, `period_key`, `period_type`, `year`, `period_number` FROM `employee_salaries` WHERE " . ccrm_te_closed_sql($pdo) . " AND `employee_id` IN ($placeholders)");
            $stmt->execute(array_keys($ids));
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $map[(string)$row['employee_id']][] = ccrm_salary_period_key($row);
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
                'startWhileRunning' => ccrm_tt_load_prefs($pdo, $callerId)['startWhileRunning'],
            ],
            'viewer' => ['canEdit' => $canEdit, 'canTeam' => $canTeam, 'canCosts' => $canCosts],
        ]);
    }

    if ($action === 'prefs') {
        ccrm_te_respond(ccrm_tt_load_prefs($pdo, $callerId));
    }

    if (isset($_GET['running']) || $action === 'running') {
        // D5.3: every running item (oldest first); `entry` = the first, kept for old clients (D5.6).
        // `paused` and `presence` are filled by phase 6.
        $running = ccrm_te_json_list($pdo, array_column(ccrm_tt_running_rows($pdo, $callerId), 'id'), $viewer);
        ccrm_te_respond([
            'running' => $running,
            'paused' => [],
            'presence' => null,
            'serverNow' => ccrm_tt_iso(ccrm_tt_now_utc()),
            'entry' => $running[0] ?? null,
        ]);
    }

    // Aggregates for the task chip, the project Time tab and the labour line.
    // Hours of every user (a task's tracked time is not a private entry). Cost is
    // included only when every contributing row is one the caller may see — their
    // own always, anyone else's only with time_tracking_costs — so a partial sum
    // is never presented as the project's labour.
    if ($action === 'totals') {
        $stmt = $pdo->query("SELECT `task_id`, `ticket_id`, `project_id`, `user_id`, COALESCE(SUM(`duration_sec`), 0) AS `sec`, COALESCE(SUM(`worked_ms`), 0) AS `worked`, SUM(`cost`) AS `cost`, SUM(`cost` IS NULL) AS `missing`
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
                    $byProject[$r['project_id']] = ['seconds' => 0, 'workedMs' => 0, 'cost' => 0.0, 'complete' => true];
                }
                $byProject[$r['project_id']]['seconds'] += $sec;
                $byProject[$r['project_id']]['workedMs'] += (int)$r['worked'];
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
        // Worked time per user per day (D5.3), same visibility as the hours above (hours are not private).
        $workedByUserDay = [];
        $wstmt = $pdo->query("SELECT `user_id`, `entry_date`, SUM(`worked_ms`) AS `w` FROM `time_entries`
            WHERE `deleted_at` IS NULL AND `worked_ms` IS NOT NULL GROUP BY `user_id`, `entry_date`");
        foreach ($wstmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $workedByUserDay[(string)$r['user_id']][(string)$r['entry_date']] = (int)$r['w'];
        }
        ccrm_te_respond(['byTask' => $byTask ?: new stdClass(), 'byTicket' => $byTicket ?: new stdClass(), 'byProject' => $byProject ?: new stdClass(), 'workedByUserDay' => $workedByUserDay ?: new stdClass()]);
    }

    // Overlap count per month for the Settings panel (read-only, admin / general_config like settings).
    // A closed timed entry counts when another live closed timed entry of the same user overlaps it.
    if ($action === 'overlaps') {
        if (!ccrm_is_admin($sessionUser) && !ccrm_can($scope, 'general_config', 'edit')) {
            ccrm_te_fail('forbidden', 403);
        }
        $from = (string)($_GET['from'] ?? '');
        $to = (string)($_GET['to'] ?? $from);
        if (!preg_match('/^\d{4}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}$/', $to) || $to < $from) {
            ccrm_te_fail('bad_request', 400);
        }
        $lo = $from . '-01';
        $hi = date('Y-m-d', strtotime($to . '-01 +1 month'));
        $ostmt = $pdo->prepare("SELECT DATE_FORMAT(a.`entry_date`, '%Y-%m') AS `m`, COUNT(DISTINCT a.`id`) AS `entries`, COUNT(DISTINCT a.`user_id`) AS `users`
            FROM `time_entries` a
            JOIN `time_entries` b ON b.`user_id` = a.`user_id` AND b.`id` <> a.`id`
                AND b.`entry_date` BETWEEN DATE_SUB(a.`entry_date`, INTERVAL 1 DAY) AND DATE_ADD(a.`entry_date`, INTERVAL 1 DAY)
                AND b.`deleted_at` IS NULL AND b.`start_at` IS NOT NULL AND b.`end_at` IS NOT NULL
                AND b.`start_at` < a.`end_at` AND b.`end_at` > a.`start_at`
            WHERE a.`entry_date` >= ? AND a.`entry_date` < ? AND a.`deleted_at` IS NULL
                AND a.`start_at` IS NOT NULL AND a.`end_at` IS NOT NULL
            GROUP BY `m` ORDER BY `m`");
        $ostmt->execute([$lo, $hi]);
        $months = [];
        foreach ($ostmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $months[] = ['month' => $r['m'], 'entries' => (int)$r['entries'], 'users' => (int)$r['users']];
        }
        ccrm_te_respond(['months' => $months]);
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

if ($action === 'prefs') {
    $mode = $body['startWhileRunning'] ?? null;
    if (!in_array($mode, ['ask', 'switch', 'parallel'], true)) {
        ccrm_te_fail('invalid_start_while_running', 422);
    }
    $prefs = ['startWhileRunning' => $mode];
    ccrm_tt_save_prefs($pdo, $callerId, $prefs);
    ccrm_te_respond($prefs);
}

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
            ccrm_te_fail($cat['code'] ?? 'toggl_not_configured', 422, ['problem' => $cat['problem'] ?? null]);
        }
        $ccrmProjects = $pdo->query("SELECT `id`, `name` FROM `projects` ORDER BY `name` LIMIT 2000")->fetchAll(\PDO::FETCH_ASSOC);
        $ccrmUsers = $pdo->query("SELECT `id`, `name`, `email` FROM `users` ORDER BY `name`")->fetchAll(\PDO::FETCH_ASSOC);
        /* The Toggl user that is probably the signed-in person (same e-mail), offered as the
           default for "only one Toggl user". The token's owner is NOT assumed to be them: the
           token is often an administrator's. */
        $togglMe = '';
        $myEmail = '';
        foreach ($ccrmUsers as $cu) {
            if ((string)$cu['id'] === $callerId) {
                $myEmail = strtolower(trim((string)($cu['email'] ?? '')));
            }
        }
        if ($myEmail !== '') {
            foreach ($cat['users'] as $tu) {
                if (strtolower(trim((string)$tu['email'])) === $myEmail) {
                    $togglMe = (string)$tu['id'];
                    break;
                }
            }
        }
        $savedProjects = is_array($saved['projects'] ?? null) ? $saved['projects'] : [];
        $savedUsers = is_array($saved['users'] ?? null) ? $saved['users'] : [];
        ccrm_te_respond([
            'projects' => $cat['projects'],
            'projectsTruncated' => !empty($cat['projectsTruncated']),
            // Why Toggl stopped answering, when it did: {reason, status, retryIn}.
            'problem' => $cat['problem'] ?? null,
            'users' => $cat['users'],
            'me' => $togglMe,
            'ccrmProjects' => array_map(fn($r) => ['id' => $r['id'], 'name' => (string)($r['name'] ?? '')], $ccrmProjects),
            'ccrmUsers' => array_map(fn($r) => ['id' => $r['id'], 'name' => (string)($r['name'] ?? ''), 'email' => (string)($r['email'] ?? '')], $ccrmUsers),
            'projectMap' => (object)$savedProjects,
            'userMap' => (object)$savedUsers,
            'defaultUserMap' => (object)$defaultUsers,
        ]);
    }

    // The mapping screen saves every dropdown change on its own; Preview / Import save it too.
    if ($mode === 'saveMap') {
        $saveProjects = ccrm_te_import_map($body['projectMap'] ?? []);
        $saveUsers = ccrm_te_import_map($body['userMap'] ?? []);
        try {
            $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TOGGL_IMPORT_MAP', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
                ->execute([json_encode(['projects' => $saveProjects, 'users' => $saveUsers], JSON_UNESCAPED_UNICODE)]);
        } catch (\Throwable $e) {
            ccrm_log_exception($e);
            ccrm_te_fail('save_failed', 500);
        }
        ccrm_te_respond(['saved' => true]);
    }

    $from = (string)($body['from'] ?? '');
    $to = (string)($body['to'] ?? '');
    if (!ccrm_tt_valid_date($from) || !ccrm_tt_valid_date($to)) {
        ccrm_te_fail('bad_request', 400);
    }
    if ($from > $to) {
        ccrm_te_fail('bad_range', 400);
    }
    // One request covers at most a year; the screen splits a longer period into short windows.
    $span = (int)(new \DateTimeImmutable($from))->diff(new \DateTimeImmutable($to))->days;
    if ($span > 366) {
        ccrm_te_fail('range_too_long', 400);
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

    /* "Only one Toggl user": the entries of the Toggl user picked on the screen go to the
       signed-in user (or to whoever that Toggl user is mapped to), and nobody else's are read.
       No user mapping needed. The Toggl user is picked, never taken from the token's owner.
       This override is for this request only; it is not written into the saved map above. */
    $onlyMeId = '';
    $onlyUser = trim((string)($body['onlyUser'] ?? ''));
    if ($onlyUser !== '') {
        if (!preg_match('/^\d{1,20}$/', $onlyUser)) {
            ccrm_te_fail('bad_request', 400);
        }
        $onlyMeId = $onlyUser;
        $userMap = [$onlyMeId => (($userMap[$onlyMeId] ?? '') !== '' ? $userMap[$onlyMeId] : $callerId)];
    }

    $fetched = ccrm_toggl_import_fetch($token, $workspace, $from, $to, $onlyMeId);
    if (empty($fetched['ok'])) {
        ccrm_te_fail($fetched['code'] ?? 'toggl_not_configured', 422, ['problem' => $fetched['problem'] ?? null]);
    }
    $rows = $fetched['entries'];
    if ($onlyMeId !== '') {
        // The token-owner fallback is not filtered by Toggl; keep only the picked user's rows.
        $rows = array_values(array_filter($rows, fn($r) => $r['userId'] === $onlyMeId));
    }
    $ids = [];
    foreach ($rows as $r) {
        $ids[] = $r['id'];
    }
    /* external id => the stored row, so an entry imported without a project can get one later */
    $existing = [];
    foreach (array_chunk($ids, 200) as $chunk) {
        if ($chunk === []) {
            continue;
        }
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        $ex = $pdo->prepare("SELECT `id`, `external_id`, `user_id`, `employee_id`, `project_id`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `origin_type`, `origin_id`, `approval_status`, `deleted_at` FROM `time_entries` WHERE `source` = 'toggl' AND `external_id` IN ($ph)");
        $ex->execute($chunk);
        foreach ($ex->fetchAll(\PDO::FETCH_ASSOC) as $exRow) {
            $existing[(string)$exRow['external_id']] = $exRow;
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

    /* Default on: an entry from a Toggl project that is not paired is left in Toggl, so a later
       import (after pairing) brings it in with its project instead of it landing without one. */
    $skipUnpaired = !array_key_exists('skipUnpaired', $body) || !empty($body['skipUnpaired']);
    $lockToday = ccrm_tt_local_date(ccrm_tt_now_utc());
    $isAdminImport = ccrm_is_admin($sessionUser);

    /* "Repair": an entry that is already imported is brought back in line with Toggl — the project
       its Toggl project is paired with NOW, and Toggl's own start, end and duration. Off by
       default, because it overwrites a project changed by hand; it exists for entries an
       earlier import put on the wrong project or stored with shifted times. An entry whose
       Toggl project is not paired keeps its project and only gets its times corrected. */
    $repair = !empty($body['repair']);
    $repairList = [];
    $repairLocked = 0;

    $already = 0;
    $ready = [];
    $fill = [];
    $fillLocked = 0;
    $skippedUsers = 0;
    $unmappedProjects = 0;
    $skippedUnpaired = 0;
    $withoutProject = 0;
    foreach ($rows as $r) {
        $mapped = !empty($r['projectId']) ? ($projectMap[$r['projectId']] ?? '') : '';
        $pairedProject = ($mapped !== '' && isset($knownProjects[$mapped])) ? $mapped : null;
        if (isset($existing[$r['id']])) {
            $already++;
            $stored = $existing[$r['id']];
            if ($repair) {
                if (!empty($stored['deleted_at'])) {
                    continue; // a deleted entry stays deleted
                }
                $startUtc = ccrm_tt_to_utc($r['start']);
                $endUtc = ccrm_tt_to_utc($r['stop']);
                if ($startUtc === null || $endUtc === null) {
                    continue;
                }
                $oldProject = (string)($stored['project_id'] ?? '');
                $newProject = $pairedProject ?? ($oldProject !== '' ? $oldProject : null);
                $entryDate = ccrm_tt_local_date($startUtc);
                $projectChanged = (string)($newProject ?? '') !== $oldProject;
                $timeChanged = strtotime((string)$stored['start_at'] . ' UTC') !== strtotime($startUtc . ' UTC')
                    || strtotime((string)$stored['end_at'] . ' UTC') !== strtotime($endUtc . ' UTC')
                    || (int)$stored['duration_sec'] !== (int)$r['seconds']
                    || (string)$stored['entry_date'] !== $entryDate;
                if (!$projectChanged && !$timeChanged) {
                    continue;
                }
                if (!$isAdminImport && ccrm_te_lock_reason_of($pdo, $stored, $settings, $lockToday) !== null) {
                    $repairLocked++;
                    continue;
                }
                $repairList[] = [
                    'id' => (string)$stored['id'], 'userId' => (string)$stored['user_id'], 'project' => $newProject,
                    'oldProject' => $oldProject, 'projectChanged' => $projectChanged, 'timeChanged' => $timeChanged,
                    'start' => $startUtc, 'end' => $endUtc, 'entryDate' => $entryDate, 'seconds' => (int)$r['seconds'],
                    'originId' => $stored['origin_id'] ?? null,
                    'stored' => $stored,
                    'originIsOldProject' => (string)($stored['origin_type'] ?? '') === 'project' && $oldProject !== '' && (string)($stored['origin_id'] ?? '') === $oldProject,
                ];
                continue;
            }
            /* Imported earlier without a project, and its Toggl project is paired now: fill it in.
               A project set or changed by hand is never touched; a deleted entry stays deleted. */
            if ($pairedProject !== null && empty($stored['project_id']) && empty($stored['deleted_at'])) {
                if (!$isAdminImport && ccrm_te_lock_reason_of($pdo, $stored, $settings, $lockToday) !== null) {
                    $fillLocked++;
                } else {
                    $fill[] = ['id' => (string)$stored['id'], 'project' => $pairedProject, 'entryDate' => (string)$stored['entry_date']];
                }
            }
            continue;
        }
        $ccrmUser = $userMap[$r['userId']] ?? '';
        if ($ccrmUser === '' || !isset($knownUsers[$ccrmUser])) {
            $skippedUsers++;
            continue;
        }
        if (!empty($r['projectId']) && $pairedProject === null) {
            if ($skipUnpaired) {
                $skippedUnpaired++;
                continue;
            }
            $unmappedProjects++;
        }
        if ($pairedProject === null) {
            $withoutProject++;
        }
        $ready[] = $r + ['ccrmUser' => $ccrmUser, 'ccrmProject' => $pairedProject];
    }

    $commit = $mode === 'commit';
    $imported = 0;
    $projectsFilled = 0;
    if ($commit && $fill) {
        $fillStmt = $pdo->prepare("UPDATE `time_entries` SET `project_id` = ?, `billable_rate` = ? WHERE `id` = ? AND `source` = 'toggl' AND `project_id` IS NULL AND `deleted_at` IS NULL");
        foreach ($fill as $f) {
            $fillStmt->execute([$f['project'], ccrm_tt_lookup_billable_rate($pdo, $f['project'], null, $f['entryDate']), $f['id']]);
            $projectsFilled += $fillStmt->rowCount();
        }
        ccrm_audit_log($pdo, $sessionUser, 'time_tracking.toggl_import', "Set the project on {$projectsFilled} Toggl entries imported earlier without one");
    }
    $repaired = 0;
    $repairedProjects = 0;
    /* Repairs and new entries are written in one transaction that ends with ccrm_tt_settle_rows()
       (worked time and cost of every touched entry and its neighbours). Rates are looked up
       first, so the holiday cache is warm and nothing inside the transaction needs the network. */
    $priceMemo = [];
    $priceFor = function (string $userId, string $entryDate) use ($pdo, $settings, &$priceMemo): array {
        $key = $userId . '|' . substr($entryDate, 0, 7);
        return $priceMemo[$key] ??= ccrm_tt_price($pdo, $userId, $entryDate, null, $settings, true);
    };
    $touched = [];
    $failTx = function (string $code, int $status) use ($pdo): void {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        ccrm_te_fail($code, $status);
    };
    if ($commit && ($repairList || $ready)) {
        foreach ($repairList as $f) {
            $priceFor($f['userId'], $f['entryDate']);
        }
        foreach ($ready as $r) {
            $readyStart = ccrm_tt_to_utc($r['start']);
            if ($readyStart !== null) {
                $priceFor($r['ccrmUser'], ccrm_tt_local_date($readyStart));
            }
        }
        $pdo->beginTransaction();
    }
    if ($commit && $repairList) {
        $repStmt = $pdo->prepare(
            "UPDATE `time_entries` SET `project_id` = ?, `billable_rate` = ?, `origin_id` = ?, `entry_date` = ?, `start_at` = ?, `end_at` = ?, `duration_sec` = ?,
                    `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?
              WHERE `id` = ? AND `source` = 'toggl' AND `deleted_at` IS NULL"
        );
        foreach ($repairList as $f) {
            // The rate is re-frozen the same way a fresh import prices the entry; settle writes the cost.
            $price = $priceFor($f['userId'], $f['entryDate']);
            $rate = ccrm_tt_lookup_billable_rate($pdo, $f['project'], null, $f['entryDate']);
            // An entry that says it came from its (old) project follows the project.
            $originId = $f['originIsOldProject'] ? $f['project'] : $f['originId'];
            try {
                $repStmt->execute([
                    $f['project'], $rate, $originId, $f['entryDate'], $f['start'], $f['end'], $f['seconds'],
                    $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'],
                    $f['id'],
                ]);
            } catch (\PDOException $e) {
                ccrm_log_exception($e);
                $failTx('save_failed', 500);
            }
            $touched[] = $f['stored'];
            $touched[] = ['id' => $f['id'], 'user_id' => $f['userId'], 'start_at' => $f['start'], 'end_at' => $f['end'], 'duration_sec' => $f['seconds'], 'entry_date' => $f['entryDate']];
            if ($repStmt->rowCount() > 0) {
                $repaired++;
                if ($f['projectChanged']) {
                    $repairedProjects++;
                }
            }
        }
        ccrm_audit_log($pdo, $sessionUser, 'time_tracking.toggl_import', "Repaired {$repaired} imported Toggl entries from {$from} to {$to} to match Toggl ({$repairedProjects} moved to another project)");
    }
    if ($commit && $ready) {
        $ins = $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `billable`, `billable_rate`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`, `tags`, `source`, `external_id`)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'toggl', ?)"
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
            $price = $priceFor($r['ccrmUser'], $entryDate);
            $rate = ccrm_tt_lookup_billable_rate($pdo, $r['ccrmProject'], null, $entryDate);
            try {
                $ins->execute([
                    ccrm_tt_new_id(), $r['ccrmUser'], $callerId, $price['employee_id'], $r['ccrmProject'],
                    $desc, $desc, $entryDate, $startUtc, $endUtc, (int)$r['seconds'], $r['billable'] ? 1 : 0, $rate,
                    $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'],
                    $r['id'],
                ]);
                $existing[$r['id']] = true;
                $imported++;
                $touched[] = ['user_id' => $r['ccrmUser'], 'start_at' => $startUtc, 'end_at' => $endUtc, 'duration_sec' => (int)$r['seconds'], 'entry_date' => $entryDate];
            } catch (\PDOException $e) {
                if ((int)($e->errorInfo[1] ?? 0) === 1062) {
                    $already++;
                    continue;
                }
                ccrm_log_exception($e);
                $failTx('save_failed', 500);
            }
        }
        ccrm_audit_log($pdo, $sessionUser, 'time_tracking.toggl_import', "Imported {$imported} Toggl entries from {$from} to {$to} ({$already} already imported)");
    }
    if ($pdo->inTransaction()) {
        try {
            ccrm_tt_settle_rows($pdo, $touched);
            $pdo->commit();
        } catch (\Throwable $e) {
            ccrm_log_exception($e);
            $failTx('save_failed', 500);
        }
    }

    ccrm_te_respond([
        'preview' => !$commit,
        'total' => count($rows),
        'alreadyImported' => $already,
        'ready' => count($ready),
        'imported' => $imported,
        'skippedUsers' => $skippedUsers,
        'unmappedProjects' => $unmappedProjects,
        'skippedUnpaired' => $skippedUnpaired,
        'withoutProject' => $withoutProject,
        'projectsToFill' => count($fill),
        'projectsFilled' => $projectsFilled,
        'projectsFillLocked' => $fillLocked,
        'toRepair' => count($repairList),
        'toRepairProjects' => count(array_filter($repairList, fn($f) => $f['projectChanged'])),
        'repaired' => $repaired,
        'repairedProjects' => $repairedProjects,
        'repairLocked' => $repairLocked,
        'truncated' => !empty($fetched['truncated']),
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

/**
 * C4: running several timers is the OWNER's permission. A manager acting for X (start, restore,
 * hand-over, undo) needs X's role to have `time_tracking_parallel`; an admin owner always has it.
 * Reads the database: call it before beginTransaction() (the presence lock must stay the
 * transaction's first statement, see time_lock.php).
 */
function ccrm_te_owner_can_parallel(\PDO $pdo, string $ownerId, string $callerId, bool $callerCanParallel): bool {
    static $memo = [];
    if ($ownerId === $callerId) {
        return $callerCanParallel;
    }
    if (!array_key_exists($ownerId, $memo)) {
        $stmt = $pdo->prepare("SELECT `id`, `name`, `email`, `role` FROM `users` WHERE `id` = ? LIMIT 1");
        $stmt->execute([$ownerId]);
        $ownerUser = $stmt->fetch(\PDO::FETCH_ASSOC);
        $memo[$ownerId] = $ownerUser ? ccrm_can(ccrm_read_scope($pdo, $ownerUser), 'time_tracking_parallel') : false;
    }
    return $memo[$ownerId];
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
    $sel = $pdo->prepare('SELECT `id`, `user_id`, `entry_date` FROM `time_entries` WHERE ' . implode(' AND ', $where));
    $sel->execute($params);
    $rows = $sel->fetchAll(\PDO::FETCH_ASSOC);
    // Re-freeze the rates first (may fetch holidays, so outside the transaction), then write them and
    // settle the period per user: that re-prices AND re-allocates overlapping entries (C16).
    // A frozen month's rate card row is recomputed first (D4.3, C16: frozen_at kept), so the price
    // below reads the new rate; open months re-price themselves inside ccrm_tt_price().
    require_once __DIR__ . '/time_rate_card.php';
    $prices = [];
    foreach ($rows as $r) {
        $key = $r['user_id'] . '|' . substr((string)$r['entry_date'], 0, 7);
        if (!isset($prices[$key])) {
            $emp = ccrm_tt_employee_for_user($pdo, (string)$r['user_id']);
            if ($emp !== null) {
                ccrm_tt_rate_for($pdo, (string)$emp['id'], substr((string)$r['entry_date'], 0, 7), $settings, true, true);
            }
        }
        $prices[$key] ??= ccrm_tt_price($pdo, (string)$r['user_id'], (string)$r['entry_date'], null, $settings, true);
    }
    $upd = $pdo->prepare("UPDATE `time_entries` SET `employee_id` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ? WHERE `id` = ?");
    $count = 0;
    $users = [];
    try {
        $pdo->beginTransaction();
        foreach ($rows as $r) {
            $price = $prices[$r['user_id'] . '|' . substr((string)$r['entry_date'], 0, 7)];
            $upd->execute([$price['employee_id'], $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $r['id']]);
            $users[(string)$r['user_id']] = true;
            $count++;
        }
        $fromDay = ccrm_ts_local_day_ms($from);
        $toDay = ccrm_ts_local_day_ms($to);
        foreach (array_keys($users) as $u) {
            ccrm_tt_settle($pdo, (string)$u, ccrm_ts_utc($fromDay[0]), ccrm_ts_utc($toDay[1]), true); // admin: may rewrite locked rows
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
    }
    ccrm_audit_log($pdo, $sessionUser, 'time_tracking.reprice', "Re-priced {$count} time entries from {$from} to {$to}");
    ccrm_te_respond(['repriced' => $count]);
}

if ($action === 'start') {
    $owner = ccrm_te_owner($pdo, $body, $callerId, $canTeam);
    // D5.3: no mode (old clients) = 'switch', exactly today's behaviour for one timer.
    $mode = ($body['mode'] ?? null) === null || $body['mode'] === '' ? 'switch' : $body['mode'];
    if ($mode !== 'switch' && $mode !== 'parallel') {
        ccrm_te_fail('bad_mode', 400);
    }
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
    $ownerCanParallel = ccrm_te_owner_can_parallel($pdo, $owner, $callerId, $canParallel);

    // Warm the holiday cache for the months of the entries a switch is about to stop, so pricing
    // inside the transaction never needs the network.
    if ($mode === 'switch') {
        foreach (ccrm_tt_running_rows($pdo, $owner) as $previous) {
            ccrm_tt_price($pdo, $owner, $previous['entry_date'], null, $settings, true);
        }
    }

    $stopped = [];
    $alreadyId = null; // switch to a target that already runs among others: that one keeps running
    ccrm_tt_lock_prepare($pdo, $owner);
    try {
        $pdo->beginTransaction();
        ccrm_tt_lock_user($pdo, $owner);
        $runningRows = ccrm_tt_running_rows($pdo, $owner, true);
        if ($mode === 'parallel') {
            $refusal = ccrm_tt_parallel_refusal($runningRows, $links, ccrm_tt_parallel_settings($settings), $ownerCanParallel);
            if ($refusal !== null) {
                $pdo->rollBack();
                $extra = isset($refusal['entryId']) ? ['entry' => ccrm_te_json($pdo, $refusal['entryId'], $viewer)] : [];
                if (isset($refusal['maxParallel'])) {
                    $extra['maxParallel'] = $refusal['maxParallel'];
                }
                ccrm_te_fail($refusal['code'], 409, $extra);
            }
        } else {
            // Starting what is already running is a click from a stale screen (a second tab, another
            // device, an agent): restarting would split one block of work into a row of tiny entries.
            // Among several running, the switch still happens: every other one stops, the identical one keeps running.
            $same = ccrm_tt_identical_running($runningRows, $links);
            if ($same && count($runningRows) === 1) {
                $pdo->rollBack();
                ccrm_te_fail('already_running', 409, ['entry' => ccrm_te_json($pdo, $same['id'], $viewer)]);
            }
            $alreadyId = $same ? (string)$same['id'] : null;
            foreach ($runningRows as $old) {
                if ($alreadyId !== null && (string)$old['id'] === $alreadyId) {
                    continue;
                }
                ccrm_te_close_row($pdo, $old, $startUtc, $settings);
                $stopped[] = $old;
            }
        }
        if ($alreadyId !== null) {
            ccrm_tt_settle_rows($pdo, $stopped);
            $pdo->commit();
            $stoppedAll = ccrm_te_json_list($pdo, array_column($stopped, 'id'), $viewer);
            ccrm_te_respond([
                'entry' => ccrm_te_json($pdo, $alreadyId, $viewer),
                'stopped' => $stoppedAll[0] ?? null,
                'stoppedAll' => $stoppedAll,
                'mode' => $mode,
                'alreadyRunning' => true,
            ]);
        }
        $ins = $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `note`, `entry_date`, `start_at`, `billable`, `tags`, `source`, `origin_type`, `origin_id`, `device_id`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $ins->execute([
            $newId, $owner, $callerId, $employee['id'] ?? null, $links['project_id'], $links['task_id'], $links['ticket_id'],
            $links['description'], $links['title_snapshot'], ccrm_tt_clean_note($body['note'] ?? null), ccrm_tt_local_date($startUtc), $startUtc, $billable,
            json_encode(ccrm_tt_clean_tags($body['tags'] ?? []), JSON_UNESCAPED_UNICODE),
            ccrm_te_source($body['source'] ?? null, 'timer'), ccrm_te_origin($body['originType'] ?? null), ccrm_tt_nullable_id($body['originId'] ?? null),
            ccrm_tt_nullable_id($body['deviceId'] ?? null),
        ]);
        // The stopped entries (their running intervals reach now) and the new one, which may be back-dated.
        ccrm_tt_settle_rows($pdo, array_merge($stopped, [['id' => $newId, 'user_id' => $owner, 'start_at' => $startUtc, 'end_at' => null, 'entry_date' => ccrm_tt_local_date($startUtc)]]));
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
    }
    $stoppedAll = ccrm_te_json_list($pdo, array_column($stopped, 'id'), $viewer);
    ccrm_te_respond([
        'entry' => ccrm_te_json($pdo, $newId, $viewer),
        'stopped' => $stoppedAll[0] ?? null, // old clients: the (first) stopped entry
        'stoppedAll' => $stoppedAll,
        'mode' => $mode,
    ], 201);
}

if ($action === 'stop') {
    $id = ccrm_tt_nullable_id($body['id'] ?? null);
    $all = $id === null && !empty($body['all']);
    if ($id !== null) {
        $s = $pdo->prepare("SELECT * FROM `time_entries` WHERE `id` = ? AND `deleted_at` IS NULL");
        $s->execute([$id]);
        $row = $s->fetch(\PDO::FETCH_ASSOC) ?: null;
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
        $rows = [$row];
        $owner = (string)$row['user_id'];
    } else {
        // Without an id the set to stop is the caller's running set read UNDER the lock (below); this
        // early read only warms the holiday cache, so pricing inside the transaction needs no network.
        $rows = ccrm_tt_running_rows($pdo, $callerId);
        $owner = $callerId;
    }
    foreach ($rows as $r) {
        ccrm_tt_price($pdo, (string)$r['user_id'], $r['entry_date'], null, $settings, true); // warm the holiday cache
    }

    /**
     * The checks a stop must pass, on the set it is about to stop: the project chosen at the moment
     * of stopping (one item only), "require a project" and "require a task".
     * Returns ['projectId' => ?string] or ['fail' => [code, status, extra]].
     */
    $checkStop = function (array $rows) use ($pdo, $scope, $settings, $body, $all): array {
        // A project may be chosen at the moment of stopping (the "require a project" picker); one item only.
        $projectId = null;
        if (!$all && !empty($body['projectId'])) {
            $explicit = ccrm_tt_nullable_id($body['projectId']);
            $links = ccrm_tt_resolve_links($pdo, ['taskId' => $rows[0]['task_id'], 'ticketId' => $rows[0]['ticket_id'], 'projectId' => $explicit, 'description' => $rows[0]['description']]);
            if (!$links['ok']) {
                return ['fail' => [$links['code'], 422, []]];
            }
            if ($denied = ccrm_te_check_link_access($pdo, $scope, $links, $explicit)) {
                return ['fail' => [$denied, 403, []]];
            }
            $projectId = $links['project_id'];
        }
        // Only someone who can pick a project (the module, or projects they work on) is asked for one: an Employee without the projects module
        // would otherwise never be able to stop a free-text timer. With `all`, nothing stops while any item needs one (`ids` lists them).
        $canPickProject = null;
        $needProject = [];
        $needTask = [];
        foreach ($rows as $r) {
            if ($settings['requireProjectToStop'] && ($projectId ?? $r['project_id']) === null) {
                $canPickProject ??= ccrm_can($scope, 'projects') || (bool)ccrm_workable_projects($pdo, $scope);
                if ($canPickProject) {
                    $needProject[] = (string)$r['id'];
                }
            }
            if ($settings['requireTask'] && $r['task_id'] === null && $r['ticket_id'] === null) {
                $needTask[] = (string)$r['id'];
            }
        }
        if ($needProject) {
            return ['fail' => ['project_required', 422, $all ? ['ids' => $needProject] : []]];
        }
        if ($needTask) {
            return ['fail' => ['task_required', 422, $all ? ['ids' => $needTask] : []]];
        }
        return ['projectId' => $projectId];
    };

    ccrm_tt_lock_prepare($pdo, $owner);
    try {
        $pdo->beginTransaction();
        ccrm_tt_lock_user($pdo, $owner);
        if ($id === null) {
            // The fresh running set: what another tab or device started or stopped a moment ago counts.
            $rows = ccrm_tt_running_rows($pdo, $callerId, true);
            if ($all && !$rows) {
                $pdo->rollBack();
                ccrm_te_respond(['entry' => null, 'stoppedAll' => []]); // nothing runs: idempotent
            }
            if (!$rows) {
                $pdo->rollBack();
                ccrm_te_fail('not_found', 404);
            }
            if (!$all && count($rows) > 1) {
                $pdo->rollBack();
                ccrm_te_fail('ambiguous', 409, ['running' => ccrm_te_json_list($pdo, array_column($rows, 'id'), $viewer)]);
            }
        }
        $check = $checkStop($rows);
        if (isset($check['fail'])) {
            $pdo->rollBack();
            ccrm_te_fail($check['fail'][0], $check['fail'][1], $check['fail'][2]);
        }
        $projectId = $check['projectId'];
        $nowUtc = ccrm_tt_now_utc();
        $endUtc = $nowUtc;
        if (!$all && !empty($body['stoppedAt'])) {
            $given = ccrm_tt_to_utc($body['stoppedAt']);
            if ($given !== null && $given >= $rows[0]['start_at'] && $given <= $nowUtc) {
                $endUtc = $given;
            }
        }
        foreach ($rows as $r) {
            ccrm_te_close_row($pdo, $r, $endUtc, $settings, $projectId); // a row stopped meanwhile is left as it is
        }
        ccrm_tt_settle_rows($pdo, $rows); // running until now: covers the stopped intervals
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
    }
    if ($all) {
        $stoppedAll = ccrm_te_json_list($pdo, array_column($rows, 'id'), $viewer);
        ccrm_te_respond(['entry' => $stoppedAll[0] ?? null, 'stoppedAll' => $stoppedAll]);
    }
    ccrm_te_respond(['entry' => ccrm_te_json($pdo, $rows[0]['id'], $viewer)]);
}

if ($action === 'undo_start') {
    $newId = ccrm_tt_nullable_id($body['newId'] ?? null);
    if ($newId === null) {
        ccrm_te_fail('bad_request', 400);
    }
    // Every entry the start stopped (stoppedIds); the legacy single stoppedId still works.
    $stoppedIds = [];
    foreach (array_merge(is_array($body['stoppedIds'] ?? null) ? $body['stoppedIds'] : [], [$body['stoppedId'] ?? null]) as $sid) {
        $sid = is_scalar($sid) ? ccrm_tt_nullable_id($sid) : null;
        if ($sid !== null && $sid !== $newId) {
            $stoppedIds[$sid] = true;
        }
    }
    $stoppedIds = array_keys($stoppedIds);
    $new = ccrm_tt_fetch_entry($pdo, $newId);
    if (!$new || !ccrm_te_can_touch((string)$new['user_id'], $callerId, $canTeam)) {
        ccrm_te_fail('not_found', 404);
    }
    $owner = (string)$new['user_id'];
    $ownerCanParallel = ccrm_te_owner_can_parallel($pdo, $owner, $callerId, $canParallel);
    $reopened = [];
    ccrm_tt_lock_prepare($pdo, $owner);
    try {
        $pdo->beginTransaction();
        ccrm_tt_lock_user($pdo, $owner);
        // The start being undone, read again under the lock: it must still run (a later start, a stop on
        // another device or an edit may have changed it since the click).
        $fresh = $pdo->prepare("SELECT `id`, `user_id`, `start_at`, `end_at`, `duration_sec`, `entry_date` FROM `time_entries` WHERE `id` = ? AND `user_id` = ? AND `start_at` IS NOT NULL AND `end_at` IS NULL FOR UPDATE");
        $fresh->execute([$newId, $owner]);
        $newRow = $fresh->fetch(\PDO::FETCH_ASSOC);
        // The accidental start is removed outright; there is nothing to restore it to.
        $del = $pdo->prepare("DELETE FROM `time_entries` WHERE `id` = ? AND `user_id` = ? AND `end_at` IS NULL");
        $del->execute([$newId, $owner]);
        if (!$newRow || $del->rowCount() !== 1) {
            // Nothing was undone, so nothing is reopened: the entries it once stopped stay stopped.
            $pdo->rollBack();
            ccrm_te_fail('conflict', 409, ['entry' => ccrm_te_json($pdo, $newId, $viewer)]);
        }
        $touched = [$newRow];
        // Only what this start actually stopped: the owner's entries that ended at the moment it began.
        $before = $pdo->prepare("SELECT `id`, `user_id`, `start_at`, `end_at`, `duration_sec`, `entry_date` FROM `time_entries` WHERE `id` = ? AND `user_id` = ? AND `deleted_at` IS NULL AND `start_at` IS NOT NULL AND `end_at` = ?");
        $candidates = [];
        foreach ($stoppedIds as $sid) {
            $before->execute([$sid, $owner, $newRow['start_at']]);
            if ($stoppedRow = $before->fetch(\PDO::FETCH_ASSOC)) {
                $candidates[] = $stoppedRow;
            }
        }
        // Room under the lock: whatever runs now (the start is gone) plus every entry to reopen must fit
        // what parallel tracking allows the owner; otherwise nothing is reopened.
        $runningNow = count(ccrm_tt_running_rows($pdo, $owner, true));
        foreach (array_keys($candidates) as $i) {
            if (!ccrm_tt_parallel_room($settings, $ownerCanParallel, $runningNow + $i)) {
                $pdo->rollBack();
                ccrm_te_fail('conflict', 409, ['entry' => ccrm_te_json($pdo, $newId, $viewer)]);
            }
        }
        // The end and the frozen rate go (stop re-freezes it); ccrm_tt_settle() clears worked time and cost.
        $reopen = $pdo->prepare("UPDATE `time_entries` SET `end_at` = NULL, `duration_sec` = NULL, `cost_rate` = NULL, `cost_rate_source` = 'none', `cost_rate_basis_days` = NULL WHERE `id` = ? AND `user_id` = ? AND `deleted_at` IS NULL AND `start_at` IS NOT NULL AND `end_at` = ?");
        foreach ($candidates as $stoppedRow) {
            $reopen->execute([$stoppedRow['id'], $owner, $newRow['start_at']]);
            if ($reopen->rowCount() === 1) {
                $touched[] = $stoppedRow;
                $touched[] = ['end_at' => null] + $stoppedRow;
                $reopened[] = (string)$stoppedRow['id'];
            }
        }
        ccrm_tt_settle_rows($pdo, $touched);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
    }
    $reopenedJson = ccrm_te_json_list($pdo, $reopened, $viewer);
    ccrm_te_respond(['entry' => $reopenedJson[0] ?? null, 'reopened' => $reopenedJson]);
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
    // Its neighbours' worked time changes when it goes or comes back.
    ccrm_te_refuse_neighbours($pdo, $sessionUser, (string)$row['user_id'], [ccrm_te_interval_of($row)], $settings, (string)$row['id']);
    /* PHASE6-LOCK-END */
    // A running entry is timer state: its owner's lock serialises it with start / stop (D5.1).
    $isTimer = $row['start_at'] !== null && $row['end_at'] === null;
    if ($isTimer) {
        ccrm_tt_lock_prepare($pdo, (string)$row['user_id']);
    }
    $ownerCanParallel = $action === 'restore' && $isTimer
        ? ccrm_te_owner_can_parallel($pdo, (string)$row['user_id'], $callerId, $canParallel)
        : $canParallel;
    if ($action === 'delete') {
        try {
            $pdo->beginTransaction();
            if ($isTimer) {
                ccrm_tt_lock_user($pdo, (string)$row['user_id']);
            }
            $pdo->prepare("UPDATE `time_entries` SET `deleted_at` = UTC_TIMESTAMP() WHERE `id` = ? AND `deleted_at` IS NULL")->execute([$id]);
            ccrm_tt_settle_rows($pdo, [$row]); // its neighbours get its share back
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            ccrm_log_exception($e);
            ccrm_te_fail('save_failed', 500);
        }
        if ((string)$row['user_id'] !== $callerId) {
            ccrm_audit_log($pdo, $sessionUser, 'time_entry.delete', "Deleted time entry {$id} of user {$row['user_id']}");
        }
        ccrm_te_respond(['id' => $id]);
    }
    try {
        $pdo->beginTransaction();
        if ($isTimer && $row['deleted_at'] !== null) {
            ccrm_tt_lock_user($pdo, (string)$row['user_id']);
            // Restoring a deleted running timer beside others needs the room parallel tracking gives.
            if (!ccrm_tt_parallel_room($settings, $ownerCanParallel, count(ccrm_tt_running_rows($pdo, (string)$row['user_id'], true)))) {
                $pdo->rollBack();
                ccrm_te_fail('already_running', 409);
            }
        }
        $pdo->prepare("UPDATE `time_entries` SET `deleted_at` = NULL WHERE `id` = ?")->execute([$id]);
        ccrm_tt_settle_rows($pdo, [$row]); // the restored entry and its neighbours share again
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        ccrm_log_exception($e);
        ccrm_te_fail('save_failed', 500);
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
    // An entry that overlaps a locked one changes its worked time and cost: refused like editing it (D3.3).
    ccrm_te_refuse_locked($pdo, $sessionUser, [[
        'id' => null,
        'user_id' => $owner,
        'employee_id' => null,
        'entry_date' => $entryDate,
        'approval_status' => null,
        'start_at' => $startUtc,
        'end_at' => $endUtc,
    ]], $settings);
    ccrm_te_refuse_neighbours($pdo, $sessionUser, $owner, [[$startUtc, $endUtc]], $settings);
    /* PHASE6-LOCK-END */
    $price = ccrm_tt_price($pdo, $owner, $entryDate, $duration, $settings, true);
    $billable = array_key_exists('billable', $body) ? (int)(bool)$body['billable'] : (int)$settings['billableByDefault'];
    $id = ccrm_tt_new_id();
    try {
        $pdo->beginTransaction();
        $ins = $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `note`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `billable`, `billable_rate`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`, `tags`, `source`, `origin_type`, `origin_id`, `device_id`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $ins->execute([
            $id, $owner, $callerId, $price['employee_id'], $links['project_id'], $links['task_id'], $links['ticket_id'], $links['description'], $links['title_snapshot'], ccrm_tt_clean_note($body['note'] ?? null),
            $entryDate, $startUtc, $endUtc, $duration, $billable,
            ($canCosts && isset($body['billableRate']) && is_numeric($body['billableRate']))
                ? round((float)$body['billableRate'], 2)
                : ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $entryDate),
            $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'],
            json_encode(ccrm_tt_clean_tags($body['tags'] ?? []), JSON_UNESCAPED_UNICODE),
            ccrm_te_source($body['source'] ?? null, 'manual'), ccrm_te_origin($body['originType'] ?? null), ccrm_tt_nullable_id($body['originId'] ?? null),
            ccrm_tt_nullable_id($body['deviceId'] ?? null),
        ]);
        ccrm_tt_settle_rows($pdo, [['id' => $id, 'user_id' => $owner, 'start_at' => $startUtc, 'end_at' => $endUtc, 'duration_sec' => $duration, 'entry_date' => $entryDate]]);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
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
    // Moving it (or handing it to someone else) off or onto a locked entry is refused like editing that entry (D3.3).
    $moved = $owner !== (string)$row['user_id'] || $startUtc !== $row['start_at'] || $endUtc !== $row['end_at']
        || (string)($duration ?? '') !== (string)($row['duration_sec'] ?? '');
    if ($moved) {
        // Both the interval it leaves (old owner) and the one it lands on (new owner).
        ccrm_te_refuse_neighbours($pdo, $sessionUser, (string)$row['user_id'], [ccrm_te_interval_of($row)], $settings, $id);
        ccrm_te_refuse_neighbours($pdo, $sessionUser, $owner, [[$startUtc, $endUtc]], $settings, $id);
    }
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
        ];
    }
    if ($startUtc !== null && $endUtc === null) {
        // Still running: nothing is priced yet.
        $price = ['employee_id' => $price['employee_id'], 'cost_rate' => null, 'cost_rate_source' => 'none', 'cost_rate_basis_days' => null];
    }

    $billable = $has('billable') ? (int)(bool)$body['billable'] : (int)$row['billable'];
    $billableRate = $row['billable_rate'];
    if ($canCosts && $has('billableRate')) {
        $billableRate = is_numeric($body['billableRate']) ? round((float)$body['billableRate'], 2) : null;
    } elseif ($billableRate === null && ($endUtc !== null || $startUtc === null)) {
        $billableRate = ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $entryDate);
    }
    $tags = $has('tags') ? json_encode(ccrm_tt_clean_tags($body['tags']), JSON_UNESCAPED_UNICODE) : $row['tags'];
    $note = $has('note') ? ccrm_tt_clean_note($body['note']) : ($row['note'] ?? null);

    // An edit never reopens a stopped entry (a timer runs only through start, D5.1).
    if (!$wasRunning && $row['end_at'] !== null && $startUtc !== null && $endUtc === null) {
        ccrm_te_fail('conflict', 409, ['entry' => ccrm_te_json($pdo, $id, $viewer)]);
    }

    // Editing a running entry is timer state: lock its owner (and the new owner of a hand-over, D5.1).
    $lockUsers = [];
    $handOver = $wasRunning && $endUtc === null && $owner !== (string)$row['user_id'];
    $ownerCanParallel = $handOver ? ccrm_te_owner_can_parallel($pdo, $owner, $callerId, $canParallel) : $canParallel;
    if ($wasRunning) {
        $lockUsers = array_values(array_unique([(string)$row['user_id'], $owner]));
        sort($lockUsers);
        foreach ($lockUsers as $u) {
            ccrm_tt_lock_prepare($pdo, $u);
        }
    }
    try {
        $pdo->beginTransaction();
        foreach ($lockUsers as $u) {
            ccrm_tt_lock_user($pdo, $u);
        }
        // Everything above was decided on a read taken before the lock. If the entry was stopped, started,
        // handed over or deleted since (another tab, device, the cron), refuse instead of overwriting that.
        $fresh = $pdo->prepare("SELECT `user_id`, `end_at`, `deleted_at` FROM `time_entries` WHERE `id` = ? FOR UPDATE");
        $fresh->execute([$id]);
        $freshRow = $fresh->fetch(\PDO::FETCH_ASSOC);
        if (!$freshRow || $freshRow['deleted_at'] !== null || (string)$freshRow['user_id'] !== (string)$row['user_id'] || $freshRow['end_at'] !== $row['end_at']) {
            $pdo->rollBack();
            ccrm_te_fail('conflict', 409, ['entry' => ccrm_te_json($pdo, $id, $viewer)]);
        }
        // A running entry handed to somebody else runs beside their timers only where parallel tracking allows it (the new owner's permission, C4).
        if ($handOver && !ccrm_tt_parallel_room($settings, $ownerCanParallel, count(ccrm_tt_running_rows($pdo, $owner, true)))) {
            $pdo->rollBack();
            ccrm_te_fail('already_running', 409);
        }
        // Writing an open end: only onto a row that is still open, so a stopped row can never be reopened here.
        $upd = $pdo->prepare(
            "UPDATE `time_entries` SET `user_id` = ?, `employee_id` = ?, `project_id` = ?, `task_id` = ?, `ticket_id` = ?, `description` = ?, `title_snapshot` = ?, `note` = ?, `entry_date` = ?,
               `start_at` = ?, `end_at` = ?, `duration_sec` = ?, `billable` = ?, `billable_rate` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?, `tags` = ?
             WHERE `id` = ? AND `deleted_at` IS NULL" . ($startUtc !== null && $endUtc === null ? ' AND `end_at` IS NULL' : '')
        );
        $upd->execute([
            $owner, $price['employee_id'], $links['project_id'], $links['task_id'], $links['ticket_id'], $links['description'], $links['title_snapshot'], $note, $entryDate,
            $startUtc, $endUtc, $duration, $billable, $billableRate, $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'], $tags, $id,
        ]);
        // The old and the new interval (an owner change settles both people).
        ccrm_tt_settle_rows($pdo, [$row, ['id' => $id, 'user_id' => $owner, 'start_at' => $startUtc, 'end_at' => $endUtc, 'duration_sec' => $duration, 'entry_date' => $entryDate]]);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
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
