<?php
/**
 * Dynamic Web App Manifest Endpoint.
 * Serves PWA manifest with the configured system title from system_settings.
 */
header('Content-Type: application/manifest+json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=60');

require_once __DIR__ . '/brand.php';

// The company's own title ("" = none). The installed app is named "Lapidea (Koperniq)", its
// home-screen label is just "Lapidea"; with no title of its own both are "Koperniq".
$titleOverride = '';

$configFile = dirname(__DIR__) . '/config.php';
if (file_exists($configFile)) {
    require_once $configFile;
    try {
        $titleOverride = kprnq_system_title_override(get_db_connection());
    } catch (Throwable $e) {
        // Fallback to the product name
    }
}

// The static manifest.json (shipped next to index.html) is the single source of
// truth: id, scope, shortcuts, share_target, launch_handler, screenshots, icons.
// Only the name is dynamic. A hand-copied list here silently dropped the
// shortcuts and share target on the server (where /manifest.json is rewritten
// to this script).
$manifest = null;
$staticFile = dirname(__DIR__) . '/manifest.json';
if (is_readable($staticFile)) {
    $decoded = json_decode((string)file_get_contents($staticFile), true);
    if (is_array($decoded)) {
        $manifest = $decoded;
    }
}

if ($manifest === null) {
    $manifest = [
        'id' => '/',
        'description' => 'Sales, projects, documents and operations in one workspace for the whole team.',
        'start_url' => '/',
        'scope' => '/',
        'display' => 'standalone',
        'background_color' => '#f3f6ff',
        'theme_color' => '#4f46e5',
        'orientation' => 'any',
        'icons' => [
            ['src' => '/icon_192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any maskable'],
            ['src' => '/icon_512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any maskable'],
            ['src' => '/favicon.svg', 'sizes' => '512x512', 'type' => 'image/svg+xml', 'purpose' => 'any maskable'],
        ],
    ];
}

$manifest['name'] = kprnq_title_with_product($titleOverride);
$manifest['short_name'] = kprnq_resolve_title($titleOverride);

echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
