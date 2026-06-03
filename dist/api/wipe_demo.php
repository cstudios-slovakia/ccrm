<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);
$keepConfigs = isset($data['keep_configs']) ? (bool)$data['keep_configs'] : true;

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Laminam CRM is not installed yet.']);
    exit;
}

require_once $configFile;

try {
    $pdo = get_db_connection();
    $pdo->beginTransaction();

    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
    
    // Truncate transactional tables
    $pdo->exec("TRUNCATE TABLE `timeline_events`;");
    $pdo->exec("TRUNCATE TABLE `lead_categories`;");
    $pdo->exec("TRUNCATE TABLE `leads`;");
    $pdo->exec("TRUNCATE TABLE `task_assignees`;");
    $pdo->exec("TRUNCATE TABLE `tasks`;");

    // Wipe customizable lists if "Keep Configs" was false
    if (!$keepConfigs) {
        $pdo->exec("TRUNCATE TABLE `users`;");
        $pdo->exec("TRUNCATE TABLE `system_settings`;");
        
        // Seed default Admin in system settings/users
        $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $insUser->execute(['admin-1', 'Admin', 'admin@crm.com', 'password', 'admin', null, '#f43f5e']);

        $settings = [
            'DEMO_MODE' => 'false',
            'SYSTEM_NAME' => 'Laminam CRM',
            'SYSTEM_LANGUAGE' => 'sk',
            'LEAD_STATES' => json_encode(["new", "contacted", "offer sent", "accepted", "rejected"]),
            'LEAD_SOURCES' => json_encode(["showroom", "facebook", "instagram", "website"]),
            'LEAD_CATEGORIES' => json_encode(["Kitchen Countertops", "Flooring Tiles", "Bathroom Renovation", "Granite Slabs", "Plumbing Services", "Custom Masonry"]),
            'LEAD_STATE_COLORS' => json_encode(["new" => "#3b82f6", "contacted" => "#0ea5e9", "offer sent" => "#6366f1", "accepted" => "#10b981", "rejected" => "#ef4444"]),
            'LEAD_SOURCE_COLORS' => json_encode(["showroom" => "#10b981", "facebook" => "#3b82f6", "instagram" => "#ec4899", "website" => "#8b5cf6"]),
            'LEAD_CATEGORY_COLORS' => json_encode(["Kitchen Countertops" => "#f59e0b", "Flooring Tiles" => "#10b981", "Bathroom Renovation" => "#3b82f6", "Granite Slabs" => "#6366f1", "Plumbing Services" => "#0ea5e9", "Custom Masonry" => "#ec4899"]),
            'LEAD_STAGE_GROUPS' => json_encode(["new" => "new", "contacted" => "in_progress", "offer sent" => "in_progress", "accepted" => "closed", "rejected" => "closed"]),
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
        
        // Remove only the non-Erik managers if keeping configs (optional, keep Tomi & Roli but prompt)
        // Here we just toggle DEMO_MODE to false and clean transactional data
    }
    
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
    $pdo->commit();
    
    echo json_encode(["success" => true, "message" => "Demo data successfully wiped out."]);
} catch (\Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
