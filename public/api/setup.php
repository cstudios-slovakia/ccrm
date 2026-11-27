<?php
/**
 * Installation wizard endpoint.
 *
 * Hardening vs. the original:
 *  - Same-origin only (no wildcard CORS).
 *  - Refuses to run once the CRM is already installed, so it can no longer be
 *    used by an anonymous caller to overwrite config.php / re-provision the DB.
 *  - `type: "test_only"` ONLY tests the connection — it never writes config.php
 *    or seeds data.
 *  - All seeded/admin passwords are stored as bcrypt hashes.
 *  - Schema comes from the shared schema.php (single source of truth).
 */
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

$host        = trim((string)($data['host'] ?? ''));
$port        = trim((string)($data['port'] ?? '3306'));
$dbname      = trim((string)($data['dbname'] ?? ''));
$user        = trim((string)($data['user'] ?? ''));
$pass        = (string)($data['pass'] ?? '');
$installType = $data['type'] ?? 'fresh'; // 'fresh' | 'demo' | 'test_only'
$systemLanguage = $data['systemLanguage'] ?? 'sk';
if (!in_array($systemLanguage, ['en', 'sk', 'hu'], true)) { $systemLanguage = 'sk'; }
// Demo data language. For a demo install it IS the system language (the
// installer UI language is then only the UI language). Fresh installs keep the
// UI language as system language, as before.
$demoLanguage = $data['demoLanguage'] ?? $systemLanguage;
if (!in_array($demoLanguage, ['en', 'sk', 'hu'], true)) { $demoLanguage = $systemLanguage; }
if ($installType === 'demo') { $systemLanguage = $demoLanguage; }
// Currency: validated against the same list the app offers (currency.ts).
$supportedCurrencies = ['EUR', 'HUF', 'CZK', 'PLN', 'USD', 'GBP'];
$systemCurrency = strtoupper(trim((string)($data['currency'] ?? '')));
if (!in_array($systemCurrency, $supportedCurrencies, true)) {
    $systemCurrency = ['hu' => 'HUF', 'en' => 'USD'][$systemLanguage] ?? 'EUR';
}

if (empty($host) || empty($dbname) || empty($user)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required connection specifications']);
    exit;
}

// Once installed, the wizard is closed. Reconfiguration must be done by editing
// config.php on the server — an anonymous request can no longer overwrite it.
//
// `test_only` was exempt from this, which left an unauthenticated endpoint on
// every installed instance that opens a MySQL connection to any host:port the
// caller names — a network probe into whatever the server can reach, and an
// oracle for guessing database credentials. It is still allowed before install
// (the wizard needs it) and for admins afterwards.
// config.php can live in the app root or in public/ (auth.php, mcp.php and `ccrm`
// all look in both), so an install found in EITHER place counts as installed —
// otherwise an instance whose config sits in the other directory looks fresh to
// this wizard, which then drops its tables (VULN-25).
$isInstalled = (file_exists($configFile) && @filesize($configFile) > 100)
    || (file_exists(dirname(__DIR__) . '/public/config.php') && @filesize(dirname(__DIR__) . '/public/config.php') > 100);
if ($isInstalled) {
    if ($installType !== 'test_only') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => (KOPERNIQ_PRODUCT_NAME . ' is already installed. Setup is disabled.')]);
        exit;
    }
    require_once $configFile;
    ccrm_require_admin();
}

// 1. Attempt connection test via PDO
try {
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    error_log('[ccrm setup] DB connection failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed. Check the host, database name and credentials.']);
    exit;
}

// A connection test stops here without touching the filesystem or the database.
if ($installType === 'test_only') {
    echo json_encode(['success' => true, 'message' => 'Connection OK']);
    exit;
}

