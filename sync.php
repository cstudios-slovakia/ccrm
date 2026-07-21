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
if (!file_exists($configFile) || @filesize($configFile) < 100) {
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
    error_log('[ccrm sync] DB connection failed: ' . $e->getMessage());
    echo json_encode([
        'installed' => false,
        'message' => 'Database connection failed.'
    ]);
    exit;
}

// 2. Ensure schema is present and migrated (idempotent, single source of truth).
try {
    ccrm_apply_schema($pdo);
} catch (\Exception $e) {
    error_log('[ccrm sync] Schema migration failed: ' . $e->getMessage());
    echo json_encode([
        'installed' => false,
        'message' => 'Automated schema migration failed.'
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

// Compute a cheap content-derived version of the whole dataset. CHECKSUM TABLE
// ... EXTENDED live-scans each table's rows (~8ms total here) and changes only
// when real content changes — inserts, updates and deletes across every column.
// This lets the SPA's `?probe=1` poll detect "nothing changed" without building
// the multi-MB snapshot, and it is immune to no-op re-saves (a sync POST that
// writes identical rows leaves the checksum untouched).
function ccrm_compute_data_version($pdo) {
    $candidates = ['leads', 'timeline_events', 'lead_categories', 'tasks', 'task_assignees', 'users', 'roles', 'meeting_notes', 'meeting_tasks', 'unified_entries', 'system_settings'];
    try {
        $existing = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        $existingSet = array_flip($existing);
        $tables = array_values(array_filter($candidates, function ($t) use ($existingSet) {
            return isset($existingSet[$t]);
        }));
        if (empty($tables)) return '0';
        $quoted = implode(',', array_map(function ($t) { return "`{$t}`"; }, $tables));
        $rows = $pdo->query("CHECKSUM TABLE {$quoted} EXTENDED")->fetchAll(PDO::FETCH_KEY_PAIR);
        return md5(json_encode($rows));
    } catch (\Throwable $e) {
        return '0';
    }
}

// Helper to check if an incoming lead payload is identical to its database record
function ccrm_leads_are_identical($inc, $db, $defaultOwner = '') {
    if (!$db) return false;
    
    // Compare basic fields
    $fields = [
        'name' => $inc['name'] ?? '',
        'city' => $inc['city'] ?? '',
        'client_type' => $inc['clientType'] ?? 'person',
        'status' => $inc['status'] ?? 'new',
        'source' => $inc['source'] ?? 'website',
        'owner' => $inc['owner'] ?? $defaultOwner,
        'value' => isset($inc['value']) ? floatval($inc['value']) : 0.00,
        'rating' => isset($inc['rating']) ? intval($inc['rating']) : 3,
        'phone' => $inc['phone'] ?? null,
        'email' => $inc['email'] ?? null,
        'company_id' => $inc['companyId'] ?? null,
        'tax_id' => $inc['taxId'] ?? null,
        'vat_id' => $inc['vatId'] ?? null,
        'contact_person' => $inc['contactPerson'] ?? null,
        'website' => $inc['website'] ?? null,
        'street' => $inc['address']['street'] ?? null,
        'postal_code' => $inc['address']['postalCode'] ?? null,
        'country' => $inc['address']['country'] ?? 'Slovakia',
        'ai_summary' => $inc['aiSummary'] ?? null,
        'ai_summary_fingerprint' => $inc['aiSummaryFingerprint'] ?? null,
        'establishment_date' => $inc['establishmentDate'] ?? null,
        'legal_form' => $inc['legalForm'] ?? null,
        'sk_nace' => $inc['skNace'] ?? null,
        'organization_size' => $inc['organizationSize'] ?? null,
        'ownership_type' => $inc['ownershipType'] ?? null,
        'data_source' => $inc['dataSource'] ?? null,
        'dissolution_date' => $inc['dissolutionDate'] ?? null,
        'region' => $inc['region'] ?? null,
        'district' => $inc['district'] ?? null,
        'follow_ups' => (isset($inc['followUps']) && !empty($inc['followUps'])) ? $inc['followUps'] : null,
        // 'financial_summary' is deliberately excluded: it is server-owned, so a
        // lead whose only difference is the server-generated report still counts
        // as identical and is skipped (no rewrite, no needless report re-spawn).
        'created_at' => $inc['createdAt'] ?? null
    ];
    
    foreach ($fields as $col => $val) {
        $dbVal = $db[$col] ?? null;
        if ($col === 'value') {
            if (abs(floatval($val) - floatval($dbVal)) > 0.001) return false;
        } elseif ($col === 'rating') {
            if (intval($val) !== intval($dbVal)) return false;
        } elseif ($col === 'follow_ups') {
            // Compare the per-state follow-up map order-independently. $val is the
            // incoming assoc array (or null); $dbVal is the stored JSON string.
            $incMap = is_array($val) ? $val : [];
            $dbMap = ($dbVal !== null && $dbVal !== '') ? (json_decode($dbVal, true) ?: []) : [];
            ksort($incMap);
            ksort($dbMap);
            if (json_encode($incMap) !== json_encode($dbMap)) return false;
        } else {
            $v1 = ($val === '') ? null : $val;
            $v2 = ($dbVal === '') ? null : $dbVal;
            if ($v1 !== $v2) return false;
        }
    }
    
    // Compare categories
    $incCats = $inc['categories'] ?? [];
    $dbCats = $db['categories'] ?? [];
    sort($incCats);
    sort($dbCats);
    if ($incCats !== $dbCats) return false;
    
    // Compare timeline events
    $incTimeline = $inc['timeline'] ?? [];
    $dbTimeline = $db['timeline'] ?? [];
    if (count($incTimeline) !== count($dbTimeline)) return false;
    
    $dbTeMap = [];
    foreach ($dbTimeline as $te) {
        $dbTeMap[$te['id']] = $te;
    }
    
    foreach ($incTimeline as $te) {
        $teId = $te['id'] ?? '';
        if (!isset($dbTeMap[$teId])) return false;
        $dbTe = $dbTeMap[$teId];
        
        $teFields = [
            'type' => $te['type'] ?? 'note',
            'title' => $te['title'] ?? '',
            'content' => $te['content'] ?? null,
            'amount' => isset($te['amount']) ? floatval($te['amount']) : null,
            'file_name' => $te['fileName'] ?? null,
            'file_size' => $te['fileSize'] ?? null,
            'file_type' => $te['fileType'] ?? null,
            'extra_time' => $te['extraTime'] ?? $te['extra_time'] ?? null
        ];
        
        foreach ($teFields as $col => $val) {
            $dbVal = $dbTe[$col] ?? null;
            if ($col === 'amount') {
                if ($val !== null && $dbVal !== null) {
                    if (abs(floatval($val) - floatval($dbVal)) > 0.001) return false;
                } elseif ($val !== $dbVal) {
                    return false;
                }
            } else {
                $v1 = ($val === '') ? null : $val;
                $v2 = ($dbVal === '') ? null : $dbVal;
                if ($v1 !== $v2) return false;
            }
        }
    }
    
    return true;
}

/**
 * Delete rows that the client omitted from its payload — but never delete a row
 * that changed after the client's last sync ($baseSyncedAt). Otherwise a client
 * working from a stale snapshot would silently delete records another user
 * created or edited in the meantime (last-write-wins data loss).
 *
 * $baseSyncedAt is the DB clock value ('YYYY-MM-DD HH:MM:SS') captured in the GET
 * the client synced from, so it is compared against the same clock as updated_at.
 * When it is null (legacy client that didn't send one) we fall back to the old
 * unconditional delete so behaviour is unchanged for those clients.
 *
 * $table is only ever a trusted, sanitized name (fixed table names or the
 * already-validated ue_<id>), never raw user input.
 */
// Mass-deletion circuit breaker thresholds (see ccrm_delete_omitted). A single
// sync may never delete-by-omission ALL remaining rows of a table, nor a large
// FRACTION of them at once: that is the signature of a client that logged in
// with empty/stale state and pushed an empty collection (the 2026-07-06 and the
// 2026-07-10 users-table data-loss incidents). MIN_ROWS keeps everyday small
// deletions on ordinary tables flowing; access-critical tables (users) run in
// $strict mode where that floor is dropped so even an N-1 wipe is blocked.
// Tunable if a deployment legitimately needs large bulk deletes through sync.
if (!defined('CCRM_MASS_DELETE_MIN_ROWS')) define('CCRM_MASS_DELETE_MIN_ROWS', 5);
if (!defined('CCRM_MASS_DELETE_FRACTION')) define('CCRM_MASS_DELETE_FRACTION', 0.5);

function ccrm_delete_omitted(PDO $pdo, string $table, array $idsToDelete, ?string $baseSyncedAt, array $skipIds = [], bool $strict = false): void {
    if (empty($idsToDelete)) {
        return;
    }

    // Resolve the rows this sync would actually remove (excluding protected ids
    // such as the session user).
    $toDelete = [];
    foreach ($idsToDelete as $id) {
        if (!in_array($id, $skipIds, true)) {
            $toDelete[] = $id;
        }
    }
    if (empty($toDelete)) {
        return;
    }

    // Circuit breaker: refuse to delete-by-omission a large share of a table in
    // one request. An empty/stale client push makes array_diff() mark most or
    // all rows for deletion; without this guard that silently wipes the table
    // (leads cascade to categories + timeline). Ordinary small deletions — the
    // real use case — stay below the threshold and pass through untouched. When
    // tripped we keep the data and log instead of destroying it; the client
    // re-pulls the rows on its next GET.
    $deleteCount = count($toDelete);
    $serverTotal = (int) $pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();

    // (a) Never delete EVERY remaining row of a table by omission — that is only
    //     ever an empty/stale push, never a legitimate edit. Applies to every
    //     table regardless of size, so even a 1- or 2-row table can't be emptied.
    $wouldEmptyTable = ($serverTotal > 0 && $deleteCount >= $serverTotal);

    // (b) Refuse to delete a large FRACTION of a table in one request. Ordinary
    //     data tables keep a small absolute-row floor so everyday little
    //     deletions still pass. In $strict mode — access-critical tables such as
    //     `users`, where the sync always keeps the calling account so a full wipe
    //     tops out at N-1 rows and never reaches 100% — the floor drops to 1, so
    //     the 4-of-5 users wipe that slipped under the row floor is now caught.
    $minRows = $strict ? 1 : CCRM_MASS_DELETE_MIN_ROWS;
    $massFraction = ($serverTotal > 0
        && $deleteCount >= $minRows
        && ($deleteCount / $serverTotal) >= CCRM_MASS_DELETE_FRACTION);

    if ($wouldEmptyTable || $massFraction) {
        error_log(sprintf(
            '[ccrm] BLOCKED delete-by-omission on `%s`: %d of %d rows (%.0f%%%s) — likely an empty/stale client push; no rows deleted.',
            $table, $deleteCount, $serverTotal, 100 * $deleteCount / max(1, $serverTotal), $strict ? ', strict' : ''
        ));
        return;
    }

    if ($baseSyncedAt !== null) {
        $stmt = $pdo->prepare("DELETE FROM `{$table}` WHERE `id` = ? AND `updated_at` <= ?");
    } else {
        $stmt = $pdo->prepare("DELETE FROM `{$table}` WHERE `id` = ?");
    }
    foreach ($toDelete as $id) {
        if ($baseSyncedAt !== null) {
            $stmt->execute([$id, $baseSyncedAt]);
        } else {
            $stmt->execute([$id]);
        }
    }
}

// 3. Handle GET Request: Read from Database
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // SECURITY: reading CRM state requires an authenticated session. This
    // endpoint returns all leads, tasks, users and the integration secrets
    // (OpenAI key, SMTP/IMAP passwords, OAuth secrets) — it must never serve
    // that to anonymous callers. The "not installed" check above runs first so
    // the installer wizard can still bootstrap without a session.
    $sessionUser = ccrm_require_auth();

    $settings = fetch_system_settings($pdo);
    $isDemoMode = ($settings['DEMO_MODE'] ?? 'false') === 'true';
    $dataVersion = ccrm_compute_data_version($pdo);

    // Lightweight probe: the SPA polls this every few seconds to learn whether
    // anything changed. It returns only the current data version (one cheap
    // settings query — no leads/tasks/timeline reads, no multi-MB payload), so
    // the expensive full read only runs when the version actually moved.
    if (isset($_GET['probe'])) {
        echo json_encode([
            'installed' => true,
            'demoMode' => $isDemoMode,
            'dataVersion' => $dataVersion,
        ]);
        exit;
    }

    // 3.1. Fetch Leads.
    // Categories and timeline events are pre-fetched in ONE query each and
    // grouped by lead_id, instead of running two queries per lead. With ~1k
    // leads the old per-lead approach issued ~2k round-trips per GET (~1.1s);
    // this collapses it to 3 queries total.
    $catsByLead = [];
    $catBulk = $pdo->query("SELECT `lead_id`, `category_name` FROM `lead_categories`");
    while ($c = $catBulk->fetch()) {
        $catsByLead[$c['lead_id']][] = $c['category_name'];
    }

    $timelineByLead = [];
    $teBulk = $pdo->query("SELECT * FROM `timeline_events` ORDER BY `timestamp` ASC");
    while ($te = $teBulk->fetch()) {
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
        $timelineByLead[$te['lead_id']][] = $event;
    }

    $leadsStmt = $pdo->query("SELECT * FROM `leads` ORDER BY `created_at` DESC");
    $leads = [];
    while ($row = $leadsStmt->fetch()) {
        $leadId = $row['id'];
        $categories = $catsByLead[$leadId] ?? [];
        $timeline = $timelineByLead[$leadId] ?? [];

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
            'vatValidationResult' => isset($row['vat_validation_result']) && !empty($row['vat_validation_result']) ? json_decode($row['vat_validation_result'], true) : null,
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
            'aiSummaryFingerprint' => $row['ai_summary_fingerprint'] ?? '',
            'establishmentDate' => $row['establishment_date'] ?? '',
            'legalForm' => $row['legal_form'] ?? '',
            'skNace' => $row['sk_nace'] ?? '',
            'organizationSize' => $row['organization_size'] ?? '',
            'ownershipType' => $row['ownership_type'] ?? '',
            'dataSource' => $row['data_source'] ?? '',
            'dissolutionDate' => $row['dissolution_date'] ?? '',
            'region' => $row['region'] ?? '',
            'district' => $row['district'] ?? '',
            'financialSummary' => $row['financial_summary'] ?? '',
            'followUps' => (isset($row['follow_ups']) && $row['follow_ups'] !== '' && $row['follow_ups'] !== null) ? json_decode($row['follow_ups'], true) : (object)[]
        ];
    }

    // 3.2. Fetch Tasks (assignees pre-fetched in one query, grouped by task_id)
    $assigneesByTask = [];
    $assBulk = $pdo->query("SELECT `task_id`, `user_name` FROM `task_assignees`");
    while ($a = $assBulk->fetch()) {
        $assigneesByTask[$a['task_id']][] = $a['user_name'];
    }

    $tasksStmt = $pdo->query("SELECT * FROM `tasks` ORDER BY `created_at` DESC");
    $tasks = [];
    while ($row = $tasksStmt->fetch()) {
        $taskId = $row['id'];
        $assignedUsers = $assigneesByTask[$taskId] ?? [];

        $tasks[] = [
            'id' => $taskId,
            'title' => $row['title'],
            'description' => $row['description'] ?? '',
            'priority' => $row['priority'],
            'startDate' => $row['start_date'] ?? null,
            'deadline' => $row['deadline'],
            'deadlineTime' => $row['deadline_time'] ?? null,
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
            // SECURITY: mask per-user email passwords (IMAP/SMTP) inside the
            // metadata blob so one user cannot read another's mailbox password.
            'metadata_json' => ccrm_mask_user_metadata($row['metadata_json'])
        ];
    }

    // 3.4. Fetch Roles
    // Read from system_settings table if it exists and is non-empty, otherwise
    // use the built-in Admin/Project Manager fallback. An empty decoded array
    // is treated the same as "missing" — it can only be the result of a stale
    // client push wiping the registry (see the roles.update guard above), never
    // a legitimate state, so recover to the fallback rather than serving every
    // client a permanently empty role list.
    $roles = isset($settings['ROLES_RBAC']) ? json_decode($settings['ROLES_RBAC'], true) : null;
    if (!is_array($roles) || empty($roles)) {
        $roles = [
            [
                'name' => 'Admin',
                'permissions' => [
                    'general_config' => 'edit',
                    'pm_managers' => 'edit',
                    'pipeline_stages' => 'edit',
                    'traffic_sources' => 'edit',
                    'system_reset' => 'edit',
                    'ai_config' => 'edit',
                    'nav_edit' => 'edit'
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
                    'ai_config' => 'nothing',
                    'nav_edit' => 'nothing'
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
    $leadStateFollowUp = isset($settings['LEAD_STATE_FOLLOWUP']) ? json_decode($settings['LEAD_STATE_FOLLOWUP'], true) : (object)[];
    $taskStates = isset($settings['TASK_STATES']) ? json_decode($settings['TASK_STATES'], true) : ["New", "In progress", "Blocked", "Done"];
    $taskStateColors = isset($settings['TASK_STATE_COLORS']) ? json_decode($settings['TASK_STATE_COLORS'], true) : [];
    $integrationsConfig = isset($settings['INTEGRATIONS_CONFIG']) ? json_decode($settings['INTEGRATIONS_CONFIG'], true) : (object)[];
    // SECURITY: never send real secret values to the browser — mask them. The
    // frontend only needs to know a secret is set (e.g. "OpenAI configured");
    // the backend uses the real values server-side. Saving a masked field is a
    // no-op (see the POST merge below).
    if (is_array($integrationsConfig)) {
        $integrationsConfig = ccrm_mask_secrets($integrationsConfig, ccrm_integration_secret_keys());
    }

    // Fetch Meeting Notes (meeting_tasks pre-fetched in one query, grouped by meeting_id)
    $meetingNotes = [];
    try {
        $tasksByMeeting = [];
        $mtBulk = $pdo->query("SELECT * FROM `meeting_tasks`");
        while ($tr = $mtBulk->fetch()) {
            $tasksByMeeting[$tr['meeting_id']][] = [
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

        $meetingsStmt = $pdo->query("SELECT * FROM `meeting_notes` ORDER BY `date` DESC, `created_at` DESC");
        while ($row = $meetingsStmt->fetch()) {
            $meetingId = $row['id'];
            $automatedTasks = $tasksByMeeting[$meetingId] ?? [];

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

    // 3.5. Fetch Unified Universal Entries configurations & rows
    $unifiedEntries = [];
    $unifiedEntriesData = [];
    try {
        // Check if unified_entries table exists first (if database has not been initialized/migrated yet)
        $chkRegistry = $pdo->query("SHOW TABLES LIKE 'unified_entries'")->rowCount() > 0;
        if ($chkRegistry) {
            $ueStmt = $pdo->query("SELECT * FROM `unified_entries` ORDER BY `created_at` ASC");
            while ($row = $ueStmt->fetch()) {
                $ueId = $row['id'];
                $modules = json_decode($row['modules_json'] ?? '[]', true);
                $folderModules = json_decode($row['folder_modules_json'] ?? '[]', true);
                $unifiedEntries[] = [
                    'id' => $ueId,
                    'name' => $row['name'],
                    'entryName' => $row['entry_name'] ?? 'Entry',
                    'folderName' => $row['folder_name'] ?? 'Folder',
                    'icon' => $row['icon'],
                    'color' => $row['color'],
                    'modules' => $modules,
                    'folderModules' => $folderModules,
                    'foldersEnabled' => (int)$row['folders_enabled'] === 1,
                    'showFolderSummary' => isset($row['show_folder_summary']) ? ((int)$row['show_folder_summary'] === 1) : false,
                    'warningDays' => isset($row['warning_days']) ? (int)$row['warning_days'] : 0,
                    'archived' => (int)$row['archived'] === 1
                ];

                $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($ueId));
                $tableName = "ue_" . $safeId;
                
                $chkTable = $pdo->query("SHOW TABLES LIKE '{$tableName}'")->rowCount() > 0;
                if ($chkTable) {
                    $rowsStmt = $pdo->query("SELECT * FROM `{$tableName}` ORDER BY `created_at` ASC");
                    $ueRows = [];
                    while ($r = $rowsStmt->fetch()) {
                        $rowItem = [
                            'id' => $r['id'],
                            'parentId' => $r['parent_id'],
                            'isFolder' => (int)$r['is_folder'] === 1
                        ];
                        if (isset($r['title'])) {
                            $rowItem['title'] = $r['title'];
                        }
                        if (isset($r['due_date'])) {
                            $rowItem['dueDate'] = $r['due_date'];
                        }
                        if (isset($r['file_name'])) {
                            $rowItem['fileName'] = $r['file_name'];
                            $rowItem['fileSize'] = $r['file_size'];
                            $rowItem['fileType'] = $r['file_type'];
                            $rowItem['filePath'] = $r['file_path'];
                        }
                        if (isset($r['client_id'])) {
                            $rowItem['clientId'] = $r['client_id'];
                        }
                        if (isset($r['lead_id'])) {
                            $rowItem['leadId'] = $r['lead_id'];
                        }
                        if (isset($r['warning_days'])) {
                            $rowItem['warningDays'] = (int)$r['warning_days'];
                        }
                        if (isset($r['icon'])) {
                            $rowItem['icon'] = $r['icon'];
                        }
                        $ueRows[] = $rowItem;
                    }
                    $unifiedEntriesData[$ueId] = $ueRows;
                } else {
                    $unifiedEntriesData[$ueId] = [];
                }
            }
        }
    } catch (\Exception $e) {
        // Fallback
    }

    // DB clock at read time. The client echoes this back as baseSyncedAt on the
    // next POST so the server can tell "the user deleted this" apart from "the
    // client never saw this newer row" (see ccrm_delete_omitted).
    $serverTime = null;
    try { $serverTime = $pdo->query("SELECT NOW()")->fetchColumn(); } catch (\Throwable $e) {}

    // Real database connection info for the Settings "Database" panel. Admins
    // only — this is infrastructure detail (host/name/user), never the password.
    // The panel used to show hardcoded placeholders (localhost / ccrm /
    // ccrm_user), which masked where the data actually lives; now it reflects
    // config.php so an operator can see the real target at a glance.
    $dbInfo = null;
    if (($sessionUser['role'] ?? '') === 'admin') {
        $dbInfo = [
            'host' => defined('DB_HOST') ? DB_HOST : '',
            'port' => defined('DB_PORT') ? (string) DB_PORT : '',
            'name' => defined('DB_NAME') ? DB_NAME : '',
            'user' => defined('DB_USER') ? DB_USER : '',
            'type' => 'MariaDB',
        ];
    }

    echo json_encode([
        'installed' => true,
        'demoMode' => $isDemoMode,
        'dataVersion' => $dataVersion,
        'serverTime' => $serverTime,
        'db_info' => $dbInfo,
        'leads' => $leads,
        'tasks' => $tasks,
        'users' => $users,
        'roles' => $roles,
        'meetingNotes' => $meetingNotes,
        'unifiedEntries' => $unifiedEntries,
        'unifiedEntriesData' => $unifiedEntriesData,
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
            'leadStateFollowUp' => $leadStateFollowUp,
            'taskStates' => $taskStates,
            'taskStateColors' => $taskStateColors,
            'integrationsConfig' => $integrationsConfig,
            'customLabels' => isset($settings['CUSTOM_LABELS']) ? json_decode($settings['CUSTOM_LABELS'], true) : (object)[]
        ]
    ]);
    exit;
}

// 4. Handle POST Request: Write/Sync State to Database
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // SECURITY: writes require an authenticated session.
    $sessionUser = ccrm_require_auth();
    // Privileged writes (global settings, RBAC registry, integration secrets,
    // and management of OTHER users / roles) are admin-only. Non-admin sync
    // payloads still carry these sections (the client always sends a full
    // snapshot), so we silently ignore the privileged parts for non-admins
    // rather than reject the whole sync — otherwise ordinary editing breaks.
    $isAdmin = (($sessionUser['role'] ?? '') === 'admin');

    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);

    if (!$payload) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON payload']);
        exit;
    }

    // Snapshot the client synced from (DB clock from its last GET/POST). Used to
    // guard delete-by-omission so a stale client cannot wipe another user's
    // newer records. Null for legacy clients → unconditional delete (old behaviour).
    $baseSyncedAt = (isset($payload['baseSyncedAt']) && is_string($payload['baseSyncedAt']) && $payload['baseSyncedAt'] !== '')
        ? $payload['baseSyncedAt'] : null;

    try {
        // Ensure dynamic unified-entry table schemas BEFORE opening the
        // transaction. DDL (CREATE/ALTER TABLE) triggers an implicit commit in
        // MySQL, so running it inside the transaction would silently end it and
        // make the final commit() fail with "There is no active transaction".
        // DDL cannot be rolled back anyway, so it belongs outside the transaction.
        if (isset($payload['unifiedEntries']) && is_array($payload['unifiedEntries'])) {
            // Cap dynamic-table provisioning per request so a crafted payload
            // cannot exhaust the database with unbounded CREATE/ALTER TABLE.
            $ddlBudget = 200;
            foreach ($payload['unifiedEntries'] as $ue) {
                if (!isset($ue['id'])) {
                    continue;
                }
                if (--$ddlBudget < 0) {
                    break;
                }
                $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($ue['id']));
                $tableName = "ue_" . $safeId;

                // Create the table if it does not exist with default minimal columns
                $pdo->exec("CREATE TABLE IF NOT EXISTS `{$tableName}` (
                    `id` VARCHAR(50) NOT NULL PRIMARY KEY,
                    `parent_id` VARCHAR(50) NULL,
                    `is_folder` TINYINT(1) NOT NULL DEFAULT 0,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (`parent_id`) REFERENCES `{$tableName}` (`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

                if (!ccrm_column_exists($pdo, $tableName, 'icon')) {
                    $pdo->exec("ALTER TABLE `{$tableName}` ADD COLUMN `icon` VARCHAR(50) NULL");
                }

                // Dynamically add columns for active modules if they are missing
                $allActiveModules = array_unique(array_merge($ue['modules'] ?? [], $ue['folderModules'] ?? []));
                if (in_array('title', $allActiveModules)) {
                    if (!ccrm_column_exists($pdo, $tableName, 'title')) {
                        $pdo->exec("ALTER TABLE `{$tableName}` ADD COLUMN `title` VARCHAR(255) NULL");
                    }
                }
                if (in_array('due_date', $allActiveModules) || in_array('due date', $allActiveModules)) {
                    if (!ccrm_column_exists($pdo, $tableName, 'due_date')) {
                        $pdo->exec("ALTER TABLE `{$tableName}` ADD COLUMN `due_date` DATE NULL");
                    }
                    if (!ccrm_column_exists($pdo, $tableName, 'warning_days')) {
                        $pdo->exec("ALTER TABLE `{$tableName}` ADD COLUMN `warning_days` INT NOT NULL DEFAULT 0");
                    }
                }
                if (in_array('file', $allActiveModules)) {
                    if (!ccrm_column_exists($pdo, $tableName, 'file_name')) {
                        $pdo->exec("ALTER TABLE `{$tableName}` ADD COLUMN `file_name` VARCHAR(255) NULL, ADD COLUMN `file_size` VARCHAR(50) NULL, ADD COLUMN `file_type` VARCHAR(100) NULL, ADD COLUMN `file_path` VARCHAR(255) NULL");
                    }
                }
                if (in_array('client', $allActiveModules)) {
                    if (!ccrm_column_exists($pdo, $tableName, 'client_id')) {
                        $pdo->exec("ALTER TABLE `{$tableName}` ADD COLUMN `client_id` VARCHAR(50) NULL");
                    }
                }
                if (in_array('lead', $allActiveModules)) {
                    if (!ccrm_column_exists($pdo, $tableName, 'lead_id')) {
                        $pdo->exec("ALTER TABLE `{$tableName}` ADD COLUMN `lead_id` VARCHAR(50) NULL");
                    }
                }
            }
        }

        $pdo->beginTransaction();

        // 4.1. Save system settings & configurations (admin-only).
        if ($isAdmin && isset($payload['settings'])) {
            $s = $payload['settings'];

            // Preserve masked secrets: merge the inbound integrations config over
            // the one already stored, keeping any secret the client left masked
            // (see ccrm_mask_secrets in the GET branch). A real inbound value —
            // including '' to clear — still overwrites the stored secret. If the
            // client omits integrationsConfig entirely, keep the stored value
            // untouched rather than wiping it.
            $existingIntegrationsRaw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'")->fetchColumn();
            $existingIntegrations = ($existingIntegrationsRaw !== false && $existingIntegrationsRaw !== null) ? json_decode($existingIntegrationsRaw, true) : [];
            if (!is_array($existingIntegrations)) { $existingIntegrations = []; }
            if (isset($s['integrationsConfig']) && is_array($s['integrationsConfig'])) {
                $mergedIntegrations = ccrm_merge_secrets($s['integrationsConfig'], $existingIntegrations, ccrm_integration_secret_keys());
                // Encrypt secrets at rest before persisting. Values preserved from
                // storage are already encrypted (encrypt is a no-op on them).
                $mergedIntegrations = ccrm_encrypt_config_secrets($mergedIntegrations, ccrm_integration_secret_keys());
                $integrationsValue = json_encode($mergedIntegrations ?: (object)[]);
            } else {
                $integrationsValue = ($existingIntegrationsRaw !== false && $existingIntegrationsRaw !== null) ? $existingIntegrationsRaw : json_encode((object)[]);
            }

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
                'LEAD_STATE_FOLLOWUP' => json_encode($s['leadStateFollowUp'] ?? (object)[]),
                'TASK_STATES' => json_encode($s['taskStates'] ?? []),
                'TASK_STATE_COLORS' => json_encode($s['taskStateColors'] ?? []),
                'INTEGRATIONS_CONFIG' => $integrationsValue,
                'CUSTOM_LABELS' => json_encode($s['customLabels'] ?? (object)[])
            ];

            $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            foreach ($settingsList as $k => $v) {
                $insSet->execute([$k, $v]);
            }
            ccrm_audit_log($pdo, $sessionUser, 'settings.update', 'System settings / integrations updated');
        }

        // Save Roles RBAC registry (admin-only).
        //
        // Every sync push always echoes back the client's current in-memory
        // `roles` state (see pushStateToServer in App.tsx), even for pushes that
        // have nothing to do with roles. If a client's roles state hasn't
        // finished loading yet (e.g. a push that races the initial GET), that
        // empty array would silently overwrite a populated registry here — the
        // same class of bug ccrm_delete_omitted guards against for DB rows, but
        // this blob had no such guard. Refuse to replace a non-empty registry
        // with an empty one.
        if ($isAdmin && isset($payload['roles']) && is_array($payload['roles'])) {
            $existingRolesRaw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'ROLES_RBAC'")->fetchColumn();
            $existingRolesCount = 0;
            if ($existingRolesRaw !== false && $existingRolesRaw !== null) {
                $existingRolesDecoded = json_decode($existingRolesRaw, true);
                if (is_array($existingRolesDecoded)) {
                    $existingRolesCount = count($existingRolesDecoded);
                }
            }
            if (empty($payload['roles']) && $existingRolesCount > 0) {
                error_log(sprintf(
                    '[ccrm] BLOCKED roles.update: incoming roles array is empty but %d role(s) exist — likely an empty/stale client push; roles left untouched.',
                    $existingRolesCount
                ));
            } else {
                $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
                $insSet->execute(['ROLES_RBAC', json_encode($payload['roles'])]);
                ccrm_audit_log($pdo, $sessionUser, 'roles.update', 'RBAC role registry updated');
            }
        }

        // 4.2. Synchronize Users list
        if (isset($payload['users']) && is_array($payload['users'])) {
            // Existing rows with their current password hashes so we can preserve
            // a user's password when the client does not send a new one.
            $existingHashes = $pdo->query("SELECT `id`, `password_hash` FROM `users`")->fetchAll(PDO::FETCH_KEY_PAIR);
            // Stored metadata so masked email passwords are preserved on save.
            $existingMeta = $pdo->query("SELECT `id`, `metadata_json` FROM `users`")->fetchAll(PDO::FETCH_KEY_PAIR);
            $existingUserIds = array_keys($existingHashes);
            $processedUserIds = [];

            $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`, `metadata_json`) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `email` = VALUES(`email`), `password_hash` = VALUES(`password_hash`), `role` = VALUES(`role`), `avatar` = VALUES(`avatar`), `color` = VALUES(`color`), `metadata_json` = VALUES(`metadata_json`)");

            // Existing roles so a non-admin's own role cannot be changed and so
            // we can audit privilege changes.
            $existingRoles = $pdo->query("SELECT `id`, `role` FROM `users`")->fetchAll(PDO::FETCH_KEY_PAIR);

            foreach ($payload['users'] as $u) {
                if (empty($u['email'])) {
                    continue;
                }
                $userId = 'u-' . md5(strtolower(trim($u['email'])));

                // SECURITY: a non-admin may only modify their OWN record and can
                // never change their role (prevents self-promotion to admin).
                if (!$isAdmin && $userId !== ($sessionUser['id'] ?? '')) {
                    continue;
                }
                if ($isAdmin) {
                    $role = ccrm_normalize_role($u['role'] ?? 'viewer');
                } else {
                    // Lock to the caller's stored role, ignoring any client value.
                    $role = ccrm_normalize_role($existingRoles[$userId] ?? ($sessionUser['role'] ?? 'viewer'));
                }
                // Audit any admin-driven role change.
                if ($isAdmin && isset($existingRoles[$userId]) && $existingRoles[$userId] !== $role) {
                    ccrm_audit_log($pdo, $sessionUser, 'user.role_change',
                        $u['email'] . ': ' . $existingRoles[$userId] . ' -> ' . $role);
                }

                $metaJson = isset($u['metadata_json']) ? (is_array($u['metadata_json']) ? json_encode($u['metadata_json']) : $u['metadata_json']) : (isset($u['metadata']) ? json_encode($u['metadata']) : null);
                // Keep the stored IMAP/SMTP password when the client sent it masked.
                $metaJson = ccrm_merge_user_metadata($metaJson, $existingMeta[$userId] ?? null);

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
            // Admin-only: a non-admin's payload only ever "processes" their own
            // record, so running this for them would delete every other user.
            if ($isAdmin) {
                $usersToDelete = array_diff($existingUserIds, $processedUserIds);
                if (!empty($usersToDelete)) {
                    ccrm_delete_omitted($pdo, 'users', $usersToDelete, $baseSyncedAt, [$sessionUser['id']], true);
                    ccrm_audit_log($pdo, $sessionUser, 'user.delete', 'Removed users: ' . implode(', ', $usersToDelete));
                }
            }
        }

        // 4.3. Synchronize Leads, Categories & Timelines
        if (isset($payload['leads']) && is_array($payload['leads'])) {
            $stmt = $pdo->query("SELECT * FROM `leads`");
            $dbLeads = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $dbLeads[$row['id']] = $row;
                $dbLeads[$row['id']]['categories'] = [];
                $dbLeads[$row['id']]['timeline'] = [];
            }

            // Fetch all categories
            $stmt = $pdo->query("SELECT * FROM `lead_categories`");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (isset($dbLeads[$row['lead_id']])) {
                    $dbLeads[$row['lead_id']]['categories'][] = $row['category_name'];
                }
            }

            // Fetch all timeline events
            $stmt = $pdo->query("SELECT * FROM `timeline_events`");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (isset($dbLeads[$row['lead_id']])) {
                    $dbLeads[$row['lead_id']]['timeline'][] = $row;
                }
            }

            $existingLeadIds = array_keys($dbLeads);
            $processedLeadIds = [];

            // Fallback owner for leads synced without an explicit owner. Resolved
            // from the real user table, never a hardcoded demo name.
            $defaultOwner = ccrm_default_owner($pdo);

            // Track every timeline event id written during this sync to prevent duplicates
            // within the same payload from violating the primary key constraint.
            $seenTimelineIds = [];

            $insLead = $pdo->prepare("INSERT INTO `leads` (
              `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, 
              `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`, `street`, `postal_code`, `country`, 
              `ai_summary`, `ai_summary_fingerprint`, 
              `establishment_date`, `legal_form`, `sk_nace`, `organization_size`, `ownership_type`, `data_source`, `dissolution_date`, `region`, `district`, `financial_summary`,
              `vat_validation_result`,
              `created_at`,
              `follow_ups`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              `name` = VALUES(`name`), `city` = VALUES(`city`), `client_type` = VALUES(`client_type`), `status` = VALUES(`status`), `source` = VALUES(`source`), `owner` = VALUES(`owner`), `value` = VALUES(`value`), `rating` = VALUES(`rating`), `phone` = VALUES(`phone`), `email` = VALUES(`email`), `company_id` = VALUES(`company_id`), `tax_id` = VALUES(`tax_id`), `vat_id` = VALUES(`vat_id`), `contact_person` = VALUES(`contact_person`), `website` = VALUES(`website`), `street` = VALUES(`street`), `postal_code` = VALUES(`postal_code`), `country` = VALUES(`country`), `ai_summary` = VALUES(`ai_summary`), `ai_summary_fingerprint` = VALUES(`ai_summary_fingerprint`),
              `establishment_date` = VALUES(`establishment_date`), `legal_form` = VALUES(`legal_form`), `sk_nace` = VALUES(`sk_nace`), `organization_size` = VALUES(`organization_size`), `ownership_type` = VALUES(`ownership_type`), `data_source` = VALUES(`data_source`), `dissolution_date` = VALUES(`dissolution_date`), `region` = VALUES(`region`), `district` = VALUES(`district`),
              `vat_validation_result` = VALUES(`vat_validation_result`),
              `follow_ups` = VALUES(`follow_ups`)");
              // NOTE: `financial_summary` is intentionally NOT updated here. It is
              // server-owned — generated by api/generate_report.php in the
              // background and written directly to the row. Letting the client's
              // (usually empty) copy overwrite it caused a wipe/regenerate loop
              // that burned OpenAI credits. It is still set on INSERT for new leads.

            foreach ($payload['leads'] as $l) {
                // Skip malformed items rather than letting a NULL id/name abort
                // the whole sync transaction mid-loop with a 500.
                if (!is_array($l) || empty($l['id']) || !isset($l['name']) || $l['name'] === '') {
                    continue;
                }
                $leadId = $l['id'];
                $processedLeadIds[] = $leadId;

                // Optimization: Skip if the lead is identical to what we have in the DB
                if (isset($dbLeads[$leadId]) && ccrm_leads_are_identical($l, $dbLeads[$leadId], $defaultOwner)) {
                    continue;
                }

                $address = $l['address'] ?? [];

                // Write standard Opportunity Lead parameters
                $insLead->execute([
                    $leadId,
                    $l['name'],
                    $l['city'] ?? '',
                    $l['clientType'] ?? 'person',
                    $l['status'] ?? 'new',
                    $l['source'] ?? 'website',
                    $l['owner'] ?? $defaultOwner,
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
                    $l['establishmentDate'] ?? null,
                    $l['legalForm'] ?? null,
                    $l['skNace'] ?? null,
                    $l['organizationSize'] ?? null,
                    $l['ownershipType'] ?? null,
                    $l['dataSource'] ?? null,
                    $l['dissolutionDate'] ?? null,
                    $l['region'] ?? null,
                    $l['district'] ?? null,
                    $l['financialSummary'] ?? null,
                    isset($l['vatValidationResult']) ? json_encode($l['vatValidationResult']) : null,
                    $l['createdAt'] ?? date('Y-m-d H:i:s'),
                    (isset($l['followUps']) && !empty($l['followUps'])) ? json_encode($l['followUps']) : null
                ]);

                // Check if we need to generate financial report in the background
                $companyId = $l['companyId'] ?? null;
                $clientType = $l['clientType'] ?? 'person';
                
                if (!empty($companyId) && $clientType !== 'person') {
                    $checkStmt = $pdo->prepare("SELECT `company_id`, `financial_summary` FROM `leads` WHERE `id` = ?");
                    $checkStmt->execute([$leadId]);
                    $existingLead = $checkStmt->fetch(PDO::FETCH_ASSOC);
                    
                    $oldCompanyId = $existingLead['company_id'] ?? '';
                    $oldSummary = $existingLead['financial_summary'] ?? '';
                    
                    if ($oldCompanyId !== $companyId || empty($oldSummary)) {
                        $sysLang = $payload['systemLanguage'] ?? 'sk';
                        // Fully detach the background report worker. Under PHP-FPM, fd 0/1/2 are
                        // the FastCGI socket; if the spawned child inherits any of them, Apache keeps
                        // the connection open and the worker dies with "Failed to read FastCGI header",
                        // rolling back the entire sync transaction so no client is ever saved.
                        // Redirecting stdin from /dev/null (in addition to stdout/stderr) plus setsid
                        // detaches it so the parent returns immediately. Report generation is best-effort.
                        $cmd = "setsid php " . escapeshellarg(__DIR__ . "/api/generate_report.php") . " " . escapeshellarg($companyId) . " " . escapeshellarg($sysLang) . " < /dev/null > /dev/null 2>&1 &";
                        if (function_exists('exec') && !in_array('exec', array_map('trim', explode(',', ini_get('disable_functions'))))) {
                            try {
                                @exec($cmd);
                            } catch (\Throwable $e) {
                                // Never let background report generation block the sync.
                            }
                        }
                    }
                }

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
                        // If this id was already used by another lead in this same payload,
                        // mint a fresh unique one so the duplicate cannot break the sync.
                        if (isset($seenTimelineIds[$teId])) {
                            do {
                                $teId = 'ev-' . bin2hex(random_bytes(8));
                            } while (isset($seenTimelineIds[$teId]));
                        }
                        $seenTimelineIds[$teId] = true;

                        $timestamp = isset($te['timestamp']) ? date('Y-m-d H:i:s', strtotime($te['timestamp'])) : date('Y-m-d H:i:s');

                        try {
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
                                $te['extraTime'] ?? $te['extra_time'] ?? null
                            ]);
                        } catch (\PDOException $pdoEx) {
                            // If duplicate key (SQLSTATE 23000 / error 1062), regenerate ID and retry
                            if ($pdoEx->getCode() == 23000 || strpos($pdoEx->getMessage(), '1062') !== false) {
                                $teId = 'ev-' . uniqid() . '-' . rand(1000, 9999);
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
                                    $te['extraTime'] ?? $te['extra_time'] ?? null
                                ]);
                            } else {
                                throw $pdoEx;
                            }
                        }
                    }
                }
            }

            // Perform deletions for removed leads
            $leadsToDelete = array_diff($existingLeadIds, $processedLeadIds);
            ccrm_delete_omitted($pdo, 'leads', $leadsToDelete, $baseSyncedAt);
        }

        // 4.4. Synchronize Tasks
        if (isset($payload['tasks']) && is_array($payload['tasks'])) {
            $stmt = $pdo->query("SELECT `id` FROM `tasks`");
            $existingTaskIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $processedTaskIds = [];

            $insTask = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `start_date`, `deadline`, `deadline_time`, `status`, `owner`, `related_lead_id`, `is_locking`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `description` = VALUES(`description`), `priority` = VALUES(`priority`), `start_date` = VALUES(`start_date`), `deadline` = VALUES(`deadline`), `deadline_time` = VALUES(`deadline_time`), `status` = VALUES(`status`), `owner` = VALUES(`owner`), `related_lead_id` = VALUES(`related_lead_id`), `is_locking` = VALUES(`is_locking`)");

            foreach ($payload['tasks'] as $t) {
                // Skip malformed items rather than aborting the whole sync.
                if (!is_array($t) || empty($t['id']) || !isset($t['title']) || $t['title'] === '' || empty($t['deadline'])) {
                    continue;
                }
                $taskId = $t['id'];

                $insTask->execute([
                    $taskId,
                    $t['title'],
                    $t['description'] ?? '',
                    $t['priority'] ?? 'medium',
                    (isset($t['startDate']) && $t['startDate'] !== '') ? $t['startDate'] : null,
                    $t['deadline'],
                    (isset($t['deadlineTime']) && $t['deadlineTime'] !== '') ? $t['deadlineTime'] : null,
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
            ccrm_delete_omitted($pdo, 'tasks', $tasksToDelete, $baseSyncedAt);
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
            ccrm_delete_omitted($pdo, 'meeting_notes', $meetingsToDelete, $baseSyncedAt);
        }

        // 4.6. Synchronize Unified Universal Entries (Registry & Dynamic Tables)
        if (isset($payload['unifiedEntries']) && is_array($payload['unifiedEntries'])) {
            $stmt = $pdo->query("SELECT `id` FROM `unified_entries`");
            $existingRegistryIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $processedRegistryIds = [];

            $insRegistry = $pdo->prepare("INSERT INTO `unified_entries` (`id`, `name`, `entry_name`, `folder_name`, `icon`, `color`, `modules_json`, `folder_modules_json`, `folders_enabled`, `show_folder_summary`, `warning_days`, `archived`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `entry_name` = VALUES(`entry_name`), `folder_name` = VALUES(`folder_name`), `icon` = VALUES(`icon`), `color` = VALUES(`color`), `modules_json` = VALUES(`modules_json`), `folder_modules_json` = VALUES(`folder_modules_json`), `folders_enabled` = VALUES(`folders_enabled`), `show_folder_summary` = VALUES(`show_folder_summary`), `warning_days` = VALUES(`warning_days`), `archived` = VALUES(`archived`)");

            foreach ($payload['unifiedEntries'] as $ue) {
                $ueId = $ue['id'];
                $modules = $ue['modules'] ?? [];
                $folderModules = $ue['folderModules'] ?? [];
                $insRegistry->execute([
                    $ueId,
                    $ue['name'],
                    $ue['entryName'] ?? 'Entry',
                    $ue['folderName'] ?? 'Folder',
                    $ue['icon'],
                    $ue['color'],
                    json_encode($modules),
                    json_encode($folderModules),
                    ($ue['foldersEnabled'] ?? false) ? 1 : 0,
                    ($ue['showFolderSummary'] ?? false) ? 1 : 0,
                    (int)($ue['warningDays'] ?? 0),
                    ($ue['archived'] ?? false) ? 1 : 0
                ]);
                $processedRegistryIds[] = $ueId;

                // Dynamically spawn or migrate table for this entry
                $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($ueId));
                $tableName = "ue_" . $safeId;
                
                // Table schema (CREATE/ALTER) for this dynamic table is ensured by
                // the schema pre-pass above, before the transaction was opened. DDL
                // must stay out of the transaction because it triggers an implicit
                // commit in MySQL.

                // If rows data is supplied, synchronize it to this dynamic table
                if (isset($payload['unifiedEntriesData'][$ueId]) && is_array($payload['unifiedEntriesData'][$ueId])) {
                    $rows = $payload['unifiedEntriesData'][$ueId];
                    $stmtRows = $pdo->query("SELECT `id` FROM `{$tableName}`");
                    $existingRowIds = $stmtRows->fetchAll(PDO::FETCH_COLUMN);
                    $processedRowIds = [];

                    // Build dynamic INSERT query based on existing columns in the table
                    foreach ($rows as $row) {
                        $rowId = $row['id'];
                        $processedRowIds[] = $rowId;

                        // Check if row already exists
                        $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$tableName}` WHERE `id` = ?");
                        $checkStmt->execute([$rowId]);
                        $rowExists = (int)$checkStmt->fetchColumn() > 0;

                        // Determine which modules are active for this row type
                        $rowModules = ($row['isFolder'] ?? false) ? $folderModules : $modules;

                        if ($rowExists) {
                            // UPDATE query
                            $updates = [
                                "`parent_id` = ?",
                                "`is_folder` = ?"
                            ];
                            $params = [
                                (isset($row['parentId']) && $row['parentId'] !== '') ? $row['parentId'] : null,
                                ($row['isFolder'] ?? false) ? 1 : 0
                            ];
                            if (ccrm_column_exists($pdo, $tableName, 'icon')) {
                                $updates[] = "`icon` = ?";
                                $params[] = $row['icon'] ?? null;
                            }
                            if ((in_array('title', $rowModules) || ($row['isFolder'] ?? false)) && ccrm_column_exists($pdo, $tableName, 'title')) {
                                $updates[] = "`title` = ?";
                                $params[] = $row['title'] ?? null;
                            }
                            if ((in_array('due_date', $rowModules) || in_array('due date', $rowModules)) && ccrm_column_exists($pdo, $tableName, 'due_date')) {
                                $updates[] = "`due_date` = ?";
                                $params[] = (isset($row['dueDate']) && $row['dueDate'] !== '') ? $row['dueDate'] : null;
                                if (ccrm_column_exists($pdo, $tableName, 'warning_days')) {
                                    $updates[] = "`warning_days` = ?";
                                    $params[] = isset($row['warningDays']) ? (int)$row['warningDays'] : 0;
                                }
                            }
                            if (in_array('file', $rowModules) && ccrm_column_exists($pdo, $tableName, 'file_name')) {
                                $updates[] = "`file_name` = ?";
                                $updates[] = "`file_size` = ?";
                                $updates[] = "`file_type` = ?";
                                $updates[] = "`file_path` = ?";
                                $params[] = $row['fileName'] ?? null;
                                $params[] = $row['fileSize'] ?? null;
                                $params[] = $row['fileType'] ?? null;
                                $params[] = $row['filePath'] ?? null;
                            }
                            if (in_array('client', $rowModules) && ccrm_column_exists($pdo, $tableName, 'client_id')) {
                                $updates[] = "`client_id` = ?";
                                $params[] = $row['clientId'] ?? null;
                            }
                            if (in_array('lead', $rowModules) && ccrm_column_exists($pdo, $tableName, 'lead_id')) {
                                $updates[] = "`lead_id` = ?";
                                $params[] = $row['leadId'] ?? null;
                            }
                            $params[] = $rowId; // for WHERE id = ?
                            $updateSql = "UPDATE `{$tableName}` SET " . implode(", ", $updates) . " WHERE `id` = ?";
                            $pdo->prepare($updateSql)->execute($params);
                        } else {
                            // INSERT query
                            $fields = ["`id`", "`parent_id`", "`is_folder`"];
                            $placeholders = ["?", "?", "?"];
                            $params = [
                                $rowId,
                                (isset($row['parentId']) && $row['parentId'] !== '') ? $row['parentId'] : null,
                                ($row['isFolder'] ?? false) ? 1 : 0
                            ];
                            if (ccrm_column_exists($pdo, $tableName, 'icon')) {
                                $fields[] = "`icon`";
                                $placeholders[] = "?";
                                $params[] = $row['icon'] ?? null;
                            }
                            if ((in_array('title', $rowModules) || ($row['isFolder'] ?? false)) && ccrm_column_exists($pdo, $tableName, 'title')) {
                                $fields[] = "`title`";
                                $placeholders[] = "?";
                                $params[] = $row['title'] ?? null;
                            }
                            if ((in_array('due_date', $rowModules) || in_array('due date', $rowModules)) && ccrm_column_exists($pdo, $tableName, 'due_date')) {
                                $fields[] = "`due_date`";
                                $placeholders[] = "?";
                                $params[] = (isset($row['dueDate']) && $row['dueDate'] !== '') ? $row['dueDate'] : null;
                                if (ccrm_column_exists($pdo, $tableName, 'warning_days')) {
                                    $fields[] = "`warning_days`";
                                    $placeholders[] = "?";
                                    $params[] = isset($row['warningDays']) ? (int)$row['warningDays'] : 0;
                                }
                            }
                            if (in_array('file', $rowModules) && ccrm_column_exists($pdo, $tableName, 'file_name')) {
                                $fields[] = "`file_name`";
                                $fields[] = "`file_size`";
                                $fields[] = "`file_type`";
                                $fields[] = "`file_path`";
                                $placeholders[] = "?";
                                $placeholders[] = "?";
                                $placeholders[] = "?";
                                $placeholders[] = "?";
                                $params[] = $row['fileName'] ?? null;
                                $params[] = $row['fileSize'] ?? null;
                                $params[] = $row['fileType'] ?? null;
                                $params[] = $row['filePath'] ?? null;
                            }
                            if (in_array('client', $rowModules) && ccrm_column_exists($pdo, $tableName, 'client_id')) {
                                $fields[] = "`client_id`";
                                $placeholders[] = "?";
                                $params[] = $row['clientId'] ?? null;
                            }
                            if (in_array('lead', $rowModules) && ccrm_column_exists($pdo, $tableName, 'lead_id')) {
                                $fields[] = "`lead_id`";
                                $placeholders[] = "?";
                                $params[] = $row['leadId'] ?? null;
                            }
                            $insertSql = "INSERT INTO `{$tableName}` (" . implode(", ", $fields) . ") VALUES (" . implode(", ", $placeholders) . ")";
                            $pdo->prepare($insertSql)->execute($params);
                        }
                    }

                    // Delete rows that are not in the payload (guarded against
                    // deleting rows a concurrent client added after this snapshot).
                    $rowsToDelete = array_diff($existingRowIds, $processedRowIds);
                    ccrm_delete_omitted($pdo, $tableName, $rowsToDelete, $baseSyncedAt);
                }
            }
        }

        $pdo->commit();

        // Report the post-commit content version so the client can immediately
        // sync its local `dataVersion` and avoid an extra full pull on the next
        // probe. Computed after commit so it reflects what we just wrote.
        //
        // Also return the post-commit DB clock so the client advances its
        // baseSyncedAt and can safely delete rows it just created/edited on a
        // later sync.
        $serverTime = null;
        try { $serverTime = $pdo->query("SELECT NOW()")->fetchColumn(); } catch (\Throwable $e) {}
        echo json_encode(['success' => true, 'message' => 'CCRM Database Synced Successfully!', 'dataVersion' => ccrm_compute_data_version($pdo), 'serverTime' => $serverTime]);
    } catch (\Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (function_exists('ccrm_log_exception')) {
            ccrm_log_exception($e);
        }
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed database synchronization: ' . $e->getMessage()]);
    }
    exit;
}
