<?php
/**
 * CCRM Model Context Protocol (MCP) Server Gateway.
 *
 * Implements JSON-RPC 2.0 protocol for MCP clients (Antigravity, Claude Desktop, Cursor).
 * Supports both HTTP POST JSON-RPC execution and HTTP GET SSE streaming.
 * Security: every tool call is checked against the key owner's role permissions
 * (see mcp_tool_permissions). No tool deletes rows (tasks are archived via update_task). System settings are limited to the two
 * finance-mode keys (FINANCIAL_MODE, FINANCIAL_SIMPLIFIED_TABLE); nothing else is reachable.
 */

// 1. Headers & CORS
require_once __DIR__ . '/brand.php';
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CCRM-MCP-KEY, X-API-Key');

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
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/mcp_ext.php';
require_once __DIR__ . '/mcp_ext_ops.php';
require_once __DIR__ . '/mcp_ext_writes.php';
require_once __DIR__ . '/mcp_ext_intel.php';
require_once __DIR__ . '/mcp_deleted.php';
require_once __DIR__ . '/mcp_window.php';
// The list tools rebuilt on the shared window, one module per area (audit 2026-11-10).
require_once __DIR__ . '/mcp_lists_crm.php';
require_once __DIR__ . '/mcp_lists_money.php';
require_once __DIR__ . '/mcp_lists_people.php';
require_once __DIR__ . '/mcp_ext_modules.php';
require_once __DIR__ . '/mcp_ext_agency.php';
require_once __DIR__ . '/mcp_ext_catalog.php';
require_once __DIR__ . '/mcp_ext_crm_plus.php';
require_once __DIR__ . '/mcp_ext_commercial.php';
require_once __DIR__ . '/mcp_ext_self.php';
require_once __DIR__ . '/mcp_ext_newsletter.php';
require_once __DIR__ . '/mcp_ext_comms.php';

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
// The key is read from a request HEADER (Authorization: Bearer <key>, or
// X-CCRM-MCP-KEY, which also survives Apache setups that drop Authorization, or
// X-API-Key, the raw key with no "Bearer " prefix, which the claude.ai custom
// connector offers as a preset header).
// A key in the URL ends up in web-server, proxy and error logs (VULN-07), so
// `?token=` is refused unless an operator who still has a URL-only client (a
// connector that cannot send headers) opts in with
// `define('CCRM_MCP_ALLOW_QUERY_TOKEN', true);` in config.php.
$token = '';
$tokenFromQuery = false;
$authHeader = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '')));
if ($authHeader !== '' && preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
    $token = trim($matches[1]);
} elseif (!empty($_SERVER['HTTP_X_CCRM_MCP_KEY'])) {
    $token = trim((string)$_SERVER['HTTP_X_CCRM_MCP_KEY']);
} elseif (!empty($_SERVER['HTTP_X_API_KEY'])) {
    $token = trim((string)$_SERVER['HTTP_X_API_KEY']);
} elseif (defined('CCRM_MCP_ALLOW_QUERY_TOKEN') && CCRM_MCP_ALLOW_QUERY_TOKEN && !empty($_GET['token'])) {
    $token = trim((string)$_GET['token']);
    $tokenFromQuery = true;
}

