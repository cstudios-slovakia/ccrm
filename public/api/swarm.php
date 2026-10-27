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
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

// All Swarm operations require authenticated user session
$sessionUser = ccrm_require_auth();
// SAI is a sales module (it rehearses conversations against the lead / client base) and has no
// permission key of its own: it needs a view of leads or clients, like its menu entry (see
// permissionKeyForRoute). This also keeps its LLM proxy away from roles that have no sales access.
$swarmScope = ccrm_gate_any($sessionUser, ['leads', 'clients']);

// Anything that creates, changes, deletes or spends AI budget needs an EDIT right
// (not just a view), and must be a POST: a GET can be fired by a link or an <img>
// on another site, and it used to be enough to delete a simulation (VULN-23).
$swarmActionEarly = $_GET['action'] ?? ($_POST['action'] ?? 'list');
if (in_array($swarmActionEarly, ['create_simulation', 'checkpoint', 'delete', 'llm_proxy'], true)) {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }
    ccrm_gate_any($sessionUser, ['leads', 'clients'], 'edit');
}

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
    ccrm_log_exception($e);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$swarmManager = new SwarmManager($pdo);
$contextExtractor = new CrmContextExtractor($pdo);

// Helper to fetch server-side OpenAI/LLM API credentials
function get_server_llm_credentials(PDO $pdo): array {
    $apiKey = '';
    $baseUrl = 'https://api.openai.com/v1';
    $model = 'gpt-6-luna';

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
        $model = ccrm_ai_upgrade_model(getenv('LLM_MODEL_NAME'), 'gpt-6-luna');
    }

    return [
        'apiKey' => $apiKey,
        'baseUrl' => $baseUrl,
        'defaultModel' => $model
    ];
}

$action = $_GET['action'] ?? ($_POST['action'] ?? 'list');

// Which module's data each context source slug reads. The caller gets only the
// sources whose module they may read ('all' / '*' expands to exactly those), so the
// simulation context can never carry what the app would not show them.
$ccrmSourceModules = [
    'active_leads' => ['leads'],
    'existing_clients' => ['clients'],
    'projects' => ['projects'],
    'lost_deal_objections' => ['leads', 'clients'],
    'competitor_intel' => ['leads', 'clients'],
    'meeting_notes' => ['meetings'],
    'client_emails' => ['email'],
    'files' => ['files'],
    'products' => ['warehouse'],
    'financials' => ['financial'],
    'social_media_posts' => ['social_media'],
    'unified_entries' => ['unified_entries'],
];

// May the caller see this simulation? Administrators: all. Everyone else: their own.
// A simulation that predates ownership has no owner, so it is shown only to someone
// who may read every data source it was grounded on.
$swarmCanAccess = function (?string $owner, array $sources) use ($swarmScope, $sessionUser, $ccrmSourceModules): bool {
    if (!empty($swarmScope['isAdmin'])) {
        return true;
    }
    if ($owner !== null && $owner !== '') {
        return $owner === (string)($sessionUser['id'] ?? '');
    }
    $slugs = (in_array('*', $sources, true) || in_array('all', $sources, true)) ? array_keys($ccrmSourceModules) : $sources;
    foreach ($slugs as $slug) {
        $modules = $ccrmSourceModules[$slug] ?? null;
        if ($modules === null) {
            continue;
        }
        $readable = false;
        foreach ($modules as $moduleKey) {
            if (ccrm_can($swarmScope, $moduleKey)) {
                $readable = true;
                break;
            }
        }
        if (!$readable) {
            return false;
        }
    }
    return true;
};
$swarmRequireAccess = function (string $simId) use ($swarmManager, $swarmCanAccess): void {
    $info = $swarmManager->getAccessInfo($simId);
    if ($info === null || !$swarmCanAccess($info['created_by'], $info['sources'])) {
        // Same answer for "missing" and "not yours" so ids cannot be probed.
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Simulation not found.']);
        exit;
    }
};

