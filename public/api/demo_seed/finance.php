<?php
/**
 * Demo seed module: finance.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('finance', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 */
require_once __DIR__ . '/helpers.php';

function demo_seed_finance(PDO $pdo): void {
    // Not implemented yet.
}
