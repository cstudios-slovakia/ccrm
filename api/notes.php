<?php
/**
 * Notes REST endpoint: free-text notes attached to a record of any module.
 *
 *   GET    ?entity_type=lead|project&entity_id=<id>   the record's notes, newest first
 *   POST   {entityType, entityId, content, at?}        add a note
 *   POST   ?action=update  {id, content, at?}          change a note's text
 *   DELETE ?id=<note id>                               remove a note
 *
 * Who may do what follows the record's module: viewing needs the module (`leads`, or `clients` for a
 * client row; `projects`), adding and changing need edit on it, removing needs its delete right. The
 * module of a new kind of record is one line in ccrm_notes_module() below.
 *
 * `at` is the browser's local wall-clock time ("YYYY-MM-DD HH:MM[:SS]"), the same clock timeline entries
 * are stamped with; without it the server's time is used. The author is always the session user.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/notes_migration.php';

header('Content-Type: application/json; charset=utf-8');
ccrm_send_cors('GET, POST, DELETE, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit(0);
}
$user = ccrm_require_auth();

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    $configFile = dirname(__DIR__, 2) . '/config.php';
}
if (file_exists($configFile)) {
    require_once $configFile;
}

if (!function_exists('ccrm_notes_fail')) {
    function ccrm_notes_fail(int $status, string $message): void {
        http_response_code($status);
        echo json_encode(['error' => $message]);
        exit;
    }
}

if (!function_exists('ccrm_notes_module')) {
    /**
     * The permission module guarding the notes of one kind of record, or null for an unknown kind.
     * Clients are `leads` rows with a `client-*` id, so their notes follow the `clients` module.
     */
    function ccrm_notes_module(string $entityType, string $entityId): ?string {
        if ($entityType === 'lead') {
            return strpos($entityId, 'client-') === 0 ? 'clients' : 'leads';
        }
        if ($entityType === 'project') {
            return 'projects';
        }
        return null;
    }
}

if (!function_exists('ccrm_notes_entity_exists')) {
    function ccrm_notes_entity_exists(\PDO $pdo, string $entityType, string $entityId): bool {
        $table = $entityType === 'lead' ? 'leads' : 'projects';
        $stmt = $pdo->prepare("SELECT 1 FROM `{$table}` WHERE `id` = ? LIMIT 1");
        $stmt->execute([$entityId]);
        return (bool) $stmt->fetchColumn();
    }
}

if (!function_exists('ccrm_notes_stamp')) {
    /** The client's local wall-clock stamp when it is well formed, else the server's time. */
    function ccrm_notes_stamp($at): string {
        $at = trim((string) $at);
        if (preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/', $at)) {
            $at = str_replace('T', ' ', $at);
            return strlen($at) === 16 ? $at . ':00' : $at;
        }
        return date('Y-m-d H:i:s');
    }
}

