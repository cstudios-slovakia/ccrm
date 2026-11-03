<?php
/**
 * Dry run of the demo seed against a recording fake PDO. Plain `php`: no database, no PDO driver.
 * Run:  php scripts/test-demo-seed.php [--only=company,clients] [--combo=hu/EUR] [-v]
 *       (npm run test:demo-seed)
 *
 * What it does (docs/DEMO-MODE.md C9):
 *  1. unit-checks the foundation: demo_money / demo_money_fmt / demo_text / refs / ids / the fake PDO itself
 *  2. for sk/EUR, hu/HUF, hu/EUR and en/USD: runs demo_seed_all() on a fresh DemoFakePdo - only the modules
 *     that have a code file AND all three packs ("ported"; a module still on the old per-string style is
 *     reported as not covered) - then asserts on the rows that were written:
 *       every module ran without an exception            every seeded id starts with demo-  (allowlisted tables aside)
 *       every `currency` column is the chosen currency    no '{placeholder}' left in any written text
 *       the C6 leakage rules hold on the written texts    every *_id link points at a row that was written
 *       a second run leaves the same rows (idempotent)    rows a user created by hand survive both runs
 *       DEMO_DATASET (C8) describes the run               the fake's schema check never fired
 *  3. runs the per-module assertions from scripts/demo-assert/<module>.php (see company.php for the format and
 *     the header of public/api/demo_seed/index.php for the contract).
 *
 * Warnings (a SELECT the fake could not interpret returned no rows) are printed, not failed: they mean a module
 * asked something the dry run cannot answer, so its result there is unverified.
 */

require_once __DIR__ . '/lib/demo-fake-pdo.php';
require_once dirname(__DIR__) . '/public/api/demo_seed/index.php';
require_once dirname(__DIR__) . '/public/api/demo_seed/lookup.php';
require_once __DIR__ . '/test-demo-packs.php';   // lint functions only (its CLI part is guarded)

$verbose = in_array('-v', $argv, true);
$only = null;
$combos = demo_lint_combos();
foreach (array_slice($argv, 1) as $arg) {
    if (strpos($arg, '--only=') === 0) $only = array_filter(explode(',', substr($arg, 7)));
    if (strpos($arg, '--combo=') === 0) {
        [$l, $c] = explode('/', substr($arg, 8)) + [1 => ''];
        $combos = [[$l, $c]];
    }
}

$fails = 0;
$checks = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails, &$checks): void {
    $checks++;
    if (!$ok) $fails++;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . ($ok ? '' : "\n       " . str_replace("\n", "\n       ", $detail)) . "\n";
};
$section = static function (string $title): void { echo "\n== {$title}\n"; };

/** Run $fn; true if it throws (optionally a message containing $needle). */
$throws = static function (callable $fn, string $needle = ''): bool {
    try { $fn(); } catch (\Throwable $e) { return $needle === '' || stripos($e->getMessage(), $needle) !== false; }
    return false;
};

