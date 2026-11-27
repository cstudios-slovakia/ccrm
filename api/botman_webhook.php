<?php
/**
 * CCRM BotMan Multi-Channel Webhook Receiver & Embeddable WebDriver Widget.
 *
 * Endpoints:
 *  - POST/GET `/api/botman_webhook.php?connector_id=<id>&driver=<type>`
 *      Receives incoming webhook events from Telegram, Facebook Messenger, Slack,
 *      Discord, Microsoft Teams, Viber, Twilio SMS, and BotMan WebDriver.
 *  - GET `/api/botman_webhook.php?widget=js&connector_id=<id>`
 *      Serves the embeddable BotMan Web Chat `<script>` widget for external websites.
 *  - GET `/api/botman_webhook.php?widget=poll&connector_id=<id>&chat_id=<visitorId>`
 *      Returns live messages for the embedded Web Chat visitor.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/botman/botman_lib.php';
require_once __DIR__ . '/marveen/marveen_lib.php';

// Allow cross-origin requests for the embeddable WebChat widget & external webhooks
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Viber-Auth-Token, X-Slack-Signature, X-Hub-Signature-256');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['ok' => false, 'error' => 'Database unavailable']);
    exit;
}

$connectorId = trim((string)($_GET['connector_id'] ?? ($_POST['connector_id'] ?? '')));
$driverHint = strtolower(trim((string)($_GET['driver'] ?? ($_POST['driver'] ?? ''))));
$widgetMode = strtolower(trim((string)($_GET['widget'] ?? '')));

// Locate the target BotMan connector row
$mailboxRow = null;
if ($connectorId !== '') {
    $stmt = $pdo->prepare("SELECT * FROM `company_mailboxes` WHERE `id` = ? LIMIT 1");
    $stmt->execute([$connectorId]);
    $mailboxRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}
if (!$mailboxRow && $driverHint !== '') {
    foreach ($pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1")->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $s = ccrm_botman_resolve_settings($row, $pdo);
        if (strtolower((string)($s['connectorType'] ?? '')) === $driverHint) {
            $mailboxRow = $row;
            $connectorId = (string)$row['id'];
            break;
        }
    }
}

// 1. Embeddable BotMan Web Chat Widget JS (`?widget=js&connector_id=<id>`)
if ($widgetMode === 'js') {
    header('Content-Type: application/javascript; charset=UTF-8');
    $settings = $mailboxRow ? ccrm_botman_resolve_settings($mailboxRow, $pdo) : [];
    $title = addslashes((string)($settings['botmanSenderName'] ?? ($mailboxRow['name'] ?? 'Live Support')));
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost:8085';
    $baseUrl = $scheme . '://' . $host . '/api/botman_webhook.php';
    $cid = addslashes($connectorId);
    echo <<<JS
(function() {
  if (window.__CCRM_BOTMAN_WIDGET__) return;
  window.__CCRM_BOTMAN_WIDGET__ = true;
  var connectorId = "{$cid}";
  var endpoint = "{$baseUrl}";
  var title = "{$title}";
  var visitorId = localStorage.getItem("ccrm_bm_uid") || ("v-" + Math.random().toString(36).slice(2, 10));
  localStorage.setItem("ccrm_bm_uid", visitorId);

  var btn = document.createElement("button");
  btn.innerHTML = "💬 " + title;
  btn.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:99999;background:#4f46e5;color:#fff;border:none;border-radius:999px;padding:12px 20px;font:600 14px system-ui,sans-serif;box-shadow:0 10px 25px rgba(79,70,229,0.35);cursor:pointer;";
  var box = document.createElement("div");
  box.style.cssText = "display:none;position:fixed;bottom:76px;right:20px;z-index:99999;width:340px;height:440px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 20px 40px rgba(15,23,42,0.18);flex-direction:column;overflow:hidden;font:14px system-ui,sans-serif;";
  box.innerHTML = '<div style="background:#4f46e5;color:#fff;padding:12px 16px;font-weight:700;display:flex;justify-content:space-between;align-items:center;"><span>' + title + '</span><span id="ccrm-bm-close" style="cursor:pointer;opacity:0.8;">✕</span></div>' +
    '<div id="ccrm-bm-msgs" style="flex:1;padding:12px;overflow-y:auto;background:#f8fafc;display:flex;flex-direction:column;gap:8px;"></div>' +
    '<form id="ccrm-bm-form" style="display:flex;border-top:1px solid #e2e8f0;background:#fff;padding:8px;gap:6px;">' +
    '<input id="ccrm-bm-input" placeholder="Type a message..." style="flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;outline:none;" />' +
    '<button type="submit" style="background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;">Send</button></form>';
  document.body.appendChild(btn);
  document.body.appendChild(box);

  var msgsEl = box.querySelector("#ccrm-bm-msgs");
  function renderMessages(list) {
    msgsEl.innerHTML = "";
    (list || []).forEach(function(m) {
      var b = document.createElement("div");
      var isVisitor = !m.fromMe;
      b.style.cssText = "max-width:82%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.4;" +
        (isVisitor ? "align-self:flex-end;background:#4f46e5;color:#fff;" : "align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;");
      b.textContent = m.text;
      msgsEl.appendChild(b);
    });
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function poll() {
    if (box.style.display === "none") return;
    fetch(endpoint + "?widget=poll&connector_id=" + encodeURIComponent(connectorId) + "&chat_id=" + encodeURIComponent(visitorId))
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d && Array.isArray(d.messages)) renderMessages(d.messages); })
      .catch(function() {});
  }

  btn.onclick = function() {
    box.style.display = box.style.display === "none" ? "flex" : "none";
    poll();
  };
  box.querySelector("#ccrm-bm-close").onclick = function() { box.style.display = "none"; };
  box.querySelector("#ccrm-bm-form").onsubmit = function(e) {
    e.preventDefault();
    var inp = box.querySelector("#ccrm-bm-input");
    var txt = inp.value.trim();
    if (!txt) return;
    inp.value = "";
    fetch(endpoint + "?connector_id=" + encodeURIComponent(connectorId) + "&driver=webchat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: visitorId, message: txt })
    }).then(function(r) { return r.json(); }).then(function() { poll(); });
  };
  setInterval(poll, 4000);
})();
JS;
    exit;
}

// 2. Embeddable Web Chat Poll (`?widget=poll&connector_id=<id>&chat_id=<visitorId>`)
if ($widgetMode === 'poll') {
    header('Content-Type: application/json; charset=UTF-8');
    if (!$mailboxRow) {
        echo json_encode(['ok' => false, 'messages' => []]);
        exit;
    }
    $chatId = trim((string)($_GET['chat_id'] ?? ''));
    $store = ccrm_botman_load_store($mailboxRow);
    $msgs = $chatId !== '' ? ($store['messages'][$chatId] ?? []) : [];
    echo json_encode(['ok' => true, 'messages' => $msgs]);
    exit;
}

// 3. Standard BotMan Webhook Receiver (Telegram, Messenger, Slack, Discord, Teams, Viber, Twilio, WebChat)
if (!$mailboxRow) {
    http_response_code(404);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['ok' => false, 'error' => 'BotMan connector not found.']);
    exit;
}

$settings = ccrm_botman_resolve_settings($mailboxRow, $pdo);
$type = strtolower((string)($settings['connectorType'] ?? $driverHint ?: 'telegram'));
$drivers = ccrm_botman_drivers();
$driver = $drivers[$type] ?? null;

if (!$driver) {
    http_response_code(400);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['ok' => false, 'error' => 'Unsupported BotMan driver: ' . $type]);
    exit;
}

$rawBody = (string)file_get_contents('php://input');
$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    // Support application/x-www-form-urlencoded (Twilio, BotMan WebDriver form posts)
    $payload = !empty($_POST) ? $_POST : [];
}
$headers = function_exists('getallheaders') ? (getallheaders() ?: []) : [];

// Check if this request is a provider webhook verification handshake (Meta hub.challenge, Slack url_verification, etc.)
$verification = ($driver['verifyWebhook'])($_GET, $payload, $settings);
if (is_array($verification)) {
    http_response_code((int)($verification['status'] ?? 200));
    if (array_key_exists('raw', $verification)) {
        header('Content-Type: text/plain; charset=UTF-8');
        echo (string)$verification['raw'];
    } else {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode($verification['json'] ?? ['ok' => true]);
    }
    exit;
}

// Parse incoming messages from the webhook payload
$incoming = ($driver['parseWebhook'])($payload, $headers, $_GET, $rawBody, $settings);
$added = ccrm_botman_ingest_messages($mailboxRow, $incoming);

$triggeredRuns = [];
if ($added > 0 && function_exists('ccrm_marveen_process_event_triggers')) {
    try {
        $trigRes = ccrm_marveen_process_event_triggers($pdo, (string)$mailboxRow['id']);
        $triggeredRuns = $trigRes['fired'] ?? [];
    } catch (\Throwable $e) {
        error_log('[CCRM BotMan Webhook Trigger] ' . $e->getMessage());
    }
}

// Twilio expects TwiML `<Response></Response>` on webhook POST
if ($type === 'twilio') {
    header('Content-Type: text/xml; charset=UTF-8');
    echo '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
    exit;
}

header('Content-Type: application/json; charset=UTF-8');
echo json_encode([
    'ok' => true,
    'status' => 200,
    'driver' => $driver['driverClass'],
    'ingested' => $added,
    'triggered' => count($triggeredRuns),
]);
