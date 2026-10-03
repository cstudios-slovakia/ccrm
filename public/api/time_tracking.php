<?php
/**
 * External Time Tracking API Gateway & Proxy (Toggl Track v9 & Clockify).
 *
 * Provides a secure backend bridge to test API keys, fetch workspace users for
 * employee mapping dropdowns, and retrieve aggregated monthly/weekly worked hours.
 */

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
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
    echo json_encode([
        'success' => false,
        'error' => 'Database connection failed: ' . $e->getMessage(),
        'message' => 'Database connection failed: ' . $e->getMessage()
    ]);
    exit;
}

// Support JSON body, $_POST, and $_GET
$rawInput = file_get_contents('php://input');
$jsonInput = json_decode($rawInput, true);
if (!is_array($jsonInput)) {
    $jsonInput = [];
}
$data = array_merge($_GET, $_POST, $jsonInput);

if (empty($data['action'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Missing action parameter',
        'message' => 'Missing action parameter'
    ]);
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
$apiToken = trim((string)(
    $data['api_token'] ??
    $data['api_key'] ??
    $data['togglApiToken'] ??
    $data['togglApiKey'] ??
    ($settings['togglApiKey'] ??
    ($settings['togglApiToken'] ??
    ($timeTrackingConfig['togglApiToken'] ??
    ($timeTrackingConfig['togglApiKey'] ?? ''))))
));
if ($apiToken === '9c8a1b2e3d4f5g6h7i8j9k0l' || $apiToken === 'test_dummy_token') {
    $apiToken = '';
}
$workspaceId = trim((string)(
    $data['workspace_id'] ??
    $data['workspaceId'] ??
    $data['togglWorkspaceId'] ??
    $data['toggl_workspace_id'] ??
    ($settings['togglWorkspaceId'] ??
    ($timeTrackingConfig['togglWorkspaceId'] ??
    ($timeTrackingConfig['toggl_workspace_id'] ?? '')))
));

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
        echo json_encode([
            'success' => false,
            'error' => 'API Token is empty. Please enter your Toggl Track API token.',
            'message' => 'API Token is empty. Please enter your Toggl Track API token.'
        ]);
        exit;
    }

    if ($provider === 'toggl') {
        $res = toggl_curl('https://api.track.toggl.com/api/v9/me', $apiToken);
        if (!$res['ok']) {
            $errDetail = $res['error'] ?? '';
            if (isset($res['data']['error'])) {
                $errDetail = is_string($res['data']['error']) ? $res['data']['error'] : json_encode($res['data']['error']);
            } elseif (!empty($res['raw'])) {
                $errDetail = is_string($res['raw']) ? substr($res['raw'], 0, 200) : '';
            }

            if ($res['code'] === 401 || $res['code'] === 403) {
                $msg = 'Invalid Toggl API token (HTTP ' . $res['code'] . '). Please verify your token in Toggl Track Profile Settings.';
            } else {
                $msg = 'Toggl API error (HTTP ' . $res['code'] . '): ' . ($errDetail ?: 'Failed to connect');
            }

            echo json_encode([
                'success' => false,
                'error' => $msg,
                'message' => $msg,
                'code' => $res['code']
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

        $userObj = [
            'id' => $userData['id'] ?? null,
            'name' => $userData['fullname'] ?? ($userData['email'] ?? 'User'),
            'fullname' => $userData['fullname'] ?? ($userData['email'] ?? 'User'),
            'email' => $userData['email'] ?? '',
            'default_workspace_id' => $defaultWsId,
            'defaultWorkspaceId' => $defaultWsId
        ];

        echo json_encode([
            'success' => true,
            'message' => 'Connected successfully to Toggl Track as ' . $userObj['name'],
            'user' => $userObj,
            'data' => [
                'user' => $userObj,
                'fullname' => $userObj['name'],
                'email' => $userObj['email'],
                'defaultWorkspaceId' => $defaultWsId,
                'workspaces' => $workspaces
            ],
            'workspaces' => $workspaces
        ]);
        exit;
    }

    echo json_encode([
        'success' => false,
        'error' => 'Unsupported provider: ' . htmlspecialchars($provider),
        'message' => 'Unsupported provider: ' . htmlspecialchars($provider)
    ]);
    exit;
}

// -------------------------------------------------------------------------
// 2. ACTION: fetch_workspace_users
// -------------------------------------------------------------------------
if ($action === 'fetch_workspace_users') {
    if (empty($apiToken)) {
        echo json_encode([
            'success' => false,
            'error' => 'Missing API token.',
            'message' => 'Missing API token.'
        ]);
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
        echo json_encode([
            'success' => false,
            'error' => 'Workspace ID is required.',
            'message' => 'Workspace ID is required.'
        ]);
        exit;
    }

    if ($provider === 'toggl') {
        // Toggl v9 workspace users
        $res = toggl_curl("https://api.track.toggl.com/api/v9/workspaces/{$workspaceId}/users", $apiToken);
        $users = [];
        if ($res['ok'] && is_array($res['data'])) {
            foreach ($res['data'] as $u) {
                $rawName = trim((string)($u['fullname'] ?? ($u['name'] ?? '')));
                $email = trim((string)($u['email'] ?? ''));
                $displayName = $rawName !== '' ? $rawName : ($email !== '' ? $email : 'User ' . ($u['id'] ?? ''));
                $isActive = !empty($u['is_active']) && empty($u['inactive']);
                $users[] = [
                    'id' => (string)($u['id'] ?? ''),
                    'name' => $displayName,
                    'email' => $email,
                    'avatar_url' => $u['avatar_url'] ?? '',
                    'active' => $isActive
                ];
            }
        } else {
            // Fallback: try /workspace_users endpoint
            $wuRes = toggl_curl("https://api.track.toggl.com/api/v9/workspaces/{$workspaceId}/workspace_users", $apiToken);
            if ($wuRes['ok'] && is_array($wuRes['data'])) {
                foreach ($wuRes['data'] as $wu) {
                    $rawName = trim((string)($wu['name'] ?? ($wu['fullname'] ?? '')));
                    $email = trim((string)($wu['email'] ?? ''));
                    $displayName = $rawName !== '' ? $rawName : ($email !== '' ? $email : 'User ' . ($wu['id'] ?? ''));
                    $isActive = !empty($wu['active']) && empty($wu['inactive']);
                    $users[] = [
                        'id' => (string)($wu['user_id'] ?? $wu['id'] ?? ''),
                        'name' => $displayName,
                        'email' => $email,
                        'avatar_url' => $wu['avatar_url'] ?? '',
                        'active' => $isActive
                    ];
                }
            } else {
                // If neither worked, at least return the authenticated user themselves
                $meRes = toggl_curl('https://api.track.toggl.com/api/v9/me', $apiToken);
                if ($meRes['ok']) {
                    $u = $meRes['data'];
                    $rawName = trim((string)($u['fullname'] ?? ''));
                    $email = trim((string)($u['email'] ?? ''));
                    $displayName = $rawName !== '' ? $rawName : ($email !== '' ? $email : 'Current User');
                    $users[] = [
                        'id' => (string)($u['id'] ?? ''),
                        'name' => $displayName,
                        'email' => $email,
                        'avatar_url' => $u['avatar_url'] ?? '',
                        'active' => true
                    ];
                }
            }
        }

        $onlyActive = !empty($data['only_active']) || !empty($data['active_only']);
        if ($onlyActive) {
            $users = array_values(array_filter($users, fn($u) => !empty($u['active'])));
        }

        // Sort users: active users first, then alphabetically by name
        usort($users, function($a, $b) {
            $aActive = !empty($a['active']);
            $bActive = !empty($b['active']);
            if ($aActive !== $bActive) {
                return $aActive ? -1 : 1;
            }
            return strcasecmp($a['name'], $b['name']);
        });

        echo json_encode([
            'success' => true,
            'workspace_id' => $workspaceId,
            'data' => $users,
            'users' => $users
        ]);
        exit;
    }

    echo json_encode([
        'success' => false,
        'error' => 'Unsupported provider',
        'message' => 'Unsupported provider'
    ]);
    exit;
}

// -------------------------------------------------------------------------
// 3. ACTION: fetch_employee_hours
// -------------------------------------------------------------------------
if ($action === 'fetch_employee_hours') {
    $extUserId = trim((string)($data['user_id'] ?? ($data['toggl_user_id'] ?? '')));
    $year = (int)($data['year'] ?? date('Y'));
    $month = (int)($data['month'] ?? date('n'));

    // Automatically resolve Toggl User ID from employee record if employee_id was passed
    if (empty($extUserId) && !empty($data['employee_id'])) {
        try {
            $stmt = $pdo->prepare("SELECT `time_tracking_user_id` FROM `employees` WHERE `id` = ?");
            $stmt->execute([$data['employee_id']]);
            $foundUserId = $stmt->fetchColumn();
            if ($foundUserId) {
                $extUserId = (string)$foundUserId;
            }
        } catch (\Throwable $e) {}
    }

    if (empty($extUserId) || $extUserId === '0' || $extUserId === 'none') {
        echo json_encode([
            'success' => true,
            'no_user_attached' => true,
            'data' => null,
            'message' => 'No time tracking user account attached to this employee.'
        ]);
        exit;
    }

    if ($year < 2000 || $year > 2100) $year = (int)date('Y');
    if ($month < 1 || $month > 12) $month = (int)date('n');

    $firstDayOfMonth = sprintf('%04d-%02d-01', $year, $month);
    $lastDay = (int)date('t', strtotime($firstDayOfMonth));
    $lastDayOfMonth = sprintf('%04d-%02d-%02d', $year, $month, $lastDay);

    // Compute complete calendar start (Monday) and end (Sunday) to cover all calendar rows
    $firstDow = (int)date('N', strtotime($firstDayOfMonth)); // 1=Mon, 7=Sun
    $calStartDateStr = date('Y-m-d', strtotime($firstDayOfMonth . ' -' . ($firstDow - 1) . ' days'));
    $lastDow = (int)date('N', strtotime($lastDayOfMonth));
    $calEndDateStr = date('Y-m-d', strtotime($lastDayOfMonth . ' +' . (7 - $lastDow) . ' days'));

    if (empty($apiToken)) {
        echo json_encode([
            'success' => false,
            'error' => 'Toggl API token is not configured in Settings.',
            'message' => 'Toggl API token is not configured in Settings.'
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
        echo json_encode([
            'success' => false,
            'error' => 'Toggl Workspace ID is missing.',
            'message' => 'Toggl Workspace ID is missing.'
        ]);
        exit;
    }

    // Fetch workspace projects map for human-readable project naming
    $wsProjectMap = [];
    if (!empty($workspaceId)) {
        $wsKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$workspaceId);
        $cacheFile = sys_get_temp_dir() . '/ccrm_toggl_projects_' . $wsKey . '.json';
        if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 3600)) {
            $wsProjectMap = json_decode((string)file_get_contents($cacheFile), true) ?: [];
        }

        if (empty($wsProjectMap)) {
            for ($pPage = 1; $pPage <= 5; $pPage++) {
                $pRes = toggl_curl("https://api.track.toggl.com/api/v9/workspaces/{$workspaceId}/projects?per_page=500&page={$pPage}", $apiToken);
                if ($pRes['ok'] && is_array($pRes['data']) && !empty($pRes['data'])) {
                    foreach ($pRes['data'] as $p) {
                        if (isset($p['id'], $p['name'])) {
                            $wsProjectMap[(string)$p['id']] = (string)$p['name'];
                        }
                    }
                    if (count($pRes['data']) < 500) {
                        break;
                    }
                } else {
                    break;
                }
            }
            if (!empty($wsProjectMap)) {
                @file_put_contents($cacheFile, json_encode($wsProjectMap));
            }
        }
    }

    // Fetch reports API v3 with pagination covering the entire calendar range
    $postPayload = [
        'start_date' => $calStartDateStr,
        'end_date' => $calEndDateStr,
        'page_size' => 50,
    ];
    if (!empty($extUserId) && is_numeric($extUserId)) {
        $postPayload['user_ids'] = [(int)$extUserId];
    }

    $reportsUrl = "https://api.track.toggl.com/reports/api/v3/workspace/{$workspaceId}/search/time_entries";
    $rawEntries = [];
    $firstRowNumber = 1;
    $maxPages = 40; // cap at 2000 entries safety limit

    for ($pageIdx = 0; $pageIdx < $maxPages; $pageIdx++) {
        $pagePayload = $postPayload;
        $pagePayload['first_row_number'] = $firstRowNumber;
        $reportRes = toggl_curl($reportsUrl, $apiToken, 'POST', $pagePayload);

        if ($reportRes['ok'] && is_array($reportRes['data']) && !empty($reportRes['data'])) {
            $batch = $reportRes['data'];
            foreach ($batch as $row) {
                $rawEntries[] = $row;
            }
            if (count($batch) < 50) {
                break;
            }
            $firstRowNumber += count($batch);
        } else {
            break;
        }
    }

    // Fallback: if reports API v3 didn't return anything or failed, try /me/time_entries
    if (empty($rawEntries)) {
        $fallbackUrl = "https://api.track.toggl.com/api/v9/me/time_entries?start_date={$calStartDateStr}T00:00:00Z&end_date={$calEndDateStr}T23:59:59Z";
        $fallbackRes = toggl_curl($fallbackUrl, $apiToken);
        if ($fallbackRes['ok'] && is_array($fallbackRes['data'])) {
            $rawEntries = $fallbackRes['data'];
        }
    }

    // If any project_ids in rawEntries are missing from $wsProjectMap, attempt to fetch them individually
    if (!empty($workspaceId) && !empty($rawEntries)) {
        $missingPids = [];
        foreach ($rawEntries as $re) {
            $pid = (string)($re['project_id'] ?? '');
            if ($pid !== '' && !isset($wsProjectMap[$pid])) {
                $missingPids[$pid] = true;
            }
        }
        if (!empty($missingPids)) {
            $fetchedNew = false;
            foreach (array_slice(array_keys($missingPids), 0, 15) as $missingPid) {
                $pRes = toggl_curl("https://api.track.toggl.com/api/v9/workspaces/{$workspaceId}/projects/{$missingPid}", $apiToken);
                if ($pRes['ok'] && !empty($pRes['data']['name'])) {
                    $wsProjectMap[$missingPid] = (string)$pRes['data']['name'];
                    $fetchedNew = true;
                }
            }
            if ($fetchedNew && !empty($cacheFile)) {
                @file_put_contents($cacheFile, json_encode($wsProjectMap));
            }
        }
    }

    // Process & Aggregate entries
    $monthTotalSeconds = 0;
    $monthDailySeconds = [];
    $allDailySeconds = [];
    $projectSeconds = [];
    $dailyProjects = [];

    // Initialize days of the month (1..$lastDay)
    for ($d = 1; $d <= $lastDay; $d++) {
        $dateKey = sprintf('%04d-%02d-%02d', $year, $month, $d);
        $monthDailySeconds[$dateKey] = 0;
    }

    // Initialize all days in the calendar grid
    $curCal = strtotime($calStartDateStr);
    $endCal = strtotime($calEndDateStr);
    while ($curCal <= $endCal) {
        $allDailySeconds[date('Y-m-d', $curCal)] = 0;
        $curCal = strtotime('+1 day', $curCal);
    }

    $processTimeEntry = function(int $dur, string $startStr, string $projName) use (
        &$monthTotalSeconds, &$monthDailySeconds, &$allDailySeconds,
        &$projectSeconds, &$dailyProjects,
        $firstDayOfMonth, $lastDayOfMonth
    ) {
        if ($dur <= 0) return;
        $dateKey = substr($startStr, 0, 10);
        if (empty($dateKey)) return;

        if (isset($allDailySeconds[$dateKey])) {
            $allDailySeconds[$dateKey] += $dur;
        } else {
            $allDailySeconds[$dateKey] = $dur;
        }

        if (!isset($dailyProjects[$dateKey])) {
            $dailyProjects[$dateKey] = [];
        }
        if (!isset($dailyProjects[$dateKey][$projName])) {
            $dailyProjects[$dateKey][$projName] = 0;
        }
        $dailyProjects[$dateKey][$projName] += $dur;

        // Month-specific totals
        if ($dateKey >= $firstDayOfMonth && $dateKey <= $lastDayOfMonth) {
            if (isset($monthDailySeconds[$dateKey])) {
                $monthDailySeconds[$dateKey] += $dur;
            }
            $monthTotalSeconds += $dur;

            if (!isset($projectSeconds[$projName])) {
                $projectSeconds[$projName] = 0;
            }
            $projectSeconds[$projName] += $dur;
        }
    };

    foreach ($rawEntries as $entry) {
        $pid = (string)($entry['project_id'] ?? '');
        $projName = $wsProjectMap[$pid] ?? (
            !empty($entry['project_name']) ? (string)$entry['project_name'] : (
                !empty($entry['project']) ? (string)$entry['project'] : (
                    !empty($entry['description']) ? (string)$entry['description'] : 'General / Untagged'
                )
            )
        );

        if (!empty($entry['time_entries']) && is_array($entry['time_entries'])) {
            foreach ($entry['time_entries'] as $subEntry) {
                $dur = (int)($subEntry['seconds'] ?? ($subEntry['duration'] ?? 0));
                $processTimeEntry($dur, (string)($subEntry['start'] ?? ''), $projName);
            }
        } else {
            $dur = (int)($entry['seconds'] ?? ($entry['duration'] ?? 0));
            $processTimeEntry($dur, (string)($entry['start'] ?? ''), $projName);
        }
    }

    // Build 7-day calendar matrix weeks (Monday through Sunday)
    $calendarWeeks = [];
    $weeklyMap = [];
    $curCal = strtotime($calStartDateStr);
    $wIdx = 1;

    while ($curCal <= $endCal) {
        $wStartStr = date('Y-m-d', $curCal);
        $wEndStr = date('Y-m-d', strtotime('+6 days', $curCal));
        $weekTotalSec = 0;
        $weekMonthSec = 0;
        $weekActiveDays = 0;
        $daysInWeek = [];

        for ($dayOffset = 0; $dayOffset < 7; $dayOffset++) {
            $dStr = date('Y-m-d', $curCal);
            $daySec = $allDailySeconds[$dStr] ?? 0;
            $dayHours = round($daySec / 3600, 2);
            $isCurMonth = ($dStr >= $firstDayOfMonth && $dStr <= $lastDayOfMonth);
            $isWeekend = ((int)date('N', $curCal) >= 6);

            $weekTotalSec += $daySec;
            if ($isCurMonth) {
                $weekMonthSec += $daySec;
            }
            if ($daySec > 0) {
                $weekActiveDays++;
            }

            // Project breakdown for this specific day
            $dayProjHours = [];
            if (!empty($dailyProjects[$dStr])) {
                foreach ($dailyProjects[$dStr] as $pName => $pSec) {
                    $dayProjHours[$pName] = round($pSec / 3600, 2);
                }
                arsort($dayProjHours);
            }

            $daysInWeek[] = [
                'date' => $dStr,
                'day_number' => (int)date('j', $curCal),
                'dayNumber' => (int)date('j', $curCal),
                'weekday' => date('D', $curCal),
                'is_current_month' => $isCurMonth,
                'isCurrentMonth' => $isCurMonth,
                'is_weekend' => $isWeekend,
                'isWeekend' => $isWeekend,
                'seconds' => $daySec,
                'hours' => $dayHours,
                'worked_days' => $dayHours >= 6 ? 1.0 : ($dayHours > 0 ? 0.5 : 0),
                'projects' => $dayProjHours
            ];

            $curCal = strtotime('+1 day', $curCal);
        }

        $wTotalHours = round($weekTotalSec / 3600, 2);
        $wMonthHours = round($weekMonthSec / 3600, 2);

        $weekItem = [
            'week_number' => $wIdx,
            'weekNum' => $wIdx,
            'label' => "Week {$wIdx} (" . date('M d', strtotime($wStartStr)) . " – " . date('M d', strtotime($wEndStr)) . ")",
            'start_date' => $wStartStr,
            'startDate' => $wStartStr,
            'end_date' => $wEndStr,
            'endDate' => $wEndStr,
            'total_seconds' => $weekTotalSec,
            'total_hours' => $wTotalHours,
            'seconds' => $weekTotalSec,
            'hours' => $wTotalHours,
            'month_seconds' => $weekMonthSec,
            'month_hours' => $wMonthHours,
            'active_days' => $weekActiveDays,
            'activeDays' => $weekActiveDays,
            'worked_days' => round($weekTotalSec / (8 * 3600), 1),
            'workedDays' => round($weekTotalSec / (8 * 3600), 1),
            'days' => $daysInWeek
        ];

        $calendarWeeks[] = $weekItem;
        $weeklyMap["w{$wIdx}"] = $weekItem;
        $wIdx++;
    }

    // Build chronological daily log for all days in the month (1..$lastDay)
    $dailyLog = [];
    $activeDaysCount = 0;
    for ($d = 1; $d <= $lastDay; $d++) {
        $dKey = sprintf('%04d-%02d-%02d', $year, $month, $d);
        $dSec = $monthDailySeconds[$dKey] ?? 0;
        $dHours = round($dSec / 3600, 2);
        $isWknd = ((int)date('N', strtotime($dKey)) >= 6);
        if ($dSec > 0) {
            $activeDaysCount++;
        }

        $dProj = [];
        if (!empty($dailyProjects[$dKey])) {
            foreach ($dailyProjects[$dKey] as $pName => $pSec) {
                $dProj[$pName] = round($pSec / 3600, 2);
            }
            arsort($dProj);
        }

        $status = 'off';
        if ($dSec > 0) {
            $status = 'worked';
        } elseif ($isWknd) {
            $status = 'weekend';
        }

        $dailyLog[] = [
            'date' => $dKey,
            'day_number' => $d,
            'dayNumber' => $d,
            'weekday' => date('D', strtotime($dKey)),
            'is_weekend' => $isWknd,
            'isWeekend' => $isWknd,
            'seconds' => $dSec,
            'hours' => $dHours,
            'worked_days' => round($dSec / (8 * 3600), 2),
            'status' => $status,
            'projects' => $dProj
        ];
    }

    // Build project breakdown
    $projectBreakdown = [];
    $projectHoursMap = [];
    foreach ($projectSeconds as $pName => $pSec) {
        $pHours = round($pSec / 3600, 2);
        $projectBreakdown[] = [
            'name' => $pName,
            'seconds' => $pSec,
            'hours' => $pHours,
            'percentage' => $monthTotalSeconds > 0 ? round(($pSec / $monthTotalSeconds) * 100, 1) : 0
        ];
        $projectHoursMap[$pName] = $pHours;
    }
    usort($projectBreakdown, fn($a, $b) => $b['seconds'] <=> $a['seconds']);
    arsort($projectHoursMap);

    $totalHours = round($monthTotalSeconds / 3600, 2);
    $standardDays = round($monthTotalSeconds / (8 * 3600), 1);
    $avgDailyHours = $activeDaysCount > 0 ? round($totalHours / $activeDaysCount, 2) : 0;
    $numWeeks = max(1, count($calendarWeeks));
    $avgHoursPerWeek = round($totalHours / $numWeeks, 2);

    $monthDailyHoursMap = [];
    foreach ($monthDailySeconds as $dKey => $sec) {
        $monthDailyHoursMap[$dKey] = round($sec / 3600, 2);
    }

    // Format daily projects with hours
    $dailyProjectsHoursMap = [];
    foreach ($dailyProjects as $dKey => $pList) {
        $dailyProjectsHoursMap[$dKey] = [];
        foreach ($pList as $pName => $pSec) {
            $dailyProjectsHoursMap[$dKey][$pName] = round($pSec / 3600, 2);
        }
        arsort($dailyProjectsHoursMap[$dKey]);
    }

    echo json_encode([
        'success' => true,
        'year' => $year,
        'month' => $month,
        'total_seconds' => $monthTotalSeconds,
        'total_hours' => $totalHours,
        'active_days' => $activeDaysCount,
        'standard_days' => $standardDays,
        'average_daily_hours' => $avgDailyHours,
        'average_weekly_hours' => $avgHoursPerWeek,
        'calendar_weeks' => $calendarWeeks,
        'weeks' => $calendarWeeks, // maintain backward compatibility
        'projects' => $projectBreakdown,
        'daily_log' => $dailyLog,
        'entry_count' => count($rawEntries),
        'data' => [
            'totalHours' => $totalHours,
            'activeDays' => $activeDaysCount,
            'standardDays' => $standardDays,
            'avgDailyHours' => $avgDailyHours,
            'avgWeeklyHours' => $avgHoursPerWeek,
            'weekly' => $weeklyMap,
            'calendarWeeks' => $calendarWeeks,
            'daily' => $monthDailyHoursMap,
            'dailyProjects' => $dailyProjectsHoursMap,
            'dailyLog' => $dailyLog,
            'projects' => $projectHoursMap
        ]
    ]);
    exit;
}

echo json_encode([
    'success' => false,
    'error' => 'Unknown action: ' . htmlspecialchars($action),
    'message' => 'Unknown action: ' . htmlspecialchars($action)
]);
