<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

// SECURITY: training the vector index is an admin operation.
ccrm_require_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);
$action = $data['action'] ?? 'stats';

$configFile = dirname(__DIR__) . '/config.php';
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

if ($action === 'stats') {
    try {
        // Count leads
        $stmt = $pdo->query("SELECT COUNT(*) FROM `leads`");
        $leadsCount = (int)$stmt->fetchColumn();

        // Count unique clients
        $stmt = $pdo->query("SELECT COUNT(DISTINCT `name`) FROM `leads` WHERE `name` IS NOT NULL AND TRIM(`name`) != ''");
        $clientsCount = (int)$stmt->fetchColumn();
        
        // Count emails
        $stmt = $pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'email'");
        $emailsCount = (int)$stmt->fetchColumn();
        
        // Count chats/notes
        $stmt = $pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'note'");
        $chatsCount = (int)$stmt->fetchColumn();

        // Count documents
        $documentsCount = (int)$pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'offer'")->fetchColumn();

        // Count meeting notes
        $meetingsCount = 0;
        try {
            $stmt = $pdo->query("SELECT COUNT(*) FROM `meeting_notes` WHERE (`archived` = 0 OR `archived` IS NULL)");
            $meetingsCount = (int)$stmt->fetchColumn();
        } catch (\Exception $e) {}

        // Count unified entries
        $unifiedEntriesCount = 0;
        try {
            $registries = $pdo->query("SELECT `id` FROM `unified_entries` WHERE `archived` = 0")->fetchAll();
            foreach ($registries as $reg) {
                $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($reg['id']));
                $tableName = "ue_" . $safeId;
                $chkTable = $pdo->query("SHOW TABLES LIKE '{$tableName}'")->rowCount() > 0;
                if ($chkTable) {
                    $stmt = $pdo->query("SELECT COUNT(*) FROM `{$tableName}`");
                    $unifiedEntriesCount += (int)$stmt->fetchColumn();
                }
            }
        } catch (\Exception $e) {}

        // Count warehouse products / materials
        $productsCount = 0;
        try {
            $stmt = $pdo->query("SELECT COUNT(*) FROM `warehouse_items` WHERE (`is_archived` = 0 OR `is_archived` IS NULL)");
            $productsCount = (int)$stmt->fetchColumn();
        } catch (\Exception $e) {}

        // Count employees, salaries, vacations
        $employeesCount = 0;
        $salariesCount = 0;
        $vacationsCount = 0;
        try {
            if ($pdo->query("SHOW TABLES LIKE 'employees'")->rowCount() > 0) {
                $employeesCount = (int)$pdo->query("SELECT COUNT(*) FROM `employees` WHERE `is_active` = 1")->fetchColumn();
            }
            if ($pdo->query("SHOW TABLES LIKE 'employee_salaries'")->rowCount() > 0) {
                $salariesCount = (int)$pdo->query("SELECT COUNT(*) FROM `employee_salaries`")->fetchColumn();
            }
            if ($pdo->query("SHOW TABLES LIKE 'employee_vacations'")->rowCount() > 0) {
                $vacationsCount = (int)$pdo->query("SELECT COUNT(*) FROM `employee_vacations`")->fetchColumn();
            }
        } catch (\Exception $e) {}
        
        echo json_encode([
            'success' => true,
            'stats' => [
                'leads' => $leadsCount,
                'clients' => $clientsCount,
                'emails' => $emailsCount,
                'chats' => $chatsCount,
                'meeting_notes' => $meetingsCount,
                'documents' => $documentsCount,
                'unified_entries' => $unifiedEntriesCount,
                'products' => $productsCount,
                'employees' => $employeesCount,
                'salaries' => $salariesCount,
                'vacations' => $vacationsCount,
                'total_items' => $leadsCount + $clientsCount + $emailsCount + $chatsCount + $meetingsCount + $documentsCount + $unifiedEntriesCount + $productsCount + $employeesCount + $salariesCount + $vacationsCount
            ]
        ]);
    } catch (\Exception $e) {
        http_response_code(500);
        if (function_exists('ccrm_log_exception')) { ccrm_log_exception(); }
        echo json_encode(['success' => false, 'message' => 'The request failed. See the error log for details.']);
    }
    exit;
}

