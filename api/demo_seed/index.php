<?php
/**
 * Demo data seeding entry point.
 *
 * demo_seed_all() runs each module file in api/demo_seed/ in a fixed order.
 * A module file <module>.php defines demo_seed_<module>(PDO $pdo): void and is
 * idempotent: it deletes its own 'demo-%' rows, then inserts.
 *
 * Missing module files are skipped, and one failing module is logged without
 * stopping the others — a broken sample dataset must never break an install.
 *
 * Call it OUTSIDE a transaction: some modules create tables (DDL commits
 * implicitly in MySQL).
 */
require_once __DIR__ . '/helpers.php';

if (!function_exists('demo_seed_modules')) {

    /** Fixed order: later modules may link to rows created by earlier ones. */
    function demo_seed_modules(): array {
        return [
            'clients',
            'projects',
            'tasks',
            'offers',
            'warehouse',
            'finance',
            'workflows',
            'email',
            'meetings',
            'sai',
        ];
    }

    function demo_seed_all(PDO $pdo): void {
        foreach (demo_seed_modules() as $module) {
            $file = __DIR__ . '/' . $module . '.php';
            $fn = 'demo_seed_' . $module;
            if (!is_file($file)) {
                continue;
            }
            try {
                require_once $file;
                if (function_exists($fn)) {
                    $fn($pdo);
                }
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    try { $pdo->rollBack(); } catch (\Throwable $ignored) {}
                }
                error_log('[ccrm demo_seed] ' . $module . ' failed: ' . $e->getMessage());
            }
        }
    }
}
