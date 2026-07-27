<?php
header('Content-Type: application/json');

$query = '
query GetUpdateNotes {
  entries(section: "updateNotes", site: "*") {
    id
    title
    siteHandle
    postDate
    ... on news_Entry {
      version
    }
  }
}
';

$ch = curl_init("https://ccrm.softwaresolutions.sk/api");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['query' => $query]));
curl_setopt($ch, CURLOPT_TIMEOUT, 5);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo json_encode([
    'http_code' => $httpCode,
    'response' => $response ? json_decode($response, true) : null,
    'raw' => $response
]);
