<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

// This file exposes a PUBLIC lead-capture webhook (POST, authenticated by the
// X-API-KEY header) that is intentionally reachable cross-origin from external
// website forms — hence the wildcard CORS below. The key-management actions
// (get_key / reset_key) are admin-only and gated by the session further down.
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-KEY');

// Handle OPTIONS request for CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$apiKeyFile = dirname(__DIR__) . '/api_key.txt';
$configFile = dirname(__DIR__) . '/config.php';

// Check if installation exists
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['status' => 'error', 'message' => 'CCRM is not installed yet.']);
    exit;
}

require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

// Helper to get or generate the API key
function getOrGenerateKey($file) {
    if (file_exists($file)) {
        $key = trim(file_get_contents($file));
        if (!empty($key)) {
            return $key;
        }
    }
    // Generate a secure key
    $key = 'sk_live_' . bin2hex(random_bytes(12));
    file_put_contents($file, $key);
    return $key;
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. GET KEY Action (admin only — reveals the integration secret)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_key') {
    ccrm_require_admin();
    $key = getOrGenerateKey($apiKeyFile);
    echo json_encode(['status' => 'success', 'api_key' => $key]);
    exit;
}

// 2. RESET KEY Action (admin only)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'reset_key') {
    $admin = ccrm_require_admin();
    $key = 'sk_live_' . bin2hex(random_bytes(12));
    file_put_contents($apiKeyFile, $key);
    ccrm_audit_log($pdo, $admin, 'api_key.reset', 'Public lead-intake API key rotated');
    echo json_encode(['status' => 'success', 'api_key' => $key]);
    exit;
}

// Helper to get settings from database
function get_db_setting($pdo, $key, $default) {
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
    $stmt->execute([$key]);
    $val = $stmt->fetchColumn();
    if ($val === false) {
        return $default;
    }
    $decoded = json_decode($val, true);
    return $decoded !== null ? $decoded : $val;
}

