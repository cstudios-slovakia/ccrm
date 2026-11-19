<?php
/**
 * Time tracking v2: the ONLY code that writes `time_entries.worked_ms` and `time_entries.cost`
 * (docs/TIME-TRACKING-V2.md, D3.3). The guard test scripts/agent/time-cost-writers.test.mjs
 * fails when any other file under public/api writes either column.
 *
 *   ccrm_tt_settle($pdo, $userId, $fromUtc, $toUtc)
 *     S1     = the user's closed, timed, not-deleted entries intersecting [from, to].
 *     inputs = all the user's timed, not-deleted entries (running ones end "now") that intersect
 *              the span of S1 and [from, to]; run through ccrm_ta_allocate().
 *     For each S1 row: worked_ms = its share; cost = round4(worked_ms / 3 600 000 x cost_rate)
 *     with the row's frozen rate, or the rate of its entry_date month when it has none (that
 *     also freezes employee_id / cost_rate / cost_rate_source / cost_rate_basis_days).
 *     Hours-only entries (start_at NULL) whose entry_date falls on the local dates of
 *     [from, to]: worked_ms = duration_sec x 1000 (C15), priced the same way.
 *     A running entry of the user carries worked_ms NULL and cost NULL.
 *     Deleted entries keep their stored values (a restore re-settles them).
 *     Only rows whose values change are written.
 *
 * Every writer calls it inside its own transaction, after its change, with [from, to] = the
 * union of the entry's old and new interval (ccrm_tt_settle_rows() works that out from rows).
 * No DDL, no network (pricing passes $fetch = false; writers warm the holiday cache before
 * their transaction). Called outside a transaction it wraps its own.
 *
 * An entry's interval is [start_at, start_at + duration_sec] (D2); a running entry's is
 * [start_at, now], never ending before it starts.
 */

require_once __DIR__ . '/time_cost.php';
require_once __DIR__ . '/time_allocation.php';

