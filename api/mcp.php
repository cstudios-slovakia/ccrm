<?php
/**
 * CCRM Model Context Protocol (MCP) Server Gateway.
 *
 * Implements JSON-RPC 2.0 protocol for MCP clients (Antigravity, Claude Desktop, Cursor).
 * Supports both HTTP POST JSON-RPC execution and HTTP GET SSE streaming.
 * Strict security guardrail: All business operations permitted; zero access to system settings.
 */

// 1. Headers & CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CCRM-MCP-KEY');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit(0);
}

// 2. Database Connection
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    $configFile = dirname(__DIR__) . '/public/config.php';
}
if (file_exists($configFile)) {
    require_once $configFile;
}

require_once __DIR__ . '/auth.php';

try {
    $pdo = function_exists('get_db_connection') ? get_db_connection() : ccrm_auth_pdo();
    if (!$pdo) {
        throw new \Exception("Database connection not established");
    }
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'jsonrpc' => '2.0',
        'error' => ['code' => -32603, 'message' => 'Database connection failed: ' . $e->getMessage()],
        'id' => null
    ]);
    exit;
}

// 3. MCP Token Authentication
$token = '';
if (!empty($_GET['token'])) {
    $token = trim((string)$_GET['token']);
} elseif (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
    $authHeader = trim($_SERVER['HTTP_AUTHORIZATION']);
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
    }
} elseif (!empty($_SERVER['HTTP_X_CCRM_MCP_KEY'])) {
    $token = trim((string)$_SERVER['HTTP_X_CCRM_MCP_KEY']);
}

if ($token === '') {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode([
        'jsonrpc' => '2.0',
        'error' => [
            'code' => -32001,
            'message' => 'Unauthorized: Missing MCP access key. Provide ?token=ccrm_mcp_... or Authorization: Bearer <key>'
        ],
        'id' => null
    ]);
    exit;
}

$tokenHash = hash('sha256', $token);
$authStmt = $pdo->prepare(
    "SELECT k.id as key_id, k.user_id, u.id as user_id_str, u.name, u.email, u.role
     FROM mcp_keys k
     JOIN users u ON k.user_id = u.id
     WHERE k.key_hash = ? AND k.revoked_at IS NULL
     LIMIT 1"
);
$authStmt->execute([$tokenHash]);
$authRow = $authStmt->fetch(\PDO::FETCH_ASSOC);

if (!$authRow) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode([
        'jsonrpc' => '2.0',
        'error' => [
            'code' => -32001,
            'message' => 'Unauthorized: Invalid or revoked MCP access key.'
        ],
        'id' => null
    ]);
    exit;
}

// Update last used timestamp
$touchStmt = $pdo->prepare("UPDATE mcp_keys SET last_used_at = NOW() WHERE id = ?");
$touchStmt->execute([$authRow['key_id']]);

$sessionUser = [
    'id' => $authRow['user_id_str'],
    'name' => $authRow['name'],
    'email' => $authRow['email'],
    'role' => $authRow['role']
];

// Helper: audit log wrapper
function mcp_audit(\PDO $pdo, array $user, string $action, ?string $detail = null): void {
    if (function_exists('ccrm_audit_log')) {
        ccrm_audit_log($pdo, ['id' => $user['id'], 'email' => $user['email']], $action, $detail);
    } else {
        $stmt = $pdo->prepare("INSERT INTO audit_log (actor_id, actor_email, action, detail, ip) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$user['id'], $user['email'], $action, $detail, $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1']);
    }
}

// 4. Handle HTTP GET (SSE transport or info probe)
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accept = $_SERVER['HTTP_ACCEPT'] ?? '';

if ($method === 'GET') {
    if (strpos($accept, 'text/event-stream') !== false || isset($_GET['transport']) && $_GET['transport'] === 'sse') {
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        $sessionId = bin2hex(random_bytes(16));
        $postUrl = '/api/mcp.php?token=' . urlencode($token) . '&sessionId=' . $sessionId;

        echo "event: endpoint\n";
        echo "data: " . $postUrl . "\n\n";
        flush();

        // Send a ping comment to keep stream alive
        echo ": ping\n\n";
        flush();
        exit;
    }

    header('Content-Type: application/json');
    echo json_encode([
        'status' => 'online',
        'server' => 'ccrm-mcp-server',
        'version' => '1.0.0',
        'authenticated_user' => [
            'name' => $sessionUser['name'],
            'email' => $sessionUser['email'],
            'role' => $sessionUser['role']
        ],
        'capabilities' => [
            'tools_count' => 41,
            'domains' => [
                'leads', 'clients', 'tasks', 'projects', 'financials',
                'warehouse', 'meetings', 'communications', 'search', 'team'
            ]
        ]
    ]);
    exit;
}

// 5. Read and Parse JSON-RPC Payload
$rawPayload = file_get_contents('php://input');
$rpc = json_decode($rawPayload, true);

if (!is_array($rpc)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'jsonrpc' => '2.0',
        'error' => ['code' => -32700, 'message' => 'Parse error: Invalid JSON payload'],
        'id' => null
    ]);
    exit;
}

$rpcId = $rpc['id'] ?? null;
$rpcMethod = $rpc['method'] ?? '';
$rpcParams = $rpc['params'] ?? [];

header('Content-Type: application/json');

// 6. JSON-RPC Protocol Handlers
switch ($rpcMethod) {
    case 'initialize':
        echo json_encode([
            'jsonrpc' => '2.0',
            'id' => $rpcId,
            'result' => [
                'protocolVersion' => '2024-11-05',
                'capabilities' => [
                    'tools' => ['listChanged' => false]
                ],
                'serverInfo' => [
                    'name' => 'ccrm-mcp-server',
                    'version' => '1.0.0'
                ]
            ]
        ]);
        exit;

    case 'notifications/initialized':
        // MCP notification from client indicating setup complete
        if ($rpcId !== null) {
            echo json_encode(['jsonrpc' => '2.0', 'id' => $rpcId, 'result' => new \stdClass()]);
        } else {
            http_response_code(204);
        }
        exit;

    case 'ping':
        echo json_encode(['jsonrpc' => '2.0', 'id' => $rpcId, 'result' => new \stdClass()]);
        exit;

    case 'tools/list':
        echo json_encode([
            'jsonrpc' => '2.0',
            'id' => $rpcId,
            'result' => [
                'tools' => mcp_get_tool_definitions()
            ]
        ]);
        exit;

    case 'tools/call':
        $toolName = (string)($rpcParams['name'] ?? '');
        $toolArgs = is_array($rpcParams['arguments'] ?? null) ? $rpcParams['arguments'] : [];

        try {
            $toolResult = mcp_execute_tool($pdo, $sessionUser, $toolName, $toolArgs);
            $responseText = is_string($toolResult) ? $toolResult : json_encode($toolResult, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

            echo json_encode([
                'jsonrpc' => '2.0',
                'id' => $rpcId,
                'result' => [
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => $responseText
                        ]
                    ],
                    'isError' => false
                ]
            ]);
        } catch (\Throwable $e) {
            echo json_encode([
                'jsonrpc' => '2.0',
                'id' => $rpcId,
                'result' => [
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => 'Error executing ' . $toolName . ': ' . $e->getMessage()
                        ]
                    ],
                    'isError' => true
                ]
            ]);
        }
        exit;

    default:
        echo json_encode([
            'jsonrpc' => '2.0',
            'id' => $rpcId,
            'error' => [
                'code' => -32601,
                'message' => 'Method not found: ' . htmlspecialchars($rpcMethod)
            ]
        ]);
        exit;
}

