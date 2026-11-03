<?php
/**
 * Settings › Wipe demo data: leave demo mode for a clean slate.
 *
 * The work is demo_leave_demo_mode() (api/demo_seed/leave.php): every transactional row goes (including
 * tickets, contracts, time entries, time activity and workflow logs), then the remaining demo rows go through
 * demo_wipe_demo_rows() - the single definition of a demo row, shared with the re-seed. This file only checks
 * who is asking and answers.
 *
 * keep_configs (default true): keep the settings, lists, categories and every login, only switch DEMO_MODE off.
 * keep_configs = false: replace them all with a fresh install's, with one admin and a random password.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/demo_seed/leave.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

// SECURITY: this endpoint truncates data — admins only.
ccrm_require_admin();

$input = file_get_contents('php://input');
$data = json_decode($input, true);
$keepConfigs = isset($data['keep_configs']) ? (bool)$data['keep_configs'] : true;

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'CCRM is not installed yet.']);
    exit;
}

require_once $configFile;

try {
    $pdo = get_db_connection();
    $result = demo_leave_demo_mode($pdo, $keepConfigs);

    $response = ["success" => true, "message" => "Demo data successfully wiped out."];
    if ($result['adminPassword'] !== null) {
        $response["admin_email"] = $result['adminEmail'];
        $response["admin_password"] = $result['adminPassword'];
        $response["message"] = "Demo data wiped. A new admin was created — save this password now, it will not be shown again.";
    }
    echo json_encode($response);
} catch (\Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if (function_exists('ccrm_log_exception')) {
        ccrm_log_exception($e);
    }
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to wipe demo data."]);
}
