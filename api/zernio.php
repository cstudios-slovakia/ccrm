<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

ccrm_require_auth();

$action = $_GET['action'] ?? $_POST['action'] ?? '';
if (!$action) {
    $input = file_get_contents('php://input');
    $json = json_decode($input, true);
    if (is_array($json)) {
        $action = $json['action'] ?? '';
    }
}

function get_zernio_key(?string $providedKey = null): string {
    if (!empty($providedKey) && $providedKey !== CCRM_SECRET_MASK) {
        return $providedKey;
    }
    $possibleConfigs = [
        __DIR__ . '/../config.php',
        __DIR__ . '/../../config.php',
        dirname(__DIR__) . '/config.php',
        dirname(dirname(__DIR__)) . '/config.php',
        '/var/www/html/config.php'
    ];
    foreach ($possibleConfigs as $configFile) {
        if (file_exists($configFile)) {
            require_once $configFile;
            break;
        }
    }
    try {
        if (function_exists('get_db_connection')) {
            $pdo = get_db_connection();
            if ($pdo) {
                $stored = ccrm_load_integrations_config($pdo);
                if (!empty($stored['zernioApiKey']) && $stored['zernioApiKey'] !== CCRM_SECRET_MASK) {
                    return $stored['zernioApiKey'];
                }
            }
        }
    } catch (\Throwable $e) {}
    return '';
}

if ($action === 'validate') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    $apiKey = get_zernio_key($data['zernioApiKey'] ?? '');

    if (empty($apiKey)) {
        echo json_encode(['success' => false, 'message' => 'No Zernio API Key provided or stored.']);
        exit;
    }

    $ch = curl_init('https://zernio.com/api/v1/accounts');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        echo json_encode(['success' => false, 'message' => 'Connection error: ' . $curlErr]);
        exit;
    }

    $resData = json_decode($response, true);
    if ($httpCode >= 200 && $httpCode < 300) {
        $accounts = $resData['accounts'] ?? $resData['data'] ?? [];
        if (!is_array($accounts) && is_array($resData)) {
            $accounts = $resData;
        }
        echo json_encode([
            'success' => true,
            'message' => 'Successfully connected to Zernio!',
            'accounts' => $accounts,
            'count' => is_array($accounts) ? count($accounts) : 0
        ]);
    } else {
        $msg = $resData['message'] ?? $resData['error'] ?? ("HTTP " . $httpCode);
        echo json_encode(['success' => false, 'message' => 'Zernio Authentication Failed: ' . $msg, 'httpCode' => $httpCode]);
    }
    exit;
}

if ($action === 'get_accounts') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true) ?? [];
    $apiKey = get_zernio_key($data['zernioApiKey'] ?? $_GET['zernioApiKey'] ?? '');

    if (empty($apiKey)) {
        echo json_encode(['success' => false, 'message' => 'No Zernio API Key provided or stored.']);
        exit;
    }

    $ch = curl_init('https://zernio.com/api/v1/accounts');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        echo json_encode(['success' => false, 'message' => 'Connection error: ' . $curlErr]);
        exit;
    }

    $resData = json_decode($response, true);
    if ($httpCode >= 200 && $httpCode < 300) {
        $accounts = $resData['accounts'] ?? $resData['data'] ?? [];
        if (!is_array($accounts) && is_array($resData)) {
            $accounts = $resData;
        }
        echo json_encode([
            'success' => true,
            'accounts' => $accounts
        ]);
    } else {
        $msg = $resData['message'] ?? $resData['error'] ?? ("HTTP " . $httpCode);
        echo json_encode(['success' => false, 'message' => $msg, 'httpCode' => $httpCode]);
    }
    exit;
}

if ($action === 'get_posts') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true) ?? [];
    $apiKey = get_zernio_key($data['zernioApiKey'] ?? $_GET['zernioApiKey'] ?? '');

    if (empty($apiKey)) {
        echo json_encode(['success' => false, 'message' => 'No Zernio API Key provided or stored.']);
        exit;
    }

    $allPosts = [];
    $seenIds = [];

    // Query 1: Default GET /v1/posts
    // Query 2: GET /v1/posts?source=zernio
    // Query 3: GET /v1/posts?source=external
    $urls = [
        'https://zernio.com/api/v1/posts?limit=100',
        'https://zernio.com/api/v1/posts?source=zernio&limit=100',
        'https://zernio.com/api/v1/posts?source=external&limit=100'
    ];

    foreach ($urls as $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json'
            ]
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300) {
            $resData = json_decode($response, true);
            $items = $resData['posts'] ?? $resData['data'] ?? $resData['results'] ?? [];
            if (!is_array($items) && is_array($resData)) {
                $items = $resData;
            }
            if (is_array($items)) {
                foreach ($items as $it) {
                    if (!is_array($it)) continue;
                    $pid = $it['_id'] ?? $it['id'] ?? null;
                    if ($pid && !isset($seenIds[$pid])) {
                        $seenIds[$pid] = true;
                        $allPosts[] = $it;
                    } elseif (!$pid) {
                        $allPosts[] = $it;
                    }
                }
            }
        }
    }

    echo json_encode([
        'success' => true,
        'posts' => $allPosts
    ]);
    exit;
}