if (!function_exists('ccrm_tt_settle')) {

    /** Epoch ms of a UTC "Y-m-d H:i:s" database value; null when empty or unparseable. */
    function ccrm_ts_ms($utc): ?int {
        if ($utc === null || $utc === '') {
            return null;
        }
        $t = strtotime((string)$utc . ' UTC');
        return $t === false ? null : $t * 1000;
    }

    /** UTC "Y-m-d H:i:s" of epoch ms. */
    function ccrm_ts_utc(int $ms): string {
        return gmdate('Y-m-d H:i:s', intdiv($ms, 1000));
    }

    /** Local (company timezone = PHP default) calendar date of epoch ms. */
    function ccrm_ts_local_date(int $ms): string {
        return (new \DateTimeImmutable('@' . intdiv($ms, 1000)))
            ->setTimezone(new \DateTimeZone(date_default_timezone_get()))->format('Y-m-d');
    }

    /** [startMs, endMs] of one local calendar day. */
    function ccrm_ts_local_day_ms(string $date): ?array {
        try {
            $tz = new \DateTimeZone(date_default_timezone_get());
            $start = new \DateTimeImmutable(substr($date, 0, 10) . ' 00:00:00', $tz);
        } catch (\Throwable $e) {
            return null;
        }
        return [$start->getTimestamp() * 1000, $start->modify('+1 day')->getTimestamp() * 1000 - 1000];
    }

    /**
     * The interval of a timed row in epoch ms, or null for an hours-only row.
     * Closed: [start, start + duration] (end_at when duration is missing). Running: [start, max(start, now)].
     */
    function ccrm_ts_interval(array $row, int $nowMs): ?array {
        $start = ccrm_ts_ms($row['start_at'] ?? null);
        if ($start === null) {
            return null;
        }
        $endAt = $row['end_at'] ?? null;
        if ($endAt === null || $endAt === '') {
            return [$start, max($start, $nowMs)];
        }
        $dur = $row['duration_sec'] ?? null;
        if ($dur !== null && $dur !== '' && is_numeric($dur)) {
            return [$start, $start + max(0, (int)$dur) * 1000];
        }
        return [$start, max($start, (int)ccrm_ts_ms($endAt))];
    }

    /**
     * The user's timed, not-deleted entries whose interval meets [fromMs, toMs]
     * (strictly overlapping when $strict). One query, filtered in PHP by the D2 interval.
     */
    function ccrm_ts_timed_rows(\PDO $pdo, string $userId, int $fromMs, int $toMs, bool $closedOnly, bool $strict, string $columns): array {
        // A closed entry is at most 24 h long (CCRM_TE_MAX_SECONDS); end_at catches older, longer ones.
        $sql = "SELECT {$columns} FROM `time_entries`
                 WHERE `user_id` = ? AND `deleted_at` IS NULL AND `start_at` IS NOT NULL" . ($closedOnly ? " AND `end_at` IS NOT NULL" : '') . "
                   AND `start_at` <= ? AND (`end_at` IS NULL OR `end_at` >= ? OR `start_at` >= ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$userId, ccrm_ts_utc($toMs), ccrm_ts_utc($fromMs), ccrm_ts_utc($fromMs - 86400000)]);
        $nowMs = time() * 1000;
        $out = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $iv = ccrm_ts_interval($r, $nowMs);
            if ($iv === null) {
                continue;
            }
            $meets = $strict ? ($iv[0] < $toMs && $iv[1] > $fromMs) : ($iv[0] <= $toMs && $iv[1] >= $fromMs);
            if ($meets) {
                $r['_iv'] = $iv;
                $out[] = $r;
            }
        }
        return $out;
    }

    /**
     * Timed, not-deleted entries of a user that strictly overlap [startUtc, endUtc] (running when
     * $endUtc is null), for the lock rule of D3.3. Full rows; $excludeId is left out.
     */
    function ccrm_tt_overlapping_entries(\PDO $pdo, string $userId, ?string $startUtc, ?string $endUtc, ?string $excludeId = null): array {
        $from = ccrm_ts_ms($startUtc);
        if ($from === null) {
            return [];
        }
        $to = ccrm_ts_ms($endUtc) ?? max($from, time() * 1000);
        if ($to <= $from) {
            return [];
        }
        $rows = ccrm_ts_timed_rows($pdo, $userId, $from, $to, false, true, '*');
        $out = [];
        foreach ($rows as $r) {
            if ($excludeId !== null && (string)$r['id'] === $excludeId) {
                continue;
            }
            unset($r['_iv']);
            $out[] = $r;
        }
        return $out;
    }

    /** Stored DECIMAL / INT vs a computed value: equal to the column's precision? */
    function ccrm_ts_same($stored, $new, int $decimals): bool {
        if ($stored === null || $new === null) {
            return $stored === null && $new === null;
        }
        return abs((float)$stored - (float)$new) < 0.5 * (10 ** -$decimals);
    }

    function ccrm_tt_settle(\PDO $pdo, string $userId, string $fromUtc, string $toUtc): void {
        $fromMs = ccrm_ts_ms($fromUtc);
        $toMs = ccrm_ts_ms($toUtc);
        if ($userId === '' || $fromMs === null || $toMs === null) {
            return;
        }
        if ($toMs < $fromMs) {
            [$fromMs, $toMs] = [$toMs, $fromMs];
        }
        $own = !$pdo->inTransaction();
        if ($own) {
            $pdo->beginTransaction();
        }
        try {
            ccrm_ts_settle_window($pdo, $userId, $fromMs, $toMs);
            if ($own) {
                $pdo->commit();
            }
        } catch (\Throwable $e) {
            if ($own && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    function ccrm_ts_settle_window(\PDO $pdo, string $userId, int $fromMs, int $toMs): void {
        // A running entry has no worked time and no cost yet (also after undo_start reopened one).
        $pdo->prepare("UPDATE `time_entries` SET `worked_ms` = NULL, `cost` = NULL
                        WHERE `user_id` = ? AND `start_at` IS NOT NULL AND `end_at` IS NULL AND `deleted_at` IS NULL
                          AND (`worked_ms` IS NOT NULL OR `cost` IS NOT NULL)")
            ->execute([$userId]);

        $cols = "`id`, `user_id`, `employee_id`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `worked_ms`, `cost`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`";
        $s1 = ccrm_ts_timed_rows($pdo, $userId, $fromMs, $toMs, true, false, $cols);
        $writes = [];
        if ($s1) {
            $spanFrom = $fromMs;
            $spanTo = $toMs;
            foreach ($s1 as $r) {
                $spanFrom = min($spanFrom, $r['_iv'][0]);
                $spanTo = max($spanTo, $r['_iv'][1]);
            }
            $inputs = [];
            foreach (ccrm_ts_timed_rows($pdo, $userId, $spanFrom, $spanTo, false, false, "`id`, `start_at`, `end_at`, `duration_sec`") as $r) {
                $inputs[] = ['id' => (string)$r['id'], 'startMs' => $r['_iv'][0], 'endMs' => $r['_iv'][1]];
            }
            $worked = ccrm_ta_allocate($inputs);
            foreach ($s1 as $r) {
                $writes[] = [$r, (int)($worked[(string)$r['id']] ?? 0)];
            }
        }

        // Hours-only entries on the local dates of the window (C15).
        $hours = $pdo->prepare("SELECT {$cols} FROM `time_entries`
                                 WHERE `user_id` = ? AND `deleted_at` IS NULL AND `start_at` IS NULL
                                   AND `entry_date` >= ? AND `entry_date` <= ?");
        $hours->execute([$userId, ccrm_ts_local_date($fromMs), ccrm_ts_local_date($toMs)]);
        foreach ($hours->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $writes[] = [$r, $r['duration_sec'] === null ? null : ccrm_ta_worked_ms_hours_only($r['duration_sec'])];
        }

        foreach ($writes as [$r, $workedMs]) {
            ccrm_ts_write($pdo, $r, $workedMs);
        }
    }

    /** Price one row from worked time and write it when anything changed. */
    function ccrm_ts_write(\PDO $pdo, array $r, ?int $workedMs): void {
        $rate = $r['cost_rate'] === null ? null : (float)$r['cost_rate'];
        $freeze = null;
        if ($rate === null) {
            $p = ccrm_ts_price($pdo, (string)$r['user_id'], (string)$r['entry_date']);
            if ($p !== null) {
                $rate = $p['cost_rate'] === null ? null : (float)$p['cost_rate'];
                $freeze = $p;
            }
        }
        $cost = ccrm_tc_worked_cost($workedMs, $rate);
        $changed = !ccrm_ts_same($r['worked_ms'], $workedMs, 0) || !ccrm_ts_same($r['cost'], $cost, 4);
        if ($freeze !== null) {
            $refreeze = (string)($r['employee_id'] ?? '') !== (string)($freeze['employee_id'] ?? '')
                || $rate !== null
                || (string)($r['cost_rate_source'] ?? '') !== (string)$freeze['cost_rate_source']
                || (string)($r['cost_rate_basis_days'] ?? '') !== (string)($freeze['cost_rate_basis_days'] ?? '');
            if ($refreeze) {
                $pdo->prepare("UPDATE `time_entries` SET `worked_ms` = ?, `cost` = ?, `employee_id` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ? WHERE `id` = ?")
                    ->execute([$workedMs, $cost, $freeze['employee_id'], $freeze['cost_rate'], $freeze['cost_rate_source'], $freeze['cost_rate_basis_days'], $r['id']]);
                return;
            }
        }
        if ($changed) {
            $pdo->prepare("UPDATE `time_entries` SET `worked_ms` = ?, `cost` = ? WHERE `id` = ?")
                ->execute([$workedMs, $cost, $r['id']]);
        }
    }

    /**
     * The month's rate for a row that has none: one ccrm_tt_price() per (user, month) per request,
     * never fetching. Null when time_entries_lib.php cannot be loaded (no pricing then).
     */
    function ccrm_ts_price(\PDO $pdo, string $userId, string $entryDate): ?array {
        static $cache = [];
        if ($userId === '' || !preg_match('/^\d{4}-\d{2}/', $entryDate)) {
            return null;
        }
        if (!function_exists('ccrm_tt_price')) {
            require_once __DIR__ . '/time_entries_lib.php';
        }
        $key = $userId . '|' . substr($entryDate, 0, 7);
        if (!array_key_exists($key, $cache)) {
            $p = ccrm_tt_price($pdo, $userId, substr($entryDate, 0, 7) . '-01', null, ccrm_tt_load_settings($pdo), false);
            $cache[$key] = [
                'employee_id' => $p['employee_id'],
                'cost_rate' => $p['cost_rate'],
                'cost_rate_source' => $p['cost_rate_source'],
                'cost_rate_basis_days' => $p['cost_rate_basis_days'],
            ];
        }
        return $cache[$key];
    }

    /**
     * Settle everything a write touched. $rows are time_entries rows (or arrays with at least
     * user_id, start_at, end_at, duration_sec, entry_date) BEFORE and AFTER the change; nulls are
     * skipped. Per user, the intervals are merged (gaps up to 31 days are bridged) and each
     * merged span is settled once. An hours-only row stands for its whole local day.
     */
    function ccrm_tt_settle_rows(\PDO $pdo, array $rows): void {
        $nowMs = time() * 1000;
        $byUser = [];
        foreach ($rows as $row) {
            if (!is_array($row) || empty($row['user_id'])) {
                continue;
            }
            $iv = ccrm_ts_interval($row, $nowMs);
            if ($iv !== null && !empty($row['end_at'])) {
                // Old rows may disagree between end_at and duration: cover both.
                $iv[1] = max($iv[1], (int)ccrm_ts_ms($row['end_at']));
            }
            if ($iv === null) {
                $iv = ccrm_ts_local_day_ms((string)($row['entry_date'] ?? ''));
            }
            if ($iv !== null) {
                $byUser[(string)$row['user_id']][] = $iv;
            }
        }
        foreach ($byUser as $userId => $ivs) {
            usort($ivs, fn($a, $b) => $a[0] <=> $b[0]);
            $cur = null;
            foreach ($ivs as $iv) {
                if ($cur !== null && $iv[0] <= $cur[1] + 31 * 86400000) {
                    $cur[1] = max($cur[1], $iv[1]);
                    continue;
                }
                if ($cur !== null) {
                    ccrm_tt_settle($pdo, (string)$userId, ccrm_ts_utc($cur[0]), ccrm_ts_utc($cur[1]));
                }
                $cur = $iv;
            }
            if ($cur !== null) {
                ccrm_tt_settle($pdo, (string)$userId, ccrm_ts_utc($cur[0]), ccrm_ts_utc($cur[1]));
            }
        }
    }
}