// 3. PUBLIC API: CREATE LEAD (POST /api/pipeline.php)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Check API Key
    $providedKey = '';
    if (isset($_SERVER['HTTP_X_API_KEY'])) {
        $providedKey = trim($_SERVER['HTTP_X_API_KEY']);
    } else {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        if (isset($headers['X-API-KEY'])) {
            $providedKey = trim($headers['X-API-KEY']);
        } elseif (isset($headers['x-api-key'])) {
            $providedKey = trim($headers['x-api-key']);
        }
    }

    $actualKey = getOrGenerateKey($apiKeyFile);

    if (empty($providedKey) || empty($actualKey) || !hash_equals((string)$actualKey, (string)$providedKey)) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized: Invalid or missing X-API-KEY header']);
        exit;
    }

    // Read payload
    $input = file_get_contents('php://input');
    if (!$input) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Empty request body']);
        exit;
    }

    $payload = json_decode($input, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Malformed JSON payload']);
        exit;
    }

    // Required fields: company_name or contact_name
    $contactName = isset($payload['contact_name']) ? trim($payload['contact_name']) : '';
    $companyName = isset($payload['company_name']) ? trim($payload['company_name']) : '';

    if (empty($contactName) && empty($companyName)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing required field: contact_name or company_name is required']);
        exit;
    }

    // Idempotency: if the caller supplies a key (Idempotency-Key header or
    // idempotency_key/event_id field), the same submission is processed once.
    // Retries then return the original result instead of creating duplicate
    // leads / timeline events. Table is provisioned here, OUTSIDE any
    // transaction, since DDL implicitly commits in MySQL.
    $idempotencyKey = '';
    if (isset($_SERVER['HTTP_IDEMPOTENCY_KEY'])) {
        $idempotencyKey = trim($_SERVER['HTTP_IDEMPOTENCY_KEY']);
    } elseif (isset($payload['idempotency_key'])) {
        $idempotencyKey = trim((string)$payload['idempotency_key']);
    } elseif (isset($payload['event_id'])) {
        $idempotencyKey = trim((string)$payload['event_id']);
    }
    if ($idempotencyKey !== '') {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `webhook_events` (
                `event_key` VARCHAR(191) NOT NULL PRIMARY KEY,
                `lead_id` VARCHAR(50) NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
            $seen = $pdo->prepare("SELECT `lead_id` FROM `webhook_events` WHERE `event_key` = ?");
            $seen->execute([$idempotencyKey]);
            $prior = $seen->fetch(PDO::FETCH_ASSOC);
            if ($prior) {
                echo json_encode(['status' => 'success', 'deduplicated' => true, 'lead_id' => $prior['lead_id']]);
                exit;
            }
        } catch (\Throwable $e) {
            // fail open — never drop a real lead because of a dedup-store error
            $idempotencyKey = '';
        }
    }

    // Fetch lists from database for matching
    $defaultLists = ccrm_default_lists(get_db_setting($pdo, 'SYSTEM_LANGUAGE', 'sk'));
    $leadStates = get_db_setting($pdo, 'LEAD_STATES', $defaultLists['leadStates']);
    $leadSources = get_db_setting($pdo, 'LEAD_SOURCES', $defaultLists['leadSources']);
    $leadCategories = get_db_setting($pdo, 'LEAD_CATEGORIES', $defaultLists['leadCategories']);

    // Determine status (first state)
    $status = 'new';
    if (!empty($leadStates)) {
        $status = $leadStates[0];
    }

    // Determine source
    $source = 'website';
    $sourceId = isset($payload['source_id']) ? intval($payload['source_id']) : 0;
    if ($sourceId > 0 && isset($leadSources[$sourceId - 1])) {
        $source = $leadSources[$sourceId - 1];
    }

    // Determine category
    $categories = [];
    $categoryId = isset($payload['category_id']) ? intval($payload['category_id']) : 0;
    if ($categoryId > 0 && isset($leadCategories[$categoryId - 1])) {
        $categories[] = $leadCategories[$categoryId - 1];
    }

    // Create the new lead ID
    $newLeadId = 'lead-' . uniqid();
    $name = !empty($contactName) ? $contactName : $companyName;
    $city = isset($payload['city']) ? trim($payload['city']) : (isset($payload['country']) ? trim($payload['country']) : "Bratislava");
    $clientType = !empty($companyName) ? "business" : "person";
    $value = isset($payload['value']) ? floatval($payload['value']) : 0.00;
    $phone = isset($payload['phone']) ? trim($payload['phone']) : "";
    $email = isset($payload['email']) ? trim($payload['email']) : "";
    $country = isset($payload['country']) ? trim($payload['country']) : "Slovakia";
    $created_at = date('Y-m-d H:i:s');
    
    // Check if there is an active lead (not closed) for this client
    $existingLead = null;
    $leadStageGroups = get_db_setting($pdo, 'LEAD_STAGE_GROUPS', [
        "new" => "new",
        "contacted" => "in_progress",
        "offer sent" => "in_progress",
        "accepted" => "closed",
        "rejected" => "closed"
    ]);

    $potentialLeads = [];
    if (!empty($email) || !empty($phone)) {
        $stmt = $pdo->prepare("SELECT * FROM `leads` WHERE (email = ? AND email != '') OR (phone = ? AND phone != '') ORDER BY `created_at` DESC");
        $stmt->execute([$email, $phone]);
        $potentialLeads = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM `leads` WHERE name = ? ORDER BY `created_at` DESC");
        $stmt->execute([$name]);
        $potentialLeads = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    foreach ($potentialLeads as $pl) {
        $leadStatus = $pl['status'];
        $group = isset($leadStageGroups[$leadStatus]) ? $leadStageGroups[$leadStatus] : 'new';
        if ($group !== 'closed') {
            $existingLead = $pl;
            break;
        }
    }

    if ($existingLead !== null) {
        $existingLeadId = $existingLead['id'];
        try {
            $pdo->beginTransaction();

            // 1. Update contact fields on the existing lead if they were empty
            $updateFields = [];
            $updateParams = [];
            if (empty($existingLead['email']) && !empty($email)) {
                $updateFields[] = "`email` = ?";
                $updateParams[] = $email;
            }
            if (empty($existingLead['phone']) && !empty($phone)) {
                $updateFields[] = "`phone` = ?";
                $updateParams[] = $phone;
            }
            if (empty($existingLead['city']) && !empty($city)) {
                $updateFields[] = "`city` = ?";
                $updateParams[] = $city;
            }
            if (!empty($updateFields)) {
                $updateParams[] = $existingLeadId;
                $updStmt = $pdo->prepare("UPDATE `leads` SET " . implode(', ', $updateFields) . " WHERE `id` = ?");
                $updStmt->execute($updateParams);
            }

            // 2. Add categories if not already associated
            if (!empty($categories)) {
                $catStmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
                $catStmt->execute([$existingLeadId]);
                $existingCats = $catStmt->fetchAll(PDO::FETCH_COLUMN);

                $insCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
                foreach ($categories as $catName) {
                    if (!in_array($catName, $existingCats)) {
                        $insCat->execute([$existingLeadId, $catName]);
                    }
                }
            }

            // 3. Insert timeline event note representing the new form submission
            $messageLines = [];
            $messageLines[] = "Form submission received from source: " . $source;
            $messageLines[] = "Name: " . $name;
            if (!empty($email)) $messageLines[] = "Email: " . $email;
            if (!empty($phone)) $messageLines[] = "Phone: " . $phone;
            if (!empty($city)) $messageLines[] = "City: " . $city;
            if (!empty($categories)) $messageLines[] = "Categories: " . implode(', ', $categories);
            if (isset($payload['value'])) $messageLines[] = "Value: " . $payload['value'] . " EUR";
            
            $formMsg = isset($payload['message']) ? trim($payload['message']) : "";
            if (!empty($formMsg)) {
                $messageLines[] = "Message: " . $formMsg;
            } else {
                $messageLines[] = "Message: Form submitted (no message content).";
            }
            
            $teContent = implode("\n", $messageLines);
            $teId = 'ev-' . uniqid();
            $insTe = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`) VALUES (?, ?, 'note', ?, 'Form Inquiry (Existing Active Lead)', ?)");
            $insTe->execute([
                $teId,
                $existingLeadId,
                date('Y-m-d H:i:s'),
                $teContent
            ]);

            $pdo->commit();

            if ($idempotencyKey !== '') {
                try {
                    $pdo->prepare("INSERT IGNORE INTO `webhook_events` (`event_key`, `lead_id`) VALUES (?, ?)")
                        ->execute([$idempotencyKey, $existingLeadId]);
                } catch (\Throwable $e) { /* best effort */ }
            }

            echo json_encode([
                'status' => 'success',
                'message' => 'Lead inquiry appended to existing active lead',
                'lead_id' => $existingLeadId,
                'data' => [
                    'name' => $existingLead['name'],
                    'status' => $existingLead['status'],
                    'source' => $existingLead['source'],
                    'appended_categories' => $categories
                ]
            ]);
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[ccrm pipeline] write failed: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Database write failed.']);
        }
        exit;
    }

    try {
        $pdo->beginTransaction();

        // 1. Insert into leads
        $insLead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `contact_person`, `country`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $insLead->execute([
            $newLeadId,
            $name,
            $city,
            $clientType,
            $status,
            $source,
            ccrm_default_owner($pdo), // Default owner: real primary user, not a demo name
            $value,
            3,      // Default rating
            $phone,
            $email,
            !empty($contactName) ? $contactName : null,
            $country,
            $created_at
        ]);

        // 2. Insert into lead_categories
        if (!empty($categories)) {
            $insCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
            foreach ($categories as $catName) {
                $insCat->execute([$newLeadId, $catName]);
            }
        }

        // 3. Insert timeline event
        $teId = 'ev-' . uniqid();
        $teContent = isset($payload['message']) ? trim($payload['message']) : "Lead received from external integration.";
        $insTe = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`) VALUES (?, ?, 'note', ?, 'Lead Created via Public API', ?)");
        $insTe->execute([
            $teId,
            $newLeadId,
            date('Y-m-d H:i:s'),
            $teContent
        ]);

        $pdo->commit();

        if ($idempotencyKey !== '') {
            try {
                $pdo->prepare("INSERT IGNORE INTO `webhook_events` (`event_key`, `lead_id`) VALUES (?, ?)")
                    ->execute([$idempotencyKey, $newLeadId]);
            } catch (\Throwable $e) { /* best effort */ }
        }

        echo json_encode([
            'status' => 'success',
            'message' => 'Lead created successfully',
            'lead_id' => $newLeadId,
            'data' => [
                'name' => $name,
                'status' => $status,
                'source' => $source,
                'categories' => $categories
            ]
        ]);
    } catch (\Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[ccrm pipeline] write failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Database write failed.']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
exit;
