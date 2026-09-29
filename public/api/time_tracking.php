<?php
/**
 * External Time Tracking API Gateway & Proxy (Toggl Track v9 & Clockify).
 *
 * Provides a secure backend bridge to test API keys, fetch workspace users for
 * employee mapping dropdowns, and retrieve aggregated monthly/weekly worked hours.
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
    $configFile = dirname(__DIR__, 2) . '/config.php';
}
if (file_exists($configFile)) {
    require_once $configFile;
}

try {
    $pdo = function_exists('get_db_connection') ? get_db_connection() : ccrm_auth_pdo();
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);
if (!is_array($data) || empty($data['action'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing action parameter']);
    exit;
}

$action = trim((string)$data['action']);

// Helper to load stored employee settings
function get_stored_employee_settings(PDO $pdo): array {
    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'EMPLOYEE_SETTINGS'");
        $stmt->execute();
        $raw = $stmt->fetchColumn();
        if ($raw) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) return $decoded;
        }
    } catch (\Throwable $e) {}
    return [];
}

$settings = get_stored_employee_settings($pdo);
$timeTrackingConfig = $settings['timeTracking'] ?? [];

$provider = $data['provider'] ?? ($timeTrackingConfig['provider'] ?? 'toggl');
$apiToken = trim((string)($data['api_token'] ?? ($data['togglApiToken'] ?? ($timeTrackingConfig['togglApiToken'] ?? ''))));
$workspaceId = trim((string)($data['workspace_id'] ?? ($data['togglWorkspaceId'] ?? ($timeTrackingConfig['togglWorkspaceId'] ?? ''))));

function toggl_curl(string $url, string $apiToken, string $method = 'GET', ?array $postData = null): array {
    $ch = curl_init();
    $headers = [
        'Content-Type: application/json',
        'Authorization: Basic ' . base64_encode($apiToken . ':api_token'),
        'User-Agent: CCRM-TimeTracker/1.11'
    ];
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($postData !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
        }
    }
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        return ['ok' => false, 'code' => $httpCode, 'error' => 'cURL error: ' . $err];
    }
    $json = json_decode((string)$response, true);
    return ['ok' => $httpCode >= 200 && $httpCode < 300, 'code' => $httpCode, 'data' => $json, 'raw' => $response];
}

// -------------------------------------------------------------------------
// 1. ACTION: test_connection
// -------------------------------------------------------------------------
if ($action === 'test_connection') {
    if (empty($apiToken)) {
        echo json_encode(['success' => false, 'message' => 'API Token is empty.']);
        exit;
    }

    if ($provider === 'toggl') {
        $res = toggl_curl('https://api.track.toggl.com/api/v9/me', $apiToken);
        if (!$res['ok']) {
            echo json_encode([
                'success' => false,
                'message' => 'Toggl API error (' . $res['code'] . '): ' . ($res['data']['error'] ?? $res['raw'] ?? 'Failed to connect')
            ]);
            exit;
        }

        $userData = $res['data'] ?? [];
        $defaultWsId = $userData['default_workspace_id'] ?? null;
        
        // Fetch workspaces
        $wsRes = toggl_curl('https://api.track.toggl.com/api/v9/workspaces', $apiToken);
        $workspaces = [];
        if ($wsRes['ok'] && is_array($wsRes['data'])) {
            foreach ($wsRes['data'] as $w) {
                $workspaces[] = [
                    'id' => (string)$w['id'],
                    'name' => $w['name'] ?? ('Workspace #' . $w['id']),
                    'is_default' => ((string)$w['id'] === (string)$defaultWsId)
                ];
            }
        }

        echo json_encode([
            'success' => true,
            'message' => 'Connected successfully to Toggl Track as ' . ($userData['fullname'] ?? $userData['email'] ?? 'User'),
            'user' => [
                'id' => $userData['id'] ?? null,
                'name' => $userData['fullname'] ?? '',
                'email' => $userData['email'] ?? '',
                'default_workspace_id' => $defaultWsId
            ],
            'workspaces' => $workspaces
        ]);
        exit;
    }

    echo json_encode(['success' => false, 'message' => 'Unsupported provider: ' . htmlspecialchars($provider)]);
    exit;
}

// -------------------------------------------------------------------------
// 2. ACTION: fetch_workspace_users
// -------------------------------------------------------------------------
if ($action === 'fetch_workspace_users') {
    if (empty($apiToken)) {
        echo json_encode(['success' => false, 'message' => 'Missing API token.']);
        exit;
    }
    if (empty($workspaceId)) {
        // Try getting default workspace
        $meRes = toggl_curl('https://api.track.toggl.com/api/v9/me', $apiToken);
        if ($meRes['ok']) {
            $workspaceId = (string)($meRes['data']['default_workspace_id'] ?? '');
        }
    }
    if (empty($workspaceId)) {
        echo json_encode(['success' => false, 'message' => 'Workspace ID is required.']);
        exit;
    }

    if ($provider === 'toggl') {
        // Toggl v9 workspace users
        $res = toggl_curl("https://api.track.toggl.com/api/v9/workspaces/{$workspaceId}/users", $apiToken);
        $users = [];
        if ($res['ok'] && is_array($res['data'])) {
            foreach ($res['data'] as $u) {
                $users[] = [
                    'id' => (string)($u['id'] ?? ''),
                    'name' => $u['fullname'] ?? ($u['name'] ?? 'User ' . $u['id']),
                    'email' => $u['email'] ?? '',
                    'avatar_url' => $u['avatar_url'] ?? '',
                    'active' => true
                ];
            }
        } else {
            // Fallback: try /workspace_users endpoint
            $wuRes = toggl_curl("https://api.track.toggl.com/api/v9/workspaces/{$workspaceId}/workspace_users", $apiToken);
            if ($wuRes['ok'] && is_array($wuRes['data'])) {
                foreach ($wuRes['data'] as $wu) {
                    $users[] = [
                        'id' => (string)($wu['user_id'] ?? $wu['id'] ?? ''),
                        'name' => $wu['name'] ?? ($wu['email'] ?? 'User ' . $wu['id']),
                        'email' => $wu['email'] ?? '',
                        'avatar_url' => $wu['avatar_url'] ?? '',
                        'active' => ($wu['active'] ?? true)
                    ];
                }
            } else {
                // If neither worked, at least return the authenticated user themselves
                $meRes = toggl_curl('https://api.track.toggl.com/api/v9/me', $apiToken);
                if ($meRes['ok']) {
                    $u = $meRes['data'];
                    $users[] = [
                        'id' => (string)($u['id'] ?? ''),
                        'name' => $u['fullname'] ?? ($u['email'] ?? 'Current User'),
                        'email' => $u['email'] ?? '',
                        'avatar_url' => $u['avatar_url'] ?? '',
                        'active' => true
                    ];
                }
            }
        }

        echo json_encode([
            'success' => true,
            'workspace_id' => $workspaceId,
            'users' => $users
        ]);
        exit;
    }

    echo json_encode(['success' => false, 'message' => 'Unsupported provider']);
    exit;
}

// -------------------------------------------------------------------------
// 3. ACTION: fetch_employee_hours
// -------------------------------------------------------------------------
if ($action === 'fetch_employee_hours') {
    $extUserId = trim((string)($data['user_id'] ?? ($data['toggl_user_id'] ?? '')));
    $year = (int)($data['year'] ?? date('Y'));
    $month = (int)($data['month'] ?? date('n'));

    if ($year < 2000 || $year > 2100) $year = (int)date('Y');
    if ($month < 1 || $month > 12) $month = (int)date('n');

    $startDateStr = sprintf('%04d-%02d-01', $year, $month);
    $lastDay = (int)date('t', strtotime($startDateStr));
    $endDateStr = sprintf('%04d-%02d-%02d', $year, $month, $lastDay);

    if (empty($apiToken)) {
        echo json_encode([
            'success' => false,
            'message' => 'Toggl API token is not configured in Global Settings.'
        ]);
        exit;
    }

    if (empty($workspaceId)) {
        $meRes = toggl_curl('https://api.track.toggl.com/api/v9/me', $apiToken);
        if ($meRes['ok']) {
            $workspaceId = (string)($meRes['data']['default_workspace_id'] ?? '');
        }
    }

    if (empty($workspaceId)) {
        echo json_encode(['success' => false, 'message' => 'Toggl Workspace ID is missing.']);
        exit;
    }

    // Try fetching reports API v3
    // POST https://api.track.toggl.com/reports/api/v3/workspace/{workspace_id}/search/time_entries
    $postPayload = [
        'start_date' => $startDateStr,
        'end_date' => $endDateStr,
    ];
    if (!empty($extUserId) && is_numeric($extUserId)) {
        $postPayload['user_ids'] = [(int)$extUserId];
    }

    $reportsUrl = "https://api.track.toggl.com/reports/api/v3/workspace/{$workspaceId}/search/time_entries";
    $reportRes = toggl_curl($reportsUrl, $apiToken, 'POST', $postPayload);

    $rawEntries = [];
    if ($reportRes['ok'] && is_array($reportRes['data'])) {
        $rawEntries = $reportRes['data'];
    } else {
        // Fallback: use /me/time_entries
        $fallbackUrl = "https://api.track.toggl.com/api/v9/me/time_entries?start_date={$startDateStr}T00:00:00Z&end_date={$endDateStr}T23:59:59Z";
        $fallbackRes = toggl_curl($fallbackUrl, $apiToken);
        if ($fallbackRes['ok'] && is_array($fallbackRes['data'])) {
            $rawEntries = $fallbackRes['data'];
        }
    }

    // Process & Aggregate entries
    $totalSeconds = 0;
    $dailySeconds = [];
    $projectSeconds = [];

    // Initialize days of month
    for ($d = 1; $d <= $lastDay; $d++) {
        $dateKey = sprintf('%04d-%02d-%02d', $year, $month, $d);
        $dailySeconds[$dateKey] = 0;
    }

    foreach ($rawEntries as $entry) {
        $dur = (int)($entry['seconds'] ?? ($entry['duration'] ?? 0));
        if ($dur <= 0) continue;

        $startStr = $entry['start'] ?? ($entry['time_entries'][0]['start'] ?? '');
        $dateKey = substr((string)$startStr, 0, 10);
        if (isset($dailySeconds[$dateKey])) {
            $dailySeconds[$dateKey] += $dur;
            $totalSeconds += $dur;
        }

        $projName = $entry['project_name'] ?? ($entry['project'] ?? 'General / Untagged');
        if (!isset($projectSeconds[$projName])) {
            $projectSeconds[$projName] = 0;
        }
        $projectSeconds[$projName] += $dur;
    }

    // Compute weekly breakdown (Week 1 through Week 5/6)
    $weeks = [];
    $currentWeekIndex = 1;
    $weekStartDay = 1;

    for ($d = 1; $d <= $lastDay; $d++) {
        $curDateStr = sprintf('%04d-%02d-%02d', $year, $month, $d);
        $dayOfWeek = (int)date('N', strtotime($curDateStr)); // 1 (Mon) - 7 (Sun)

        // If Sunday or last day of month, close the current week
        if ($dayOfWeek === 7 || $d === $lastDay) {
            $weekSec = 0;
            $dayList = [];
            for ($k = $weekStartDay; $k <= $d; $k++) {
                $kDate = sprintf('%04d-%02d-%02d', $year, $month, $k);
                $s = $dailySeconds[$kDate] ?? 0;
                $weekSec += $s;
                $dayList[$kDate] = [
                    'day_number' => $k,
                    'weekday' => date('D', strtotime($kDate)),
                    'hours' => round($s / 3600, 2),
                    'seconds' => $s
                ];
            }

            $startLabel = sprintf('%02d', $weekStartDay);
            $endLabel = sprintf('%02d', $d);
            $monthName = date('M', strtotime($startDateStr));

            $weeks[] = [
                'week_number' => $currentWeekIndex,
                'label' => "Week {$currentWeekIndex} ({$monthName} {$startLabel} – {$endLabel})",
                'start_date' => sprintf('%04d-%02d-%02d', $year, $month, $weekStartDay),
                'end_date' => sprintf('%04d-%02d-%02d', $year, $month, $d),
                'seconds' => $weekSec,
                'hours' => round($weekSec / 3600, 2),
                'days' => $dayList
            ];

            $currentWeekIndex++;
            $weekStartDay = $d + 1;
        }
    }

    $projectBreakdown = [];
    foreach ($projectSeconds as $pName => $pSec) {
        $projectBreakdown[] = [
            'name' => $pName,
            'seconds' => $pSec,
            'hours' => round($pSec / 3600, 2),
            'percentage' => $totalSeconds > 0 ? round(($pSec / $totalSeconds) * 100, 1) : 0
        ];
    }
    usort($projectBreakdown, fn($a, $b) => $b['seconds'] <=> $a['seconds']);

    $totalHours = round($totalSeconds / 3600, 2);
    $numWeeks = max(1, count($weeks));
    $avgHoursPerWeek = round($totalHours / $numWeeks, 2);

    echo json_encode([
        'success' => true,
        'year' => $year,
        'month' => $month,
        'total_seconds' => $totalSeconds,
        'total_hours' => $totalHours,
        'average_weekly_hours' => $avgHoursPerWeek,
        'weeks' => $weeks,
        'projects' => $projectBreakdown,
        'entry_count' => count($rawEntries)
    ]);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Unknown action: ' . htmlspecialchars($action)]);
