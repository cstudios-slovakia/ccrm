<?php
/**
 * Demo module `employees` (C3: runs right after `company`, before everything that links to people).
 *
 * Writes the six staff of Part D (E1-E6), their payroll rows for the install month and their
 * leave calendar. Code only: personal data comes from packs/<lang>/company.php (names, e-mails,
 * addresses, salaries in EUR), the rest from packs/<lang>/employees.php.
 *
 *  - employees: ids demo-employees-1..6. E1-E3 are linked to the three logins through
 *    `employees.user_id`; the link is left empty when the login does not exist yet or when
 *    a hand-made employee already holds it (user_id is UNIQUE and a hand-made row is never
 *    touched). Salaries are converted with demo_money_salary(); `work_country` is the
 *    edition's holiday country (NULL for the English edition, which has no calendar, B9).
 *  - employee_salaries: ONE row per employee, for the month of the install (a base line plus
 *    the pack's extras). Past and future months are not seeded: sync.php turns every salary
 *    row into a Finance payroll movement. The month is paid once its payday has arrived.
 *    The row ids are demo-employees-sal-<employee n>-<YYYY-MM>; `financial_record_id` stays
 *    empty (the Finance module of phase 4B writes the salary expenses itself).
 *  - employee_vacations: ids demo-employees-vac-<n>, working days only, no overlaps per person;
 *    nobody with a login is away inside the window the time module fills (see packs).
 *
 * Replaces ccrm_seed_default_employees() and the frontend mockEmployees.ts seed (removed in
 * phase 5). Returns the number of rows inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

if (!function_exists('demo_seed_employees')) {

    /** Holiday dates ('Y-m-d' => true) the edition respects, for the years a leave may touch. */
    function demo_employees_holidays(PDO $pdo, ?string $country, array $years): array {
        $dates = [];
        if ($country === null) {
            return $dates;
        }
        require_once __DIR__ . '/../holidays_lib.php';
        foreach ($years as $year) {
            foreach (ccrm_holidays_builtin($country, (int)$year) as $day) {
                $dates[$day['date']] = true;
            }
        }
        return $dates;
    }

    /** Is $ymd a Monday-Friday that is not one of the $holidays? */
    function demo_employees_is_working_day(string $ymd, array $holidays): bool {
        return (int)(new \DateTimeImmutable($ymd))->format('N') < 6 && !isset($holidays[$ymd]);
    }

    /**
     * The leave of a person as [start, end] ('Y-m-d'): $start moved to the next working day,
     * then $days working days counted from there.
     */
    function demo_employees_leave_range(int $startOffset, int $days, array $holidays): array {
        $cursor = new \DateTimeImmutable(demo_d($startOffset));
        while (!demo_employees_is_working_day($cursor->format('Y-m-d'), $holidays)) {
            $cursor = $cursor->modify('+1 day');
        }
        $start = $cursor;
        $counted = 1;
        while ($counted < $days) {
            $cursor = $cursor->modify('+1 day');
            if (demo_employees_is_working_day($cursor->format('Y-m-d'), $holidays)) {
                $counted++;
            }
        }
        return [$start->format('Y-m-d'), $cursor->format('Y-m-d')];
    }

    function demo_seed_employees(PDO $pdo): int {
        $ctx = demo_ctx($pdo);
        $company = demo_pack($pdo, 'company');
        $pack = demo_pack($pdo, 'employees');
        $rows = 0;

        // Idempotent: this module's own rows first (salaries and leave carry the employee id).
        $pdo->exec("DELETE FROM `employee_salaries` WHERE `id` LIKE 'demo-employees-%'");
        $pdo->exec("DELETE FROM `employee_vacations` WHERE `id` LIKE 'demo-employees-%'");
        $pdo->exec("DELETE FROM `employees` WHERE `id` LIKE 'demo-employees-%'");

        $workCountry = $ctx['holidayCountry'];   // 'SK' | 'HU' | null
        $userExists = $pdo->prepare('SELECT COUNT(*) FROM `users` WHERE `id` = ?');
        $userTaken = $pdo->prepare('SELECT COUNT(*) FROM `employees` WHERE `user_id` = ?');

        $insEmp = $pdo->prepare(
            "INSERT INTO `employees` (`id`, `name`, `first_name`, `last_name`, `kind`, `position`, `department`, `user_id`, `pin`,
                `email`, `phone`, `address_street`, `address_city`, `address_zip`, `address_country`, `work_country`,
                `salary_type`, `salary_amount`, `salary_due_day`, `vacation_allowances_json`, `time_tracking_provider`,
                `auto_expense`, `expense_category_id`, `is_active`, `notes`)
             VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'monthly', ?, ?, ?, 'toggl', 1, 'fc-exp-pay-salaries', 1, ?)"
        );
        $salaries = [];
        $empIds = [];
        foreach ($company['employees'] as $ref => $e) {
            $id = demo_ref_id($ref);
            $empIds[$ref] = $id;
            $userId = null;
            if (!empty($e['user'])) {
                $candidate = demo_ref_id((string)$e['user']);
                $userExists->execute([$candidate]);
                $userTaken->execute([$candidate]);
                if ((int)$userExists->fetchColumn() > 0 && (int)$userTaken->fetchColumn() === 0) {
                    $userId = $candidate;
                }
            }
            $staff = $pack['staff'][$ref];
            $salary = demo_money_salary((float)$e['salaryEur']);
            $salaries[$ref] = $salary;
            $insEmp->execute([
                $id,
                $e['name'],
                $e['first'],
                $e['last'],
                $e['title'],
                $e['department'],
                $userId,
                $e['pin'],
                strtolower((string)$e['email']),
                $e['phone'],
                $e['street'],
                $e['city'],
                $e['zip'],
                $e['country'],
                $workCountry,
                $salary,
                (int)$pack['payroll']['dueDay'],
                json_encode($staff['allowances']),
                demo_text($staff['notes']),
            ]);
            $rows++;
        }

        // Payroll of the install month. Paid once the payday (minus one day, like a bank run) has arrived.
        $today = new \DateTimeImmutable('today');
        $year = (int)$today->format('Y');
        $month = (int)$today->format('n');
        $periodKey = sprintf('%04d-%02d', $year, $month);
        $dueDay = (int)$pack['payroll']['dueDay'];
        $isPaid = (int)$today->format('j') >= $dueDay - 1;
        $extras = [];
        foreach ($pack['payroll']['extras'] as $x) {
            $extras[$x['employee']][] = $x;
        }
        $insSal = $pdo->prepare(
            "INSERT INTO `employee_salaries` (`id`, `employee_id`, `period_type`, `period_key`, `year`, `period_number`, `items_json`,
                `total_salary`, `total_paid`, `status`, `due_date`, `payment_date`, `payment_method`, `note`)
             VALUES (?, ?, 'monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bank_transfer', ?)"
        );
        foreach ($company['employees'] as $ref => $e) {
            $lines = [['base', (string)$pack['payroll']['baseName'], $salaries[$ref]]];
            foreach ($extras[$ref] ?? [] as $x) {
                $lines[] = [(string)$x['category'], (string)$x['name'], demo_money((float)$x['amountEur'])];
            }
            $items = [];
            $total = 0.0;
            foreach ($lines as [$categoryId, $categoryName, $amount]) {
                $items[] = ['categoryId' => $categoryId, 'categoryName' => $categoryName, 'salary' => $amount, 'paid' => $isPaid ? $amount : 0];
                $total += $amount;
            }
            $total = demo_money_minor($total);
            $n = (int)substr($empIds[$ref], strlen('demo-employees-'));
            $insSal->execute([
                "demo-employees-sal-{$n}-{$periodKey}",
                $empIds[$ref],
                $periodKey,
                $year,
                $month,
                json_encode($items, JSON_UNESCAPED_UNICODE),
                $total,
                $isPaid ? $total : 0,
                $isPaid ? 'paid' : 'pending',
                sprintf('%s-%02d', $periodKey, $dueDay),
                $isPaid ? sprintf('%s-%02d', $periodKey, $dueDay - 1) : null,
                $isPaid ? $pack['payroll']['paidNote'] : $pack['payroll']['pendingNote'],
            ]);
            $rows++;
        }
        // A paid month is closed (its time entries lock); the stamp is what the lock reads
        if (function_exists('ccrm_backfill_salary_closed_at')) {
            ccrm_backfill_salary_closed_at($pdo);
        }

        // Leave calendar: working days of the edition's calendar, no overlaps per person.
        $years = [$year - 1, $year, $year + 1];
        $holidays = demo_employees_holidays($pdo, $ctx['holidayCountry'], $years);
        $insVac = $pdo->prepare(
            "INSERT INTO `employee_vacations` (`id`, `employee_id`, `vacation_type_id`, `start_date`, `end_date`, `days_count`, `status`, `note`, `approved_by`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $taken = [];   // employee ref => [[start, end], ...]
        foreach ($pack['vacations'] as $i => $v) {
            [$start, $end] = demo_employees_leave_range((int)$v['start'], (int)$v['days'], $holidays);
            foreach ($taken[$v['employee']] ?? [] as [$s, $e2]) {
                if ($start <= $e2 && $end >= $s) {
                    throw new \RuntimeException("demo employees: leave #{$i} of {$v['employee']} overlaps another ({$start}..{$end})");
                }
            }
            $taken[$v['employee']][] = [$start, $end];
            $approved = $v['status'] === 'approved';
            $insVac->execute([
                'demo-employees-vac-' . ($i + 1),
                $empIds[$v['employee']],
                $v['type'],
                $start,
                $end,
                (int)$v['days'],
                $v['status'],
                $v['note'],
                $approved ? demo_text((string)$pack['approvedBy']) : null,
            ]);
            $rows++;
        }
        return $rows;
    }
}
