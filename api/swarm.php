<?php
/**
 * CCRM Swarm Artificial Intelligence (SAI) API Endpoint
 * Handles:
 *  - Secure LLM Proxy for client-orchestrated browser simulation
 *  - Per-simulation sharded table creation (sim<sim_id>_*)
 *  - Temporal lookback CRM context extraction
 *  - Asynchronous round checkpointing & resume
 *  - Simulation deletion with atomic table drops
 */

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

// All Swarm operations require authenticated user session
ccrm_require_auth();

// Include autoloader / classes
require_once __DIR__ . '/Swarm/SwarmManager.php';
require_once __DIR__ . '/Swarm/CrmContextExtractor.php';

use CCRM\Swarm\SwarmManager;
use CCRM\Swarm\CrmContextExtractor;

if (!function_exists('get_db_connection')) {
    $configFile = dirname(__DIR__) . '/config.php';
    if (file_exists($configFile)) {
        require_once $configFile;
    }
}

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$swarmManager = new SwarmManager($pdo);
$contextExtractor = new CrmContextExtractor($pdo);

// Helper to fetch server-side OpenAI/LLM API credentials
function get_server_llm_credentials(PDO $pdo): array {
    $apiKey = '';
    $baseUrl = 'https://api.openai.com/v1';
    $model = 'gpt-5.6-luna';

    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
        $stmt->execute();
        $configJson = $stmt->fetchColumn();
        $integrationsConfig = $configJson ? json_decode($configJson, true) : [];
        if (function_exists('ccrm_decrypt_config_secrets') && function_exists('ccrm_integration_secret_keys')) {
            $integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];
        }
        $apiKey = $integrationsConfig['openAiKey'] ?? '';
    } catch (\Exception $ex) {
        // Fallback
    }

    if (empty($apiKey)) {
        $apiKey = getenv('OPENAI_API_KEY') ?: (getenv('LLM_API_KEY') ?: '');
    }
    if (getenv('LLM_BASE_URL')) {
        $baseUrl = rtrim(getenv('LLM_BASE_URL'), '/');
    }
    if (getenv('LLM_MODEL_NAME')) {
        $model = getenv('LLM_MODEL_NAME');
    }

    return [
        'apiKey' => $apiKey,
        'baseUrl' => $baseUrl,
        'defaultModel' => $model
    ];
}

$action = $_GET['action'] ?? ($_POST['action'] ?? 'list');

// ─────────────────────────────────────────────────────────────
// ACTION: LLM PROXY (Secure browser -> CCRM -> OpenAI gateway)
// ─────────────────────────────────────────────────────────────
if ($action === 'llm_proxy') {
    $creds = get_server_llm_credentials($pdo);
    if (empty($creds['apiKey'])) {
        http_response_code(400);
        echo json_encode([
            'success' => false, 
            'message' => 'OpenAI API key is not configured in CCRM Integrations or server environment.'
        ]);
        exit;
    }

    $rawInput = file_get_contents('php://input');
    $body = json_decode($rawInput, true) ?: [];

    $messages = $body['messages'] ?? [];
    $model = $body['model'] ?? $creds['defaultModel'];
    $temperature = isset($body['temperature']) ? (float)$body['temperature'] : 0.7;
    $responseFormat = $body['response_format'] ?? null;
    $maxTokens = isset($body['max_tokens']) ? (int)$body['max_tokens'] : 1500;

    if (empty($messages)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Messages array cannot be empty.']);
        exit;
    }

    $payload = [
        'model' => $model,
        'messages' => $messages,
        'temperature' => $temperature,
        'max_tokens' => $maxTokens
    ];
    if ($responseFormat) {
        $payload['response_format'] = $responseFormat;
    }

    $ch = curl_init($creds['baseUrl'] . '/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $creds['apiKey']
        ],
        CURLOPT_TIMEOUT => 90,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        http_response_code(502);
        echo json_encode(['success' => false, 'message' => 'LLM gateway communication error: ' . $curlErr]);
        exit;
    }

    http_response_code($httpCode);
    echo $response;
    exit;
}

// ─────────────────────────────────────────────────────────────
// ACTION: FETCH CRM CONTEXT (Temporal lookback horizon)
// ─────────────────────────────────────────────────────────────
if ($action === 'fetch_crm_context') {
    $lookbackMonths = isset($_GET['lookback_months']) ? (int)$_GET['lookback_months'] : 12;
    $bundle = $contextExtractor->extractContext($lookbackMonths);
    echo json_encode(['success' => true, 'context' => $bundle]);
    exit;
}

// ─────────────────────────────────────────────────────────────
// ACTION: CREATE SIMULATION (Initialize master record + sharded tables)
// ─────────────────────────────────────────────────────────────
if ($action === 'create_simulation') {
    $rawInput = file_get_contents('php://input');
    $body = json_decode($rawInput, true) ?: [];

    try {
        $res = $swarmManager->createSimulation($body);
        echo json_encode($res);
    } catch (\Exception $ex) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $ex->getMessage()]);
    }
    exit;
}

// ─────────────────────────────────────────────────────────────
// ACTION: CHECKPOINT (Save round snapshot async from client)
// ─────────────────────────────────────────────────────────────
if ($action === 'checkpoint') {
    $rawInput = file_get_contents('php://input');
    $body = json_decode($rawInput, true) ?: [];

    $simId = $body['simulation_id'] ?? '';
    $round = (int)($body['round'] ?? 0);
    $snapshot = $body['snapshot'] ?? [];
    $newPosts = $body['new_posts'] ?? [];

    if (empty($simId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'simulation_id is required.']);
        exit;
    }

    try {
        $res = $swarmManager->saveCheckpoint($simId, $round, $snapshot, $newPosts);
        echo json_encode($res);
    } catch (\Exception $ex) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $ex->getMessage()]);
    }
    exit;
}

// ─────────────────────────────────────────────────────────────
// ACTION: RESUME (Retrieve latest snapshot for interrupted sim)
// ─────────────────────────────────────────────────────────────
if ($action === 'resume') {
    $simId = $_GET['simulation_id'] ?? '';
    if (empty($simId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'simulation_id is required.']);
        exit;
    }

    $state = $swarmManager->getResumeState($simId);
    if (!$state) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Simulation not found.']);
        exit;
    }

    echo json_encode(['success' => true, 'simulation' => $state]);
    exit;
}

// ─────────────────────────────────────────────────────────────
// ACTION: LIST SIMULATIONS
// ─────────────────────────────────────────────────────────────
if ($action === 'list') {
    $list = $swarmManager->listSimulations();
    echo json_encode(['success' => true, 'simulations' => $list]);
    exit;
}

// ─────────────────────────────────────────────────────────────
// ACTION: DELETE SIMULATION (Atomic DROP TABLE sim<id>_*)
// ─────────────────────────────────────────────────────────────
if ($action === 'delete') {
    $simId = $_GET['simulation_id'] ?? ($_POST['simulation_id'] ?? '');
    if (empty($simId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'simulation_id is required.']);
        exit;
    }

    try {
        $ok = $swarmManager->deleteSimulation($simId);
        echo json_encode(['success' => $ok]);
    } catch (\Exception $ex) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $ex->getMessage()]);
    }
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Invalid action.']);
