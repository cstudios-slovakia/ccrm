<?php
/**
 * Assertions for the `finance` demo module (phase 4B). Format: scripts/demo-assert/company.php.
 * Finance must agree with what it stands for - every proforma/invoice, goods receipt and e-shop order has its
 * record with the same number and amount in EVERY currency - and a project's documents plus its planned
 * instalments must add up to its contract value. Tolerance: 0.01, 1 for HUF (x the number of terms summed).
 */
return [
    'minRows' => [
        'financial_records' => 60,
    ],
    // The default 3-level category tree is the instance's own data (ids fc-*), not a demo row (B7).
    'idAllow' => [
        'financial_categories' => '/^fc-[a-z0-9-]+$/',
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        demo_ctx_force($ctx['lang'], $ctx['currency']);
        $tol = $ctx['whole'] ? 1.0 : 0.01;
        $near = static fn(float $a, float $b, float $k = 1.0): bool => abs($a - $b) <= $tol * $k;
        $pack = demo_pack_for($ctx['lang'], 'finance');
        $cast = demo_company_pack($ctx['lang']);
        $vat = (float)$ctx['vatDefault'];
        $today = demo_d(0);

        $recs = $db->rows('financial_records');
        $cats = array_column($db->rows('financial_categories'), 'id');
        $byNumber = [];
        foreach ($recs as $r) if ($r['invoice_number'] !== null) $byNumber[$r['invoice_number']][] = $r;

        // Shape of every record.
        $bad = [];
        // A salary expense that belongs to an employee_salaries row is the record sync.php derives for it:
        // status 'planned' (nothing paid yet), issue date = the 1st of the salary's month, which has already
        // begun. Writing it any other way would make the first save of the salary change it (A5 #33).
        $salaryLinked = [];
        foreach ($db->rows('employee_salaries') as $sal) {
            if (!empty($sal['financial_record_id'])) $salaryLinked[$sal['financial_record_id']] = sprintf('%04d-%02d-01', (int)$sal['year'], (int)$sal['period_number']);
        }
        foreach ($recs as $r) {
            $t = "{$r['id']} ({$r['title']})";
            if ($r['currency'] !== $ctx['currency']) $bad[] = "{$t}: currency {$r['currency']}";
            if ((float)$r['amount_planned'] <= 0) $bad[] = "{$t}: planned {$r['amount_planned']}";
            if ($ctx['whole'] && (abs((float)$r['amount_planned'] - round((float)$r['amount_planned'])) > 1e-9 || abs((float)$r['amount_real'] - round((float)$r['amount_real'])) > 1e-9)) $bad[] = "{$t}: a fractional amount in {$ctx['currency']}";
            if (!in_array($r['category_id'], $cats, true)) $bad[] = "{$t}: category {$r['category_id']} is not in the tree";
            switch ($r['status']) {
                case 'paid': if (!$near((float)$r['amount_real'], (float)$r['amount_planned'])) $bad[] = "{$t}: paid but real {$r['amount_real']} != planned {$r['amount_planned']}"; break;
                case 'partially_paid': if ((float)$r['amount_real'] <= 0 || (float)$r['amount_real'] >= (float)$r['amount_planned']) $bad[] = "{$t}: partially paid with real {$r['amount_real']}"; break;
                default: if ((float)$r['amount_real'] != 0.0 && !$r['is_recurring']) $bad[] = "{$t}: {$r['status']} but real {$r['amount_real']}";
            }
            if (!$r['is_recurring']) {
                if ($r['due_date'] !== null && $r['due_date'] < $r['issue_date']) $bad[] = "{$t}: due before issue";
                if ($r['status'] === 'overdue' && !($r['due_date'] < $today)) $bad[] = "{$t}: overdue but due {$r['due_date']}";
                if (in_array($r['status'], ['pending'], true) && $r['due_date'] !== null && $r['due_date'] < $today) $bad[] = "{$t}: pending past its due date {$r['due_date']}";
                $derivedSalary = isset($salaryLinked[$r['id']]) && $salaryLinked[$r['id']] === $r['issue_date'];
                if ($r['status'] === 'planned' && $r['issue_date'] < $today && !$derivedSalary) $bad[] = "{$t}: planned in the past";
                if (in_array($r['status'], ['paid', 'partially_paid'], true) && ($r['paid_date'] === null || $r['paid_date'] > $today || $r['paid_date'] < $r['issue_date'])) $bad[] = "{$t}: paid on {$r['paid_date']}";
            }
        }
        $check('every record: currency ' . $ctx['currency'] . ', positive amounts, status matches amounts and dates, category exists', !$bad, implode("\n", array_slice($bad, 0, 8)));

        // Twelve months of shape.
        $months = [];
        foreach ($recs as $r) if (!$r['is_recurring']) $months[substr($r['issue_date'], 0, 7)] = true;
        $rules = array_filter($recs, fn($r) => $r['is_recurring']);
        $check('one-off records spread over at least 11 months', count($months) >= 11, (string)count($months));
        $check('12 recurring rules (10 from the pack + 2 payroll), each one row, the monthly ones starting about a year back',
            count($rules) === 12 && count(array_filter($rules, fn($r) => $r['recurring_frequency'] === 'monthly' && $r['recurring_start_date'] <= demo_d(-360))) >= 9, (string)count($rules));
        $payroll = array_values(array_filter($rules, fn($r) => $r['subtype'] === 'salary'));
        $lastMonthEnd = (new DateTimeImmutable('today'))->modify('first day of this month')->modify('-1 day')->format('Y-m-d');
        $check('the payroll rules end last month, because the install month has its own payroll records', count($payroll) === 2
            && array_reduce($payroll, fn($ok, $r) => $ok && $r['recurring_end_date'] === $lastMonthEnd, true));
        $month = substr($today, 0, 7);
        $thisMonthSalary = array_filter($recs, fn($r) => !$r['is_recurring'] && $r['subtype'] === 'salary' && substr($r['issue_date'], 0, 7) === $month);
        // Without employee salary rows: one plain payroll total + the contributions (2). With them (the employees
        // module ran): one expense per salary row of the install month + the contributions.
        $monthSalaryRows = array_filter($db->rows('employee_salaries'), fn($sal) => !empty($sal['financial_record_id']) && sprintf('%04d-%02d', (int)$sal['year'], (int)$sal['period_number']) === $month);
        $expectedPayroll = $monthSalaryRows ? count($monthSalaryRows) + 1 : 2;
        $check('the install month has payroll and employer-contribution records', count($thisMonthSalary) === $expectedPayroll && count(array_filter($thisMonthSalary, fn($r) => strpos((string)$r['id'], 'demo-finance-') === 0)) === $expectedPayroll, count($thisMonthSalary) . ' records, expected ' . $expectedPayroll);

        // Gross = demo_money(net) x (1 + VAT) for a taxed rule, = demo_money(net) for an untaxed one.
        $rent = array_values(array_filter($rules, fn($r) => $r['category_id'] === 'fc-exp-ovh-rent'))[0] ?? null;
        $elec = array_values(array_filter($rules, fn($r) => $r['category_id'] === 'fc-exp-ovh-util'))[0] ?? null;
        $check('an untaxed rule is demo_money(net); a taxed one adds the country\'s VAT (' . $ctx['vatDefault'] . ' %)',
            $rent && $elec && abs((float)$rent['amount_planned'] - demo_money(2600.0)) < 1e-9 && (float)$rent['tax_rate'] === 0.0
            && $near((float)$elec['amount_planned'], demo_money(540.0) * (1 + $vat / 100)) && (float)$elec['tax_rate'] === $vat);

        // Documents: every proforma/invoice has exactly one record with its number and total.
        $bad = [];
        $docs = array_filter($db->rows('invoices_offers'), fn($d) => in_array($d['type'], ['proforma', 'invoice'], true));
        foreach ($docs as $d) {
            $m = $byNumber[$d['document_number']] ?? [];
            if (count($m) !== 1) { $bad[] = "{$d['document_number']}: " . count($m) . ' records'; continue; }
            $r = $m[0];
            if (!$near((float)$r['amount_planned'], (float)$d['total_price'])) $bad[] = "{$d['document_number']}: record {$r['amount_planned']} != document {$d['total_price']}";
            $paid = in_array($d['status'], ['invoiced', 'approved'], true);
            $expect = $paid ? 'paid' : ($d['due_date'] < $today ? 'overdue' : 'pending');
            if ($r['status'] !== $expect) $bad[] = "{$d['document_number']}: status {$r['status']} != {$expect}";
            if ($r['client_id'] !== $d['lead_id'] || $r['type'] !== 'income') $bad[] = "{$d['document_number']}: client/type";
        }
        $check('every proforma and invoice has one income record with its number, total, client and payment state', $docs && !$bad, implode("\n", array_slice($bad, 0, 6)));

        // Goods receipts -> vendor bills (a foreign supplier charges no domestic VAT).
        $bad = [];
        $foreign = [];
        foreach ($cast['suppliers'] as $ref => $s) $foreign[demo_ref_id($ref)] = !empty($s['_foreign']);
        $inward = array_filter($db->rows('warehouse_movements'), fn($m) => $m['type'] === 'inward');
        foreach ($inward as $m) {
            $found = array_values(array_filter($recs, fn($r) => $r['type'] === 'expense' && strpos((string)$r['title'], $m['document_number']) !== false));
            if (count($found) !== 1) { $bad[] = "{$m['document_number']}: " . count($found) . ' bills'; continue; }
            $rate = !empty($foreign[$m['supplier_id']]) ? 0.0 : $vat;
            if (!$near((float)$found[0]['amount_planned'], (float)$m['total_cost_value'] * (1 + $rate / 100))) $bad[] = "{$m['document_number']}: bill {$found[0]['amount_planned']} != cost {$m['total_cost_value']} + {$rate} %";
            if ((float)$found[0]['tax_rate'] !== $rate) $bad[] = "{$m['document_number']}: tax rate {$found[0]['tax_rate']}";
        }
        $check('every goods receipt has one vendor bill with its cost plus VAT (none for the foreign supplier)', $inward && !$bad, implode("\n", array_slice($bad, 0, 6)));

        // E-shop orders -> income records; the cancelled one has none.
        $bad = [];
        foreach ($db->rows('orders') as $o) {
            $m = $byNumber[$o['order_number']] ?? [];
            if ($o['status'] === 'cancelled') { if ($m) $bad[] = "{$o['order_number']}: a cancelled order has income"; continue; }
            if (count($m) !== 1 || !$near((float)$m[0]['amount_planned'], (float)$o['total_gross_amount'])) $bad[] = "{$o['order_number']}: " . (count($m) === 1 ? "record {$m[0]['amount_planned']} != gross {$o['total_gross_amount']}" : count($m) . ' records');
            elseif (($m[0]['status'] === 'paid') !== ($o['payment_status'] === 'paid')) $bad[] = "{$o['order_number']}: payment state differs";
        }
        $check('every non-cancelled e-shop order has one income record with its gross total and payment state', !$bad, implode("\n", $bad));

        // Projects: documents + planned instalments = contract value (P4 is a rolling framework, P2 is one invoice).
        $bad = [];
        foreach ($db->rows('projects') as $p) {
            if ($p['id'] === 'demo-projects-4') continue;
            $sum = 0.0;
            $n = 0;
            foreach ($recs as $r) if ($r['type'] === 'income' && $r['project_id'] === $p['id'] && !$r['is_recurring']) { $sum += (float)$r['amount_planned']; $n++; }
            if (!$near($sum, (float)$p['value'], max(1, $n))) $bad[] = "{$p['name']}: documents + planned " . round($sum, 2) . " != value {$p['value']}";
        }
        $check('per project, issued documents + planned instalments add up to the contract value (P1, P2, P3, P5)', !$bad, implode("\n", $bad));

        // The linked-salary path: employees with auto_expense get one expense per salary row and the row is linked.
        $sdb = new DemoFakePdo();
        $sdb->setSetting('SYSTEM_LANGUAGE', $ctx['lang']);
        $sdb->setSetting('SYSTEM_CURRENCY', $ctx['currency']);
        $period = substr($today, 0, 7);
        foreach ([['demo-employees-1', 'A One', 2000.0], ['demo-employees-2', 'B Two', 1500.0]] as [$id, $name, $amount]) {
            $sdb->seedRow('employees', ['id' => $id, 'name' => $name, 'auto_expense' => 1, 'expense_category_id' => null]);
            $sdb->seedRow('employee_salaries', ['id' => 'demo-employees-sal-' . substr($id, -1), 'employee_id' => $id, 'period_key' => $period, 'year' => (int)substr($period, 0, 4),
                'period_number' => (int)substr($period, 5, 2), 'items_json' => '[]', 'total_salary' => $amount, 'total_paid' => 0, 'status' => 'pending', 'due_date' => $today]);
        }
        $report = demo_seed_all($sdb, ['only' => ['finance'], 'writeDataset' => false]);
        $srecs = $sdb->rows('financial_records');
        $salaryRecs = array_values(array_filter($srecs, fn($r) => $r['subtype'] === 'salary' && !$r['is_recurring']));
        $linked = array_filter($sdb->rows('employee_salaries'), fn($s) => strpos((string)$s['financial_record_id'], 'demo-finance-') === 0);
        $levy = array_values(array_filter($salaryRecs, fn($r) => $r['amount_planned'] != 2000.0 && $r['amount_planned'] != 1500.0))[0] ?? null;
        $check('with auto-expense employees: one expense per salary row, each salary linked to its record, contributions = ' . $pack['levyPct'] . ' % of them',
            !empty($report['finance']['ok']) && count($salaryRecs) === 3 && count($linked) === 2 && $levy && $near((float)$levy['amount_planned'], round(3500 * $pack['levyPct'] / 100, 2)),
            json_encode([$report['finance'] ?? null, count($salaryRecs), count($linked)]));
        demo_ctx_force($ctx['lang'], $ctx['currency']);
    },
];
