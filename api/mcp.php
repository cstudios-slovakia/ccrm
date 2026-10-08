<?php
/**
 * CCRM Model Context Protocol (MCP) Server Gateway.
 *
 * Implements JSON-RPC 2.0 protocol for MCP clients (Antigravity, Claude Desktop, Cursor).
 * Supports both HTTP POST JSON-RPC execution and HTTP GET SSE streaming.
 * Security: every tool call is checked against the key owner's role permissions
 * (see mcp_tool_permissions). No tool deletes rows. System settings are limited to the two
 * finance-mode keys (FINANCIAL_MODE, FINANCIAL_SIMPLIFIED_TABLE); nothing else is reachable.
 */

// 1. Headers & CORS
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
require_once __DIR__ . '/mcp_ext.php';
require_once __DIR__ . '/mcp_ext_ops.php';
require_once __DIR__ . '/mcp_ext_writes.php';

try {
    $pdo = function_exists('get_db_connection') ? get_db_connection() : ccrm_auth_pdo();
    if (!$pdo) {
        throw new \Exception("Database connection not established");
    }
} catch (\Throwable $e) {
    error_log('[mcp] database connection failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'jsonrpc' => '2.0',
        'error' => ['code' => -32603, 'message' => 'Database connection failed'],
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
       AND (u.sessions_valid_from IS NULL OR u.sessions_valid_from <= k.created_at)
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
    'role' => $authRow['role'],
    'key_id' => $authRow['key_id']
];

// 3b. Authorization: resolve the key owner's permissions once, per request.
$GLOBALS['mcp_perms'] = ccrm_user_permissions($pdo, $sessionUser);
$GLOBALS['mcp_is_admin'] = ccrm_is_admin($sessionUser);

/**
 * tool => permission needed to call it.
 *   view  : module keys the owner must be able to view  (ccrm_perm_can)
 *   edit  : module keys the owner must be able to edit  (ccrm_perm_can_edit), side-effect modules included
 *   admin : true when only an Admin may call it
 * A tool missing from this table is denied (fail closed).
 */
function mcp_tool_permissions(): array {
    static $map = null;
    if ($map !== null) return $map;
    $v = fn(string ...$k) => ['view' => $k];
    $e = fn(string ...$k) => ['edit' => $k];
    $map = [
        'list_leads' => $v('leads'), 'get_lead' => $v('leads'),
        'create_lead' => $e('leads'), 'update_lead' => $e('leads'),
        'transition_lead_stage' => $e('leads'), 'convert_lead_to_client' => $e('leads', 'clients'),
        'list_clients' => $v('clients'), 'get_client' => $v('clients'),
        'create_client' => $e('clients'), 'update_client' => $e('clients'),
        'list_contacts' => $v('clients'), 'create_contact' => $e('clients', 'leads'),
        'list_tasks' => $v('tasks'), 'get_task' => $v('tasks'),
        'create_task' => $e('tasks'), 'update_task' => $e('tasks'), 'complete_task' => $e('tasks'),
        'add_task_comment' => $e('tasks', 'leads'),
        'list_projects' => $v('projects'), 'get_project' => $v('projects'),
        'create_project' => $e('projects'), 'update_project' => $e('projects'),
        'create_milestone' => $e('projects', 'tasks'),
        'get_financial_summary' => $v('financial'), 'get_financial_mode' => $v('financial'),
        'get_financial_simplified_table' => $v('financial'),
        // Flips the whole workspace between connected and simplified finance (system_settings).
        'set_financial_mode' => ['edit' => ['financial'], 'admin' => true],
        'set_financial_simplified_cell' => $e('financial'),
        'list_invoices' => $v('invoices'), 'get_invoice' => $v('invoices'),
        'create_invoice' => $e('invoices', 'financial'), 'update_invoice_status' => $e('invoices', 'financial'),
        'list_expenses' => $v('financial'), 'record_expense' => $e('financial'),
        'list_inventory_items' => $v('warehouse'), 'get_inventory_item' => $v('warehouse'),
        'create_inventory_item' => $e('warehouse'), 'adjust_stock' => $e('warehouse'),
        'list_meetings' => $v('meetings'), 'schedule_meeting' => $e('meetings'), 'update_meeting' => $e('meetings'),
        'list_communications' => $v('leads'), 'log_communication' => $e('leads'),
        // Each section is gated per module inside the tool.
        'search_entities' => [],
        // Directory parity with sync.php: any authenticated user.
        'list_team_members' => [],
        'list_employees' => $v('employees'), 'get_employee' => $v('employees'),
        'create_employee' => $e('employees'), 'update_employee' => $e('employees'),
        'list_salaries' => $v('employees', 'employees.salaries'),
        'record_salary_payout' => ['edit' => ['employees'], 'view' => ['employees.salaries']],
        'list_vacations' => $v('employees'), 'record_vacation' => $e('employees'),
    ];
    // Part B tools (mcp_ext.php).
    $map += mcp_ext_fin_permissions();
    $map += mcp_ext_ops_permissions();
    return $map;
}

function mcp_can(string $key): bool { return ccrm_perm_can($GLOBALS['mcp_perms'], $key); }
function mcp_can_edit(string $key): bool { return ccrm_perm_can_edit($GLOBALS['mcp_perms'], $key); }

function mcp_tool_allowed(string $tool): bool {
    $map = mcp_tool_permissions();
    if (!array_key_exists($tool, $map)) return false;
    $need = $map[$tool];
    if (!empty($need['admin']) && empty($GLOBALS['mcp_is_admin'])) return false;
    if (!empty($need['any'])) {
        $seen = false;
        foreach ($need['any'] as $k) { if (mcp_can($k)) { $seen = true; break; } }
        if (!$seen) return false;
    }
    foreach ($need['view'] ?? [] as $k) { if (!mcp_can($k)) return false; }
    foreach ($need['edit'] ?? [] as $k) { if (!mcp_can_edit($k)) return false; }
    return true;
}

// Helper: audit log wrapper
function mcp_audit(\PDO $pdo, array $user, string $action, ?string $detail = null): void {
    $detail = '[via MCP key ' . ($user['key_id'] ?? '?') . '] ' . ($detail ?? '');
    if (function_exists('ccrm_audit_log')) {
        ccrm_audit_log($pdo, ['id' => $user['id'], 'email' => $user['email']], $action, $detail);
    } else {
        $stmt = $pdo->prepare("INSERT INTO audit_log (actor_id, actor_email, action, detail, ip) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$user['id'], $user['email'], $action, $detail, $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1']);
    }
}

/**
 * Safe arithmetic equation evaluator for MCP simplified financial table.
 */
function ccrm_mcp_eval_equation($expr): ?float {
    if ($expr === null || $expr === '') return null;
    $s = trim((string)$expr);
    if (strpos($s, '=') === 0) $s = trim(substr($s, 1));
    $s = preg_replace('/(\d)\s+(\d{3})(?!\d)/', '$1$2', $s);
    $s = str_replace(',', '.', $s);
    // Two numbers separated by a space ("7 7") are an error, as in equationEvaluator.ts, not one number.
    if (preg_match('/[0-9.]\s+[0-9.]/', $s)) return null;
    $s = preg_replace('/\s+/', '', $s);
    if (!preg_match('/^[-+*\/0-9.()]+$/', $s)) return null;

    preg_match_all('/([0-9]+(?:\.[0-9]+)?|[-+*\/()])/i', $s, $matches);
    $tokens = $matches[0] ?? [];
    if (empty($tokens)) return null;

    $pos = 0;
    $parseFactor = function() use (&$tokens, &$pos, &$parseFactor, &$parseExpr): ?float {
        if ($pos >= count($tokens)) return null;
        $tok = $tokens[$pos++];
        if ($tok === '-') {
            $f = $parseFactor();
            return $f !== null ? -$f : null;
        }
        if ($tok === '+') return $parseFactor();
        if ($tok === '(') {
            $val = $parseExpr();
            if ($pos >= count($tokens) || $tokens[$pos++] !== ')') return null;
            return $val;
        }
        if (is_numeric($tok)) return (float)$tok;
        return null;
    };
    $parseTerm = function() use (&$tokens, &$pos, &$parseFactor): ?float {
        $left = $parseFactor();
        if ($left === null) return null;
        while ($pos < count($tokens) && ($tokens[$pos] === '*' || $tokens[$pos] === '/')) {
            $op = $tokens[$pos++];
            $right = $parseFactor();
            if ($right === null) return null;
            if ($op === '*') {
                $left *= $right;
            } else {
                if ($right == 0.0) return null;
                $left /= $right;
            }
        }
        return $left;
    };
    $parseExpr = function() use (&$tokens, &$pos, &$parseTerm): ?float {
        $left = $parseTerm();
        if ($left === null) return null;
        while ($pos < count($tokens) && ($tokens[$pos] === '+' || $tokens[$pos] === '-')) {
            $op = $tokens[$pos++];
            $right = $parseTerm();
            if ($right === null) return null;
            if ($op === '+') $left += $right;
            else $left -= $right;
        }
        return $left;
    };

    $res = $parseExpr();
    if ($pos < count($tokens) || $res === null || !is_finite($res)) return null;
    return round($res, 4);
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
            'tools_count' => count(array_filter(mcp_get_tool_definitions(), fn($t) => mcp_tool_allowed((string)($t['name'] ?? '')))),
            'domains' => [
                'leads', 'clients', 'tasks', 'projects', 'financials', 'invoices',
                'warehouse', 'meetings', 'communications', 'search', 'team',
                'employees', 'automation', 'files'
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
                'tools' => array_values(array_filter(
                    mcp_get_tool_definitions(),
                    fn($t) => mcp_tool_allowed((string)($t['name'] ?? ''))
                ))
            ]
        ]);
        exit;

    case 'tools/call':
        $toolName = (string)($rpcParams['name'] ?? '');
        $toolArgs = is_array($rpcParams['arguments'] ?? null) ? $rpcParams['arguments'] : [];

        if (!mcp_tool_allowed($toolName)) {
            echo json_encode([
                'jsonrpc' => '2.0',
                'id' => $rpcId,
                'error' => ['code' => -32003, 'message' => 'Forbidden: this key may not call ' . $toolName . '.']
            ]);
            exit;
        }

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
            $errRef = bin2hex(random_bytes(4));
            error_log("[mcp] {$toolName} failed (ref {$errRef}): " . $e->getMessage());
            // Validation errors the tools throw themselves are safe to show; database errors are not.
            $safe = $e instanceof \PDOException
                ? 'Database error (ref ' . $errRef . ')'
                : $e->getMessage();
            echo json_encode([
                'jsonrpc' => '2.0',
                'id' => $rpcId,
                'result' => [
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => 'Error executing ' . $toolName . ': ' . $safe
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
// TOOL DEFINITIONS (core tools; the finance, operations and automation tools live in mcp_ext*.php)
// ============================================================================
function mcp_get_tool_definitions(): array {
    return array_merge(mcp_core_tool_definitions(), mcp_ext_fin_tool_definitions(), mcp_ext_ops_tool_definitions());
}

function mcp_core_tool_definitions(): array {
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
            'description' => 'Move a lead to another configured pipeline stage and log the status change. Refused while the lead has open blocking tasks, exactly as in the app.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Lead ID'],
                    'status' => ['type' => 'string', 'description' => 'New stage; must be one of the stages configured in Settings (see get_lead_pipeline_summary)'],
                    'note' => ['type' => 'string', 'description' => 'Optional note explaining the stage change']
                ],
                'required' => ['id', 'status']
            ]
        ],
        [
            'name' => 'convert_lead_to_client',
            'description' => 'Close a lead as won and register the client record the Clients register shows (same name and contact data; value stays on the lead). Optionally creates an initial project. Refused while the lead has open blocking tasks.',
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
            'description' => 'List clients as the Clients register shows them: one profile per client name (records with the same name are combined; total_value = sum of their lead values plus the client value adjustment). Pipeline leads are not clients.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => ['type' => 'string', 'description' => 'Search by client name, email, ICO, phone'],
                    'city' => ['type' => 'string', 'description' => 'Filter by city'],
                    'client_type' => ['type' => 'string', 'description' => 'Filter by client type: business, person, partner'],
                    'sort_by' => ['type' => 'string', 'description' => 'Sort column: name, created_at, value (default name)'],
                    'sort_order' => ['type' => 'string', 'description' => 'Sort direction: asc or desc (default asc)'],
                    'limit' => ['type' => 'integer', 'description' => 'Results limit (default 50)'],
                    'offset' => ['type' => 'integer', 'description' => 'Offset for pagination'],
                    'include_archived' => ['type' => 'boolean', 'description' => 'Include archived clients (default false)']
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
                    'notes' => ['type' => 'string', 'description' => 'Internal client notes'],
                    'client_type' => ['type' => 'string', 'enum' => ['business', 'person', 'partner'], 'description' => 'Default business']
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
                    'status' => ['type' => 'string', 'description' => 'Filter by a configured task status'],
                    'bucket' => ['type' => 'string', 'enum' => ['overdue', 'today', 'tomorrow', 'upcoming', 'done'], 'description' => 'Time bucket as in the task panel (upcoming = later than tomorrow)'],
                    'created_from' => ['type' => 'string', 'description' => 'Created on/after (YYYY-MM-DD)'],
                    'created_to' => ['type' => 'string', 'description' => 'Created on/before (YYYY-MM-DD)'],
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
                    'status' => ['type' => 'string', 'description' => 'A configured task status (default: the first one)'],
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
                    'status' => ['type' => 'string', 'description' => 'A configured task status'],
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
            'description' => 'List and filter delivery projects with contract value, budget, rating, deadline, delay reason and finish date.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => ['type' => 'string', 'description' => 'Filter by a configured project status'],
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
                    'budget' => ['type' => 'number', 'description' => 'Cost budget (not the contract value)'],
                    'value' => ['type' => 'number', 'description' => 'Contract value to be invoiced'],
                    'project_type_id' => ['type' => 'string', 'description' => 'Project type (default: the first one)'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date (YYYY-MM-DD)'],
                    'deadline' => ['type' => 'string', 'description' => 'Deadline date (YYYY-MM-DD)'],
                    'status' => ['type' => 'string', 'description' => 'A configured project status (default: the first of the "new" group)']
                ],
                'required' => ['name']
            ]
        ],
        [
            'name' => 'update_project',
            'description' => 'Update project details, dates, budget, contract value, rating, delay reason, status or archive flag. A completed status stamps the finish date, an open one clears it, as in the app.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Project ID'],
                    'name' => ['type' => 'string', 'description' => 'Updated title'],
                    'status' => ['type' => 'string', 'description' => 'A configured project status'],
                    'budget' => ['type' => 'number', 'description' => 'Cost budget'],
                    'value' => ['type' => 'number', 'description' => 'Contract value to be invoiced'],
                    'delay_reason' => ['type' => 'string', 'description' => 'Why the project is late (max 500 chars)'],
                    'rating' => ['type' => 'integer', 'description' => 'Star rating 0-5'],
                    'division' => ['type' => 'string', 'description' => 'Division'],
                    'archived' => ['type' => 'boolean', 'description' => 'Archive / restore'],
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
            'description' => 'High-level finance KPIs for a year from the same model as the Finance overview: paid and expected revenue/expenses (cash basis, cancelled excluded, recurring rules expanded), net profit and the number of open invoices. In simplified mode it sums the simplified table.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'period' => ['type' => 'string', 'description' => 'Period: month, quarter, year, all (default year)'],
                    'year' => ['type' => 'integer', 'description' => 'Year to evaluate (e.g. 2026)']
                ]
            ]
        ],
        [
            'name' => 'get_financial_mode',
            'description' => 'Get the current financial operating mode: connected (live movements) or simplified (detached spreadsheet).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => (object)[]
            ]
        ],
        [
            'name' => 'set_financial_mode',
            'description' => 'Set the financial operating mode: connected (live movements) or simplified (detached spreadsheet).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'mode' => [
                        'type' => 'string',
                        'enum' => ['connected', 'simplified'],
                        'description' => 'Operating mode: connected or simplified'
                    ]
                ],
                'required' => ['mode']
            ]
        ],
        [
            'name' => 'get_financial_simplified_table',
            'description' => 'Get the simplified spreadsheet matrix: categories, period columns, raw equations, and evaluated cell values.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'year' => ['type' => 'integer', 'description' => 'Filter by year (e.g. 2026)']
                ]
            ]
        ],
        [
            'name' => 'set_financial_simplified_cell',
            'description' => 'Set or update an equation or numerical value for a specific category and period in the simplified financial table.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'category_id' => ['type' => 'string', 'description' => 'Category ID'],
                    'period' => ['type' => 'string', 'description' => 'Period column ID, e.g. YYYY-MM (e.g. 2026-03)'],
                    'equation' => ['type' => 'string', 'description' => 'Equation or value string (e.g. 1200 + 450 or 500)']
                ],
                'required' => ['category_id', 'period', 'equation']
            ]
        ],
        [
            'name' => 'list_invoices',
            'description' => 'List issued invoices and price offers with payment status.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'type' => ['type' => 'string', 'description' => 'Type: invoice, price_offer, proforma (default: all types)'],
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
            'description' => 'Create a DRAFT invoice with line items, numbered FA-YYYY-NNN in sequence, with its pending income movement in the ledger. Line prices are net; VAT is added per line. Sending, approving and settling money are done in the app.',
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
                                'vat_rate' => ['type' => 'number', 'description' => 'Percent (default: the company default VAT rate)'],
                                'discount_pct' => ['type' => 'number', 'description' => 'Line discount percent']
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
            'description' => 'Set a document to draft, sent or cancelled. Approving, invoicing and settling money cannot be done through MCP (they change the books). Cancelling an invoice cancels its unsettled ledger movement; money already recorded stays.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Invoice ID'],
                    'status' => ['type' => 'string', 'enum' => ['draft', 'sent', 'cancelled'], 'description' => 'New status']
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
            'description' => 'Record a planned or pending expense. Marking it paid is done in the app.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string', 'description' => 'Expense description or title'],
                    'amount' => ['type' => 'number', 'description' => 'Amount spent'],
                    'currency' => ['type' => 'string', 'description' => 'Currency (default EUR)'],
                    'category_id' => ['type' => 'string', 'description' => 'Category ID'],
                    'issue_date' => ['type' => 'string', 'description' => 'Date occurred (YYYY-MM-DD)'],
                    'status' => ['type' => 'string', 'enum' => ['planned', 'pending'], 'description' => 'Default planned'],
                    'due_date' => ['type' => 'string', 'description' => 'Due date (YYYY-MM-DD, default = issue_date)'],
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
            'description' => 'Record a stock movement as the warehouse screen does: reason receipt = inward (give unit_purchase_price to update the weighted average cost), reason sale = outward at cost and sell value, any other reason (damage, audit) = adjustment. Stock cannot go below zero.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'item_id' => ['type' => 'string', 'description' => 'Warehouse item ID'],
                    'quantity_change' => ['type' => 'number', 'description' => 'Quantity change (positive for inward, negative for outward)'],
                    'reason' => ['type' => 'string', 'description' => 'receipt (positive qty), sale (negative qty), or damage / audit / correction'],
                    'unit_purchase_price' => ['type' => 'number', 'description' => 'Receipts: purchase price per unit'],
                    'unit_sell_price' => ['type' => 'number', 'description' => 'Sales: sell price per unit (default: the item default sell price)'],
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
            'description' => 'Record the monthly salary obligation and payment of an employee (YYYY-MM). Mirrors the app: creates/updates the linked payroll expense when the employee has auto-expense on. A period already paid, or split into components, is refused (edit it in the app).',
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
            'description' => 'Log a vacation request for an employee. Dates must be valid and must not overlap other leave; the type must be a configured vacation type.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Employee ID'],
                    'vacation_type_id' => ['type' => 'string', 'description' => 'Vacation type ID (annual, worked_days, sick, unpaid)'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date (YYYY-MM-DD)'],
                    'end_date' => ['type' => 'string', 'description' => 'End date (YYYY-MM-DD)'],
                    'days_count' => ['type' => 'number', 'description' => 'Total business days'],
                    'status' => ['type' => 'string', 'enum' => ['requested', 'approved', 'rejected', 'taken'], 'description' => 'Status (default requested)'],
                    'note' => ['type' => 'string', 'description' => 'Note or reason']
                ],
                'required' => ['employee_id', 'start_date', 'end_date']
            ]
        ]
    ];
}

