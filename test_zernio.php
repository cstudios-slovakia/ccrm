<?php
require_once 'config.php';
$pdo = get_db_connection();
// Fetch key from config
$stmt = $pdo->query("SELECT * FROM config");
$config = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $config[$row['config_key']] = $row['config_value'];
}
$integrations = json_decode($config['integrationsConfig'] ?? '{}', true);
$apiKey = $integrations['zernioApiKey'] ?? '';

echo "API KEY: " . substr($apiKey, 0, 5) . "...\n";

$ch = curl_init('https://zernio.com/api/v1/accounts');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Accept: application/json'
    ]
]);
$res = curl_exec($ch);
echo "ACCOUNTS:\n" . $res . "\n";

$ch2 = curl_init('https://zernio.com/api/v1/posts');
curl_setopt_array($ch2, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Accept: application/json'
    ]
]);
$res2 = curl_exec($ch2);
echo "POSTS:\n" . $res2 . "\n";
