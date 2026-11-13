<?php
/**
 * Weekly Plan REST API Endpoint
 *
 * Manages standalone management planning cards (`weekly_plan_cards`) and per-day
 * notes (`weekly_plan_day_notes`), gated by the dedicated RBAC permission
 * `tasks.weekly_plan` (`view` to read, `edit` to create/edit/move/delete).
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
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
    $user = ['id' => 'cli', 'email' => 'cli@localhost', 'role' => 'Admin'];
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

// Pre-transaction DDL healing so stale OPcache on deploy never leaves tables or
// columns missing when saving or reading Weekly Plan records.
ccrm_migrate_weekly_plan($pdo);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (php_sapi_name() !== 'cli') {
    $scope = ccrm_read_scope($pdo, $user);
    $deny = static function (string $message): void {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden', 'message' => $message]);
        exit;
    };

    if ($method === 'GET') {
        if (!ccrm_can($scope, 'tasks.weekly_plan', 'view')) {
            $deny("Permission 'tasks.weekly_plan' required.");
        }
    } elseif ($method === 'POST') {
        if (!ccrm_can($scope, 'tasks.weekly_plan', 'edit')) {
            $deny("Permission 'tasks.weekly_plan' at level 'edit' required.");
        }
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }
}

$validDate = static function (?string $d): ?string {
    if (!is_string($d)) {
        return null;
    }
    $trimmed = trim($d);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed)) {
        return null;
    }
    return $trimmed;
};

if ($method === 'GET') {
    $from = $validDate($_GET['from'] ?? null);
    $to = $validDate($_GET['to'] ?? null);

    try {
        if ($from !== null && $to !== null) {
            $cardStmt = $pdo->prepare(
                "SELECT `id`, `date`, `content`, `position`, `completed`, `color`, `refs_json`, `created_by`, `created_at`, `updated_at`
                 FROM `weekly_plan_cards`
                 WHERE `date` BETWEEN ? AND ?
                 ORDER BY `date` ASC, `position` ASC, `created_at` ASC"
            );
            $cardStmt->execute([$from, $to]);

            $noteStmt = $pdo->prepare(
                "SELECT `date`, `note`, `updated_by`, `updated_at`
                 FROM `weekly_plan_day_notes`
                 WHERE `date` BETWEEN ? AND ?
                 ORDER BY `date` ASC"
            );
            $noteStmt->execute([$from, $to]);
        } else {
            $cardStmt = $pdo->query(
                "SELECT `id`, `date`, `content`, `position`, `completed`, `color`, `refs_json`, `created_by`, `created_at`, `updated_at`
                 FROM `weekly_plan_cards`
                 ORDER BY `date` ASC, `position` ASC, `created_at` ASC"
            );
            $noteStmt = $pdo->query(
                "SELECT `date`, `note`, `updated_by`, `updated_at`
                 FROM `weekly_plan_day_notes`
                 ORDER BY `date` ASC"
            );
        }

        $cards = [];
        foreach ($cardStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $refs = [];
            if (!empty($row['refs_json'])) {
                $decoded = json_decode((string)$row['refs_json'], true);
                if (is_array($decoded)) {
                    $refs = $decoded;
                }
            }
            $cards[] = [
                'id'        => (string)$row['id'],
                'date'      => (string)$row['date'],
                'content'   => (string)$row['content'],
                'position'  => (int)$row['position'],
                'completed' => (bool)((int)$row['completed']),
                'color'     => (string)($row['color'] ?? ''),
                'refs'      => $refs,
                'createdBy' => $row['created_by'] !== null ? (string)$row['created_by'] : null,
                'createdAt' => $row['created_at'] ?? null,
                'updatedAt' => $row['updated_at'] ?? null,
            ];
        }

        $notes = [];
        foreach ($noteStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $notes[] = [
                'date'      => (string)$row['date'],
                'note'      => (string)$row['note'],
                'updatedBy' => $row['updated_by'] !== null ? (string)$row['updated_by'] : null,
                'updatedAt' => $row['updated_at'] ?? null,
            ];
        }

        echo json_encode(['cards' => $cards, 'notes' => $notes], JSON_UNESCAPED_UNICODE);
    } catch (\Throwable $e) {
        ccrm_log_exception($e);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to load weekly plan']);
    }
    exit;
}

// POST actions
$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '{}', true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

$action = (string)($body['action'] ?? '');
$actorId = isset($user['id']) ? (string)$user['id'] : (isset($user['email']) ? (string)$user['email'] : null);

try {
    if ($action === 'save_card') {
        $id = trim((string)($body['id'] ?? ''));
        $date = $validDate($body['date'] ?? null);
        $content = trim((string)($body['content'] ?? ''));
        $position = (int)($body['position'] ?? 0);
        $completed = !empty($body['completed']) ? 1 : 0;
        $color = substr(trim((string)($body['color'] ?? '')), 0, 32);
        $refs = isset($body['refs']) && is_array($body['refs']) ? $body['refs'] : [];

        if ($id === '') {
            $id = 'wpc_' . bin2hex(random_bytes(8));
        }
        if ($date === null || $content === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Valid date and non-empty content are required']);
            exit;
        }

        $refsJson = json_encode(array_values($refs), JSON_UNESCAPED_UNICODE);
        $stmt = $pdo->prepare(
            "INSERT INTO `weekly_plan_cards` (`id`, `date`, `content`, `position`, `completed`, `color`, `refs_json`, `created_by`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               `date` = VALUES(`date`),
               `content` = VALUES(`content`),
               `position` = VALUES(`position`),
               `completed` = VALUES(`completed`),
               `color` = VALUES(`color`),
               `refs_json` = VALUES(`refs_json`),
               `updated_at` = CURRENT_TIMESTAMP"
        );
        $stmt->execute([$id, $date, $content, $position, $completed, $color, $refsJson, $actorId]);

        $sel = $pdo->prepare(
            "SELECT `id`, `date`, `content`, `position`, `completed`, `color`, `refs_json`, `created_by`, `created_at`, `updated_at`
             FROM `weekly_plan_cards` WHERE `id` = ?"
        );
        $sel->execute([$id]);
        $row = $sel->fetch(PDO::FETCH_ASSOC);
        $savedRefs = [];
        if ($row && !empty($row['refs_json'])) {
            $decoded = json_decode((string)$row['refs_json'], true);
            if (is_array($decoded)) {
                $savedRefs = $decoded;
            }
        }

        echo json_encode([
            'ok' => true,
            'card' => $row ? [
                'id'        => (string)$row['id'],
                'date'      => (string)$row['date'],
                'content'   => (string)$row['content'],
                'position'  => (int)$row['position'],
                'completed' => (bool)((int)$row['completed']),
                'color'     => (string)($row['color'] ?? ''),
                'refs'      => $savedRefs,
                'createdBy' => $row['created_by'] !== null ? (string)$row['created_by'] : null,
                'createdAt' => $row['created_at'] ?? null,
                'updatedAt' => $row['updated_at'] ?? null,
            ] : [
                'id'        => $id,
                'date'      => $date,
                'content'   => $content,
                'position'  => $position,
                'completed' => (bool)$completed,
                'color'     => $color,
                'refs'      => $refs,
                'createdBy' => $actorId,
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'reorder_cards') {
        $items = $body['items'] ?? null;
        if (!is_array($items)) {
            http_response_code(400);
            echo json_encode(['error' => 'items array is required']);
            exit;
        }
        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare(
                "UPDATE `weekly_plan_cards` SET `date` = ?, `position` = ?, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = ?"
            );
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $id = trim((string)($item['id'] ?? ''));
                $date = $validDate($item['date'] ?? null);
                $position = (int)($item['position'] ?? 0);
                if ($id === '' || $date === null) {
                    continue;
                }
                $upd->execute([$date, $position, $id]);
            }
            $pdo->commit();
        } catch (\Throwable $txErr) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $txErr;
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'delete_card') {
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Card id is required']);
            exit;
        }
        $del = $pdo->prepare("DELETE FROM `weekly_plan_cards` WHERE `id` = ?");
        $del->execute([$id]);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'save_note') {
        $date = $validDate($body['date'] ?? null);
        $note = trim((string)($body['note'] ?? ''));
        if ($date === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Valid date is required']);
            exit;
        }
        if ($note === '') {
            $del = $pdo->prepare("DELETE FROM `weekly_plan_day_notes` WHERE `date` = ?");
            $del->execute([$date]);
        } else {
            $stmt = $pdo->prepare(
                "INSERT INTO `weekly_plan_day_notes` (`date`, `note`, `updated_by`)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   `note` = VALUES(`note`),
                   `updated_by` = VALUES(`updated_by`),
                   `updated_at` = CURRENT_TIMESTAMP"
            );
            $stmt->execute([$date, $note, $actorId]);
        }
        echo json_encode(['ok' => true, 'date' => $date, 'note' => $note], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Unsupported action']);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['error' => 'Weekly plan operation failed']);
}
