<?php
/**
 * "Notify me by e-mail" reminders for tasks.
 *
 * A task carries `email_reminders_json` — `{"<user name>": "morning"|"1h"|"1d"}`
 * — set from the task drawers. This file works out when each reminder is due
 * and delivers it through the SYSTEM outbound profile (Settings → Integrations,
 * the same one workflow "Send e-mail" actions use).
 *
 * It runs from two places:
 *   - api/cron.php, when the host has a real cron calling it;
 *   - sync.php, opportunistically after a GET has been answered, throttled to
 *     one run a minute across every open browser — so reminders still go out on
 *     an install nobody set a cron up for, as long as someone has the CRM open.
 *
 * `task_reminder_log` makes delivery idempotent: a reminder is claimed with an
 * INSERT IGNORE before it is sent, so two overlapping runs cannot both send it,
 * and moving the task to another date or time earns a fresh reminder.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/mail_broker.php';

if (!defined('CCRM_TASK_REMINDER_MORNING')) {
    /** Local time a "morning of the deadline" reminder goes out. */
    define('CCRM_TASK_REMINDER_MORNING', '08:00');
    /** Seconds between two opportunistic runs triggered from sync.php. */
    define('CCRM_TASK_REMINDER_THROTTLE', 60);
}

/** The reminder choices a task can carry, in the order the UI offers them. */
function ccrm_task_reminder_options(): array {
    return ['morning', '1h', '1d'];
}

/**
 * Clean an incoming `emailReminders` map: user name → known option. Anything
 * else is dropped. Returns the JSON to store, or null when nothing is left.
 */
function ccrm_encode_task_reminders($raw): ?string {
    if (!is_array($raw)) return null;
    $clean = [];
    foreach ($raw as $user => $when) {
        $user = trim((string)$user);
        if ($user === '' || mb_strlen($user) > 100) continue;
        if (!in_array($when, ccrm_task_reminder_options(), true)) continue;
        $clean[$user] = $when;
    }
    return $clean ? json_encode($clean, JSON_UNESCAPED_UNICODE) : null;
}

/** The stored map as the client expects it: an object, or null when empty. */
function ccrm_decode_task_reminders($stored) {
    if ($stored === null || $stored === '') return null;
    $map = json_decode((string)$stored, true);
    if (!is_array($map) || !$map) return null;
    return (object)$map;
}

/**
 * When a reminder is due and when the task itself is due, as local
 * "YYYY-MM-DD HH:MM" strings. A task without a time is due at the end of its
 * day, so "1 hour before" has nothing to count back from and falls back to the
 * morning; "1 day before" goes out the previous day at the task's time (or in
 * the morning when it has none).
 */
function ccrm_task_reminder_schedule(string $deadline, ?string $time, string $when): ?array {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) return null;
    $hasTime = is_string($time) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time);
    $due = DateTimeImmutable::createFromFormat('Y-m-d H:i', $deadline . ' ' . ($hasTime ? $time : '23:59'));
    if (!$due) return null;
    $morning = DateTimeImmutable::createFromFormat('Y-m-d H:i', $deadline . ' ' . CCRM_TASK_REMINDER_MORNING);

    switch ($when) {
        case '1h':
            $at = $hasTime ? $due->modify('-1 hour') : $morning;
            break;
        case '1d':
            $at = ($hasTime ? $due : $morning)->modify('-1 day');
            break;
        case 'morning':
            // A task due before the morning reminder would be late for it.
            $at = ($due <= $morning) ? $due->modify('-1 hour') : $morning;
            break;
        default:
            return null;
    }
    return ['at' => $at->format('Y-m-d H:i'), 'due' => $due->format('Y-m-d H:i'), 'hasTime' => (bool)$hasTime];
}

/** True when the system outbound profile has enough in it to attempt a send. */
function ccrm_system_mail_configured(array $config): bool {
    $provider = $config['emailProvider'] ?? ($config['provider'] ?? 'smtp');
    if ($provider === 'exchange') {
        return ($config['exchMailbox'] ?? '') !== '' && ($config['exchPassword'] ?? '') !== '';
    }
    return ($config['smtpHost'] ?? '') !== '' && intval($config['smtpPort'] ?? 0) > 0;
}

/** Base URL of the CRM for the "Open the CRM" link, from the current request. */
function ccrm_task_reminder_app_url(): string {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($host === '') return '';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $path = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    $path = preg_replace('#/(api|public)$#', '', rtrim($path, '/'));
    return ($https ? 'https' : 'http') . '://' . $host . $path . '/';
}

