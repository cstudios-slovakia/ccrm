<?php
/**
 * Demo seed module: finance (pack-based, phase 4B).
 *
 * About twelve months of `financial_records` so the dashboard charts have a shape. Every amount
 * is gross (VAT included) like the offers; tax_rate says how much. Records come from five sources:
 *
 *  1. Recurring rules (rent, electricity, software, accounting, bank fees, advertising, weekly
 *     consumables, yearly insurance, the care contract that earns money) and the payroll rules.
 *     A recurring movement is ONE row - the reports derive every past charge from the rule - so
 *     each rule starts ~12 months back; the payroll rules END last month, because the install
 *     month's payroll is written as its own records below (no double count).
 *  2. Payroll of the install month: one expense per salary row of the employees module when
 *     there are linked ones (the client's salary sync creates 'fr-sal-<id>' for every salary
 *     without a financial_record_id, so each salary is linked to its record here), else a plain
 *     total from the cast's salaries; plus the employer contributions.
 *  3. DERIVED rows, read back from the other modules so they cannot disagree with them: every
 *     proforma/invoice of `offers` (same number and total), a vendor bill per goods receipt of
 *     `warehouse` (a foreign supplier charges no domestic VAT), one income per e-shop order of
 *     `orders` that was not cancelled, and the unbilled remainder of each project as planned
 *     instalments - so documents + planned = the project's contract value.
 *  4. Accounting-system invoices and bills from the pack (older partner invoices, slab
 *     purchases, VAT settlements, marketing, project costs).
 *
 * Money (C4): pack amounts are NET EUR; gross = demo_money(net) x (1 + VAT) rounded to the
 * minor unit, VAT being the edition's rate where the record is taxed. Nothing is converted
 * after it was computed. Categories are the instance's own `fc-*` tree (the 3-language default
 * tree is created here when the table is empty). Id plan: sequential from 1.
 * Returns the number of records inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

function demo_seed_finance(PDO $pdo): int {
    $ctx = demo_ctx($pdo);
    $pack = demo_pack($pdo, 'finance');
    $cast = demo_company_pack($ctx['lang']);
    $users = demo_users($pdo);
    $T = $pack['texts'];
    $vat = (float)$ctx['vatDefault'];
    if (!function_exists('ccrm_default_financial_categories')) {
        require_once dirname(__DIR__) . '/schema.php';
    }

    // Salaries linked to a record about to be deleted are re-linked below.
    $pdo->exec("UPDATE `employee_salaries` SET `financial_record_id` = NULL WHERE `financial_record_id` LIKE 'demo-finance-%'");
    $pdo->exec("DELETE FROM `financial_records` WHERE `id` LIKE 'demo-finance-%'");

    // --- Categories: use the instance's tree, create it when there is none ---------------------------
    if ((int)$pdo->query("SELECT COUNT(*) FROM `financial_categories`")->fetchColumn() === 0) {
        $insCat = $pdo->prepare("INSERT INTO `financial_categories` (`id`, `type`, `name`, `parent_id`, `level`, `color`, `icon`) VALUES (?, ?, ?, ?, ?, ?, ?)");
        foreach (ccrm_default_financial_categories($ctx['lang']) as $cat) {
            $insCat->execute([$cat['id'], $cat['type'], $cat['name'], $cat['parent_id'], $cat['level'], $cat['color'], $cat['icon']]);
        }
    }
    $cats = [];
    foreach ($pdo->query("SELECT `id`, `name`, `parent_id` FROM `financial_categories`")->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $cats[$row['id']] = $row;
    }
    $catOf = static function (string $id) use ($cats): array {
        if (!isset($cats[$id])) {
            return [null, null];
        }
        $names = [];
        $cur = $cats[$id];
        for ($i = 0; $i < 5 && $cur; $i++) {
            array_unshift($names, $cur['name']);
            $cur = $cur['parent_id'] !== null ? ($cats[$cur['parent_id']] ?? null) : null;
        }
        return [$id, implode(' > ', $names)];
    };

    $records = [];
    $today = demo_d(0);
    $add = static function (array $r) use (&$records, $vat): void {
        $records[] = $r + [
            'subtype' => 'invoice', 'description' => null, 'real' => 0.0, 'status' => 'planned', 'due' => null, 'paid' => null,
            'payment_method' => 'bank_transfer', 'recurring' => null, 'project_id' => null, 'client_id' => null, 'invoice_number' => null,
            'tax_rate' => $vat, 'created_by' => null,
        ];
    };
    $minor = static fn(float $v): float => demo_money_minor($v);
    /** Gross from a NET EUR amount: [rate, gross]. */
    $gross = static function (float $netEur, bool $taxed) use ($vat, $minor): array {
        $rate = $taxed ? $vat : 0.0;
        return [$rate, $minor(demo_money($netEur) * (1 + $rate / 100))];
    };
    /** [planned, real, status, paid date] for a pack status. */
    $settle = static function (string $status, float $total, string $issue, int $paidAfter) use ($minor, $today): array {
        switch ($status) {
            case 'paid':
                return [$total, $total, 'paid', min($today, demo_shift($issue, $paidAfter))];
            case 'partial':
                return [$total, $minor($total / 2), 'partially_paid', min($today, demo_shift($issue, $paidAfter))];
            case 'overdue':
                return [$total, 0.0, 'overdue', null];
            case 'pending':
                return [$total, 0.0, 'pending', null];
            default:
                return [$total, 0.0, 'planned', null];
        }
    };
    $monthDay = static function (int $monthsBack, int $day): string {
        $first = (new \DateTimeImmutable('today'))->modify('first day of this month')->modify(sprintf('-%d months', $monthsBack));
        $day = min($day, (int)$first->format('t'));
        return $first->setDate((int)$first->format('Y'), (int)$first->format('n'), $day)->format('Y-m-d');
    };
    $userName = static fn(string $role): string => (string)$users[$role]['name'];
    $nameByEmail = static function (string $email) use ($users): string {
        foreach ($users as $u) {
            if (strtolower((string)$u['email']) === strtolower($email)) {
                return (string)$u['name'];
            }
        }
        return (string)$users['owner']['name'];
    };
    $yearOf = static fn(string $date): string => substr($date, 0, 4);
    $periodLabel = static fn(string $date): string => $ctx['lang'] === 'hu'
        ? substr($date, 0, 4) . '. ' . substr($date, 5, 2) . '.'
        : substr($date, 5, 2) . '/' . substr($date, 0, 4);

    // --- 1. Recurring rules -------------------------------------------------------------------------------------
    $lastMonthEnd = (new \DateTimeImmutable('today'))->modify('first day of this month')->modify('-1 day')->format('Y-m-d');
    $addRule = static function (string $type, string $subtype, string $title, ?string $desc, string $category, float $total, float $taxRate, string $freq, array $config, string $start, string $by, ?string $end = null, ?string $clientId = null) use ($add): void {
        $add([
            'type' => $type, 'subtype' => $subtype, 'title' => $title, 'description' => $desc, 'category' => $category,
            'planned' => $total, 'real' => $total, 'status' => 'paid', 'issue' => $start, 'due' => $start, 'paid' => $start,
            'recurring' => [$freq, $config, $start, $end], 'tax_rate' => $taxRate, 'client_id' => $clientId, 'created_by' => $by,
        ]);
    };
    foreach ($pack['rules'] as $r) {
        $start = demo_d($r['startDay']);
        [$rate, $total] = $gross((float)$r['netEur'], (bool)$r['taxed']);
        if ($r['freq'] === 'weekly') {
            $config = ['dayOfWeek' => $r['dow']];
        } elseif ($r['freq'] === 'yearly') {
            $config = ['month' => (int)substr($start, 5, 2), 'dayOfMonth' => (int)substr($start, 8, 2)];
        } else {
            $config = ['monthlyType' => 'day_of_month', 'dayOfMonth' => $r['dom']];
        }
        $addRule($r['kind'], $r['kind'] === 'income' ? 'invoice' : 'other', demo_text($r['title']), demo_text($r['description']), $r['category'], $total, $rate,
            $r['freq'], $config, $start, $userName($r['user']), null, isset($r['client']) ? demo_ref_id($r['client']) : null);
    }
    // Payroll of the past months as two rules that end last month.
    $payroll = 0.0;
    foreach ($cast['employees'] as $e) {
        $payroll += demo_money_salary((float)$e['salaryEur']);
    }
    $payroll = $minor($payroll);
    $levies = $minor($payroll * (float)$pack['levyPct'] / 100);
    $addRule('expense', 'salary', $T['salariesRule'], $T['salariesRuleDesc'], 'fc-exp-pay-salaries', $payroll, 0.0, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 15], demo_d(-370), $userName('owner'), $lastMonthEnd);
    $addRule('expense', 'salary', $T['leviesRule'], $T['leviesRuleDesc'], 'fc-exp-pay-salaries', $levies, 0.0, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 22], demo_d(-370), $userName('owner'), $lastMonthEnd);

    // --- 2. Payroll of the install month ------------------------------------------------------------------------------
    $salaryRows = [];
    try {
        $employees = [];
        foreach ($pdo->query("SELECT `id`, `name`, `expense_category_id`, `auto_expense` FROM `employees` WHERE `id` LIKE 'demo-%'")->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $employees[$row['id']] = $row;
        }
        foreach ($pdo->query(
            "SELECT `id`, `employee_id`, `period_key`, `year`, `period_number`, `total_salary`, `total_paid`, `due_date`, `payment_date`, `payment_method`
               FROM `employee_salaries` WHERE `id` LIKE 'demo-%' AND `financial_record_id` IS NULL ORDER BY `period_key`, `id`"
        )->fetchAll(PDO::FETCH_ASSOC) as $s) {
            $e = $employees[$s['employee_id']] ?? null;
            if ($e && (int)$e['auto_expense'] === 1 && ((float)$s['total_salary'] > 0 || (float)$s['total_paid'] > 0)) {
                $salaryRows[] = $s + ['emp_name' => $e['name'], 'emp_category' => $e['expense_category_id']];
            }
        }
    } catch (\Throwable $e) {
        $salaryRows = [];
    }
    $payDay = $monthDay(0, 15);
    $label = $periodLabel($payDay);
    $monthGross = $payroll;
    if ($salaryRows) {
        $monthGross = 0.0;
        foreach ($salaryRows as $s) {
            $total = (float)$s['total_salary'];
            $paidAmount = (float)$s['total_paid'];
            $monthGross += $total;
            $fullyPaid = $paidAmount >= $total && $total > 0;
            $add([
                'type' => 'expense', 'subtype' => 'salary',
                'title' => str_replace(['%name%', '%period%'], [$s['emp_name'], $s['period_key']], $T['salary']),
                'description' => str_replace('%name%', $s['emp_name'], $T['salaryDesc']),
                'category' => $s['emp_category'] ?: 'fc-exp-pay-salaries', 'planned' => $total, 'real' => $paidAmount,
                'status' => $fullyPaid ? 'paid' : ($paidAmount > 0 ? 'partially_paid' : 'planned'),
                'issue' => sprintf('%04d-%02d-01', (int)$s['year'], (int)$s['period_number']), 'due' => $s['due_date'],
                'paid' => $paidAmount > 0 ? ($s['payment_date'] ?: $today) : null, 'payment_method' => $s['payment_method'] ?: 'bank_transfer',
                'tax_rate' => 0, 'created_by' => $userName('owner'), 'salary_id' => $s['id'],
            ]);
        }
        $monthGross = $minor($monthGross);
    } else {
        $done = $payDay <= $today;
        $add([
            'type' => 'expense', 'subtype' => 'salary', 'title' => str_replace('%period%', $label, $T['salaries']), 'description' => $T['salariesDesc'],
            'category' => 'fc-exp-pay-salaries', 'planned' => $payroll, 'real' => $done ? $payroll : 0.0, 'status' => $done ? 'paid' : 'planned',
            'issue' => $payDay, 'due' => $payDay, 'paid' => $done ? demo_shift($payDay, -1) : null, 'tax_rate' => 0, 'created_by' => $userName('owner'),
        ]);
    }
    $levyAmount = $minor($monthGross * (float)$pack['levyPct'] / 100);
    $levyDay = $monthDay(0, 22);
    $levyDone = $levyDay <= $today;
    $add([
        'type' => 'expense', 'subtype' => 'salary', 'title' => str_replace('%period%', $label, $T['levies']), 'description' => $T['leviesDesc'],
        'category' => 'fc-exp-pay-salaries', 'planned' => $levyAmount, 'real' => $levyDone ? $levyAmount : 0.0, 'status' => $levyDone ? 'paid' : 'planned',
        'issue' => $levyDay, 'due' => $levyDay, 'paid' => $levyDone ? $levyDay : null, 'tax_rate' => 0, 'created_by' => $userName('owner'),
    ]);

    // --- 3a. The proforma and invoice documents of the offers module ---------------------------------------------------------
    $offerDocKeys = [];
    $offerPack = null;
    $billed = [];       // project ref => gross already billed by documents
    $docRows = [];
    if (demo_table_exists($pdo, 'invoices_offers')) {
        $offerPack = demo_pack($pdo, 'offers');
        $offerDocKeys = array_keys($offerPack['docs']);
        $docRows = $pdo->query(
            "SELECT * FROM `invoices_offers` WHERE `id` LIKE 'demo-offers-%' AND `type` IN ('proforma', 'invoice') ORDER BY `issued_at`"
        )->fetchAll(PDO::FETCH_ASSOC);
    }
    foreach ($docRows as $doc) {
        $total = (float)$doc['total_price'];
        $due = $doc['due_date'];
        // The wizard has no "paid" status: a proforma that became an invoice, or an approved invoice, was paid.
        $paid = in_array($doc['status'], ['invoiced', 'approved'], true);
        $overdue = !$paid && $due !== null && $due < $today;
        $key = $offerDocKeys[(int)substr($doc['id'], strlen('demo-offers-')) - 1] ?? null;
        $projectRef = $key !== null ? ($offerPack['docs'][$key]['project'] ?? null) : null;
        if ($projectRef !== null) {
            $billed[$projectRef] = ($billed[$projectRef] ?? 0.0) + $total;
        }
        $add([
            'type' => 'income', 'subtype' => 'invoice',
            'title' => str_replace('%client%', $doc['client_name'], $T[$doc['type']]), 'description' => $doc['subject'],
            'category' => 'fc-inc-svc-projects', 'planned' => $total, 'real' => $paid ? $total : 0.0,
            'status' => $paid ? 'paid' : ($overdue ? 'overdue' : 'pending'), 'issue' => $doc['issued_at'], 'due' => $due,
            'paid' => $paid ? min($today, demo_shift($doc['issued_at'], 5)) : null,
            'project_id' => $projectRef !== null ? demo_ref_id($projectRef) : null, 'client_id' => $doc['lead_id'], 'invoice_number' => $doc['document_number'],
            'created_by' => (string)($doc['created_by'] ?: $userName('owner')),
        ]);
    }

    // --- 3b. The e-shop orders of the orders module -------------------------------------------------------------------------------
    if (demo_table_exists($pdo, 'orders')) {
        foreach ($pdo->query("SELECT * FROM `orders` WHERE `id` LIKE 'demo-orders-%' ORDER BY `order_date`")->fetchAll(PDO::FETCH_ASSOC) as $o) {
            if ($o['status'] === 'cancelled') {
                continue;
            }
            $total = (float)$o['total_gross_amount'];
            $paid = $o['payment_status'] === 'paid';
            $issue = (string)$o['order_date'];
            $add([
                'type' => 'income', 'subtype' => 'invoice', 'title' => str_replace('%number%', $o['order_number'], $T['eshop']), 'description' => $T['eshopDesc'],
                'category' => 'fc-inc-sales-online', 'planned' => $total, 'real' => $paid ? $total : 0.0, 'status' => $paid ? 'paid' : 'pending',
                'issue' => $issue, 'due' => demo_shift($issue, 7), 'paid' => $paid ? substr((string)$o['paid_at'], 0, 10) : null,
                'client_id' => $o['client_id'], 'invoice_number' => $o['order_number'], 'created_by' => (string)$o['created_by'],
            ]);
        }
    }

    // --- 3c. Planned instalments: the unbilled remainder of each project ----------------------------------------------------------
    $projectValue = [];
    foreach ($pdo->query("SELECT `id`, `value` FROM `projects` WHERE `id` LIKE 'demo-projects-%'")->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $projectValue[$row['id']] = (float)$row['value'];
    }
    $perProject = [];
    foreach ($pack['planned'] as $p) {
        $perProject[$p['project']] = ($perProject[$p['project']] ?? 0) + 1;
    }
    $remaining = [];
    $left = [];
    foreach ($pack['planned'] as $p) {
        $ref = $p['project'];
        $value = $projectValue[demo_ref_id($ref)] ?? null;
        if ($value === null) {
            continue;
        }
        if (!isset($remaining[$ref])) {
            $remaining[$ref] = $minor($value - ($billed[$ref] ?? 0.0));
            $left[$ref] = $remaining[$ref];
            $perProject[$ref . '#seen'] = 0;
        }
        $perProject[$ref . '#seen']++;
        $isLast = $perProject[$ref . '#seen'] === $perProject[$ref];
        $amount = $isLast ? $left[$ref] : $minor($remaining[$ref] * (float)$p['share'] / 100);
        $left[$ref] = $minor($left[$ref] - $amount);
        if ($amount <= 0) {
            continue;
        }
        $add([
            'type' => 'income', 'subtype' => 'invoice', 'title' => demo_text($p['title']), 'description' => demo_text($p['description']),
            'category' => 'fc-inc-svc-projects', 'planned' => $amount, 'status' => 'planned', 'issue' => demo_d($p['day']), 'due' => demo_d($p['day'] + 14),
            'project_id' => demo_ref_id($ref), 'client_id' => demo_ref_id($cast['projects'][$ref]['client']), 'created_by' => $userName('pm'),
        ]);
    }

    // --- 3d. Vendor bills derived from the warehouse receipts -------------------------------------------------------------------------
    if (demo_table_exists($pdo, 'warehouse_movements')) {
        $suppliers = [];
        foreach ($pdo->query("SELECT `id`, `name`, `payment_due_days` FROM `suppliers` WHERE `id` LIKE 'demo-warehouse-%'")->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $suppliers[$row['id']] = $row;
        }
        $foreign = [];
        foreach ($cast['suppliers'] as $ref => $s) {
            $foreign[demo_ref_id($ref)] = !empty($s['_foreign']);
        }
        $movements = $pdo->query(
            "SELECT * FROM `warehouse_movements` WHERE `id` LIKE 'demo-warehouse-%' AND `type` = 'inward' ORDER BY `issued_at`"
        )->fetchAll(PDO::FETCH_ASSOC);
        foreach ($movements as $m) {
            $sup = $suppliers[$m['supplier_id']] ?? ['name' => '', 'payment_due_days' => 14];
            $issue = substr((string)$m['issued_at'], 0, 10);
            $due = demo_shift($issue, (int)$sup['payment_due_days']);
            $rate = !empty($foreign[$m['supplier_id']]) ? 0.0 : $vat;
            $total = $minor((float)$m['total_cost_value'] * (1 + $rate / 100));
            $paid = $due < demo_shift($today, -6);
            $overdue = !$paid && $due < $today;
            $add([
                'type' => 'expense', 'subtype' => 'vendor_bill',
                'title' => str_replace(['%number%', '%supplier%'], [$m['document_number'], $sup['name']], $T['receipt']), 'description' => $T['receiptDesc'],
                'category' => 'fc-exp-cogs-materials', 'planned' => $total, 'real' => $paid ? $total : 0.0,
                'status' => $paid ? 'paid' : ($overdue ? 'overdue' : 'pending'), 'issue' => $issue, 'due' => $due, 'paid' => $paid ? demo_shift($due, -2) : null,
                'invoice_number' => 'DF-' . $yearOf($issue) . '-' . substr((string)$m['document_number'], -3), 'tax_rate' => $rate,
                'created_by' => $nameByEmail((string)$m['created_by']),
            ]);
        }
    }

    // --- 4. Accounting-system invoices and bills of the pack -------------------------------------------------------------------------------
    $seq = 31;
    foreach ($pack['income'] as $r) {
        $issue = demo_d($r['day']);
        [$rate, $total] = $gross((float)$r['netEur'], (bool)$r['taxed']);
        [$planned, $real, $status, $paid] = $settle($r['status'], $total, $issue, 9);
        $add([
            'type' => 'income', 'subtype' => 'invoice', 'title' => demo_text($r['title']), 'description' => demo_text($r['description']), 'category' => $r['category'],
            'planned' => $planned, 'real' => $real, 'status' => $status, 'issue' => $issue, 'due' => demo_shift($issue, (int)$r['dueDays']), 'paid' => $paid,
            'payment_method' => $r['method'], 'project_id' => isset($r['project']) ? demo_ref_id($r['project']) : null,
            'client_id' => isset($r['client']) ? demo_ref_id($r['client']) : null,
            'invoice_number' => $status === 'planned' ? null : $yearOf($issue) . str_pad((string)$seq++, 4, '0', STR_PAD_LEFT), 'tax_rate' => $rate,
            'created_by' => $userName($r['user']),
        ]);
    }
    foreach ($pack['bills'] as $r) {
        $issue = demo_d($r['day']);
        [$rate, $total] = $gross((float)$r['netEur'], (bool)$r['taxed']);
        [$planned, $real, $status, $paid] = $settle($r['status'], $total, $issue, min(9, (int)$r['dueDays']));
        $title = demo_text($r['title']);
        if (isset($r['supplier'])) {
            $title .= ' – ' . $cast['suppliers'][$r['supplier']]['name'];
        }
        $add([
            'type' => 'expense', 'subtype' => $r['category'] === 'fc-exp-adm-taxes' ? 'tax' : 'vendor_bill', 'title' => $title, 'description' => demo_text($r['description']),
            'category' => $r['category'], 'planned' => $planned, 'real' => $real, 'status' => $status, 'issue' => $issue, 'due' => demo_shift($issue, (int)$r['dueDays']),
            'paid' => $paid, 'payment_method' => $r['method'], 'project_id' => isset($r['project']) ? demo_ref_id($r['project']) : null,
            'client_id' => isset($r['client']) ? demo_ref_id($r['client']) : null, 'invoice_number' => $r['number'] === '' ? null : $r['number'],
            'tax_rate' => $rate, 'created_by' => $userName($r['user']),
        ]);
    }

    // --- Write ------------------------------------------------------------------------------------------------------------------------------------
    $ins = $pdo->prepare(
        "INSERT INTO `financial_records` (`id`, `type`, `subtype`, `title`, `description`, `category_id`, `category_path`, `amount_planned`, `amount_real`, `currency`,
            `status`, `issue_date`, `due_date`, `paid_date`, `payment_method`, `is_recurring`, `recurring_frequency`, `recurring_config_json`, `recurring_start_date`,
            `recurring_end_date`, `project_id`, `client_id`, `invoice_number`, `tax_rate`, `created_by`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $linkSalary = $pdo->prepare("UPDATE `employee_salaries` SET `financial_record_id` = ? WHERE `id` = ?");
    $n = 0;
    foreach ($records as $r) {
        $n++;
        [$catId, $catPath] = $catOf($r['category']);
        $rec = $r['recurring'];
        if (!empty($r['salary_id'])) {
            $linkSalary->execute([demo_id('finance', $n), $r['salary_id']]);
        }
        $ins->execute([
            demo_id('finance', $n), $r['type'], $r['subtype'], $r['title'], $r['description'], $catId, $catPath,
            $r['planned'], $r['real'], $ctx['currency'], $r['status'], $r['issue'], $r['due'], $r['paid'], $r['payment_method'],
            $rec ? 1 : 0, $rec ? $rec[0] : null, $rec ? json_encode($rec[1]) : null, $rec ? $rec[2] : null, $rec ? $rec[3] : null,
            $r['project_id'], $r['client_id'], $r['invoice_number'], $r['tax_rate'], $r['created_by'],
        ]);
    }
    return $n;
}

if (!function_exists('demo_shift')) {
    /** A 'Y-m-d' date moved by $days days. */
    function demo_shift(string $ymd, int $days): string {
        return (new \DateTimeImmutable($ymd))->modify(sprintf('%+d days', $days))->format('Y-m-d');
    }
}