function mcp_strip_keys(array $row, array $keys): array {
    foreach ($keys as $k) { unset($row[$k]); }
    return $row;
}

/**
 * Without tasks.view_all a caller sees only tasks assigned to them, or that
 * they own or created (the app's canViewTask rule plus the creator follow-up).
 * Returns [sqlFragment, params] to AND onto a query on `tasks` (alias optional).
 */
function mcp_task_scope(array $user, string $alias = ''): array {
    if (mcp_can('tasks.view_all')) return ['', []];
    $a = $alias === '' ? '' : $alias . '.';
    return [
        "({$a}owner = ? OR {$a}created_by = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = {$a}id AND ta.user_name = ?))",
        [$user['name'], $user['name'], $user['name']],
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
            $evStmt = $pdo->prepare("SELECT id, type, timestamp, title, content, amount, author FROM timeline_events WHERE lead_id = ? AND hidden = 0" . (mcp_can('email') ? '' : " AND type <> 'email'") . " ORDER BY timestamp DESC LIMIT 20");
            $evStmt->execute([$args['id']]);
            $lead['timeline_events'] = $evStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $lead;

        case 'create_lead':
            $id = 'ld_' . bin2hex(random_bytes(8));
            $city = $args['city'] ?? null;
            $phone = $args['phone'] ?? null;
            $email = $args['email'] ?? null;
            $contact = $args['contact_person'] ?? null;
            $street = $args['street'] ?? null;
            $value = (float)($args['value'] ?? 0);
            $name = trim((string)($args['name'] ?? ''));
            if ($name === '') throw new \InvalidArgumentException("'name' is required.");
            $status = isset($args['status']) && $args['status'] !== '' ? mcp_check_lead_state($pdo, (string)$args['status']) : 'new';
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

            if (array_key_exists('name', $args) && trim((string)$args['name']) === '') {
                throw new \InvalidArgumentException("'name' cannot be empty.");
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
            $id = mcp_require_string($args, 'id');
            $status = mcp_check_lead_state($pdo, mcp_require_string($args, 'status'));
            $note = trim((string)($args['note'] ?? ''));

            $cur = $pdo->prepare("SELECT status FROM leads WHERE id = ?");
            $cur->execute([$id]);
            $fromStatus = $cur->fetchColumn();
            if ($fromStatus === false) throw new \Exception("Lead not found with ID: {$id}");
            if (strtolower((string)$fromStatus) === strtolower($status)) {
                return ['success' => true, 'id' => $id, 'new_status' => $fromStatus, 'message' => 'Lead is already in this stage.'];
            }
            // The pipeline guard the lead list enforces: open blocking tasks hold the lead in its stage.
            mcp_assert_lead_unlocked($pdo, $id);

            mcp_tx($pdo, function () use ($pdo, $user, $id, $status, $fromStatus, $note) {
                $pdo->prepare("UPDATE leads SET status = ? WHERE id = ?")->execute([$status, $id]);
                // Same history entry the app writes (LeadsDatagrid.buildStatusChangeEvent).
                $content = $fromStatus . ' → ' . $status . ($note !== '' ? "\n\n" . $note : '');
                $pdo->prepare(
                    "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                     VALUES (?, ?, 'status_change', NOW(), 'Lead state changed', ?, ?)"
                )->execute([mcp_new_id('ev_'), $id, $content, $user['name']]);
            });

            mcp_audit($pdo, $user, 'lead_stage_transition', "Moved lead $id from '$fromStatus' to '$status'");

            return ['success' => true, 'id' => $id, 'previous_status' => $fromStatus, 'new_status' => $status];

        case 'convert_lead_to_client':
            // In the app a client is a record with id client-* (or a confirmed value adjustment); a won
            // pipeline lead stays a lead. Converting therefore closes the lead as won and registers a
            // separate client record carrying the same name and contact data, so the Clients register
            // (which groups by name) shows the client with the lead's value.
            $id = mcp_require_string($args, 'id');
            $lStmt = $pdo->prepare("SELECT * FROM leads WHERE id = ?");
            $lStmt->execute([$id]);
            $lead = $lStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$lead) throw new \Exception("Lead not found with ID: {$id}");
            if (strpos($lead['id'], 'client-') === 0) throw new \Exception('This record is already a client.');

            $won = mcp_won_lead_state($pdo);
            $needsMove = strtolower((string)$lead['status']) !== strtolower($won);
            if ($needsMove) mcp_assert_lead_unlocked($pdo, $id);

            $projectName = trim((string)($args['project_name'] ?? '')) ?: ($lead['name'] ?: ('Project for ' . $id));
            $result = mcp_tx($pdo, function () use ($pdo, $user, $lead, $id, $won, $needsMove, $args, $projectName) {
                if ($needsMove) {
                    $pdo->prepare("UPDATE leads SET status = ? WHERE id = ?")->execute([$won, $id]);
                    $pdo->prepare(
                        "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                         VALUES (?, ?, 'status_change', NOW(), 'Lead state changed', ?, ?)"
                    )->execute([mcp_new_id('ev_'), $id, $lead['status'] . ' → ' . $won, $user['name']]);
                }
                $exists = $pdo->prepare("SELECT id FROM leads WHERE id LIKE 'client-%' AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1");
                $exists->execute([$lead['name']]);
                $clientId = $exists->fetchColumn() ?: null;
                if (!$clientId) {
                    $clientId = 'client-' . (int)round(microtime(true) * 1000);
                    $pdo->prepare(
                        "INSERT INTO leads (id, name, city, street, postal_code, country, phone, email, contact_person, company_id, tax_id, vat_id, website, client_type, status, source, owner, value, adjustment, rating, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_assistant', ?, 0, 0, ?, ?)"
                    )->execute([
                        $clientId, $lead['name'], $lead['city'], $lead['street'], $lead['postal_code'], $lead['country'] ?: 'Slovakia',
                        $lead['phone'], $lead['email'], $lead['contact_person'], $lead['company_id'], $lead['tax_id'], $lead['vat_id'], $lead['website'],
                        $lead['client_type'] ?: 'business', $won, $lead['owner'] ?: $user['name'], $lead['rating'] ?: 5, date('Y-m-d'),
                    ]);
                    $pdo->prepare(
                        "INSERT INTO timeline_events (id, lead_id, type, timestamp, title, content, author)
                         VALUES (?, ?, 'note', NOW(), 'Client Registered', ?, ?)"
                    )->execute([mcp_new_id('ev_'), $clientId, 'Converted from lead ' . $id . ' via MCP.', $user['name']]);
                }
                $projectId = null;
                if (!empty($args['create_project'])) {
                    $projectId = mcp_create_project_row($pdo, ['name' => $projectName, 'client_id' => $id]);
                }
                return ['client_id' => $clientId, 'project_id' => $projectId];
            });

            mcp_audit($pdo, $user, 'lead_convert', "Converted lead $id to client {$result['client_id']}" . ($result['project_id'] ? " with project {$result['project_id']}" : ""));

            return ['success' => true, 'lead_id' => $id, 'lead_status' => $won, 'client_id' => $result['client_id'], 'project_id' => $result['project_id']];

        // --- 2. Clients & Contacts ---
        case 'list_clients':
            // Client profiles as the Clients register shows them: records grouped by name, a client being
            // any name with a client-* record or a value adjustment. Pipeline leads are not clients.
            return mcp_do_list_clients($pdo, $args);

        case 'get_client':
            $id = $args['id'];
            $stmt = $pdo->prepare("SELECT * FROM leads WHERE id = ?");
            $stmt->execute([$id]);
            $client = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$client) {
                throw new \Exception("Client not found with ID: " . $id);
            }

            // Linked projects (only for callers who can see the projects module)
            if (mcp_can('projects')) {
                $prStmt = $pdo->prepare("SELECT id, name, status, budget, deadline FROM projects WHERE client_id = ? OR lead_id = ?");
                $prStmt->execute([$id, $id]);
                $client['projects'] = $prStmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            // Linked invoices (only for callers who can see the invoices module)
            if (mcp_can('invoices')) {
                $invStmt = $pdo->prepare("SELECT id, document_number, title, total_price, currency, status, issued_at FROM invoices_offers WHERE client_id = ? OR lead_id = ? ORDER BY issued_at DESC LIMIT 15");
                $invStmt->execute([$id, $id]);
                $client['invoices'] = $invStmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            return $client;

        case 'create_client':
            return mcp_do_create_client($pdo, $user, $args);

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

            if (array_key_exists('name', $args) && trim((string)$args['name']) === '') {
                throw new \InvalidArgumentException("'name' cannot be empty.");
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
            $clientId = mcp_require_string($args, 'client_id');
            mcp_row_exists($pdo, 'leads', $clientId, 'Client/lead');
            $contactName = mcp_require_string($args, 'name');
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

            [$scopeSql, $scopeParams] = mcp_task_scope($user);
            if ($scopeSql !== '') {
                $where[] = $scopeSql;
                $params = array_merge($params, $scopeParams);
            }
            if (!empty($args['created_from'])) { $where[] = "DATE(created_at) >= ?"; $params[] = mcp_require_date($args, 'created_from'); }
            if (!empty($args['created_to'])) { $where[] = "DATE(created_at) <= ?"; $params[] = mcp_require_date($args, 'created_to'); }
            if (!empty($args['bucket'])) {
                // The time buckets of the task panel: overdue / today / tomorrow / upcoming (later than tomorrow) / done.
                $bucket = mcp_enum($args, 'bucket', ['overdue', 'today', 'tomorrow', 'upcoming', 'done']);
                [$openSql, $openParams] = mcp_open_task_sql($pdo);
                $today = mcp_today(); $nowTime = date('H:i');
                $limitExpr = "COALESCE(NULLIF(deadline_time, ''), '23:59')";
                if ($bucket === 'done') {
                    $where[] = "NOT $openSql"; $params = array_merge($params, $openParams);
                } else {
                    $where[] = $openSql; $params = array_merge($params, $openParams);
                    if ($bucket === 'overdue') { $where[] = "(deadline < ? OR (deadline = ? AND $limitExpr < ?))"; array_push($params, $today, $today, $nowTime); }
                    if ($bucket === 'today') { $where[] = "deadline = ? AND $limitExpr >= ?"; array_push($params, $today, $nowTime); }
                    if ($bucket === 'tomorrow') { $where[] = "deadline = ?"; $params[] = mcp_iso_shift($today, 1); }
                    if ($bucket === 'upcoming') { $where[] = "deadline > ?"; $params[] = mcp_iso_shift($today, 1); }
                }
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
            [$scopeSql, $scopeParams] = mcp_task_scope($user);
            $stmt = $pdo->prepare("SELECT * FROM tasks WHERE id = ?" . ($scopeSql !== '' ? " AND $scopeSql" : ''));
            $stmt->execute(array_merge([$args['id']], $scopeParams));
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
            return mcp_do_create_task($pdo, $user, $args);

        case 'update_task':
            return mcp_do_update_task($pdo, $user, $args);

        case 'complete_task':
            return mcp_do_complete_task($pdo, $user, $args);

        case 'add_task_comment':
            $taskId = mcp_require_string($args, 'task_id');
            $comment = mcp_require_string($args, 'comment');

            // Comments are kept on the linked lead's timeline; without one there is nowhere to store them.
            $tStmt = $pdo->prepare("SELECT title, related_lead_id FROM tasks WHERE id = ?");
            $tStmt->execute([$taskId]);
            $task = $tStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$task) throw new \Exception("Task not found with ID: {$taskId}");
            if (empty($task['related_lead_id'])) {
                throw new \Exception('This task is not linked to a lead or client, so the comment has nowhere to be stored. Link it first with update_task (client_id).');
            }

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
                $where[] = "p.status = ?";
                $params[] = $args['status'];
            }
            if (!empty($args['client_id'])) {
                $where[] = "(p.client_id = ? OR p.lead_id = ?)";
                $params[] = $args['client_id'];
                $params[] = $args['client_id'];
            }
            if (!empty($args['search'])) {
                $where[] = "p.name LIKE ?";
                $params[] = '%' . $args['search'] . '%';
            }
            if (empty($args['include_archived'])) {
                $where[] = "(p.archived = 0 OR p.archived IS NULL)";
            }

            $limit = min(max(1, (int)($args['limit'] ?? 50)), 100);

            $sql = "SELECT p.id, p.name, p.status, p.division, p.rating, p.value, p.budget, p.deadline, p.delay_reason, p.start_date, p.finished_at, p.lead_id, p.client_id, l.name as client_name, p.archived, p.created_at
                    FROM projects p
                    LEFT JOIN leads l ON l.id = COALESCE(p.lead_id, p.client_id)
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

            // Linked tasks (only for callers who can see the tasks module, scoped by tasks.view_all)
            if (mcp_can('tasks')) {
                [$scopeSql, $scopeParams] = mcp_task_scope($user);
                $tStmt = $pdo->prepare("SELECT id, title, priority, deadline, status, owner FROM tasks WHERE related_project_id = ?" . ($scopeSql !== '' ? " AND $scopeSql" : '') . " ORDER BY deadline ASC");
                $tStmt->execute(array_merge([$args['id']], $scopeParams));
                $proj['tasks'] = $tStmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            return $proj;

        case 'create_project':
            $id = mcp_create_project_row($pdo, $args);
            $created = $pdo->prepare("SELECT name, status, budget, value FROM projects WHERE id = ?");
            $created->execute([$id]);
            $row = $created->fetch(\PDO::FETCH_ASSOC);
            mcp_audit($pdo, $user, 'project_create', "Created project '{$row['name']}' (ID: $id)");
            return ['success' => true, 'id' => $id, 'name' => $row['name'], 'status' => $row['status'], 'budget' => $row['budget'] === null ? null : (float)$row['budget'], 'value' => $row['value'] === null ? null : (float)$row['value']];

        case 'update_project':
            return mcp_do_update_project($pdo, $user, $args);

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
        case 'get_financial_mode':
            $modeStmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'FINANCIAL_MODE'");
            $currentMode = $modeStmt->fetchColumn() ?: 'connected';
            return [
                'mode' => $currentMode,
                'description' => $currentMode === 'simplified' 
                    ? 'Simplified mode: Detached spreadsheet matrix where overview and graph derive from cell equations/totals.' 
                    : 'Connected mode: Live financial movements, payments, and recurring schedules.'
            ];

        case 'set_financial_mode':
            $targetMode = isset($args['mode']) && in_array($args['mode'], ['connected', 'simplified'], true)
                ? $args['mode'] 
                : 'connected';
            $insFMode = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('FINANCIAL_MODE', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $insFMode->execute([$targetMode]);
            mcp_audit($pdo, $user, 'set_financial_mode', "Financial operating mode changed to: {$targetMode}");
            return [
                'ok' => true,
                'mode' => $targetMode,
                'message' => "Financial operating mode set to '{$targetMode}'."
            ];

        case 'get_financial_simplified_table':
            $modeStmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'FINANCIAL_MODE'");
            $currentMode = $modeStmt->fetchColumn() ?: 'connected';

            $simpStmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'FINANCIAL_SIMPLIFIED_TABLE'");
            $simpJson = $simpStmt->fetchColumn();
            $cells = json_decode($simpJson ?: '{}', true) ?: [];

            $catStmt = $pdo->query("SELECT id, name, type, parent_id, color FROM financial_categories ORDER BY `sort_order` ASC, name ASC");
            $categories = $catStmt->fetchAll(\PDO::FETCH_ASSOC);

            $filterYear = isset($args['year']) ? (int)$args['year'] : null;
            $filteredCells = [];
            $evaluated = [];
            $totalExpenses = 0.0;
            $totalIncomes = 0.0;

            $catMap = [];
            foreach ($categories as $c) {
                $catMap[$c['id']] = $c;
            }

            foreach ($cells as $k => $expr) {
                $parts = explode(':', $k, 2);
                if (count($parts) !== 2) continue;
                list($cId, $colId) = $parts;
                if ($filterYear !== null && strpos($colId, (string)$filterYear) !== 0) continue;

                $filteredCells[$k] = $expr;
                $val = ccrm_mcp_eval_equation($expr);
                $evaluated[$k] = $val;

                if ($val !== null) {
                    $catType = $catMap[$cId]['type'] ?? 'expense';
                    if ($catType === 'income') {
                        $totalIncomes += $val;
                    } else {
                        $totalExpenses += $val;
                    }
                }
            }

            return [
                'mode' => $currentMode,
                'year_filter' => $filterYear,
                'categories' => $categories,
                'cells' => $filteredCells,
                'evaluated_values' => $evaluated,
                'summary' => [
                    'total_income' => round($totalIncomes, 2),
                    'total_expense' => round($totalExpenses, 2),
                    'net_profit' => round($totalIncomes - $totalExpenses, 2)
                ]
            ];

        case 'set_financial_simplified_cell':
            $catId = trim((string)($args['category_id'] ?? ''));
            $period = trim((string)($args['period'] ?? ''));
            $equation = trim((string)($args['equation'] ?? ''));

            if ($catId === '' || $period === '') {
                throw new \InvalidArgumentException("category_id and period are required.");
            }

            $simpStmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'FINANCIAL_SIMPLIFIED_TABLE'");
            $simpJson = $simpStmt->fetchColumn();
            $cells = json_decode($simpJson ?: '{}', true) ?: [];

            $cellKey = "{$catId}:{$period}";
            if ($equation === '') {
                unset($cells[$cellKey]);
                $evalVal = null;
            } else {
                $evalVal = ccrm_mcp_eval_equation($equation);
                if ($evalVal === null) {
                    throw new \InvalidArgumentException("Invalid arithmetic equation: '{$equation}'");
                }
                $cells[$cellKey] = $equation;
            }

            $insFSimp = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('FINANCIAL_SIMPLIFIED_TABLE', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $insFSimp->execute([json_encode($cells)]);
            mcp_audit($pdo, $user, 'set_financial_simplified_cell', "Updated cell {$cellKey} = '{$equation}'");

            return [
                'ok' => true,
                'cell_key' => $cellKey,
                'equation' => $equation,
                'evaluated_value' => $evalVal
            ];

        case 'get_financial_summary':
            $year = isset($args['year']) ? (int)$args['year'] : (int)date('Y');
            
            // Check operating mode
            $modeStmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'FINANCIAL_MODE'");
            $currentMode = $modeStmt->fetchColumn() ?: 'connected';

            if ($currentMode === 'simplified') {
                $simpStmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'FINANCIAL_SIMPLIFIED_TABLE'");
                $simpJson = $simpStmt->fetchColumn();
                $cells = json_decode($simpJson ?: '{}', true) ?: [];

                $catStmt = $pdo->query("SELECT id, type FROM financial_categories");
                $catTypes = $catStmt->fetchAll(\PDO::FETCH_KEY_PAIR);

                $paidRevenue = 0.0;
                $paidCost = 0.0;
                $yearPrefix = (string)$year;

                foreach ($cells as $k => $expr) {
                    $parts = explode(':', $k, 2);
                    if (count($parts) !== 2) continue;
                    list($cId, $colId) = $parts;
                    if (strpos($colId, $yearPrefix) !== 0) continue;

                    $val = ccrm_mcp_eval_equation($expr);
                    if ($val === null) continue;

                    $type = $catTypes[$cId] ?? 'expense';
                    if ($type === 'income') {
                        $paidRevenue += $val;
                    } else {
                        $paidCost += $val;
                    }
                }

                return [
                    'mode' => 'simplified',
                    'year' => $year,
                    'currency' => 'EUR',
                    'paid_revenue' => round($paidRevenue, 2),
                    'planned_revenue' => round($paidRevenue, 2),
                    'paid_expenses' => round($paidCost, 2),
                    'planned_expenses' => round($paidCost, 2),
                    'net_profit' => round($paidRevenue - $paidCost, 2),
                    'unpaid_invoices_count' => 0
                ];
            }

            return mcp_financial_summary_connected($pdo, $year);

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

            $sql = "SELECT id, document_number, type, mode, client_id, lead_id, client_name, title, subtotal, vat_amount, total_price, currency, status, issued_at, valid_until, due_date, created_by 
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
            return mcp_do_create_invoice($pdo, $user, $args);

        case 'update_invoice_status':
            return mcp_do_update_invoice_status($pdo, $user, $args);

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
            return mcp_do_record_expense($pdo, $user, $args);

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
            $sku = mcp_require_string($args, 'sku');
            $name = mcp_require_string($args, 'name');
            $desc = $args['description'] ?? null;
            $cat = $args['category'] ?? null;
            $unit = $args['unit'] ?? 'ks';
            $minStock = mcp_number($args, 'min_stock', false, 0) ?? 0.0;
            $sellPrice = mcp_number($args, 'default_sell_price', false, 0) ?? 0.0;
            $dupSku = $pdo->prepare("SELECT 1 FROM warehouse_items WHERE sku = ?");
            $dupSku->execute([$sku]);
            if ($dupSku->fetchColumn()) throw new \InvalidArgumentException("SKU {$sku} already exists.");

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
            return mcp_do_adjust_stock($pdo, $user, $args);

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
            $title = mcp_require_string($args, 'title');
            $date = mcp_require_date($args, 'date');
            $duration = (int)(mcp_number($args, 'duration', false, 0, 1440) ?? 30);
            if (!empty($args['lead_id'])) mcp_row_exists($pdo, 'leads', (string)$args['lead_id'], 'Lead/client');
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
            $id = mcp_require_string($args, 'id');
            $allowedFields = ['title', 'date', 'duration', 'notes'];
            $updates = [];
            $params = [];
            if (array_key_exists('title', $args)) mcp_require_string($args, 'title');
            if (array_key_exists('date', $args)) mcp_require_date($args, 'date');
            if (array_key_exists('duration', $args)) mcp_number($args, 'duration', true, 0, 1440);

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
            $where = ["lead_id = ?", "hidden = 0"];
            $params = [$leadId];
            // Mail bodies belong to the mailbox module: callers without it do not see email events.
            if (!mcp_can('email')) $where[] = "type <> 'email'";

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

            if ((in_array('leads', $filterTypes) && mcp_can('leads')) || (in_array('clients', $filterTypes) && mcp_can('clients'))) {
                $stmt = $pdo->prepare(
                    "SELECT id, name, email, phone, city, status, client_type, value 
                     FROM leads 
                     WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ? OR company_id LIKE ?) AND archived = 0 
                     LIMIT 10"
                );
                $stmt->execute([$term, $term, $term, $term]);
                $results['leads_and_clients'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            if (in_array('tasks', $filterTypes) && mcp_can('tasks')) {
                [$scopeSql, $scopeParams] = mcp_task_scope($user);
                $stmt = $pdo->prepare(
                    "SELECT id, title, priority, deadline, status, owner, related_project_id
                     FROM tasks
                     WHERE (title LIKE ? OR description LIKE ?) AND archived = 0 " . ($scopeSql !== '' ? " AND $scopeSql " : '') . "
                     LIMIT 10"
                );
                $stmt->execute(array_merge([$term, $term], $scopeParams));
                $results['tasks'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            if (in_array('projects', $filterTypes) && mcp_can('projects')) {
                $stmt = $pdo->prepare(
                    "SELECT id, name, status, budget, deadline 
                     FROM projects 
                     WHERE name LIKE ? 
                     LIMIT 10"
                );
                $stmt->execute([$term]);
                $results['projects'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            if (in_array('invoices', $filterTypes) && mcp_can('invoices')) {
                $stmt = $pdo->prepare(
                    "SELECT id, document_number, client_name, title, total_price, currency, status 
                     FROM invoices_offers 
                     WHERE document_number LIKE ? OR client_name LIKE ? OR title LIKE ? 
                     LIMIT 10"
                );
                $stmt->execute([$term, $term, $term]);
                $results['invoices'] = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            if (in_array('warehouse', $filterTypes) && mcp_can('warehouse')) {
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
            $stmt = $pdo->prepare("SELECT id, name, pin, email, phone, address_street, address_city, address_zip, address_country, salary_type, salary_amount, salary_due_day, vacation_allowances_json, time_tracking_user_name, auto_expense, is_active FROM employees WHERE " . implode(' AND ', $where) . " ORDER BY name ASC LIMIT 200");
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (!mcp_can('employees.salaries')) {
                $rows = array_map(fn($r) => mcp_strip_keys($r, MCP_EMPLOYEE_SENSITIVE), $rows);
            }
            return $rows;

        case 'get_employee':
            $stmt = $pdo->prepare("SELECT * FROM employees WHERE id = ? LIMIT 1");
            $stmt->execute([$args['id']]);
            $emp = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$emp) throw new \Exception("Employee not found with ID: " . $args['id']);
            
            // Salaries and personal id only for holders of employees.salaries
            if (mcp_can('employees.salaries')) {
                $salStmt = $pdo->prepare("SELECT * FROM employee_salaries WHERE employee_id = ? ORDER BY year DESC, period_number DESC LIMIT 12");
                $salStmt->execute([$args['id']]);
                $emp['salaries'] = $salStmt->fetchAll(\PDO::FETCH_ASSOC);
            } else {
                $emp = mcp_strip_keys($emp, MCP_EMPLOYEE_SENSITIVE);
            }

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
                mcp_can('employees.salaries') ? ($args['pin'] ?? null) : null,
                $args['email'] ?? null,
                $args['phone'] ?? null,
                $args['address_street'] ?? null,
                $args['address_city'] ?? null,
                $args['address_zip'] ?? null,
                $args['address_country'] ?? 'Slovakia',
                mcp_can('employees.salaries') ? ($args['salary_type'] ?? 'monthly') : 'monthly',
                mcp_can('employees.salaries') ? (float)($args['salary_amount'] ?? 0) : 0.0,
                (mcp_can('employees.salaries') && isset($args['salary_due_day'])) ? (int)$args['salary_due_day'] : null,
                !empty($args['auto_expense']) ? 1 : 0,
                $args['expense_category_id'] ?? null
            ]);

            mcp_audit($pdo, $user, 'create_employee', "Created employee {$name} ({$id})");
            return ['id' => $id, 'name' => $name, 'message' => "Employee created successfully."];

        case 'update_employee':
            $id = $args['id'];
            $fields = [];
            $params = [];
            // Salary and personal-id fields are writable only with employees.salaries.
            if (!mcp_can('employees.salaries')) {
                foreach (['pin', 'salary_type', 'salary_amount', 'salary_due_day', 'auto_expense'] as $f) {
                    if (isset($args[$f])) {
                        throw new \Exception("Field '{$f}' needs the employees.salaries permission.");
                    }
                }
            }
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
                LIMIT 500
            ");
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);

        case 'record_salary_payout':
            return mcp_do_record_salary_payout($pdo, $user, $args);

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
            return mcp_do_record_vacation($pdo, $user, $args);

        default:
            $extResult = mcp_ext_fin_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_ops_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            throw new \Exception("Unrecognized tool name: " . htmlspecialchars($tool));
    }
}
