<?php
/**
 * Time tracking v2, phase 6 (d): the server side of presence notifications (docs/TIME-TRACKING-V2.md
 * D7.3, D7.5, A4.2, C9).
 *
 *   ccrm_tt_presence_cron_pass($pdo, $nowUtc)     cron.php, every minute: settle every user with a timer
 *                                                 item, then the pushes; stamps TT_CRON_LAST_RUN
 *   ccrm_tt_cron_status($pdo, $nowUtc)            {lastRunAt: ISO|null, stale: bool} for Settings
 *   ccrm_tt_presence_watch_answer($pdo, $userId, $settings)
 *                                                 call before a timer mutation: if a question was pending
 *                                                 and the mutation answered it, a silent "cleared" push goes
 *                                                 out after the response
 *   ccrm_tt_push_cleared_later($pdo, $userId)     the silent "cleared" push, after the response
 *
 * Push rules (built from what settle returned in THIS pass; a lazy request that settled first means
 * the cron sees no change and sends no "paused" / "stopped" push for it):
 *  - question window (promptAt <= now < deadlineAt): `ccrm_tt_push_question`, at most once per calendar
 *    minute per user (`time_presence.last_push_at`, claimed with one conditional UPDATE, so two
 *    overlapping cron runs never both send);
 *  - an automatic pause: `ccrm_tt_push_paused` once, at the time the items were ended;
 *  - expired presence markers (the pause ran out): `ccrm_tt_push_stopped` once, at their end time;
 *  - auto-stop (autoStopAt, A4.2): `ccrm_tt_push_stopped`, at the auto-stop instant.
 * One user's failure is logged and the pass goes on with the next.
 */

require_once __DIR__ . '/time_presence_lib.php';
require_once __DIR__ . '/time_presence_push.php';

