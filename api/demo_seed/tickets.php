<?php
/**
 * Demo seed module: tickets (service desk) - the C6 support contract and the five service
 * tickets of D7, with messages, legacy ticket time and the CRM tasks linked to two of them.
 *
 * Code only: every string is in packs/{sk,hu,en}/tickets.php. Ids are demo-tickets-<n>:
 *   1..5 the tickets (T1..T5 - other modules link to them by this id), 10 the contract,
 *   100+ messages, 300+ ticket time entries, 500+ the linked tasks.
 * Idempotent: deletes its own 'demo-tickets-%' rows, then inserts.
 *
 * It also removes the pre-pack demo tickets (ids tck-demo-1/2, written by the old
 * ccrm_seed_default_tickets() in schema.php, see demo_legacy_ids()): they hold TCK-000001 and
 * TCK-000002, and `ticket_number` is UNIQUE, so leaving them would fail this module on every
 * install that was seeded before the pack. Only those fixed legacy demo ids are touched.
 *
 * SLA times are computed from the priority the way the contract tier 'pro' defaults do:
 * first response within 8 h (normal) / 4 h (high); resolution within 5 / 2 working days.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

if (!function_exists('demo_tickets_ts')) {

    /** 'Y-m-d H:i:s' of a {day, time} block. */
    function demo_tickets_ts(array $block): string {
        return demo_dt((int)$block['day'], (string)$block['time']);
    }

    /** First-response and resolution hours by priority (the contract's SLA columns, pro tier). */
    function demo_tickets_sla(string $priority): array {
        $table = [
            'critical' => ['response' => 1, 'resolveDays' => 1],
            'high' => ['response' => 4, 'resolveDays' => 2],
            'normal' => ['response' => 8, 'resolveDays' => 5],
            'low' => ['response' => 24, 'resolveDays' => 15],
        ];
        return $table[$priority] ?? $table['normal'];
    }

    /** Delete the rows of an earlier run and the pre-pack demo tickets (see the header). */
    function demo_tickets_clean(PDO $pdo): void {
        $legacy = demo_legacy_ids();
        $del = static function (string $table, string $column, string $pattern) use ($pdo): void {
            $pdo->prepare("DELETE FROM `{$table}` WHERE `{$column}` LIKE ?")->execute([$pattern]);
        };
        foreach (['demo-tickets-%', 'tck-demo-%'] as $pattern) {
            $del('ticket_time_entries', 'ticket_id', $pattern);
            $del('ticket_task_links', 'ticket_id', $pattern);
            $del('ticket_messages', 'ticket_id', $pattern);
        }
        $del('ticket_time_entries', 'id', 'demo-tickets-%');
        $del('ticket_messages', 'id', 'demo-tickets-%');
        $del('task_assignees', 'task_id', 'demo-tickets-%');
        $del('tasks', 'id', 'demo-tickets-%');
        $del('tickets', 'id', 'demo-tickets-%');
        $del('support_contracts', 'id', 'demo-tickets-%');
        foreach (['ticket_time_entries', 'ticket_messages', 'tickets', 'support_contracts'] as $table) {
            foreach ($legacy[$table] ?? [] as $pattern) {
                $del($table, 'id', $pattern);
            }
        }
    }
}