// 2. Prepare credentials for config.php (will be written upon successful migration and seeding)
$configContent = ("<?php
// Database credentials file
// Automatically created by the " . KOPERNIQ_PRODUCT_NAME . " Installation Wizard

date_default_timezone_set('Europe/Bratislava');

define('DB_HOST', ") . var_export($host, true) . ");
define('DB_PORT', " . var_export($port, true) . ");
define('DB_NAME', " . var_export($dbname, true) . ");
define('DB_USER', " . var_export($user, true) . ");
define('DB_PASS', " . var_export($pass, true) . ");

// Symmetric key for encrypting integration/mailbox secrets at rest.
// Generated once at install; keep it secret and out of the database.
define('CCRM_SECRET_KEY', " . var_export(bin2hex(random_bytes(32)), true) . ");

try {
    \$dsn = \"mysql:host=\" . DB_HOST . \";port=\" . DB_PORT . \";dbname=\" . DB_NAME . \";charset=utf8mb4\";
    \$options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    \$pdo = new PDO(\$dsn, DB_USER, DB_PASS, \$options);
} catch (\\PDOException \$e) {
    \$pdo = null;
    \$db_connection_error = \$e->getMessage();
}

function get_db_connection() {
    global \$pdo, \$db_connection_error;
    if (\$pdo === null) {
        throw new \\Exception(\"Database connection failed: \" . (\$db_connection_error ?? \"Unknown error\"));
    }
    return \$pdo;
}
";


// 2b. Pre-flight checks. Everything below drops and re-creates core tables, so
// anything that can make the install fail LATER must be settled BEFORE the first
// DROP: the old order wiped the database and only then discovered, 300 lines on,
// that config.php could not be written, leaving a destroyed database and a wizard
// that was still open (VULN-25).
//  - config.php must be writable (the file itself, or its directory when new).
if (file_exists($configFile) ? !is_writable($configFile) : !is_writable(dirname($configFile))) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'The server cannot write config.php. Fix the directory permissions, then run the setup again. Nothing has been changed.']);
    exit;
}
//  - one setup at a time: two concurrent requests would drop each other's tables.
$setupLock = @fopen(sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ccrm-setup-' . md5(__DIR__) . '.lock', 'c');
if ($setupLock === false || !flock($setupLock, LOCK_EX | LOCK_NB)) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'Another setup is already running. Wait for it to finish.']);
    exit;
}
//  - never wipe a database that already holds CRM users, unless the operator has
//    deliberately created an ALLOW_SETUP_RESET file in the application folder.
$targetHasUsers = false;
try {
    $targetHasUsers = (int)$pdo->query("SELECT COUNT(*) FROM `users`")->fetchColumn() > 0;
} catch (\Throwable $e) {
    // no users table yet: a fresh database
}
if ($targetHasUsers && !file_exists(dirname($configFile) . '/ALLOW_SETUP_RESET')) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => ('This database already contains ' . KOPERNIQ_PRODUCT_NAME . ' users, so the setup will not overwrite it. To reinstall on purpose, create an empty file named ALLOW_SETUP_RESET in the application folder and run the setup again (delete it afterwards).')]);
    exit;
}

// 3. Apply schema (single source of truth) and seed.
try {
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
    $tables = ['meeting_tasks', 'meeting_notes', 'plugins', 'system_settings', 'task_assignees', 'tasks', 'timeline_events', 'lead_categories', 'leads', 'role_permissions', 'permissions', 'users'];
    foreach ($tables as $table) {
        $pdo->exec("DROP TABLE IF EXISTS `$table` CASCADE");
    }
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");

    ccrm_apply_schema($pdo);
} catch (\Exception $e) {
    error_log('[ccrm setup] Schema migration failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Schema migration failed.']);
    exit;
}

