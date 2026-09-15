<?php
/**
 * iDoklad API Connector (Version 1.9)
 *
 * Handles OAuth2 authentication, connection test, price offer creation, invoice
 * creation and PDF retrieval.
 *
 * Actions: test_connection | create_estimate (alias create_price_offer) | create_invoice
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
// iDoklad calls the same thing a price offer. Accepting only one of the two
// names made every price offer fail with "unknown action".
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

// Stored configuration. Credentials may also arrive in the request body — that
// is how the Settings "Test connection" button probes keys the admin has typed
// but not saved yet.
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INVOICING_INTEGRATIONS'");
$stmt->execute();
$invIntJson = $stmt->fetchColumn();
$invoicingIntegrations = $invIntJson ? json_decode($invIntJson, true) : [];
if (!is_array($invoicingIntegrations)) { $invoicingIntegrations = []; }
if (function_exists('ccrm_decrypt_config_secrets')) {
    $invoicingIntegrations = ccrm_decrypt_invoicing_secrets($invoicingIntegrations);
}
$idkConfig = $invoicingIntegrations['idoklad'] ?? [];

// A masked value means "keep using the stored secret" — never send the mask on.
$maskedIn = function ($v) {
    return is_string($v) && defined('CCRM_SECRET_MASK') && $v === CCRM_SECRET_MASK;
};
$inClientId = $data['clientId'] ?? null;
$inClientSecret = $data['clientSecret'] ?? null;
$clientId = trim((string)(($inClientId !== null && $inClientId !== '' && !$maskedIn($inClientId)) ? $inClientId : ($idkConfig['clientId'] ?? '')));
$clientSecret = trim((string)(($inClientSecret !== null && $inClientSecret !== '' && !$maskedIn($inClientSecret)) ? $inClientSecret : ($idkConfig['clientSecret'] ?? '')));
$isSandbox = array_key_exists('sandbox', $data) ? !empty($data['sandbox']) : !empty($idkConfig['sandbox']);

if ($clientId === '' || $clientSecret === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'iDoklad prihlasovacie údaje (Client ID a Client Secret) nie sú nakonfigurované.'
    ]);
    exit;
}

// Sandbox has its own identity server and API host. Honouring the toggle matters:
// while it was ignored, "sandbox" documents were issued for real.
$identityUrl = $isSandbox
    ? 'https://identity.sandbox.idoklad.cz/server/connect/token'
    : 'https://identity.idoklad.cz/server/connect/token';
$apiBase = $isSandbox
    ? 'https://sandbox.api.idoklad.cz/v3'
    : 'https://api.idoklad.cz/v3';

/** Exchange client credentials for a bearer token. Returns [token, errorMessage]. */
function idoklad_get_token(string $identityUrl, string $clientId, string $clientSecret): array {
    $ch = curl_init($identityUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
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

    if ($curlError) {
        return [null, 'Sieťová chyba pri overovaní: ' . $curlError];
    }
    if ($httpCode === 200 && $response) {
        $parsed = json_decode($response, true);
        if (!empty($parsed['access_token'])) {
            return [$parsed['access_token'], null];
        }
    }
    $parsed = $response ? json_decode($response, true) : null;
    $detail = $parsed['error_description'] ?? ($parsed['error'] ?? ('HTTP ' . $httpCode));
    return [null, 'Overenie Client ID a Client Secret zlyhalo (' . $detail . ').'];
}

function idoklad_request(string $url, string $method = 'GET', $body = null, string $token = ''): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);

    $headers = [
        'Authorization: Bearer ' . $token,
        'Accept: application/json'
    ];

    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE));
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    return ['code' => $httpCode, 'body' => $response, 'error' => $curlError];
}

list($accessToken, $tokenError) = idoklad_get_token($identityUrl, $clientId, $clientSecret);
if (!$accessToken) {
    echo json_encode(['success' => false, 'message' => 'iDoklad: ' . $tokenError]);
    exit;
}

// ---------------------------------------------------------------- 1. Test
if ($action === 'test_connection') {
    $res = idoklad_request($apiBase . '/Contacts?pageSize=1', 'GET', null, $accessToken);
    if ($res['code'] === 200) {
        echo json_encode([
            'success' => true,
            'message' => 'Spojenie s iDoklad API bolo úspešne overené!' . ($isSandbox ? ' (Sandbox režim)' : '')
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'iDoklad API vrátilo chybu (HTTP ' . $res['code'] . ')' . ($res['error'] ? ': ' . $res['error'] : '')
        ]);
    }
    exit;
}

