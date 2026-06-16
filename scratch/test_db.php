<?php
require_once __DIR__ . '/../public/config.php';
try {
    $pdo = get_db_connection();
    $stmt = $pdo->query("SELECT * FROM `timeline_events` ORDER BY `timestamp` DESC LIMIT 15");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($rows, JSON_PRETTY_PRINT) . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
