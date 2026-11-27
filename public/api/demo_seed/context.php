<?php
/**
 * Demo seed context: language, currency, country, VAT, formats, money and text.
 *
 * What every demo module needs to know about the edition it is writing:
 *
 *   demo_ctx($pdo)              the context (cached per request)
 *   demo_ctx_reset()            forget it (tests, and a re-seed that changed the language)
 *   demo_money($eur)            EUR authored in a pack -> chosen currency, "nice" rounded (C4)
 *   demo_money_fmt($amount)     "180 €", "72 000 Ft", "$198" - the same rule as formatMoney()
 *   demo_text($string)          resolves the {placeholders} of C5 (see the list below)
 *
 * Nothing here writes to the database. demo_ctx() reads two settings
 * (SYSTEM_LANGUAGE, SYSTEM_CURRENCY); every other function is pure given the
 * context. Money, text and ref functions take no PDO on purpose: the runner
 * (demo_seed_all) has already built the context before a module starts.
 *
 * Placeholders accepted by demo_text() (one regex, one switch - keep in sync with
 * docs/DEMO-MODE.md C5 and the module-author contract in index.php):
 *
 *   {m:1234.5}   money: EUR amount, converted + formatted      -> "1 234,5 €" / "493 800 Ft"
 *   {d:-3}       date, today-3, in the edition's format         -> "30. 10. 2026" / "2026. 10. 30." / "Oct 30, 2026"
 *   {wd:-3}      weekday name of that date                      -> "piatok" / "péntek" / "Friday"
 *   {company}    legal name, {brand} the brand                  -> "Lapidea Kft." / "Lapidea"
 *   {user:owner} display name of a login (owner|pm|sales)
 *   {first:owner} given name only - use in greetings
 *   {client:C1}  client/lead name, {contact:C1} its contact person (refs C1-C6, L7-L11)
 *   {project:P3} project name           {item:I2} product name
 *
 * An unknown placeholder or ref throws \InvalidArgumentException.
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/packs.php';

if (!function_exists('demo_ctx')) {

    /** Currencies the demo supports (B4), in the order the installer lists them. */
    function demo_currencies(): array {
        return ['EUR', 'HUF', 'CZK', 'PLN', 'USD', 'GBP'];
    }

    /** Fixed demo rates: 1 EUR in each currency (C4). */
    function demo_money_rates(): array {
        return ['EUR' => 1.0, 'HUF' => 400.0, 'CZK' => 25.0, 'PLN' => 4.3, 'USD' => 1.10, 'GBP' => 0.85];
    }

    /** B4 defaults: sk -> EUR, hu -> HUF, en -> USD. */
    function demo_default_currency(string $lang): string {
        return ['sk' => 'EUR', 'hu' => 'HUF', 'en' => 'USD'][$lang] ?? 'EUR';
    }

    /** Symbol and side, from CURRENCY_OPTIONS in src/utils/currency.ts (HUF added by phase 2 of the plan). */
    function demo_currency_format(string $currency): array {
        $map = [
            'EUR' => ['€', 'suffix'],
            'HUF' => ['Ft', 'suffix'],
            'CZK' => ['Kč', 'suffix'],
            'PLN' => ['zł', 'suffix'],
            'USD' => ['$', 'prefix'],
            'GBP' => ['£', 'prefix'],
        ];
        [$symbol, $position] = $map[$currency] ?? [$currency, 'prefix'];
        return ['symbol' => $symbol, 'position' => $position];
    }

    /** HUF and CZK are shown and rounded without decimals. */
    function demo_currency_whole(string $currency): bool {
        return in_array($currency, ['HUF', 'CZK'], true);
    }

    /**
     * Build a context for ($lang, $currency) without a database. demo_ctx() and the
     * pack tests both go through this, so there is one definition of an edition.
     *
     * Keys: lang, currency, symbol, position, whole (no decimals), rate,
     *       country ('SK'|'HU'|'US'), vatRates, vatDefault,
     *       holidayCountry ('SK'|'HU'|null - B9: the English edition has none),
     *       dateFormat ('sk'|'hu'|'en'), numberLocale ('sk'|'hu').
     */
    function demo_ctx_make(string $lang, string $currency): array {
        if (!in_array($lang, ['sk', 'hu', 'en'], true)) {
            throw new \InvalidArgumentException("demo: unknown language '{$lang}'");
        }
        if (!in_array($currency, demo_currencies(), true)) {
            throw new \InvalidArgumentException("demo: unsupported currency '{$currency}'");
        }
        $format = demo_currency_format($currency);
        $edition = [
            'sk' => ['country' => 'SK', 'vatRates' => [23, 19, 5, 0], 'vatDefault' => 23, 'holiday' => 'SK'],
            'hu' => ['country' => 'HU', 'vatRates' => [27, 18, 5, 0], 'vatDefault' => 27, 'holiday' => 'HU'],
            'en' => ['country' => 'US', 'vatRates' => [8, 0],         'vatDefault' => 8,  'holiday' => null],
        ][$lang];
        return [
            'lang' => $lang,
            'currency' => $currency,
            'symbol' => $format['symbol'],
            'position' => $format['position'],
            'whole' => demo_currency_whole($currency),
            'rate' => demo_money_rates()[$currency],
            'country' => $edition['country'],
            'vatRates' => $edition['vatRates'],
            'vatDefault' => $edition['vatDefault'],
            'holidayCountry' => $edition['holiday'],
            'dateFormat' => $lang,
            // formatMoney() uses sk-SK for English too (A5 #12) - kept on purpose.
            'numberLocale' => $lang === 'hu' ? 'hu' : 'sk',
        ];
    }

    /** The cached context lives in a function-static slot so tests can swap it. */
    function &demo_ctx_slot(): ?array {
        static $ctx = null;
        return $ctx;
    }

    /** Forget the cached context (tests; a re-seed after it changed SYSTEM_LANGUAGE/SYSTEM_CURRENCY). */
    function demo_ctx_reset(): void {
        $slot = &demo_ctx_slot();
        $slot = null;
    }

    /** Pin the context without a database (pack tests, harness). Returns it. */
    function demo_ctx_force(string $lang, string $currency): array {
        $slot = &demo_ctx_slot();
        $slot = demo_ctx_make($lang, $currency);
        return $slot;
    }

    /**
     * The context of this install, read once from system_settings
     * (SYSTEM_LANGUAGE, SYSTEM_CURRENCY) and cached for the rest of the request.
     * A missing/invalid language is 'sk'; a missing/invalid currency is the
     * language's B4 default.
     */
    function demo_ctx(PDO $pdo): array {
        $slot = &demo_ctx_slot();
        if ($slot !== null) {
            return $slot;
        }
        $read = static function (string $key) use ($pdo) {
            try {
                $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
                $stmt->execute([$key]);
                return $stmt->fetchColumn();
            } catch (\Throwable $e) {
                return false;
            }
        };
        $lang = $read('SYSTEM_LANGUAGE');
        $lang = in_array($lang, ['sk', 'hu', 'en'], true) ? $lang : 'sk';
        $currency = $read('SYSTEM_CURRENCY');
        $currency = in_array($currency, demo_currencies(), true) ? $currency : demo_default_currency($lang);
        $slot = demo_ctx_make($lang, $currency);
        return $slot;
    }

    /** The cached context for functions that take no PDO. Throws if nothing built it yet. */
    function demo_ctx_current(): array {
        $slot = &demo_ctx_slot();
        if ($slot === null) {
            throw new \LogicException('demo: no context yet - call demo_ctx($pdo) first (demo_seed_all() does this before every module)');
        }
        return $slot;
    }

    /* ---------------------------------------------------------------------- */
    /* Run options                                                            */
    /* ---------------------------------------------------------------------- */

    /** Options of the current run (demo_seed_all's $options), readable by modules. */
    function &demo_options_slot(): array {
        static $options = [];
        return $options;
    }

    function demo_options_set(array $options): void {
        $slot = &demo_options_slot();
        $slot = $options;
    }

    /** e.g. demo_option('resetCompany', true). */
    function demo_option(string $key, $default = null) {
        $slot = &demo_options_slot();
        return array_key_exists($key, $slot) ? $slot[$key] : $default;
    }

    /* ---------------------------------------------------------------------- */
    /* Money (C4)                                                             */
    /* ---------------------------------------------------------------------- */

    /** Round a converted amount to the "nice" step of C4. */
    function demo_money_round(float $v, string $currency): float {
        $abs = abs($v);
        if (demo_currency_whole($currency)) {
            $step = $abs < 100 ? 1.0 : ($abs < 10000 ? 10.0 : 100.0);
        } else {
            $step = $abs < 100 ? 0.1 : ($abs < 10000 ? 1.0 : 10.0);
        }
        return round(round($v / $step) * $step, 2);
    }

    /** EUR authored in a pack -> the chosen currency, rounded like a human would type it. */
    function demo_money(float $eur): float {
        $ctx = demo_ctx_current();
        return demo_money_round($eur * $ctx['rate'], $ctx['currency']);
    }

    /** Salaries: convert, then round to 10 (100 for HUF/CZK). */
    function demo_money_salary(float $eur): float {
        $ctx = demo_ctx_current();
        $step = $ctx['whole'] ? 100.0 : 10.0;
        return round(round($eur * $ctx['rate'] / $step) * $step, 2);
    }

    /**
     * Round a COMPUTED figure (line total, VAT, document total) to the currency's
     * minor unit - 0 decimals for HUF/CZK, 2 otherwise. Totals are always computed
     * from converted line items and passed through this; never convert a total.
     */
    function demo_money_minor(float $v): float {
        return round($v, demo_ctx_current()['whole'] ? 0 : 2);
    }

    /**
     * A number the way (12345.678).toLocaleString(locale) prints it: NBSP groups,
     * comma decimals, at most $maxDecimals, no trailing zeros. Hungarian only groups
     * from five integer digits (CLDR minimumGroupingDigits = 2): "1234" but "12 345".
     */
    function demo_number_fmt(float $value, int $maxDecimals, string $locale): string {
        $rounded = round($value, $maxDecimals);
        $negative = $rounded < 0;
        $str = number_format(abs($rounded), $maxDecimals, '.', '');
        $int = $str;
        $dec = '';
        if (strpos($str, '.') !== false) {
            [$int, $dec] = explode('.', $str, 2);
            $dec = rtrim($dec, '0');
        }
        $minDigits = $locale === 'hu' ? 5 : 4;
        if (strlen($int) >= $minDigits) {
            $int = preg_replace('/\B(?=(\d{3})+(?!\d))/', "\u{00A0}", $int);
        }
        $out = $int . ($dec !== '' ? ',' . $dec : '');
        return ($negative && (float)$str != 0.0 ? '-' : '') . $out;
    }

    /** Same output as formatMoney(value, currency, language) in src/utils/currency.ts. */
    function demo_money_fmt(float $amount): string {
        $ctx = demo_ctx_current();
        $num = demo_number_fmt($amount, $ctx['whole'] ? 0 : 3, $ctx['numberLocale']);
        return $ctx['position'] === 'suffix' ? $num . ' ' . $ctx['symbol'] : $ctx['symbol'] . $num;
    }

    /* ---------------------------------------------------------------------- */
    /* Dates                                                                  */
    /* ---------------------------------------------------------------------- */

    /** A 'Y-m-d' date in the edition's written format (C5). */
    function demo_date_fmt(string $ymd, string $lang): string {
        $d = new \DateTimeImmutable($ymd);
        if ($lang === 'hu') {
            return $d->format('Y. m. d.');
        }
        if ($lang === 'en') {
            return $d->format('M j, Y');
        }
        return $d->format('j. n. Y');
    }

    /** Weekday name of a 'Y-m-d' date (sk/hu lowercase, en capitalised, as in running text). */
    function demo_weekday_name(string $ymd, string $lang): string {
        $names = [
            'sk' => ['pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota', 'nedeľa'],
            'hu' => ['hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat', 'vasárnap'],
            'en' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        ];
        $n = (int)(new \DateTimeImmutable($ymd))->format('N');
        return $names[$lang][$n - 1];
    }

    /* ---------------------------------------------------------------------- */
    /* Text placeholders (C5)                                                 */
    /* ---------------------------------------------------------------------- */

    /** Every placeholder name demo_text() understands. */
    function demo_text_placeholders(): array {
        return ['m', 'd', 'wd', 'company', 'brand', 'user', 'first', 'client', 'contact', 'project', 'item'];
    }

    /** The cast record a placeholder points at; a ref of the wrong kind ({project:C1}) throws. */
    function demo_text_ref(string $lang, string $placeholder, string $ref, array $kinds): array {
        $kind = demo_ref_kind($ref);
        if ($kind !== null && !in_array($kind, $kinds, true)) {
            throw new \InvalidArgumentException("demo_text: {{$placeholder}:{$ref}} - '{$ref}' is a {$kind} ref, expected " . implode(' or ', $kinds));
        }
        return demo_ref_for($lang, $ref);
    }

    /**
     * Resolve the placeholders in a string. Unknown placeholder, unknown ref or a
     * malformed argument throws \InvalidArgumentException; the module runner catches
     * it and the tests report it. Strings without placeholders pass through untouched.
     */
    function demo_text(string $s): string {
        if (strpos($s, '{') === false) {
            return $s;
        }
        $ctx = demo_ctx_current();
        return preg_replace_callback(
            '/\{([a-z]+)(?::([^{}]*))?\}/',
            static function (array $m) use ($ctx): string {
                $name = $m[1];
                $arg = $m[2] ?? null;
                if (!in_array($name, demo_text_placeholders(), true)) {
                    throw new \InvalidArgumentException("demo_text: unknown placeholder {{$name}} in: {$m[0]}");
                }
                $needArg = !in_array($name, ['company', 'brand'], true);
                if ($needArg && ($arg === null || $arg === '')) {
                    throw new \InvalidArgumentException("demo_text: placeholder {{$name}} needs an argument, e.g. {{$name}:...}");
                }
                if (!$needArg && $arg !== null) {
                    throw new \InvalidArgumentException("demo_text: placeholder {{$name}} takes no argument");
                }
                switch ($name) {
                    case 'm':
                        if (!is_numeric($arg)) {
                            throw new \InvalidArgumentException("demo_text: {m:...} needs a number, got '{$arg}'");
                        }
                        return demo_money_fmt(demo_money((float)$arg));
                    case 'd':
                    case 'wd':
                        if (!preg_match('/^-?\d+$/', $arg)) {
                            throw new \InvalidArgumentException("demo_text: {{$name}:...} needs a whole day offset, got '{$arg}'");
                        }
                        $ymd = demo_d((int)$arg);
                        return $name === 'd' ? demo_date_fmt($ymd, $ctx['lang']) : demo_weekday_name($ymd, $ctx['lang']);
                    case 'company':
                        return (string)demo_company_pack($ctx['lang'])['company']['name'];
                    case 'brand':
                        return (string)demo_company_pack($ctx['lang'])['brand'];
                    case 'user':
                        return (string)demo_text_ref($ctx['lang'], $name, $arg, ['user', 'employee'])['name'];
                    case 'first':
                        return (string)demo_text_ref($ctx['lang'], $name, $arg, ['user', 'employee'])['first'];
                    case 'client':
                        return (string)demo_text_ref($ctx['lang'], $name, $arg, ['client', 'lead'])['name'];
                    case 'contact':
                        return (string)demo_text_ref($ctx['lang'], $name, $arg, ['client', 'lead'])['contact'];
                    case 'project':
                        return (string)demo_text_ref($ctx['lang'], $name, $arg, ['project'])['name'];
                    case 'item':
                        return (string)demo_text_ref($ctx['lang'], $name, $arg, ['item'])['name'];
                }
                throw new \LogicException('demo_text: unreachable');
            },
            $s
        );
    }

    /** demo_text() over every string inside an array/scalar (rows, nested lists). */
    function demo_text_deep($value) {
        if (is_string($value)) {
            return demo_text($value);
        }
        if (is_array($value)) {
            return array_map('demo_text_deep', $value);
        }
        return $value;
    }
}
