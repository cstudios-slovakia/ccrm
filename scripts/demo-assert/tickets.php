<?php
/**
 * Assertions for the `tickets` demo module (format: header of public/api/demo_seed/index.php).
 *
 * The C6 support contract, five tickets (D7) with messages, legacy ticket time and two linked tasks.
 */
return [
    'minRows' => [
        'support_contracts' => 1,
        'tickets' => 5,
        'ticket_messages' => 14,
        'ticket_time_entries' => 5,
        'ticket_task_links' => 2,
        'tasks' => 2,
    ],
    'idAllow' => [],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $tickets = $db->rows('tickets');
        $messages = $db->rows('ticket_messages');
        $now = time();
        $userIds = array_map(static fn($u) => 'u-' . md5(strtolower($u['email'])), demo_company_pack($ctx['lang'])['users']);

        // The contract
        $sc = $db->rows('support_contracts');
        $check('one support contract, for C6 and P3, valid across today', count($sc) === 1 && $sc[0]['client_id'] === demo_ref_id('C6') && $sc[0]['project_id'] === demo_ref_id('P3')
            && $sc[0]['valid_from'] < demo_d(0) && $sc[0]['valid_until'] > demo_d(0), json_encode($sc));
        $check('the contract rate is the converted EUR 65', count($sc) === 1 && (float)$sc[0]['hourly_rate'] === demo_money(65.0), json_encode($sc[0]['hourly_rate'] ?? null));

        // The five tickets
        $numbers = array_column($tickets, 'ticket_number');
        $check('five tickets numbered TCK-000001..5 (unique)', $numbers === ['TCK-000001', 'TCK-000002', 'TCK-000003', 'TCK-000004', 'TCK-000005'], json_encode($numbers));
        $statuses = ['new', 'open', 'waiting_client', 'waiting_third_party', 'scheduled', 'resolved', 'closed'];
        $bad = [];
        foreach ($tickets as $t) {
            if (!in_array($t['status'], $statuses, true)) $bad[] = "{$t['id']} status '{$t['status']}' is not one of the TICKET_STATUSES";
            if (!in_array($t['priority'], ['critical', 'high', 'normal', 'low'], true)) $bad[] = "{$t['id']} priority '{$t['priority']}'";
            if (!in_array($t['type'], ['bug', 'question', 'feature_request', 'incident', 'billing'], true)) $bad[] = "{$t['id']} type '{$t['type']}'";
            if (!in_array($t['assignee_id'], $userIds, true)) $bad[] = "{$t['id']} assignee is not a demo login";
            if (strtotime($t['created_at']) > $now) $bad[] = "{$t['id']} is created in the future";
            $done = in_array($t['status'], ['resolved', 'closed'], true);
            if ($done !== ($t['resolved_at'] !== null)) $bad[] = "{$t['id']} status {$t['status']} but resolved_at " . json_encode($t['resolved_at']);
            if (($t['status'] === 'closed') !== ($t['closed_at'] !== null)) $bad[] = "{$t['id']} closed_at does not match status {$t['status']}";
            foreach (['first_responded_at', 'resolved_at', 'closed_at'] as $col) {
                if ($t[$col] !== null && (strtotime($t[$col]) < strtotime($t['created_at']) || strtotime($t[$col]) > $now)) $bad[] = "{$t['id']} {$col} {$t[$col]} is before creation or in the future";
            }
            if (strtotime($t['first_response_due_at']) <= strtotime($t['created_at']) || strtotime($t['resolve_due_at']) <= strtotime($t['first_response_due_at'])) $bad[] = "{$t['id']} SLA due times are not ordered";
        }
        $check('status, priority, type, assignee, dates and SLA times are valid on every ticket', !$bad, implode("\n", array_slice($bad, 0, 8)));
        $byStatus = array_count_values(array_column($tickets, 'status'));
        $check('the five tickets of D7 cover scheduled, closed, resolved, open and a new high-priority one', ($byStatus['scheduled'] ?? 0) === 1 && ($byStatus['closed'] ?? 0) === 1 && ($byStatus['resolved'] ?? 0) === 1
            && ($byStatus['open'] ?? 0) === 1 && ($byStatus['new'] ?? 0) === 1 && $tickets[2]['priority'] === 'high', json_encode($byStatus));
        $clients = array_column($tickets, 'client_id');
        $check('tickets belong to C2, C1, C6, C6, C3 in that order, on P2, P1, P3, P3, P4', $clients === array_map('demo_ref_id', ['C2', 'C1', 'C6', 'C6', 'C3'])
            && array_column($tickets, 'project_id') === array_map('demo_ref_id', ['P2', 'P1', 'P3', 'P3', 'P4']));
        $mismatch = [];
        foreach ($tickets as $t) {
            $client = demo_ref_for($ctx['lang'], 'C' . substr($t['client_id'], strlen('demo-clients-')));
            if ($t['reporter_email'] !== $client['email'] || $t['reporter_name'] !== $client['contact']) $mismatch[] = $t['id'];
        }
        $check('the reporter is the client\'s contact person from the cast', !$mismatch, implode(', ', $mismatch));
        $check('ticket 3 has CSAT-free status new, ticket 2 has a CSAT score of 5', $tickets[2]['satisfaction_score'] === null && (int)$tickets[1]['satisfaction_score'] === 5);

        // Messages
        $bad = [];
        $created = array_column($tickets, 'created_at', 'id');
        $lastBy = [];
        foreach ($messages as $m) {
            if (!isset($created[$m['ticket_id']])) { $bad[] = "{$m['id']} belongs to an unwritten ticket"; continue; }
            $ts = strtotime($m['created_at']);
            if ($ts < strtotime($created[$m['ticket_id']]) - 1 && $m['author_type'] === 'client') $bad[] = "{$m['id']} is older than its ticket";
            if ($ts > $now) $bad[] = "{$m['id']} is in the future";
            if (isset($lastBy[$m['ticket_id']]) && $ts < $lastBy[$m['ticket_id']]) $bad[] = "{$m['id']} is out of order";
            $lastBy[$m['ticket_id']] = $ts;
            if ($m['author_type'] === 'agent' && !in_array($m['author_user_id'], $userIds, true)) $bad[] = "{$m['id']} agent is not a demo login";
            if ($m['body'] === '' || (int)$m['is_internal'] > 1) $bad[] = "{$m['id']} body/is_internal";
        }
        $check('messages are in order, not older than their ticket, not in the future, agents are demo logins', !$bad, implode("\n", array_slice($bad, 0, 8)));
        $internal = count(array_filter($messages, static fn($m) => (int)$m['is_internal'] === 1));
        $check('two internal notes among the messages', $internal === 2, (string)$internal);

        // Time and linked tasks
        $time = $db->rows('ticket_time_entries');
        $badTime = array_filter($time, static fn($e) => $e['logged_at'] > demo_d(0) || (int)$e['minutes'] <= 0 || !isset($created[$e['ticket_id']]) || $e['logged_at'] < substr($created[$e['ticket_id']], 0, 10));
        $check('ticket time entries: after the ticket was opened, not in the future, positive minutes', !$badTime, json_encode(array_values($badTime)));
        $tasks = [];
        foreach ($db->rows('tasks') as $row) $tasks[$row['id']] = $row;
        $links = $db->rows('ticket_task_links');
        $badLink = array_filter($links, static fn($l) => !isset($created[$l['ticket_id']]) || !isset($tasks[$l['task_id']]));
        $check('two ticket-task links, both ends written', count($links) === 2 && !$badLink, json_encode($links));
        $demoTasks = array_filter($tasks, static fn($task) => strpos($task['id'], 'demo-tickets-') === 0);
        $badTask = array_filter($demoTasks, static fn($task) => $task['deadline'] < demo_d(0) || $task['owner'] === '' || $task['related_project_id'] === null);
        $check('linked tasks have an owner, a project and a deadline from today on', count($demoTasks) === 2 && !$badTask, json_encode(array_values($badTask)));

        // The pre-pack demo tickets (tck-demo-1) do not survive a run: ticket_number is UNIQUE.
        $db->seedRow('tickets', ['id' => 'tck-demo-1', 'ticket_number' => 'TCK-000001', 'title' => 'legacy', 'status' => 'new', 'priority' => 'normal', 'type' => 'bug', 'source' => 'widget']);
        $db->seedRow('ticket_messages', ['id' => 'tmsg-demo-1', 'ticket_id' => 'tck-demo-1', 'author_type' => 'agent', 'body' => 'legacy']);
        $db->seedRow('support_contracts', ['id' => 'sc-demo-1', 'tier' => 'pro']);
        $report = demo_seed_all($db, ['only' => ['tickets'], 'writeDataset' => false]);
        $ids = array_column($db->rows('tickets'), 'id');
        $check('a re-run replaces the legacy demo tickets (tck-demo-*) and does not collide on TCK-000001', !empty($report['tickets']['ok']) && !in_array('tck-demo-1', $ids, true) && count($ids) === 5
            && !in_array('tmsg-demo-1', array_column($db->rows('ticket_messages'), 'id'), true) && !in_array('sc-demo-1', array_column($db->rows('support_contracts'), 'id'), true), (string)($report['tickets']['error'] ?? ''));
    },
];
