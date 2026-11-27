<?php
/**
 * Offline check that api/time_allocation.php agrees with src/utils/timeAllocation.ts on the
 * shared fixtures, and holds invariants I1-I4 (docs/TIME-TRACKING-V2.md, D2). No database.
 * Run:  php scripts/test-time-allocation.php   (npm run test:time-allocation)
 */
chdir(dirname(__DIR__));
require_once __DIR__ . '/../public/api/time_allocation.php';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok ? '' : "  $detail") . "\n";
    if (!$ok) { $fails++; }
};

$sorted = function (array $m): array { ksort($m, SORT_STRING); return $m; };

/** I1-I4 for one input; returns '' when all hold, else the first broken one. */
$invariants = function (array $entries) use ($sorted): string {
    $worked = ccrm_ta_allocate($entries);
    if (array_sum($worked) !== ccrm_ta_union_length_ms($entries)) { return 'I1'; }
    foreach ($entries as $e) {
        $w = $worked[(string)$e['id']];
        if (!is_int($w)) { return 'int'; }
        $dur = max(0, $e['endMs'] - $e['startMs']);
        if ($w > $dur || ($dur > 0 && $w <= 0)) { return 'I3 ' . $e['id']; }
        $alone = $dur > 0;
        foreach ($entries as $o) {
            if ($o === $e || $o['endMs'] <= $o['startMs']) { continue; }
            if ($o['endMs'] > $e['startMs'] && $o['startMs'] < $e['endMs']) { $alone = false; }
        }
        if ($alone && $w !== $dur) { return 'I2 ' . $e['id']; }
    }
    if ($sorted(ccrm_ta_allocate(array_reverse($entries))) !== $sorted($worked)) { return 'I4'; }
    return '';
};

$fixtures = json_decode((string)file_get_contents(__DIR__ . '/fixtures/time-allocation-cases.json'), true);
foreach ($fixtures['cases'] as $case) {
    $entries = $case['entries'];
    $worked = ccrm_ta_allocate($entries);
    $ok = $sorted($worked) === $sorted($case['expect']);
    $broken = $invariants($entries);
    if (isset($case['rate'])) {
        foreach ($case['expectCost'] ?? [] as $id => $cost) {
            $ok = $ok && round($worked[$id] / 3600000 * $case['rate'], 4) === (float)$cost;
        }
        $ok = $ok && round(array_sum($worked) / 3600000 * $case['rate'], 2) === (float)$case['expectTotalCost'];
    }
    if (isset($case['billableRate'])) {
        $total = 0.0;
        foreach ($entries as $e) {
            $billable = round(($e['endMs'] - $e['startMs']) / 3600000 * $case['billableRate'], 2);
            $ok = $ok && $billable === (float)$case['expectBillable'][$e['id']];
            $total += $billable;
        }
        $ok = $ok && round($total, 2) === (float)$case['expectBillableTotal'];
    }
    $check($case['name'], $ok && $broken === '', json_encode(['got' => $worked, 'invariant' => $broken]));
}
$check('fixtures list the four invariants', array_map(fn($s) => substr($s, 0, 3), $fixtures['invariants']) === ['I1.', 'I2.', 'I3.', 'I4.']);
$check('hours-only: worked = duration', ccrm_ta_worked_ms_hours_only(5400) === 5400000);
$check('empty input', ccrm_ta_allocate([]) === []);

// Deterministic pseudo-random cases (a seeded LCG, so every PHP version draws the same ones).
$seed = 20261119;
$rnd = function () use (&$seed): float {
    $seed = ($seed * 1103515245 + 12345) % 2147483648;
    return $seed / 2147483648;
};
$alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
$t0 = 1777885200000;
$randomBroken = [];
for ($c = 0; $c < 200; $c++) {
    $n = 1 + (int)floor($rnd() * 9);
    $ids = [];
    while (count($ids) < $n) {
        $id = '';
        $len = 1 + (int)floor($rnd() * 3);
        for ($k = 0; $k < $len; $k++) { $id .= $alphabet[(int)floor($rnd() * strlen($alphabet))]; }
        $ids[$id] = true;
    }
    $entries = [];
    foreach (array_keys($ids) as $id) {
        $start = $t0 + (int)floor($rnd() * 12) * 900000 + ($rnd() < 0.3 ? (int)floor($rnd() * 1000) : 0);
        $len = $rnd() < 0.05 ? 0 : (int)floor($rnd() * 8) * 900000 + ($rnd() < 0.3 ? (int)floor($rnd() * 1000) : 0);
        $entries[] = ['id' => (string)$id, 'startMs' => $start, 'endMs' => $start + $len];
    }
    $broken = $invariants($entries);
    if ($broken !== '') { $randomBroken[] = "#$c $broken"; }
}
$check('200 seeded random cases satisfy I1-I4', !$randomBroken, implode(', ', $randomBroken));

echo $fails === 0 ? "\nAll checks passed.\n" : "\n$fails check(s) FAILED.\n";
exit($fails === 0 ? 0 : 1);