// ─────────────────────────────────────────────────────────────
// ACTION: LLM PROXY (Secure browser -> CCRM -> OpenAI gateway)
// ─────────────────────────────────────────────────────────────
if ($action === 'llm_proxy') {
    // (gated for every action at the top of this file)
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
    // Only the models the Swarm UI offers (or the administrator configured): an
    // arbitrary client-chosen model would let any user spend the key on the most
    // expensive one. A stored GPT-5.6 / GPT-4o id is rewritten first.
    $swarmCfg = [];
    try {
        $swarmCfg = ccrm_load_integrations_config($pdo);
    } catch (\Throwable $e) {
    }
    $configured = ccrm_ai_upgrade_model($creds['defaultModel'], 'gpt-6-luna');
    $swarmAllowedModels = ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', $configured, ccrm_ai_model($swarmCfg, $configured)];
    $requested = isset($body['model']) && is_string($body['model']) ? ccrm_ai_upgrade_model($body['model'], $configured) : $configured;
    $model = in_array($requested, $swarmAllowedModels, true) ? $requested : $configured;
    $temperature = isset($body['temperature']) ? (float)$body['temperature'] : 0.7;
    $responseFormat = $body['response_format'] ?? null;
    $maxTokens = isset($body['max_completion_tokens']) 
        ? (int)$body['max_completion_tokens'] 
        : (isset($body['max_tokens']) ? (int)$body['max_tokens'] : 8000);

    $maxTokens = max(1, min($maxTokens, 16000));

    if (empty($messages) || !is_array($messages)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Messages array cannot be empty.']);
        exit;
    }

    $isReasoningModel = !ccrm_ai_model_supports_temperature($model);
    $payload = [
        'model' => $model,
        'messages' => $messages,
        'max_completion_tokens' => $maxTokens
    ];
    if (!$isReasoningModel && isset($temperature)) {
        $payload['temperature'] = $temperature;
    }
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

    // Automatic retry & recovery for model-specific parameter quirks (e.g., temperature != 1 on reasoning models)
    if ($httpCode === 400) {
        $errObj = json_decode($response, true);
        $errMsg = $errObj['error']['message'] ?? '';
        $retryNeeded = false;

        if (stripos($errMsg, 'temperature') !== false && isset($payload['temperature'])) {
            unset($payload['temperature']);
            $retryNeeded = true;
        }

        if (stripos($errMsg, 'response_format') !== false && isset($payload['response_format'])) {
            unset($payload['response_format']);
            $retryNeeded = true;
        }

        if ($retryNeeded) {
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
        }
    }

    if ($curlErr) {
        http_response_code(502);
        error_log('[swarm] LLM gateway error: ' . $curlErr);
        echo json_encode(['success' => false, 'message' => 'LLM gateway communication error.']);
        exit;
    }

    if ($httpCode === 200 && is_string($response)) {
        ccrm_ai_capture_usage($pdo, 'sai_swarm', json_decode($response, true), $model);
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
    $sourcesRaw = $_GET['sources'] ?? '';
    $sources = !empty($sourcesRaw) ? explode(',', $sourcesRaw) : [];
    // $ccrmSourceModules (above) maps each source slug to the modules it reads.
    $ccrmPdo = ccrm_auth_pdo();
    $ccrmScope = $ccrmPdo !== null ? ccrm_read_scope($ccrmPdo, $sessionUser) : ['isAdmin' => false, 'permissions' => []];
    $wantedSources = (in_array('*', $sources, true) || in_array('all', $sources, true)) ? array_keys($ccrmSourceModules) : $sources;
    $sources = [];
    foreach ($wantedSources as $slug) {
        foreach ($ccrmSourceModules[$slug] ?? [] as $moduleKey) {
            if (ccrm_can($ccrmScope, $moduleKey)) {
                $sources[] = $slug;
                break;
            }
        }
    }
    if (!$sources && !empty($sourcesRaw)) {
        $sources = ['none'];
    }
    $bundle = $contextExtractor->extractContext($lookbackMonths, 60000, $sources);
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
        // Re-using an id means updating that simulation: only its owner (or an admin) may.
        $requestedId = isset($body['id']) && is_string($body['id']) ? SwarmManager::sanitizeId($body['id']) : '';
        if ($requestedId !== '' && $swarmManager->getAccessInfo($requestedId) !== null) {
            $swarmRequireAccess($requestedId);
        } else {
            // Every new simulation creates four database tables, so the count is capped.
            if ($swarmManager->countSimulations((string)$sessionUser['id']) >= 30 || $swarmManager->countSimulations() >= 500) {
                http_response_code(429);
                echo json_encode(['success' => false, 'message' => 'Simulation limit reached. Delete an old simulation first.']);
                exit;
            }
        }
        $res = $swarmManager->createSimulation($body, (string)$sessionUser['id']);
        echo json_encode($res);
    } catch (\Exception $ex) {
        ccrm_log_exception($ex);
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Could not create the simulation.']);
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

    $swarmRequireAccess((string)$simId);

    try {
        $res = $swarmManager->saveCheckpoint($simId, $round, is_array($snapshot) ? $snapshot : [], is_array($newPosts) ? $newPosts : []);
        echo json_encode($res);
    } catch (\Exception $ex) {
        ccrm_log_exception($ex);
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Could not save the checkpoint.']);
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

    $swarmRequireAccess((string)$simId);
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
    $list = array_values(array_filter(
        $swarmManager->listSimulations(),
        function ($row) use ($swarmCanAccess) {
            $sources = (isset($row['crm_data_sources']) && is_array($row['crm_data_sources']))
                ? array_values(array_filter($row['crm_data_sources'], 'is_string'))
                : [];
            $owner = isset($row['created_by']) && $row['created_by'] !== null ? (string)$row['created_by'] : null;
            return $swarmCanAccess($owner, $sources);
        }
    ));
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

    $swarmRequireAccess((string)$simId);

    try {
        $ok = $swarmManager->deleteSimulation($simId);
        echo json_encode(['success' => $ok]);
    } catch (\Exception $ex) {
        ccrm_log_exception($ex);
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Could not delete the simulation.']);
    }
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Invalid action.']);