try {
    $pdo->beginTransaction();

    // Seed Permissions slugs
    $permissionsSlugs = [
        ['leads.view', 'View leads and pipeline data'],
        ['leads.create', 'Create new leads'],
        ['leads.edit', 'Modify existing leads details'],
        ['tasks.view', 'Inspect tasks board'],
        ['tasks.create', 'Create new checklist tasks'],
        ['tasks.edit', 'Modify tasks assignees and statuses'],
        ['tasks.delete', 'Permanently delete task records'],
        ['tasks.view_all', 'See the whole team workload in Global Tasks (on unless revoked)'],
        ['timeline.log', 'Log custom timeline phone calls, emails, and notes'],
        ['calendar.view', 'Access appointment calendar slots'],
        ['calendar.create', 'Create bookings'],
        ['calendar.edit', 'Adjust calendar configurations'],
        ['time_records.log', 'Log work stopwatch sessions'],
        ['hr.view', 'View employee records list'],
        ['files.view', 'Browse files database'],
        ['files.create', 'Upload contract proposals'],
        ['general_config', 'Configure system name and languages'],
        ['pm_managers', 'Manage PM manager users directories'],
        ['pipeline_stages', 'Rearrange Kanban pipelines stages'],
        ['traffic_sources', 'Manage lead marketing sources and color badges'],
        ['ai_config', 'Configure OpenAI API credentials and settings'],
        ['system_reset', 'Truncate database or restore mock seeders'],
        ['nav_edit', 'Configure navigation sidebar layouts and visibility'],
    ];

    $checkPerm = $pdo->query("SELECT COUNT(*) FROM `permissions`")->fetchColumn();
    if ($checkPerm == 0) {
        $insPerm = $pdo->prepare("INSERT INTO `permissions` (`slug`, `description`) VALUES (?, ?)");
        foreach ($permissionsSlugs as $p) {
            $insPerm->execute($p);
        }
    }

    // Pipeline stages, lead categories and task states are persisted values: they are
    // written in the language chosen (see ccrm_default_settings_for_language in schema.php).
    $baseSettings = ccrm_default_settings_for_language($systemLanguage);
    // Written for both install types, before any seeding reads it.
    $baseSettings['SYSTEM_CURRENCY'] = $systemCurrency;

    $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");

    // User ids use the same deterministic scheme as sync.php so that later
    // syncs from the client update (rather than duplicate or orphan) these rows.
    $userId = static function (string $email): string {
        return 'u-' . md5(strtolower(trim($email)));
    };

    $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `role`=VALUES(`role`)");

    if ($installType === 'demo') {
        $settings = array_merge($baseSettings, ['DEMO_MODE' => 'true']);
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }
        // Everything else a demo install contains (the three logins of the edition, the
        // company profile, and every module's rows) is written by demo_seed_all() below,
        // after the commit. Nothing is seeded here.
    } else {
        // Fresh setup: a single administrator account with operator-supplied
        // credentials (falls back to a sensible default only if none provided).
        $settings = array_merge($baseSettings, ['DEMO_MODE' => 'false']);
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }

        $adminName  = trim((string)($data['adminName'] ?? '')) ?: 'Admin';
        $adminEmail = trim((string)($data['adminEmail'] ?? '')) ?: 'admin@crm.com';
        $adminPass  = (string)($data['adminPassword'] ?? '');
        $generatedPassword = null;
        if ($adminPass === '') {
            // No password supplied: generate a random one and return it once so
            // the operator is never left without a way in.
            $adminPass = bin2hex(random_bytes(6));
            $generatedPassword = $adminPass;
        }

        $insUser->execute([
            $userId($adminEmail),
            $adminName,
            $adminEmail,
            password_hash($adminPass, PASSWORD_DEFAULT),
            'admin',
            null,
            '#f43f5e',
        ]);
    }

    $pdo->commit();

    // The demo dataset (api/demo_seed/) is the ONLY demo seeding: settings above, rows
    // here. It runs after the commit because some modules create tables, and DDL would
    // implicitly commit the transaction. Each module logs its own failure and the others
    // still run, but without the `company` module there is no login at all, so that one is
    // retried once and then fails the install (config.php is not written yet, so the wizard
    // can simply be run again).
    if ($installType === 'demo') {
        require_once __DIR__ . '/demo_seed/index.php';
        $demoReport = demo_seed_all($pdo);
        if (empty($demoReport['company']['ok'])) {
            $demoRetry = demo_seed_all($pdo, ['only' => ['company'], 'writeDataset' => false]);
            if (empty($demoRetry['company']['ok'])) {
                error_log('[ccrm setup] demo company module failed: ' . (string)($demoRetry['company']['error'] ?? 'unknown'));
                throw new \RuntimeException('The demo data could not be created (the demo logins are missing). See the server log.');
            }
        }
    }

    if (file_put_contents($configFile, $configContent) === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to write config.php file. Check directory permissions.']);
        exit;
    }

    $response = ['success' => true, 'message' => (KOPERNIQ_PRODUCT_NAME . ' successfully provisioned!')];
    if (!empty($generatedPassword)) {
        $response['adminEmail'] = $adminEmail;
        $response['generatedPassword'] = $generatedPassword;
        $response['message'] = (KOPERNIQ_PRODUCT_NAME . ' provisioned. Save these admin credentials now — they will not be shown again.');
    }
    echo json_encode($response);
} catch (\Exception $e) {
    $errorMsg = $e->getMessage();
    try {
        if (isset($pdo) && $pdo && $pdo->inTransaction()) {
            @$pdo->rollBack();
        }
    } catch (\Exception $rollbackEx) {
        // Ignore rollback failure to preserve original exception
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Migrations or seeding failed: ' . $errorMsg]);
}
