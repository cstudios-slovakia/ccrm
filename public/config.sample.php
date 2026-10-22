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
// When this is set, links in e-mails (password reset, task reminders) use it
// and nothing else: not the browser's Host header, and not the APP_BASE_URL
// row in the database. An admin login records that row only when this constant
// is absent AND the database has no value yet (the first sign-in on a new
// install). A value already stored is never replaced.
// define('CCRM_APP_URL', 'https://crm.example.sk/');

// Optional switches. All are OFF by default (the secure setting); turn one on only
// if you need what it allows.
//
// Outbound mail / push / vector-database connections refuse private, loopback and
// link-local addresses (an attacker could otherwise aim them at your internal
// network). Set this if your mail server lives on a private address (e.g. a mail
// server on the LAN, or a Docker service name):
// define('CCRM_ALLOW_PRIVATE_HOSTS', true);
//
// The MCP gateway (api/mcp.php) reads the access key from a request header
// (Authorization: Bearer ..., X-CCRM-MCP-KEY, or X-API-Key with the raw key). A key in the URL (?token=...) is
// written to access logs, so it is refused. Set this only for an old client that
// cannot send headers:
// define('CCRM_MCP_ALLOW_QUERY_TOKEN', true);

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
