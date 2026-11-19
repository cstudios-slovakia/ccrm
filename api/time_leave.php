<?php
/**
 * Time tracking: paid and unpaid leave days of one person in one month — pure.
 *
 * A PORT of src/utils/timeLeave.ts (docs/TIME-TRACKING-V2.md D4.2, C11). Same rules, same
 * rounding, same fixtures (scripts/fixtures/time-leave-cases.json, run by `npm run test:unit` and
 * `npm run test:time-cost`). Change both files in the same commit.
 *
 * - Only rows with status `approved` or `taken` count.
 * - Each row is cut to the month; only working days of the caller's calendar count.
 * - A row whose days_count is smaller than the working days of its whole range is scaled: each
 *   working day weighs days_count / working days in the range, at most 1. Missing or non-numeric
 *   days_count weighs 1; zero or negative weighs 0.
 * - Each total is rounded ONCE to one decimal (the rate card stores DECIMAL(4,1)).
 *
 * Rows may use the DB column names (start_date, end_date, days_count, status, vacation_type_id)
 * or the camelCase names of the TypeScript EmployeeVacation.
 */

if (!function_exists('ccrm_tl_leave_days_in_month')) {

    /** Working days in an inclusive Y-m-d range. */
    function ccrm_tl_count_working_days(string $from, string $to, callable $isWorkingDay): int {
        $n = 0;
        $utc = new \DateTimeZone('UTC');
        $d = new \DateTimeImmutable($from, $utc);
        $end = new \DateTimeImmutable($to, $utc);
        while ($d <= $end) {
            if ($isWorkingDay($d->format('Y-m-d'))) {
                $n++;
            }
            $d = $d->modify('+1 day');
        }
        return $n;
    }

    /**
     * leaveDaysInMonth(): ['paid' => float, 'unpaid' => float], one decimal each.
     *
     * @param array    $rows         employee_vacations rows
     * @param string   $month        'YYYY-MM'
     * @param callable $isWorkingDay fn(string $ymd): bool — the person's calendar
     * @param callable $isPaid       fn(string $vacationTypeId): bool
     */
    function ccrm_tl_leave_days_in_month(array $rows, string $month, callable $isWorkingDay, callable $isPaid): array {
        $monthStart = $month . '-01';
        $monthEnd = (new \DateTimeImmutable($monthStart, new \DateTimeZone('UTC')))->format('Y-m-t');
        $paid = 0.0;
        $unpaid = 0.0;
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $status = (string)($row['status'] ?? '');
            if ($status !== 'approved' && $status !== 'taken') {
                continue;
            }
            $start = substr((string)($row['start_date'] ?? $row['startDate'] ?? ''), 0, 10);
            $end = substr((string)($row['end_date'] ?? $row['endDate'] ?? ''), 0, 10);
            if ($start === '' || $end === '' || $end < $start || $end < $monthStart || $start > $monthEnd) {
                continue;
            }
            $rangeDays = ccrm_tl_count_working_days($start, $end, $isWorkingDay);
            if ($rangeDays <= 0) {
                continue;
            }
            $raw = array_key_exists('days_count', $row) ? $row['days_count'] : ($row['daysCount'] ?? null);
            if (is_numeric($raw)) {
                $dc = (float)$raw;
                $weight = $dc <= 0 ? 0.0 : min(1.0, $dc / $rangeDays);
            } else {
                $weight = 1.0;
            }
            $inMonth = ccrm_tl_count_working_days($start > $monthStart ? $start : $monthStart, $end < $monthEnd ? $end : $monthEnd, $isWorkingDay);
            $days = $inMonth * $weight;
            if ($isPaid((string)($row['vacation_type_id'] ?? $row['vacationTypeId'] ?? ''))) {
                $paid += $days;
            } else {
                $unpaid += $days;
            }
        }
        return ['paid' => round($paid, 1), 'unpaid' => round($unpaid, 1)];
    }

    /**
     * leaveTypeIsPaid(): the lookup for ccrm_tl_leave_days_in_month. A configured type (EMPLOYEE_SETTINGS
     * vacationTypes) is paid only when isPaid === true; a type id that is not configured falls back to
     * the shipped defaults (annual and worked_days paid).
     */
    function ccrm_tl_leave_type_is_paid(?array $types): callable {
        return function (string $vacationTypeId) use ($types): bool {
            foreach ($types ?? [] as $t) {
                if (is_array($t) && (string)($t['id'] ?? '') === $vacationTypeId) {
                    return ($t['isPaid'] ?? null) === true;
                }
            }
            return in_array($vacationTypeId, ['annual', 'worked_days'], true);
        };
    }
}
