<?php
/**
 * Public holidays and working days for Slovakia and Hungary — server side.
 *
 * The statutory rules here are a PORT of src/utils/holidays.ts (same days, same
 * `ruleId`s); the en/sk/hu NAME map lives only in the TypeScript file, the server
 * sends the rule id plus Nager's own names and the browser picks the name.
 *
 * Where the days come from:
 *   1. the `public_holidays` cache table, filled from Nager.Date
 *      (GET https://date.nager.at/api/v3/PublicHolidays/{year}/{SK|HU}, no API key),
 *      keeping only `global: true` entries whose `types` include `Public`;
 *   2. when a year is not cached: one fetch (5 s timeout, https only, no redirects,
 *      the public-host DNS guard of auth.php), then cached;
 *   3. when the API cannot be reached: the built-in rules, flagged `fallback`, and a
 *      failed attempt is remembered for an hour so a dead API never slows every request.
 *
 * NEVER call the fetching functions from the sync.php probe path or from a schema
 * migration. Pricing during a migration uses ccrm_holidays_working_days(... $fetch = false).
 *
 * Hungary's yearly decree days (áthelyezett pihenőnap, ledolgozós szombat) are not in
 * any free machine-readable source, so they are manual overrides in the settings blob
 * (TimeTrackingSettings.holidayOverrides). Do not invent dates here.
 */

require_once __DIR__ . '/auth.php';

