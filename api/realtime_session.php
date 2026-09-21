<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// SECURITY: Authenticated users only
ccrm_require_auth();

require_once __DIR__ . '/agent_utils.php';

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// 1. Fetch integrations config to get OpenAI API key
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
$integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];

$openAiKey = $integrationsConfig['openAiKey'] ?? '';
if (empty($openAiKey)) {
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI API key is missing. Please configure your OpenAI API Key in CRM Settings > Integrations.'
    ]);
    exit;
}

// 2. Parse request payload
$input = file_get_contents('php://input');
$payload = json_decode($input, true) ?: [];

$action = $payload['action'] ?? 'create_session';

// 2.1. WebRTC SDP Exchange Proxy Action (bypasses browser CORS & preflight blocks)
if ($action === 'exchange_sdp') {
    $sdp = $payload['sdp'] ?? '';
    $token = !empty($payload['client_secret']) ? $payload['client_secret'] : $openAiKey;

    if (empty($sdp)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'SDP offer is required.']);
        exit;
    }

    $model = !empty($payload['model']) ? $payload['model'] : 'gpt-realtime-1.5';
    $ch = curl_init('https://api.openai.com/v1/realtime/calls?model=' . urlencode($model));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/sdp',
        'Authorization: Bearer ' . $token
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $sdp);
    $answerSdp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($httpCode !== 200 && $httpCode !== 201) {
        http_response_code($httpCode >= 400 && $httpCode <= 599 ? $httpCode : 500);
        echo json_encode([
            'success' => false,
            'message' => 'OpenAI WebRTC SDP exchange failed (HTTP ' . $httpCode . '): ' . (!empty($curlErr) ? $curlErr : $answerSdp)
        ]);
        exit;
    }

    echo json_encode([
        'success' => true,
        'sdp' => $answerSdp
    ]);
    exit;
}

// 2.2. Live RAG Query Action for Voice Tools & Function Calls
if ($action === 'query_rag') {
    $query = trim($payload['query'] ?? '');
    $agentId = $payload['agent_id'] ?? 'orchestrator';
    $systemLanguage = $payload['language'] ?? 'sk';

    $ragPdo = get_rag_db_connection($integrationsConfig);
    $chatDb = $ragPdo ?: $pdo;
    if ($chatDb) {
        init_rag_db_schemas($chatDb);
    }

    try {
        $ragData = build_comprehensive_crm_rag_context($pdo, $chatDb, $query, $systemLanguage, $agentId, ['limit' => 20]);
        $resultText = !empty($ragData['raw_context']) ? $ragData['raw_context'] : $ragData['sanitized_context'];
        if (empty(trim($resultText))) {
            $resultText = "No specific CRM records found matching query: " . $query;
        }
    } catch (\Exception $e) {
        $resultText = "Error querying CRM data: " . $e->getMessage();
    }

    echo json_encode([
        'success' => true,
        'result' => $resultText
    ]);
    exit;
}