if ($action === 'train') {
    // Real indexing. Step 0 compares the CRM with the index and queues what is new or changed;
    // every call then embeds as many queued records as fit in ~20 s. The UI loop (SettingsView)
    // keeps calling until `finished`. The vector store is the one saved in the integrations
    // settings, not whatever the request claims.
    @set_time_limit(170);
    $step = isset($data['step']) ? (int)$data['step'] : 0;
    $logs = [];

    try {
        require_once __DIR__ . '/vector_index.php';
        $cfg = ccrm_vec_config($pdo);
        $apiKey = (string)($cfg['openAiKey'] ?? '');
        if (($cfg['vectorDb'] ?? 'none') !== 'mariadb') {
            echo json_encode(['success' => true, 'finished' => true, 'progress' => 100, 'step' => $step + 1, 'logs' => [
                "[INFO] Vector search currently runs on MariaDB 11.8+ only. Select MariaDB as the vector database, validate it and save the settings first."]]);
            exit;
        }
        if ($apiKey === '') {
            echo json_encode(['success' => false, 'message' => 'The OpenAI API key is missing. Add it in Settings > AI integrations; it is used to create the embeddings.']);
            exit;
        }
        $vec = get_rag_db_connection($cfg);
        if (!$vec) {
            echo json_encode(['success' => false, 'message' => 'Could not connect to the MariaDB vector database. Check the host, user and password and validate the connection.']);
            exit;
        }
        $schemaError = ccrm_vec_schema($vec);
        if ($schemaError !== '') {
            echo json_encode(['success' => false, 'message' => $schemaError]);
            exit;
        }

        if ($step === 0) {
            $logs[] = "[INIT] Vector database: MariaDB, " . CCRM_VEC_MODEL . " (" . CCRM_VEC_DIM . " dimensions)";
            $q = ccrm_vec_queue_build($pdo, $vec);
            $logs[] = "[SCAN] " . $q['indexed_items'] . " searchable records in the CRM; " . $q['queued'] . " new or changed, " . $q['removed'] . " removed from the index.";
            foreach ($q['warnings'] as $w) {
                $logs[] = "[WARN] Skipped a source: " . $w;
            }
            if ($q['queued'] === 0) {
                $st = ccrm_vec_status($vec);
                echo json_encode(['success' => true, 'finished' => true, 'progress' => 100, 'step' => 1, 'logs' => array_merge($logs, [
                    "[SUCCESS] The index is up to date (" . $st['items'] . " records, " . $st['chunks'] . " chunks)."])]);
                exit;
            }
            echo json_encode(['success' => true, 'finished' => false, 'progress' => 0, 'step' => 1, 'logs' => $logs]);
            exit;
        }

        $r = ccrm_vec_process($pdo, $vec, $apiKey, 20);
        $done = max(0, $r['total'] - $r['remaining']);
        $progress = $r['total'] > 0 ? min(100, (int)floor($done * 100 / $r['total'])) : 100;
        $logs[] = "[EMBED] " . $r['items'] . " records / " . $r['chunks'] . " chunks embedded and stored (" . $done . " of " . $r['total'] . ").";
        $finished = $r['remaining'] === 0;
        if ($finished) {
            $st = ccrm_vec_status($vec);
            $logs[] = "[SUCCESS] Indexing finished: " . $st['items'] . " records, " . $st['chunks'] . " chunks in the vector index (HNSW, cosine).";
        }
        echo json_encode(['success' => true, 'finished' => $finished, 'progress' => $finished ? 100 : $progress, 'step' => $step + 1, 'logs' => $logs]);
    } catch (\Throwable $e) {
        http_response_code(500);
        if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
        echo json_encode(['success' => false, 'message' => 'Indexing failed: ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'index_status') {
    try {
        require_once __DIR__ . '/vector_index.php';
        $cfg = ccrm_vec_config($pdo);
        $vec = ($cfg['vectorDb'] ?? 'none') === 'mariadb' ? get_rag_db_connection($cfg) : null;
        echo json_encode(['success' => true, 'enabled' => (bool)$vec, 'status' => $vec ? ccrm_vec_status($vec) : null]);
    } catch (\Throwable $e) {
        echo json_encode(['success' => false, 'message' => 'The request failed. See the error log for details.']);
    }
    exit;
}
