<?php
declare(strict_types=1);

/**
 * Recurring Tasks Generator for CCRM.
 *
 * Implements automated server-side generation of tasks from recurring series
 * templates (`task_kind = 'recurring'`).
 *
 * Runs from:
 *   - public/api/cron.php (periodic background cron)
 *   - public/sync.php register_shutdown_function (opportunistic run, throttled to 60s)
 *   - public/sync.php immediately after a sync creating/editing a template or closing/deleting an occurrence.
 *
 * All date calculations use UTC string representations (YYYY-MM-DD) to prevent timezone drift.
 */

if (!defined('CCRM_RECURRING_TASKS_THROTTLE')) {
    define('CCRM_RECURRING_TASKS_THROTTLE', 60);
}

if (!function_exists('ccrm_sql_real_tasks')) {
    function ccrm_sql_real_tasks(string $alias = ''): string {
        $alias = trim($alias);
        if ($alias !== '') {
            $a = trim($alias, '`.');
            return "(`{$a}`.`task_kind` IS NULL)";
        }
        return "(`task_kind` IS NULL)";
    }
}

/**
 * Returns the date of the nth weekday of a given month.
 * $nth <= 0 or > 4 indicates the last occurrence of that weekday in the month.
 * $weekday: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
 * $month: 1 to 12.
 */
