<?php
/**
 * Live state sync endpoint.
 *
 * GET  — public read of CRM state used to bootstrap the SPA. It NEVER returns
 *        password material (see "Fetch Users" below).
 * POST — mutating sync; requires an authenticated session (see api/login.php).
 *
 * Schema/migrations come from the shared api/schema.php (single source of truth).
 */
require_once __DIR__ . '/api/auth.php';
require_once __DIR__ . '/api/schema.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
ccrm_send_cors('GET, POST, OPTIONS');

$configFile = __DIR__ . '/config.php';

// 1. Check if installation config exists
if (!file_exists($configFile)) {
    echo json_encode([
        'installed' => false,
        'message' => 'CCRM is not installed yet.'
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

// 2. Ensure schema is present and migrated (idempotent, single source of truth).
try {
    ccrm_apply_schema($pdo);
} catch (\Exception $e) {
    echo json_encode([
        'installed' => false,
        'message' => 'Automated schema migration failed: ' . $e->getMessage()
    ]);
    exit;
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
            'timeline' => $timeline,
            'aiSummary' => $row['ai_summary'] ?? '',
            'aiSummaryFingerprint' => $row['ai_summary_fingerprint'] ?? ''
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
            'startDate' => $row['start_date'] ?? null,
            'deadline' => $row['deadline'],
            'status' => $row['status'],
            'owner' => $row['owner'],
            'relatedLeadId' => $row['related_lead_id'] ?? null,
            'isLocking' => intval($row['is_locking']) === 1,
            'assignedUsers' => $assignedUsers
        ];
    }

    // 3.3. Fetch Users
    // SECURITY: password hashes are never exposed to clients. Authentication is
    // performed server-side by api/login.php.
    $usersStmt = $pdo->query("SELECT * FROM `users` ORDER BY `name` ASC");
    $users = [];
    while ($row = $usersStmt->fetch()) {
        $users[] = [
            'name' => $row['name'],
            'email' => $row['email'],
            'role' => ccrm_role_label($row['role']),
            'color' => $row['color'] ?? '#3b82f6',
            'avatar' => $row['avatar'] ?? null,
            'activityLog' => [],
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
                    'startDate' => $tr['start_date'] ?? null,
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
                'archived' => isset($row['archived']) && (int)$row['archived'] === 1,
                'audioFile' => $row['audio_file'] ?? null,
                'transcription' => $row['transcription'] ?? null,
                'automatedNotes' => $row['automated_notes'] ?? null
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
        'settings' => [
            'systemName' => $settings['SYSTEM_NAME'] ?? 'CCRM',
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
    // SECURITY: writes require an authenticated session.
    $sessionUser = ccrm_require_auth();

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
                'SYSTEM_NAME' => $s['systemName'] ?? 'CCRM',
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
            // Existing rows with their current password hashes so we can preserve
            // a user's password when the client does not send a new one.
            $existingHashes = $pdo->query("SELECT `id`, `password_hash` FROM `users`")->fetchAll(PDO::FETCH_KEY_PAIR);
            $existingUserIds = array_keys($existingHashes);
            $processedUserIds = [];

            $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`, `metadata_json`) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `email` = VALUES(`email`), `password_hash` = VALUES(`password_hash`), `role` = VALUES(`role`), `avatar` = VALUES(`avatar`), `color` = VALUES(`color`), `metadata_json` = VALUES(`metadata_json`)");

            foreach ($payload['users'] as $u) {
                if (empty($u['email'])) {
                    continue;
                }
                $userId = 'u-' . md5(strtolower(trim($u['email'])));
                $role = ccrm_normalize_role($u['role'] ?? 'viewer');

                $metaJson = isset($u['metadata_json']) ? $u['metadata_json'] : (isset($u['metadata']) ? json_encode($u['metadata']) : null);

                // Password handling:
                //  - a new, non-empty, non-hashed password is bcrypt-hashed;
                //  - otherwise we preserve the existing hash;
                //  - brand-new users with no password get an unusable random hash
                //    (admin must set one) rather than a predictable default.
                $incoming = isset($u['password']) ? trim((string)$u['password']) : '';
                if ($incoming !== '') {
                    $hash = ccrm_hash_password($incoming);
                } elseif (isset($existingHashes[$userId]) && $existingHashes[$userId] !== '') {
                    $hash = $existingHashes[$userId];
                } else {
                    $hash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
                }

                $insUser->execute([
                    $userId,
                    $u['name'],
                    $u['email'],
                    $hash,
                    $role,
                    $u['avatar'] ?? null,
                    $u['color'] ?? '#3b82f6',
                    $metaJson
                ]);
                $processedUserIds[] = $userId;
            }

            // Remove any users not in payload, but never delete the account that
            // is performing this sync (prevents accidental self-lockout).
            $usersToDelete = array_diff($existingUserIds, $processedUserIds);
            if (!empty($usersToDelete)) {
                $delUser = $pdo->prepare("DELETE FROM `users` WHERE `id` = ?");
                foreach ($usersToDelete as $uid) {
                    if ($uid === $sessionUser['id']) {
                        continue;
                    }
                    $delUser->execute([$uid]);
                }
            }
        }

        // 4.3. Synchronize Leads, Categories & Timelines
        if (isset($payload['leads']) && is_array($payload['leads'])) {
            $stmt = $pdo->query("SELECT `id` FROM `leads`");
            $existingLeadIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $processedLeadIds = [];

            $insLead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`, `street`, `postal_code`, `country`, `ai_summary`, `ai_summary_fingerprint`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `city` = VALUES(`city`), `client_type` = VALUES(`client_type`), `status` = VALUES(`status`), `source` = VALUES(`source`), `owner` = VALUES(`owner`), `value` = VALUES(`value`), `rating` = VALUES(`rating`), `phone` = VALUES(`phone`), `email` = VALUES(`email`), `company_id` = VALUES(`company_id`), `tax_id` = VALUES(`tax_id`), `vat_id` = VALUES(`vat_id`), `contact_person` = VALUES(`contact_person`), `website` = VALUES(`website`), `street` = VALUES(`street`), `postal_code` = VALUES(`postal_code`), `country` = VALUES(`country`), `ai_summary` = VALUES(`ai_summary`), `ai_summary_fingerprint` = VALUES(`ai_summary_fingerprint`)");

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
                    $l['aiSummary'] ?? null,
                    $l['aiSummaryFingerprint'] ?? null,
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

            $insTask = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `start_date`, `deadline`, `status`, `owner`, `related_lead_id`, `is_locking`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `description` = VALUES(`description`), `priority` = VALUES(`priority`), `start_date` = VALUES(`start_date`), `deadline` = VALUES(`deadline`), `status` = VALUES(`status`), `owner` = VALUES(`owner`), `related_lead_id` = VALUES(`related_lead_id`), `is_locking` = VALUES(`is_locking`)");

            foreach ($payload['tasks'] as $t) {
                $taskId = $t['id'];

                $insTask->execute([
                    $taskId,
                    $t['title'],
                    $t['description'] ?? '',
                    $t['priority'] ?? 'medium',
                    (isset($t['startDate']) && $t['startDate'] !== '') ? $t['startDate'] : null,
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

            $insMeeting = $pdo->prepare("INSERT INTO `meeting_notes` (`id`, `title`, `date`, `lead_id`, `lead_name`, `duration`, `notes`, `ai_summary_json`, `summary_generated`, `attached_leads_json`, `attached_clients_json`, `attached_users_json`, `archived`, `audio_file`, `transcription`, `automated_notes`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `date` = VALUES(`date`), `lead_id` = VALUES(`lead_id`), `lead_name` = VALUES(`lead_name`), `duration` = VALUES(`duration`), `notes` = VALUES(`notes`), `ai_summary_json` = VALUES(`ai_summary_json`), `summary_generated` = VALUES(`summary_generated`), `attached_leads_json` = VALUES(`attached_leads_json`), `attached_clients_json` = VALUES(`attached_clients_json`), `attached_users_json` = VALUES(`attached_users_json`), `archived` = VALUES(`archived`), `audio_file` = VALUES(`audio_file`), `transcription` = VALUES(`transcription`), `automated_notes` = VALUES(`automated_notes`)");

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
                    ($mn['archived'] ?? false) ? 1 : 0,
                    $mn['audioFile'] ?? null,
                    $mn['transcription'] ?? null,
                    $mn['automatedNotes'] ?? null
                ]);
                $processedMeetingIds[] = $meetingId;

                // Sync meeting_tasks (Delete & Insert list)
                $delTasks = $pdo->prepare("DELETE FROM `meeting_tasks` WHERE `meeting_id` = ?");
                $delTasks->execute([$meetingId]);

                if (isset($mn['automatedTasks']) && is_array($mn['automatedTasks'])) {
                    $insTask = $pdo->prepare("INSERT INTO `meeting_tasks` (`id`, `meeting_id`, `title`, `description`, `start_date`, `assigned_user`, `due_date`, `priority`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($mn['automatedTasks'] as $task) {
                        $insTask->execute([
                            $task['id'],
                            $meetingId,
                            $task['title'] ?? '',
                            $task['description'] ?? '',
                            (isset($task['startDate']) && $task['startDate'] !== '') ? $task['startDate'] : null,
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
        echo json_encode(['success' => true, 'message' => 'CCRM Database Synced Successfully!']);
    } catch (\Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed database synchronization: ' . $e->getMessage()]);
    }
    exit;
}