// =================================================================================================
// 1. Foundation unit checks
// =================================================================================================
$section('money (C4)');
$moneyAt = static function (string $lang, string $cur, callable $fn) { demo_ctx_force($lang, $cur); return $fn(); };
$m = static fn(string $cur, float $eur) => $moneyAt('sk', $cur, static fn() => demo_money($eur));
$check('EUR is unchanged', $m('EUR', 185.0) === 185.0 && $m('EUR', 24.5) === 24.5 && $m('EUR', 29.9) === 29.9);
$check('HUF 185 EUR -> 74 000 (to 100 above 10 000)', $m('HUF', 185.0) === 74000.0, (string)$m('HUF', 185.0));
$check('HUF 24.5 EUR -> 9 800 (to 10 between 100 and 10 000)', $m('HUF', 24.5) === 9800.0, (string)$m('HUF', 24.5));
$check('HUF 29.9 EUR -> 11 960 -> 12 000', $m('HUF', 29.9) === 12000.0, (string)$m('HUF', 29.9));
$check('HUF 0.2 EUR -> 80 (to 1 below 100)', $m('HUF', 0.2) === 80.0);
$check('USD 185 EUR -> 203.5 -> 204 (to 1)', $m('USD', 185.0) === 204.0, (string)$m('USD', 185.0));
$check('USD 29.9 EUR -> 32.89 -> 32.9 (to 0.1 below 100)', $m('USD', 29.9) === 32.9, (string)$m('USD', 29.9));
$check('USD 24600 EUR -> 27 060 (to 10)', $m('USD', 24600.0) === 27060.0, (string)$m('USD', 24600.0));
$check('CZK 90 EUR -> 2 250 (to 10)', $m('CZK', 90.0) === 2250.0);
$check('PLN 42 EUR -> 180.6 -> 181 (to 1)', $m('PLN', 42.0) === 181.0, (string)$m('PLN', 42.0));
$check('GBP 185 EUR -> 157.25 -> 157', $m('GBP', 185.0) === 157.0, (string)$m('GBP', 185.0));
$check('zero and negative amounts', $m('HUF', 0.0) === 0.0 && $m('EUR', -185.0) === -185.0 && $m('HUF', -24.5) === -9800.0);
$sal = static fn(string $cur, float $eur) => $moneyAt('sk', $cur, static fn() => demo_money_salary($eur));
$check('salary: EUR 4200 / HUF 1 680 000 / USD 4620 / PLN 18 060 / CZK 105 000', $sal('EUR', 4200) === 4200.0 && $sal('HUF', 4200) === 1680000.0 && $sal('USD', 4200) === 4620.0 && $sal('PLN', 4200) === 18060.0 && $sal('CZK', 4200) === 105000.0);
$check('salary rounds to 10 (EUR/USD/PLN/GBP) and 100 (HUF/CZK)', $sal('USD', 2399.0) === 2640.0 && $sal('HUF', 2399.0) === 959600.0, $sal('USD', 2399.0) . ' / ' . $sal('HUF', 2399.0));
$check('demo_money_minor: 0 decimals for HUF, 2 otherwise', $moneyAt('sk', 'HUF', static fn() => demo_money_minor(1234.56)) === 1235.0 && $moneyAt('sk', 'EUR', static fn() => demo_money_minor(1234.567)) === 1234.57);
$check('no context -> demo_money throws', (function () use ($throws) { $slot = &demo_ctx_slot(); $slot = null; return $throws(fn() => demo_money(1.0), 'no context'); })());

$section('money formatting (same as formatMoney in currency.ts)');
$f = static fn(string $lang, string $cur, float $v) => $moneyAt($lang, $cur, static fn() => demo_money_fmt($v));
$nb = "\u{00A0}";
$check('sk EUR: "180 €"', $f('sk', 'EUR', 180) === '180 €', $f('sk', 'EUR', 180));
$check('sk EUR: grouping and comma decimals "1 234,5 €"', $f('sk', 'EUR', 1234.5) === "1{$nb}234,5 €", $f('sk', 'EUR', 1234.5));
$check('hu HUF: "72 000 Ft" (no decimals)', $f('hu', 'HUF', 72000) === "72{$nb}000 Ft", $f('hu', 'HUF', 72000));
$check('hu HUF: a fraction is dropped, not shown', $f('hu', 'HUF', 9800.4) === "9800 Ft", $f('hu', 'HUF', 9800.4));
$check('hu EUR: Hungarian does not group four digits "1234,5 €"', $f('hu', 'EUR', 1234.5) === '1234,5 €', $f('hu', 'EUR', 1234.5));
$check('hu EUR: groups from five digits "12 345 €"', $f('hu', 'EUR', 12345) === "12{$nb}345 €");
$check('en USD: "$198", prefix symbol, sk-SK separators (A5 #12)', $f('en', 'USD', 198) === '$198' && $f('en', 'USD', 12345.5) === "\$12{$nb}345,5", $f('en', 'USD', 12345.5));
$check('negative amount "-1 500 €"', $f('sk', 'EUR', -1500) === "-1{$nb}500 €", $f('sk', 'EUR', -1500));
$check('GBP prefix, PLN suffix, CZK suffix', $f('sk', 'GBP', 5) === '£5' && $f('sk', 'PLN', 5) === '5 zł' && $f('sk', 'CZK', 5) === '5 Kč');

