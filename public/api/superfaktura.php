<?php
/**
 * SuperFaktura API Connector (Version 1.9)
 * Handles authentication, connection test, estimate creation, invoice creation, and PDF retrieval.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }
    ccrm_require_auth();
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed yet.']);
    exit;
}
require_once $configFile;

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!is_array($data) || empty($data['action'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing action parameter']);
    exit;
}

$action = trim((string)$data['action']);
// The wizard issues every non-invoice document type with `create_estimate`;
// accept the iDoklad wording too so either connector takes either name.
if ($action === 'create_price_offer') {
    $action = 'create_estimate';
}

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// Stored SuperFaktura configuration. Credentials may also arrive in the request
// body — that is how the Settings "Test connection" button probes keys the admin
// has typed but not saved yet.
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INVOICING_INTEGRATIONS'");
$stmt->execute();
$invIntJson = $stmt->fetchColumn();
$invoicingIntegrations = $invIntJson ? json_decode($invIntJson, true) : [];
if (!is_array($invoicingIntegrations)) { $invoicingIntegrations = []; }
if (function_exists('ccrm_decrypt_invoicing_secrets')) {
    $invoicingIntegrations = ccrm_decrypt_invoicing_secrets($invoicingIntegrations);
}
$sfConfig = $invoicingIntegrations['superfaktura'] ?? [];

// A masked value means "keep using the stored secret" — never send the mask on.
$maskedIn = function ($v) {
    return is_string($v) && defined('CCRM_SECRET_MASK') && $v === CCRM_SECRET_MASK;
};
$pick = function ($inbound, $stored) use ($maskedIn) {
    return trim((string)(($inbound !== null && $inbound !== '' && !$maskedIn($inbound)) ? $inbound : $stored));
};

$email = $pick($data['email'] ?? null, $sfConfig['email'] ?? '');
$apiKey = $pick($data['apiKey'] ?? null, $sfConfig['apiKey'] ?? '');
$companyId = $pick($data['companyId'] ?? null, $sfConfig['companyId'] ?? '');
$isSandbox = array_key_exists('sandbox', $data) ? !empty($data['sandbox']) : !empty($sfConfig['sandbox']);

if ($email === '' || $apiKey === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'SuperFaktura prihlasovacie údaje (Email a API kľúč) nie sú nakonfigurované.'
    ]);
    exit;
}

$baseUrl = $isSandbox ? 'https://sandbox.superfaktura.sk' : 'https://m.superfaktura.sk';

// Helper function to send requests to SuperFaktura
function superfaktura_request($url, $method = 'GET', $body = null, $authHeader = '') {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);

    $headers = [
        'Authorization: ' . $authHeader,
        'Accept: application/json'
    ];

    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($body) ? $body : json_encode($body));
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    return [
        'code' => $httpCode,
        'body' => $response,
        'error' => $curlError
    ];
}

$authHeader = 'SFAPI email=' . urlencode($email) . '&apikey=' . urlencode($apiKey);
if (!empty($companyId)) {
    $authHeader .= '&company_id=' . urlencode($companyId);
}

// 1. Test Connection
if ($action === 'test_connection') {
    $res = superfaktura_request($baseUrl . '/sequences/index.json', 'GET', null, $authHeader);
    if ($res['code'] === 200) {
        echo json_encode([
            'success' => true,
            'message' => 'Spojenie so SuperFaktúrou bolo úspešne overené!' . ($isSandbox ? ' (Sandbox režim)' : '')
        ]);
    } else {
        $parsed = json_decode($res['body'], true);
        $errMsg = $parsed['message'] ?? ($parsed['error_message'] ?? 'Chyba overenia pripojenia (HTTP ' . $res['code'] . ')');
        echo json_encode([
            'success' => false,
            'message' => 'SuperFaktura: ' . $errMsg
        ]);
    }
    exit;
}

// 2. Create Estimate (Cenová ponuka)
if ($action === 'create_estimate' || $action === 'create_invoice') {
    $offer = $data['document'] ?? [];
    if (empty($offer)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Chýbajú údaje dokladu']);
        exit;
    }

    $isInvoice = ($action === 'create_invoice' || ($offer['type'] ?? '') === 'invoice');

    // Build SuperFaktura Payload
    $sfClient = [
        'name' => $offer['clientName'] ?? 'Klient',
        'ico' => $offer['clientIco'] ?? '',
        'dic' => $offer['clientDic'] ?? '',
        'ic_dph' => $offer['clientIcdph'] ?? '',
        'email' => $offer['clientEmail'] ?? '',
        'phone' => $offer['clientPhone'] ?? '',
        'address' => $offer['clientStreet'] ?? '',
        'city' => $offer['clientCity'] ?? '',
        'zip' => $offer['clientPostalCode'] ?? '',
        'country' => $offer['clientCountry'] ?? 'Slovensko',
    ];

    $items = [];
    if (!empty($offer['items']) && is_array($offer['items'])) {
        foreach ($offer['items'] as $item) {
            $items[] = [
                'name' => $item['name'] ?? 'Položka',
                'description' => $item['description'] ?? '',
                'quantity' => (float)($item['quantity'] ?? 1),
                'unit' => $item['unit'] ?? 'ks',
                'unit_price' => (float)($item['unitPrice'] ?? 0),
                'tax' => (float)($item['vatRate'] ?? 20),
                'discount' => (float)($item['discountPct'] ?? 0),
            ];
        }
    }

    if (empty($items)) {
        $items[] = [
            'name' => $offer['title'] ?? 'Cenová ponuka',
            'quantity' => 1,
            'unit' => 'ks',
            'unit_price' => (float)($offer['totalPrice'] ?? 0),
            'tax' => 20,
        ];
    }

    $endpoint = $isInvoice ? '/invoices/create' : '/estimates/create';
    $rootKey = $isInvoice ? 'Invoice' : 'Estimate';
    $itemKey = $isInvoice ? 'InvoiceItem' : 'EstimateItem';

    $sfPayload = [
        'Client' => $sfClient,
        $rootKey => [
            'name' => $offer['title'] ?? 'Cenová ponuka',
            'created' => $offer['issuedAt'] ?? date('Y-m-d'),
            'delivery' => $offer['startDateText'] ?? date('Y-m-d'),
            'due' => $offer['dueDate'] ?? date('Y-m-d', strtotime('+14 days')),
            'comment' => ($offer['greetingNote'] ? $offer['greetingNote'] . "\n\n" : '') . ($offer['introNote'] ?? ''),
        ],
        $itemKey => $items
    ];

    $res = superfaktura_request($baseUrl . $endpoint, 'POST', $sfPayload, $authHeader);
    $parsed = json_decode($res['body'], true);

    if ($res['code'] === 200 && !empty($parsed['data']['id'])) {
        $externalId = (string)$parsed['data']['id'];
        $docNo = $parsed['data']['Invoice']['invoice_no'] ?? ($parsed['data']['Estimate']['estimate_no'] ?? $offer['documentNumber']);
        $pdfDownloadUrl = $baseUrl . '/' . strtolower($rootKey) . 's/pdf/' . $externalId . '/token:' . ($parsed['data']['token'] ?? '');

        echo json_encode([
            'success' => true,
            'externalId' => $externalId,
            'documentNumber' => $docNo,
            'externalPdfUrl' => $pdfDownloadUrl,
            'message' => 'Doklad bol úspešne vytvorený v SuperFaktúre!'
        ]);
    } else {
        $errorMsg = $parsed['error_message'] ?? ($parsed['message'] ?? 'Chyba vytvorenia dokladu v SuperFaktúre (HTTP ' . $res['code'] . ')');
        echo json_encode([
            'success' => false,
            'message' => 'SuperFaktura: ' . (is_array($errorMsg) ? json_encode($errorMsg) : $errorMsg)
        ]);
    }
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Neznáma akcia']);
