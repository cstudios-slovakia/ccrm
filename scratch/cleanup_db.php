<?php
require_once __DIR__ . '/../public/config.php';
try {
    $pdo = get_db_connection();
    $affected = $pdo->exec("DELETE FROM `timeline_events` WHERE `id` IN ('email-1', 'email-2')");
    echo "Successfully deleted $affected old conflicting email timeline entries.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
