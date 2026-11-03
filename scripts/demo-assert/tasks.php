<?php
/**
 * Assertions for the `tasks` demo module (phase 4A): ~14 tasks around today with assignees and links.
 * Format and contract: scripts/demo-assert/company.php and the header of public/api/demo_seed/index.php.
 */
return [
    'minRows' => [
        'tasks' => 14,
        'task_assignees' => 14,
    ],
    'idAllow' => [],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $lang = $ctx['lang'];
        $pack = demo_pack_for($lang, 'tasks');
        $users = demo_users();
        $names = array_column($users, 'name');
        $tasks = [];
        foreach ($db->rows('tasks') as $t) $tasks[$t['id']] = $t;
        $assignees = [];
        foreach ($db->rows('task_assignees') as $a) $assignees[$a['task_id']][] = $a['user_name'];
        $states = demo_task_states($db);
        $today = (new DateTimeImmutable('today'))->format('Y-m-d');

        $check('14 tasks with the ids demo-tasks-1..14', count($tasks) === 14 && count($pack['tasks']) === 14 && !array_diff(array_map(static fn($n) => "demo-tasks-{$n}", range(1, 14)), array_keys($tasks)));

        // Owners are the three logins; the owner is always among the assignees (the board filters on task_assignees).
        $bad = [];
        $perOwner = [];
        foreach ($tasks as $id => $t) {
            if (!in_array($t['owner'], $names, true)) $bad[] = "{$id}: owner '{$t['owner']}'";
            if (!in_array($t['created_by'], $names, true)) $bad[] = "{$id}: created_by '{$t['created_by']}'";
            if (!in_array($t['owner'], $assignees[$id] ?? [], true)) $bad[] = "{$id}: owner is not an assignee";
            foreach ($assignees[$id] ?? [] as $a) if (!in_array($a, $names, true)) $bad[] = "{$id}: assignee '{$a}'";
            $perOwner[$t['owner']] = ($perOwner[$t['owner']] ?? 0) + 1;
        }
        $check('every task has a login as owner, creator and assignees; the owner is an assignee', !$bad, implode("\n", array_slice($bad, 0, 8)));
        $check('all three users own tasks, and at least two tasks have a second assignee', count($perOwner) === 3 && count(array_filter($assignees, static fn($a) => count($a) > 1)) >= 2, json_encode($perOwner));

        // The mix of states and deadlines the board needs: overdue, today, the coming days, done, blocked.
        $byState = [];
        $overdue = $dueToday = $upcoming = $far = 0;
        foreach ($tasks as $t) {
            $byState[$t['status']] = ($byState[$t['status']] ?? 0) + 1;
            if ($t['status'] !== $states['done']) {
                if ($t['deadline'] < $today) $overdue++;
                elseif ($t['deadline'] === $today) $dueToday++;
                elseif ($t['deadline'] <= (new DateTimeImmutable('today'))->modify('+7 days')->format('Y-m-d')) $upcoming++;
                else $far++;
            }
        }
        $check('the board has new, in-progress, blocked and done tasks', isset($byState[$states['new']], $byState[$states['progress']], $byState[$states['blocked']], $byState[$states['done']]), json_encode($byState));
        $check('deadlines span overdue, today, this week and later', $overdue >= 2 && $dueToday >= 2 && $upcoming >= 3 && $far >= 2, "overdue {$overdue}, today {$dueToday}, week {$upcoming}, later {$far}");

        // A done task carries completed_by / completed_at the way the board writes them; open ones do not.
        $bad = [];
        foreach ($tasks as $id => $t) {
            $done = $t['status'] === $states['done'];
            if ($done && ($t['completed_by'] !== $t['owner'] || !preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d$/', (string)$t['completed_at']))) $bad[] = "{$id}: completion";
            if (!$done && ($t['completed_by'] !== null || $t['completed_at'] !== null)) $bad[] = "{$id}: open task marked completed";
            if (!preg_match('/^\d\d:\d\d$/', (string)$t['deadline_time'])) $bad[] = "{$id}: deadline_time";
            if ($t['start_date'] > $t['deadline']) $bad[] = "{$id}: starts after its deadline";
        }
        $check('done tasks are completed by their owner, open ones are not; times and start dates are sane', !$bad, implode("\n", $bad));

        // Links: every client/lead in the pack that was written is linked by its fixed id; project links use the fixed ids.
        $leadIds = [];
        foreach ($db->rows('leads') as $l) $leadIds[$l['id']] = true;
        $bad = [];
        foreach ($pack['tasks'] as $i => $p) {
            $row = $tasks['demo-tasks-' . ($i + 1)] ?? null;
            if ($row === null) continue;
            $want = $p['client'] === null ? null : demo_ref_id($p['client']);
            if ($want !== null && isset($leadIds[$want]) && $row['related_lead_id'] !== $want) $bad[] = "task " . ($i + 1) . ": related_lead_id";
            if ($want === null && $row['related_lead_id'] !== null) $bad[] = "task " . ($i + 1) . ": unexpected lead link";
            if ($row['related_project_id'] !== null && $row['related_project_id'] !== demo_ref_id((string)$p['project'])) $bad[] = "task " . ($i + 1) . ": related_project_id";
            if ($p['createdBy'] !== null && !isset($users[$p['createdBy']])) $bad[] = "task " . ($i + 1) . ": createdBy ref";
            foreach ($p['assignees'] as $a) if (!isset($users[$a])) $bad[] = "task " . ($i + 1) . ": assignee ref {$a}";
        }
        $linked = count(array_filter($tasks, static fn($t) => $t['related_lead_id'] !== null));
        $check('tasks link to clients and leads by their fixed ids (and to projects P1-P5 when written)', !$bad && $linked >= 10, implode("\n", $bad) . " linked={$linked}");
        $check('the three tasks setup.php used to write exist in the story: framework terms (L10), laser measuring (L9), slab delivery (S1/P3)',
            ($tasks['demo-tasks-2']['related_lead_id'] ?? null) === demo_ref_id('L10') && ($tasks['demo-tasks-10']['related_lead_id'] ?? null) === demo_ref_id('L9') && ($tasks['demo-tasks-5']['status'] ?? null) === $states['blocked']);

        // No text of the old story survived in a task.
        $bad = [];
        foreach ($tasks as $id => $t) {
            foreach (['Slavín', 'Novák', 'Cstudios', 'Neolith', 'Kováč'] as $word) {
                if ($lang === 'sk' && $word === 'Kováč') continue; // sk lead L7 is legitimately a Kováč, but only via a placeholder
                if (stripos($t['title'] . ' ' . $t['description'], $word) !== false) $bad[] = "{$id}: '{$word}'";
            }
        }
        $check('no leftovers of the pre-pack story in task texts', !$bad, implode("\n", $bad));
    },
];
