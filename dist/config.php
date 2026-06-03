<?php
// Database credentials file
// Automatically created by the Laminam CRM Installation Wizard

define('DB_HOST', 'db.r5.websupport.sk');
define('DB_PORT', '3306');
define('DB_NAME', 'Dg1SeyNV');
define('DB_USER', 'JQLZ4I98');
define('DB_PASS', '[2.^~8L])EdPgu|Fc1*}');

try {
    $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
} catch (\PDOException $e) {
    // If the database connection fails, sync.php can catch it
    $pdo = null;
    $db_connection_error = $e->getMessage();
}

/**
 * Returns the active PDO database connection or throws an exception
 */
function get_db_connection() {
    global $pdo, $db_connection_error;
    if ($pdo === null) {
        throw new \Exception("Database connection failed: " . ($db_connection_error ?? "Unknown error"));
    }
    return $pdo;
}
