<?php
/**
 * Time tracking v2, phase 8 (c) (docs/TIME-TRACKING-V2.md D10.2 "On the server", C14, A4.9):
 * the timer action a task status change triggers when no browser runs the rule, i.e. for the MCP
 * `update_task` and `complete_task` tools.
 *
 *   ccrm_tt_task_status_changed($pdo, $taskId, $oldStatus, $newStatus, $actorUserId)
 *
 * Reads `TASK_STATE_TIMER_ACTIONS` ({status: start|pause|stop}) from system_settings and asks the
 * pure rule (time_status_rule.php) for the action. Then, for the ACTOR only (the user the MCP key
 * belongs to), on THAT task only:
 *   start -> nothing: the server never starts a timer (a start needs a person at a screen)
 *   pause -> the actor's running entry on the task ends now with a pause marker, pause_reason
 *            'status' (end_reason stays NULL, like a REST pause; it becomes 'status' on expiry)
 *   stop  -> the actor's running entry on the task ends with end_reason 'status'; a paused one
 *            loses its marker with end_reason 'status'
 * Nobody else's timer is touched (C14). "Require a project" never applies. Idempotent: nothing
 * running or paused on the task is a no-op. Runs in its own transaction under the per-user lock,
 * so call it AFTER the task write has committed. No sync.php call, no WAAI call, no push.
 */

require_once __DIR__ . '/time_entries_lib.php';
require_once __DIR__ . '/time_lock.php';
require_once __DIR__ . '/time_pause_lib.php';
require_once __DIR__ . '/time_presence_lib.php';
require_once __DIR__ . '/time_status_rule.php';

if (!function_exists('ccrm_tt_task_status_changed')) {

    /** The stored status -> timer action map, normalized; empty when unset or unreadable. */
    function ccrm_tt_status_timer_map(\PDO $pdo): array {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATE_TIMER_ACTIONS'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return [];
        }
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        return ccrm_tt_normalize_status_timer_map($decoded);
    }

    /**
     * Apply the mapped pause/stop of a task status change to the actor's own timer on that task.
     * Returns {action: start|pause|stop|null, applied: bool, paused: id[], stopped: id[], unpaused: id[]}.
     */
    function ccrm_tt_task_status_changed(\PDO $pdo, string $taskId, ?string $oldStatus, string $newStatus, string $actorUserId): array {
        $out = ['action' => null, 'applied' => false, 'paused' => [], 'stopped' => [], 'unpaused' => []];
        if ($taskId === '' || $actorUserId === '') {
            return $out;
        }
        $action = ccrm_tt_timer_action_for_status_change($oldStatus, $newStatus, ccrm_tt_status_timer_map($pdo));
        $out['action'] = $action;
        if ($action !== 'pause' && $action !== 'stop') {
            return $out; // null, or start: the server never starts a timer
        }

        $onTask = fn(array $rows) => array_values(array_filter($rows, fn($r) => (string)($r['task_id'] ?? '') === $taskId));
        // Lookups that need no lock go before the transaction (see time_lock.php).
        $settings = ccrm_tt_load_settings($pdo);
        foreach ($onTask(ccrm_tt_running_rows($pdo, $actorUserId)) as $r) {
            ccrm_tt_price($pdo, $actorUserId, (string)$r['entry_date'], null, $settings, true); // warm the holiday cache
        }

        ccrm_tt_lock_prepare($pdo, $actorUserId);
        try {
            $pdo->beginTransaction();
            ccrm_tt_lock_user($pdo, $actorUserId);
            $nowUtc = ccrm_tt_now_utc();
            $runningIds = array_column($onTask(ccrm_tt_running_rows($pdo, $actorUserId, true)), 'id');
            if ($action === 'pause') {
                $ended = ccrm_tt_end_entries($pdo, $actorUserId, $runningIds, $nowUtc, null, ['reason' => 'status', 'until' => null]);
                $out['paused'] = array_map('strval', array_column($ended, 'id'));
            } else {
                $ended = ccrm_tt_end_entries($pdo, $actorUserId, $runningIds, $nowUtc, 'status');
                $out['stopped'] = array_map('strval', array_column($ended, 'id'));
                foreach ($onTask(ccrm_tt_paused_rows($pdo, $actorUserId, $settings)) as $p) {
                    if (ccrm_tt_clear_pause($pdo, (string)$p['id'], 'status')) {
                        $out['unpaused'][] = (string)$p['id'];
                    }
                }
            }
            $out['applied'] = (bool)($out['paused'] || $out['stopped'] || $out['unpaused']);
            if ($ended) {
                ccrm_tt_presence_touch($pdo, $actorUserId, $nowUtc); // a deliberate action; nothing left running: NULL
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return $out;
    }
}