if ($token === '') {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode([
        'jsonrpc' => '2.0',
        'error' => [
            'code' => -32001,
            'message' => 'Unauthorized: Missing MCP access key. Send it as "X-API-Key: <key>", "Authorization: Bearer <key>" or the "X-CCRM-MCP-KEY" header.'
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
        'list_contacts' => $v('clients'), 'create_contact' => $e('clients'),
        'list_tasks' => $v('tasks'), 'get_task' => $v('tasks'), 'get_task_chat' => $v('tasks'),
        'create_task' => $e('tasks'), 'update_task' => $e('tasks'), 'complete_task' => $e('tasks'),
        'add_task_comment' => $e('tasks'),
        'list_projects' => $v('projects'), 'get_project' => $v('projects'),
        'create_project' => $e('projects'), 'update_project' => $e('projects'), 'manage_project_acceptance_criteria' => $e('projects'),
        'create_milestone' => $e('projects', 'tasks'),
        'get_financial_summary' => $v('financial'), 'get_financial_mode' => $v('financial'),
        'get_financial_simplified_table' => $v('financial'),
        // Flips the whole workspace between connected and simplified finance (system_settings).
        'set_financial_mode' => ['edit' => ['financial'], 'admin' => true],
        'set_financial_simplified_cell' => $e('financial'),
        'list_invoices' => $v('invoices'), 'get_invoice' => $v('invoices'),
        'create_invoice' => $e('invoices', 'financial'), 'update_invoice_status' => $e('invoices'),
        'list_expenses' => $v('financial'), 'record_expense' => $e('financial'),
        'list_inventory_items' => $v('warehouse'), 'get_inventory_item' => $v('warehouse'),
        'create_inventory_item' => $e('warehouse'), 'adjust_stock' => $e('warehouse'),
        'list_meetings' => $v('meetings'), 'schedule_meeting' => $e('meetings'), 'update_meeting' => $e('meetings'),
        'list_communications' => ['any' => ['leads', 'clients']],
        'log_communication' => ['any_edit' => ['leads', 'clients']],
        // Each section is gated per module inside the tool.
        'search_entities' => [],
        // Directory parity with sync.php: any authenticated user.
        'list_team_members' => [],
        'list_employees' => $v('employees'), 'get_employee' => $v('employees'),
        'create_employee' => $e('employees'), 'update_employee' => $e('employees'),
        'list_salaries' => $v('employees', 'employees.salaries'),
        'record_salary_payout' => ['edit' => ['employees'], 'view' => ['employees.salaries']],
        'list_vacations' => $v('employees', 'employees.vacations'),
        'record_vacation' => ['edit' => ['employees'], 'view' => ['employees.vacations']],
        'whatsapp_list_chats' => $v('whatsapp'),
        'whatsapp_read_messages' => $v('whatsapp'),
        'whatsapp_send_message' => $e('whatsapp'),
        'whatsapp_sync_chat' => $e('whatsapp'),
    ];
    // Part B tools (mcp_ext.php).
    $map += mcp_ext_fin_permissions();
    $map += mcp_ext_ops_permissions();
    $map += mcp_ext_intel_permissions();
    $map += mcp_deleted_permissions();
    $map += mcp_ext_modules_permissions();
    $map += mcp_ext_agency_permissions();
    $map += mcp_ext_catalog_permissions();
    $map += mcp_ext_crm_plus_permissions();
    $map += mcp_ext_commercial_permissions();
    $map += mcp_ext_self_permissions();
    $map += mcp_ext_newsletter_permissions();
    $map += mcp_ext_comms_permissions();
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
    if (!empty($need['any_edit'])) {
        $seenEdit = false;
        foreach ($need['any_edit'] as $k) { if (mcp_can_edit($k)) { $seenEdit = true; break; } }
        if (!$seenEdit) return false;
    }
    foreach ($need['view'] ?? [] as $k) { if (!mcp_can($k)) return false; }
    foreach ($need['edit'] ?? [] as $k) { if (!mcp_can_edit($k)) return false; }
    return true;
}

/**
 * Why mcp_tool_allowed() refuses $tool, in the order it checks: the first unmet requirement.
 * Goes into the -32003 message so a key owner (or their agent) can tell an administrator which
 * permission to grant in Settings → Roles, instead of only hearing "no access".
 */
function mcp_tool_refusal_reason(string $tool, ?string $roleName): string {
    $map = mcp_tool_permissions();
    if (!array_key_exists($tool, $map)) return 'unknown tool; tools/list shows the tools this key may call';
    $need = $map[$tool];
    $role = 'the role "' . (string)$roleName . '"';
    if (!empty($need['admin']) && empty($GLOBALS['mcp_is_admin'])) return 'only an Admin may call it';
    if (!empty($need['any']) && !array_filter($need['any'], fn($k) => mcp_can($k))) {
        return $role . ' needs view access to one of: ' . implode(', ', $need['any']);
    }
    if (!empty($need['any_edit']) && !array_filter($need['any_edit'], fn($k) => mcp_can_edit($k))) {
        return $role . ' needs edit access to one of: ' . implode(', ', $need['any_edit']);
    }
    foreach ($need['view'] ?? [] as $k) { if (!mcp_can($k)) return $role . ' needs view access to ' . $k; }
    foreach ($need['edit'] ?? [] as $k) { if (!mcp_can_edit($k)) return $role . ' needs edit access to ' . $k; }
    return 'not permitted';
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
        // Never echo the key back in a URL unless the client authenticated that way.
        $postUrl = '/api/mcp.php?' . ($tokenFromQuery ? 'token=' . urlencode($token) . '&' : '') . 'sessionId=' . $sessionId;

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
                'leads', 'clients', 'tasks', 'weekly_plan', 'projects', 'financials', 'invoices',
                'orders', 'warehouse', 'time_tracking', 'tickets', 'meetings', 'communications',
                'search', 'team', 'employees', 'automation', 'files'
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
                // serverInfo.name stays "ccrm-mcp-server" on purpose: it is the one identifier
                // clients may have stored, so renaming it could force a reconnect. Everything else
                // (instructions, tool descriptions) is plain text that is re-read on its own.
                'serverInfo' => [
                    'name' => 'ccrm-mcp-server',
                    'version' => '1.0.0'
                ],
                // Optional MCP field, ignored by clients that do not use it: tells the assistant whose
                // installation this is ("Lapidea (Koperniq)"; just "Koperniq" with no title of its own).
                'instructions' => 'This is ' . kprnq_title_with_product(kprnq_system_title_override($pdo))
                    . '. Use these tools to read and update its data within the signed-in user\'s permissions.'
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
                'error' => ['code' => -32003, 'message' => 'Forbidden: this key may not call ' . $toolName
                    . ' (' . mcp_tool_refusal_reason($toolName, $sessionUser['role'] ?? null) . ').']
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
    return array_merge(
        mcp_core_tool_definitions(),
        mcp_ext_fin_tool_definitions(),
        mcp_ext_ops_tool_definitions(),
        mcp_ext_intel_tool_definitions(),
        mcp_deleted_tool_definitions(),
        mcp_get_module_tool_definitions(),
        mcp_get_agency_tool_definitions(),
        mcp_ext_catalog_tool_definitions(),
        mcp_ext_crm_plus_tool_definitions(),
        mcp_ext_commercial_tool_definitions(),
        mcp_ext_self_tool_definitions(),
        mcp_get_newsletter_tool_definitions(),
        mcp_get_comms_tool_definitions()
    );
}

function mcp_core_tool_definitions(): array {
    return [
        // DOMAIN 1: Leads & Opportunities (Pipeline)
        mcp_crm_defs()['list_leads'],
        mcp_crm_defs()['get_lead'],
        [
            'name' => 'create_lead',
            'description' => 'Create a new sales opportunity or lead in the pipeline, including optional custom fields.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Company or individual name'],
                    'contact_person' => ['type' => 'string', 'description' => 'Primary contact person name'],
                    'contact_first_name' => ['type' => 'string', 'description' => 'Contact first name'],
                    'contact_last_name' => ['type' => 'string', 'description' => 'Contact last name'],
                    'email' => ['type' => 'string', 'description' => 'Contact email address'],
                    'phone' => ['type' => 'string', 'description' => 'Contact phone number'],
                    'city' => ['type' => 'string', 'description' => 'City location'],
                    'street' => ['type' => 'string', 'description' => 'Street address'],
                    'postal_code' => ['type' => 'string', 'description' => 'Postal code'],
                    'country' => ['type' => 'string', 'description' => 'Country (default Slovakia)'],
                    'company_id' => ['type' => 'string', 'description' => 'IČO'],
                    'tax_id' => ['type' => 'string', 'description' => 'DIČ'],
                    'vat_id' => ['type' => 'string', 'description' => 'IČ DPH'],
                    'website' => ['type' => 'string', 'description' => 'Website URL'],
                    'client_type' => ['type' => 'string', 'enum' => ['business', 'person', 'partner'], 'description' => 'Default business'],
                    'division' => ['type' => 'string', 'description' => 'Division name'],
                    'source' => ['type' => 'string', 'description' => 'Lead source key'],
                    'price_level_id' => ['type' => 'string', 'description' => 'Price level ID'],
                    'categories' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Lead category/interest names'],
                    'custom_fields' => ['type' => 'object', 'description' => 'Custom attribute map keyed by attribute ID (see list_lead_attributes)'],
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
            'description' => 'Update fields, categories, archive state, or custom fields of an existing lead opportunity.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'The lead ID to update'],
                    'name' => ['type' => 'string', 'description' => 'Updated company / client name'],
                    'contact_person' => ['type' => 'string', 'description' => 'Updated contact person'],
                    'contact_first_name' => ['type' => 'string', 'description' => 'Contact first name'],
                    'contact_last_name' => ['type' => 'string', 'description' => 'Contact last name'],
                    'email' => ['type' => 'string', 'description' => 'Updated email'],
                    'phone' => ['type' => 'string', 'description' => 'Updated phone'],
                    'city' => ['type' => 'string', 'description' => 'Updated city'],
                    'street' => ['type' => 'string', 'description' => 'Updated street'],
                    'postal_code' => ['type' => 'string', 'description' => 'Postal code'],
                    'country' => ['type' => 'string', 'description' => 'Country'],
                    'company_id' => ['type' => 'string', 'description' => 'IČO'],
                    'tax_id' => ['type' => 'string', 'description' => 'DIČ'],
                    'vat_id' => ['type' => 'string', 'description' => 'IČ DPH'],
                    'website' => ['type' => 'string', 'description' => 'Website URL'],
                    'division' => ['type' => 'string', 'description' => 'Division name'],
                    'source' => ['type' => 'string', 'description' => 'Lead source key'],
                    'price_level_id' => ['type' => 'string', 'description' => 'Price level ID'],
                    'categories' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Replace lead categories/interests'],
                    'custom_fields' => ['type' => 'object', 'description' => 'Custom field updates keyed by attribute ID (empty string/null clears key)'],
                    'archived' => ['type' => 'boolean', 'description' => 'true archives the lead, false restores it'],
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
            'description' => 'Close a lead as won and register the client record the Clients register shows (same name and contact data; value stays on the lead). Optionally creates an initial project and copies matching custom fields. Refused while the lead has open blocking tasks.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Lead ID to convert'],
                    'create_project' => ['type' => 'boolean', 'description' => 'Whether to auto-create a delivery project'],
                    'project_name' => ['type' => 'string', 'description' => 'Name for the project if created'],
                    'project_type_id' => ['type' => 'string', 'description' => 'Optional project type ID when creating project']
                ],
                'required' => ['id']
            ]
        ],

        // DOMAIN 2: Clients & Contact Management
        mcp_crm_defs()['list_clients'],
        mcp_crm_defs()['get_client'],
        [
            'name' => 'create_client',
            'description' => 'Create a new business, person, or partner client record with tax, pricing, category, and custom-field details.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Company or client legal name'],
                    'company_id' => ['type' => 'string', 'description' => 'Company Registration Number (IČO)'],
                    'tax_id' => ['type' => 'string', 'description' => 'Tax Identification Number (DIČ)'],
                    'vat_id' => ['type' => 'string', 'description' => 'VAT Number (IČ DPH)'],
                    'website' => ['type' => 'string', 'description' => 'Website URL'],
                    'contact_person' => ['type' => 'string', 'description' => 'Primary contact person'],
                    'contact_first_name' => ['type' => 'string', 'description' => 'Primary contact first name'],
                    'contact_last_name' => ['type' => 'string', 'description' => 'Primary contact last name'],
                    'email' => ['type' => 'string', 'description' => 'Primary email address'],
                    'phone' => ['type' => 'string', 'description' => 'Primary phone number'],
                    'street' => ['type' => 'string', 'description' => 'Street address'],
                    'city' => ['type' => 'string', 'description' => 'City'],
                    'postal_code' => ['type' => 'string', 'description' => 'Postal code'],
                    'country' => ['type' => 'string', 'description' => 'Country (default Slovakia)'],
                    'notes' => ['type' => 'string', 'description' => 'Internal client notes'],
                    'owner' => ['type' => 'string', 'description' => 'Assigned owner name'],
                    'division' => ['type' => 'string', 'description' => 'Division name'],
                    'client_category_id' => ['type' => 'string', 'description' => 'Client category ID'],
                    'price_level_id' => ['type' => 'string', 'description' => 'Price level ID'],
                    'adjustment' => ['type' => 'number', 'description' => 'Value adjustment in EUR'],
                    'company_client_id' => ['type' => 'string', 'description' => 'Parent company client ID when client_type = person'],
                    'contact_role' => ['type' => 'string', 'description' => 'Role at parent company'],
                    'ticket_allowed_emails' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Allowed support ticket sender emails/domains'],
                    'custom_fields' => ['type' => 'object', 'description' => 'Custom attribute map keyed by attribute ID'],
                    'client_type' => ['type' => 'string', 'enum' => ['business', 'person', 'partner'], 'description' => 'Default business']
                ],
                'required' => ['name']
            ]
        ],
        [
            'name' => 'update_client',
            'description' => 'Update client information, tax credentials, pricing, category, custom fields, or archive/restore state.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Client ID'],
                    'name' => ['type' => 'string', 'description' => 'Company name'],
                    'company_id' => ['type' => 'string', 'description' => 'IČO'],
                    'tax_id' => ['type' => 'string', 'description' => 'DIČ'],
                    'vat_id' => ['type' => 'string', 'description' => 'IČ DPH'],
                    'website' => ['type' => 'string', 'description' => 'Website URL'],
                    'contact_person' => ['type' => 'string', 'description' => 'Contact person'],
                    'contact_first_name' => ['type' => 'string', 'description' => 'Contact first name'],
                    'contact_last_name' => ['type' => 'string', 'description' => 'Contact last name'],
                    'email' => ['type' => 'string', 'description' => 'Email'],
                    'phone' => ['type' => 'string', 'description' => 'Phone'],
                    'street' => ['type' => 'string', 'description' => 'Street'],
                    'city' => ['type' => 'string', 'description' => 'City'],
                    'postal_code' => ['type' => 'string', 'description' => 'Postal code'],
                    'country' => ['type' => 'string', 'description' => 'Country'],
                    'notes' => ['type' => 'string', 'description' => 'Notes'],
                    'client_type' => ['type' => 'string', 'enum' => ['business', 'person', 'partner']],
                    'owner' => ['type' => 'string', 'description' => 'Assigned owner name'],
                    'division' => ['type' => 'string', 'description' => 'Division name'],
                    'rating' => ['type' => 'integer', 'description' => 'Rating 1-5'],
                    'adjustment' => ['type' => 'number', 'description' => 'Value adjustment'],
                    'client_category_id' => ['type' => 'string', 'description' => 'Client category ID (empty clears)'],
                    'price_level_id' => ['type' => 'string', 'description' => 'Price level ID (empty clears)'],
                    'company_client_id' => ['type' => 'string', 'description' => 'Parent company ID (empty clears)'],
                    'contact_role' => ['type' => 'string', 'description' => 'Role at parent company'],
                    'ticket_allowed_emails' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Allowed ticket sender emails/domains'],
                    'custom_fields' => ['type' => 'object', 'description' => 'Custom field updates keyed by attribute ID'],
                    'archived' => ['type' => 'boolean', 'description' => 'true archives the client, false restores it']
                ],
                'required' => ['id']
            ]
        ],
        mcp_crm_defs()['list_contacts'],
        [
            'name' => 'create_contact',
            'description' => 'Create a contact person in the separate client_contacts table (linked under a company client via client_id, or standalone when client_id is omitted). Does not add a row to the Clients list.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => ['type' => 'string', 'description' => 'Optional parent company client/lead ID (omit for a standalone personal contact)'],
                    'name' => ['type' => 'string', 'description' => 'Contact person full name'],
                    'first_name' => ['type' => 'string', 'description' => 'Contact first name'],
                    'last_name' => ['type' => 'string', 'description' => 'Contact last name'],
                    'email' => ['type' => 'string', 'description' => 'Email'],
                    'phone' => ['type' => 'string', 'description' => 'Phone'],
                    'role' => ['type' => 'string', 'description' => 'Position or role at the company (legacy summary fallback)'],
                    'function_tags' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Function / category tags for the contact (e.g. ["CEO", "Billing"])'],
                    'notes' => ['type' => 'string', 'description' => 'Optional notes']
                ],
                'required' => ['name']
            ]
        ],

        // DOMAIN 3: Tasks & Collaboration
        mcp_crm_defs()['list_tasks'],
        mcp_crm_defs()['get_task'],
        mcp_crm_defs()['get_task_chat'],
        [
            'name' => 'create_task',
            'description' => 'Create a new task with assignees, dates, tags, blocking/conclusion flags, and project/client/ticket/agency links.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string', 'description' => 'Task title'],
                    'description' => ['type' => 'string', 'description' => 'Detailed task description'],
                    'priority' => ['type' => 'string', 'description' => 'Priority: low, medium, high (default medium)'],
                    'start_date' => ['type' => 'string', 'description' => 'Optional start date in YYYY-MM-DD format'],
                    'deadline' => ['type' => 'string', 'description' => 'Deadline date in YYYY-MM-DD format'],
                    'deadline_time' => ['type' => 'string', 'description' => 'Optional deadline time in HH:MM format'],
                    'status' => ['type' => 'string', 'description' => 'A configured task status (default: the first one)'],
                    'owner' => ['type' => 'string', 'description' => 'Primary assignee name'],
                    'assignees' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'List of team member names to assign'
                    ],
                    'tags' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Tags to attach'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client / lead ID'],
                    'related_agency_worker_id' => ['type' => 'string', 'description' => 'Linked rented worker ID'],
                    'ticket_id' => ['type' => 'string', 'description' => 'Linked support ticket ID (auto_resolve link)'],
                    'is_locking' => ['type' => 'boolean', 'description' => 'Blocking/milestone task flag'],
                    'requires_conclusion' => ['type' => 'boolean', 'description' => 'Require conclusion note on completion'],
                    'category' => ['type' => 'string', 'description' => 'Task category: "bug" marks the task as a Bug (counted as bug time on the dashboard); omitted or empty means no category']
                ],
                'required' => ['title', 'deadline']
            ]
        ],
        [
            'name' => 'update_task',
            'description' => 'Update an existing task: title, description, priority, dates, status, owner, category, links, flags, tags, or archive / restore it. '
                . 'Only the fields you pass change; pass an empty string for project_id, client_id, or related_agency_worker_id to unlink. Tasks are never deleted through MCP: archive one instead (archived=true); '
                . 'list_tasks hides it unless include_archived=true, and archived=false restores it.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Task ID to update'],
                    'title' => ['type' => 'string', 'description' => 'Updated title'],
                    'description' => ['type' => 'string', 'description' => 'Updated description'],
                    'priority' => ['type' => 'string', 'description' => 'Priority: low, medium, high'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD (empty clears)'],
                    'deadline' => ['type' => 'string', 'description' => 'Deadline in YYYY-MM-DD format'],
                    'deadline_time' => ['type' => 'string', 'description' => 'Deadline time in HH:MM format; empty string clears it'],
                    'status' => ['type' => 'string', 'description' => 'A configured task status'],
                    'conclusion' => ['type' => 'string', 'description' => 'How the task was finished. Required when moving a task that has "requires conclusion" set to a done status.'],
                    'requires_conclusion' => ['type' => 'boolean', 'description' => 'Require conclusion note on completion'],
                    'is_locking' => ['type' => 'boolean', 'description' => 'Blocking/milestone task flag'],
                    'owner' => ['type' => 'string', 'description' => 'Primary assignee name'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID; empty string unlinks'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client / lead ID (from list_clients, list_leads or search_entities); empty string unlinks'],
                    'related_agency_worker_id' => ['type' => 'string', 'description' => 'Linked agency worker ID; empty string unlinks'],
                    'ticket_id' => ['type' => 'string', 'description' => 'Support ticket ID to auto-resolve link'],
                    'tags' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Additional tags to attach'],
                    'archived' => ['type' => 'boolean', 'description' => 'true archives the task (the MCP way to remove one), false restores it'],
                    'category' => ['type' => 'string', 'description' => 'Task category: "bug" marks the task as a Bug; null or an empty string clears it; omitted leaves it unchanged']
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
                    'conclusion' => ['type' => 'string', 'description' => 'How the task was finished (a short note or report). Required when the task has "requires conclusion" set; otherwise optional.'],
                    'note' => ['type' => 'string', 'description' => 'Older name of conclusion']
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
        mcp_money_tool_def('list_projects'),
        mcp_money_tool_def('get_project'),
        [
            'name' => 'create_project',
            'description' => 'Create a new client project with managers, division, WhatsApp contact phone, and custom fields.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string', 'description' => 'Project title/name'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client ID'],
                    'budget' => ['type' => 'number', 'description' => 'Cost budget (not the contract value)'],
                    'value' => ['type' => 'number', 'description' => 'Contract value to be invoiced'],
                    'project_type_id' => ['type' => 'string', 'description' => 'Project type (default: the first one)'],
                    'division' => ['type' => 'string', 'description' => 'Division name'],
                    'contact_phone' => ['type' => 'string', 'description' => 'Project contact phone used to pair WhatsApp chats'],
                    'managers' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Assigned project manager user IDs or names'],
                    'custom_fields' => ['type' => 'object', 'description' => 'Custom field values keyed by project type attribute ID'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date (YYYY-MM-DD)'],
                    'invoice_date' => ['type' => 'string', 'description' => 'Invoice date (YYYY-MM-DD) - the "Invoice date" field in the app'],
                    'completion_deadline' => ['type' => 'string', 'description' => 'Deadline (YYYY-MM-DD) - the "Deadline" field in the app'],
                    'status' => ['type' => 'string', 'description' => 'A configured project status (default: the first of the "new" group)']
                ],
                'required' => ['name']
            ]
        ],
        [
            'name' => 'update_project',
            'description' => 'Update project details, dates, budget, contract value, rating, delay reason, managers, custom fields, contact phone, status or archive flag. A completed status stamps the finish date, an open one clears it, as in the app.',
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
                    'contact_phone' => ['type' => 'string', 'description' => 'Project contact phone (empty clears)'],
                    'managers' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Additional project manager user IDs or names'],
                    'custom_fields' => ['type' => 'object', 'description' => 'Custom field updates keyed by project type attribute ID'],
                    'archived' => ['type' => 'boolean', 'description' => 'Archive / restore'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date (YYYY-MM-DD)'],
                    'invoice_date' => ['type' => 'string', 'description' => 'Invoice date (YYYY-MM-DD) - the "Invoice date" field in the app'],
                    'completion_deadline' => ['type' => 'string', 'description' => 'Deadline (YYYY-MM-DD) - the "Deadline" field in the app'],
                    'acceptance_criteria' => [
                        'type' => 'array',
                        'description' => 'Merge acceptance criteria: items with an existing id update title/done (or pass remove=true for soft removal); items without an id are added with server timestamp & user (tracked as scope creep if scope is already approved).',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'id' => ['type' => 'string', 'description' => 'Existing criterion ID (omit to create new)'],
                                'title' => ['type' => 'string', 'description' => 'Criterion title (max 300 chars)'],
                                'done' => ['type' => 'boolean', 'description' => 'Whether the criterion is met'],
                                'remove' => ['type' => 'boolean', 'description' => 'true to soft-remove this criterion (keeps history)'],
                            ],
                        ],
                    ],
                    'scope_action' => ['type' => 'string', 'description' => 'Approve or withdraw baseline scope: "approve" stamps scope_approved_at/by (criteria added later count as scope creep); "withdraw" clears approval']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'manage_project_acceptance_criteria',
            'description' => 'Add, edit, check/uncheck, or soft-remove project acceptance criteria, and approve or withdraw baseline scope. Uses the same server-stamped audit trail as the app: criteria added after scope approval are automatically tracked as scope creep (returned in scope_creep).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'project_id' => ['type' => 'string', 'description' => 'Project ID'],
                    'add' => [
                        'type' => 'array',
                        'description' => 'New criteria to add (strings or {title, done?} objects). Added after scope approval = tracked as scope creep.',
                        'items' => ['type' => 'object', 'properties' => ['title' => ['type' => 'string'], 'done' => ['type' => 'boolean']]]
                    ],
                    'update' => [
                        'type' => 'array',
                        'description' => 'Existing live criteria to rename or toggle done: [{id, title?, done?}]',
                        'items' => ['type' => 'object', 'properties' => ['id' => ['type' => 'string'], 'title' => ['type' => 'string'], 'done' => ['type' => 'boolean']], 'required' => ['id']]
                    ],
                    'remove' => [
                        'type' => 'array',
                        'description' => 'Criterion IDs to soft-remove (history is preserved with removedAt/removedBy)',
                        'items' => ['type' => 'string']
                    ],
                    'scope_action' => ['type' => 'string', 'description' => '"approve" stamps baseline scope approval (subsequent additions count as scope creep); "withdraw" clears approval']
                ],
                'required' => ['project_id']
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
            'description' => 'Get the current financial operating mode: connected (live movements) or simplified (detached spreadsheet). updated_at (ISO 8601 moment) is when the mode setting last changed.',
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
            'description' => 'Get the simplified spreadsheet matrix: categories, period columns, raw equations, and evaluated cell values. updated_at (ISO 8601 moment) is when the matrix last changed, whatever the year filter.',
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
        mcp_money_tool_def('list_invoices'),
        mcp_money_tool_def('get_invoice'),
        [
            'name' => 'create_invoice',
            'description' => 'Create a DRAFT invoice with line items, numbered FA-YYYY-NNN in sequence, with its pending income movement in the ledger. Line prices are net; VAT is added per line. Sending, approving and settling money are done in the app.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => ['type' => 'string', 'description' => 'Client ID'],
                    'project_id' => ['type' => 'string', 'description' => 'Optional linked project ID for the income movement'],
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
                                'description' => ['type' => 'string', 'description' => 'Line item description'],
                                'sku' => ['type' => 'string', 'description' => 'Optional SKU'],
                                'warehouse_item_id' => ['type' => 'string', 'description' => 'Optional warehouse_items ID'],
                                'quantity' => ['type' => 'number'],
                                'unit' => ['type' => 'string', 'description' => 'Unit of measure (default ks)'],
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
            'description' => 'Set a document to draft, sent or cancelled. Statuses are configurable (Price offers → Settings): "sent" means any configured status of the open group, and "draft"/"cancelled" the draft/cancelled groups, given by its key. Proformas and invoices use their own list, offers theirs. Approving, invoicing and settling money cannot be done through MCP (they change the books). Cancelling an invoice cancels its unsettled ledger movement; money already recorded stays.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Invoice ID'],
                    'status' => ['type' => 'string', 'description' => 'The key of a status in the draft, open or cancelled group (built-ins: draft, sent, cancelled)']
                ],
                'required' => ['id', 'status']
            ]
        ],
        mcp_money_tool_def('list_expenses'),
        [
            'name' => 'record_expense',
            'description' => 'Record a planned or pending expense. Marking it paid is done in the app.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string', 'description' => 'Expense description or title'],
                    'description' => ['type' => 'string', 'description' => 'Detailed expense note'],
                    'amount' => ['type' => 'number', 'description' => 'Amount spent'],
                    'currency' => ['type' => 'string', 'description' => 'Currency (default EUR)'],
                    'category_id' => ['type' => 'string', 'description' => 'Category ID'],
                    'issue_date' => ['type' => 'string', 'description' => 'Date occurred (YYYY-MM-DD)'],
                    'status' => ['type' => 'string', 'enum' => ['planned', 'pending'], 'description' => 'Default planned'],
                    'due_date' => ['type' => 'string', 'description' => 'Due date (YYYY-MM-DD, default = issue_date)'],
                    'tax_rate' => ['type' => 'number', 'description' => 'VAT % (default workspace rate)'],
                    'payment_method' => ['type' => 'string', 'description' => 'Payment method (default bank_transfer)'],
                    'invoice_number' => ['type' => 'string', 'description' => 'Supplier invoice number / VS'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID if applicable'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client ID if applicable']
                ],
                'required' => ['title', 'amount', 'issue_date']
            ]
        ],

        // DOMAIN 6: Warehouse & Inventory
        [
            'name' => 'list_inventory_items',
            'description' => 'List warehouse stock items and current inventory levels. updated_at moves when the item record itself changes (name, prices, limits), not when stock moves: stock changes are the movements (list_stock_movements). ' . mcp_window_doc('items', MCP_INVENTORY_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'category' => ['type' => 'string', 'description' => 'Filter by item category'],
                    'low_stock_only' => ['type' => 'boolean', 'description' => 'Show only items below min_stock'],
                    'search' => ['type' => 'string', 'description' => 'Search by item name, SKU, or barcode'],
                ] + mcp_window_props(MCP_INVENTORY_WINDOW)
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
                    'default_sell_price' => ['type' => 'number', 'description' => 'Default selling price'],
                    'vat_rate' => ['type' => 'number', 'description' => 'VAT rate of this item in percent; leave out to use the company default'],
                    'pack_quantity' => ['type' => 'number', 'description' => 'Units (of "unit") in one package'],
                    'pack_unit' => ['type' => 'string', 'description' => 'Package label, e.g. "bal"'],
                    'weight_kg' => ['type' => 'number', 'description' => 'Weight of one unit in kg'],
                    'alt_codes' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Codes beside the SKU (supplier code, manufacturer code); searchable']
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
        mcp_crm_defs()['list_meetings'],
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
                    'attendees' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'List of attendee names'],
                    'attached_leads' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Attached lead IDs'],
                    'attached_clients' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Attached client IDs']
                ],
                'required' => ['title', 'date']
            ]
        ],
        [
            'name' => 'update_meeting',
            'description' => 'Update meeting details, notes, attendees, linked lead/clients, rescheduled date, or archive/restore flag.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Meeting ID'],
                    'title' => ['type' => 'string', 'description' => 'Updated title'],
                    'date' => ['type' => 'string', 'description' => 'Updated date (YYYY-MM-DD)'],
                    'duration' => ['type' => 'integer', 'description' => 'Duration in minutes'],
                    'notes' => ['type' => 'string', 'description' => 'Updated notes'],
                    'lead_id' => ['type' => 'string', 'description' => 'Linked lead or client ID (empty clears)'],
                    'attendees' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Attendee user list'],
                    'attached_leads' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Attached lead IDs'],
                    'attached_clients' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Attached client IDs'],
                    'archived' => ['type' => 'boolean', 'description' => 'true archives the meeting, false restores it']
                ],
                'required' => ['id']
            ]
        ],

        // DOMAIN 8: Communications & Notes
        mcp_crm_defs()['list_communications'],
        [
            'name' => 'log_communication',
            'description' => 'Log a client or lead phone call, interaction note, or email summary to the timeline.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'lead_id' => ['type' => 'string', 'description' => 'Lead or client ID'],
                    'type' => ['type' => 'string', 'description' => 'Type: phone, email, note, appointment (default note)'],
                    'title' => ['type' => 'string', 'description' => 'Short summary or subject'],
                    'content' => ['type' => 'string', 'description' => 'Detailed conversation content or note'],
                    'is_outgoing' => ['type' => 'boolean', 'description' => 'True if initiated by team, false if received (default true)'],
                    'timestamp' => ['type' => 'string', 'description' => 'Optional local/ISO timestamp (default: now)']
                ],
                'required' => ['lead_id', 'title']
            ]
        ],

        // DOMAIN 9: Cross-Entity Global Search
        [
            'name' => 'search_entities',
            'description' => 'Search leads, clients, tasks, projects, invoices, tickets, orders, the warehouse catalog, employees/contractors, meetings, suppliers, agency workers and custom registries (each section gated by module permissions). Every word of the query must match (case- and accent-insensitive), each in any searched field; the query run together also matches names written without spaces ("villa testa" and "villatesta" both find "Villatesta"). Lead/client and project rows carry a `url` into the web app.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Search words'],
                    'entity_types' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'Optional filter: leads, clients, tasks, projects, invoices, tickets, orders, warehouse, employees, meetings, suppliers, agency_workers, unified_entries'
                    ],
                    'limit' => ['type' => 'integer', 'description' => 'Rows per section (default 15, max 50)']
                ],
                'required' => ['query']
            ]
        ],

        // DOMAIN 10: Team Directory (Read-Only)
        [
            'name' => 'list_team_members',
            'description' => ('List ' . KOPERNIQ_PRODUCT_NAME . ' team members available for assigning tasks and projects (passwords excluded). ' . mcp_window_doc('members', MCP_TEAM_WINDOW)),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => ['type' => 'string', 'description' => 'Search name or email'],
                    'role' => ['type' => 'string', 'description' => 'Filter by role']
                ] + mcp_window_props(MCP_TEAM_WINDOW)
            ]
        ],

        // DOMAIN 11: Employees, Salaries & Vacations
        [
            'name' => 'list_employees',
            'description' => 'List the staff roster. Every record has a kind (employee = a person, contractor = an external supplier broken down by contractor_type into person [freelancer], sole_trader, or company, ledger = a payroll-only line such as commission), first_name + last_name for a person/person-contractor or company_name for sole_trader/company/ledger, company_id (IČO), tax_id (DIČ) and vat_id (IČ DPH), work_country (SK | HU | null), job position, department, compensation rates, contact details, vacation allowances and linked user_id. ' . mcp_window_doc('records', MCP_EMPLOYEE_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'search' => ['type' => 'string', 'description' => 'Search by name, position, department, email, PIN, or phone'],
                    'kind' => ['type' => 'string', 'enum' => ['employee', 'contractor', 'ledger'], 'description' => 'Only this kind.'],
                    'contractor_type' => ['type' => 'string', 'enum' => ['person', 'sole_trader', 'company'], 'description' => 'Only contractors of this subtype (person = freelancer, sole_trader = živnostník, company = firma)'],
                    'position' => ['type' => 'string', 'description' => 'Only this exact position (case-insensitive), e.g. "programátor"'],
                    'department' => ['type' => 'string', 'description' => 'Only this exact department (case-insensitive), e.g. "Marketing"'],
                    'active_only' => ['type' => 'boolean', 'description' => 'Filter by active employees only (default true)']
                ] + mcp_window_props(MCP_EMPLOYEE_WINDOW)
            ]
        ],
        [
            'name' => 'get_employee',
            'description' => 'Retrieve full employee details by ID including contractor_type, work_country, allowances, salary configuration, and recent payroll.',
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
            'description' => 'Register a new record in the staff roster. kind employee (default) or contractor with contractor_type="person" (freelancer, no IČO/DIČ/company_name) needs first_name and last_name; contractor (sole_trader or company) and ledger need company_name instead.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'kind' => ['type' => 'string', 'enum' => ['employee', 'contractor', 'ledger'], 'description' => 'employee = a person (default); contractor = external supplier; ledger = accounting line'],
                    'contractor_type' => ['type' => 'string', 'enum' => ['person', 'sole_trader', 'company'], 'description' => 'External supplier subtype for kind=contractor (person = freelancer with first_name/last_name and no IČO/DIČ/company_name; sole_trader; company default)'],
                    'first_name' => ['type' => 'string', 'description' => 'First name (kind employee or contractor_type=person; optional contact person of sole_trader/company)'],
                    'last_name' => ['type' => 'string', 'description' => 'Surname (kind employee or contractor_type=person; optional contact person of sole_trader/company)'],
                    'company_name' => ['type' => 'string', 'description' => 'Company or trade name (contractor sole_trader/company or ledger only; refused for contractor_type=person)'],
                    'company_id' => ['type' => 'string', 'description' => 'IČO (contractor sole_trader/company only)'],
                    'tax_id' => ['type' => 'string', 'description' => 'DIČ (contractor sole_trader/company only)'],
                    'vat_id' => ['type' => 'string', 'description' => 'IČ DPH (contractor sole_trader/company only)'],
                    'name' => ['type' => 'string', 'description' => 'Fallback when parts are not split: "First Last" for a person/person-contractor, company name otherwise'],
                    'position' => ['type' => 'string', 'description' => 'Job title'],
                    'department' => ['type' => 'string', 'description' => 'Department / team'],
                    'pin' => ['type' => 'string', 'description' => 'Personal ID number / Rodné číslo'],
                    'email' => ['type' => 'string', 'description' => 'Email address'],
                    'phone' => ['type' => 'string', 'description' => 'Phone number'],
                    'address_street' => ['type' => 'string', 'description' => 'Street address'],
                    'address_city' => ['type' => 'string', 'description' => 'City'],
                    'address_zip' => ['type' => 'string', 'description' => 'Postal code'],
                    'address_country' => ['type' => 'string', 'description' => 'Country (default Slovakia)'],
                    'work_country' => ['type' => 'string', 'description' => 'Public holiday calendar override: SK, HU, or empty'],
                    'notes' => ['type' => 'string', 'description' => 'Internal HR notes (requires employees.personal)'],
                    'salary_type' => ['type' => 'string', 'enum' => ['monthly', 'daily', 'hourly'], 'description' => 'Salary period type'],
                    'salary_amount' => ['type' => 'number', 'description' => 'Base salary rate in EUR'],
                    'salary_due_day' => ['type' => 'integer', 'description' => 'Day of the month for payout (e.g. 15)'],
                    'auto_expense' => ['type' => 'boolean', 'description' => 'Automatically create expense records in Financial Management'],
                    'expense_category_id' => ['type' => 'string', 'description' => 'Financial category ID for auto-expense']
                ]
            ]
        ],
        [
            'name' => 'update_employee',
            'description' => 'Update an existing employee profile, kind, contractor_type, name, position, department, work_country, salary rate, address, or notes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Employee ID'],
                    'kind' => ['type' => 'string', 'enum' => ['employee', 'contractor', 'ledger']],
                    'contractor_type' => ['type' => 'string', 'enum' => ['person', 'sole_trader', 'company'], 'description' => 'External supplier subtype for kind=contractor'],
                    'first_name' => ['type' => 'string', 'description' => 'First name'],
                    'last_name' => ['type' => 'string', 'description' => 'Surname'],
                    'company_name' => ['type' => 'string', 'description' => 'Company/trade name (refused when contractor_type=person)'],
                    'company_id' => ['type' => 'string', 'description' => 'IČO (sole_trader/company contractor only; empty clears)'],
                    'tax_id' => ['type' => 'string', 'description' => 'DIČ (sole_trader/company contractor only; empty clears)'],
                    'vat_id' => ['type' => 'string', 'description' => 'IČ DPH (sole_trader/company contractor only; empty clears)'],
                    'name' => ['type' => 'string', 'description' => 'Fallback display name'],
                    'position' => ['type' => 'string', 'description' => 'Job title; empty clears'],
                    'department' => ['type' => 'string', 'description' => 'Department / team; empty clears'],
                    'pin' => ['type' => 'string', 'description' => 'Personal ID number'],
                    'email' => ['type' => 'string', 'description' => 'Email address'],
                    'phone' => ['type' => 'string', 'description' => 'Phone number'],
                    'address_street' => ['type' => 'string', 'description' => 'Street address'],
                    'address_city' => ['type' => 'string', 'description' => 'City'],
                    'address_zip' => ['type' => 'string', 'description' => 'Postal code'],
                    'address_country' => ['type' => 'string', 'description' => 'Country'],
                    'work_country' => ['type' => 'string', 'description' => 'Holiday calendar override SK | HU (empty clears)'],
                    'notes' => ['type' => 'string', 'description' => 'HR notes'],
                    'salary_type' => ['type' => 'string', 'enum' => ['monthly', 'daily', 'hourly']],
                    'salary_amount' => ['type' => 'number', 'description' => 'Salary rate in EUR'],
                    'salary_due_day' => ['type' => 'integer', 'description' => 'Day of month for payout'],
                    'auto_expense' => ['type' => 'boolean', 'description' => 'Auto-expense enabled'],
                    'expense_category_id' => ['type' => 'string', 'description' => 'Financial category ID for auto-expense'],
                    'is_active' => ['type' => 'boolean', 'description' => 'Active employment status']
                ],
                'required' => ['id']
            ]
        ],
        [
            'name' => 'list_salaries',
            'description' => 'Query salary and payment records for employees by period (year, month), employee ID, payout due date (due_from/due_to) or the day it was paid (payment_from/payment_to). closed_at is the moment the month was closed (paid in full), as an ISO 8601 moment. ' . mcp_window_doc('records', MCP_SALARY_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Filter by employee ID'],
                    'year' => ['type' => 'integer', 'description' => 'Filter by year (e.g. 2026)'],
                    'period_key' => ['type' => 'string', 'description' => 'Filter by period key (e.g. 2026-09)']
                ] + mcp_date_range_props('due', 'Payout due date') + mcp_date_range_props('payment', 'Payment date') + mcp_window_props(MCP_SALARY_WINDOW)
            ]
        ],
        [
            'name' => 'record_salary_payout',
            'description' => 'Record the monthly salary obligation and payment of an employee (YYYY-MM). Mirrors the app: creates/updates the linked payroll expense when the employee has auto-expense on. Paid is measured against labor_cost (Cena práce) once set, otherwise against total_salary. A closed period (paid in full once), or one split into components, is refused (edit it in the app).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Employee ID'],
                    'period_key' => ['type' => 'string', 'description' => 'Period key (e.g. 2026-09)'],
                    'year' => ['type' => 'integer', 'description' => 'Year'],
                    'period_number' => ['type' => 'integer', 'description' => 'Month (1-12) or week (1-53)'],
                    'total_salary' => ['type' => 'number', 'description' => 'Gross salary obligation amount'],
                    'total_paid' => ['type' => 'number', 'description' => 'Actual amount paid so far'],
                    'labor_cost' => ['type' => 'number', 'description' => 'Optional total employer labour cost (Cena práce)'],
                    'net_pay' => ['type' => 'number', 'description' => 'Optional employee net payout (Na výplatu)'],
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
            'description' => 'List vacation and absence entries with optional filtering by employee, status, year of the start, or a date range: from/to (YYYY-MM-DD, inclusive) return every entry with a day inside the range. ' . mcp_window_doc('entries', MCP_VACATION_WINDOW),
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Filter by employee ID'],
                    'status' => ['type' => 'string', 'enum' => ['requested', 'pending', 'approved', 'rejected', 'taken']],
                    'year' => ['type' => 'integer', 'description' => 'Filter by the year the entry starts in'],
                    'from' => ['type' => 'string', 'description' => 'Entries that end on or after this date (YYYY-MM-DD)'],
                    'to' => ['type' => 'string', 'description' => 'Entries that start on or before this date (YYYY-MM-DD)'],
                ] + mcp_window_props(MCP_VACATION_WINDOW)
            ]
        ],
        [
            'name' => 'record_vacation',
            'description' => 'Log a vacation entry for an employee. Dates must be valid and must not overlap other leave; omits days_count to auto-calculate business working days excluding public holidays.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'employee_id' => ['type' => 'string', 'description' => 'Employee ID'],
                    'vacation_type_id' => ['type' => 'string', 'description' => 'Vacation type ID (annual, worked_days, sick, unpaid, ...)'],
                    'start_date' => ['type' => 'string', 'description' => 'Start date (YYYY-MM-DD)'],
                    'end_date' => ['type' => 'string', 'description' => 'End date (YYYY-MM-DD)'],
                    'days_count' => ['type' => 'number', 'description' => 'Total working days (auto-calculated excluding weekends & holidays if omitted)'],
                    'status' => ['type' => 'string', 'enum' => ['requested', 'pending', 'approved', 'rejected', 'taken'], 'description' => 'Status (default pending)'],
                    'note' => ['type' => 'string', 'description' => 'Note or reason']
                ],
                'required' => ['employee_id', 'start_date', 'end_date']
            ]
        ],

        // DOMAIN 12: WhatsApp (WAAI) Live Messaging
        [
            'name' => 'whatsapp_list_chats',
            'description' => 'List WhatsApp chats and groups from the connected WhatsApp (WAAI) channel. Supports filtering by search query or chat type (all, groups, contacts).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Optional search string to filter chats by contact name, group name, phone number, participant name, or message preview.'],
                    'type' => ['type' => 'string', 'enum' => ['all', 'groups', 'contacts'], 'description' => 'Filter by chat type: all (default), groups, or contacts.'],
                    'limit' => ['type' => 'integer', 'description' => 'Maximum number of chats to return (default 30, max 100).'],
                    'connector_id' => ['type' => 'string', 'description' => 'Optional WhatsApp connector ID.']
                ]
            ]
        ],
        [
            'name' => 'whatsapp_read_messages',
            'description' => 'Read the message history of a WhatsApp contact or group chat by chat name (e.g. "Managment Cstudios", "Roland Vanyek"), phone number, or WhatsApp JID.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'chat' => ['type' => 'string', 'description' => 'Target WhatsApp chat name, group name, participant name, phone number, or JID.'],
                    'limit' => ['type' => 'integer', 'description' => 'Number of most recent messages to return (default 30, max 100).'],
                    'connector_id' => ['type' => 'string', 'description' => 'Optional WhatsApp connector ID.']
                ],
                'required' => ['chat']
            ]
        ],
        [
            'name' => 'whatsapp_send_message',
            'description' => 'Send a WhatsApp message (or reply) to a contact or group chat via the connected WhatsApp (WAAI) channel.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'chat' => ['type' => 'string', 'description' => 'Target WhatsApp chat name, group name, phone number, or JID.'],
                    'message' => ['type' => 'string', 'description' => 'The exact text message to send on WhatsApp.'],
                    'connector_id' => ['type' => 'string', 'description' => 'Optional WhatsApp connector ID.']
                ],
                'required' => ['chat', 'message']
            ]
        ],
        [
            'name' => 'whatsapp_sync_chat',
            'description' => 'Trigger a live on-demand WhatsApp sync (fetchMessageHistory) for a specific chat/group or the entire WhatsApp (WAAI) connector.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'chat' => ['type' => 'string', 'description' => 'Optional chat name, phone number, or JID to sync on-demand.'],
                    'connector_id' => ['type' => 'string', 'description' => 'Optional WhatsApp connector ID.']
                ]
            ]
        ]
    ];
}

