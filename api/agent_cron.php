<?php
/**
 * Dedicated Autonomous AI Agent Cron Endpoint (`public/api/agent_cron.php`).
 *
 * Can be called every minute from:
 * 1) System / Container Crontab (CLI):
 *    * * * * * php /var/www/html/api/agent_cron.php >/dev/null 2>&1
 * 2) External HTTP Cron:
 *    curl -s -H "X-Cron-Token: <cronToken>" https://your-crm.example/api/agent_cron.php
 */
declare(strict_types=1);

require_once __DIR__ . '/workflows_engine.php';
require_once __DIR__ . '/marveen/marveen_lib.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    if (PHP_SAPI !== 'cli') http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (Throwable $e) {
    if (PHP_SAPI !== 'cli') http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$isCli = (PHP_SAPI === 'cli' || PHP_SAPI === 'phpdbg');
if (!$isCli) {
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

    if ($configuredToken === '' || $token === '' || !hash_equals($configuredToken, $token)) {
        require_once __DIR__ . '/auth.php';
        $sessionUser = ccrm_current_user();
        if (!$sessionUser) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Unauthorized. Invalid cron token.']);
            exit;
        }
        if (function_exists('session_write_close')) {
            @session_write_close();
        }
    }
}

$connectorId = null;
$taskId = null;
if ($isCli) {
    $connectorId = isset($argv[1]) && $argv[1] !== '' ? (string)$argv[1] : null;
    $taskId = isset($argv[2]) && $argv[2] !== '' ? (string)$argv[2] : null;
} else {
    $connectorId = isset($_GET['connectorId']) && $_GET['connectorId'] !== '' ? (string)$_GET['connectorId'] : null;
    $taskId = isset($_GET['taskId']) && $_GET['taskId'] !== '' ? (string)$_GET['taskId'] : null;
}

try {
    $result = ccrm_marveen_run_autonomous_ticks($pdo, $connectorId, $taskId);
    echo json_encode([
        'success' => true,
        'timestamp' => gmdate('c'),
        'executed' => $result['executed'] ?? [],
    ]) . "\n";
} catch (Throwable $e) {
    if (function_exists('ccrm_log_exception')) {
        ccrm_log_exception($e);
    }
    if (!$isCli) http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]) . "\n";
}
