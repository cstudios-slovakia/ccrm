<?php
/**
 * Installation wizard endpoint.
 *
 * Hardening vs. the original:
 *  - Same-origin only (no wildcard CORS).
 *  - Refuses to run once the CRM is already installed, so it can no longer be
 *    used by an anonymous caller to overwrite config.php / re-provision the DB.
 *  - `type: "test_only"` ONLY tests the connection — it never writes config.php
 *    or seeds data.
 *  - All seeded/admin passwords are stored as bcrypt hashes.
 *  - Schema comes from the shared schema.php (single source of truth).
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

$host        = trim((string)($data['host'] ?? ''));
$port        = trim((string)($data['port'] ?? '3306'));
$dbname      = trim((string)($data['dbname'] ?? ''));
$user        = trim((string)($data['user'] ?? ''));
$pass        = (string)($data['pass'] ?? '');
$installType = $data['type'] ?? 'fresh'; // 'fresh' | 'demo' | 'test_only'

if (empty($host) || empty($dbname) || empty($user)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required connection specifications']);
    exit;
}

// Once installed, the wizard is closed. Reconfiguration must be done by editing
// config.php on the server — an anonymous request can no longer overwrite it.
if ($installType !== 'test_only' && file_exists($configFile)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'CRM is already installed. Setup is disabled.']);
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

// A connection test stops here without touching the filesystem or the database.
if ($installType === 'test_only') {
    echo json_encode(['success' => true, 'message' => 'Connection OK']);
    exit;
}

// 2. Prepare credentials for config.php (will be written upon successful migration and seeding)
$configContent = "<?php
// Database credentials file
// Automatically created by the CCRM Installation Wizard

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


// 3. Apply schema (single source of truth) and seed.
try {
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
    $tables = ['meeting_tasks', 'meeting_notes', 'plugins', 'system_settings', 'task_assignees', 'tasks', 'timeline_events', 'lead_categories', 'leads', 'role_permissions', 'permissions', 'users'];
    foreach ($tables as $table) {
        $pdo->exec("DROP TABLE IF EXISTS `$table` CASCADE");
    }
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");

    ccrm_apply_schema($pdo);
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Schema migration failed: ' . $e->getMessage()]);
    exit;
}

try {
    $pdo->beginTransaction();

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
        ['ai_config', 'Configure OpenAI API credentials and settings'],
        ['system_reset', 'Truncate database or restore mock seeders'],
    ];

    $checkPerm = $pdo->query("SELECT COUNT(*) FROM `permissions`")->fetchColumn();
    if ($checkPerm == 0) {
        $insPerm = $pdo->prepare("INSERT INTO `permissions` (`slug`, `description`) VALUES (?, ?)");
        foreach ($permissionsSlugs as $p) {
            $insPerm->execute($p);
        }
    }

    $baseSettings = [
        'SYSTEM_NAME' => 'CCRM',
        'SYSTEM_LANGUAGE' => 'sk',
        'LEAD_STATES' => json_encode(["new", "contacted", "offer sent", "accepted", "rejected"]),
        'LEAD_SOURCES' => json_encode(["showroom", "facebook", "instagram", "website"]),
        'LEAD_CATEGORIES' => json_encode(["Kitchen Countertops", "Flooring Tiles", "Bathroom Renovation", "Granite Slabs", "Plumbing Services", "Custom Masonry"]),
        'LEAD_STATE_COLORS' => json_encode(["new" => "#3b82f6", "contacted" => "#0ea5e9", "offer sent" => "#6366f1", "accepted" => "#10b981", "rejected" => "#ef4444"]),
        'LEAD_SOURCE_COLORS' => json_encode(["showroom" => "#10b981", "facebook" => "#3b82f6", "instagram" => "#ec4899", "website" => "#8b5cf6"]),
        'LEAD_CATEGORY_COLORS' => json_encode(["Kitchen Countertops" => "#f59e0b", "Flooring Tiles" => "#10b981", "Bathroom Renovation" => "#3b82f6", "Granite Slabs" => "#6366f1", "Plumbing Services" => "#0ea5e9", "Custom Masonry" => "#ec4899"]),
        'LEAD_STAGE_GROUPS' => json_encode(["new" => "new", "contacted" => "in_progress", "offer sent" => "in_progress", "accepted" => "closed", "rejected" => "closed"]),
        'LEAD_STATE_PARENTS' => json_encode((object)[]),
    ];

    $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");

    // User ids use the same deterministic scheme as sync.php so that later
    // syncs from the client update (rather than duplicate or orphan) these rows.
    $userId = static function (string $email): string {
        return 'u-' . md5(strtolower(trim($email)));
    };

    $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `role`=VALUES(`role`)");

    if ($installType === 'demo') {
        $settings = array_merge($baseSettings, ['DEMO_MODE' => 'true']);
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }

        // Demo accounts (password: "password"), stored hashed.
        $demoUsers = [
            ['Erik', 'erik@crm.com', 'password', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop', '#10b981'],
            ['Tomi', 'tomi@crm.com', 'password', 'project_manager', null, '#6366f1'],
            ['Roli', 'roli@crm.com', 'password', 'project_manager', null, '#f59e0b'],
        ];
        foreach ($demoUsers as $u) {
            $insUser->execute([$userId($u[1]), $u[0], $u[1], password_hash($u[2], PASSWORD_DEFAULT), $u[3], $u[4], $u[5]]);
        }

        // Seed default leads
        $leads = [
            ['lead-1', 'Ján Novák', 'Bratislava', 'business', 'new', 'website', 'Tomi', 12500, 5, '+421 905 123 456', 'novak@example.com', '36123456', '2021234567', 'SK2021234567', 'Ing. Ján Novák', 'https://example.com', 'Mlynské Nivy 42', '821 09', 'Slovakia', '2026-05-15'],
            ['lead-2', 'Martina Kováčová', 'Trnava', 'person', 'contacted', 'instagram', 'Roli', 8400, 4, '+421 911 987 654', 'm.kovacova@example.com', null, null, null, null, null, 'Kukučínova 15', '917 01', 'Slovakia', '2026-05-18'],
            ['lead-3', 'Thomas Müller', 'Košice', 'partner', 'offer sent', 'showroom', 'Erik', 45000, 3, '+49 172 888 999', 't.mueller@example.de', 'DE98765432', '115/908/332', null, 'Thomas Müller', 'https://example.de', 'Hauptstrasse 102', '040 01', 'Germany', '2026-05-10'],
        ];
        $insLead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`, `street`, `postal_code`, `country`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($leads as $l) {
            $insLead->execute($l);
        }

        $leadCats = [
            ['lead-1', 'Kitchen Countertops'],
            ['lead-1', 'Flooring Tiles'],
            ['lead-2', 'Bathroom Renovation'],
            ['lead-3', 'Granite Slabs'],
        ];
        $insLeadCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
        foreach ($leadCats as $lc) {
            $insLeadCat->execute($lc);
        }

        $timelineEvents = [
            ['ev-1', 'lead-1', 'phone', '2026-05-15 10:00', 'Discovery Call Logged', 'Discussed interior stone cladding options for the main showroom. Client is highly interested in thin porcelain slate slabs.', null, null, null, null, null],
            ['ev-2', 'lead-1', 'email', '2026-05-16 11:30', 'Sent Digital Catalog & Pricing', 'Emailed complete porcelain slate stone catalog and basic thickness pricing guidelines.', null, null, null, null, null],
            ['ev-3', 'lead-1', 'appointment', '2026-05-20 14:00', 'Showroom Meeting Bratislava', 'Met at our main showroom. Selected grey marble slab variants. Tomi compiled official technical logistics requirements.', null, null, null, null, '14:00'],
            ['ev-4', 'lead-1', 'offer', '2026-05-22 15:45', 'Official Price Offer Sent', 'Drafted and emailed formal budget quote detailing complete slabs cutting & assembly pricing.', 12500.00, 'novak_slabs_proposal.pdf', '1.45 MB', 'offer', null],
        ];
        $insTimeline = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `amount`, `file_name`, `file_size`, `file_type`, `extra_time`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($timelineEvents as $te) {
            $insTimeline->execute($te);
        }

        $tasks = [
            ['task-1', 'Draft SLA contract for wholesale partner', 'Prepare standard wholesale SLA layout including slab delivery timelines.', 'high', '2026-05-30', 'in_progress', 'Erik', 'lead-3', 1],
            ['task-2', 'Onsite laser measurement for kitchen countertop', 'Visit the property in Trnava to take precise Proliner measurements for Calacatta Quartz.', 'high', '2026-05-31', 'todo', 'Tomi', 'lead-2', 1],
            ['task-3', 'Slab delivery coordination from Italy', 'Coordinate with logistics for the 12mm thickness slabs arriving from Fiorano Modenese.', 'medium', '2026-06-02', 'todo', 'Roli', 'lead-1', 0],
        ];
        $insTask = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `status`, `owner`, `related_lead_id`, `is_locking`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($tasks as $t) {
            $insTask->execute($t);
        }

        $taskAssignees = [
            ['task-1', 'Erik'],
            ['task-1', 'Roli'],
            ['task-2', 'Tomi'],
            ['task-3', 'Roli'],
        ];
        $insAssignee = $pdo->prepare("INSERT INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
        foreach ($taskAssignees as $ta) {
            $insAssignee->execute($ta);
        }

    } else {
        // Fresh setup: a single administrator account with operator-supplied
        // credentials (falls back to a sensible default only if none provided).
        $settings = array_merge($baseSettings, ['DEMO_MODE' => 'false']);
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }

        $adminName  = trim((string)($data['adminName'] ?? '')) ?: 'Admin';
        $adminEmail = trim((string)($data['adminEmail'] ?? '')) ?: 'admin@crm.com';
        $adminPass  = (string)($data['adminPassword'] ?? '');
        $generatedPassword = null;
        if ($adminPass === '') {
            // No password supplied: generate a random one and return it once so
            // the operator is never left without a way in.
            $adminPass = bin2hex(random_bytes(6));
            $generatedPassword = $adminPass;
        }

        $insUser->execute([
            $userId($adminEmail),
            $adminName,
            $adminEmail,
            password_hash($adminPass, PASSWORD_DEFAULT),
            'admin',
            null,
            '#f43f5e',
        ]);
    }

    $pdo->commit();

    if (file_put_contents($configFile, $configContent) === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to write config.php file. Check directory permissions.']);
        exit;
    }

    $response = ['success' => true, 'message' => 'CCRM successfully provisioned!'];
    if (!empty($generatedPassword)) {
        $response['adminEmail'] = $adminEmail;
        $response['generatedPassword'] = $generatedPassword;
        $response['message'] = 'CCRM provisioned. Save these admin credentials now — they will not be shown again.';
    }
    echo json_encode($response);
} catch (\Exception $e) {
    $errorMsg = $e->getMessage();
    try {
        if (isset($pdo) && $pdo && $pdo->inTransaction()) {
            @$pdo->rollBack();
        }
    } catch (\Exception $rollbackEx) {
        // Ignore rollback failure to preserve original exception
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Migrations or seeding failed: ' . $errorMsg]);
}
