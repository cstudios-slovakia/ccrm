<?php
/**
 * Seeds five demo workflows into Automations & Workflows.
 *
 * They are meant as readable examples of what the builder can do — two simple
 * ones, one medium, two complex — and together they touch every node type and
 * almost every field the canvas exposes: trigger filters, conditions with both
 * branches, an AI agent, and all four actions (create lead, create client,
 * create task, send e-mail).
 *
 * Usage (from the repo root):
 *   php scripts/seed_demo_workflows.php              # seed / refresh, enabled
 *   php scripts/seed_demo_workflows.php --inactive   # seed / refresh, disabled
 *   php scripts/seed_demo_workflows.php --remove     # delete them again
 *
 * Re-running is safe: the workflows have fixed ids and are overwritten, never
 * duplicated. Lead states, lead sources and users are read from this instance's
 * own settings, so the demos point at states that actually exist here.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script is CLI only.\n");
}

$root = dirname(__DIR__);
$configFile = $root . '/config.php';
if (!file_exists($configFile)) {
    exit("config.php not found — is the CRM installed?\n");
}
require_once $configFile;

$pdo = get_db_connection();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$argvFlags = array_slice($argv, 1);
$remove = in_array('--remove', $argvFlags, true);
$isActive = in_array('--inactive', $argvFlags, true) ? 0 : 1;

// ---------------------------------------------------------------------------
// Instance-specific values
// ---------------------------------------------------------------------------

/** A JSON list out of system_settings, or [] when it is missing. */
function setting_list(PDO $pdo, string $key): array {
    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
        $stmt->execute([$key]);
        $raw = $stmt->fetchColumn();
    } catch (\Throwable $e) {
        return [];
    }
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
}

/**
 * The entry whose name contains one of $needles, or the one at $fallbackIndex.
 * State and source names are free text and translated per instance, so a demo
 * cannot hardcode "offer sent" and still work on a Slovak or Hungarian CRM.
 */
function pick_entry(array $list, array $needles, int $fallbackIndex): string {
    foreach ($needles as $needle) {
        foreach ($list as $entry) {
            if (mb_stripos($entry, $needle) !== false) {
                return $entry;
            }
        }
    }
    if (!$list) {
        return '';
    }
    if ($fallbackIndex < 0) {
        $fallbackIndex = max(0, count($list) + $fallbackIndex);
    }
    return $list[min($fallbackIndex, count($list) - 1)];
}

$leadStates = setting_list($pdo, 'LEAD_STATES') ?: ['new', 'contacted', 'offer sent', 'accepted', 'rejected'];
$leadSources = setting_list($pdo, 'LEAD_SOURCES') ?: ['showroom', 'facebook', 'instagram', 'website'];

$stateNew     = pick_entry($leadStates, ['new', 'nov', 'új'], 0);
$stateOffer   = pick_entry($leadStates, ['offer', 'ponuk', 'ajánlat'], 2);
$stateWon     = pick_entry($leadStates, ['accept', 'prijat', 'elfogad', 'won', 'vyhr'], -2);
$sourceWeb    = pick_entry($leadSources, ['web', 'stránk', 'weboldal'], -1);

// Whoever gets the internal notifications. An admin if there is one.
$manager = ['name' => 'Admin', 'email' => 'admin@example.com'];
try {
    $row = $pdo->query("SELECT `name`, `email` FROM `users` ORDER BY (`role` = 'admin') DESC, `id` ASC LIMIT 1")
               ->fetch(PDO::FETCH_ASSOC);
    if ($row && !empty($row['name'])) {
        $manager = ['name' => $row['name'], 'email' => $row['email'] ?: $manager['email']];
    }
} catch (\Throwable $e) {
    // Keep the placeholder; the operator can edit the node.
}

// ---------------------------------------------------------------------------
// Canvas helpers — nodes are absolutely positioned, cards are 320px wide
// ---------------------------------------------------------------------------

const COL = 400;   // horizontal step between two chained nodes
const X0  = 100;

function col(int $index): int {
    return X0 + ($index * COL);
}

function node(string $id, string $type, string $name, array $data, int $x, int $y): array {
    return ['id' => $id, 'type' => $type, 'name' => $name, 'data' => $data, 'x' => $x, 'y' => $y];
}

