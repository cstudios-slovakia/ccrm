<?php
/**
 * Demo module `time` (C3: after `tickets`, so it can link to demo tasks and tickets).
 *
 * Fills time tracking for the three logins (owner, pm, sales) per C10 of docs/DEMO-MODE.md:
 *
 *  - time_entries: the last 15 WORKING days before today (so none is in the future), 2-4 entries
 *    and 5-8 h per login per day, no overlaps, none on a weekend or a public holiday of the
 *    edition's calendar. The English edition has no calendar of its own (B9), so its entries
 *    avoid the US federal holidays AND the Slovak ones - ccrm_holiday_company_country() hands a
 *    US company the Slovak calendar (A5 #15), and cost rates divide by that month's working days.
 *  - The work itself comes from the pack's per-login POOLS (packs/<lang>/time.php): the module
 *    deals the items out in a fixed order (every item recurs about equally often), splits each
 *    day's hours between the entries and places them from the login's usual start of day.
 *    Sources timer 50 % / manual 30 % / calendar 10 % / extension 10 % (extension: owner only,
 *    the only login with a paired browser).
 *  - Links: an item with `link` => 'task' | 'ticket' points at the pick-th demo task (ticket) of
 *    its project, read from the rows the `tasks` / `tickets` modules wrote (ids demo-tasks-*,
 *    demo-tickets-*; tasks by related_project_id, tickets by project_id, else by the project's
 *    client). A linked entry has NO title of its own (C5): description NULL, title_snapshot =
 *    the linked item's title. When no such task or ticket exists the entry stays a plain one.
 *  - Cost: the snapshot of the real ccrm_tc_cost_rate() (api/time_cost.php) with the employee's
 *    CONVERTED salary and the month's working days (ccrm_holidays_working_days()), cost =
 *    ccrm_tc_entry_cost(). Billable entries carry the pack's EUR 45/h, converted.
 *  - Approval: the previous full week is `approved` for pm and sales and `submitted` for owner
 *    (the app only knows `approved`; `submitted` is an open week), older weeks are `approved`,
 *    the current week is open (NULL).
 *  - One paired Chrome device for owner (a random key hash nobody holds - never usable) and four
 *    `unsorted` time_activity rows from yesterday, one with a suggested project.
 *  - NO running timer (B10): every entry has an end.
 *  - TIME_TRACKING_SETTINGS is written only when absent (weekly approval on, so the approved
 *    week shows); an existing blob is read for its cost settings, never changed.
 *
 * Ids: demo-time-<n> (entries), demo-time-dev-1, demo-time-act-<n>. Returns the rows inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';
require_once __DIR__ . '/../time_cost.php';
require_once __DIR__ . '/../holidays_lib.php';

if (!function_exists('demo_seed_time')) {

    /** Working days the module fills, newest = the last working day before today. */
    function demo_time_days_count(): int {
        return 15;
    }

    /** IANA zone the edition's staff works in; entry times are local to it and stored in UTC. */
    function demo_time_timezone(string $lang): string {
        return ['sk' => 'Europe/Bratislava', 'hu' => 'Europe/Budapest', 'en' => 'America/Denver'][$lang] ?? 'Europe/Bratislava';
    }

    /**
     * The country whose calendar the SERVER applies to this install: the holiday country of the
     * edition, and Slovakia for the English one (holidays_lib.php maps anything but SK/HU to SK).
     */
    function demo_time_server_country(array $ctx): string {
        return $ctx['holidayCountry'] ?? 'SK';
    }

    /** US federal holidays of a year, actual and observed dates ('Y-m-d' => true). B9: avoided by choice of date. */
    function demo_time_us_federal_holidays(int $year): array {
        $nth = static function (int $month, int $isoWeekday, int $n) use ($year): string {
            $d = new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month));
            $count = 0;
            while (true) {
                if ((int)$d->format('N') === $isoWeekday && ++$count === $n) {
                    return $d->format('Y-m-d');
                }
                $d = $d->modify('+1 day');
            }
        };
        $lastMonday = static function (int $month) use ($year): string {
            $d = (new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month)))->modify('last day of this month');
            while ((int)$d->format('N') !== 1) {
                $d = $d->modify('-1 day');
            }
            return $d->format('Y-m-d');
        };
        $fixed = [
            sprintf('%04d-01-01', $year), $nth(1, 1, 3), $nth(2, 1, 3), $lastMonday(5), sprintf('%04d-06-19', $year),
            sprintf('%04d-07-04', $year), $nth(9, 1, 1), $nth(10, 1, 2), sprintf('%04d-11-11', $year), $nth(11, 4, 4),
            sprintf('%04d-12-25', $year),
        ];
        $out = [];
        foreach ($fixed as $date) {
            $out[$date] = true;
            $weekday = (int)(new \DateTimeImmutable($date))->format('N');
            if ($weekday === 6) {
                $out[(new \DateTimeImmutable($date))->modify('-1 day')->format('Y-m-d')] = true;
            } elseif ($weekday === 7) {
                $out[(new \DateTimeImmutable($date))->modify('+1 day')->format('Y-m-d')] = true;
            }
        }
        return $out;
    }

    /** Every date the edition's entries must avoid, for the given years ('Y-m-d' => true). */
    function demo_time_blocked_dates(array $ctx, array $years): array {
        $blocked = [];
        foreach ($years as $year) {
            foreach (ccrm_holidays_builtin(demo_time_server_country($ctx), (int)$year) as $day) {
                $blocked[$day['date']] = true;
            }
            if ($ctx['holidayCountry'] === null) {
                $blocked += demo_time_us_federal_holidays((int)$year);
            }
        }
        return $blocked;
    }

    /** The last $count working days before today, oldest first. */
    function demo_time_working_days(array $ctx, ?\DateTimeImmutable $today = null, int $count = 0): array {
        $count = $count > 0 ? $count : demo_time_days_count();
        $today = $today ?? new \DateTimeImmutable('today');
        $year = (int)$today->format('Y');
        $blocked = demo_time_blocked_dates($ctx, [$year - 1, $year]);
        $days = [];
        $cursor = $today->modify('-1 day');
        while (count($days) < $count) {
            $ymd = $cursor->format('Y-m-d');
            if ((int)$cursor->format('N') < 6 && !isset($blocked[$ymd])) {
                $days[] = $ymd;
            }
            $cursor = $cursor->modify('-1 day');
        }
        return array_reverse($days);
    }

    /** Monday of the week of a 'Y-m-d' date. */
    function demo_time_monday(string $ymd): string {
        $d = new \DateTimeImmutable($ymd);
        return $d->modify('-' . ((int)$d->format('N') - 1) . ' days')->format('Y-m-d');
    }

    /**
     * The schedule: per login, per day, the entries as ['day' => i, 'start' => minutes since
     * midnight, 'minutes' => n, 'item' => pool index, 'source' => timer|manual|calendar|extension].
     * Pure and deterministic - the same plan for every edition and every install date, which is
     * what keeps the shares of C10 (billable per login, sources, unassigned) the same in sk/hu/en.
     *
     * Entries per day (2-4) and hours per day are fixed tables; each login starts at its usual
     * time, takes 10-20 minutes between entries and a 45 minute lunch once the clock passes 11:30.
     * The latest end is 16:40, so the UTC time of an entry never crosses midnight (Denver = UTC-7).
     */
    function demo_time_plan(array $poolSizes): array {
        $counts = [
            'owner' => [2, 3, 2, 3, 2, 3, 2, 3, 2, 2, 3, 2, 3, 2, 2],
            'pm'    => [3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 2],
            'sales' => [3, 3, 2, 4, 3, 3, 3, 2, 3, 4, 3, 3, 3, 3, 2],
        ];
        $totals = [   // minutes per day: owner 5-7 h, pm 6.5-8 h, sales 5.5-7 h
            'owner' => [360, 330, 390, 300, 420, 360, 330, 390, 360, 300, 420, 330, 390, 360, 300],
            'pm'    => [450, 420, 480, 390, 450, 480, 420, 450, 390, 480, 450, 420, 480, 450, 420],
            'sales' => [420, 390, 360, 420, 420, 390, 330, 420, 420, 390, 360, 420, 420, 390, 330],
        ];
        $startOfDay = ['owner' => 8 * 60 + 30, 'pm' => 7 * 60, 'sales' => 8 * 60];
        $itemOffset = ['owner' => 0, 'pm' => 3, 'sales' => 7];
        // 10 sources per login; across the three: timer 50 %, manual 30 %, calendar 10 %, extension 10 %.
        $sources = [
            'owner' => ['timer', 'extension', 'manual', 'timer', 'extension', 'calendar', 'timer', 'extension', 'manual', 'timer'],
            'pm'    => ['timer', 'manual', 'timer', 'timer', 'calendar', 'timer', 'manual', 'timer', 'manual', 'timer'],
            'sales' => ['timer', 'manual', 'timer', 'calendar', 'manual', 'timer', 'manual', 'timer', 'manual', 'timer'],
        ];
        $weights = [2 => [55, 45], 3 => [40, 30, 30], 4 => [30, 25, 25, 20]];
        $gaps = [15, 10, 20];

        $plan = [];
        foreach ($counts as $role => $perDay) {
            $n = max(1, (int)($poolSizes[$role] ?? 1));
            $c = 0;
            foreach ($perDay as $dayIndex => $entryCount) {
                $total = $totals[$role][$dayIndex];
                $clock = $startOfDay[$role];
                $lunch = false;
                $used = 0;
                for ($k = 0; $k < $entryCount; $k++) {
                    $last = $k === $entryCount - 1;
                    $minutes = $last ? $total - $used : (int)(round($total * $weights[$entryCount][$k] / 100 / 15) * 15);
                    $used += $minutes;
                    $plan[$role][] = [
                        'day' => $dayIndex,
                        'start' => $clock,
                        'minutes' => $minutes,
                        'item' => ($c * 5 + $itemOffset[$role]) % $n,
                        'source' => $sources[$role][$c % 10],
                    ];
                    $c++;
                    $clock += $minutes + $gaps[$k % 3];
                    if (!$lunch && $clock >= 11 * 60 + 30) {
                        $clock += 45;
                        $lunch = true;
                    }
                }
            }
        }
        return $plan;
    }

    /** Local 'Y-m-d' + minutes since midnight -> UTC 'Y-m-d H:i:s' (DST aware). */
    function demo_time_utc(string $ymd, int $minutes, string $timezone): string {
        $local = new \DateTimeImmutable($ymd . ' 00:00:00', new \DateTimeZone($timezone));
        return $local->modify('+' . $minutes . ' minutes')->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /** 'H:i' -> minutes since midnight. */
    function demo_time_minutes(string $hhmm): int {
        [$h, $m] = array_map('intval', explode(':', $hhmm));
        return $h * 60 + $m;
    }

    /** Numeric id suffix, for natural ordering: demo-tasks-2 before demo-tasks-10. */
    function demo_time_id_number(string $id): int {
        return (int)substr($id, (int)strrpos($id, '-') + 1);
    }

    /**
     * The demo tasks and tickets other modules wrote, grouped for linking:
     * ['tasks' => [projectId => [['id', 'title'], ...]], 'tickets' => [projectId => [...]]],
     * each list in id order. A ticket without a project is filed under its client's first project.
     */
    function demo_time_load_links(PDO $pdo, array $company): array {
        $links = ['tasks' => [], 'tickets' => []];
        $tasks = $pdo->query("SELECT `id`, `title`, `related_project_id` FROM `tasks` WHERE `id` LIKE 'demo-tasks-%'")->fetchAll(PDO::FETCH_ASSOC); /* recurring-template: demo-tasks-* are the plain tasks the tasks module wrote */
        usort($tasks, static fn($a, $b) => demo_time_id_number($a['id']) <=> demo_time_id_number($b['id']));
        foreach ($tasks as $t) {
            if (!empty($t['related_project_id'])) {
                $links['tasks'][$t['related_project_id']][] = ['id' => $t['id'], 'title' => (string)$t['title']];
            }
        }
        $firstProjectOfClient = [];
        foreach ($company['projects'] as $ref => $p) {
            $firstProjectOfClient[demo_ref_id((string)$p['client'])] ??= demo_ref_id($ref);
        }
        $tickets = $pdo->query("SELECT `id`, `title`, `project_id`, `client_id` FROM `tickets` WHERE `id` LIKE 'demo-tickets-%'")->fetchAll(PDO::FETCH_ASSOC);
        usort($tickets, static fn($a, $b) => demo_time_id_number($a['id']) <=> demo_time_id_number($b['id']));
        foreach ($tickets as $t) {
            $projectId = !empty($t['project_id']) ? $t['project_id'] : ($firstProjectOfClient[$t['client_id'] ?? ''] ?? null);
            if ($projectId !== null) {
                $links['tickets'][$projectId][] = ['id' => $t['id'], 'title' => (string)$t['title']];
            }
        }
        return $links;
    }

    /** TIME_TRACKING_SETTINGS: the stored blob when there is one, else the defaults this module writes. */
    function demo_time_settings(PDO $pdo, bool &$written): array {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'TIME_TRACKING_SETTINGS'");
        $stmt->execute();
        $raw = $stmt->fetchColumn();
        $stored = is_string($raw) ? json_decode($raw, true) : null;
        if (is_array($stored)) {
            $written = false;
            return $stored;
        }
        $defaults = ['weeklyApproval' => true] + ccrm_tc_default_settings();
        $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TIME_TRACKING_SETTINGS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
            ->execute([json_encode($defaults, JSON_UNESCAPED_UNICODE)]);
        $written = true;
        return $defaults;
    }

    function demo_seed_time(PDO $pdo): int {
        $ctx = demo_ctx($pdo);
        $company = demo_pack($pdo, 'company');
        $pack = demo_pack($pdo, 'time');
        $rows = 0;

        $pdo->exec("DELETE FROM `time_activity` WHERE `id` LIKE 'demo-time-%'");
        $pdo->exec("DELETE FROM `time_tracker_devices` WHERE `id` LIKE 'demo-time-%'");
        $pdo->exec("DELETE FROM `time_entries` WHERE `id` LIKE 'demo-time-%'");

        $settingsWritten = false;
        $settings = demo_time_settings($pdo, $settingsWritten);
        $rows += $settingsWritten ? 1 : 0;
        $costSettings = array_intersect_key($settings, ccrm_tc_default_settings());
        $overrides = is_array($settings['holidayOverrides'] ?? null) ? $settings['holidayOverrides'] : [];
        $country = demo_time_server_country($ctx);

        // Who is who: a login's role -> its employee ref, row id and CONVERTED monthly salary.
        $people = [];
        foreach ($company['employees'] as $ref => $e) {
            if (!empty($e['user'])) {
                $people[(string)$e['user']] = [
                    'userId' => demo_ref_id((string)$e['user']),
                    'employeeId' => demo_ref_id($ref),
                    'salary' => demo_money_salary((float)$e['salaryEur']),
                ];
            }
        }
        $links = demo_time_load_links($pdo, $company);

        $days = demo_time_working_days($ctx);
        $poolSizes = [];
        foreach (demo_user_roles() as $role) {
            $poolSizes[$role] = count($pack['pools'][$role]);
        }
        $plan = demo_time_plan($poolSizes);
        $timezone = demo_time_timezone($ctx['lang']);
        $deviceId = 'demo-time-dev-1';
        $billableRate = demo_money((float)$pack['billableRateEur']);
        $today = new \DateTimeImmutable('today');
        $currentMonday = demo_time_monday($today->format('Y-m-d'));
        $previousMonday = (new \DateTimeImmutable($currentMonday))->modify('-7 days')->format('Y-m-d');

        $workingDaysCache = [];
        $workingDays = static function (string $ymd) use ($pdo, $country, $overrides, &$workingDaysCache): int {
            [$y, $m] = [(int)substr($ymd, 0, 4), (int)substr($ymd, 5, 2)];
            return $workingDaysCache["{$y}-{$m}"] ??= ccrm_holidays_working_days($pdo, $country, $y, $m, (array)($overrides[$country][(string)$y] ?? []), false);
        };

        $ins = $pdo->prepare(
            "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`,
                `description`, `title_snapshot`, `note`, `entry_date`, `start_at`, `end_at`, `duration_sec`, `billable`, `billable_rate`,
                `cost_rate`, `cost_rate_source`, `cost_rate_basis_days`, `cost`, `tags`, `source`, `origin_type`, `origin_id`,
                `device_id`, `approval_status`, `created_at`, `updated_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?)"
        );

        // Entries ordered by day then login keeps the ids readable (demo-time-1 is the oldest owner entry).
        $flat = [];
        foreach (demo_user_roles() as $role) {
            foreach ($plan[$role] as $p) {
                $flat[] = ['role' => $role] + $p;
            }
        }
        usort($flat, static fn($a, $b) => [$a['day'], array_search($a['role'], demo_user_roles(), true), $a['start']] <=> [$b['day'], array_search($b['role'], demo_user_roles(), true), $b['start']]);

        foreach ($flat as $n => $p) {
            $role = $p['role'];
            $item = $pack['pools'][$role][$p['item']];
            $who = $people[$role];
            $date = $days[$p['day']];
            $projectRef = $item['project'];
            $projectId = $projectRef !== null ? demo_ref_id((string)$projectRef) : null;

            $taskId = null;
            $ticketId = null;
            $linkedTitle = null;
            if ($item['link'] === 'task' && $projectId !== null && !empty($links['tasks'][$projectId])) {
                $list = $links['tasks'][$projectId];
                $hit = $list[(int)$item['pick'] % count($list)];
                $taskId = $hit['id'];
                $linkedTitle = $hit['title'];
            } elseif ($item['link'] === 'ticket' && $projectId !== null && !empty($links['tickets'][$projectId])) {
                $list = $links['tickets'][$projectId];
                $hit = $list[(int)$item['pick'] % count($list)];
                $ticketId = $hit['id'];
                $linkedTitle = $hit['title'];
            }
            $linked = $linkedTitle !== null;
            $title = demo_text((string)$item['title']);
            $note = (string)$item['note'] !== '' ? demo_text((string)$item['note']) : null;

            $seconds = $p['minutes'] * 60;
            $rate = ccrm_tc_cost_rate(
                ['kind' => 'employee', 'salaryType' => 'monthly', 'salaryAmount' => $who['salary']],
                $workingDays($date),
                $costSettings
            );
            $cost = ccrm_tc_entry_cost($seconds, $rate['rate']);

            $source = $p['source'];
            $originType = null;
            $originId = null;
            if ($source === 'calendar') {
                $originType = 'calendar';
            } elseif ($source === 'manual') {
                // typed in by hand: no origin
            } elseif ($taskId !== null) {
                [$originType, $originId] = ['task', $taskId];
            } elseif ($ticketId !== null) {
                [$originType, $originId] = ['ticket', $ticketId];
            } elseif ($projectId !== null) {
                [$originType, $originId] = ['project', $projectId];
            }

            $weekMonday = demo_time_monday($date);
            if ($weekMonday >= $currentMonday) {
                $approval = null;
            } elseif ($weekMonday === $previousMonday && $role === 'owner') {
                $approval = 'submitted';
            } else {
                $approval = 'approved';
            }

            $startUtc = demo_time_utc($date, $p['start'], $timezone);
            $endUtc = demo_time_utc($date, $p['start'] + $p['minutes'], $timezone);
            $ins->execute([
                demo_id('time', $n + 1),
                $who['userId'],
                $who['userId'],
                $who['employeeId'],
                $projectId,
                $taskId,
                $ticketId,
                $linked ? null : $title,
                $linked ? $linkedTitle : $title,
                $note,
                $date,
                $startUtc,
                $endUtc,
                $seconds,
                $item['billable'] ? 1 : 0,
                $item['billable'] ? $billableRate : null,
                $rate['rate'],
                $rate['source'],
                $rate['basisDays'],
                $cost,
                $source,
                $originType,
                $originId,
                $source === 'extension' ? $deviceId : null,
                $approval,
                $endUtc,
                $endUtc,
            ]);
            $rows++;
        }

        // The owner's paired browser: only a hash of a key nobody was ever given, so it cannot authenticate.
        $device = $pack['device'];
        $ownerId = $people['owner']['userId'];
        $pdo->prepare(
            "INSERT INTO `time_tracker_devices` (`id`, `user_id`, `key_hash`, `key_prefix`, `name`, `browser`, `os`, `extension_version`, `created_at`, `last_used_at`, `revoked_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)"
        )->execute([
            $deviceId,
            $ownerId,
            hash('sha256', random_bytes(32)),
            'tt_demo_' . bin2hex(random_bytes(2)),
            $device['name'],
            $device['browser'],
            $device['os'],
            $device['version'],
            demo_time_utc(demo_d(-16), 8 * 60 + 40, $timezone),
            demo_time_utc(demo_d(-1), 16 * 60 + 40, $timezone),
        ]);
        $rows++;

        // Browser activity from yesterday that nobody has sorted into an entry yet (the Unsorted inbox).
        $yesterday = demo_d(-1);
        $insAct = $pdo->prepare(
            "INSERT INTO `time_activity` (`id`, `user_id`, `device_id`, `domain`, `page_title`, `started_at`, `ended_at`, `duration_sec`,
                `suggested_project_id`, `status`, `entry_id`, `created_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unsorted', NULL, ?)"
        );
        foreach ($pack['activity'] as $i => $a) {
            $from = demo_time_minutes((string)$a['from']);
            $endUtc = demo_time_utc($yesterday, $from + (int)$a['minutes'], $timezone);
            $insAct->execute([
                'demo-time-act-' . ($i + 1),
                $ownerId,
                $deviceId,
                $a['domain'],
                demo_text((string)$a['title']),
                demo_time_utc($yesterday, $from, $timezone),
                $endUtc,
                (int)$a['minutes'] * 60,
                $a['project'] !== null ? demo_ref_id((string)$a['project']) : null,
                $endUtc,
            ]);
            $rows++;
        }
        return $rows;
    }
}
