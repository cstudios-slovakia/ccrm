<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

$host = $data['host'] ?? '';
$port = $data['port'] ?? '3306';
$dbname = $data['dbname'] ?? '';
$user = $data['user'] ?? '';
$pass = $data['pass'] ?? '';
$installType = $data['type'] ?? 'fresh'; // 'fresh' or 'demo'

if (empty($host) || empty($dbname) || empty($user)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required connection specifications']);
    exit;
}

// 1. Attempt connection test via PDO
try {
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// 2. Save credentials to config.php
$configContent = "<?php
// Database credentials file
// Automatically created by the Laminam CRM Installation Wizard

date_default_timezone_set('Europe/Bratislava');

define('DB_HOST', " . var_export($host, true) . ");
define('DB_PORT', " . var_export($port, true) . ");
define('DB_NAME', " . var_export($dbname, true) . ");
define('DB_USER', " . var_export($user, true) . ");
define('DB_PASS', " . var_export($pass, true) . ");

try {
    \$dsn = \"mysql:host=\" . DB_HOST . \";port=\" . DB_PORT . \";dbname=\" . DB_NAME . \";charset=utf8mb4\";
    \$options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    \$pdo = new PDO(\$dsn, DB_USER, DB_PASS, \$options);
} catch (\\PDOException \$e) {
    \$pdo = null;
    \$db_connection_error = \$e->getMessage();
}

function get_db_connection() {
    global \$pdo, \$db_connection_error;
    if (\$pdo === null) {
        throw new \\Exception(\"Database connection failed: \" . (\$db_connection_error ?? \"Unknown error\"));
    }
    return \$pdo;
}
";

$configFile = dirname(__DIR__) . '/config.php';
if (file_put_contents($configFile, $configContent) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to write config.php file. Check directory permissions.']);
    exit;
}

// 3. Apply migrations DDL
$queries = [
    // Users
    "CREATE TABLE IF NOT EXISTS `users` (
      `id` VARCHAR(50) NOT NULL,
      `name` VARCHAR(100) NOT NULL,
      `email` VARCHAR(150) NOT NULL UNIQUE,
      `password_hash` VARCHAR(255) NOT NULL,
      `role` ENUM('admin', 'project_manager', 'viewer') NOT NULL DEFAULT 'viewer',
      `avatar` VARCHAR(255) NULL,
      `color` VARCHAR(20) NULL,
      `metadata_json` TEXT NULL COMMENT 'Plugin support',
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      INDEX idx_user_email (`email`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // Permissions
    "CREATE TABLE IF NOT EXISTS `permissions` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `slug` VARCHAR(100) NOT NULL UNIQUE,
      `description` VARCHAR(255) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // Role Permissions
    "CREATE TABLE IF NOT EXISTS `role_permissions` (
      `role` ENUM('admin', 'project_manager', 'viewer') NOT NULL,
      `permission_slug` VARCHAR(100) NOT NULL,
      PRIMARY KEY (`role`, `permission_slug`),
      FOREIGN KEY (`permission_slug`) REFERENCES `permissions` (`slug`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // Leads
    "CREATE TABLE IF NOT EXISTS `leads` (
      `id` VARCHAR(50) NOT NULL,
      `name` VARCHAR(150) NOT NULL COMMENT 'Client/Company Name',
      `city` VARCHAR(100) NULL,
      `client_type` ENUM('person', 'business', 'partner') NOT NULL DEFAULT 'person',
      `status` VARCHAR(50) NOT NULL DEFAULT 'new' COMMENT 'Active Pipeline State',
      `source` VARCHAR(50) NOT NULL DEFAULT 'website' COMMENT 'Marketing Source',
      `owner` VARCHAR(100) NOT NULL COMMENT 'Assigned Project Manager Name',
      `value` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Estimated Opportunity Worth',
      `rating` INT NOT NULL DEFAULT 3 COMMENT 'Star Rating 1-5',
      `phone` VARCHAR(30) NULL,
      `email` VARCHAR(150) NULL,
      `company_id` VARCHAR(50) NULL COMMENT 'ICO',
      `tax_id` VARCHAR(50) NULL COMMENT 'DIC',
      `vat_id` VARCHAR(50) NULL COMMENT 'IC DPH',
      `contact_person` VARCHAR(100) NULL,
      `website` VARCHAR(255) NULL,
      `street` VARCHAR(255) NULL,
      `postal_code` VARCHAR(20) NULL,
      `country` VARCHAR(100) NULL DEFAULT 'Slovakia',
      `metadata_json` TEXT NULL COMMENT 'Plugin support',
      `created_at` DATE NOT NULL,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      INDEX idx_lead_status (`status`),
      INDEX idx_lead_owner (`owner`),
      INDEX idx_lead_created (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // Lead Categories Link
    "CREATE TABLE IF NOT EXISTS `lead_categories` (
      `lead_id` VARCHAR(50) NOT NULL,
      `category_name` VARCHAR(100) NOT NULL,
      PRIMARY KEY (`lead_id`, `category_name`),
      FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // Timeline Events
    "CREATE TABLE IF NOT EXISTS `timeline_events` (
      `id` VARCHAR(50) NOT NULL,
      `lead_id` VARCHAR(50) NOT NULL,
      `type` ENUM('phone', 'email', 'note', 'offer', 'appointment') NOT NULL DEFAULT 'note',
      `timestamp` DATETIME NOT NULL,
      `title` VARCHAR(255) NOT NULL,
      `content` TEXT NULL,
      `amount` DECIMAL(12,2) NULL,
      `file_name` VARCHAR(255) NULL,
      `file_size` VARCHAR(50) NULL,
      `file_type` ENUM('offer', 'contract', 'invoice') NULL,
      `extra_time` VARCHAR(10) NULL,
      PRIMARY KEY (`id`),
      FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
      INDEX idx_event_timestamp (`timestamp`),
      INDEX idx_event_type (`type`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // Tasks
    "CREATE TABLE IF NOT EXISTS `tasks` (
      `id` VARCHAR(50) NOT NULL,
      `title` VARCHAR(255) NOT NULL,
      `description` TEXT NULL,
      `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
      `deadline` DATE NOT NULL,
      `status` ENUM('todo', 'in_progress', 'blocked', 'done') NOT NULL DEFAULT 'todo',
      `owner` VARCHAR(100) NOT NULL COMMENT 'Assigned Project Manager Name',
      `related_lead_id` VARCHAR(50) NULL,
      `is_locking` TINYINT(1) NOT NULL DEFAULT 0,
      `metadata_json` TEXT NULL COMMENT 'Plugin support',
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      FOREIGN KEY (`related_lead_id`) REFERENCES `leads` (`id`) ON DELETE SET NULL,
      INDEX idx_task_status (`status`),
      INDEX idx_task_deadline (`deadline`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // Task Assignees
    "CREATE TABLE IF NOT EXISTS `task_assignees` (
      `task_id` VARCHAR(50) NOT NULL,
      `user_name` VARCHAR(100) NOT NULL,
      PRIMARY KEY (`task_id`, `user_name`),
      FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // System Settings Table
    "CREATE TABLE IF NOT EXISTS `system_settings` (
      `key` VARCHAR(100) NOT NULL,
      `value` TEXT NOT NULL,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`key`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    // Plugins list table for extensibility
    "CREATE TABLE IF NOT EXISTS `plugins` (
      `id` VARCHAR(50) NOT NULL,
      `name` VARCHAR(100) NOT NULL,
      `is_active` TINYINT(1) DEFAULT 1,
      `config_json` TEXT NULL,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
];

try {
    $pdo->beginTransaction();
    foreach ($queries as $q) {
        $pdo->exec($q);
    }
    
    // Seed Permissions slugs
    $permissionsSlugs = [
        ['leads.view', 'View leads and pipeline data'],
        ['leads.create', 'Create new leads'],
        ['leads.edit', 'Modify existing leads details'],
        ['tasks.view', 'Inspect tasks board'],
        ['tasks.create', 'Create new checklist tasks'],
        ['tasks.edit', 'Modify tasks assignees and statuses'],
        ['timeline.log', 'Log custom timeline phone calls, emails, and notes'],
        ['calendar.view', 'Access appointment calendar slots'],
        ['calendar.create', 'Create bookings'],
        ['calendar.edit', 'Adjust calendar configurations'],
        ['time_records.log', 'Log work stopwatch sessions'],
        ['newsletter.view', 'Inspect email campaigns list'],
        ['newsletter.edit', 'Create/edit email newsletter campaigns'],
        ['hr.view', 'View employee records list'],
        ['files.view', 'Browse files database'],
        ['files.create', 'Upload contract proposals'],
        ['general_config', 'Configure system name and languages'],
        ['pm_managers', 'Manage PM manager users directories'],
        ['pipeline_stages', 'Rearrange Kanban pipelines stages'],
        ['traffic_sources', 'Manage lead marketing sources and color badges'],
        ['system_reset', 'Truncate database or restore mock seeders']
    ];

    $checkPerm = $pdo->query("SELECT COUNT(*) FROM `permissions`")->fetchColumn();
    if ($checkPerm == 0) {
        $insPerm = $pdo->prepare("INSERT INTO `permissions` (`slug`, `description`) VALUES (?, ?)");
        foreach ($permissionsSlugs as $p) {
            $insPerm->execute($p);
        }
    }

    // Determine Seeding path
    if ($installType === 'demo') {
        // Seed Demo settings
        $settings = [
            'DEMO_MODE' => 'true',
            'SYSTEM_NAME' => 'Laminam CRM',
            'SYSTEM_LANGUAGE' => 'sk',
            'LEAD_STATES' => json_encode(["new", "contacted", "offer sent", "accepted", "rejected"]),
            'LEAD_SOURCES' => json_encode(["showroom", "facebook", "instagram", "website"]),
            'LEAD_CATEGORIES' => json_encode(["Kitchen Countertops", "Flooring Tiles", "Bathroom Renovation", "Granite Slabs", "Plumbing Services", "Custom Masonry"]),
            'LEAD_STATE_COLORS' => json_encode(["new" => "#3b82f6", "contacted" => "#0ea5e9", "offer sent" => "#6366f1", "accepted" => "#10b981", "rejected" => "#ef4444"]),
            'LEAD_SOURCE_COLORS' => json_encode(["showroom" => "#10b981", "facebook" => "#3b82f6", "instagram" => "#ec4899", "website" => "#8b5cf6"]),
            'LEAD_CATEGORY_COLORS' => json_encode(["Kitchen Countertops" => "#f59e0b", "Flooring Tiles" => "#10b981", "Bathroom Renovation" => "#3b82f6", "Granite Slabs" => "#6366f1", "Plumbing Services" => "#0ea5e9", "Custom Masonry" => "#ec4899"]),
            'LEAD_STAGE_GROUPS' => json_encode(["new" => "new", "contacted" => "in_progress", "offer sent" => "in_progress", "accepted" => "closed", "rejected" => "closed"]),
            'LEAD_STATE_PARENTS' => json_encode((object)[])
        ];

        $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }

        // Seed Demo Users (Erik Admin, Tomi & Roli PMs)
        // Erick has password 'password', hashes to standard or just text in this high-fidelity prototype
        $users = [
            ['u-1', 'Erik', 'erik@crm.com', 'password', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop', '#10b981'],
            ['u-2', 'Tomi', 'tomi@crm.com', 'password', 'project_manager', null, '#6366f1'],
            ['u-3', 'Roli', 'roli@crm.com', 'password', 'project_manager', null, '#f59e0b']
        ];

        $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `role`=VALUES(`role`)");
        foreach ($users as $u) {
            $insUser->execute($u);
        }

        // Seed default lead: Ján Novák
        $leads = [
            ['lead-1', 'Ján Novák', 'Bratislava', 'business', 'new', 'website', 'Tomi', 12500, 5, '+421 905 123 456', 'novak@laminam.sk', '36123456', '2021234567', 'SK2021234567', 'Ing. Ján Novák', 'https://laminam.sk', 'Mlynské Nivy 42', '821 09', 'Slovakia', '2026-05-15'],
            ['lead-2', 'Martina Kováčová', 'Trnava', 'person', 'contacted', 'instagram', 'Roli', 8400, 4, '+421 911 987 654', 'm.kovacova@gmail.com', null, null, null, null, null, 'Kukučínova 15', '917 01', 'Slovakia', '2026-05-18'],
            ['lead-3', 'Thomas Müller', 'Košice', 'partner', 'offer sent', 'showroom', 'Erik', 45000, 3, '+49 172 888 999', 't.mueller@bavaria-logistics.de', 'DE98765432', '115/908/332', null, 'Thomas Müller', 'https://bavaria-logistics.de', 'Hauptstrasse 102', '040 01', 'Germany', '2026-05-10']
        ];

        $insLead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`, `street`, `postal_code`, `country`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($leads as $l) {
            $insLead->execute($l);
        }

        // Seed Lead Categories
        $leadCats = [
            ['lead-1', 'Kitchen Countertops'],
            ['lead-1', 'Flooring Tiles'],
            ['lead-2', 'Bathroom Renovation'],
            ['lead-3', 'Granite Slabs']
        ];
        $insLeadCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
        foreach ($leadCats as $lc) {
            $insLeadCat->execute($lc);
        }

        // Seed Timeline Events
        $timelineEvents = [
            ['ev-1', 'lead-1', 'phone', '2026-05-15 10:00', 'Discovery Call Logged', 'Discussed interior stone cladding options for the main showroom. Client is highly interested in thin porcelain slate slabs.', null, null, null, null, null],
            ['ev-2', 'lead-1', 'email', '2026-05-16 11:30', 'Sent Digital Catalog & Pricing', 'Emailed complete porcelain slate stone catalog and basic thickness pricing guidelines.', null, null, null, null, null],
            ['ev-3', 'lead-1', 'appointment', '2026-05-20 14:00', 'Showroom Meeting Bratislava', 'Met at our main showroom. Selected grey marble slab variants. Tomi compiled official technical logistics requirements.', null, null, null, null, '14:00'],
            ['ev-4', 'lead-1', 'offer', '2026-05-22 15:45', 'Official Price Offer Sent', 'Drafted and emailed formal budget quote detailing complete slabs cutting & assembly pricing.', 12500.00, 'novak_slabs_proposal.pdf', '1.45 MB', 'offer', null]
        ];

        $insTimeline = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `amount`, `file_name`, `file_size`, `file_type`, `extra_time`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($timelineEvents as $te) {
            $insTimeline->execute($te);
        }

        // Seed default Tasks
        $tasks = [
            ['task-1', 'Draft SLA contract for Bavaria Logistics', 'Prepare standard wholesale SLA layout including slab delivery timelines.', 'high', '2026-05-30', 'in_progress', 'Erik', 'lead-3', 1],
            ['task-2', 'Onsite laser measurement for kitchen countertop', 'Visit Martina\'s property in Trnava to take precise Proliner measurements for Calacatta Quartz.', 'high', '2026-05-31', 'todo', 'Tomi', 'lead-2', 1],
            ['task-3', 'Slab delivery coordination from Italy', 'Coordinate with logistics for the Laminam 12mm thickness slabs arriving from Fiorano Modenese.', 'medium', '2026-06-02', 'todo', 'Roli', 'lead-1', 0]
        ];
        $insTask = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `status`, `owner`, `related_lead_id`, `is_locking`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($tasks as $t) {
            $insTask->execute($t);
        }

        // Seed Task Assignees
        $taskAssignees = [
            ['task-1', 'Erik'],
            ['task-1', 'Roli'],
            ['task-2', 'Tomi'],
            ['task-3', 'Roli']
        ];
        $insAssignee = $pdo->prepare("INSERT INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
        foreach ($taskAssignees as $ta) {
            $insAssignee->execute($ta);
        }

    } else {
        // Fresh setup: Single Admin account, DemoMode = false
        $settings = [
            'DEMO_MODE' => 'false',
            'SYSTEM_NAME' => 'Laminam CRM',
            'SYSTEM_LANGUAGE' => 'sk',
            'LEAD_STATES' => json_encode(["new", "contacted", "offer sent", "accepted", "rejected"]),
            'LEAD_SOURCES' => json_encode(["showroom", "facebook", "instagram", "website"]),
            'LEAD_CATEGORIES' => json_encode(["Kitchen Countertops", "Flooring Tiles", "Bathroom Renovation", "Granite Slabs", "Plumbing Services", "Custom Masonry"]),
            'LEAD_STATE_COLORS' => json_encode(["new" => "#3b82f6", "contacted" => "#0ea5e9", "offer sent" => "#6366f1", "accepted" => "#10b981", "rejected" => "#ef4444"]),
            'LEAD_SOURCE_COLORS' => json_encode(["showroom" => "#10b981", "facebook" => "#3b82f6", "instagram" => "#ec4899", "website" => "#8b5cf6"]),
            'LEAD_CATEGORY_COLORS' => json_encode(["Kitchen Countertops" => "#f59e0b", "Flooring Tiles" => "#10b981", "Bathroom Renovation" => "#3b82f6", "Granite Slabs" => "#6366f1", "Plumbing Services" => "#0ea5e9", "Custom Masonry" => "#ec4899"]),
            'LEAD_STAGE_GROUPS' => json_encode(["new" => "new", "contacted" => "in_progress", "offer sent" => "in_progress", "accepted" => "closed", "rejected" => "closed"]),
            'LEAD_STATE_PARENTS' => json_encode((object)[])
        ];

        $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }

        // Default Admin User 'Admin'
        $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $insUser->execute(['admin-1', 'Admin', 'admin@crm.com', 'password', 'admin', null, '#f43f5e']);
    }

    $pdo->commit();
    echo json_encode(['success' => true, 'message' => 'Laminam CRM successfully provisioned!']);
} catch (\Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Migrations or seeding failed: ' . $e->getMessage()]);
}
