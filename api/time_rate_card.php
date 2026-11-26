<?php
/**
 * Time tracking v2: the rate card (docs/TIME-TRACKING-V2.md D4.3, C2, C10, C11, C12, C16).
 *
 *   ccrm_tt_rate_for($pdo, $employeeId, $month, $settings, $fetch = false, $ignoreFreeze = false): array
 *     The hourly cost rate of a person paid MONTHLY (employee or contractor retainer) for one month,
 *     from the leave-aware formula of D4.1 (ccrm_tc_cost_rate with paid / unpaid leave days and the
 *     person's hours per day), and the stored row of `time_rate_months` that explains it.
 *
 *     - Open month, no row or a different inputs_hash: upsert the row, re-rate the person's entries of
 *       the month (cost_rate / cost_rate_source / cost_rate_basis_days) and settle them with
 *       ccrm_tt_settle(), which is the only writer of `cost`; one audit-log line when anything moved.
 *     - Frozen month (C12): its `employee_salaries` record (period_key = month, monthly) is closed,
 *       else from the first day of month + 2. A frozen row is returned as stored; a row that is not
 *       stamped yet gets frozen_at and is returned as stored; no row: computed once, stored frozen.
 *       Nothing is re-priced.
 *     - $ignoreFreeze (the admin "Re-price a period"): a frozen month is recomputed and its row
 *       rewritten (frozen_at kept), but entries are NOT re-rated here: the caller re-rates its period
 *       and settles it with force. On an open month it makes no difference.
 *
 *     Daily and hourly pay do not depend on the month: the rate is computed and returned, no row is
 *     stored and nothing is re-priced (ccrm_tt_price() does not call this for them). A person with no
 *     rate (ledger, no salary) gets no row either.
 *
 *     Never called from sync.php, the probe poll or a migration that runs per request. No DDL. When the
 *     table does not exist yet (mid-deploy) it degrades to computing without storing. Pass $fetch =
 *     false inside a transaction.
 *
 *   ccrm_tt_rate_card_cron($pdo, $force = false): array
 *     Once a day (system_settings TIME_RATE_CARD_LAST_PASS = Y-m-d): ccrm_tt_rate_for() for the current
 *     and the previous month of every active monthly employee. Equal hashes write nothing.
 *
 * Which entries are re-rated: the person's not-deleted entries of the month (by user_id and
 * entry_date), except approved ones and those in a closed payroll period (time_locks.php). The age
 * lock (lockAfterDays) does not apply: it stops people editing old entries, it does not freeze a
 * month's rate; C12's freeze rule does. Entries frozen to ANOTHER employee are left alone.
 *
 * Recursion: settle prices rate-less rows through ccrm_tt_price() -> ccrm_tt_rate_for(). A call for a
 * person-month that is already being re-priced returns the computed rate without re-pricing again.
 */

require_once __DIR__ . '/time_cost.php';
require_once __DIR__ . '/time_leave.php';
require_once __DIR__ . '/holidays_lib.php';

