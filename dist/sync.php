<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$configFile = __DIR__ . '/config.php';

// 1. Check if installation config exists
if (!file_exists($configFile)) {
    echo json_encode([
        'installed' => false,
        'message' => 'Laminam CRM is not installed yet.'
    ]);
    exit;
}

require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    echo json_encode([
        'installed' => false,
        'message' => 'Database connection failed: ' . $e->getMessage()
    ]);
    exit;
}

// 2. Perform automated DDL auto-migrations on load
// Check if the system_settings and meeting_tasks tables exist
$tableExists = false;
$meetingTasksTableExists = false;
try {
    $result = $pdo->query("SELECT 1 FROM `system_settings` LIMIT 1");
    $tableExists = true;
} catch (\Exception $e) {
    $tableExists = false;
}
try {
    $result = $pdo->query("SELECT 1 FROM `meeting_tasks` LIMIT 1");
    $meetingTasksTableExists = true;
} catch (\Exception $e) {
    $meetingTasksTableExists = false;
}

if (!$tableExists || !$meetingTasksTableExists) {
    // Database schema is missing tables, trigger automated migration
    try {
        $queries = [
            "CREATE TABLE IF NOT EXISTS `users` (
              `id` VARCHAR(50) NOT NULL,
              `name` VARCHAR(100) NOT NULL,
              `email` VARCHAR(150) NOT NULL UNIQUE,
              `password_hash` VARCHAR(255) NOT NULL,
              `role` ENUM('admin', 'project_manager', 'viewer') NOT NULL DEFAULT 'viewer',
              `avatar` VARCHAR(255) NULL,
              `color` VARCHAR(20) NULL,
              `metadata_json` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              INDEX idx_user_email (`email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `permissions` (
              `id` INT AUTO_INCREMENT PRIMARY KEY,
              `slug` VARCHAR(100) NOT NULL UNIQUE,
              `description` VARCHAR(255) NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `role_permissions` (
              `role` ENUM('admin', 'project_manager', 'viewer') NOT NULL,
              `permission_slug` VARCHAR(100) NOT NULL,
              PRIMARY KEY (`role`, `permission_slug`),
              FOREIGN KEY (`permission_slug`) REFERENCES `permissions` (`slug`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `leads` (
              `id` VARCHAR(50) NOT NULL,
              `name` VARCHAR(150) NOT NULL,
              `city` VARCHAR(100) NULL,
              `client_type` ENUM('person', 'business', 'partner') NOT NULL DEFAULT 'person',
              `status` VARCHAR(50) NOT NULL DEFAULT 'new',
              `source` VARCHAR(50) NOT NULL DEFAULT 'website',
              `owner` VARCHAR(100) NOT NULL,
              `value` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `rating` INT NOT NULL DEFAULT 3,
              `phone` VARCHAR(30) NULL,
              `email` VARCHAR(150) NULL,
              `company_id` VARCHAR(50) NULL,
              `tax_id` VARCHAR(50) NULL,
              `vat_id` VARCHAR(50) NULL,
              `contact_person` VARCHAR(100) NULL,
              `website` VARCHAR(255) NULL,
              `street` VARCHAR(255) NULL,
              `postal_code` VARCHAR(20) NULL,
              `country` VARCHAR(100) NULL DEFAULT 'Slovakia',
              `metadata_json` TEXT NULL,
              `created_at` DATE NOT NULL,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `lead_categories` (
              `lead_id` VARCHAR(50) NOT NULL,
              `category_name` VARCHAR(100) NOT NULL,
              PRIMARY KEY (`lead_id`, `category_name`),
              FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

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
              FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `tasks` (
              `id` VARCHAR(50) NOT NULL,
              `title` VARCHAR(255) NOT NULL,
              `description` TEXT NULL,
              `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
              `deadline` DATE NOT NULL,
              `status` ENUM('todo', 'in_progress', 'blocked', 'done') NOT NULL DEFAULT 'todo',
              `owner` VARCHAR(100) NOT NULL,
              `related_lead_id` VARCHAR(50) NULL,
              `is_locking` TINYINT(1) NOT NULL DEFAULT 0,
              `metadata_json` TEXT NULL,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            "CREATE TABLE IF NOT EXISTS `task_assignees` (
              `task_id` VARCHAR(50) NOT NULL,
              `user_name` VARCHAR(100) NOT NULL,
              PRIMARY KEY (`task_id`, `user_name`),
              FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

             "CREATE TABLE IF NOT EXISTS `system_settings` (
               `key` VARCHAR(100) NOT NULL,
               `value` TEXT NOT NULL,
               PRIMARY KEY (`key`)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

             "CREATE TABLE IF NOT EXISTS `meeting_notes` (
               id VARCHAR(50) NOT NULL,
               title VARCHAR(255) NOT NULL,
               date DATE NOT NULL,
               lead_id VARCHAR(50) NULL,
               lead_name VARCHAR(150) NULL,
               duration INT NOT NULL DEFAULT 0,
               notes TEXT NULL,
               ai_summary_json TEXT NULL,
               summary_generated TINYINT(1) NOT NULL DEFAULT 0,
               attached_leads_json TEXT NULL,
               attached_clients_json TEXT NULL,
               attached_users_json TEXT NULL,
               archived TINYINT(1) NOT NULL DEFAULT 0,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
               updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
               PRIMARY KEY (id)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

             "CREATE TABLE IF NOT EXISTS `meeting_tasks` (
               id VARCHAR(50) NOT NULL,
               meeting_id VARCHAR(50) NOT NULL,
               title VARCHAR(255) NOT NULL,
               description TEXT NULL,
               assigned_user VARCHAR(100) NULL,
               due_date DATE NULL,
               priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
               status ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
               PRIMARY KEY (id),
               FOREIGN KEY (meeting_id) REFERENCES meeting_notes (id) ON DELETE CASCADE
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
         ];
        
        foreach ($queries as $q) {
            $pdo->exec($q);
        }
    } catch (\Exception $ex) {
        echo json_encode([
            'installed' => false,
            'message' => 'Automated schema migration failed: ' . $ex->getMessage()
        ]);
        exit;
    }
}

// Ensure the archived column exists on meeting_notes table (migration for existing database)
try {
    $pdo->exec("ALTER TABLE `meeting_notes` ADD COLUMN `archived` TINYINT(1) NOT NULL DEFAULT 0");
} catch (\Exception $e) {
    // Ignore if column already exists
}

// Helper to query and fetch all system settings
function fetch_system_settings($pdo) {
    $stmt = $pdo->query("SELECT `key`, `value` FROM `system_settings`");
    $settings = [];
    while ($row = $stmt->fetch()) {
        $settings[$row['key']] = $row['value'];
    }
    return $settings;
}

// 3. Handle GET Request: Read from Database
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $settings = fetch_system_settings($pdo);
    $isDemoMode = ($settings['DEMO_MODE'] ?? 'false') === 'true';

    // 3.1. Fetch Leads
    $leadsStmt = $pdo->query("SELECT * FROM `leads` ORDER BY `created_at` DESC");
    $leads = [];
    while ($row = $leadsStmt->fetch()) {
        $leadId = $row['id'];
        
        // Fetch Categories
        $catStmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
        $catStmt->execute([$leadId]);
        $categories = $catStmt->fetchAll(PDO::FETCH_COLUMN);

        // Fetch Timeline Events
        $timeStmt = $pdo->prepare("SELECT * FROM `timeline_events` WHERE `lead_id` = ? ORDER BY `timestamp` ASC");
        $timeStmt->execute([$leadId]);
        $timeline = [];
        while ($te = $timeStmt->fetch()) {
            $event = [
                'id' => $te['id'],
                'type' => $te['type'],
                'timestamp' => date('Y-m-d H:i', strtotime($te['timestamp'])),
                'title' => $te['title'],
                'content' => $te['content']
            ];
            if ($te['type'] === 'offer') {
                $event['amount'] = floatval($te['amount']);
                $event['fileName'] = $te['file_name'];
                $event['fileSize'] = $te['file_size'];
                $event['fileType'] = $te['file_type'];
            }
            if ($te['type'] === 'appointment') {
                $event['extraTime'] = $te['extra_time'];
            }
            $timeline[] = $event;
        }

        $leads[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'city' => $row['city'],
            'clientType' => $row['client_type'],
            'status' => $row['status'],
            'source' => $row['source'],
            'owner' => $row['owner'],
            'value' => floatval($row['value']),
            'rating' => intval($row['rating']),
            'phone' => $row['phone'] ?? '',
            'email' => $row['email'] ?? '',
            'companyId' => $row['company_id'] ?? '',
            'taxId' => $row['tax_id'] ?? '',
            'vatId' => $row['vat_id'] ?? '',
            'contactPerson' => $row['contact_person'] ?? '',
            'website' => $row['website'] ?? '',
            'address' => [
                'street' => $row['street'] ?? '',
                'city' => $row['city'] ?? '',
                'postalCode' => $row['postal_code'] ?? '',
                'country' => $row['country'] ?? 'Slovakia'
            ],
            'createdAt' => $row['created_at'],
            'categories' => $categories,
            'timeline' => $timeline
        ];
    }

    // 3.2. Fetch Tasks
    $tasksStmt = $pdo->query("SELECT * FROM `tasks` ORDER BY `created_at` DESC");
    $tasks = [];
    while ($row = $tasksStmt->fetch()) {
        $taskId = $row['id'];
        
        // Fetch Assignees
        $assStmt = $pdo->prepare("SELECT `user_name` FROM `task_assignees` WHERE `task_id` = ?");
        $assStmt->execute([$taskId]);
        $assignedUsers = $assStmt->fetchAll(PDO::FETCH_COLUMN);

        $tasks[] = [
            'id' => $taskId,
            'title' => $row['title'],
            'description' => $row['description'] ?? '',
            'priority' => $row['priority'],
            'deadline' => $row['deadline'],
            'status' => $row['status'],
            'owner' => $row['owner'],
            'relatedLeadId' => $row['related_lead_id'] ?? null,
            'isLocking' => intval($row['is_locking']) === 1,
            'assignedUsers' => $assignedUsers
        ];
    }

    // 3.3. Fetch Users
    $usersStmt = $pdo->query("SELECT * FROM `users` ORDER BY `name` ASC");
    $users = [];
    while ($row = $usersStmt->fetch()) {
        $users[] = [
            'name' => $row['name'],
            'email' => $row['email'],
            'password' => $row['password_hash'], // In high-fidelity mockup we use simple password text
            'role' => $row['role'] === 'admin' ? 'Admin' : 'Project Manager',
            'color' => $row['color'] ?? '#3b82f6',
            'avatar' => $row['avatar'] ?? null,
            'activityLog' => [], // Kept dynamic in localStorage for sessions, or empty array fallback
            'metadata_json' => $row['metadata_json']
        ];
    }

    // 3.4. Fetch Roles
    // Read from system_settings table if it exists, otherwise use fallback
    if (isset($settings['ROLES_RBAC'])) {
        $roles = json_decode($settings['ROLES_RBAC'], true);
    } else {
        $roles = [
            [
                'name' => 'Admin',
                'permissions' => [
                    'general_config' => 'edit',
                    'pm_managers' => 'edit',
                    'pipeline_stages' => 'edit',
                    'traffic_sources' => 'edit',
                    'system_reset' => 'edit',
                    'ai_config' => 'edit'
                ]
            ],
            [
                'name' => 'Project Manager',
                'permissions' => [
                    'general_config' => 'nothing',
                    'pm_managers' => 'nothing',
                    'pipeline_stages' => 'nothing',
                    'traffic_sources' => 'nothing',
                    'system_reset' => 'nothing',
                    'ai_config' => 'nothing'
                ]
            ]
        ];
    }

    // Reconstruct settings from system_settings DB table
    $leadStates = isset($settings['LEAD_STATES']) ? json_decode($settings['LEAD_STATES'], true) : ["new", "contacted", "offer sent", "accepted", "rejected"];
    $leadSources = isset($settings['LEAD_SOURCES']) ? json_decode($settings['LEAD_SOURCES'], true) : ["showroom", "facebook", "instagram", "website"];
    $leadCategories = isset($settings['LEAD_CATEGORIES']) ? json_decode($settings['LEAD_CATEGORIES'], true) : ["Kitchen Countertops", "Flooring Tiles", "Bathroom Renovation", "Granite Slabs", "Plumbing Services", "Custom Masonry"];
    $leadStateColors = isset($settings['LEAD_STATE_COLORS']) ? json_decode($settings['LEAD_STATE_COLORS'], true) : [];
    $leadSourceColors = isset($settings['LEAD_SOURCE_COLORS']) ? json_decode($settings['LEAD_SOURCE_COLORS'], true) : [];
    $leadCategoryColors = isset($settings['LEAD_CATEGORY_COLORS']) ? json_decode($settings['LEAD_CATEGORY_COLORS'], true) : [];
    $leadStageGroups = isset($settings['LEAD_STAGE_GROUPS']) ? json_decode($settings['LEAD_STAGE_GROUPS'], true) : [];
    $leadStateParents = isset($settings['LEAD_STATE_PARENTS']) ? json_decode($settings['LEAD_STATE_PARENTS'], true) : (object)[];
    $integrationsConfig = isset($settings['INTEGRATIONS_CONFIG']) ? json_decode($settings['INTEGRATIONS_CONFIG'], true) : (object)[];

    // Fetch Meeting Notes
    $meetingNotes = [];
    try {
        $meetingsStmt = $pdo->query("SELECT * FROM `meeting_notes` ORDER BY `date` DESC, `created_at` DESC");
        while ($row = $meetingsStmt->fetch()) {
            $meetingId = $row['id'];
            
            // Fetch Tasks
            $tStmt = $pdo->prepare("SELECT * FROM `meeting_tasks` WHERE `meeting_id` = ?");
            $tStmt->execute([$meetingId]);
            $automatedTasks = [];
            while ($tr = $tStmt->fetch()) {
                $automatedTasks[] = [
                    'id' => $tr['id'],
                    'title' => $tr['title'],
                    'description' => $tr['description'] ?? '',
                    'assignedUser' => $tr['assigned_user'] ?? '',
                    'dueDate' => $tr['due_date'] ?? '',
                    'priority' => $tr['priority'],
                    'status' => $tr['status']
                ];
            }
            
            $aiSummary = json_decode($row['ai_summary_json'] ?? '{}', true);
            if (!isset($aiSummary['summary'])) {
                $aiSummary = [
                    'summary' => $aiSummary['summary'] ?? '',
                    'actionItems' => $aiSummary['actionItems'] ?? [],
                    'sentiment' => $aiSummary['sentiment'] ?? 'neutral',
                    'topics' => $aiSummary['topics'] ?? []
                ];
            }
            
            $meetingNotes[] = [
                'id' => $meetingId,
                'title' => $row['title'],
                'date' => $row['date'],
                'leadId' => $row['lead_id'] ?? '',
                'leadName' => $row['lead_name'] ?? '',
                'duration' => (int)$row['duration'],
                'notes' => $row['notes'] ?? '[]',
                'aiSummary' => $aiSummary,
                'summaryGenerated' => (int)$row['summary_generated'] === 1,
                'attachedLeads' => json_decode($row['attached_leads_json'] ?? '[]', true),
                'attachedClients' => json_decode($row['attached_clients_json'] ?? '[]', true),
                'attachedUsers' => json_decode($row['attached_users_json'] ?? '[]', true),
                'automatedTasks' => $automatedTasks,
                'archived' => isset($row['archived']) && (int)$row['archived'] === 1
            ];
        }
    } catch (\Exception $e) {
        // Fallback
    }

    echo json_encode([
        'installed' => true,
        'demoMode' => $isDemoMode,
        'leads' => $leads,
        'tasks' => $tasks,
        'users' => $users,
        'roles' => $roles,
        'meetingNotes' => $meetingNotes,
        'db_info' => [
            'host' => DB_HOST,
            'port' => DB_PORT,
            'name' => DB_NAME,
            'user' => DB_USER
        ],
        'settings' => [
            'systemName' => $settings['SYSTEM_NAME'] ?? 'Laminam CRM',
            'systemLanguage' => $settings['SYSTEM_LANGUAGE'] ?? 'sk',
            'leadStates' => $leadStates,
            'leadSources' => $leadSources,
            'leadCategories' => $leadCategories,
            'leadStateColors' => $leadStateColors,
            'leadSourceColors' => $leadSourceColors,
            'leadCategoryColors' => $leadCategoryColors,
            'leadStageGroups' => $leadStageGroups,
            'leadStateParents' => $leadStateParents,
            'integrationsConfig' => $integrationsConfig
        ]
    ]);
    exit;
}

