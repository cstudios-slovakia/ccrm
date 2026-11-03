<?php
/**
 * Assertions for the `time` demo module (C10 of docs/DEMO-MODE.md). Format: header of
 * public/api/demo_seed/index.php, worked example: scripts/demo-assert/company.php.
 *
 * Besides the shared dry run (no tasks or tickets exist yet, so every entry is a plain one) a
 * second scenario seeds demo tasks, tickets and a TIME_TRACKING_SETTINGS blob by hand and runs the
 * module again to prove the links, the C5 title rule and "an existing settings blob is never changed".
 */
require_once dirname(__DIR__, 2) . '/public/api/time_cost.php';
require_once dirname(__DIR__, 2) . '/public/api/holidays_lib.php';

return [
    'minRows' => [
        'time_entries' => 120,
        'time_tracker_devices' => 1,
        'time_activity' => 4,
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        demo_ctx_force($ctx['lang'], $ctx['currency']);
        $company = demo_company_pack($ctx['lang']);
        $pack = demo_pack_for($ctx['lang'], 'time');
        $tz = new DateTimeZone(demo_time_timezone($ctx['lang']));
        $utc = new DateTimeZone('UTC');
        $roleOf = [];                 // user id => role
        $personOf = [];               // role => ['userId', 'employeeId', 'salary']
        foreach ($company['employees'] as $ref => $e) {
            if (!empty($e['user'])) {
                $roleOf[demo_ref_id($e['user'])] = $e['user'];
                $personOf[$e['user']] = ['userId' => demo_ref_id($e['user']), 'employeeId' => demo_ref_id($ref), 'salary' => demo_money_salary((float)$e['salaryEur'])];
            }
        }
        $entries = array_values(array_filter($db->rows('time_entries'), static fn($r) => strpos($r['id'], 'demo-time-') === 0));
        $byRole = ['owner' => [], 'pm' => [], 'sales' => []];
        foreach ($entries as $r) $byRole[$roleOf[$r['user_id']] ?? '?'][] = $r;
        $local = static fn(string $utcStr): DateTimeImmutable => (new DateTimeImmutable($utcStr, $utc))->setTimezone($tz);

        // --- who, how many, which days -------------------------------------------------------------------
        $check('128 entries for exactly the three logins (owner 36, pm 48, sales 44), recorded by themselves, employee resolved',
            count($entries) === 128 && count($byRole['owner']) === 36 && count($byRole['pm']) === 48 && count($byRole['sales']) === 44 && !isset($byRole['?'])
            && !array_filter($entries, static fn($r) => $r['recorded_by_user_id'] !== $r['user_id'] || $r['employee_id'] !== $personOf[$roleOf[$r['user_id']]]['employeeId']));

        $days = demo_time_working_days($ctx);
        $dates = array_values(array_unique(array_column($entries, 'entry_date')));
        sort($dates);
        $check('entries cover exactly the last 15 working days before today', $dates === $days && count($days) === 15, json_encode([$dates, $days]));

        $blocked = demo_time_blocked_dates($ctx, [(int)substr($days[0], 0, 4), (int)substr($days[14], 0, 4)]);
        $badDay = [];
        $nowUtc = gmdate('Y-m-d H:i:s');
        foreach ($entries as $r) {
            $dow = (int)(new DateTimeImmutable($r['entry_date']))->format('N');
            if ($dow >= 6) $badDay[] = "{$r['id']}: weekend {$r['entry_date']}";
            if (isset($blocked[$r['entry_date']])) $badDay[] = "{$r['id']}: public holiday {$r['entry_date']}";
            if ($r['entry_date'] >= date('Y-m-d') || $r['end_at'] > $nowUtc) $badDay[] = "{$r['id']}: not in the past ({$r['entry_date']} {$r['end_at']})";
            if ($local($r['start_at'])->format('Y-m-d') !== $r['entry_date'] || $local($r['end_at'])->format('Y-m-d') !== $r['entry_date']) $badDay[] = "{$r['id']}: start/end are not on entry_date in the company time zone";
            if ($r['entry_date'] !== $local($r['start_at'])->format('Y-m-d')) $badDay[] = "{$r['id']}: date";
        }
        $check('no entry on a weekend, on a public holiday of the edition\'s calendar, or in the future', !$badDay, implode("\n", array_slice($badDay, 0, 8)));
        $yr = demo_time_blocked_dates($ctx, [2026]);
        $holidayRule = $ctx['lang'] === 'sk' ? isset($yr['2026-11-01']) && isset($yr['2026-12-24']) && !isset($yr['2026-11-26'])
            : ($ctx['lang'] === 'hu' ? isset($yr['2026-10-23']) && isset($yr['2026-11-01']) && !isset($yr['2026-12-24'])
            : isset($yr['2026-11-26']) && isset($yr['2026-07-04']) && isset($yr['2026-07-03']) && isset($yr['2026-11-01']));
        $check('the calendar that is avoided: sk = Slovak, hu = Hungarian, en = US federal (incl. observed days) plus the Slovak one the server would apply (A5 #15)', $holidayRule);

        // The same rules hold for ANY install date, not just today: sweep two years of "today".
        $sweepBad = [];
        $cursor = new DateTimeImmutable('2026-01-01');
        $plan = demo_time_plan(['owner' => 12, 'pm' => 12, 'sales' => 11]);
        $planBad = [];
        $maxEnd = 0;
        foreach ($plan as $role => $list) foreach ($list as $p) $maxEnd = max($maxEnd, $p['start'] + $p['minutes']);
        foreach ($plan as $role => $list) foreach ($list as $p) if ($p['start'] < 7 * 60 || $p['start'] + $p['minutes'] >= 17 * 60) $planBad[] = "{$role} day {$p['day']}: {$p['start']}+{$p['minutes']}";
        for ($i = 0; $i < 730; $i++, $cursor = $cursor->modify('+1 day')) {
            $sweepDays = demo_time_working_days($ctx, $cursor);
            $sweepBlocked = demo_time_blocked_dates($ctx, [(int)$cursor->format('Y') - 1, (int)$cursor->format('Y')]);
            $sorted = $sweepDays;
            sort($sorted);
            if (count($sweepDays) !== 15 || $sorted !== $sweepDays || count(array_unique($sweepDays)) !== 15) $sweepBad[] = $cursor->format('Y-m-d') . ': not 15 ascending distinct days';
            foreach ($sweepDays as $d) {
                if ($d >= $cursor->format('Y-m-d') || (int)(new DateTimeImmutable($d))->format('N') >= 6 || isset($sweepBlocked[$d])) $sweepBad[] = $cursor->format('Y-m-d') . ": bad day {$d}";
                if ($local(demo_time_utc($d, $maxEnd, $tz->getName()))->format('Y-m-d') !== $d || (new DateTimeImmutable(demo_time_utc($d, $maxEnd, $tz->getName()), $utc))->format('Y-m-d') !== $d) $sweepBad[] = "{$d}: the latest end of day is not on the same UTC date";
            }
        }
        $check('for every install date of 2026-2027: 15 ascending working days before today, none on a weekend or holiday; the whole schedule stays between 07:00 and 17:00 so UTC never crosses midnight', !$sweepBad && !$planBad, implode("\n", array_slice(array_merge($planBad, $sweepBad), 0, 5)));

        // --- no overlaps, 2-4 entries and 5-8 h per login and day, sane hours ----------------------------------
        $overlap = [];
        $shape = [];
        foreach ($byRole as $role => $list) {
            usort($list, static fn($a, $b) => strcmp($a['start_at'], $b['start_at']));
            for ($i = 1; $i < count($list); $i++) {
                if ($list[$i]['start_at'] < $list[$i - 1]['end_at']) $overlap[] = "{$role}: {$list[$i - 1]['id']} overlaps {$list[$i]['id']}";
            }
            $perDay = [];
            foreach ($list as $r) {
                $perDay[$r['entry_date']]['n'] = ($perDay[$r['entry_date']]['n'] ?? 0) + 1;
                $perDay[$r['entry_date']]['sec'] = ($perDay[$r['entry_date']]['sec'] ?? 0) + (int)$r['duration_sec'];
                $startMin = (int)$local($r['start_at'])->format('G') * 60 + (int)$local($r['start_at'])->format('i');
                $endMin = (int)$local($r['end_at'])->format('G') * 60 + (int)$local($r['end_at'])->format('i');
                if ($startMin < 7 * 60 || $endMin > 17 * 60) $shape[] = "{$r['id']}: outside 07:00-17:00 local";
                if ((int)$r['duration_sec'] !== (int)((new DateTimeImmutable($r['end_at']))->getTimestamp() - (new DateTimeImmutable($r['start_at']))->getTimestamp())) $shape[] = "{$r['id']}: duration_sec != end - start";
                if ((int)$r['duration_sec'] < 30 * 60) $shape[] = "{$r['id']}: shorter than 30 minutes";
            }
            foreach ($perDay as $d => $x) {
                if ($x['n'] < 2 || $x['n'] > 4) $shape[] = "{$role} {$d}: {$x['n']} entries";
                if ($x['sec'] < 5 * 3600 || $x['sec'] > 8 * 3600) $shape[] = "{$role} {$d}: " . round($x['sec'] / 3600, 2) . ' h';
            }
            if (count($perDay) !== 15) $shape[] = "{$role}: " . count($perDay) . ' days';
        }
        $check('no overlapping entries per login', !$overlap, implode("\n", array_slice($overlap, 0, 8)));
        $check('2-4 entries and 5-8 h per login and day, between 07:00 and 17:00 local, each at least 30 minutes', !$shape, implode("\n", array_slice($shape, 0, 8)));

        // --- no running timer (B10) -----------------------------------------------------------------------------
        $check('no running timer: every entry has an end, so the unique running guard is never hit',
            !array_filter($entries, static fn($r) => $r['start_at'] !== null && $r['end_at'] === null), '');

        // --- cost snapshots computed with the real functions --------------------------------------------------------
        $country = demo_time_server_country($ctx);
        $costBad = [];
        foreach ($entries as $r) {
            $role = $roleOf[$r['user_id']];
            $wd = ccrm_holidays_working_days($db, $country, (int)substr($r['entry_date'], 0, 4), (int)substr($r['entry_date'], 5, 2), [], false);
            $rate = ccrm_tc_cost_rate(['kind' => 'employee', 'salaryType' => 'monthly', 'salaryAmount' => $personOf[$role]['salary']], $wd, ccrm_tc_default_settings());
            $want = ccrm_tc_entry_cost((int)$r['duration_sec'], $rate['rate']);
            if ($r['cost_rate_source'] !== 'monthly' || (int)$r['cost_rate_basis_days'] !== $wd) $costBad[] = "{$r['id']}: source/basis {$r['cost_rate_source']}/{$r['cost_rate_basis_days']} (month has {$wd})";
            if (abs((float)$r['cost_rate'] - (float)$rate['rate']) > 0.00005) $costBad[] = "{$r['id']}: rate {$r['cost_rate']} != {$rate['rate']}";
            if (abs((float)$r['cost'] - (float)$want) > 0.001) $costBad[] = "{$r['id']}: cost {$r['cost']} != {$want}";
            if (abs((float)$r['cost'] - round((int)$r['duration_sec'] / 3600 * (float)$r['cost_rate'], 2)) > 0.001) $costBad[] = "{$r['id']}: cost != round(hours x cost_rate, 2)";
        }
        $check('cost_rate / basis days / cost equal the real ccrm_tc_* functions on the converted salary and the month\'s working days; cost = round(h x rate, 2)', !$costBad, implode("\n", array_slice($costBad, 0, 6)));
        $billBad = [];
        foreach ($entries as $r) {
            if ((int)$r['billable'] === 1 && abs((float)$r['billable_rate'] - demo_money(45.0)) > 0.001) $billBad[] = "{$r['id']}: billable_rate {$r['billable_rate']}";
            if ((int)$r['billable'] === 0 && $r['billable_rate'] !== null) $billBad[] = "{$r['id']}: non-billable with a rate";
        }
        $check('billable entries carry the EUR 45/h rate converted with demo_money(), non-billable none', !$billBad, implode("\n", array_slice($billBad, 0, 4)));

        // --- shares of C10 -------------------------------------------------------------------------------------------
        $share = static function (array $list, callable $pred): float {
            $all = array_sum(array_column($list, 'duration_sec'));
            return $all > 0 ? 100 * array_sum(array_map(static fn($r) => $pred($r) ? (int)$r['duration_sec'] : 0, $list)) / $all : 0;
        };
        $b = [];
        foreach ($byRole as $role => $list) $b[$role] = $share($list, static fn($r) => (int)$r['billable'] === 1);
        $check('billable share by hours: owner ~25 %, pm ~70 %, sales ~45 %', $b['owner'] >= 15 && $b['owner'] <= 35 && $b['pm'] >= 60 && $b['pm'] <= 80 && $b['sales'] >= 35 && $b['sales'] <= 55, json_encode($b));
        $n = count($entries);
        $src = array_count_values(array_column($entries, 'source'));
        $pct = static fn(string $k): float => 100 * ($src[$k] ?? 0) / $n;
        $check('sources: timer ~50 %, manual ~30 %, calendar ~10 %, extension ~10 % (and nothing else)',
            abs($pct('timer') - 50) <= 5 && abs($pct('manual') - 30) <= 5 && abs($pct('calendar') - 10) <= 4 && abs($pct('extension') - 10) <= 4 && array_sum($src) === $n, json_encode($src));
        $unassigned = count(array_filter($entries, static fn($r) => $r['project_id'] === null));
        $check('about one entry in ten has no project (Unsorted / Assign project)', $unassigned / $n >= 0.05 && $unassigned / $n <= 0.15, "{$unassigned} of {$n}");
        $projects = array_unique(array_filter(array_column($entries, 'project_id')));
        sort($projects);
        $check('projects used are P1, P3 and P4 only', $projects === [demo_ref_id('P1'), demo_ref_id('P3'), demo_ref_id('P4')], json_encode($projects));

        // --- approval ----------------------------------------------------------------------------------------------------
        $curMonday = demo_time_monday(date('Y-m-d'));
        $prevMonday = (new DateTimeImmutable($curMonday))->modify('-7 days')->format('Y-m-d');
        $appBad = [];
        $sawSubmitted = false;
        foreach ($entries as $r) {
            $role = $roleOf[$r['user_id']];
            $monday = demo_time_monday($r['entry_date']);
            $want = $monday >= $curMonday ? null : ($monday === $prevMonday && $role === 'owner' ? 'submitted' : 'approved');
            if ($want === 'submitted') $sawSubmitted = true;
            if ($r['approval_status'] !== $want) $appBad[] = "{$r['id']} ({$role} {$r['entry_date']}): " . var_export($r['approval_status'], true) . ' != ' . var_export($want, true);
        }
        $check('previous full week: approved for pm and sales, submitted for owner (older weeks approved); the current week is open', !$appBad && $sawSubmitted, implode("\n", array_slice($appBad, 0, 5)));

        // --- sources carry their own links -------------------------------------------------------------------------------------
        $devRows = array_filter($db->rows('time_tracker_devices'), static fn($r) => strpos($r['id'], 'demo-time-') === 0);
        $dev = array_values($devRows)[0] ?? null;
        $extBad = [];
        foreach ($entries as $r) {
            if ($r['source'] === 'extension' && ($r['device_id'] !== 'demo-time-dev-1' || $roleOf[$r['user_id']] !== 'owner')) $extBad[] = "{$r['id']}: extension entry without the owner's device";
            if ($r['source'] !== 'extension' && $r['device_id'] !== null) $extBad[] = "{$r['id']}: device on a {$r['source']} entry";
            if ($r['source'] === 'calendar' && $r['origin_type'] !== 'calendar') $extBad[] = "{$r['id']}: calendar entry origin";
            if ($r['source'] === 'manual' && $r['origin_type'] !== null) $extBad[] = "{$r['id']}: manual entry with an origin";
        }
        $check('extension entries belong to the owner and the demo device; calendar/manual origins are right', !$extBad, implode("\n", array_slice($extBad, 0, 4)));
        $check('one paired demo browser for the owner: a random sha256 key hash, not revoked', count($devRows) === 1 && $dev['user_id'] === $personOf['owner']['userId']
            && preg_match('/^[0-9a-f]{64}$/', (string)$dev['key_hash']) && $dev['revoked_at'] === null && $dev['name'] === $pack['device']['name'] && strlen($dev['key_prefix']) <= 12);

        // --- Unsorted inbox ----------------------------------------------------------------------------------------------------------
        $acts = array_values(array_filter($db->rows('time_activity'), static fn($r) => strpos($r['id'], 'demo-time-') === 0));
        $yesterday = demo_d(-1);
        $actBad = [];
        foreach ($acts as $a) {
            if ($a['status'] !== 'unsorted' || $a['entry_id'] !== null || $a['user_id'] !== $personOf['owner']['userId'] || $a['device_id'] !== 'demo-time-dev-1') $actBad[] = "{$a['id']}: status/entry/user/device";
            if ($local($a['started_at'])->format('Y-m-d') !== $yesterday) $actBad[] = "{$a['id']}: not from yesterday";
            if ((int)$a['duration_sec'] !== (int)((new DateTimeImmutable($a['ended_at']))->getTimestamp() - (new DateTimeImmutable($a['started_at']))->getTimestamp())) $actBad[] = "{$a['id']}: duration";
            if (!preg_match('/^[a-z0-9.-]+\.example$/', $a['domain'])) $actBad[] = "{$a['id']}: domain {$a['domain']}";
        }
        $check('4 unsorted activity rows for the owner from yesterday, exactly one with a suggested project', count($acts) === 4 && !$actBad
            && count(array_filter($acts, static fn($a) => $a['suggested_project_id'] !== null)) === 1, implode("\n", $actBad));

        // --- cross-module: nobody who logs time is on leave that day -------------------------------------------------------------------
        $leaveClash = [];
        $leaves = array_filter($db->rows('employee_vacations'), static fn($v) => strpos($v['id'], 'demo-employees-') === 0 && $v['status'] === 'approved');
        foreach ($entries as $r) {
            foreach ($leaves as $v) {
                if ($v['employee_id'] === $r['employee_id'] && $r['entry_date'] >= $v['start_date'] && $r['entry_date'] <= $v['end_date']) $leaveClash[] = "{$r['id']} on leave {$v['id']}";
            }
        }
        $check('nobody has time logged on a day of approved leave', !$leaveClash, implode("\n", array_slice($leaveClash, 0, 4)));

        // --- the title rule (C5): a linked entry has no title of its own; a plain one keeps its own -----------------------------------
        $titleBad = array_filter($entries, static fn($r) => ($r['task_id'] !== null || $r['ticket_id'] !== null)
            ? ($r['description'] !== null || trim((string)$r['title_snapshot']) === '')
            : ($r['description'] === null || $r['description'] !== $r['title_snapshot']));
        $check('C5 title rule: a linked entry has description NULL and the item\'s title as snapshot; a plain entry keeps its own title', !$titleBad);
        $taskProject = [];
        foreach ($db->rows('tasks') as $t) $taskProject[$t['id']] = $t['related_project_id'] ?? null;
        $wrongProject = array_filter($entries, static fn($r) => $r['task_id'] !== null && array_key_exists($r['task_id'], $taskProject) && $taskProject[$r['task_id']] !== $r['project_id']);
        $check('every task-linked entry is on the task\'s own project', !$wrongProject, implode(', ', array_slice(array_column($wrongProject, 'id'), 0, 5)));
        $check('TIME_TRACKING_SETTINGS is written (weekly approval on, cost settings of the app)', (function () use ($db) {
            $s = json_decode($db->settings()['TIME_TRACKING_SETTINGS'] ?? 'null', true);
            return is_array($s) && $s['weeklyApproval'] === true && (float)$s['employerMultiplier'] === 1.352 && (int)$s['hoursPerDay'] === 8;
        })());

        // =====================================================================================================================================
        // Scenario 2: tasks and tickets exist, and a settings blob was saved by hand.
        // =====================================================================================================================================
        $db2 = new DemoFakePdo();
        $db2->setSetting('SYSTEM_LANGUAGE', $ctx['lang']);
        $db2->setSetting('SYSTEM_CURRENCY', $ctx['currency']);
        $handSettings = ['weeklyApproval' => false, 'employerMultiplier' => 1.5, 'hoursPerDay' => 8];
        $db2->setSetting('TIME_TRACKING_SETTINGS', json_encode($handSettings));
        $taskRows = [
            [1, 'P1'], [2, 'P1'], [3, 'P3'], [4, 'P3'], [5, 'P4'], [6, 'P4'], [7, 'P4'], [10, 'P1'], [11, null], [12, 'P2'],
        ];
        foreach ($taskRows as [$n, $p]) {
            $db2->seedRow('tasks', ['id' => "demo-tasks-{$n}", 'title' => "Task {$n}", 'deadline' => '2026-12-01', 'owner' => 'x', 'related_project_id' => $p === null ? null : demo_ref_id($p)]);
        }
        $db2->seedRow('tasks', ['id' => 'task-hand-made', 'title' => 'Hand made', 'deadline' => '2026-12-01', 'owner' => 'x', 'related_project_id' => demo_ref_id('P1')]);
        // ticket 2 has no project, only a client: it files under that client's first project (C1 -> P1)
        $db2->seedRow('tickets', ['id' => 'demo-tickets-1', 'ticket_number' => 'T-1', 'title' => 'Ticket 1', 'project_id' => demo_ref_id('P3'), 'client_id' => demo_ref_id('C6')]);
        $db2->seedRow('tickets', ['id' => 'demo-tickets-2', 'ticket_number' => 'T-2', 'title' => 'Ticket 2', 'project_id' => null, 'client_id' => demo_ref_id('C1')]);
        $db2->seedRow('tickets', ['id' => 'demo-tickets-3', 'ticket_number' => 'T-3', 'title' => 'Ticket 3', 'project_id' => demo_ref_id('P4'), 'client_id' => demo_ref_id('C3')]);
        $report = demo_seed_all($db2, ['only' => ['company', 'employees', 'time'], 'writeDataset' => false]);
        $check('scenario 2 (tasks, tickets, hand-made settings): the module runs', ($report['time']['ok'] ?? false) === true, (string)($report['time']['error'] ?? ''));
        $e2 = array_values(array_filter($db2->rows('time_entries'), static fn($r) => strpos($r['id'], 'demo-time-') === 0));
        $linkBad = [];
        $linkedTask = 0;
        $linkedTicket = 0;
        $taskProject = ['demo-tasks-1' => 'P1', 'demo-tasks-2' => 'P1', 'demo-tasks-10' => 'P1', 'demo-tasks-3' => 'P3', 'demo-tasks-4' => 'P3', 'demo-tasks-5' => 'P4', 'demo-tasks-6' => 'P4', 'demo-tasks-7' => 'P4'];
        $ticketProject = ['demo-tickets-1' => 'P3', 'demo-tickets-2' => 'P1', 'demo-tickets-3' => 'P4'];
        foreach ($e2 as $r) {
            if ($r['task_id'] !== null) {
                $linkedTask++;
                if (!isset($taskProject[$r['task_id']]) || demo_ref_id($taskProject[$r['task_id']]) !== $r['project_id']) $linkBad[] = "{$r['id']}: task {$r['task_id']} on project {$r['project_id']}";
                if ($r['description'] !== null || $r['title_snapshot'] !== 'Task ' . substr($r['task_id'], strlen('demo-tasks-'))) $linkBad[] = "{$r['id']}: C5 - a task entry has no title of its own";
                if ($r['ticket_id'] !== null) $linkBad[] = "{$r['id']}: task and ticket";
                if ($r['source'] === 'timer' && ($r['origin_type'] !== 'task' || $r['origin_id'] !== $r['task_id'])) $linkBad[] = "{$r['id']}: origin of a timer entry started from a task";
            } elseif ($r['ticket_id'] !== null) {
                $linkedTicket++;
                if (!isset($ticketProject[$r['ticket_id']]) || demo_ref_id($ticketProject[$r['ticket_id']]) !== $r['project_id']) $linkBad[] = "{$r['id']}: ticket {$r['ticket_id']} on project {$r['project_id']}";
                if ($r['description'] !== null || $r['title_snapshot'] !== 'Ticket ' . substr($r['ticket_id'], strlen('demo-tickets-'))) $linkBad[] = "{$r['id']}: C5 - a ticket entry has no title of its own";
            } elseif ($r['description'] === null || $r['description'] !== $r['title_snapshot']) {
                $linkBad[] = "{$r['id']}: plain entry without its own title";
            }
        }
        $check('with demo tasks and tickets the entries link to them (task of the right project, natural id order, hand-made tasks ignored), linked entries have no title of their own', !$linkBad && $linkedTask > 10 && $linkedTicket > 5, "tasks {$linkedTask}, tickets {$linkedTicket}\n" . implode("\n", array_slice($linkBad, 0, 5)));
        $poolPicks = [];
        foreach ($e2 as $r) if ($r['task_id'] !== null && $r['project_id'] === demo_ref_id('P1')) $poolPicks[$r['task_id']] = true;
        $check('pick 0 / 1 of a project\'s tasks are the first and second in NATURAL id order (demo-tasks-2 before demo-tasks-10)', isset($poolPicks['demo-tasks-1']) && isset($poolPicks['demo-tasks-2']) && !isset($poolPicks['demo-tasks-10']) && !isset($poolPicks['task-hand-made']), implode(',', array_keys($poolPicks)));
        $s2 = json_decode($db2->settings()['TIME_TRACKING_SETTINGS'] ?? 'null', true);
        $check('a TIME_TRACKING_SETTINGS blob saved by hand is not changed', $s2 === $handSettings, json_encode($s2));
        $e2cost = array_values(array_filter($e2, static fn($r) => $r['user_id'] === $personOf['owner']['userId']))[0] ?? null;
        $wd2 = $e2cost ? ccrm_holidays_working_days($db2, $country, (int)substr($e2cost['entry_date'], 0, 4), (int)substr($e2cost['entry_date'], 5, 2), [], false) : 0;
        $rate2 = ccrm_tc_cost_rate(['kind' => 'employee', 'salaryType' => 'monthly', 'salaryAmount' => $personOf['owner']['salary']], $wd2, ['employerMultiplier' => 1.5] + ccrm_tc_default_settings());
        $check('the cost snapshot uses the multiplier of the hand-made settings (1.5), not the default', $e2cost !== null && abs((float)$e2cost['cost_rate'] - (float)$rate2['rate']) < 0.00005, $e2cost ? "{$e2cost['cost_rate']} vs {$rate2['rate']}" : 'no entry');

        // A second run replaces its own rows and leaves a hand-made entry alone.
        $db2->seedRow('time_entries', ['id' => 'te-hand-made', 'user_id' => $personOf['owner']['userId'], 'recorded_by_user_id' => $personOf['owner']['userId'], 'entry_date' => date('Y-m-d', strtotime('-40 days')), 'duration_sec' => 600, 'start_at' => null, 'end_at' => null]);
        demo_seed_all($db2, ['only' => ['time'], 'writeDataset' => false]);
        $after = $db2->rows('time_entries');
        $check('a re-seed replaces the 128 demo entries and keeps a hand-made one', count(array_filter($after, static fn($r) => strpos($r['id'], 'demo-time-') === 0)) === 128 && count(array_filter($after, static fn($r) => $r['id'] === 'te-hand-made')) === 1);
    },
];