/**
 * The identity columns for a create or an update: kind, first/last name (a person) or the single
 * company / item name, and the display name derived from them. $stored is the current row on an
 * update. Returns null on an update that touches none of the name fields, so a legacy record whose
 * name is still a nickname can have its position set without being forced to complete the name.
 */
function mcp_resolve_employee_identity(array $args, ?array $stored): ?array {
    $touches = false;
    foreach (['kind', 'contractor_type', 'first_name', 'last_name', 'company_name', 'name'] as $k) {
        if (array_key_exists($k, $args)) $touches = true;
    }
    if ($stored !== null && !$touches) return null;

    $kind = (string)($args['kind'] ?? $stored['kind'] ?? 'employee');
    if (!in_array($kind, CCRM_EMPLOYEE_KINDS, true)) {
        throw new \InvalidArgumentException("kind must be one of: " . implode(', ', CCRM_EMPLOYEE_KINDS) . ".");
    }
    $clean = static fn($v): ?string => ($v === null || trim((string)$v) === '') ? null : trim((string)$v);

    if ($kind === 'contractor') {
        $ctype = $clean($args['contractor_type'] ?? ($stored['contractor_type'] ?? null)) ?? 'company';
        if (!in_array($ctype, CCRM_CONTRACTOR_TYPES, true)) {
            throw new \InvalidArgumentException("contractor_type must be one of: " . implode(', ', CCRM_CONTRACTOR_TYPES) . ".");
        }
        if ($ctype === 'person') {
            if ($clean($args['company_name'] ?? null) !== null) {
                throw new \InvalidArgumentException("company_name does not apply when contractor_type is 'person'; use first_name and last_name.");
            }
            $first = array_key_exists('first_name', $args) ? $clean($args['first_name']) : $clean($stored['first_name'] ?? null);
            $last = array_key_exists('last_name', $args) ? $clean($args['last_name']) : $clean($stored['last_name'] ?? null);
            if (($first === null || $last === null) && !array_key_exists('first_name', $args) && !array_key_exists('last_name', $args) && $clean($args['name'] ?? null) !== null) {
                $split = ccrm_split_person_name((string)$args['name']);
                if ($split !== null) [$first, $last] = $split;
            }
            if ($first === null || $last === null) {
                throw new \InvalidArgumentException("A person contractor (freelancer) needs both first_name and last_name.");
            }
            return [
                'kind' => 'contractor', 'contractor_type' => 'person',
                'first_name' => $first, 'last_name' => $last,
                'name' => ccrm_compose_employee_name('contractor', $first, $last, '', 'person'),
            ];
        }
        $company = $clean($args['company_name'] ?? $args['name'] ?? null);
        $storedCtype = ($stored !== null && ($stored['kind'] ?? '') === 'contractor') ? ($clean($stored['contractor_type'] ?? null) ?? 'company') : null;
        if ($company === null && $stored !== null && ($stored['kind'] ?? 'employee') !== 'employee' && $storedCtype !== 'person') {
            $company = $clean($stored['name'] ?? null);
        }
        if ($company === null) throw new \InvalidArgumentException("A contractor needs company_name.");
        $first = array_key_exists('first_name', $args) ? $clean($args['first_name']) : $clean($stored['first_name'] ?? null);
        $last = array_key_exists('last_name', $args) ? $clean($args['last_name']) : $clean($stored['last_name'] ?? null);
        return ['kind' => 'contractor', 'contractor_type' => $ctype, 'first_name' => $first, 'last_name' => $last, 'name' => $company];
    }

    if ($kind === 'ledger') {
        $company = $clean($args['company_name'] ?? $args['name'] ?? null);
        if ($company === null && $stored !== null && ($stored['kind'] ?? 'employee') === 'ledger') {
            $company = $clean($stored['name'] ?? null);
        }
        if ($company === null) throw new \InvalidArgumentException("A ledger needs company_name.");
        return ['kind' => 'ledger', 'contractor_type' => null, 'first_name' => null, 'last_name' => null, 'name' => $company];
    }

    $first = array_key_exists('first_name', $args) ? $clean($args['first_name']) : $clean($stored['first_name'] ?? null);
    $last = array_key_exists('last_name', $args) ? $clean($args['last_name']) : $clean($stored['last_name'] ?? null);
    // Only a combined "First Last" was given: split it when that is unambiguous.
    if (($first === null || $last === null) && !array_key_exists('first_name', $args) && !array_key_exists('last_name', $args) && $clean($args['name'] ?? null) !== null) {
        $split = ccrm_split_person_name((string)$args['name']);
        if ($split !== null) [$first, $last] = $split;
    }
    if ($first === null || $last === null) {
        throw new \InvalidArgumentException("An employee needs both first_name and last_name (full name). For a company use kind contractor with company_name.");
    }
    return ['kind' => 'employee', 'contractor_type' => null, 'first_name' => $first, 'last_name' => $last, 'name' => ccrm_compose_employee_name('employee', $first, $last, '')];
}

