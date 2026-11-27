<?php
/**
 * timeline_events.task_id: which task a "Comment on task: <title>" note belongs to.
 *
 * The MCP add_task_comment tool writes the note to the client's timeline; task_id ties it to the task, so
 * list_tasks / get_task can report the comment as the task's last_activity_at (a renamed task keeps it).
 * The column is also healed in sync.php, and the MCP heals it itself (mcp_ensure_task_link) during a rollout.
 *
 * The backfill links older comments by their title, but only where exactly one task of that client has the
 * title: a renamed task, a duplicate title or a recurring series (one title, many rows) stays unlinked
 * rather than guessed. Safe to run on every schema apply: it only touches rows that are still unlinked.
 *
 * Loaded by api/schema.php (and listed in ccrm_schema_fingerprint()) and by api/mcp_lists_crm.php.
 */

if (!function_exists('ccrm_migrate_timeline_task_link')) {

    function ccrm_migrate_timeline_task_link(PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'timeline_events')) return;
        if (!ccrm_column_exists($pdo, 'timeline_events', 'task_id')) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD COLUMN `task_id` VARCHAR(50) NULL COMMENT 'The task a note comments on (written by the MCP add_task_comment tool); NULL for every other entry. No foreign key: the note stays on the client timeline when the task goes'");
        }
        $hasIndex = $pdo->query("SHOW INDEX FROM `timeline_events` WHERE Key_name = 'idx_event_task'")->fetch();
        if (!$hasIndex) {
            $pdo->exec("ALTER TABLE `timeline_events` ADD INDEX `idx_event_task` (`task_id`)");
        }
        if (!ccrm_table_exists($pdo, 'tasks')) return;
        $pdo->exec(
            "UPDATE `timeline_events` te
             JOIN (SELECT `related_lead_id`, `title`, MIN(`id`) AS tid, COUNT(*) AS n
                   FROM `tasks` WHERE `related_lead_id` IS NOT NULL AND `related_lead_id` <> '' /* recurring-template: a template with the same title only makes the title ambiguous, so the comment stays unlinked */
                   GROUP BY `related_lead_id`, `title` HAVING n = 1) t
               ON t.`related_lead_id` = te.`lead_id` AND CONCAT('Comment on task: ', t.`title`) = te.`title`
             SET te.`task_id` = t.tid
             WHERE te.`task_id` IS NULL AND te.`type` = 'note' AND te.`title` LIKE 'Comment on task: %'"
        );
    }

}
