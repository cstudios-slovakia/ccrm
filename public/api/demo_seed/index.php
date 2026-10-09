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
 * Each module is atomic: a failure leaves none of its rows behind (see
 * demo_seed_run_module()).
 *
 * Call it OUTSIDE a transaction: some modules create tables (DDL commits
 * implicitly in MySQL), and the runner opens one transaction per module itself.
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

    /** Id prefixes a module's rows carry; the mail module uses 'demo-mail-'. */
    function demo_seed_module_prefixes(string $module): array {
        return $module === 'email' ? ['demo-email-', 'demo-mail-'] : ['demo-' . $module . '-'];
    }

    /**
     * Run one module all-or-nothing.
     *
     * The module runs in a transaction, so a failure rolls back everything it
     * wrote. A module that creates tables breaks that: DDL commits implicitly,
     * and what it wrote before the failure is already permanent. For that case
     * the module's own rows are deleted by id prefix instead (the module is
     * idempotent, so a rerun starts clean either way); the empty tables it
     * created stay, which is harmless.
     */
    function demo_seed_run_module(PDO $pdo, string $module, callable $fn): void {
        $ownTransaction = !$pdo->inTransaction();
        if ($ownTransaction) {
            $pdo->beginTransaction();
        }
        try {
            $fn($pdo);
            if ($ownTransaction && $pdo->inTransaction()) {
                $pdo->commit();
            }
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
                    demo_seed_run_module($pdo, $module, $fn);
                }
            } catch (\Throwable $e) {
                error_log('[ccrm demo_seed] ' . $module . ' failed: ' . $e->getMessage());
            }
        }
    }
}
