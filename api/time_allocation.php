<?php
/**
 * Time tracking v2: the allocation engine (docs/TIME-TRACKING-V2.md, D2) — pure.
 *
 * A PORT of src/utils/timeAllocation.ts. Same algorithm, same tie breaking, same fixtures
 * (scripts/fixtures/time-allocation-cases.json, run by `npm run test:unit` and
 * `npm run test:time-allocation`). Change both files in the same commit.
 *
 * Splits ONE person's real clock time between their overlapping timed entries:
 *   1. Every start and end, sorted, duplicates dropped. Two neighbours bound one stretch.
 *   2. A stretch of `len` ms with n >= 1 active entries gives each intdiv(len, n); the
 *      remainder len % n goes 1 ms each to the first active entries ordered by startMs
 *      ascending, then id ascending (strcmp; keep ids ASCII so TypeScript agrees).
 *   3. worked_ms(entry) = the sum of its shares.
 *
 * Integer milliseconds (PHP ints are 64-bit). No database, no clock: a running entry is passed
 * with the end of the settle window. Hours-only and deleted entries are not passed.
 */

if (!function_exists('ccrm_ta_allocate')) {

    /**
     * @param array $entries list of ['id' => string, 'startMs' => int, 'endMs' => int]; ids unique
     * @return array id => worked ms (int). Every input id is present; endMs <= startMs gives 0.
     *               Note: PHP turns a decimal-integer string key such as "42" into int 42.
     */
    function ccrm_ta_allocate(array $entries): array {
        $worked = [];
        $timed = [];
        foreach ($entries as $e) {
            $id = (string)$e['id'];
            $start = (int)$e['startMs'];
            $end = (int)$e['endMs'];
            $worked[$id] = 0;
            if ($end > $start) {
                $timed[] = ['id' => $id, 'startMs' => $start, 'endMs' => $end];
            }
        }
        if (!$timed) {
            return $worked;
        }

        usort($timed, function (array $a, array $b): int {
            if ($a['startMs'] !== $b['startMs']) {
                return $a['startMs'] <=> $b['startMs'];
            }
            return strcmp($a['id'], $b['id']);
        });
        $points = [];
        foreach ($timed as $e) {
            $points[$e['startMs']] = true;
            $points[$e['endMs']] = true;
        }
        $bounds = array_keys($points);
        sort($bounds, SORT_NUMERIC);

        // $active stays ordered by (startMs, id): entries are appended in that order.
        $active = [];
        $next = 0;
        $count = count($timed);
        $last = count($bounds) - 1;
        for ($i = 0; $i < $last; $i++) {
            $from = $bounds[$i];
            $to = $bounds[$i + 1];
            if ($active) {
                $active = array_values(array_filter($active, fn(array $e) => $e['endMs'] > $from));
            }
            while ($next < $count && $timed[$next]['startMs'] === $from) {
                $active[] = $timed[$next++];
            }
            $n = count($active);
            if ($n === 0) {
                continue;
            }
            $len = $to - $from;
            $share = intdiv($len, $n);
            $extra = $len % $n;
            foreach ($active as $k => $e) {
                $worked[$e['id']] += $share + ($k < $extra ? 1 : 0);
            }
        }
        return $worked;
    }

    /** Hours-only entries have no interval: their worked time is their duration (C15). */
    function ccrm_ta_worked_ms_hours_only($durationSec): int {
        return (int)round((float)$durationSec * 1000);
    }

    /** Length of the union of the intervals in ms (invariant I1). */
    function ccrm_ta_union_length_ms(array $entries): int {
        $timed = array_values(array_filter($entries, fn($e) => (int)$e['endMs'] > (int)$e['startMs']));
        usort($timed, fn($a, $b) => (int)$a['startMs'] <=> (int)$b['startMs']);
        $total = 0;
        $curStart = 0;
        $curEnd = null;
        foreach ($timed as $e) {
            $s = (int)$e['startMs'];
            $t = (int)$e['endMs'];
            if ($curEnd === null || $s > $curEnd) {
                if ($curEnd !== null) {
                    $total += $curEnd - $curStart;
                }
                $curStart = $s;
                $curEnd = $t;
            } elseif ($t > $curEnd) {
                $curEnd = $t;
            }
        }
        if ($curEnd !== null) {
            $total += $curEnd - $curStart;
        }
        return $total;
    }
}
