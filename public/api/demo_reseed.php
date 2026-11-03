<?php
/**
 * Re-seed the demo data (Settings > Reset data > Re-seed demo data, and `php ccrm demo:seed`).
 *
 * One function, three callers: demo_reseed_run() wipes the demo rows of every edition
 * (demo_seed/wipe.php), switches the install to the chosen language and currency, and
 * runs every demo module (demo_seed/index.php). The HTTP handler at the bottom, the
 * `ccrm demo:seed` CLI command and the retired api/seed_demo_data.php all call it, so
 * a re-seed behaves the same wherever it is started.
 *
 * HTTP (admin + `system_reset` permission):
 *
 *   GET  ?status=1   -> {success, demoMode, language, currency, dataset, currentVersion,
 *                        modules, missing, unavailable, outdated}
 *   POST {language: 'sk'|'hu'|'en', currency: 'EUR'|..., resetCompany: bool}
 *                    -> {success, language, currency, report, wiped, logins, password, ...}
 *
 * Refused with 409 `not_demo_mode` unless DEMO_MODE = 'true' (the CLI has --force).
 * Every error carries a stable `code`; the UI turns it into a sentence in three languages.
 * The caller's own session is ended after a successful POST: the demo logins were
 * replaced (B6), so the browser lands on the demo login picker.
 *
 * This file is also a library: define CCRM_DEMO_RESEED_LIB before requiring it and the
 * handler does not run.
 */
require_once __DIR__ . '/demo_seed/index.php';
require_once __DIR__ . '/demo_seed/wipe.php';

