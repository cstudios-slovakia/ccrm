<?php
/**
 * Streams a private agency candidate / rented-worker document.
 *
 *   GET api/agency_file.php?id=<file id>[&download=1]
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/agency_lib.php';

ccrm_send_cors('GET, OPTIONS');

function ccrm_agency_file_fail(int $status, string $code): void {
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
    ccrm_agency_file_fail(405, 'method_not_allowed');
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_agency_file_fail(503, 'not_installed');
}
require_once $configFile;
try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    ccrm_agency_file_fail(503, 'database_unavailable');
}

$fileId = trim((string)($_GET['id'] ?? $_GET['file'] ?? ''));
if ($fileId === '' || strlen($fileId) > 100) {
    ccrm_agency_file_fail(400, 'bad_request');
}

$scope = ccrm_read_scope($pdo, $sessionUser);
if (!ccrm_can($scope, 'agency')) {
    ccrm_agency_file_fail(403, 'forbidden');
}

$stmt = $pdo->prepare("SELECT * FROM `agency_worker_files` WHERE `id` = ? LIMIT 1");
$stmt->execute([$fileId]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    ccrm_agency_file_fail(404, 'not_found');
}

$sensitiveCategories = ['passport', 'permit', 'id_doc', 'medical'];
if (in_array((string)$row['category'], $sensitiveCategories, true) && !ccrm_can($scope, 'agency.personal')) {
    ccrm_agency_file_fail(403, 'forbidden');
}

$path = ccrm_agency_private_path((string)$row['storage_name']);
if ($path === null) {
    ccrm_agency_file_fail(404, 'not_available');
}

$download = !empty($_GET['download']);
$fileName = str_replace(["\r", "\n", '"'], '', (string)$row['file_name']);
$mime = !empty($row['mime_type']) ? (string)$row['mime_type'] : 'application/octet-stream';
if (!preg_match('/^[a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+$/', $mime)) {
    $mime = 'application/octet-stream';
}

header('Content-Type: ' . $mime);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
header('Content-Length: ' . filesize($path));
$disp = $download ? 'attachment' : 'inline';
header('Content-Disposition: ' . $disp . '; filename="' . $fileName . '"');
readfile($path);
exit;
