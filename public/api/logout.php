<?php
/** Destroys the current CCRM session. */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

ccrm_start_session();
if (!empty($_SESSION['ccrm_uid'])) {
    $logoutPdo = ccrm_auth_pdo();
    if ($logoutPdo !== null) {
        ccrm_audit_log($logoutPdo, ['id' => $_SESSION['ccrm_uid'], 'email' => $_SESSION['ccrm_email'] ?? null], 'auth.logout');
    }
}
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
// Drop the "remember me" marker cookie too.
setcookie('CCRM_REMEMBER', '', time() - 42000, '/');
session_destroy();

echo json_encode(['success' => true]);
