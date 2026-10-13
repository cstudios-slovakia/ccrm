<?php
/**
 * External Time Tracking API Gateway & Proxy (Toggl Track v9 & Clockify).
 *
 * Provides a secure backend bridge to test API keys, fetch workspace users for
 * employee mapping dropdowns, and retrieve aggregated monthly/weekly worked hours.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/time_tracking_lib.php';
require_once __DIR__ . '/read_scope.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        exit;
    }
    $sessionUser = ccrm_require_auth();
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

// Who may use which action. Probing the integration with keys is settings work; the user
// list for the employee mapping dropdown is employee-editing work; the hours of an employee
// are HR data. A person reads their OWN hours through api/my_employment.php, which resolves
// the time-tracking user from their linked record instead of taking one from the request.
if (isset($sessionUser)) {
    if ($action === 'test_connection') {
        ccrm_gate($sessionUser, 'general_config', 'edit');
    } elseif ($action === 'fetch_workspace_users') {
        ccrm_gate_any($sessionUser, ['general_config', 'employees'], 'edit');
    } elseif ($action === 'fetch_employee_hours') {
        ccrm_gate($sessionUser, 'employees', 'view');
    } else {
        ccrm_gate_any($sessionUser, ['general_config', 'employees'], 'edit');
    }
}


$settings = ccrm_time_tracking_stored_settings($pdo);
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
// The settings screen is given the masked placeholder, not the token, and sends it
// back as-is when the user did not retype one: that means "use the stored token".
if ($apiToken === CCRM_SECRET_MASK) {
    $apiToken = ccrm_time_tracking_toggl_token($settings);
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

    echo json_encode(ccrm_time_tracking_month_hours($apiToken, $workspaceId, $extUserId, $year, $month));
    exit;
}

echo json_encode([
    'success' => false,
    'error' => 'Unknown action: ' . htmlspecialchars($action),
    'message' => 'Unknown action: ' . htmlspecialchars($action)
]);
