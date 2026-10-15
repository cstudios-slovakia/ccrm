<?php
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/mail_broker.php';

/**
 * Load and decrypt TICKET_SETTINGS from system_settings.
 */
function ccrm_load_ticket_settings(PDO $pdo): array {
    $defaults = [
        'imapEnabled' => false,
        'imapHost' => '',
        'imapPort' => 993,
        'imapEncryption' => 'ssl',
        'imapUser' => '',
        'imapPassword' => '',
        'imapFolder' => 'INBOX',
        'smtpHost' => '',
        'smtpPort' => 465,
        'smtpEncryption' => 'ssl',
        'smtpUser' => '',
        'smtpPassword' => '',
        'fromName' => 'Support Desk',
        'fromEmail' => '',
        'aiRoutingEnabled' => true,
        'openAiKey' => '',
        'businessHours' => [
            'timezone' => 'Europe/Bratislava',
            'workDays' => [1, 2, 3, 4, 5],
            'startHour' => '09:00',
            'endHour' => '17:00',
        ],
        'slaTargets' => [
            'critical' => ['firstResponseMins' => 30, 'resolutionMins' => 240],
            'high' => ['firstResponseMins' => 120, 'resolutionMins' => 480],
            'normal' => ['firstResponseMins' => 240, 'resolutionMins' => 1440],
            'low' => ['firstResponseMins' => 480, 'resolutionMins' => 2880],
        ],
        'replyTemplates' => [],
    ];
    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'TICKET_SETTINGS' LIMIT 1");
        $stmt->execute();
        $raw = $stmt->fetchColumn();
        if ($raw) {
            $decoded = json_decode((string)$raw, true);
            if (is_array($decoded)) {
                $decrypted = ccrm_decrypt_settings_secrets($decoded, ['imapPassword', 'smtpPassword', 'openAiKey']);
                return array_replace_recursive($defaults, $decrypted);
            }
        }
    } catch (\Throwable $e) {}
    return $defaults;
}

/**
 * Load TICKET_STATUSES from system_settings.
 */
function ccrm_load_ticket_statuses(PDO $pdo): array {
    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'TICKET_STATUSES' LIMIT 1");
        $stmt->execute();
        $raw = $stmt->fetchColumn();
        if ($raw) {
            $decoded = json_decode((string)$raw, true);
            if (is_array($decoded) && !empty($decoded)) {
                return $decoded;
            }
        }
    } catch (\Throwable $e) {}
    return [
        ['id' => 'new', 'category' => 'new', 'labelSk' => 'Nový', 'labelEn' => 'New', 'labelHu' => 'Új', 'color' => '#3b82f6', 'pausesSla' => false, 'isTerminal' => false, 'sortOrder' => 1],
        ['id' => 'open', 'category' => 'open', 'labelSk' => 'V riešení', 'labelEn' => 'In Progress', 'labelHu' => 'Folyamatban', 'color' => '#f59e0b', 'pausesSla' => false, 'isTerminal' => false, 'sortOrder' => 2],
        ['id' => 'waiting', 'category' => 'waiting', 'labelSk' => 'Čaká na klienta', 'labelEn' => 'Waiting on Client', 'labelHu' => 'Ügyfélre vár', 'color' => '#8b5cf6', 'pausesSla' => true, 'isTerminal' => false, 'sortOrder' => 3],
        ['id' => 'resolved', 'category' => 'resolved', 'labelSk' => 'Vyriešený', 'labelEn' => 'Resolved', 'labelHu' => 'Megoldva', 'color' => '#10b981', 'pausesSla' => true, 'isTerminal' => true, 'sortOrder' => 4],
        ['id' => 'closed', 'category' => 'closed', 'labelSk' => 'Uzavretý', 'labelEn' => 'Closed', 'labelHu' => 'Lezárva', 'color' => '#64748b', 'pausesSla' => true, 'isTerminal' => true, 'sortOrder' => 5],
    ];
}

/**
 * Generate the next sequential ticket number (e.g. TCK-0001).
 */
