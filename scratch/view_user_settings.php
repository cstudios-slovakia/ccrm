<?php
require_once __DIR__ . '/../public/config.php';
try {
    $pdo = get_db_connection();
    $stmt = $pdo->query("SELECT email, metadata_json FROM users");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($users as $u) {
        echo "User: " . $u['email'] . "\n";
        $meta = json_decode($u['metadata_json'], true);
        if (isset($meta['emailSettings'])) {
            echo "Email Settings: " . json_encode($meta['emailSettings'], JSON_PRETTY_PRINT) . "\n";
        } else {
            echo "No Email Settings configured.\n";
        }
        echo "-------------------\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