if (!function_exists('ccrm_tt_rate_for')) {

    /** Leave types of EMPLOYEE_SETTINGS (isPaid flags); null when not configured. One read per request. */
    function ccrm_trc_leave_types(\PDO $pdo): ?array {
        static $types = false;
        if ($types === false) {
            $types = null;
            try {
                $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'EMPLOYEE_SETTINGS'")->fetchColumn();
                $cfg = is_string($raw) ? json_decode($raw, true) : null;
                if (is_array($cfg) && is_array($cfg['vacationTypes'] ?? null)) {
                    $types = $cfg['vacationTypes'];
                }
            } catch (\Throwable $e) {
                $types = null;
            }
        }
        return $types;
    }

    /** fn(Y-m-d): bool on the same calendar as ccrm_holidays_working_days (holidays, overrides). */
    function ccrm_trc_working_day_fn(\PDO $pdo, string $country, array $overrides, bool $fetch): callable {
        $byDate = [];
        foreach ($overrides as $o) {
            if (is_array($o) && isset($o['date'], $o['kind'])) {
                $byDate[(string)$o['date']] = (string)$o['kind'];
            }
        }
        $years = [];
        return function (string $ymd) use ($pdo, $country, $byDate, $fetch, &$years): bool {
            $kind = $byDate[$ymd] ?? null;
            if ($kind === 'extraWorkingDay') {
                return true;
            }
            if ($kind === 'extraDayOff') {
                return false;
            }
            $y = (int)substr($ymd, 0, 4);
            if (!isset($years[$y])) {
                $years[$y] = [];
                foreach (ccrm_holidays_year($pdo, $country, $y, $fetch)['days'] as $d) {
                    $years[$y][(string)$d['date']] = true;
                }
            }
            return !isset($years[$y][$ymd]) && ccrm_holiday_is_weekday($ymd);
        };
    }

    /** Company-local today (Y-m-d). */
    function ccrm_trc_today(): string {
        if (!function_exists('ccrm_tt_local_date')) {
            require_once __DIR__ . '/time_entries_lib.php';
        }
        return ccrm_tt_local_date(ccrm_tt_now_utc());
    }

    /** C12: the payroll month is closed, or today is on or after the first day of month + 2. */
    function ccrm_trc_month_frozen(\PDO $pdo, string $employeeId, string $month): bool {
        $limit = (new \DateTimeImmutable($month . '-01', new \DateTimeZone('UTC')))->modify('+2 months')->format('Y-m-d');
        if (ccrm_trc_today() >= $limit) {
            return true;
        }
        if (!function_exists('ccrm_column_exists')) {
            require_once __DIR__ . '/schema.php'; // ccrm_te_closed_sql() checks for closed_at
        }
        if (!function_exists('ccrm_te_closed_sql')) {
            require_once __DIR__ . '/time_locks.php';
        }
        try {
            $stmt = $pdo->prepare("SELECT 1 FROM `employee_salaries` WHERE `employee_id` = ? AND `period_key` = ? AND `period_type` = 'monthly' AND " . ccrm_te_closed_sql($pdo) . " LIMIT 1");
            $stmt->execute([$employeeId, $month]);
            return (bool)$stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** The stored row, null when there is none; false when the table is missing (compute only). */
    function ccrm_trc_row(\PDO $pdo, string $employeeId, string $month) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM `time_rate_months` WHERE `employee_id` = ? AND `month` = ?");
            $stmt->execute([$employeeId, $month]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            return $row ?: null;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * The inputs of one person-month and the rate they give (no writes).
     * @return array|null null when the employee does not exist
     */
    function ccrm_trc_compute(\PDO $pdo, string $employeeId, string $month, array $settings, bool $fetch): ?array {
        $stmt = $pdo->prepare("SELECT `id`, `user_id`, `kind`, `salary_type`, `salary_amount`, `work_country`, `hours_per_day` FROM `employees` WHERE `id` = ? LIMIT 1");
        $stmt->execute([$employeeId]);
        $emp = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$emp) {
            return null;
        }
        if (!function_exists('ccrm_tt_work_country')) {
            require_once __DIR__ . '/time_entries_lib.php';
        }
        $settings += ccrm_tt_default_settings();
        $country = ccrm_tt_work_country($pdo, $emp);
        $overrides = ccrm_tt_overrides_for($settings, $country);
        $year = (int)substr($month, 0, 4);
        $mon = (int)substr($month, 5, 2);
        $workingDays = ccrm_holidays_working_days($pdo, $country, $year, $mon, $overrides, $fetch);

        $monthStart = $month . '-01';
        $monthEnd = (new \DateTimeImmutable($monthStart, new \DateTimeZone('UTC')))->format('Y-m-t');
        $leave = ['paid' => 0.0, 'unpaid' => 0.0];
        try {
            $vac = $pdo->prepare("SELECT `start_date`, `end_date`, `days_count`, `status`, `vacation_type_id` FROM `employee_vacations`
                                   WHERE `employee_id` = ? AND `status` IN ('approved', 'taken') AND `start_date` <= ? AND `end_date` >= ?");
            $vac->execute([$employeeId, $monthEnd, $monthStart]);
            $rows = $vac->fetchAll(\PDO::FETCH_ASSOC);
            if ($rows) {
                $leave = ccrm_tl_leave_days_in_month($rows, $month, ccrm_trc_working_day_fn($pdo, $country, $overrides, $fetch), ccrm_tl_leave_type_is_paid(ccrm_trc_leave_types($pdo)));
            }
        } catch (\Throwable $e) {
            // No vacations table: no leave.
        }
        $laborCost = null;
        $empKind = (string)($emp['kind'] ?? 'employee');
        if (($empKind === '' || $empKind === 'employee') && (string)($emp['salary_type'] ?? 'monthly') === 'monthly') {
            try {
                $salStmt = $pdo->prepare("SELECT `labor_cost` FROM `employee_salaries` WHERE `employee_id` = ? AND `period_key` = ? AND `period_type` = 'monthly' LIMIT 1");
                $salStmt->execute([$employeeId, $month]);
                $val = $salStmt->fetchColumn();
                if (is_numeric($val) && (float)$val > 0) {
                    $laborCost = (float)$val;
                }
            } catch (\Throwable $e) {
                $laborCost = null;
            }
        }
        $personHours = is_numeric($emp['hours_per_day'] ?? null) && (float)$emp['hours_per_day'] > 0 ? (float)$emp['hours_per_day'] : null;
        $costSettings = [
            'hoursBasis' => $settings['hoursBasis'],
            'fixedHoursPerMonth' => $settings['fixedHoursPerMonth'],
            'hoursPerDay' => $settings['hoursPerDay'],
            'employerMultiplier' => $settings['employerMultiplier'],
        ];
        $r = ccrm_tc_cost_rate(
            ['kind' => $emp['kind'], 'salaryType' => $emp['salary_type'], 'salaryAmount' => $emp['salary_amount']],
            $workingDays,
            $costSettings,
            ['paidLeaveDays' => $leave['paid'], 'unpaidLeaveDays' => $leave['unpaid'], 'hoursPerDay' => $personHours, 'laborCost' => $laborCost]
        );
        $hoursPerDay = $personHours ?? (float)$settings['hoursPerDay'];
        $effectiveAmount = $r['amount'] !== null ? (float)$r['amount'] : (float)$emp['salary_amount'];
        $hash = sha1(json_encode([
            (string)$emp['kind'], (string)$emp['salary_type'], number_format((float)$emp['salary_amount'], 2, '.', ''),
            $laborCost !== null ? number_format($laborCost, 2, '.', '') : 'none',
            $country, $workingDays, number_format((float)$leave['paid'], 1, '.', ''), number_format((float)$leave['unpaid'], 1, '.', ''),
            number_format($hoursPerDay, 2, '.', ''), number_format((float)$costSettings['employerMultiplier'], 4, '.', ''),
            (string)$costSettings['hoursBasis'], number_format((float)$costSettings['fixedHoursPerMonth'], 2, '.', ''),
        ]));
        return [
            'employee' => $emp,
            'monthly' => in_array($r['source'], ['monthly', 'contractor_monthly'], true),
            'rate' => $r['rate'],
            'source' => $r['source'],
            'basisDays' => $r['basisDays'],
            'workingDays' => $workingDays,
            'country' => $country,
            'paidLeaveDays' => (float)($r['paidLeaveDays'] ?? $leave['paid']),
            'unpaidLeaveDays' => (float)($r['unpaidLeaveDays'] ?? $leave['unpaid']),
            'hoursPerDay' => $hoursPerDay,
            'multiplier' => (float)($r['multiplier'] ?? 1),
            'salaryAmount' => $effectiveAmount,
            'fallback' => !empty($r['fallback']),
            'inputsHash' => $hash,
            'hoursBasis' => (string)$costSettings['hoursBasis'],
        ];
    }

    /** The result shape from a stored row (frozen months). */
    function ccrm_trc_from_row(array $row, array $computed): array {
        $wd = $row['working_days'] === null ? null : (int)$row['working_days'];
        return [
            'rate' => $row['rate'] === null ? null : (float)$row['rate'],
            'source' => (string)$row['source'],
            'basisDays' => $computed['hoursBasis'] === 'fixed' ? null : $wd,
            'workingDays' => $wd,
            'country' => $computed['country'],
            'paidLeaveDays' => (float)$row['paid_leave_days'],
            'unpaidLeaveDays' => (float)$row['unpaid_leave_days'],
            'hoursPerDay' => $row['hours_per_day'] === null ? null : (float)$row['hours_per_day'],
            'multiplier' => $row['multiplier'] === null ? null : (float)$row['multiplier'],
            'fallback' => (int)$row['fallback'] === 1,
            'salaryType' => $row['salary_type'],
            'salaryAmount' => $row['salary_amount'] === null ? null : (float)$row['salary_amount'],
            'inputsHash' => (string)$row['inputs_hash'],
            'frozen' => $row['frozen_at'] !== null,
            'stored' => true,
        ];
    }

    function ccrm_trc_result(array $c, bool $frozen, bool $stored): array {
        return [
            'rate' => $c['rate'], 'source' => $c['source'], 'basisDays' => $c['basisDays'], 'workingDays' => $c['workingDays'],
            'country' => $c['country'], 'paidLeaveDays' => $c['paidLeaveDays'], 'unpaidLeaveDays' => $c['unpaidLeaveDays'],
            'hoursPerDay' => $c['hoursPerDay'], 'multiplier' => $c['multiplier'], 'fallback' => $c['fallback'],
            'salaryType' => $c['employee']['salary_type'], 'salaryAmount' => (float)($c['salaryAmount'] ?? $c['employee']['salary_amount']),
            'inputsHash' => $c['inputsHash'], 'frozen' => $frozen, 'stored' => $stored,
        ];
    }

    /** Insert or rewrite the row. $frozenAt: 'now' stamps it, 'keep' leaves frozen_at as it is. */
    function ccrm_trc_upsert(\PDO $pdo, string $employeeId, string $month, array $c, string $frozenAt): void {
        $frozenInsert = $frozenAt === 'now' ? 'UTC_TIMESTAMP()' : 'NULL';
        $frozenUpdate = $frozenAt === 'now' ? ', `frozen_at` = COALESCE(`frozen_at`, UTC_TIMESTAMP())' : '';
        $pdo->prepare("INSERT INTO `time_rate_months`
                (`employee_id`, `month`, `rate`, `source`, `salary_type`, `salary_amount`, `working_days`, `paid_leave_days`,
                 `unpaid_leave_days`, `hours_per_day`, `multiplier`, `fallback`, `inputs_hash`, `frozen_at`)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, {$frozenInsert})
                ON DUPLICATE KEY UPDATE `rate` = VALUES(`rate`), `source` = VALUES(`source`), `salary_type` = VALUES(`salary_type`),
                  `salary_amount` = VALUES(`salary_amount`), `working_days` = VALUES(`working_days`), `paid_leave_days` = VALUES(`paid_leave_days`),
                  `unpaid_leave_days` = VALUES(`unpaid_leave_days`), `hours_per_day` = VALUES(`hours_per_day`), `multiplier` = VALUES(`multiplier`),
                  `fallback` = VALUES(`fallback`), `inputs_hash` = VALUES(`inputs_hash`){$frozenUpdate}")
            ->execute([
                $employeeId, $month, $c['rate'], $c['source'], $c['employee']['salary_type'], $c['salaryAmount'] ?? $c['employee']['salary_amount'],
                $c['workingDays'], $c['paidLeaveDays'], $c['unpaidLeaveDays'], $c['hoursPerDay'], $c['multiplier'],
                $c['fallback'] ? 1 : 0, $c['inputsHash'],
            ]);
    }

    /**
     * Store the row of an open month, re-rate the person's entries of that month and settle them
     * (settle writes `cost`), all in one transaction: a failure leaves the old row, so the next call
     * tries again.
     * @return int how many entries got a new rate
     */
    function ccrm_trc_store_and_reprice(\PDO $pdo, array $c, string $month, array $settings, bool $allowClosedPayroll = false): int {
        $employeeId = (string)$c['employee']['id'];
        $userId = (string)($c['employee']['user_id'] ?? '');
        if ($userId === '') {
            ccrm_trc_upsert($pdo, $employeeId, $month, $c, $allowClosedPayroll ? 'now' : 'keep');
            return 0;
        }
        if (!function_exists('ccrm_te_lock_reason_of')) {
            require_once __DIR__ . '/time_locks.php';
        }
        $monthStart = $month . '-01';
        $monthEnd = (new \DateTimeImmutable($monthStart, new \DateTimeZone('UTC')))->format('Y-m-t');
        $sel = $pdo->prepare("SELECT `id`, `user_id`, `employee_id`, `entry_date`, `start_at`, `end_at`, `approval_status`, `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`
                                FROM `time_entries` WHERE `user_id` = ? AND `entry_date` BETWEEN ? AND ? AND `deleted_at` IS NULL");
        $sel->execute([$userId, $monthStart, $monthEnd]);
        // Only approved and closed-payroll rows keep their rate; the age lock is not a rate freeze.
        $lockSettings = ['lockAfterDays' => null] + $settings;
        $today = ccrm_trc_today();
        $ids = [];
        foreach ($sel->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $own = (string)($r['employee_id'] ?? '');
            if ($own !== '' && $own !== $employeeId) {
                continue;
            }
            $same = $own === $employeeId
                && $r['cost_rate'] !== null && $c['rate'] !== null && abs((float)$r['cost_rate'] - (float)$c['rate']) < 0.00005
                && (string)$r['cost_rate_source'] === (string)$c['source']
                && (string)($r['cost_rate_basis_days'] ?? '') === (string)($c['basisDays'] ?? '');
            $lockReason = ccrm_te_lock_reason_of($pdo, $r, $lockSettings, $today);
            $locked = $allowClosedPayroll ? ($lockReason === 'approved') : ($lockReason !== null);
            if ($same || $locked) {
                continue;
            }
            $ids[] = (string)$r['id'];
        }
        $from = ccrm_ts_local_day_ms($monthStart);
        $to = ccrm_ts_local_day_ms($monthEnd);
        ccrm_ts_in_tx($pdo, function () use ($pdo, $ids, $c, $month, $employeeId, $userId, $from, $to, $allowClosedPayroll) {
            ccrm_trc_upsert($pdo, $employeeId, $month, $c, $allowClosedPayroll ? 'now' : 'keep');
            if (!$ids) {
                return;
            }
            $upd = $pdo->prepare("UPDATE `time_entries` SET `employee_id` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ? WHERE `id` = ?");
            foreach ($ids as $id) {
                $upd->execute([$employeeId, $c['rate'], $c['source'], $c['basisDays'], $id]);
            }
            // The re-rated rows are the caller's own writes (written even when age-locked); any other
            // row keeps the lock rule of D3.3. Only settle writes `cost`.
            if ($from !== null && $to !== null) {
                ccrm_tt_settle($pdo, $userId, ccrm_ts_utc($from[0]), ccrm_ts_utc($to[1]), $allowClosedPayroll, $ids);
            }
        });
        return count($ids);
    }

    function ccrm_tt_rate_for(\PDO $pdo, string $employeeId, string $month, array $settings, bool $fetch = false, bool $ignoreFreeze = false): array {
        static $active = [];
        $none = ['rate' => null, 'source' => 'none', 'basisDays' => null, 'workingDays' => null, 'frozen' => false, 'stored' => false];
        if ($employeeId === '' || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
            return $none;
        }
        $c = ccrm_trc_compute($pdo, $employeeId, $month, $settings, $fetch);
        if ($c === null) {
            return $none;
        }
        $key = $employeeId . '|' . $month;
        if (!$c['monthly'] || isset($active[$key])) {
            return ccrm_trc_result($c, false, false);
        }
        $row = ccrm_trc_row($pdo, $employeeId, $month);
        if ($row === false) {
            return ccrm_trc_result($c, false, false); // table not there yet
        }
        // A stamped row stays frozen (also when an admin reopened the payroll month).
        $frozen = ($row !== null && $row['frozen_at'] !== null) || ccrm_trc_month_frozen($pdo, $employeeId, $month);
        if ($frozen) {
            if ($ignoreFreeze) {
                if ($row === null || $row['inputs_hash'] !== $c['inputsHash']) {
                    ccrm_trc_upsert($pdo, $employeeId, $month, $c, 'now'); // COALESCE keeps an existing frozen_at
                } elseif ($row['frozen_at'] === null) {
                    $pdo->prepare("UPDATE `time_rate_months` SET `frozen_at` = UTC_TIMESTAMP() WHERE `employee_id` = ? AND `month` = ? AND `frozen_at` IS NULL")
                        ->execute([$employeeId, $month]);
                }
                return ccrm_trc_result($c, true, true);
            }
            if ($row === null) {
                ccrm_trc_upsert($pdo, $employeeId, $month, $c, 'now');
                return ccrm_trc_result($c, true, true);
            }
            if ($row['frozen_at'] === null) {
                if ($row['inputs_hash'] !== $c['inputsHash']) {
                    $active[$key] = true;
                    try {
                        ccrm_trc_store_and_reprice($pdo, $c, $month, $settings, true);
                    } finally {
                        unset($active[$key]);
                    }
                    return ccrm_trc_result($c, true, true);
                }
                $pdo->prepare("UPDATE `time_rate_months` SET `frozen_at` = UTC_TIMESTAMP() WHERE `employee_id` = ? AND `month` = ? AND `frozen_at` IS NULL")
                    ->execute([$employeeId, $month]);
                $row['frozen_at'] = gmdate('Y-m-d H:i:s');
            }
            return ccrm_trc_from_row($row, $c);
        }
        if ($row !== null && $row['inputs_hash'] === $c['inputsHash']) {
            return ccrm_trc_result($c, false, true);
        }

        // Open month, new or changed inputs: store, re-rate, settle, one audit line.
        $active[$key] = true;
        try {
            $count = ccrm_trc_store_and_reprice($pdo, $c, $month, $settings);
        } finally {
            unset($active[$key]);
        }
        $oldRate = $row === null || $row['rate'] === null ? null : (float)$row['rate'];
        if ($count > 0 || ($row !== null && $oldRate !== $c['rate'])) {
            if (!function_exists('ccrm_audit_log')) {
                require_once __DIR__ . '/auth.php';
            }
            $fmt = fn($v) => $v === null ? '-' : number_format((float)$v, 4, '.', '');
            ccrm_audit_log($pdo, null, 'time_tracking.rate_card',
                "Rate card {$employeeId} {$month}: {$fmt($oldRate)} -> {$fmt($c['rate'])}/h"
                . " (WD {$c['workingDays']}, paid leave {$c['paidLeaveDays']}, unpaid {$c['unpaidLeaveDays']}); re-priced {$count} time entries");
        }
        return ccrm_trc_result($c, false, true);
    }

    function ccrm_tt_rate_card_cron(\PDO $pdo, bool $force = false): array {
        if (!function_exists('ccrm_tt_load_settings')) {
            require_once __DIR__ . '/time_entries_lib.php';
        }
        $today = ccrm_trc_today();
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'TIME_RATE_CARD_LAST_PASS'");
        $stmt->execute();
        if (!$force && $stmt->fetchColumn() === $today) {
            return ['ran' => false, 'checked' => 0];
        }
        $settings = ccrm_tt_load_settings($pdo);
        $current = substr($today, 0, 7);
        $previous = (new \DateTimeImmutable($current . '-01', new \DateTimeZone('UTC')))->modify('-1 month')->format('Y-m');
        $ids = $pdo->query("SELECT `id` FROM `employees` WHERE `is_active` = 1 AND `salary_type` = 'monthly' AND `kind` <> 'ledger' AND `salary_amount` > 0")
            ->fetchAll(\PDO::FETCH_COLUMN);
        $checked = 0;
        $failed = 0;
        foreach ($ids as $id) {
            foreach ([$previous, $current] as $month) {
                try {
                    ccrm_tt_rate_for($pdo, (string)$id, $month, $settings, true);
                    $checked++;
                } catch (\Throwable $e) {
                    $failed++;
                    if (function_exists('ccrm_log_exception')) {
                        ccrm_log_exception($e);
                    }
                }
            }
        }
        if ($failed === 0) {
            $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TIME_RATE_CARD_LAST_PASS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
                ->execute([$today]);
        }
        return ['ran' => true, 'checked' => $checked, 'failed' => $failed];
    }
}
