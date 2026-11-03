<?php
/**
 * Demo seed module: tasks (~14 tasks around today, three assignees, linked to clients/leads/projects).
 *
 * Code only: every title, description, name and number comes from packs/<lang>/tasks.php; people,
 * clients and projects are refs (packs/<lang>/company.php). Contract: the header of index.php.
 *
 * `owner` on the row is the primary assignee's NAME and `task_assignees` lists everyone
 * responsible - the Tasks board filters on the latter. Statuses are the instance's own task states
 * (TASK_STATES) addressed by role (new | progress | blocked | done), so they land in real board
 * columns. Deadlines span overdue, today, this week and next weeks; a done task carries
 * completed_by / completed_at the way the board writes them.
 *
 * Pack shape (tasks): a list of [title, description, priority, day, time, state, owner (role ref),
 * assignees (extra role refs), client (C/L ref|null), project (P ref|null), locking, createdBy (role ref)].
 * Task n (1-based position in the list) gets the id demo-tasks-n - other modules link to it by that
 * number (the position is part of the story; do not reorder the pack).
 *
 * Returns the number of rows inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

if (!function_exists('demo_seed_tasks')) {

    function demo_seed_tasks(PDO $pdo): int {
        $pack = demo_pack($pdo, 'tasks');
        $users = demo_users($pdo);
        $states = demo_task_states($pdo);
        $hasProjects = demo_table_exists($pdo, 'projects');
        $rows = 0;

        $pdo->exec("DELETE FROM `task_assignees` WHERE `task_id` LIKE 'demo-tasks-%'");
        $pdo->exec("DELETE FROM `tasks` WHERE `id` LIKE 'demo-tasks-%'"); /* recurring-template: demo seed */

        $ins = $pdo->prepare(
            "INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `start_date`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`,
                `related_lead_id`, `related_project_id`, `is_locking`, `archived`, `completed_by`, `completed_at`, `created_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)" /* recurring-template: demo seed */
        );
        $insAss = $pdo->prepare("INSERT INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");

        $n = 0;
        foreach ($pack['tasks'] as $t) {
            $n++;
            $id = demo_id('tasks', $n);
            $owner = $users[$t['owner']]['name'];
            // Link only to rows another module really wrote (the lead FK would otherwise fail).
            $lead = null;
            if ($t['client'] !== null) {
                $lead = demo_ref_id($t['client']);
                if (!demo_row_exists($pdo, 'leads', $lead)) {
                    $lead = null;
                }
            }
            $project = null;
            if ($t['project'] !== null && $hasProjects) {
                $project = demo_ref_id($t['project']);
                if (!demo_row_exists($pdo, 'projects', $project)) {
                    $project = null;
                }
            }
            $day = (int)$t['day'];
            $done = $t['state'] === 'done';
            $ins->execute([
                $id, demo_text($t['title']), demo_text($t['description']), $t['priority'],
                demo_d(min($day, 0) - 4), demo_d($day), $t['time'], $states[$t['state']], $owner, $users[$t['createdBy']]['name'],
                $lead, $project, $t['locking'] ? 1 : 0,
                $done ? $owner : null, $done ? demo_d($day) . ' ' . $t['time'] : null, demo_dt(min($day, -1) - 6, '09:00'),
            ]);
            $rows++;
            foreach (array_merge([$t['owner']], $t['assignees']) as $who) {
                $insAss->execute([$id, $users[$who]['name']]);
                $rows++;
            }
        }
        return $rows;
    }
}