// ============================================================================
// TOOL DEFINITIONS (41 Tools Across 10 Domains)
// ============================================================================
function mcp_get_tool_definitions(): array {
    return [
        // DOMAIN 1: Leads & Opportunities (Pipeline)
        [
            'name' => 'list_leads',
            'description' => 'List and filter sales leads and pipeline opportunities.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => ['type' => 'string', 'description' => 'Filter by status: new, contacted, proposal_sent, negotiation, won, lost'],
                    'search' => ['type' => 'string', 'description' => 'Search across lead name, email, phone, city'],
                    'owner' => ['type' => 'string', 'description' => 'Filter by assigned owner/manager name'],
                    'limit' => ['type' => 'integer', 'description' => 'Number of records to return (default 25, max 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)']
                ]
            ]
        ],
        [
            'name' => 'get_lead',
            'description' => 'Get full details of a specific lead by ID, including recent timeline events and notes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'The lead ID']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'create_lead',
            'description' => 'Create a new sales opportunity or lead in the pipeline.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Company or individual name'],
                    'contact_person' => ['type' => 'string', 'description' => 'Primary contact person name'],
                    'email' => ['type' => 'string', 'description' => 'Contact email address'],
                    'phone' => ['type' => 'string', 'description' => 'Contact phone number'],
                    'city' => ['type' => 'string', 'description' => 'City location'],
                    'street' => ['type' => 'string', 'description' => 'Street address'],
                    'value' => ['type' => 'number', 'description' => 'Estimated opportunity deal value'],
                    'status' => ['type' => 'string', 'description' => 'Initial stage (default "new")'],
                    'owner' => ['type' => 'string', 'description' => 'Assigned owner name (defaults to active user)'],
                    'interest_note' => ['type' => 'string', 'description' => 'Client interest or problem description']
                ],
                'required' => ['name']
            ]
        ],
        [
            'name' => 'update_lead',
            'description' => 'Update fields of an existing lead opportunity.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'The lead ID to update'],
                    'name' => ['type' => 'string', 'description' => 'Updated company / client name'],
                    'contact_person' => ['type' => 'string', 'description' => 'Updated contact person'],
                    'email' => ['type' => 'string', 'description' => 'Updated email'],
                    'phone' => ['type' => 'string', 'description' => 'Updated phone'],
                    'city' => ['type' => 'string', 'description' => 'Updated city'],
                    'street' => ['type' => 'string', 'description' => 'Updated street'],
                    'value' => ['type' => 'number', 'description' => 'Updated opportunity value'],
                    'rating' => ['type' => 'integer', 'description' => 'Star rating 1-5'],
                    'owner' => ['type' => 'string', 'description' => 'Updated assigned owner'],
                    'interest_note' => ['type' => 'string', 'description' => 'Updated notes']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'transition_lead_stage',
            'description' => 'Move a lead to a new pipeline stage and log the status change event.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Lead ID'],
                    'status' => ['type' => 'string', 'description' => 'New status: new, contacted, proposal_sent, negotiation, won, lost'],
                    'note' => ['type' => 'string', 'description' => 'Optional note explaining the stage change']
                ],
                'required' => ['id', 'status']
            ]
        ],
        [
            'name' => 'convert_lead_to_client',
            'description' => 'Convert a won lead into a client record and optionally create an initial project.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Lead ID to convert'],
                    'create_project' => ['type' => 'boolean', 'description' => 'Whether to auto-create a delivery project'],
                    'project_name' => ['type' => 'string', 'description' => 'Name for the project if created']
                ],
                'required' => ['id']
            ]
        ],

        // DOMAIN 2: Clients & Contact Management
        [
            'name' => 'list_clients',
            'description' => 'List registered clients with optional filtering, search, and sorting.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => ['type' => 'string', 'description' => 'Search by client name, email, ICO, phone'],
                    'city' => ['type' => 'string', 'description' => 'Filter by city'],
                    'client_type' => ['type' => 'string', 'description' => 'Filter by client type: business, person, partner'],
                    'sort_by' => ['type' => 'string', 'description' => 'Sort column: name, created_at, value (default name)'],
                    'sort_order' => ['type' => 'string', 'description' => 'Sort direction: asc or desc (default asc)'],
                    'limit' => ['type' => 'integer', 'description' => 'Results limit (default 50)'],
                    'offset' => ['type' => 'integer', 'description' => 'Offset for pagination']
                ]
            ]
        ],
        [
            'name' => 'get_client',
            'description' => 'Get client details including linked projects, invoices, and timeline history.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'The client ID']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'create_client',
            'description' => 'Create a new business client record with tax and invoicing details.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Company or client legal name'],
                    'company_id' => ['type' => 'string', 'description' => 'Company Registration Number (IČO)'],
                    'tax_id' => ['type' => 'string', 'description' => 'Tax Identification Number (DIČ)'],
                    'vat_id' => ['type' => 'string', 'description' => 'VAT Number (IČ DPH)'],
                    'contact_person' => ['type' => 'string', 'description' => 'Primary contact person'],
                    'email' => ['type' => 'string', 'description' => 'Primary email address'],
                    'phone' => ['type' => 'string', 'description' => 'Primary phone number'],
                    'street' => ['type' => 'string', 'description' => 'Street address'],
                    'city' => ['type' => 'string', 'description' => 'City'],
                    'postal_code' => ['type' => 'string', 'description' => 'Postal code'],
                    'country' => ['type' => 'string', 'description' => 'Country (default Slovakia)'],
                    'notes' => ['type' => 'string', 'description' => 'Internal client notes']
                ],
                'required' => ['name']
            ]
        ],
        [
            'name' => 'update_client',
            'description' => 'Update client information and tax credentials.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Client ID'],
                    'name' => ['type' => 'string', 'description' => 'Company name'],
                    'company_id' => ['type' => 'string', 'description' => 'IČO'],
                    'tax_id' => ['type' => 'string', 'description' => 'DIČ'],
                    'vat_id' => ['type' => 'string', 'description' => 'IČ DPH'],
                    'contact_person' => ['type' => 'string', 'description' => 'Contact person'],
                    'email' => ['type' => 'string', 'description' => 'Email'],
                    'phone' => ['type' => 'string', 'description' => 'Phone'],
                    'street' => ['type' => 'string', 'description' => 'Street'],
                    'city' => ['type' => 'string', 'description' => 'City'],
                    'postal_code' => ['type' => 'string', 'description' => 'Postal code'],
                    'country' => ['type' => 'string', 'description' => 'Country'],
                    'notes' => ['type' => 'string', 'description' => 'Notes']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'list_contacts',
            'description' => 'List contacts associated with a specific client.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => ['type' => 'string', 'description' => 'Client ID']
                ],
                'required' => ['client_id']
            ]
        ],
        [
            'name' => 'create_contact',
            'description' => 'Log or link a contact person for a client.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => ['type' => 'string', 'description' => 'Client ID'],
                    'name' => ['type' => 'string', 'description' => 'Contact person name'],
                    'email' => ['type' => 'string', 'description' => 'Email'],
                    'phone' => ['type' => 'string', 'description' => 'Phone'],
                    'role' => ['type' => 'string', 'description' => 'Position or role']
                ],
                'required' => ['client_id', 'name']
            ]
        ],

        // DOMAIN 3: Tasks & Collaboration
        [
            'name' => 'list_tasks',
            'description' => 'List and filter tasks across projects, clients, and team members.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => ['type' => 'string', 'description' => 'Filter by status: todo, in_progress, done, blocked'],
                    'priority' => ['type' => 'string', 'description' => 'Filter by priority: low, medium, high'],
                    'owner' => ['type' => 'string', 'description' => 'Filter by assignee name'],
                    'project_id' => ['type' => 'string', 'description' => 'Filter by related project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Filter by related client ID'],
                    'search' => ['type' => 'string', 'description' => 'Search task titles and descriptions'],
                    'limit' => ['type' => 'integer', 'description' => 'Max results (default 50)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset']
                ]
            ]
        ],
        [
            'name' => 'get_task',
            'description' => 'Retrieve full task details, assignees, and tags.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Task ID']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'create_task',
            'description' => 'Create a new task with assignees, deadline, and project/client links.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string', 'description' => 'Task title'],
                    'description' => ['type' => 'string', 'description' => 'Detailed task description'],
                    'priority' => ['type' => 'string', 'description' => 'Priority: low, medium, high (default medium)'],
                    'deadline' => ['type' => 'string', 'description' => 'Deadline date in YYYY-MM-DD format'],
                    'deadline_time' => ['type' => 'string', 'description' => 'Optional deadline time in HH:MM format'],
                    'status' => ['type' => 'string', 'description' => 'Task status (default "todo")'],
                    'owner' => ['type' => 'string', 'description' => 'Primary assignee name'],
                    'assignees' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'List of team member names to assign'
                    ],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client / lead ID']
                ],
                'required' => ['title', 'deadline']
            ]
        ],
        [
            'name' => 'update_task',
            'description' => 'Update task properties such as title, priority, deadline, or status.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Task ID to update'],
                    'title' => ['type' => 'string', 'description' => 'Updated title'],
                    'description' => ['type' => 'string', 'description' => 'Updated description'],
                    'priority' => ['type' => 'string', 'description' => 'Priority: low, medium, high'],
                    'deadline' => ['type' => 'string', 'description' => 'Deadline in YYYY-MM-DD format'],
                    'status' => ['type' => 'string', 'description' => 'Status: todo, in_progress, done, blocked'],
                    'owner' => ['type' => 'string', 'description' => 'Primary assignee name'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'complete_task',
            'description' => 'Mark a task as completed with user attribution timestamp.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Task ID'],
                    'note' => ['type' => 'string', 'description' => 'Optional completion note']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'add_task_comment',
            'description' => 'Add a comment or progress note to a task.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'task_id' => ['type' => 'string', 'description' => 'Task ID'],
                    'comment' => ['type' => 'string', 'description' => 'Comment text']
                ],
                'required' => ['task_id', 'comment']
            ]
        ],

        // DOMAIN 4: Projects & Gantt Roadmaps
        [
            'name' => 'list_projects',
            'description' => 'List and filter delivery projects.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => ['type' => 'string', 'description' => 'Filter by status: active, completed, on_hold'],
                    'client_id' => ['type' => 'string', 'description' => 'Filter by client ID'],
                    'search' => ['type' => 'string', 'description' => 'Search project names'],
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include archived projects (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Limit (default 50)']
                ]
            ]
        ],
        [
            'name' => 'get_project',
            'description' => 'Retrieve project details, budget, milestones, and linked tasks.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Project ID']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'create_project',
            'description' => 'Create a new client project.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Project title/name'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client ID'],
                    'budget' => ['type' => 'number', 'description' => 'Allocated budget in EUR'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date (YYYY-MM-DD)'],
                    'deadline' => ['type' => 'string', 'description' => 'Deadline date (YYYY-MM-DD)'],
                    'status' => ['type' => 'string', 'description' => 'Status: active, on_hold (default active)']
                ],
                'required' => ['name']
            ]
        ],
        [
            'name' => 'update_project',
            'description' => 'Update project details, dates, budget, or status.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Project ID'],
                    'name' => ['type' => 'string', 'description' => 'Updated title'],
                    'status' => ['type' => 'string', 'description' => 'Status: active, completed, on_hold'],
                    'budget' => ['type' => 'number', 'description' => 'Budget'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date (YYYY-MM-DD)'],
                    'deadline' => ['type' => 'string', 'description' => 'Deadline (YYYY-MM-DD)']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'create_milestone',
            'description' => 'Create a key milestone or locking deliverable for a project.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'project_id' => ['type' => 'string', 'description' => 'Project ID'],
                    'title' => ['type' => 'string', 'description' => 'Milestone title'],
                    'deadline' => ['type' => 'string', 'description' => 'Due date (YYYY-MM-DD)'],
                    'priority' => ['type' => 'string', 'description' => 'Priority (default high)']
                ],
                'required' => ['project_id', 'title', 'deadline']
            ]
        ],

        // DOMAIN 5: Financials & Invoicing
        [
            'name' => 'get_financial_summary',
            'description' => 'Get high-level financial KPIs: revenue, expenses, net profit, and unpaid invoices.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'period' => ['type' => 'string', 'description' => 'Period: month, quarter, year, all (default year)'],
                    'year' => ['type' => 'integer', 'description' => 'Year to evaluate (e.g. 2026)']
                ]
            ]
        ],
        [
            'name' => 'list_invoices',
            'description' => 'List issued invoices and price offers with payment status.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'type' => ['type' => 'string', 'description' => 'Type: invoice, price_offer, proforma (default invoice)'],
                    'status' => ['type' => 'string', 'description' => 'Status: draft, sent, approved, rejected, invoiced, cancelled'],
                    'client_id' => ['type' => 'string', 'description' => 'Filter by client ID'],
                    'search' => ['type' => 'string', 'description' => 'Search document number or client name'],
                    'limit' => ['type' => 'integer', 'description' => 'Limit (default 50)']
                ]
            ]
        ],
        [
            'name' => 'get_invoice',
            'description' => 'Get full breakdown of an invoice or price offer with line items.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Invoice document ID']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'create_invoice',
            'description' => 'Create a draft invoice with line items.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => ['type' => 'string', 'description' => 'Client ID'],
                    'title' => ['type' => 'string', 'description' => 'Invoice title or subject'],
                    'document_number' => ['type' => 'string', 'description' => 'Invoice number (e.g. 2026001). Auto-generated if omitted.'],
                    'issued_at' => ['type' => 'string', 'description' => 'Issue date (YYYY-MM-DD)'],
                    'due_date' => ['type' => 'string', 'description' => 'Due date (YYYY-MM-DD)'],
                    'currency' => ['type' => 'string', 'description' => 'Currency code (default EUR)'],
                    'items' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'title' => ['type' => 'string'],
                                'quantity' => ['type' => 'number'],
                                'unit_price' => ['type' => 'number'],
                                'vat_rate' => ['type' => 'number']
                            ],
                            'required' => ['title', 'quantity', 'unit_price']
                        ],
                        'description' => 'List of line items'
                    ],
                    'notes' => ['type' => 'string', 'description' => 'Invoice notes']
                ],
                'required' => ['client_id', 'title', 'items']
            ]
        ],
        [
            'name' => 'update_invoice_status',
            'description' => 'Update the status of an invoice (e.g. marked as paid or cancelled).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Invoice ID'],
                    'status' => ['type' => 'string', 'description' => 'New status: draft, sent, approved, rejected, invoiced, cancelled'],
                    'paid_date' => ['type' => 'string', 'description' => 'Settlement date if paid (YYYY-MM-DD)']
                ],
                'required' => ['id', 'status']
            ]
        ],
        [
            'name' => 'list_expenses',
            'description' => 'Query recorded business expenses.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'category_id' => ['type' => 'string', 'description' => 'Filter by financial category ID'],
                    'start_date' => ['type' => 'string', 'description' => 'From date (YYYY-MM-DD)'],
                    'end_date' => ['type' => 'string', 'description' => 'To date (YYYY-MM-DD)'],
                    'search' => ['type' => 'string', 'description' => 'Search expense title/description'],
                    'limit' => ['type' => 'integer', 'description' => 'Limit (default 50)']
                ]
            ]
        ],
        [
            'name' => 'record_expense',
            'description' => 'Record a new business expense item.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string', 'description' => 'Expense description or title'],
                    'amount' => ['type' => 'number', 'description' => 'Amount spent'],
                    'currency' => ['type' => 'string', 'description' => 'Currency (default EUR)'],
                    'category_id' => ['type' => 'string', 'description' => 'Category ID'],
                    'issue_date' => ['type' => 'string', 'description' => 'Date occurred (YYYY-MM-DD)'],
                    'status' => ['type' => 'string', 'description' => 'Status: planned, pending, paid (default paid)'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID if applicable'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client ID if applicable']
                ],
                'required' => ['title', 'amount', 'issue_date']
            ]
        ],

        // DOMAIN 6: Warehouse & Inventory
        [
            'name' => 'list_inventory_items',
            'description' => 'List warehouse stock items and current inventory levels.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'category' => ['type' => 'string', 'description' => 'Filter by item category'],
                    'low_stock_only' => ['type' => 'boolean', 'description' => 'Show only items below min_stock'],
                    'search' => ['type' => 'string', 'description' => 'Search by item name, SKU, or barcode'],
                    'limit' => ['type' => 'integer', 'description' => 'Limit (default 50)']
                ]
            ]
        ],
        [
            'name' => 'get_inventory_item',
            'description' => 'Get item details and stock levels across all warehouses.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Warehouse item ID']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'create_inventory_item',
            'description' => 'Add a new catalog item to warehouse inventory.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'sku' => ['type' => 'string', 'description' => 'Stock Keeping Unit (SKU) code'],
                    'name' => ['type' => 'string', 'description' => 'Item name'],
                    'description' => ['type' => 'string', 'description' => 'Item description'],
                    'category' => ['type' => 'string', 'description' => 'Category name'],
                    'unit' => ['type' => 'string', 'description' => 'Unit of measure (default "ks")'],
                    'min_stock' => ['type' => 'number', 'description' => 'Minimum stock alert threshold'],
                    'default_sell_price' => ['type' => 'number', 'description' => 'Default selling price']
                ],
                'required' => ['sku', 'name']
            ]
        ],
        [
            'name' => 'adjust_stock',
            'description' => 'Record a stock movement (inward receipt, outward sale, audit adjustment).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'item_id' => ['type' => 'string', 'description' => 'Warehouse item ID'],
                    'quantity_change' => ['type' => 'number', 'description' => 'Quantity change (positive for inward, negative for outward)'],
                    'reason' => ['type' => 'string', 'description' => 'Reason: receipt, sale, damage, audit'],
                    'warehouse_id' => ['type' => 'string', 'description' => 'Warehouse ID (defaults to default warehouse)'],
                    'notes' => ['type' => 'string', 'description' => 'Movement notes']
                ],
                'required' => ['item_id', 'quantity_change', 'reason']
            ]
        ],

        // DOMAIN 7: Meetings & Scheduling
        [
            'name' => 'list_meetings',
            'description' => 'Query scheduled client meetings and meeting notes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'upcoming_only' => ['type' => 'boolean', 'description' => 'Only show future meetings'],
                    'start_date' => ['type' => 'string', 'description' => 'From date (YYYY-MM-DD)'],
                    'search' => ['type' => 'string', 'description' => 'Search meeting title or notes'],
                    'limit' => ['type' => 'integer', 'description' => 'Limit (default 50)']
                ]
            ]
        ],
        [
            'name' => 'schedule_meeting',
            'description' => 'Schedule a client meeting with notes and attendees.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string', 'description' => 'Meeting title / subject'],
                    'date' => ['type' => 'string', 'description' => 'Meeting date (YYYY-MM-DD)'],
                    'duration' => ['type' => 'integer', 'description' => 'Duration in minutes (default 30)'],
                    'lead_id' => ['type' => 'string', 'description' => 'Linked lead or client ID'],
                    'notes' => ['type' => 'string', 'description' => 'Agenda or discussion notes'],
                    'attendees' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'List of attendee names'
                    ]
                ],
                'required' => ['title', 'date']
            ]
        ],
        [
            'name' => 'update_meeting',
            'description' => 'Update meeting details, notes, or rescheduled date.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Meeting ID'],
                    'title' => ['type' => 'string', 'description' => 'Updated title'],
                    'date' => ['type' => 'string', 'description' => 'Updated date (YYYY-MM-DD)'],
                    'duration' => ['type' => 'integer', 'description' => 'Duration in minutes'],
                    'notes' => ['type' => 'string', 'description' => 'Updated notes']
                ],
                'required' => ['id']
            ]
        ],

        // DOMAIN 8: Communications & Notes
        [
            'name' => 'list_communications',
            'description' => 'List interaction history (calls, emails, notes) for a lead or client.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'lead_id' => ['type' => 'string', 'description' => 'Lead or client ID'],
                    'type' => ['type' => 'string', 'description' => 'Filter by event type: phone, email, note, appointment'],
                    'limit' => ['type' => 'integer', 'description' => 'Limit (default 50)']
                ],
                'required' => ['lead_id']
            ]
        ],
        [
            'name' => 'log_communication',
            'description' => 'Log a client phone call, interaction note, or email summary to the timeline.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'lead_id' => ['type' => 'string', 'description' => 'Lead or client ID'],
                    'type' => ['type' => 'string', 'description' => 'Type: phone, email, note, appointment (default note)'],
                    'title' => ['type' => 'string', 'description' => 'Short summary or subject'],
                    'content' => ['type' => 'string', 'description' => 'Detailed conversation content or note'],
                    'is_outgoing' => ['type' => 'boolean', 'description' => 'True if initiated by team, false if received (default true)']
                ],
                'required' => ['lead_id', 'title']
            ]
        ],

        // DOMAIN 9: Cross-Entity Global Search
        [
            'name' => 'search_entities',
            'description' => 'Search across leads, clients, tasks, projects, invoices, and warehouse catalog with a single keyword query.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Search term or query string'],
                    'entity_types' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'Optional filter: leads, clients, tasks, projects, invoices, warehouse'
                    ]
                ],
                'required' => ['query']
            ]
        ],

        // DOMAIN 10: Team Directory (Read-Only)
        [
            'name' => 'list_team_members',
            'description' => 'List CRM team members available for assigning tasks and projects (passwords excluded).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => ['type' => 'string', 'description' => 'Search name or email'],
                    'role' => ['type' => 'string', 'description' => 'Filter by role']
                ]
            ]
        ],

        // DOMAIN 11: Employees, Salaries & Vacations
        [
            'name' => 'list_employees',
            'description' => 'List company employees with compensation rates, contact details, and vacation allowances.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => ['type' => 'string', 'description' => 'Search by name, email, PIN, or phone'],
                    'active_only' => ['type' => 'boolean', 'description' => 'Filter by active employees only (default true)']
                ]
            ]
        ],
        [
            'name' => 'get_employee',
            'description' => 'Retrieve full employee details by ID including allowances, salary configuration, and recent payroll.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Employee ID (e.g. emp-...)']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'create_employee',
            'description' => 'Register a new employee in the CRM roster.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Full name of employee'],
                    'pin' => ['type' => 'string', 'description' => 'Personal ID number / Rodné číslo / Tax ID'],
                    'email' => ['type' => 'string', 'description' => 'Email address'],
                    'phone' => ['type' => 'string', 'description' => 'Phone number'],
                    'address_street' => ['type' => 'string', 'description' => 'Street address'],
                    'address_city' => ['type' => 'string', 'description' => 'City'],
                    'address_zip' => ['type' => 'string', 'description' => 'Postal code'],
                    'salary_type' => ['type' => 'string', 'enum' => ['monthly', 'daily', 'hourly'], 'description' => 'Salary period type'],
                    'salary_amount' => ['type' => 'number', 'description' => 'Base salary rate in EUR'],
                    'salary_due_day' => ['type' => 'integer', 'description' => 'Day of the month for payout (e.g. 15)'],
                    'auto_expense' => ['type' => 'boolean', 'description' => 'Automatically create expense records in Financial Management'],
                    'expense_category_id' => ['type' => 'string', 'description' => 'Financial category ID for auto-expense']
                ],
                'required' => ['name']
            ]
        ],
        [
            'name' => 'update_employee',
            'description' => 'Update an existing employee profile, salary rate, or contact information.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Employee ID'],
                    'name' => ['type' => 'string', 'description' => 'Full name'],
                    'pin' => ['type' => 'string', 'description' => 'Personal ID number'],
                    'email' => ['type' => 'string', 'description' => 'Email address'],
                    'phone' => ['type' => 'string', 'description' => 'Phone number'],
                    'salary_type' => ['type' => 'string', 'enum' => ['monthly', 'daily', 'hourly']],
                    'salary_amount' => ['type' => 'number', 'description' => 'Salary rate in EUR'],
                    'salary_due_day' => ['type' => 'integer', 'description' => 'Day of month for payout'],
                    'auto_expense' => ['type' => 'boolean', 'description' => 'Auto-expense enabled'],
                    'is_active' => ['type' => 'boolean', 'description' => 'Active employment status']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'list_salaries',
            'description' => 'Query salary and payment records for employees by period (year, month) or employee ID.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Filter by employee ID'],
                    'year' => ['type' => 'integer', 'description' => 'Filter by year (e.g. 2026)'],
                    'period_key' => ['type' => 'string', 'description' => 'Filter by period key (e.g. 2026-09)']
                ]
            ]
        ],
        [
            'name' => 'record_salary_payout',
            'description' => 'Record or update salary obligation and payment for an employee for a specific period.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Employee ID'],
                    'period_key' => ['type' => 'string', 'description' => 'Period key (e.g. 2026-09)'],
                    'year' => ['type' => 'integer', 'description' => 'Year'],
                    'period_number' => ['type' => 'integer', 'description' => 'Month (1-12) or week (1-53)'],
                    'total_salary' => ['type' => 'number', 'description' => 'Total salary obligation amount'],
                    'total_paid' => ['type' => 'number', 'description' => 'Actual amount paid so far'],
                    'payment_date' => ['type' => 'string', 'description' => 'Date payment was made (YYYY-MM-DD)'],
                    'due_date' => ['type' => 'string', 'description' => 'Target payout due date (YYYY-MM-DD)'],
                    'payment_method' => ['type' => 'string', 'description' => 'Payment method (bank_transfer, cash, etc.)'],
                    'note' => ['type' => 'string', 'description' => 'Optional note']
                ],
                'required' => ['employee_id', 'period_key', 'total_salary']
            ]
        ],
        [
            'name' => 'list_vacations',
            'description' => 'List vacation and absence entries with optional filtering by employee, status, or date.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Filter by employee ID'],
                    'status' => ['type' => 'string', 'enum' => ['requested', 'approved', 'rejected', 'taken']],
                    'year' => ['type' => 'integer', 'description' => 'Filter by year']
                ]
            ]
        ],
        [
            'name' => 'record_vacation',
            'description' => 'Log or approve a vacation request for an employee.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Employee ID'],
                    'vacation_type_id' => ['type' => 'string', 'description' => 'Vacation type ID (annual, worked_days, sick, unpaid)'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date (YYYY-MM-DD)'],
                    'end_date' => ['type' => 'string', 'description' => 'End date (YYYY-MM-DD)'],
                    'days_count' => ['type' => 'number', 'description' => 'Total business days'],
                    'status' => ['type' => 'string', 'enum' => ['requested', 'approved', 'rejected', 'taken'], 'description' => 'Status (default approved)'],
                    'note' => ['type' => 'string', 'description' => 'Note or reason']
                ],
                'required' => ['employee_id', 'start_date', 'end_date']
            ]
        ]
    ];
}