$section('context and text placeholders (C5)');
$check('demo_ctx_make: editions', demo_ctx_make('sk', 'EUR')['vatRates'] === [23, 19, 5, 0] && demo_ctx_make('hu', 'EUR')['vatDefault'] === 27 && demo_ctx_make('en', 'USD')['vatRates'] === [8, 0]);
$check('holidayCountry: SK, HU, none for en (B9)', demo_ctx_make('sk', 'EUR')['holidayCountry'] === 'SK' && demo_ctx_make('hu', 'HUF')['holidayCountry'] === 'HU' && demo_ctx_make('en', 'USD')['holidayCountry'] === null);
$check('country fixes VAT, currency does not (hu/EUR keeps 27 %)', demo_ctx_make('hu', 'EUR')['vatDefault'] === 27 && demo_ctx_make('hu', 'EUR')['currency'] === 'EUR');
$check('B4 default currencies', demo_default_currency('sk') === 'EUR' && demo_default_currency('hu') === 'HUF' && demo_default_currency('en') === 'USD');
$check('unknown language / currency throw', $throws(fn() => demo_ctx_make('de', 'EUR')) && $throws(fn() => demo_ctx_make('sk', 'JPY')));
$ctxDb = new DemoFakePdo();
$ctxDb->setSetting('SYSTEM_LANGUAGE', 'hu');
demo_ctx_reset();
$check('demo_ctx reads SYSTEM_LANGUAGE; a missing currency falls back to the B4 default (hu -> HUF)', demo_ctx($ctxDb)['lang'] === 'hu' && demo_ctx($ctxDb)['currency'] === 'HUF');
$ctxDb->setSetting('SYSTEM_LANGUAGE', 'en');
$check('demo_ctx is cached until demo_ctx_reset()', demo_ctx($ctxDb)['lang'] === 'hu');
demo_ctx_reset();
$ctxDb->setSetting('SYSTEM_CURRENCY', 'GBP');
$check('...and reads the new value after the reset', demo_ctx($ctxDb)['lang'] === 'en' && demo_ctx($ctxDb)['currency'] === 'GBP');

$t = static fn(string $lang, string $cur, string $s) => $moneyAt($lang, $cur, static fn() => demo_text($s));
$check('{m:185} follows currency and language', $t('sk', 'EUR', 'Cena {m:185}') === 'Cena 185 €' && $t('hu', 'HUF', '{m:180}') === "72{$nb}000 Ft" && $t('en', 'USD', '{m:180}') === '$198');
$d = static fn(int $n) => new DateTimeImmutable(sprintf('today %+d days', $n));
$check('{d:-3} per edition', $t('sk', 'EUR', '{d:-3}') === $d(-3)->format('j. n. Y') && $t('hu', 'EUR', '{d:-3}') === $d(-3)->format('Y. m. d.') && $t('en', 'USD', '{d:-3}') === $d(-3)->format('M j, Y'));
$check('{wd:0} weekday name', in_array($t('sk', 'EUR', '{wd:0}'), ['pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota', 'nedeľa'], true) && in_array($t('hu', 'EUR', '{wd:0}'), ['hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat', 'vasárnap'], true) && in_array($t('en', 'USD', '{wd:0}'), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], true));
$check('{company} {brand}', $t('hu', 'EUR', '{company}/{brand}') === 'Lapidea Kft./Lapidea' && $t('en', 'USD', '{company}') === 'Lapidea Stone Inc.');
$check('{user:owner} {first:owner}: Hungarian family name first, greeting by given name', $t('hu', 'EUR', '{user:owner}|{first:owner}') === 'Kollár András|András' && $t('sk', 'EUR', '{first:pm}') === 'Simona' && $t('en', 'USD', '{user:sales}') === 'Jordan Hayes');
$check('{client:C1} {contact:C1} {project:P3} {item:I2}', $t('en', 'USD', '{client:C1}|{contact:C1}|{project:P3}|{item:I2}') === 'Highland Park Residences LLC|Mark Fisher|Hotel Aurum – reception & spa|Nero Marquina sintered stone 12 mm (Stratos)');
$check('a leads ref works too: {client:L9}', $t('hu', 'EUR', '{client:L9}') === 'Kozma Martina');
$check('unknown placeholder throws', $throws(fn() => $t('sk', 'EUR', '{nothing:1}'), 'unknown placeholder'));
$check('unknown ref throws; a ref of the wrong kind throws', $throws(fn() => $t('sk', 'EUR', '{client:C9}'), 'unknown ref') && $throws(fn() => $t('sk', 'EUR', '{project:C1}'), 'expected project') && $throws(fn() => $t('sk', 'EUR', '{item:owner}'), 'expected item'));
$check('missing or bad argument throws', $throws(fn() => $t('sk', 'EUR', '{m:}')) && $throws(fn() => $t('sk', 'EUR', '{m:abc}')) && $throws(fn() => $t('sk', 'EUR', '{d:1.5}')) && $throws(fn() => $t('sk', 'EUR', '{company:x}')));
$check('text without a placeholder passes through (JSON braces too)', $t('sk', 'EUR', 'plain') === 'plain' && $t('sk', 'EUR', '{"a":1}') === '{"a":1}');
$check('demo_text_deep resolves nested rows', $moneyAt('sk', 'EUR', static fn() => demo_text_deep(['a' => ['{m:90}', 5, null]])) === ['a' => ['90 €', 5, null]]);

