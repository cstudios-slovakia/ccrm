<?php
/**
 * Time tracking v2, phase 6 (D6, C8, C17): ending entries, pause markers and their expiry.
 *
 *   ccrm_tt_end_entries($pdo, $userId, $ids, $endUtc, $reason, $pause, $projectId, $settle)
 *       end running entries, record how they ended, optionally leave a pause marker, settle
 *   ccrm_tt_pause_expires_at($row, $settings)     UTC instant after which a pause marker is void
 *   ccrm_tt_pause_expired($row, $settings, $now)  has it passed?
 *   ccrm_tt_expire_reason($row)                   the end_reason an expired pause leaves
 *   ccrm_tt_paused_rows($pdo, $userId, $settings) the user's live paused items; clears expired markers
 *
 * How `end_reason` is filled (D6):
 *  - stop                 -> 'user'
 *  - a switch-start (and a resume that has to switch) stopping items -> 'switch'
 *  - a pause              -> stays NULL: a paused entry has not ended for good, it may be resumed.
 *  - resume of a pause    -> stays NULL on the old entry; the new entry's `continues_id` tells the story.
 *  - stop of a paused item -> 'user' (if still NULL)
 *  - an expired pause     -> manual: 'user' (the person paused and never came back),
 *                            status: 'status', presence: 'presence'.
 *  - status / presence / auto_stop endings proper come with later packages and reuse
 *    ccrm_tt_end_entries().
 * Clearing a marker clears `paused_at` only: `pause_reason` and `resume_until` stay as history
 * (the drawer shows how an entry ended) and let the Undo of a resume put the marker back.
 */

require_once __DIR__ . '/time_entries_lib.php';
require_once __DIR__ . '/time_settle.php';