/**
 * IČO / DIČ / IČ DPH columns for a create or an update. They belong to sole_trader/company contractors only:
 * any other kind or contractor_type='person' has them cleared, and passing one is refused rather than silently dropped.
 *
 * @return array<string,?string>
 */
function mcp_employee_company_ids(array $args, string $kind, ?string $contractorType, bool $onlyGiven): array {
    $out = [];
    foreach (['company_id', 'tax_id', 'vat_id'] as $k) {
        $given = array_key_exists($k, $args);
        $v = $given ? trim((string)$args[$k]) : '';
        if ($kind !== 'contractor') {
            if ($v !== '') throw new \InvalidArgumentException("{$k} applies to kind contractor only.");
            $out[$k] = null;
            continue;
        }
        if (($contractorType ?? 'company') === 'person') {
            if ($v !== '') throw new \InvalidArgumentException("{$k} does not apply when contractor_type is 'person'.");
            $out[$k] = null;
            continue;
        }
        if ($onlyGiven && !$given) continue;
        $out[$k] = $v === '' ? null : $v;
    }
    return $out;
}

/** Add company_name for sole_trader/company contractor and ledger rows. */
function mcp_label_employee(array $row): array {
    $kind = $row['kind'] ?? 'employee';
    $ctype = $row['contractor_type'] ?? 'company';
    if ($kind === 'ledger' || ($kind === 'contractor' && $ctype !== 'person')) {
        $row['company_name'] = $row['name'] ?? null;
    }
    return $row;
}

