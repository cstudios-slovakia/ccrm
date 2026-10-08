<?php
/**
 * Personal MCP (Model Context Protocol) API Key Management Endpoint.
 *
 * GET    — Retrieves active key status for current session user.
 * POST   — Generates a new cryptographically secure personal MCP key.
 * DELETE — Revokes the active MCP key.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
ccrm_send_cors('GET, POST, DELETE, OPTIONS');

$sessionUser = ccrm_require_auth();
$userId = (string)($sessionUser['id'] ?? '');

if ($userId === '') {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET' && !empty($_GET['all'])) {
    if (!ccrm_is_admin($sessionUser)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden']);
        exit;
    }
    $all = $pdo->query(
        "SELECT k.id, k.user_id, u.name AS user_name, u.email AS user_email, k.key_prefix, k.name, k.created_at, k.last_used_at
         FROM mcp_keys k JOIN users u ON u.id = k.user_id
         WHERE k.revoked_at IS NULL ORDER BY k.created_at DESC"
    )->fetchAll(\PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'keys' => $all]);
    exit;
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        "SELECT id, key_prefix, name, created_at, last_used_at 
         FROM mcp_keys 
         WHERE user_id = ? AND revoked_at IS NULL 
         ORDER BY created_at DESC LIMIT 1"
    );
    $stmt->execute([$userId]);
    $keyRow = $stmt->fetch(\PDO::FETCH_ASSOC);

    if ($keyRow) {
        echo json_encode([
            'success' => true,
            'has_key' => true,
            'key' => [
                'id' => $keyRow['id'],
                'key_prefix' => $keyRow['key_prefix'],
                'name' => $keyRow['name'],
                'created_at' => $keyRow['created_at'],
                'last_used_at' => $keyRow['last_used_at']
            ]
        ]);
    } else {
        echo json_encode([
            'success' => true,
            'has_key' => false
        ]);
    }
    exit;
}

if ($method === 'POST') {
    $rawInput = json_decode(file_get_contents('php://input'), true) ?? [];
    $keyName = trim((string)($rawInput['name'] ?? 'Personal AI Assistant'));
    if ($keyName === '') {
        $keyName = 'Personal AI Assistant';
    }

    // Generate secure random key: ccrm_mcp_ + 32 random bytes (64 hex characters)
    $tokenBytes = random_bytes(32);
    $token = 'ccrm_mcp_' . bin2hex($tokenBytes);
    $keyHash = hash('sha256', $token);
    $keyPrefix = 'ccrm_mcp_' . substr(bin2hex($tokenBytes), 0, 4) . '...' . substr(bin2hex($tokenBytes), -4);
    $keyId = 'mcpk_' . bin2hex(random_bytes(8));

    // Revoke any existing active keys for this user
    $pdo->beginTransaction();
    try {
        $revokeStmt = $pdo->prepare("UPDATE mcp_keys SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL");
        $revokeStmt->execute([$userId]);

        $insertStmt = $pdo->prepare(
            "INSERT INTO mcp_keys (id, user_id, key_hash, key_prefix, name, created_at) 
             VALUES (?, ?, ?, ?, ?, NOW())"
        );
        $insertStmt->execute([$keyId, $userId, $keyHash, $keyPrefix, $keyName]);

        $pdo->commit();
    } catch (\Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[mcp_keys] Failed to create key: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to generate key']);
        exit;
    }

    // Audit log
    ccrm_audit_log($pdo, ['id' => $userId, 'email' => (string)($sessionUser['email'] ?? '')], 'generate_mcp_key', 'Generated personal MCP API key ' . $keyId . ' (' . $keyPrefix . ')');

    echo json_encode([
        'success' => true,
        'token' => $token,
        'key_prefix' => $keyPrefix,
        'name' => $keyName,
        'created_at' => date('Y-m-d H:i:s')
    ]);
    exit;
}

if ($method === 'DELETE') {
    $targetId = $userId;
    $requested = trim((string)($_GET['user_id'] ?? ''));
    if ($requested !== '' && $requested !== $userId) {
        if (!ccrm_is_admin($sessionUser)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only an admin can revoke another user\'s key']);
            exit;
        }
        $targetId = $requested;
    }

    $revokeStmt = $pdo->prepare("UPDATE mcp_keys SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL");
    $revokeStmt->execute([$targetId]);

    ccrm_audit_log($pdo, ['id' => $userId, 'email' => (string)($sessionUser['email'] ?? '')], 'revoke_mcp_key', $targetId === $userId ? 'Revoked personal MCP API key' : 'Revoked the MCP API key of user ' . $targetId);

    echo json_encode(['success' => true, 'message' => 'MCP key revoked successfully']);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
