<?php
$apiKey = 'sk_90f77da433b155ef6c5f8f78c4553430024007ae2069ef67eb6e6996d6d5972b';
$allPosts = [];
$seenIds = [];

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
echo "Found " . count($allPosts) . " posts\n";
