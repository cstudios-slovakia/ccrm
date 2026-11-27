<?php
/**
 * demo_leave_demo_mode(): "Wipe demo data" - leave demo mode for a clean slate.
 *
 * This is NOT the re-seed wipe. demo_wipe_demo_rows() (wipe.php) removes the demo rows and nothing
 * else; this function is the documented behaviour of Settings › Wipe demo data (api/wipe_demo.php):
 * the CRM stops being a demo, so
 *
 *  1. every row of the transactional tables goes, demo or not, because what a user made on top of the
 *     demo (an offer on a demo client, a task on a demo project) would dangle without them. That includes
 *     the service desk (tickets, their messages, ticket time, task links, support contracts), time
 *     tracking (time entries, captured time activity) and the automation run history (workflow logs),
 *     which the endpoint used to leave behind;
 *  2. the remaining demo rows (everything with a demo- id, the ids of the older seeders, the demo mailbox,
 *     the demo WhatsApp numbers, the demo simulations and project-type tables) go through
 *     demo_wipe_demo_rows(), the single definition of "a demo row";
 *  3. last, in one transaction, so a failure before it leaves the instance a demo that can be wiped again:
 *     with $keepConfigs = false the lists, categories, project types, settings and ALL logins are replaced by a
 *     fresh install's (one admin with a random password, the pipeline lists in the installed language, the
 *     installed currency, no divisions); with $keepConfigs = true the settings and every login stay, DEMO_MODE
 *     goes to false and DEMO_DATASET (it describes data that no longer exists) is removed;
 *  4. DDL after everything committed: a project type of the demo gets its per-type tables dropped whether or not
 *     a hand-made project still has rows in them (every project is gone), and so does every SAI simulation
 *     (leaving demo mode removes them all, as it always did).
 *
 * Call it OUTSIDE a transaction. Returns ['wiped' => [table => rows removed by demo_wipe_demo_rows()],
 * 'adminEmail' => ?string, 'adminPassword' => ?string] - the admin is set only for a full reset.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/wipe.php';

if (!function_exists('demo_leave_demo_mode')) {

    /** The tables emptied completely, children first. Missing tables (an older install) are skipped. */
    function demo_leave_tables(): array {
        return [
            'order_items', 'orders',
            'invoice_offer_items', 'invoices_offers',
            'warehouse_movement_items', 'warehouse_movements', 'warehouse_batches', 'warehouse_stock', 'warehouse_items', 'warehouses', 'suppliers',
            'project_managers', 'projects',
            'employee_vacations', 'employee_salaries', 'employees',
            'timeline_events', 'lead_categories', 'leads',
            'task_assignees', 'tasks', /* recurring-template: leaving demo mode deletes every task */
            'financial_records',
            // what the endpoint missed (demo phase 5)
            'ticket_messages', 'ticket_time_entries', 'ticket_task_links', 'tickets', 'support_contracts',
            'time_entries', 'time_activity',
            'workflow_logs',
        ];
    }

    /** Tables that hang on a login (ON DELETE CASCADE in MySQL; the deletes below run with foreign keys off). */
    function demo_leave_user_tables(): array {
        return ['user_passkeys', 'user_remember_tokens', 'password_resets', 'mcp_keys', 'push_subscriptions'];
    }

    /** Roll back and switch foreign keys on again, whatever state the failure left. */
    function demo_leave_abort(PDO $pdo): void {
        if ($pdo->inTransaction()) {
            try { $pdo->rollBack(); } catch (\Throwable $ignored) {}
        }
        try { $pdo->exec("SET FOREIGN_KEY_CHECKS = 1"); } catch (\Throwable $ignored) {}
    }

    function demo_leave_demo_mode(PDO $pdo, bool $keepConfigs): array {
        if ($pdo->inTransaction()) {
            throw new \LogicException('demo_leave_demo_mode must run outside a transaction (it drops tables afterwards)');
        }
        $tableExists = static fn(string $t): bool => demo_table_exists($pdo, $t);

        // Read before the rows that describe them go: the per-type tables of a demo project type.
        $demoProjectTypeIds = [];
        if ($tableExists('project_types')) {
            $demoProjectTypeIds = $pdo->query("SELECT `id` FROM `project_types` WHERE `id` LIKE 'demo-%'")->fetchAll(PDO::FETCH_COLUMN);
        }
        // Kept across a full reset: the language the CRM was installed in and its currency.
        $systemLanguage = (string)$pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
        if (!in_array($systemLanguage, ['en', 'sk', 'hu'], true)) {
            $systemLanguage = 'sk';
        }
        $systemCurrency = (string)$pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_CURRENCY'")->fetchColumn();

        $adminEmail = null;
        $adminPassword = null;

        // --- A. every transactional row -------------------------------------------------------------------------
        $pdo->beginTransaction();
        try {
            // DELETE (not TRUNCATE): TRUNCATE commits implicitly in MySQL, which would make the rollback a no-op.
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
            foreach (demo_leave_tables() as $table) {
                if ($tableExists($table)) {
                    $pdo->exec("DELETE FROM `{$table}`");
                }
            }
            if (!$keepConfigs) {
                $pdo->exec("DELETE FROM `financial_categories`");
                foreach (['client_categories', 'offer_categories', 'project_types'] as $table) {
                    if ($tableExists($table)) {
                        $pdo->exec("DELETE FROM `{$table}`");
                    }
                }
            }
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            $pdo->commit();
        } catch (\Throwable $e) {
            demo_leave_abort($pdo);
            throw $e;
        }

        // --- B. what is left of the demo, by the one definition of a demo row ------------------------------------
        // The logins are handled in C (kept, or all replaced), so this call never deletes one. DEMO_MODE is still
        // on until C has run: if anything above or here fails, the instance is still a demo and the button works again.
        $wiped = demo_wipe_demo_rows($pdo, ['keepUsers' => true]);

        // --- C. logins and settings, in one transaction, last ----------------------------------------------------
        $pdo->beginTransaction();
        try {
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
            if (!$keepConfigs) {
                // Foreign keys are off in this transaction, so the cascade of the deleted logins is done by hand.
                foreach (demo_leave_user_tables() as $table) {
                    if ($tableExists($table)) {
                        $pdo->exec("DELETE FROM `{$table}`");
                    }
                }
                $pdo->exec("DELETE FROM `users`");
                $pdo->exec("DELETE FROM `system_settings`");

                // A RANDOM password (never a known default like "password"), returned once to the operator.
                $adminEmail = 'admin@crm.com';
                $adminPassword = bin2hex(random_bytes(6));
                $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`) VALUES (?, ?, ?, ?, ?, ?, ?)")
                    ->execute(['u-' . md5($adminEmail), 'Admin', $adminEmail, password_hash($adminPassword, PASSWORD_DEFAULT), 'admin', null, '#f43f5e']);

                // Pipeline labels, categories and task states are persisted values: seed them in the installed
                // language (shared with the setup wizard). No divisions, no finance categories: leaving demo mode.
                $settings = array_merge(['DEMO_MODE' => 'false'], ccrm_default_settings_for_language($systemLanguage));
                if ($systemCurrency !== '') {
                    $settings['SYSTEM_CURRENCY'] = $systemCurrency;
                }
                $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
                foreach ($settings as $k => $v) {
                    $insSet->execute([$k, $v]);
                }
            } else {
                $pdo->exec("INSERT INTO `system_settings` (`key`, `value`) VALUES ('DEMO_MODE', 'false') ON DUPLICATE KEY UPDATE `value` = 'false'");
                $pdo->exec("DELETE FROM `system_settings` WHERE `key` = 'DEMO_DATASET'");
            }
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            $pdo->commit();
        } catch (\Throwable $e) {
            demo_leave_abort($pdo);
            throw $e;
        }

        // DDL, after everything has committed.
        foreach ($demoProjectTypeIds as $typeId) {
            $safe = preg_replace('/[^a-z0-9_]/', '', strtolower((string)$typeId));
            if ($safe === '') continue;
            $pdo->exec("DROP TABLE IF EXISTS `proj_data_{$safe}`, `proj_timeline_{$safe}`, `proj_gantt_{$safe}`");
        }
        if ($tableExists('swarm_simulations')) {
            foreach ($pdo->query("SELECT `table_prefix` FROM `swarm_simulations`")->fetchAll(PDO::FETCH_COLUMN) as $prefix) {
                $prefix = preg_replace('/[^a-zA-Z0-9_]/', '', (string)$prefix);
                if ($prefix === '') continue;
                $pdo->exec("DROP TABLE IF EXISTS `{$prefix}nodes`, `{$prefix}edges`, `{$prefix}agents`, `{$prefix}posts`");
            }
            $pdo->exec("DELETE FROM `swarm_simulations`");
        }

        return ['wiped' => $wiped, 'adminEmail' => $adminEmail, 'adminPassword' => $adminPassword];
    }
}
