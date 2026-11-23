<?php
/**
 * Time tracking v2, phase 10 (a): the Chrome extension's container and presence
 * (docs/TIME-TRACKING-V2.md D5.6, D7, C9).
 *
 *   ccrm_ttx_presence_payload($pdo, $userId, $settings, $viewer)  {presence: D7.1 state, paused: Entry[] (+pauseExpiresAt)}
 *   ccrm_ttx_confirm($pdo, $userId, $settings)                     the presence answer from the popup ("Still working")
 *   ccrm_ttx_resume($pdo, $user, $device, $body, $settings, $scope) continue one paused item; a switch like the extension's start
 *
 * C9 keeps the question out of notifications; the phase 10 checklist allows the answer inside the
 * popup, so the device key may confirm for its own user, with the session rules: only before the
 * deadline, 409 `paused` after it.
 */

require_once __DIR__ . '/time_presence_lib.php';
require_once __DIR__ . '/time_presence_cron.php';
require_once __DIR__ . '/time_pause_lib.php';

/** The extra fields of the extension `running` payload: the presence state and the live pauses. */
function ccrm_ttx_presence_payload(\PDO $pdo, string $userId, array $settings, array $viewer): array {
    $paused = [];
    foreach (ccrm_tt_paused_rows($pdo, $userId, $settings) as $p) {
        if ($json = ccrm_ttx_entry($pdo, (string)$p['id'], $viewer)) {
            $paused[] = $json + ['pauseExpiresAt' => ccrm_tt_iso(ccrm_tt_pause_expires_at($p, $settings))];
        }
    }
    return [
        'presence' => ccrm_tt_presence_state($pdo, $userId, $settings, ccrm_tt_now_utc()),
        'paused' => $paused,
    ];
}

/**
 * "Still working" from the popup (D7.4): ['ok' => true, 'presence' => state] or
 * ['ok' => false, 'code' => 'paused'|'not_running', 'presence' => state].
 */
function ccrm_ttx_confirm(\PDO $pdo, string $userId, array $settings): array {
    $answer = ccrm_tt_presence_confirm($pdo, $userId, ccrm_tt_now_utc(), $settings);
    if ($answer['ok']) {
        ccrm_tt_push_cleared_later($pdo, $userId); // other devices close the question (D7.5)
    }
    return $answer;
}

/**
 * Resume one paused item from the extension. The extension is a single-timer client (D5.6), so it
 * is always a switch: every running entry stops and a new entry continues the paused one (C8).
 * A running identical target only clears the marker and answers with that entry.
 *
 * @return array{ok: bool, code?: string, status?: int, entry?: array|null, stoppedAll?: array, alreadyRunning?: bool}
 */
function ccrm_ttx_resume(\PDO $pdo, array $user, array $device, array $body, array $settings, array $scope): array {
    $userId = (string)$user['id'];
    if (!ccrm_can($scope, 'time_tracking', 'edit')) {
        return ['ok' => false, 'code' => 'forbidden', 'status' => 403];
    }
    $id = ccrm_tt_nullable_id($body['id'] ?? null);
    if ($id === null) {
        return ['ok' => false, 'code' => 'bad_request', 'status' => 400];
    }
    $viewer = ccrm_ttx_viewer($scope, $userId);
    $employee = ccrm_tt_employee_for_user($pdo, $userId);
    foreach (ccrm_tt_running_rows($pdo, $userId) as $r) {
        ccrm_tt_price($pdo, $userId, $r['entry_date'], null, $settings, true); // the switch may stop these
    }

    $nowUtc = ccrm_tt_now_utc();
    $fail = null;
    $newId = null;
    $alreadyId = null;
    $stopped = [];
    ccrm_tt_presence_watch_answer($pdo, $userId, $settings); // an answer: "cleared" push after the response (D7.5)
    ccrm_tt_lock_prepare($pdo, $userId);
    try {
        $pdo->beginTransaction();
        ccrm_tt_lock_user($pdo, $userId);
        $sel = $pdo->prepare("SELECT * FROM `time_entries` WHERE `id` = ? AND `user_id` = ? AND `deleted_at` IS NULL AND `start_at` IS NOT NULL");
        $sel->execute([$id, $userId]);
        $row = $sel->fetch(\PDO::FETCH_ASSOC) ?: null;
        if (!$row) {
            $fail = ['not_found', 404];
        } elseif (empty($row['paused_at'])) {
            $fail = $row['end_at'] === null ? ['already_running', 409] : ['not_paused', 409];
        } elseif (ccrm_tt_pause_expired($row, $settings, $nowUtc)) {
            ccrm_tt_clear_pause($pdo, (string)$row['id'], ccrm_tt_expire_reason($row)); // stays cleared
            $fail = ['pause_expired', 409];
        } else {
            $running = ccrm_tt_running_rows($pdo, $userId, true);
            if ($same = ccrm_tt_identical_running($running, $row)) {
                ccrm_tt_clear_pause($pdo, (string)$row['id'], null);
                $alreadyId = (string)$same['id'];
            } else {
                $stopped = ccrm_tt_end_entries($pdo, $userId, array_column($running, 'id'), $nowUtc, 'switch', null, null, false);
                if (ccrm_tt_clear_pause($pdo, (string)$row['id'], null)) {
                    $newId = ccrm_tt_new_id();
                    $pdo->prepare(
                        "INSERT INTO `time_entries` (`id`, `user_id`, `recorded_by_user_id`, `employee_id`, `project_id`, `task_id`, `ticket_id`, `description`, `title_snapshot`, `note`, `entry_date`, `start_at`, `billable`, `tags`, `source`, `origin_type`, `origin_id`, `device_id`, `continues_id`)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'extension', ?, ?, ?, ?)"
                    )->execute([
                        $newId, $userId, $userId, $employee['id'] ?? null, $row['project_id'], $row['task_id'], $row['ticket_id'],
                        $row['description'], $row['title_snapshot'], $row['note'], ccrm_tt_local_date($nowUtc), $nowUtc, (int)$row['billable'],
                        $row['tags'] ?? '[]', $row['origin_type'], $row['origin_id'], (string)$device['id'], (string)$row['id'],
                    ]);
                }
                $touched = $stopped;
                if ($newId !== null) {
                    $touched[] = ['id' => $newId, 'user_id' => $userId, 'start_at' => $nowUtc, 'end_at' => null, 'entry_date' => ccrm_tt_local_date($nowUtc)];
                }
                ccrm_tt_settle_rows($pdo, $touched);
            }
            ccrm_tt_presence_touch($pdo, $userId, $nowUtc); // resume: anchor = now (C6)
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    if ($fail !== null) {
        return ['ok' => false, 'code' => $fail[0], 'status' => $fail[1], 'entry' => ccrm_ttx_entry($pdo, $id, $viewer)];
    }
    $stoppedAll = [];
    foreach ($stopped as $old) {
        if ($json = ccrm_ttx_entry($pdo, (string)$old['id'], $viewer)) {
            $stoppedAll[] = $json;
        }
    }
    return [
        'ok' => true,
        'entry' => ccrm_ttx_entry($pdo, $newId ?? $alreadyId ?? $id, $viewer),
        'stoppedAll' => $stoppedAll,
        'alreadyRunning' => $alreadyId !== null,
    ];
}