/** $handle is 'true' / 'false' on a condition node, null everywhere else. */
function edge(string $source, string $target, ?string $handle = null): array {
    return [
        'id' => 'edge-' . $source . '-' . $target . ($handle ? '-' . $handle : ''),
        'source' => $source,
        'target' => $target,
        'sourceHandle' => $handle,
    ];
}

// ---------------------------------------------------------------------------
// The five demos
// ---------------------------------------------------------------------------

$workflows = [];

// --- 1. Simple: welcome e-mail for a lead that came in from the website -----
$workflows[] = [
    'id' => 'wf-demo-1-welcome-email',
    'name' => 'Demo 1 · Welcome e-mail for a web lead',
    'description' => 'Simple. A lead arrives from the website and immediately gets a confirmation e-mail with the name of the person who will call them. Trigger filter on the lead source + one Send e-mail action.',
    'trigger_type' => 'lead_created',
    'trigger_config' => ['leadSource' => $sourceWeb],
    'nodes' => [
        node('node-trigger', 'trigger', 'New lead from ' . $sourceWeb, ['type' => 'lead_created'], col(0), 140),
        node('node-welcome-mail', 'action', 'Send the welcome e-mail', [
            'type' => 'send_email',
            'to' => '{{$trigger.email}}',
            'subject' => 'Thank you for your enquiry, {{$trigger.name}}',
            'body' => "<p>Hello {{\$trigger.name}},</p>"
                . "<p>thank you for contacting us. Your enquiry is in our system and <b>{{\$trigger.owner}}</b> will get back to you within one working day.</p>"
                . "<p>This is what we received:</p>"
                . "<ul><li>City: {{\$trigger.city}}</li><li>Phone: {{\$trigger.phone}}</li><li>Source: {{\$trigger.source}}</li></ul>"
                . "<p>Kind regards,<br>The sales team</p>",
        ], col(1), 140),
    ],
    'edges' => [
        edge('node-trigger', 'node-welcome-mail'),
    ],
];

// --- 2. Simple: follow-up task three days after the offer went out ----------
$workflows[] = [
    'id' => 'wf-demo-2-offer-followup',
    'name' => 'Demo 2 · Follow up after an offer is sent',
    'description' => 'Simple. The moment a lead is moved to "' . $stateOffer . '", a follow-up task with a deadline and a time is opened for its owner. Trigger filter on the status change + one Create task action.',
    'trigger_type' => 'lead_status_changed',
    'trigger_config' => ['fromStatus' => 'any', 'toStatus' => $stateOffer],
    'nodes' => [
        node('node-trigger', 'trigger', 'Lead moved to "' . $stateOffer . '"', ['type' => 'lead_status_changed'], col(0), 140),
        node('node-followup-task', 'action', 'Open the follow-up task', [
            'type' => 'create_task',
            'title' => 'Follow up on the offer for {{$trigger.name}}',
            'description' => "The lead moved from \"{{\$trigger.oldStatus}}\" to \"{{\$trigger.newStatus}}\".\n\n"
                . "Value: {{\$trigger.value}} EUR\nCity: {{\$trigger.city}}\nPhone: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\n\n"
                . "Call the client, confirm the offer arrived and write the answer into the timeline.",
            'priority' => 'high',
            'deadline_days' => 3,
            'deadline_time' => '09:00',
            'owner' => '{{$trigger.owner}}',
        ], col(1), 140),
    ],
    'edges' => [
        edge('node-trigger', 'node-followup-task'),
    ],
];

