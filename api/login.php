<?php
/**
 * Server-side credential verification. Replaces the previous client-side
 * password comparison (which required broadcasting every user's password to
 * the browser). On success it establishes a session and returns the user
 * profile WITHOUT any password material.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$data     = json_decode(file_get_contents('php://input'), true) ?: [];
$email    = trim((string)($data['email'] ?? ''));
$password = (string)($data['password'] ?? '');
$remember = !empty($data['remember']);

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email and password are required.']);
    exit;
}

// --- Login rate limiting ---------------------------------------------------
// Throttle repeated failures per client IP to blunt online password guessing.
// Deliberately fail-open: any error in the throttle path must never block a
// legitimate login.
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
// Failures allowed per IP in the 15-minute window before the throttle answers
// 429. The login screen warns when few are left, so the number lives here once.
if (!defined('CCRM_LOGIN_MAX_ATTEMPTS')) {
    define('CCRM_LOGIN_MAX_ATTEMPTS', 20);
}
$recentFailures = 0;
$recordLoginFailure = function (string $reason = 'bad password') use ($pdo, $clientIp, $email) {
    try {
        $pdo->prepare("INSERT INTO `login_attempts` (`ip`, `email`) VALUES (?, ?)")->execute([$clientIp, $email]);
    } catch (\Throwable $e) { /* ignore */ }
    // Forensic trail (VULN-24). The attempted address is recorded, never the password.
    ccrm_audit_log($pdo, ['id' => null, 'email' => mb_substr($email, 0, 255)], 'auth.login_failed', $reason);
};
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `login_attempts` (
        `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
        `ip` VARCHAR(45) NULL,
        `email` VARCHAR(255) NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX `idx_ip_time` (`ip`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    // Prune rows older than the throttle window. Nothing ever deleted these
    // except a successful login from the same IP, so on an instance that gets
    // scanned the table grew without bound and made the COUNT below slower over
    // time. Runs occasionally rather than on every attempt.
    if (random_int(1, 20) === 1) {
        $pdo->exec("DELETE FROM `login_attempts` WHERE `created_at` < (NOW() - INTERVAL 1 DAY)");
    }
    $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM `login_attempts` WHERE `ip` = ? AND `created_at` > (NOW() - INTERVAL 15 MINUTE)");
    $cntStmt->execute([$clientIp]);
    $recentFailures = (int)$cntStmt->fetchColumn();
    if ($recentFailures >= CCRM_LOGIN_MAX_ATTEMPTS) {
        // Log the lockout once per window and address, not once per blocked request.
        try {
            $seen = $pdo->prepare("SELECT 1 FROM `audit_log` WHERE `action` = 'auth.lockout' AND `ip` = ? AND `created_at` > (NOW() - INTERVAL 15 MINUTE) LIMIT 1");
            $seen->execute([$clientIp]);
            if (!$seen->fetchColumn()) {
                ccrm_audit_log($pdo, ['id' => null, 'email' => mb_substr($email, 0, 255)], 'auth.lockout', 'Too many failed logins from this address');
            }
        } catch (\Throwable $e) { /* never block the response on the audit trail */ }
        http_response_code(429);
        echo json_encode([
            'success' => false,
            'locked' => true,
            'lock_minutes' => 15,
            'message' => 'Too many login attempts. Please wait a few minutes and try again.',
        ]);
        exit;
    }
} catch (\Throwable $e) {
    // fail open — never lock users out because of a throttle-store error
}

$stmt = $pdo->prepare("SELECT * FROM `users` WHERE `email` = ? LIMIT 1");
$stmt->execute([$email]);
$row = $stmt->fetch();

// The message never says which half was wrong. attempts_remaining counts this
// failure too; the login screen only mentions it once few are left.
$genericError = [
    'success' => false,
    'message' => 'Invalid email or password.',
    'attempts_remaining' => max(0, CCRM_LOGIN_MAX_ATTEMPTS - $recentFailures - 1),
    'lock_minutes' => 15,
];

if (!$row) {
    // Constant-ish work factor to blunt user-enumeration timing.
    password_verify($password, '$2y$10$usesomesillystringforsalt0000000000000000000000000000');
    $recordLoginFailure('unknown account');
    http_response_code(401);
    echo json_encode($genericError);
    exit;
}

$stored = (string)$row['password_hash'];
$ok = false;

if (ccrm_is_hash($stored)) {
    $ok = password_verify($password, $stored);
} else {
    // Legacy rows created before hashing: compare plain text, then upgrade.
    $ok = hash_equals($stored, $password);
    if ($ok) {
        $upd = $pdo->prepare("UPDATE `users` SET `password_hash` = ? WHERE `id` = ?");
        $upd->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
    }
}

if (!$ok) {
    $recordLoginFailure();
    http_response_code(401);
    echo json_encode($genericError);
    exit;
}

// Successful login — clear this IP's recent failures.
try {
    $pdo->prepare("DELETE FROM `login_attempts` WHERE `ip` = ?")->execute([$clientIp]);
} catch (\Throwable $e) { /* ignore */ }

$profile = ccrm_establish_login_session($pdo, $row, $remember);
ccrm_audit_log($pdo, ['id' => $row['id'], 'email' => $row['email']], 'auth.login_success', $remember ? 'remember me' : null);

echo json_encode([
    'success' => true,
    'user' => $profile,
]);
