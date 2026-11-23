<?php
/**
 * "Is this task done?" — the one PHP rule. Mirrors isDoneTaskState() in
 * src/utils/projectTasks.ts; every PHP reader (sync notifications and ticket
 * auto-resolve, the recurring generator, e-mail reminders, workflow dedupe, MCP,
 * the WAAI integration) asks here instead of keeping its own copy.
 *
 * A task is done when its status is the literal 'done' (any case) or the
 * configured done state: the last entry of TASK_STATES. Settings keeps that
 * entry last on purpose — a new state is inserted before it and the done state
 * cannot be deleted (only renamed, which cascades) — so editing the list never
 * moves the done marker onto another state.
 *
 * src/utils/taskDoneRuleGuard.test.ts fails when "last entry of TASK_STATES"
 * logic reappears outside this file.
 */

if (!function_exists('ccrm_task_done_state')) {
    /** The configured state that finishes a task, or null when no states are configured. */
    function ccrm_task_done_state(array $states): ?string {
        $states = array_values(array_filter(array_map('strval', $states), function ($s) {
            return trim($s) !== '';
        }));
        return $states ? $states[count($states) - 1] : null;
    }
}

if (!function_exists('ccrm_task_status_is_done')) {
    function ccrm_task_status_is_done($status, array $states): bool {
        $status = (string)$status;
        if (strtolower($status) === 'done') {
            return true;
        }
        $done = ccrm_task_done_state($states);
        return $done !== null && $status === $done;
    }
}

if (!function_exists('ccrm_task_states_setting')) {
    /** TASK_STATES as stored, in order. Empty when never stored or unreadable. */
    function ccrm_task_states_setting(\PDO $pdo): array {
        try {
            $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATES'")->fetchColumn();
        } catch (\Throwable $e) {
            return [];
        }
        $states = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($states) ? array_values(array_map('strval', $states)) : [];
    }
}

if (!function_exists('ccrm_is_done_task_status')) {
    function ccrm_is_done_task_status($status, \PDO $pdo): bool {
        return ccrm_task_status_is_done($status, ccrm_task_states_setting($pdo));
    }
}

if (!function_exists('ccrm_sql_task_not_done')) {
    /**
     * SQL condition (and its params) for "this task is not done", the same rule
     * in a WHERE clause. `$column` is the qualified status column, e.g. "t.`status`".
     */
    function ccrm_sql_task_not_done(array $states, string $column = '`status`'): array {
        $sql = "LOWER({$column}) <> 'done'";
        $params = [];
        $done = ccrm_task_done_state($states);
        if ($done !== null && strtolower($done) !== 'done') {
            $sql .= " AND {$column} <> ?";
            $params[] = $done;
        }
        return ['(' . $sql . ')', $params];
    }
}

if (!function_exists('ccrm_task_is_reopened')) {
    /**
     * Does saving a stored task with `$newStatus` reopen it? True when the stored status is a done state
     * and the new status is not. A stale completion stamp on an open task does not count. Series
     * templates never count. `$stored` needs `status` and, when known, `task_kind`.
     */
    function ccrm_task_is_reopened(array $stored, $newStatus, array $states): bool {
        if (($stored['task_kind'] ?? null) === 'recurring') return false;
        return ccrm_task_status_is_done($stored['status'] ?? '', $states) && !ccrm_task_status_is_done($newStatus, $states);
    }
}

if (!function_exists('ccrm_task_reopens_decode')) {
    /** `tasks.reopens_json` as a clean list of ['at' => UTC ISO string, 'by' => name|null], oldest first. */
    function ccrm_task_reopens_decode($json): array {
        $list = is_string($json) && $json !== '' ? json_decode($json, true) : null;
        $out = [];
        foreach (is_array($list) ? $list : [] as $e) {
            if (!is_array($e) || !isset($e['at']) || !is_string($e['at']) || $e['at'] === '') continue;
            $out[] = ['at' => $e['at'], 'by' => (isset($e['by']) && is_string($e['by']) && $e['by'] !== '') ? $e['by'] : null];
        }
        return $out;
    }
}

if (!function_exists('ccrm_task_record_reopen')) {
    /**
     * Appends one reopening to `tasks.reopens_json`. The only writer of that column; callers decide with
     * ccrm_task_is_reopened() first. Reads the row with FOR UPDATE, so inside the caller's transaction
     * two appends cannot overwrite each other. A series template is refused. Needs the column to exist
     * (no DDL here): a caller outside sync.php wraps it in try/catch. Returns whether a record was added.
     */
    function ccrm_task_record_reopen(\PDO $pdo, string $taskId, ?string $by, ?string $atUtc = null): bool {
        $stmt = $pdo->prepare("SELECT `task_kind`, `reopens_json` FROM `tasks` WHERE `id` = ? LIMIT 1 FOR UPDATE"); /* recurring-template: by-id read, a template is refused below */
        $stmt->execute([$taskId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row || ($row['task_kind'] ?? null) === 'recurring') return false;
        $list = ccrm_task_reopens_decode($row['reopens_json'] ?? null);
        $list[] = ['at' => $atUtc ?? gmdate('Y-m-d\TH:i:s\Z'), 'by' => ($by !== null && trim($by) !== '') ? mb_substr(trim($by), 0, 100) : null];
        $list = array_slice($list, -300);
        $pdo->prepare("UPDATE `tasks` SET `reopens_json` = ? WHERE `id` = ?")->execute([json_encode($list, JSON_UNESCAPED_UNICODE), $taskId]); /* recurring-template: by-id write, a template is refused above */
        return true;
    }
}