$section('packs, refs and ids (C3)');
$check('ref id map', demo_ref_id('C1') === 'demo-clients-1' && demo_ref_id('C6') === 'demo-clients-6' && demo_ref_id('L7') === 'demo-clients-7' && demo_ref_id('L11') === 'demo-clients-11'
    && demo_ref_id('P5') === 'demo-projects-5' && demo_ref_id('PT') === 'demo-projects-0' && demo_ref_id('E6') === 'demo-employees-6'
    && demo_ref_id('I1') === 'demo-warehouse-101' && demo_ref_id('I8') === 'demo-warehouse-108' && demo_ref_id('S1') === 'demo-warehouse-201' && demo_ref_id('S3') === 'demo-warehouse-203'
    && demo_ref_id('W1') === 'demo-warehouse-1' && demo_ref_id('W2') === 'demo-warehouse-2');
$check('refs outside the table are rejected', $throws(fn() => demo_ref_id('C7')) && $throws(fn() => demo_ref_id('L6')) && $throws(fn() => demo_ref_id('P6')) && $throws(fn() => demo_ref_id('X1')) && $throws(fn() => demo_ref_id('owner2')));
demo_ctx_force('hu', 'EUR');
$check('login refs resolve to u-<md5 of the edition e-mail>', demo_ref_id('owner') === 'u-' . md5('kollar.andras@lapidea.example') && demo_ref_id('sales') === 'u-' . md5('juhasz.janos@lapidea.example'));
$check('demo_ref_for returns the record with ref and id', demo_ref_for('sk', 'C2')['name'] === 'Andrea Horváthová' && demo_ref_for('sk', 'C2')['id'] === 'demo-clients-2' && demo_ref_for('en', 'owner')['id'] === 'u-' . md5('alex.morgan@lapidea.example'));
$check('PT has an id but no record', $throws(fn() => demo_ref_for('sk', 'PT'), 'no cast record'));
$check('a missing pack throws', $throws(fn() => demo_pack_for('sk', 'no_such_module'), 'pack missing'));
$check('demo_all_user_emails: 3 editions x 3 + the legacy three, lower-case, unique',
    count(demo_all_user_emails()) === 12 && in_array('alex@crm.com', demo_all_user_emails(), true) && in_array('kollar.andras@lapidea.example', demo_all_user_emails(), true) && in_array('samantha.reed@lapidea.example', demo_all_user_emails(), true)
    && demo_all_user_emails() === array_values(array_unique(array_map('strtolower', demo_all_user_emails()))));
$check('demo_users: owner/pm/sales with ids; names differ per edition', array_keys(demo_users()) === ['owner', 'pm', 'sales'] && demo_user_names() === ['Kollár András', 'Szabó Szilvia', 'Juhász János']);
$legacyIds = demo_user_ids();
$check('demo_user_ids: role, display name and (until phase 5) the old first names', $legacyIds['owner'] === $legacyIds['Kollár András'] && $legacyIds['Alex'] === $legacyIds['owner'] && $legacyIds['Sam'] === $legacyIds['pm'] && $legacyIds['Jordan'] === $legacyIds['sales']);
$ids = demo_legacy_ids();
$bad = [];
foreach ($ids as $key => $list) {
    if (!is_array($list) || !$list) $bad[] = "{$key} is empty";
    foreach ($list as $v) if (!is_string($v) || $v === '') $bad[] = "{$key} has a bad entry";
}
$check('demo_legacy_ids: table => non-empty list, covers the three pre-pack seeders', !$bad && isset($ids['leads'], $ids['employees'], $ids['warehouses'], $ids['orders'], $ids['invoices_offers'], $ids['tickets'], $ids['swarm_simulations'], $ids['timeline_events'], $ids['users']) && in_array('proj-vila-slavin', $ids['projects'], true) && in_array('pt_luxury_stone', $ids['project_types'], true), implode('; ', $bad));
$catalogue = new DemoFakePdo();
$unknown = [];
foreach ($ids as $key => $list) {
    [$tbl, $col] = strpos($key, '.') !== false ? explode('.', $key, 2) : [$key, 'id'];
    if ($tbl === 'swarm_simulations') continue;   // created lazily by SwarmManager, not by schema.php
    if (!$catalogue->hasTable($tbl)) $unknown[] = "{$key}: no such table";
    elseif (!in_array($col, $catalogue->columns($tbl), true)) $unknown[] = "{$key}: no such column";
}
$check('demo_legacy_ids names real tables and columns of the schema', !$unknown, implode("\n", $unknown));
$demoLookupSrc = (string)file_get_contents(dirname(__DIR__) . '/public/api/demo_seed/lookup.php');
$check("demo_divisions has no 'Cstudios' fallback", stripos($demoLookupSrc, 'Cstudios') === false);
$divDb = new DemoFakePdo();
demo_ctx_force('hu', 'HUF');
$check('demo_divisions: the pack\'s two when the setting is empty, the setting when it has any', demo_divisions($divDb) === ['Lapidea Győr', 'Lapidea Budapest']
    && (function () use ($divDb) { $divDb->setSetting('DIVISIONS', '["Hand made"]'); return demo_divisions($divDb) === ['Hand made']; })());