if (!function_exists('ccrm_notes_row_json')) {
    function ccrm_notes_row_json(array $row): array {
        return [
            'id' => $row['id'],
            'entityType' => $row['entity_type'],
            'entityId' => $row['entity_id'],
            'content' => $row['content'],
            'author' => $row['author'],
            'audioFile' => $row['audio_file'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }
}

try {
    $pdo = function_exists('get_db_connection') ? get_db_connection() : ccrm_auth_pdo();
    if (!$pdo) {
        throw new Exception('Database connection unavailable.');
    }
    ccrm_apply_schema($pdo);
    ccrm_notes_ensure_table($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_notes_fail(500, 'Database connection failed.');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$scope = ccrm_read_scope($pdo, $user);
$deny = function (string $message): void {
    ccrm_notes_fail(403, $message);
};

try {
    if ($method === 'GET') {
        $entityType = (string) ($_GET['entity_type'] ?? '');
        $entityId = (string) ($_GET['entity_id'] ?? '');
        $module = ccrm_notes_module($entityType, $entityId);
        if ($module === null || $entityId === '') {
            ccrm_notes_fail(400, 'Unknown entity.');
        }
        if (!ccrm_can($scope, $module)) {
            $deny("Permission '{$module}' required.");
        }
        $stmt = $pdo->prepare("SELECT * FROM `notes` WHERE `entity_type` = ? AND `entity_id` = ? ORDER BY `created_at` DESC, `id` DESC");
        $stmt->execute([$entityType, $entityId]);
        echo json_encode(['notes' => array_map('ccrm_notes_row_json', $stmt->fetchAll(\PDO::FETCH_ASSOC))]);
        exit;
    }

    if ($method === 'POST') {
        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body)) {
            ccrm_notes_fail(400, 'Invalid JSON body.');
        }
        $content = trim((string) ($body['content'] ?? ''));
        if ($content === '' || mb_strlen($content, 'UTF-8') > 20000) {
            ccrm_notes_fail(400, 'A note needs text, at most 20000 characters.');
        }

        if (($_GET['action'] ?? '') === 'update') {
            $id = (string) ($body['id'] ?? '');
            $stmt = $pdo->prepare("SELECT * FROM `notes` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$id]);
            $note = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$note) {
                ccrm_notes_fail(404, 'Note not found.');
            }
            $module = ccrm_notes_module($note['entity_type'], $note['entity_id']);
            if ($module === null || !ccrm_can($scope, $module, 'edit')) {
                $deny("Permission '{$module}' at level 'edit' required.");
            }
            $at = ccrm_notes_stamp($body['at'] ?? null);
            $pdo->prepare("UPDATE `notes` SET `content` = ?, `updated_at` = ? WHERE `id` = ?")->execute([$content, $at, $id]);
            $note['content'] = $content;
            $note['updated_at'] = $at;
            echo json_encode(['note' => ccrm_notes_row_json($note)]);
            exit;
        }

        $entityType = (string) ($body['entityType'] ?? '');
        $entityId = (string) ($body['entityId'] ?? '');
        $module = ccrm_notes_module($entityType, $entityId);
        if ($module === null || $entityId === '') {
            ccrm_notes_fail(400, 'Unknown entity.');
        }
        if (!ccrm_can($scope, $module, 'edit')) {
            $deny("Permission '{$module}' at level 'edit' required.");
        }
        if (!ccrm_notes_entity_exists($pdo, $entityType, $entityId)) {
            ccrm_notes_fail(404, 'The record does not exist (yet).');
        }
        $id = 'note-' . bin2hex(random_bytes(8));
        $at = ccrm_notes_stamp($body['at'] ?? null);
        $author = mb_substr((string) ($scope['sessionUserName'] ?? ''), 0, 100, 'UTF-8');
        $pdo->prepare(
            "INSERT INTO `notes` (`id`, `entity_type`, `entity_id`, `content`, `author`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )->execute([$id, $entityType, $entityId, $content, $author !== '' ? $author : null, $at, $at]);
        $created = $pdo->prepare("SELECT * FROM `notes` WHERE `id` = ?");
        $created->execute([$id]);
        echo json_encode(['note' => ccrm_notes_row_json($created->fetch(\PDO::FETCH_ASSOC))]);
        exit;
    }

    if ($method === 'DELETE') {
        $id = (string) ($_GET['id'] ?? '');
        $stmt = $pdo->prepare("SELECT * FROM `notes` WHERE `id` = ? LIMIT 1");
        $stmt->execute([$id]);
        $note = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$note) {
            // Already gone: the caller's intent is met.
            echo json_encode(['success' => true]);
            exit;
        }
        $module = ccrm_notes_module($note['entity_type'], $note['entity_id']);
        if ($module === null || !ccrm_can($scope, $module, 'edit')) {
            $deny("Permission '{$module}' at level 'edit' required.");
        }
        if (empty($scope['isAdmin']) && empty(ccrm_perm_module($scope['permissions'] ?? [], $module)['delete'])) {
            $deny("Permission '{$module}.delete' required.");
        }
        $pdo->prepare("DELETE FROM `notes` WHERE `id` = ?")->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }

    ccrm_notes_fail(405, 'Method not allowed.');
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_notes_fail(500, 'An internal error occurred.');
}
