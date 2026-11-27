<?php
/**
 * One Project Manager plus any number of assigned employees, on leads, clients and projects alike.
 *
 * - `leads.assigned_employees` (TEXT, JSON array of user names): the people working on a lead or client
 *   besides its Project Manager (`leads.owner`). Same kind of id as `owner` and `project_employees.user_id`.
 * - One-time data move (marker `ASSIGNED_EMPLOYEES_MIGRATION` in system_settings):
 *   1. A project with several managers keeps one: the first (by name) who has the Project Manager role,
 *      or the first by name when none has it. The others become its assigned employees.
 *   2. A lead or client whose owner is a user without the Project Manager role gets that user as an
 *      assigned employee instead, and no owner. Owners that are not users at all (imported names) stay.
 *      Skipped when no user has the role, so an install that never used it keeps its owners.
 *
 * Runs from ccrm_apply_migrations, never from the probe path; listed in ccrm_schema_fingerprint().
 * sync.php heals the column itself before its transaction.
 */

if (!function_exists('ccrm_migrate_assigned_employees')) {
    function ccrm_migrate_assigned_employees(PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'leads')) return;
        if (!ccrm_column_exists($pdo, 'leads', 'assigned_employees')) {
            $pdo->exec("ALTER TABLE `leads` ADD COLUMN `assigned_employees` TEXT NULL COMMENT 'JSON array of user names working on the lead besides its owner' AFTER `owner`");
        }
        try {
            $done = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'ASSIGNED_EMPLOYEES_MIGRATION'")->fetchColumn();
            if ($done !== false) return;

            $pmNames = [];
            $userNames = [];
            foreach ($pdo->query("SELECT `name`, `role` FROM `users`")->fetchAll(PDO::FETCH_ASSOC) as $u) {
                $name = trim((string)$u['name']);
                if ($name === '') continue;
                $userNames[$name] = true;
                if (strtolower(trim((string)$u['role'])) === 'project manager') $pmNames[$name] = true;
            }

            $movedProjects = 0;
            if (ccrm_table_exists($pdo, 'project_managers') && ccrm_table_exists($pdo, 'project_employees')) {
                $byProject = [];
                foreach ($pdo->query("SELECT `project_id`, `user_id` FROM `project_managers` ORDER BY `project_id`, `user_id`")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                    $byProject[$r['project_id']][] = $r['user_id'];
                }
                $delMgr = $pdo->prepare("DELETE FROM `project_managers` WHERE `project_id` = ? AND `user_id` = ?");
                $insEmp = $pdo->prepare("INSERT IGNORE INTO `project_employees` (`project_id`, `user_id`) VALUES (?, ?)");
                foreach ($byProject as $projectId => $managers) {
                    if (count($managers) < 2) continue;
                    $keep = $managers[0];
                    foreach ($managers as $m) {
                        if (isset($pmNames[trim((string)$m)])) { $keep = $m; break; }
                    }
                    foreach ($managers as $m) {
                        if ($m === $keep) continue;
                        $insEmp->execute([$projectId, $m]);
                        $delMgr->execute([$projectId, $m]);
                    }
                    $movedProjects++;
                }
            }

            $movedLeads = 0;
            if ($pmNames) {
                $upd = $pdo->prepare("UPDATE `leads` SET `owner` = '', `assigned_employees` = ? WHERE `id` = ?");
                foreach ($pdo->query("SELECT `id`, `owner`, `assigned_employees` FROM `leads` WHERE `owner` <> ''")->fetchAll(PDO::FETCH_ASSOC) as $l) {
                    $owner = trim((string)$l['owner']);
                    if (!isset($userNames[$owner]) || isset($pmNames[$owner])) continue;
                    $list = json_decode((string)($l['assigned_employees'] ?? ''), true);
                    $list = is_array($list) ? $list : [];
                    if (!in_array($owner, $list, true)) $list[] = $owner;
                    $upd->execute([json_encode(array_values($list), JSON_UNESCAPED_UNICODE), $l['id']]);
                    $movedLeads++;
                }
            }

            $mark = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $mark->execute(['ASSIGNED_EMPLOYEES_MIGRATION', json_encode(['projects' => $movedProjects, 'leads' => $movedLeads])]);
        } catch (\Throwable $e) {
            error_log('[ccrm schema] assigned employees migration skipped: ' . $e->getMessage());
        }
    }
}
