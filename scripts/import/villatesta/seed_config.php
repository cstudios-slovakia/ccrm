<?php
/**
 * Instance configuration of the Villatesta migration (PLAN.md section B), written by
 * `load.php --only=config` (or any full load). Everything is *merged*: a list gets the
 * entries it lacks and keeps what an admin added, a role or category that exists is left
 * alone. A list that still holds the installer's default seed is replaced, because those
 * five generic states mean nothing to this company.
 *
 * What it sets (PLAN id):
 *   B1  roles Administrativa and Predajca in ROLES_RBAC (Admin comes with the app)
 *   B2  LEAD_STATES / colours / stage groups, LEAD_SOURCES (+ids, colours), LEAD_CATEGORIES (+ids, colours)
 *   B3  client categories
 *   B4  project type "Zákazka" and PROJECT_STATUSES
 *   B5  default warehouse "Hlavný sklad", the five price levels Cena 1..5
 * Not set: DIVISIONS (question Q3 is open), company billing data (the old CRM holds none).
 */

const VT_PROJECT_TYPE_ID = 'pt-vt-zakazka';
const VT_WAREHOUSE_ID = 'wh-vt-main';
const VT_PRICE_LEVELS = [['id' => 'pl-cena-1', 'name' => 'Cena 1'], ['id' => 'pl-cena-2', 'name' => 'Cena 2'], ['id' => 'pl-cena-3', 'name' => 'Cena 3'], ['id' => 'pl-cena-4', 'name' => 'Cena 4'], ['id' => 'pl-cena-5', 'name' => 'Cena 5']];

