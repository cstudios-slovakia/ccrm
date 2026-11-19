<?php
/**
 * Time tracking v2, phase 6 (b): the presence engine (docs/TIME-TRACKING-V2.md D7, C6, C7, C9, A4.2).
 *
 * One presence cycle per user, owned by the server. Stored in `time_presence`: `anchor_at` (the
 * last answer; NULL while nothing runs) and `auto_paused_at` (the deadline of the last automatic
 * pause while any of its pause markers is still live). Everything else is derived:
 *
 *   promptAt   = anchor_at + promptAfterMinutes      (the question is asked)
 *   deadlineAt = promptAt + confirmWindowMinutes     (no answer by then: the automatic pause)
 *
 *   ccrm_tt_presence_settings($settings)                   the `presence` settings with defaults
 *   ccrm_tt_presence_state($pdo, $userId, $settings, $now) {enabled, anchorAt, promptAt, deadlineAt, phase, autoPausedAt, resumeUntil}
 *   ccrm_tt_presence_settle($pdo, $userId, $now, $settings) D7.3, under the per-user lock; returns what changed
 *   ccrm_tt_presence_touch($pdo, $userId, $now, $answer)    the anchor rules (C6, D7.4), inside the caller's locked transaction
 *   ccrm_tt_presence_confirm($pdo, $userId, $now, $settings) the answer (POST action=confirm)
 *   ccrm_tt_auto_stop_after($startUtc, $settings)          the first autoStopAt instant after a start (UTC)
 *
 * Settle is computed from timestamps, never from when it runs: a lazy call at the top of a
 * time-tracking request and the cron pass produce identical rows. When nothing runs and no
 * automatic pause is live it costs two indexed reads and takes no lock.
 *
 * If `anchor_at` is NULL while items run (entries started before phase 6, or by a path that set no
 * anchor), the cycle is anchored at the latest running start: deterministic, so lazy and cron agree.
 */

require_once __DIR__ . '/time_entries_lib.php';
require_once __DIR__ . '/time_settle.php';
require_once __DIR__ . '/time_lock.php';
require_once __DIR__ . '/time_pause_lib.php';

