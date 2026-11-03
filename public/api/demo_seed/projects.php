<?php
/**
 * Demo seed module: projects (pack-based, phase 4B).
 *
 * Writes the demo project type (attributes, timeline event types, Files slots) and the five
 * projects P1-P5 with their per-type rows (attribute values, timeline, Gantt). Everything a
 * person reads comes from packs/<lang>/projects.php and packs/<lang>/company.php; this file
 * holds code only.
 *
 * How the Projects UI stores a project (sync.php, ProjectsView/ProjectDetailsView):
 *  - `projects` holds the common fields. `project_managers.user_id` holds the manager's NAME
 *    (the client lists users by name and sync.php returns the column verbatim), not users.id.
 *  - A project TYPE (`project_types`) defines custom attributes, timeline event types and the
 *    Files slots. Every type owns three tables that sync.php creates on demand:
 *    proj_data_<id>, proj_timeline_<id> and proj_gantt_<id>, where <id> is the type id
 *    lower-cased and stripped to [a-z0-9_] ('demo-projects-0' becomes 'demoprojects0').
 *  - Statuses are keys of PROJECT_STATUSES (default new/active/on_hold/completed/cancelled).
 *
 * Money: the contract value of a project is the TOTAL of its accepted price offer (the
 * Invoicing and Finance tabs bill against it), computed by demo_offers_project_value() from the
 * same converted line items the offers module writes. The budget is the internal cost estimate
 * (EUR in the pack, converted with demo_money()). DDL (CREATE TABLE of the per-type tables)
 * commits implicitly, which the runner knows (see index.php).
 *
 * Id plan: 0 = the project type, 1-5 = projects, 101+ timeline events, 201+ Gantt rows,
 * 301+ attribute rows. Returns the number of rows inserted.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';
require_once __DIR__ . '/offers.php';

if (!function_exists('demo_projects_safe_id')) {

    /** Type id -> the suffix of its per-type tables (same rule as sync.php). */
    function demo_projects_safe_id(string $typeId): string {
        return preg_replace('/[^a-z0-9_]/', '', strtolower($typeId));
    }

    /** Create the per-type tables and the attribute columns, the way sync.php does. */
    function demo_projects_ensure_tables(PDO $pdo, string $typeId, array $attributes, array $timelineAttributes): void {
        $safe = demo_projects_safe_id($typeId);
        $data = "proj_data_{$safe}";
        $timeline = "proj_timeline_{$safe}";
        $gantt = "proj_gantt_{$safe}";

        if (!demo_table_exists($pdo, $data)) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `{$data}` (
                `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                `project_id` VARCHAR(50) NOT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        }
        if (!demo_table_exists($pdo, $timeline)) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `{$timeline}` (
                `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                `project_id` VARCHAR(50) NOT NULL,
                `type` VARCHAR(50) NOT NULL DEFAULT 'note',
                `event_type` VARCHAR(50) NULL,
                `timestamp` DATETIME NOT NULL,
                `title` VARCHAR(255) NOT NULL,
                `content` TEXT NULL,
                FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        }
        if (!demo_table_exists($pdo, $gantt)) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `{$gantt}` (
                `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                `project_id` VARCHAR(50) NOT NULL,
                `title` VARCHAR(255) NOT NULL,
                `contact_id` VARCHAR(50) NULL,
                `start_date` DATE NULL,
                `end_date` DATE NULL,
                `progress` INT NOT NULL DEFAULT 0,
                FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        }

        $columns = static function (string $table) use ($pdo): array {
            $cols = [];
            foreach ($pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(PDO::FETCH_ASSOC) as $c) {
                $cols[] = $c['Field'];
            }
            return $cols;
        };
        foreach ([[$data, $attributes], [$timeline, $timelineAttributes]] as [$table, $attrs]) {
            $existing = $columns($table);
            foreach ($attrs as $attr) {
                $col = 'attr_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$attr['id']));
                if (!in_array($col, $existing, true)) {
                    $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$col}` LONGTEXT NULL");
                }
            }
        }
    }
}

