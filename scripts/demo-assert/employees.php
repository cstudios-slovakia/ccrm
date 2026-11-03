<?php
/**
 * Assertions for the `employees` demo module (format: header of public/api/demo_seed/index.php,
 * worked example: scripts/demo-assert/company.php).
 */
require_once dirname(__DIR__, 2) . '/public/api/holidays_lib.php';

return [
    'minRows' => [
        'employees' => 6,
        'employee_salaries' => 6,
        'employee_vacations' => 26,
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        demo_ctx_force($ctx['lang'], $ctx['currency']);
        $company = demo_company_pack($ctx['lang']);
        $pack = demo_pack_for($ctx['lang'], 'employees');
        $emps = [];
        foreach ($db->rows('employees') as $r) $emps[$r['id']] = $r;
        $demoEmps = array_filter($emps, static fn($r) => strpos($r['id'], 'demo-employees-') === 0);

        // --- the six staff -------------------------------------------------------------------------
        $detail = [];
        foreach ($company['employees'] as $ref => $e) {
            $r = $emps[demo_ref_id($ref)] ?? null;
            if ($r === null) { $detail[] = "{$ref}: no row"; continue; }
            if ($r['name'] !== $e['name'] || $r['first_name'] !== $e['first'] || $r['last_name'] !== $e['last']) $detail[] = "{$ref}: name {$r['name']}";
            if ($r['email'] !== strtolower($e['email']) || $r['pin'] !== $e['pin'] || $r['position'] !== $e['title'] || $r['address_city'] !== $e['city']) $detail[] = "{$ref}: email/pin/position/city";
            if ($r['kind'] !== 'employee' || (int)$r['is_active'] !== 1 || $r['salary_type'] !== 'monthly') $detail[] = "{$ref}: kind/active/salary type";
            if (abs((float)$r['salary_amount'] - demo_money_salary((float)$e['salaryEur'])) > 0.001) $detail[] = "{$ref}: salary {$r['salary_amount']} != converted " . demo_money_salary((float)$e['salaryEur']);
            if ($r['work_country'] !== $ctx['holidayCountry']) $detail[] = "{$ref}: work_country " . var_export($r['work_country'], true);
            $allow = json_decode((string)$r['vacation_allowances_json'], true);
            if (!is_array($allow) || !isset($allow['annual'], $allow['sick'], $allow['doctor'], $allow['unpaid'])) $detail[] = "{$ref}: allowances";
            if (trim((string)$r['notes']) === '') $detail[] = "{$ref}: no notes";
        }
        $check('six employees from the company pack: names, e-mail, PIN, position, converted salary, work country, allowances', count($demoEmps) === 6 && !$detail, implode("\n", $detail));

        // --- the three logins are linked through employees.user_id -----------------------------------
        $link = [];
        foreach ($company['employees'] as $ref => $e) {
            $want = empty($e['user']) ? null : demo_ref_id($e['user']);
            $got = array_key_exists(demo_ref_id($ref), $emps) ? $emps[demo_ref_id($ref)]['user_id'] : '(no row)';
            if ($got !== $want) $link[] = "{$ref}: user_id " . var_export($got, true) . ' != ' . var_export($want, true);
        }
        $check('E1-E3 are linked to owner / pm / sales by user_id, E4-E6 have no login', !$link, implode("\n", $link));

        // --- salaries: one row per employee, the install month ---------------------------------------
        $salaries = array_filter($db->rows('employee_salaries'), static fn($r) => strpos($r['id'], 'demo-employees-') === 0);
        $periodKey = (new DateTimeImmutable('today'))->format('Y-m');
        $bad = [];
        $byEmp = [];
        foreach ($salaries as $s) {
            $byEmp[$s['employee_id']][] = $s;
            $items = json_decode((string)$s['items_json'], true);
            $sum = 0.0;
            foreach ($items as $it) $sum += (float)$it['salary'];
            if ($s['period_key'] !== $periodKey || $s['period_type'] !== 'monthly') $bad[] = "{$s['id']}: period {$s['period_key']}";
            if (abs($sum - (float)$s['total_salary']) > 0.01) $bad[] = "{$s['id']}: total {$s['total_salary']} != items {$sum}";
            if (($items[0]['categoryId'] ?? '') !== 'base' || abs((float)$items[0]['salary'] - (float)$emps[$s['employee_id']]['salary_amount']) > 0.001) $bad[] = "{$s['id']}: base line is not the salary";
            foreach ($items as $it) if (!in_array($it['categoryId'], ['base', 'bonus', 'overtime', 'reimbursement'], true) || trim($it['categoryName']) === '') $bad[] = "{$s['id']}: category {$it['categoryId']}";
            $paid = $s['status'] === 'paid';
            if ($paid !== (abs((float)$s['total_paid'] - (float)$s['total_salary']) < 0.001) || (!$paid && (float)$s['total_paid'] != 0.0) || $paid === ($s['payment_date'] === null)) $bad[] = "{$s['id']}: status {$s['status']} / paid {$s['total_paid']} / payment_date " . var_export($s['payment_date'], true);
            if (!preg_match('/^demo-employees-sal-[1-6]-\d{4}-\d{2}$/', $s['id'])) $bad[] = "{$s['id']}: id shape";
        }
        $check('one payroll row per employee for the install month: base line = salary, total = items, paid only once the payday has come', count($salaries) === 6 && count($byEmp) === 6 && !$bad, implode("\n", $bad));
        $refOf = [];
        foreach (array_keys($company['employees']) as $ref) $refOf[demo_ref_id($ref)] = $ref;
        $badExtra = [];
        foreach ($salaries as $s) {
            foreach (array_slice(json_decode((string)$s['items_json'], true), 1) as $it) {
                $match = array_values(array_filter($pack['payroll']['extras'], static fn($x) => $x['employee'] === $refOf[$s['employee_id']] && $x['category'] === $it['categoryId']));
                if (!$match || abs((float)$it['salary'] - demo_money((float)$match[0]['amountEur'])) > 0.001) $badExtra[] = "{$s['id']}: {$it['categoryId']} {$it['salary']}";
            }
        }
        $extraCount = array_sum(array_map(static fn($s) => count(json_decode((string)$s['items_json'], true)) - 1, $salaries));
        $check('payroll extras (commission, overtime, travel) are the pack\'s, converted with demo_money()', !$badExtra && $extraCount === count($pack['payroll']['extras']), implode("\n", $badExtra));

        // --- leave: working days of the edition's calendar, no overlaps, around today -----------------
        $vacs = array_filter($db->rows('employee_vacations'), static fn($r) => strpos($r['id'], 'demo-employees-vac-') === 0);
        $years = [];
        foreach ($vacs as $v) { $years[substr($v['start_date'], 0, 4)] = true; $years[substr($v['end_date'], 0, 4)] = true; }
        $holidays = [];
        if ($ctx['holidayCountry'] !== null) foreach (array_keys($years) as $y) foreach (ccrm_holidays_builtin($ctx['holidayCountry'], (int)$y) as $d) $holidays[$d['date']] = true;
        $bad = [];
        $today = (new DateTimeImmutable('today'))->format('Y-m-d');
        $perEmp = [];
        foreach ($vacs as $v) {
            $cursor = new DateTimeImmutable($v['start_date']);
            $count = 0;
            while ($cursor->format('Y-m-d') <= $v['end_date']) {
                $ymd = $cursor->format('Y-m-d');
                if ((int)$cursor->format('N') < 6 && !isset($holidays[$ymd])) $count++;
                $cursor = $cursor->modify('+1 day');
            }
            $weekday = static fn(string $d) => (int)(new DateTimeImmutable($d))->format('N') < 6 && !isset($holidays[$d]);
            if (!$weekday($v['start_date']) || !$weekday($v['end_date'])) $bad[] = "{$v['id']}: starts or ends on a day off";
            if ($count !== (int)round((float)$v['days_count'])) $bad[] = "{$v['id']}: days_count {$v['days_count']} but {$count} working days";
            if (!in_array($v['vacation_type_id'], ['annual', 'sick', 'doctor', 'unpaid'], true)) $bad[] = "{$v['id']}: type {$v['vacation_type_id']}";
            if ($v['status'] === 'pending' && ($v['start_date'] <= $today || $v['approved_by'] !== null)) $bad[] = "{$v['id']}: a pending request must be in the future and unapproved";
            if ($v['status'] === 'approved' && trim((string)$v['approved_by']) === '') $bad[] = "{$v['id']}: approved without an approver";
            if (!isset($emps[$v['employee_id']])) $bad[] = "{$v['id']}: unknown employee";
            foreach ($perEmp[$v['employee_id']] ?? [] as [$s, $e]) if ($v['start_date'] <= $e && $v['end_date'] >= $s) $bad[] = "{$v['id']}: overlaps another leave of the same person";
            $perEmp[$v['employee_id']][] = [$v['start_date'], $v['end_date']];
        }
        $check('26 leave records: working days only, days_count matches, no overlaps per person, pending only in the future', count($vacs) === 26 && !$bad, implode("\n", $bad));
        $away = array_filter($vacs, static fn($v) => $v['start_date'] <= $today && $v['end_date'] >= $today && $v['status'] === 'approved');
        $check('somebody is on leave today (the calendar of the month is not empty)', count($away) >= 1);
        $statuses = array_count_values(array_column($vacs, 'status'));
        $check('both approved and pending requests exist, past and future', ($statuses['approved'] ?? 0) >= 15 && ($statuses['pending'] ?? 0) >= 4
            && count(array_filter($vacs, static fn($v) => $v['end_date'] < $today)) >= 8 && count(array_filter($vacs, static fn($v) => $v['start_date'] > $today)) >= 8);

        // The people who log time (E1-E3) are not on leave in the window the time module fills.
        $windowStart = demo_d(-35);
        $clash = [];
        foreach ($vacs as $v) {
            if (in_array($v['employee_id'], [demo_ref_id('E1'), demo_ref_id('E2'), demo_ref_id('E3')], true) && $v['end_date'] >= $windowStart && $v['start_date'] < $today) $clash[] = $v['id'];
        }
        $check('E1-E3 have no leave in the last five weeks (the time module logs hours for them there)', !$clash, implode(', ', $clash));

        // --- a login that is already taken by a hand-made employee is left alone ---------------------
        $db2 = new DemoFakePdo();
        $db2->setSetting('SYSTEM_LANGUAGE', $ctx['lang']);
        $db2->setSetting('SYSTEM_CURRENCY', $ctx['currency']);
        demo_seed_all($db2, ['only' => ['company'], 'writeDataset' => false]);
        $ownerId = demo_ref_id('owner');
        $db2->seedRow('employees', ['id' => 'emp-hand-made', 'name' => 'Hand Made', 'user_id' => $ownerId]);
        demo_seed_all($db2, ['only' => ['employees'], 'writeDataset' => false]);
        $rowsHand = array_filter($db2->rows('employees'), static fn($r) => $r['id'] === 'emp-hand-made');
        $e1 = array_values(array_filter($db2->rows('employees'), static fn($r) => $r['id'] === 'demo-employees-1'))[0] ?? null;
        $check('an employee made by hand that holds the owner login keeps it; E1 is simply left unlinked', count($rowsHand) === 1 && array_values($rowsHand)[0]['user_id'] === $ownerId && $e1 !== null && $e1['user_id'] === null);

        // --- no users yet (module run on its own): no foreign key can fail ----------------------------
        $db3 = new DemoFakePdo();
        $db3->setSetting('SYSTEM_LANGUAGE', $ctx['lang']);
        $db3->setSetting('SYSTEM_CURRENCY', $ctx['currency']);
        $report = demo_seed_all($db3, ['only' => ['employees'], 'writeDataset' => false]);
        $check('run before `company` (no users yet): still seeds, employees unlinked', ($report['employees']['ok'] ?? false) === true && count(array_filter($db3->rows('employees'), static fn($r) => $r['user_id'] !== null)) === 0, (string)($report['employees']['error'] ?? ''));
    },
];
