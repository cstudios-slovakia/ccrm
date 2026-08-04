<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/workflows_engine.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
ccrm_send_cors('GET, POST, OPTIONS');

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$action = $_GET['action'] ?? '';

// Helpers
function generate_uuid() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'list') {
        try {
            // Get workflows
            $stmt = $pdo->query("SELECT * FROM `workflows` ORDER BY `created_at` DESC");
            $workflows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Get statistics from logs
            $statsStmt = $pdo->query("
                SELECT 
                    `workflow_id`,
                    COUNT(*) as total_runs,
                    SUM(CASE WHEN `status` = 'success' THEN 1 ELSE 0 END) as success_runs,
                    SUM(CASE WHEN `status` = 'failed' THEN 1 ELSE 0 END) as failed_runs,
                    MAX(`created_at`) as last_run
                FROM `workflow_logs`
                GROUP BY `workflow_id`
            ");
            $stats = [];
            while ($row = $statsStmt->fetch(PDO::FETCH_ASSOC)) {
                $stats[$row['workflow_id']] = [
                    'total_runs' => (int)$row['total_runs'],
                    'success_runs' => (int)$row['success_runs'],
                    'failed_runs' => (int)$row['failed_runs'],
                    'last_run' => $row['last_run']
                ];
            }

            // Merge stats into workflows
            foreach ($workflows as &$wf) {
                $wfId = $wf['id'];
                $wf['stats'] = $stats[$wfId] ?? [
                    'total_runs' => 0,
                    'success_runs' => 0,
                    'failed_runs' => 0,
                    'last_run' => null
                ];
                // Decode JSON fields for safety / ease
                $wf['trigger_config'] = json_decode($wf['trigger_config_json'] ?? '{}', true);
                $wf['nodes'] = json_decode($wf['nodes_json'] ?? '[]', true);
                $wf['edges'] = json_decode($wf['edges_json'] ?? '[]', true);
            }

            echo json_encode(['success' => true, 'workflows' => $workflows]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'get') {
        $id = $_GET['id'] ?? '';
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing workflow ID']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$id]);
            $wf = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$wf) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Workflow not found']);
                exit;
            }

            $wf['trigger_config'] = json_decode($wf['trigger_config_json'] ?? '{}', true);
            $wf['nodes'] = json_decode($wf['nodes_json'] ?? '[]', true);
            $wf['edges'] = json_decode($wf['edges_json'] ?? '[]', true);

            echo json_encode(['success' => true, 'workflow' => $wf]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'logs') {
        $id = $_GET['id'] ?? '';
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing workflow ID']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT * FROM `workflow_logs` WHERE `workflow_id` = ? ORDER BY `created_at` DESC LIMIT 100");
            $stmt->execute([$id]);
            $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($logs as &$log) {
                $log['execution_log'] = json_decode($log['execution_log_json'] ?? '[]', true);
            }

            echo json_encode(['success' => true, 'logs' => $logs]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'get_settings') {
        ccrm_require_admin();
        $cfg = ccrm_load_automation_config($pdo);
        // mask API keys for client transmission
        if (!empty($cfg['openAiKey'])) $cfg['openAiKey'] = '••••••••';
        if (!empty($cfg['anthropicKey'])) $cfg['anthropicKey'] = '••••••••';
        if (!empty($cfg['geminiKey'])) $cfg['geminiKey'] = '••••••••';
        
        echo json_encode(['success' => true, 'settings' => $cfg]);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = json_decode(file_get_contents('php://input'), true) ?: [];

    if ($action === 'save') {
        $id = trim($payload['id'] ?? '');
        $name = trim($payload['name'] ?? 'Untitled Workflow');
        $description = trim($payload['description'] ?? '');
        $trigger_type = trim($payload['trigger_type'] ?? 'manual');
        $trigger_config = $payload['trigger_config'] ?? [];
        $nodes = $payload['nodes'] ?? [];
        $edges = $payload['edges'] ?? [];
        $is_active = isset($payload['is_active']) ? (int)$payload['is_active'] : 1;

        $trigger_config_json = json_encode($trigger_config, JSON_UNESCAPED_UNICODE);
        $nodes_json = json_encode($nodes, JSON_UNESCAPED_UNICODE);
        $edges_json = json_encode($edges, JSON_UNESCAPED_UNICODE);

        try {
            if ($id === '') {
                // Insert
                $id = 'wf-' . generate_uuid();
                $stmt = $pdo->prepare("
                    INSERT INTO `workflows` (`id`, `name`, `description`, `trigger_type`, `trigger_config_json`, `nodes_json`, `edges_json`, `is_active`)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([$id, $name, $description, $trigger_type, $trigger_config_json, $nodes_json, $edges_json, $is_active]);
            } else {
                // Update
                $stmt = $pdo->prepare("
                    UPDATE `workflows`
                    SET `name` = ?, `description` = ?, `trigger_type` = ?, `trigger_config_json` = ?, `nodes_json` = ?, `edges_json` = ?, `is_active` = ?
                    WHERE `id` = ?
                ");
                $stmt->execute([$name, $description, $trigger_type, $trigger_config_json, $nodes_json, $edges_json, $is_active, $id]);
            }

            echo json_encode(['success' => true, 'id' => $id]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'clone') {
        $id = trim($payload['id'] ?? '');
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing workflow ID to clone']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$id]);
            $wf = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$wf) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Workflow not found']);
                exit;
            }

            $newId = 'wf-' . generate_uuid();
            $newName = $wf['name'] . ' (Copy)';
            
            $ins = $pdo->prepare("
                INSERT INTO `workflows` (`id`, `name`, `description`, `trigger_type`, `trigger_config_json`, `nodes_json`, `edges_json`, `is_active`)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            ");
            $ins->execute([$newId, $newName, $wf['description'], $wf['trigger_type'], $wf['trigger_config_json'], $wf['nodes_json'], $wf['edges_json']]);

            echo json_encode(['success' => true, 'id' => $newId]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'toggle_active') {
        $id = trim($payload['id'] ?? '');
        $is_active = (int)($payload['is_active'] ?? 0);
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing workflow ID']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("UPDATE `workflows` SET `is_active` = ? WHERE `id` = ?");
            $stmt->execute([$is_active, $id]);
            echo json_encode(['success' => true]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'delete') {
        $id = trim($payload['id'] ?? '');
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing workflow ID']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            
            // Delete definition
            $stmt = $pdo->prepare("DELETE FROM `workflows` WHERE `id` = ?");
            $stmt->execute([$id]);

            // Delete queue items
            $stmt2 = $pdo->prepare("DELETE FROM `workflow_queue` WHERE `workflow_id` = ?");
            $stmt2->execute([$id]);

            // Delete execution logs
            $stmt3 = $pdo->prepare("DELETE FROM `workflow_logs` WHERE `workflow_id` = ?");
            $stmt3->execute([$id]);

            $pdo->commit();
            echo json_encode(['success' => true]);
        } catch (\Throwable $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'save_settings') {
        ccrm_require_admin();
        $existing = ccrm_load_automation_config($pdo);
        
        $openAiKey = $payload['openAiKey'] ?? '';
        $anthropicKey = $payload['anthropicKey'] ?? '';
        $geminiKey = $payload['geminiKey'] ?? '';
        $cronToken = $payload['cronToken'] ?? $existing['cronToken'];
        
        if ($openAiKey === '••••••••') $openAiKey = $existing['openAiKey'];
        if ($anthropicKey === '••••••••') $anthropicKey = $existing['anthropicKey'];
        if ($geminiKey === '••••••••') $geminiKey = $existing['geminiKey'];
        
        $newCfg = [
            'openAiKey' => $openAiKey,
            'anthropicKey' => $anthropicKey,
            'geminiKey' => $geminiKey,
            'cronToken' => $cronToken
        ];
        
        $encrypted = $newCfg;
        if (function_exists('ccrm_encrypt_config_secrets')) {
            $encrypted = ccrm_encrypt_config_secrets($encrypted, ['openAiKey', 'anthropicKey', 'geminiKey']);
        }
        
        $stmt = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('AUTOMATION_CONFIG', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        $stmt->execute([json_encode($encrypted)]);
        
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'trigger_manual') {
        $id = trim($payload['id'] ?? '');
        $triggerPayload = $payload['payload'] ?? ['triggered_by' => $sessionUser['email']];
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing workflow ID']);
            exit;
        }
        
        try {
            $stmt = $pdo->prepare("SELECT * FROM `workflows` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$id]);
            $wf = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$wf) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Workflow not found']);
                exit;
            }
            
            $result = ccrm_execute_workflow($wf, $triggerPayload, $pdo);
            echo json_encode(['success' => true, 'result' => $result]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;
    }
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Invalid Action']);