function ccrm_next_ticket_number(PDO $pdo): string {
    $max = 0;
    try {
        $rows = $pdo->query("SELECT `ticket_number` FROM `tickets`")->fetchAll(PDO::FETCH_COLUMN) ?: [];
        foreach ($rows as $tn) {
            if (preg_match('/TCK-(\d+)/i', (string)$tn, $m)) {
                $num = (int)$m[1];
                if ($num > $max) $max = $num;
            }
        }
    } catch (\Throwable $e) {}
    return sprintf('TCK-%06d', $max + 1);
}

/**
 * Compute SLA due dates based on priority and optional support contract overrides.
 */
function ccrm_compute_ticket_sla(PDO $pdo, string $priority = 'normal', ?string $contractId = null): array {
    $settings = ccrm_load_ticket_settings($pdo);
    $targets = $settings['slaTargets'][$priority] ?? $settings['slaTargets']['normal'] ?? ['firstResponseMins' => 240, 'resolutionMins' => 1440];
    $firstMins = isset($targets['responseHours']) ? (int)round(((float)$targets['responseHours']) * 60) : (int)($targets['firstResponseMins'] ?? 240);
    $resMins = isset($targets['resolveHours']) ? (int)round(((float)$targets['resolveHours']) * 60) : (int)($targets['resolutionMins'] ?? 1440);

    if ($contractId) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM `support_contracts` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$contractId]);
            $sc = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($sc) {
                $respCol = 'sla_response_' . $priority . '_hours';
                $resCol = 'sla_resolve_' . $priority . '_hours';
                if (!empty($sc[$respCol])) $firstMins = (int)round(((float)$sc[$respCol]) * 60);
                if (!empty($sc[$resCol])) $resMins = (int)round(((float)$sc[$resCol]) * 60);
            }
        } catch (\Throwable $e) {}
    }

    $now = time();
    return [
        'firstResponseDueAt' => date('Y-m-d H:i:s', $now + ($firstMins * 60)),
        'resolutionDueAt' => date('Y-m-d H:i:s', $now + ($resMins * 60)),
    ];
}

/**
 * Check if an email matches a whitelist array.
 * If the whitelist is empty, returns true (accept verbatim).
 */
function ccrm_email_matches_whitelist(string $email, array $whitelist): bool {
    $cleanList = array_values(array_filter(array_map(function ($item) {
        return strtolower(trim((string)$item));
    }, $whitelist), function ($v) {
        return $v !== '';
    }));

    if (empty($cleanList)) {
        return true;
    }

    $emailLower = strtolower(trim($email));
    if ($emailLower === '') return false;

    foreach ($cleanList as $entry) {
        if ($entry === '*') return true;
        if ($entry === $emailLower) return true;
        if ($entry[0] === '@') {
            if (substr($emailLower, -strlen($entry)) === $entry) return true;
        } elseif (strpos($entry, '@') === false) {
            $dom = '@' . $entry;
            if (substr($emailLower, -strlen($dom)) === $dom) return true;
        }
    }
    return false;
}

/**
 * Resolve OpenAI API key from TICKET_SETTINGS or fallback to INTEGRATIONS_CONFIG.
 */
function ccrm_resolve_ticket_openai_key(PDO $pdo, array $ticketSettings): string {
    if (!empty($ticketSettings['openAiKey'])) {
        return trim((string)$ticketSettings['openAiKey']);
    }
    try {
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG' LIMIT 1");
        $stmt->execute();
        $raw = $stmt->fetchColumn();
        if ($raw) {
            $decoded = json_decode((string)$raw, true);
            if (is_array($decoded)) {
                $decrypted = ccrm_decrypt_settings_secrets($decoded, ['openAiKey']);
                if (!empty($decrypted['openAiKey'])) {
                    return trim((string)$decrypted['openAiKey']);
                }
            }
        }
    } catch (\Throwable $e) {}
    return '';
}

/**
 * Use OpenAI gpt-4o-mini to select which project an incoming support email belongs to,
 * plus classify its priority and ticket type.
 */