$section('repo-root mirror');
$mirrorBad = [];
$srcRoot = dirname(__DIR__) . '/public/api/demo_seed';
$dstRoot = dirname(__DIR__) . '/api/demo_seed';
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($srcRoot, FilesystemIterator::SKIP_DOTS));
foreach ($it as $file) {
    $rel = substr($file->getPathname(), strlen($srcRoot) + 1);
    if (!is_file("{$dstRoot}/{$rel}")) $mirrorBad[] = "api/demo_seed/{$rel} is missing - cp it from public/api/demo_seed/{$rel} (sync:backend does not create new files)";
    elseif (file_get_contents("{$dstRoot}/{$rel}") !== file_get_contents($file->getPathname())) $mirrorBad[] = "api/demo_seed/{$rel} differs from public/ - run npm run sync:backend";
}
$check('api/demo_seed/ (served by the repo root) has every file of public/api/demo_seed/, byte-identical', !$mirrorBad, implode("\n", $mirrorBad));

$section('the fake PDO itself');
$fk = new DemoFakePdo();
$check('catalogue is read from the real schema', $fk->hasTable('leads') && $fk->hasTable('time_entries') && in_array('client_id', $fk->columns('leads'), true));
$check('unknown table throws 42S02', $throws(fn() => $fk->exec("INSERT INTO `no_such_table` (`id`) VALUES ('x')"), "doesn't exist"));
$check('unknown column throws 42S22 (the production 500 of the 4-place rule)', $throws(fn() => $fk->prepare("INSERT INTO `system_settings` (`key`, `value`, `nope`) VALUES (?, ?, ?)")->execute(['k', 'v', 'x']), "Unknown column 'nope'"));
$check('NOT NULL without a value throws (1364)', $throws(fn() => $fk->exec("INSERT INTO `system_settings` (`key`) VALUES ('only-a-key')"), "doesn't have a default value"));
$check('explicit NULL in a NOT NULL column throws (1048)', $throws(fn() => $fk->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?)")->execute(['k2', null]), 'cannot be null'));
$check('a string longer than VARCHAR(n) throws (22001)', $throws(fn() => $fk->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?)")->execute([str_repeat('k', 101), 'v']), 'Data too long'));
$fk->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?)")->execute(['dup', '1']);
$check('duplicate PRIMARY KEY throws (23000), ON DUPLICATE KEY UPDATE and INSERT IGNORE do not', $throws(fn() => $fk->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?)")->execute(['dup', '2']), 'Duplicate entry')
    && $fk->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute(['dup', '3']) && $fk->settings()['dup'] === '3'
    && $fk->prepare("INSERT IGNORE INTO `system_settings` (`key`, `value`) VALUES (?, ?)")->execute(['dup', '4']) && $fk->settings()['dup'] === '3');
$sel = $fk->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
$sel->execute(['dup']);
$check('SELECT with a bound WHERE, fetchColumn', $sel->fetchColumn() === '3');
$check('UPDATE / DELETE with LIKE, IN, OR and parentheses', (function () use ($fk) {
    foreach (['x-1', 'x-2', 'y-1'] as $k) $fk->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, 'v')")->execute([$k]);
    $u = $fk->prepare("UPDATE `system_settings` SET `value` = ? WHERE (`key` LIKE 'x-%' AND `key` != ?) OR `key` IN ('y-1')");
    $u->execute(['changed', 'x-2']);
    $s = $fk->settings();
    $n = $fk->exec("DELETE FROM `system_settings` WHERE `key` LIKE 'x-%'");
    return $s['x-1'] === 'changed' && $s['x-2'] === 'v' && $s['y-1'] === 'changed' && $n === 2 && !isset($fk->settings()['x-1']);
})());
$check('COUNT(*), information_schema.TABLES / COLUMNS, DATABASE()', (int)$fk->query("SELECT COUNT(*) FROM `system_settings`")->fetchColumn() >= 2
    && (int)$fk->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads'")->fetchColumn() === 1
    && count($fk->query("SELECT `TABLE_NAME` AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'client_id'")->fetchAll(PDO::FETCH_ASSOC)) > 0);
