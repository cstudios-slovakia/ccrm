<?php
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/tickets.php';

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_migrate_tickets($pdo);
} catch (\Throwable $e) {
    http_response_code(500);
    exit;
}

/**
 * Extract normalized hostname from an Origin or Referer URL.
 */
function ccrm_extract_host_from_url(string $url): string {
    $url = trim($url);
    if ($url === '' || strtolower($url) === 'null') return '';
    if (stripos($url, 'file://') === 0) return 'localhost';
    if (strpos($url, '://') === false) {
        $url = 'http://' . $url;
    }
    $host = parse_url($url, PHP_URL_HOST);
    return $host ? strtolower(trim((string)$host)) : '';
}

/**
 * Strictly verify that $requestHost is in $allowedDomains.
 * The widget is NEVER public: if $allowedDomains is empty, returns false.
 * When testing locally from a file:// URL (where browsers omit Referer and send Origin: null or empty),
 * allow if 'localhost', '127.0.0.1', 'file', or 'file://' is explicitly in $allowedDomains.
 */
function ccrm_widget_domain_matches(string $requestHost, array $allowedDomains): bool {
    $requestHost = strtolower(trim($requestHost));

    $cleanDomains = [];
    foreach ($allowedDomains as $d) {
        $raw = strtolower(trim((string)$d));
        if ($raw === '') continue;
        if ($raw === 'file://' || $raw === 'file') {
            $cleanDomains[] = 'localhost';
            continue;
        }
        // Strip scheme/path if admin pasted a full URL
        if (strpos($raw, '://') !== false) {
            $parsedHost = parse_url($raw, PHP_URL_HOST);
            if ($parsedHost) $raw = strtolower($parsedHost);
        } else {
            $raw = explode('/', $raw)[0];
            $raw = explode(':', $raw)[0];
        }
        if ($raw !== '') $cleanDomains[] = $raw;
    }

    if (empty($cleanDomains)) {
        return false;
    }

    // If opened from local file:// (empty host / 'null' origin), allow if localhost or 127.0.0.1 is whitelisted
    if ($requestHost === '' || $requestHost === 'null') {
        return in_array('localhost', $cleanDomains, true) || in_array('127.0.0.1', $cleanDomains, true);
    }

    foreach ($cleanDomains as $pattern) {
        if ($pattern === $requestHost) return true;
        if (strpos($pattern, '*.') === 0) {
            $base = substr($pattern, 2);
            if ($requestHost === $base || substr($requestHost, -strlen('.' . $base)) === '.' . $base) {
                return true;
            }
        }
    }
    return false;
}

$originHeader = $_SERVER['HTTP_ORIGIN'] ?? '';
$refererHeader = $_SERVER['HTTP_REFERER'] ?? '';
$requestHost = ccrm_extract_host_from_url($originHeader);
if ($requestHost === '') {
    $requestHost = ccrm_extract_host_from_url($refererHeader);
}

// Handle CORS & Cross-Origin-Resource-Policy headers so external & file:// pages can load the widget
header('Access-Control-Allow-Origin: ' . ($originHeader !== '' ? $originHeader : '*'));
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cross-Origin-Resource-Policy: cross-origin');
header('Vary: Origin');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$rawBody = file_get_contents('php://input');
$input = $rawBody ? (json_decode($rawBody, true) ?: []) : [];
$action = $_GET['action'] ?? ($input['action'] ?? 'script');
$projectId = trim((string)($_GET['project'] ?? ($input['projectId'] ?? ($input['project'] ?? ''))));

if ($projectId === '') {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Missing project ID.']);
    exit;
}

$pStmt = $pdo->prepare("SELECT * FROM `projects` WHERE `id` = ? AND `archived` = 0 LIMIT 1");
$pStmt->execute([$projectId]);
$project = $pStmt->fetch(PDO::FETCH_ASSOC);

if (!$project || empty($project['ticket_widget_enabled'])) {
    if ($action === 'script') {
        http_response_code(403);
        header('Content-Type: application/javascript; charset=utf-8');
        echo "/* Koperniq Ticket Widget: Widget is disabled or project not found. */\n";
        exit;
    }
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Ticket widget is not enabled for this project.']);
    exit;
}

$allowedDomains = json_decode($project['ticket_allowed_domains'] ?? '[]', true) ?: [];
if (!ccrm_widget_domain_matches($requestHost, $allowedDomains)) {
    if ($action === 'script') {
        http_response_code(403);
        header('Content-Type: application/javascript; charset=utf-8');
        echo "/* Koperniq Ticket Widget: Domain '" . addslashes($requestHost) . "' is not whitelisted for this project. */\n";
        exit;
    }
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Domain is not whitelisted for this project widget.']);
    exit;
}

// Ensure project has a public hash for the status link
$publicHash = $project['ticket_public_hash'] ?? '';
if ($publicHash === '') {
    $publicHash = bin2hex(random_bytes(16));
    $pdo->prepare("UPDATE `projects` SET `ticket_public_hash` = ? WHERE `id` = ?")->execute([$publicHash, $projectId]);
}