function mcp_strip_keys(array $row, array $keys): array {
    foreach ($keys as $k) { unset($row[$k]); }
    return $row;
}

/**
 * An employee row limited to the field groups the key owner may read, the same split the
 * sync GET applies (ccrm_project_employee_row): personal data, pay, leave and documents
 * each sit behind their own toggle on top of `employees`.
 */
function mcp_project_employee(array $row): array {
    $groups = [
        'employees.personal' => ['pin', 'phone', 'address_street', 'address_city', 'address_zip', 'address_country', 'notes'],
        'employees.salaries' => ['salary_type', 'salary_amount', 'salary_due_day', 'auto_expense', 'expense_category_id'],
        'employees.vacations' => ['vacation_allowances_json'],
        'employees.files' => ['files_json'],
    ];
    foreach ($groups as $permission => $columns) {
        if (!mcp_can($permission)) {
            $row = mcp_strip_keys($row, $columns);
        }
    }
    return $row;
}

/**
 * Without tasks.view_all a caller sees only tasks assigned to them, or that
 * they own or created (the app's canViewTask rule plus the creator follow-up).
 * Returns [sqlFragment, params] to AND onto a query on `tasks` (alias optional).
 */
function mcp_task_scope(array $user, string $alias = ''): array {
    return mcp_task_scope_for($user, $alias); // name or e-mail, like ccrm_task_scope_sql (mcp_lists_crm.php)
}

