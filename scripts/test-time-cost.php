<?php
/**
 * Offline check that api/time_cost.php and api/holidays_lib.php agree with the TypeScript
 * (src/utils/timeCost.ts, holidays.ts) on the shared fixtures. No database.
 * Run:  php scripts/test-time-cost.php   (npm run test:time-cost)
 */
chdir(dirname(__DIR__));
require_once __DIR__ . '/../public/api/time_cost.php';
require_once __DIR__ . '/../public/api/holidays_lib.php';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok ? '' : "  $detail") . "\n";
    if (!$ok) { $fails++; }
};

$fixtures = json_decode((string)file_get_contents(__DIR__ . '/fixtures/time-cost-cases.json'), true);
foreach ($fixtures['cases'] as $case) {
    $settings = $case['settings'] ?? $fixtures['settings'];
    $r = ccrm_tc_cost_rate($case['person'], (int)$case['workingDays'], $settings);
    $cost = ccrm_tc_entry_cost($case['durationSec'], $r['rate']);
    $e = $case['expect'];
    $ok = $r['rate'] === ($e['rate'] === null ? null : (float)$e['rate'])
        && $r['source'] === $e['source']
        && $r['basisDays'] === $e['basisDays']
        && $cost === ($e['cost'] === null ? null : (float)$e['cost']);
    $check($case['name'], $ok, json_encode(['got' => $r, 'cost' => $cost]));
}
$check('fixtures use the default settings', $fixtures['settings'] == ccrm_tc_default_settings());

// Working days of the months the fixtures rely on, with no database (override list is empty).
$days = function (string $country, int $year, int $month) {
    $holidays = [];
    foreach (ccrm_holidays_builtin($country, $year) as $h) { $holidays[$h['date']] = true; }
    $n = 0;
    $last = (int)date('t', strtotime(sprintf('%04d-%02d-01', $year, $month)));
    for ($d = 1; $d <= $last; $d++) {
        $date = sprintf('%04d-%02d-%02d', $year, $month, $d);
        if (!isset($holidays[$date]) && ccrm_holiday_is_weekday($date)) { $n++; }
    }
    return $n;
};
$check('SK May 2026 = 20', $days('SK', 2026, 5) === 20);
$check('SK Jun 2026 = 22', $days('SK', 2026, 6) === 22);
$check('SK Sep 2026 = 22', $days('SK', 2026, 9) === 22);
$check('SK Oct 2026 = 22', $days('SK', 2026, 10) === 22);
$check('HU Oct 2026 = 21', $days('HU', 2026, 10) === 21);

$dates = fn(string $c, int $y) => array_column(ccrm_holidays_builtin($c, $y), 'date');
$check('SK 2026 rest days', $dates('SK', 2026) === ['2026-01-01','2026-01-06','2026-04-03','2026-04-06','2026-05-01','2026-07-05','2026-08-29','2026-11-01','2026-12-24','2026-12-25','2026-12-26']);
$check('HU 2026 rest days', $dates('HU', 2026) === ['2026-01-01','2026-03-15','2026-04-03','2026-04-05','2026-04-06','2026-05-01','2026-05-24','2026-05-25','2026-08-20','2026-10-23','2026-11-01','2026-12-25','2026-12-26']);
$check('SK 2027 has 8 May and 15 Sept again', in_array('2027-05-08', $dates('SK', 2027), true) && in_array('2027-09-15', $dates('SK', 2027), true));
$check('Easter 2026 = 2026-04-05', ccrm_easter_sunday(2026) === '2026-04-05');

echo $fails === 0 ? "\nAll checks passed.\n" : "\n$fails check(s) FAILED.\n";
exit($fails === 0 ? 0 : 1);