$check('rollBack restores rows; DDL commits like MySQL', (function () use ($fk) {
    $fk->beginTransaction();
    $fk->exec("INSERT INTO `system_settings` (`key`, `value`) VALUES ('tx-1', 'v')");
    $fk->rollBack();
    $a = !isset($fk->settings()['tx-1']);
    $fk->beginTransaction();
    $fk->exec("INSERT INTO `system_settings` (`key`, `value`) VALUES ('tx-2', 'v')");
    $fk->exec("CREATE TABLE IF NOT EXISTS `demo_ddl` (`id` VARCHAR(20) NOT NULL, PRIMARY KEY (`id`))");
    $committed = !$fk->inTransaction();
    return $a && $committed && $fk->hasTable('demo_ddl') && isset($fk->settings()['tx-2']);
})());
$check('an uninterpretable UPDATE throws, an uninterpretable SELECT warns and returns nothing', $throws(fn() => $fk->exec("UPDATE `system_settings` SET `value` = `value` + 1"), 'arithmetic')
    && $fk->query("SELECT s.`key` FROM `system_settings` s JOIN `leads` l ON l.`id` = s.`key`")->fetchAll() === [] && count($fk->warnings()) >= 1);
$check('the runner rolls a failing module back', (function () use ($fk) {
    $before = count($fk->rows('system_settings'));
    try {
        demo_seed_run_module($fk, 'probe', static function (PDO $pdo): void {
            $pdo->exec("INSERT INTO `system_settings` (`key`, `value`) VALUES ('probe-1', 'v')");
            throw new RuntimeException('boom');
        });
    } catch (RuntimeException $e) {
    }
    return count($fk->rows('system_settings')) === $before && !$fk->inTransaction();
})());

// =================================================================================================
// 2. The dry run
// =================================================================================================
$assertFiles = [];
foreach (glob(__DIR__ . '/demo-assert/*.php') ?: [] as $f) {
    $assertFiles[basename($f, '.php')] = require $f;
}

$ported = [];
$notCovered = [];
foreach (demo_seed_modules() as $module) {
    if ($only !== null && !in_array($module, $only, true)) continue;
    $hasCode = is_file(dirname(__DIR__) . "/public/api/demo_seed/{$module}.php");
    $packs = 0;
    foreach (['sk', 'hu', 'en'] as $lang) if (demo_pack_exists($lang, $module)) $packs++;
    if ($hasCode && $packs === 3) $ported[] = $module;
    elseif ($hasCode) $notCovered[] = $module . ($packs ? " (only {$packs}/3 packs)" : '');
}
echo "\nModules covered by the dry run: " . ($ported ? implode(', ', $ported) : '(none)') . "\n";
echo 'Not covered (code file without packs yet - still the old per-string style): ' . ($notCovered ? implode(', ', $notCovered) : '(none)') . "\n";
echo 'Not written yet: ' . implode(', ', array_diff(demo_seed_modules(), $ported, array_map(fn($s) => explode(' ', $s)[0], $notCovered))) . "\n";

/** Strings inside a cell; a JSON cell is decoded first so \u00e1 escapes are seen as letters. */
$cellStrings = static function ($v) use (&$cellStrings): array {
    if (is_string($v)) {
        $t = ltrim($v);
        if ($t !== '' && ($t[0] === '{' || $t[0] === '[')) {
            $decoded = json_decode($v, true);
            if (is_array($decoded)) return $cellStrings($decoded);
        }
        return [$v];
    }
    if (is_array($v)) {
        $out = [];
        foreach ($v as $item) $out = array_merge($out, $cellStrings($item));
        return $out;
    }
    return [];
};

/** All primary ids of the written rows: id => table. */
$idIndex = static function (DemoFakePdo $db): array {
    $idx = [];
    foreach ($db->tablesWithRows() as $tbl) {
        foreach ($db->rows($tbl) as $row) if (isset($row['id']) && is_string($row['id'])) $idx[$row['id']] = $tbl;
    }
    return $idx;
};