// --- 3. Medium: manual button that logs a phone enquiry ---------------------
$workflows[] = [
    'id' => 'wf-demo-3-phone-enquiry',
    'name' => 'Demo 3 · Log a phone enquiry (manual button)',
    'description' => 'Medium. A styled button in the header toolbar creates an empty lead, opens a task to qualify it and notifies ' . $manager['name'] . ' by e-mail. Shows the manual trigger with its own colour, style and icon, plus two actions branching out of one node.',
    'trigger_type' => 'manual',
    'trigger_config' => [
        'buttonColor' => '#0f766e',
        'buttonStyle' => 'full',
        'buttonIcon' => 'Phone',
    ],
    'nodes' => [
        node('node-trigger', 'trigger', 'Manual button in the header', ['type' => 'manual'], col(0), 300),
        node('node-create-lead', 'action', 'Create the placeholder lead', [
            'type' => 'create_lead',
            'name' => 'New phone enquiry',
            'city' => '',
            'status' => $stateNew,
            'owner' => $manager['name'],
            'value' => '0',
        ], col(1), 140),
        node('node-qualify-task', 'action', 'Task: qualify the enquiry', [
            'type' => 'create_task',
            'title' => 'Qualify the new phone enquiry',
            'description' => "Logged from the header button by {{\$trigger.triggered_by}}.\n\n"
                . "New lead record: {{\$input.name}} (ID {{\$input.id}}), status {{\$input.status}}.\n\n"
                . "Call back, fill in the name, the company details and the contacts, then move the lead forward.",
            'priority' => 'high',
            'deadline_days' => 1,
            'deadline_time' => '08:30',
            'owner' => $manager['name'],
        ], col(2), 140),
        node('node-notify-mail', 'action', 'Notify the account manager', [
            'type' => 'send_email',
            'to' => $manager['email'],
            'subject' => 'New phone enquiry logged in the CRM',
            'body' => "<p>{{\$trigger.triggered_by}} logged a new phone enquiry from the header button.</p>"
                . "<p>Lead ID: <b>{{\$input.id}}</b><br>Status: {{\$input.status}}</p>"
                . "<p>Open the CRM and qualify it.</p>",
        ], col(2), 620),
    ],
    'edges' => [
        edge('node-trigger', 'node-create-lead'),
        edge('node-create-lead', 'node-qualify-task'),
        edge('node-create-lead', 'node-notify-mail'),
    ],
];

// --- 4. Complex: AI triage of every incoming lead ---------------------------
$workflows[] = [
    'id' => 'wf-demo-4-ai-triage',
    'name' => 'Demo 4 · AI triage of a new lead',
    'description' => 'Complex. Every new lead is split by type and value. Bigger business leads get an AI qualification note that lands both in a high-priority task and in an e-mail to ' . $manager['name'] . '; everything else goes to the nurture list. Shows a condition with both branches, an AI agent and its {{$ai.result}} output.',
    'trigger_type' => 'lead_created',
    'trigger_config' => [],
    'nodes' => [
        node('node-trigger', 'trigger', 'Any new lead', ['type' => 'lead_created'], col(0), 340),
        node('node-value-check', 'condition', 'Business lead over 2 000 EUR?', [
            'js_code' => 'return $trigger.clientType !== "person" && $trigger.value >= 2000;',
        ], col(1), 340),
        node('node-ai-note', 'ai_agent', 'AI qualification note', [
            'provider' => 'gemini',
            'prompt' => "You are a CRM assistant. Write a short qualification note (max 4 sentences) for the sales team about this new lead.\n\n"
                . "Name: {{\$trigger.name}}\nType: {{\$trigger.clientType}}\nCity: {{\$trigger.city}}\n"
                . "Estimated value: {{\$trigger.value}} EUR\nSource: {{\$trigger.source}}\nCompany ID: {{\$trigger.companyId}}\n\n"
                . "Say what to ask on the first call and what the main risk is. Plain text, no markdown.",
        ], col(2), 140),
        node('node-hot-task', 'action', 'Task: call the lead today', [
            'type' => 'create_task',
            'title' => 'Qualify {{$trigger.name}} — AI note ready',
            'description' => "{{\$ai.result}}\n\n---\nValue: {{\$trigger.value}} EUR · City: {{\$trigger.city}} · Source: {{\$trigger.source}}",
            'priority' => 'high',
            'deadline_days' => 1,
            'deadline_time' => '10:00',
            'owner' => '{{$trigger.owner}}',
        ], col(3), 140),
        node('node-hot-mail', 'action', 'E-mail the AI note to the manager', [
            'type' => 'send_email',
            'to' => $manager['email'],
            'subject' => 'AI triage: {{$trigger.name}} ({{$trigger.value}} EUR)',
            'body' => "<p>A new business lead came in from <b>{{\$trigger.source}}</b>.</p>"
                . "<p><b>AI note:</b></p><p>{{\$ai.summary}}</p>"
                . "<p>Owner: {{\$trigger.owner}} · City: {{\$trigger.city}} · Phone: {{\$trigger.phone}}</p>",
        ], col(3), 620),
        node('node-nurture-task', 'action', 'Task: nurture list', [
            'type' => 'create_task',
            'title' => 'Send the info pack to {{$trigger.name}}',
            'description' => "Smaller or private enquiry ({{\$trigger.value}} EUR, {{\$trigger.clientType}}).\n\n"
                . "Send the standard info pack and check back in a week.\nE-mail: {{\$trigger.email}} · Phone: {{\$trigger.phone}}",
            'priority' => 'low',
            'deadline_days' => 7,
            'deadline_time' => '14:00',
            'owner' => '{{$trigger.owner}}',
        ], col(2), 780),
    ],
    'edges' => [
        edge('node-trigger', 'node-value-check'),
        edge('node-value-check', 'node-ai-note', 'true'),
        edge('node-ai-note', 'node-hot-task'),
        edge('node-ai-note', 'node-hot-mail'),
        edge('node-value-check', 'node-nurture-task', 'false'),
    ],
];

