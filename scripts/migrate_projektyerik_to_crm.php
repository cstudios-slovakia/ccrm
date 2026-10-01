<?php
/**
 * Migration Script: projektyerik.cstudios.sk -> crm.cstudios.sk (CCRM)
 *
 * Extracts all data from PostgreSQL (16AYwX6g_rollback) and migrates it
 * into MySQL (zkPcfUSU) according to the CCRM schema and entity relationships.
 *
 * Fully migrates:
 *  1. Users & Project Managers
 *  2. System Settings (Lead States, Sources, Colors)
 *  3. Project Types & Dynamic Attribute/Gantt/Timeline Tables
 *  4. Leads & Pipeline Opportunities (with full status, budget, owner & note mapping)
 *  5. Lead & Project Timelines / Activities
 *  6. Projects & Project Dynamic Data & Gantt Tasks
 *  7. Project Expenses -> Financial Records
 *  8. Audit Logs
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

$pgHost = 'db.r5.websupport.sk';
$pgPort = 5432;
$pgDb   = '16AYwX6g_rollback';
$pgUser = 'SPgtpeHB';
$pgPass = 'g&S/vp:E5;393L?h%W($';

$myHost = 'db.r5.websupport.sk';
$myPort = 3306;
$myDb   = 'zkPcfUSU';
$myUser = 'AUxNMQaU';
$myPass = 'YfhX]wO4lSBOq@a5#*Ky';

echo "========================================================\n";
echo " CCRM DATA MIGRATION: projektyerik.cstudios.sk -> crm.cstudios.sk\n";
echo "========================================================\n\n";

// 1. Connect to Source PostgreSQL
echo "[1/8] Connecting to PostgreSQL ($pgDb)...\n";
try {
    $pg = new PDO("pgsql:host=$pgHost;port=$pgPort;dbname=$pgDb", $pgUser, $pgPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    echo "  ✓ Connected to PostgreSQL successfully.\n";
} catch (Exception $e) {
    die("  ✗ PostgreSQL connection failed: " . $e->getMessage() . "\n");
}

// 2. Connect to Target MySQL
echo "\n[2/8] Connecting to MySQL ($myDb)...\n";
try {
    $my = new PDO("mysql:host=$myHost;port=$myPort;dbname=$myDb;charset=utf8mb4", $myUser, $myPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    echo "  ✓ Connected to MySQL successfully.\n";
} catch (Exception $e) {
    die("  ✗ MySQL connection failed: " . $e->getMessage() . "\n");
}

// Helper: Calculate ISO week Monday date
function get_iso_week_monday($weekStr) {
    if (preg_match('/^(\d{4})-W(\d{1,2})$/', $weekStr, $m)) {
        $year = (int)$m[1];
        $week = (int)$m[2];
        $dto = new DateTime();
        $dto->setISODate($year, $week, 1);
        return $dto->format('Y-m-d');
    }
    return null;
}

// Helper: Map Project Status to CCRM Lead Pipeline Status
function map_project_to_lead_status($rawStatus) {
    $raw = trim((string)$rawStatus);
    if ($raw === 'Price Offer Sent') return 'price offer sent';
    if ($raw === 'Price Offer Accepted') return 'accepted';
    if ($raw === 'Price Offer Closed') return 'accepted';
    if ($raw === 'Price Offer Rejected') return 'rejected';
    if ($raw === 'New Lead') return 'new';
    return 'new';
}

// 3. Fetch all source data
echo "\n[3/8] Extracting source records from PostgreSQL...\n";
$pgEntities = $pg->query("SELECT * FROM settings_entities ORDER BY id ASC")->fetchAll();
$pgUsers    = $pg->query("SELECT * FROM users ORDER BY id ASC")->fetchAll();
$pgSettings = $pg->query("SELECT * FROM system_settings")->fetchAll();
$pgLeads    = $pg->query("SELECT * FROM leads ORDER BY id ASC")->fetchAll();
$pgLeadActs = $pg->query("SELECT * FROM lead_activities ORDER BY id ASC")->fetchAll();
$pgProjects = $pg->query("SELECT * FROM projects ORDER BY id ASC")->fetchAll();
$pgProjActs = $pg->query("SELECT * FROM project_activities ORDER BY id ASC")->fetchAll();
$pgExpenses = $pg->query("SELECT * FROM project_expenses ORDER BY id ASC")->fetchAll();
$pgAudits   = $pg->query("SELECT * FROM audit_logs ORDER BY id ASC")->fetchAll();

echo "  ✓ Extracted " . count($pgEntities) . " settings entities\n";
echo "  ✓ Extracted " . count($pgUsers) . " users\n";
echo "  ✓ Extracted " . count($pgLeads) . " leads\n";
echo "  ✓ Extracted " . count($pgLeadActs) . " lead activities\n";
echo "  ✓ Extracted " . count($pgProjects) . " projects\n";
echo "  ✓ Extracted " . count($pgProjActs) . " project activities\n";
echo "  ✓ Extracted " . count($pgExpenses) . " project expenses\n";
echo "  ✓ Extracted " . count($pgAudits) . " audit logs\n";

// Map lookup tables for settings_entities
$entityMap = [];
foreach ($pgEntities as $e) {
    $entityMap[$e['id']] = $e;
}

// 4. Migrate Users & Team
echo "\n[4/8] Synchronizing Users & Project Managers...\n";
$userMap = [
    'Erik'  => 'u-95781e6342ae52e44f2e770b5fb0703f',
    'Roli'  => 'u-8c8d82a87032df02bff5445f25ce9373',
    'Peťo'  => 'u-fa39df51ae093722e0158ff73ed218dc',
    'Tomi'  => 'u-tomi-cstudios-sk'
];

// Ensure Tomi exists in MySQL users table
$checkTomi = $my->prepare("SELECT id FROM users WHERE email = ? OR id = ?");
$checkTomi->execute(['tomi@cstudios.sk', 'u-tomi-cstudios-sk']);
if (!$checkTomi->fetch()) {
    $tomiHash = '$2y$12$7MauiVq7T91afM98u7mNLOdi/i0JvYxndwcEQI8RpXb7aBUQufQwq'; // Preserved from PG
    $insTomi = $my->prepare("INSERT INTO users (id, name, email, password_hash, role, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())");
    $insTomi->execute(['u-tomi-cstudios-sk', 'Tomi', 'tomi@cstudios.sk', $tomiHash, 'Project Manager', '#a855f7']);
    echo "  ✓ Added user Tomi (u-tomi-cstudios-sk)\n";
} else {
    echo "  ✓ User Tomi already exists.\n";
}

// Update system_settings for lead states and sources
$stmtSet = $my->query("SELECT `key`, `value` FROM system_settings")->fetchAll(PDO::FETCH_KEY_PAIR);

// Update LEAD_STATES
$leadStates = isset($stmtSet['LEAD_STATES']) ? json_decode($stmtSet['LEAD_STATES'], true) : [];
$allStates = ["new", "contacted", "qualified", "price offer sent", "accepted", "rejected", "lost"];
$mergedStates = array_values(array_unique(array_merge($leadStates, $allStates)));
$my->prepare("INSERT INTO system_settings (`key`, `value`) VALUES ('LEAD_STATES', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
   ->execute([json_encode($mergedStates)]);

// Update LEAD_STATE_COLORS
$leadStateColors = isset($stmtSet['LEAD_STATE_COLORS']) ? json_decode($stmtSet['LEAD_STATE_COLORS'], true) : [];
$leadStateColors['qualified'] = $leadStateColors['qualified'] ?? '#8b5cf6';
$leadStateColors['lost'] = $leadStateColors['lost'] ?? '#ef4444';
$leadStateColors['price offer sent'] = $leadStateColors['price offer sent'] ?? '#f59e0b';
$leadStateColors['accepted'] = $leadStateColors['accepted'] ?? '#10b981';
$leadStateColors['rejected'] = $leadStateColors['rejected'] ?? '#ef4444';
$leadStateColors['new'] = $leadStateColors['new'] ?? '#3b82f6';
$leadStateColors['contacted'] = $leadStateColors['contacted'] ?? '#06b6d4';
$my->prepare("INSERT INTO system_settings (`key`, `value`) VALUES ('LEAD_STATE_COLORS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
   ->execute([json_encode($leadStateColors)]);

// Update LEAD_SOURCES
$leadSources = isset($stmtSet['LEAD_SOURCES']) ? json_decode($stmtSet['LEAD_SOURCES'], true) : [];
$allSources = ["facebook", "instagram", "website (sk)", "website (hu)", "website (en)", "direct", "linkedin", "referral"];
$mergedSources = array_values(array_unique(array_merge($leadSources, $allSources)));
$my->prepare("INSERT INTO system_settings (`key`, `value`) VALUES ('LEAD_SOURCES', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
   ->execute([json_encode($mergedSources)]);

// Update LEAD_SOURCE_COLORS
$leadSourceColors = isset($stmtSet['LEAD_SOURCE_COLORS']) ? json_decode($stmtSet['LEAD_SOURCE_COLORS'], true) : [];
$leadSourceColors['direct'] = '#64748b';
$leadSourceColors['linkedin'] = '#0077b5';
$leadSourceColors['referral'] = '#f59e0b';
$leadSourceColors['website (sk)'] = '#3b82f6';
$leadSourceColors['website (hu)'] = '#10b981';
$leadSourceColors['website (en)'] = '#8b5cf6';
$my->prepare("INSERT INTO system_settings (`key`, `value`) VALUES ('LEAD_SOURCE_COLORS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
   ->execute([json_encode($leadSourceColors)]);

echo "  ✓ System settings (lead states, colors, sources) updated.\n";

// 5. Setup Project Types & Dynamic Tables
echo "\n[5/8] Configuring Project Types & Dynamic Tables in CCRM...\n";

$projectAttributes = [
    ["id" => "attr_developer", "name" => "Programátor", "type" => "select", "required" => false, "options" => ["Gyuri", "András", "Peti", "Peťo", "Patrik", "Dávid"]],
    ["id" => "attr_designer", "name" => "Dizajnér", "type" => "select", "required" => false, "options" => ["Gazdag", "Shuvo"]],
    ["id" => "attr_dev_status", "name" => "Stav vývoja", "type" => "select", "required" => false, "options" => ["Not Started", "In Progress", "Review", "Done"]],
    ["id" => "attr_design_status", "name" => "Stav dizajnu", "type" => "select", "required" => false, "options" => ["Not Started", "In Progress", "Review", "Done"]],
    ["id" => "attr_complexity", "name" => "Komplexita (1-5)", "type" => "number", "required" => false],
    ["id" => "attr_est_dev_time", "name" => "Odhadovaný čas (h)", "type" => "number", "required" => false],
    ["id" => "attr_already_paid", "name" => "Už zaplatené (€)", "type" => "money", "required" => false],
    ["id" => "attr_dev_budget", "name" => "Rozpočet na vývoj (€)", "type" => "money", "required" => false],
    ["id" => "attr_notes", "name" => "Interné poznámky", "type" => "textarea", "required" => false]
];

$projectTypesToEnsure = [
    [
        'id' => 'pt_1788369463200',
        'name' => 'Webová stránka',
        'description' => 'Webové stránky a portály',
        'icon' => 'Globe',
        'color' => '#3b82f6'
    ],
    [
        'id' => 'pt_1788528211493',
        'name' => 'E-commerce',
        'description' => 'E-shopy a nákupné systémy',
        'icon' => 'ShoppingCart',
        'color' => '#10b981'
    ],
    [
        'id' => 'pt_design',
        'name' => 'Grafický dizajn',
        'description' => 'Branding, UX/UI a grafické práce',
        'icon' => 'Palette',
        'color' => '#8b5cf6'
    ]
];

$insPt = $my->prepare("INSERT INTO project_types (
    id, name, description, icon, color, attributes_json, has_timeline, has_gantt, has_deadline, deadline_warning_days, timeline_event_types_json, timeline_attributes_json
) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, 3, '[]', '[]')
ON DUPLICATE KEY UPDATE
    name = VALUES(name), description = VALUES(description), icon = VALUES(icon), color = VALUES(color),
    attributes_json = VALUES(attributes_json), has_timeline = 1, has_gantt = 1, has_deadline = 1, deadline_warning_days = 3");

foreach ($projectTypesToEnsure as $pt) {
    $insPt->execute([
        $pt['id'],
        $pt['name'],
        $pt['description'],
        $pt['icon'],
        $pt['color'],
        json_encode($projectAttributes, JSON_UNESCAPED_UNICODE)
    ]);

    $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($pt['id']));
    $dataTable     = "proj_data_" . $safeId;
    $timelineTable = "proj_timeline_" . $safeId;
    $ganttTable    = "proj_gantt_" . $safeId;

    // Create Data Table
    $my->exec("CREATE TABLE IF NOT EXISTS `{$dataTable}` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `project_id` VARCHAR(50) NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    // Add attribute columns
    foreach ($projectAttributes as $attr) {
        $col = $attr['id'];
        $chkCol = $my->query("SHOW COLUMNS FROM `{$dataTable}` LIKE '{$col}'")->rowCount();
        if ($chkCol === 0) {
            $my->exec("ALTER TABLE `{$dataTable}` ADD COLUMN `{$col}` LONGTEXT NULL");
        }
    }

    // Create Timeline Table
    $my->exec("CREATE TABLE IF NOT EXISTS `{$timelineTable}` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `project_id` VARCHAR(50) NOT NULL,
        `type` VARCHAR(50) NOT NULL DEFAULT 'note',
        `event_type` VARCHAR(50) NULL,
        `timestamp` DATETIME NOT NULL,
        `title` VARCHAR(255) NOT NULL,
        `content` TEXT NULL,
        FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    // Create Gantt Table
    $my->exec("CREATE TABLE IF NOT EXISTS `{$ganttTable}` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `project_id` VARCHAR(50) NOT NULL,
        `title` VARCHAR(255) NOT NULL,
        `contact_id` VARCHAR(50) NULL,
        `start_date` DATE NULL,
        `end_date` DATE NULL,
        `progress` INT NOT NULL DEFAULT 0,
        FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    echo "  ✓ Ensured project type '{$pt['name']}' ({$pt['id']}) and dynamic tables.\n";
}

// 6. Build Project-to-Lead pairing map
echo "\n[6/8] Analyzing Lead upgrades and pairing with Projects...\n";

$projToLead = [];
foreach ($pgAudits as $al) {
    if (preg_match('/upgrading lead #(\d+)/i', $al['details'], $m)) {
        $projToLead[(int)$al['project_id']] = (int)$m[1];
    }
}

foreach ($pgProjects as $p) {
    $pid = (int)$p['id'];
    if (isset($projToLead[$pid])) continue;

    // Check notes for email
    if (!empty($p['notes']) && preg_match('/Email:\s*([^\s\n\r]+)/i', $p['notes'], $em)) {
        $email = strtolower(trim($em[1]));
        if ($email) {
            foreach ($pgLeads as $l) {
                if (strtolower(trim($l['email'] ?? '')) === $email) {
                    $projToLead[$pid] = (int)$l['id'];
                    break;
                }
            }
        }
    }

    // Check exact name match
    if (!isset($projToLead[$pid])) {
        $pNameLower = strtolower(trim($p['name']));
        foreach ($pgLeads as $l) {
            $cNameLower = strtolower(trim($l['company_name'] ?? ''));
            $ctNameLower = strtolower(trim($l['contact_name'] ?? ''));
            if (($cNameLower && $cNameLower === $pNameLower) || ($ctNameLower && $ctNameLower === $pNameLower)) {
                $projToLead[$pid] = (int)$l['id'];
                break;
            }
        }
    }
}

echo "  ✓ Paired " . count($projToLead) . " projects to origin leads in PG.\n";
echo "  ✓ Identified " . (count($pgProjects) - count($projToLead)) . " standalone projects/deals.\n";

// Helper: map lead source
function map_lead_source_from_id($sourceId, $entityMap) {
    if ($sourceId && isset($entityMap[$sourceId])) {
        $sc = strtolower($entityMap[$sourceId]['name']);
        if (strpos($sc, 'direct') !== false) return 'direct';
        if (strpos($sc, 'linkedin') !== false) return 'linkedin';
        if (strpos($sc, 'referral') !== false) return 'referral';
        if (strpos($sc, 'cstudios.hu') !== false) return 'website (hu)';
        if (strpos($sc, 'cstudios.digital') !== false) return 'website (en)';
        if (strpos($sc, 'cstudios.sk') !== false) return 'website (sk)';
    }
    return 'website (sk)';
}

// 7. Migrate Leads (Inbox inquiries + Project Deals)
echo "\n[7/8] Migrating and Updating Leads in CCRM Pipeline...\n";

$insLead = $my->prepare("INSERT INTO leads (
    id, name, contact_person, city, client_type, status, source, owner, value, rating, phone, email,
    country, interest_note, created_at, archived
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), contact_person = VALUES(contact_person), city = VALUES(city),
    client_type = VALUES(client_type), status = VALUES(status), source = VALUES(source),
    owner = VALUES(owner), value = VALUES(value), rating = VALUES(rating),
    phone = VALUES(phone), email = VALUES(email), country = VALUES(country),
    interest_note = VALUES(interest_note), created_at = VALUES(created_at), archived = VALUES(archived)");

$insTimeline = $my->prepare("INSERT INTO timeline_events (
    id, lead_id, type, timestamp, title, content, author
) VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
    lead_id = VALUES(lead_id), type = VALUES(type), timestamp = VALUES(timestamp),
    title = VALUES(title), content = VALUES(content), author = VALUES(author)");

$leadCount = 0;
// Pass 1: Insert all raw leads from PG `leads`
foreach ($pgLeads as $l) {
    $lid = (int)$l['id'];
    $leadKey = "lead-pe-" . $lid;

    $company = trim((string)($l['company_name'] ?? ''));
    $contact = trim((string)($l['contact_name'] ?? ''));
    $name = !empty($company) ? $company : (!empty($contact) ? $contact : "Lead #" . $lid);
    $clientType = !empty($company) ? 'business' : 'person';
    $source = map_lead_source_from_id($l['source_id'], $entityMap);
    
    $owner = 'Erik';
    if ($l['pm_id'] && isset($entityMap[$l['pm_id']])) {
        $owner = $entityMap[$l['pm_id']]['name'];
    }

    $status = 'new';
    if ($l['status_id'] && isset($entityMap[$l['status_id']])) {
        $st = strtolower($entityMap[$l['status_id']]['name']);
        if (strpos($st, 'contact') !== false) $status = 'contacted';
        elseif (strpos($st, 'qualif') !== false) $status = 'qualified';
        elseif (strpos($st, 'lost') !== false) $status = 'lost';
        elseif (strpos($st, 'accept') !== false) $status = 'accepted';
        elseif (strpos($st, 'reject') !== false || strpos($st, 'archive') !== false) $status = 'rejected';
        elseif (strpos($st, 'offer sent') !== false) $status = 'price offer sent';
    } else {
        $status = $l['is_archived'] ? 'rejected' : 'new';
    }

    $archived = $l['is_archived'] ? 1 : 0;

    $insLead->execute([
        $leadKey,
        $name,
        $contact ?: null,
        '', // city
        $clientType,
        $status,
        $source,
        $owner,
        0.00, // default value (will be overwritten if paired with project deal)
        3,
        $l['phone'] ?: null,
        $l['email'] ?: null,
        $l['country'] ?: 'Slovakia',
        $l['message'] ?: null,
        substr($l['created_at'], 0, 10),
        $archived
    ]);
    $leadCount++;
}

// Pass 2: Process all 77 projects (upgrade paired leads or insert standalone leads)
$projLeadMap = []; // Maps proj_id -> CCRM lead_id
foreach ($pgProjects as $p) {
    $pid = (int)$p['id'];
    $rawStatus = trim((string)$p['status']);
    $mappedStatus = map_project_to_lead_status($rawStatus);
    $pVal = (float)($p['total_value'] ?: ($p['dev_budget'] ?: 0));
    
    $pOwner = 'Erik';
    if ($p['pm_id'] && isset($entityMap[$p['pm_id']])) {
        $pOwner = $entityMap[$p['pm_id']]['name'];
    }

    $isArchivedProject = $p['is_archived'] ? 1 : 0;

    // Archiving logic for lead:
    $leadArchived = 0;
    if ($rawStatus === 'Price Offer Closed' || $rawStatus === 'Price Offer Rejected') {
        $leadArchived = 1;
    } elseif ($rawStatus === 'Price Offer Sent') {
        $leadArchived = 0;
    } elseif ($rawStatus === 'Price Offer Accepted') {
        $leadArchived = $isArchivedProject;
    } elseif ($rawStatus === 'New Lead') {
        $leadArchived = (stripos($p['name'], 'test') !== false || $isArchivedProject) ? 1 : 0;
    }

    if (isset($projToLead[$pid])) {
        // Paired with an origin lead
        $leadKey = "lead-pe-" . $projToLead[$pid];
        $projLeadMap[$pid] = $leadKey;

        // Fetch current lead row to preserve contact details
        $curStmt = $my->prepare("SELECT * FROM leads WHERE id = ?");
        $curStmt->execute([$leadKey]);
        $cur = $curStmt->fetch();

        $combinedNotes = $cur['interest_note'] ?? '';
        if (!empty($p['notes']) && strpos($combinedNotes, $p['notes']) === false) {
            $combinedNotes = trim(($combinedNotes ? $combinedNotes . "\n\n" : "") . $p['notes']);
        }

        $insLead->execute([
            $leadKey,
            $cur['name'] ?? $p['name'],
            $cur['contact_person'] ?? null,
            $cur['city'] ?? '',
            $cur['client_type'] ?? 'business',
            $mappedStatus,
            $cur['source'] ?? 'website (sk)',
            $pOwner,
            $pVal,
            (int)($cur['rating'] ?? 3),
            $cur['phone'] ?? null,
            $cur['email'] ?? null,
            $cur['country'] ?? 'Slovakia',
            $combinedNotes ?: null,
            $cur['created_at'] ?? substr($p['created_at'], 0, 10),
            $leadArchived
        ]);
    } else {
        // Standalone project -> create lead-proj-{$pid}
        $leadKey = "lead-proj-" . $pid;
        $projLeadMap[$pid] = $leadKey;

        $contact = null; $email = null; $phone = null;
        if (!empty($p['notes'])) {
            if (preg_match('/Contact:\s*([^\n\r]+)/i', $p['notes'], $m)) $contact = trim($m[1]);
            if (preg_match('/Email:\s*([^\n\r]+)/i', $p['notes'], $m)) $email = trim($m[1]);
            if (preg_match('/Phone:\s*([^\n\r]+)/i', $p['notes'], $m)) $phone = trim($m[1]);
        }

        $insLead->execute([
            $leadKey,
            $p['name'],
            $contact,
            '',
            'business',
            $mappedStatus,
            'direct',
            $pOwner,
            $pVal,
            3,
            $phone,
            $email,
            'Slovakia',
            $p['notes'] ?: null,
            substr($p['created_at'], 0, 10),
            $leadArchived
        ]);
        $leadCount++;
    }
}
echo "  ✓ Migrated and synced all $leadCount leads with proper statuses and deal budgets.\n";

// Migrate Lead Activities
$leadActCount = 0;
foreach ($pgLeadActs as $la) {
    $evId = "ev-pe-la-" . $la['id'];
    $leadId = "lead-pe-" . $la['lead_id'];

    $typeRaw = strtolower(trim((string)$la['type']));
    $evType = 'note';
    if (strpos($typeRaw, 'email') !== false) $evType = 'email';
    elseif (strpos($typeRaw, 'call') !== false) $evType = 'phone';
    elseif (strpos($typeRaw, 'meet') !== false) $evType = 'appointment';
    elseif (strpos($typeRaw, 'propos') !== false || strpos($typeRaw, 'offer') !== false) $evType = 'offer';

    $ts = $la['activity_date'] ?? $la['created_at'];
    $title = $la['type'] ?: 'Aktivita';
    $author = 'Erik';

    $insTimeline->execute([
        $evId,
        $leadId,
        $evType,
        $ts,
        $title,
        $la['notes'] ?: null,
        $author
    ]);
    $leadActCount++;
}
echo "  ✓ Migrated $leadActCount lead timeline activities.\n";

// 8. Migrate Projects, Dynamic Data, Gantt & Timelines
echo "\n[8/8] Migrating Projects, Dynamic Attributes, Gantt Tasks & Timelines...\n";

$insProj = $my->prepare("INSERT INTO projects (
    id, project_type_id, name, lead_id, client_id, status, rating, deadline,
    start_date, finished_at, budget, custom_files_json, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
ON DUPLICATE KEY UPDATE
    project_type_id = VALUES(project_type_id), name = VALUES(name),
    lead_id = VALUES(lead_id), client_id = VALUES(client_id), status = VALUES(status),
    rating = VALUES(rating), deadline = VALUES(deadline), start_date = VALUES(start_date),
    finished_at = VALUES(finished_at), budget = VALUES(budget),
    created_at = VALUES(created_at), updated_at = VALUES(updated_at)");

$delProjMgr = $my->prepare("DELETE FROM project_managers WHERE project_id = ?");
$insProjMgr = $my->prepare("INSERT IGNORE INTO project_managers (project_id, user_id) VALUES (?, ?)");

$projCount = 0;
foreach ($pgProjects as $p) {
    $pid = (int)$p['id'];
    $projId = "proj-pe-" . $pid;
    $pName = trim((string)$p['name']);

    // Determine Project Type ID
    $ptId = 'pt_1788369463200'; // Default Webová stránka
    $ptRawId = $p['project_type_id'];
    if ($ptRawId && isset($entityMap[$ptRawId])) {
        $typeName = strtolower($entityMap[$ptRawId]['name']);
        if (strpos($typeName, 'eshop') !== false || strpos($typeName, 'shop') !== false || strpos($typeName, 'e-com') !== false) {
            $ptId = 'pt_1788528211493'; // E-commerce
        } elseif (strpos($typeName, 'design') !== false || strpos($typeName, 'grafik') !== false) {
            $ptId = 'pt_design'; // Grafický dizajn
        } else {
            $ptId = 'pt_1788369463200'; // Web
        }
    }

    // Determine Project Status in CCRM
    $statusRaw = trim((string)$p['status']);
    $statusLower = strtolower($statusRaw);
    $status = 'active';
    if ($p['is_archived']) {
        $status = 'completed';
    } elseif (strpos($statusLower, 'done') !== false || strpos($statusLower, 'complete') !== false || strpos($statusLower, 'closed') !== false) {
        $status = 'completed';
    } elseif (strpos($statusLower, 'reject') !== false) {
        $status = 'cancelled';
    } elseif (strpos($statusLower, 'sent') !== false || strpos($statusLower, 'new lead') !== false) {
        $status = 'new';
    } elseif (strpos($statusLower, 'accept') !== false || strpos($statusLower, 'progress') !== false || strpos($statusLower, 'dev') !== false || strpos($statusLower, 'design') !== false) {
        $status = 'active';
    }

    // Dates
    $startDate = $p['dev_start'] ?: ($p['design_start'] ?: ($p['accepted_date'] ?: substr($p['created_at'], 0, 10)));
    $finishedAt = ($status === 'completed') ? ($p['dev_end'] ?: substr($p['updated_at'] ?: $p['created_at'], 0, 10)) : null;
    $deadline = $p['deadline'] ?: null;

    // Budget
    $budget = (float)($p['total_value'] ?: ($p['dev_budget'] ?: 0));

    // Rating / Complexity
    $rating = isset($p['complexity']) ? max(1, min(5, (int)$p['complexity'])) : 3;

    // Paired Lead ID
    $pairedLeadId = $projLeadMap[$pid] ?? null;

    $insProj->execute([
        $projId,
        $ptId,
        $pName,
        $pairedLeadId,
        $pairedLeadId,
        $status,
        $rating,
        $deadline,
        $startDate,
        $finishedAt,
        $budget,
        $p['created_at'],
        $p['updated_at'] ?: $p['created_at']
    ]);

    // Assign Project Manager
    $delProjMgr->execute([$projId]);
    $pmName = null;
    if ($p['pm_id'] && isset($entityMap[$p['pm_id']])) {
        $pmName = $entityMap[$p['pm_id']]['name'];
    }
    if ($pmName && isset($userMap[$pmName])) {
        $insProjMgr->execute([$projId, $userMap[$pmName]]);
    } else {
        $insProjMgr->execute([$projId, $userMap['Erik']]);
    }

    // Dynamic Data
    $devName = ($p['dev_id'] && isset($entityMap[$p['dev_id']])) ? $entityMap[$p['dev_id']]['name'] : null;
    $designerName = ($p['designer_id'] && isset($entityMap[$p['designer_id']])) ? $entityMap[$p['designer_id']]['name'] : null;

    $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($ptId));
    $dataTable = "proj_data_" . $safeId;

    $insData = $my->prepare("INSERT INTO `{$dataTable}` (
        id, project_id, attr_developer, attr_designer, attr_dev_status, attr_design_status,
        attr_complexity, attr_est_dev_time, attr_already_paid, attr_dev_budget, attr_notes,
        created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
        attr_developer = VALUES(attr_developer), attr_designer = VALUES(attr_designer),
        attr_dev_status = VALUES(attr_dev_status), attr_design_status = VALUES(attr_design_status),
        attr_complexity = VALUES(attr_complexity), attr_est_dev_time = VALUES(attr_est_dev_time),
        attr_already_paid = VALUES(attr_already_paid), attr_dev_budget = VALUES(attr_dev_budget),
        attr_notes = VALUES(attr_notes), updated_at = VALUES(updated_at)");

    $insData->execute([
        $projId,
        $projId,
        $devName,
        $designerName,
        $p['dev_status'] ?: 'Not Started',
        $p['design_status'] ?: 'Not Started',
        (int)($p['complexity'] ?: 3),
        (int)($p['est_dev_time'] ?: 0),
        (float)($p['already_paid'] ?: 0),
        (float)($p['dev_budget'] ?: 0),
        $p['notes'] ?: null,
        $p['created_at'],
        $p['updated_at'] ?: $p['created_at']
    ]);

    // Gantt Tasks
    $ganttTable = "proj_gantt_" . $safeId;
    $my->prepare("DELETE FROM `{$ganttTable}` WHERE project_id = ?")->execute([$projId]);
    $insGantt = $my->prepare("INSERT INTO `{$ganttTable}` (id, project_id, title, contact_id, start_date, end_date, progress) VALUES (?, ?, ?, ?, ?, ?, ?)");

    if (!empty($p['design_start']) && !empty($p['design_end'])) {
        $gTitle = "Dizajn / UI UX" . ($designerName ? " ($designerName)" : "");
        $progress = (strtolower($p['design_status'] ?? '') === 'done') ? 100 : ((strtolower($p['design_status'] ?? '') === 'in progress') ? 50 : 0);
        $insGantt->execute(["gantt-{$projId}-design", $projId, $gTitle, null, $p['design_start'], $p['design_end'], $progress]);
    }

    if (!empty($p['dev_start']) && !empty($p['dev_end'])) {
        $gTitle = "Vývoj a programovanie" . ($devName ? " ($devName)" : "");
        $progress = (strtolower($p['dev_status'] ?? '') === 'done') ? 100 : ((strtolower($p['dev_status'] ?? '') === 'in progress') ? 50 : 0);
        $insGantt->execute(["gantt-{$projId}-dev", $projId, $gTitle, null, $p['dev_start'], $p['dev_end'], $progress]);
    }

    $projCount++;
}
echo "  ✓ Migrated $projCount projects, dynamic attributes, and Gantt charts.\n";

// Project Timeline Activities
$projActCount = 0;
foreach ($pgProjActs as $pa) {
    $pid = (int)$pa['project_id'];
    $projId = "proj-pe-" . $pid;
    $pairedLeadId = $projLeadMap[$pid] ?? null;

    $checkPt = $my->prepare("SELECT project_type_id FROM projects WHERE id = ?");
    $checkPt->execute([$projId]);
    $ptRow = $checkPt->fetch();
    if (!$ptRow) continue;

    $ptId = $ptRow['project_type_id'];
    $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($ptId));
    $timelineTable = "proj_timeline_" . $safeId;

    $tlId = "tl-pe-act-" . $pa['id'];
    $typeRaw = strtolower(trim((string)$pa['type']));
    
    $evType = 'note';
    if (strpos($typeRaw, 'email') !== false) $evType = 'email';
    elseif (strpos($typeRaw, 'call') !== false) $evType = 'phone';
    elseif (strpos($typeRaw, 'meet') !== false) $evType = 'appointment';
    elseif (strpos($typeRaw, 'propos') !== false || strpos($typeRaw, 'offer') !== false) $evType = 'offer';

    $ts = $pa['activity_date'] ?? $pa['created_at'];
    $title = $pa['type'] ?: 'Záznam projektu';

    // 1. Insert into proj_timeline_*
    $insProjTl = $my->prepare("INSERT INTO `{$timelineTable}` (
        id, project_id, type, event_type, timestamp, title, content
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
        type = VALUES(type), timestamp = VALUES(timestamp), title = VALUES(title), content = VALUES(content)");

    $insProjTl->execute([
        $tlId,
        $projId,
        $evType,
        null,
        $ts,
        $title,
        $pa['notes'] ?: null
    ]);

    // 2. Also insert into lead timeline_events for the paired lead
    if ($pairedLeadId) {
        $insTimeline->execute([
            "ev-proj-act-" . $pa['id'],
            $pairedLeadId,
            $evType,
            $ts,
            $title,
            $pa['notes'] ?: null,
            'Erik'
        ]);
    }

    $projActCount++;
}
echo "  ✓ Migrated $projActCount project timeline events (and synchronized to lead timelines).\n";

// Project Expenses -> Financial Records
$catDev     = 'fc-expense-1789372388290-q8ye'; // Programozók fizetés
$catDesign  = 'fc-expense-1789372430538-moat'; // Külső programozó / Designer
$catShuvo   = 'fc-expense-1789372435001-6gza'; // Shuvo
$catSoft    = 'fc-expense-1789372443145-likf'; // Softwerek / Licenszek
$catEquip   = 'fc-expense-1789372480249-drs8'; // Alza / Gépek
$catOther   = 'fc-expense-1789372523816-no6a'; // Egyéb kiadások

$insFr = $my->prepare("INSERT INTO financial_records (
    id, type, subtype, title, description, category_id, category_path,
    amount_planned, amount_real, currency, status, issue_date, due_date, paid_date,
    payment_method, is_recurring, project_id, client_id, invoice_number, tax_rate, created_by,
    created_at, updated_at
) VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ?, 'EUR', 'paid', ?, ?, ?, 'bank_transfer', 0, ?, ?, NULL, 20.00, 'Erik', ?, ?)
ON DUPLICATE KEY UPDATE
    subtype = VALUES(subtype), title = VALUES(title), description = VALUES(description),
    category_id = VALUES(category_id), category_path = VALUES(category_path),
    amount_planned = VALUES(amount_planned), amount_real = VALUES(amount_real),
    status = VALUES(status), issue_date = VALUES(issue_date), paid_date = VALUES(paid_date),
    project_id = VALUES(project_id), client_id = VALUES(client_id), updated_at = VALUES(updated_at)");

$expCount = 0;
foreach ($pgExpenses as $e) {
    $pid = (int)$e['project_id'];
    $frId = "fr-pe-exp-" . $e['id'];
    $projId = "proj-pe-" . $pid;
    $clientId = $projLeadMap[$pid] ?? null;

    $checkP = $my->prepare("SELECT name FROM projects WHERE id = ?");
    $checkP->execute([$projId]);
    $pRow = $checkP->fetch();
    $pName = $pRow ? $pRow['name'] : "Project #{$pid}";

    $entityId = $e['entity_id'];
    $entity = ($entityId && isset($entityMap[$entityId])) ? $entityMap[$entityId] : null;

    $hours = (float)($e['hours'] ?: 0);
    $rate = $entity ? (float)($entity['hourly_rate'] ?: 0) : 0;
    $customCost = isset($e['custom_cost']) && (float)$e['custom_cost'] > 0 ? (float)$e['custom_cost'] : 0;
    
    $totalCost = ($customCost > 0) ? $customCost : ($hours * $rate);
    $week = $e['week'] ?: '';

    $entityName = $entity ? $entity['name'] : '';
    $customName = trim((string)($e['custom_name'] ?? ''));

    $catId = $catOther;
    $catPath = "Egyéb > Egyéb kiadások";
    $subtype = 'overhead';

    if ($entity) {
        $eType = strtolower($entity['type']);
        if ($eType === 'developer') {
            $catId = $catDev;
            $catPath = "Bérköltségek > Programozók fizetés";
            $subtype = 'salary';
        } elseif ($eType === 'designer') {
            $catId = $catDesign;
            $catPath = "Bérköltségek > Külső programozó";
            $subtype = 'salary';
        }
    } else {
        $cnLower = strtolower($customName);
        if (strpos($cnLower, 'shuvo') !== false) {
            $catId = $catShuvo;
            $catPath = "Bérköltségek > Shuvo";
            $subtype = 'salary';
        } elseif (strpos($cnLower, 'licensz') !== false || strpos($cnLower, 'craft') !== false || strpos($cnLower, 'yui') !== false) {
            $catId = $catSoft;
            $catPath = "Szoftverek és eszközök > Softwerek";
            $subtype = 'material';
        } elseif (strpos($cnLower, 'gep') !== false || strpos($cnLower, 'alza') !== false) {
            $catId = $catEquip;
            $catPath = "Beszerzések > Alza";
            $subtype = 'material';
        } elseif (strpos($cnLower, 'gyuri') !== false || strpos($cnLower, 'peto') !== false || strpos($cnLower, 'erik') !== false) {
            $catId = $catDev;
            $catPath = "Bérköltségek > Programozók fizetés";
            $subtype = 'salary';
        }
    }

    $title = !empty($entityName)
        ? "{$entityName} - {$week}" . ($hours > 0 ? " ({$hours}h @ {$rate}€/h)" : "")
        : "{$customName}" . (!empty($week) ? " - {$week}" : "");

    $description = "Náklad z projektyerik k projektu '{$pName}' (#{$pid}). Týždeň: {$week}.";
    if ($hours > 0) $description .= " Počet hodín: {$hours}h (sadzba {$rate}€/h).";

    $issueDate = get_iso_week_monday($week) ?: substr($e['created_at'], 0, 10);
    $paidDate = substr($e['created_at'], 0, 10);

    $insFr->execute([
        $frId,
        $subtype,
        $title,
        $description,
        $catId,
        $catPath,
        $totalCost,
        $totalCost,
        $issueDate,
        $issueDate,
        $paidDate,
        $projId,
        $clientId,
        $e['created_at'],
        $e['updated_at'] ?: $e['created_at']
    ]);
    $expCount++;
}
echo "  ✓ Migrated $expCount project expenses into financial records.\n";

// Audit Logs Migration
$insAudit = $my->prepare("INSERT INTO audit_log (
    actor_id, actor_email, action, detail, created_at
) VALUES (?, ?, ?, ?, ?)");

$auditCount = 0;
foreach ($pgAudits as $a) {
    $actorId = null;
    $actorEmail = null;
    if ($a['user_id'] == 1) {
        $actorId = $userMap['Erik'];
        $actorEmail = 'erik@cstudios.sk';
    } elseif ($a['user_id'] == 2) {
        $actorId = $userMap['Roli'];
        $actorEmail = 'roli@cstudios.sk';
    }

    $action = "projekty." . ($a['action'] ?: 'action');
    $detail = "Project #{$a['project_id']}: " . ($a['details'] ?: '');

    $insAudit->execute([
        $actorId,
        $actorEmail,
        $action,
        $detail,
        $a['created_at']
    ]);
    $auditCount++;
}
echo "  ✓ Migrated $auditCount audit logs.\n";

echo "\n========================================================\n";
echo " ✅ MIGRATION AND STATUS RESOLUTION SUCCESSFULLY COMPLETED!\n";
echo "========================================================\n";
