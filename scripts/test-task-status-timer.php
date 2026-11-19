<?php
/**
 * Offline check that api/time_status_rule.php agrees with src/utils/taskStatusTimer.ts on the shared
 * fixtures (D10.2). No database.
 * Run:  php scripts/test-task-status-timer.php   (npm run test:task-status-timer)
 */
chdir(dirname(__DIR__));
require_once __DIR__ . '/../public/api/time_status_rule.php';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok ? '' : "  $detail") . "\n";
    if (!$ok) { $fails++; }
};

$fixtures = json_decode((string)file_get_contents(__DIR__ . '/fixtures/task-status-timer-cases.json'), true);
foreach ($fixtures['cases'] as $case) {
    $map = array_key_exists('map', $case) ? $case['map'] : $fixtures['map'];
    $got = ccrm_tt_timer_action_for_status_change($case['old'], $case['new'], $map);
    $check($case['name'], $got === $case['expect'], json_encode(['got' => $got]));
}
$check('a numeric-looking status name maps too', ccrm_tt_timer_action_for_status_change('0', '1', ['1' => 'pause']) === 'pause');
$check('normalize drops invalid values', ccrm_tt_normalize_status_timer_map(['A' => 'start', 'B' => 'go', 'C' => null]) === ['A' => 'start']);
$check('normalize of a non-array is empty', ccrm_tt_normalize_status_timer_map(null) === [] && ccrm_tt_normalize_status_timer_map('x') === []);

echo $fails ? "\n$fails failed\n" : "\nall passed\n";
exit($fails ? 1 : 0);
