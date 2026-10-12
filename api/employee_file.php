<?php
/**
 * Streams a private employee document.
 *
 *   GET api/employee_file.php?employee=<employee id>&file=<file id>[&download=1]
 *
 * Allowed for:
 *   - `employees` >= view AND `employees.files` (HR), for any employee; or
 *   - the employee record linked to the caller's own login AND `self.files`.
 *
 * The document is looked up by its id inside the employee's own `files_json`. A path
 * or storage key is never accepted from the request, so there is nothing to traverse.
 * Failures are stable codes, never sentences.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/employee_files.php';

ccrm_send_cors('GET, OPTIONS');

function ccrm_employee_file_fail(int $status, string $code): void {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['success' => false, 'code' => $code]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    ccrm_employee_file_fail(405, 'method_not_allowed');
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_employee_file_fail(503, 'not_installed');
}
require_once $configFile;
try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    ccrm_employee_file_fail(503, 'database_unavailable');
}

$employeeId = (string)($_GET['employee'] ?? '');
$fileId = (string)($_GET['file'] ?? '');
if ($employeeId === '' || $fileId === '' || strlen($employeeId) > 50 || strlen($fileId) > 100) {
    ccrm_employee_file_fail(400, 'bad_request');
}

$scope = ccrm_read_scope($pdo, $sessionUser);
$isHr = ccrm_can($scope, 'employees') && ccrm_can($scope, 'employees.files');
$isOwn = ($scope['linkedEmployeeId'] ?? null) !== null
    && (string)$scope['linkedEmployeeId'] === $employeeId
    && ccrm_can($scope, 'self.files');
// One answer for "no such employee", "no such file" and "not yours", so the
// endpoint cannot be used to probe which ids exist.
if (!$isHr && !$isOwn) {
    ccrm_employee_file_fail(403, 'forbidden');
}

$stmt = $pdo->prepare("SELECT `files_json` FROM `employees` WHERE `id` = ? LIMIT 1");
$stmt->execute([$employeeId]);
$filesJson = $stmt->fetchColumn();
if ($filesJson === false) {
    ccrm_employee_file_fail(404, 'not_found');
}
$files = json_decode((string)$filesJson, true);
$record = null;
if (is_array($files)) {
    foreach ($files as $f) {
        if (is_array($f) && (string)($f['id'] ?? '') === $fileId) {
            $record = $f;
            break;
        }
    }
}
if ($record === null) {
    ccrm_employee_file_fail(404, 'not_found');
}

$key = ccrm_employee_file_key($record);
if ($key === null) {
    // A record that still points at the public uploads directory: the migration has
    // not moved it yet (or its file was missing). Never fall back to serving it.
    ccrm_employee_file_fail(404, 'not_available');
}
$path = ccrm_employee_private_path($key);
if ($path === null) {
    ccrm_employee_file_fail(404, 'not_available');
}

$displayName = ccrm_safe_upload_name((string)($record['name'] ?? '')) ?? ('document.' . pathinfo($key, PATHINFO_EXTENSION));
$contentType = ccrm_employee_file_content_type($key);
$inlineTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
$inline = in_array($contentType, $inlineTypes, true) && empty($_GET['download']);

ccrm_audit_log($pdo, $sessionUser, 'employee.file_view', $employeeId . '/' . $fileId);

header('Content-Type: ' . $contentType);
header('X-Content-Type-Options: nosniff');
header('Content-Security-Policy: default-src \'none\'; sandbox');
header('Cache-Control: private, no-store');
header('Content-Length: ' . (string)filesize($path));
$asciiName = preg_replace('/[^A-Za-z0-9._\- ]+/', '_', $displayName);
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . rawurlencode($displayName));
readfile($path);
exit;