// --- 5. Complex: won deal turns into a client and an onboarding chain -------
$workflows[] = [
    'id' => 'wf-demo-5-won-onboarding',
    'name' => 'Demo 5 · Won deal → client onboarding',
    'description' => 'Complex. When a lead reaches "' . $stateWon . '" the handover task opens immediately; companies additionally get a full client record, an onboarding task and an AI-written welcome e-mail, while private clients get a personal call instead. Shows a condition, chained actions and an AI agent feeding the last e-mail.',
    'trigger_type' => 'lead_status_changed',
    'trigger_config' => ['fromStatus' => 'any', 'toStatus' => $stateWon],
    'nodes' => [
        node('node-trigger', 'trigger', 'Lead moved to "' . $stateWon . '"', ['type' => 'lead_status_changed'], col(0), 440),
        node('node-handover-task', 'action', 'Task: hand over to production', [
            'type' => 'create_task',
            'title' => 'Hand over the won deal for {{$trigger.name}}',
            'description' => "The deal was won ({{\$trigger.oldStatus}} → {{\$trigger.newStatus}}).\n\n"
                . "Value: {{\$trigger.value}} EUR\nCity: {{\$trigger.city}}\nOwner: {{\$trigger.owner}}\n\n"
                . "File the signed offer and pass the technical details to production.",
            'priority' => 'medium',
            'deadline_days' => 2,
            'deadline_time' => '11:00',
            'owner' => '{{$trigger.owner}}',
        ], col(1), 960),
        node('node-company-check', 'condition', 'Is it a company?', [
            'js_code' => 'return $trigger.clientType !== "person";',
        ], col(1), 440),
        node('node-create-client', 'action', 'Create the client record', [
            'type' => 'create_client',
            'name' => '{{$trigger.name}}',
            'client_type' => 'business',
            'status' => $stateWon,
            'email' => '{{$trigger.email}}',
            'phone' => '{{$trigger.phone}}',
            'street' => '{{$trigger.address.street}}',
            'city' => '{{$trigger.city}}',
            'postal_code' => '{{$trigger.address.postalCode}}',
            'country' => '{{$trigger.address.country}}',
            'company_id' => '{{$trigger.companyId}}',
            'tax_id' => '{{$trigger.taxId}}',
            'vat_id' => '{{$trigger.vatId}}',
            'contact_person' => '{{$trigger.contactPerson}}',
            'website' => '{{$trigger.website}}',
            'owner' => '{{$trigger.owner}}',
            'value' => '{{$trigger.value}}',
        ], col(2), 120),
        node('node-onboarding-task', 'action', 'Task: prepare the onboarding pack', [
            'type' => 'create_task',
            'title' => 'Prepare the onboarding pack for {{$trigger.name}}',
            'description' => "A client record was created from the won lead.\n\n"
                . "Client ID: {{\$input.id}}\nCompany ID: {{\$input.company_id}}\nE-mail: {{\$input.email}}\n\n"
                . "Prepare the contract, the schedule and book the kickoff call.",
            'priority' => 'high',
            'deadline_days' => 5,
            'deadline_time' => '09:30',
            'owner' => '{{$trigger.owner}}',
        ], col(3), 120),
        node('node-ai-onboarding', 'ai_agent', 'AI onboarding e-mail', [
            'provider' => 'gemini',
            'prompt' => "Write a short onboarding e-mail (max 150 words) to a new client.\n\n"
                . "Client: {{\$trigger.name}} from {{\$trigger.city}}\nDeal value: {{\$trigger.value}} EUR\n"
                . "Account manager: {{\$trigger.owner}}\n\n"
                . "Thank them, name the next steps (contract, kickoff call, schedule) and keep it warm but professional. "
                . "Return plain text only, without a subject line.",
        ], col(4), 120),
        node('node-onboarding-mail', 'action', 'Send the onboarding e-mail', [
            'type' => 'send_email',
            'to' => '{{$trigger.email}}',
            'subject' => 'Welcome on board, {{$trigger.name}}',
            'body' => "<p>{{\$ai.result}}</p><p>--<br>{{\$trigger.owner}}</p>",
        ], col(5), 120),
        node('node-personal-task', 'action', 'Task: personal onboarding call', [
            'type' => 'create_task',
            'title' => 'Personal onboarding call with {{$trigger.name}}',
            'description' => "Private client — no company record needed.\n\n"
                . "Phone: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\nValue: {{\$trigger.value}} EUR\n\n"
                . "Call them, agree the schedule and confirm it in writing.",
            'priority' => 'medium',
            'deadline_days' => 3,
            'deadline_time' => '13:00',
            'owner' => '{{$trigger.owner}}',
        ], col(2), 960),
    ],
    // The handover task is wired first on purpose: nodes run breadth-first in
    // edge order, so the work that needs no AI key is done before the branch
    // that may stop at the AI agent.
    'edges' => [
        edge('node-trigger', 'node-handover-task'),
        edge('node-trigger', 'node-company-check'),
        edge('node-company-check', 'node-create-client', 'true'),
        edge('node-create-client', 'node-onboarding-task'),
        edge('node-onboarding-task', 'node-ai-onboarding'),
        edge('node-ai-onboarding', 'node-onboarding-mail'),
        edge('node-company-check', 'node-personal-task', 'false'),
    ],
];

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