/** Subject and HTML body of one reminder, in the recipient's language. */
function ccrm_task_reminder_message(array $task, array $schedule, string $lang, ?string $leadName, string $appUrl, string $today): array {
    $t = function (string $en, string $sk, string $hu) use ($lang) {
        return $lang === 'sk' ? $sk : ($lang === 'hu' ? $hu : $en);
    };
    $esc = function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); };

    $dueDate = DateTimeImmutable::createFromFormat('Y-m-d', (string)$task['deadline']);
    $dateLabel = $dueDate ? $dueDate->format('j. n. Y') : (string)$task['deadline'];
    $tomorrow = date('Y-m-d', strtotime($today . ' +1 day'));
    if ($task['deadline'] === $today) {
        $dayWord = $t('today', 'dnes', 'ma');
    } elseif ($task['deadline'] === $tomorrow) {
        $dayWord = $t('tomorrow', 'zajtra', 'holnap');
    } else {
        $dayWord = $dateLabel;
    }
    $when = $schedule['hasTime']
        ? $dayWord . ' ' . $t('at', 'o', '') . ' ' . $task['deadline_time']
        : $dayWord;
    $when = preg_replace('/\s+/', ' ', trim($when));

    $subject = $t('Reminder', 'Pripomienka', 'Emlékeztető') . ': ' . $task['title'] . ' — ' . $when;

    $priority = [
        'high' => $t('High', 'Vysoká', 'Magas'),
        'medium' => $t('Medium', 'Stredná', 'Közepes'),
        'low' => $t('Low', 'Nízka', 'Alacsony'),
    ][$task['priority']] ?? $task['priority'];

    $rows = [
        [$t('Due', 'Termín', 'Határidő'), $dateLabel . ($schedule['hasTime'] ? ' ' . $task['deadline_time'] : '')],
        [$t('Priority', 'Priorita', 'Prioritás'), $priority],
        [$t('Status', 'Stav', 'Állapot'), $task['status']],
    ];
    if ($leadName) {
        $rows[] = [$t('Client', 'Klient', 'Ügyfél'), $leadName];
    }

    $html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b">'
        . '<p style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:0 0 8px">'
        . $esc($t('Task reminder', 'Pripomienka úlohy', 'Feladat emlékeztető')) . '</p>'
        . '<h2 style="font-size:20px;margin:0 0 4px">' . $esc($task['title']) . '</h2>'
        . '<p style="font-size:14px;margin:0 0 16px;color:#4f46e5;font-weight:bold">' . $esc(mb_strtoupper(mb_substr($when, 0, 1)) . mb_substr($when, 1)) . '</p>'
        . '<table style="font-size:14px;border-collapse:collapse;margin:0 0 16px">';
    foreach ($rows as [$label, $value]) {
        $html .= '<tr><td style="padding:4px 16px 4px 0;color:#64748b">' . $esc($label) . '</td>'
            . '<td style="padding:4px 0;font-weight:bold">' . $esc($value) . '</td></tr>';
    }
    $html .= '</table>';
    if (trim((string)($task['description'] ?? '')) !== '') {
        $html .= '<p style="font-size:14px;line-height:1.5;margin:0 0 16px">' . nl2br($esc($task['description'])) . '</p>';
    }
    if ($appUrl !== '') {
        $html .= '<p style="margin:0 0 16px"><a href="' . $esc($appUrl) . '" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:bold">'
            . $esc($t('Open the CRM', 'Otvoriť CRM', 'CRM megnyitása')) . '</a></p>';
    }
    $html .= '<p style="font-size:12px;color:#94a3b8;margin:0">'
        . $esc($t(
            'You receive this because you turned on an e-mail reminder for this task.',
            'Tento e-mail dostávate, pretože ste si pri úlohe zapli upozornenie e-mailom.',
            'Azért kapja ezt, mert e-mail emlékeztetőt kapcsolt be ehhez a feladathoz.'
        ))
        . '</p></div>';

    return [$subject, $html];
}

/**
 * Send every reminder that is due now. Returns a summary for cron output and
 * tests. `$now` is a local "YYYY-MM-DD HH:MM" override for tests.
 */
