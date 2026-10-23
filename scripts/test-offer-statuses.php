<?php
/**
 * Checks for the configurable price-offer statuses (api/auth.php, api/schema.php).
 *   php scripts/test-offer-statuses.php                       normalizer only, no database
 *   CCRM_TEST_DSN=mysql:host=...;dbname=... CCRM_TEST_USER=root CCRM_TEST_PASS=x php scripts/test-offer-statuses.php
 *                                                             also runs the migration against a SCRATCH database
 * The database part creates and drops its own `invoices_offers` and `system_settings`
 * tables, so never point it at real data. CCRM_API_DIR overrides the folder that holds
 * auth.php and schema.php (for running inside the dev container).
 *
 * The normalizer cases mirror src/utils/offerStatuses.test.ts, so the two implementations
 * cannot drift apart unnoticed.
 */
$api = getenv('CCRM_API_DIR') ?: __DIR__ . '/../public/api';
require_once $api . '/auth.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};
$keys = fn(array $defs) => array_column($defs, 'key');

// ── normalizer ────────────────────────────────────────────────────────────────
$builtinKeys = ['draft', 'sent', 'approved', 'invoiced', 'rejected', 'cancelled'];
foreach ([null, 'x', 3, [], [null, 4, 'a'], [['key' => '', 'group' => 'draft']]] as $junk) {
    if ($keys(ccrm_normalize_offer_statuses($junk)) !== $builtinKeys) { $check('junk input gives the built-ins', false); break; }
}
$check('nothing stored, junk and an emptied list give the six built-ins', true);

$defaults = ccrm_default_offer_status_defs();
$groupOf = fn($k) => array_column($defaults, 'group', 'key')[$k] ?? null;
$check('the built-ins keep their keys and group the way the code used to read them',
    $groupOf('draft') === 'draft' && $groupOf('sent') === 'open' && $groupOf('approved') === 'won'
    && $groupOf('invoiced') === 'won' && $groupOf('rejected') === 'lost' && $groupOf('cancelled') === 'cancelled');
$check('a list nobody edited normalizes to itself', ccrm_normalize_offer_statuses($defaults) === $defaults);

$out = ccrm_normalize_offer_statuses([
    ['key' => 'draft', 'color' => '#64748b', 'group' => 'draft'],
    ['key' => 'draft', 'color' => '#000000', 'group' => 'won'],
    ['key' => str_repeat('x', 51), 'group' => 'open'],
    ['key' => 'prepared', 'group' => 'nonsense', 'color' => 'red'],
    ['key' => 'approved', 'group' => 'bogus', 'color' => 'nope'],
]);
$byKey = array_column($out, null, 'key');
$check('duplicates, over-long keys, unknown groups and bad colours are cleaned up',
    $keys($out) === ['draft', 'prepared', 'approved']
    && $byKey['prepared']['group'] === 'open' && $byKey['prepared']['color'] === '#6366f1'
    && $byKey['approved']['group'] === 'won' && $byKey['approved']['color'] === '#10b981');

$out = ccrm_normalize_offer_statuses([
    ['key' => 'won1', 'color' => '#10b981', 'group' => 'won'],
    ['key' => 'd1', 'color' => '#64748b', 'group' => 'draft'],
    ['key' => 'o1', 'color' => '#3b82f6', 'group' => 'open'],
    ['key' => 'd2', 'color' => '#64748b', 'group' => 'draft'],
]);
$check('statuses are kept in group order', $keys($out) === ['d1', 'd2', 'o1', 'won1']);

$check('a list with no draft status falls back to the built-ins',
    $keys(ccrm_normalize_offer_statuses([['key' => 'sent', 'color' => '#3b82f6', 'group' => 'open']])) === $builtinKeys
    && $keys(ccrm_normalize_offer_statuses([['key' => 'invoiced', 'group' => 'draft'], ['key' => 'sent', 'group' => 'open']])) === $builtinKeys);

$out = ccrm_normalize_offer_statuses([
    ['key' => 'draft', 'label' => '  Vypracovanie  ', 'color' => '#64748b', 'group' => 'draft'],
    ['key' => 'sent', 'label' => '   ', 'color' => '#3b82f6', 'group' => 'open'],
]);
$check('a label is trimmed and a blank one dropped', $out[0]['label'] === 'Vypracovanie' && !array_key_exists('label', $out[1]));

$out = ccrm_normalize_offer_statuses([
    ['key' => 'draft', 'group' => 'draft'], ['key' => 'invoiced', 'group' => 'won'],
    ['key' => 'old', 'group' => 'won', 'legacy' => true], ['key' => 'new', 'group' => 'won', 'legacy' => 'yes'],
]);
$byKey = array_column($out, null, 'key');
$check('legacy survives a round trip and is forced on for the built-in invoiced',
    ($byKey['invoiced']['legacy'] ?? null) === true && ($byKey['old']['legacy'] ?? null) === true && !isset($byKey['new']['legacy']));