// ------------------------------------------------ 2. Create offer / invoice
if ($action === 'create_estimate' || $action === 'create_invoice') {
    $offer = $data['document'] ?? [];
    if (empty($offer) || !is_array($offer)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Chýbajú údaje dokladu']);
        exit;
    }

    $isInvoice = ($action === 'create_invoice' || ($offer['type'] ?? '') === 'invoice');

    // Reuse an existing partner when we can match it, otherwise create one.
    // Creating unconditionally left a duplicate contact behind for every single
    // document issued.
    $partnerId = 0;
    $ico = trim((string)($offer['clientIco'] ?? ''));
    $clientName = trim((string)($offer['clientName'] ?? '')) ?: 'Klient';

    $lookupFilter = $ico !== ''
        ? 'IdentificationNumber~eq~' . rawurlencode($ico)
        : 'CompanyName~eq~' . rawurlencode($clientName);
    $findRes = idoklad_request($apiBase . '/Contacts?pageSize=1&filter=' . $lookupFilter, 'GET', null, $accessToken);
    if ($findRes['code'] === 200) {
        $found = json_decode($findRes['body'], true);
        $rows = $found['Data']['Items'] ?? ($found['Data'] ?? []);
        if (is_array($rows) && !empty($rows[0]['Id'])) {
            $partnerId = (int)$rows[0]['Id'];
        }
    }

    if ($partnerId === 0) {
        $contactPayload = [
            'CompanyName' => $clientName,
            'IdentificationNumber' => $ico,
            // DIČ is the tax number, IČ DPH is the VAT number — feeding DIČ into
            // the VAT field produced invoices with an invalid VAT identifier.
            'VatIdentificationNumber' => trim((string)($offer['clientIcdph'] ?? '')),
            'Email' => trim((string)($offer['clientEmail'] ?? '')),
            'Phone' => trim((string)($offer['clientPhone'] ?? '')),
            'Street' => trim((string)($offer['clientStreet'] ?? '')),
            'City' => trim((string)($offer['clientCity'] ?? '')),
            'PostalCode' => trim((string)($offer['clientPostalCode'] ?? '')),
            'CountryId' => ccrm_idoklad_country_id($offer['clientCountry'] ?? null)
        ];
        $contactRes = idoklad_request($apiBase . '/Contacts', 'POST', $contactPayload, $accessToken);
        $contactData = json_decode($contactRes['body'], true);
        $partnerId = (int)($contactData['Data']['Id'] ?? ($contactData['Id'] ?? 0));

        if ($partnerId === 0) {
            $err = $contactData['Message'] ?? ('HTTP ' . $contactRes['code']);
            echo json_encode([
                'success' => false,
                'message' => 'iDoklad: nepodarilo sa založiť kontakt klienta (' . (is_array($err) ? json_encode($err) : $err) . ').'
            ]);
            exit;
        }
    }

    $items = [];
    if (!empty($offer['items']) && is_array($offer['items'])) {
        foreach ($offer['items'] as $item) {
            $items[] = [
                'Name' => (string)($item['name'] ?? 'Položka'),
                'ItemType' => 1,
                'Amount' => (float)($item['quantity'] ?? 1),
                'Unit' => (string)($item['unit'] ?? 'ks'),
                'UnitPrice' => (float)($item['unitPrice'] ?? 0),
                'VatRate' => (float)($item['vatRate'] ?? 20),
                'DiscountPercentage' => (float)($item['discountPct'] ?? 0),
            ];
        }
    }

    if (empty($items)) {
        $items[] = [
            'Name' => (string)($offer['title'] ?? 'Cenová ponuka'),
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
        'Description' => (string)($offer['subject'] ?? ($offer['title'] ?? 'Cenová ponuka')),
        'DateOfIssue' => $offer['issuedAt'] ?? date('Y-m-d'),
        'DateOfMaturity' => $offer['dueDate'] ?? date('Y-m-d', strtotime('+14 days')),
        'Items' => $items,
        'Note' => trim((!empty($offer['greetingNote']) ? $offer['greetingNote'] . "\n\n" : '') . ($offer['introNote'] ?? '')),
    ];

    $docRes = idoklad_request($apiBase . $endpoint, 'POST', $payload, $accessToken);
    $docData = json_decode($docRes['body'], true);

    if (in_array($docRes['code'], [200, 201], true) && !empty($docData['Data']['Id'])) {
        $externalId = (string)$docData['Data']['Id'];
        $docNo = $docData['Data']['DocumentNumber'] ?? ($offer['documentNumber'] ?? null);

        // Server-rendered PDF, base64 in `Data`. Persist it under /uploads so the
        // CRM can link the official document rather than only its id.
        $pdfUrl = null;
        $pdfRes = idoklad_request($apiBase . $endpoint . '/' . $externalId . '/GetPdf', 'GET', null, $accessToken);
        if ($pdfRes['code'] === 200 && $pdfRes['body']) {
            $pdfJson = json_decode($pdfRes['body'], true);
            $base64 = is_array($pdfJson) ? ($pdfJson['Data'] ?? null) : trim($pdfRes['body'], '"');
            $pdfUrl = ccrm_store_external_pdf($base64, 'idoklad-' . preg_replace('/[^A-Za-z0-9._-]/', '', (string)$docNo ?: $externalId));
        }

        echo json_encode([
            'success' => true,
            'externalId' => $externalId,
            'documentNumber' => $docNo,
            'externalPdfUrl' => $pdfUrl,
            'message' => 'Doklad bol úspešne zaevidovaný v iDoklade!'
        ], JSON_UNESCAPED_UNICODE);
    } else {
        $err = $docData['Message'] ?? ($docData['Data']['ErrorMessage'] ?? ('Chyba vytvorenia dokladu (HTTP ' . $docRes['code'] . ')'));
        echo json_encode([
            'success' => false,
            'message' => 'iDoklad: ' . (is_array($err) ? json_encode($err, JSON_UNESCAPED_UNICODE) : $err)
        ], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Neznáma akcia']);
