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
