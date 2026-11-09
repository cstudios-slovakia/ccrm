<?php
/**
 * Newsletter module API (docs/NEWSLETTER.md C4): session auth, never the sync.php blob.
 *
 *   POST /api/newsletter.php   JSON { action, ... }
 *   POST /api/newsletter.php?action=upload_image   multipart/form-data, field `file`
 *
 * Response envelope (the same as time_entries.php):
 *   success  HTTP 200   { success: true, ...payload }
 *   failure  HTTP 4xx   { success: false, code: '<machine code>', message?: '<readable>' }
 *   400 invalid input, 403 permission, 404 unknown id, 409 wrong status, 422 failed validation.
 *
 * Permissions (C14): the `newsletter` access key (view | edit) plus the toggles
 * `newsletter_send` and `newsletter_settings`.
 *
 * Implemented here: every read, write and settings action. The send actions (send_test,
 * start_send, pause, resume, cancel, tick) are added to $routes by the sending package.
 * Audience logic is in newsletter_audience.php, settings / shapes / images in newsletter_lib.php.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/newsletter_audience.php';
require_once __DIR__ . '/newsletter_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

function ccrm_nl_respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload + ['success' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function ccrm_nl_fail(string $code, int $status = 400, string $message = ''): void {
    http_response_code($status);
    $payload = ['success' => false, 'code' => $code];
    if ($message !== '') {
        $payload['message'] = $message;
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

// ---------------------------------------------------------------------------------------
// Actions. Each takes ($ctx, $body); $ctx = pdo, scope, userName.
// ---------------------------------------------------------------------------------------

/** The campaign row, or a 404. Soft-deleted campaigns do not exist. */
function ccrm_nl_row(\PDO $pdo, $id, bool $lock = false): array {
    $id = is_string($id) ? trim($id) : '';
    if ($id === '') {
        ccrm_nl_fail('invalid_input', 400, 'id is required.');
    }
    $stmt = $pdo->prepare("SELECT * FROM `newsletter_campaigns` WHERE `id` = ? AND `deleted_at` IS NULL LIMIT 1" . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([$id]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row) {
        ccrm_nl_fail('not_found', 404);
    }
    return $row;
}

function ccrm_nl_campaign_response(\PDO $pdo, string $id): array {
    $row = ccrm_nl_row($pdo, $id);
    return ['campaign' => ccrm_newsletter_campaign_json($row, ccrm_newsletter_counts($pdo, [$id])[$id])];
}

function ccrm_nl_page(array $body): array {
    $offset = max(0, (int)($body['offset'] ?? 0));
    $limit = (int)($body['limit'] ?? 50);
    return [$offset, max(1, min(200, $limit > 0 ? $limit : 50))];
}

/** Escape LIKE wildcards in user text. */
function ccrm_nl_like(string $q): string {
    return '%' . addcslashes($q, '\\%_') . '%';
}

function ccrm_nl_do_list(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    $rows = $pdo->query("SELECT * FROM `newsletter_campaigns` WHERE `deleted_at` IS NULL ORDER BY `updated_at` DESC, `id` DESC LIMIT 500")->fetchAll(\PDO::FETCH_ASSOC);
    $ids = [];
    foreach ($rows as $r) {
        if ($r['status'] !== 'draft') {
            $ids[] = (string)$r['id'];
        }
    }
    $counts = ccrm_newsletter_counts($pdo, $ids);
    $campaigns = [];
    foreach ($rows as $r) {
        $campaigns[] = ccrm_newsletter_summary_json($r, $counts[(string)$r['id']] ?? ccrm_newsletter_empty_counts());
    }
    ccrm_nl_respond(['campaigns' => $campaigns]);
}

function ccrm_nl_do_get(array $ctx, array $body): void {
    ccrm_nl_respond(ccrm_nl_campaign_response($ctx['pdo'], (string)($body['id'] ?? '')));
}

function ccrm_nl_do_recipients(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    $row = ccrm_nl_row($pdo, $body['id'] ?? '');
    [$offset, $limit] = ccrm_nl_page($body);
    $where = ['`campaign_id` = ?'];
    $args = [(string)$row['id']];
    $status = isset($body['status']) && is_string($body['status']) ? trim($body['status']) : '';
    if ($status !== '') {
        if (!in_array($status, ['queued', 'sent', 'failed', 'skipped', 'cancelled'], true)) {
            ccrm_nl_fail('invalid_input', 400, 'Unknown status filter.');
        }
        $where[] = '`status` = ?';
        $args[] = $status;
    }
    $q = isset($body['q']) && is_string($body['q']) ? trim($body['q']) : '';
    if ($q !== '') {
        $where[] = "(`email` LIKE ? ESCAPE '\\\\' OR `name` LIKE ? ESCAPE '\\\\')";
        $args[] = ccrm_nl_like($q);
        $args[] = ccrm_nl_like($q);
    }
    $sqlWhere = implode(' AND ', $where);
    $count = $pdo->prepare("SELECT COUNT(*) FROM `newsletter_recipients` WHERE $sqlWhere");
    $count->execute($args);
    $total = (int)$count->fetchColumn();
    $stmt = $pdo->prepare(
        "SELECT `id`, `email`, `name`, `source`, `lead_id`, `employee_id`, `status`, `skip_reason`, `error`, `sent_at`, `unsubscribed_at`
           FROM `newsletter_recipients` WHERE $sqlWhere ORDER BY `id` LIMIT $limit OFFSET $offset"
    );
    $stmt->execute($args);
    $out = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'id' => (int)$r['id'],
            'email' => (string)$r['email'],
            'name' => $r['name'] !== null ? (string)$r['name'] : null,
            'source' => (string)$r['source'],
            'leadId' => $r['lead_id'] !== null ? (string)$r['lead_id'] : null,
            'employeeId' => $r['employee_id'] !== null ? (string)$r['employee_id'] : null,
            'status' => (string)$r['status'],
            'skipReason' => $r['skip_reason'] !== null ? (string)$r['skip_reason'] : null,
            'error' => $r['error'] !== null ? (string)$r['error'] : null,
            'sentAt' => ccrm_newsletter_iso($r['sent_at']),
            'unsubscribedAt' => ccrm_newsletter_iso($r['unsubscribed_at']),
        ];
    }
    ccrm_nl_respond(['rows' => $out, 'total' => $total]);
}

