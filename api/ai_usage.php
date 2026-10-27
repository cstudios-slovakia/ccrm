<?php
/**
 * Monthly AI usage ledger.
 *
 * GET  ?month=YYYY-MM  — sums for that month, plus every month that has rows.
 *      Requires ai_config at view (the same permission as Settings → AI & agents).
 * POST                  — a voice call reporting tokens the server never sees,
 *      because the Realtime session bills on the browser's data channel.
 *      Any signed-in user may report a call they just made. Feature and model
 *      are limited to the voice ids; prices are not accepted from the client.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

$sessionUser = ccrm_require_auth();

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'code' => 'not_installed']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'code' => 'db_error']);
    exit;
}

$int = static function ($value): int {
    if (!is_numeric($value)) {
        return 0;
    }
    return max(0, min((int)$value, 50000000));
};

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'code' => 'bad_request']);
        exit;
    }
    $feature = (string)($body['feature'] ?? '');
    $model = trim((string)($body['model'] ?? ''));
    $allowed = [
        'voice_call' => '/^gpt-realtime[A-Za-z0-9._-]{0,40}$/',
        'live_transcription' => '/^gpt-live-transcribe[A-Za-z0-9._-]{0,20}$/',
    ];
    if (!isset($allowed[$feature]) || !preg_match($allowed[$feature], $model)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'code' => 'bad_request']);
        exit;
    }
    ccrm_ai_record_usage(
        $pdo,
        $feature,
        $model,
        $int($body['inputTokens'] ?? 0),
        $int($body['outputTokens'] ?? 0),
        $int($body['cachedInputTokens'] ?? 0),
        $int($body['inputAudioTokens'] ?? 0),
        $int($body['outputAudioTokens'] ?? 0),
        is_numeric($body['audioSeconds'] ?? null) ? (float)$body['audioSeconds'] : 0
    );
    echo json_encode(['success' => true]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'code' => 'method']);
    exit;
}

ccrm_require_perm($pdo, $sessionUser, 'ai_config', 'view');

$month = (string)($_GET['month'] ?? date('Y-m'));
if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
    $month = date('Y-m');
}
$start = $month . '-01 00:00:00';
$end = date('Y-m-d H:i:s', strtotime($start . ' +1 month'));

try {
    ccrm_ai_usage_ensure($pdo);
    $stmt = $pdo->prepare(
        "SELECT `feature`, `model`,
                SUM(`input_tokens`) AS input_tokens,
                SUM(`cached_input_tokens`) AS cached_input_tokens,
                SUM(`output_tokens`) AS output_tokens,
                SUM(`input_audio_tokens`) AS input_audio_tokens,
                SUM(`output_audio_tokens`) AS output_audio_tokens,
                SUM(`audio_seconds`) AS audio_seconds,
                COUNT(*) AS calls
           FROM `ai_usage`
          WHERE `created_at` >= ? AND `created_at` < ?
          GROUP BY `feature`, `model`"
    );
    $stmt->execute([$start, $end]);
    $rows = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $rows[] = [
            'feature' => $row['feature'],
            'model' => $row['model'],
            'calls' => (int)$row['calls'],
            'inputTokens' => (int)$row['input_tokens'],
            'cachedInputTokens' => (int)$row['cached_input_tokens'],
            'outputTokens' => (int)$row['output_tokens'],
            'inputAudioTokens' => (int)$row['input_audio_tokens'],
            'outputAudioTokens' => (int)$row['output_audio_tokens'],
            'audioSeconds' => (float)$row['audio_seconds'],
        ];
    }
    $months = $pdo->query(
        "SELECT DISTINCT DATE_FORMAT(`created_at`, '%Y-%m') AS ym FROM `ai_usage` ORDER BY ym DESC"
    )->fetchAll(PDO::FETCH_COLUMN);
} catch (\Throwable $e) {
    error_log('[ccrm ai usage] read failed: ' . $e->getMessage());
    $rows = [];
    $months = [];
}

echo json_encode([
    'success' => true,
    'month' => $month,
    'months' => array_values(array_filter($months, 'is_string')),
    'rows' => $rows,
]);
