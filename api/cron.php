<?php
require_once __DIR__ . '/workflows_engine.php';

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
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$token = $_GET['token'] ?? '';
$autoConfig = ccrm_load_automation_config($pdo);

// Token verification
if ($token === '' || $token !== ($autoConfig['cronToken'] ?? '')) {
    // If not authenticated via cron token, check if we have a valid session user
    require_once __DIR__ . '/auth.php';
    $sessionUser = ccrm_current_user();
    if (!$sessionUser) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized. Invalid token.']);
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
} catch (\Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
}

// 2. Process Workflow Queue
try {
    ccrm_process_workflow_queue($pdo);
    echo json_encode(['success' => true, 'message' => 'Queue processed successfully.']);
} catch (\Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
