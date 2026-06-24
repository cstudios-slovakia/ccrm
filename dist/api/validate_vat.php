<?php
/**
 * EU VIES VAT Validation Proxy API.
 * Securely calls the European Commission VIES REST API to check the validity of a VAT ID.
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
if (function_exists('ccrm_send_cors')) {
    ccrm_send_cors('GET, OPTIONS');
}

// SECURITY: Authenticated users only
if (function_exists('ccrm_require_auth')) {
    ccrm_require_auth();
}

$vat = $_GET['vat'] ?? '';
$vat = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $vat));

if (strlen($vat) < 4) {
    echo json_encode(['success' => false, 'message' => 'Invalid VAT ID length']);
    exit;
}

$countryCode = substr($vat, 0, 2);
$vatNumber = substr($vat, 2);

// Call VIES REST API
$ch = curl_init('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'countryCode' => $countryCode,
    'vatNumber' => $vatNumber
]));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);

if ($httpCode !== 200 || !$response) {
    echo json_encode([
        'success' => false,
        'message' => 'Failed to connect to EU VIES API: ' . ($curlErr ?: "HTTP " . $httpCode)
    ]);
    exit;
}

$data = json_decode($response, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    echo json_encode(['success' => false, 'message' => 'Invalid JSON returned from EU VIES API']);
    exit;
}

echo json_encode([
    'success' => true,
    'valid' => (bool)($data['valid'] ?? false),
    'name' => $data['name'] ?? '',
    'address' => $data['address'] ?? ''
]);
