<?php
/**
 * Demo seed module: tasks.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('tasks', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 */
require_once __DIR__ . '/helpers.php';

function demo_seed_tasks(PDO $pdo): void {
    // Not implemented yet.
}
