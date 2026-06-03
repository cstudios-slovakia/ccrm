<?php
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
    echo json_encode(['status' => 'error', 'message' => 'Laminam CRM is not installed yet.']);
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

// 1. GET KEY Action
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_key') {
    $key = getOrGenerateKey($apiKeyFile);
    echo json_encode(['status' => 'success', 'api_key' => $key]);
    exit;
}

// 2. RESET KEY Action
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'reset_key') {
    $key = 'sk_live_' . bin2hex(random_bytes(12));
    file_put_contents($apiKeyFile, $key);
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

    if (empty($providedKey) || $providedKey !== $actualKey) {
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

    // Fetch lists from database for matching
    $leadStates = get_db_setting($pdo, 'LEAD_STATES', ["new", "contacted", "offer sent", "accepted", "rejected"]);
    $leadSources = get_db_setting($pdo, 'LEAD_SOURCES', ["showroom", "facebook", "instagram", "website"]);
    $leadCategories = get_db_setting($pdo, 'LEAD_CATEGORIES', ["Kitchen Countertops", "Flooring Tiles", "Bathroom Renovation", "Granite Slabs", "Plumbing Services", "Custom Masonry"]);

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
    $value = isset($payload['value']) ? floatval($payload['value']) : 1500.00;
    $phone = isset($payload['phone']) ? trim($payload['phone']) : "";
    $email = isset($payload['email']) ? trim($payload['email']) : "";
    $country = isset($payload['country']) ? trim($payload['country']) : "Slovakia";
    $created_at = date('Y-m-d');
    
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
            'Tomi', // Default owner
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
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Database write failed: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
exit;
