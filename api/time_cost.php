<?php
/**
 * Time tracking: hourly cost rate of a worker and the cost of an entry — pure.
 *
 * A PORT of src/utils/timeCost.ts. Same table, same rounding, same fixtures
 * (scripts/fixtures/time-cost-cases.json, run by `npm run test:unit` and
 * `npm run test:time-cost`). Change both files in the same commit.
 *
 *   kind        salaryType  hourly cost rate for an entry on date D
 *   employee    monthly     salary / workingDays(D's month) / hoursPerDay   x multiplier
 *   employee    daily       amount / hoursPerDay                            x multiplier
 *   employee    hourly      amount                                          x multiplier
 *   contractor  hourly      amount
 *   contractor  daily       amount / hoursPerDay
 *   contractor  monthly     amount / basisHours(D's month)                  (retainer)
 *   ledger / nobody linked / no salary: no rate (source "none")
 *
 * Leave (docs/TIME-TRACKING-V2.md D4.1), the optional $leave argument
 * ['paidLeaveDays', 'unpaidLeaveDays', 'hoursPerDay'] (see computeCostRate in timeCost.ts):
 *   monthCost = salary x (WD - UL) / WD x multiplier, availableHours = (WD - UL - PL) x H
 *   (fixed basis: fixedHoursPerMonth x (WD - UL - PL) / WD), rate = round4(monthCost / hours);
 *   hours <= 0 falls back to the no-leave basis with 'fallback' => true. No leave = today's numbers.
 *
 * The caller supplies the month's working-day count (holidays_lib.php) and leave days
 * (time_leave.php); nothing in here touches the database or the network.
 */