function demo_seed_tickets(PDO $pdo): int {
    $pack = demo_pack($pdo, 'tickets');
    $users = demo_users($pdo);
    $taskStates = demo_task_states($pdo);
    $rows = 0;

    demo_tickets_clean($pdo);

    // The demo project type shows the Tickets tab of its projects.
    $typeId = demo_ref_id('PT');
    if (demo_row_exists($pdo, 'project_types', $typeId)) {
        $pdo->prepare("UPDATE `project_types` SET `has_tickets` = 1 WHERE `id` = ?")->execute([$typeId]);
    }

    // --- the support contract -----------------------------------------------------------------
    $c = $pack['contract'];
    $pdo->prepare(
        "INSERT INTO `support_contracts` (`id`, `client_id`, `project_id`, `tier`, `monthly_hours`, `hourly_rate`, `valid_from`, `valid_until`, `notes`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        demo_id('tickets', 10), demo_ref_id($c['client']), demo_ref_id($c['project']), $c['tier'],
        (float)$c['monthlyHours'], demo_money((float)$c['hourlyRateEur']),
        demo_d((int)$c['fromDay']), demo_d((int)$c['untilDay']), demo_text($c['notes']),
    ]);
    $rows++;

    // --- tickets, messages, time, linked tasks ------------------------------------------------
    $insTicket = $pdo->prepare(
        "INSERT INTO `tickets` (`id`, `ticket_number`, `title`, `description`, `status`, `priority`, `type`, `source`,
            `project_id`, `client_id`, `reporter_name`, `reporter_email`, `reporter_phone`,
            `assignee_id`, `assignee_name`, `watchers_json`, `tags_json`,
            `first_response_due_at`, `first_responded_at`, `resolve_due_at`, `resolved_at`, `closed_at`,
            `satisfaction_score`, `satisfaction_comment`, `created_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insMessage = $pdo->prepare(
        "INSERT INTO `ticket_messages` (`id`, `ticket_id`, `author_type`, `author_user_id`, `author_name`, `author_email`, `is_internal`, `body`, `created_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insTime = $pdo->prepare(
        "INSERT INTO `ticket_time_entries` (`id`, `ticket_id`, `user_id`, `user_name`, `minutes`, `billable`, `note`, `logged_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insTask = $pdo->prepare(
        "INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`, `related_lead_id`, `related_project_id`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insAssignee = $pdo->prepare("INSERT INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
    $insLink = $pdo->prepare("INSERT INTO `ticket_task_links` (`ticket_id`, `task_id`, `sync_mode`) VALUES (?, ?, 'auto_resolve')");

    $messageNo = 100;
    $timeNo = 300;
    $taskNo = 500;
    $n = 0;
    foreach ($pack['tickets'] as $ref => $t) {
        $n++;
        $ticketId = demo_id('tickets', $n);
        $client = demo_ref($pdo, $t['client']);
        $assignee = $users[$t['assignee']];
        $sla = demo_tickets_sla($t['priority']);
        $created = demo_dt((int)$t['createdDay'], (string)$t['createdTime']);
        $createdAt = new \DateTimeImmutable($created);
        $responseDue = $createdAt->modify("+{$sla['response']} hours")->format('Y-m-d H:i:s');
        $resolveDue = $createdAt->modify("+{$sla['resolveDays']} days")->format('Y-m-d H:i:s');
        $sat = $t['satisfaction'];
        $watchers = array_map(static fn(string $role): string => (string)$users[$role]['name'], $t['watchers']);

        $insTicket->execute([
            $ticketId, sprintf('TCK-%06d', $n), demo_text($t['title']), demo_text($t['description']),
            $t['status'], $t['priority'], $t['type'], $t['source'],
            demo_ref_id($t['project']), demo_ref_id($t['client']),
            $client['contact'], $client['email'], $client['phone'],
            $assignee['id'], $assignee['name'],
            json_encode($watchers, JSON_UNESCAPED_UNICODE), json_encode(array_map('demo_text', $t['tags']), JSON_UNESCAPED_UNICODE),
            $responseDue, $t['response'] ? demo_tickets_ts($t['response']) : null,
            $resolveDue, $t['resolved'] ? demo_tickets_ts($t['resolved']) : null, $t['closed'] ? demo_tickets_ts($t['closed']) : null,
            $sat ? (int)$sat['score'] : null, $sat ? demo_text($sat['comment']) : null,
            $created,
        ]);
        $rows++;

        foreach ($t['messages'] as $m) {
            $agent = $m['from'] === 'agent';
            $author = $agent ? $users[$m['user']] : null;
            $insMessage->execute([
                demo_id('tickets', $messageNo++), $ticketId, $agent ? 'agent' : 'client',
                $agent ? $author['id'] : null,
                $agent ? $author['name'] : $client['contact'],
                $agent ? $author['email'] : $client['email'],
                (int)$m['internal'], demo_text($m['body']), demo_dt((int)$m['day'], (string)$m['time']),
            ]);
            $rows++;
        }

        foreach ($t['time'] as $e) {
            $who = $users[$e['user']];
            $insTime->execute([
                demo_id('tickets', $timeNo++), $ticketId, $who['id'], $who['name'],
                (int)$e['minutes'], (int)$e['billable'], demo_text($e['note']), demo_d((int)$e['day']),
            ]);
            $rows++;
        }

        if ($t['task'] !== null) {
            $k = $t['task'];
            $owner = $users[$k['owner']];
            $taskId = demo_id('tickets', $taskNo++);
            // tasks.related_lead_id is a foreign key: link only a lead the clients module really wrote.
            $leadId = demo_ref_id($t['client']);
            $insTask->execute([
                $taskId, demo_text($k['title']), demo_text($k['description']), $k['priority'],
                demo_d((int)$k['deadlineDay']), $k['deadlineTime'], $taskStates[$k['status']], $owner['name'], $assignee['name'],
                demo_row_exists($pdo, 'leads', $leadId) ? $leadId : null, demo_ref_id($t['project']),
            ]);
            $insAssignee->execute([$taskId, $owner['name']]);
            $insLink->execute([$ticketId, $taskId]);
            $rows += 3;
        }
    }

    return $rows;
}