// 4. Handle POST Request: Write/Sync State to Database
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);

    if (!$payload) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON payload']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // 4.1. Save system settings & configurations
        if (isset($payload['settings'])) {
            $s = $payload['settings'];
            $settingsList = [
                'SYSTEM_NAME' => $s['systemName'] ?? 'Laminam CRM',
                'SYSTEM_LANGUAGE' => $s['systemLanguage'] ?? 'sk',
                'LEAD_STATES' => json_encode($s['leadStates'] ?? []),
                'LEAD_SOURCES' => json_encode($s['leadSources'] ?? []),
                'LEAD_CATEGORIES' => json_encode($s['leadCategories'] ?? []),
                'LEAD_STATE_COLORS' => json_encode($s['leadStateColors'] ?? []),
                'LEAD_SOURCE_COLORS' => json_encode($s['leadSourceColors'] ?? []),
                'LEAD_CATEGORY_COLORS' => json_encode($s['leadCategoryColors'] ?? []),
                'LEAD_STAGE_GROUPS' => json_encode($s['leadStageGroups'] ?? []),
                'LEAD_STATE_PARENTS' => json_encode($s['leadStateParents'] ?? (object)[]),
                'INTEGRATIONS_CONFIG' => json_encode($s['integrationsConfig'] ?? (object)[])
            ];

            $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            foreach ($settingsList as $k => $v) {
                $insSet->execute([$k, $v]);
            }
        }

        // Save Roles RBAC registry
        if (isset($payload['roles'])) {
            $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $insSet->execute(['ROLES_RBAC', json_encode($payload['roles'])]);
        }

        // 4.2. Synchronize Users list
        if (isset($payload['users']) && is_array($payload['users'])) {
            // Read current database users to handle deletes
            $stmt = $pdo->query("SELECT `id` FROM `users`");
            $existingUserIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $processedUserIds = [];

             $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`, `metadata_json`) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `email` = VALUES(`email`), `password_hash` = VALUES(`password_hash`), `role` = VALUES(`role`), `avatar` = VALUES(`avatar`), `color` = VALUES(`color`), `metadata_json` = VALUES(`metadata_json`)");
            
            foreach ($payload['users'] as $u) {
                // Generate simple hash or ID from name
                $userId = 'u-' . md5($u['email']);
                $role = strtolower(str_replace(' ', '_', $u['role']));
                if ($role !== 'admin' && $role !== 'project_manager') {
                    $role = 'viewer';
                }
                
                $metaJson = isset($u['metadata_json']) ? $u['metadata_json'] : (isset($u['metadata']) ? json_encode($u['metadata']) : null);

                $insUser->execute([
                    $userId,
                    $u['name'],
                    $u['email'],
                    $u['password'] ?? 'password',
                    $role,
                    $u['avatar'] ?? null,
                    $u['color'] ?? '#3b82f6',
                    $metaJson
                ]);
                $processedUserIds[] = $userId;
            }

            // Remove any users not in payload (Erik Admin is protected)
            $usersToDelete = array_diff($existingUserIds, $processedUserIds);
            if (!empty($usersToDelete)) {
                $delUser = $pdo->prepare("DELETE FROM `users` WHERE `id` = ? AND `name` != 'Erik'");
                foreach ($usersToDelete as $uid) {
                    $delUser->execute([$uid]);
                }
            }
        }

        // 4.3. Synchronize Leads, Categories & Timelines
        if (isset($payload['leads']) && is_array($payload['leads'])) {
            $stmt = $pdo->query("SELECT `id` FROM `leads`");
            $existingLeadIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $processedLeadIds = [];

            $insLead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`, `street`, `postal_code`, `country`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `city` = VALUES(`city`), `client_type` = VALUES(`client_type`), `status` = VALUES(`status`), `source` = VALUES(`source`), `owner` = VALUES(`owner`), `value` = VALUES(`value`), `rating` = VALUES(`rating`), `phone` = VALUES(`phone`), `email` = VALUES(`email`), `company_id` = VALUES(`company_id`), `tax_id` = VALUES(`tax_id`), `vat_id` = VALUES(`vat_id`), `contact_person` = VALUES(`contact_person`), `website` = VALUES(`website`), `street` = VALUES(`street`), `postal_code` = VALUES(`postal_code`), `country` = VALUES(`country`)");
            
            foreach ($payload['leads'] as $l) {
                $leadId = $l['id'];
                $address = $l['address'] ?? [];
                
                // Write standard Opportunity Lead parameters
                $insLead->execute([
                    $leadId,
                    $l['name'],
                    $l['city'] ?? '',
                    $l['clientType'] ?? 'person',
                    $l['status'] ?? 'new',
                    $l['source'] ?? 'website',
                    $l['owner'] ?? 'Tomi',
                    $l['value'] ?? 0.00,
                    $l['rating'] ?? 3,
                    $l['phone'] ?? null,
                    $l['email'] ?? null,
                    $l['companyId'] ?? null,
                    $l['taxId'] ?? null,
                    $l['vatId'] ?? null,
                    $l['contactPerson'] ?? null,
                    $l['website'] ?? null,
                    $address['street'] ?? null,
                    $address['postalCode'] ?? null,
                    $address['country'] ?? 'Slovakia',
                    $l['createdAt'] ?? date('Y-m-d')
                ]);
                $processedLeadIds[] = $leadId;

                // Sync interested stone categories (Delete & Insert list)
                $delCat = $pdo->prepare("DELETE FROM `lead_categories` WHERE `lead_id` = ?");
                $delCat->execute([$leadId]);

                if (isset($l['categories']) && is_array($l['categories'])) {
                    $insCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
                    foreach ($l['categories'] as $catName) {
                        $insCat->execute([$leadId, $catName]);
                    }
                }

                // Sync lead chronological event logs timeline
                $delTimeline = $pdo->prepare("DELETE FROM `timeline_events` WHERE `lead_id` = ? AND `id` NOT LIKE 'email-%'");
                $delTimeline->execute([$leadId]);

                if (isset($l['timeline']) && is_array($l['timeline'])) {
                    $insTimeline = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `amount`, `file_name`, `file_size`, `file_type`, `extra_time`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($l['timeline'] as $te) {
                        $teId = $te['id'] ?? ('ev-' . uniqid());
                        if (strpos($teId, 'email-') === 0) {
                            continue;
                        }
                        $timestamp = isset($te['timestamp']) ? date('Y-m-d H:i:s', strtotime($te['timestamp'])) : date('Y-m-d H:i:s');
                        
                        $insTimeline->execute([
                            $teId,
                            $leadId,
                            $te['type'] ?? 'note',
                            $timestamp,
                            $te['title'],
                            $te['content'] ?? null,
                            $te['amount'] ?? null,
                            $te['fileName'] ?? null,
                            $te['fileSize'] ?? null,
                            $te['fileType'] ?? null,
                            $te['extraTime'] ?? null
                        ]);
                    }
                }
            }

            // Perform deletions for removed leads
            $leadsToDelete = array_diff($existingLeadIds, $processedLeadIds);
            if (!empty($leadsToDelete)) {
                $delLead = $pdo->prepare("DELETE FROM `leads` WHERE `id` = ?");
                foreach ($leadsToDelete as $lid) {
                    $delLead->execute([$lid]);
                }
            }
        }

        // 4.4. Synchronize Tasks
        if (isset($payload['tasks']) && is_array($payload['tasks'])) {
            $stmt = $pdo->query("SELECT `id` FROM `tasks`");
            $existingTaskIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $processedTaskIds = [];

            $insTask = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `status`, `owner`, `related_lead_id`, `is_locking`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `description` = VALUES(`description`), `priority` = VALUES(`priority`), `deadline` = VALUES(`deadline`), `status` = VALUES(`status`), `owner` = VALUES(`owner`), `related_lead_id` = VALUES(`related_lead_id`), `is_locking` = VALUES(`is_locking`)");
            
            foreach ($payload['tasks'] as $t) {
                $taskId = $t['id'];
                
                $insTask->execute([
                    $taskId,
                    $t['title'],
                    $t['description'] ?? '',
                    $t['priority'] ?? 'medium',
                    $t['deadline'],
                    $t['status'] ?? 'todo',
                    $t['owner'],
                    $t['relatedLeadId'] ?? null,
                    ($t['isLocking'] ?? false) ? 1 : 0
                ]);
                $processedTaskIds[] = $taskId;

                // Sync assignees (Delete & Insert list)
                $delAss = $pdo->prepare("DELETE FROM `task_assignees` WHERE `task_id` = ?");
                $delAss->execute([$taskId]);

                if (isset($t['assignedUsers']) && is_array($t['assignedUsers'])) {
                    $insAss = $pdo->prepare("INSERT INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
                    foreach ($t['assignedUsers'] as $user_name) {
                        $insAss->execute([$taskId, $user_name]);
                    }
                }
            }

            // Perform task deletes
            $tasksToDelete = array_diff($existingTaskIds, $processedTaskIds);
            if (!empty($tasksToDelete)) {
                $delTask = $pdo->prepare("DELETE FROM `tasks` WHERE `id` = ?");
                foreach ($tasksToDelete as $tid) {
                    $delTask->execute([$tid]);
                }
            }
        }

        // 4.5. Synchronize Meeting Notes & meeting_tasks
        if (isset($payload['meetingNotes']) && is_array($payload['meetingNotes'])) {
            // Fetch existing ids to delete
            $stmt = $pdo->query("SELECT `id` FROM `meeting_notes`");
            $existingMeetingIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $processedMeetingIds = [];

            $insMeeting = $pdo->prepare("INSERT INTO `meeting_notes` (`id`, `title`, `date`, `lead_id`, `lead_name`, `duration`, `notes`, `ai_summary_json`, `summary_generated`, `attached_leads_json`, `attached_clients_json`, `attached_users_json`, `archived`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `date` = VALUES(`date`), `lead_id` = VALUES(`lead_id`), `lead_name` = VALUES(`lead_name`), `duration` = VALUES(`duration`), `notes` = VALUES(`notes`), `ai_summary_json` = VALUES(`ai_summary_json`), `summary_generated` = VALUES(`summary_generated`), `attached_leads_json` = VALUES(`attached_leads_json`), `attached_clients_json` = VALUES(`attached_clients_json`), `attached_users_json` = VALUES(`attached_users_json`), `archived` = VALUES(`archived`)");
            
            foreach ($payload['meetingNotes'] as $mn) {
                $meetingId = $mn['id'];
                $insMeeting->execute([
                    $meetingId,
                    $mn['title'] ?? '',
                    $mn['date'] ?? date('Y-m-d'),
                    (isset($mn['leadId']) && $mn['leadId'] !== '') ? $mn['leadId'] : null,
                    (isset($mn['leadName']) && $mn['leadName'] !== '') ? $mn['leadName'] : null,
                    $mn['duration'] ?? 0,
                    $mn['notes'] ?? '[]',
                    json_encode($mn['aiSummary'] ?? (object)[]),
                    ($mn['summaryGenerated'] ?? false) ? 1 : 0,
                    json_encode($mn['attachedLeads'] ?? []),
                    json_encode($mn['attachedClients'] ?? []),
                    json_encode($mn['attachedUsers'] ?? []),
                    ($mn['archived'] ?? false) ? 1 : 0
                ]);
                $processedMeetingIds[] = $meetingId;

                // Sync meeting_tasks (Delete & Insert list)
                $delTasks = $pdo->prepare("DELETE FROM `meeting_tasks` WHERE `meeting_id` = ?");
                $delTasks->execute([$meetingId]);

                if (isset($mn['automatedTasks']) && is_array($mn['automatedTasks'])) {
                    $insTask = $pdo->prepare("INSERT INTO `meeting_tasks` (`id`, `meeting_id`, `title`, `description`, `assigned_user`, `due_date`, `priority`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($mn['automatedTasks'] as $task) {
                        $insTask->execute([
                            $task['id'],
                            $meetingId,
                            $task['title'] ?? '',
                            $task['description'] ?? '',
                            (isset($task['assignedUser']) && $task['assignedUser'] !== '') ? $task['assignedUser'] : null,
                            (isset($task['dueDate']) && $task['dueDate'] !== '') ? $task['dueDate'] : null,
                            $task['priority'] ?? 'medium',
                            $task['status'] ?? 'todo'
                        ]);
                    }
                }
            }

            // Delete any meeting notes not present in payload
            $meetingsToDelete = array_diff($existingMeetingIds, $processedMeetingIds);
            if (!empty($meetingsToDelete)) {
                $delMeeting = $pdo->prepare("DELETE FROM `meeting_notes` WHERE `id` = ?");
                foreach ($meetingsToDelete as $mid) {
                    $delMeeting->execute([$mid]);
                }
            }
        }

        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Laminam CRM Database Synced Successfully!']);
    } catch (\Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed database synchronization: ' . $e->getMessage()]);
    }
    exit;
}
