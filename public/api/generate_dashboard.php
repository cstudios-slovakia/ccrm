<?php
/**
 * AI Dashboard Layout Generation Endpoint.
 * Communicates with OpenAI to create dynamic dashboard JSON layouts.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    ccrm_require_auth();
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

// Fetch integrations config to get OpenAI API key
try {
    $pdo = get_db_connection();
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
    $stmt->execute();
    $configJson = $stmt->fetchColumn();
    $integrationsConfig = $configJson ? json_decode($configJson, true) : [];
    $integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
    exit;
}

$openAiKey = $integrationsConfig['openAiKey'] ?? '';
if (empty($openAiKey)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI API Key is not configured. Please configure it in Settings.'
    ]);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

$prompt = $data['prompt'] ?? '';
$history = $data['history'] ?? [];
$model = $data['model'] ?? 'gpt-4o';

if (empty($prompt)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Prompt parameter is required.']);
    exit;
}

// Build messages array
$messages = [];

$systemInstruction = "You are a dashboard layout generator. Your task is to output a single JSON object representing the layout of a custom dashboard.
You MUST output ONLY valid JSON, with no markdown formatting, no ```json wrapper, and no text outside of the JSON.

API Endpoint: '/api/dashboard_query.php'
Supported Actions:
- Action: 'sql' (highly recommended for custom aggregates, joins, filters)
  Allows executing custom read-only SQL SELECT queries on CCRM tables.
  Params structure:
  {
    \"sql\": \"SELECT ... \",
    \"bind\": [ ... ] // optional array of values to bind to ? placeholders in SQL
  }

CCRM Database Tables and Columns (Read-Only):
1. `leads`: `id` (VARCHAR), `name` (VARCHAR, company/client name), `status` (VARCHAR, e.g. new, contacted, offer sent, accepted, rejected), `source` (VARCHAR, e.g. website, referral), `owner` (VARCHAR, project manager name), `value` (DECIMAL, opportunity worth), `rating` (INT 1-5), `phone`, `email`, `city`, `client_type` (person, business, partner), `created_at` (DATE), `website`.
   * Note: Clients are represented as leads with `client_type` or status = 'accepted'.
2. `tasks`: `id`, `title`, `description`, `priority` (low, medium, high), `start_date`, `deadline` (DATE), `status` (todo, in_progress, blocked, done), `owner`, `related_lead_id`, `created_at`.
3. `meeting_notes` (notes/meetings): `id`, `title`, `date`, `lead_id`, `lead_name`, `duration` (INT minutes), `notes` (TEXT), `attached_leads_json`, `attached_clients_json`, `attached_users_json`, `archived`, `created_at`.
4. `meeting_tasks`: `id`, `meeting_id`, `title`, `description`, `due_date`, `status` (todo, in_progress, done), `priority`.
5. `rag_emails` (emails cache): `user_email`, `folder`, `email_uid`, `subject`, `sender`, `recipient`, `body` (LONGTEXT), `received_at` (DATETIME).
6. `email_summaries` (email summaries): `user_email`, `folder`, `email_uid`, `summary` (TEXT), `created_at`.
7. `unified_entries`: `id`, `name`, `entry_name`, `folder_name`, `icon`, `color`.
8. Dynamic tables for custom unified entries: Named `ue_{safeId}` where `safeId` is lowercase alphanumeric of the entry id. Columns: `id`, `parent_id` (parent folder), `is_folder` (TINYINT), `title`, `due_date`, `file_name`, `file_size`, `file_type` (offer, contract, invoice), `file_path`, `client_id`, `lead_id`, `warning_days`, `icon`.
   * Use these tables to count or query files (where `file_name IS NOT NULL` or `is_folder = 0`).

Visual Design Guidelines:
1. Grid Layout: The dashboard utilizes a 12-column grid. Each widget's `size` property maps as follows:
   - `sm`: 3 columns (1/4 width) - best for simple metrics/KPI counters.
   - `md`: 4 columns (1/3 width) - best for simple charts or small tables.
   - `lg`: 6 columns (1/2 width) - best for detailed charts or tables.
   - `full`: 12 columns (full width) - best for wide tables or complex timelines.
   Ensure that the sum of widget sizes in a row makes sense (e.g. four `sm`, three `md`, two `lg`, or one `full`).
2. Color Palettes: Curate colors harmoniously across widgets. Available widget colors:
   `indigo`, `blue`, `emerald`, `purple`, `amber`, `rose`, `pink`, `cyan`.
   - Use emerald/indigo for financial metrics.
   - Use rose/amber for alerts or blocked tasks.
   - Use purple/blue/cyan for general user-related summaries.
3. Chart Types: Choose `bar`, `line`, `pie`, or `doughnut`.
   - Doughnut/Pie: Best for groupings with few values (e.g., status, source, priorities).
   - Bar: Best for comparisons (e.g., value per owner, task counts by owner).
   - Line: Best for trends over time (e.g., leads created_at by date).
4. Mapping: For `chart` widgets, define:
   - `mapping`: { \"labelsKey\": \"select_alias_for_label\", \"dataKey\": \"select_alias_for_value\" }
   Example: If SQL is \"SELECT status, COUNT(*) as count FROM leads GROUP BY status\", then:
   labelsKey: \"status\", dataKey: \"count\".
5. Tables: For `table` widgets, define:
   - `columns`: List of { \"key\": \"db_column_or_alias\", \"label\": \"Display Title\", \"format\": \"currency\" | \"date\" | \"text\" }

JSON Response Schema:
{
  \"widgets\": [
    {
      \"id\": \"unique_string_id\",
      \"type\": \"metric\" | \"chart\" | \"table\",
      \"title\": \"Widget Title\",
      \"size\": \"sm\" | \"md\" | \"lg\" | \"full\",
      \"color\": \"indigo\" | \"blue\" | \"emerald\" | \"purple\" | \"amber\" | \"rose\" | \"pink\" | \"cyan\",
      
      // For \"metric\" type:
      \"metricValue\": \"\", // Leave empty to load from query, or static string (optional)
      
      // For \"chart\" type:
      \"chartType\": \"bar\" | \"line\" | \"pie\" | \"doughnut\",
      \"mapping\": {
         \"labelsKey\": \"status\",
         \"dataKey\": \"count\"
      },

      // For \"table\" type:
      \"columns\": [
         { \"key\": \"field_name\", \"label\": \"Display Header\", \"format\": \"currency\" | \"date\" | \"text\" }
      ],

      // Query specification for dynamic loading
      \"query\": {
         \"action\": \"sql\",
         \"params\": {
            \"sql\": \"SELECT ...\",
            \"bind\": [] // Array of bind parameters, if any
         }
      }
    }
  ]
}";

$messages[] = ['role' => 'system', 'content' => $systemInstruction];

// Include prompt history if any
foreach ($history as $h) {
    if (isset($h['prompt'])) {
        $messages[] = ['role' => 'user', 'content' => $h['prompt']];
    }
    if (isset($h['layout'])) {
        $messages[] = ['role' => 'assistant', 'content' => json_encode($h['layout'])];
    }
}

// Add the current prompt
$messages[] = ['role' => 'user', 'content' => $prompt];

// Call OpenAI API
$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model' => $model,
    'messages' => $messages,
    'temperature' => 0.2
]));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($httpCode !== 200) {
    $errData = json_decode($response, true);
    $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI API request failed');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'OpenAI Error: ' . $errMsg]);
    exit;
}

$resData = json_decode($response, true);
$rawText = $resData['choices'][0]['message']['content'] ?? '';

// Clean code blocks if LLM still returned them
$cleanedText = trim($rawText);
if (strpos($cleanedText, '```') === 0) {
    $cleanedText = preg_replace('/^```(?:json)?\s*/i', '', $cleanedText);
    $cleanedText = preg_replace('/\s*```$/i', '', $cleanedText);
}
$cleanedText = trim($cleanedText);

$layoutJson = json_decode($cleanedText, true);
if (!$layoutJson) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'OpenAI generated invalid JSON layout format.',
        'raw' => $rawText
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'layout' => $layoutJson
]);