if (!function_exists('ccrm_tc_round2')) {

    function ccrm_tc_round2(float $n): float {
        return round($n, 2);
    }

    function ccrm_tc_round4(float $n): float {
        return round($n, 4);
    }

    /** DEFAULT_COST_SETTINGS in timeCost.ts. */
    function ccrm_tc_default_settings(): array {
        return [
            'hoursBasis' => 'workingDays',
            'fixedHoursPerMonth' => 168,
            'hoursPerDay' => 8,
            'employerMultiplier' => 1.352,
        ];
    }

    function ccrm_tc_none(): array {
        return ['rate' => null, 'source' => 'none', 'basisDays' => null, 'basisHours' => null, 'manDay' => null, 'multiplier' => 1, 'amount' => null];
    }

    /** A non-negative float from anything; 0 for null, junk or negatives. */
    function ccrm_tc_non_negative($n): float {
        return is_numeric($n) && (float)$n > 0 ? (float)$n : 0.0;
    }

    /** Whole floats as ints, the way JSON.stringify prints them (basisHours, leave days, hours). */
    function ccrm_tc_num(float $n) {
        return $n == (int)$n ? (int)$n : $n;
    }

    /**
     * computeCostRate(): the hourly cost rate of one person for one month.
     *
     * @param array|null $person   ['kind' => ..., 'salaryType' => ..., 'salaryAmount' => ...]
     * @param int        $workingDays that month's working days, in the person's country
     * @param array      $settings hoursBasis, fixedHoursPerMonth, hoursPerDay, employerMultiplier
     * @param array      $leave    paidLeaveDays, unpaidLeaveDays, hoursPerDay (the person's; null = company's)
     */
    function ccrm_tc_cost_rate(?array $person, int $workingDays, array $settings = [], array $leave = []): array {
        $settings = $settings + ccrm_tc_default_settings();
        if ($person === null) {
            return ccrm_tc_none();
        }
        $kind = $person['kind'] ?? null;
        $kind = ($kind === null || $kind === '') ? 'employee' : (string)$kind;
        if ($kind === 'ledger') {
            return ccrm_tc_none();
        }
        $isContractor = $kind === 'contractor';
        $salaryType = $person['salaryType'] ?? null;
        $salaryType = ($salaryType === null || $salaryType === '') ? ($isContractor ? 'hourly' : 'monthly') : (string)$salaryType;

        $rawLabor = $leave['laborCost'] ?? null;
        $actualLabor = (!$isContractor && $salaryType === 'monthly' && is_numeric($rawLabor) && (float)$rawLabor > 0)
            ? (float)$rawLabor
            : null;

        $rawAmount = $person['salaryAmount'] ?? null;
        $amount = (is_numeric($rawAmount) && (float)$rawAmount > 0) ? (float)$rawAmount : 0.0;
        if ($amount <= 0 && $actualLabor === null) {
            return ccrm_tc_none();
        }

        $personHours = $leave['hoursPerDay'] ?? null;
        $hoursPerDay = is_numeric($personHours) && (float)$personHours > 0 ? (float)$personHours : (float)$settings['hoursPerDay'];
        if (!($hoursPerDay > 0)) {
            return ccrm_tc_none();
        }

        $multiplier = $isContractor ? 1.0 : ((float)$settings['employerMultiplier'] > 0 ? (float)$settings['employerMultiplier'] : 1.0);

        if ($salaryType === 'hourly') {
            return [
                'rate' => ccrm_tc_round4($amount * $multiplier),
                'source' => $isContractor ? 'contractor_hourly' : 'hourly',
                'basisDays' => null, 'basisHours' => null,
                'manDay' => ccrm_tc_round4($amount * $hoursPerDay),
                'multiplier' => $multiplier, 'amount' => $amount,
                'hoursPerDay' => ccrm_tc_num($hoursPerDay),
            ];
        }
        if ($salaryType === 'daily') {
            return [
                'rate' => ccrm_tc_round4(($amount / $hoursPerDay) * $multiplier),
                'source' => $isContractor ? 'contractor_daily' : 'daily',
                'basisDays' => null, 'basisHours' => null,
                'manDay' => ccrm_tc_round4($amount),
                'multiplier' => $multiplier, 'amount' => $amount,
                'hoursPerDay' => ccrm_tc_num($hoursPerDay),
            ];
        }
        if ($salaryType === 'monthly') {
            $fixed = ($settings['hoursBasis'] ?? 'workingDays') === 'fixed';
            $fullHours = $fixed ? (float)$settings['fixedHoursPerMonth'] : $workingDays * $hoursPerDay;
            if (!($fullHours > 0)) {
                return ccrm_tc_none();
            }
            // Leave only makes sense against a month that has working days.
            $wd = $workingDays > 0 ? $workingDays : 0;
            $unpaid = $wd > 0 ? min(ccrm_tc_non_negative($leave['unpaidLeaveDays'] ?? null), (float)$wd) : 0.0;
            $paid = $wd > 0 ? min(ccrm_tc_non_negative($leave['paidLeaveDays'] ?? null), $wd - $unpaid) : 0.0;
            $left = $wd - $unpaid - $paid;
            $hours = $fullHours;
            if ($unpaid > 0 || $paid > 0) {
                $hours = $fixed ? ((float)$settings['fixedHoursPerMonth'] * $left) / $wd : $left * $hoursPerDay;
            }
            $fallback = !($hours > 0);
            if ($fallback) {
                $hours = $fullHours;
            }
            $effMultiplier = $actualLabor !== null ? 1.0 : $multiplier;
            $monthBase = $actualLabor !== null ? $actualLabor : ($unpaid > 0 ? ($amount * ($wd - $unpaid)) / $wd : $amount);
            $displayAmount = $actualLabor !== null ? $actualLabor : $amount;
            return [
                'rate' => ccrm_tc_round4(($monthBase / $hours) * $effMultiplier),
                'source' => $isContractor ? 'contractor_monthly' : 'monthly',
                'basisDays' => $fixed ? null : $workingDays,
                'basisHours' => ccrm_tc_num((float)$hours),
                'manDay' => ccrm_tc_round4(($monthBase / $hours) * $hoursPerDay),
                'multiplier' => $effMultiplier, 'amount' => $displayAmount,
                'monthCost' => ccrm_tc_round4($monthBase * $effMultiplier),
                'paidLeaveDays' => ccrm_tc_num($paid),
                'unpaidLeaveDays' => ccrm_tc_num($unpaid),
                'hoursPerDay' => ccrm_tc_num($hoursPerDay),
                'fallback' => $fallback,
            ];
        }
        return ccrm_tc_none();
    }

    /**
     * computeWorkedCost(): `worked_ms / 3 600 000 x rate`, 4 decimals (D3.2); null with no rate or
     * no worked time. A total sums these and rounds to cents once, at the end.
     */
    function ccrm_tc_worked_cost(?int $workedMs, ?float $rate): ?float {
        if ($rate === null || $workedMs === null) {
            return null;
        }
        return ccrm_tc_round4(($workedMs / 3600000) * $rate);
    }

    function ccrm_tc_is_day_allocated_source(?string $source): bool {
        return in_array((string)$source, ['daily', 'contractor_daily', 'monthly', 'contractor_monthly'], true);
    }

    /**
     * Day-ratio allocation with an `hoursPerDay` floor for daily (MD) and monthly pay.
     */
    function ccrm_tc_day_allocated_cost(?int $workedMs, ?int $dayTotalWorkedMs, ?float $rate, ?string $source, float $hoursPerDay = 8.0): ?float {
        if ($rate === null || $workedMs === null) {
            return null;
        }
        $h = $hoursPerDay > 0 ? $hoursPerDay : 8.0;
        $capMs = (int)round($h * 3600000);
        if (ccrm_tc_is_day_allocated_source($source) && $capMs > 0 && $dayTotalWorkedMs !== null && $dayTotalWorkedMs > $capMs) {
            return ccrm_tc_round4(($workedMs / $dayTotalWorkedMs) * $h * $rate);
        }
        return ccrm_tc_worked_cost($workedMs, $rate);
    }
}
