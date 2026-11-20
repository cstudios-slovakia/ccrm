<?php
/**
 * Marketing ROI for the Performance Dashboard (src/utils/marketingRoi.ts): session auth, never the
 * sync.php blob.
 *
 *   POST /api/marketing_roi.php   JSON { action: 'get' }
 *        -> { success, config, newsletter: [{ id, name, sentAt, recipients: [[leadId|null, email, sentAt]] }] }
 *   POST /api/marketing_roi.php   JSON { action: 'save', config }
 *        -> { success, config }   (the normalised config that was stored)
 *
 * The config lives in system_settings under MARKETING_ROI_CONFIG; it holds no column, so there is
 * no schema change. Reading needs the `overview` (dashboard) or `general_config` permission,
 * saving needs `general_config` at edit level, like the other Settings → Integrations sections.
 * The recipient list (e-mails, record ids) goes only to users who may see the newsletter module;
 * everyone else gets `newsletter: null` and the dashboard says the newsletter is not available.
 *
 * Only recipients whose e-mail actually went out (status `sent`) are returned: they are the
 * touches the dashboard credits invoices to. Costs and invoices are already on the client.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

$sessionUser = ccrm_require_auth();

function ccrm_mroi_respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode(['success' => $status < 400] + $payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Same rules as normalizeMarketingRoiConfig() in src/utils/marketingRoi.ts. */
function ccrm_marketing_roi_normalize($raw): array {
    $src = is_array($raw) ? $raw : [];
    $ids = static function ($list): array {
        if (!is_array($list)) {
            return [];
        }
        $out = [];
        foreach ($list as $v) {
            // Values, not array keys: PHP turns a numeric-string key into an int, and the
            // client drops anything that is not a string.
            if (is_string($v) && trim($v) !== '' && !in_array(trim($v), $out, true)) {
                $out[] = trim($v);
            }
        }
        return $out;
    };
    $channels = [];
    if (isset($src['sourceChannels']) && is_array($src['sourceChannels'])) {
        foreach ($src['sourceChannels'] as $source => $channel) {
            $key = mb_strtolower(trim((string)$source), 'UTF-8');
            if ($key !== '' && in_array($channel, ['social', 'meta_ads', 'google_ads'], true)) {
                $channels[$key] = $channel;
            }
        }
    }
    $days = isset($src['newsletterWindowDays']) && is_numeric($src['newsletterWindowDays'])
        ? (int)round((float)$src['newsletterWindowDays'])
        : 30;
    return [
        'newsletterCostCategoryIds' => $ids($src['newsletterCostCategoryIds'] ?? []),
        'socialCostCategoryIds' => $ids($src['socialCostCategoryIds'] ?? []),
        // Always an object: an empty map, or one keyed 0..n, would otherwise encode as a list.
        'sourceChannels' => (object)$channels,
        'newsletterWindowDays' => $days >= 1 ? min(365, $days) : 30,
    ];
}

function ccrm_marketing_roi_load(\PDO $pdo): array {
    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'MARKETING_ROI_CONFIG'");
        $stmt->execute();
        $raw = $stmt->fetchColumn();
    } catch (\Throwable $e) {
        $raw = null;
    }
    $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    return ccrm_marketing_roi_normalize($decoded);
}

function ccrm_mroi_iso(?string $utc): ?string {
    if ($utc === null || $utc === '') {
        return null;
    }
    try {
        return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z');
    } catch (\Throwable $e) {
        return null;
    }
}

/** Every campaign that delivered at least one e-mail, with the recipients it reached. */
function ccrm_marketing_roi_newsletter(\PDO $pdo): array {
    try {
        $campaigns = $pdo->query(
            "SELECT `id`, `name`, `started_at`, `finished_at` FROM `newsletter_campaigns`
              WHERE `deleted_at` IS NULL AND `status` IN ('sending', 'paused', 'sent', 'cancelled')"
        )->fetchAll(\PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
        return [];
    }
    if (!$campaigns) {
        return [];
    }
    $byId = [];
    foreach ($campaigns as $c) {
        $byId[(string)$c['id']] = [
            'id' => (string)$c['id'],
            'name' => (string)$c['name'],
            'sentAt' => null,
            'recipients' => [],
        ];
    }
    $stmt = $pdo->query(
        "SELECT `campaign_id`, `lead_id`, `email`, `sent_at` FROM `newsletter_recipients`
          WHERE `status` = 'sent' AND `sent_at` IS NOT NULL ORDER BY `sent_at`"
    );
    while ($r = $stmt->fetch(\PDO::FETCH_ASSOC)) {
        $cid = (string)$r['campaign_id'];
        if (!isset($byId[$cid])) {
            continue;
        }
        $sentAt = ccrm_mroi_iso($r['sent_at']);
        if ($sentAt === null) {
            continue;
        }
        if ($byId[$cid]['sentAt'] === null) {
            $byId[$cid]['sentAt'] = $sentAt;
        }
        $leadId = $r['lead_id'] !== null && $r['lead_id'] !== '' ? (string)$r['lead_id'] : null;
        $byId[$cid]['recipients'][] = [$leadId, (string)$r['email'], $sentAt];
    }
    return array_values(array_filter($byId, static fn ($c) => $c['sentAt'] !== null));
}

// get_db_connection() lives in config.php; without it the call below throws and every request
// answered `database_unavailable` although the database was fine.
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    ccrm_mroi_respond(['code' => 'not_installed'], 503);
}
require_once $configFile;
try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_mroi_respond(['code' => 'database_unavailable'], 503);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    ccrm_mroi_respond(['code' => 'method_not_allowed'], 405);
}

$scope = ccrm_read_scope($pdo, $sessionUser);
$decoded = json_decode((string)file_get_contents('php://input'), true);
$body = is_array($decoded) ? $decoded : [];
$action = trim((string)($body['action'] ?? ''));

try {
    if ($action === 'get') {
        if (!ccrm_can($scope, 'overview') && !ccrm_can($scope, 'general_config')) {
            ccrm_mroi_respond(['code' => 'forbidden'], 403);
        }
        ccrm_mroi_respond([
            'config' => ccrm_marketing_roi_load($pdo),
            'newsletter' => ccrm_can($scope, 'newsletter') ? ccrm_marketing_roi_newsletter($pdo) : null,
        ]);
    }
    if ($action === 'save') {
        if (!ccrm_can($scope, 'general_config', 'edit')) {
            ccrm_mroi_respond(['code' => 'forbidden'], 403);
        }
        $config = ccrm_marketing_roi_normalize($body['config'] ?? null);
        $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES ('MARKETING_ROI_CONFIG', ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        )->execute([json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        ccrm_mroi_respond(['config' => $config]);
    }
    ccrm_mroi_respond(['code' => 'unknown_action'], 400);
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    ccrm_mroi_respond(['code' => 'server_error'], 500);
}