if (!function_exists('demo_reseed_run')) {

    /** The data languages a demo can be installed in (B3). */
    function demo_reseed_languages(): array {
        return ['sk', 'hu', 'en'];
    }

    function demo_reseed_get_setting(PDO $pdo, string $key): ?string {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
        $stmt->execute([$key]);
        $v = $stmt->fetchColumn();
        return $v === false || $v === null ? null : (string)$v;
    }

    function demo_reseed_put_setting(PDO $pdo, string $key, string $value): void {
        $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        )->execute([$key, $value]);
    }

    /**
     * The modules that have demo rows right now, found from the ids ('demo-<module>-<n>'): one
     * SELECT per id-like column, so it is only used for an install that has no DEMO_DATASET yet.
     * Rows the pre-pack seeders wrote without the prefix (lead-1, emp-1, ...) do not count: they
     * are not part of the current dataset, which is exactly what the notice reports.
     */
    function demo_reseed_present_modules(PDO $pdo, array $modules): array {
        $byPrefix = [];
        foreach ($modules as $m) {
            foreach (demo_seed_module_prefixes($m) as $prefix) {
                $byPrefix[$prefix] = $m;
            }
        }
        $found = [];
        // This is only a probe for the status notice: a table or view it cannot read (a view whose
        // definer is gone, a crashed table) must not fail the whole status call, so it is skipped.
        try {
            $cols = $pdo->query(
                "SELECT `TABLE_NAME` AS t, `COLUMN_NAME` AS c FROM information_schema.COLUMNS
                  WHERE `TABLE_SCHEMA` = DATABASE() AND `DATA_TYPE` IN ('varchar', 'char') AND `COLUMN_NAME` = 'id'"
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return [];
        }
        foreach ($cols as $col) {
            if (count($found) === count($modules)) {
                break;
            }
            $t = str_replace('`', '', (string)$col['t']);
            try {
                $stmt = $pdo->prepare("SELECT `id` FROM `{$t}` WHERE `id` LIKE ? LIMIT 400");
                $stmt->execute(['demo-%']);
                $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
            } catch (\Throwable $e) {
                continue;
            }
            foreach ($ids as $id) {
                foreach ($byPrefix as $prefix => $module) {
                    if (strpos((string)$id, $prefix) === 0) {
                        $found[$module] = true;
                    }
                }
            }
        }
        return array_keys($found);
    }

    /**
     * What the Settings section needs to know. `missing` = modules of demo_seed_modules() that the
     * installed dataset does not list (an install without DEMO_DATASET is probed for demo rows); `unavailable` = modules this code base cannot seed yet (no
     * code file); the notice lists missing minus unavailable, because a re-seed can only add those.
     * `outdated` is true when there is no DEMO_DATASET at all or its version is older than the code's.
     */
    function demo_reseed_status(PDO $pdo): array {
        $raw = demo_reseed_get_setting($pdo, 'DEMO_DATASET');
        $dataset = $raw !== null ? json_decode($raw, true) : null;
        $dataset = is_array($dataset) ? $dataset : null;
        $modules = demo_seed_modules();
        $seeded = $dataset !== null && is_array($dataset['modules'] ?? null)
            ? array_keys($dataset['modules'])
            : demo_reseed_present_modules($pdo, $modules);
        $installed = demo_seed_modules_installed();
        $missing = array_values(array_diff($modules, $seeded));
        $ctx = (function () use ($pdo) { demo_ctx_reset(); return demo_ctx($pdo); })();
        return [
            'demoMode' => demo_reseed_get_setting($pdo, 'DEMO_MODE') === 'true',
            'language' => $ctx['lang'],
            'currency' => $ctx['currency'],
            'dataset' => $dataset,
            'currentVersion' => DEMO_DATASET_VERSION,
            'modules' => $modules,
            'missing' => $missing,
            'unavailable' => array_values(array_diff($modules, $installed)),
            'outdated' => $dataset === null || (int)($dataset['version'] ?? 0) < DEMO_DATASET_VERSION,
        ];
    }

    /**
     * Validate a request. Returns [language, currency, resetCompany] or throws
     * \InvalidArgumentException whose message is the error code.
     */
    function demo_reseed_validate(array $input): array {
        $language = (string)($input['language'] ?? '');
        if (!in_array($language, demo_reseed_languages(), true)) {
            throw new \InvalidArgumentException('invalid_language');
        }
        $currency = strtoupper((string)($input['currency'] ?? ''));
        if (!in_array($currency, demo_currencies(), true)) {
            throw new \InvalidArgumentException('invalid_currency');
        }
        return [$language, $currency, array_key_exists('resetCompany', $input) ? (bool)$input['resetCompany'] : true];
    }

    /**
     * Why a re-seed may not start, as a stable code, or null when it may: it is refused
     * unless DEMO_MODE is on (the CLI's --force overrides that).
     */
    function demo_reseed_refusal(PDO $pdo, bool $force = false): ?string {
        if (!$force && demo_reseed_get_setting($pdo, 'DEMO_MODE') !== 'true') {
            return 'not_demo_mode';
        }
        return null;
    }

    /**
     * Wipe the demo rows, switch language and currency, seed every module.
     *
     * Options: language, currency (validated by the caller), resetCompany (default true:
     * also rewrite the company profile, divisions and the pipeline lists in the new language),
     * forceDemoMode (write DEMO_MODE = true after the wipe; the CLI's --force), only (a list
     * of module names to seed instead of all - the dry-run harness and `--only=`).
     *
     * Runs outside a transaction (the wipe and the runner open their own). Throws only when
     * nothing was deleted yet (a pack that does not load) or the wipe itself failed - a module
     * that fails is reported in `report`, not thrown.
     *
     * Returns ['language', 'currency', 'resetCompany', 'wiped' => [table => rows], 'report' =>
     * [module => ['ok','rows','error',('skipped')]], 'failed' => [modules], 'logins' => [[role,
     * name, email]], 'password', 'loginsReady' => bool].
     */
    function demo_reseed_run(PDO $pdo, array $options): array {
        $language = (string)$options['language'];
        $currency = (string)$options['currency'];
        $resetCompany = array_key_exists('resetCompany', $options) ? (bool)$options['resetCompany'] : true;

        // Fail before anything is deleted: the edition's cast must load.
        demo_company_pack($language);

        // 1. wipe (its own transaction + the DDL step)
        $wiped = demo_wipe_demo_rows($pdo);

        // 2. language, lists, currency
        if (!function_exists('ccrm_default_settings_for_language')) {
            require_once __DIR__ . '/schema.php';
        }
        if (!empty($options['forceDemoMode'])) {
            demo_reseed_put_setting($pdo, 'DEMO_MODE', 'true');
        }
        if ($resetCompany) {
            // Pipeline states, sources, categories, task states and their colours in the new
            // language. The company module then writes the divisions and the profile.
            foreach (ccrm_default_settings_for_language($language) as $key => $value) {
                demo_reseed_put_setting($pdo, (string)$key, (string)$value);
            }
        }
        demo_reseed_put_setting($pdo, 'SYSTEM_LANGUAGE', $language);
        demo_reseed_put_setting($pdo, 'SYSTEM_CURRENCY', $currency);

        // 3. seed
        // DEMO_DATASET is written even for a partial run (`only`): after the wipe it describes
        // exactly what is installed, and the status call then lists the rest as missing.
        $seedOptions = ['resetCompany' => $resetCompany, 'writeDataset' => true];
        if (isset($options['only']) && is_array($options['only'])) {
            $seedOptions['only'] = array_values($options['only']);
        }
        $report = demo_seed_all($pdo, $seedOptions);

        // The demo logins were deleted by the wipe: never leave the instance without them.
        $logins = demo_reseed_logins($pdo);
        if (count($logins) < 3) {
            $retry = demo_seed_all($pdo, ['only' => ['company'], 'resetCompany' => false, 'writeDataset' => false]);
            if (!empty($retry['company']['ok'])) {
                $report['company'] = $retry['company'];
            }
            $logins = demo_reseed_logins($pdo);
        }

        $failed = [];
        foreach ($report as $module => $r) {
            if (empty($r['ok'])) {
                $failed[] = $module;
            }
        }
        return [
            'language' => $language,
            'currency' => $currency,
            'resetCompany' => $resetCompany,
            'wiped' => $wiped,
            'report' => $report,
            'failed' => $failed,
            'logins' => $logins,
            'password' => 'password',
            'loginsReady' => count($logins) === 3,
        ];
    }

    /** The edition's logins that exist in `users` now: [[role, name, email]]. */
    function demo_reseed_logins(PDO $pdo): array {
        demo_ctx_reset();
        $out = [];
        foreach (demo_users($pdo) as $role => $u) {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE `id` = ?");
            $stmt->execute([$u['id']]);
            if ((int)$stmt->fetchColumn() > 0) {
                $out[] = ['role' => $role, 'name' => $u['name'], 'email' => strtolower((string)$u['email'])];
            }
        }
        return $out;
    }

    /** Take the re-seed lock (one at a time). True when taken, or when the database cannot tell. */
    function demo_reseed_lock(PDO $pdo): bool {
        try {
            return (int)$pdo->query("SELECT GET_LOCK('ccrm_demo_reseed', 0)")->fetchColumn() === 1;
        } catch (\Throwable $e) {
            return true;
        }
    }

    function demo_reseed_unlock(PDO $pdo): void {
        try { $pdo->query("SELECT RELEASE_LOCK('ccrm_demo_reseed')")->fetchColumn(); } catch (\Throwable $e) { /* ignore */ }
    }

    /**
     * The command line: `php ccrm demo:seed [--lang=sk|hu|en] [--currency=EUR|...] [--keep-company]
     * [--only=a,b] [--force]`. Language and currency default to the installed ones (a new
     * language alone gets that language's B4 default currency). Refused unless DEMO_MODE is on;
     * --force overrides that and then switches DEMO_MODE on. Prints the wipe counts, one line per
     * module and the new logins. Returns the exit code (0 ok, 1 refused / a module failed, 2 usage).
     */
    function demo_reseed_cli(PDO $pdo, array $args): int {
        $lang = null;
        $currency = null;
        $force = false;
        $resetCompany = true;
        $only = null;
        foreach ($args as $arg) {
            if ($arg === '--force') {
                $force = true;
            } elseif ($arg === '--keep-company') {
                $resetCompany = false;
            } elseif (strpos($arg, '--lang=') === 0) {
                $lang = substr($arg, 7);
            } elseif (strpos($arg, '--currency=') === 0) {
                $currency = substr($arg, 11);
            } elseif (strpos($arg, '--only=') === 0) {
                $only = array_values(array_filter(explode(',', substr($arg, 7))));
            } else {
                fwrite(STDERR, "Unknown option: {$arg}\n");
                fwrite(STDERR, "Usage: php ccrm demo:seed [--lang=sk|hu|en] [--currency=EUR|HUF|CZK|PLN|USD|GBP] [--keep-company] [--only=module,module] [--force]\n");
                return 2;
            }
        }
        $refusal = demo_reseed_refusal($pdo, $force);
        if ($refusal !== null) {
            fwrite(STDERR, "This instance is not in demo mode; refusing to replace its demo data. Pass --force to override.\n");
            return 1;
        }
        $current = demo_reseed_status($pdo);
        $language = $lang ?? $current['language'];
        if ($currency === null) {
            $currency = $lang !== null && $lang !== $current['language'] ? demo_default_currency($language) : $current['currency'];
        }
        try {
            [$language, $currency] = demo_reseed_validate(['language' => $language, 'currency' => $currency]);
        } catch (\InvalidArgumentException $e) {
            fwrite(STDERR, "Invalid " . ($e->getMessage() === 'invalid_language' ? 'language (use sk, hu or en)' : 'currency (use EUR, HUF, CZK, PLN, USD or GBP)') . ".\n");
            return 2;
        }

        echo "Re-seeding the demo data: {$language} / {$currency}" . ($resetCompany ? '' : ' (company profile kept)') . "\n";
        $options = ['language' => $language, 'currency' => $currency, 'resetCompany' => $resetCompany, 'forceDemoMode' => $force];
        if ($only !== null) {
            $options['only'] = $only;
        }
        $result = demo_reseed_run($pdo, $options);
        echo '  removed ' . array_sum($result['wiped']) . ' demo row(s) in ' . count($result['wiped']) . " table(s)\n";
        foreach ($result['report'] as $module => $r) {
            if (!empty($r['skipped'])) {
                echo sprintf("  %-10s not available in this version\n", $module);
            } elseif (empty($r['ok'])) {
                echo sprintf("  %-10s FAILED: %s\n", $module, $r['error']);
            } else {
                echo sprintf("  %-10s %d row(s)\n", $module, $r['rows']);
            }
        }
        if ($result['logins']) {
            echo "Demo logins (password: {$result['password']}):\n";
            foreach ($result['logins'] as $l) {
                echo "  {$l['email']}  ({$l['name']})\n";
            }
        }
        if (!$result['loginsReady']) {
            fwrite(STDERR, "WARNING: the demo logins could not be created; see the company module above.\n");
        }
        return $result['failed'] ? 1 : 0;
    }

    /** The HTTP handler. */
    function demo_reseed_http(): void {
        require_once __DIR__ . '/auth.php';
        require_once __DIR__ . '/read_scope.php';

        header('Content-Type: application/json');
        ccrm_send_cors('GET, POST, OPTIONS');
        $fail = static function (int $status, string $code, string $message) {
            http_response_code($status);
            echo json_encode(['success' => false, 'code' => $code, 'message' => $message]);
            exit;
        };
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method !== 'GET' && $method !== 'POST') {
            $fail(405, 'method', 'Method Not Allowed');
        }

        // SECURITY: this endpoint deletes data - admins with the system_reset permission only.
        $sessionUser = ccrm_require_admin();

        // config.php assigns $pdo/$db_connection_error at top level and get_db_connection()
        // reads them via `global`. Required from inside this function without these
        // declarations they would be this function's locals, the globals would stay null,
        // and every call would throw "Database connection failed: Unknown error" while the
        // database itself is fine (see ccrm_auth_pdo() in auth.php).
        global $pdo, $db_connection_error;

        $configFile = dirname(__DIR__) . '/config.php';
        if (!file_exists($configFile)) {
            $fail(400, 'not_installed', 'CCRM is not installed yet.');
        }
        require_once $configFile;

        try {
            $pdo = get_db_connection();
            ccrm_require_perm($pdo, $sessionUser, 'system_reset', $method === 'POST' ? 'edit' : 'view');
            // Release the session file: a re-seed takes a while and the browser keeps polling.
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }

            if ($method === 'GET') {
                echo json_encode(['success' => true] + demo_reseed_status($pdo));
                exit;
            }

            if (demo_reseed_refusal($pdo) !== null) {
                $fail(409, 'not_demo_mode', 'This instance is not in demo mode.');
            }
            $body = json_decode((string)file_get_contents('php://input'), true);
            try {
                [$language, $currency, $resetCompany] = demo_reseed_validate(is_array($body) ? $body : []);
            } catch (\InvalidArgumentException $e) {
                $fail(400, $e->getMessage(), 'Invalid language or currency.');
            }

            // A closed tab must not stop a re-seed half-way; one at a time.
            @set_time_limit(300);
            ignore_user_abort(true);
            if (!demo_reseed_lock($pdo)) {
                $fail(409, 'busy', 'A re-seed is already running.');
            }
            try {
                $result = demo_reseed_run($pdo, [
                    'language' => $language,
                    'currency' => $currency,
                    'resetCompany' => $resetCompany,
                ]);
            } finally {
                demo_reseed_unlock($pdo);
            }

            // The demo logins were replaced: end this session (and its remembered login) so the
            // browser lands on the demo login picker instead of a user that no longer exists.
            try {
                ccrm_start_session();
                ccrm_destroy_session($pdo);
            } catch (\Throwable $e) { /* the next request fails authentication anyway */ }

            echo json_encode(['success' => true, 'loggedOut' => true] + $result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        } catch (\Throwable $e) {
            if (function_exists('ccrm_log_exception')) {
                ccrm_log_exception($e);
            } else {
                error_log('[ccrm demo_reseed] ' . $e->getMessage());
            }
            if ($method === 'GET') {
                // Reading the status is not a re-seed, and "the re-seed failed" sent whoever hit this
                // looking in the wrong place. The caller is an admin with `system_reset`, so the
                // exception itself goes back: Settings shows it under the Try again link.
                $fail(500, 'status_failed', get_class($e) . ': ' . $e->getMessage());
            }
            $fail(500, 'failed', 'The re-seed failed. Check the server log and run it again.');
        }
        exit;
    }
}

if (!defined('CCRM_DEMO_RESEED_LIB') && PHP_SAPI !== 'cli') {
    demo_reseed_http();
}
