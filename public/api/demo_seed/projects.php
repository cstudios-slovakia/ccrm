<?php
/**
 * Demo seed module: projects.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('projects', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 *
 * How the Projects UI stores a project (sync.php, ProjectsView/ProjectDetailsView):
 *  - `projects` holds the common fields (name, lead/client, status, dates,
 *    budget, value, rating, division). `project_managers.user_id` holds the
 *    manager's NAME (the client lists users by name and sync.php returns the
 *    column verbatim), not the users.id — storing ids here would put raw ids in
 *    the Projects UI. Server-side readers must accept both (see agent_utils.php).
 *  - A project TYPE (`project_types`) defines custom attributes, timeline event
 *    types and the Files slots. Every type owns three tables that sync.php
 *    creates on demand: proj_data_<id> (one row per project, one LONGTEXT
 *    `attr_<attributeId>` column per attribute), proj_timeline_<id> and
 *    proj_gantt_<id>. <id> is the type id lower-cased and stripped to
 *    [a-z0-9_], so 'demo-projects-0' becomes 'demoprojects0'.
 *  - Statuses are keys of PROJECT_STATUSES (default new/active/on_hold/
 *    completed/cancelled); "planning" is the `new` key.
 *
 * Id plan: 0 = the project type, 1-5 = projects, 101+ timeline events,
 * 201+ gantt rows, 301+ data rows. Project values equal the accepted offers'
 * totals in offers.php (the Invoicing and Finance tabs bill against them).
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

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

function demo_seed_projects(PDO $pdo): void {
    $lang = demo_lang($pdo);
    $T = static fn(array $byLang): string => demo_t($byLang, $lang);
    [$alex, $sam, $jordan] = demo_user_names();
    $divisions = demo_divisions($pdo);
    $divMain = $divisions[0] ?? 'Cstudios';
    $divHu = $divisions[1] ?? $divMain;

    $typeId = demo_id('projects', 0);
    $safe = demo_projects_safe_id($typeId);

    // --- Clean own rows (the per-type rows go with their project by FK) -------
    foreach (['data', 'timeline', 'gantt'] as $kind) {
        if (demo_table_exists($pdo, "proj_{$kind}_{$safe}")) {
            $pdo->exec("DELETE FROM `proj_{$kind}_{$safe}` WHERE `project_id` LIKE 'demo-projects-%'");
        }
    }
    $pdo->exec("DELETE FROM `project_managers` WHERE `project_id` LIKE 'demo-projects-%'");
    $pdo->exec("DELETE FROM `projects` WHERE `id` LIKE 'demo-projects-%'");
    $pdo->exec("DELETE FROM `project_types` WHERE `id` LIKE 'demo-projects-%'");

    // --- Project type -----------------------------------------------------------
    $attrs = [
        ['id' => 'material', 'name' => $T(['en' => 'Material', 'sk' => 'Materiál', 'hu' => 'Anyag']), 'type' => 'select', 'required' => false,
         'options' => ['Quartz', 'Porcelain', 'Sintered stone', 'Marble']],
        ['id' => 'area', 'name' => $T(['en' => 'Area (m²)', 'sk' => 'Plocha (m²)', 'hu' => 'Terület (m²)']), 'type' => 'number', 'required' => false],
        ['id' => 'thickness', 'name' => $T(['en' => 'Thickness', 'sk' => 'Hrúbka', 'hu' => 'Vastagság']), 'type' => 'select', 'required' => false,
         'options' => ['6 mm', '12 mm', '20 mm', '30 mm']],
        ['id' => 'site', 'name' => $T(['en' => 'Site address', 'sk' => 'Adresa stavby', 'hu' => 'Helyszín címe']), 'type' => 'textfield', 'required' => false],
        ['id' => 'install_date', 'name' => $T(['en' => 'Installation date', 'sk' => 'Dátum montáže', 'hu' => 'Beépítés dátuma']), 'type' => 'date', 'required' => false],
        ['id' => 'checks', 'name' => $T(['en' => 'Production checklist', 'sk' => 'Výrobný checklist', 'hu' => 'Gyártási ellenőrzőlista']), 'type' => 'checkbox', 'required' => false,
         'options' => [
             $T(['en' => 'Laser measurement done', 'sk' => 'Laserové zameranie hotové', 'hu' => 'Lézeres felmérés kész']),
             $T(['en' => 'Slabs ordered', 'sk' => 'Dosky objednané', 'hu' => 'Lapok megrendelve']),
             $T(['en' => 'CNC cutting done', 'sk' => 'CNC rezanie hotové', 'hu' => 'CNC vágás kész']),
             $T(['en' => 'Installed and signed off', 'sk' => 'Zmontované a odovzdané', 'hu' => 'Beépítve és átadva']),
         ]],
    ];
    $checks = $attrs[5]['options'];
    // The project card counts these boxes while they are still unticked.
    $attrs[5]['requiredOptions'] = [$checks[0], $checks[1]];
    $tlAttr = [['id' => 'tl_note_by', 'name' => $T(['en' => 'Done by', 'sk' => 'Vykonal', 'hu' => 'Elvégezte']), 'type' => 'textfield', 'required' => false]];
    $eventTypes = [
        ['id' => 'measure', 'name' => $T(['en' => 'Site measurement', 'sk' => 'Zameranie na mieste', 'hu' => 'Helyszíni felmérés']), 'color' => '#0ea5e9', 'icon' => 'Ruler', 'attributes' => $tlAttr],
        ['id' => 'delivery', 'name' => $T(['en' => 'Material delivery', 'sk' => 'Dodanie materiálu', 'hu' => 'Anyagszállítás']), 'color' => '#f59e0b', 'icon' => 'Truck', 'attributes' => []],
        ['id' => 'install', 'name' => $T(['en' => 'Installation', 'sk' => 'Montáž', 'hu' => 'Beépítés']), 'color' => '#10b981', 'icon' => 'Hammer', 'attributes' => $tlAttr],
        ['id' => 'approval', 'name' => $T(['en' => 'Client approval', 'sk' => 'Schválenie klientom', 'hu' => 'Ügyfél jóváhagyás']), 'color' => '#8b5cf6', 'icon' => 'BadgeCheck', 'attributes' => []],
    ];
    $fileFields = [
        ['id' => 'attr_file_contract', 'name' => $T(['en' => 'Contract', 'sk' => 'Zmluva', 'hu' => 'Szerződés'])],
        ['id' => 'attr_file_drawing', 'name' => $T(['en' => 'Shop drawing', 'sk' => 'Dielenský výkres', 'hu' => 'Műhelyrajz'])],
    ];
    $pdo->prepare(
        "INSERT INTO `project_types` (`id`, `name`, `description`, `icon`, `color`, `attributes_json`, `has_timeline`, `has_gantt`, `has_deadline`,
            `deadline_warning_days`, `deadline_required`, `has_files`, `file_fields_json`, `timeline_event_types_json`, `timeline_attributes_json`, `list_columns_json`)
         VALUES (?, ?, ?, 'Gem', '#0ea5e9', ?, 1, 1, 1, 7, 0, 1, ?, ?, '[]', NULL)"
    )->execute([
        $typeId,
        $T(['en' => 'Stone fabrication job', 'sk' => 'Zákazková kamenárska výroba', 'hu' => 'Egyedi kőmegmunkálási munka']),
        $T(['en' => 'Measure, cut, deliver and install worktops, cladding and floors.', 'sk' => 'Zameranie, rezanie, dodanie a montáž pracovných dosiek, obkladov a podláh.', 'hu' => 'Munkalapok, burkolatok és padlók felmérése, vágása, szállítása és beépítése.']),
        json_encode($attrs, JSON_UNESCAPED_UNICODE),
        json_encode($fileFields, JSON_UNESCAPED_UNICODE),
        json_encode($eventTypes, JSON_UNESCAPED_UNICODE),
    ]);

    demo_projects_ensure_tables($pdo, $typeId, array_merge($attrs, $fileFields), $tlAttr);

    // --- Statuses actually configured on this instance ------------------------
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
    $st = static fn(string $key) => in_array($key, $statusKeys, true) ? $key : $statusKeys[0];

    // --- Projects -------------------------------------------------------------
    // [n, name, leadId, status, division, rating, start, deadline, finished, delayReason, budget, value, manager(s), data]
    $projects = [
        [1, $T(['en' => 'Villa Slavín – facade and entrance hall cladding', 'sk' => 'Vila Slavín – obklad fasády a vstupnej haly', 'hu' => 'Vila Slavín – homlokzat és előcsarnok burkolata']),
            demo_id('clients', 1), 'active', $divMain, 5, -75, 38, null, null, 15200.00, 24132.00, [$alex, $sam],
            ['material' => 'Porcelain', 'area' => '180', 'thickness' => '6 mm', 'site' => 'Vlárska 28, Bratislava', 'install_date' => demo_d(12), 'checks' => [$checks[0], $checks[1], $checks[2]]]],
        [2, $T(['en' => 'Kitchen worktop – Horváthová', 'sk' => 'Kuchynská doska – Horváthová', 'hu' => 'Konyhai munkalap – Horváthová']),
            demo_id('clients', 2), 'completed', $divMain, 4, -52, -15, -17, null, 2350.00, 4832.40, [$jordan],
            ['material' => 'Quartz', 'area' => '9.2', 'thickness' => '20 mm', 'site' => 'Štúrova 31, Nitra', 'install_date' => demo_d(-17), 'checks' => $checks]],
        [3, $T(['en' => 'Hotel Alpenblick – reception, spa and lobby', 'sk' => 'Hotel Alpenblick – recepcia, wellness a lobby', 'hu' => 'Hotel Alpenblick – recepció, wellness és előcsarnok']),
            demo_id('clients', 6), 'new', $divMain, 5, 21, 96, null, null, 21800.00, 32692.80, [$jordan, $alex],
            ['material' => 'Porcelain', 'area' => '146', 'thickness' => '12 mm', 'site' => 'Leopoldstraße 112, München', 'checks' => [$checks[0]]]],
        [4, $T(['en' => 'Interiéry Dvořák – showroom tables and sills', 'sk' => 'Interiéry Dvořák – showroomové stoly a parapety', 'hu' => 'Interiéry Dvořák – bemutatótermi asztalok és párkányok']),
            demo_id('clients', 4), 'on_hold', $divMain, 3, -40, -5, null,
            $T(['en' => 'Waiting for the client\'s decision on the window sill profile.', 'sk' => 'Čakáme na rozhodnutie klienta o profile parapetov.', 'hu' => 'Az ügyfél döntésére várunk az ablakpárkány profiljáról.']),
            4900.00, 9364.80, [$sam],
            ['material' => 'Sintered stone', 'area' => '12', 'thickness' => '12 mm', 'site' => 'Cejl 52, Brno', 'checks' => [$checks[0], $checks[1]]]],
        [5, $T(['en' => 'Novák – showroom slab cladding', 'sk' => 'Novák – obklad showroomu z dosiek', 'hu' => 'Novák – bemutatóterem lapburkolat']),
            'lead-1', 'active', $divMain, 4, -9, 33, null, null, 7400.00, 12500.00, [$sam],
            ['material' => 'Marble', 'area' => '48', 'thickness' => '20 mm', 'site' => 'Mlynské Nivy 42, Bratislava', 'install_date' => demo_d(24), 'checks' => [$checks[0]]]],
    ];

    $insProj = $pdo->prepare(
        "INSERT INTO `projects` (`id`, `project_type_id`, `name`, `lead_id`, `client_id`, `status`, `division`, `rating`, `deadline`, `delay_reason`,
            `start_date`, `finished_at`, `budget`, `value`, `archived`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
    );
    $insMgr = $pdo->prepare("INSERT IGNORE INTO `project_managers` (`project_id`, `user_id`) VALUES (?, ?)");
    $dataTable = "proj_data_{$safe}";
    $evSeq = 0;
    $gSeq = 0;
    foreach ($projects as $p) {
        [$n, $name, $leadId, $status, $division, $rating, $startOff, $deadlineOff, $finishedOff, $delay, $budget, $value, $managers, $data] = $p;
        if (!demo_row_exists($pdo, 'leads', $leadId)) {
            continue; // the client module did not run — nothing to pair with
        }
        $projId = demo_id('projects', $n);
        $insProj->execute([
            $projId, $typeId, $name, $leadId, $leadId, $st($status), $division, $rating,
            demo_d($deadlineOff), $delay, demo_d($startOff), $finishedOff === null ? null : demo_d($finishedOff), $budget, $value,
        ]);
        foreach ($managers as $m) {
            $insMgr->execute([$projId, $m]);
        }

        // Attribute values — lists as JSON, text verbatim (see ccrm_encode_attr_value).
        $cols = ['id', 'project_id'];
        $vals = [demo_id('projects', 300 + $n), $projId];
        foreach ($data as $k => $v) {
            $cols[] = 'attr_' . $k;
            $vals[] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v;
        }
        $pdo->prepare(
            "INSERT INTO `{$dataTable}` (" . implode(', ', array_map(static fn($c) => "`{$c}`", $cols)) . ") VALUES ("
            . implode(', ', array_fill(0, count($cols), '?')) . ")"
        )->execute($vals);
    }

    // --- Timeline and Gantt ---------------------------------------------------
    // [project n, event type id, dayOffset, time, title, content]
    $tl = [
        [1, 'measure', -72, '09:00', ['Laser measurement of the facade', 'Laserové zameranie fasády', 'A homlokzat lézeres felmérése'], ['180 m² measured with the Proliner; 3 corner deviations noted.', 'Zameraných 180 m² Prolinerom; zaznamenané 3 odchýlky v rohoch.', '180 m² felmérve Prolinerrel; 3 saroknál eltérés jegyezve.']],
        [1, 'approval', -62, '14:00', ['Slab colour approved', 'Farba dosiek schválená', 'Lapszín jóváhagyva'], ['The developer signed off the sample board.', 'Developer podpísal vzorkovník.', 'A fejlesztő aláírta a mintatáblát.']],
        [1, 'delivery', -30, '08:30', ['First slab pallet delivered', 'Dodaná prvá paleta dosiek', 'Megérkezett az első lappaletta'], ['22 slabs 1600×3200 received and checked.', 'Prijatých a skontrolovaných 22 dosiek 1600×3200.', '22 db 1600×3200 lap átvéve és ellenőrizve.']],
        [1, 'install', -4, '07:30', ['Installation started – south facade', 'Začiatok montáže – južná fasáda', 'Beépítés indul – déli homlokzat'], ['Crew of four, crane booked for two days.', 'Štvorčlenná čata, žeriav objednaný na dva dni.', 'Négyfős csapat, daru két napra lefoglalva.']],
        [2, 'measure', -50, '10:00', ['Laser measurement in the kitchen', 'Laserové zameranie v kuchyni', 'Lézeres felmérés a konyhában'], ['Kitchen units levelled, template approved.', 'Kuchynská linka vyrovnaná, šablóna schválená.', 'A konyhabútor szintezve, a sablon jóváhagyva.']],
        [2, 'delivery', -30, '09:30', ['Quartz slab arrived', 'Kremenná doska dorazila', 'Megérkezett a kvarclap'], ['Calacatta White 20 mm, no defects.', 'Calacatta White 20 mm, bez vád.', 'Calacatta White 20 mm, hibátlan.']],
        [2, 'install', -17, '13:00', ['Worktop installed and handed over', 'Doska namontovaná a odovzdaná', 'A munkalap beépítve és átadva'], ['Sink cutout and mitred edge as drawn; client satisfied.', 'Výrez na drez a zrezaná hrana podľa výkresu; klient spokojný.', 'A mosogató kivágása és a gérvágott él a rajz szerint; az ügyfél elégedett.']],
        [3, 'approval', -41, '11:00', ['Offer approved by the hotel', 'Ponuka schválená hotelom', 'Az ajánlatot a hotel jóváhagyta'], ['Advance invoice requested.', 'Vyžiadaná zálohová faktúra.', 'Előlegszámla kérve.']],
        [4, 'measure', -36, '10:30', ['Showroom measurement', 'Zameranie showroomu', 'Bemutatóterem felmérése'], ['Four table positions and 14 m of sills measured.', 'Zamerané štyri stoly a 14 m parapetov.', 'Négy asztal és 14 m párkány felmérve.']],
        [4, 'approval', -12, '15:00', ['Sill profile question', 'Otázka k profilu parapetov', 'Kérdés a párkányprofilról'], ['Client wants to compare two edge profiles; project paused.', 'Klient chce porovnať dva profily hrán; projekt pozastavený.', 'Az ügyfél két élprofilt akar összehasonlítani; a projekt szünetel.']],
        [5, 'measure', -8, '09:30', ['Measurement of the showroom walls', 'Zameranie stien showroomu', 'A bemutatóterem falainak felmérése'], ['48 m² of wall measured, marble grain direction agreed.', 'Zameraných 48 m² steny, dohodnutý smer žilkovania mramoru.', '48 m² fal felmérve, a márvány erezésének iránya egyeztetve.']],
    ];
    $tlTable = "proj_timeline_{$safe}";
    $insTl = $pdo->prepare(
        "INSERT INTO `{$tlTable}` (`id`, `project_id`, `type`, `event_type`, `timestamp`, `title`, `content`) VALUES (?, ?, 'note', ?, ?, ?, ?)"
    );
    foreach ($tl as [$n, $evType, $off, $time, $title, $content]) {
        if (!demo_row_exists($pdo, 'projects', demo_id('projects', $n))) {
            continue;
        }
        $evSeq++;
        $insTl->execute([
            demo_id('projects', 100 + $evSeq), demo_id('projects', $n), $evType, demo_dt($off, $time),
            $T(['en' => $title[0], 'sk' => $title[1], 'hu' => $title[2]]), $T(['en' => $content[0], 'sk' => $content[1], 'hu' => $content[2]]),
        ]);
    }

    // Gantt rows (milestones): [project n, title[en,sk,hu], startOff, endOff, progress]
    $gantt = [
        [1, ['Measurement and drawings', 'Zameranie a výkresy', 'Felmérés és rajzok'], -75, -55, 100],
        [1, ['Slab order and delivery', 'Objednávka a dodanie dosiek', 'Lapok rendelése és szállítása'], -55, -25, 100],
        [1, ['CNC cutting', 'CNC rezanie', 'CNC vágás'], -30, 3, 85],
        [1, ['Installation', 'Montáž', 'Beépítés'], -4, 30, 30],
        [2, ['Measurement and template', 'Zameranie a šablóna', 'Felmérés és sablon'], -52, -45, 100],
        [2, ['Fabrication', 'Výroba', 'Gyártás'], -44, -20, 100],
        [2, ['Installation and handover', 'Montáž a odovzdanie', 'Beépítés és átadás'], -19, -17, 100],
        [3, ['Advance payment', 'Zálohová platba', 'Előlegfizetés'], -40, 21, 0],
        [3, ['Laser measurement on site', 'Laserové zameranie na mieste', 'Lézeres helyszíni felmérés'], 21, 28, 0],
        [3, ['Fabrication', 'Výroba', 'Gyártás'], 29, 70, 0],
        [3, ['Installation', 'Montáž', 'Beépítés'], 71, 96, 0],
        [4, ['Measurement', 'Zameranie', 'Felmérés'], -40, -35, 100],
        [4, ['Decision on sill profile', 'Rozhodnutie o profile parapetov', 'Döntés a párkányprofilról'], -12, 14, 20],
        [4, ['Fabrication and installation', 'Výroba a montáž', 'Gyártás és beépítés'], 15, 40, 0],
        [5, ['Measurement', 'Zameranie', 'Felmérés'], -9, -6, 100],
        [5, ['Fabrication', 'Výroba', 'Gyártás'], -5, 20, 40],
        [5, ['Installation', 'Montáž', 'Beépítés'], 21, 33, 0],
    ];
    $ganttTable = "proj_gantt_{$safe}";
    $insG = $pdo->prepare(
        "INSERT INTO `{$ganttTable}` (`id`, `project_id`, `title`, `contact_id`, `start_date`, `end_date`, `progress`) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    $leadOf = [];
    foreach ($projects as $p) {
        $leadOf[$p[0]] = $p[2];
    }
    foreach ($gantt as [$n, $title, $s, $e, $progress]) {
        if (!demo_row_exists($pdo, 'projects', demo_id('projects', $n))) {
            continue;
        }
        $gSeq++;
        $insG->execute([
            demo_id('projects', 200 + $gSeq), demo_id('projects', $n),
            $T(['en' => $title[0], 'sk' => $title[1], 'hu' => $title[2]]), $leadOf[$n], demo_d($s), demo_d($e), $progress,
        ]);
    }
}
