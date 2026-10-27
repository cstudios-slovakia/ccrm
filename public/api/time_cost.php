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
 * The caller supplies the month's working-day count (holidays_lib.php); nothing
 * in here touches the database or the network.
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

    /**
     * computeCostRate(): the hourly cost rate of one person for one month.
     *
     * @param array|null $person   ['kind' => ..., 'salaryType' => ..., 'salaryAmount' => ...]
     * @param int        $workingDays that month's working days, in the person's country
     * @param array      $settings hoursBasis, fixedHoursPerMonth, hoursPerDay, employerMultiplier
     */
    function ccrm_tc_cost_rate(?array $person, int $workingDays, array $settings = []): array {
        $settings = $settings + ccrm_tc_default_settings();
        if ($person === null) {
            return ccrm_tc_none();
        }
        $amount = $person['salaryAmount'] ?? null;
        if (!is_numeric($amount) || (float)$amount <= 0) {
            return ccrm_tc_none();
        }
        $amount = (float)$amount;
        $hoursPerDay = (float)$settings['hoursPerDay'];
        if (!($hoursPerDay > 0)) {
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
        $multiplier = $isContractor ? 1.0 : ((float)$settings['employerMultiplier'] > 0 ? (float)$settings['employerMultiplier'] : 1.0);

        if ($salaryType === 'hourly') {
            return [
                'rate' => ccrm_tc_round4($amount * $multiplier),
                'source' => $isContractor ? 'contractor_hourly' : 'hourly',
                'basisDays' => null, 'basisHours' => null,
                'manDay' => ccrm_tc_round4($amount * $hoursPerDay),
                'multiplier' => $multiplier, 'amount' => $amount,
            ];
        }
        if ($salaryType === 'daily') {
            return [
                'rate' => ccrm_tc_round4(($amount / $hoursPerDay) * $multiplier),
                'source' => $isContractor ? 'contractor_daily' : 'daily',
                'basisDays' => null, 'basisHours' => null,
                'manDay' => ccrm_tc_round4($amount),
                'multiplier' => $multiplier, 'amount' => $amount,
            ];
        }
        if ($salaryType === 'monthly') {
            if (($settings['hoursBasis'] ?? 'workingDays') === 'fixed') {
                $hours = (float)$settings['fixedHoursPerMonth'];
                $days = null;
            } else {
                $hours = $workingDays * $hoursPerDay;
                $days = $workingDays;
            }
            if (!($hours > 0)) {
                return ccrm_tc_none();
            }
            return [
                'rate' => ccrm_tc_round4(($amount / $hours) * $multiplier),
                'source' => $isContractor ? 'contractor_monthly' : 'monthly',
                'basisDays' => $days,
                'basisHours' => $hours == (int)$hours ? (int)$hours : $hours,
                'manDay' => ccrm_tc_round4(($amount / $hours) * $hoursPerDay),
                'multiplier' => $multiplier, 'amount' => $amount,
            ];
        }
        return ccrm_tc_none();
    }

    /** computeEntryCost(): `duration_sec / 3600 x rate`, 2 decimals; null with no rate or no duration. */
    function ccrm_tc_entry_cost(?int $durationSec, ?float $rate): ?float {
        if ($rate === null || $durationSec === null) {
            return null;
        }
        return ccrm_tc_round2(($durationSec / 3600) * $rate);
    }
}