if ($remove) {
    $ids = array_column($workflows, 'id');
    $in = implode(',', array_fill(0, count($ids), '?'));
    foreach (['workflow_logs', 'workflow_queue'] as $table) {
        $pdo->prepare("DELETE FROM `$table` WHERE `workflow_id` IN ($in)")->execute($ids);
    }
    $stmt = $pdo->prepare("DELETE FROM `workflows` WHERE `id` IN ($in)");
    $stmt->execute($ids);
    echo "Removed {$stmt->rowCount()} demo workflow(s).\n";
    exit(0);
}

$sql = "INSERT INTO `workflows`
          (`id`, `name`, `description`, `trigger_type`, `trigger_config_json`, `nodes_json`, `edges_json`, `is_active`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          `name` = VALUES(`name`),
          `description` = VALUES(`description`),
          `trigger_type` = VALUES(`trigger_type`),
          `trigger_config_json` = VALUES(`trigger_config_json`),
          `nodes_json` = VALUES(`nodes_json`),
          `edges_json` = VALUES(`edges_json`),
          `is_active` = VALUES(`is_active`)";
$stmt = $pdo->prepare($sql);

foreach ($workflows as $wf) {
    $stmt->execute([
        $wf['id'],
        $wf['name'],
        $wf['description'],
        $wf['trigger_type'],
        json_encode($wf['trigger_config'], JSON_UNESCAPED_UNICODE),
        json_encode($wf['nodes'], JSON_UNESCAPED_UNICODE),
        json_encode($wf['edges'], JSON_UNESCAPED_UNICODE),
        $isActive,
    ]);
    printf("  %-26s %-9s %d nodes / %d edges\n", $wf['id'], $wf['trigger_type'], count($wf['nodes']), count($wf['edges']));
}

echo "\nSeeded " . count($workflows) . " demo workflows (" . ($isActive ? 'enabled' : 'disabled') . ").\n";
echo "States used: new=\"$stateNew\", offer=\"$stateOffer\", won=\"$stateWon\", web source=\"$sourceWeb\".\n";
echo "Notifications go to {$manager['name']} <{$manager['email']}>.\n";
