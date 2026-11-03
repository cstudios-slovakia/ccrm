<?php
/**
 * Demo data seeding: the runner, the module order and the MODULE-AUTHOR CONTRACT.
 *
 * Read this header and you can write a content module without reading anything else.
 * The plan and the story are in docs/DEMO-MODE.md (Part C = spec, Part D = story).
 *
 * ---------------------------------------------------------------------------------
 * 1. What runs
 * ---------------------------------------------------------------------------------
 * demo_seed_all($pdo, $options = []) runs the modules of demo_seed_modules() in that
 * order and returns a per-module report:
 *
 *     ['company' => ['ok' => true, 'rows' => 7, 'error' => null], 'clients' => [...], ...]
 *
 * A module whose file does not exist yet is SKIPPED (`'skipped' => true`), so this list
 * is final and no phase ever edits it. One failing module is reported and logged
 * without stopping the others: a broken sample dataset must never break an install.
 * It then writes the DEMO_DATASET setting (C8: version, language, currency, seededAt,
 * rows per module). Options: 'only' => ['clients', ...] (default: all),
 * 'resetCompany' => bool (default true; read by `company` through demo_option()),
 * 'writeDataset' => bool (default true unless 'only' is given).
 *
 * Call it OUTSIDE a transaction. The runner opens one transaction per module; a
 * failure rolls that module back. A module that runs DDL (CREATE TABLE) breaks that,
 * because MySQL commits DDL implicitly - then the runner deletes the module's own rows
 * by id prefix instead (demo_seed_module_prefixes()).
 *
 * NEVER call this from ccrm_apply_schema()/migrations: those run on every request.
 *
 * ---------------------------------------------------------------------------------
 * 2. A module = a code file + three packs
 * ---------------------------------------------------------------------------------
 *   demo_seed/<module>.php            code only: reads its pack, writes rows
 *   demo_seed/packs/sk/<module>.php   `return [ ... ];`  data only
 *   demo_seed/packs/hu/<module>.php   (same shape)
 *   demo_seed/packs/en/<module>.php   (same shape)
 *
 * The code file defines `function demo_seed_<module>(PDO $pdo): int` and returns the
 * number of rows it INSERTED (updates do not count). It must be idempotent: delete its
 * own `demo-<module>-%` rows first, then insert. It requires './helpers.php' (which
 * pulls in context.php, packs.php) and './lookup.php' if it needs states/sources.
 *
 * Backend files are edited in public/ only. `npm run sync:backend` mirrors a file that
 * already has a copy under the repo root (api/demo_seed/...), but it does NOT create one:
 * the first time you add a module file or a pack, copy it once to the same path under
 * api/ (`cp public/api/demo_seed/x.php api/demo_seed/x.php`), or installs served from the
 * repo root will not find it. test:demo-seed fails while a mirror file is missing or differs.
 *
 * Pack rules (enforced by `npm run test:demo-packs`):
 *  - `return [...]` of plain data. No function calls, no require, no conditionals, no
 *    variables, no constants. Comments and heredocs are fine.
 *  - Identical shape in sk/hu/en: same keys, list lengths, value types and numbers.
 *    Only STRINGS differ. Adding a key to one language and not the others fails.
 *  - The cast is referred to by REF, never by name or id: 'client' => 'C1',
 *    'owner' => 'sales', 'project' => 'P3'. These keys always hold refs (or a list
 *    of refs in 'assignees'/'users'): client, project, item, supplier, warehouse,
 *    employee, user, owner, assignee, assignees, users. The test resolves each one.
 *  - Amounts are EUR numbers ('priceEur' => 185.0, 'unit_price' => 24.5); amounts
 *    inside a sentence are {m:185}. Never write a currency symbol or a converted figure.
 *  - Dates are day offsets from today ('day' => -12), times are 'HH:MM'.
 *  - A deliberately foreign record (the German architect, the Czech/Austrian/Canadian
 *    retailer) carries '_foreign' => true; the leakage check skips its proper nouns.
 *  - A text longer than 25 characters that is identical in all three languages is
 *    reported as untranslated (URLs, e-mail addresses and SKU-like codes are exempt).
 *  - Slovak letters (ľ ĺ ŕ ť ď ň ô ä), Hungarian ő/ű, legal-form words (s.r.o., Kft.,
 *    Inc., LLC, Ing., Mgr.) and phone prefixes (+421 / +36 / +1) must not leak into
 *    the wrong edition (C6).
 *
 * ---------------------------------------------------------------------------------
 * 3. Refs and ids (C3) - demo_ref_id() owns this table, nothing else hardcodes it
 * ---------------------------------------------------------------------------------
 *   C1-C6  clients            demo-clients-1 ... -6       (a client is a `leads` row)
 *   L7-L11 leads              demo-clients-7 ... -11
 *   P1-P5  projects           demo-projects-1 ... -5      PT: project type demo-projects-0
 *   E1-E6  employees          demo-employees-1 ... -6
 *   I1-I8  items              demo-warehouse-101 ... -108
 *   S1-S3  suppliers          demo-warehouse-201 ... -203
 *   W1-W2  warehouses         demo-warehouse-1, -2
 *   owner | pm | sales        the three logins, 'u-' . md5(lowercase e-mail)
 * Every other row you create is 'demo-<module>-<n>' (demo_id('tasks', 3)). Every
 * seeded row has a demo- id (B7); the exceptions are tables keyed by something else
 * (users, whatsapp numbers, the mailbox store) - list them in your assertion file.
 *
 * ---------------------------------------------------------------------------------
 * 4. The toolbox
 * ---------------------------------------------------------------------------------
 *   context.php   demo_ctx($pdo) -> lang, currency, country, vatRates, vatDefault,
 *                 holidayCountry, ...   demo_ctx_reset()
 *                 demo_money($eur)        EUR -> chosen currency, "nice" rounded (C4)
 *                 demo_money_salary($eur) salaries: rounded to 10 (100 for HUF/CZK)
 *                 demo_money_minor($v)    round a COMPUTED figure (totals, VAT)
 *                 demo_money_fmt($amount) "180 €", "72 000 Ft", "$198"
 *                 demo_text($s)           placeholders (below)   demo_text_deep($array)
 *                 demo_option($key, $default)   options of this run
 *   packs.php     demo_pack($pdo, 'tasks')   demo_ref($pdo, 'C1')   demo_ref_id('C1')
 *   helpers.php   demo_d($day) / demo_dt($day, 'HH:MM')   demo_id($module, $n)
 *                 demo_users($pdo) / demo_user_ids($pdo) / demo_user_names($pdo)
 *                 demo_wipe_by_prefix()   demo_legacy_ids()   demo_all_user_emails()
 *   lookup.php    demo_lead_states()  demo_task_states()  demo_lead_sources()
 *                 demo_divisions()  demo_table_exists()  demo_row_exists()
 *
 * Totals are ALWAYS computed from converted line items: convert each unit price with
 * demo_money(), keep the quantity, total = demo_money_minor(qty * unit * (1 - discount)),
 * then VAT (demo_ctx()['vatRates']) and the document totals. Never convert a total.
 * Every `currency` column gets demo_ctx($pdo)['currency'].
 *
 * Placeholders in any string a module writes - run it through demo_text() (or
 * demo_text_deep() for a whole row):
 *   {m:1234.5} money      {d:-3} date      {wd:-3} weekday   {company} {brand}
 *   {user:owner} {first:owner}   {client:C1} {contact:C1}   {project:P3}   {item:I2}
 * An unknown placeholder or ref throws; the harness fails on any '{...}' left in a row.
 *
 * Logins (B6): names AND e-mails differ per edition; never write 'Alex' or an e-mail
 * in code. Use demo_users($pdo)['owner']['name'], demo_ref_id('owner'), or
 * demo_user_ids($pdo)['pm'].
 *
 * Do NOT: add DB columns (stop and ask), call ccrm_apply_schema(), seed from a
 * migration, write a hardcoded name, 'Cstudios', 'EUR', 'Alex', or an unconverted money
 * figure, or edit a file another phase owns (docs/DEMO-MODE.md A3).
 *
 * ---------------------------------------------------------------------------------
 * 5. Tests (no database, no Docker - plain `php`)
 * ---------------------------------------------------------------------------------
 *   npm run test:demo-packs   shape parity, leakage, refs, placeholders, IBANs of
 *                             every pack in sk/hu/en
 *   npm run test:demo-seed    runs demo_seed_all() for every module that has all three
 *                             packs, in sk/EUR, hu/HUF, hu/EUR, en/USD, against a
 *                             recording fake PDO (scripts/lib/demo-fake-pdo.php), then
 *                             checks the written rows: demo- ids, currency, no
 *                             placeholders left, leakage, links point at written rows
 *   npm run test:demo-seed:db the same on a real MySQL (CCRM_TEST_DSN, an EMPTY scratch
 *                             database, one edition per run: --combo=hu/EUR)
 *
 * Your module's own assertions go in a NEW file scripts/demo-assert/<module>.php (a file
 * no other phase touches). It returns:
 *
 *   return [
 *     'minRows' => ['leads' => 11, 'timeline_events' => 12],     // table => at least n inserts
 *     'idAllow' => ['whatsapp_numbers' => '/^\d+$/'],            // tables whose ids are not demo-
 *     'check'   => function (DemoFakePdo $db, array $ctx, callable $check): void {
 *         // $db->rows('leads')  all rows written by the whole run, [col => value]
 *         // $check('every offer has items', $ok, 'detail shown on failure');
 *     },
 *   ];
 *
 * The fake PDO understands the common SQL subset (INSERT [IGNORE] / REPLACE / ON DUPLICATE
 * KEY UPDATE, UPDATE ... WHERE, DELETE ... WHERE, simple SELECT, COUNT, information_schema
 * lookups, DDL) and checks every written column against the real CREATE TABLE statements,
 * so an unknown column or a missing NOT NULL value fails here, not in production.
 * Anything it cannot interpret in an UPDATE/DELETE throws; an uninterpretable SELECT
 * returns no rows and is listed as a warning - keep module SQL simple.
 */
