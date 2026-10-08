<?php
/**
 * Shared helpers for the demo seeders in api/demo_seed/.
 *
 * Every module codes against these signatures — change them only together
 * with every module that calls them.
 *
 * Conventions:
 *  - Dates are relative to the install date (today), so a demo installed in
 *    any month opens on recent, plausible data.
 *  - Every seeded row carries an id from demo_id(), i.e. 'demo-<module>-<n>'.
 *    api/wipe_demo.php removes everything with the 'demo-' prefix.
 */

if (!function_exists('demo_d')) {

    /** 'Y-m-d' relative to today. Negative = past. */
    function demo_d(int $dayOffset): string {
        return (new \DateTimeImmutable('today'))->modify(sprintf('%+d days', $dayOffset))->format('Y-m-d');
    }

    /** 'Y-m-d H:i:s' relative to today, at the given 'H:i' (or 'H:i:s'). */
    function demo_dt(int $dayOffset, string $time = '09:00'): string {
        if (!preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $time)) {
            $time = '09:00';
        }
        if (substr_count($time, ':') === 1) {
            $time .= ':00';
        }
        return demo_d($dayOffset) . ' ' . $time;
    }

    /** The three demo user names, in a fixed order. */
    function demo_user_names(): array {
        return ['Alex', 'Sam', 'Jordan'];
    }

    /**
     * ['Alex' => 'u-…', 'Sam' => 'u-…', 'Jordan' => 'u-…'].
     * Ids use the same scheme as setup.php/sync.php: 'u-' . md5(lowercase email).
     * The users table is consulted so a renamed demo user still resolves, but
     * the deterministic id is returned even if the row is missing.
     */
    function demo_user_ids(PDO $pdo): array {
        $ids = [];
        foreach (demo_user_names() as $name) {
            $ids[$name] = 'u-' . md5(strtolower($name) . '@crm.com');
        }
        try {
            $stmt = $pdo->query("SELECT `id`, `email` FROM `users` WHERE `email` IN ('alex@crm.com','sam@crm.com','jordan@crm.com')");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $name = ucfirst(strstr((string)$row['email'], '@', true));
                if (isset($ids[$name])) {
                    $ids[$name] = (string)$row['id'];
                }
            }
        } catch (\Throwable $e) {
            // users table not available — the deterministic ids are still correct.
        }
        return $ids;
    }

    /** Install language from system_settings: 'sk' | 'en' | 'hu', default 'sk'. */
    function demo_lang(PDO $pdo): string {
        try {
            $lang = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
        } catch (\Throwable $e) {
            $lang = false;
        }
        return in_array($lang, ['sk', 'en', 'hu'], true) ? $lang : 'sk';
    }

    /** Pick the text for $lang from ['sk' => …, 'en' => …, 'hu' => …], falling back to 'en'. */
    function demo_t(array $byLang, string $lang): string {
        if (isset($byLang[$lang])) return (string)$byLang[$lang];
        if (isset($byLang['en'])) return (string)$byLang['en'];
        $first = reset($byLang);
        return $first === false ? '' : (string)$first;
    }

    /** Deterministic id 'demo-<module>-<n>' so wipe_demo.php can match by prefix. */
    function demo_id(string $module, int $n): string {
        return 'demo-' . $module . '-' . $n;
    }
}