if (!function_exists('ccrm_holidays_builtin')) {

    function ccrm_holiday_countries(): array {
        return ['SK', 'HU'];
    }

    /** Western Easter Sunday as Y-m-d. */
    function ccrm_easter_sunday(int $year): string {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;
        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    function ccrm_holiday_add_days(string $date, int $days): string {
        return (new \DateTimeImmutable($date, new \DateTimeZone('UTC')))->modify(($days >= 0 ? '+' : '') . $days . ' day')->format('Y-m-d');
    }

    /** [id, [month, day] | null, easterOffset | null, exceptYears, local name, English name] */
    function ccrm_holiday_rules(string $country): array {
        if ($country === 'SK') {
            return [
                ['new-year', [1, 1], null, [], 'Deň vzniku Slovenskej republiky', 'Day of the Establishment of the Slovak Republic'],
                ['epiphany', [1, 6], null, [], 'Zjavenie Pána', 'Epiphany'],
                ['good-friday', null, -2, [], 'Veľkonočný piatok', 'Good Friday'],
                ['easter-monday', null, 1, [], 'Veľkonočný pondelok', 'Easter Monday'],
                ['labour-day', [5, 1], null, [], 'Sviatok práce', "International Workers' Day"],
                // 241/1993 § 4b: not rest days in 2026 (checked on slov-lex and Nager, 2026-10-26).
                ['victory-day', [5, 8], null, [2026], 'Deň víťazstva nad fašizmom', 'Day of victory over fascism'],
                ['cyril-methodius', [7, 5], null, [], 'Sviatok svätého Cyrila a svätého Metoda', 'St. Cyril and Methodius Day'],
                ['snp', [8, 29], null, [], 'Výročie Slovenského národného povstania', 'Slovak National Uprising anniversary'],
                ['our-lady-sorrows', [9, 15], null, [2026], 'Sedembolestná Panna Mária', 'Day of Our Lady of the Seven Sorrows'],
                ['all-saints', [11, 1], null, [], 'Sviatok Všetkých svätých', "All Saints' Day"],
                ['christmas-eve', [12, 24], null, [], 'Štedrý deň', 'Christmas Eve'],
                ['christmas-day', [12, 25], null, [], 'Prvý sviatok vianočný', 'Christmas Day'],
                ['st-stephen', [12, 26], null, [], 'Druhý sviatok vianočný', "St. Stephen's Day"],
            ];
        }
        if ($country === 'HU') {
            return [
                ['new-year', [1, 1], null, [], 'Újév', "New Year's Day"],
                ['revolution-1848', [3, 15], null, [], 'Nemzeti ünnep', '1848 Revolution Memorial Day'],
                ['good-friday', null, -2, [], 'Nagypéntek', 'Good Friday'],
                ['easter-sunday', null, 0, [], 'Húsvétvasárnap', 'Easter Sunday'],
                ['easter-monday', null, 1, [], 'Húsvéthétfő', 'Easter Monday'],
                ['labour-day', [5, 1], null, [], 'A munka ünnepe', 'Labour Day'],
                ['pentecost-sunday', null, 49, [], 'Pünkösdvasárnap', 'Pentecost'],
                ['whit-monday', null, 50, [], 'Pünkösdhétfő', 'Whit Monday'],
                ['state-foundation', [8, 20], null, [], 'Az államalapítás ünnepe', 'State Foundation Day'],
                ['revolution-1956', [10, 23], null, [], 'Nemzeti ünnep', '1956 Revolution Memorial Day'],
                ['all-saints', [11, 1], null, [], 'Mindenszentek', "All Saints' Day"],
                ['christmas-day', [12, 25], null, [], 'Karácsony', 'Christmas Day'],
                ['st-stephen', [12, 26], null, [], 'Karácsony másnapja', "St. Stephen's Day"],
            ];
        }
        return [];
    }

    /**
     * builtinHolidays(): the statutory days of rest of one country and year from their rules.
     *
     * @return array<int, array{date:string, ruleId:string, localName:string, nameEn:string, source:string}>
     */
    function ccrm_holidays_builtin(string $country, int $year): array {
        $easter = ccrm_easter_sunday($year);
        $days = [];
        foreach (ccrm_holiday_rules($country) as [$id, $fixed, $easterOffset, $exceptYears, $local, $en]) {
            if (in_array($year, $exceptYears, true)) {
                continue;
            }
            $date = $fixed !== null ? sprintf('%04d-%02d-%02d', $year, $fixed[0], $fixed[1]) : ccrm_holiday_add_days($easter, (int)$easterOffset);
            $days[] = ['date' => $date, 'ruleId' => $country . ':' . $id, 'localName' => $local, 'nameEn' => $en, 'source' => 'builtin'];
        }
        usort($days, fn($a, $b) => strcmp($a['date'], $b['date']));
        return $days;
    }

    /**
     * Nager.Date for one country and year, reduced to the days of rest. Null when the API
     * cannot be reached or answers something that is not the expected list.
     * Fetched server-side only, with a short timeout and the egress guard of auth.php.
     */
    function ccrm_holidays_fetch_nager(string $country, int $year): ?array {
        if (!in_array($country, ccrm_holiday_countries(), true) || $year < 2000 || $year > 2100) {
            return null;
        }
        if (!function_exists('curl_init')) {
            return null;
        }
        try {
            ccrm_assert_public_host('date.nager.at');
        } catch (\Throwable $e) {
            return null;
        }
        $ch = curl_init("https://date.nager.at/api/v3/PublicHolidays/{$year}/{$country}");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_USERAGENT => 'CCRM time tracking',
        ]);
        $raw = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (!is_string($raw) || $status !== 200) {
            return null;
        }
        $list = json_decode($raw, true);
        if (!is_array($list)) {
            return null;
        }
        $out = [];
        foreach ($list as $h) {
            if (!is_array($h) || empty($h['date']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$h['date'])) {
                continue;
            }
            if (($h['global'] ?? false) !== true || !in_array('Public', (array)($h['types'] ?? []), true)) {
                continue;
            }
            $out[] = [
                'date' => (string)$h['date'],
                'localName' => mb_substr((string)($h['localName'] ?? ''), 0, 200),
                'nameEn' => mb_substr((string)($h['name'] ?? ''), 0, 200),
            ];
        }
        // An empty list is not an answer worth caching: every country has holidays.
        return $out ?: null;
    }

    /** system_settings flag: when did a fetch for this country and year last fail? */
    function ccrm_holidays_recently_failed(\PDO $pdo, string $country, int $year): bool {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
        $stmt->execute(["HOLIDAYS_FETCH_FAILED_{$country}_{$year}"]);
        $at = $stmt->fetchColumn();
        return $at !== false && (time() - (int)$at) < 3600;
    }

    function ccrm_holidays_mark_failed(\PDO $pdo, string $country, int $year): void {
        $stmt = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        $stmt->execute(["HOLIDAYS_FETCH_FAILED_{$country}_{$year}", (string)time()]);
    }

    /** Replace the cached year with a fresh API answer. */
    function ccrm_holidays_store(\PDO $pdo, string $country, int $year, array $days): void {
        $own = !$pdo->inTransaction();
        if ($own) {
            $pdo->beginTransaction();
        }
        try {
            $del = $pdo->prepare("DELETE FROM `public_holidays` WHERE `country` = ? AND `date` BETWEEN ? AND ? AND `source` = 'api'");
            $del->execute([$country, "{$year}-01-01", "{$year}-12-31"]);
            $ins = $pdo->prepare("INSERT INTO `public_holidays` (`country`, `date`, `local_name`, `name_en`, `source`, `fetched_at`) VALUES (?, ?, ?, ?, 'api', UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE `local_name` = VALUES(`local_name`), `name_en` = VALUES(`name_en`), `source` = VALUES(`source`), `fetched_at` = VALUES(`fetched_at`)");
            foreach ($days as $d) {
                $ins->execute([$country, $d['date'], $d['localName'], $d['nameEn']]);
            }
            if ($own) {
                $pdo->commit();
            }
        } catch (\Throwable $e) {
            if ($own && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** Tag cached or API days with the rule they match, by date (the browser names them from the rule). */
    function ccrm_holidays_attach_rule_ids(array $days, string $country, int $year): array {
        $byDate = [];
        foreach (ccrm_holidays_builtin($country, $year) as $b) {
            $byDate[$b['date']] = $b['ruleId'];
        }
        foreach ($days as &$d) {
            $d['ruleId'] = $byDate[$d['date']] ?? null;
        }
        unset($d);
        return $days;
    }

    /**
     * The holidays of one country and year.
     *
     * @param bool $fetch allow one Nager request when the year is not cached. False in
     *                    migrations and anything on the poll path.
     * @return array{days: array, fallback: bool}
     */
    function ccrm_holidays_year(\PDO $pdo, string $country, int $year, bool $fetch = true): array {
        $country = strtoupper($country);
        $stmt = $pdo->prepare("SELECT `date`, `local_name`, `name_en`, `source` FROM `public_holidays` WHERE `country` = ? AND `date` BETWEEN ? AND ? ORDER BY `date`");
        $stmt->execute([$country, "{$year}-01-01", "{$year}-12-31"]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows && $fetch && !ccrm_holidays_recently_failed($pdo, $country, $year)) {
            $fresh = ccrm_holidays_fetch_nager($country, $year);
            if ($fresh !== null) {
                ccrm_holidays_store($pdo, $country, $year, $fresh);
                $stmt->execute([$country, "{$year}-01-01", "{$year}-12-31"]);
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } else {
                ccrm_holidays_mark_failed($pdo, $country, $year);
            }
        }
        if (!$rows) {
            return ['days' => ccrm_holidays_builtin($country, $year), 'fallback' => true];
        }
        $days = [];
        foreach ($rows as $r) {
            $days[] = ['date' => $r['date'], 'localName' => $r['local_name'], 'nameEn' => $r['name_en'], 'source' => $r['source']];
        }
        return ['days' => ccrm_holidays_attach_rule_ids($days, $country, $year), 'fallback' => false];
    }

    /** holidayCountryFromText(): "Slovakia", "SK", "Maďarsko" ... -> SK | HU, else null. */
    function ccrm_holiday_country_from_text(?string $text): ?string {
        static $aliases = [
            'sk' => 'SK', 'svk' => 'SK', 'slovakia' => 'SK', 'slovensko' => 'SK', 'slovenská republika' => 'SK', 'szlovákia' => 'SK',
            'hu' => 'HU', 'hun' => 'HU', 'hungary' => 'HU', 'magyarország' => 'HU', 'magyarorszag' => 'HU', 'maďarsko' => 'HU',
        ];
        $key = mb_strtolower(trim((string)$text));
        return $key !== '' ? ($aliases[$key] ?? null) : null;
    }

    /**
     * The company's own calendar: the country of COMPANY_BILLING_SETTINGS mapped to SK/HU, else SK.
     * (The front end cannot read that setting without invoice rights, so the server answers.)
     */
    function ccrm_holiday_company_country(\PDO $pdo): string {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'COMPANY_BILLING_SETTINGS'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
            $cfg = is_string($raw) ? json_decode($raw, true) : null;
            return ccrm_holiday_country_from_text(is_array($cfg) ? ($cfg['country'] ?? null) : null) ?? 'SK';
        } catch (\Throwable $e) {
            return 'SK';
        }
    }

    /** Is this Y-m-d a Monday to Friday? */
    function ccrm_holiday_is_weekday(string $date): bool {
        return (int)(new \DateTimeImmutable($date, new \DateTimeZone('UTC')))->format('N') < 6;
    }

    /**
     * Working days of one month: Mon–Fri, minus holidays and extra days off, plus extra
     * working days (the overrides of that country). Vacation and sick days do NOT count
     * against it. Mirrors makeHolidayCalendar().workingDaysInMonth.
     *
     * @param array $overrides list of ['date' => Y-m-d, 'kind' => 'extraDayOff'|'extraWorkingDay']
     */
    function ccrm_holidays_working_days(\PDO $pdo, string $country, int $year, int $month, array $overrides = [], bool $fetch = false): int {
        $holidayDates = [];
        foreach (ccrm_holidays_year($pdo, $country, $year, $fetch)['days'] as $d) {
            $holidayDates[$d['date']] = true;
        }
        $byDate = [];
        foreach ($overrides as $o) {
            if (is_array($o) && isset($o['date'], $o['kind'])) {
                $byDate[(string)$o['date']] = (string)$o['kind'];
            }
        }
        $count = 0;
        $last = (int)(new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month), new \DateTimeZone('UTC')))->format('t');
        for ($day = 1; $day <= $last; $day++) {
            $date = sprintf('%04d-%02d-%02d', $year, $month, $day);
            $kind = $byDate[$date] ?? null;
            if ($kind === 'extraWorkingDay') {
                $count++;
            } elseif ($kind === 'extraDayOff') {
                continue;
            } elseif (!isset($holidayDates[$date]) && ccrm_holiday_is_weekday($date)) {
                $count++;
            }
        }
        return $count;
    }

    /**
     * Monthly refresh for the cron: this year and next, both countries. At most once a
     * calendar month (system_settings HOLIDAYS_LAST_REFRESH holds `YYYY-MM`).
     *
     * @return array{ran: bool, fetched: int, failed: int}
     */
    function ccrm_holidays_refresh_cron(\PDO $pdo, bool $force = false): array {
        $key = date('Y-m');
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'HOLIDAYS_LAST_REFRESH'");
        $stmt->execute();
        if (!$force && $stmt->fetchColumn() === $key) {
            return ['ran' => false, 'fetched' => 0, 'failed' => 0];
        }
        $fetched = 0;
        $failed = 0;
        $year = (int)date('Y');
        foreach (ccrm_holiday_countries() as $country) {
            foreach ([$year, $year + 1] as $y) {
                $fresh = ccrm_holidays_fetch_nager($country, $y);
                if ($fresh === null) {
                    $failed++;
                    continue;
                }
                ccrm_holidays_store($pdo, $country, $y, $fresh);
                $fetched++;
            }
        }
        if ($failed === 0) {
            $mark = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('HOLIDAYS_LAST_REFRESH', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $mark->execute([$key]);
        }
        return ['ran' => true, 'fetched' => $fetched, 'failed' => $failed];
    }
}