function ccrm_process_task_reminders(PDO $pdo, ?string $now = null): array {
    $summary = ['sent' => 0, 'failed' => 0, 'skipped' => null];
    $now = $now ?? date('Y-m-d H:i');
    $today = substr($now, 0, 10);
    $tomorrow = date('Y-m-d', strtotime($today . ' +1 day'));

    $config = ccrm_load_integrations_config($pdo);
    if (!ccrm_system_mail_configured($config)) {
        $summary['skipped'] = 'Outgoing mail server is not configured.';
        return $summary;
    }

    $settings = [];
    foreach ($pdo->query("SELECT `key`, `value` FROM `system_settings` WHERE `key` IN ('TASK_STATES', 'SYSTEM_LANGUAGE')") as $row) {
        $settings[$row['key']] = $row['value'];
    }
    $taskStates = json_decode($settings['TASK_STATES'] ?? '[]', true) ?: [];
    $lastState = $taskStates ? (string)end($taskStates) : null;
    $systemLang = $settings['SYSTEM_LANGUAGE'] ?? 'sk';

    // A "1 day before" reminder for a task due tomorrow can be due today; nothing
    // further out can be.
    $stmt = $pdo->prepare(
        "SELECT t.`id`, t.`title`, t.`description`, t.`priority`, t.`status`, t.`deadline`, t.`deadline_time`,
                t.`email_reminders_json`, l.`name` AS lead_name
           FROM `tasks` t
           LEFT JOIN `leads` l ON l.`id` = t.`related_lead_id`
          WHERE t.`archived` = 0
            AND t.`email_reminders_json` IS NOT NULL AND t.`email_reminders_json` <> ''
            AND t.`deadline` BETWEEN ? AND ?"
    );
    $stmt->execute([$today, $tomorrow]);
    $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!$tasks) return $summary;

    $users = [];
    foreach ($pdo->query("SELECT `name`, `email`, `metadata_json` FROM `users`") as $u) {
        $meta = json_decode((string)($u['metadata_json'] ?? ''), true);
        $lang = is_array($meta) ? ($meta['language'] ?? null) : null;
        $users[$u['name']] = [
            'email' => (string)$u['email'],
            'lang' => in_array($lang, ['en', 'sk', 'hu'], true) ? $lang : $systemLang,
        ];
    }

    $appUrl = ccrm_task_reminder_app_url();
    $claim = $pdo->prepare("INSERT IGNORE INTO `task_reminder_log` (`task_id`, `user_name`, `scheduled_for`, `status`) VALUES (?, ?, ?, 'sending')");
    $finish = $pdo->prepare("UPDATE `task_reminder_log` SET `status` = ?, `error` = ? WHERE `task_id` = ? AND `user_name` = ? AND `scheduled_for` = ?");

    foreach ($tasks as $task) {
        $status = (string)$task['status'];
        if (strtolower($status) === 'done' || ($lastState !== null && $status === $lastState)) continue;
        $map = json_decode((string)$task['email_reminders_json'], true);
        if (!is_array($map)) continue;

        foreach ($map as $userName => $when) {
            $schedule = ccrm_task_reminder_schedule((string)$task['deadline'], $task['deadline_time'] ?? null, (string)$when);
            // Due, and the task not yet past — a reminder for something already
            // over (cron down for a day, say) is noise, not help.
            if (!$schedule || $now < $schedule['at'] || $now >= $schedule['due']) continue;
            $recipient = $users[$userName] ?? null;
            if (!$recipient || !filter_var($recipient['email'], FILTER_VALIDATE_EMAIL)) continue;

            $claim->execute([$task['id'], $userName, $schedule['at']]);
            if ($claim->rowCount() === 0) continue; // already sent, or another run has it

            try {
                [$subject, $html] = ccrm_task_reminder_message($task, $schedule, $recipient['lang'], $task['lead_name'] ?? null, $appUrl, $today);
                ccrm_send_system_mail($config, $recipient['email'], $subject, $html);
                $finish->execute(['sent', null, $task['id'], $userName, $schedule['at']]);
                $summary['sent']++;
            } catch (\Throwable $e) {
                // Kept as failed rather than retried every minute until the task
                // is due, which would hammer a misconfigured server.
                $finish->execute(['failed', mb_substr($e->getMessage(), 0, 500), $task['id'], $userName, $schedule['at']]);
                $summary['failed']++;
                error_log('[ccrm task reminders] ' . $task['id'] . ' → ' . $userName . ': ' . $e->getMessage());
            }
        }
    }
    return $summary;
}

/**
 * Run the reminders at most once per CCRM_TASK_REMINDER_THROTTLE seconds across
 * all requests. The stamp lives in a lock file rather than `system_settings`:
 * that table is part of sync.php's data-version checksum, so touching it every
 * minute would make every open browser refetch the whole dataset. Never throws.
 */
function ccrm_maybe_process_task_reminders(PDO $pdo): void {
    $fh = null;
    try {
        $file = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'ccrm-task-reminders-' . md5(__DIR__) . '.stamp';
        $fh = @fopen($file, 'c+');
        if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) return; // another request is on it
        $last = (int)stream_get_contents($fh);
        if (time() - $last < CCRM_TASK_REMINDER_THROTTLE) return;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, (string)time());
        fflush($fh);
        ccrm_process_task_reminders($pdo);
    } catch (\Throwable $e) {
        error_log('[ccrm task reminders] ' . $e->getMessage());
    } finally {
        if ($fh) {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}
