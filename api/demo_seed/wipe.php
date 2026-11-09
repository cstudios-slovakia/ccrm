<?php
/**
 * demo_wipe_demo_rows(): remove the demo data of every edition - and nothing else.
 *
 * This is the destructive half of a re-seed (api/demo_reseed.php, `php ccrm demo:seed`).
 * It deletes ONLY rows that belong to the demo dataset:
 *
 *  1. every id that starts with 'demo-' (demo_wipe_by_prefix: each string `id` column, the
 *     `*_id` columns of join tables, the mail caches on `email_uid`);
 *  2. every id of demo_legacy_ids() - what the pre-pack seeders wrote without the prefix
 *     (lead-1..3, emp-1..4, wh-1..2, ord-demo-*, tck-demo-*, sai-demo-1, ...). Exact ids are
 *     matched with `=` / IN, only entries containing '%' are LIKE patterns (an id such as
 *     'pt_luxury_stone' holds '_', a LIKE wildcard);
 *  3. rows derived from a demo id by another writer (the expense record sync creates for a
 *     demo salary, 'fr-sal-demo-...');
 *  4. the demo logins (B6): every address of demo_all_user_emails() - the three logins of
 *     all three editions plus the legacy alex@ / sam@ / jordan@crm.com - with their
 *     passkeys, remember tokens, password-reset tokens, MCP keys and push subscriptions;
 *     employees.user_id pointing at them is set to NULL;
 *  5. the demo WhatsApp "is registered" answers (keyed by phone, so no prefix finds them) of
 *     every edition's whatsapp_demo*.json, and the cached mail data of the demo logins;
 *     the newsletter's manual suppression (the demo lead L11's e-mail, no campaign) and the NEWSLETTER_CONFIG
 *     setting while it still carries the seeder's `demo` marker (demo_wipe_newsletter); the campaigns, their
 *     recipients and the bounced/unsubscribed suppressions go with step 1 through their demo- campaign id;
 *  6. after the DML transaction, because DDL commits implicitly in MySQL: the demo mailbox
 *     store, the sim<id>_* tables of the demo SAI simulations and the proj_data_/proj_timeline_/
 *     proj_gantt_ tables of the demo project types.
 *
 * What it never touches: a row whose id is neither 'demo-...' nor listed in
 * demo_legacy_ids(), a user whose e-mail is not a demo login, settings, the default financial
 * category tree. Records the user created by hand that POINT at a demo row survive with a
 * dangling link. Two DDL guards keep a user's rows alive: a per-type project table is only
 * dropped when every project in it is a demo project (otherwise just the demo rows go), and a
 * sim<id>_ table set is only dropped when no surviving simulation uses the same prefix.
 *
 * Options: ['keepUsers' => true] skips step 4 (every login stays; the cached mail data of the demo
 * addresses still goes, it is demo mail).
 *
 * Call it OUTSIDE a transaction (it opens its own, and the DDL step needs none open).
 * Returns the number of rows removed per table: ['leads' => 11, 'users' => 3, ...]
 * (a dropped table is counted with the rows it held).
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

if (!function_exists('demo_wipe_demo_rows')) {

    /** [table => [column, ...]] for every table of the current schema, in one query. */
    function demo_wipe_schema(PDO $pdo): array {
        $schema = [];
        $rows = $pdo->query(
            "SELECT `TABLE_NAME` AS t, `COLUMN_NAME` AS c FROM information_schema.COLUMNS WHERE `TABLE_SCHEMA` = DATABASE()"
        )->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $schema[(string)$r['t']][] = (string)$r['c'];
        }
        return $schema;
    }

    /** Add $n rows to the per-table counter. */
    function demo_wipe_count(array &$counts, string $table, int $n): void {
        if ($n > 0) {
            $counts[$table] = ($counts[$table] ?? 0) + $n;
        }
    }

    /** '?, ?, ?' for an IN list. */
    function demo_wipe_marks(array $values): string {
        return implode(', ', array_fill(0, count($values), '?'));
    }

    /**
     * DELETE FROM $table WHERE $col IN ($ids) OR $col LIKE $pattern ...
     * A missing table or column is skipped. Ids are exact matches; $patterns are LIKE patterns.
     */
    function demo_wipe_delete(PDO $pdo, array $schema, array &$counts, string $table, string $col, array $ids, array $patterns = []): void {
        if (!isset($schema[$table]) || !in_array($col, $schema[$table], true)) {
            return;
        }
        $t = str_replace('`', '', $table);
        $c = str_replace('`', '', $col);
        $ids = array_values(array_unique(array_map('strval', $ids)));
        if ($ids) {
            $stmt = $pdo->prepare("DELETE FROM `{$t}` WHERE `{$c}` IN (" . demo_wipe_marks($ids) . ")");
            $stmt->execute($ids);
            demo_wipe_count($counts, $table, $stmt->rowCount());
        }
        foreach ($patterns as $pattern) {
            $stmt = $pdo->prepare("DELETE FROM `{$t}` WHERE `{$c}` LIKE ?");
            $stmt->execute([$pattern]);
            demo_wipe_count($counts, $table, $stmt->rowCount());
        }
    }

    /** Rows another writer derives from a demo id (sync.php: 'fr-sal-' . salaryId, MCP: 'fr-inv-' . invoiceId). */
    function demo_wipe_derived_ids(): array {
        return [
            'financial_records' => ['fr-sal-demo-%', 'fr-inv-demo-%', 'fr-inv-inv-demo-%'],
        ];
    }

    /** The user ids of every demo login ever created: 'u-' . md5(e-mail) for demo_all_user_emails(). */
    function demo_wipe_user_ids(): array {
        return array_map('demo_user_id_for_email', demo_all_user_emails());
    }

    /**
     * Demo WhatsApp phone numbers (digits) of every edition: the `numbers` of
     * whatsapp_demo.json and of each whatsapp_demo.<lang>.json that exists.
     */
    function demo_wipe_whatsapp_phones(): array {
        $phones = [];
        foreach (glob(__DIR__ . '/whatsapp_demo*.json') ?: [] as $file) {
            $data = json_decode((string)file_get_contents($file), true);
            foreach ((is_array($data) ? ($data['numbers'] ?? []) : []) as $n) {
                $digits = preg_replace('/\D+/', '', (string)($n['phone'] ?? ''));
                if ($digits !== '') {
                    $phones[$digits] = true;
                }
            }
        }
        return array_keys($phones);
    }

    /**
     * Delete the demo logins and what is bound to them. Returns the deleted user ids.
     * Foreign keys are off in the caller's transaction, so ON DELETE CASCADE / SET NULL
     * are done here by hand.
     */
    function demo_wipe_users(PDO $pdo, array $schema, array &$counts): array {
        if (!isset($schema['users'])) {
            return [];
        }
        $emails = demo_all_user_emails();
        $knownIds = demo_wipe_user_ids();
        $ids = [];
        foreach ($pdo->query("SELECT `id`, `email` FROM `users`")->fetchAll(PDO::FETCH_ASSOC) as $u) {
            if (in_array(strtolower(trim((string)$u['email'])), $emails, true) || in_array((string)$u['id'], $knownIds, true)) {
                $ids[] = (string)$u['id'];
            }
        }
        if (!$ids) {
            return [];
        }
        foreach (['user_passkeys', 'user_remember_tokens', 'password_resets', 'mcp_keys', 'push_subscriptions'] as $table) {
            demo_wipe_delete($pdo, $schema, $counts, $table, 'user_id', $ids);
        }
        if (isset($schema['employees']) && in_array('user_id', $schema['employees'], true)) {
            $pdo->prepare("UPDATE `employees` SET `user_id` = NULL WHERE `user_id` IN (" . demo_wipe_marks($ids) . ")")->execute($ids);
        }
        demo_wipe_delete($pdo, $schema, $counts, 'users', 'id', $ids);
        return $ids;
    }

    /**
     * The newsletter rows the prefix wipe cannot find: the manual suppression of the demo lead L11 (no campaign,
     * so no demo- id; matched by the e-mail of every edition) and the NEWSLETTER_CONFIG the demo seeded. The
     * setting is deleted only while it still carries the seeder's `"demo": true` marker; the first save in
     * Settings drops the marker, so a configuration the user edited survives.
     */
    function demo_wipe_newsletter(PDO $pdo, array $schema, array &$counts): void {
        require_once __DIR__ . '/newsletter.php';
        demo_wipe_delete($pdo, $schema, $counts, 'newsletter_suppressions', 'email', demo_newsletter_manual_emails());
        if (isset($schema['system_settings'])) {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'NEWSLETTER_CONFIG'");
            $stmt->execute();
            $raw = $stmt->fetchColumn();
            $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
            if (is_array($decoded) && ($decoded['demo'] ?? null) === true) {
                demo_wipe_delete($pdo, $schema, $counts, 'system_settings', 'key', ['NEWSLETTER_CONFIG']);
            }
        }
    }

    /** The demo simulations as [id => table_prefix], read before their rows go. */
    function demo_wipe_simulations(PDO $pdo, array $schema): array {
        if (!isset($schema['swarm_simulations']) || !in_array('table_prefix', $schema['swarm_simulations'], true)) {
            return [];
        }
        $legacy = demo_legacy_ids()['swarm_simulations'] ?? [];
        $sims = [];
        foreach ($pdo->query("SELECT `id`, `table_prefix` FROM `swarm_simulations`")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $id = (string)$r['id'];
            if (strpos($id, 'demo-') === 0 || in_array($id, $legacy, true)) {
                $sims[$id] = (string)$r['table_prefix'];
            }
        }
        return $sims;
    }

    /** The demo project types (their ids), read before their rows go. */
    function demo_wipe_project_types(PDO $pdo, array $schema): array {
        if (!isset($schema['project_types'])) {
            return [];
        }
        $legacy = demo_legacy_ids()['project_types'] ?? [];
        $types = [];
        foreach ($pdo->query("SELECT `id` FROM `project_types`")->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $id = (string)$id;
            if (strpos($id, 'demo-') === 0 || in_array($id, $legacy, true)) {
                $types[] = $id;
            }
        }
        return $types;
    }

    /** The suffix sync.php gives the per-type tables: the id lower-cased, [a-z0-9_] only. */
    function demo_wipe_type_suffix(string $typeId): string {
        return preg_replace('/[^a-z0-9_]/', '', strtolower($typeId));
    }

    /** True for a project id that belongs to the demo dataset. */
    function demo_wipe_is_demo_project(string $projectId): bool {
        return strpos($projectId, 'demo-') === 0 || in_array($projectId, demo_legacy_ids()['projects'] ?? [], true);
    }

    /** Number of rows in a table (0 when it does not exist). */
    function demo_wipe_rows_in(PDO $pdo, array $schema, string $table): int {
        if (!isset($schema[$table])) {
            return 0;
        }
        return (int)$pdo->query("SELECT COUNT(*) FROM `" . str_replace('`', '', $table) . "`")->fetchColumn();
    }

    /**
     * The DDL half, after the DML transaction has committed. Drops what only the demo owned.
     * $sims = [id => prefix], $types = [project type id], $schema = the schema read BEFORE the
     * DML (so a table the DML emptied is still known).
     */
    function demo_wipe_ddl(PDO $pdo, array $schema, array $sims, array $types, array &$counts): void {
        // --- SAI: sim<id>_nodes / edges / agents / posts of the demo simulations ----------------
        if ($sims) {
            $surviving = [];
            if (isset($schema['swarm_simulations'])) {
                foreach ($pdo->query("SELECT `table_prefix` FROM `swarm_simulations`")->fetchAll(PDO::FETCH_COLUMN) as $p) {
                    $surviving[(string)$p] = true;
                }
            }
            foreach ($sims as $prefix) {
                // Only ever drop tables that match the shape SwarmManager creates, never a core table,
                // and never a set a surviving simulation still points at.
                if (!preg_match('/^sim[A-Za-z0-9_]*_$/', $prefix) || isset($surviving[$prefix])) {
                    continue;
                }
                foreach (['nodes', 'edges', 'agents', 'posts'] as $suffix) {
                    $table = $prefix . $suffix;
                    // Exact name match: '_' is a LIKE wildcard, so SHOW TABLES LIKE would find look-alikes.
                    if (!demo_table_exists($pdo, $table)) {
                        continue;
                    }
                    $n = (int)$pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
                    $pdo->exec("DROP TABLE IF EXISTS `{$table}`");
                    demo_wipe_count($counts, $table, $n);
                }
            }
        }

        // --- project types: proj_data_ / proj_timeline_ / proj_gantt_ <type> -------------------
        $survivingTypes = [];
        if ($types && isset($schema['project_types'])) {
            foreach ($pdo->query("SELECT `id` FROM `project_types`")->fetchAll(PDO::FETCH_COLUMN) as $id) {
                $survivingTypes[demo_wipe_type_suffix((string)$id)] = true;
            }
        }
        foreach ($types as $typeId) {
            $suffix = demo_wipe_type_suffix($typeId);
            if ($suffix === '' || isset($survivingTypes[$suffix])) {
                continue;
            }
            foreach (['proj_data_', 'proj_timeline_', 'proj_gantt_'] as $kind) {
                $table = $kind . $suffix;
                if (!demo_table_exists($pdo, $table)) {
                    continue;
                }
                // Read this table's own columns: it was not necessarily in $schema.
                $cols = [];
                $colStmt = $pdo->prepare("SELECT `COLUMN_NAME` AS c FROM information_schema.COLUMNS WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ?");
                $colStmt->execute([$table]);
                foreach ($colStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                    $cols[] = (string)$r['c'];
                }
                if (!in_array('project_id', $cols, true)) {
                    continue; // cannot tell whose rows these are: leave it
                }
                $mine = [];
                $theirs = 0;
                foreach ($pdo->query("SELECT `project_id` FROM `{$table}`")->fetchAll(PDO::FETCH_COLUMN) as $pid) {
                    if (demo_wipe_is_demo_project((string)$pid)) {
                        $mine[] = (string)$pid;
                    } else {
                        $theirs++;
                    }
                }
                if ($theirs === 0) {
                    $pdo->exec("DROP TABLE IF EXISTS `{$table}`");
                    demo_wipe_count($counts, $table, count($mine));
                } elseif ($mine) {
                    // A user's project lives in this table: keep it, remove only the demo rows.
                    $ids = array_values(array_unique($mine));
                    $stmt = $pdo->prepare("DELETE FROM `{$table}` WHERE `project_id` IN (" . demo_wipe_marks($ids) . ")");
                    $stmt->execute($ids);
                    demo_wipe_count($counts, $table, $stmt->rowCount());
                }
            }
        }

        // --- the demo mailbox store (and the demo profile on any user) -------------------------
        require_once dirname(__DIR__) . '/demo_mailbox.php';
        if (ccrm_demo_mailbox_table_exists($pdo)) {
            demo_wipe_count($counts, 'demo_mail_messages', (int)$pdo->query("SELECT COUNT(*) FROM `demo_mail_messages`")->fetchColumn());
        }
        ccrm_demo_mailbox_wipe($pdo);
    }

    function demo_wipe_demo_rows(PDO $pdo, array $options = []): array {
        // keepUsers: leave every login alone (api/wipe_demo.php keeps the accounts when the operator asked to
        // keep the configuration: the admin who clicked "wipe" is usually one of the demo logins).
        $keepUsers = !empty($options['keepUsers']);
        if ($pdo->inTransaction()) {
            throw new \LogicException('demo_wipe_demo_rows must run outside a transaction (its DDL step commits implicitly)');
        }
        $counts = [];
        $schema = demo_wipe_schema($pdo);

        // What needs DDL afterwards is read BEFORE the rows that describe it are deleted.
        $sims = demo_wipe_simulations($pdo, $schema);
        $types = demo_wipe_project_types($pdo, $schema);

        // The prefix wipe returns nothing, so count what it will delete first.
        foreach (demo_count_by_prefix($pdo, ['demo-']) as $table => $n) {
            demo_wipe_count($counts, $table, (int)$n);
        }

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        $pdo->beginTransaction();
        try {
            // 1. what the pre-pack seeders wrote without the prefix (users go through their e-mails)
            foreach (demo_legacy_ids() as $key => $values) {
                if ($key === 'users') {
                    continue;
                }
                [$table, $col] = strpos($key, '.') !== false ? explode('.', $key, 2) : [$key, 'id'];
                $exact = [];
                $patterns = [];
                foreach ($values as $v) {
                    if (strpos((string)$v, '%') !== false) {
                        $patterns[] = (string)$v;
                    } else {
                        $exact[] = (string)$v;
                    }
                }
                demo_wipe_delete($pdo, $schema, $counts, $table, $col, $exact, $patterns);
            }
            // 2. rows derived from a demo id
            foreach (demo_wipe_derived_ids() as $table => $patterns) {
                demo_wipe_delete($pdo, $schema, $counts, $table, 'id', [], $patterns);
            }
            // 3. everything with the demo- prefix
            demo_wipe_by_prefix($pdo, ['demo-']);
            // 4. the demo logins and what is bound to them
            if (!$keepUsers) {
                demo_wipe_users($pdo, $schema, $counts);
            }
            // 5. the demo WhatsApp number answers; cached mail data of the demo logins
            $phones = demo_wipe_whatsapp_phones();
            demo_wipe_delete($pdo, $schema, $counts, 'whatsapp_numbers', 'phone_digits', $phones);
            require_once dirname(__DIR__) . '/demo_mailbox.php';
            $mailUsers = array_merge(demo_all_user_emails(), [CCRM_DEMO_TEAM_MAILBOX]);
            demo_wipe_delete($pdo, $schema, $counts, 'email_summaries', 'user_email', $mailUsers);
            demo_wipe_delete($pdo, $schema, $counts, 'rag_emails', 'user_email', $mailUsers);
            // 5b. the newsletter's manual suppression and its demo configuration
            demo_wipe_newsletter($pdo, $schema, $counts);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                try { $pdo->rollBack(); } catch (\Throwable $ignored) {}
            }
            try { $pdo->exec('SET FOREIGN_KEY_CHECKS = 1'); } catch (\Throwable $ignored) {}
            throw $e;
        }

        try {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
            // 6. DDL last: it commits implicitly, so it cannot share the transaction above.
            demo_wipe_ddl($pdo, $schema, $sims, $types, $counts);
        } finally {
            try { $pdo->exec('SET FOREIGN_KEY_CHECKS = 1'); } catch (\Throwable $ignored) {}
        }

        ksort($counts);
        return $counts;
    }
}
