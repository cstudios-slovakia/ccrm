<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

// SECURITY: validating the vector backend is an admin operation.
ccrm_require_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!isset($data['vectorDb'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing vectorDb parameter']);
    exit;
}

$vectorDb = $data['vectorDb'];
$configFile = dirname(__DIR__) . '/config.php';
require_once $configFile;

// Secrets are masked in the sync GET, so re-validating saved settings posts the
// mask. Substitute the stored values (a freshly typed secret is used as-is).
try {
    $appPdo = get_db_connection();
    $storedCfg = ccrm_load_integrations_config($appPdo);
    $data = ccrm_merge_secrets(is_array($data) ? $data : [], $storedCfg, ['mariaDbPassword', 'qdrantApiKey', 'pineconeApiKey']);
} catch (\Throwable $e) {
    // If the app DB is unreachable, fall through with whatever was posted.
}

if ($vectorDb === 'mariadb') {
    $host = $data['mariaDbHost'] ?? '';
    $port = $data['mariaDbPort'] ?? '3306';
    $user = $data['mariaDbUser'] ?? '';
    $pass = $data['mariaDbPassword'] ?? '';
    $name = $data['mariaDbName'] ?? '';
    
    if (empty($host) || empty($user) || empty($name)) {
        echo json_encode(['success' => false, 'message' => 'Host, Username, and Database Name are required.']);
        exit;
    }
    
    try {
        $dsn = "mysql:host=" . $host . ";port=" . $port . ";dbname=" . $name . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT            => 4,
        ];
        $pdo = new PDO($dsn, $user, $pass, $options);
        
        $stmt = $pdo->query("SELECT VERSION()");
        $versionStr = $stmt->fetchColumn();
        
        $isMaria = stripos($versionStr, 'mariadb') !== false;
        
        // Extract version numbers
        preg_match('/[0-9]+\.[0-9]+\.[0-9]+/', $versionStr, $matches);
        $versionNum = $matches[0] ?? '0.0.0';
        
        if (!$isMaria) {
            echo json_encode([
                'success' => false,
                'message' => "Database is not MariaDB (detected: " . htmlspecialchars($versionStr) . "). MariaDB 11.8+ is required for native VECTOR storage."
            ]);
            exit;
        }
        
        if (version_compare($versionNum, '11.8.0', '<')) {
            echo json_encode([
                'success' => false,
                'message' => "MariaDB version " . htmlspecialchars($versionNum) . " is too low. Version 11.8.0 or higher is required for native VECTOR functions."
            ]);
            exit;
        }
        
        echo json_encode([
            'success' => true,
            'message' => "Successfully connected! MariaDB version " . htmlspecialchars($versionNum) . " natively supports VECTOR operations."
        ]);
        
    } catch (\Exception $e) {
        echo json_encode([
            'success' => false,
            'message' => "MariaDB connection error: " . $e->getMessage()
        ]);
    }
    exit;
}

if ($vectorDb === 'qdrant') {
    $qdrantUrl = $data['qdrantUrl'] ?? '';
    $qdrantApiKey = $data['qdrantApiKey'] ?? '';
    
    if (empty($qdrantUrl)) {
        echo json_encode(['success' => false, 'message' => 'Qdrant URL is required.']);
        exit;
    }
    
    // Normalise URL
    $qdrantUrl = rtrim($qdrantUrl, '/');
    $ch = curl_init($qdrantUrl . '/readyz');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    
    $headers = [];
    if (!empty($qdrantApiKey)) {
        $headers[] = 'api-key: ' . $qdrantApiKey;
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        echo json_encode([
            'success' => true,
            'message' => "Successfully pinged Qdrant Sidecar! Connection is healthy."
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => "Failed to reach Qdrant. HTTP Response Code: " . $httpCode . ". (Verify your sidecar container URL)"
        ]);
    }
    exit;
}

if ($vectorDb === 'pinecone') {
    $apiKey = $data['pineconeApiKey'] ?? '';
    $indexName = $data['pineconeIndex'] ?? '';
    
    if (empty($apiKey) || empty($indexName)) {
        echo json_encode(['success' => false, 'message' => 'API Key and Index Name are required.']);
        exit;
    }
    
    // Validate API key and fetch list of indexes to check connection
    $ch = curl_init('https://api.pinecone.io/indexes');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Api-Key: ' . $apiKey,
        'Accept: application/json'
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        $indexes = json_decode($response, true);
        $found = false;
        
        // Pinecone returns list of indexes in an array or object
        if (isset($indexes['indexes']) && is_array($indexes['indexes'])) {
            foreach ($indexes['indexes'] as $idx) {
                if (isset($idx['name']) && $idx['name'] === $indexName) {
                    $found = true;
                    break;
                }
            }
        }
        
        if ($found) {
            echo json_encode([
                'success' => true,
                'message' => "Successfully connected! Pinecone index '" . htmlspecialchars($indexName) . "' was found and is accessible."
            ]);
        } else {
            // Check if user set index but it's not ready yet or list empty
            echo json_encode([
                'success' => true,
                'message' => "Connected to Pinecone API, but index '" . htmlspecialchars($indexName) . "' was not found in the list. Ensure it is created."
            ]);
        }
    } else {
        $errDetails = json_decode($response, true);
        $errMsg = $errDetails['error']['message'] ?? 'Invalid API key or network issue.';
        echo json_encode([
            'success' => false,
            'message' => "Pinecone Connection Error (HTTP " . $httpCode . "): " . htmlspecialchars($errMsg)
        ]);
    }
    exit;
}

echo json_encode(['success' => false, 'message' => 'Unsupported vector DB type or disabled.']);
