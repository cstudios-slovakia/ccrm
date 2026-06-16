<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');

// Runnable from the CLI (cron). Over HTTP it requires an admin session so it
// cannot be triggered anonymously.
if (php_sapi_name() !== 'cli') {
    ccrm_require_admin();
}
require_once __DIR__ . '/agent_utils.php';

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
    exit;
}

// 1. Fetch integrations config to get OpenAI API key and RAG database parameters
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];

$openAiKey = $integrationsConfig['openAiKey'] ?? '';
$vectorDb = $integrationsConfig['vectorDb'] ?? 'none';

$ragPdo = get_rag_db_connection($integrationsConfig);
if (!$ragPdo) {
    echo json_encode(['success' => false, 'message' => 'RAG DB connection is not configured or active.']);
    exit;
}

// Initialize tables in case they don't exist yet
init_rag_db_schemas($ragPdo);

// 2. Load all autonomous agents
try {
    $aStmt = $ragPdo->query("SELECT `id`, `name`, `position`, `skill_content` FROM `rag_agents` WHERE `is_autonomous` = 1");
    $autonomousAgents = $aStmt->fetchAll(PDO::FETCH_ASSOC);
} catch (\Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Failed to query agents: ' . $e->getMessage()]);
    exit;
}

if (empty($autonomousAgents)) {
    echo json_encode(['success' => true, 'message' => 'No autonomous agents found.']);
    exit;
}

$results = [];

foreach ($autonomousAgents as $agent) {
    $agentId = (string)$agent['id'];
    $agentName = $agent['name'];
    
    // Execute background analysis
    $reply = execute_autonomous_run($pdo, $ragPdo, $agent, $openAiKey);
    
    // Save to default_user's chat feed
    try {
        $insStmt = $ragPdo->prepare("INSERT INTO `chat_history` (`user_id`, `sender`, `message_text`, `agent_id`) VALUES (?, 'agent', ?, ?)");
        $insStmt->execute(['default_user', $reply, $agentId]);
        $results[] = [
            'agent_id' => $agent['id'],
            'name' => $agentName,
            'status' => 'executed',
            'length' => strlen($reply)
        ];
    } catch (\Exception $e) {
        $results[] = [
            'agent_id' => $agent['id'],
            'name' => $agentName,
            'status' => 'failed_to_save',
            'error' => $e->getMessage()
        ];
    }
}

echo json_encode([
    'success' => true,
    'message' => 'Autonomous agents cron finished execution.',
    'results' => $results
]);
