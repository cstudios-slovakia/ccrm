<?php
require_once __DIR__ . '/workflows_engine.php';
require_once __DIR__ . '/task_reminders.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed.']);
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
try {
    $stmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `trigger_type` = 'timer' AND `is_active` = 1");
    $stmt->execute();
    $timerWorkflows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $now = time();
    
    foreach ($timerWorkflows as $wf) {
        $config = json_decode($wf['trigger_config_json'] ?? '{}', true) ?: [];
        $intervalMinutes = (int)($config['interval_minutes'] ?? 60);
        if ($intervalMinutes <= 0) $intervalMinutes = 60;
        
        // Find last run from logs
        $lastLogStmt = $pdo->prepare("SELECT MAX(`created_at`) FROM `workflow_logs` WHERE `workflow_id` = ?");
        $lastLogStmt->execute([$wf['id']]);
        $lastRunStr = $lastLogStmt->fetchColumn();
        
        $shouldTrigger = false;
        if (!$lastRunStr) {
            $shouldTrigger = true;
        } else {
            $lastRunTs = strtotime($lastRunStr);
            if (($now - $lastRunTs) >= ($intervalMinutes * 60)) {
                $shouldTrigger = true;
            }
        }
        
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
}

// 2. Task e-mail reminders ("Notify me by e-mail" in the task drawer)
$taskReminders = null;
try {
    $taskReminders = ccrm_process_task_reminders($pdo);
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

// 3. Process Workflow Queue
try {
    ccrm_process_workflow_queue($pdo);
    echo json_encode([
        'success' => true,
        'message' => 'Queue processed successfully.',
        'taskReminders' => $taskReminders,
        'ticketPoll' => $ticketPollResult,
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