function ccrm_nl_do_audience_preview(array $ctx, array $body): void {
    if (!isset($body['audience']) || !is_array($body['audience'])) {
        ccrm_nl_fail('invalid_input', 400, 'audience is required.');
    }
    $audience = ccrm_newsletter_normalize_audience($body['audience']);
    $valid = ccrm_newsletter_audience_valid($audience);
    // While the user is still choosing categories there is nothing to count yet.
    $resolved = $valid
        ? ccrm_newsletter_resolve_audience($ctx['pdo'], $audience)
        : ['rows' => [], 'bySource' => ['client' => 0, 'lead' => 0, 'employee' => 0, 'extra' => 0], 'skipped' => ['unsubscribed' => 0, 'invalid' => 0], 'withoutEmail' => 0, 'total' => 0];
    ccrm_nl_respond(ccrm_newsletter_audience_preview($resolved, $valid));
}

function ccrm_nl_do_settings_get(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    $sender = ccrm_newsletter_sender_info(ccrm_load_integrations_config($pdo));
    $demo = false;
    try {
        $demo = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_MODE'")->fetchColumn() === 'true';
    } catch (\Throwable $e) {
    }
    ccrm_nl_respond(['config' => ccrm_newsletter_load_config($pdo)] + $sender + ['demo' => $demo]);
}

function ccrm_nl_do_suppressions(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    [$offset, $limit] = ccrm_nl_page($body);
    $where = '';
    $args = [];
    $q = isset($body['q']) && is_string($body['q']) ? trim($body['q']) : '';
    if ($q !== '') {
        $where = "WHERE s.`email` LIKE ? ESCAPE '\\\\' OR s.`note` LIKE ? ESCAPE '\\\\'";
        $args = [ccrm_nl_like($q), ccrm_nl_like($q)];
    }
    $count = $pdo->prepare("SELECT COUNT(*) FROM `newsletter_suppressions` s $where");
    $count->execute($args);
    $total = (int)$count->fetchColumn();
    $stmt = $pdo->prepare(
        "SELECT s.`email`, s.`reason`, s.`campaign_id`, c.`name` AS campaign_name, s.`note`, s.`created_by`, s.`created_at`
           FROM `newsletter_suppressions` s LEFT JOIN `newsletter_campaigns` c ON c.`id` = s.`campaign_id`
           $where ORDER BY s.`created_at` DESC, s.`email` LIMIT $limit OFFSET $offset"
    );
    $stmt->execute($args);
    $rows = [];
    foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
        $rows[] = [
            'email' => (string)$r['email'],
            'reason' => (string)$r['reason'],
            'campaignId' => $r['campaign_id'] !== null ? (string)$r['campaign_id'] : null,
            'campaignName' => $r['campaign_name'] !== null ? (string)$r['campaign_name'] : null,
            'note' => $r['note'] !== null ? (string)$r['note'] : null,
            'createdBy' => $r['created_by'] !== null ? (string)$r['created_by'] : null,
            'createdAt' => ccrm_newsletter_iso($r['created_at']),
        ];
    }
    ccrm_nl_respond(['rows' => $rows, 'total' => $total]);
}

