<?php
/**
 * Time tracking v2: the ONLY code that writes `time_entries.worked_ms` and `time_entries.cost`
 * (docs/TIME-TRACKING-V2.md, D3.3). The guard test scripts/agent/time-cost-writers.test.mjs
 * fails when any other PHP file writes either column.
 *
 *   ccrm_tt_settle($pdo, $userId, $fromUtc, $toUtc, $force = false, $ownIds = [])
 *     S1     = the user's closed, timed, not-deleted entries intersecting [from, to].
 *     inputs = the user's timed, not-deleted entries (running ones end "now") that intersect
 *              the span of S1 and [from, to]; run through ccrm_ta_allocate().
 *     For each S1 row: worked_ms = its share; cost = round4(worked_ms / 3 600 000 x cost_rate)
 *     with the row's frozen rate, or the rate of its entry_date month when it has none (that
 *     also freezes employee_id / cost_rate / cost_rate_source / cost_rate_basis_days).
 *     Hours-only entries (start_at NULL) whose entry_date falls on the local dates of
 *     [from, to]: worked_ms = duration_sec x 1000 (C15), priced the same way.
 *     Every running entry of the user carries worked_ms NULL and cost NULL (several may run, D5.1).
 *     Deleted entries keep their stored values (a restore re-settles them).
 *     Only rows whose values change are written.
 *
 *   Locked history is never rewritten silently: a row whose values would change and that is
 *   locked (time_locks.php: older than lockAfterDays, closed payroll month, approved) keeps its
 *   stored worked_ms / cost. It still counts as an engine input. Exceptions: $force (the admin
 *   "Re-price a period" action), the rows the caller itself wrote ($ownIds), and rows never
 *   settled yet (worked_ms NULL: a new, imported or just stopped entry).
 *
 * Every writer calls it inside its own transaction, after its change, for the entry's old and its
 * new interval, each on its own (ccrm_tt_settle_rows() works them out from rows). No DDL, no
 * network (pricing passes $fetch = false; writers warm the holiday cache before their
 * transaction). Called outside a transaction it wraps its own.
 *
 * An entry's interval is [start_at, start_at + duration_sec] (D2); a running entry's is
 * [start_at, now], never ending before it starts. Timed rows are looked up by entry_date
 * (idx_te_user_date) from two days before the window's first local date to one day after its
 * last; an entry whose entry_date was typed far away from its own start is only seen when the
 * caller names it in $ownIds. The running rows are read through the indexed `running_guard`.
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

    /** Local (company timezone = PHP default) calendar date of epoch ms, optionally shifted by days. */
    function ccrm_ts_local_date(int $ms, int $shiftDays = 0): string {
        $d = (new \DateTimeImmutable('@' . intdiv($ms, 1000)))->setTimezone(new \DateTimeZone(date_default_timezone_get()));
        return ($shiftDays === 0 ? $d : $d->modify(($shiftDays > 0 ? '+' : '') . $shiftDays . ' days'))->format('Y-m-d');
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

    /** Every running entry of the user (indexed running_guard; several may run, D5.1). */
    function ccrm_ts_running_rows(\PDO $pdo, string $userId, string $columns): array {
        $stmt = $pdo->prepare("SELECT {$columns} FROM `time_entries` WHERE `running_guard` = ?");
        $stmt->execute([$userId]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    /**
     * The user's timed, not-deleted entries whose interval meets [fromMs, toMs] (strictly overlapping
     * when $strict): closed rows by entry_date, the running rows unless $closedOnly, and the $ownIds rows.
     */
    function ccrm_ts_timed_rows(\PDO $pdo, string $userId, int $fromMs, int $toMs, bool $closedOnly, bool $strict, string $columns, array $ownIds = []): array {
        $stmt = $pdo->prepare("SELECT {$columns} FROM `time_entries`
                                WHERE `user_id` = ? AND `entry_date` >= ? AND `entry_date` <= ?
                                  AND `deleted_at` IS NULL AND `start_at` IS NOT NULL AND `end_at` IS NOT NULL");
        $stmt->execute([$userId, ccrm_ts_local_date($fromMs, -2), ccrm_ts_local_date($toMs, 1)]);
        $candidates = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if (!$closedOnly) {
            array_push($candidates, ...ccrm_ts_running_rows($pdo, $userId, $columns));
        }
        $ownIds = array_values(array_unique(array_filter(array_map('strval', $ownIds), fn($id) => $id !== '')));
        if ($ownIds) {
            $own = $pdo->prepare("SELECT {$columns} FROM `time_entries`
                                   WHERE `user_id` = ? AND `id` IN (" . implode(',', array_fill(0, count($ownIds), '?')) . ")
                                     AND `deleted_at` IS NULL AND `start_at` IS NOT NULL" . ($closedOnly ? " AND `end_at` IS NOT NULL" : ''));
            $own->execute(array_merge([$userId], $ownIds));
            array_push($candidates, ...$own->fetchAll(\PDO::FETCH_ASSOC));
        }
        $nowMs = function_exists('ccrm_tt_now_ms') ? ccrm_tt_now_ms() : time() * 1000;
        $out = [];
        foreach ($candidates as $r) {
            $id = (string)$r['id'];
            if (isset($out[$id])) {
                continue;
            }
            $iv = ccrm_ts_interval($r, $nowMs);
            if ($iv === null) {
                continue;
            }
            $meets = $strict ? ($iv[0] < $toMs && $iv[1] > $fromMs) : ($iv[0] <= $toMs && $iv[1] >= $fromMs);
            if ($meets) {
                $r['_iv'] = $iv;
                $out[$id] = $r;
            }
        }
        return array_values($out);
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
        $to = ccrm_ts_ms($endUtc) ?? max($from, function_exists('ccrm_tt_now_ms') ? ccrm_tt_now_ms() : time() * 1000);
        if ($to <= $from) {
            return [];
        }
        $out = [];
        foreach (ccrm_ts_timed_rows($pdo, $userId, $from, $to, false, true, '*') as $r) {
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

    /** Run $fn in the caller's transaction, or in one of its own. */
    function ccrm_ts_in_tx(\PDO $pdo, callable $fn): void {
        $own = !$pdo->inTransaction();
        if ($own) {
            $pdo->beginTransaction();
        }
        try {
            $fn();
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

    function ccrm_tt_settle(\PDO $pdo, string $userId, string $fromUtc, string $toUtc, bool $force = false, array $ownIds = []): void {
        $fromMs = ccrm_ts_ms($fromUtc);
        $toMs = ccrm_ts_ms($toUtc);
        if ($userId === '' || $fromMs === null || $toMs === null) {
            return;
        }
        if ($toMs < $fromMs) {
            [$fromMs, $toMs] = [$toMs, $fromMs];
        }
        ccrm_ts_in_tx($pdo, function () use ($pdo, $userId, $fromMs, $toMs, $force, $ownIds) {
            ccrm_ts_settle_window($pdo, $userId, $fromMs, $toMs, $force, $ownIds);
        });
    }

    /** Hours-only entries of one user on one local date: worked = duration (C15), priced. No engine. */
    function ccrm_tt_settle_hours_only(\PDO $pdo, string $userId, string $date, bool $force = false, array $ownIds = []): void {
        if ($userId === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return;
        }
        ccrm_ts_in_tx($pdo, function () use ($pdo, $userId, $date, $force, $ownIds) {
            $own = array_flip(array_map('strval', $ownIds));
            $newlySettled = [];
            ccrm_ts_settle_hours($pdo, $userId, $date, $date, $force, $own, $newlySettled);
            ccrm_ts_settle_day_costs($pdo, $userId, [$date], $force, $own, $newlySettled);
        });
    }

    function ccrm_ts_columns(): string {
        return "`id`, `user_id`, `employee_id`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `worked_ms`, `cost`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`, `approval_status`";
    }

    function ccrm_ts_hours_per_day(\PDO $pdo, string $userId): float {
        $h = 0.0;
        if ($userId !== '') {
            try {
                $stmt = $pdo->prepare("SELECT `hours_per_day` FROM `employees` WHERE `user_id` = ? LIMIT 1");
                $stmt->execute([$userId]);
                $v = $stmt->fetchColumn();
                if (is_numeric($v) && (float)$v > 0) {
                    $h = (float)$v;
                }
            } catch (\Throwable $e) {
                $h = 0.0;
            }
        }
        if (!($h > 0)) {
            if (!function_exists('ccrm_tt_load_settings')) {
                require_once __DIR__ . '/time_entries_lib.php';
            }
            $s = ccrm_tt_load_settings($pdo);
            $h = is_numeric($s['hoursPerDay'] ?? null) && (float)$s['hoursPerDay'] > 0 ? (float)$s['hoursPerDay'] : 8.0;
        }
        return $h;
    }

    function ccrm_ts_settle_window(\PDO $pdo, string $userId, int $fromMs, int $toMs, bool $force, array $ownIds): void {
        $own = array_flip(array_map('strval', $ownIds));
        // A running entry has no worked time and no cost yet (also after undo_start reopened some).
        foreach (ccrm_ts_running_rows($pdo, $userId, "`id`, `worked_ms`, `cost`") as $running) {
            if ($running['worked_ms'] !== null || $running['cost'] !== null) {
                $pdo->prepare("UPDATE `time_entries` SET `worked_ms` = NULL, `cost` = NULL WHERE `id` = ? AND `end_at` IS NULL")
                    ->execute([$running['id']]);
            }
        }

        $newlySettled = [];
        $touchedDates = [];
        $fromDate = ccrm_ts_local_date($fromMs);
        $toDate = ccrm_ts_local_date($toMs);
        $touchedDates[$fromDate] = true;
        $touchedDates[$toDate] = true;
        if ($fromDate < $toDate) {
            $dStmt = $pdo->prepare("SELECT DISTINCT `entry_date` FROM `time_entries`
                                    WHERE `user_id` = ? AND `entry_date` BETWEEN ? AND ?
                                      AND `deleted_at` IS NULL AND (`start_at` IS NULL OR `end_at` IS NOT NULL)");
            $dStmt->execute([$userId, $fromDate, $toDate]);
            foreach ($dStmt->fetchAll(\PDO::FETCH_COLUMN) as $d) {
                $touchedDates[(string)$d] = true;
            }
        }

        $s1 = ccrm_ts_timed_rows($pdo, $userId, $fromMs, $toMs, true, false, ccrm_ts_columns(), $ownIds);
        if ($s1) {
            $spanFrom = $fromMs;
            $spanTo = $toMs;
            foreach ($s1 as $r) {
                $spanFrom = min($spanFrom, $r['_iv'][0]);
                $spanTo = max($spanTo, $r['_iv'][1]);
                if (!empty($r['entry_date'])) {
                    $touchedDates[substr((string)$r['entry_date'], 0, 10)] = true;
                }
            }
            $inputs = [];
            foreach (ccrm_ts_timed_rows($pdo, $userId, $spanFrom, $spanTo, false, false, "`id`, `start_at`, `end_at`, `duration_sec`", $ownIds) as $r) {
                $inputs[] = ['id' => (string)$r['id'], 'startMs' => $r['_iv'][0], 'endMs' => $r['_iv'][1]];
            }
            $worked = ccrm_ta_allocate($inputs);
            foreach ($s1 as $r) {
                ccrm_ts_write($pdo, $r, (int)($worked[(string)$r['id']] ?? 0), $force, $own, $newlySettled);
            }
        }
        ccrm_ts_settle_hours($pdo, $userId, $fromDate, $toDate, $force, $own, $newlySettled);
        ccrm_ts_settle_day_costs($pdo, $userId, array_keys($touchedDates), $force, $own, $newlySettled);
    }

    function ccrm_ts_settle_hours(\PDO $pdo, string $userId, string $fromDate, string $toDate, bool $force, array $own, array &$newlySettled = []): void {
        $hours = $pdo->prepare("SELECT " . ccrm_ts_columns() . " FROM `time_entries`
                                 WHERE `user_id` = ? AND `entry_date` >= ? AND `entry_date` <= ?
                                   AND `deleted_at` IS NULL AND `start_at` IS NULL");
        $hours->execute([$userId, $fromDate, $toDate]);
        foreach ($hours->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            ccrm_ts_write($pdo, $r, $r['duration_sec'] === null ? null : ccrm_ta_worked_ms_hours_only($r['duration_sec']), $force, $own, $newlySettled);
        }
    }

    /** Write worked_ms and frozen rate metadata when anything changed and it may be written; cost follows in the day pass. */
    function ccrm_ts_write(\PDO $pdo, array $r, ?int $workedMs, bool $force, array $own, array &$newlySettled = []): void {
        $rate = $r['cost_rate'] === null ? null : (float)$r['cost_rate'];
        $freeze = null;
        if ($rate === null) {
            $p = ccrm_ts_price($pdo, (string)$r['user_id'], (string)$r['entry_date']);
            if ($p !== null) {
                $rate = $p['cost_rate'] === null ? null : (float)$p['cost_rate'];
                $freeze = $p;
            }
        }
        $changed = !ccrm_ts_same($r['worked_ms'], $workedMs, 0);
        $refreeze = $freeze !== null && (
            $rate !== null // it had no rate and now gets one
            || (string)($r['employee_id'] ?? '') !== (string)($freeze['employee_id'] ?? '')
            || (string)($r['cost_rate_source'] ?? '') !== (string)$freeze['cost_rate_source']
            || (string)($r['cost_rate_basis_days'] ?? '') !== (string)($freeze['cost_rate_basis_days'] ?? '')
        );
        if (!$changed && !$refreeze) {
            return;
        }
        // Locked history keeps its stored values (checked only now, for rows that would change).
        if (!$force && !isset($own[(string)$r['id']]) && $r['worked_ms'] !== null) {
            if (!function_exists('ccrm_tt_row_lock_reason')) {
                require_once __DIR__ . '/time_locks.php';
            }
            if (ccrm_tt_row_lock_reason($pdo, $r) !== null) {
                return;
            }
        }
        if ($r['worked_ms'] === null) {
            $newlySettled[(string)$r['id']] = true;
        }
        if ($refreeze) {
            $pdo->prepare("UPDATE `time_entries` SET `worked_ms` = ?, `employee_id` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ? WHERE `id` = ?")
                ->execute([$workedMs, $freeze['employee_id'], $freeze['cost_rate'], $freeze['cost_rate_source'], $freeze['cost_rate_basis_days'], $r['id']]);
            return;
        }
        $pdo->prepare("UPDATE `time_entries` SET `worked_ms` = ? WHERE `id` = ?")
            ->execute([$workedMs, $r['id']]);
    }

    /**
     * Recompute `cost` per touched (user, entry_date) using day-ratio allocation for MD and monthly
     * workers (hourly workers stay linear).
     */
    function ccrm_ts_settle_day_costs(\PDO $pdo, string $userId, array $dates, bool $force, array $own, array $newlySettled = []): void {
        $validDates = [];
        foreach ($dates as $d) {
            $d = substr((string)$d, 0, 10);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
                $validDates[$d] = true;
            }
        }
        if (!$validDates) {
            return;
        }
        $hoursPerDay = ccrm_ts_hours_per_day($pdo, $userId);
        $sel = $pdo->prepare("SELECT " . ccrm_ts_columns() . " FROM `time_entries`
                              WHERE `user_id` = ? AND `entry_date` = ?
                                AND `deleted_at` IS NULL AND (`start_at` IS NULL OR `end_at` IS NOT NULL)");
        $upd = $pdo->prepare("UPDATE `time_entries` SET `cost` = ? WHERE `id` = ?");
        foreach (array_keys($validDates) as $date) {
            $sel->execute([$userId, $date]);
            $dayRows = $sel->fetchAll(\PDO::FETCH_ASSOC);
            if (!$dayRows) {
                continue;
            }
            $dayTotalWorkedMs = 0;
            foreach ($dayRows as $dr) {
                if ($dr['worked_ms'] !== null) {
                    $dayTotalWorkedMs += max(0, (int)$dr['worked_ms']);
                }
            }
            foreach ($dayRows as $dr) {
                $workedMs = $dr['worked_ms'] === null ? null : (int)$dr['worked_ms'];
                $rate = $dr['cost_rate'] === null ? null : (float)$dr['cost_rate'];
                $newCost = ccrm_tc_day_allocated_cost($workedMs, $dayTotalWorkedMs, $rate, (string)($dr['cost_rate_source'] ?? ''), $hoursPerDay);
                if (ccrm_ts_same($dr['cost'], $newCost, 4)) {
                    continue;
                }
                $id = (string)$dr['id'];
                if (!$force && !isset($own[$id]) && !isset($newlySettled[$id]) && $dr['cost'] !== null) {
                    if (!function_exists('ccrm_tt_row_lock_reason')) {
                        require_once __DIR__ . '/time_locks.php';
                    }
                    if (ccrm_tt_row_lock_reason($pdo, $dr) !== null) {
                        continue;
                    }
                }
                $upd->execute([$newCost, $dr['id']]);
            }
        }
    }

    /**
     * The month's rate for a row that has none: one ccrm_tt_price() per (user, month) per request,
     * never fetching.
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
     * user_id, start_at, end_at, duration_sec, entry_date, and `id` when the caller wrote that row)
     * BEFORE and AFTER the change; nulls are skipped. Each timed interval is settled on its own
     * (intervals that intersect are settled together); an hours-only row only re-prices the
     * hours-only rows of its date. The `id`s of the rows passed are the caller's own writes: they are
     * written even when locked (the caller has already applied the lock rule to them).
     */
    function ccrm_tt_settle_rows(\PDO $pdo, array $rows, bool $force = false): void {
        $nowMs = function_exists('ccrm_tt_now_ms') ? ccrm_tt_now_ms() : time() * 1000;
        $timed = [];
        $dates = [];
        $own = [];
        foreach ($rows as $row) {
            if (!is_array($row) || empty($row['user_id'])) {
                continue;
            }
            $userId = (string)$row['user_id'];
            if (!empty($row['id'])) {
                $own[$userId][] = (string)$row['id'];
            }
            $iv = ccrm_ts_interval($row, $nowMs);
            if ($iv === null) {
                $date = substr((string)($row['entry_date'] ?? ''), 0, 10);
                if ($date !== '') {
                    $dates[$userId][$date] = true;
                }
                continue;
            }
            if (!empty($row['end_at'])) {
                // Old rows may disagree between end_at and duration: cover both.
                $iv[1] = max($iv[1], (int)ccrm_ts_ms($row['end_at']));
            }
            $timed[$userId][] = $iv;
            $rowDate = substr((string)($row['entry_date'] ?? ''), 0, 10);
            if ($rowDate !== '' && $rowDate !== ccrm_ts_local_date($iv[0])) {
                $dates[$userId][$rowDate] = true;
            }
        }
        foreach ($timed as $userId => $ivs) {
            usort($ivs, fn($a, $b) => $a[0] <=> $b[0]);
            $cur = null;
            foreach ($ivs as $iv) {
                if ($cur !== null && $iv[0] <= $cur[1]) {
                    $cur[1] = max($cur[1], $iv[1]);
                    continue;
                }
                if ($cur !== null) {
                    ccrm_tt_settle($pdo, (string)$userId, ccrm_ts_utc($cur[0]), ccrm_ts_utc($cur[1]), $force, $own[$userId] ?? []);
                }
                $cur = $iv;
            }
            if ($cur !== null) {
                ccrm_tt_settle($pdo, (string)$userId, ccrm_ts_utc($cur[0]), ccrm_ts_utc($cur[1]), $force, $own[$userId] ?? []);
            }
        }
        foreach ($dates as $userId => $set) {
            foreach (array_keys($set) as $date) {
                ccrm_tt_settle_hours_only($pdo, (string)$userId, (string)$date, $force, $own[$userId] ?? []);
            }
        }
    }
}