if (!function_exists('vt_seed_config')) {

    /** [state, group, colour] in pipeline order (B2). */
    function vt_lead_state_defs(): array {
        return [
            ['Nekontaktovaný', 'new', '#64748b'],
            ['V procese kontaktovania', 'in_progress', '#0ea5e9'],
            ['Nový záujemca', 'in_progress', '#06b6d4'],
            ['Cenová ponuka v procese', 'in_progress', '#8b5cf6'],
            ['Cenová ponuka odoslaná', 'in_progress', '#6366f1'],
            ['Precenenie', 'in_progress', '#f59e0b'],
            ['Akceptovaná', 'closed', '#10b981'],
            ['Odmietnutá', 'closed', '#ef4444'],
            ['Zrušená', 'closed', '#f43f5e'],
            ['Nezáujem', 'closed', '#94a3b8'],
        ];
    }

    function vt_source_defs(): array {
        return [
            ['Showroom BA', '#0ea5e9'], ['Showroom KE', '#14b8a6'], ['Showroom KN', '#22c55e'],
            ['web .sk - CP', '#6366f1'], ['web .hu - CP', '#8b5cf6'], ['Facebook', '#3b82f6'],
            ['web .sk - kontakt', '#a855f7'], ['web .hu - kontakt', '#d946ef'],
            ['web .sk - produkt', '#ec4899'], ['web .hu - produkt', '#f43f5e'],
            ['web .sk - katalóg', '#f97316'], ['web .hu - katalóg', '#f59e0b'],
            ['odporúčanie - Architekt', '#84cc16'], ['odporúčanie - Realizátor', '#10b981'],
            ['Pôvodný CRM', '#94a3b8'],
        ];
    }

    function vt_category_defs(): array {
        return [
            ['Strešná krytina', '#f97316'], ['Obklad', '#0ea5e9'], ['Dlažba', '#6366f1'],
            ['Individuálne spracovanie', '#a855f7'], ['Potrebuje poradiť', '#64748b'],
        ];
    }

    /** slug => name, B3. The extract refers to the slug; the id is cc-vt-<slug>. */
    function vt_client_category_defs(): array {
        return [
            'klient' => ['Klient', '#0ea5e9'], 'architekt' => ['Architekt', '#8b5cf6'], 'vyrobca' => ['Výrobca', '#f59e0b'],
            'realizacna-stavebna' => ['Realizačná firma – Stavebná', '#10b981'], 'realizacna-strecharska' => ['Realizačná firma – Strechárska', '#f97316'],
            'predajca' => ['Predajca', '#6366f1'],
        ];
    }

    /** B4: the attributes of the project type. Ids become the proj_data_ columns (attr_<id>). */
    function vt_project_attributes(): array {
        $sel = fn(string $id, string $name, array $opts) => ['id' => $id, 'name' => $name, 'type' => 'select', 'required' => false, 'options' => $opts];
        return [
            ['id' => 'vt_location', 'name' => 'Miesto realizácie', 'type' => 'textfield', 'required' => false],
            ['id' => 'vt_contact', 'name' => 'Meno kontaktu', 'type' => 'textfield', 'required' => false],
            $sel('vt_first_contact', 'Prvý kontakt', ['Showroom BA', 'Showroom KE', 'Showroom KN', 'web .sk - CP', 'Facebook', 'web .hu - CP', 'web .sk - kontakt', 'web .hu - kontakt', 'web .sk - produkt', 'web .hu - produkt']),
            $sel('vt_project_type', 'Typ projektu', ['Rodinný dom', 'Byt', 'Terasa', 'Priemyselný / väčší projekt', 'Iné']),
            ['id' => 'vt_area', 'name' => 'Plocha m²', 'type' => 'number', 'required' => false],
            $sel('vt_custom', 'Individuálne spracovanie', ['Áno', 'Nie']),
            $sel('vt_custom_detail', 'Detail individuálneho spracovania', ['Rezanie', 'Individuálny rozmer', 'Špeciálne vyhotovenie']),
            $sel('vt_deadline', 'Termín realizácie', ['Ihneď', 'Do 1 mesiaca', '1 – 3 mesiace', 'Len sa informuje']),
            ['id' => 'vt_product', 'name' => 'Produkt', 'type' => 'textfield', 'required' => false],
            ['id' => 'vt_product_desc', 'name' => 'Popis produktu', 'type' => 'textarea', 'required' => false],
            ['id' => 'vt_cadastral', 'name' => 'Katastrálne územie', 'type' => 'textfield', 'required' => false],
            ['id' => 'vt_parcel', 'name' => 'Číslo parcely', 'type' => 'textfield', 'required' => false],
            // The plan names the 4 legacy product types; the old CRM mixes them with the 5 current ones, so the
            // checkbox uses the lead categories - one vocabulary for leads, clients and projects.
            ['id' => 'vt_product_types', 'name' => 'Typy produktov', 'type' => 'checkbox', 'required' => false, 'options' => array_column(vt_category_defs(), 0)],
        ];
    }

    function vt_project_status_defs(): array {
        return [
            ['key' => 'new', 'label' => 'Nová zákazka', 'color' => '#0ea5e9', 'group' => 'new'],
            ['key' => 'dohodnute_stretnutie', 'label' => 'Dohodnuté stretnutie', 'color' => '#06b6d4', 'group' => 'in_progress'],
            ['key' => 'obhliadka', 'label' => 'Obhliadka', 'color' => '#8b5cf6', 'group' => 'in_progress'],
            ['key' => 'konzultacia', 'label' => 'Konzultácia', 'color' => '#a855f7', 'group' => 'in_progress'],
            ['key' => 'zameranie', 'label' => 'Zameranie', 'color' => '#6366f1', 'group' => 'in_progress'],
            ['key' => 'vypracovanie_cenovej_ponuky', 'label' => 'Vypracovanie cenovej ponuky', 'color' => '#f59e0b', 'group' => 'in_progress'],
            ['key' => 'completed', 'label' => 'Dokončená', 'color' => '#10b981', 'group' => 'completed'],
            ['key' => 'cancelled', 'label' => 'Vylúčený', 'color' => '#f43f5e', 'group' => 'cancelled'],
        ];
    }

    /** The permission maps of the two roles (B1). A proposal: the old CRM's role rights were route-level and do not translate 1:1. */
    function vt_role_defs(): array {
        $none = [
            'dashboard.custom' => 'nothing', 'tickets' => 'nothing', 'tickets.delete' => 'nothing', 'financial' => 'nothing', 'financial.delete' => 'nothing',
            'employees' => 'nothing', 'employees.delete' => 'nothing', 'employees.salaries' => 'nothing', 'employees.vacations' => 'nothing',
            'employees.files' => 'nothing', 'employees.personal' => 'nothing', 'unified_entries' => 'nothing', 'unified_entries.delete' => 'nothing',
            'automation' => 'nothing', 'social_media' => 'nothing', 'overview' => 'nothing', 'rag_ai' => 'nothing',
            'general_config' => 'nothing', 'pm_managers' => 'nothing', 'pipeline_stages' => 'nothing', 'traffic_sources' => 'nothing',
            'ai_config' => 'nothing', 'system_reset' => 'nothing', 'nav_edit' => 'nothing',
            'self.profile' => 'nothing', 'self.payroll' => 'nothing', 'self.vacations' => 'nothing', 'self.files' => 'nothing', 'self.hours' => 'nothing',
        ];
        $common = $none + [
            'dashboard' => 'edit', 'tasks' => 'edit', 'tasks.delete' => 'nothing', 'tasks.view_all' => 'edit',
            'leads' => 'edit', 'clients' => 'edit', 'projects' => 'edit', 'orders' => 'edit', 'invoices' => 'edit',
            'warehouse' => 'view', 'meetings' => 'edit', 'meetings.delete' => 'nothing', 'files' => 'edit', 'files.delete' => 'nothing',
            'email' => 'edit', 'updates' => 'edit', 'self.account' => 'edit',
        ];
        $sales = array_merge($common, ['leads.delete' => 'nothing', 'clients.delete' => 'nothing', 'projects.delete' => 'nothing', 'orders.delete' => 'nothing', 'invoices.delete' => 'nothing', 'warehouse.delete' => 'nothing']);
        $office = array_merge($common, [
            'leads.delete' => 'edit', 'clients.delete' => 'edit', 'projects.delete' => 'edit', 'orders.delete' => 'edit', 'invoices.delete' => 'edit',
            'warehouse' => 'edit', 'warehouse.delete' => 'edit', 'financial' => 'view', 'tickets' => 'edit', 'tickets.delete' => 'nothing',
        ]);
        return [['name' => 'Administrativa', 'permissions' => $office], ['name' => 'Predajca', 'permissions' => $sales]];
    }

    /** True when a stored list is the installer seed in any language (or empty), so it may be replaced. */
    function vt_is_installer_default(array $stored, string $key): bool {
        if (!$stored) return true;
        $langs = ['en', 'sk', 'hu'];
        $field = ['LEAD_STATES' => 'leadStates', 'LEAD_SOURCES' => 'leadSources', 'LEAD_CATEGORIES' => 'leadCategories'][$key] ?? null;
        if ($field === null || !function_exists('ccrm_default_lists')) return false;
        foreach ($langs as $lang) {
            if ($stored === ccrm_default_lists($lang)[$field]) return true;
        }
        return false;
    }

    function vt_setting_get(PDO $pdo, string $key) {
        $st = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
        $st->execute([$key]);
        $raw = $st->fetchColumn();
        return $raw === false ? null : json_decode((string)$raw, true);
    }

    function vt_setting_put(PDO $pdo, string $key, $value): void {
        $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
            ->execute([$key, is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    }

    /**
     * Merges `$wanted` names into the list stored under `$key`. Returns the final list.
     * Companion maps (colours, ids) are merged by the caller with vt_merge_map().
     */
    function vt_merge_list(PDO $pdo, string $key, array $wanted): array {
        $stored = vt_setting_get($pdo, $key);
        $stored = is_array($stored) ? array_values($stored) : [];
        if (vt_is_installer_default($stored, $key)) {
            $final = $wanted;
        } else {
            $final = $stored;
            $lower = array_map('mb_strtolower', $stored);
            foreach ($wanted as $name) if (!in_array(mb_strtolower($name), $lower, true)) $final[] = $name;
        }
        vt_setting_put($pdo, $key, $final);
        return $final;
    }

    /** Adds keys the stored map lacks; an existing key is never overwritten (an admin may have recoloured it). */
    function vt_merge_map(PDO $pdo, string $key, array $wanted, bool $replaceDefaults = false): array {
        $stored = vt_setting_get($pdo, $key);
        $stored = is_array($stored) ? $stored : [];
        $final = $replaceDefaults ? $wanted : $stored + array_diff_key($wanted, $stored);
        vt_setting_put($pdo, $key, $final ?: (object)[]);
        return $final;
    }

    function vt_seed_config(PDO $pdo, VtReport $report): void {
        // pipeline states
        $defs = vt_lead_state_defs();
        $statesBefore = vt_setting_get($pdo, 'LEAD_STATES');
        $replace = vt_is_installer_default(is_array($statesBefore) ? $statesBefore : [], 'LEAD_STATES');
        vt_merge_list($pdo, 'LEAD_STATES', array_column($defs, 0));
        $groups = [];
        $colors = [];
        foreach ($defs as [$name, $group, $color]) { $groups[mb_strtolower($name)] = $group; $colors[mb_strtolower($name)] = $color; }
        vt_merge_map($pdo, 'LEAD_STAGE_GROUPS', $groups, $replace);
        vt_merge_map($pdo, 'LEAD_STATE_COLORS', $colors, $replace);
        if (vt_setting_get($pdo, 'LEAD_STATE_PARENTS') === null) vt_setting_put($pdo, 'LEAD_STATE_PARENTS', (object)[]);
        $report->note('Lead states: ' . ($replace ? 'installer defaults replaced' : 'merged into the existing list'));

        // sources
        $srcDefs = vt_source_defs();
        $srcBefore = vt_setting_get($pdo, 'LEAD_SOURCES');
        $srcReplace = vt_is_installer_default(is_array($srcBefore) ? $srcBefore : [], 'LEAD_SOURCES');
        $sources = vt_merge_list($pdo, 'LEAD_SOURCES', array_column($srcDefs, 0));
        vt_merge_map($pdo, 'LEAD_SOURCE_COLORS', array_column($srcDefs, 1, 0), $srcReplace);
        $ids = vt_setting_get($pdo, 'LEAD_SOURCE_IDS');
        $ids = (is_array($ids) && $ids && !$srcReplace) ? $ids : [];
        if (function_exists('ccrm_normalize_list_ids')) {
            // Frozen ids: the web forms address a source by number, so keep every number already issued.
            $ids = $srcReplace ? ccrm_normalize_list_ids($sources, []) : ccrm_normalize_list_ids($sources, $ids);
            vt_setting_put($pdo, 'LEAD_SOURCE_IDS', $ids);
        }

        // categories
        $catDefs = vt_category_defs();
        $catBefore = vt_setting_get($pdo, 'LEAD_CATEGORIES');
        $catReplace = vt_is_installer_default(is_array($catBefore) ? $catBefore : [], 'LEAD_CATEGORIES');
        $cats = vt_merge_list($pdo, 'LEAD_CATEGORIES', array_column($catDefs, 0));
        vt_merge_map($pdo, 'LEAD_CATEGORY_COLORS', array_column($catDefs, 1, 0), $catReplace);
        $catIds = vt_setting_get($pdo, 'LEAD_CATEGORY_IDS');
        $catIds = (is_array($catIds) && $catIds && !$catReplace) ? $catIds : [];
        if (function_exists('ccrm_normalize_list_ids')) {
            vt_setting_put($pdo, 'LEAD_CATEGORY_IDS', $catReplace ? ccrm_normalize_list_ids($cats, []) : ccrm_normalize_list_ids($cats, $catIds));
        }

        // roles (B1)
        $roles = vt_setting_get($pdo, 'ROLES_RBAC');
        $roles = (is_array($roles) && $roles) ? $roles : (function_exists('ccrm_fallback_roles') ? ccrm_fallback_roles() : []);
        $have = array_map(fn($r) => mb_strtolower(trim((string)($r['name'] ?? ''))), $roles);
        foreach (vt_role_defs() as $role) {
            if (!in_array(mb_strtolower($role['name']), $have, true)) { $roles[] = $role; $report->count('roles created'); }
        }
        vt_setting_put($pdo, 'ROLES_RBAC', array_values($roles));

        // client categories (B3)
        $insCat = $pdo->prepare("INSERT INTO `client_categories` (`id`, `name`, `parent_id`, `level`, `sort_order`, `color`) VALUES (?, ?, NULL, 1, ?, ?) ON DUPLICATE KEY UPDATE `name` = `name`");
        $i = 0;
        foreach (vt_client_category_defs() as $slug => [$name, $color]) { $insCat->execute(["cc-vt-{$slug}", $name, $i++, $color]); }
        $report->set('client categories', $i);

        // project statuses and the project type (B4)
        $statuses = vt_setting_get($pdo, 'PROJECT_STATUSES');
        $builtinOnly = !is_array($statuses) || !$statuses || array_column($statuses, 'key') === ['new', 'active', 'on_hold', 'completed', 'cancelled'];
        if ($builtinOnly) vt_setting_put($pdo, 'PROJECT_STATUSES', vt_project_status_defs());
        else {
            $keys = array_column($statuses, 'key');
            foreach (vt_project_status_defs() as $d) if (!in_array($d['key'], $keys, true)) $statuses[] = $d;
            vt_setting_put($pdo, 'PROJECT_STATUSES', $statuses);
        }
        $pdo->prepare(
            "INSERT INTO `project_types` (`id`, `name`, `description`, `icon`, `color`, `attributes_json`, `has_timeline`, `has_gantt`, `has_deadline`, `has_invoice_date`, `deadline_warning_days`, `deadline_required`, `has_files`, `has_tickets`, `file_fields_json`, `list_columns_json`, `timeline_event_types_json`, `timeline_attributes_json`)
             VALUES (?, 'Zákazka', 'Zákazky z pôvodného CRM', 'Layers', '#b45309', ?, 1, 0, 0, 0, 0, 0, 1, 0, '[]', '[]', '[]', '[]')
             ON DUPLICATE KEY UPDATE `attributes_json` = VALUES(`attributes_json`)"
        )->execute([VT_PROJECT_TYPE_ID, json_encode(vt_project_attributes(), JSON_UNESCAPED_UNICODE)]);

        // price levels (A2) and the default warehouse (B5)
        $levels = vt_setting_get($pdo, 'PRICE_LEVELS');
        $levels = is_array($levels) ? $levels : [];
        $haveIds = array_column($levels, 'id');
        foreach (VT_PRICE_LEVELS as $lv) if (!in_array($lv['id'], $haveIds, true)) $levels[] = $lv;
        vt_setting_put($pdo, 'PRICE_LEVELS', array_values($levels));

        $wh = $pdo->query("SELECT `id` FROM `warehouses` WHERE `is_default` = 1 LIMIT 1")->fetchColumn();
        if (!$wh) {
            $pdo->prepare("INSERT INTO `warehouses` (`id`, `name`, `code`, `is_default`) VALUES (?, 'Hlavný sklad', 'HLAVNY', 1) ON DUPLICATE KEY UPDATE `name` = `name`")->execute([VT_WAREHOUSE_ID]);
            $report->count('default warehouse created');
        }
    }

    /**
     * The proj_data_/proj_timeline_/proj_gantt_ tables of a project type, with a column per attribute.
     * Same DDL as ccrm_ensure_project_type_tables() in sync.php (that file cannot be included - it serves a request).
     * DDL commits implicitly, so call it outside a transaction.
     */
    function vt_ensure_project_tables(PDO $pdo, string $typeId, array $attributes): void {
        $safe = preg_replace('/[^a-z0-9_]/', '', strtolower($typeId));
        $pdo->exec("CREATE TABLE IF NOT EXISTS `proj_data_{$safe}` (
            `id` VARCHAR(50) NOT NULL PRIMARY KEY, `project_id` VARCHAR(50) NOT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS `proj_timeline_{$safe}` (
            `id` VARCHAR(50) NOT NULL PRIMARY KEY, `project_id` VARCHAR(50) NOT NULL, `type` VARCHAR(50) NOT NULL DEFAULT 'note',
            `event_type` VARCHAR(50) NULL, `timestamp` DATETIME NOT NULL, `title` VARCHAR(255) NOT NULL, `content` TEXT NULL,
            FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS `proj_gantt_{$safe}` (
            `id` VARCHAR(50) NOT NULL PRIMARY KEY, `project_id` VARCHAR(50) NOT NULL, `title` VARCHAR(255) NOT NULL, `contact_id` VARCHAR(50) NULL,
            `start_date` DATE NULL, `end_date` DATE NULL, `progress` INT NOT NULL DEFAULT 0,
            FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $existing = $pdo->query("SHOW COLUMNS FROM `proj_data_{$safe}`")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($attributes as $attr) {
            $col = 'attr_' . preg_replace('/[^a-z0-9_]/', '', strtolower($attr['id']));
            if (!in_array($col, $existing, true)) $pdo->exec("ALTER TABLE `proj_data_{$safe}` ADD COLUMN `{$col}` LONGTEXT NULL");
        }
    }
}