if (!function_exists('ccrm_tt_presence_cron_pass')) {

    /** Users the pass looks at: an anchor or a live automatic pause, or a running entry. Indexed, bounded reads. */
    function ccrm_tt_presence_cron_users(\PDO $pdo): array {
        $ids = [];
        foreach ($pdo->query("SELECT `user_id` FROM `time_presence` WHERE `anchor_at` IS NOT NULL OR `auto_paused_at` IS NOT NULL LIMIT 5000")->fetchAll(\PDO::FETCH_COLUMN) as $u) {
            $ids[(string)$u] = true;
        }
        foreach ($pdo->query("SELECT DISTINCT `running_guard` FROM `time_entries` WHERE `running_guard` IS NOT NULL LIMIT 5000")->fetchAll(\PDO::FETCH_COLUMN) as $u) {
            $ids[(string)$u] = true;
        }
        unset($ids['']);
        return array_keys($ids);
    }

    /** The latest end of the given entries (UTC), or $fallback. */
    function ccrm_tt_presence_latest_end(\PDO $pdo, array $ids, ?string $fallback): ?string {
        $ids = array_values(array_filter(array_map('strval', $ids), fn($id) => $id !== ''));
        if (!$ids) {
            return $fallback;
        }
        $stmt = $pdo->prepare("SELECT MAX(`end_at`) FROM `time_entries` WHERE `id` IN (" . implode(',', array_fill(0, count($ids), '?')) . ")");
        $stmt->execute($ids);
        $end = $stmt->fetchColumn();
        return $end ? (string)$end : $fallback;
    }

    /** Titles of the user's running items, as every surface shows them (the linked task's or ticket's, live). */
    function ccrm_tt_presence_running_titles(\PDO $pdo, string $userId): array {
        $stmt = $pdo->prepare(ccrm_tt_entry_select() . " WHERE te.`running_guard` = ? ORDER BY te.`start_at` ASC, te.`id` ASC");
        $stmt->execute([$userId]);
        $titles = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            if (!empty($r['task_id'])) {
                $titles[] = !empty($r['task_exists']) ? (string)$r['task_title'] : (string)($r['title_snapshot'] ?? '');
            } elseif (!empty($r['ticket_id'])) {
                $titles[] = !empty($r['ticket_exists']) ? (string)$r['ticket_title'] : (string)($r['title_snapshot'] ?? '');
            } else {
                $titles[] = (string)($r['description'] ?? '');
            }
        }
        return $titles;
    }

    /** Claim this calendar minute's question push for the user; true when this caller may send it. */
    function ccrm_tt_presence_claim_push(\PDO $pdo, string $userId, string $nowUtc): bool {
        $minute = substr($nowUtc, 0, 16) . ':00';
        $pdo->prepare("INSERT IGNORE INTO `time_presence` (`user_id`) VALUES (?)")->execute([$userId]);
        $upd = $pdo->prepare("UPDATE `time_presence` SET `last_push_at` = ? WHERE `user_id` = ? AND (`last_push_at` IS NULL OR `last_push_at` < ?)");
        $upd->execute([$nowUtc, $userId, $minute]);
        return $upd->rowCount() === 1;
    }

    /**
     * One user: settle at $nowUtc, then the pushes. Returns what was sent:
     * {question: bool, paused: bool, stopped: bool}.
     */
    function ccrm_tt_presence_cron_user(\PDO $pdo, string $userId, string $nowUtc, array $settings): array {
        $sent = ['question' => false, 'paused' => false, 'stopped' => false];
        $res = ccrm_tt_presence_settle($pdo, $userId, $nowUtc, $settings);
        if ($res['autoPaused']) {
            ccrm_tt_push_paused($pdo, $userId, (string)($res['endedAt'] ?? $res['pausedAt']));
            $sent['paused'] = true;
        }
        if ($res['autoStopped']) {
            ccrm_tt_push_stopped($pdo, $userId, (string)ccrm_tt_presence_latest_end($pdo, $res['autoStopped'], $nowUtc));
            $sent['stopped'] = true;
        } elseif ($res['expired']) {
            ccrm_tt_push_stopped($pdo, $userId, (string)ccrm_tt_presence_latest_end($pdo, $res['expired'], $nowUtc));
            $sent['stopped'] = true;
        }
        $state = ccrm_tt_presence_state($pdo, $userId, $settings, $nowUtc);
        if ($state['phase'] === 'question' && $state['deadlineAt'] !== null && ccrm_tt_presence_claim_push($pdo, $userId, $nowUtc)) {
            ccrm_tt_push_question($pdo, $userId, (string)ccrm_tt_to_utc($state['deadlineAt']), ccrm_tt_presence_running_titles($pdo, $userId));
            $sent['question'] = true;
        }
        return $sent;
    }

    /**
     * The per-minute pass (D7.3 "from cron.php every minute", D7.5). Never throws for one user.
     * Returns {users, questions, paused, stopped, errors}.
     */
    function ccrm_tt_presence_cron_pass(\PDO $pdo, ?string $nowUtc = null): array {
        $nowUtc = $nowUtc ?? ccrm_tt_now_utc();
        $out = ['users' => 0, 'questions' => 0, 'paused' => 0, 'stopped' => 0, 'errors' => 0];
        try {
            $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('TT_CRON_LAST_RUN', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
                ->execute([$nowUtc]);
        } catch (\Throwable $e) {
            if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
        }
        $settings = ccrm_tt_load_settings($pdo);
        foreach (ccrm_tt_presence_cron_users($pdo) as $userId) {
            $out['users']++;
            try {
                $sent = ccrm_tt_presence_cron_user($pdo, $userId, $nowUtc, $settings);
                $out['questions'] += (int)$sent['question'];
                $out['paused'] += (int)$sent['paused'];
                $out['stopped'] += (int)$sent['stopped'];
            } catch (\Throwable $e) {
                $out['errors']++;
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
            }
        }
        return $out;
    }

    /** When the cron last ran: stale when never or more than five minutes ago (Settings warns, D7.3). */
    function ccrm_tt_cron_status(\PDO $pdo, ?string $nowUtc = null): array {
        $nowUtc = $nowUtc ?? ccrm_tt_now_utc();
        $last = null;
        try {
            $v = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TT_CRON_LAST_RUN' LIMIT 1")->fetchColumn();
            $last = is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $v) ? $v : null;
        } catch (\Throwable $e) {
        }
        $stale = $last === null || ((int)strtotime($nowUtc . ' UTC') - (int)strtotime($last . ' UTC')) > 300;
        return ['lastRunAt' => ccrm_tt_iso($last), 'stale' => $stale];
    }

    /**
     * The silent "cleared" push (D7.5) after the response: the HTTP answer is flushed first where
     * the SAPI allows it, and an error is only logged.
     */
    function ccrm_tt_push_cleared_later(\PDO $pdo, string $userId): void {
        if ($userId === '') {
            return;
        }
        register_shutdown_function(function () use ($pdo, $userId) {
            try {
                if (function_exists('fastcgi_finish_request')) {
                    fastcgi_finish_request();
                }
                ccrm_tt_push_cleared($pdo, $userId);
            } catch (\Throwable $e) {
                if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
            }
        });
    }

    /**
     * Call before a timer mutation (start, stop, pause, resume). When the user's question is pending
     * now, the state is read again after the response: if the question is gone (the anchor moved or
     * nothing runs any more), the mutation answered it and the "cleared" push goes out. A mutation
     * that failed leaves the question pending, so nothing is sent.
     */
    function ccrm_tt_presence_watch_answer(\PDO $pdo, string $userId, array $settings): void {
        try {
            if ($userId === '') {
                return;
            }
            $before = ccrm_tt_presence_state($pdo, $userId, $settings, ccrm_tt_now_utc());
            if ($before['phase'] !== 'question') {
                return;
            }
            register_shutdown_function(function () use ($pdo, $userId, $settings, $before) {
                try {
                    $after = ccrm_tt_presence_state($pdo, $userId, $settings, ccrm_tt_now_utc());
                    if ($after['phase'] === 'question' && $after['anchorAt'] === $before['anchorAt']) {
                        return;
                    }
                    if (function_exists('fastcgi_finish_request')) {
                        fastcgi_finish_request();
                    }
                    ccrm_tt_push_cleared($pdo, $userId);
                } catch (\Throwable $e) {
                    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
                }
            });
        } catch (\Throwable $e) {
            if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
        }
    }
}
