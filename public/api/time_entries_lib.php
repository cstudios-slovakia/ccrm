<?php
/**
 * Time tracking: shared server logic (settings, link resolution, pricing, JSON shape).
 * The HTTP surface is time_entries.php; the cost maths is time_cost.php; the calendar is
 * holidays_lib.php.
 *
 * The title rule: an entry linked to a task or ticket has NO title of its own. Its
 * `description` column stays NULL and every surface shows the linked item's title, joined
 * live here (`title` + `titleSource`). Only an entry with no task and no ticket keeps its
 * own text in `description`. `title_snapshot` is written on every save and is shown only
 * (greyed) when the task or ticket has since been deleted. Tasks and tickets are renamed
 * through the normal sync.php save path, never from here.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/time_cost.php';
require_once __DIR__ . '/holidays_lib.php';

if (!function_exists('ccrm_tt_default_settings')) {

    /** TimeTrackingSettings (src/utils/timeTracking.ts) with its defaults. */
    function ccrm_tt_default_settings(): array {
        return [
            'hoursBasis' => 'workingDays',
            'fixedHoursPerMonth' => 168,
            'hoursPerDay' => 8,
            'employerMultiplier' => 1.352,
            'holidayOverrides' => ['SK' => new \stdClass(), 'HU' => new \stdClass()],
            'requireProjectToStop' => true,
            'requireTask' => false,
            'billableByDefault' => true,
            'autoStopAt' => '23:59',
            'longEntryWarnHours' => 10,
            'idleReminderMinutes' => 15,
            'lockAfterDays' => 14,
            'weeklyApproval' => false,
            'rounding' => ['minutes' => 0, 'mode' => 'nearest'],
            'extension' => ['enabled' => true, 'activityCaptureAllowed' => true, 'unsortedRetentionDays' => 30],
            'ticketTimeVisibleToClients' => false,
        ];
    }

    function ccrm_tt_load_settings(\PDO $pdo): array {
        $defaults = ccrm_tt_default_settings();
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'TIME_TRACKING_SETTINGS'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return $defaults;
        }
        $stored = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($stored) ? ccrm_tt_sanitize_settings($stored, $defaults) : $defaults;
    }

    function ccrm_tt_clamp_num($v, float $min, float $max, float $fallback): float {
        return is_numeric($v) ? max($min, min($max, (float)$v)) : $fallback;
    }

    function ccrm_tt_nullable_num($v, float $min, float $max, $fallback) {
        if ($v === null) {
            return null;
        }
        return is_numeric($v) ? max($min, min($max, (float)$v)) : $fallback;
    }

    /** Whitelist and clamp an incoming settings object; missing keys keep `$base`. */
    function ccrm_tt_sanitize_settings(array $in, array $base): array {
        $out = $base;
        if (isset($in['hoursBasis']) && in_array($in['hoursBasis'], ['workingDays', 'fixed'], true)) {
            $out['hoursBasis'] = $in['hoursBasis'];
        }
        $out['fixedHoursPerMonth'] = ccrm_tt_clamp_num($in['fixedHoursPerMonth'] ?? null, 1, 744, (float)$base['fixedHoursPerMonth']);
        $out['hoursPerDay'] = ccrm_tt_clamp_num($in['hoursPerDay'] ?? null, 1, 24, (float)$base['hoursPerDay']);
        $out['employerMultiplier'] = ccrm_tt_clamp_num($in['employerMultiplier'] ?? null, 0.5, 5, (float)$base['employerMultiplier']);
        foreach (['requireProjectToStop', 'requireTask', 'billableByDefault', 'weeklyApproval', 'ticketTimeVisibleToClients'] as $flag) {
            if (array_key_exists($flag, $in)) {
                $out[$flag] = (bool)$in[$flag];
            }
        }
        if (array_key_exists('autoStopAt', $in)) {
            $out['autoStopAt'] = (is_string($in['autoStopAt']) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $in['autoStopAt'])) ? $in['autoStopAt'] : null;
        }
        if (array_key_exists('longEntryWarnHours', $in)) {
            $out['longEntryWarnHours'] = ccrm_tt_nullable_num($in['longEntryWarnHours'], 1, 48, $base['longEntryWarnHours']);
        }
        if (array_key_exists('idleReminderMinutes', $in)) {
            $out['idleReminderMinutes'] = ccrm_tt_nullable_num($in['idleReminderMinutes'], 1, 240, $base['idleReminderMinutes']);
        }
        if (array_key_exists('lockAfterDays', $in)) {
            $out['lockAfterDays'] = ccrm_tt_nullable_num($in['lockAfterDays'], 0, 3650, $base['lockAfterDays']);
        }
        if (isset($in['rounding']) && is_array($in['rounding'])) {
            $minutes = (int)($in['rounding']['minutes'] ?? 0);
            $out['rounding'] = [
                'minutes' => in_array($minutes, [0, 5, 15, 30], true) ? $minutes : 0,
                'mode' => ($in['rounding']['mode'] ?? 'nearest') === 'up' ? 'up' : 'nearest',
            ];
        }
        if (isset($in['extension']) && is_array($in['extension'])) {
            $ext = $base['extension'];
            $out['extension'] = [
                'enabled' => array_key_exists('enabled', $in['extension']) ? (bool)$in['extension']['enabled'] : $ext['enabled'],
                'activityCaptureAllowed' => array_key_exists('activityCaptureAllowed', $in['extension']) ? (bool)$in['extension']['activityCaptureAllowed'] : $ext['activityCaptureAllowed'],
                'unsortedRetentionDays' => (int)ccrm_tt_clamp_num($in['extension']['unsortedRetentionDays'] ?? null, 1, 365, (float)$ext['unsortedRetentionDays']),
            ];
        }
        if (isset($in['holidayOverrides']) && is_array($in['holidayOverrides'])) {
            $out['holidayOverrides'] = ccrm_tt_sanitize_overrides($in['holidayOverrides']);
        }
        return $out;
    }

    /** country -> year -> [{date, kind, name}]; anything malformed is dropped. */
    function ccrm_tt_sanitize_overrides(array $in): array {
        $out = [];
        foreach (ccrm_holiday_countries() as $country) {
            $years = [];
            foreach ((array)($in[$country] ?? []) as $year => $list) {
                $year = (string)$year;
                if (!preg_match('/^\d{4}$/', $year) || !is_array($list)) {
                    continue;
                }
                $clean = [];
                foreach ($list as $o) {
                    if (!is_array($o) || !isset($o['date'], $o['kind'])) {
                        continue;
                    }
                    $date = (string)$o['date'];
                    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || substr($date, 0, 4) !== $year || !ccrm_tt_valid_date($date)) {
                        continue;
                    }
                    if (!in_array($o['kind'], ['extraDayOff', 'extraWorkingDay'], true)) {
                        continue;
                    }
                    $clean[$date] = ['date' => $date, 'kind' => $o['kind'], 'name' => mb_substr(trim((string)($o['name'] ?? '')), 0, 100)];
                    if (count($clean) >= 60) {
                        break;
                    }
                }
                if ($clean) {
                    ksort($clean);
                    $years[$year] = array_values($clean);
                }
            }
            $out[$country] = $years ?: new \stdClass();
        }
        return $out;
    }

    function ccrm_tt_save_settings(\PDO $pdo, array $settings): void {
        $stmt = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TIME_TRACKING_SETTINGS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        $stmt->execute([json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    }

    function ccrm_tt_valid_date(?string $value): bool {
        if ($value === null) {
            return false;
        }
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $d !== false && $d->format('Y-m-d') === $value;
    }

    // ----- time -------------------------------------------------------------------------

    function ccrm_tt_company_tz(): \DateTimeZone {
        return new \DateTimeZone(date_default_timezone_get());
    }

    /** UTC "Y-m-d H:i:s" for the database from an ISO-8601 string or a unix time; null if unparseable. */
    function ccrm_tt_to_utc($value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            $dt = is_int($value) ? (new \DateTimeImmutable('@' . $value)) : new \DateTimeImmutable((string)$value);
        } catch (\Throwable $e) {
            return null;
        }
        return $dt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    function ccrm_tt_now_utc(): string {
        return gmdate('Y-m-d H:i:s');
    }

    /** ISO-8601 with a Z suffix, from a UTC database value. */
    function ccrm_tt_iso(?string $utc): ?string {
        if ($utc === null || $utc === '') {
            return null;
        }
        return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z');
    }

    /** The company-timezone calendar date of a UTC instant. */
    function ccrm_tt_local_date(string $utc): string {
        return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->setTimezone(ccrm_tt_company_tz())->format('Y-m-d');
    }

    function ccrm_tt_seconds_between(string $startUtc, string $endUtc): int {
        return max(0, (int)(strtotime($endUtc . ' UTC') - strtotime($startUtc . ' UTC')));
    }

    function ccrm_tt_new_id(): string {
        return 'te-' . bin2hex(random_bytes(12));
    }

    // ----- people and pricing -----------------------------------------------------------

    function ccrm_tt_employee_for_user(\PDO $pdo, string $userId): ?array {
        $stmt = $pdo->prepare("SELECT `id`, `kind`, `salary_type`, `salary_amount`, `work_country` FROM `employees` WHERE `user_id` = ? LIMIT 1");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** Employee override, else the company country, else SK. */
    function ccrm_tt_work_country(\PDO $pdo, ?array $employee): string {
        $own = strtoupper((string)($employee['work_country'] ?? ''));
        return in_array($own, ccrm_holiday_countries(), true) ? $own : ccrm_holiday_company_country($pdo);
    }

    /** Overrides of one country (all years) as a flat list. */
    function ccrm_tt_overrides_for(array $settings, string $country): array {
        $out = [];
        $byYear = $settings['holidayOverrides'][$country] ?? [];
        foreach ((array)$byYear as $list) {
            foreach ((array)$list as $o) {
                $out[] = $o;
            }
        }
        return $out;
    }

    /**
     * Price one stretch of work: who is the employee, whose calendar applies, how many working
     * days the month has, the hourly rate and the cost. Never prices a running entry.
     *
     * @param bool $fetch allow one holiday-API fetch when the year is not cached. Pass false
     *                    inside a transaction, in a migration or on any poll path.
     * @return array{employee_id: ?string, cost_rate: ?float, cost_rate_source: string, cost_rate_basis_days: ?int, cost: ?float, country: string, workingDays: int}
     */
    function ccrm_tt_price(\PDO $pdo, string $userId, string $entryDate, ?int $durationSec, array $settings, bool $fetch = true): array {
        $employee = ccrm_tt_employee_for_user($pdo, $userId);
        $country = ccrm_tt_work_country($pdo, $employee);
        $year = (int)substr($entryDate, 0, 4);
        $month = (int)substr($entryDate, 5, 2);
        $days = ccrm_holidays_working_days($pdo, $country, $year, $month, ccrm_tt_overrides_for($settings, $country), $fetch);
        if ($employee === null) {
            return ['employee_id' => null, 'cost_rate' => null, 'cost_rate_source' => 'none', 'cost_rate_basis_days' => null, 'cost' => null, 'country' => $country, 'workingDays' => $days];
        }
        $r = ccrm_tc_cost_rate(
            ['kind' => $employee['kind'], 'salaryType' => $employee['salary_type'], 'salaryAmount' => $employee['salary_amount']],
            $days,
            [
                'hoursBasis' => $settings['hoursBasis'],
                'fixedHoursPerMonth' => $settings['fixedHoursPerMonth'],
                'hoursPerDay' => $settings['hoursPerDay'],
                'employerMultiplier' => $settings['employerMultiplier'],
            ]
        );
        return [
            'employee_id' => $employee['id'],
            'cost_rate' => $r['rate'],
            'cost_rate_source' => $r['source'],
            'cost_rate_basis_days' => $r['basisDays'],
            'cost' => ccrm_tc_entry_cost($durationSec, $r['rate']),
            'country' => $country,
            'workingDays' => $days,
        ];
    }

    /**
     * The billable rate to freeze when the entry does not carry its own (C7.4, steps 2–5).
     * The entry's own rate is applied by the caller. Price levels in this app are warehouse
     * lists with no hourly rate, so that step resolves to none.
     */
    function ccrm_tt_lookup_billable_rate(\PDO $pdo, ?string $projectId, ?string $ticketId, string $entryDate): ?float {
        if ($projectId) {
            $p = $pdo->prepare("SELECT `billable_rate` FROM `projects` WHERE `id` = ? LIMIT 1");
            $p->execute([$projectId]);
            $rate = $p->fetchColumn();
            if ($rate !== false && $rate !== null && (float)$rate > 0) {
                return round((float)$rate, 2);
            }
        }
        $contractProject = $projectId;
        $clientId = null;
        if ($ticketId) {
            $t = $pdo->prepare("SELECT `project_id`, `client_id` FROM `tickets` WHERE `id` = ? LIMIT 1");
            $t->execute([$ticketId]);
            $ticket = $t->fetch(\PDO::FETCH_ASSOC);
            if ($ticket) {
                $contractProject = $contractProject ?: ($ticket['project_id'] ?: null);
                $clientId = $ticket['client_id'] ?: null;
            }
        }
        if (!$clientId && $contractProject) {
            $c = $pdo->prepare("SELECT `client_id`, `lead_id` FROM `projects` WHERE `id` = ? LIMIT 1");
            $c->execute([$contractProject]);
            $proj = $c->fetch(\PDO::FETCH_ASSOC);
            if ($proj) {
                $clientId = $proj['client_id'] ?: $proj['lead_id'] ?: null;
            }
        }
        $contract = null;
        if ($contractProject) {
            $s = $pdo->prepare("SELECT `hourly_rate`, `monthly_hours`, `project_id` FROM `support_contracts` WHERE `project_id` = ? ORDER BY `valid_until` IS NULL DESC, `valid_until` DESC LIMIT 1");
            $s->execute([$contractProject]);
            $contract = $s->fetch(\PDO::FETCH_ASSOC) ?: null;
        }
        if (!$contract && $clientId) {
            $s = $pdo->prepare("SELECT `hourly_rate`, `monthly_hours`, `project_id` FROM `support_contracts` WHERE `client_id` = ? ORDER BY `valid_until` IS NULL DESC, `valid_until` DESC LIMIT 1");
            $s->execute([$clientId]);
            $contract = $s->fetch(\PDO::FETCH_ASSOC) ?: null;
        }
        if ($contract && (float)$contract['hourly_rate'] > 0) {
            $monthly = (float)$contract['monthly_hours'];
            $hourly = round((float)$contract['hourly_rate'], 2);
            $overage = $hourly;
            $scopeProject = $contract['project_id'] ?: $contractProject;
            if ($scopeProject) {
                $w = $pdo->prepare("SELECT `ticket_widget_config_json` FROM `projects` WHERE `id` = ? LIMIT 1");
                $w->execute([$scopeProject]);
                $cfg = json_decode((string)$w->fetchColumn(), true);
                if (is_array($cfg) && isset($cfg['retainer']['overageRate']) && is_numeric($cfg['retainer']['overageRate']) && (float)$cfg['retainer']['overageRate'] > 0) {
                    $overage = round((float)$cfg['retainer']['overageRate'], 2);
                }
            }
            if ($monthly > 0 && $scopeProject && preg_match('/^(\d{4})-(\d{2})/', $entryDate, $m)) {
                $from = sprintf('%s-%s-01', $m[1], $m[2]);
                $to = gmdate('Y-m-d', strtotime($from . ' +1 month'));
                $u = $pdo->prepare("SELECT COALESCE(SUM(`duration_sec`), 0) FROM `time_entries` WHERE `deleted_at` IS NULL AND `billable` = 1 AND `entry_date` >= ? AND `entry_date` < ? AND (`project_id` = ? OR `ticket_id` IN (SELECT `id` FROM `tickets` WHERE `project_id` = ?))");
                $u->execute([$from, $to, $scopeProject, $scopeProject]);
                $usedHours = ((int)$u->fetchColumn()) / 3600;
                if ($usedHours >= $monthly) {
                    return $overage;
                }
            }
            return $hourly;
        }
        return null;
    }

    /**
     * The client's single active project, or null when there is not exactly one.
     * "Active" ignores archived rows and the usual closed status keys.
     */
    function ccrm_tt_one_client_project(\PDO $pdo, ?string $partyId): ?string {
        $partyId = ccrm_tt_nullable_id($partyId);
        if ($partyId === null || !ccrm_table_exists($pdo, 'projects')) {
            return null;
        }
        $clientId = $partyId;
        if (ccrm_table_exists($pdo, 'leads')) {
            $s = $pdo->prepare("SELECT `client_id` FROM `leads` WHERE `id` = ? LIMIT 1");
            $s->execute([$partyId]);
            $linked = $s->fetchColumn();
            if (is_string($linked) && $linked !== '') {
                $clientId = $linked;
            }
        }
        $stmt = $pdo->prepare(
            "SELECT p.`id`, p.`status` FROM `projects` p
             LEFT JOIN `leads` l ON l.`id` = p.`lead_id`
             WHERE (p.`archived` IS NULL OR p.`archived` = 0)
               AND (p.`client_id` = ? OR p.`lead_id` = ? OR l.`client_id` = ? OR l.`id` = ?)"
        );
        $stmt->execute([$clientId, $clientId, $clientId, $partyId]);
        $ids = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $status = strtolower((string)($row['status'] ?? ''));
            if (in_array($status, ['completed', 'cancelled', 'canceled', 'done', 'closed', 'finished'], true)) {
                continue;
            }
            $ids[$row['id']] = true;
        }
        $keys = array_keys($ids);
        return count($keys) === 1 ? (string)$keys[0] : null;
    }

    // ----- links (project / task / ticket) and the title rule ---------------------------

    /**
     * Resolve what an entry is linked to and the columns that follow from it.
     *
     * Task: `task_id`; the task's ticket (related_ticket_id or a ticket_task_links row) fills
     * `ticket_id`; the project is the one given, else the task's. Title = the task's.
     * Ticket only: `ticket_id`; the project is the given one, else the ticket's, else its
     * support contract's, else the client's single active project. Title = the ticket's.
     * Neither: the entry's own `description` is the title.
     * Linked entries never keep a description of their own.
     *
     * @return array{ok: bool, code?: string, task_id: ?string, ticket_id: ?string, project_id: ?string, description: ?string, title_snapshot: ?string, derivedProject: ?string}
     */
    function ccrm_tt_resolve_links(\PDO $pdo, array $in): array {
        $taskId = ccrm_tt_nullable_id($in['taskId'] ?? null);
        $ticketId = ccrm_tt_nullable_id($in['ticketId'] ?? null);
        $projectId = ccrm_tt_nullable_id($in['projectId'] ?? null);
        $description = isset($in['description']) ? mb_substr(trim((string)$in['description']), 0, 500) : '';
        $derivedProject = null;
        $title = null;

        if ($taskId !== null) {
            $stmt = $pdo->prepare("SELECT `title`, `related_project_id`, `related_ticket_id`, `related_lead_id` FROM `tasks` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$taskId]);
            $task = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$task) {
                return ['ok' => false, 'code' => 'task_not_found'];
            }
            $title = (string)$task['title'];
            $derivedProject = $task['related_project_id'] ?: null;
            if ($projectId !== null && $derivedProject !== null && $projectId !== $derivedProject) {
                return ['ok' => false, 'code' => 'task_project_mismatch'];
            }
            $linkedTicket = $task['related_ticket_id'] ?: null;
            if ($linkedTicket === null) {
                $lk = $pdo->prepare("SELECT `ticket_id` FROM `ticket_task_links` WHERE `task_id` = ? ORDER BY `created_at` LIMIT 1");
                $lk->execute([$taskId]);
                $linkedTicket = $lk->fetchColumn() ?: null;
            }
            $ticketId = $linkedTicket;
            $projectId = $projectId ?? $derivedProject;
            if ($projectId === null && !empty($task['related_lead_id'])) {
                $projectId = ccrm_tt_one_client_project($pdo, (string)$task['related_lead_id']);
                $derivedProject = $derivedProject ?? $projectId;
            }
        } elseif ($ticketId !== null) {
            $stmt = $pdo->prepare("SELECT `title`, `project_id` FROM `tickets` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$ticketId]);
            $ticket = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$ticket) {
                return ['ok' => false, 'code' => 'ticket_not_found'];
            }
            $title = (string)$ticket['title'];
            $derivedProject = $ticket['project_id'] ?: null;
            if ($derivedProject === null) {
                $c = $pdo->prepare("SELECT sc.`project_id` FROM `tickets` k JOIN `support_contracts` sc ON sc.`client_id` = k.`client_id` WHERE k.`id` = ? AND sc.`project_id` IS NOT NULL ORDER BY sc.`valid_until` IS NULL DESC, sc.`valid_until` DESC LIMIT 1");
                $c->execute([$ticketId]);
                $derivedProject = $c->fetchColumn() ?: null;
            }
            $projectId = $projectId ?? $derivedProject;
            if ($projectId === null) {
                $client = $pdo->prepare("SELECT `client_id` FROM `tickets` WHERE `id` = ? LIMIT 1");
                $client->execute([$ticketId]);
                $projectId = ccrm_tt_one_client_project($pdo, $client->fetchColumn() ?: null);
                $derivedProject = $derivedProject ?? $projectId;
            }
        }

        if ($projectId !== null) {
            $p = $pdo->prepare("SELECT 1 FROM `projects` WHERE `id` = ? LIMIT 1");
            $p->execute([$projectId]);
            if (!$p->fetchColumn()) {
                return ['ok' => false, 'code' => 'project_not_found'];
            }
        }

        $linked = $taskId !== null || $ticketId !== null;
        return [
            'ok' => true,
            'task_id' => $taskId,
            'ticket_id' => $ticketId,
            'project_id' => $projectId,
            // Linked entries have no title of their own; the snapshot is only the greyed fallback.
            'description' => $linked ? null : ($description !== '' ? $description : null),
            'title_snapshot' => $linked ? $title : ($description !== '' ? $description : null),
            'derivedProject' => $derivedProject,
        ];
    }

    function ccrm_tt_nullable_id($v): ?string {
        $s = trim((string)($v ?? ''));
        return $s === '' ? null : mb_substr($s, 0, 64);
    }

    // ----- JSON shape --------------------------------------------------------------------

    /**
     * SELECT list + joins for an entry with its live title. The caller appends WHERE / ORDER BY.
     */
    function ccrm_tt_entry_select(): string {
        return "SELECT te.*, t.`id` AS `task_exists`, t.`title` AS `task_title`, k.`id` AS `ticket_exists`, k.`title` AS `ticket_title`, p.`name` AS `project_name`
                FROM `time_entries` te
                LEFT JOIN `tasks` t ON t.`id` = te.`task_id`
                LEFT JOIN `tickets` k ON k.`id` = te.`ticket_id`
                LEFT JOIN `projects` p ON p.`id` = te.`project_id`";
    }

    /**
     * One row of ccrm_tt_entry_select() as the API returns it.
     *
     * Cost fields: the owner always gets their own; anybody else's need `time_tracking_costs`.
     * `billableRate` always needs the costs permission.
     *
     * @param array{userId: string, canCosts: bool} $viewer
     */
    function ccrm_tt_entry_json(array $r, array $viewer): array {
        if (!empty($r['task_id'])) {
            $alive = !empty($r['task_exists']);
            $title = $alive ? (string)$r['task_title'] : (string)($r['title_snapshot'] ?? '');
            $source = 'task';
        } elseif (!empty($r['ticket_id'])) {
            $alive = !empty($r['ticket_exists']);
            $title = $alive ? (string)$r['ticket_title'] : (string)($r['title_snapshot'] ?? '');
            $source = 'ticket';
        } else {
            $alive = true;
            $title = (string)($r['description'] ?? '');
            $source = 'entry';
        }
        $running = $r['start_at'] !== null && $r['end_at'] === null;
        $own = (string)$r['user_id'] === $viewer['userId'];
        $out = [
            'id' => $r['id'],
            'userId' => $r['user_id'],
            'recordedByUserId' => $r['recorded_by_user_id'],
            'employeeId' => $r['employee_id'],
            'projectId' => $r['project_id'],
            'projectName' => $r['project_name'] ?? null,
            'taskId' => $r['task_id'],
            'ticketId' => $r['ticket_id'],
            'title' => $title,
            'titleSource' => $source,
            'titleDeleted' => !$alive,
            'description' => $r['description'],
            'legacyNote' => $r['legacy_note'],
            'entryDate' => $r['entry_date'],
            'startAt' => ccrm_tt_iso($r['start_at']),
            'endAt' => ccrm_tt_iso($r['end_at']),
            'durationSec' => $r['duration_sec'] === null ? null : (int)$r['duration_sec'],
            'running' => $running,
            'billable' => (bool)$r['billable'],
            'tags' => ccrm_tt_decode_tags($r['tags'] ?? null),
            'source' => $r['source'],
            'originType' => $r['origin_type'],
            'originId' => $r['origin_id'],
            'approvalStatus' => $r['approval_status'],
            // The database's own timestamp (server time, no zone); only shown as a date in the provenance line.
            'createdAt' => (string)$r['created_at'],
        ];
        if ($own || $viewer['canCosts']) {
            $out['costRate'] = $r['cost_rate'] === null ? null : (float)$r['cost_rate'];
            $out['costRateSource'] = $r['cost_rate_source'];
            $out['costRateBasisDays'] = $r['cost_rate_basis_days'] === null ? null : (int)$r['cost_rate_basis_days'];
            $out['cost'] = $r['cost'] === null ? null : (float)$r['cost'];
        }
        if ($viewer['canCosts']) {
            $out['billableRate'] = $r['billable_rate'] === null ? null : (float)$r['billable_rate'];
        }
        return $out;
    }

    function ccrm_tt_decode_tags($raw): array {
        $tags = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($tags) ? array_values(array_filter(array_map('strval', $tags), fn($t) => $t !== '')) : [];
    }

    /** Whitelist tags: up to 20, 40 characters each, unique. */
    function ccrm_tt_clean_tags($tags): array {
        $out = [];
        foreach ((array)$tags as $t) {
            $t = mb_substr(trim((string)$t), 0, 40);
            if ($t !== '' && !in_array($t, $out, true)) {
                $out[] = $t;
            }
            if (count($out) >= 20) {
                break;
            }
        }
        return $out;
    }

    function ccrm_tt_fetch_entry(\PDO $pdo, string $id): ?array {
        $stmt = $pdo->prepare(ccrm_tt_entry_select() . " WHERE te.`id` = ? AND te.`deleted_at` IS NULL LIMIT 1");
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}
