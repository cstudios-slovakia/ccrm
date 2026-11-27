<?php
/**
 * Icons in front of list labels (a flag on a lead source, a hammer on a division...).
 * Frontend: src/utils/listIcons.ts (shape, keys) and src/utils/listIconStore.ts.
 *
 *   GET                                    -> { success, icons }
 *   POST { kind, key, icon }               -> sets one icon; icon null or "" removes it
 *   POST { kind, from, to }                -> moves an icon to a renamed list item
 *
 * Everything sits in ONE system_settings row, LIST_ICONS:
 *   { "leadSources": { "web .sk - cp": "flag-slovakia" }, "offerCategories": { "oc-1": "hammer" } }
 * Name lists are keyed by the lower-cased name, the category trees by category id.
 *
 * Its own endpoint so picking an icon never goes through sync.php's settings push
 * (which sends the whole dataset). sync.php never writes this key, so the two cannot
 * overwrite each other.
 *
 * Reading is open to every signed-in user (the icons show wherever the labels do).
 * Writing needs the permission that edits the list itself.
 */

require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/permissions.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('GET, POST, OPTIONS');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    exit;
}
if ($method !== 'GET' && $method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'code' => 'method_not_allowed']);
    exit;
}

$sessionUser = ccrm_require_auth();

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'code' => 'not_installed']);
    exit;
}
require_once $configFile;

/** The lists that can carry icons, and the permission that edits each. */
function ccrm_list_icon_kinds(): array
{
    return [
        'leadSources' => 'traffic_sources',
        'divisions' => 'traffic_sources',
        'leadCategories' => 'traffic_sources',
        'offerCategories' => 'invoices',
        'financialCategories' => 'financial',
    ];
}

/** Name lists match case-insensitively; category ids are kept verbatim. */
function ccrm_list_icon_key(string $kind, $key): string
{
    $k = trim((string)$key);
    if ($kind === 'offerCategories' || $kind === 'financialCategories') {
        return $k;
    }
    return function_exists('mb_strtolower') ? mb_strtolower($k, 'UTF-8') : strtolower($k);
}

function ccrm_list_icons_decode($raw): array
{
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data)) {
        return [];
    }
    $out = [];
    foreach (ccrm_list_icon_kinds() as $kind => $_perm) {
        if (isset($data[$kind]) && is_array($data[$kind]) && $data[$kind]) {
            $out[$kind] = $data[$kind];
        }
    }
    return $out;
}

function ccrm_list_icons_json(array $icons): string
{
    // An empty kind encodes as {} so the client always sees objects.
    $shaped = [];
    foreach ($icons as $kind => $entries) {
        if (is_array($entries) && $entries) {
            $shaped[$kind] = (object)$entries;
        }
    }
    return json_encode((object)$shaped, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(503);
    echo json_encode(['success' => false, 'code' => 'database_unavailable']);
    exit;
}

if ($method === 'GET') {
    try {
        $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'LIST_ICONS' LIMIT 1")->fetchColumn();
        echo '{"success":true,"icons":' . ccrm_list_icons_json(ccrm_list_icons_decode($raw)) . '}';
    } catch (\Throwable $e) {
        ccrm_log_exception($e);
        http_response_code(503);
        echo json_encode(['success' => false, 'code' => 'database_unavailable']);
    }
    exit;
}

// ---- POST -----------------------------------------------------------------

$payload = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'code' => 'bad_request']);
    exit;
}

$kinds = ccrm_list_icon_kinds();
$kind = (string)($payload['kind'] ?? '');
if (!isset($kinds[$kind])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'code' => 'unknown_kind']);
    exit;
}

$perms = ccrm_user_permissions($pdo, $sessionUser);
if (!ccrm_is_admin($sessionUser) && !ccrm_perm_can_edit($perms, $kinds[$kind])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'code' => 'forbidden']);
    exit;
}

$isRename = array_key_exists('from', $payload) || array_key_exists('to', $payload);
if ($isRename) {
    $from = ccrm_list_icon_key($kind, $payload['from'] ?? '');
    $to = ccrm_list_icon_key($kind, $payload['to'] ?? '');
    if ($from === '' || $to === '' || strlen($from) > 200 || strlen($to) > 200) {
        http_response_code(400);
        echo json_encode(['success' => false, 'code' => 'bad_request']);
        exit;
    }
} else {
    $key = ccrm_list_icon_key($kind, $payload['key'] ?? '');
    $icon = $payload['icon'] ?? null;
    $icon = ($icon === null || $icon === '') ? null : (string)$icon;
    // Twemoji names: lower-case words joined by dashes. The client checks the id
    // against the sprite; this only keeps junk out of the settings row.
    if ($key === '' || strlen($key) > 200 || ($icon !== null && !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $icon)) || ($icon !== null && strlen($icon) > 64)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'code' => 'bad_request']);
        exit;
    }
}

try {
    $pdo->beginTransaction();
    // Lock the row so two people picking icons at once do not drop each other's change.
    $stmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'LIST_ICONS' FOR UPDATE");
    $icons = ccrm_list_icons_decode($stmt->fetchColumn());
    $entries = $icons[$kind] ?? [];

    if ($isRename) {
        if ($from !== $to && array_key_exists($from, $entries)) {
            $entries[$to] = $entries[$from];
            unset($entries[$from]);
        }
    } elseif ($icon === null) {
        unset($entries[$key]);
    } else {
        $entries[$key] = $icon;
    }

    if ($entries) {
        $icons[$kind] = $entries;
    } else {
        unset($icons[$kind]);
    }
    $json = ccrm_list_icons_json($icons);
    $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('LIST_ICONS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
        ->execute([$json]);
    $pdo->commit();

    echo '{"success":true,"icons":' . $json . '}';
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'code' => 'save_failed']);
}