foreach ($combos as [$lang, $currency]) {
    $combo = "{$lang}/{$currency}";
    $section("dry run {$combo}");
    if (!$ported) { echo "nothing to run\n"; continue; }

    $db = new DemoFakePdo();
    $db->setSetting('SYSTEM_LANGUAGE', $lang);
    $db->setSetting('SYSTEM_CURRENCY', $currency);
    // Rows a person made by hand: a run must leave them alone.
    $handRows = [
        ['users', ['id' => 'u-hand-made', 'name' => 'Hand Made', 'email' => 'hand.made@example.com', 'password_hash' => 'x', 'role' => 'admin']],
        ['system_settings', ['key' => 'HAND_MADE_SETTING', 'value' => 'keep me']],
    ];
    foreach ($handRows as [$tbl, $row]) $db->seedRow($tbl, $row);
    $handIds = ['u-hand-made'];

    $ctx = demo_ctx_make($lang, $currency);
    $t0 = microtime(true);
    $report = demo_seed_all($db, ['only' => $ported, 'writeDataset' => true]);
    $ms = (int)round((microtime(true) - $t0) * 1000);
    foreach ($ported as $module) {
        $r = $report[$module] ?? ['ok' => false, 'error' => 'not in the report', 'rows' => 0];
        $check("{$combo}: module {$module} ran without an exception ({$r['rows']} rows)", $r['ok'] === true && empty($r['skipped']), (string)$r['error']);
    }
    if ($verbose) echo "       ({$ms} ms)\n";
    $firstCounts = $db->insertCounts();
    $firstRows = [];
    foreach ($db->tablesWithRows() as $tbl) $firstRows[$tbl] = count($db->rows($tbl));

    // --- ids -------------------------------------------------------------------------------
    $idAllow = ['users' => '/^u-[0-9a-f]{32}$/'];
    $leakSkip = [];
    foreach ($assertFiles as $mod => $def) {
        if (!in_array($mod, $ported, true)) continue;
        foreach (($def['idAllow'] ?? []) as $tbl => $re) $idAllow[$tbl] = $re;
        foreach (($def['leakSkip'] ?? []) as $s) $leakSkip[$s] = true;
    }
    $badIds = [];
    foreach ($db->tablesWithRows() as $tbl) {
        foreach ($db->rows($tbl) as $row) {
            if (!isset($row['id']) || !is_string($row['id']) || in_array($row['id'], $handIds, true)) continue;
            if (isset($idAllow[$tbl])) {
                if (!preg_match($idAllow[$tbl], $row['id'])) $badIds[] = "{$tbl}.id = '{$row['id']}' does not match {$idAllow[$tbl]}";
            } elseif (strpos($row['id'], 'demo-') !== 0) {
                $badIds[] = "{$tbl}.id = '{$row['id']}' does not start with demo- (list the table under 'idAllow' in scripts/demo-assert/<module>.php if the key is not an id)";
            }
        }
    }
    $check("{$combo}: every seeded id starts with demo- (B7)", !$badIds, implode("\n", array_slice($badIds, 0, 10)));

    // --- currency, placeholders, leakage ---------------------------------------------------
    $badCur = [];
    $badPh = [];
    $badLeak = [];
    foreach ($db->tablesWithRows() as $tbl) {
        foreach ($db->rows($tbl) as $i => $row) {
            if (($row['id'] ?? null) !== null && in_array($row['id'], $handIds, true)) continue;
            if ($tbl === 'system_settings' && ($row['key'] ?? '') === 'HAND_MADE_SETTING') continue;
            foreach ($row as $col => $val) {
                if ($col === 'currency' && is_string($val) && $val !== '' && $val !== $currency) $badCur[] = "{$tbl}[{$i}].currency = {$val}";
                foreach ($cellStrings($val) as $s) {
                    if ($s === '') continue;
                    if (preg_match('/\{[a-z]+(:[^{}]*)?\}/', $s, $m)) $badPh[] = "{$tbl}.{$col}: {$m[0]}";
                    if (isset($leakSkip[$tbl]) || isset($leakSkip["{$tbl}.{$col}"])) continue;
                    if (($why = demo_lint_leakage($lang, $s)) !== null) $badLeak[] = "{$tbl}.{$col}: {$why}: " . mb_substr($s, 0, 60);
                    foreach (['sk' => '+421', 'hu' => '+36', 'en' => '+1'] as $other => $prefix) {
                        if ($other !== $lang && preg_match('/^' . preg_quote($prefix, '/') . '\s/', $s) && preg_match('/phone|tel|mobile/i', $col)) {
                            $badLeak[] = "{$tbl}.{$col}: a {$prefix} phone number in the {$lang} edition: {$s}";
                        }
                    }
                }
            }
        }
    }
    $check("{$combo}: every `currency` column is {$currency}", !$badCur, implode("\n", array_slice($badCur, 0, 10)));
    $check("{$combo}: no {placeholder} left in a written text", !$badPh, implode("\n", array_slice(array_unique($badPh), 0, 10)));
    $check("{$combo}: leakage rules hold on the written rows (C6)", !$badLeak, implode("\n", array_slice(array_unique($badLeak), 0, 10)));

    // --- links ------------------------------------------------------------------------------
    $idx = $idIndex($db);
    $demoUserIds = array_column(demo_company_pack($lang)['users'], 'email');
    $demoUserIds = array_map(static fn($e) => 'u-' . md5(strtolower($e)), $demoUserIds);
    $ownerModule = static function (string $id): ?string {
        if (!preg_match('/^demo-([a-z]+)-/', $id, $m)) return null;
        return $m[1] === 'mail' ? 'email' : $m[1];
    };
    $dangling = [];
    foreach ($db->tablesWithRows() as $tbl) {
        foreach ($db->rows($tbl) as $i => $row) {
            foreach ($row as $col => $val) {
                if (!is_string($val) || !preg_match('/(^|_)id$/', $col) || $col === 'id') continue;
                if (strpos($val, 'demo-') === 0) {
                    $owner = $ownerModule($val);
                    if ($owner !== null && !in_array($owner, $ported, true)) continue;   // its owner is not part of this run
                    if (!isset($idx[$val])) $dangling[] = "{$tbl}[{$i}].{$col} -> {$val}";
                } elseif (strpos($val, 'u-') === 0 && strlen($val) === 34) {
                    if (!in_array($val, $demoUserIds, true) && !in_array($val, $handIds, true) && !isset($idx[$val])) $dangling[] = "{$tbl}[{$i}].{$col} -> {$val} (not one of the three demo users)";
                }
            }
        }
    }
    $check("{$combo}: every *_id link points at a row that was written (or a demo user)", !$dangling, implode("\n", array_slice($dangling, 0, 10)));

    // --- DEMO_DATASET (C8) ------------------------------------------------------------------
    $dataset = json_decode($db->settings()['DEMO_DATASET'] ?? 'null', true);
    $okRows = [];
    foreach ($ported as $mod) if (!empty($report[$mod]['ok'])) $okRows[$mod] = $report[$mod]['rows'];
    $check("{$combo}: DEMO_DATASET describes the run (version, language, currency, rows per module)", is_array($dataset) && $dataset['version'] === DEMO_DATASET_VERSION && $dataset['language'] === $lang && $dataset['currency'] === $currency
        && $dataset['modules'] == $okRows && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', (string)($dataset['seededAt'] ?? '')), json_encode($dataset));

    // --- per-module assertions --------------------------------------------------------------
    foreach ($ported as $module) {
        $def = $assertFiles[$module] ?? null;
        if ($def === null) { echo "note {$combo}: no scripts/demo-assert/{$module}.php yet - only the generic checks cover {$module}\n"; continue; }
        foreach (($def['minRows'] ?? []) as $tbl => $min) {
            $got = $firstCounts[$tbl] ?? 0;
            $check("{$combo}: {$module} wrote at least {$min} {$tbl} row(s)", $got >= $min, "wrote {$got}");
        }
        if (isset($def['check']) && is_callable($def['check'])) {
            $def['check']($db, $ctx + ['report' => $report], static function (string $name, bool $ok, string $detail = '') use ($check, $combo, $module): void {
                $check("{$combo}: {$module}: {$name}", $ok, $detail);
            });
        }
    }

    // --- a second run: idempotent, hand-made rows intact --------------------------------------
    demo_seed_all($db, ['only' => $ported, 'writeDataset' => true]);
    $secondRows = [];
    foreach ($db->tablesWithRows() as $tbl) $secondRows[$tbl] = count($db->rows($tbl));
    $diff = [];
    foreach (array_unique(array_merge(array_keys($firstRows), array_keys($secondRows))) as $tbl) {
        if (($firstRows[$tbl] ?? 0) !== ($secondRows[$tbl] ?? 0)) $diff[] = "{$tbl}: " . ($firstRows[$tbl] ?? 0) . ' -> ' . ($secondRows[$tbl] ?? 0);
    }
    $check("{$combo}: a second run leaves the same rows (idempotent)", !$diff, implode("\n", $diff));
    $survived = isset($db->settings()['HAND_MADE_SETTING']) && count(array_filter($db->rows('users'), static fn($u) => $u['id'] === 'u-hand-made')) === 1;
    $check("{$combo}: rows made by hand survive both runs", $survived);

    // --- warnings -----------------------------------------------------------------------------
    $warn = $db->warnings();
    if ($warn) {
        echo 'WARN ' . count($warn) . " statement(s) the fake could not interpret (their result is unverified here):\n";
        foreach (array_slice($warn, 0, $verbose ? 50 : 5) as $w) echo '       - ' . $w . "\n";
    }
    if ($verbose) {
        echo "Rows by table:\n";
        foreach ($secondRows as $tbl => $n) echo "       {$tbl}: {$n}\n";
    }
}

echo "\n{$checks} checks, " . ($fails === 0 ? 'all passed.' : "{$fails} FAILED.") . "\n";
exit($fails === 0 ? 0 : 1);