function ccrm_nl_do_images(array $ctx, array $body): void {
    $base = ccrm_app_base_url($ctx['pdo']);
    ccrm_nl_respond(['images' => ccrm_newsletter_list_images(ccrm_uploads_dir(), $base !== '' ? $base : '/', 200)]);
}

function ccrm_nl_do_create(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    $name = ccrm_newsletter_line($body['name'] ?? '', 200);
    if ($name === '') {
        $name = 'Campaign ' . gmdate('Y-m-d H:i');
    }
    $id = ccrm_newsletter_new_id();
    $now = gmdate('Y-m-d H:i:s');
    $pdo->prepare(
        "INSERT INTO `newsletter_campaigns` (`id`, `name`, `audience_json`, `created_by`, `updated_by`, `created_at`, `updated_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $id, $name,
        json_encode(ccrm_newsletter_default_audience(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        mb_substr($ctx['userName'], 0, 50, 'UTF-8'), mb_substr($ctx['userName'], 0, 50, 'UTF-8'), $now, $now,
    ]);
    ccrm_nl_respond(ccrm_nl_campaign_response($pdo, $id));
}

function ccrm_nl_do_update(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    $patch = $body['patch'] ?? null;
    if (!is_array($patch)) {
        ccrm_nl_fail('invalid_input', 400, 'patch is required.');
    }
    $id = is_string($body['id'] ?? null) ? trim($body['id']) : '';
    try {
        $cols = ccrm_newsletter_patch_columns($patch);
    } catch (ccrm_newsletter_error $e) {
        ccrm_nl_fail($e->errorCode, $e->httpStatus, $e->getMessage());
    }
    $pdo->beginTransaction();
    try {
        // Locked so a start_send racing this save cannot slip in between the check and the write.
        $row = ccrm_nl_row($pdo, $id, true);
        if ($row['status'] !== 'draft') {
            $pdo->rollBack();
            ccrm_nl_fail('not_draft', 409, 'Only a draft can be edited.');
        }
        $cols['updated_at'] = gmdate('Y-m-d H:i:s');
        $cols['updated_by'] = mb_substr($ctx['userName'], 0, 50, 'UTF-8');
        $sets = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($cols)));
        $pdo->prepare("UPDATE `newsletter_campaigns` SET $sets WHERE `id` = ?")->execute(array_merge(array_values($cols), [$row['id']]));
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    ccrm_nl_respond(ccrm_nl_campaign_response($pdo, (string)$row['id']));
}