require_once __DIR__ . '/helpers.php';

/** The DEMO_DATASET `version`: bump whenever a module is added, so old installs are told to re-seed (C8). */
if (!defined('DEMO_DATASET_VERSION')) {
    define('DEMO_DATASET_VERSION', 2);
}

if (!function_exists('demo_seed_modules')) {

    /**
     * FINAL order (C3): later modules may link to rows created by earlier ones. Modules
     * that do not exist yet are skipped, so no phase ever edits this list.
     */
    function demo_seed_modules(): array {
        return [
            'company',
            'employees',
            'clients',
            'projects',
            'tasks',
            'offers',
            'warehouse',
            'orders',
            'finance',
            'tickets',
            'time',
            'whatsapp',
            'email',
            'meetings',
            'workflows',
            'sai',
        ];
    }

    /** The modules of demo_seed_modules() whose code file exists. */
    function demo_seed_modules_installed(): array {
        return array_values(array_filter(
            demo_seed_modules(),
            static fn(string $m): bool => is_file(__DIR__ . '/' . $m . '.php')
        ));
    }

    /** Id prefixes a module's rows carry; the mail module uses 'demo-mail-'. */
    function demo_seed_module_prefixes(string $module): array {
        return $module === 'email' ? ['demo-email-', 'demo-mail-'] : ['demo-' . $module . '-'];
    }

    /**
     * Run one module all-or-nothing and return what it returned (the row count of a
     * pack-based module, null for a legacy one).
     *
     * The module runs in a transaction, so a failure rolls back everything it
     * wrote. A module that creates tables breaks that: DDL commits implicitly,
     * and what it wrote before the failure is already permanent. For that case
     * the module's own rows are deleted by id prefix instead (the module is
     * idempotent, so a rerun starts clean either way); the empty tables it
     * created stay, which is harmless.
     */
    function demo_seed_run_module(PDO $pdo, string $module, callable $fn) {
        $ownTransaction = !$pdo->inTransaction();
        if ($ownTransaction) {
            $pdo->beginTransaction();
        }
        try {
            $result = $fn($pdo);
            if ($ownTransaction && $pdo->inTransaction()) {
                $pdo->commit();
            }
            return $result;
        } catch (\Throwable $e) {
            if ($ownTransaction) {
                if ($pdo->inTransaction()) {
                    try { $pdo->rollBack(); } catch (\Throwable $ignored) {}
                } else {
                    // A DDL statement committed the transaction part-way.
                    try {
                        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
                        demo_wipe_by_prefix($pdo, demo_seed_module_prefixes($module));
                    } catch (\Throwable $cleanup) {
                        error_log('[ccrm demo_seed] ' . $module . ' cleanup failed: ' . $cleanup->getMessage());
                    } finally {
                        try { $pdo->exec('SET FOREIGN_KEY_CHECKS = 1'); } catch (\Throwable $ignored) {}
                    }
                }
            }
            throw $e;
        }
    }

    /** Write the DEMO_DATASET setting (C8). */
    function demo_seed_write_dataset(PDO $pdo, array $ctx, array $moduleRows): void {
        $dataset = [
            'version' => DEMO_DATASET_VERSION,
            'language' => $ctx['lang'],
            'currency' => $ctx['currency'],
            'seededAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'modules' => (object)$moduleRows,
        ];
        $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES ('DEMO_DATASET', ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        )->execute([json_encode($dataset, JSON_UNESCAPED_UNICODE)]);
    }

    /**
     * Seed every module of demo_seed_modules() and return the per-module report
     * ['module' => ['ok' => bool, 'rows' => int, 'error' => ?string, ('skipped' => true)]].
     * See the header for the options. The context is rebuilt first, so a language or
     * currency that was just written to system_settings is the one that is used.
     */
    function demo_seed_all(PDO $pdo, array $options = []): array {
        $only = isset($options['only']) && is_array($options['only']) ? $options['only'] : null;
        demo_options_set($options);
        demo_ctx_reset();
        $ctx = demo_ctx($pdo);

        $report = [];
        $moduleRows = [];
        foreach (demo_seed_modules() as $module) {
            if ($only !== null && !in_array($module, $only, true)) {
                continue;
            }
            $file = __DIR__ . '/' . $module . '.php';
            $fn = 'demo_seed_' . $module;
            if (!is_file($file)) {
                $report[$module] = ['ok' => true, 'rows' => 0, 'error' => null, 'skipped' => true];
                continue;
            }
            try {
                require_once $file;
                if (!function_exists($fn)) {
                    $report[$module] = ['ok' => true, 'rows' => 0, 'error' => null, 'skipped' => true];
                    continue;
                }
                $result = demo_seed_run_module($pdo, $module, $fn);
                if (is_int($result)) {
                    $rows = $result;
                } else {
                    // A module that predates the row-count contract: count what it left behind.
                    try {
                        $rows = array_sum(demo_count_by_prefix($pdo, demo_seed_module_prefixes($module)));
                    } catch (\Throwable $e) {
                        $rows = 0;
                    }
                }
                $report[$module] = ['ok' => true, 'rows' => $rows, 'error' => null];
                $moduleRows[$module] = $rows;
            } catch (\Throwable $e) {
                error_log('[ccrm demo_seed] ' . $module . ' failed: ' . $e->getMessage());
                $report[$module] = ['ok' => false, 'rows' => 0, 'error' => $e->getMessage()];
            }
        }

        $writeDataset = array_key_exists('writeDataset', $options) ? (bool)$options['writeDataset'] : $only === null;
        if ($writeDataset) {
            try {
                demo_seed_write_dataset($pdo, $ctx, $moduleRows);
            } catch (\Throwable $e) {
                error_log('[ccrm demo_seed] DEMO_DATASET not written: ' . $e->getMessage());
            }
        }
        return $report;
    }
}