if (!function_exists('ccrm_tt_presence_settle')) {

    /** D7.1 settings with their defaults. Read defensively: the sanitizer lives in another package. */
    function ccrm_tt_presence_settings(array $settings): array {
        $out = ['enabled' => true, 'promptAfterMinutes' => 50, 'confirmWindowMinutes' => 10, 'resumeWindowMinutes' => 10, 'trimTo' => 'prompt'];
        $in = is_array($settings['presence'] ?? null) ? $settings['presence'] : [];
        if (array_key_exists('enabled', $in)) {
            $out['enabled'] = (bool)$in['enabled'];
        }
        foreach (['promptAfterMinutes' => [1, 1440], 'confirmWindowMinutes' => [1, 240], 'resumeWindowMinutes' => [0, 1440]] as $key => [$lo, $hi]) {
            if (isset($in[$key]) && is_numeric($in[$key])) {
                $out[$key] = max($lo, min($hi, (int)$in[$key]));
            }
        }
        if (in_array($in['trimTo'] ?? null, ['prompt', 'deadline'], true)) {
            $out['trimTo'] = $in['trimTo'];
        }
        return $out;
    }

    function ccrm_tt_utc_add(string $utc, int $seconds): string {
        return gmdate('Y-m-d H:i:s', (int)strtotime($utc . ' UTC') + $seconds);
    }

    /**
     * The first company-timezone autoStopAt instant strictly after $startUtc, as UTC; null when
     * autoStopAt is off. An entry started after today's auto-stop time runs until tomorrow's.
     */
    function ccrm_tt_auto_stop_after(string $startUtc, array $settings): ?string {
        $at = $settings['autoStopAt'] ?? null;
        if (!is_string($at) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $at)) {
            return null;
        }
        $tz = ccrm_tt_company_tz();
        $utc = new \DateTimeZone('UTC');
        $day = (new \DateTimeImmutable($startUtc, $utc))->setTimezone($tz)->format('Y-m-d');
        for ($i = 0; $i < 3; $i++) {
            $candidate = (new \DateTimeImmutable($day . ' ' . $at . ':00', $tz))->setTimezone($utc)->format('Y-m-d H:i:s');
            if ($candidate > $startUtc) {
                return $candidate;
            }
            $day = (new \DateTimeImmutable($day . ' 12:00:00', $tz))->modify('+1 day')->format('Y-m-d');
        }
        return null;
    }

    /** The stored part of the state: ['anchor_at' => ?string, 'auto_paused_at' => ?string]. */
    function ccrm_tt_presence_row(\PDO $pdo, string $userId): array {
        $stmt = $pdo->prepare("SELECT `anchor_at`, `auto_paused_at` FROM `time_presence` WHERE `user_id` = ? LIMIT 1");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        return ['anchor_at' => $row['anchor_at'] ?? null, 'auto_paused_at' => $row['auto_paused_at'] ?? null];
    }

    /** [anchorAt, promptAt, deadlineAt] of the running set (nulls when nothing runs). */
    function ccrm_tt_presence_cycle(?string $anchorAt, array $running, array $ps): array {
        if (!$running) {
            return [null, null, null];
        }
        if ($anchorAt === null || $anchorAt === '') {
            $anchorAt = max(array_map(fn($r) => (string)$r['start_at'], $running));
        }
        $promptAt = ccrm_tt_utc_add($anchorAt, $ps['promptAfterMinutes'] * 60);
        return [$anchorAt, $promptAt, ccrm_tt_utc_add($promptAt, $ps['confirmWindowMinutes'] * 60)];
    }

    /** The user's presence pause markers (live or expired), oldest first. */
    function ccrm_tt_presence_markers(\PDO $pdo, string $userId): array {
        $stmt = $pdo->prepare("SELECT * FROM `time_entries` WHERE `user_id` = ? AND `paused_at` IS NOT NULL AND `pause_reason` = 'presence' AND `deleted_at` IS NULL ORDER BY `paused_at` ASC, `id` ASC");
        $stmt->execute([$userId]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    /** A marker is void once `resume_until` < now (D7.3 step 2). */
    function ccrm_tt_presence_marker_expired(array $row, string $nowUtc): bool {
        return !empty($row['resume_until']) && (string)$row['resume_until'] < $nowUtc;
    }

    /**
     * What settle would do now, from plain reads. Shared by the cheap check before the lock and the
     * authoritative pass under it.
     */
    function ccrm_tt_presence_plan(\PDO $pdo, string $userId, string $nowUtc, array $settings): array {
        $ps = ccrm_tt_presence_settings($settings);
        $running = ccrm_tt_running_rows($pdo, $userId);
        $stored = ccrm_tt_presence_row($pdo, $userId);
        [, $promptAt, $deadlineAt] = ccrm_tt_presence_cycle($stored['anchor_at'], $running, $ps);
        // The moment the automatic pause happens (it ends the items at promptAt, C7).
        $presenceAt = $ps['enabled'] ? $deadlineAt : null;
        $presenceDue = $presenceAt !== null && $presenceAt <= $nowUtc;

        $plan = ['running' => $running, 'autoStop' => [], 'presence' => null, 'checkMarkers' => $stored['auto_paused_at'] !== null, 'write' => false];
        $left = [];
        foreach ($running as $r) {
            // Step 3 (A4.2): an item past its auto-stop instant ends there, unless the automatic pause came first.
            $stop = ccrm_tt_auto_stop_after((string)$r['start_at'], $settings);
            if ($stop !== null && $stop <= $nowUtc && !($presenceDue && $presenceAt <= $stop)) {
                $plan['autoStop'][$stop][] = (string)$r['id'];
                continue;
            }
            $left[] = $r;
        }
        if ($presenceDue && $left) {
            // Step 1: every remaining running item ends at the question (or the deadline) and is paused.
            $plan['presence'] = [
                'ids' => array_map(fn($r) => (string)$r['id'], $left),
                'end' => $ps['trimTo'] === 'deadline' ? $deadlineAt : $promptAt,
                'pausedAt' => $deadlineAt,
                'until' => ccrm_tt_utc_add($deadlineAt, $ps['resumeWindowMinutes'] * 60),
            ];
            $plan['checkMarkers'] = true;
        } elseif ($plan['checkMarkers']) {
            // A live automatic pause: work only when a marker ran out, or none is left (auto_paused_at goes).
            $live = 0;
            $expired = 0;
            foreach (ccrm_tt_presence_markers($pdo, $userId) as $m) {
                ccrm_tt_presence_marker_expired($m, $nowUtc) ? $expired++ : $live++;
            }
            $plan['checkMarkers'] = $expired > 0 || $live === 0;
        }
        $plan['write'] = $plan['autoStop'] || $plan['presence'] !== null || $plan['checkMarkers'];
        return $plan;
    }

    /** Carry out a plan. Inside a transaction that holds the user's lock. */
    function ccrm_tt_presence_apply(\PDO $pdo, string $userId, string $nowUtc, array $plan): array {
        $out = ['changed' => false, 'autoStopped' => [], 'autoPaused' => [], 'pausedAt' => null, 'endedAt' => null, 'expired' => [], 'expiredPausedAt' => []];
        foreach ($plan['autoStop'] as $stop => $ids) {
            $ended = ccrm_tt_end_entries($pdo, $userId, $ids, (string)$stop, 'auto_stop');
            array_push($out['autoStopped'], ...array_map(fn($r) => (string)$r['id'], $ended));
        }
        if ($plan['presence'] !== null) {
            $p = $plan['presence'];
            $ended = ccrm_tt_end_entries($pdo, $userId, $p['ids'], $p['end'], 'presence', ['reason' => 'presence', 'until' => $p['until']]);
            $endedIds = array_map(fn($r) => (string)$r['id'], $ended);
            if ($endedIds) {
                // The marker is set at the deadline (D7.3), not at the end of the entry.
                $pdo->prepare("UPDATE `time_entries` SET `paused_at` = ? WHERE `id` IN (" . implode(',', array_fill(0, count($endedIds), '?')) . ") AND `paused_at` IS NOT NULL")
                    ->execute(array_merge([$p['pausedAt']], $endedIds));
                $pdo->prepare("UPDATE `time_presence` SET `auto_paused_at` = ? WHERE `user_id` = ?")->execute([$p['pausedAt'], $userId]);
                $out['autoPaused'] = $endedIds;
                $out['pausedAt'] = $p['pausedAt'];
                $out['endedAt'] = $p['end'];
            }
        }
        // The running set became empty: the cycle ends with it.
        if ($plan['running'] && !ccrm_tt_running_rows($pdo, $userId)) {
            $pdo->prepare("UPDATE `time_presence` SET `anchor_at` = NULL WHERE `user_id` = ? AND `anchor_at` IS NOT NULL")->execute([$userId]);
        }
        // Step 2: presence markers past resume_until lose the marker (end_reason 'presence' is already set).
        // auto_paused_at stays only while a marker of an automatic pause is still live.
        if ($plan['checkMarkers']) {
            $live = 0;
            foreach (ccrm_tt_presence_markers($pdo, $userId) as $m) {
                if (ccrm_tt_presence_marker_expired($m, $nowUtc)) {
                    if (ccrm_tt_clear_pause($pdo, (string)$m['id'], 'presence')) {
                        $out['expired'][] = (string)$m['id'];
                        $out['expiredPausedAt'][(string)$m['id']] = ccrm_tt_iso((string)$m['paused_at']);
                    }
                } else {
                    $live++;
                }
            }
            if ($live === 0) {
                $pdo->prepare("UPDATE `time_presence` SET `auto_paused_at` = NULL WHERE `user_id` = ? AND `auto_paused_at` IS NOT NULL")->execute([$userId]);
            }
        }
        $out['changed'] = $out['autoStopped'] || $out['autoPaused'] || $out['expired'];
        return $out;
    }

    /**
     * D7.3 for one user at $nowUtc. Opens its own transaction under the per-user lock; called inside
     * a transaction (the caller then already holds that user's lock, time_lock.php) it works in it
     * and does not lock again. Returns
     *   {changed, autoStopped: ids, autoPaused: ids, pausedAt: ?UTC (= deadlineAt), endedAt: ?UTC,
     *    expired: ids, expiredPausedAt: {id: ISO}}
     * for the pushes of the cron pass.
     */
    function ccrm_tt_presence_settle(\PDO $pdo, string $userId, string $nowUtc, array $settings): array {
        $none = ['changed' => false, 'autoStopped' => [], 'autoPaused' => [], 'pausedAt' => null, 'endedAt' => null, 'expired' => [], 'expiredPausedAt' => []];
        if ($userId === '') {
            return $none;
        }
        if ($pdo->inTransaction()) {
            $plan = ccrm_tt_presence_plan($pdo, $userId, $nowUtc, $settings);
            return $plan['write'] ? ccrm_tt_presence_apply($pdo, $userId, $nowUtc, $plan) : $none;
        }
        // The cheap check: plain reads, no lock, no transaction.
        $plan = ccrm_tt_presence_plan($pdo, $userId, $nowUtc, $settings);
        if (!$plan['write']) {
            return $none;
        }
        foreach ($plan['running'] as $r) {
            ccrm_tt_price($pdo, $userId, (string)$r['entry_date'], null, $settings, true); // warm the holiday cache: no network inside
        }
        ccrm_tt_lock_prepare($pdo, $userId);
        try {
            $pdo->beginTransaction();
            ccrm_tt_lock_user($pdo, $userId);
            $plan = ccrm_tt_presence_plan($pdo, $userId, $nowUtc, $settings); // again, on what the lock lets us see
            $out = $plan['write'] ? ccrm_tt_presence_apply($pdo, $userId, $nowUtc, $plan) : $none;
            $pdo->commit();
            return $out;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * The anchor rules (C6, D7.4). Call inside the transaction that changed the user's timers,
     * under their lock, after the change. Nothing runs -> anchor NULL. Otherwise $answer (start,
     * resume, stopping one of several, editing a running entry, confirm) -> anchor = now; without
     * it the anchor is only set when there was none (a running set that was empty).
     */
    function ccrm_tt_presence_touch(\PDO $pdo, string $userId, string $nowUtc, bool $answer = true): void {
        if ($userId === '') {
            return;
        }
        $pdo->prepare("INSERT IGNORE INTO `time_presence` (`user_id`) VALUES (?)")->execute([$userId]);
        if (!ccrm_tt_running_rows($pdo, $userId)) {
            $pdo->prepare("UPDATE `time_presence` SET `anchor_at` = NULL WHERE `user_id` = ? AND `anchor_at` IS NOT NULL")->execute([$userId]);
        } elseif ($answer) {
            $pdo->prepare("UPDATE `time_presence` SET `anchor_at` = ? WHERE `user_id` = ?")->execute([$nowUtc, $userId]);
        } else {
            $pdo->prepare("UPDATE `time_presence` SET `anchor_at` = ? WHERE `user_id` = ? AND `anchor_at` IS NULL")->execute([$nowUtc, $userId]);
        }
    }

    /**
     * The derived state (D7.1) as the API sends it, ISO-8601 instants:
     * {enabled, anchorAt, promptAt, deadlineAt, phase: idle|tracking|question|paused, autoPausedAt, resumeUntil}.
     * Call after settle; it writes nothing.
     */
    function ccrm_tt_presence_state(\PDO $pdo, string $userId, array $settings, string $nowUtc): array {
        $ps = ccrm_tt_presence_settings($settings);
        $running = ccrm_tt_running_rows($pdo, $userId);
        $stored = ccrm_tt_presence_row($pdo, $userId);
        $state = ['enabled' => $ps['enabled'], 'anchorAt' => null, 'promptAt' => null, 'deadlineAt' => null, 'phase' => 'idle', 'autoPausedAt' => null, 'resumeUntil' => null];
        if ($stored['auto_paused_at'] !== null) {
            $until = null;
            foreach (ccrm_tt_presence_markers($pdo, $userId) as $m) {
                if (!ccrm_tt_presence_marker_expired($m, $nowUtc) && !empty($m['resume_until'])) {
                    $until = $until === null ? (string)$m['resume_until'] : max($until, (string)$m['resume_until']);
                }
            }
            if ($until !== null) {
                $state['autoPausedAt'] = ccrm_tt_iso($stored['auto_paused_at']);
                $state['resumeUntil'] = ccrm_tt_iso($until);
                $state['phase'] = 'paused';
            }
        }
        if ($running) {
            $state['phase'] = 'tracking';
            if ($ps['enabled']) {
                [$anchorAt, $promptAt, $deadlineAt] = ccrm_tt_presence_cycle($stored['anchor_at'], $running, $ps);
                $state['anchorAt'] = ccrm_tt_iso($anchorAt);
                $state['promptAt'] = ccrm_tt_iso($promptAt);
                $state['deadlineAt'] = ccrm_tt_iso($deadlineAt);
                $state['phase'] = $nowUtc < $promptAt ? 'tracking' : 'question';
            }
        }
        return $state;
    }

    /**
     * The answer (D7.4, C9): allowed while items run and now < deadlineAt -> anchor = now.
     * Returns ['ok' => true, 'presence' => state] or ['ok' => false, 'code' => 'paused'|'not_running', 'presence' => state].
     */
    function ccrm_tt_presence_confirm(\PDO $pdo, string $userId, string $nowUtc, array $settings): array {
        $ps = ccrm_tt_presence_settings($settings);
        $code = null;
        ccrm_tt_lock_prepare($pdo, $userId);
        try {
            $pdo->beginTransaction();
            ccrm_tt_lock_user($pdo, $userId);
            // Whatever the deadline already decided happens first (no re-lock inside our transaction).
            ccrm_tt_presence_settle($pdo, $userId, $nowUtc, $settings);
            $running = ccrm_tt_running_rows($pdo, $userId);
            if (!$running) {
                $code = ccrm_tt_presence_row($pdo, $userId)['auto_paused_at'] !== null ? 'paused' : 'not_running';
            } else {
                [, , $deadlineAt] = ccrm_tt_presence_cycle(ccrm_tt_presence_row($pdo, $userId)['anchor_at'], $running, $ps);
                if ($ps['enabled'] && $deadlineAt !== null && $nowUtc >= $deadlineAt) {
                    $code = 'paused'; // unreachable after settle; kept as the rule
                } else {
                    ccrm_tt_presence_touch($pdo, $userId, $nowUtc, true);
                }
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        $state = ccrm_tt_presence_state($pdo, $userId, $settings, $nowUtc);
        return $code === null ? ['ok' => true, 'presence' => $state] : ['ok' => false, 'code' => $code, 'presence' => $state];
    }
}
