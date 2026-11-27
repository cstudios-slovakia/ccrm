<?php
/**
 * Schema healing, one-shot backfill, and state-transition helpers for the
 * Project Breakdown View (Client -> Project -> Employee).
 *
 * Included by public/api/schema.php (listed in ccrm_schema_fingerprint()) and
 * public/sync.php (pre-transaction column healing + read/write helpers).
 * Every function is wrapped in function_exists() so multiple includes are safe.
 */

if (!function_exists('ccrm_heal_project_breakdown_columns')) {

    function ccrm_heal_project_breakdown_columns(PDO $pdo): void {
        if (ccrm_table_exists($pdo, 'tasks')) {
            if (!ccrm_column_exists($pdo, 'tasks', 'first_started_at')) {
                $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `first_started_at` DATETIME NULL COMMENT 'First time task left initial unstarted state or was completed' AFTER `deadline_moves`");
            }
            if (!ccrm_column_exists($pdo, 'tasks', 'reopened_count')) {
                $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `reopened_count` INT NOT NULL DEFAULT 0 COMMENT 'How many times task was reopened from a done state' AFTER `first_started_at`");
            }
        }
        if (ccrm_table_exists($pdo, 'tickets')) {
            if (!ccrm_column_exists($pdo, 'tickets', 'reopened_count')) {
                $pdo->exec("ALTER TABLE `tickets` ADD COLUMN `reopened_count` INT NOT NULL DEFAULT 0 COMMENT 'How many times ticket was reopened from resolved/closed' AFTER `closed_at`");
            }
        }
    }

    function ccrm_task_is_initial_state(string $status, array $taskStates = []): bool {
        $norm = strtolower(trim($status));
        if ($norm === '' || in_array($norm, ['todo', 'new', 'nová', 'nova', 'nové', 'nove', 'új', 'uj'], true)) {
            return true;
        }
        if (!empty($taskStates)) {
            $first = strtolower(trim((string)$taskStates[0]));
            if ($first !== '' && $norm === $first) {
                return true;
            }
        }
        return false;
    }

    /** @return string[] */
    function ccrm_ticket_terminal_keys(PDO $pdo): array {
        $keys = ['resolved', 'closed'];
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TICKET_STATUSES' LIMIT 1")->fetchColumn();
            if ($raw) {
                $list = json_decode((string)$raw, true);
                if (is_array($list)) {
                    foreach ($list as $item) {
                        if (!is_array($item)) continue;
                        $cat = (string)($item['category'] ?? ($item['group'] ?? ''));
                        if (!empty($item['isTerminal']) || $cat === 'resolved' || $cat === 'closed') {
                            foreach (['id', 'key'] as $f) {
                                if (!empty($item[$f])) {
                                    $keys[] = (string)$item[$f];
                                }
                            }
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            // Fall back to default terminal keys
        }
        return array_values(array_unique($keys));
    }

    /** @return string[] */
    function ccrm_ticket_terminal_labels(PDO $pdo): array {
        $labels = ['resolved', 'vyriešený', 'vyrieseny', 'megoldva', 'closed', 'uzavretý', 'uzavrety', 'lezárva', 'lezarva'];
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TICKET_STATUSES' LIMIT 1")->fetchColumn();
            if ($raw) {
                $list = json_decode((string)$raw, true);
                if (is_array($list)) {
                    foreach ($list as $item) {
                        if (!is_array($item)) continue;
                        $cat = (string)($item['category'] ?? ($item['group'] ?? ''));
                        if (!empty($item['isTerminal']) || $cat === 'resolved' || $cat === 'closed') {
                            foreach (['id', 'key', 'label', 'labelEn', 'labelSk', 'labelHu'] as $f) {
                                if (!empty($item[$f]) && is_string($item[$f])) {
                                    $labels[] = strtolower(trim($item[$f]));
                                }
                            }
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            // Fall back to built-in terminal labels
        }
        return array_values(array_unique($labels));
    }

    function ccrm_backfill_project_breakdown_metrics(PDO $pdo): void {
        try {
            $done = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'PROJECT_BREAKDOWN_BACKFILL_V1' LIMIT 1")->fetchColumn();
            if ($done === '1') {
                return;
            }
        } catch (\Throwable $e) {
            return;
        }

        try {
            // 1. Backfill tasks.first_started_at from earliest time entry, completed_at, or non-initial status
            if (ccrm_table_exists($pdo, 'tasks') && ccrm_column_exists($pdo, 'tasks', 'first_started_at')) {
                if (ccrm_table_exists($pdo, 'time_entries')) {
                    $pdo->exec("
                        /* recurring-template: backfill first_started_at on real tasks */
                        UPDATE `tasks` t
                        JOIN (
                            SELECT `task_id`, MIN(COALESCE(`start_at`, `created_at`)) AS `first_at`
                            FROM `time_entries`
                            WHERE `deleted_at` IS NULL AND `task_id` IS NOT NULL AND `task_id` <> ''
                            GROUP BY `task_id`
                        ) te ON te.`task_id` = t.`id`
                        SET t.`first_started_at` = te.`first_at`
                        WHERE t.`first_started_at` IS NULL AND " . ccrm_sql_real_tasks('t') . "
                    ");
                }
                $pdo->exec("
                    /* recurring-template: backfill first_started_at using completed_at */
                    UPDATE `tasks`
                    SET `first_started_at` = STR_TO_DATE(`completed_at`, '%Y-%m-%d %H:%i')
                    WHERE `first_started_at` IS NULL
                      AND `completed_at` IS NOT NULL
                      AND `completed_at` <> ''
                      AND STR_TO_DATE(`completed_at`, '%Y-%m-%d %H:%i') IS NOT NULL
                      AND " . ccrm_sql_real_tasks() . "
                ");

                $taskStates = [];
                try {
                    $tsRaw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATES' LIMIT 1")->fetchColumn();
                    $decoded = $tsRaw ? json_decode((string)$tsRaw, true) : null;
                    if (is_array($decoded)) $taskStates = $decoded;
                } catch (\Throwable $e) {}

                $rows = $pdo->query("SELECT `id`, `status`, `updated_at`, `created_at` FROM `tasks` WHERE `first_started_at` IS NULL AND " . ccrm_sql_real_tasks())->fetchAll(PDO::FETCH_ASSOC) ?: [];
                $updStart = $pdo->prepare("/* recurring-template: backfill first_started_at for started tasks */ UPDATE `tasks` SET `first_started_at` = ? WHERE `id` = ? AND `first_started_at` IS NULL");
                foreach ($rows as $r) {
                    if (!ccrm_task_is_initial_state((string)($r['status'] ?? ''), $taskStates)) {
                        $stamp = $r['updated_at'] ?: $r['created_at'];
                        if ($stamp) {
                            $updStart->execute([$stamp, $r['id']]);
                        }
                    }
                }
            }

            // 2. Backfill tickets.reopened_count from status_changed history in ticket_messages
            if (
                ccrm_table_exists($pdo, 'tickets')
                && ccrm_column_exists($pdo, 'tickets', 'reopened_count')
                && ccrm_table_exists($pdo, 'ticket_messages')
            ) {
                $terminalLabels = ccrm_ticket_terminal_labels($pdo);
                $stmt = $pdo->query("
                    SELECT `ticket_id`, `body`
                    FROM `ticket_messages`
                    WHERE `event_type` = 'status_changed' AND `body` IS NOT NULL
                    ORDER BY `ticket_id`, `created_at` ASC
                ");
                $counts = [];
                if ($stmt) {
                    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $msg) {
                        $parts = preg_split('/\s*(?:→|->)\s*/u', (string)$msg['body'], 2);
                        if (!$parts || count($parts) < 2) continue;
                        $from = strtolower(trim($parts[0]));
                        $to = strtolower(trim($parts[1]));
                        if (in_array($from, $terminalLabels, true) && !in_array($to, $terminalLabels, true)) {
                            $tid = (string)$msg['ticket_id'];
                            $counts[$tid] = ($counts[$tid] ?? 0) + 1;
                        }
                    }
                }
                if (!empty($counts)) {
                    $updTck = $pdo->prepare("UPDATE `tickets` SET `reopened_count` = GREATEST(`reopened_count`, ?) WHERE `id` = ?");
                    foreach ($counts as $tid => $cnt) {
                        $updTck->execute([$cnt, $tid]);
                    }
                }
            }

            $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('PROJECT_BREAKDOWN_BACKFILL_V1', '1') ON DUPLICATE KEY UPDATE `value` = '1'")->execute();
        } catch (\Throwable $e) {
            if (function_exists('ccrm_log_exception')) {
                ccrm_log_exception($e);
            }
        }
    }

    function ccrm_stamp_task_breakdown_transition(
        PDO $pdo,
        string $taskId,
        string $newStatus,
        ?string $oldStatus,
        bool $isClosedNow,
        bool $wasClosedBefore,
        array $taskStates = [],
        ?string $reopenedBy = null
    ): void {
        // A finished task saved as unfinished is a reopening: ccrm_task_record_reopen() (api/task_done.php) is the one
        // writer of tasks.reopened_count and tasks.reopens_json. Outside the try below: a failure there (a deadlock)
        // must roll the caller's transaction back instead of leaving the counter and the log disagreeing.
        // The caller (sync.php) has loaded api/task_done.php already.
        if ($oldStatus !== null) {
            if (ccrm_task_is_reopened(['status' => $oldStatus], $newStatus, $taskStates)) {
                ccrm_task_record_reopen($pdo, $taskId, $reopenedBy);
            }
        }
        try {
            if ($isClosedNow || !ccrm_task_is_initial_state($newStatus, $taskStates)) {
                $pdo->prepare("/* recurring-template: stamp first_started_at on real task */ UPDATE `tasks` SET `first_started_at` = COALESCE(`first_started_at`, NOW()) WHERE `id` = ? AND `first_started_at` IS NULL")->execute([$taskId]);
            }
        } catch (\Throwable $e) {
            if (function_exists('ccrm_log_exception')) {
                ccrm_log_exception($e);
            }
        }
    }
}