// ============================================================================
// TOOL EXECUTION DISPATCHER
// ============================================================================
function mcp_execute_tool(\PDO $pdo, array $user, string $tool, array $args): mixed {
    switch ($tool) {
        // --- 1. Leads & Pipeline ---
        case 'list_leads':
            return mcp_list_leads($pdo, $user, $args);

        case 'get_lead':
            return mcp_get_lead($pdo, $user, $args);

        case 'create_lead':
            return mcp_crm_plus_create_lead($pdo, $user, $args);

        case 'update_lead':
            return mcp_crm_plus_update_lead($pdo, $user, $args);

        case 'transition_lead_stage':
            return mcp_crm_plus_transition_lead_stage($pdo, $user, $args);

        case 'convert_lead_to_client':
            return mcp_crm_plus_convert_lead($pdo, $user, $args);

        // --- 2. Clients & Contacts ---
        case 'list_clients':
            return mcp_do_list_clients($pdo, $args);

        case 'get_client':
            return mcp_crm_plus_get_client($pdo, $args);

        case 'create_client':
            return mcp_do_create_client($pdo, $user, $args);

        case 'update_client':
            return mcp_crm_plus_update_client($pdo, $user, $args);

        case 'list_contacts':
            return mcp_list_contacts($pdo, $args);

        case 'create_contact':
            return mcp_crm_plus_create_contact($pdo, $user, $args);

        // --- 3. Tasks & Collaboration ---
        case 'list_tasks':
            return mcp_list_tasks($pdo, $user, $args);

        case 'get_task':
            return mcp_get_task($pdo, $user, $args);

        case 'get_task_chat':
            return mcp_get_task_chat($pdo, $user, $args);

        case 'create_task':
            return mcp_do_create_task($pdo, $user, $args);

        case 'update_task':
            return mcp_do_update_task($pdo, $user, $args);

        case 'complete_task':
            return mcp_do_complete_task($pdo, $user, $args);

        case 'add_task_comment':
            return mcp_crm_plus_add_task_comment($pdo, $user, $args);

        // --- 4. Projects & Gantt Roadmaps ---
        case 'list_projects':
            return mcp_list_projects($pdo, $user, $args);

        case 'get_project':
            return mcp_get_project($pdo, $user, $args);

        case 'create_project':
            $id = mcp_create_project_row($pdo, $args);
            $created = $pdo->prepare("SELECT name, status, budget, value FROM projects WHERE id = ?");
            $created->execute([$id]);
            $row = $created->fetch(\PDO::FETCH_ASSOC);
            mcp_audit($pdo, $user, 'project_create', "Created project '{$row['name']}' (ID: $id)");
            return ['success' => true, 'id' => $id, 'name' => $row['name'], 'status' => $row['status'], 'budget' => $row['budget'] === null ? null : (float)$row['budget'], 'value' => $row['value'] === null ? null : (float)$row['value']];

        case 'update_project':
            return mcp_do_update_project($pdo, $user, $args);

        case 'manage_project_acceptance_criteria':
            return mcp_do_manage_project_acceptance_criteria($pdo, $user, $args);

        case 'create_milestone':
            return mcp_crm_plus_create_milestone($pdo, $user, $args);

        // --- 5. Financials & Invoicing ---
        case 'get_financial_mode':
            $modeStmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'FINANCIAL_MODE'");
            $currentMode = $modeStmt->fetchColumn() ?: 'connected';
            return [
                'mode' => $currentMode,
                'updated_at' => mcp_setting_moment($pdo, 'FINANCIAL_MODE'),
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
                'updated_at' => mcp_setting_moment($pdo, 'FINANCIAL_SIMPLIFIED_TABLE'),
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
            $period = isset($args['period']) && in_array(strtolower((string)$args['period']), ['month', 'quarter', 'year', 'all'], true)
                ? strtolower((string)$args['period']) : 'year';
            
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
                $validCols = $period === 'all' ? null : array_flip(array_column(mcp_financial_period_columns($pdo, $year, $period), 'id'));

                foreach ($cells as $k => $expr) {
                    $parts = explode(':', $k, 2);
                    if (count($parts) !== 2) continue;
                    list($cId, $colId) = $parts;
                    if ($validCols !== null && !isset($validCols[$colId])) continue;

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
                    'period' => $period,
                    'currency' => 'EUR',
                    'paid_revenue' => round($paidRevenue, 2),
                    'planned_revenue' => round($paidRevenue, 2),
                    'paid_expenses' => round($paidCost, 2),
                    'planned_expenses' => round($paidCost, 2),
                    'net_profit' => round($paidRevenue - $paidCost, 2),
                    'unpaid_invoices_count' => 0
                ];
            }

            return mcp_financial_summary_connected($pdo, $year, $period);

        case 'list_invoices':
            return mcp_list_invoices($pdo, $user, $args);

        case 'get_invoice':
            return mcp_get_invoice($pdo, $user, $args);

        case 'create_invoice':
            return mcp_do_create_invoice($pdo, $user, $args);

        case 'update_invoice_status':
            return mcp_do_update_invoice_status($pdo, $user, $args);

        case 'list_expenses':
            return mcp_list_expenses($pdo, $user, $args);

        case 'record_expense':
            return mcp_do_record_expense($pdo, $user, $args);

        // --- 6. Warehouse & Inventory ---
        case 'list_inventory_items':
            return mcp_list_inventory_items($pdo, $user, $args);

        case 'get_inventory_item':
            return mcp_get_inventory_item($pdo, $user, $args);

        case 'create_inventory_item':
            $id = 'whi_' . bin2hex(random_bytes(8));
            $sku = mcp_require_string($args, 'sku');
            $name = mcp_require_string($args, 'name');
            $desc = $args['description'] ?? null;
            $cat = $args['category'] ?? null;
            $unit = $args['unit'] ?? 'ks';
            $minStock = mcp_number($args, 'min_stock', false, 0) ?? 0.0;
            $sellPrice = mcp_number($args, 'default_sell_price', false, 0) ?? 0.0;
            $vatRate = mcp_number($args, 'vat_rate', false, 0);
            if ($vatRate !== null && $vatRate > 100) throw new \InvalidArgumentException("'vat_rate' must be between 0 and 100.");
            $packQty = mcp_number($args, 'pack_quantity', false, 0);
            $weight = mcp_number($args, 'weight_kg', false, 0);
            $altCodes = [];
            foreach ((array)($args['alt_codes'] ?? []) as $code) {
                $code = trim((string)$code);
                if ($code !== '' && !in_array(mb_strtolower($code), array_map('mb_strtolower', $altCodes), true)) $altCodes[] = mb_substr($code, 0, 100);
            }
            $dupSku = $pdo->prepare("SELECT 1 FROM warehouse_items WHERE sku = ?");
            $dupSku->execute([$sku]);
            if ($dupSku->fetchColumn()) throw new \InvalidArgumentException("SKU {$sku} already exists.");

            $stmt = $pdo->prepare(
                "INSERT INTO warehouse_items (id, sku, name, description, category, unit, min_stock, default_sell_price, vat_rate, pack_quantity, pack_unit, weight_kg, alt_codes_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([
                $id, $sku, $name, $desc, $cat, $unit, $minStock, $sellPrice, $vatRate,
                ($packQty !== null && $packQty > 0) ? $packQty : null,
                isset($args['pack_unit']) && trim((string)$args['pack_unit']) !== '' ? mb_substr(trim((string)$args['pack_unit']), 0, 30) : null,
                $weight,
                // slashes stay unescaped, so a code like BR/100 is found by a plain LIKE
                $altCodes ? json_encode($altCodes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            ]);

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
            return mcp_list_meetings($pdo, $args);

        case 'schedule_meeting':
            return mcp_crm_plus_schedule_meeting($pdo, $user, $args);

        case 'update_meeting':
            return mcp_crm_plus_update_meeting($pdo, $user, $args);

        // --- 8. Communications & Notes ---
        case 'list_communications':
            return mcp_list_communications($pdo, $user, $args);

        case 'log_communication':
            return mcp_crm_plus_log_communication($pdo, $user, $args);

        // --- 9. Cross-Entity Global Search ---
        case 'search_entities':
            // Each section is gated by its module inside (mcp_ext_intel.php).
            return mcp_search_entities($pdo, $user, $args);

        // --- 10. Team Directory (Read-Only) ---
        case 'list_team_members':
            return mcp_list_team_members($pdo, $user, $args);

        // --- 11. Employees, Salaries & Vacations ---
        case 'list_employees':
            return mcp_list_employees($pdo, $user, $args);

        case 'get_employee':
            return mcp_get_employee($pdo, $user, $args);

        case 'create_employee':
            $id = 'emp-' . bin2hex(random_bytes(6));
            $identity = mcp_resolve_employee_identity($args, null);
            $name = $identity['name'];
            $workCountry = null;
            if (isset($args['work_country']) && trim((string)$args['work_country']) !== '') {
                $wc = strtoupper(trim((string)$args['work_country']));
                if (!in_array($wc, ['SK', 'HU'], true)) throw new \InvalidArgumentException("work_country must be 'SK', 'HU', or empty.");
                $workCountry = $wc;
            }

            $ins = $pdo->prepare("INSERT INTO employees (
                id, name, first_name, last_name, kind, contractor_type, company_id, tax_id, vat_id, `position`, `department`, pin, email, phone, address_street, address_city, address_zip, address_country, work_country, notes,
                salary_type, salary_amount, salary_due_day, auto_expense, expense_category_id, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
            $companyIds = mcp_employee_company_ids($args, $identity['kind'], $identity['contractor_type'], false);
            $ins->execute([
                $id,
                $name,
                $identity['first_name'],
                $identity['last_name'],
                $identity['kind'],
                $identity['contractor_type'],
                $companyIds['company_id'],
                $companyIds['tax_id'],
                $companyIds['vat_id'],
                !empty($args['position']) ? trim((string)$args['position']) : null,
                !empty($args['department']) ? trim((string)$args['department']) : null,
                mcp_can('employees.personal') ? ($args['pin'] ?? null) : null,
                $args['email'] ?? null,
                mcp_can('employees.personal') ? ($args['phone'] ?? null) : null,
                mcp_can('employees.personal') ? ($args['address_street'] ?? null) : null,
                mcp_can('employees.personal') ? ($args['address_city'] ?? null) : null,
                mcp_can('employees.personal') ? ($args['address_zip'] ?? null) : null,
                mcp_can('employees.personal') ? ($args['address_country'] ?? 'Slovakia') : 'Slovakia',
                $workCountry,
                mcp_can('employees.personal') ? ($args['notes'] ?? null) : null,
                mcp_can('employees.salaries') ? ($args['salary_type'] ?? 'monthly') : 'monthly',
                mcp_can('employees.salaries') ? (float)($args['salary_amount'] ?? 0) : 0.0,
                (mcp_can('employees.salaries') && isset($args['salary_due_day'])) ? (int)$args['salary_due_day'] : null,
                !empty($args['auto_expense']) ? 1 : 0,
                mcp_can('employees.salaries') ? ($args['expense_category_id'] ?? null) : null
            ]);

            mcp_audit($pdo, $user, 'create_employee', "Created employee {$name} ({$id})");
            return ['id' => $id, 'name' => $name, 'kind' => $identity['kind'], 'contractor_type' => $identity['contractor_type'], 'first_name' => $identity['first_name'], 'last_name' => $identity['last_name'], 'message' => "Employee created successfully."];

        case 'update_employee':
            $id = $args['id'];
            $fields = [];
            $params = [];
            // Pay fields are writable only with employees.salaries, personal data only with employees.personal.
            if (!mcp_can('employees.salaries')) {
                foreach (['salary_type', 'salary_amount', 'salary_due_day', 'auto_expense', 'expense_category_id'] as $f) {
                    if (isset($args[$f])) {
                        throw new \Exception("Field '{$f}' needs the employees.salaries permission.");
                    }
                }
            }
            if (!mcp_can('employees.personal')) {
                foreach (['pin', 'phone', 'address_street', 'address_city', 'address_zip', 'address_country', 'notes'] as $f) {
                    if (isset($args[$f])) {
                        throw new \Exception("Field '{$f}' needs the employees.personal permission.");
                    }
                }
            }
            foreach (['pin', 'email', 'phone', 'address_street', 'address_city', 'address_zip', 'address_country', 'notes', 'salary_type', 'expense_category_id'] as $f) {
                if (array_key_exists($f, $args)) {
                    $fields[] = "`$f` = ?";
                    $params[] = $args[$f] === '' ? null : $args[$f];
                }
            }
            if (array_key_exists('work_country', $args)) {
                $wc = strtoupper(trim((string)$args['work_country']));
                if ($wc !== '' && !in_array($wc, ['SK', 'HU'], true)) throw new \InvalidArgumentException("work_country must be 'SK', 'HU', or empty.");
                $fields[] = '`work_country` = ?';
                $params[] = $wc === '' ? null : $wc;
            }
            // Identity: kind, contractor_type, first/last name or company name.
            $curStmt = $pdo->prepare("SELECT name, first_name, last_name, kind, contractor_type FROM employees WHERE id = ? LIMIT 1");
            $curStmt->execute([$id]);
            $cur = $curStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$cur) throw new \Exception("Employee not found with ID: " . $id);
            $identity = mcp_resolve_employee_identity($args, $cur);
            if ($identity !== null) {
                foreach (['name', 'first_name', 'last_name', 'kind', 'contractor_type'] as $f) {
                    $fields[] = "`$f` = ?";
                    $params[] = $identity[$f];
                }
            }
            // IČO / DIČ / IČ DPH: only sole_trader/company contractors have them; switching to person or other kind clears them.
            $finalKind = $identity['kind'] ?? $cur['kind'] ?? 'employee';
            $finalCtype = $identity['contractor_type'] ?? ($finalKind === 'contractor' ? ($cur['contractor_type'] ?? 'company') : null);
            $subtypeChanged = $identity !== null && ($identity['kind'] !== ($cur['kind'] ?? 'employee') || ($identity['contractor_type'] ?? null) !== ($cur['contractor_type'] ?? null));
            $touchesIds = $subtypeChanged || array_intersect(['company_id', 'tax_id', 'vat_id'], array_keys($args));
            foreach ($touchesIds ? mcp_employee_company_ids($args, $finalKind, $finalCtype, !$subtypeChanged) : [] as $f => $v) {
                $fields[] = "`$f` = ?";
                $params[] = $v;
            }
            foreach (['position', 'department'] as $f) {
                if (array_key_exists($f, $args)) {
                    $fields[] = "`$f` = ?";
                    $params[] = trim((string)$args[$f]) === '' ? null : trim((string)$args[$f]);
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
            return mcp_list_salaries($pdo, $user, $args);

        case 'record_salary_payout':
            return mcp_do_record_salary_payout($pdo, $user, $args);

        case 'list_vacations':
            return mcp_list_vacations($pdo, $user, $args);

        case 'record_vacation':
            return mcp_do_record_vacation($pdo, $user, $args);

        case 'whatsapp_list_chats':
        case 'whatsapp_read_messages':
        case 'whatsapp_send_message':
        case 'whatsapp_sync_chat':
            require_once __DIR__ . '/marveen/marveen_lib.php';
            $waExec = ccrm_marveen_execute_whatsapp_tool($pdo, null, $tool, $args, (string)($user['id'] ?? ''));
            if ($tool === 'whatsapp_send_message') {
                mcp_audit($pdo, $user, 'whatsapp_send', 'Sent WhatsApp message to ' . (string)($args['chat'] ?? '?'));
            } elseif ($tool === 'whatsapp_sync_chat') {
                mcp_audit($pdo, $user, 'whatsapp_sync', 'Triggered WhatsApp sync for ' . (string)($args['chat'] ?? 'all'));
            }
            $decoded = json_decode((string)($waExec['toolText'] ?? '{}'), true);
            return is_array($decoded) ? $decoded : ['result' => $waExec['toolText'] ?? ''];

        default:
            $extResult = mcp_ext_fin_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_ops_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_intel_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_deleted_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_modules_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_agency_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_catalog_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_crm_plus_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_commercial_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_self_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_newsletter_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            $extResult = mcp_ext_comms_execute($pdo, $user, $tool, $args);
            if ($extResult !== MCP_NOT_MINE) return $extResult;
            throw new \Exception("Unrecognized tool name: " . htmlspecialchars($tool));
    }
}