function ccrm_route_ticket_via_openai(string $apiKey, string $subject, string $body, string $senderEmail, array $candidateProjects): ?array {
    if ($apiKey === '' || empty($candidateProjects) || !function_exists('curl_init')) {
        return null;
    }

    $projectListText = [];
    foreach ($candidateProjects as $p) {
        $projectListText[] = sprintf(
            "- ID: %s | Name: %s | Client: %s | Domains: %s",
            $p['id'],
            $p['name'],
            $p['clientName'] ?? 'N/A',
            implode(', ', $p['domains'] ?? [])
        );
    }

    $systemPrompt = "You are an AI support desk router for a CRM. Given an incoming support email and a list of active projects, select the best matching projectId (or null if none matches), classify priority ('critical', 'high', 'normal', 'low'), and classify type ('bug', 'question', 'feature_request', 'incident', 'billing'). Return ONLY valid JSON with keys: projectId, priority, type.";
    $userPrompt = "Available Projects:\n" . implode("\n", $projectListText)
        . "\n\nIncoming Email:\nFrom: " . $senderEmail
        . "\nSubject: " . mb_substr($subject, 0, 300)
        . "\nBody:\n" . mb_substr($body, 0, 1500);

    $payload = json_encode([
        'model' => 'gpt-4o-mini',
        'response_format' => ['type' => 'json_object'],
        'temperature' => 0.1,
        'messages' => [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user', 'content' => $userPrompt],
        ],
    ]);

    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
        CURLOPT_TIMEOUT => 10,
    ]);
    $resp = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$resp) return null;
    $data = json_decode((string)$resp, true);
    $content = $data['choices'][0]['message']['content'] ?? '';
    if (!$content) return null;
    $parsed = json_decode((string)$content, true);
    return is_array($parsed) ? $parsed : null;
}

/**
 * Poll IMAP inbox for support tickets and thread replies.
 */
