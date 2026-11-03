<?php
/**
 * Shared helpers for the demo seeders in api/demo_seed/.
 *
 * Every module codes against these signatures — change them only together
 * with every module that calls them.
 *
 * Conventions:
 *  - Dates are relative to the install date (today), so a demo installed in
 *    any month opens on recent, plausible data.
 *  - Every seeded row carries an id from demo_id(), i.e. 'demo-<module>-<n>'.
 *    api/wipe_demo.php removes everything with the 'demo-' prefix.
 *
 * Language, currency, money and text live in context.php; packs and refs in
 * packs.php. This file keeps the id/date/user/wipe helpers and requires both, so a
 * module that requires helpers.php has the whole toolbox.
 */
require_once __DIR__ . '/context.php';
require_once __DIR__ . '/packs.php';

if (!function_exists('demo_d')) {

    /** 'Y-m-d' relative to today. Negative = past. */
    function demo_d(int $dayOffset): string {
        return (new \DateTimeImmutable('today'))->modify(sprintf('%+d days', $dayOffset))->format('Y-m-d');
    }

    /** 'Y-m-d H:i:s' relative to today, at the given 'H:i' (or 'H:i:s'). */
    function demo_dt(int $dayOffset, string $time = '09:00'): string {
        if (!preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $time)) {
            $time = '09:00';
        }
        if (substr_count($time, ':') === 1) {
            $time .= ':00';
        }
        return demo_d($dayOffset) . ' ' . $time;
    }

    /** The three login roles, in a fixed order. Modules refer to users by these, never by name or e-mail. */
    function demo_user_roles(): array {
        return ['owner', 'pm', 'sales'];
    }

    /** User id scheme shared with setup.php/sync.php: 'u-' . md5(lowercase e-mail). */
    function demo_user_id_for_email(string $email): string {
        return 'u-' . md5(strtolower(trim($email)));
    }

    /**
     * The edition's three logins, keyed by role: ['owner' => ['name', 'first', 'last',
     * 'email', 'id', 'role' (system role), 'color', 'title'], 'pm' => …, 'sales' => …].
     * Names and e-mails come from the company pack of the context's language (B6).
     * Pass $pdo when no context exists yet; the runner has always built it already.
     */
    function demo_users(?PDO $pdo = null): array {
        if ($pdo !== null) {
            $lang = demo_ctx($pdo)['lang'];
        } else {
            $lang = demo_ctx_current()['lang'];
        }
        $users = [];
        foreach (demo_company_pack($lang)['users'] as $role => $u) {
            $users[$role] = $u + ['id' => demo_user_id_for_email((string)$u['email'])];
        }
        return $users;
    }

    /** The three display names in role order (owner, pm, sales). */
    function demo_user_names(?PDO $pdo = null): array {
        return array_values(array_map(static fn(array $u): string => (string)$u['name'], demo_users($pdo)));
    }

    /**
     * Ids of the three logins. Keys: the role ('owner'), the display name, and - until
     * phase 5 removes the last pre-pack caller - the old first names Alex / Sam / Jordan,
     * so a module that has not been ported yet still resolves 'Alex' to the owner.
     * The ids are deterministic ('u-' . md5(e-mail)); no query is needed.
     */
    function demo_user_ids(?PDO $pdo = null): array {
        $ids = [];
        $legacy = ['owner' => 'Alex', 'pm' => 'Sam', 'sales' => 'Jordan'];
        foreach (demo_users($pdo) as $role => $u) {
            $ids[$role] = $u['id'];
            $ids[(string)$u['name']] = $u['id'];
            $ids[$legacy[$role]] = $ids[$legacy[$role]] ?? $u['id'];
        }
        return $ids;
    }

    /**
     * Every address a demo login ever had: the three logins of all three editions
     * plus the pre-pack alex@ / sam@ / jordan@crm.com. A re-seed and the wipe delete
     * exactly these (B6) - never any other user.
     */
    function demo_all_user_emails(): array {
        $emails = ['alex@crm.com', 'sam@crm.com', 'jordan@crm.com'];
        foreach (['sk', 'hu', 'en'] as $lang) {
            foreach (demo_company_pack($lang)['users'] as $u) {
                $emails[] = strtolower((string)$u['email']);
            }
        }
        return array_values(array_unique($emails));
    }

    /** Install language: 'sk' | 'en' | 'hu', default 'sk' (the context's lang; see context.php). */
    function demo_lang(PDO $pdo): string {
        return demo_ctx($pdo)['lang'];
    }

    /** Pick the text for $lang from ['sk' => …, 'en' => …, 'hu' => …], falling back to 'en'. */
    function demo_t(array $byLang, string $lang): string {
        if (isset($byLang[$lang])) return (string)$byLang[$lang];
        if (isset($byLang['en'])) return (string)$byLang['en'];
        $first = reset($byLang);
        return $first === false ? '' : (string)$first;
    }

    /** Deterministic id 'demo-<module>-<n>' so wipe_demo.php can match by prefix. */
    function demo_id(string $module, int $n): string {
        return 'demo-' . $module . '-' . $n;
    }

    /**
     * Delete every row whose id starts with one of $prefixes (e.g. ['demo-']).
     * Matches each string `id` column; join tables without an `id` are matched on
     * their `*_id` columns instead, and the mail caches on `email_uid`.
     *
     * Plain DELETEs, so it joins a caller's transaction. It does not touch
     * FOREIGN_KEY_CHECKS: a caller that needs unordered deletes sets it.
     */
    function demo_wipe_by_prefix(PDO $pdo, array $prefixes): void {
        $cols = $pdo->query(
            "SELECT `TABLE_NAME` AS t, `COLUMN_NAME` AS c FROM information_schema.COLUMNS
              WHERE `TABLE_SCHEMA` = DATABASE()
                AND `DATA_TYPE` IN ('varchar', 'char')
                AND (`COLUMN_NAME` = 'id' OR `COLUMN_NAME` = 'email_uid' OR `COLUMN_NAME` LIKE '%\_id')"
        )->fetchAll(PDO::FETCH_ASSOC);
        $tablesWithId = [];
        foreach ($cols as $col) {
            if ($col['c'] === 'id') $tablesWithId[$col['t']] = true;
        }
        foreach ($cols as $col) {
            $isIdCol = $col['c'] === 'id' || $col['c'] === 'email_uid';
            if (!$isIdCol && isset($tablesWithId[$col['t']])) continue;
            $t = str_replace('`', '', $col['t']);
            $c = str_replace('`', '', $col['c']);
            $stmt = $pdo->prepare("DELETE FROM `{$t}` WHERE `{$c}` LIKE ?");
            foreach ($prefixes as $prefix) {
                $stmt->execute([$prefix . '%']);
            }
        }
    }

    /**
     * Count the rows a prefix wipe would delete, per table - the same columns
     * demo_wipe_by_prefix() matches. Returns ['table' => n] for the tables with at
     * least one row. The runner uses it to report rows for a module that does not
     * return its own count; phase 3 can use it for a dry run.
     */
    function demo_count_by_prefix(PDO $pdo, array $prefixes): array {
        $cols = $pdo->query(
            "SELECT `TABLE_NAME` AS t, `COLUMN_NAME` AS c FROM information_schema.COLUMNS
              WHERE `TABLE_SCHEMA` = DATABASE()
                AND `DATA_TYPE` IN ('varchar', 'char')
                AND (`COLUMN_NAME` = 'id' OR `COLUMN_NAME` = 'email_uid' OR `COLUMN_NAME` LIKE '%\_id')"
        )->fetchAll(PDO::FETCH_ASSOC);
        $tablesWithId = [];
        foreach ($cols as $col) {
            if ($col['c'] === 'id') $tablesWithId[$col['t']] = true;
        }
        $counts = [];
        foreach ($cols as $col) {
            $isIdCol = $col['c'] === 'id' || $col['c'] === 'email_uid';
            if (!$isIdCol && isset($tablesWithId[$col['t']])) continue;
            $t = str_replace('`', '', $col['t']);
            $c = str_replace('`', '', $col['c']);
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$t}` WHERE `{$c}` LIKE ?");
            foreach ($prefixes as $prefix) {
                $stmt->execute([$prefix . '%']);
                $n = (int)$stmt->fetchColumn();
                if ($n > 0) $counts[$t] = ($counts[$t] ?? 0) + $n;
            }
        }
        return $counts;
    }

    /**
     * The exact ids the PRE-PACK seeders wrote - everything that does not carry the
     * 'demo-' prefix - read off the code as it stood when the packs were introduced:
     *
     *   setup.php inline block  leads lead-1..3, ev-*, email-*, task-*, their join rows
     *   schema.php              ccrm_seed_default_employees / _warehouses_and_items /
     *                           _orders / _invoices_and_projects / _tickets
     *   demo_seed/sai.php       the old 'sai-demo-1' simulation
     *
     * Shape: [ 'table' => [ids and patterns…], 'table.column' => […] ].
     *  - A key without a dot is matched on the table's `id` column; 'table.column' is
     *    for tables with no `id` (join tables) and names the column to match.
     *  - A value containing '%' is a LIKE pattern, anything else is an exact id.
     *    Never LIKE an exact id: ids such as 'pt_luxury_stone' contain '_'.
     *
     * Consumers: the re-seed wipe (phase 3) and the cutover (phase 5). Not included on
     * purpose: the default financial category tree (`fc-*`, still reused by the
     * finance module) and the users - those go through demo_all_user_emails().
     */
    function demo_legacy_ids(): array {
        $leadIds = ['lead-1', 'lead-2', 'lead-3'];
        $taskIds = ['task-1', 'task-2', 'task-3'];
        $empIds = ['emp-1', 'emp-2', 'emp-3', 'emp-4'];
        $projIds = ['proj-vila-slavin', 'proj-kuchyna-neolith'];
        $whIds = ['wh-1', 'wh-2'];
        return [
            // setup.php inline demo block
            'leads' => $leadIds,
            'lead_categories.lead_id' => $leadIds,
            'timeline_events' => ['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5', 'email-10412', 'email-10457'],
            'tasks' => $taskIds,
            'task_assignees.task_id' => $taskIds,
            // ccrm_seed_default_employees (+ the expense rows sync derives from salaries)
            'employees' => $empIds,
            'employee_salaries' => ['sal-emp-%'],
            'employee_vacations' => ['vac-demo-%'],
            'financial_records' => ['fr-sal-sal-emp-%'],
            // ccrm_seed_default_warehouses_and_items
            'warehouses' => $whIds,
            'suppliers' => ['sup-1', 'sup-2', 'sup-3'],
            'warehouse_items' => ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
            'warehouse_stock.warehouse_id' => $whIds,
            'warehouse_batches' => ['bat-1', 'bat-2', 'bat-3'],
            'warehouse_movements' => ['mov-1', 'mov-2', 'mov-3'],
            'warehouse_movement_items' => ['mvi-1', 'mvi-2', 'mvi-3'],
            // ccrm_seed_default_orders
            'orders' => ['ord-demo-%'],
            'order_items' => ['oi-demo-%'],
            // ccrm_seed_default_invoices_and_projects
            'project_types' => ['pt_luxury_stone'],
            'projects' => $projIds,
            'project_managers.project_id' => $projIds,
            'invoices_offers' => ['off-demo-%', 'inv-demo-%'],
            'invoice_offer_items' => ['ioi-demo-%'],
            // ccrm_seed_default_tickets
            'support_contracts' => ['sc-demo-%'],
            'tickets' => ['tck-demo-%'],
            'ticket_messages' => ['tmsg-demo-%'],
            'ticket_time_entries' => ['ttime-demo-%'],
            // demo_seed/sai.php before it moved to demo-sai-*
            'swarm_simulations' => ['sai-demo-1'],
            // the "is this number on WhatsApp" answers of the single whatsapp_demo.json (before the
            // per-edition files had other numbers); keyed by phone, so no prefix finds them
            'whatsapp_numbers.phone_digits' => ['421903245118', '4934199026118', '36304821170', '498921554780', '421918402665', '421907316520'],
            // the three pre-pack logins (their e-mails: demo_all_user_emails())
            'users' => [
                demo_user_id_for_email('alex@crm.com'),
                demo_user_id_for_email('sam@crm.com'),
                demo_user_id_for_email('jordan@crm.com'),
            ],
        ];
    }
}
