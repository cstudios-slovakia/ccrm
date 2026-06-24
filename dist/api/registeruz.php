<?php
/**
 * RegisterUZ API proxy for CCRM.
 * Proxies suggestion and details requests to registeruz.sk to avoid CORS issues.
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
    
    $url = "https://www.registeruz.sk/cruz-public/domain/suggestion/search?query=" . urlencode($query);
    $response = fetch_url($url);
    echo $response;
    exit;
} elseif ($action === 'detail') {
    $id = $_GET['id'] ?? '';
    if (empty($id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing id parameter']);
        exit;
    }
    
    $url = "https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=" . urlencode($id);
    $response = fetch_url($url);
    echo $response;
    exit;
} elseif ($action === 'lookup') {
    $ico = $_GET['ico'] ?? '';
    if (empty($ico)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing ico parameter']);
        exit;
    }
    
    $listUrl = "https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=" . urlencode($ico) . "&zmenene-od=2000-01-01";
    $listResponse = json_decode(fetch_url($listUrl), true);
    
    if (isset($listResponse['id']) && is_array($listResponse['id']) && count($listResponse['id']) > 0) {
        $id = $listResponse['id'][0];
        $detailUrl = "https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=" . urlencode($id);
        echo fetch_url($detailUrl);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Company not found in registry']);
    }
    exit;
} elseif ($action === 'statement') {
    $id = $_GET['id'] ?? '';
    if (empty($id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing id parameter']);
        exit;
    }
    
    $url = "https://www.registeruz.sk/cruz-public/api/uctovna-zavierka?id=" . urlencode($id);
    echo fetch_url($url);
    exit;
} elseif ($action === 'pdf') {
    $id = $_GET['id'] ?? '';
    if (empty($id)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Missing id parameter']);
        exit;
    }
    
    $url = "https://www.registeruz.sk/cruz-public/domain/financialreport/pdf/" . urlencode($id);
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="uctovna_zavierka_' . $id . '.pdf"');
    
    stream_pdf($url);
    exit;
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid action']);
    exit;
}

function stream_pdf(string $url): void {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    $success = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if (!$success || $httpCode !== 200) {
        $context = stream_context_create([
            'http' => [
                'timeout' => 30,
                'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n"
            ]
        ]);
        $data = @file_get_contents($url, false, $context);
        if ($data !== false) {
            echo $data;
        } else {
            http_response_code(502);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'Failed to fetch statement PDF']);
        }
    }
}

function fetch_url(string $url): string {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    $output = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    if ($httpCode !== 200 || $output === false) {
        $context = stream_context_create([
            'http' => [
                'timeout' => 10,
                'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n"
            ]
        ]);
        $output = @file_get_contents($url, false, $context);
    }
    
    return $output ?: json_encode(['success' => false, 'message' => 'Failed to reach RegisterUZ API']);
}
