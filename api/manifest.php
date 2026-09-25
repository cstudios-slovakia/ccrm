<?php
/**
 * Dynamic Web App Manifest Endpoint.
 * Serves PWA manifest with the configured system name from system_settings.
 */
header('Content-Type: application/manifest+json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=60');

$systemName = 'CCRM';

$configFile = dirname(__DIR__) . '/config.php';
if (file_exists($configFile)) {
    require_once $configFile;
    try {
        $pdo = get_db_connection();
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_NAME' LIMIT 1");
        $stmt->execute();
        $val = $stmt->fetchColumn();
        if ($val !== false && trim((string)$val) !== '') {
            $systemName = trim((string)$val);
        }
    } catch (\Throwable $e) {
        // Fallback to default
    }
}

$manifest = [
    'name' => $systemName,
    'short_name' => $systemName,
    'description' => 'Client relationship and operations management dashboard for modern sales pipelines, document flows, and team alignment.',
    'start_url' => '/',
    'display' => 'standalone',
    'background_color' => '#f3f6ff',
    'theme_color' => '#4f46e5',
    'orientation' => 'any',
    'icons' => [
        [
            'src' => '/icon_192.png',
            'sizes' => '192x192',
            'type' => 'image/png',
            'purpose' => 'any maskable'
        ],
        [
            'src' => '/icon_512.png',
            'sizes' => '512x512',
            'type' => 'image/png',
            'purpose' => 'any maskable'
        ],
        [
            'src' => '/favicon.svg',
            'sizes' => '512x512',
            'type' => 'image/svg+xml',
            'purpose' => 'any maskable'
        ]
    ]
];

echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