// Helper to load combined email whitelist (project + paired client)
$getCombinedEmailWhitelist = function () use ($pdo, $project): array {
    $projEmails = json_decode($project['ticket_allowed_emails'] ?? '[]', true) ?: [];
    $leadEmails = [];
    $leadId = !empty($project['lead_id']) ? $project['lead_id'] : ($project['client_id'] ?? '');
    if ($leadId !== '') {
        $lStmt = $pdo->prepare("SELECT `ticket_allowed_emails` FROM `leads` WHERE `id` = ? LIMIT 1");
        $lStmt->execute([$leadId]);
        $rawLeadEmails = $lStmt->fetchColumn();
        if ($rawLeadEmails) {
            $leadEmails = json_decode((string)$rawLeadEmails, true) ?: [];
        }
    }
    return array_values(array_unique(array_merge($projEmails, $leadEmails)));
};

// Action: list existing tickets for follow-up inside the widget
if ($action === 'list') {
    header('Content-Type: application/json');
    $tStmt = $pdo->prepare("
        SELECT `id`, `ticket_number`, `title`, `description`, `status`, `priority`, `type`,
               `reporter_name`, `created_at`, `updated_at`, `resolved_at`
        FROM `tickets`
        WHERE `project_id` = ? AND `archived` = 0
        ORDER BY `updated_at` DESC
        LIMIT 50
    ");
    $tStmt->execute([$projectId]);
    $rows = $tStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $msgStmt = $pdo->prepare("
        SELECT `id`, `author_type`, `author_name`, `body`, `attachments_json`, `created_at`
        FROM `ticket_messages`
        WHERE `ticket_id` = ? AND `is_internal` = 0
        ORDER BY `created_at` ASC
    ");

    $tickets = [];
    foreach ($rows as $r) {
        $msgStmt->execute([$r['id']]);
        $msgs = [];
        foreach ($msgStmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $m) {
            $msgs[] = [
                'id' => $m['id'],
                'authorType' => $m['author_type'],
                'authorName' => $m['author_name'],
                'body' => $m['body'],
                'attachments' => json_decode($m['attachments_json'] ?? '[]', true) ?: [],
                'createdAt' => $m['created_at'],
            ];
        }
        $tickets[] = [
            'id' => $r['id'],
            'ticketNumber' => $r['ticket_number'],
            'title' => $r['title'],
            'subject' => $r['title'],
            'description' => $r['description'],
            'status' => $r['status'],
            'priority' => $r['priority'],
            'type' => $r['type'],
            'reporterName' => $r['reporter_name'],
            'createdAt' => $r['created_at'],
            'updatedAt' => $r['updated_at'],
            'resolvedAt' => $r['resolved_at'],
            'messages' => $msgs,
        ];
    }

    echo json_encode([
        'success' => true,
        'statuses' => ccrm_load_ticket_statuses($pdo),
        'tickets' => $tickets,
    ]);
    exit;
}

// Action: submit new ticket from widget
if ($action === 'submit') {
    header('Content-Type: application/json');
    $subject = trim((string)($input['subject'] ?? ($input['title'] ?? '')));
    $description = trim((string)($input['description'] ?? ''));
    $reporterName = trim((string)($input['reporterName'] ?? ''));
    $reporterEmail = strtolower(trim((string)($input['reporterEmail'] ?? '')));
    $priority = in_array($input['priority'] ?? '', ['critical', 'high', 'normal', 'low'], true) ? $input['priority'] : 'normal';
    $type = in_array($input['type'] ?? '', ['bug', 'question', 'feature_request', 'incident', 'billing'], true) ? $input['type'] : 'bug';
    $metadata = isset($input['metadata']) && is_array($input['metadata']) ? $input['metadata'] : [];
    $attachments = isset($input['attachments']) && is_array($input['attachments']) ? array_slice($input['attachments'], 0, 5) : [];

    if ($subject === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Subject is required.']);
        exit;
    }

    $emailWhitelist = $getCombinedEmailWhitelist();
    if (!empty($emailWhitelist) && !ccrm_email_matches_whitelist($reporterEmail, $emailWhitelist)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Your email address is not authorized to submit tickets for this project.']);
        exit;
    }

    $leadId = !empty($project['lead_id']) ? (string)$project['lead_id'] : (!empty($project['client_id']) ? (string)$project['client_id'] : null);
    $contractId = null;
    if ($projectId || $leadId) {
        $cStmt = $pdo->prepare("SELECT `id` FROM `support_contracts` WHERE `project_id` = ? OR `client_id` = ? LIMIT 1");
        $cStmt->execute([$projectId, $leadId]);
        $contractId = $cStmt->fetchColumn() ?: null;
    }

    $tckId = 'tck-' . bin2hex(random_bytes(6));
    $tckNumber = ccrm_next_ticket_number($pdo);
    $sla = ccrm_compute_ticket_sla($pdo, $priority, $contractId);

    $pdo->prepare("
        INSERT INTO `tickets` (
            `id`, `ticket_number`, `title`, `description`, `status`, `priority`, `type`, `source`,
            `project_id`, `client_id`, `reporter_name`, `reporter_email`,
            `first_response_due_at`, `resolve_due_at`,
            `metadata_json`, `attachments_json`, `archived`, `created_at`, `updated_at`
        ) VALUES (?, ?, ?, ?, 'new', ?, ?, 'widget', ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
    ")->execute([
        $tckId,
        $tckNumber,
        $subject,
        $description,
        $priority,
        $type,
        $projectId,
        $leadId,
        $reporterName ?: ($reporterEmail ?: 'Widget User'),
        $reporterEmail ?: null,
        $sla['firstResponseDueAt'],
        $sla['resolutionDueAt'],
        json_encode($metadata),
        json_encode($attachments),
    ]);

    $msgId = 'tmsg-' . bin2hex(random_bytes(6));
    $pdo->prepare("
        INSERT INTO `ticket_messages` (`id`, `ticket_id`, `author_type`, `author_name`, `author_email`, `is_internal`, `body`, `attachments_json`, `created_at`)
        VALUES (?, ?, 'client', ?, ?, 0, ?, ?, NOW())
    ")->execute([
        $msgId,
        $tckId,
        $reporterName ?: ($reporterEmail ?: 'Widget User'),
        $reporterEmail ?: null,
        $description ?: $subject,
        json_encode($attachments),
    ]);

    echo json_encode([
        'success' => true,
        'ticket' => [
            'id' => $tckId,
            'ticketNumber' => $tckNumber,
            'title' => $subject,
            'subject' => $subject,
            'status' => 'new',
            'priority' => $priority,
            'type' => $type,
        ],
    ]);
    exit;
}

// Action: follow up on an existing ticket from the widget
if ($action === 'followup') {
    header('Content-Type: application/json');
    $ticketId = trim((string)($input['ticketId'] ?? ''));
    $body = trim((string)($input['body'] ?? ''));
    $authorName = trim((string)($input['authorName'] ?? ''));
    $authorEmail = strtolower(trim((string)($input['authorEmail'] ?? '')));
    $attachments = isset($input['attachments']) && is_array($input['attachments']) ? array_slice($input['attachments'], 0, 5) : [];

    if ($ticketId === '' || $body === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Ticket ID and message body are required.']);
        exit;
    }

    $emailWhitelist = $getCombinedEmailWhitelist();
    if (!empty($emailWhitelist) && !ccrm_email_matches_whitelist($authorEmail, $emailWhitelist)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Your email address is not authorized to follow up on tickets for this project.']);
        exit;
    }

    $tStmt = $pdo->prepare("SELECT `id`, `status` FROM `tickets` WHERE `id` = ? AND `project_id` = ? AND `archived` = 0 LIMIT 1");
    $tStmt->execute([$ticketId, $projectId]);
    $ticketRow = $tStmt->fetch(PDO::FETCH_ASSOC);
    if (!$ticketRow) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Ticket not found for this project.']);
        exit;
    }

    $msgId = 'tmsg-' . bin2hex(random_bytes(6));
    $createdAt = date('Y-m-d H:i:s');
    $pdo->prepare("
        INSERT INTO `ticket_messages` (`id`, `ticket_id`, `author_type`, `author_name`, `author_email`, `is_internal`, `body`, `attachments_json`, `created_at`)
        VALUES (?, ?, 'client', ?, ?, 0, ?, ?, ?)
    ")->execute([
        $msgId,
        $ticketId,
        $authorName ?: ($authorEmail ?: 'Client'),
        $authorEmail ?: null,
        $body,
        json_encode($attachments),
        $createdAt,
    ]);

    $newStatus = in_array($ticketRow['status'], ['waiting', 'waiting_client', 'resolved'], true) ? 'open' : $ticketRow['status'];
    $pdo->prepare("UPDATE `tickets` SET `status` = ?, `updated_at` = NOW() WHERE `id` = ?")->execute([$newStatus, $ticketId]);

    echo json_encode([
        'success' => true,
        'status' => $newStatus,
        'message' => [
            'id' => $msgId,
            'authorType' => 'client',
            'authorName' => $authorName ?: ($authorEmail ?: 'Client'),
            'body' => $body,
            'attachments' => $attachments,
            'createdAt' => $createdAt,
        ],
    ]);
    exit;
}

