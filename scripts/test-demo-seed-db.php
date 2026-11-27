<?php
/**
 * Demo seed on a REAL MySQL / MariaDB (optional; the offline check is test-demo-seed.php).
 * Run:  CCRM_TEST_DSN='mysql:host=127.0.0.1;dbname=ccrm_demo_test;charset=utf8mb4' \
 *       CCRM_TEST_USER=root CCRM_TEST_PASS=secret \
 *       php scripts/test-demo-seed-db.php [--combo=hu/EUR]      (npm run test:demo-seed:db)
 *
 * Without CCRM_TEST_DSN it prints a note and exits 0 (so it can sit in a chain). It REFUSES to run
 * unless the database has no tables at all: it installs the schema itself and leaves the seeded
 * rows behind, so point it at a scratch database - one run per edition:
 * sk/EUR (default), hu/HUF, hu/EUR, en/USD.
 *
 * What it checks: every ported module (code file + three packs) ran ok on real SQL, DEMO_DATASET
 * describes the run, every `currency` column holds the chosen currency, no row id outside the
 * demo- scheme (users aside), a second run leaves the same rows per table, and a row made by
 * hand survives it. The per-module row assertions of scripts/demo-assert/ read the fake's row
 * store and are not repeated here.
 */
$dsn = getenv('CCRM_TEST_DSN');
if (!$dsn) {
    echo "CCRM_TEST_DSN is not set - skipping the database check (the offline one is npm run test:demo-seed).\n";
    exit(0);
}
require_once dirname(__DIR__) . '/public/api/schema.php';
require_once dirname(__DIR__) . '/public/api/demo_seed/index.php';

$combo = ['sk', 'EUR'];
foreach (array_slice($argv, 1) as $arg) {
    if (strpos($arg, '--combo=') === 0) $combo = explode('/', substr($arg, 8)) + [1 => ''];
}
[$lang, $currency] = $combo;

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails): void {
    if (!$ok) $fails++;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . ($ok ? '' : "\n       " . $detail) . "\n";
};

try {
    $pdo = new PDO($dsn, getenv('CCRM_TEST_USER') ?: null, getenv('CCRM_TEST_PASS') ?: null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (\Throwable $e) {
    fwrite(STDERR, 'cannot connect: ' . $e->getMessage() . "\n");
    exit(2);
}
$tables = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")->fetchColumn();
if ($tables > 0) {
    fwrite(STDERR, "refusing: the database already has {$tables} table(s). Use an empty scratch database.\n");
    exit(2);
}

ccrm_apply_schema($pdo);
$put = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
foreach (['DEMO_MODE' => 'true', 'SYSTEM_LANGUAGE' => $lang, 'SYSTEM_CURRENCY' => $currency, 'HAND_MADE_SETTING' => 'keep me'] as $k => $v) $put->execute([$k, $v]);

$ported = [];
foreach (demo_seed_modules() as $module) {
    $packs = 0;
    foreach (['sk', 'hu', 'en'] as $l) if (demo_pack_exists($l, $module)) $packs++;
    if (is_file(dirname(__DIR__) . "/public/api/demo_seed/{$module}.php") && $packs === 3) $ported[] = $module;
}
echo "Edition {$lang}/{$currency}; modules covered: " . implode(', ', $ported) . "\n";

$report = demo_seed_all($pdo, ['only' => $ported, 'writeDataset' => true]);
foreach ($ported as $module) {
    $r = $report[$module];
    $check("module {$module} ran ({$r['rows']} rows)", $r['ok'] && empty($r['skipped']), (string)$r['error']);
}

$dataset = json_decode((string)$pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'DEMO_DATASET'")->fetchColumn(), true);
$check('DEMO_DATASET describes the run', is_array($dataset) && $dataset['version'] === DEMO_DATASET_VERSION && $dataset['language'] === $lang && $dataset['currency'] === $currency, json_encode($dataset));

$bad = [];
foreach ($pdo->query("SELECT `TABLE_NAME` AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'currency'")->fetchAll(PDO::FETCH_COLUMN) as $t) {
    $n = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}` WHERE `currency` IS NOT NULL AND `currency` <> '' AND `currency` <> " . $pdo->quote($currency))->fetchColumn();
    if ($n > 0) $bad[] = "{$t}: {$n} row(s)";
}
$check("every currency column is {$currency}", !$bad, implode(', ', $bad));

$badIds = [];
foreach ($pdo->query("SELECT `TABLE_NAME` AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'id' AND DATA_TYPE IN ('varchar','char')")->fetchAll(PDO::FETCH_COLUMN) as $t) {
    if ($t === 'users') continue;
    $n = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}` WHERE `id` NOT LIKE 'demo-%'")->fetchColumn();
    if ($n > 0) $badIds[] = "{$t}: {$n} row(s) without a demo- id";
}
$check('every seeded id starts with demo- (users aside)', !$badIds, implode(', ', $badIds));

$count = static function () use ($pdo): array {
    $out = [];
    foreach ($pdo->query("SELECT `TABLE_NAME` AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")->fetchAll(PDO::FETCH_COLUMN) as $t) {
        $out[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
    }
    ksort($out);
    return $out;
};
$before = $count();
demo_seed_all($pdo, ['only' => $ported, 'writeDataset' => true]);
$after = $count();
$diff = [];
foreach ($after as $t => $n) if (($before[$t] ?? null) !== $n) $diff[] = "{$t}: " . ($before[$t] ?? 0) . " -> {$n}";
$check('a second run leaves the same rows (idempotent)', !$diff, implode(', ', $diff));
$check('a row made by hand survives', (string)$pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'HAND_MADE_SETTING'")->fetchColumn() === 'keep me');

echo $fails === 0 ? "\nAll database checks passed.\n" : "\n{$fails} database check(s) FAILED.\n";
exit($fails === 0 ? 0 : 1);
