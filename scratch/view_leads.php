<?php
require_once __DIR__ . '/../public/config.php';
try {
    $pdo = get_db_connection();
    $stmt = $pdo->query("SELECT id, name, email FROM leads");
    $leads = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($leads, JSON_PRETTY_PRINT) . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