if ($action === 'get_analytics') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    $apiKey = get_zernio_key($data['zernioApiKey'] ?? '');

    if (empty($apiKey)) {
        echo json_encode(['success' => false, 'message' => 'No Zernio API Key provided or stored.']);
        exit;
    }

    $ch = curl_init('https://zernio.com/api/v1/analytics');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        echo json_encode(['success' => false, 'message' => 'Connection error: ' . $curlErr]);
        exit;
    }

    $resData = json_decode($response, true);
    if ($httpCode >= 200 && $httpCode < 300) {
        echo json_encode([
            'success' => true,
            'analytics' => $resData
        ]);
    } else {
        $msg = $resData['message'] ?? $resData['error'] ?? ("HTTP " . $httpCode);
        echo json_encode(['success' => false, 'message' => $msg, 'httpCode' => $httpCode]);
    }
    exit;
}

if ($action === 'get_comments') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    $apiKey = get_zernio_key($data['zernioApiKey'] ?? '');
    $postId = $_GET['postId'] ?? $data['postId'] ?? '';

    if (empty($apiKey)) {
        echo json_encode(['success' => false, 'message' => 'No Zernio API Key provided or stored.']);
        exit;
    }

    if (empty($postId)) {
        echo json_encode(['success' => false, 'message' => 'Missing postId']);
        exit;
    }

    $ch = curl_init('https://zernio.com/api/v1/inbox/comments/' . urlencode($postId));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        echo json_encode(['success' => false, 'message' => 'Connection error: ' . $curlErr]);
        exit;
    }

    $resData = json_decode($response, true);
    if ($httpCode >= 200 && $httpCode < 300) {
        echo json_encode([
            'success' => true,
            'comments' => $resData['comments'] ?? $resData['data'] ?? $resData
        ]);
    } else {
        $msg = $resData['message'] ?? $resData['error'] ?? ("HTTP " . $httpCode);
        echo json_encode(['success' => false, 'message' => $msg, 'httpCode' => $httpCode]);
    }
    exit;
}

if ($action === 'initiate_device_auth') {
    $ch = curl_init('https://zernio.com/api/auth/cli/initiate');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_POSTFIELDS => json_encode(['deviceName' => 'CCRM Social Media Agent']),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        echo json_encode(['success' => false, 'message' => 'Connection error: ' . $curlErr]);
        exit;
    }

    $resData = json_decode($response, true);
    if ($httpCode >= 200 && $httpCode < 300 && !empty($resData['deviceCode'])) {
        echo json_encode([
            'success' => true,
            'deviceCode' => $resData['deviceCode'],
            'userCode' => $resData['userCode'] ?? '',
            'browserUrl' => $resData['browserUrl'] ?? ('https://zernio.com/cli-auth?code=' . ($resData['userCode'] ?? '')),
            'expiresAt' => $resData['expiresAt'] ?? '',
            'interval' => $resData['interval'] ?? 5
        ]);
    } else {
        $msg = $resData['message'] ?? $resData['error'] ?? ("HTTP " . $httpCode);
        echo json_encode(['success' => false, 'message' => 'Failed to initiate device auth: ' . $msg]);
    }
    exit;
}

if ($action === 'poll_device_auth') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    $deviceCode = $data['deviceCode'] ?? $_GET['deviceCode'] ?? '';

    if (empty($deviceCode)) {
        echo json_encode(['success' => false, 'message' => 'Missing deviceCode']);
        exit;
    }

    $ch = curl_init('https://zernio.com/api/auth/cli/poll');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $deviceCode,
            'Accept: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        echo json_encode(['success' => false, 'message' => 'Connection error: ' . $curlErr]);
        exit;
    }

    $resData = json_decode($response, true);
    if ($httpCode === 410) {
        echo json_encode(['success' => false, 'status' => 'expired', 'message' => 'Session expired. Please restart authorization.']);
        exit;
    }

    if ($httpCode >= 200 && $httpCode < 300) {
        $status = $resData['status'] ?? 'pending';
        $apiKey = $resData['apiKey'] ?? null;
        echo json_encode([
            'success' => true,
            'status' => $status,
            'apiKey' => $apiKey
        ]);
    } else {
        $msg = $resData['message'] ?? $resData['error'] ?? ("HTTP " . $httpCode);
        echo json_encode(['success' => false, 'status' => 'error', 'message' => $msg]);
    }
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Invalid action']);
