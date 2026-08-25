<?php
/**
 * iDoklad API Connector (Version 1.9)
 * Handles OAuth2 authentication, connection test, price offer creation, invoice creation, and PDF retrieval.
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

if (!$data || empty($data['action'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing action parameter']);
    exit;
}

$action = trim($data['action']);

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// Fetch stored iDoklad configuration if not explicitly provided
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INVOICING_INTEGRATIONS'");
$stmt->execute();
$invIntJson = $stmt->fetchColumn();
$invoicingIntegrations = $invIntJson ? json_decode($invIntJson, true) : [];
$idkConfig = $invoicingIntegrations['idoklad'] ?? [];

$clientId = trim($data['clientId'] ?? ($idkConfig['clientId'] ?? ''));
$clientSecret = trim($data['clientSecret'] ?? ($idkConfig['clientSecret'] ?? ''));
$isSandbox = !empty($data['sandbox']) || !empty($idkConfig['sandbox']);

if (empty($clientId) || empty($clientSecret)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'iDoklad prihlasovacie údaje (Client ID a Client Secret) nie sú nakonfigurované.'
    ]);
    exit;
}

// Fetch OAuth2 Token from iDoklad Identity Server
function idoklad_get_token($clientId, $clientSecret) {
    $ch = curl_init('https://identity.idoklad.cz/server/connect/token');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/x-www-form-urlencoded'
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'client_credentials',
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'scope' => 'idoklad_api'
    ]));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        $parsed = json_decode($response, true);
        return $parsed['access_token'] ?? null;
    }
    return null;
}

$accessToken = idoklad_get_token($clientId, $clientSecret);
if (!$accessToken) {
    echo json_encode([
        'success' => false,
        'message' => 'iDoklad: Overenie Client ID a Client Secret zlyhalo. Skontrolujte zadané kľúče.'
    ]);
    exit;
}

$apiBase = 'https://api.idoklad.cz/v3';

function idoklad_request($url, $method = 'GET', $body = null, $token = '') {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $headers = [
        'Authorization: Bearer ' . $token,
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

// 1. Test Connection
if ($action === 'test_connection') {
    $res = idoklad_request($apiBase . '/Contacts?pageSize=1', 'GET', null, $accessToken);
    if ($res['code'] === 200) {
        echo json_encode([
            'success' => true,
            'message' => 'Spojenie s iDoklad API bolo úspešne overené!'
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'iDoklad API vrátilo chybu pri volaní kontaktov (HTTP ' . $res['code'] . ')'
        ]);
    }
    exit;
}

// 2. Create Price Offer / Invoice in iDoklad
if ($action === 'create_price_offer' || $action === 'create_invoice') {
    $offer = $data['document'] ?? [];
    if (empty($offer)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Chýbajú údaje dokladu']);
        exit;
    }

    $isInvoice = ($action === 'create_invoice' || ($offer['type'] ?? '') === 'invoice');

    // First ensure or find contact in iDoklad
    $contactPayload = [
        'CompanyName' => $offer['clientName'] ?? 'Klient',
        'IdentificationNumber' => $offer['clientIco'] ?? '',
        'VatIdentificationNumber' => $offer['clientDic'] ?? '',
        'Email' => $offer['clientEmail'] ?? '',
        'Phone' => $offer['clientPhone'] ?? '',
        'Street' => $offer['clientStreet'] ?? '',
        'City' => $offer['clientCity'] ?? '',
        'PostalCode' => $offer['clientPostalCode'] ?? '',
        'CountryId' => 1 // Slovakia default
    ];

    $contactRes = idoklad_request($apiBase . '/Contacts', 'POST', $contactPayload, $accessToken);
    $contactData = json_decode($contactRes['body'], true);
    $partnerId = $contactData['Data']['Id'] ?? ($contactData['Id'] ?? 0);

    // Build items for iDoklad
    $items = [];
    if (!empty($offer['items']) && is_array($offer['items'])) {
        foreach ($offer['items'] as $item) {
            $items[] = [
                'Name' => $item['name'] ?? 'Položka',
                'ItemType' => 1,
                'Amount' => (float)($item['quantity'] ?? 1),
                'Unit' => $item['unit'] ?? 'ks',
                'UnitPrice' => (float)($item['unitPrice'] ?? 0),
                'VatRate' => (float)($item['vatRate'] ?? 20),
                'DiscountPercentage' => (float)($item['discountPct'] ?? 0),
            ];
        }
    }

    if (empty($items)) {
        $items[] = [
            'Name' => $offer['title'] ?? 'Cenová ponuka',
            'ItemType' => 1,
            'Amount' => 1,
            'Unit' => 'ks',
            'UnitPrice' => (float)($offer['totalPrice'] ?? 0),
            'VatRate' => 20,
        ];
    }

    $endpoint = $isInvoice ? '/IssuedInvoices' : '/PriceOffers';
    $payload = [
        'PartnerId' => $partnerId,
        'Description' => $offer['subject'] ?? $offer['title'] ?? 'Cenová ponuka',
        'DateOfIssue' => $offer['issuedAt'] ?? date('Y-m-d'),
        'DateOfMaturity' => $offer['dueDate'] ?? date('Y-m-d', strtotime('+14 days')),
        'Items' => $items,
        'Note' => ($offer['greetingNote'] ? $offer['greetingNote'] . "\n\n" : '') . ($offer['introNote'] ?? ''),
    ];

    $docRes = idoklad_request($apiBase . $endpoint, 'POST', $payload, $accessToken);
    $docData = json_decode($docRes['body'], true);

    if (($docRes['code'] === 200 || $docRes['code'] === 201) && !empty($docData['Data']['Id'])) {
        $externalId = (string)$docData['Data']['Id'];
        $docNo = $docData['Data']['DocumentNumber'] ?? $offer['documentNumber'];

        echo json_encode([
            'success' => true,
            'externalId' => $externalId,
            'documentNumber' => $docNo,
            'message' => 'Doklad bol úspešne zaevidovaný v iDoklade!'
        ]);
    } else {
        $err = $docData['Message'] ?? ($docData['Data']['ErrorMessage'] ?? 'Chyba vytvorenia dokladu v iDoklade (HTTP ' . $docRes['code'] . ')');
        echo json_encode([
            'success' => false,
            'message' => 'iDoklad: ' . $err
        ]);
    }
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Neznáma akcia']);
