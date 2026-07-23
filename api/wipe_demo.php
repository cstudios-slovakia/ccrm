<?php
require_once __DIR__ . '/auth.php';

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

    // Wipe customizable lists if "Keep Configs" was false
    if (!$keepConfigs) {
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

        // Pipeline labels are persisted values, so seed them in the language chosen.
        $pipelineStagesByLanguage = [
            'en' => ['new', 'contacted', 'offer sent', 'accepted', 'rejected'],
            'sk' => ['nový', 'kontaktovaný', 'ponuka odoslaná', 'prijatý', 'zamietnutý'],
            'hu' => ['új', 'kapcsolatfelvétel', 'ajánlat elküldve', 'elfogadva', 'elutasítva'],
        ];
        $leadStates = $pipelineStagesByLanguage[$systemLanguage];
        $leadStageGroups = array_combine($leadStates, ['new', 'in_progress', 'in_progress', 'closed', 'closed']);
        $leadStateColors = array_combine($leadStates, ['#3b82f6', '#0ea5e9', '#6366f1', '#10b981', '#ef4444']);

        $settings = [
            'DEMO_MODE' => 'false',
            'SYSTEM_NAME' => 'CCRM',
            'SYSTEM_LANGUAGE' => $systemLanguage,
            'LEAD_STATES' => json_encode($leadStates),
            'LEAD_SOURCES' => json_encode(["showroom", "facebook", "instagram", "website"]),
            'LEAD_CATEGORIES' => json_encode(["Kitchen Countertops", "Flooring Tiles", "Bathroom Renovation", "Granite Slabs", "Plumbing Services", "Custom Masonry"]),
            'LEAD_STATE_COLORS' => json_encode($leadStateColors),
            'LEAD_SOURCE_COLORS' => json_encode(["showroom" => "#10b981", "facebook" => "#3b82f6", "instagram" => "#ec4899", "website" => "#8b5cf6"]),
            'LEAD_CATEGORY_COLORS' => json_encode(["Kitchen Countertops" => "#f59e0b", "Flooring Tiles" => "#10b981", "Bathroom Renovation" => "#3b82f6", "Granite Slabs" => "#6366f1", "Plumbing Services" => "#0ea5e9", "Custom Masonry" => "#ec4899"]),
            'LEAD_STAGE_GROUPS' => json_encode($leadStageGroups),
            'LEAD_STATE_PARENTS' => json_encode((object)[])
        ];

        $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }
    } else {
        // Keep custom configurations, but toggle DEMO_MODE setting to false
        $stmt = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('DEMO_MODE', 'false') ON DUPLICATE KEY UPDATE `value` = 'false'");
        $stmt->execute();
        
        // Remove only the non-admin managers if keeping configs (optional, keep other demo PMs but prompt)
        // Here we just toggle DEMO_MODE to false and clean transactional data
    }
    
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
    $pdo->commit();

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