// ============================================================================
// TOOL EXECUTION DISPATCHER
// ============================================================================
function mcp_execute_tool(\PDO $pdo, array $user, string $tool, array $args): mixed {
    switch ($tool) {
        // --- 1. Leads & Pipeline ---
        case 'list_leads':
            $where = ["archived = 0"];
            $params = [];

            if (!empty($args['status'])) {
                $where[] = "status = ?";
                $params[] = $args['status'];
            }
            if (!empty($args['owner'])) {
                $where[] = "owner = ?";
                $params[] = $args['owner'];
            }
            if (!empty($args['search'])) {
                $term = '%' . $args['search'] . '%';
                $where[] = "(name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?)";
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
            }

            $limit = min(max(1, (int)($args['limit'] ?? 25)), 100);
            $offset = max(0, (int)($args['offset'] ?? 0));

            $sql = "SELECT id, name, city, client_type, status, source, owner, division, value, rating, phone, email, contact_person, created_at 
                    FROM leads 
                    WHERE " . implode(' AND ', $where) . " 
                    ORDER BY created_at DESC 
                    LIMIT $limit OFFSET $offset";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'get_lead':
            $stmt = $pdo->prepare("SELECT * FROM leads WHERE id = ?");
            $stmt->execute([$args['id']]);
            $lead = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$lead) {
                throw new \Exception("Lead not found with ID: " . $args['id']);
            }

            // Fetch recent timeline events
            $evStmt = $pdo->prepare("SELECT id, type, timestamp, title, content, amount, author FROM timeline_events WHERE lead_id = ? ORDER BY timestamp DESC LIMIT 20");
            $evStmt->execute([$args['id']]);
            $lead['timeline_events'] = $evStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $lead;

        case 'create_lead':
            $id = 'ld_' . bin2hex(random_bytes(8));
            $name = trim($args['name']);
            $city = $args['city'] ?? null;
            $phone = $args['phone'] ?? null;
            $email = $args['email'] ?? null;
            $contact = $args['contact_person'] ?? null;
            $street = $args['street'] ?? null;
            $value = (float)($args['value'] ?? 0);
            $status = $args['status'] ?? 'new';
            $owner = $args['owner'] ?? $user['name'];
            $interestNote = $args['interest_note'] ?? null;
            $today = date('Y-m-d');

            $stmt = $pdo->prepare(
                "INSERT INTO leads (id, name, city, street, phone, email, contact_person, value, status, owner, interest_note, source, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_assistant', ?)"
            );
            $stmt->execute([$id, $name, $city, $street, $phone, $email, $contact, $value, $status, $owner, $interestNote, $today]);

            mcp_audit($pdo, $user, 'lead_create', "Created lead '{$name}' (ID: $id) with value €{$value}");

            return ['success' => true, 'id' => $id, 'name' => $name, 'status' => $status, 'value' => $value];

        case 'update_lead':
            $id = $args['id'];
            $allowedFields = ['name', 'contact_person', 'email', 'phone', 'city', 'street', 'value', 'rating', 'owner', 'interest_note'];
            $updates = [];
            $params = [];

            foreach ($allowedFields as $f) {
                if (array_key_exists($f, $args)) {
                    $updates[] = "`$f` = ?";
                    $params[] = $args[$f];
                }
            }

            if (empty($updates)) {
                return ['success' => true, 'message' => 'No fields updated'];
            }

            $params[] = $id;
            $stmt = $pdo->prepare("UPDATE leads SET " . implode(', ', $updates) . " WHERE id = ?");
            $stmt->execute($params);

            mcp_audit($pdo, $user, 'lead_update', "Updated lead $id");

            return ['success' => true, 'id' => $id, 'updated_fields' => array_keys($args)];

        case 'transition_lead_stage':
            $id = $args['id'];
            $status = $args['status'];
            $note = $args['note'] ?? '';

            $stmt = $pdo->prepare("UPDATE leads SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);

            // Add timeline event
            $evId = 'ev_' . bin2hex(random_bytes(8));
            $evStmt = $pdo->prepare(
                "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                 VALUES (?, ?, 'status_change', NOW(), ?, ?, ?)"
            );
            $evStmt->execute([$evId, $id, "Status changed to: " . strtoupper($status), $note, $user['name']]);

            mcp_audit($pdo, $user, 'lead_stage_transition', "Moved lead $id to '$status'");

            return ['success' => true, 'id' => $id, 'new_status' => $status];

        case 'convert_lead_to_client':
            $id = $args['id'];
            $stmt = $pdo->prepare("UPDATE leads SET status = 'won', client_type = 'business' WHERE id = ?");
            $stmt->execute([$id]);

            $projectId = null;
            if (!empty($args['create_project'])) {
                $projectId = 'proj_' . bin2hex(random_bytes(8));
                $projectName = $args['project_name'] ?? ('Project for Lead ' . $id);
                $prStmt = $pdo->prepare(
                    "INSERT INTO projects (id, project_type_id, name, lead_id, client_id, status, created_at)
                     VALUES (?, 'pt_standard', ?, ?, ?, 'active', NOW())"
                );
                $prStmt->execute([$projectId, $projectName, $id, $id]);
            }

            mcp_audit($pdo, $user, 'lead_convert', "Converted lead $id to client" . ($projectId ? " with project $projectId" : ""));

            return ['success' => true, 'lead_id' => $id, 'status' => 'won', 'project_id' => $projectId];

        // --- 2. Clients & Contacts ---
        case 'list_clients':
            $where = ["(status = 'won' OR client_type IN ('business', 'partner', 'person')) AND archived = 0"];
            $params = [];

            if (!empty($args['search'])) {
                $term = '%' . $args['search'] . '%';
                $where[] = "(name LIKE ? OR email LIKE ? OR phone LIKE ? OR company_id LIKE ?)";
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
            }
            if (!empty($args['city'])) {
                $where[] = "city = ?";
                $params[] = $args['city'];
            }
            if (!empty($args['client_type'])) {
                $where[] = "client_type = ?";
                $params[] = $args['client_type'];
            }

            $sortCol = in_array($args['sort_by'] ?? '', ['name', 'created_at', 'value']) ? $args['sort_by'] : 'name';
            $sortDir = (strtolower($args['sort_order'] ?? '') === 'desc') ? 'DESC' : 'ASC';
            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);
            $offset = max(0, (int)($args['offset'] ?? 0));

            $sql = "SELECT id, name, company_id, tax_id, vat_id, contact_person, email, phone, street, city, postal_code, country, value, adjustment, rating, status, client_type, created_at 
                    FROM leads 
                    WHERE " . implode(' AND ', $where) . " 
                    ORDER BY $sortCol $sortDir 
                    LIMIT $limit OFFSET $offset";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'get_client':
            $id = $args['id'];
            $stmt = $pdo->prepare("SELECT * FROM leads WHERE id = ?");
            $stmt->execute([$id]);
            $client = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$client) {
                throw new \Exception("Client not found with ID: " . $id);
            }

            // Linked projects
            $prStmt = $pdo->prepare("SELECT id, name, status, budget, deadline FROM projects WHERE client_id = ? OR lead_id = ?");
            $prStmt->execute([$id, $id]);
            $client['projects'] = $prStmt->fetchAll(\PDO::FETCH_ASSOC);

            // Linked invoices
            $invStmt = $pdo->prepare("SELECT id, document_number, title, total_price, currency, status, issued_at FROM invoices_offers WHERE client_id = ? OR lead_id = ? ORDER BY issued_at DESC LIMIT 15");
            $invStmt->execute([$id, $id]);
            $client['invoices'] = $invStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $client;

        case 'create_client':
            $id = 'cl_' . bin2hex(random_bytes(8));
            $name = trim($args['name']);
            $ico = $args['company_id'] ?? null;
            $dic = $args['tax_id'] ?? null;
            $icdph = $args['vat_id'] ?? null;
            $contact = $args['contact_person'] ?? null;
            $email = $args['email'] ?? null;
            $phone = $args['phone'] ?? null;
            $street = $args['street'] ?? null;
            $city = $args['city'] ?? null;
            $zip = $args['postal_code'] ?? null;
            $country = $args['country'] ?? 'Slovakia';
            $notes = $args['notes'] ?? null;
            $today = date('Y-m-d');

            $stmt = $pdo->prepare(
                "INSERT INTO leads (id, name, company_id, tax_id, vat_id, contact_person, email, phone, street, city, postal_code, country, interest_note, status, client_type, owner, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'won', 'business', ?, ?)"
            );
            $stmt->execute([$id, $name, $ico, $dic, $icdph, $contact, $email, $phone, $street, $city, $zip, $country, $notes, $user['name'], $today]);

            mcp_audit($pdo, $user, 'client_create', "Created client '$name' (IČO: $ico, ID: $id)");

            return ['success' => true, 'id' => $id, 'name' => $name, 'company_id' => $ico];

        case 'update_client':
            $id = $args['id'];
            $allowedFields = ['name', 'company_id', 'tax_id', 'vat_id', 'contact_person', 'email', 'phone', 'street', 'city', 'postal_code', 'country', 'interest_note'];
            $updates = [];
            $params = [];

            foreach ($allowedFields as $f) {
                if (array_key_exists($f, $args)) {
                    $updates[] = "`$f` = ?";
                    $params[] = $args[$f];
                }
            }

            if (!empty($args['notes'])) {
                $updates[] = "`interest_note` = ?";
                $params[] = $args['notes'];
            }

            if (empty($updates)) {
                return ['success' => true, 'message' => 'No fields updated'];
            }

            $params[] = $id;
            $stmt = $pdo->prepare("UPDATE leads SET " . implode(', ', $updates) . " WHERE id = ?");
            $stmt->execute($params);

            mcp_audit($pdo, $user, 'client_update', "Updated client $id");

            return ['success' => true, 'id' => $id, 'updated_fields' => array_keys($args)];

        case 'list_contacts':
            $stmt = $pdo->prepare("SELECT id, name, contact_person, email, phone FROM leads WHERE id = ?");
            $stmt->execute([$args['client_id']]);
            $lead = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$lead) return [];
            return [
                [
                    'name' => $lead['contact_person'] ?: $lead['name'],
                    'email' => $lead['email'],
                    'phone' => $lead['phone'],
                    'role' => 'Primary Contact'
                ]
            ];

        case 'create_contact':
            $clientId = $args['client_id'];
            $contactName = $args['name'];
            $email = $args['email'] ?? '';
            $phone = $args['phone'] ?? '';
            $role = $args['role'] ?? 'Contact';

            $evId = 'ev_' . bin2hex(random_bytes(8));
            $content = "Added contact: $contactName ($role)" . ($email ? " - $email" : "") . ($phone ? " - $phone" : "");
            $evStmt = $pdo->prepare(
                "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                 VALUES (?, ?, 'note', NOW(), 'Contact Person Added', ?, ?)"
            );
            $evStmt->execute([$evId, $clientId, $content, $user['name']]);

            mcp_audit($pdo, $user, 'contact_create', "Added contact '$contactName' to client $clientId");

            return ['success' => true, 'client_id' => $clientId, 'contact_name' => $contactName];

        // --- 3. Tasks & Collaboration ---
        case 'list_tasks':
            $where = ["archived = 0"];
            $params = [];

            if (!empty($args['status'])) {
                $where[] = "status = ?";
                $params[] = $args['status'];
            }
            if (!empty($args['priority'])) {
                $where[] = "priority = ?";
                $params[] = $args['priority'];
            }
            if (!empty($args['owner'])) {
                $where[] = "owner = ?";
                $params[] = $args['owner'];
            }
            if (!empty($args['project_id'])) {
                $where[] = "related_project_id = ?";
                $params[] = $args['project_id'];
            }
            if (!empty($args['client_id'])) {
                $where[] = "related_lead_id = ?";
                $params[] = $args['client_id'];
            }
            if (!empty($args['search'])) {
                $term = '%' . $args['search'] . '%';
                $where[] = "(title LIKE ? OR description LIKE ?)";
                $params[] = $term;
                $params[] = $term;
            }

            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);
            $offset = max(0, (int)($args['offset'] ?? 0));

            $sql = "SELECT id, title, description, priority, deadline, deadline_time, status, owner, created_by, related_lead_id, related_project_id, created_at 
                    FROM tasks 
                    WHERE " . implode(' AND ', $where) . " 
                    ORDER BY deadline ASC, priority DESC 
                    LIMIT $limit OFFSET $offset";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'get_task':
            $stmt = $pdo->prepare("SELECT * FROM tasks WHERE id = ?");
            $stmt->execute([$args['id']]);
            $task = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$task) {
                throw new \Exception("Task not found with ID: " . $args['id']);
            }

            // Assignees
            $asStmt = $pdo->prepare("SELECT user_name FROM task_assignees WHERE task_id = ?");
            $asStmt->execute([$args['id']]);
            $task['assignees'] = $asStmt->fetchAll(\PDO::FETCH_COLUMN);

            // Tags
            $tgStmt = $pdo->prepare("SELECT tag_name FROM task_tags WHERE task_id = ?");
            $tgStmt->execute([$args['id']]);
            $task['tags'] = $tgStmt->fetchAll(\PDO::FETCH_COLUMN);

            return $task;

        case 'create_task':
            $id = 'tsk_' . bin2hex(random_bytes(8));
            $title = trim($args['title']);
            $desc = $args['description'] ?? null;
            $priority = in_array($args['priority'] ?? '', ['low', 'medium', 'high']) ? $args['priority'] : 'medium';
            $deadline = $args['deadline'];
            $deadlineTime = $args['deadline_time'] ?? null;
            $status = $args['status'] ?? 'todo';
            $owner = $args['owner'] ?? $user['name'];
            $projId = $args['project_id'] ?? null;
            $leadId = $args['client_id'] ?? null;

            $stmt = $pdo->prepare(
                "INSERT INTO tasks (id, title, description, priority, deadline, deadline_time, status, owner, created_by, related_project_id, related_lead_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([$id, $title, $desc, $priority, $deadline, $deadlineTime, $status, $owner, $user['name'], $projId, $leadId]);

            // Assignees
            $assignees = is_array($args['assignees'] ?? null) ? $args['assignees'] : [$owner];
            $asStmt = $pdo->prepare("INSERT INTO task_assignees (task_id, user_name) VALUES (?, ?)");
            foreach (array_unique($assignees) as $asUser) {
                if (trim($asUser) !== '') {
                    $asStmt->execute([$id, trim($asUser)]);
                }
            }

            mcp_audit($pdo, $user, 'task_create', "Created task '$title' (ID: $id, deadline: $deadline)");

            return ['success' => true, 'id' => $id, 'title' => $title, 'status' => $status, 'deadline' => $deadline];

        case 'update_task':
            $id = $args['id'];
            $allowedFields = ['title', 'description', 'priority', 'deadline', 'deadline_time', 'status', 'owner', 'related_project_id', 'related_lead_id'];
            $updates = [];
            $params = [];

            foreach ($allowedFields as $f) {
                if (array_key_exists($f, $args)) {
                    $updates[] = "`$f` = ?";
                    $params[] = $args[$f];
                }
            }

            if (empty($updates)) {
                return ['success' => true, 'message' => 'No fields updated'];
            }

            $params[] = $id;
            $stmt = $pdo->prepare("UPDATE tasks SET " . implode(', ', $updates) . " WHERE id = ?");
            $stmt->execute($params);

            mcp_audit($pdo, $user, 'task_update', "Updated task $id");

            return ['success' => true, 'id' => $id, 'updated_fields' => array_keys($args)];

        case 'complete_task':
            $id = $args['id'];
            $now = date('Y-m-d H:i');
            $stmt = $pdo->prepare("UPDATE tasks SET status = 'done', completed_by = ?, completed_at = ? WHERE id = ?");
            $stmt->execute([$user['name'], $now, $id]);

            mcp_audit($pdo, $user, 'task_complete', "Marked task $id as done");

            return ['success' => true, 'id' => $id, 'status' => 'done', 'completed_by' => $user['name']];

        case 'add_task_comment':
            $taskId = $args['task_id'];
            $comment = trim($args['comment']);

            // Fetch related lead if any
            $tStmt = $pdo->prepare("SELECT title, related_lead_id FROM tasks WHERE id = ?");
            $tStmt->execute([$taskId]);
            $task = $tStmt->fetch(\PDO::FETCH_ASSOC);

            if ($task && !empty($task['related_lead_id'])) {
                $evId = 'ev_' . bin2hex(random_bytes(8));
                $evStmt = $pdo->prepare(
                    "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                     VALUES (?, ?, 'note', NOW(), ?, ?, ?)"
                );
                $evStmt->execute([$evId, $task['related_lead_id'], "Comment on task: " . $task['title'], $comment, $user['name']]);
            }

            mcp_audit($pdo, $user, 'task_comment', "Commented on task $taskId");

            return ['success' => true, 'task_id' => $taskId, 'comment' => $comment];

        // --- 4. Projects & Gantt Roadmaps ---
        case 'list_projects':
            $where = ["1=1"];
            $params = [];

            if (!empty($args['status'])) {
                $where[] = "status = ?";
                $params[] = $args['status'];
            }
            if (!empty($args['client_id'])) {
                $where[] = "(client_id = ? OR lead_id = ?)";
                $params[] = $args['client_id'];
                $params[] = $args['client_id'];
            }
            if (!empty($args['search'])) {
                $where[] = "name LIKE ?";
                $params[] = '%' . $args['search'] . '%';
            }
            if (empty($args['include_archived'])) {
                $where[] = "(p.archived = 0 OR p.archived IS NULL)";
            }

            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);

            $sql = "SELECT p.id, p.name, p.status, p.budget, p.deadline, p.start_date, p.lead_id, p.client_id, l.name as client_name, p.archived, p.created_at
                    FROM projects p
                    LEFT JOIN leads l ON (p.client_id = l.id OR p.lead_id = l.id)
                    WHERE " . implode(' AND ', $where) . "
                    ORDER BY p.created_at DESC
                    LIMIT $limit";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'get_project':
            $stmt = $pdo->prepare("SELECT * FROM projects WHERE id = ?");
            $stmt->execute([$args['id']]);
            $proj = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$proj) {
                throw new \Exception("Project not found with ID: " . $args['id']);
            }

            // Linked tasks
            $tStmt = $pdo->prepare("SELECT id, title, priority, deadline, status, owner FROM tasks WHERE related_project_id = ? ORDER BY deadline ASC");
            $tStmt->execute([$args['id']]);
            $proj['tasks'] = $tStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $proj;

        case 'create_project':
            $id = 'proj_' . bin2hex(random_bytes(8));
            $name = trim($args['name']);
            $clientId = $args['client_id'] ?? null;
            $budget = isset($args['budget']) ? (float)$args['budget'] : null;
            $startDate = $args['start_date'] ?? date('Y-m-d');
            $deadline = $args['deadline'] ?? null;
            $status = $args['status'] ?? 'active';

            // Find default project type
            $ptStmt = $pdo->query("SELECT id FROM project_types LIMIT 1");
            $ptId = $ptStmt->fetchColumn() ?: 'pt_standard';

            $stmt = $pdo->prepare(
                "INSERT INTO projects (id, project_type_id, name, lead_id, client_id, budget, start_date, deadline, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())"
            );
            $stmt->execute([$id, $ptId, $name, $clientId, $clientId, $budget, $startDate, $deadline, $status]);

            mcp_audit($pdo, $user, 'project_create', "Created project '$name' (ID: $id)");

            return ['success' => true, 'id' => $id, 'name' => $name, 'status' => $status, 'budget' => $budget];

        case 'update_project':
            $id = $args['id'];
            $allowedFields = ['name', 'status', 'budget', 'start_date', 'deadline', 'archived'];
            $updates = [];
            $params = [];

            foreach ($allowedFields as $f) {
                if (array_key_exists($f, $args)) {
                    $updates[] = "`$f` = ?";
                    $params[] = $f === 'archived' ? (!empty($args[$f]) ? 1 : 0) : $args[$f];
                }
            }

            if (empty($updates)) {
                return ['success' => true, 'message' => 'No fields updated'];
            }

            $params[] = $id;
            $stmt = $pdo->prepare("UPDATE projects SET " . implode(', ', $updates) . " WHERE id = ?");
            $stmt->execute($params);

            mcp_audit($pdo, $user, 'project_update', "Updated project $id");

            return ['success' => true, 'id' => $id, 'updated_fields' => array_keys($args)];

        case 'create_milestone':
            $projId = $args['project_id'];
            $title = trim($args['title']);
            $deadline = $args['deadline'];
            $priority = $args['priority'] ?? 'high';

            $id = 'tsk_' . bin2hex(random_bytes(8));
            $stmt = $pdo->prepare(
                "INSERT INTO tasks (id, title, description, priority, deadline, status, owner, created_by, related_project_id, is_locking)
                 VALUES (?, ?, 'Project Milestone', ?, ?, 'todo', ?, ?, ?, 1)"
            );
            $stmt->execute([$id, $title, $priority, $deadline, $user['name'], $user['name'], $projId]);

            mcp_audit($pdo, $user, 'milestone_create', "Created milestone '$title' for project $projId");

            return ['success' => true, 'id' => $id, 'project_id' => $projId, 'title' => $title, 'deadline' => $deadline];

        // --- 5. Financials & Invoicing ---
        case 'get_financial_summary':
            $year = isset($args['year']) ? (int)$args['year'] : (int)date('Y');
            
            // Income
            $incStmt = $pdo->prepare(
                "SELECT 
                    SUM(CASE WHEN status = 'paid' THEN amount_real ELSE 0 END) as paid_income,
                    SUM(amount_planned) as planned_income
                 FROM financial_records 
                 WHERE type = 'income' AND YEAR(issue_date) = ?"
            );
            $incStmt->execute([$year]);
            $inc = $incStmt->fetch(\PDO::FETCH_ASSOC);

            // Expenses
            $expStmt = $pdo->prepare(
                "SELECT 
                    SUM(CASE WHEN status = 'paid' THEN amount_real ELSE 0 END) as paid_expense,
                    SUM(amount_planned) as planned_expense
                 FROM financial_records 
                 WHERE type = 'expense' AND YEAR(issue_date) = ?"
            );
            $expStmt->execute([$year]);
            $exp = $expStmt->fetch(\PDO::FETCH_ASSOC);

            // Invoices count
            $invStmt = $pdo->prepare("SELECT COUNT(*) FROM invoices_offers WHERE type = 'invoice' AND status NOT IN ('paid', 'cancelled')");
            $invStmt->execute();
            $unpaidCount = (int)$invStmt->fetchColumn();

            $paidRevenue = (float)($inc['paid_income'] ?? 0);
            $paidCost = (float)($exp['paid_expense'] ?? 0);
            $netProfit = $paidRevenue - $paidCost;

            return [
                'year' => $year,
                'currency' => 'EUR',
                'paid_revenue' => $paidRevenue,
                'planned_revenue' => (float)($inc['planned_income'] ?? 0),
                'paid_expenses' => $paidCost,
                'planned_expenses' => (float)($exp['planned_expense'] ?? 0),
                'net_profit' => $netProfit,
                'unpaid_invoices_count' => $unpaidCount
            ];

        case 'list_invoices':
            $where = ["1=1"];
            $params = [];

            if (!empty($args['type'])) {
                $where[] = "type = ?";
                $params[] = $args['type'];
            }
            if (!empty($args['status'])) {
                $where[] = "status = ?";
                $params[] = $args['status'];
            }
            if (!empty($args['client_id'])) {
                $where[] = "(client_id = ? OR lead_id = ?)";
                $params[] = $args['client_id'];
                $params[] = $args['client_id'];
            }
            if (!empty($args['search'])) {
                $term = '%' . $args['search'] . '%';
                $where[] = "(document_number LIKE ? OR client_name LIKE ? OR title LIKE ?)";
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
            }

            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);

            $sql = "SELECT id, document_number, type, client_id, lead_id, client_name, title, subtotal, vat_amount, total_price, currency, status, issued_at, due_date, created_by 
                    FROM invoices_offers 
                    WHERE " . implode(' AND ', $where) . " 
                    ORDER BY issued_at DESC 
                    LIMIT $limit";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'get_invoice':
            $stmt = $pdo->prepare("SELECT * FROM invoices_offers WHERE id = ?");
            $stmt->execute([$args['id']]);
            $inv = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$inv) {
                throw new \Exception("Invoice not found with ID: " . $args['id']);
            }

            $itStmt = $pdo->prepare("SELECT * FROM invoice_offer_items WHERE invoice_offer_id = ?");
            $itStmt->execute([$args['id']]);
            $inv['items'] = $itStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $inv;

        case 'create_invoice':
            $clientId = $args['client_id'];
            $title = trim($args['title']);
            $issuedAt = $args['issued_at'] ?? date('Y-m-d');
            $dueDate = $args['due_date'] ?? date('Y-m-d', strtotime('+14 days'));
            $currency = $args['currency'] ?? 'EUR';
            $items = $args['items'] ?? [];

            if (empty($items)) {
                throw new \Exception("Invoice must contain at least one line item");
            }

            // Client lookup
            $clStmt = $pdo->prepare("SELECT name, email, phone, street, city, postal_code, country, company_id, tax_id, vat_id FROM leads WHERE id = ?");
            $clStmt->execute([$clientId]);
            $client = $clStmt->fetch(\PDO::FETCH_ASSOC);

            $clientName = $client['name'] ?? 'Client ' . $clientId;
            $docNum = $args['document_number'] ?? (date('Y') . str_pad((string)rand(100, 9999), 4, '0', STR_PAD_LEFT));
            $invId = 'inv_' . bin2hex(random_bytes(8));

            $subtotal = 0.0;
            $vatTotal = 0.0;

            foreach ($items as $item) {
                $qty = (float)($item['quantity'] ?? 1);
                $price = (float)($item['unit_price'] ?? 0);
                $vatRate = (float)($item['vat_rate'] ?? 20);
                $lineSubtotal = $qty * $price;
                $lineVat = $lineSubtotal * ($vatRate / 100);
                $subtotal += $lineSubtotal;
                $vatTotal += $lineVat;
            }

            $total = $subtotal + $vatTotal;

            $stmt = $pdo->prepare(
                "INSERT INTO invoices_offers (id, document_number, type, lead_id, client_id, client_name, client_email, client_phone, client_street, client_city, client_postal_code, client_country, client_ico, client_dic, client_icdph, title, subject, subtotal, vat_amount, total_price, currency, status, issued_at, due_date, created_by)
                 VALUES (?, ?, 'invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)"
            );
            $stmt->execute([
                $invId, $docNum, $clientId, $clientId, $clientName,
                $client['email'] ?? null, $client['phone'] ?? null, $client['street'] ?? null, $client['city'] ?? null,
                $client['postal_code'] ?? null, $client['country'] ?? 'Slovakia', $client['company_id'] ?? null,
                $client['tax_id'] ?? null, $client['vat_id'] ?? null, $title, $title,
                $subtotal, $vatTotal, $total, $currency, $issuedAt, $dueDate, $user['name']
            ]);

            // Insert line items
            $itemStmt = $pdo->prepare(
                "INSERT INTO invoice_offer_items (id, invoice_offer_id, title, quantity, unit, unit_price, vat_rate, total_price)
                 VALUES (?, ?, ?, ?, 'ks', ?, ?, ?)"
            );
            foreach ($items as $item) {
                $itemId = 'it_' . bin2hex(random_bytes(8));
                $qty = (float)($item['quantity'] ?? 1);
                $price = (float)($item['unit_price'] ?? 0);
                $vatRate = (float)($item['vat_rate'] ?? 20);
                $lineTotal = ($qty * $price) * (1 + $vatRate / 100);
                $itemStmt->execute([$itemId, $invId, $item['title'], $qty, $price, $vatRate, $lineTotal]);
            }

            // Sync to financial_records
            $finId = 'fin_' . bin2hex(random_bytes(8));
            $finStmt = $pdo->prepare(
                "INSERT INTO financial_records (id, type, subtype, title, amount_planned, amount_real, currency, status, issue_date, due_date, client_id, invoice_number, created_by)
                 VALUES (?, 'income', 'invoice', ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)"
            );
            $finStmt->execute([$finId, $title, $total, $total, $currency, $issuedAt, $dueDate, $clientId, $docNum, $user['name']]);

            mcp_audit($pdo, $user, 'invoice_create', "Issued draft invoice $docNum for €$total to $clientName");

            return [
                'success' => true,
                'id' => $invId,
                'document_number' => $docNum,
                'client_name' => $clientName,
                'subtotal' => $subtotal,
                'vat_amount' => $vatTotal,
                'total_price' => $total,
                'currency' => $currency
            ];

        case 'update_invoice_status':
            $id = $args['id'];
            $status = $args['status'];
            $paidDate = $args['paid_date'] ?? date('Y-m-d');

            $stmt = $pdo->prepare("UPDATE invoices_offers SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);

            // Sync with financial_records
            $invStmt = $pdo->prepare("SELECT document_number FROM invoices_offers WHERE id = ?");
            $invStmt->execute([$id]);
            $docNum = $invStmt->fetchColumn();

            if ($docNum) {
                if ($status === 'paid' || $status === 'approved') {
                    $upStmt = $pdo->prepare("UPDATE financial_records SET status = 'paid', paid_date = ? WHERE invoice_number = ?");
                    $upStmt->execute([$paidDate, $docNum]);
                } elseif ($status === 'cancelled') {
                    $upStmt = $pdo->prepare("UPDATE financial_records SET status = 'cancelled' WHERE invoice_number = ?");
                    $upStmt->execute([$docNum]);
                }
            }

            mcp_audit($pdo, $user, 'invoice_status_update', "Updated invoice $id ($docNum) to '$status'");

            return ['success' => true, 'id' => $id, 'status' => $status];

        case 'list_expenses':
            $where = ["type = 'expense'"];
            $params = [];

            if (!empty($args['category_id'])) {
                $where[] = "category_id = ?";
                $params[] = $args['category_id'];
            }
            if (!empty($args['start_date'])) {
                $where[] = "issue_date >= ?";
                $params[] = $args['start_date'];
            }
            if (!empty($args['end_date'])) {
                $where[] = "issue_date <= ?";
                $params[] = $args['end_date'];
            }
            if (!empty($args['search'])) {
                $where[] = "(title LIKE ? OR description LIKE ?)";
                $params[] = '%' . $args['search'] . '%';
                $params[] = '%' . $args['search'] . '%';
            }

            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);

            $sql = "SELECT id, title, description, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, paid_date, project_id, client_id, created_by 
                    FROM financial_records 
                    WHERE " . implode(' AND ', $where) . " 
                    ORDER BY issue_date DESC 
                    LIMIT $limit";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'record_expense':
            $id = 'fin_' . bin2hex(random_bytes(8));
            $title = trim($args['title']);
            $amount = (float)$args['amount'];
            $currency = $args['currency'] ?? 'EUR';
            $catId = $args['category_id'] ?? null;
            $issueDate = $args['issue_date'];
            $dueDate = $args['due_date'] ?? $issueDate;
            $status = in_array($args['status'] ?? '', ['planned', 'pending', 'paid']) ? $args['status'] : 'paid';
            $projId = $args['project_id'] ?? null;
            $clientId = $args['client_id'] ?? null;
            $paidDate = ($status === 'paid') ? $issueDate : null;

            $stmt = $pdo->prepare(
                "INSERT INTO financial_records (id, type, subtype, title, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, paid_date, project_id, client_id, created_by)
                 VALUES (?, 'expense', 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([$id, $title, $catId, $amount, $amount, $currency, $status, $issueDate, $dueDate, $paidDate, $projId, $clientId, $user['name']]);

            mcp_audit($pdo, $user, 'expense_record', "Recorded expense '{$title}' for €{$amount}");

            return ['success' => true, 'id' => $id, 'title' => $title, 'amount' => $amount, 'status' => $status];

        // --- 6. Warehouse & Inventory ---
        case 'list_inventory_items':
            $where = ["1=1"];
            $params = [];

            if (!empty($args['category'])) {
                $where[] = "i.category = ?";
                $params[] = $args['category'];
            }
            if (!empty($args['search'])) {
                $term = '%' . $args['search'] . '%';
                $where[] = "(i.name LIKE ? OR i.sku LIKE ? OR i.barcode LIKE ?)";
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
            }

            $having = "";
            if (!empty($args['low_stock_only'])) {
                $having = "HAVING current_stock <= i.min_stock";
            }

            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);

            $sql = "SELECT i.id, i.sku, i.barcode, i.name, i.category, i.unit, i.min_stock, i.default_sell_price, i.avg_purchase_price,
                           COALESCE(SUM(s.quantity), 0) as current_stock
                    FROM warehouse_items i
                    LEFT JOIN warehouse_stock s ON i.id = s.item_id
                    WHERE " . implode(' AND ', $where) . "
                    GROUP BY i.id
                    $having
                    ORDER BY i.name ASC
                    LIMIT $limit";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'get_inventory_item':
            $stmt = $pdo->prepare("SELECT * FROM warehouse_items WHERE id = ?");
            $stmt->execute([$args['id']]);
            $item = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$item) {
                throw new \Exception("Warehouse item not found with ID: " . $args['id']);
            }

            $stkStmt = $pdo->prepare(
                "SELECT s.warehouse_id, w.name as warehouse_name, s.quantity, s.reserved_quantity, s.location
                 FROM warehouse_stock s
                 JOIN warehouses w ON s.warehouse_id = w.id
                 WHERE s.item_id = ?"
            );
            $stkStmt->execute([$args['id']]);
            $item['stock_breakdown'] = $stkStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $item;

        case 'create_inventory_item':
            $id = 'whi_' . bin2hex(random_bytes(8));
            $sku = trim($args['sku']);
            $name = trim($args['name']);
            $desc = $args['description'] ?? null;
            $cat = $args['category'] ?? null;
            $unit = $args['unit'] ?? 'ks';
            $minStock = (float)($args['min_stock'] ?? 0);
            $sellPrice = (float)($args['default_sell_price'] ?? 0);

            $stmt = $pdo->prepare(
                "INSERT INTO warehouse_items (id, sku, name, description, category, unit, min_stock, default_sell_price)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([$id, $sku, $name, $desc, $cat, $unit, $minStock, $sellPrice]);

            // Link to default warehouse
            $whStmt = $pdo->query("SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1");
            $defWhId = $whStmt->fetchColumn() ?: 'wh_main';
            if ($defWhId) {
                $initStock = $pdo->prepare("INSERT IGNORE INTO warehouse_stock (warehouse_id, item_id, quantity) VALUES (?, ?, 0)");
                $initStock->execute([$defWhId, $id]);
            }

            mcp_audit($pdo, $user, 'inventory_item_create', "Created stock item '$name' (SKU: $sku)");

            return ['success' => true, 'id' => $id, 'sku' => $sku, 'name' => $name];

        case 'adjust_stock':
            $itemId = $args['item_id'];
            $change = (float)$args['quantity_change'];
            $reason = $args['reason'];
            $notes = $args['notes'] ?? '';

            // Find warehouse
            $whId = $args['warehouse_id'] ?? null;
            if (!$whId) {
                $whStmt = $pdo->query("SELECT id FROM warehouses WHERE is_default = 1 LIMIT 1");
                $whId = $whStmt->fetchColumn();
                if (!$whId) {
                    $whStmt2 = $pdo->query("SELECT id FROM warehouses LIMIT 1");
                    $whId = $whStmt2->fetchColumn();
                }
            }

            if (!$whId) {
                throw new \Exception("No warehouse found to record stock adjustment");
            }

            // Update stock
            $upStmt = $pdo->prepare(
                "INSERT INTO warehouse_stock (warehouse_id, item_id, quantity)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = quantity + ?"
            );
            $upStmt->execute([$whId, $itemId, $change, $change]);

            // Movement document
            $movId = 'mov_' . bin2hex(random_bytes(8));
            $docNum = 'MOV-' . date('Ymd-His');
            $movType = ($change >= 0) ? 'inward' : 'outward';

            $movStmt = $pdo->prepare(
                "INSERT INTO warehouse_movements (id, document_number, type, status, warehouse_id, created_by, note, issued_at)
                 VALUES (?, ?, ?, 'confirmed', ?, ?, ?, NOW())"
            );
            $movStmt->execute([$movId, $docNum, $movType, $whId, $user['name'], "Reason: $reason. $notes"]);

            // Movement item
            $mviId = 'mvi_' . bin2hex(random_bytes(8));
            $mviStmt = $pdo->prepare(
                "INSERT INTO warehouse_movement_items (id, movement_id, item_id, quantity, note)
                 VALUES (?, ?, ?, ?, ?)"
            );
            $mviStmt->execute([$mviId, $movId, $itemId, abs($change), $reason]);

            mcp_audit($pdo, $user, 'stock_adjust', "Adjusted stock for item $itemId by $change ($reason)");

            return [
                'success' => true,
                'item_id' => $itemId,
                'warehouse_id' => $whId,
                'quantity_change' => $change,
                'document_number' => $docNum
            ];

        // --- 7. Meetings & Scheduling ---
        case 'list_meetings':
            $where = ["archived = 0"];
            $params = [];

            if (!empty($args['upcoming_only'])) {
                $where[] = "date >= CURDATE()";
            }
            if (!empty($args['start_date'])) {
                $where[] = "date >= ?";
                $params[] = $args['start_date'];
            }
            if (!empty($args['search'])) {
                $where[] = "(title LIKE ? OR notes LIKE ?)";
                $params[] = '%' . $args['search'] . '%';
                $params[] = '%' . $args['search'] . '%';
            }

            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);

            $sql = "SELECT id, title, date, duration, lead_id, lead_name, notes, created_at 
                    FROM meeting_notes 
                    WHERE " . implode(' AND ', $where) . " 
                    ORDER BY date DESC 
                    LIMIT $limit";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'schedule_meeting':
            $id = 'mtg_' . bin2hex(random_bytes(8));
            $title = trim($args['title']);
            $date = $args['date'];
            $duration = (int)($args['duration'] ?? 30);
            $leadId = $args['lead_id'] ?? null;
            $notes = $args['notes'] ?? null;
            $attendeesJson = isset($args['attendees']) ? json_encode($args['attendees']) : null;

            $leadName = null;
            if ($leadId) {
                $lStmt = $pdo->prepare("SELECT name FROM leads WHERE id = ?");
                $lStmt->execute([$leadId]);
                $leadName = $lStmt->fetchColumn() ?: null;
            }

            $stmt = $pdo->prepare(
                "INSERT INTO meeting_notes (id, title, date, duration, lead_id, lead_name, notes, attached_users_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([$id, $title, $date, $duration, $leadId, $leadName, $notes, $attendeesJson]);

            mcp_audit($pdo, $user, 'meeting_schedule', "Scheduled meeting '$title' on $date");

            return ['success' => true, 'id' => $id, 'title' => $title, 'date' => $date, 'duration' => $duration];

        case 'update_meeting':
            $id = $args['id'];
            $allowedFields = ['title', 'date', 'duration', 'notes'];
            $updates = [];
            $params = [];

            foreach ($allowedFields as $f) {
                if (array_key_exists($f, $args)) {
                    $updates[] = "`$f` = ?";
                    $params[] = $args[$f];
                }
            }

            if (empty($updates)) {
                return ['success' => true, 'message' => 'No fields updated'];
            }

            $params[] = $id;
            $stmt = $pdo->prepare("UPDATE meeting_notes SET " . implode(', ', $updates) . " WHERE id = ?");
            $stmt->execute($params);

            mcp_audit($pdo, $user, 'meeting_update', "Updated meeting $id");

            return ['success' => true, 'id' => $id, 'updated_fields' => array_keys($args)];

        // --- 8. Communications & Notes ---
        case 'list_communications':
            $leadId = $args['lead_id'];
            $where = ["lead_id = ?"];
            $params = [$leadId];

            if (!empty($args['type'])) {
                $where[] = "type = ?";
                $params[] = $args['type'];
            }

            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);

            $stmt = $pdo->prepare(
                "SELECT id, lead_id, type, timestamp, title, content, amount, is_outgoing, author 
                 FROM timeline_events 
                 WHERE " . implode(' AND ', $where) . " 
                 ORDER BY timestamp DESC 
                 LIMIT $limit"
            );
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'log_communication':
            $id = 'ev_' . bin2hex(random_bytes(8));
            $leadId = $args['lead_id'];
            $type = in_array($args['type'] ?? '', ['phone', 'email', 'note', 'appointment']) ? $args['type'] : 'note';
            $title = trim($args['title']);
            $content = $args['content'] ?? null;
            $isOutgoing = !empty($args['is_outgoing']) ? 1 : 0;

            $stmt = $pdo->prepare(
                "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author, is_outgoing)
                 VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)"
            );
            $stmt->execute([$id, $leadId, $type, $title, $content, $user['name'], $isOutgoing]);

            mcp_audit($pdo, $user, 'communication_log', "Logged $type for lead $leadId: '$title'");

            return ['success' => true, 'id' => $id, 'lead_id' => $leadId, 'title' => $title, 'type' => $type];

        // --- 9. Cross-Entity Global Search ---
        case 'search_entities':
            $term = '%' . trim($args['query']) . '%';
            $filterTypes = is_array($args['entity_types'] ?? null) ? $args['entity_types'] : ['leads', 'clients', 'tasks', 'projects', 'invoices', 'warehouse'];

            $results = [];

            if (in_array('leads', $filterTypes) || in_array('clients', $filterTypes)) {
                $stmt = $pdo->prepare(
                    "SELECT id, name, email, phone, city, status, client_type, value 
                     FROM leads 
                     WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ? OR company_id LIKE ?) AND archived = 0 
                     LIMIT 10"
                );
                $stmt->execute([$term, $term, $term, $term]);
                $results['leads_and_clients'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            if (in_array('tasks', $filterTypes)) {
                $stmt = $pdo->prepare(
                    "SELECT id, title, priority, deadline, status, owner, related_project_id 
                     FROM tasks 
                     WHERE (title LIKE ? OR description LIKE ?) AND archived = 0 
                     LIMIT 10"
                );
                $stmt->execute([$term, $term]);
                $results['tasks'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            if (in_array('projects', $filterTypes)) {
                $stmt = $pdo->prepare(
                    "SELECT id, name, status, budget, deadline 
                     FROM projects 
                     WHERE name LIKE ? 
                     LIMIT 10"
                );
                $stmt->execute([$term]);
                $results['projects'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            if (in_array('invoices', $filterTypes)) {
                $stmt = $pdo->prepare(
                    "SELECT id, document_number, client_name, title, total_price, currency, status 
                     FROM invoices_offers 
                     WHERE document_number LIKE ? OR client_name LIKE ? OR title LIKE ? 
                     LIMIT 10"
                );
                $stmt->execute([$term, $term, $term]);
                $results['invoices'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            if (in_array('warehouse', $filterTypes)) {
                $stmt = $pdo->prepare(
                    "SELECT id, sku, name, category, default_sell_price 
                     FROM warehouse_items 
                     WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ? 
                     LIMIT 10"
                );
                $stmt->execute([$term, $term, $term]);
                $results['warehouse_items'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            return $results;

        // --- 10. Team Directory (Read-Only) ---
        case 'list_team_members':
            $where = ["1=1"];
            $params = [];

            if (!empty($args['role'])) {
                $where[] = "role = ?";
                $params[] = $args['role'];
            }
            if (!empty($args['search'])) {
                $where[] = "(name LIKE ? OR email LIKE ?)";
                $params[] = '%' . $args['search'] . '%';
                $params[] = '%' . $args['search'] . '%';
            }

            // CRITICAL: NEVER select password_hash or session secrets!
            $sql = "SELECT id, name, email, role, avatar, color, created_at 
                    FROM users 
                    WHERE " . implode(' AND ', $where) . " 
                    ORDER BY name ASC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        // --- 11. Employees, Salaries & Vacations ---
        case 'list_employees':
            $where = ["1=1"];
            $params = [];
            if (!empty($args['search'])) {
                $where[] = "(name LIKE ? OR email LIKE ? OR pin LIKE ? OR phone LIKE ?)";
                $s = '%' . trim($args['search']) . '%';
                $params = array_merge($params, [$s, $s, $s, $s]);
            }
            if (!isset($args['active_only']) || !empty($args['active_only'])) {
                $where[] = "is_active = 1";
            }
            $stmt = $pdo->prepare("SELECT id, name, pin, email, phone, address_street, address_city, address_zip, address_country, salary_type, salary_amount, salary_due_day, vacation_allowances_json, time_tracking_user_name, auto_expense, is_active FROM employees WHERE " . implode(' AND ', $where) . " ORDER BY name ASC");
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'get_employee':
            $stmt = $pdo->prepare("SELECT * FROM employees WHERE id = ? LIMIT 1");
            $stmt->execute([$args['id']]);
            $emp = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$emp) throw new \Exception("Employee not found with ID: " . $args['id']);
            
            // Fetch recent salaries
            $salStmt = $pdo->prepare("SELECT * FROM employee_salaries WHERE employee_id = ? ORDER BY year DESC, period_number DESC LIMIT 12");
            $salStmt->execute([$args['id']]);
            $emp['salaries'] = $salStmt->fetchAll(\PDO::FETCH_ASSOC);

            // Fetch vacations
            $vacStmt = $pdo->prepare("SELECT * FROM employee_vacations WHERE employee_id = ? ORDER BY start_date DESC LIMIT 20");
            $vacStmt->execute([$args['id']]);
            $emp['vacations'] = $vacStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $emp;

        case 'create_employee':
            $id = 'emp-' . bin2hex(random_bytes(6));
            $name = trim($args['name']);
            if (empty($name)) throw new \Exception("Employee name is required");

            $ins = $pdo->prepare("INSERT INTO employees (
                id, name, pin, email, phone, address_street, address_city, address_zip, address_country,
                salary_type, salary_amount, salary_due_day, auto_expense, expense_category_id, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
            $ins->execute([
                $id,
                $name,
                $args['pin'] ?? null,
                $args['email'] ?? null,
                $args['phone'] ?? null,
                $args['address_street'] ?? null,
                $args['address_city'] ?? null,
                $args['address_zip'] ?? null,
                $args['address_country'] ?? 'Slovakia',
                $args['salary_type'] ?? 'monthly',
                (float)($args['salary_amount'] ?? 0),
                isset($args['salary_due_day']) ? (int)$args['salary_due_day'] : null,
                !empty($args['auto_expense']) ? 1 : 0,
                $args['expense_category_id'] ?? null
            ]);

            mcp_audit($pdo, $user, 'create_employee', "Created employee {$name} ({$id})");
            return ['id' => $id, 'name' => $name, 'message' => "Employee created successfully."];

        case 'update_employee':
            $id = $args['id'];
            $fields = [];
            $params = [];
            foreach (['name', 'pin', 'email', 'phone', 'address_street', 'address_city', 'address_zip', 'salary_type'] as $f) {
                if (isset($args[$f])) {
                    $fields[] = "`$f` = ?";
                    $params[] = $args[$f];
                }
            }
            if (isset($args['salary_amount'])) {
                $fields[] = "`salary_amount` = ?";
                $params[] = (float)$args['salary_amount'];
            }
            if (isset($args['salary_due_day'])) {
                $fields[] = "`salary_due_day` = ?";
                $params[] = (int)$args['salary_due_day'];
            }
            if (isset($args['auto_expense'])) {
                $fields[] = "`auto_expense` = ?";
                $params[] = !empty($args['auto_expense']) ? 1 : 0;
            }
            if (isset($args['is_active'])) {
                $fields[] = "`is_active` = ?";
                $params[] = !empty($args['is_active']) ? 1 : 0;
            }

            if (empty($fields)) throw new \Exception("No fields provided to update.");
            $params[] = $id;

            $sql = "UPDATE employees SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            mcp_audit($pdo, $user, 'update_employee', "Updated employee {$id}");
            return ['id' => $id, 'success' => true, 'message' => "Employee updated successfully."];

        case 'list_salaries':
            $where = ["1=1"];
            $params = [];
            if (!empty($args['employee_id'])) {
                $where[] = "es.employee_id = ?";
                $params[] = $args['employee_id'];
            }
            if (!empty($args['year'])) {
                $where[] = "es.year = ?";
                $params[] = (int)$args['year'];
            }
            if (!empty($args['period_key'])) {
                $where[] = "es.period_key = ?";
                $params[] = $args['period_key'];
            }

            $stmt = $pdo->prepare("
                SELECT es.*, e.name as employee_name
                FROM employee_salaries es
                JOIN employees e ON es.employee_id = e.id
                WHERE " . implode(' AND ', $where) . "
                ORDER BY es.year DESC, es.period_number DESC
            ");
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'record_salary_payout':
            $empId = $args['employee_id'];
            $periodKey = $args['period_key'];
            $totalSalary = (float)$args['total_salary'];
            $totalPaid = (float)($args['total_paid'] ?? 0);
            $id = $args['id'] ?? ('sal-' . $empId . '-' . $periodKey);

            $parts = explode('-', $periodKey);
            $year = !empty($args['year']) ? (int)$args['year'] : (int)($parts[0] ?? date('Y'));
            $periodNum = !empty($args['period_number']) ? (int)$args['period_number'] : (int)(preg_replace('/\D/', '', $parts[1] ?? '1'));

            $status = ($totalPaid >= $totalSalary && $totalSalary > 0) ? 'paid' : ($totalPaid > 0 ? 'partially_paid' : 'pending');

            $ins = $pdo->prepare("INSERT INTO employee_salaries (
                id, employee_id, period_type, period_key, year, period_number,
                items_json, total_salary, total_paid, status, due_date, payment_date, payment_method, note
            ) VALUES (?, ?, 'monthly', ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                total_salary = VALUES(total_salary),
                total_paid = VALUES(total_paid),
                status = VALUES(status),
                due_date = VALUES(due_date),
                payment_date = VALUES(payment_date),
                payment_method = VALUES(payment_method),
                note = VALUES(note)");

            $ins->execute([
                $id,
                $empId,
                $periodKey,
                $year,
                $periodNum,
                $totalSalary,
                $totalPaid,
                $status,
                $args['due_date'] ?? null,
                $args['payment_date'] ?? null,
                $args['payment_method'] ?? 'bank_transfer',
                $args['note'] ?? null
            ]);

            mcp_audit($pdo, $user, 'record_salary_payout', "Recorded salary payout {$id} for employee {$empId} ({$periodKey})");
            return ['id' => $id, 'status' => $status, 'total_salary' => $totalSalary, 'total_paid' => $totalPaid, 'success' => true];

        case 'list_vacations':
            $where = ["1=1"];
            $params = [];
            if (!empty($args['employee_id'])) {
                $where[] = "ev.employee_id = ?";
                $params[] = $args['employee_id'];
            }
            if (!empty($args['status'])) {
                $where[] = "ev.status = ?";
                $params[] = $args['status'];
            }
            if (!empty($args['year'])) {
                $where[] = "YEAR(ev.start_date) = ?";
                $params[] = (int)$args['year'];
            }

            $stmt = $pdo->prepare("
                SELECT ev.*, e.name as employee_name
                FROM employee_vacations ev
                JOIN employees e ON ev.employee_id = e.id
                WHERE " . implode(' AND ', $where) . "
                ORDER BY ev.start_date DESC
            ");
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'record_vacation':
            $id = 'vac-' . bin2hex(random_bytes(6));
            $empId = $args['employee_id'];
            $vacTypeId = $args['vacation_type_id'] ?? 'annual';
            $startDate = $args['start_date'];
            $endDate = $args['end_date'];
            $daysCount = (float)($args['days_count'] ?? 1.0);
            $status = $args['status'] ?? 'approved';

            $ins = $pdo->prepare("INSERT INTO employee_vacations (
                id, employee_id, vacation_type_id, start_date, end_date, days_count, status, note, approved_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $ins->execute([
                $id,
                $empId,
                $vacTypeId,
                $startDate,
                $endDate,
                $daysCount,
                $status,
                $args['note'] ?? null,
                $user['name'] ?? $user['email']
            ]);

            mcp_audit($pdo, $user, 'record_vacation', "Logged vacation {$id} for employee {$empId} ({$startDate} - {$endDate})");
            return ['id' => $id, 'success' => true, 'status' => $status, 'days_count' => $daysCount];

        default:
            throw new \Exception("Unrecognized tool name: " . htmlspecialchars($tool));
    }
}
