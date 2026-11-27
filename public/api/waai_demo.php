<?php
/**
 * The WhatsApp demo dataset for the in-browser demo (docs/WHATSAPP-DEMO-MODULE.md C3, B1-B3).
 *
 *   GET - {success, edition, dataset}: the parsed `demo_seed/whatsapp_demo.<edition>.json` of the language the
 *         demo was seeded in, so chat links, task ids and names match the CRM rows the seeder wrote.
 *
 * The browser builds a fake WAAI from this file (src/components/whatsapp/demo/); nothing is stored or sent
 * anywhere. Session-authenticated like `waai_sso.php` and needs the same `whatsapp` permission. Answers 404
 * unless the instance is a demo (DEMO_MODE = 'true'), so a real instance never serves demo chats.
 * No database writes and no logging of the content.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
ccrm_send_cors('GET, OPTIONS');

if (!function_exists('ccrm_waai_demo_reply')) {
    function ccrm_waai_demo_reply(int $status, array $body): never {
        http_response_code($status);
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    function ccrm_waai_demo_setting(\PDO $pdo, string $key): ?string {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
        $stmt->execute([$key]);
        $v = $stmt->fetchColumn();
        return $v === false || $v === null ? null : (string)$v;
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

$sessionUser = ccrm_require_auth();

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    header('Allow: GET');
    ccrm_waai_demo_reply(405, ['success' => false, 'code' => 'method_not_allowed']);
}

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    error_log('[waai_demo] database connection failed: ' . $e->getMessage());
    ccrm_waai_demo_reply(500, ['success' => false, 'code' => 'server_error']);
}

try {
    $scope = ccrm_read_scope($pdo, $sessionUser);
    if (!ccrm_can($scope, 'whatsapp', 'view')) {
        ccrm_waai_demo_reply(403, ['success' => false, 'code' => 'forbidden']);
    }
    // Demo instances only: the same flag `demo_reseed.php` reads.
    if (ccrm_waai_demo_setting($pdo, 'DEMO_MODE') !== 'true') {
        ccrm_waai_demo_reply(404, ['success' => false]);
    }

    // The edition the demo was seeded in: SYSTEM_LANGUAGE, as demo_ctx() reads it (without loading the seeder).
    $edition = ccrm_waai_demo_setting($pdo, 'SYSTEM_LANGUAGE');
    $edition = in_array($edition, ['sk', 'hu', 'en'], true) ? $edition : 'sk';

    $raw = @file_get_contents(__DIR__ . '/demo_seed/whatsapp_demo.' . $edition . '.json');
    $dataset = $raw === false ? null : json_decode($raw, true);
    if (!is_array($dataset)) {
        error_log('[waai_demo] dataset file for edition ' . $edition . ' is missing or not JSON');
        ccrm_waai_demo_reply(500, ['success' => false, 'code' => 'server_error']);
    }
    ccrm_waai_demo_reply(200, ['success' => true, 'edition' => $edition, 'dataset' => $dataset]);
} catch (\Throwable $e) {
    error_log('[waai_demo] ' . get_class($e) . ': ' . $e->getMessage());
    ccrm_waai_demo_reply(500, ['success' => false, 'code' => 'server_error']);
}
