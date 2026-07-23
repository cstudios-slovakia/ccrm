<?php
require_once dirname(__DIR__) . '/api/auth.php';
require_once dirname(__DIR__) . '/config.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, DELETE, OPTIONS');

// Error logs can contain sensitive request data — restrict to administrators.
$user = ccrm_require_admin();

try {
    $pdo = get_db_connection();
    
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->query("SELECT * FROM `error_logs` ORDER BY `created_at` DESC LIMIT 100");
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'logs' => $logs]);
        exit;
    }
    
    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $pdo->exec("DELETE FROM `error_logs`");
        echo json_encode(['success' => true, 'message' => 'Error logs cleared successfully.']);
        exit;
    }
    
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error.']);
}
