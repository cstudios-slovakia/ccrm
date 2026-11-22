<?php
/**
 * Custom Calendars REST API Endpoint
 *
 * Manages workspace-shared custom calendars (`custom_calendars`) and their
 * free-form events (`custom_calendar_events`) — e.g. Meeting Room bookings,
 * company vehicles, showroom reservations.
 *
 * Gated by the `tasks` RBAC permission (`view` to read, `edit` to create/edit/delete).
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/deleted_records.php';
require_once __DIR__ . '/permissions.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json; charset=utf-8');
ccrm_send_cors('GET, POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        exit(0);
    }
    $user = ccrm_require_auth();
} else {
    $user = ['id' => 'cli', 'name' => 'CLI', 'email' => 'cli@localhost', 'role' => 'Admin'];
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    $configFile = dirname(__DIR__, 2) . '/config.php';
}
if (file_exists($configFile)) {
    require_once $configFile;
}

try {
    $pdo = function_exists('get_db_connection') ? get_db_connection() : ccrm_auth_pdo();
    if (!$pdo) {
        throw new Exception('Database connection unavailable.');
    }
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed.']);
    exit;
}

// Pre-transaction DDL healing so stale OPcache never leaves tables missing.
ccrm_migrate_custom_calendars($pdo);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (php_sapi_name() !== 'cli') {
    $scope = ccrm_read_scope($pdo, $user);
    $deny = static function (string $message): void {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden', 'message' => $message]);
        exit;
    };

    if ($method === 'GET') {
        if (!ccrm_can($scope, 'tasks', 'view')) {
            $deny("Permission 'tasks' required.");
        }
    } elseif ($method === 'POST') {
        if (!ccrm_can($scope, 'tasks', 'edit')) {
            $deny("Permission 'tasks' at level 'edit' required.");
        }
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }
}

$validDate = static function ($d): ?string {
    if (!is_string($d)) return null;
    $trimmed = trim($d);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) ? $trimmed : null;
};

$validTime = static function ($t): ?string {
    if (!is_string($t)) return null;
    $trimmed = trim($t);
    return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $trimmed) ? $trimmed : null;
};

$validColor = static function ($c, string $fallback = '#6366f1'): string {
    if (!is_string($c)) return $fallback;
    $trimmed = trim($c);
    return preg_match('/^#[0-9a-fA-F]{3,8}$/', $trimmed) ? $trimmed : $fallback;
};

$mapCalendar = static function (array $r): array {
    return [
        'id' => (string)$r['id'],
        'name' => (string)$r['name'],
        'color' => (string)($r['color'] ?: '#6366f1'),
        'description' => $r['description'] !== null ? (string)$r['description'] : null,
        'createdBy' => $r['created_by'] !== null ? (string)$r['created_by'] : null,
        'createdAt' => $r['created_at'] !== null ? (string)$r['created_at'] : null,
        'updatedAt' => $r['updated_at'] !== null ? (string)$r['updated_at'] : null,
    ];
};

$mapEvent = static function (array $r): array {
    return [
        'id' => (string)$r['id'],
        'calendarId' => (string)$r['calendar_id'],
        'title' => (string)$r['title'],
        'startDate' => (string)$r['start_date'],
        'endDate' => (string)$r['end_date'],
        'startTime' => $r['start_time'] !== null && $r['start_time'] !== '' ? (string)$r['start_time'] : null,
        'endTime' => $r['end_time'] !== null && $r['end_time'] !== '' ? (string)$r['end_time'] : null,
        'notes' => $r['notes'] !== null ? (string)$r['notes'] : null,
        'color' => $r['color'] !== null && $r['color'] !== '' ? (string)$r['color'] : null,
        'owner' => $r['owner'] !== null && $r['owner'] !== '' ? (string)$r['owner'] : null,
        'relatedLeadId' => $r['related_lead_id'] !== null && $r['related_lead_id'] !== '' ? (string)$r['related_lead_id'] : null,
        'relatedProjectId' => $r['related_project_id'] !== null && $r['related_project_id'] !== '' ? (string)$r['related_project_id'] : null,
        'createdBy' => $r['created_by'] !== null ? (string)$r['created_by'] : null,
        'createdAt' => $r['created_at'] !== null ? (string)$r['created_at'] : null,
        'updatedAt' => $r['updated_at'] !== null ? (string)$r['updated_at'] : null,
    ];
};

if ($method === 'GET') {
    $from = $validDate($_GET['from'] ?? null);
    $to = $validDate($_GET['to'] ?? null);
    $calendarId = isset($_GET['calendarId']) ? trim((string)$_GET['calendarId']) : '';

    try {
        $calStmt = $pdo->query(
            "SELECT `id`, `name`, `color`, `description`, `created_by`, `created_at`, `updated_at`
               FROM `custom_calendars`
              WHERE `deleted_at` IS NULL
              ORDER BY `created_at` ASC, `name` ASC"
        );
        $calendars = array_map($mapCalendar, $calStmt->fetchAll(PDO::FETCH_ASSOC) ?: []);

        $where = ['`deleted_at` IS NULL'];
        $params = [];
        if ($calendarId !== '') {
            $where[] = '`calendar_id` = ?';
            $params[] = $calendarId;
        }
        if ($from !== null && $to !== null) {
            $where[] = '`start_date` <= ? AND `end_date` >= ?';
            $params[] = $to;
            $params[] = $from;
        }
        $evtSql = "SELECT `id`, `calendar_id`, `title`, `start_date`, `end_date`, `start_time`, `end_time`,
                          `notes`, `color`, `owner`, `related_lead_id`, `related_project_id`, `created_by`,
                          `created_at`, `updated_at`
                     FROM `custom_calendar_events`
                    WHERE " . implode(' AND ', $where) . "
                    ORDER BY `start_date` ASC, COALESCE(`start_time`, '00:00') ASC, `created_at` ASC";
        $evtStmt = $pdo->prepare($evtSql);
        $evtStmt->execute($params);
        $events = array_map($mapEvent, $evtStmt->fetchAll(PDO::FETCH_ASSOC) ?: []);

        echo json_encode(['calendars' => $calendars, 'events' => $events], JSON_UNESCAPED_UNICODE);
    } catch (\Throwable $e) {
        ccrm_log_exception($e);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to load custom calendars.']);
    }
    exit;
}

$raw = file_get_contents('php://input');
$body = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload.']);
    exit;
}

$action = (string)($body['action'] ?? '');
$actorName = trim((string)($user['name'] ?? ($user['email'] ?? '')));

try {
    if ($action === 'save_calendar') {
        $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 150);
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Calendar name is required.']);
            exit;
        }
        $id = isset($body['id']) && is_string($body['id']) && trim($body['id']) !== ''
            ? mb_substr(trim($body['id']), 0, 64)
            : 'ccal_' . bin2hex(random_bytes(8));
        $color = $validColor($body['color'] ?? null, '#6366f1');
        $description = isset($body['description']) && is_string($body['description']) && trim($body['description']) !== ''
            ? mb_substr(trim($body['description']), 0, 500)
            : null;

        $stmt = $pdo->prepare(
            "INSERT INTO `custom_calendars` (`id`, `name`, `color`, `description`, `created_by`, `deleted_at`)
             VALUES (?, ?, ?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE
               `name` = VALUES(`name`),
               `color` = VALUES(`color`),
               `description` = VALUES(`description`),
               `deleted_at` = NULL"
        );
        $stmt->execute([$id, $name, $color, $description, $actorName !== '' ? $actorName : null]);

        $sel = $pdo->prepare("SELECT `id`, `name`, `color`, `description`, `created_by`, `created_at`, `updated_at` FROM `custom_calendars` WHERE `id` = ? LIMIT 1");
        $sel->execute([$id]);
        $row = $sel->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['ok' => true, 'calendar' => $row ? $mapCalendar($row) : null], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'delete_calendar') {
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Calendar id is required.']);
            exit;
        }
        $pdo->prepare("UPDATE `custom_calendars` SET `deleted_at` = NOW() WHERE `id` = ?")->execute([$id]);
        $pdo->prepare("UPDATE `custom_calendar_events` SET `deleted_at` = NOW() WHERE `calendar_id` = ?")->execute([$id]);
        ccrm_record_deleted($pdo, 'custom_calendars', [$id], $actorName);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'save_event') {
        $calendarId = mb_substr(trim((string)($body['calendarId'] ?? '')), 0, 64);
        $title = mb_substr(trim((string)($body['title'] ?? '')), 0, 255);
        $startDate = $validDate($body['startDate'] ?? null);
        $endDate = $validDate($body['endDate'] ?? null) ?? $startDate;
        if ($calendarId === '' || $title === '' || $startDate === null) {
            http_response_code(400);
            echo json_encode(['error' => 'calendarId, title and valid startDate are required.']);
            exit;
        }
        if ($endDate < $startDate) {
            $endDate = $startDate;
        }
        $startTime = $validTime($body['startTime'] ?? null);
        $endTime = $validTime($body['endTime'] ?? null);
        $notes = isset($body['notes']) && is_string($body['notes']) && trim($body['notes']) !== ''
            ? mb_substr(trim($body['notes']), 0, 5000)
            : null;
        $color = isset($body['color']) && is_string($body['color']) && trim($body['color']) !== ''
            ? $validColor($body['color'], '')
            : null;
        if ($color === '') $color = null;
        $owner = isset($body['owner']) && is_string($body['owner']) && trim($body['owner']) !== ''
            ? mb_substr(trim($body['owner']), 0, 150)
            : ($actorName !== '' ? $actorName : null);
        $relatedLeadId = isset($body['relatedLeadId']) && is_string($body['relatedLeadId']) && trim($body['relatedLeadId']) !== ''
            ? mb_substr(trim($body['relatedLeadId']), 0, 64)
            : null;
        $relatedProjectId = isset($body['relatedProjectId']) && is_string($body['relatedProjectId']) && trim($body['relatedProjectId']) !== ''
            ? mb_substr(trim($body['relatedProjectId']), 0, 64)
            : null;
        $id = isset($body['id']) && is_string($body['id']) && trim($body['id']) !== ''
            ? mb_substr(trim($body['id']), 0, 64)
            : 'ccevt_' . bin2hex(random_bytes(8));

        $stmt = $pdo->prepare(
            "INSERT INTO `custom_calendar_events`
               (`id`, `calendar_id`, `title`, `start_date`, `end_date`, `start_time`, `end_time`,
                `notes`, `color`, `owner`, `related_lead_id`, `related_project_id`, `created_by`, `deleted_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE
               `calendar_id` = VALUES(`calendar_id`),
               `title` = VALUES(`title`),
               `start_date` = VALUES(`start_date`),
               `end_date` = VALUES(`end_date`),
               `start_time` = VALUES(`start_time`),
               `end_time` = VALUES(`end_time`),
               `notes` = VALUES(`notes`),
               `color` = VALUES(`color`),
               `owner` = VALUES(`owner`),
               `related_lead_id` = VALUES(`related_lead_id`),
               `related_project_id` = VALUES(`related_project_id`),
               `deleted_at` = NULL"
        );
        $stmt->execute([
            $id, $calendarId, $title, $startDate, $endDate, $startTime, $endTime,
            $notes, $color, $owner, $relatedLeadId, $relatedProjectId, $actorName !== '' ? $actorName : null
        ]);

        $sel = $pdo->prepare(
            "SELECT `id`, `calendar_id`, `title`, `start_date`, `end_date`, `start_time`, `end_time`,
                    `notes`, `color`, `owner`, `related_lead_id`, `related_project_id`, `created_by`,
                    `created_at`, `updated_at`
               FROM `custom_calendar_events` WHERE `id` = ? LIMIT 1"
        );
        $sel->execute([$id]);
        $row = $sel->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['ok' => true, 'event' => $row ? $mapEvent($row) : null], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'delete_event') {
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Event id is required.']);
            exit;
        }
        $pdo->prepare("UPDATE `custom_calendar_events` SET `deleted_at` = NOW() WHERE `id` = ?")->execute([$id]);
        ccrm_record_deleted($pdo, 'custom_calendar_events', [$id], $actorName);
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Unknown action.']);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['error' => 'Custom calendar write failed.']);
}
