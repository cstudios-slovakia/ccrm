<?php
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/workflows_engine.php';
require_once __DIR__ . '/task_reminders.php';
require_once __DIR__ . '/recurring_tasks.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => (KOPERNIQ_PRODUCT_NAME . ' is not installed.')]);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// The token may arrive in a header (preferred: `curl -H "X-Cron-Token: ..."`, or
// Authorization: Bearer) or, for existing crontabs, as ?token= (VULN-07: URLs end up
// in access logs, so new setups should use a header).
$token = trim((string)($_SERVER['HTTP_X_CRON_TOKEN'] ?? ''));
if ($token === '') {
    $authHeader = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '')));
    if ($authHeader !== '' && preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        $token = trim($m[1]);
    }
}
if ($token === '') {
    $token = (string)($_GET['token'] ?? '');
}
$autoConfig = ccrm_load_automation_config($pdo);
$configuredToken = (string)($autoConfig['cronToken'] ?? '');

// Token verification (constant-time, and an unset token never matches).
if ($configuredToken === '' || $token === '' || !hash_equals($configuredToken, $token)) {
    // Not the cron token: fall back to a signed-in ADMIN session. That path runs the
    // whole automation pipeline, so it is not open to every user, and it must be a
    // POST so a cross-site link or image cannot trigger it with the session cookie.
    require_once __DIR__ . '/auth.php';
    $sessionUser = ccrm_current_user();
    if (!$sessionUser) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized. Invalid token.']);
        exit;
    }
    if (!ccrm_is_admin($sessionUser) || ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Forbidden.']);
        exit;
    }
}

// 1. Process Timer Triggers
//
// "When did this timer last fire" is the last timer row it put on the queue, not
// its last execution log: the log is written at the end of a run, so a run that
// threw before logging, or one still waiting behind a backlog, made every cron
// tick think the timer had never fired and enqueue it again. Queue rows are kept
// (marked completed/failed), so they are the stored record of each fire. The log
// still counts, so a manual run keeps resetting the clock as it did before.
// A named lock keeps two overlapping cron calls from both enqueuing the same fire.
$timerLock = false;
try {
    $timerLock = (int)$pdo->query("SELECT GET_LOCK('ccrm_workflow_timers', 0)")->fetchColumn() === 1;
} catch (Throwable $e) {
    $timerLock = true; // no named locks on this server: run unguarded, as before
}
if ($timerLock) try {
    $stmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `trigger_type` = 'timer' AND `is_active` = 1");
    $stmt->execute();
    $timerWorkflows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $lastFireStmt = $pdo->prepare(
        "SELECT (SELECT MAX(`created_at`) FROM `workflow_queue` WHERE `workflow_id` = ? AND `trigger_event_type` = 'timer') AS `last_queued`,
                (SELECT MAX(`created_at`) FROM `workflow_logs` WHERE `workflow_id` = ?) AS `last_logged`,
                NOW() AS `db_now`"
    );

    foreach ($timerWorkflows as $wf) {
        $config = json_decode($wf['trigger_config_json'] ?? '{}', true) ?: [];
        $intervalMinutes = (int)($config['interval_minutes'] ?? 60);
        if ($intervalMinutes <= 0) $intervalMinutes = 60;

        // All three timestamps come from MySQL, so PHP's time zone cannot skew them.
        $lastFireStmt->execute([$wf['id'], $wf['id']]);
        $fire = $lastFireStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $shouldTrigger = ccrm_timer_workflow_due(
            $fire['last_queued'] ?? null,
            $fire['last_logged'] ?? null,
            (string)($fire['db_now'] ?? date('Y-m-d H:i:s')),
            $intervalMinutes
        );

        if ($shouldTrigger) {
            $payload = [
                'triggered_at' => date('Y-m-d H:i:s'),
                'interval_minutes' => $intervalMinutes
            ];
            $ins = $pdo->prepare("
                INSERT INTO `workflow_queue` (`workflow_id`, `trigger_event_type`, `payload_json`, `status`)
                VALUES (?, 'timer', ?, 'pending')
            ");
            $ins->execute([$wf['id'], json_encode($payload)]);
        }
    }
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
} finally {
    try { $pdo->query("SELECT RELEASE_LOCK('ccrm_workflow_timers')"); } catch (Throwable $e) {}
}

// 2. Task e-mail reminders ("Notify me by e-mail" in the task drawer)
$taskReminders = null;
try {
    $taskReminders = ccrm_process_task_reminders($pdo);
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
}

// 2. Recurring task generation
$recurringTasks = null;
try {
    $recurringTasks = ccrm_process_recurring_tasks($pdo);
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
}

// 2b. Support Ticket IMAP Polling
$ticketPollResult = null;
try {
    require_once __DIR__ . '/tickets.php';
    $ticketPollResult = ccrm_poll_ticket_imap($pdo, false);
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
}

// 2c. Background mail filing: read every company mailbox and every user's mailbox and
// file mail from or to a known customer onto that customer's timeline (api/mail_filing.php).
// Bounded by time and message count; a broken mailbox is recorded, never fatal.
$mailFiling = null;
try {
    require_once __DIR__ . '/mail_filing.php';
    $mailFiling = ccrm_run_mail_filing($pdo);
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
}

// 2d. Public holidays for time tracking: refresh this year and next (SK, HU) from
// Nager.Date, at most once a month (api/holidays_lib.php). A dead API is not fatal.
$holidayRefresh = null;
try {
    require_once __DIR__ . '/holidays_lib.php';
    $holidayRefresh = ccrm_holidays_refresh_cron($pdo);
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
}

// PHASE5-PURGE: drop time_activity rows older than the retention. Cron only — never ?probe=1.
$activityPurge = null;
try {
    require_once __DIR__ . '/schema.php';
    if (function_exists('ccrm_apply_schema')) {
        ccrm_apply_schema($pdo);
    }
    require_once __DIR__ . '/time_tracker_lib.php';
    $activityPurge = ccrm_tta_purge($pdo);
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
}

// 3. Process Workflow Queue
try {
    ccrm_process_workflow_queue($pdo);

    // 4. Newsletter queue: one batch (20 s budget) after the other jobs. A newsletter error must
    // never break the cron run; the worker pauses its own campaign when SMTP fails (api/newsletter_send.php).
    $newsletter = null;
    try {
        require_once __DIR__ . '/newsletter_send.php';
        $newsletter = ccrm_newsletter_tick($pdo);
    } catch (Throwable $e) {
        if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Queue processed successfully.',
        'taskReminders' => $taskReminders,
        'ticketPoll' => $ticketPollResult,
        'holidayRefresh' => $holidayRefresh,
        'activityPurge' => $activityPurge,
        'newsletter' => $newsletter,
        'mailFiling' => $mailFiling === null ? null : [
            'ran' => $mailFiling['ran'] ?? false,
            'seen' => $mailFiling['seen'] ?? 0,
            'filed' => $mailFiling['filed'] ?? 0,
            'errors' => $mailFiling['errors'] ?? 0,
        ],
    ]);
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Queue processing failed.']);
}