function demo_seed_projects(PDO $pdo): int {
    $ctx = demo_ctx($pdo);
    $pack = demo_pack($pdo, 'projects');
    $cast = demo_company_pack($ctx['lang']);
    $users = demo_users($pdo);
    $divisions = demo_divisions($pdo);
    $inserted = 0;

    $typeId = demo_ref_id('PT');
    $safe = demo_projects_safe_id($typeId);

    // --- Clean own rows (the per-type rows go with their project by FK) ------------------------
    foreach (['data', 'timeline', 'gantt'] as $kind) {
        if (demo_table_exists($pdo, "proj_{$kind}_{$safe}")) {
            $pdo->exec("DELETE FROM `proj_{$kind}_{$safe}` WHERE `project_id` LIKE 'demo-projects-%'");
        }
    }
    $pdo->exec("DELETE FROM `project_managers` WHERE `project_id` LIKE 'demo-projects-%'");
    $pdo->exec("DELETE FROM `projects` WHERE `id` LIKE 'demo-projects-%'");
    $pdo->exec("DELETE FROM `project_types` WHERE `id` LIKE 'demo-projects-%'");

    // --- Project type ------------------------------------------------------------------------------
    $t = $pack['type'];
    $a = $t['attributes'];
    $checks = $a['checks']['options'];
    $attrs = [
        ['id' => 'material', 'name' => $a['material']['name'], 'type' => 'select', 'required' => false, 'options' => $a['material']['options']],
        ['id' => 'area', 'name' => $a['area']['name'], 'type' => 'number', 'required' => false],
        ['id' => 'thickness', 'name' => $a['thickness']['name'], 'type' => 'select', 'required' => false, 'options' => $a['thickness']['options']],
        ['id' => 'site', 'name' => $a['site']['name'], 'type' => 'textfield', 'required' => false],
        ['id' => 'install_date', 'name' => $a['install_date']['name'], 'type' => 'date', 'required' => false],
        // The project card counts these boxes while they are still unticked.
        ['id' => 'checks', 'name' => $a['checks']['name'], 'type' => 'checkbox', 'required' => false, 'options' => $checks,
         'requiredOptions' => [$checks[0], $checks[1]]],
    ];
    $tlAttr = [['id' => 'tl_note_by', 'name' => $t['timelineBy'], 'type' => 'textfield', 'required' => false]];
    $eventTypes = [
        ['id' => 'measure', 'name' => $t['events']['measure'], 'color' => '#0ea5e9', 'icon' => 'Ruler', 'attributes' => $tlAttr],
        ['id' => 'delivery', 'name' => $t['events']['delivery'], 'color' => '#f59e0b', 'icon' => 'Truck', 'attributes' => []],
        ['id' => 'install', 'name' => $t['events']['install'], 'color' => '#10b981', 'icon' => 'Hammer', 'attributes' => $tlAttr],
        ['id' => 'approval', 'name' => $t['events']['approval'], 'color' => '#8b5cf6', 'icon' => 'BadgeCheck', 'attributes' => []],
    ];
    $fileFields = [
        ['id' => 'attr_file_contract', 'name' => $t['files']['contract']],
        ['id' => 'attr_file_drawing', 'name' => $t['files']['drawing']],
    ];
    $pdo->prepare(
        "INSERT INTO `project_types` (`id`, `name`, `description`, `icon`, `color`, `attributes_json`, `has_timeline`, `has_gantt`, `has_deadline`, `has_invoice_date`,
            `deadline_warning_days`, `deadline_required`, `has_files`, `file_fields_json`, `timeline_event_types_json`, `timeline_attributes_json`, `list_columns_json`)
         VALUES (?, ?, ?, 'Gem', '#0ea5e9', ?, 1, 1, 1, 1, 7, 0, 1, ?, ?, '[]', NULL)"
    )->execute([
        $typeId,
        demo_text($t['name']),
        demo_text($t['description']),
        json_encode($attrs, JSON_UNESCAPED_UNICODE),
        json_encode($fileFields, JSON_UNESCAPED_UNICODE),
        json_encode($eventTypes, JSON_UNESCAPED_UNICODE),
    ]);
    $inserted++;

    demo_projects_ensure_tables($pdo, $typeId, array_merge($attrs, $fileFields), $tlAttr);

    // --- Statuses actually configured on this instance --------------------------------------------
    $statusKeys = ['new', 'active', 'on_hold', 'completed', 'cancelled'];
    try {
        $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'PROJECT_STATUSES'")->fetchColumn();
        $dec = is_string($raw) ? json_decode($raw, true) : null;
        if (is_array($dec) && $dec) {
            $keys = array_values(array_filter(array_map(static fn($s) => is_array($s) ? ($s['key'] ?? null) : null, $dec)));
            if ($keys) {
                $statusKeys = $keys;
            }
        }
    } catch (\Throwable $e) {
        // defaults
    }
    $st = static fn(string $key): string => in_array($key, $statusKeys, true) ? $key : $statusKeys[0];

    // --- Projects ------------------------------------------------------------------------------------
    $insProj = $pdo->prepare(
        "INSERT INTO `projects` (`id`, `project_type_id`, `name`, `lead_id`, `client_id`, `status`, `division`, `rating`, `completion_deadline`, `invoice_date`, `delay_reason`,
            `start_date`, `finished_at`, `budget`, `value`, `hours_budget`, `billable_rate`, `archived`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
    );
    $insMgr = $pdo->prepare("INSERT IGNORE INTO `project_managers` (`project_id`, `user_id`) VALUES (?, ?)");
    $dataTable = "proj_data_{$safe}";
    $clientOf = [];
    foreach ($pack['projects'] as $ref => $p) {
        $record = $cast['projects'][$ref];
        $clientId = demo_ref_id($record['client']);
        $clientOf[$ref] = $clientId;
        $projId = demo_ref_id($ref);
        $division = $divisions[$p['division']] ?? ($divisions[0] ?? null);
        $delay = (string)$p['delay'] !== '' ? demo_text($p['delay']) : null;
        $insProj->execute([
            $projId, $typeId, $record['name'], $clientId, $clientId, $st($p['status']), $division, $p['rating'],
            demo_d($p['deadline']), demo_d($p['invoiceDate']), $delay, demo_d($p['start']),
            $p['finished'] === null ? null : demo_d($p['finished']),
            demo_money((float)$p['budgetEur']), demo_offers_project_value($pdo, $ref), $p['hoursBudget'], demo_money((float)$pack['rateEur']),
        ]);
        $inserted++;
        foreach ($p['users'] as $role) {
            $insMgr->execute([$projId, $users[$role]['name']]);
            $inserted++;
        }

        // Attribute values: lists as JSON, text verbatim (see ccrm_encode_attr_value).
        $vals = [
            'attr_material' => $a['material']['options'][$p['material']],
            'attr_area' => (string)$p['area'],
            'attr_thickness' => $a['thickness']['options'][$p['thickness']],
            'attr_site' => $p['site'],
            'attr_checks' => json_encode(array_map(static fn(int $i): string => $checks[$i], $p['checks']), JSON_UNESCAPED_UNICODE),
        ];
        if ($p['installDate'] !== null) {
            $vals['attr_install_date'] = demo_d($p['installDate']);
        }
        $cols = array_merge(['id', 'project_id'], array_keys($vals));
        $pdo->prepare(
            "INSERT INTO `{$dataTable}` (" . implode(', ', array_map(static fn($c) => "`{$c}`", $cols)) . ") VALUES ("
            . implode(', ', array_fill(0, count($cols), '?')) . ")"
        )->execute(array_merge([demo_id('projects', 300 + (int)substr($ref, 1)), $projId], array_values($vals)));
        $inserted++;
    }

    // --- Timeline and Gantt ------------------------------------------------------------------------
    $insTl = $pdo->prepare(
        "INSERT INTO `proj_timeline_{$safe}` (`id`, `project_id`, `type`, `event_type`, `timestamp`, `title`, `content`) VALUES (?, ?, 'note', ?, ?, ?, ?)"
    );
    $seq = 0;
    foreach ($pack['timeline'] as $e) {
        $seq++;
        $insTl->execute([
            demo_id('projects', 100 + $seq), demo_ref_id($e['project']), $e['type'], demo_dt($e['day'], $e['time']),
            demo_text($e['title']), demo_text($e['content']),
        ]);
        $inserted++;
    }
    $insG = $pdo->prepare(
        "INSERT INTO `proj_gantt_{$safe}` (`id`, `project_id`, `title`, `contact_id`, `start_date`, `end_date`, `progress`) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    $seq = 0;
    foreach ($pack['gantt'] as $r) {
        $seq++;
        $insG->execute([
            demo_id('projects', 200 + $seq), demo_ref_id($r['project']), demo_text($r['title']), $clientOf[$r['project']],
            demo_d($r['start']), demo_d($r['end']), $r['progress'],
        ]);
        $inserted++;
    }
    return $inserted;
}
