<?php
/**
 * Time tracking v2, phase 8 (D10.2): the timer action a task status change triggers.
 * Twin of `timerActionForStatusChange` in src/utils/taskStatusTimer.ts; both run the shared
 * fixtures in scripts/fixtures/task-status-timer-cases.json (php scripts/test-task-status-timer.php).
 * Pure, no database.
 *
 *   ccrm_tt_normalize_status_timer_map($raw)                  keep only name => start|pause|stop
 *   ccrm_tt_timer_action_for_status_change($old, $new, $map)  'start' | 'pause' | 'stop' | null
 */

if (!function_exists('ccrm_tt_timer_action_for_status_change')) {

    /** Accepts whatever the setting holds (missing, wrong shape) and keeps only valid entries. */
    function ccrm_tt_normalize_status_timer_map($raw): array {
        $out = [];
        if (!is_array($raw)) {
            return $out;
        }
        foreach ($raw as $name => $action) {
            if (is_string($action) && in_array($action, ['start', 'pause', 'stop'], true)) {
                $out[(string)$name] = $action;
            }
        }
        return $out;
    }

    /** The mapped action of the new status, only when the status really changed; else null. */
    function ccrm_tt_timer_action_for_status_change($old, $new, array $map): ?string {
        $before = is_string($old) ? trim($old) : '';
        $after = is_string($new) ? trim($new) : '';
        if ($after === '' || $before === $after) {
            return null;
        }
        $actions = ccrm_tt_normalize_status_timer_map($map);
        return $actions[$after] ?? null;
    }
}