// Default Action: Serve the embeddable Floating Widget JavaScript bundle
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store');

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$crmHost = $_SERVER['HTTP_HOST'] ?? 'localhost';
$scriptDir = rtrim( str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/ticket_widget.php'))), '/' );
$crmBaseUrl = $scheme . '://' . $crmHost . ($scriptDir ? $scriptDir : '');
$endpointUrl = $crmBaseUrl . '/api/ticket_widget.php';
$publicStatusUrl = $crmBaseUrl . '/#public-tickets/' . rawurlencode($publicHash);

$projectDisplayName = !empty($project['name']) ? $project['name'] : ($projectId === 'proj-vila-slavin' ? 'Vila Slavín' : $projectId);
$rawWidgetConfig = !empty($project['ticket_widget_config_json']) ? (json_decode($project['ticket_widget_config_json'], true) ?: []) : [];
$widgetConfig = array_merge([
    'primaryColor' => '#f97316',
    'position' => 'bottom-right',
    'buttonLabel' => 'Podpora / Support',
    'title' => $projectDisplayName . ' — Support',
    'subtitle' => 'Nahláste problém alebo odpovedzte na existujúci tiket.',
    'requireEmail' => !empty($getCombinedEmailWhitelist()),
    'captureErrors' => true,
    'allowScreenshots' => true,
    'allowFollowUp' => true,
], $rawWidgetConfig);

$configJson = json_encode([
    'projectId' => $projectId,
    'projectName' => $projectDisplayName,
    'endpointUrl' => $endpointUrl,
    'publicStatusUrl' => $publicStatusUrl,
    'config' => $widgetConfig,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

?>
(function() {
  if (window.KoperniqTicketWidgetLoaded) return;
  window.KoperniqTicketWidgetLoaded = true;

  const INIT = <?php echo $configJson; ?>;
  const CFG = INIT.config || {};
  const capturedErrors = [];
  const MAX_ERRORS = 25;

  function pushError(type, message, detail) {
    if (capturedErrors.length >= MAX_ERRORS) capturedErrors.shift();
    capturedErrors.push({
      time: new Date().toISOString(),
      type: type,
      message: String(message || '').slice(0, 500),
      detail: detail ? String(detail).slice(0, 800) : ''
    });
    updateErrorBadge();
  }

  if (CFG.captureErrors !== false) {
    window.addEventListener('error', function(e) {
      pushError('runtime', e.message || 'Runtime Error', (e.filename || '') + ':' + (e.lineno || '') + ':' + (e.colno || ''));
    });
    window.addEventListener('unhandledrejection', function(e) {
      const reason = e.reason ? (e.reason.stack || e.reason.message || String(e.reason)) : 'Unhandled Promise Rejection';
      pushError('promise', reason, '');
    });
    const origConsoleError = console.error;
    console.error = function() {
      try {
        const msg = Array.prototype.slice.call(arguments).map(function(a) {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ');
        pushError('console.error', msg, '');
      } catch (err) {}
      return origConsoleError.apply(console, arguments);
    };
  }

  const hostEl = document.createElement('div');
  hostEl.id = 'koperniq-ticket-widget-host';
  if (document.body) {
    document.body.appendChild(hostEl);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      document.body.appendChild(hostEl);
    });
  }
  const shadow = hostEl.attachShadow({ mode: 'open' });

  const primary = CFG.primaryColor || '#f97316';
  const posRight = (CFG.position || 'bottom-right') !== 'bottom-left';

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    @keyframes ktwLauncherIn {
      from { opacity: 0; transform: translateY(16px) scale(0.85); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes ktwBodyFade {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ktw-launcher {
      position: fixed;
      bottom: 20px;
      ${posRight ? 'right: 20px;' : 'left: 20px;'}
      z-index: 2147483646;
      background: ${primary};
      color: #fff;
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.35);
      animation: ktwLauncherIn 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, opacity 0.2s ease;
    }
    .ktw-launcher:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 14px 30px -5px rgba(0,0,0,0.45);
    }
    .ktw-launcher:active {
      transform: translateY(0) scale(0.96);
    }
    .ktw-launcher-icon {
      display: inline-block;
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ktw-launcher.open .ktw-launcher-icon {
      transform: rotate(-12deg) scale(1.1);
    }
    .ktw-badge {
      background: #ef4444;
      color: #fff;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 999px;
      display: none;
    }
    .ktw-panel {
      position: fixed;
      bottom: 76px;
      ${posRight ? 'right: 20px;' : 'left: 20px;'}
      width: 400px;
      max-width: calc(100vw - 32px);
      height: 580px;
      max-height: calc(100vh - 100px);
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #1e293b;
      border-radius: 16px;
      box-shadow: 0 20px 45px -10px rgba(0,0,0,0.55);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translateY(20px) scale(0.93);
      transform-origin: ${posRight ? 'bottom right' : 'bottom left'};
      transition:
        opacity 0.26s cubic-bezier(0.16, 1, 0.3, 1),
        transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
        visibility 0.26s;
      will-change: transform, opacity;
    }
    .ktw-panel.open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }
    .ktw-header {
      padding: 14px 16px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ktw-title { font-size: 15px; font-weight: 700; margin: 0; }
    .ktw-subtitle { font-size: 12px; color: #94a3b8; margin: 2px 0 0 0; }
    .ktw-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
    }
    .ktw-close:hover { background: #334155; color: #fff; transform: rotate(90deg); }
    .ktw-tabs {
      display: flex;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
    }
    .ktw-tab {
      flex: 1;
      padding: 10px 12px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .ktw-tab.active {
      color: #fff;
      border-bottom-color: ${primary};
      background: rgba(255,255,255,0.03);
    }
    .ktw-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
      animation: ktwBodyFade 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ktw-field { margin-bottom: 10px; }
    .ktw-label { display: block; font-size: 11px; font-weight: 600; color: #94a3b8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
    .ktw-input, .ktw-select, .ktw-textarea {
      width: 100%;
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .ktw-input:focus, .ktw-select:focus, .ktw-textarea:focus { border-color: ${primary}; box-shadow: 0 0 0 2px ${primary}33; }
    .ktw-textarea { min-height: 76px; resize: vertical; }
    .ktw-row { display: flex; gap: 8px; }
    .ktw-row > * { flex: 1; }
    .ktw-btn {
      background: ${primary};
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 9px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      transition: transform 0.15s ease, filter 0.15s ease;
    }
    .ktw-btn:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px); }
    .ktw-btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }
    .ktw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ktw-btn-secondary {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.15s ease;
    }
    .ktw-btn-secondary:hover { background: #334155; }
    .ktw-footer {
      padding: 10px 16px;
      background: #1e293b;
      border-top: 1px solid #334155;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
    }
    .ktw-link { color: ${primary}; text-decoration: none; font-weight: 600; }
    .ktw-link:hover { text-decoration: underline; }
    .ktw-ticket-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 0.18s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ktw-ticket-card:hover { border-color: ${primary}; transform: translateY(-1px); }
    .ktw-msg {
      padding: 8px 10px;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 12px;
      line-height: 1.45;
      animation: ktwBodyFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ktw-msg.client { background: #1e293b; border: 1px solid #334155; }
    .ktw-msg.agent { background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.35); }
    .ktw-status-pill {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .ktw-alert {
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 12px;
      margin-bottom: 10px;
      animation: ktwBodyFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ktw-alert.ok { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; }
    .ktw-alert.err { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; }
    .ktw-shot-preview {
      margin-top: 6px;
      position: relative;
      display: inline-block;
      animation: ktwBodyFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ktw-shot-preview img {
      max-width: 100%;
      max-height: 110px;
      border-radius: 6px;
      border: 1px solid #334155;
    }
    @keyframes ktwSuccessPop {
      0% { opacity: 0; transform: scale(0.5); }
      65% { transform: scale(1.08); }
      100% { opacity: 1; transform: scale(1); }
    }
    .ktw-success-screen {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 410px;
      padding: 18px 8px;
      animation: ktwBodyFade 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ktw-success-icon {
      width: 68px;
      height: 68px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.16);
      border: 2px solid rgba(16, 185, 129, 0.45);
      color: #34d399;
      font-size: 32px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 14px;
      box-shadow: 0 12px 30px -6px rgba(16, 185, 129, 0.35);
      animation: ktwSuccessPop 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .ktw-success-title {
      font-size: 18px;
      font-weight: 800;
      color: #f8fafc;
      margin: 0 0 6px 0;
    }
    .ktw-success-sub {
      font-size: 12.5px;
      color: #94a3b8;
      margin: 0 0 16px 0;
      max-width: 300px;
      line-height: 1.45;
    }
    .ktw-success-card {
      width: 100%;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 18px;
      text-align: left;
    }
    .ktw-success-num {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 8px;
      background: ${primary}22;
      border: 1px solid ${primary}55;
      color: ${primary};
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.innerHTML = `
    <button class="ktw-launcher" id="ktw-launcher" type="button">
      <span class="ktw-launcher-icon" id="ktw-launcher-icon">💬</span>
      <span>${CFG.buttonLabel || 'Support'}</span>
      <span class="ktw-badge" id="ktw-err-badge">0</span>
    </button>
    <div class="ktw-panel" id="ktw-panel">
      <div class="ktw-header">
        <div>
          <h3 class="ktw-title">${CFG.title || (INIT.projectName + ' Support')}</h3>
          <p class="ktw-subtitle">${CFG.subtitle || 'Report an issue or follow up on existing tickets'}</p>
        </div>
        <button class="ktw-close" id="ktw-close" type="button">✕</button>
      </div>
      <div class="ktw-tabs">
        <button class="ktw-tab active" data-tab="new" type="button">Nový tiket / Report</button>
        <button class="ktw-tab" data-tab="list" type="button">Existujúce tikety / Follow-up</button>
      </div>
      <div class="ktw-body" id="ktw-body-new">
        <div id="ktw-new-form-view">
          <div id="ktw-new-feedback"></div>
          <div class="ktw-row">
            <div class="ktw-field">
              <label class="ktw-label">Meno / Name</label>
              <input class="ktw-input" id="ktw-name" placeholder="Vaše meno" />
            </div>
            <div class="ktw-field">
              <label class="ktw-label">E-mail ${CFG.requireEmail ? '*' : ''}</label>
              <input class="ktw-input" id="ktw-email" type="email" placeholder="vas@email.sk" />
            </div>
          </div>
          <div class="ktw-field">
            <label class="ktw-label">Predmet / Subject *</label>
            <input class="ktw-input" id="ktw-subject" placeholder="Stručný popis problému..." />
          </div>
          <div class="ktw-row">
            <div class="ktw-field">
              <label class="ktw-label">Typ / Type</label>
              <select class="ktw-select" id="ktw-type">
                <option value="bug">Chyba / Bug</option>
                <option value="question">Otázka / Question</option>
                <option value="feature_request">Požiadavka / Feature</option>
                <option value="incident">Výpadok / Incident</option>
              </select>
            </div>
            <div class="ktw-field">
              <label class="ktw-label">Priorita / Priority</label>
              <select class="ktw-select" id="ktw-priority">
                <option value="normal">Normálna / Normal</option>
                <option value="low">Nízka / Low</option>
                <option value="high">Vysoká / High</option>
                <option value="critical">Kritická / Critical</option>
              </select>
            </div>
          </div>
          <div class="ktw-field">
            <label class="ktw-label">Popis / Description</label>
            <textarea class="ktw-textarea" id="ktw-desc" placeholder="Popíšte čo sa stalo... (Môžete tiež vložiť screenshot cez Ctrl+V)"></textarea>
          </div>
          <div class="ktw-field">
            <div class="ktw-row">
              <button class="ktw-btn-secondary" id="ktw-capture-btn" type="button">📸 Zachytiť obrazovku</button>
              <label class="ktw-btn-secondary" style="text-align:center;margin:0;">
                📎 Nahrať obrázok
                <input type="file" id="ktw-file-input" accept="image/*" style="display:none;" />
              </label>
            </div>
            <div id="ktw-shot-holder"></div>
          </div>
          <div class="ktw-field" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#cbd5e1;">
            <input type="checkbox" id="ktw-attach-logs" checked />
            <label for="ktw-attach-logs" id="ktw-logs-label">Priložiť technické info a chyby konzoly (0)</label>
          </div>
          <button class="ktw-btn" id="ktw-submit-btn" type="button">Odoslať tiket</button>
        </div>
        <div class="ktw-success-screen" id="ktw-new-success-view"></div>
      </div>
      <div class="ktw-body" id="ktw-body-list" style="display:none;">
        <div id="ktw-list-container">Načítavam tikety...</div>
      </div>
      <div class="ktw-footer">
        <span style="color:#94a3b8;">Verejný prehľad stavov:</span>
        <a class="ktw-link" href="${INIT.publicStatusUrl}" target="_blank" rel="noopener noreferrer">Otvoriť status stránku ↗</a>
      </div>
    </div>
  `;
  shadow.appendChild(container);

  const $ = function(id) { return shadow.getElementById(id); };
  let currentScreenshot = null;
  let loadedTickets = [];
  let loadedStatuses = [];
  let selectedTicketId = null;

  try {
    $('ktw-name').value = localStorage.getItem('ktw_reporter_name') || '';
    $('ktw-email').value = localStorage.getItem('ktw_reporter_email') || '';
  } catch (e) {}

  function updateErrorBadge() {
    const b = $('ktw-err-badge');
    const lbl = $('ktw-logs-label');
    if (b) {
      if (capturedErrors.length > 0) {
        b.style.display = 'inline-block';
        b.textContent = String(capturedErrors.length);
      } else {
        b.style.display = 'none';
      }
    }
    if (lbl) {
      lbl.textContent = 'Priložiť technické info a chyby konzoly (' + capturedErrors.length + ')';
    }
  }

  function renderScreenshotPreview() {
    const holder = $('ktw-shot-holder');
    if (!currentScreenshot) {
      holder.innerHTML = '';
      return;
    }
    holder.innerHTML = `
      <div class="ktw-shot-preview">
        <img src="${currentScreenshot}" alt="Screenshot" />
        <button type="button" id="ktw-remove-shot" class="ktw-btn-secondary" style="display:block;margin-top:4px;padding:3px 8px;font-size:11px;">Odstrániť screenshot</button>
      </div>
    `;
    $('ktw-remove-shot').onclick = function() {
      currentScreenshot = null;
      renderScreenshotPreview();
    };
  }

  function setPanelOpen(isOpen) {
    const panel = $('ktw-panel');
    const launcher = $('ktw-launcher');
    const icon = $('ktw-launcher-icon');
    if (isOpen) {
      panel.classList.add('open');
      launcher.classList.add('open');
      if (icon) icon.textContent = '✕';
    } else {
      panel.classList.remove('open');
      launcher.classList.remove('open');
      if (icon) icon.textContent = '💬';
    }
  }

  $('ktw-launcher').onclick = function() {
    const isOpen = !$('ktw-panel').classList.contains('open');
    setPanelOpen(isOpen);
  };
  $('ktw-close').onclick = function() {
    setPanelOpen(false);
  };

  const tabs = shadow.querySelectorAll('.ktw-tab');
  tabs.forEach(function(tabBtn) {
    tabBtn.onclick = function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      tabBtn.classList.add('active');
      const target = tabBtn.getAttribute('data-tab');
      if (target === 'new') {
        $('ktw-body-new').style.display = 'block';
        $('ktw-body-list').style.display = 'none';
      } else {
        $('ktw-body-new').style.display = 'none';
        $('ktw-body-list').style.display = 'block';
        selectedTicketId = null;
        fetchExistingTickets();
      }
    };
  });

  // Screen capture via getDisplayMedia
  $('ktw-capture-btn').onclick = async function() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('Váš prehliadač nepodporuje priame zachytenie obrazovky. Použite nahratie súboru alebo Ctrl+V.');
      return;
    }
    try {
      $('ktw-panel').style.opacity = '0';
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
      canvas.width = (video.videoWidth || 1280) * scale;
      canvas.height = (video.videoHeight || 720) * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach(function(t) { t.stop(); });
      currentScreenshot = canvas.toDataURL('image/jpeg', 0.8);
      renderScreenshotPreview();
    } catch (err) {
    } finally {
      $('ktw-panel').style.opacity = '';
    }
  };

  // File upload
  $('ktw-file-input').onchange = function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      currentScreenshot = ev.target.result;
      renderScreenshotPreview();
    };
    reader.readAsDataURL(file);
  };

  // Paste image support
  shadow.addEventListener('paste', function(e) {
    const items = (e.clipboardData || {}).items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = function(ev) {
            currentScreenshot = ev.target.result;
            renderScreenshotPreview();
          };
          reader.readAsDataURL(file);
        }
      }
    }
  });

  function showCreatedScreen(ticket, fallbackSubject) {
    const formView = $('ktw-new-form-view');
    const successView = $('ktw-new-success-view');
    formView.style.display = 'none';
    successView.style.display = 'flex';
    const tNum = escapeHtml(ticket.ticketNumber || 'TCK-NEW');
    const tSubj = escapeHtml(ticket.subject || ticket.title || fallbackSubject || '');
    const tPrio = escapeHtml((ticket.priority || 'normal').toUpperCase());
    successView.innerHTML = `
      <div class="ktw-success-icon">✓</div>
      <h4 class="ktw-success-title">Tiket bol vytvorený!</h4>
      <p class="ktw-success-sub">Vaša požiadavka bola úspešne zaznamenaná. Stav riešenia môžete kedykoľvek sledovať alebo doplniť.</p>
      <div class="ktw-success-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <span class="ktw-success-num">${tNum}</span>
          <span class="ktw-status-pill" style="background:rgba(16,185,129,0.16);color:#34d399;border:1px solid rgba(16,185,129,0.35);">PRIJATÉ • ${tPrio}</span>
        </div>
        <div style="font-size:14px;font-weight:700;color:#f8fafc;line-height:1.35;">${tSubj}</div>
      </div>
      <button type="button" class="ktw-btn" id="ktw-view-created-btn" style="margin-bottom:8px;">Zobraziť tiket a komunikáciu →</button>
      <button type="button" class="ktw-btn-secondary" id="ktw-create-another-btn" style="width:100%;padding:9px 14px;">+ Vytvoriť ďalší tiket</button>
    `;

    $('ktw-create-another-btn').onclick = function() {
      successView.style.display = 'none';
      formView.style.display = 'block';
    };
    $('ktw-view-created-btn').onclick = async function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      if (tabs[1]) tabs[1].classList.add('active');
      $('ktw-body-new').style.display = 'none';
      $('ktw-body-list').style.display = 'block';
      await fetchExistingTickets();
      if (ticket && ticket.id) {
        selectedTicketId = ticket.id;
        renderTicketsView();
      }
    };
  }

  // Submit new ticket
  $('ktw-submit-btn').onclick = async function() {
    const name = $('ktw-name').value.trim();
    const email = $('ktw-email').value.trim();
    const subject = $('ktw-subject').value.trim();
    const desc = $('ktw-desc').value.trim();
    const type = $('ktw-type').value;
    const priority = $('ktw-priority').value;
    const fb = $('ktw-new-feedback');
    fb.innerHTML = '';

    if (!subject) {
      fb.innerHTML = '<div class="ktw-alert err">Prosím vyplňte predmet tiketu.</div>';
      return;
    }
    if (CFG.requireEmail && !email) {
      fb.innerHTML = '<div class="ktw-alert err">Pre tento projekt je vyžadovaný autorizovaný e-mail.</div>';
      return;
    }

    try {
      localStorage.setItem('ktw_reporter_name', name);
      localStorage.setItem('ktw_reporter_email', email);
    } catch (e) {}

    $('ktw-submit-btn').disabled = true;
    try {
      const metadata = $('ktw-attach-logs').checked ? {
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: window.innerWidth + 'x' + window.innerHeight,
        errors: capturedErrors.slice()
      } : { url: window.location.href };

      const attachments = currentScreenshot ? [{
        id: 'att-' + Date.now(),
        name: 'screenshot.jpg',
        type: 'image/jpeg',
        dataUrl: currentScreenshot
      }] : [];

      const res = await fetch(INIT.endpointUrl + '?action=submit&project=' + encodeURIComponent(INIT.projectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: INIT.projectId,
          reporterName: name,
          reporterEmail: email,
          subject: subject,
          description: desc,
          type: type,
          priority: priority,
          metadata: metadata,
          attachments: attachments
        })
      });
      const data = await res.json();
      if (!data.success) {
        fb.innerHTML = '<div class="ktw-alert err">' + (data.message || 'Chyba pri odosielaní.') + '</div>';
      } else {
        $('ktw-subject').value = '';
        $('ktw-desc').value = '';
        currentScreenshot = null;
        renderScreenshotPreview();
        showCreatedScreen(data.ticket || {}, subject);
      }
    } catch (err) {
      fb.innerHTML = '<div class="ktw-alert err">Nepodarilo sa spojiť so serverom podpory.</div>';
    } finally {
      $('ktw-submit-btn').disabled = false;
    }
  };

  function getStatusInfo(statusId) {
    const found = (loadedStatuses || []).find(function(s) { return s.id === statusId; });
    return found || { labelSk: statusId, color: '#64748b' };
  }

  async function fetchExistingTickets() {
    const box = $('ktw-list-container');
    box.innerHTML = '<div style="color:#94a3b8;font-size:12px;">Načítavam tikety...</div>';
    try {
      const res = await fetch(INIT.endpointUrl + '?action=list&project=' + encodeURIComponent(INIT.projectId));
      const data = await res.json();
      if (!data.success) {
        box.innerHTML = '<div class="ktw-alert err">' + (data.message || 'Chyba načítania.') + '</div>';
        return;
      }
      loadedTickets = data.tickets || [];
      loadedStatuses = data.statuses || [];
      renderTicketsView();
    } catch (err) {
      box.innerHTML = '<div class="ktw-alert err">Nepodarilo sa načítať tikety.</div>';
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderTicketsView() {
    const box = $('ktw-list-container');
    if (selectedTicketId) {
      const t = loadedTickets.find(function(x) { return x.id === selectedTicketId; });
      if (!t) {
        selectedTicketId = null;
        renderTicketsView();
        return;
      }
      const st = getStatusInfo(t.status);
      const msgsHtml = (t.messages || []).map(function(m) {
        return `
          <div class="ktw-msg ${m.authorType === 'agent' ? 'agent' : 'client'}">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-bottom:3px;">
              <strong>${escapeHtml(m.authorName || (m.authorType === 'agent' ? 'Podpora' : 'Klient'))}</strong>
              <span>${escapeHtml((m.createdAt || '').slice(0, 16))}</span>
            </div>
            <div style="white-space:pre-wrap;">${escapeHtml(m.body)}</div>
          </div>
        `;
      }).join('');

      box.innerHTML = `
        <button type="button" class="ktw-btn-secondary" id="ktw-back-btn" style="margin-bottom:10px;">← Späť na zoznam tiketov</button>
        <div style="margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-size:11px;font-weight:700;color:#94a3b8;">${escapeHtml(t.ticketNumber)}</span>
            <span class="ktw-status-pill" style="background:${st.color}22;color:${st.color};border:1px solid ${st.color}55;">${escapeHtml(st.labelSk || t.status)}</span>
          </div>
          <div style="font-size:14px;font-weight:700;margin-top:4px;">${escapeHtml(t.subject)}</div>
        </div>
        <div style="max-height:220px;overflow-y:auto;margin-bottom:10px;">
          ${msgsHtml || '<div style="font-size:12px;color:#94a3b8;">Žiadne správy.</div>'}
        </div>
        <div id="ktw-followup-fb"></div>
        <div class="ktw-field">
          <label class="ktw-label">Doplniť správu / Follow-up</label>
          <textarea class="ktw-textarea" id="ktw-followup-body" placeholder="Napíšte odpoveď alebo doplnenie k tiketu..."></textarea>
        </div>
        <button type="button" class="ktw-btn" id="ktw-followup-send">Odoslať odpoveď</button>
      `;

      $('ktw-back-btn').onclick = function() {
        selectedTicketId = null;
        renderTicketsView();
      };
      $('ktw-followup-send').onclick = async function() {
        const body = $('ktw-followup-body').value.trim();
        const fb = $('ktw-followup-fb');
        if (!body) return;
        $('ktw-followup-send').disabled = true;
        try {
          const res = await fetch(INIT.endpointUrl + '?action=followup&project=' + encodeURIComponent(INIT.projectId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: INIT.projectId,
              ticketId: t.id,
              authorName: $('ktw-name').value.trim() || 'Klient',
              authorEmail: $('ktw-email').value.trim(),
              body: body
            })
          });
          const data = await res.json();
          if (!data.success) {
            fb.innerHTML = '<div class="ktw-alert err">' + escapeHtml(data.message || 'Chyba') + '</div>';
          } else {
            t.messages = t.messages || [];
            t.messages.push(data.message);
            t.status = data.status || t.status;
            renderTicketsView();
          }
        } catch (err) {
          fb.innerHTML = '<div class="ktw-alert err">Chyba spojenia.</div>';
        } finally {
          if ($('ktw-followup-send')) $('ktw-followup-send').disabled = false;
        }
      };
      return;
    }

    if (!loadedTickets.length) {
      box.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:24px 0;">Zatiaľ žiadne tikety pre tento projekt.</div>';
      return;
    }

    box.innerHTML = loadedTickets.map(function(t) {
      const st = getStatusInfo(t.status);
      return `
        <div class="ktw-ticket-card" data-ticket-id="${escapeHtml(t.id)}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:11px;font-weight:700;color:#94a3b8;">${escapeHtml(t.ticketNumber)}</span>
            <span class="ktw-status-pill" style="background:${st.color}22;color:${st.color};border:1px solid ${st.color}55;">${escapeHtml(st.labelSk || t.status)}</span>
          </div>
          <div style="font-size:13px;font-weight:600;color:#f8fafc;">${escapeHtml(t.subject)}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;display:flex;justify-content:space-between;">
            <span>💬 ${(t.messages || []).length} správ</span>
            <span>${escapeHtml((t.updatedAt || '').slice(0, 16))}</span>
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('.ktw-ticket-card').forEach(function(card) {
      card.onclick = function() {
        selectedTicketId = card.getAttribute('data-ticket-id');
        renderTicketsView();
      };
    });
  }
})();