// =========================================================================
// Helper Functions for Live Voice Entry & Project Operations
// =========================================================================
function ccrm_find_project_by_identifier(\PDO $pdo, string $identifier): ?array {
    $clean = trim($identifier);
    if ($clean === '') return null;

    // 1. Direct ID match
    $stmt = $pdo->prepare("
        SELECT p.*, pt.`name` AS `type_name`, l.`name` AS `client_name`
        FROM `projects` p
        LEFT JOIN `project_types` pt ON p.`project_type_id` = pt.`id`
        LEFT JOIN `leads` l ON p.`lead_id` = l.`id` OR p.`client_id` = l.`id`
        WHERE p.`id` = ?
        LIMIT 1
    ");
    $stmt->execute([$clean]);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($res) return $res;

    // 2. Exact Name Match
    $stmt = $pdo->prepare("
        SELECT p.*, pt.`name` AS `type_name`, l.`name` AS `client_name`
        FROM `projects` p
        LEFT JOIN `project_types` pt ON p.`project_type_id` = pt.`id`
        LEFT JOIN `leads` l ON p.`lead_id` = l.`id` OR p.`client_id` = l.`id`
        WHERE p.`name` = ?
        LIMIT 1
    ");
    $stmt->execute([$clean]);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($res) return $res;

    // 3. Substring Name Match or Linked Client Match
    $stmt = $pdo->prepare("
        SELECT p.*, pt.`name` AS `type_name`, l.`name` AS `client_name`
        FROM `projects` p
        LEFT JOIN `project_types` pt ON p.`project_type_id` = pt.`id`
        LEFT JOIN `leads` l ON p.`lead_id` = l.`id` OR p.`client_id` = l.`id`
        WHERE p.`name` LIKE ? OR l.`name` LIKE ?
        ORDER BY (p.`name` LIKE ?) DESC, p.`created_at` DESC
        LIMIT 1
    ");
    $like = '%' . $clean . '%';
    $stmt->execute([$like, $like, $clean . '%']);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);
    return $res ?: null;
}

function ccrm_resolve_project_type_id(\PDO $pdo, ?string $typeName = null): string {
    if (!empty($typeName)) {
        $clean = trim($typeName);
        $stmt = $pdo->prepare("SELECT `id` FROM `project_types` WHERE `id` = ? OR `name` = ? OR `name` LIKE ? LIMIT 1");
        $stmt->execute([$clean, $clean, '%' . $clean . '%']);
        $typeId = $stmt->fetchColumn();
        if ($typeId) return (string)$typeId;
    }
    $stmt = $pdo->query("SELECT `id` FROM `project_types` ORDER BY `created_at` ASC LIMIT 1");
    $typeId = $stmt->fetchColumn();
    if ($typeId) return (string)$typeId;

    $defId = 'pt_general';
    $ins = $pdo->prepare("INSERT INTO `project_types` (`id`, `name`, `description`, `icon`, `color`, `has_timeline`, `has_gantt`, `has_deadline`, `created_at`) VALUES (?, 'General Projects', 'Standard project workflow', 'Briefcase', '#6366f1', 1, 1, 1, NOW()) ON DUPLICATE KEY UPDATE `name`=VALUES(`name`)");
    $ins->execute([$defId]);
    return $defId;
}

function ccrm_resolve_lead_by_name(\PDO $pdo, ?string $clientName = null): ?array {
    if (empty($clientName)) return null;
    $clean = trim($clientName);
    if ($clean === '') return null;

    $stmt = $pdo->prepare("SELECT `id`, `name` FROM `leads` WHERE `id` = ? OR `name` = ? OR `name` LIKE ? ORDER BY (`name` = ?) DESC LIMIT 1");
    $stmt->execute([$clean, $clean, '%' . $clean . '%', $clean]);
    $lead = $stmt->fetch(PDO::FETCH_ASSOC);
    return $lead ?: null;
}

function ccrm_assign_project_managers(\PDO $pdo, string $projectId, $managers): void {
    if ($managers === null) return;
    $del = $pdo->prepare("DELETE FROM `project_managers` WHERE `project_id` = ?");
    $del->execute([$projectId]);

    $mgrList = is_array($managers) ? $managers : (is_string($managers) ? array_map('trim', explode(',', $managers)) : []);
    $ins = $pdo->prepare("INSERT IGNORE INTO `project_managers` (`project_id`, `user_id`) VALUES (?, ?)");

    foreach ($mgrList as $m) {
        $mName = trim((string)$m);
        if ($mName === '') continue;
        $uStmt = $pdo->prepare("SELECT `id`, `name` FROM `users` WHERE `name` LIKE ? OR `email` LIKE ? LIMIT 1");
        $uStmt->execute(['%' . $mName . '%', '%' . $mName . '%']);
        $user = $uStmt->fetch(PDO::FETCH_ASSOC);
        $userId = $user['id'] ?? $mName;
        $ins->execute([$projectId, $userId]);
    }
}

function ccrm_ensure_project_gantt_table(\PDO $pdo, string $projectTypeId): string {
    $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($projectTypeId));
    $tableName = "proj_gantt_" . $safeId;
    $sql = "CREATE TABLE IF NOT EXISTS `{$tableName}` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `project_id` VARCHAR(50) NOT NULL,
        `title` VARCHAR(255) NOT NULL,
        `contact_id` VARCHAR(50) NULL,
        `start_date` DATE NULL,
        `end_date` DATE NULL,
        `progress` INT NOT NULL DEFAULT 0,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pg_proj (`project_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql);
    return $tableName;
}

function ccrm_ensure_project_data_table(\PDO $pdo, string $projectTypeId): string {
    $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($projectTypeId));
    $tableName = "proj_data_" . $safeId;
    $sql = "CREATE TABLE IF NOT EXISTS `{$tableName}` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `project_id` VARCHAR(50) NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_proj_id (`project_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql);
    return $tableName;
}

// 2.3. Voice Entry Creation Actions
if ($action === 'create_task') {
    $title = trim($payload['title'] ?? '');
    if (empty($title)) {
        echo json_encode(['success' => false, 'message' => 'Task title is required.']);
        exit;
    }
    $sessionUser = $_SESSION['user'] ?? [];
    $creator = $sessionUser['name'] ?? explode('@', $sessionUser['email'] ?? 'Erik')[0] ?? 'Erik';
    $taskId = 'task_' . time() . '_' . substr(md5(uniqid()), 0, 6);
    $description = trim($payload['description'] ?? '');
    $priority = in_array($payload['priority'] ?? '', ['low', 'medium', 'high']) ? $payload['priority'] : 'medium';
    $deadline = !empty($payload['due_date']) ? $payload['due_date'] : date('Y-m-d', strtotime('+3 days'));
    $deadlineTime = !empty($payload['deadline_time']) ? $payload['deadline_time'] : '17:00';
    $owner = trim($payload['assigned_to'] ?? $creator);

    try {
        $ins = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, NOW())");
        $ins->execute([$taskId, $title, $description, $priority, $deadline, $deadlineTime, $owner, $creator]);

        if (!empty($owner)) {
            $insAss = $pdo->prepare("INSERT INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `user_name` = VALUES(`user_name`)");
            $insAss->execute([$taskId, $owner]);
        }

        echo json_encode([
            'success' => true,
            'message' => "Task '{$title}' successfully created with deadline {$deadline}.",
            'task_id' => $taskId
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to create task: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'create_lead') {
    $name = trim($payload['name'] ?? '');
    if (empty($name)) {
        echo json_encode(['success' => false, 'message' => 'Lead/Client name is required.']);
        exit;
    }
    $sessionUser = $_SESSION['user'] ?? [];
    $creator = $sessionUser['name'] ?? explode('@', $sessionUser['email'] ?? 'Erik')[0] ?? 'Erik';
    $leadId = 'lead_' . time() . '_' . substr(md5(uniqid()), 0, 6);
    $city = trim($payload['city'] ?? '');
    $clientType = ($payload['client_type'] ?? 'business') === 'person' ? 'person' : 'business';
    $source = trim($payload['source'] ?? 'Voice Copilot');
    $owner = trim($payload['owner'] ?? $creator);
    $value = isset($payload['value']) ? (float)$payload['value'] : 0.0;
    $phone = trim($payload['phone'] ?? '');
    $email = trim($payload['email'] ?? '');
    $contactPerson = trim($payload['contact_person'] ?? '');
    $interestNote = trim($payload['interest_note'] ?? '');

    try {
        $ins = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `phone`, `email`, `contact_person`, `interest_note`, `created_at`) VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, NOW())");
        $ins->execute([$leadId, $name, $city, $clientType, $source, $owner, $value, $phone, $email, $contactPerson, $interestNote]);

        echo json_encode([
            'success' => true,
            'message' => "Lead '{$name}' successfully registered.",
            'lead_id' => $leadId
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to register lead: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'add_client_note') {
    $clientName = trim($payload['client_name'] ?? '');
    $content = trim($payload['content'] ?? '');
    if (empty($clientName) || empty($content)) {
        echo json_encode(['success' => false, 'message' => 'Client name and note content are required.']);
        exit;
    }
    $sessionUser = $_SESSION['user'] ?? [];
    $creator = $sessionUser['name'] ?? explode('@', $sessionUser['email'] ?? 'Erik')[0] ?? 'Erik';

    $stmt = $pdo->prepare("SELECT `id`, `name` FROM `leads` WHERE `name` LIKE ? LIMIT 1");
    $stmt->execute(['%' . $clientName . '%']);
    $lead = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$lead) {
        echo json_encode(['success' => false, 'message' => "Client '{$clientName}' not found in CRM."]);
        exit;
    }

    $eventId = 'ev_' . time() . '_' . substr(md5(uniqid()), 0, 6);
    $title = !empty($payload['title']) ? trim($payload['title']) : 'Voice Note';
    $type = in_array($payload['type'] ?? '', ['phone', 'email', 'note', 'offer', 'appointment']) ? $payload['type'] : 'note';

    try {
        $ins = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `author`) VALUES (?, ?, ?, NOW(), ?, ?, ?)");
        $ins->execute([$eventId, $lead['id'], $type, $title, $content, $creator]);

        echo json_encode([
            'success' => true,
            'message' => "Note logged for client '{$lead['name']}'.",
            'event_id' => $eventId,
            'lead_id' => $lead['id']
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to log client note: ' . $e->getMessage()]);
    }
    exit;
}

// 2.4. Project Management Voice Actions
if ($action === 'create_project') {
    $name = trim($payload['name'] ?? '');
    if (empty($name)) {
        echo json_encode(['success' => false, 'message' => 'Project name is required.']);
        exit;
    }
    $sessionUser = $_SESSION['user'] ?? [];
    $creator = $sessionUser['name'] ?? explode('@', $sessionUser['email'] ?? 'Erik')[0] ?? 'Erik';

    $projectTypeId = ccrm_resolve_project_type_id($pdo, $payload['project_type'] ?? null);
    $lead = ccrm_resolve_lead_by_name($pdo, $payload['client_name'] ?? null);
    $leadId = $lead ? $lead['id'] : null;
    $clientId = $leadId;

    $projId = 'proj_' . time() . '_' . substr(md5(uniqid()), 0, 6);
    $status = in_array($payload['status'] ?? '', ['new', 'active', 'completed', 'on_hold', 'cancelled']) ? $payload['status'] : 'active';
    $rating = (isset($payload['rating']) && is_numeric($payload['rating'])) ? max(1, min(5, (int)$payload['rating'])) : null;
    $budget = (isset($payload['budget']) && is_numeric($payload['budget']) && (float)$payload['budget'] > 0) ? (float)$payload['budget'] : null;
    $deadline = !empty($payload['deadline']) && preg_match('/^\d{4}-\d{2}-\d{2}/', $payload['deadline']) ? substr($payload['deadline'], 0, 10) : null;
    $startDate = date('Y-m-d');
    $delayReason = !empty($payload['delay_reason']) ? trim($payload['delay_reason']) : null;

    try {
        $ins = $pdo->prepare("INSERT INTO `projects` (`id`, `project_type_id`, `name`, `lead_id`, `client_id`, `status`, `rating`, `deadline`, `delay_reason`, `start_date`, `budget`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
        $ins->execute([$projId, $projectTypeId, $name, $leadId, $clientId, $status, $rating, $deadline, $delayReason, $startDate, $budget]);

        ccrm_ensure_project_data_table($pdo, $projectTypeId);
        $insData = $pdo->prepare("INSERT INTO `proj_data_" . preg_replace('/[^a-z0-9_]/', '', strtolower($projectTypeId)) . "` (`id`, `project_id`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `project_id` = VALUES(`project_id`)");
        $insData->execute([$projId, $projId]);

        $managers = !empty($payload['managers']) ? $payload['managers'] : [$creator];
        ccrm_assign_project_managers($pdo, $projId, $managers);

        echo json_encode([
            'success' => true,
            'message' => "Project '{$name}' created successfully (ID: {$projId}).",
            'project_id' => $projId,
            'project_name' => $name
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to create project: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'update_project') {
    $identifier = trim($payload['project_identifier'] ?? $payload['project_id'] ?? $payload['name'] ?? '');
    if (empty($identifier)) {
        echo json_encode(['success' => false, 'message' => 'Project identifier (name or ID) is required.']);
        exit;
    }

    $proj = ccrm_find_project_by_identifier($pdo, $identifier);
    if (!$proj) {
        echo json_encode(['success' => false, 'message' => "Project '{$identifier}' not found."]);
        exit;
    }

    $projId = $proj['id'];
    $updates = [];
    $params = [];

    if (!empty($payload['name'])) {
        $updates[] = "`name` = ?";
        $params[] = trim($payload['name']);
        $proj['name'] = trim($payload['name']);
    }
    if (isset($payload['status']) && in_array($payload['status'], ['new', 'active', 'completed', 'on_hold', 'cancelled'])) {
        $updates[] = "`status` = ?";
        $params[] = $payload['status'];
        if ($payload['status'] === 'completed') {
            $updates[] = "`finished_at` = COALESCE(`finished_at`, CURRENT_DATE)";
        }
    }
    if (isset($payload['budget'])) {
        $updates[] = "`budget` = ?";
        $params[] = is_numeric($payload['budget']) ? (float)$payload['budget'] : null;
    }
    if (isset($payload['deadline'])) {
        $dl = !empty($payload['deadline']) && preg_match('/^\d{4}-\d{2}-\d{2}/', $payload['deadline']) ? substr($payload['deadline'], 0, 10) : null;
        $updates[] = "`deadline` = ?";
        $params[] = $dl;
    }
    if (isset($payload['delay_reason'])) {
        $updates[] = "`delay_reason` = ?";
        $params[] = trim($payload['delay_reason']) ?: null;
    }
    if (isset($payload['rating'])) {
        $r = is_numeric($payload['rating']) ? max(1, min(5, (int)$payload['rating'])) : null;
        $updates[] = "`rating` = ?";
        $params[] = $r;
    }
    if (!empty($payload['client_name'])) {
        $lead = ccrm_resolve_lead_by_name($pdo, $payload['client_name']);
        if ($lead) {
            $updates[] = "`lead_id` = ?";
            $updates[] = "`client_id` = ?";
            $params[] = $lead['id'];
            $params[] = $lead['id'];
        }
    }

    try {
        if (!empty($updates)) {
            $params[] = $projId;
            $sql = "UPDATE `projects` SET " . implode(', ', $updates) . " WHERE `id` = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
        }

        if (isset($payload['managers'])) {
            ccrm_assign_project_managers($pdo, $projId, $payload['managers']);
        }

        echo json_encode([
            'success' => true,
            'message' => "Project '{$proj['name']}' updated successfully.",
            'project_id' => $projId,
            'project_name' => $proj['name']
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to update project: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'add_project_task') {
    $identifier = trim($payload['project_identifier'] ?? $payload['project_id'] ?? '');
    $title = trim($payload['title'] ?? '');
    if (empty($identifier) || empty($title)) {
        echo json_encode(['success' => false, 'message' => 'Project identifier and task title are required.']);
        exit;
    }

    $proj = ccrm_find_project_by_identifier($pdo, $identifier);
    if (!$proj) {
        echo json_encode(['success' => false, 'message' => "Project '{$identifier}' not found."]);
        exit;
    }

    $sessionUser = $_SESSION['user'] ?? [];
    $creator = $sessionUser['name'] ?? explode('@', $sessionUser['email'] ?? 'Erik')[0] ?? 'Erik';
    $taskId = 'task_' . time() . '_' . substr(md5(uniqid()), 0, 6);
    $description = trim($payload['description'] ?? '');
    $priority = in_array($payload['priority'] ?? '', ['low', 'medium', 'high']) ? $payload['priority'] : 'medium';
    $deadline = !empty($payload['due_date']) ? $payload['due_date'] : (!empty($proj['deadline']) ? $proj['deadline'] : date('Y-m-d', strtotime('+3 days')));
    $owner = trim($payload['assigned_to'] ?? $creator);

    try {
        $ins = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`, `related_project_id`, `related_lead_id`, `created_at`) VALUES (?, ?, ?, ?, ?, '17:00', 'todo', ?, ?, ?, ?, NOW())");
        $ins->execute([$taskId, $title, $description, $priority, $deadline, $owner, $creator, $proj['id'], $proj['lead_id']]);

        if (!empty($owner)) {
            $insAss = $pdo->prepare("INSERT INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `user_name` = VALUES(`user_name`)");
            $insAss->execute([$taskId, $owner]);
        }

        echo json_encode([
            'success' => true,
            'message' => "Task '{$title}' added to project '{$proj['name']}' (Deadline: {$deadline}).",
            'task_id' => $taskId,
            'project_id' => $proj['id'],
            'project_name' => $proj['name']
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to add project task: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'add_project_financial') {
    $identifier = trim($payload['project_identifier'] ?? $payload['project_id'] ?? '');
    $title = trim($payload['title'] ?? '');
    $amount = isset($payload['amount']) ? (float)$payload['amount'] : 0.0;
    $type = ($payload['type'] ?? 'expense') === 'income' ? 'income' : 'expense';

    if (empty($identifier) || empty($title) || $amount <= 0) {
        echo json_encode(['success' => false, 'message' => 'Project identifier, title, and valid positive amount are required.']);
        exit;
    }

    $proj = ccrm_find_project_by_identifier($pdo, $identifier);
    if (!$proj) {
        echo json_encode(['success' => false, 'message' => "Project '{$identifier}' not found."]);
        exit;
    }

    $sessionUser = $_SESSION['user'] ?? [];
    $creator = $sessionUser['name'] ?? explode('@', $sessionUser['email'] ?? 'Erik')[0] ?? 'Erik';
    $frId = 'fr_' . time() . '_' . substr(md5(uniqid()), 0, 6);

    $status = in_array($payload['status'] ?? '', ['planned', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled']) ? $payload['status'] : 'planned';
    $paidDate = !empty($payload['paid_date']) ? substr($payload['paid_date'], 0, 10) : null;
    if ($paidDate) {
        $status = 'paid';
    }
    $dueDate = !empty($payload['due_date']) ? substr($payload['due_date'], 0, 10) : date('Y-m-d');
    $issueDate = date('Y-m-d');
    $amountPlanned = ($status === 'paid') ? $amount : $amount;
    $amountReal = ($status === 'paid') ? $amount : 0.0;

    try {
        $ins = $pdo->prepare("INSERT INTO `financial_records` (`id`, `type`, `subtype`, `title`, `amount_planned`, `amount_real`, `currency`, `status`, `issue_date`, `due_date`, `paid_date`, `project_id`, `client_id`, `created_by`, `created_at`) VALUES (?, ?, 'regular', ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, NOW())");
        $ins->execute([$frId, $type, $title, $amountPlanned, $amountReal, $status, $issueDate, $dueDate, $paidDate, $proj['id'], $proj['client_id'], $creator]);

        echo json_encode([
            'success' => true,
            'message' => "Project " . ($type === 'income' ? 'income' : 'cost') . " '{$title}' (€" . number_format($amount, 2) . ") recorded for '{$proj['name']}'.",
            'record_id' => $frId,
            'project_id' => $proj['id'],
            'project_name' => $proj['name']
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to log project financial record: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'add_project_milestone') {
    $identifier = trim($payload['project_identifier'] ?? $payload['project_id'] ?? '');
    $title = trim($payload['title'] ?? '');
    if (empty($identifier) || empty($title)) {
        echo json_encode(['success' => false, 'message' => 'Project identifier and milestone title are required.']);
        exit;
    }

    $proj = ccrm_find_project_by_identifier($pdo, $identifier);
    if (!$proj) {
        echo json_encode(['success' => false, 'message' => "Project '{$identifier}' not found."]);
        exit;
    }

    $projectTypeId = $proj['project_type_id'] ?: 'pt_general';
    $ganttTable = ccrm_ensure_project_gantt_table($pdo, $projectTypeId);
    $ganttId = 'gantt_' . time() . '_' . substr(md5(uniqid()), 0, 6);

    $startDate = !empty($payload['start_date']) ? substr($payload['start_date'], 0, 10) : date('Y-m-d');
    $endDate = !empty($payload['end_date']) ? substr($payload['end_date'], 0, 10) : (!empty($proj['deadline']) ? $proj['deadline'] : date('Y-m-d', strtotime('+14 days')));
    $progress = isset($payload['progress']) && is_numeric($payload['progress']) ? max(0, min(100, (int)$payload['progress'])) : 0;

    try {
        $ins = $pdo->prepare("INSERT INTO `{$ganttTable}` (`id`, `project_id`, `title`, `contact_id`, `start_date`, `end_date`, `progress`) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $ins->execute([$ganttId, $proj['id'], $title, $proj['client_id'], $startDate, $endDate, $progress]);

        echo json_encode([
            'success' => true,
            'message' => "Milestone '{$title}' ({$progress}% done) added to project '{$proj['name']}'.",
            'milestone_id' => $ganttId,
            'project_id' => $proj['id'],
            'project_name' => $proj['name']
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to add project milestone: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'delete_project') {
    $identifier = trim($payload['project_identifier'] ?? $payload['project_id'] ?? '');
    if (empty($identifier)) {
        echo json_encode(['success' => false, 'message' => 'Project identifier (name or ID) is required.']);
        exit;
    }

    $proj = ccrm_find_project_by_identifier($pdo, $identifier);
    if (!$proj) {
        echo json_encode(['success' => false, 'message' => "Project '{$identifier}' not found."]);
        exit;
    }

    $projId = $proj['id'];
    $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($proj['project_type_id'] ?: ''));

    try {
        $del = $pdo->prepare("DELETE FROM `projects` WHERE `id` = ?");
        $del->execute([$projId]);

        $pdo->prepare("UPDATE `tasks` SET `related_project_id` = NULL WHERE `related_project_id` = ?")->execute([$projId]);

        if (!empty($safeId)) {
            @$pdo->prepare("DELETE FROM `proj_data_{$safeId}` WHERE `project_id` = ?")->execute([$projId]);
            @$pdo->prepare("DELETE FROM `proj_timeline_{$safeId}` WHERE `project_id` = ?")->execute([$projId]);
            @$pdo->prepare("DELETE FROM `proj_gantt_{$safeId}` WHERE `project_id` = ?")->execute([$projId]);
        }

        echo json_encode([
            'success' => true,
            'message' => "Project '{$proj['name']}' successfully deleted.",
            'project_id' => $projId,
            'project_name' => $proj['name']
        ]);
    } catch (\Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Failed to delete project: ' . $e->getMessage()]);
    }
    exit;
}

$agentId = $payload['agent_id'] ?? 'orchestrator';
$systemLanguage = $payload['language'] ?? 'sk';
$userName = trim($payload['user_name'] ?? '');

if (empty($userName)) {
    // Try to get name from session user
    $sessionUser = $_SESSION['user'] ?? [];
    $userName = $sessionUser['name'] ?? explode('@', $sessionUser['email'] ?? 'Erik')[0];
    if (empty($userName)) {
        $userName = 'Erik';
    }
}

// Connect to Chat/RAG DB for context and custom agents
$ragPdo = get_rag_db_connection($integrationsConfig);
$chatDb = $ragPdo ?: $pdo;
if ($chatDb) {
    init_rag_db_schemas($chatDb);
}

// 3. Resolve version & executive prompts
$versionCodename = 'Kiwi';
$versionFile = dirname(__DIR__, 2) . '/src/utils/version.ts';
if (!file_exists($versionFile)) {
    $versionFile = dirname(__DIR__) . '/src/utils/version.ts';
}
if (file_exists($versionFile)) {
    $vContent = @file_get_contents($versionFile);
    if ($vContent && preg_match('/VERSION_CODENAME\s*=\s*["\']([^"\']+)["\']/', $vContent, $m)) {
        $versionCodename = $m[1];
    } elseif ($vContent && preg_match('/VERSION\s*=\s*["\'][^"\']*-([^"\']+)["\']/', $vContent, $m)) {
        $versionCodename = $m[1];
    }
}

$execPrompts = get_executive_prompts();
$assignedVoice = 'alloy';
$agentName = "Executive Leader (" . $versionCodename . ")";
$agentPosition = "Executive Orchestrator & Principal Advisor";
$skillInstructions = "";

if (isset($execPrompts[$agentId])) {
    $exec = $execPrompts[$agentId];
    $agentName = $exec['name'];
    $agentPosition = $exec['position'];
    $assignedVoice = $exec['voice'] ?? 'alloy';
    $skillInstructions = $exec['prompt'];
} elseif ($agentId === 'durian' || $agentId === 'orchestrator') {
    $exec = $execPrompts['orchestrator'];
    $agentName = "Executive Leader (" . $versionCodename . ")";
    $agentPosition = "Executive Orchestrator & Principal Advisor";
    $assignedVoice = 'alloy';
    $skillInstructions = $exec['prompt'];
} elseif ($chatDb) {
    try {
        $aStmt = $chatDb->prepare("SELECT `name`, `skill_content`, `position` FROM `rag_agents` WHERE `id` = ?");
        $aStmt->execute([$agentId]);
        $customAgent = $aStmt->fetch(PDO::FETCH_ASSOC);
        if ($customAgent) {
            $agentName = $customAgent['name'];
            $agentPosition = $customAgent['position'];
            $assignedVoice = 'alloy';
            $skillInstructions = "You are " . $customAgent['name'] . " (" . $customAgent['position'] . "), an AI executive specialist with the following custom skills/instructions:\n"
                               . $customAgent['skill_content'];
        }
    } catch (\Exception $e) {}
}

if (empty($skillInstructions)) {
    $skillInstructions = "You are " . $versionCodename . ", the executive advisor. You advise with executive precision based on CRM data.";
}

// 4. Gather live CRM context across all 16 domains via comprehensive RAG engine
try {
    $ragData = build_comprehensive_crm_rag_context($pdo, $chatDb, '', $systemLanguage, $agentId, ['limit' => 32]);
    $crmContext = !empty($ragData['raw_context']) ? $ragData['raw_context'] : $ragData['sanitized_context'];
} catch (\Exception $e) {
    $crmContext = "";
}

$todayFormatted = date('l, j. F Y');
$todayDate = date('Y-m-d');
$langName = $systemLanguage === 'sk' ? 'Slovak (Slovenčina)' : ($systemLanguage === 'hu' ? 'Hungarian (Magyar)' : 'English');

// 5. Build Spoken Prompt for Fluent, Real-Time Conversation
$voiceSystemPrompt = $skillInstructions . "\n\n"
    . "=== LIVE VOICE CONVERSATION DIRECTIVES ===\n"
    . "1. FORMAT & CONVERSATIONAL TONE:\n"
    . "   - You are in an active, live, real-time phone call with {$userName}.\n"
    . "   - Always listen attentively to what {$userName} says and answer their questions directly, concisely, and conversationally (1-3 sentences per turn).\n"
    . "   - NEVER repeat greetings (e.g. 'Hello', 'Hi', 'Dobrý deň') or re-introduce your name, position, or credentials during ongoing conversation. Jump straight into the answer or discussion.\n"
    . "   - Speak naturally and fluidly. Do NOT use markdown asterisks, headers, or bullet points in spoken responses.\n\n"
    . "2. LIVE SCREEN NAVIGATION CAPABILITIES:\n"
    . "   - You can redirect and navigate the user's active CRM screen in real time!\n"
    . "   - When the user asks to see or open a module or screen, immediately call 'navigate_to_entry':\n"
    . "     * Cashflow, finances, revenues ('mutasd a cashflowt', 'menjünk a pénzügyekre', 'financie', 'penzugyek'): call navigate_to_entry with entity_type: 'financial', target: 'financial'.\n"
    . "     * Projects overview ('nyisd meg a projekteket', 'projekty'): call navigate_to_entry with entity_type: 'project', target: 'projects'.\n"
    . "     * Specific Project detail ('nyisd meg a Novatech projektet', 'mutasd a mobil app projektet'): call navigate_to_entry with entity_type: 'project', target: project name or ID.\n"
    . "     * Invoices and offers ('számlák', 'árajánlatok', 'faktury'): call navigate_to_entry with entity_type: 'invoices', target: 'invoices'.\n"
    . "     * Tasks and Kanban ('feladatok', 'teendők', 'ulohy'): call navigate_to_entry with entity_type: 'tasks', target: 'tasks'.\n"
    . "     * Warehouse and inventory ('raktár', 'készlet', 'sklad'): call navigate_to_entry with entity_type: 'warehouse', target: 'warehouse'.\n"
    . "     * Leads & sales funnel ('érdeklődők', 'tölcsér', 'pipeline'): call navigate_to_entry with entity_type: 'leads', target: 'leads'.\n"
    . "     * Client directory ('ügyfelek', 'klienti'): call navigate_to_entry with entity_type: 'clients', target: 'clients'.\n"
    . "     * Specific Client profile ('nyisd meg Hans Zimmert'): call navigate_to_entry with entity_type: 'client', target: 'Hans Zimmer'.\n"
    . "     * Meeting room ('tárgyaló'): call navigate_to_entry with entity_type: 'meetings', target: 'meetings'.\n"
    . "     * SAI Swarm simulation ('piaci szimuláció', 'sai'): call navigate_to_entry with entity_type: 'sai', target: 'sai'.\n"
    . "     * Dashboard ('irányítópult', 'dashboard'): call navigate_to_entry with entity_type: 'dashboard', target: 'dashboard'.\n\n"
    . "3. VOICE PROJECT MANAGEMENT CAPABILITIES (FULL CONTROL):\n"
    . "   - You can completely manage and update all project operations via voice!\n"
    . "   - Creating Projects ('hozz létre egy új projektet...', 'vytvor nový projekt...', 'create project...'):\n"
    . "     * Call 'create_project' with name, client_name, project_type, budget, deadline, managers, status, rating.\n"
    . "   - Updating Projects ('módosítsd a projektet...', 'uprav projekt...', 'állítsd át a státuszt...', 'költségvetés legyen...'):\n"
    . "     * Call 'update_project' with project_identifier and the updated fields (status, budget, deadline, delay_reason, rating, managers, client_name).\n"
    . "   - Adding Tasks to a Project ('adj hozzá egy feladatot a projekthez...', 'pridaj úlohu k projektu...'):\n"
    . "     * Call 'add_project_task' with project_identifier, title, priority, due_date, assigned_to.\n"
    . "   - Recording Direct Costs / Incomes on a Project ('írj fel egy költséget a projekthez...', 'zaeviduj náklad k projektu...', 'bevétel a projekthez...'):\n"
    . "     * Call 'add_project_financial' with project_identifier, type ('expense' or 'income'), title, amount, status, due_date, paid_date.\n"
    . "   - Adding Gantt Milestones / Phases ('adj hozzá egy mérföldkövet...', 'pridaj fázu / míľnik...'):\n"
    . "     * Call 'add_project_milestone' with project_identifier, title, start_date, end_date, progress.\n"
    . "   - Deleting Projects ('töröld a projektet...', 'vymaž projekt...'):\n"
    . "     * Call 'delete_project' with project_identifier.\n"
    . "   - Tasks & Leads ('hozz létre egy feladatot...', 'új érdeklődő...'): call 'create_task', 'create_lead', or 'add_client_note'.\n"
    . "   - Always confirm completed actions briefly and conversationally in speech.\n\n"
    . "4. LIVE DATABASE ACCESS & ANTI-REFUSAL DIRECTIVE:\n"
    . "   - You have 100% DIRECT, LIVE, REAL-TIME access to the CCRM database.\n"
    . "   - NEVER refuse a request or state that you lack real-time access or cannot check the database. All records in your prompt and available via the 'query_crm_live_data' tool are live, current CRM records.\n"
    . "   - When asked about any client (e.g. Cstudios, s.r.o., Peter Kováč), company, invoice, cashflow, task, or project, answer immediately with exact figures, dates, managers, and details from your CRM knowledge base or call the 'query_crm_live_data' tool.\n\n"
    . "5. GROUNDING IN CRM DATA:\n"
    . "   - Current system date is {$todayFormatted} ({$todayDate}).\n"
    . "   - You have live grounding in CRM operations and financial records:\n"
    . "{$crmContext}\n\n";

$screenContext = trim($payload['current_screen_context'] ?? '');
if (!empty($screenContext)) {
    $voiceSystemPrompt .= "6. USER'S ACTIVE SCREEN CONTEXT:\n"
                        . "{$screenContext}\n"
                        . "You know what the user is currently viewing.\n\n";
}

$voiceSystemPrompt .= "Answer and converse exclusively in the user's language ({$langName}). Speak clearly, decisively, and concisely.";

// 6. Define Realtime Tools
$realtimeTools = [
    [
        'type' => 'function',
        'name' => 'query_crm_live_data',
        'description' => 'Searches the live CCRM database across all 16 domains for deep records, client details, financial analysis, unpaid invoices, active projects, tasks, or inventory.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'query' => [
                    'type' => 'string',
                    'description' => 'The search query or entity name, e.g. "Cstudios", "unpaid invoices", "Peter Kovac", "project budget"'
                ]
            ],
            'required' => ['query']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'navigate_to_entry',
        'description' => 'Navigates or redirects the user\'s screen to a specific CRM entry, client profile, lead, project, financial cashflow view, invoices, task board, warehouse, meetings, or tab.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'entity_type' => [
                    'type' => 'string',
                    'enum' => ['client', 'lead', 'project', 'financial', 'finances', 'cashflow', 'invoices', 'tasks', 'warehouse', 'meetings', 'dashboard', 'automation', 'sai', 'social_media', 'files', 'tab'],
                    'description' => 'The type of CRM entity or tab to navigate to.'
                ],
                'target' => [
                    'type' => 'string',
                    'description' => 'The name, ID, or route of the target (e.g. "financial" for cashflow, "Silvia" for client, "12" for lead, "projects", "tasks", "warehouse", "invoices").'
                ]
            ],
            'required' => ['entity_type', 'target']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'create_project',
        'description' => 'Creates and registers a new project in CCRM with client pairing, budget, deadline, managers, and status.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'name' => [
                    'type' => 'string',
                    'description' => 'Project title or name (e.g. "Website Redesign", "Mobile App Development", "Marketing Campaign").'
                ],
                'client_name' => [
                    'type' => 'string',
                    'description' => 'Client or company name to link this project to.'
                ],
                'project_type' => [
                    'type' => 'string',
                    'description' => 'Project category or type (e.g. "Web Development", "Marketing", "Consulting").'
                ],
                'budget' => [
                    'type' => 'number',
                    'description' => 'Total allocated budget for the project in EUR.'
                ],
                'deadline' => [
                    'type' => 'string',
                    'description' => 'Project completion deadline in YYYY-MM-DD format.'
                ],
                'status' => [
                    'type' => 'string',
                    'enum' => ['new', 'active', 'completed', 'on_hold', 'cancelled'],
                    'description' => 'Initial status of the project. Default is active.'
                ],
                'rating' => [
                    'type' => 'number',
                    'description' => 'Priority star rating from 1 to 5.'
                ],
                'managers' => [
                    'type' => 'array',
                    'items' => ['type' => 'string'],
                    'description' => 'List of assigned project manager names (e.g. ["Erik", "Peter"]).'
                ]
            ],
            'required' => ['name']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'update_project',
        'description' => 'Updates an existing project\'s status, budget, deadline, delay reason, rating, managers, or name.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'project_identifier' => [
                    'type' => 'string',
                    'description' => 'Name or ID of the project to update.'
                ],
                'name' => [
                    'type' => 'string',
                    'description' => 'New name for the project.'
                ],
                'status' => [
                    'type' => 'string',
                    'enum' => ['new', 'active', 'completed', 'on_hold', 'cancelled'],
                    'description' => 'Updated status of the project.'
                ],
                'budget' => [
                    'type' => 'number',
                    'description' => 'Updated total budget in EUR.'
                ],
                'deadline' => [
                    'type' => 'string',
                    'description' => 'Updated deadline in YYYY-MM-DD format.'
                ],
                'delay_reason' => [
                    'type' => 'string',
                    'description' => 'Explanation of why the project is delayed past deadline.'
                ],
                'rating' => [
                    'type' => 'number',
                    'description' => 'Updated priority star rating (1 to 5).'
                ],
                'managers' => [
                    'type' => 'array',
                    'items' => ['type' => 'string'],
                    'description' => 'Updated list of assigned project managers.'
                ],
                'client_name' => [
                    'type' => 'string',
                    'description' => 'Client or company name to link.'
                ]
            ],
            'required' => ['project_identifier']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'add_project_task',
        'description' => 'Adds a specific task or action item directly linked to a project in CCRM.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'project_identifier' => [
                    'type' => 'string',
                    'description' => 'Name or ID of the project.'
                ],
                'title' => [
                    'type' => 'string',
                    'description' => 'Title of the task.'
                ],
                'description' => [
                    'type' => 'string',
                    'description' => 'Detailed task notes or description.'
                ],
                'priority' => [
                    'type' => 'string',
                    'enum' => ['low', 'medium', 'high'],
                    'description' => 'Priority level (low, medium, high). Default is medium.'
                ],
                'due_date' => [
                    'type' => 'string',
                    'description' => 'Deadline date in YYYY-MM-DD format.'
                ],
                'assigned_to' => [
                    'type' => 'string',
                    'description' => 'Name of team member assigned.'
                ]
            ],
            'required' => ['project_identifier', 'title']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'add_project_financial',
        'description' => 'Records a direct expense (cost) or income linked to a project in CCRM.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'project_identifier' => [
                    'type' => 'string',
                    'description' => 'Name or ID of the project.'
                ],
                'type' => [
                    'type' => 'string',
                    'enum' => ['expense', 'income'],
                    'description' => 'Whether this is an expense (cost) or income.'
                ],
                'title' => [
                    'type' => 'string',
                    'description' => 'Description or item name (e.g. "External UX consultant", "Server hosting", "Client milestone payment").'
                ],
                'amount' => [
                    'type' => 'number',
                    'description' => 'Amount in EUR.'
                ],
                'status' => [
                    'type' => 'string',
                    'enum' => ['planned', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled'],
                    'description' => 'Payment status (planned, pending, paid). Default is planned.'
                ],
                'due_date' => [
                    'type' => 'string',
                    'description' => 'Due date in YYYY-MM-DD format.'
                ],
                'paid_date' => [
                    'type' => 'string',
                    'description' => 'Date paid in YYYY-MM-DD format (if already settled).'
                ]
            ],
            'required' => ['project_identifier', 'type', 'title', 'amount']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'add_project_milestone',
        'description' => 'Adds a milestone, delivery phase, or Gantt schedule row to a project.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'project_identifier' => [
                    'type' => 'string',
                    'description' => 'Name or ID of the project.'
                ],
                'title' => [
                    'type' => 'string',
                    'description' => 'Title of the milestone or phase (e.g. "Wireframes & UX", "Development Sprint 1", "Launch & QA").'
                ],
                'start_date' => [
                    'type' => 'string',
                    'description' => 'Start date in YYYY-MM-DD format.'
                ],
                'end_date' => [
                    'type' => 'string',
                    'description' => 'End/target completion date in YYYY-MM-DD format.'
                ],
                'progress' => [
                    'type' => 'number',
                    'description' => 'Completion percentage (0 to 100). Default is 0.'
                ]
            ],
            'required' => ['project_identifier', 'title']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'delete_project',
        'description' => 'Permanently deletes a project from CCRM when requested by the user.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'project_identifier' => [
                    'type' => 'string',
                    'description' => 'Name or ID of the project to delete.'
                ]
            ],
            'required' => ['project_identifier']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'create_task',
        'description' => 'Creates a new general task or action item in CRM tasks & Kanban board for the user or a team member.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'title' => [
                    'type' => 'string',
                    'description' => 'Clear title of the task to be done.'
                ],
                'description' => [
                    'type' => 'string',
                    'description' => 'Detailed task description or notes.'
                ],
                'priority' => [
                    'type' => 'string',
                    'enum' => ['low', 'medium', 'high'],
                    'description' => 'Priority level (low, medium, high). Default is medium.'
                ],
                'due_date' => [
                    'type' => 'string',
                    'description' => 'Deadline date in YYYY-MM-DD format.'
                ],
                'assigned_to' => [
                    'type' => 'string',
                    'description' => 'Name of the person assigned to this task.'
                ]
            ],
            'required' => ['title']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'create_lead',
        'description' => 'Creates and registers a new lead / client account in the CRM sales pipeline.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'name' => [
                    'type' => 'string',
                    'description' => 'Company or client name.'
                ],
                'city' => [
                    'type' => 'string',
                    'description' => 'City or location.'
                ],
                'value' => [
                    'type' => 'number',
                    'description' => 'Estimated deal or opportunity value in EUR.'
                ],
                'client_type' => [
                    'type' => 'string',
                    'enum' => ['business', 'person'],
                    'description' => 'Type of client: business (company) or person.'
                ],
                'contact_person' => [
                    'type' => 'string',
                    'description' => 'Contact person name.'
                ],
                'phone' => [
                    'type' => 'string',
                    'description' => 'Phone number.'
                ],
                'email' => [
                    'type' => 'string',
                    'description' => 'Email address.'
                ],
                'interest_note' => [
                    'type' => 'string',
                    'description' => 'Notes regarding client interest, needs, or products.'
                ]
            ],
            'required' => ['name']
        ]
    ],
    [
        'type' => 'function',
        'name' => 'add_client_note',
        'description' => 'Logs an interaction, phone call note, meeting memo, or timeline entry to an existing client profile.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'client_name' => [
                    'type' => 'string',
                    'description' => 'Name of the client in CRM.'
                ],
                'title' => [
                    'type' => 'string',
                    'description' => 'Title or summary of the event.'
                ],
                'content' => [
                    'type' => 'string',
                    'description' => 'Content or details of the note/call.'
                ],
                'type' => [
                    'type' => 'string',
                    'enum' => ['note', 'phone', 'appointment', 'offer'],
                    'description' => 'Type of interaction (note, phone, appointment, offer).'
                ]
            ],
            'required' => ['client_name', 'content']
        ]
    ]
];

// Request Ephemeral Client Secret from OpenAI Realtime API (GA endpoint)
$sessionConfig = [
    'type' => 'realtime',
    'model' => 'gpt-realtime-1.5',
    'instructions' => $voiceSystemPrompt,
    'tools' => $realtimeTools,
    'audio' => [
        'output' => [
            'voice' => $assignedVoice
        ]
    ]
];

$sessionPayload = [
    'expires_after' => [
        'anchor' => 'created_at',
        'seconds' => 600
    ],
    'session' => $sessionConfig
];

$ch = curl_init('https://api.openai.com/v1/realtime/client_secrets');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($sessionPayload, JSON_INVALID_UTF8_SUBSTITUTE));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

// If wrapped payload wasn't accepted, try minimal client_secrets payload
if ($httpCode !== 200 && $httpCode !== 201) {
    $chRetry = curl_init('https://api.openai.com/v1/realtime/client_secrets');
    curl_setopt($chRetry, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($chRetry, CURLOPT_POST, true);
    curl_setopt($chRetry, CURLOPT_TIMEOUT, 15);
    curl_setopt($chRetry, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($chRetry, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($chRetry, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $openAiKey
    ]);
    curl_setopt($chRetry, CURLOPT_POSTFIELDS, json_encode([
        'expires_after' => ['anchor' => 'created_at', 'seconds' => 600]
    ]));
    $retryRes = curl_exec($chRetry);
    $retryCode = curl_getinfo($chRetry, CURLINFO_HTTP_CODE);
    curl_close($chRetry);

    if ($retryCode === 200 || $retryCode === 201) {
        $response = $retryRes;
        $httpCode = $retryCode;
    }
}

if ($httpCode !== 200 && $httpCode !== 201) {
    $errData = json_decode($response, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI Realtime API error');
    http_response_code($httpCode >= 400 && $httpCode <= 599 ? $httpCode : 500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to initialize OpenAI Realtime session (HTTP ' . $httpCode . '): ' . $errMsg
    ]);
    exit;
}

$sessionData = json_decode($response, true);
$clientSecret = $sessionData['value'] ?? $sessionData['client_secret']['value'] ?? $sessionData['client_secret'] ?? $sessionData['id'] ?? '';

if (empty($clientSecret)) {
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI Realtime API did not return an ephemeral client secret token.'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'client_secret' => $clientSecret,
    'session_id' => $sessionData['id'] ?? '',
    'voice' => $assignedVoice,
    'agent_name' => $agentName,
    'agent_position' => $agentPosition,
    'user_name' => $userName,
    'language' => $systemLanguage,
    'instructions' => $voiceSystemPrompt,
    'tools' => $realtimeTools
]);