function ccrm_nl_do_duplicate(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    $src = ccrm_nl_row($pdo, $body['id'] ?? '');
    $id = ccrm_newsletter_new_id();
    $now = gmdate('Y-m-d H:i:s');
    $user = mb_substr($ctx['userName'], 0, 50, 'UTF-8');
    $pdo->prepare(
        "INSERT INTO `newsletter_campaigns`
            (`id`, `name`, `subject`, `preheader`, `from_name`, `reply_to`, `audience_json`, `body_json`, `use_header`, `use_footer`,
             `created_by`, `updated_by`, `created_at`, `updated_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $id, mb_substr($src['name'], 0, 193, 'UTF-8') . ' (copy)', $src['subject'], $src['preheader'], $src['from_name'], $src['reply_to'],
        $src['audience_json'], $src['body_json'], (int)$src['use_header'], (int)$src['use_footer'], $user, $user, $now, $now,
    ]);
    ccrm_nl_respond(ccrm_nl_campaign_response($pdo, $id));
}

function ccrm_nl_do_delete(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    $pdo->beginTransaction();
    try {
        $row = ccrm_nl_row($pdo, $body['id'] ?? '', true);
        if ($row['status'] === 'sending') {
            $pdo->rollBack();
            ccrm_nl_fail('campaign_sending', 409, 'A campaign that is sending cannot be deleted. Pause or cancel it first.');
        }
        $now = gmdate('Y-m-d H:i:s');
        $pdo->prepare("UPDATE `newsletter_campaigns` SET `deleted_at` = ?, `updated_at` = ?, `updated_by` = ? WHERE `id` = ?")
            ->execute([$now, $now, mb_substr($ctx['userName'], 0, 50, 'UTF-8'), $row['id']]);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    ccrm_nl_respond([]);
}

function ccrm_nl_do_upload_image(array $ctx, array $body): void {
    $file = $_FILES['file'] ?? null;
    // A body over post_max_size arrives with $_FILES empty: report the size, not "no file".
    if (!is_array($file) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        ccrm_nl_fail('file_too_large', 422, 'The image is too large.');
    }
    if (!is_array($file) || !isset($file['tmp_name'])) {
        ccrm_nl_fail('no_file', 400, 'No file was uploaded.');
    }
    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        $tooBig = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
        ccrm_nl_fail($tooBig ? 'file_too_large' : 'upload_failed', $tooBig ? 422 : 400, $tooBig ? 'The image is too large.' : 'The upload failed.');
    }
    $tmp = (string)$file['tmp_name'];
    if (!is_uploaded_file($tmp)) {
        ccrm_nl_fail('no_file', 400, 'No file was uploaded.');
    }
    if ((int)filesize($tmp) > ccrm_newsletter_image_max_bytes()) {
        ccrm_nl_fail('file_too_large', 422, 'The image is larger than 5 MB.');
    }
    // The real type, not the file name or the browser's claim: a .jpg that is a script is refused.
    $finfo = new \finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->file($tmp);
    $relative = ccrm_newsletter_image_relative_path($mime);
    if ($relative === null || @getimagesize($tmp) === false) {
        ccrm_nl_fail('invalid_image_type', 422, 'Only JPEG, PNG, GIF and WebP images are allowed.');
    }
    $base = ccrm_app_base_url($ctx['pdo']);
    if ($base === '') {
        ccrm_nl_fail('base_url_unknown', 422, 'The address of this installation is not known, so an absolute image link cannot be built.');
    }
    $uploads = ccrm_uploads_dir();
    $target = rtrim($uploads, '/\\') . '/' . $relative;
    $dir = dirname($target);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        ccrm_nl_fail('storage_failed', 500, 'The image could not be stored.');
    }
    if (!move_uploaded_file($tmp, $target)) {
        ccrm_nl_fail('storage_failed', 500, 'The image could not be stored.');
    }
    @chmod($target, 0644);
    ccrm_nl_respond(['url' => rtrim($base, '/') . '/uploads/' . $relative]);
}

function ccrm_nl_do_suppression_add(array $ctx, array $body): void {
    $pdo = $ctx['pdo'];
    $emails = $body['emails'] ?? null;
    if (!is_array($emails) || count($emails) === 0) {
        ccrm_nl_fail('invalid_input', 400, 'emails is required.');
    }
    if (count($emails) > 2000) {
        ccrm_nl_fail('invalid_input', 400, 'At most 2000 addresses at once.');
    }
    $note = ccrm_newsletter_line($body['note'] ?? '', 255);
    $user = mb_substr($ctx['userName'], 0, 50, 'UTF-8');
    $now = gmdate('Y-m-d H:i:s');
    $stmt = $pdo->prepare(
        "INSERT IGNORE INTO `newsletter_suppressions` (`email`, `reason`, `campaign_id`, `note`, `created_by`, `created_at`)
         VALUES (?, 'manual', NULL, ?, ?, ?)"
    );
    $added = 0;
    $invalid = [];
    $seen = [];
    foreach ($emails as $e) {
        $email = ccrm_newsletter_normalize_email(is_scalar($e) ? (string)$e : '');
        if ($email === '' || isset($seen[$email])) {
            continue;
        }
        $seen[$email] = true;
        if (!ccrm_newsletter_is_valid_email($email)) {
            if (count($invalid) < 50) {
                $invalid[] = $email;
            }
            continue;
        }
        $stmt->execute([$email, $note !== '' ? $note : null, $user, $now]);
        $added += $stmt->rowCount();
    }
    ccrm_nl_respond(['added' => $added, 'invalid' => $invalid]);
}

function ccrm_nl_do_suppression_remove(array $ctx, array $body): void {
    $email = ccrm_newsletter_normalize_email(is_string($body['email'] ?? null) ? $body['email'] : '');
    if ($email === '') {
        ccrm_nl_fail('invalid_input', 400, 'email is required.');
    }
    $ctx['pdo']->prepare("DELETE FROM `newsletter_suppressions` WHERE `email` = ?")->execute([$email]);
    ccrm_nl_respond([]);
}

function ccrm_nl_do_settings_save(array $ctx, array $body): void {
    if (!isset($body['config']) || !is_array($body['config'])) {
        ccrm_nl_fail('invalid_input', 400, 'config is required.');
    }
    try {
        $config = ccrm_newsletter_normalize_config($body['config'], true);
    } catch (ccrm_newsletter_error $e) {
        ccrm_nl_fail($e->errorCode, $e->httpStatus, $e->getMessage());
    }
    ccrm_newsletter_save_config($ctx['pdo'], $config);
    ccrm_nl_respond(['config' => $config]);
}

// ---------------------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------------------

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_nl_fail('not_installed', 503);
}
require_once $configFile;
try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_nl_fail('database_unavailable', 503);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    ccrm_nl_fail('method_not_allowed', 405);
}

$scope = ccrm_read_scope($pdo, $sessionUser);
if (!ccrm_can($scope, 'newsletter')) {
    ccrm_nl_fail('forbidden', 403);
}

$decoded = json_decode((string)file_get_contents('php://input'), true);
$body = is_array($decoded) ? $decoded : [];
$action = trim((string)($body['action'] ?? $_GET['action'] ?? $_POST['action'] ?? ''));

// action => [permission, handler]. view / edit = the `newsletter` access level; send and
// settings = the toggles newsletter_send / newsletter_settings.
$routes = [
    'list' => ['view', 'ccrm_nl_do_list'],
    'get' => ['view', 'ccrm_nl_do_get'],
    'recipients' => ['view', 'ccrm_nl_do_recipients'],
    'audience_preview' => ['view', 'ccrm_nl_do_audience_preview'],
    'settings_get' => ['view', 'ccrm_nl_do_settings_get'],
    'suppressions' => ['view', 'ccrm_nl_do_suppressions'],
    'images' => ['edit', 'ccrm_nl_do_images'],
    'create' => ['edit', 'ccrm_nl_do_create'],
    'update' => ['edit', 'ccrm_nl_do_update'],
    'duplicate' => ['edit', 'ccrm_nl_do_duplicate'],
    'delete' => ['edit', 'ccrm_nl_do_delete'],
    'upload_image' => ['edit', 'ccrm_nl_do_upload_image'],
    'suppression_add' => ['edit', 'ccrm_nl_do_suppression_add'],
    'suppression_remove' => ['edit', 'ccrm_nl_do_suppression_remove'],
    'settings_save' => ['settings', 'ccrm_nl_do_settings_save'],
    // Sending package: send_test, start_send, pause, resume, cancel (permission 'send'), tick ('view').
];

if (!isset($routes[$action])) {
    ccrm_nl_fail('unknown_action', 400);
}
[$need, $handler] = $routes[$action];
$allowed = [
    'view' => true,
    'edit' => ccrm_can($scope, 'newsletter', 'edit'),
    'send' => ccrm_can($scope, 'newsletter_send'),
    'settings' => ccrm_can($scope, 'newsletter_settings'),
][$need] ?? false;
if (!$allowed) {
    ccrm_nl_fail('forbidden', 403);
}

$userName = trim((string)($scope['sessionUserName'] ?? ''));
if ($userName === '') {
    $userName = (string)($sessionUser['id'] ?? '');
}
$ctx = ['pdo' => $pdo, 'scope' => $scope, 'userName' => $userName];

try {
    $handler($ctx, $body);
} catch (ccrm_newsletter_error $e) {
    ccrm_nl_fail($e->errorCode, $e->httpStatus, $e->getMessage());
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_nl_fail('server_error', 500);
}
