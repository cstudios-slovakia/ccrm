<?php
/**
 * Public holidays of Slovakia and Hungary for time tracking.
 *
 *   GET ?country=SK|HU&year=YYYY     -> { success, country, year, days: [{date, ruleId, localName, nameEn, source}], fallback }
 *
 * `fallback: true` means the API could not be reached and nothing was cached: the days
 * are the built-in statutory list (Settings shows an amber note). Names are not
 * translated here — the browser names a day from its `ruleId` in the UI language and
 * falls back to localName / nameEn for days it does not know.
 *
 * Read-only and open to every signed-in user: the working-day calendar is not secret
 * and every time-tracking view needs it. The Nager.Date fetch lives in holidays_lib.php.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/holidays_lib.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('GET, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'code' => 'method_not_allowed']);
    exit;
}

ccrm_require_auth();

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'code' => 'not_installed']);
    exit;
}
require_once $configFile;

$country = strtoupper(trim((string)($_GET['country'] ?? '')));
$year = (int)($_GET['year'] ?? 0);
if (!in_array($country, ccrm_holiday_countries(), true) || $year < 2000 || $year > 2100) {
    http_response_code(400);
    echo json_encode(['success' => false, 'code' => 'bad_request']);
    exit;
}

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
    $result = ccrm_holidays_year($pdo, $country, $year, true);
    echo json_encode(
        ['success' => true, 'country' => $country, 'year' => $year, 'days' => $result['days'], 'fallback' => $result['fallback']],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
} catch (\Throwable $e) {
    ccrm_log_exception($e);
    http_response_code(503);
    echo json_encode(['success' => false, 'code' => 'database_unavailable']);
}
