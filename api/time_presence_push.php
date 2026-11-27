<?php
/**
 * Presence pushes of the time tracking module (TT2 D7.5, D8.4, C9): the question, "paused", "stopped" and a
 * silent "cleared". Payload builders are separate from the senders so they can be tested without sending.
 * No action buttons and no token: the user answers inside the app (the notification only opens it).
 */
require_once __DIR__ . '/webpush.php';
require_once __DIR__ . '/time_entries_lib.php';

if (!function_exists('ccrm_tt_push_language')) {
    /** The install language (en, sk, hu), Slovak when unset, like other server-side texts. */
    function ccrm_tt_push_language(?\PDO $pdo): string {
        try {
            if ($pdo) {
                $v = strtolower(trim((string)$pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn()));
                if (in_array($v, ['en', 'sk', 'hu'], true)) {
                    return $v;
                }
            }
        } catch (\Throwable $e) {
        }
        return 'sk';
    }
}

if (!function_exists('ccrm_tt_push_text')) {
    function ccrm_tt_push_text(string $key, string $lang, string $time = ''): string {
        $texts = [
            'question' => ['en' => 'Still working?', 'sk' => 'Stále pracuješ?', 'hu' => 'Még dolgozol?'],
            'pause_at' => ['en' => 'Timers pause at {t}', 'sk' => 'Časovače sa pozastavia o {t}', 'hu' => 'Az időzítők {t}-kor szünetelnek'],
            'paused' => ['en' => 'Paused at {t}', 'sk' => 'Pozastavené o {t}', 'hu' => 'Szüneteltetve: {t}'],
            'stopped' => ['en' => 'Timers stopped at {t}', 'sk' => 'Časovače zastavené o {t}', 'hu' => 'Időzítők leállítva: {t}'],
        ];
        $row = $texts[$key] ?? null;
        if ($row === null) {
            return '';
        }
        return str_replace('{t}', $time, $row[$lang] ?? $row['sk']);
    }
}

if (!function_exists('ccrm_tt_push_clock')) {
    /** "HH:MM" of a UTC "Y-m-d H:i:s" in the company time zone. */
    function ccrm_tt_push_clock(string $utc): string {
        try {
            return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->setTimezone(ccrm_tt_company_tz())->format('H:i');
        } catch (\Throwable $e) {
            return '';
        }
    }
}

if (!function_exists('ccrm_tt_push_build_question')) {
    function ccrm_tt_push_build_question(string $lang, string $deadlineUtc, array $runningTitles): array {
        $titles = array_values(array_filter(array_map(fn($t) => trim((string)$t), $runningTitles), fn($t) => $t !== ''));
        $names = $titles ? $titles[0] . (count($titles) > 1 ? ' +' . (count($titles) - 1) : '') : '';
        $line = ccrm_tt_push_text('pause_at', $lang, ccrm_tt_push_clock($deadlineUtc));
        return [
            'title' => ccrm_tt_push_text('question', $lang),
            'body' => $names !== '' ? $names . "\n" . $line : $line,
            'tag' => 'tt-presence',
            'renotify' => true,
            'requireInteraction' => true,
            'url' => '/#time-tracking',
            'data' => ['url' => '/#time-tracking', 'kind' => 'tt-presence'],
        ];
    }
}

if (!function_exists('ccrm_tt_push_build_notice')) {
    /** $key is 'paused' or 'stopped'. */
    function ccrm_tt_push_build_notice(string $key, string $lang, string $atUtc): array {
        return [
            'title' => ccrm_tt_push_text($key, $lang, ccrm_tt_push_clock($atUtc)),
            'body' => '',
            'tag' => 'tt-presence',
            'renotify' => true,
            'url' => '/#time-tracking',
            'data' => ['url' => '/#time-tracking', 'kind' => 'tt-presence'],
        ];
    }
}

if (!function_exists('ccrm_tt_push_build_cleared')) {
    function ccrm_tt_push_build_cleared(): array {
        return ['data' => ['kind' => 'tt-presence-cleared'], 'silent' => true, 'tag' => 'tt-presence'];
    }
}

if (!function_exists('ccrm_tt_push_question')) {
    function ccrm_tt_push_question(\PDO $pdo, string $userId, string $deadlineUtc, array $runningTitles): int {
        return ccrm_send_push_to_user_id($pdo, $userId, ccrm_tt_push_build_question(ccrm_tt_push_language($pdo), $deadlineUtc, $runningTitles));
    }
}

if (!function_exists('ccrm_tt_push_paused')) {
    function ccrm_tt_push_paused(\PDO $pdo, string $userId, string $pausedAtUtc): int {
        return ccrm_send_push_to_user_id($pdo, $userId, ccrm_tt_push_build_notice('paused', ccrm_tt_push_language($pdo), $pausedAtUtc));
    }
}

if (!function_exists('ccrm_tt_push_stopped')) {
    function ccrm_tt_push_stopped(\PDO $pdo, string $userId, string $atUtc): int {
        return ccrm_send_push_to_user_id($pdo, $userId, ccrm_tt_push_build_notice('stopped', ccrm_tt_push_language($pdo), $atUtc));
    }
}

if (!function_exists('ccrm_tt_push_cleared')) {
    function ccrm_tt_push_cleared(\PDO $pdo, string $userId): int {
        return ccrm_send_push_to_user_id($pdo, $userId, ccrm_tt_push_build_cleared());
    }
}
