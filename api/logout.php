<?php
/** Destroys the current CCRM session. */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

ccrm_start_session();
$logoutPdo = (!empty($_SESSION['ccrm_uid']) || isset($_COOKIE[CCRM_REMEMBER_COOKIE])) ? ccrm_auth_pdo() : null;
if (!empty($_SESSION['ccrm_uid']) && $logoutPdo !== null) {
    ccrm_audit_log($logoutPdo, ['id' => $_SESSION['ccrm_uid'], 'email' => $_SESSION['ccrm_email'] ?? null], 'auth.logout');
}
// Ends the session AND this browser's remembered login (token row + cookie);
// leaving the token would sign the browser straight back in on the next request.
ccrm_destroy_session($logoutPdo);

echo json_encode(['success' => true]);