if (!function_exists('ccrm_tt_end_entries')) {

    /**
     * End the user's running entries $ids at $endUtc (never before each one's start): duration,
     * the frozen cost rate, the billable rate, the project chosen at the moment of stopping, and
     * `end_reason` = $reason (NULL for a pause). With $pause = ['reason' => manual|status|presence,
     * 'until' => ?UTC] the entries keep a resumable marker (`paused_at` = $endUtc).
     *
     * Call inside the transaction, under the owner's lock (time_lock.php); warm the holiday cache
     * first (ccrm_tt_price with fetch). Rows that ended meanwhile are left as they are.
     * Returns the rows as they were before ending (the ones actually ended).
     */
    function ccrm_tt_end_entries(\PDO $pdo, string $userId, array $ids, string $endUtc, ?string $reason, ?array $pause = null, ?string $projectId = null, bool $settle = true): array {
        $ids = array_values(array_unique(array_filter(array_map('strval', $ids), fn($id) => $id !== '')));
        if (!$ids) {
            return [];
        }
        if ($reason !== null && !in_array($reason, ['user', 'switch', 'status', 'presence', 'auto_stop'], true)) {
            throw new \InvalidArgumentException('bad end_reason');
        }
        $pauseReason = null;
        $pauseUntil = null;
        if ($pause !== null) {
            $pauseReason = in_array($pause['reason'] ?? null, ['manual', 'status', 'presence'], true) ? $pause['reason'] : 'manual';
            $pauseUntil = isset($pause['until']) && $pause['until'] !== '' ? (string)$pause['until'] : null;
        }
        $settings = ccrm_tt_load_settings($pdo);
        $effProjExpr = ccrm_tt_eff_project_expr();
        $sel = $pdo->prepare(
            "SELECT te.*, {$effProjExpr} AS `eff_project_id` FROM `time_entries` te"
            . ccrm_tt_entity_joins()
            . " WHERE te.`id` IN (" . implode(',', array_fill(0, count($ids), '?')) . ") AND te.`user_id` = ? AND te.`deleted_at` IS NULL AND te.`start_at` IS NOT NULL AND te.`end_at` IS NULL ORDER BY te.`start_at` ASC, te.`id` ASC"
        );
        $sel->execute(array_merge($ids, [$userId]));
        $rows = $sel->fetchAll(\PDO::FETCH_ASSOC);
        $upd = $pdo->prepare("UPDATE `time_entries` SET `end_at` = ?, `duration_sec` = ?, `project_id` = ?, `employee_id` = ?, `billable_rate` = ?, `cost_rate` = ?, `cost_rate_source` = ?, `cost_rate_basis_days` = ?, `end_reason` = ?, `paused_at` = ?, `pause_reason` = COALESCE(?, `pause_reason`), `resume_until` = ? WHERE `id` = ? AND `end_at` IS NULL");
        $ended = [];
        foreach ($rows as $row) {
            $end = max($endUtc, (string)$row['start_at']);
            $dur = ccrm_tt_seconds_between($row['start_at'], $end);
            $storedProject = $row['task_id'] !== null ? $row['project_id'] : ($projectId ?? $row['project_id']);
            $rateProject = $row['eff_project_id'] ?: $storedProject;
            $price = ccrm_tt_price($pdo, (string)$row['user_id'], $row['entry_date'], $dur, $settings, false);
            $rate = $row['billable_rate'] !== null ? $row['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $rateProject, $row['ticket_id'], (string)$row['entry_date']);
            $upd->execute([
                $end, $dur, $storedProject, $price['employee_id'], $rate, $price['cost_rate'], $price['cost_rate_source'], $price['cost_rate_basis_days'],
                $reason, $pause !== null ? $end : null, $pauseReason, $pause !== null ? $pauseUntil : $row['resume_until'], $row['id'],
            ]);
            if ($upd->rowCount() === 1) {
                $ended[] = $row;
            }
        }
        if ($settle && $ended) {
            ccrm_tt_settle_rows($pdo, $ended); // running until now: covers the ended intervals
        }
        return $ended;
    }

    /** The UTC instant after which a pause marker is void: `resume_until`, else the pause day's autoStopAt (C17). */
    function ccrm_tt_pause_expires_at(array $row, array $settings): string {
        if (!empty($row['resume_until'])) {
            return (string)$row['resume_until'];
        }
        $tz = ccrm_tt_company_tz();
        $pausedAt = (string)($row['paused_at'] ?? $row['end_at'] ?? ccrm_tt_now_utc());
        $day = (new \DateTimeImmutable($pausedAt, new \DateTimeZone('UTC')))->setTimezone($tz)->format('Y-m-d');
        $at = is_string($settings['autoStopAt'] ?? null) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $settings['autoStopAt']) ? $settings['autoStopAt'] . ':59' : '23:59:59';
        return (new \DateTimeImmutable($day . ' ' . $at, $tz))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    function ccrm_tt_pause_expired(array $row, array $settings, ?string $nowUtc = null): bool {
        return ($nowUtc ?? ccrm_tt_now_utc()) > ccrm_tt_pause_expires_at($row, $settings);
    }

    /** The end_reason an expired (never resumed) pause leaves on its entry. */
    function ccrm_tt_expire_reason(array $row): string {
        $r = (string)($row['pause_reason'] ?? '');
        return $r === 'status' || $r === 'presence' ? $r : 'user';
    }

    /** Clear one paused item's marker; `end_reason` is set when given and still NULL. */
    function ccrm_tt_clear_pause(\PDO $pdo, string $id, ?string $endReason): bool {
        $upd = $pdo->prepare("UPDATE `time_entries` SET `paused_at` = NULL, `end_reason` = COALESCE(`end_reason`, ?) WHERE `id` = ? AND `paused_at` IS NOT NULL");
        $upd->execute([$endReason, $id]);
        return $upd->rowCount() === 1;
    }

    /**
     * Every paused item of the user (marker set, not deleted), oldest pause first. Expired markers
     * are cleared on the way (a cheap UPDATE per row, no DDL, no lock needed: idempotent) and left out.
     */
    function ccrm_tt_paused_rows(\PDO $pdo, string $userId, array $settings): array {
        $stmt = $pdo->prepare("SELECT * FROM `time_entries` WHERE `user_id` = ? AND `paused_at` IS NOT NULL AND `deleted_at` IS NULL ORDER BY `paused_at` ASC, `id` ASC");
        $stmt->execute([$userId]);
        $now = ccrm_tt_now_utc();
        $live = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            if (ccrm_tt_pause_expired($row, $settings, $now)) {
                ccrm_tt_clear_pause($pdo, (string)$row['id'], ccrm_tt_expire_reason($row));
                continue;
            }
            $live[] = $row;
        }
        return $live;
    }
}
