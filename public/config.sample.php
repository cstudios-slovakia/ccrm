<?php
/**
 * SAMPLE database configuration.
 *
 * Do NOT put real credentials here and do NOT commit a real config.php — the
 * actual config.php is generated in the web root by the installation wizard
 * (api/setup.php) on first run and is git-ignored. This sample only documents
 * the expected shape for manual setups / disaster recovery.
 *
 * To configure manually: copy this file to `config.php` (next to sync.php) and
 * fill in your own values.
 */

date_default_timezone_set('Europe/Bratislava');

define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');

// Optional: the address users open the CRM at, e.g. 'https://crm.example.sk/'.
// Links in e-mails (password reset, task reminders) use it. Without it they use
// the address of the most recent successful sign-in.
// define('CCRM_APP_URL', 'https://crm.example.sk/');

try {
    $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
} catch (\PDOException $e) {
    $pdo = null;
    $db_connection_error = $e->getMessage();
}

function get_db_connection() {
    global $pdo, $db_connection_error;
    if ($pdo === null) {
        throw new \Exception("Database connection failed: " . ($db_connection_error ?? "Unknown error"));
    }
    return $pdo;
}
