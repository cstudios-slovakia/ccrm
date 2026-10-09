<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/demo_seed/helpers.php';

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

$generatedAdminPassword = null;
try {
    $pdo = get_db_connection();
    $pdo->beginTransaction();

    // NOTE: DELETE (not TRUNCATE) so the statements are transactional — TRUNCATE
    // implicitly commits in MySQL, which would make the rollback below a no-op and
    // could leave the database half-wiped on a mid-way failure.
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");

    // Clear transactional tables
    $pdo->exec("DELETE FROM `timeline_events`;");
    $pdo->exec("DELETE FROM `lead_categories`;");
    $pdo->exec("DELETE FROM `leads`;");
    $pdo->exec("DELETE FROM `task_assignees`;");
    $pdo->exec("DELETE FROM `tasks`;");
    $pdo->exec("DELETE FROM `financial_records`;");

    // Everything the modular demo seeders wrote (api/demo_seed/) carries an id
    // with the 'demo-' prefix. Match it on every string `id` column; join
    // tables without an `id` are matched on their `*_id` columns instead, and
    // the mail caches on `email_uid` (the demo mailbox uses 'demo-mail-<n>').
    // The per-type project tables of a demo project type are dropped after the
    // commit (DROP is DDL); their rows go with the prefix delete below.
    $demoProjectTypeIds = [];
    if ($pdo->query("SHOW TABLES LIKE 'project_types'")->rowCount() > 0) {
        $demoProjectTypeIds = $pdo->query("SELECT `id` FROM `project_types` WHERE `id` LIKE 'demo-%'")->fetchAll(PDO::FETCH_COLUMN);
    }
    // The sample staff (ccrm_seed_default_employees) predates the 'demo-' id scheme:
    // employees emp-1..emp-4, their salaries 'sal-emp-*' and leave 'vac-demo-*'.
    // Remove exactly those, plus the expense records sync auto-created for the
    // salaries ('fr-sal-sal-emp-*'). Employees added by hand are left alone.
    $tableExists = static fn(string $t): bool => $pdo->query("SHOW TABLES LIKE " . $pdo->quote($t))->rowCount() > 0;
    if ($tableExists('financial_records')) {
        $pdo->exec("DELETE FROM `financial_records` WHERE `id` LIKE 'fr-sal-sal-emp-%'");
    }
    if ($tableExists('employee_salaries')) {
        $pdo->exec("DELETE FROM `employee_salaries` WHERE `id` LIKE 'sal-emp-%' OR `employee_id` IN ('emp-1', 'emp-2', 'emp-3', 'emp-4')");
    }
    if ($tableExists('employee_vacations')) {
        $pdo->exec("DELETE FROM `employee_vacations` WHERE `id` LIKE 'vac-demo-%' OR `employee_id` IN ('emp-1', 'emp-2', 'emp-3', 'emp-4')");
    }
    if ($tableExists('employees')) {
        $pdo->exec("DELETE FROM `employees` WHERE `id` IN ('emp-1', 'emp-2', 'emp-3', 'emp-4')");
    }

    // Any remaining salary row must not keep pointing at the demo expense
    // records deleted below.
    $pdo->exec("UPDATE `employee_salaries` SET `financial_record_id` = NULL WHERE `financial_record_id` LIKE 'demo-%'");
    demo_wipe_by_prefix($pdo, ['demo-']);

    // Wipe customizable lists if "Keep Configs" was false
    if (!$keepConfigs) {
        $pdo->exec("DELETE FROM `financial_categories`;");
        if ($pdo->query("SHOW TABLES LIKE 'client_categories'")->rowCount() > 0) {
            $pdo->exec("DELETE FROM `client_categories`;");
        }
        // Preserve the language the CRM was installed in BEFORE dropping the
        // settings, so the reset re-seeds the pipeline labels in that language
        // (mirrors setup.php) instead of forcing English/Slovak defaults.
        $systemLanguage = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
        if (!in_array($systemLanguage, ['en', 'sk', 'hu'], true)) {
            $systemLanguage = 'sk';
        }

        $pdo->exec("DELETE FROM `users`;");
        $pdo->exec("DELETE FROM `system_settings`;");

        // Seed default Admin with a RANDOM password (never a known default like
        // "password"). It is returned once below so the operator can log in.
        $adminEmail = 'admin@crm.com';
        $generatedAdminPassword = bin2hex(random_bytes(6));
        $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $insUser->execute(['u-' . md5($adminEmail), 'Admin', $adminEmail, password_hash($generatedAdminPassword, PASSWORD_DEFAULT), 'admin', null, '#f43f5e']);

        // Pipeline labels, categories and task states are persisted values, so
        // seed them in the language chosen (shared with the setup wizard).
        $settings = array_merge(
            ['DEMO_MODE' => 'false'],
            ccrm_default_settings_for_language($systemLanguage)
        );

        $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }
        // No finance categories: those are demo data, and this is leaving demo mode.
    } else {
        // Keep custom configurations, but toggle DEMO_MODE setting to false
        $stmt = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('DEMO_MODE', 'false') ON DUPLICATE KEY UPDATE `value` = 'false'");
        $stmt->execute();
        
        // Remove only the non-admin managers if keeping configs (optional, keep other demo PMs but prompt)
        // Here we just toggle DEMO_MODE to false and clean transactional data
    }
    
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
    $pdo->commit();

    // DROP TABLE commits implicitly in MySQL, so these run after the commit.
    // Per-type project tables (proj_data_/proj_timeline_/proj_gantt_<typeid>) of
    // the demo project type; same id -> suffix rule as sync.php.
    foreach ($demoProjectTypeIds as $typeId) {
        $safe = preg_replace('/[^a-z0-9_]/', '', strtolower((string)$typeId));
        if ($safe === '') continue;
        $pdo->exec("DROP TABLE IF EXISTS `proj_data_{$safe}`, `proj_timeline_{$safe}`, `proj_gantt_{$safe}`");
    }
    // SAI simulations live in per-simulation `sim<id>_*` tables; leaving demo
    // mode removes them all, together with the demo mailbox store.
    if ($pdo->query("SHOW TABLES LIKE 'swarm_simulations'")->rowCount() > 0) {
        $prefixes = $pdo->query("SELECT `table_prefix` FROM `swarm_simulations`")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($prefixes as $prefix) {
            $prefix = preg_replace('/[^a-zA-Z0-9_]/', '', (string)$prefix);
            if ($prefix === '') continue;
            $pdo->exec("DROP TABLE IF EXISTS `{$prefix}nodes`, `{$prefix}edges`, `{$prefix}agents`, `{$prefix}posts`");
        }
        $pdo->exec("DELETE FROM `swarm_simulations`");
    }
    require_once __DIR__ . '/demo_mailbox.php';
    ccrm_demo_mailbox_wipe($pdo);

    $response = ["success" => true, "message" => "Demo data successfully wiped out."];
    if ($generatedAdminPassword !== null) {
        $response["admin_email"] = 'admin@crm.com';
        $response["admin_password"] = $generatedAdminPassword;
        $response["message"] = "Demo data wiped. A new admin was created — save this password now, it will not be shown again.";
    }
    echo json_encode($response);
} catch (\Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if (function_exists('ccrm_log_exception')) {
        ccrm_log_exception($e);
    }
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to wipe demo data."]);
}