function ccrm_recurring_nth_weekday_of_month(int $year, int $month, int $weekday, int $nth): string {
    $firstDayWeekday = (int)date('w', strtotime(sprintf('%04d-%02d-01', $year, $month)));
    $offset = ($weekday - $firstDayWeekday + 7) % 7;
    $daysInMonth = (int)date('t', strtotime(sprintf('%04d-%02d-01', $year, $month)));

    if ($nth <= 0 || $nth > 4) {
        $day = 1 + $offset;
        while ($day + 7 <= $daysInMonth) {
            $day += 7;
        }
        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    $day = 1 + $offset + ($nth - 1) * 7;
    if ($day > $daysInMonth) {
        $day -= 7;
    }
    return sprintf('%04d-%02d-%02d', $year, $month, $day);
}

/**
 * Clamps day of month to the valid range for that month (e.g. 31 -> 28/29 for Feb).
 */
function ccrm_recurring_clamp_day(int $year, int $month, int $day): int {
    $daysInMonth = (int)date('t', strtotime(sprintf('%04d-%02d-01', $year, $month)));
    return min(max($day, 1), $daysInMonth);
}

/**
 * Shifts the scheduled date according to the weekend rule.
 * For daily: 'before' or 'after' means weekdays only.
 * For non-daily: 'before' shifts Sat/Sun to Friday; 'after' shifts Sat/Sun to Monday.
 */
function ccrm_recurring_shift_deadline(string $isoDate, string $weekendRule, string $frequency = 'monthly'): string {
    if ($weekendRule === 'keep') {
        return $isoDate;
    }
    $w = (int)date('w', strtotime($isoDate)); // 0 = Sun, 6 = Sat
    if ($frequency === 'daily') {
        if ($w === 6) {
            return $weekendRule === 'before'
                ? date('Y-m-d', strtotime("{$isoDate} -1 day"))
                : date('Y-m-d', strtotime("{$isoDate} +2 days"));
        }
        if ($w === 0) {
            return $weekendRule === 'before'
                ? date('Y-m-d', strtotime("{$isoDate} -2 days"))
                : date('Y-m-d', strtotime("{$isoDate} +1 day"));
        }
        return $isoDate;
    }

    if ($weekendRule === 'before') {
        if ($w === 6) return date('Y-m-d', strtotime("{$isoDate} -1 day"));
        if ($w === 0) return date('Y-m-d', strtotime("{$isoDate} -2 days"));
    } elseif ($weekendRule === 'after') {
        if ($w === 6) return date('Y-m-d', strtotime("{$isoDate} +2 days"));
        if ($w === 0) return date('Y-m-d', strtotime("{$isoDate} +1 day"));
    }
    return $isoDate;
}

/**
 * Start date (appearance date) = deadline - leadDays.
 */
function ccrm_recurring_start_date(string $deadline, int $leadDays): string {
    $clamped = max(0, min(365, $leadDays));
    return date('Y-m-d', strtotime("{$deadline} -{$clamped} days"));
}

/**
 * Computes next unshifted scheduled date for schedule mode.
 * Returns null if the next date is past $rec['endsOn'].
 */
function ccrm_recurring_next_occurrence(array $rec, ?string $cursor = null): ?string {
    $startsOn = !empty($rec['startsOn']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $rec['startsOn'])
        ? $rec['startsOn']
        : date('Y-m-d');
    $endsOn = !empty($rec['endsOn']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $rec['endsOn'])
        ? $rec['endsOn']
        : null;
    $interval = max(1, (int)($rec['interval'] ?? 1));
    $frequency = $rec['frequency'] ?? 'monthly';
    $config = is_array($rec['config'] ?? null) ? $rec['config'] : [];
    $weekendRule = $rec['weekendRule'] ?? 'keep';

    $candidate = null;

    if ($frequency === 'daily') {
        $weekdaysOnly = ($weekendRule === 'before' || $weekendRule === 'after');
        if ($cursor === null) {
            $cur = $startsOn;
            if ($weekdaysOnly) {
                $w = (int)date('w', strtotime($cur));
                if ($w === 6) $cur = date('Y-m-d', strtotime("{$cur} +2 days"));
                elseif ($w === 0) $cur = date('Y-m-d', strtotime("{$cur} +1 day"));
            }
            $candidate = $cur;
        } else {
            $cur = $cursor;
            if ($weekdaysOnly) {
                for ($i = 0; $i < $interval; $i++) {
                    $cur = date('Y-m-d', strtotime("{$cur} +1 day"));
                    while (in_array((int)date('w', strtotime($cur)), [0, 6], true)) {
                        $cur = date('Y-m-d', strtotime("{$cur} +1 day"));
                    }
                }
            } else {
                $cur = date('Y-m-d', strtotime("{$cur} +{$interval} days"));
            }
            $candidate = $cur;
        }
    } elseif ($frequency === 'weekly') {
        $targetWeekday = ((int)($config['dayOfWeek'] ?? 1) % 7 + 7) % 7;
        $startW = (int)date('w', strtotime($startsOn));
        $offset = ($targetWeekday - $startW + 7) % 7;
        $firstDate = date('Y-m-d', strtotime("{$startsOn} +{$offset} days"));

        if ($cursor === null) {
            $candidate = $firstDate;
        } else {
            if ($cursor < $firstDate) {
                $candidate = $firstDate;
            } else {
                $diffDays = (int)round((strtotime($cursor) - strtotime($firstDate)) / 86400);
                $periodDays = $interval * 7;
                $k = (int)floor($diffDays / $periodDays) + 1;
                $step = $k * $periodDays;
                $candidate = date('Y-m-d', strtotime("{$firstDate} +{$step} days"));
            }
        }
    } elseif ($frequency === 'monthly') {
        $monthlyType = $config['monthlyType'] ?? 'day_of_month';
        $getOcc = function (int $y, int $m) use ($monthlyType, $config): string {
            if ($monthlyType === 'nth_weekday') {
                $dow = ((int)($config['dayOfWeek'] ?? 1) % 7 + 7) % 7;
                $wom = (int)($config['weekOfMonth'] ?? 1);
                return ccrm_recurring_nth_weekday_of_month($y, $m, $dow, $wom);
            }
            $dom = (int)($config['dayOfMonth'] ?? 1);
            $day = ccrm_recurring_clamp_day($y, $m, $dom);
            return sprintf('%04d-%02d-%02d', $y, $m, $day);
        };

        $startY = (int)substr($startsOn, 0, 4);
        $startM = (int)substr($startsOn, 5, 2);

        $firstOcc = $getOcc($startY, $startM);
        if ($firstOcc >= $startsOn) {
            $anchorY = $startY;
            $anchorM = $startM;
        } else {
            $anchorIndex = $startY * 12 + ($startM - 1) + 1;
            $anchorY = (int)floor($anchorIndex / 12);
            $anchorM = ($anchorIndex % 12) + 1;
        }

        $anchorIndex = $anchorY * 12 + ($anchorM - 1);

        if ($cursor === null) {
            $candidate = $getOcc($anchorY, $anchorM);
        } else {
            $cursorY = (int)substr($cursor, 0, 4);
            $cursorM = (int)substr($cursor, 5, 2);
            $cursorIndex = $cursorY * 12 + ($cursorM - 1);
            $diff = $cursorIndex - $anchorIndex;
            $k = max(0, (int)floor($diff / $interval));

            for ($iter = 0; $iter < 1000; $iter++) {
                $curIndex = $anchorIndex + ($k + $iter) * $interval;
                $y = (int)floor($curIndex / 12);
                $m = ($curIndex % 12) + 1;
                $occ = $getOcc($y, $m);
                if ($occ > $cursor) {
                    $candidate = $occ;
                    break;
                }
            }
        }
    } elseif ($frequency === 'yearly') {
        $targetMonth = min(max((int)($config['month'] ?? 1), 1), 12);
        $targetDom = (int)($config['dayOfMonth'] ?? 1);

        $getOcc = function (int $y) use ($targetMonth, $targetDom): string {
            $day = ccrm_recurring_clamp_day($y, $targetMonth, $targetDom);
            return sprintf('%04d-%02d-%02d', $y, $targetMonth, $day);
        };

        $startY = (int)substr($startsOn, 0, 4);
        if ($getOcc($startY) >= $startsOn) {
            $anchorY = $startY;
        } else {
            $anchorY = $startY + 1;
        }

        if ($cursor === null) {
            $candidate = $getOcc($anchorY);
        } else {
            $cursorY = (int)substr($cursor, 0, 4);
            $diff = $cursorY - $anchorY;
            $k = max(0, (int)floor($diff / $interval));

            for ($iter = 0; $iter < 1000; $iter++) {
                $y = $anchorY + ($k + $iter) * $interval;
                $occ = $getOcc($y);
                if ($occ > $cursor) {
                    $candidate = $occ;
                    break;
                }
            }
        }
    }

    if ($candidate !== null && $endsOn !== null && $candidate > $endsOn) {
        return null;
    }
    return $candidate;
}

/**
 * Rule 9: On resume, moves the cursor so that the next occurrence is the first scheduled
 * date on or after the resume date.
 * Returns the new cursor date (string YYYY-MM-DD or null).
 */
function ccrm_recurring_shift_cursor_on_resume(array $rec, string $resumeDate): ?string {
    $firstOcc = ccrm_recurring_next_occurrence($rec, null);
    if ($firstOcc === null || $firstOcc >= $resumeDate) {
        return null;
    }

    $prev = $firstOcc;
    while (true) {
        $next = ccrm_recurring_next_occurrence($rec, $prev);
        if ($next === null || $next >= $resumeDate) {
            return $prev;
        }
        $prev = $next;
    }
}

/**
 * Rule 7: After-completion mode next due date computation.
 */
function ccrm_recurring_next_after_completion(
    string $completedAtDate,
    int $interval,
    string $frequency,
    string $weekendRule
): string {
    $interval = max(1, $interval);
    $y = (int)substr($completedAtDate, 0, 4);
    $m = (int)substr($completedAtDate, 5, 2);
    $d = (int)substr($completedAtDate, 8, 2);

    $scheduled = $completedAtDate;
    if ($frequency === 'daily') {
        $scheduled = date('Y-m-d', strtotime("{$completedAtDate} +{$interval} days"));
    } elseif ($frequency === 'weekly') {
        $days = $interval * 7;
        $scheduled = date('Y-m-d', strtotime("{$completedAtDate} +{$days} days"));
    } elseif ($frequency === 'monthly') {
        $targetIndex = ($y * 12 + $m - 1) + $interval;
        $targetY = (int)floor($targetIndex / 12);
        $targetM = ($targetIndex % 12) + 1;
        $targetD = ccrm_recurring_clamp_day($targetY, $targetM, $d);
        $scheduled = sprintf('%04d-%02d-%02d', $targetY, $targetM, $targetD);
    } elseif ($frequency === 'yearly') {
        $targetY = $y + $interval;
        $targetD = ccrm_recurring_clamp_day($targetY, $m, $d);
        $scheduled = sprintf('%04d-%02d-%02d', $targetY, $m, $targetD);
    }

    return ccrm_recurring_shift_deadline($scheduled, $weekendRule, $frequency);
}

/**
 * Validates and normalizes recurrence JSON payload.
 * Drops unknown keys, clamps interval and leadDays.
 * Preserves server-owned cursor unless explicit resume transition.
 */
function ccrm_recurring_validate_json(array $raw, ?array $stored = null): array {
    $mode = in_array($raw['mode'] ?? '', ['schedule', 'after_completion'], true)
        ? $raw['mode']
        : 'schedule';
    $freq = in_array($raw['frequency'] ?? '', ['daily', 'weekly', 'monthly', 'yearly'], true)
        ? $raw['frequency']
        : 'monthly';
    $interval = min(999, max(1, (int)($raw['interval'] ?? 1)));
    $weekendRule = in_array($raw['weekendRule'] ?? '', ['keep', 'before', 'after'], true)
        ? $raw['weekendRule']
        : 'keep';
    $defaultLead = match ($freq) {
        'daily' => 0,
        'weekly' => 1,
        'yearly' => 14,
        default => 3,
    };
    $leadDays = isset($raw['leadDays']) && is_numeric($raw['leadDays'])
        ? min(365, max(0, (int)$raw['leadDays']))
        : $defaultLead;
    $startsOn = !empty($raw['startsOn']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw['startsOn'])
        ? $raw['startsOn']
        : date('Y-m-d');
    $endsOn = !empty($raw['endsOn']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw['endsOn'])
        ? $raw['endsOn']
        : null;
    $paused = !empty($raw['paused']);

    $cleanConfig = [];
    if (isset($raw['config']) && is_array($raw['config'])) {
        $c = $raw['config'];
        if (isset($c['dayOfWeek'])) $cleanConfig['dayOfWeek'] = ((int)$c['dayOfWeek'] % 7 + 7) % 7;
        if (isset($c['monthlyType']) && in_array($c['monthlyType'], ['day_of_month', 'nth_weekday'], true)) {
            $cleanConfig['monthlyType'] = $c['monthlyType'];
        }
        if (isset($c['dayOfMonth'])) $cleanConfig['dayOfMonth'] = min(31, max(1, (int)$c['dayOfMonth']));
        if (isset($c['weekOfMonth'])) $cleanConfig['weekOfMonth'] = (int)$c['weekOfMonth'];
        if (isset($c['month'])) $cleanConfig['month'] = min(12, max(1, (int)$c['month']));
    }

    $clean = [
        'mode' => $mode,
        'frequency' => $freq,
        'interval' => $interval,
        'config' => $cleanConfig,
        'weekendRule' => $weekendRule,
        'leadDays' => $leadDays,
        'startsOn' => $startsOn,
        'endsOn' => $endsOn,
        'paused' => $paused,
        'lastOccurrence' => $stored['lastOccurrence'] ?? null,
        'lastOccurrenceId' => $stored['lastOccurrenceId'] ?? null,
    ];

    // Rule 9: On resume transition (paused: true -> false), server advances the cursor
    $wasPaused = !empty($stored['paused']);
    if ($wasPaused && !$paused) {
        $clean['lastOccurrence'] = ccrm_recurring_shift_cursor_on_resume($clean, date('Y-m-d'));
    }

    return $clean;
}

/**
 * Main processor: generates new occurrences for recurring tasks.
 * Returns an array summarizing the run.
 */
function ccrm_process_recurring_tasks(PDO $pdo, ?string $onlyTemplateId = null): array {
    $summary = ['checked' => 0, 'created' => 0, 'gated' => 0, 'ended' => 0, 'skipped' => 0];
    $today = date('Y-m-d');

    // Retrieve configured done task states
    $taskStatesRaw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATES'")->fetchColumn();
    $taskStates = json_decode((string)($taskStatesRaw ?: '[]'), true);
    $taskStates = is_array($taskStates) ? array_values($taskStates) : [];
    $isDoneStatus = function ($status) use ($taskStates): bool {
        $st = (string)$status;
        return strtolower($st) === 'done' || ($taskStates && $st === (string)end($taskStates));
    };

    $sql = "SELECT * FROM `tasks` WHERE `task_kind` = 'recurring'"; /* recurring-template: generator fetch templates */
    $params = [];
    if ($onlyTemplateId !== null && $onlyTemplateId !== '') {
        $sql .= " AND `id` = ?";
        $params[] = $onlyTemplateId;
    }
    $sql .= " ORDER BY `deadline` ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $templates = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($templates as $tmpl) {
        $summary['checked']++;
        $tmplId = $tmpl['id'];
        $rec = json_decode((string)($tmpl['recurrence_json'] ?? '{}'), true);
        if (!is_array($rec)) {
            $summary['skipped']++;
            continue;
        }

        // If paused, series creates nothing (Rule 9)
        if (!empty($rec['paused'])) {
            $summary['skipped']++;
            continue;
        }

        // Rule 3: Gate on open occurrence.
        // Series has no open occurrence (open = archived = 0 and status is not done).
        $occStmt = $pdo->prepare(
            "SELECT `id`, `status`, `archived`, `completed_at`, `recurring_occurrence_date`
               FROM `tasks`
              WHERE `recurring_source_id` = ?
              ORDER BY `recurring_occurrence_date` DESC" /* recurring-template: check open occurrence */
        );
        $occStmt->execute([$tmplId]);
        $occurrences = $occStmt->fetchAll(PDO::FETCH_ASSOC);

        $hasOpenOccurrence = false;
        $latestOccurrence = $occurrences[0] ?? null;
        foreach ($occurrences as $occ) {
            $isArchived = intval($occ['archived'] ?? 0) === 1;
            if (!$isArchived && !$isDoneStatus($occ['status'] ?? '')) {
                $hasOpenOccurrence = true;
                break;
            }
        }

        if ($hasOpenOccurrence) {
            $summary['gated']++;
            continue;
        }

        $mode = $rec['mode'] ?? 'schedule';
        $leadDays = (int)($rec['leadDays'] ?? 0);
        $weekendRule = $rec['weekendRule'] ?? 'keep';
        $frequency = $rec['frequency'] ?? 'monthly';

        $scheduledDate = null;
        $shiftedDeadline = null;
        $startDate = null;

        if ($mode === 'after_completion') {
            if ($latestOccurrence !== null) {
                // Next due date = previous completion date + interval
                $compAt = !empty($latestOccurrence['completed_at'])
                    ? substr((string)$latestOccurrence['completed_at'], 0, 10)
                    : $today; // if archived or deleted without completion, use the day generator notices
                $shiftedDeadline = ccrm_recurring_next_after_completion(
                    $compAt,
                    (int)($rec['interval'] ?? 1),
                    $frequency,
                    $weekendRule
                );
                $scheduledDate = $shiftedDeadline;
            } else {
                $startsOn = !empty($rec['startsOn']) ? $rec['startsOn'] : $today;
                $shiftedDeadline = ccrm_recurring_shift_deadline($startsOn, $weekendRule, $frequency);
                $scheduledDate = $startsOn;
            }
            $startDate = ccrm_recurring_start_date($shiftedDeadline, $leadDays);

            if (!empty($rec['endsOn']) && $shiftedDeadline > $rec['endsOn']) {
                $summary['ended']++;
                continue;
            }
        } else {
            // Schedule mode
            $scheduledDate = ccrm_recurring_next_occurrence($rec, $rec['lastOccurrence'] ?? null);
            if ($scheduledDate === null) {
                $summary['ended']++;
                continue;
            }
            $shiftedDeadline = ccrm_recurring_shift_deadline($scheduledDate, $weekendRule, $frequency);
            $startDate = ccrm_recurring_start_date($shiftedDeadline, $leadDays);
        }

        // Update template's deadline and start_date for display/sort in the Recurring tab
        try {
            $updTmplStmt = $pdo->prepare("UPDATE `tasks` SET `deadline` = ?, `start_date` = ? WHERE `id` = ?"); /* recurring-template: update template next due */
            $updTmplStmt->execute([$shiftedDeadline, $startDate, $tmplId]);
        } catch (\Throwable $e) {}

        // Rule 2: No task before its start date
        if ($today < $startDate) {
            $summary['skipped']++;
            continue;
        }

        // Generate occurrence!
        $newTaskId = 'task-' . bin2hex(random_bytes(8));
        $initialStatus = $taskStates[0] ?? 'todo';

        try {
            $pdo->beginTransaction();

            $insStmt = $pdo->prepare(
                "INSERT IGNORE INTO `tasks` (
                    `id`, `title`, `description`, `priority`, `start_date`, `deadline`,
                    `deadline_time`, `status`, `owner`, `created_by`, `related_lead_id`,
                    `related_project_id`, `is_locking`, `archived`, `email_reminders_json`,
                    `requires_conclusion`, `estimate_minutes`, `recurring_source_id`,
                    `recurring_occurrence_date`, `task_kind`
                ) VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, 0, ?,
                    ?, ?, ?,
                    ?, NULL
                )" /* recurring-template: generator inserts occurrence */
            );

            $insStmt->execute([
                $newTaskId,
                $tmpl['title'],
                $tmpl['description'] ?? '',
                $tmpl['priority'] ?? 'medium',
                $startDate,
                $shiftedDeadline,
                $tmpl['deadline_time'] ?? null,
                $initialStatus,
                $tmpl['owner'] ?? '',
                $tmpl['created_by'] ?? 'System',
                $tmpl['related_lead_id'] ?? null,
                $tmpl['related_project_id'] ?? null,
                intval($tmpl['is_locking'] ?? 0),
                $tmpl['email_reminders_json'] ?? null,
                intval($tmpl['requires_conclusion'] ?? 0),
                isset($tmpl['estimate_minutes']) ? (int)$tmpl['estimate_minutes'] : null,
                $tmplId,
                $scheduledDate,
            ]);

            if ($insStmt->rowCount() === 1) {
                // Copy assignees
                $insAss = $pdo->prepare("INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`) SELECT ?, `user_name` FROM `task_assignees` WHERE `task_id` = ?");
                $insAss->execute([$newTaskId, $tmplId]);

                // Copy tags
                $insTags = $pdo->prepare("INSERT IGNORE INTO `task_tags` (`task_id`, `tag_name`) SELECT ?, `tag_name` FROM `task_tags` WHERE `task_id` = ?");
                $insTags->execute([$newTaskId, $tmplId]);

                // Update template's cursor in recurrence_json
                $rec['lastOccurrence'] = $scheduledDate;
                $rec['lastOccurrenceId'] = $newTaskId;

                // Compute next dates for template display
                $nextScheduled = ccrm_recurring_next_occurrence($rec, $scheduledDate);
                $nextTmplDeadline = $nextScheduled !== null
                    ? ccrm_recurring_shift_deadline($nextScheduled, $weekendRule, $frequency)
                    : $shiftedDeadline;
                $nextTmplStart = $nextScheduled !== null
                    ? ccrm_recurring_start_date($nextTmplDeadline, $leadDays)
                    : $startDate;

                $updRecStmt = $pdo->prepare(
                    "UPDATE `tasks`
                        SET `recurrence_json` = ?, `deadline` = ?, `start_date` = ?
                      WHERE `id` = ?" /* recurring-template: advance template cursor */
                );
                $updRecStmt->execute([
                    json_encode($rec, JSON_UNESCAPED_UNICODE),
                    $nextTmplDeadline,
                    $nextTmplStart,
                    $tmplId,
                ]);

                $pdo->commit();
                $summary['created']++;

                // Trigger side effects outside the transaction
                try {
                    require_once __DIR__ . '/workflows_engine.php';
                    require_once __DIR__ . '/task_reminders.php';
                    require_once __DIR__ . '/webpush.php';

                    $taskPayload = [
                        'id' => $newTaskId,
                        'title' => $tmpl['title'],
                        'description' => $tmpl['description'] ?? '',
                        'priority' => $tmpl['priority'] ?? 'medium',
                        'startDate' => $startDate,
                        'deadline' => $shiftedDeadline,
                        'deadlineTime' => $tmpl['deadline_time'] ?? null,
                        'status' => $initialStatus,
                        'owner' => $tmpl['owner'] ?? '',
                        'relatedLeadId' => $tmpl['related_lead_id'] ?? null,
                        'relatedProjectId' => $tmpl['related_project_id'] ?? null,
                        'isLocking' => intval($tmpl['is_locking'] ?? 0) === 1,
                        'requiresConclusion' => intval($tmpl['requires_conclusion'] ?? 0) === 1,
                        'recurringSourceId' => $tmplId,
                        'recurringOccurrenceDate' => $scheduledDate,
                    ];

                    if (function_exists('ccrm_trigger_workflow')) {
                        ccrm_trigger_workflow('task_created', $taskPayload, $pdo);
                    }
                    if (function_exists('ccrm_send_task_assigned_email_notification')) {
                        ccrm_send_task_assigned_email_notification($pdo, $taskPayload, 'System');
                    }
                    if (function_exists('ccrm_send_task_assigned_push_notification')) {
                        ccrm_send_task_assigned_push_notification($pdo, $taskPayload, 'System');
                    }
                } catch (\Throwable $e) {
                    error_log('[ccrm recurring tasks side-effects] ' . $e->getMessage());
                }
            } else {
                $pdo->rollBack();
            }
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[ccrm recurring tasks error] ' . $tmplId . ': ' . $e->getMessage());
        }
    }

    return $summary;
}

/**
 * Throttled opportunistic run triggered from sync.php.
 * Throttled to once per CCRM_RECURRING_TASKS_THROTTLE (60s) across all open browsers.
 */
function ccrm_maybe_process_recurring_tasks(PDO $pdo): ?array {
    $fh = null;
    try {
        $file = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'ccrm-recurring-tasks-' . md5(__DIR__) . '.stamp';
        $fh = @fopen($file, 'c+');
        if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) {
            return null; // Another request is currently running it
        }
        $last = (int)stream_get_contents($fh);
        if (time() - $last < CCRM_RECURRING_TASKS_THROTTLE) {
            return null;
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, (string)time());
        fflush($fh);
        return ccrm_process_recurring_tasks($pdo);
    } catch (\Throwable $e) {
        error_log('[ccrm recurring tasks throttle] ' . $e->getMessage());
        return null;
    } finally {
        if ($fh) {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}
