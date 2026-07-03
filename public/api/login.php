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

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email and password are required.']);
    exit;
}

$stmt = $pdo->prepare("SELECT * FROM `users` WHERE `email` = ? LIMIT 1");
$stmt->execute([$email]);
$row = $stmt->fetch();

$genericError = ['success' => false, 'message' => 'Invalid email or password.'];

if (!$row) {
    // Constant-ish work factor to blunt user-enumeration timing.
    password_verify($password, '$2y$10$usesomesillystringforsalt0000000000000000000000000000');
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
    http_response_code(401);
    echo json_encode($genericError);
    exit;
}

// Establish the authenticated session.
ccrm_start_session();
session_regenerate_id(true);
$_SESSION['ccrm_uid']   = $row['id'];
$_SESSION['ccrm_role']  = $row['role'];
$_SESSION['ccrm_email'] = $row['email'];

echo json_encode([
    'success' => true,
    'user' => [
        'name'          => $row['name'],
        'email'         => $row['email'],
        'role'          => ccrm_role_label($row['role']),
        'color'         => $row['color'] ?? '#3b82f6',
        'avatar'        => $row['avatar'] ?? null,
        'activityLog'   => [],
        // Secrets stay server-side: mask the mailbox password like the sync GET.
        'metadata_json' => ccrm_mask_user_metadata($row['metadata_json']),
    ],
]);
