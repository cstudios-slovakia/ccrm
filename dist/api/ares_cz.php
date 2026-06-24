<?php
/**
 * Czech ARES API proxy for CCRM.
 * Proxies suggestion and details requests to ares.gov.cz to avoid CORS issues.
 */

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }
    // Authenticate
    ccrm_require_auth();
}

$action = $_GET['action'] ?? '';

if ($action === 'suggest') {
    $query = $_GET['query'] ?? '';
    if (empty($query)) {
        echo json_encode([]);
        exit;
    }
    
    $url = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat";
    
    // Build search body
    $body = [
        'pocet' => 20
    ];
    if (preg_match('/^\d+$/', $query)) {
        $body['ico'] = [$query];
    } else {
        $body['obchodniJmeno'] = $query;
    }
    
    $responseJson = post_json($url, $body);
    $response = json_decode($responseJson, true);
    
    $suggestions = [];
    if (isset($response['ekonomickeSubjekty']) && is_array($response['ekonomickeSubjekty'])) {
        foreach ($response['ekonomickeSubjekty'] as $sub) {
            $suggestions[] = [
                'id' => $sub['ico'] ?? '',
                'entityName' => $sub['obchodniJmeno'] ?? '',
                'entNumber' => $sub['ico'] ?? '',
                'taxNumber' => $sub['dic'] ?? ''
            ];
        }
    }
    echo json_encode($suggestions);
    exit;
} elseif ($action === 'detail') {
    $ico = $_GET['id'] ?? '';
    if (empty($ico)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing id parameter']);
        exit;
    }
    
    $url = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/" . urlencode($ico);
    echo fetch_url($url);
    exit;
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid action']);
    exit;
}

function post_json(string $url, array $data): string {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
    $output = curl_exec($ch);
    return $output ?: json_encode(['success' => false, 'message' => 'Failed to reach ARES API']);
}

function fetch_url(string $url): string {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
    $output = curl_exec($ch);
    return $output ?: json_encode(['success' => false, 'message' => 'Failed to reach ARES API']);
}