function ccrm_poll_ticket_imap(PDO $pdo, bool $force = false): array {
    $settings = ccrm_load_ticket_settings($pdo);
    if (!$force && empty($settings['imapEnabled'])) {
        return ['success' => true, 'polled' => false, 'reason' => 'IMAP polling is disabled.'];
    }
    if (empty($settings['imapHost']) || empty($settings['imapUser']) || empty($settings['imapPassword'])) {
        return ['success' => false, 'polled' => false, 'message' => 'IMAP credentials are not configured.'];
    }
    if (!function_exists('imap_open')) {
        return ['success' => false, 'polled' => false, 'message' => 'PHP IMAP extension is not available.'];
    }

    $folder = !empty($settings['imapFolder']) ? (string)$settings['imapFolder'] : 'INBOX';
    $mailbox = get_imap_mailbox_string(
        (string)$settings['imapHost'],
        (int)($settings['imapPort'] ?? 993),
        (string)($settings['imapEncryption'] ?? 'ssl'),
        $folder
    );

    $inbox = @imap_open($mailbox, (string)$settings['imapUser'], (string)$settings['imapPassword']);
    if (!$inbox) {
        $err = imap_last_error() ?: 'Could not connect to IMAP server.';
        imap_errors();
        return ['success' => false, 'polled' => false, 'message' => $err];
    }

    $unseenUids = @imap_search($inbox, 'UNSEEN', SE_UID);
    if (!$unseenUids || !is_array($unseenUids)) {
        imap_errors();
        imap_alerts();
        imap_close($inbox);
        return ['success' => true, 'polled' => true, 'created' => 0, 'replied' => 0, 'skippedWhitelist' => 0];
    }

    // Load projects, project types, and leads for routing & whitelist enforcement
    $projectTypesMap = [];
    foreach ($pdo->query("SELECT `id`, `has_tickets` FROM `project_types`")->fetchAll(PDO::FETCH_ASSOC) ?: [] as $pt) {
        $projectTypesMap[$pt['id']] = !empty($pt['has_tickets']);
    }

    $leadsMap = [];
    foreach ($pdo->query("SELECT `id`, `name`, `contact_person`, `email`, `ticket_allowed_emails` FROM `leads`")->fetchAll(PDO::FETCH_ASSOC) ?: [] as $l) {
        $leadsMap[$l['id']] = [
            'id' => $l['id'],
            'name' => $l['name'] ?: ($l['contact_person'] ?: ''),
            'email' => strtolower(trim((string)($l['email'] ?? ''))),
            'allowedEmails' => json_decode($l['ticket_allowed_emails'] ?? '[]', true) ?: [],
        ];
    }

    $projects = [];
    foreach ($pdo->query("SELECT * FROM `projects` WHERE `archived` = 0")->fetchAll(PDO::FETCH_ASSOC) ?: [] as $p) {
        $ptHasTickets = !empty($projectTypesMap[$p['project_type_id'] ?? '']);
        $widgetEnabled = !empty($p['ticket_widget_enabled']);
        $leadId = $p['lead_id'] ?? ($p['client_id'] ?? null);
        $projects[$p['id']] = [
            'id' => $p['id'],
            'name' => $p['name'] ?: $p['id'],
            'leadId' => $leadId,
            'clientName' => ($leadId && isset($leadsMap[$leadId])) ? $leadsMap[$leadId]['name'] : '',
            'hasTickets' => $ptHasTickets || $widgetEnabled,
            'domains' => json_decode($p['ticket_allowed_domains'] ?? '[]', true) ?: [],
            'allowedEmails' => json_decode($p['ticket_allowed_emails'] ?? '[]', true) ?: [],
        ];
    }

    $openAiKey = !empty($settings['aiRoutingEnabled']) ? ccrm_resolve_ticket_openai_key($pdo, $settings) : '';
    $createdCount = 0;
    $repliedCount = 0;
    $skippedWhitelist = 0;

    $sliceUids = array_slice($unseenUids, 0, 25);
    foreach ($sliceUids as $uid) {
        $msgNo = @imap_msgno($inbox, (int)$uid);
        if (!$msgNo) continue;

        $header = @imap_headerinfo($inbox, $msgNo);
        if (!$header) continue;

        $fromEmail = '';
        $fromName = '';
        if (!empty($header->from[0])) {
            $f = $header->from[0];
            $fromEmail = strtolower(trim(($f->mailbox ?? '') . '@' . ($f->host ?? '')));
            $fromName = isset($f->personal) ? imap_utf8((string)$f->personal) : $fromEmail;
        }
        $subject = isset($header->subject) ? imap_utf8((string)$header->subject) : '(No Subject)';
        $messageId = isset($header->message_id) ? trim((string)$header->message_id) : ('<uid-' . $uid . '@' . ($settings['imapHost'] ?? 'local') . '>');
        $inReplyTo = isset($header->in_reply_to) ? trim((string)$header->in_reply_to) : '';

        // Skip if already imported
        $dupStmt = $pdo->prepare("SELECT `id` FROM `tickets` WHERE `email_message_id` = ? UNION SELECT `id` FROM `ticket_messages` WHERE `email_message_id` = ? LIMIT 1");
        $dupStmt->execute([$messageId, $messageId]);
        if ($dupStmt->fetchColumn()) {
            @imap_setflag_full($inbox, (string)$uid, "\\Seen", ST_UID);
            continue;
        }

        // Fetch body using mail_broker helper
        $structure = @imap_fetchstructure($inbox, (int)$uid, FT_UID);
        $bodies = ['html' => '', 'plain' => ''];
        $attachments = [];
        if ($structure) {
            parse_email_structure($inbox, (int)$uid, $structure, '', $bodies, $attachments);
        }
        $bodyText = trim($bodies['plain'] !== '' ? $bodies['plain'] : strip_tags($bodies['html']));
        if ($bodyText === '') {
            $rawBody = @imap_body($inbox, (int)$uid, FT_UID | FT_PEEK);
            $bodyText = trim(strip_tags((string)$rawBody));
        }

        // 1. Check if this email is a reply to an existing ticket
        $existingTicket = null;
        if (preg_match('/(TCK-\d+)/i', $subject, $m)) {
            $tStmt = $pdo->prepare("SELECT * FROM `tickets` WHERE UPPER(`ticket_number`) = UPPER(?) LIMIT 1");
            $tStmt->execute([$m[1]]);
            $existingTicket = $tStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        if (!$existingTicket && $inReplyTo !== '') {
            $tStmt = $pdo->prepare("SELECT * FROM `tickets` WHERE `email_message_id` = ? LIMIT 1");
            $tStmt->execute([$inReplyTo]);
            $existingTicket = $tStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        if ($existingTicket) {
            $msgId = 'tmsg-' . bin2hex(random_bytes(6));
            $pdo->prepare("
                INSERT INTO `ticket_messages` (`id`, `ticket_id`, `author_type`, `author_name`, `author_email`, `is_internal`, `body`, `attachments_json`, `email_message_id`, `created_at`)
                VALUES (?, ?, 'client', ?, ?, 0, ?, '[]', ?, NOW())
            ")->execute([$msgId, $existingTicket['id'], $fromName ?: $fromEmail, $fromEmail, $bodyText, $messageId]);

            // Reopen ticket if waiting or resolved
            $newStatus = in_array($existingTicket['status'], ['waiting', 'waiting_client', 'resolved'], true) ? 'open' : $existingTicket['status'];
            $pdo->prepare("UPDATE `tickets` SET `status` = ?, `updated_at` = NOW() WHERE `id` = ?")->execute([$newStatus, $existingTicket['id']]);
            @imap_setflag_full($inbox, (string)$uid, "\\Seen", ST_UID);
            $repliedCount++;
            continue;
        }

        // 2. Route new ticket to Project & Client
        $matchedProjectId = null;
        $matchedLeadId = null;
        $priority = 'normal';
        $ticketType = 'bug';

        // Step A: Match by Project email whitelist
        foreach ($projects as $p) {
            if (!empty($p['allowedEmails']) && ccrm_email_matches_whitelist($fromEmail, $p['allowedEmails'])) {
                $matchedProjectId = $p['id'];
                $matchedLeadId = $p['leadId'];
                break;
            }
        }

        // Step B: Match by Client email or Client email whitelist
        if (!$matchedLeadId) {
            foreach ($leadsMap as $l) {
                $exactLeadEmail = ($l['email'] !== '' && $l['email'] === $fromEmail);
                $whitelistLeadMatch = (!empty($l['allowedEmails']) && ccrm_email_matches_whitelist($fromEmail, $l['allowedEmails']));
                if ($exactLeadEmail || $whitelistLeadMatch) {
                    $matchedLeadId = $l['id'];
                    // Find projects belonging to this client
                    $clientProjects = array_values(array_filter($projects, function ($p) use ($matchedLeadId) {
                        return $p['leadId'] === $matchedLeadId && $p['hasTickets'];
                    }));
                    if (count($clientProjects) === 1) {
                        $matchedProjectId = $clientProjects[0]['id'];
                    }
                    break;
                }
            }
        }

        // Step C: OpenAI Routing if project not yet determined (or to classify priority/type)
        $ticketProjects = array_values(array_filter($projects, function ($p) {
            return !empty($p['hasTickets']);
        }));
        if (empty($ticketProjects)) {
            $ticketProjects = array_values($projects);
        }

        if ($openAiKey !== '' && !empty($ticketProjects)) {
            $aiResult = ccrm_route_ticket_via_openai($openAiKey, $subject, $bodyText, $fromEmail, $ticketProjects);
            if (is_array($aiResult)) {
                if (!$matchedProjectId && !empty($aiResult['projectId']) && isset($projects[$aiResult['projectId']])) {
                    $matchedProjectId = (string)$aiResult['projectId'];
                    if (!$matchedLeadId && !empty($projects[$matchedProjectId]['leadId'])) {
                        $matchedLeadId = $projects[$matchedProjectId]['leadId'];
                    }
                }
                if (!empty($aiResult['priority']) && in_array($aiResult['priority'], ['critical', 'high', 'normal', 'low'], true)) {
                    $priority = $aiResult['priority'];
                }
                if (!empty($aiResult['type']) && in_array($aiResult['type'], ['bug', 'question', 'feature_request', 'incident', 'billing'], true)) {
                    $ticketType = $aiResult['type'];
                }
            }
        }

        // Step D: Enforce Email Whitelist
        // Rule: For each project and client there is a whitelist of emails. If none is selected (empty), accept support ticket requests verbatim.
        $projectWhitelist = ($matchedProjectId && isset($projects[$matchedProjectId])) ? $projects[$matchedProjectId]['allowedEmails'] : [];
        $clientWhitelist = ($matchedLeadId && isset($leadsMap[$matchedLeadId])) ? $leadsMap[$matchedLeadId]['allowedEmails'] : [];
        $combinedWhitelist = array_values(array_unique(array_merge($projectWhitelist, $clientWhitelist)));

        if (!empty($combinedWhitelist) && !ccrm_email_matches_whitelist($fromEmail, $combinedWhitelist)) {
            @imap_setflag_full($inbox, (string)$uid, "\\Seen", ST_UID);
            $skippedWhitelist++;
            continue;
        }

        // Step E: Find active support contract for project or client
        $contractId = null;
        if ($matchedProjectId || $matchedLeadId) {
            $cStmt = $pdo->prepare("SELECT `id` FROM `support_contracts` WHERE `project_id` = ? OR `client_id` = ? LIMIT 1");
            $cStmt->execute([$matchedProjectId, $matchedLeadId]);
            $contractId = $cStmt->fetchColumn() ?: null;
        }

        // Step F: Create Ticket & Initial Message
        $tckId = 'tck-' . bin2hex(random_bytes(6));
        $tckNumber = ccrm_next_ticket_number($pdo);
        $sla = ccrm_compute_ticket_sla($pdo, $priority, $contractId);

        $pdo->prepare("
            INSERT INTO `tickets` (
                `id`, `ticket_number`, `title`, `description`, `status`, `priority`, `type`, `source`,
                `project_id`, `client_id`, `reporter_name`, `reporter_email`,
                `first_response_due_at`, `resolve_due_at`, `email_message_id`, `archived`, `created_at`, `updated_at`
            ) VALUES (?, ?, ?, ?, 'new', ?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
        ")->execute([
            $tckId,
            $tckNumber,
            $subject,
            $bodyText,
            $priority,
            $ticketType,
            $matchedProjectId,
            $matchedLeadId,
            $fromName ?: $fromEmail,
            $fromEmail,
            $sla['firstResponseDueAt'],
            $sla['resolutionDueAt'],
            $messageId,
        ]);

        $msgId = 'tmsg-' . bin2hex(random_bytes(6));
        $pdo->prepare("
            INSERT INTO `ticket_messages` (`id`, `ticket_id`, `author_type`, `author_name`, `author_email`, `is_internal`, `body`, `attachments_json`, `email_message_id`, `created_at`)
            VALUES (?, ?, 'client', ?, ?, 0, ?, '[]', ?, NOW())
        ")->execute([$msgId, $tckId, $fromName ?: $fromEmail, $fromEmail, $bodyText, $messageId]);

        @imap_setflag_full($inbox, (string)$uid, "\\Seen", ST_UID);
        $createdCount++;
    }

    imap_errors();
    imap_alerts();
    imap_close($inbox);

    return [
        'success' => true,
        'polled' => true,
        'created' => $createdCount,
        'replied' => $repliedCount,
        'skippedWhitelist' => $skippedWhitelist,
    ];
}

// Guard so requiring this file from cron.php or ticket_widget.php only loads helpers
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') !== 'tickets.php') {
    return;
}

header('Content-Type: application/json');
header('Cache-Control: no-store');

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'CRM is not installed.']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_migrate_tickets($pdo);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$rawBody = file_get_contents('php://input');
$input = $rawBody ? (json_decode($rawBody, true) ?: []) : [];
$action = $_GET['action'] ?? ($input['action'] ?? '');

// Public endpoint: Public Project Ticket Status Page (#public-tickets/<hash>)
if ($action === 'public_status') {
    $hash = trim((string)($_GET['hash'] ?? ($input['hash'] ?? '')));
    if ($hash === '' || strlen($hash) < 6) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Invalid public status link.']);
        exit;
    }

    $pStmt = $pdo->prepare("SELECT `id`, `name`, `project_type_id`, `lead_id`, `client_id`, `ticket_widget_config_json`, `ticket_public_hash` FROM `projects` WHERE `ticket_public_hash` = ? AND `archived` = 0 LIMIT 1");
    $pStmt->execute([$hash]);
    $project = $pStmt->fetch(PDO::FETCH_ASSOC);

    if (!$project) {
        $allProjs = $pdo->query("SELECT `id`, `name`, `project_type_id`, `lead_id`, `client_id`, `ticket_widget_config_json`, `ticket_public_hash` FROM `projects` WHERE `archived` = 0")->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($allProjs as $cand) {
            $fallbackHash = 'pub_' . preg_replace('/[^a-zA-Z0-9]/', '', (string)$cand['id']) . '_status';
            if ($hash === $fallbackHash || $hash === $cand['id']) {
                $project = $cand;
                if (empty($cand['ticket_public_hash'])) {
                    $pdo->prepare("UPDATE `projects` SET `ticket_public_hash` = ? WHERE `id` = ?")->execute([$hash, $cand['id']]);
                }
                break;
            }
        }
    }

    if (!$project) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Project status board not found.']);
        exit;
    }

    $clientName = '';
    $leadId = !empty($project['lead_id']) ? $project['lead_id'] : ($project['client_id'] ?? '');
    if ($leadId !== '') {
        $lStmt = $pdo->prepare("SELECT `name`, `contact_person` FROM `leads` WHERE `id` = ? LIMIT 1");
        $lStmt->execute([$leadId]);
        $lRow = $lStmt->fetch(PDO::FETCH_ASSOC);
        if ($lRow) {
            $clientName = $lRow['name'] ?: ($lRow['contact_person'] ?: '');
        }
    }

    $tStmt = $pdo->prepare("
        SELECT `id`, `ticket_number`, `title`, `description`, `status`, `priority`, `type`, `source`,
               `reporter_name`, `created_at`, `updated_at`, `resolved_at`, `closed_at`
        FROM `tickets`
        WHERE `project_id` = ? AND `archived` = 0
        ORDER BY `created_at` DESC
    ");
    $tStmt->execute([$project['id']]);
    $ticketRows = $tStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $msgStmt = $pdo->prepare("
        SELECT `id`, `ticket_id`, `author_type`, `author_name`, `event_type`, `body`, `created_at`
        FROM `ticket_messages`
        WHERE `ticket_id` = ? AND `is_internal` = 0
        ORDER BY `created_at` ASC
    ");

    $publicTickets = [];
    foreach ($ticketRows as $tr) {
        $msgStmt->execute([$tr['id']]);
        $msgs = [];
        foreach ($msgStmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $m) {
            $msgs[] = [
                'id' => $m['id'],
                'authorType' => $m['author_type'],
                'authorName' => $m['author_name'],
                'eventType' => $m['event_type'] ?? 'public_reply',
                'body' => $m['body'],
                'createdAt' => $m['created_at'],
            ];
        }
        $publicTickets[] = [
            'id' => $tr['id'],
            'ticketNumber' => $tr['ticket_number'],
            'title' => $tr['title'],
            'subject' => $tr['title'],
            'description' => $tr['description'],
            'status' => $tr['status'],
            'priority' => $tr['priority'],
            'type' => $tr['type'],
            'source' => $tr['source'],
            'channel' => $tr['source'],
            'reporterName' => $tr['reporter_name'] ?? 'Client',
            'createdAt' => $tr['created_at'],
            'updatedAt' => $tr['updated_at'],
            'resolvedAt' => $tr['resolved_at'],
            'closedAt' => $tr['closed_at'],
            'messages' => $msgs,
        ];
    }

    $displayProjectName = !empty($project['name'])
        ? $project['name']
        : ($project['id'] === 'proj-vila-slavin' ? 'Vila Slavín – Kamenná fasáda a terasa' : ($clientName ?: $project['id']));

    echo json_encode([
        'success' => true,
        'project' => [
            'id' => $project['id'],
            'name' => $displayProjectName,
            'clientName' => $clientName,
            'widgetConfig' => !empty($project['ticket_widget_config_json']) ? json_decode($project['ticket_widget_config_json'], true) : null,
        ],
        'statuses' => ccrm_load_ticket_statuses($pdo),
        'tickets' => $publicTickets,
    ]);
    exit;
}

// All remaining actions require an authenticated CRM user session
require_once __DIR__ . '/auth.php';
$sessionUser = ccrm_require_auth();

if ($action === 'test_imap') {
    $savedSettings = ccrm_load_ticket_settings($pdo);
    $host = trim((string)($input['imapHost'] ?? $savedSettings['imapHost'] ?? ''));
    $port = (int)($input['imapPort'] ?? $savedSettings['imapPort'] ?? 993);
    $enc = trim((string)($input['imapEncryption'] ?? $savedSettings['imapEncryption'] ?? 'ssl'));
    $user = trim((string)($input['imapUser'] ?? $savedSettings['imapUser'] ?? ''));
    $pass = (string)($input['imapPassword'] ?? '');
    if ($pass === '' || $pass === '••••••••') {
        $pass = (string)($savedSettings['imapPassword'] ?? '');
    }

    if ($host === '' || $user === '' || $pass === '') {
        echo json_encode(['success' => false, 'message' => 'Missing IMAP host, user, or password.']);
        exit;
    }
    if (!function_exists('imap_open')) {
        echo json_encode(['success' => false, 'message' => 'PHP IMAP extension is not installed.']);
        exit;
    }

    $mailbox = get_imap_mailbox_string($host, $port, $enc, (string)($input['imapFolder'] ?? 'INBOX'));
    $conn = @imap_open($mailbox, $user, $pass, OP_HALFOPEN, 1);
    if ($conn) {
        imap_errors();
        imap_alerts();
        imap_close($conn);
        echo json_encode(['success' => true, 'message' => 'IMAP connection verified successfully.']);
    } else {
        $err = imap_last_error() ?: 'IMAP connection failed.';
        imap_errors();
        echo json_encode(['success' => false, 'message' => $err]);
    }
    exit;
}

if ($action === 'poll_imap') {
    $result = ccrm_poll_ticket_imap($pdo, true);
    echo json_encode($result);
    exit;
}

if ($action === 'send_email_reply') {
    $ticketId = trim((string)($input['ticketId'] ?? ''));
    $body = trim((string)($input['body'] ?? ''));
    $toEmail = trim((string)($input['toEmail'] ?? ''));
    $subject = trim((string)($input['subject'] ?? ''));
    if ($ticketId === '' || $body === '' || $toEmail === '') {
        echo json_encode(['success' => false, 'message' => 'Missing email reply fields.']);
        exit;
    }

    $settings = ccrm_load_ticket_settings($pdo);
    if (empty($settings['smtpHost']) || empty($settings['smtpUser']) || empty($settings['smtpPassword'])) {
        echo json_encode(['success' => false, 'message' => 'Support SMTP is not configured in Ticket Settings.']);
        exit;
    }

    $smtpRes = send_smtp_email(
        (string)$settings['smtpHost'],
        (int)($settings['smtpPort'] ?? 465),
        (string)($settings['smtpEncryption'] ?? 'ssl'),
        (string)$settings['smtpUser'],
        (string)$settings['smtpPassword'],
        (string)($settings['fromEmail'] ?: $settings['smtpUser']),
        (string)($settings['fromName'] ?: 'Support Desk'),
        $toEmail,
        $subject,
        nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8'))
    );
    echo json_encode($smtpRes);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Unknown action.']);