// ── proformas and invoices: a list of their own ──────────────────────────────
$invoiceDefaults = ccrm_default_invoice_status_defs();
$invoiceKeys = ['draft', 'sent', 'invoiced', 'approved', 'rejected', 'cancelled'];
foreach ([null, 'x', 3, [], [['key' => '', 'group' => 'draft']]] as $junk) {
    if ($keys(ccrm_normalize_offer_statuses($junk, $invoiceDefaults)) !== $invoiceKeys) { $check('junk input gives the invoice built-ins', false); break; }
}
$check('nothing stored, junk and an emptied list give the six invoice built-ins, in the order the client uses', true);
$check('a list nobody edited normalizes to itself', ccrm_normalize_offer_statuses($invoiceDefaults, $invoiceDefaults) === $invoiceDefaults);
$check('on an invoice `invoiced` is a real status, not the legacy one it is on an offer',
    !isset(array_column($invoiceDefaults, null, 'key')['invoiced']['legacy'])
    && ccrm_normalize_offer_statuses($invoiceDefaults, $invoiceDefaults)[2]['key'] === 'invoiced');
$out = ccrm_normalize_offer_statuses([['key' => 'sent', 'group' => 'open']], $invoiceDefaults);
$check('a list with nowhere to start falls back to the invoice built-ins, not the offer ones', $keys($out) === $invoiceKeys);
$out = ccrm_normalize_offer_statuses([
    ['key' => 'draft'], ['key' => 'paid', 'label' => 'Zaplatená', 'color' => '#00ff00', 'group' => 'won'], ['key' => 'invoiced', 'color' => 'nonsense'],
], $invoiceDefaults);
$byKey = array_column($out, null, 'key');
$check('custom invoice statuses are kept, and a built-in takes its colour from the invoice defaults',
    $keys($out) === ['draft', 'paid', 'invoiced'] && $byKey['invoiced']['color'] === '#10b981' && !isset($byKey['invoiced']['legacy']) && $byKey['paid']['label'] === 'Zaplatená');

// ── database ──────────────────────────────────────────────────────────────────
$dsn = getenv('CCRM_TEST_DSN');
if ($dsn) {
    require_once $api . '/schema.php';
    $pdo = new PDO($dsn, getenv('CCRM_TEST_USER') ?: 'root', getenv('CCRM_TEST_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('DROP TABLE IF EXISTS `invoices_offers`');
    $pdo->exec('DROP TABLE IF EXISTS `system_settings`');
    $pdo->exec("CREATE TABLE `system_settings` (`key` VARCHAR(100) NOT NULL PRIMARY KEY, `value` LONGTEXT)");
    $pdo->exec("CREATE TABLE `invoices_offers` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `status` ENUM('draft', 'sent', 'approved', 'rejected', 'invoiced', 'cancelled') NOT NULL DEFAULT 'draft'
    )");
    $pdo->exec("INSERT INTO `invoices_offers` (`id`, `status`) VALUES ('a', 'invoiced'), ('b', 'sent'), ('c', 'draft')");

    $colType = fn() => $pdo->query("SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices_offers' AND COLUMN_NAME = 'status'")->fetchColumn();
    $check('the scratch table starts with an ENUM status', $colType() === 'enum');

    ccrm_migrate_invoice_status_varchar($pdo);
    $check('the migration turns the ENUM into a VARCHAR', $colType() === 'varchar');
    $check('existing statuses keep their text', $pdo->query("SELECT GROUP_CONCAT(`status` ORDER BY `id`) FROM `invoices_offers`")->fetchColumn() === 'invoiced,sent,draft');

    $pdo->exec("INSERT INTO `invoices_offers` (`id`, `status`) VALUES ('d', 'cenova_ponuka_uzavreta')");
    $check('a custom key can now be stored', $pdo->query("SELECT `status` FROM `invoices_offers` WHERE `id` = 'd'")->fetchColumn() === 'cenova_ponuka_uzavreta');

    ccrm_migrate_invoice_status_varchar($pdo);
    $check('running the migration again changes nothing', $colType() === 'varchar'
        && (int)$pdo->query("SELECT COUNT(*) FROM `invoices_offers`")->fetchColumn() === 4);

    // The configured list is read from system_settings, once per request.
    $check('with nothing stored the group lookups use the built-ins',
        ccrm_offer_status_group('approved', $pdo) === 'won' && ccrm_offer_status_group('invoiced', $pdo) === 'won'
        && ccrm_offer_status_group('mystery', $pdo) === null);
    $check('the first status of a group skips the legacy one',
        ccrm_offer_status_in_group('won', $pdo) === 'approved' && ccrm_offer_status_in_group('open', $pdo) === 'sent'
        && ccrm_offer_status_in_group('draft', $pdo) === 'draft');
    $check('proformas and invoices read their own list: built-ins until one is stored',
        ccrm_invoice_status_group('invoiced', $pdo) === 'won' && ccrm_invoice_status_group('rejected', $pdo) === 'lost'
        && ccrm_invoice_status_group('cancelled', $pdo) === 'cancelled' && ccrm_invoice_status_group('paid', $pdo) === null);
    $pdo->exec('DROP TABLE `invoices_offers`');
    $pdo->exec('DROP TABLE `system_settings`');
} else {
    echo "skip database checks (set CCRM_TEST_DSN to run them against a scratch database)\n";
}

echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
exit($fails === 0 ? 0 : 1);
