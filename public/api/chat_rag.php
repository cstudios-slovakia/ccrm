<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

// SECURITY: the assistant queries internal data — authenticated users only.
ccrm_require_auth();

require_once __DIR__ . '/agent_utils.php';

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
    exit;
}

// 1. Fetch integrations config to get OpenAI API key and RAG database parameters
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];

$openAiKey = $integrationsConfig['openAiKey'] ?? '';
$vectorDb = $integrationsConfig['vectorDb'] ?? 'none';

// Initialize RAG DB connection and ensure schemas exist
$ragPdo = get_rag_db_connection($integrationsConfig);
if ($ragPdo) {
    init_rag_db_schemas($ragPdo);
}

// 2. Handle GET Request: Fetch chat history or agent list
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? 'chat_history';

    if ($action === 'get_agents') {
        $agents = [];
        if ($ragPdo) {
            try {
                $aStmt = $ragPdo->query("SELECT `id`, `name`, `position`, `color`, `skill_content`, `is_autonomous` FROM `rag_agents` ORDER BY `id` ASC");
                $agents = $aStmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (\Exception $e) {
                // Table might not exist or connection failed
            }
        }
        echo json_encode([
            'success' => true,
            'agents' => $agents
        ]);
        exit;
    }

    // Default: chat history
    $userId = $_GET['user_id'] ?? 'default_user';
    $agentId = $_GET['agent_id'] ?? 'durian';
    $messages = [];
    
    if ($ragPdo) {
        try {
            $hStmt = $ragPdo->prepare("SELECT `sender`, `message_text` as `text`, `created_at` as `timestamp` FROM `chat_history` WHERE `user_id` = ? AND `agent_id` = ? ORDER BY `id` ASC");
            $hStmt->execute([$userId, $agentId]);
            $messages = $hStmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            // Read query failed
        }
    }
    
    echo json_encode([
        'success' => true,
        'messages' => $messages
    ]);
    exit;
}

// 3. Handle POST Request: Reset history, Chat, Create Agent, or Run Agent
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);
    
    $action = $payload['action'] ?? 'chat';
    $userId = $payload['user_id'] ?? 'default_user';
    $agentId = $payload['agent_id'] ?? 'durian';
    
    // 3.1. RESET Action
    if ($action === 'reset') {
        if ($ragPdo) {
            try {
                $delStmt = $ragPdo->prepare("DELETE FROM `chat_history` WHERE `user_id` = ? AND `agent_id` = ?");
                $delStmt->execute([$userId, $agentId]);
            } catch (\Exception $e) {
                echo json_encode(['success' => false, 'message' => 'Failed to wipe history: ' . $e->getMessage()]);
                exit;
            }
        }
        echo json_encode(['success' => true, 'message' => 'Chat history reset successfully']);
        exit;
    }

    // 3.2. CREATE AGENT Action
    if ($action === 'create_agent') {
        $name = $payload['name'] ?? '';
        $position = $payload['position'] ?? '';
        $color = $payload['color'] ?? 'purple';
        $skillContent = $payload['skill_content'] ?? '';
        $isAutonomous = isset($payload['is_autonomous']) ? (int)$payload['is_autonomous'] : 0;
        
        if (empty($name) || empty($position)) {
            echo json_encode(['success' => false, 'message' => 'Agent Name and Position are required.']);
            exit;
        }
        
        if (!$ragPdo) {
            echo json_encode(['success' => false, 'message' => 'Vector DB is not connected or configured.']);
            exit;
        }
        
        try {
            $insStmt = $ragPdo->prepare("INSERT INTO `rag_agents` (`name`, `position`, `color`, `skill_content`, `is_autonomous`) VALUES (?, ?, ?, ?, ?)");
            $insStmt->execute([$name, $position, $color, $skillContent, $isAutonomous]);
            echo json_encode(['success' => true, 'message' => 'Agent created successfully']);
        } catch (\Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Failed to save agent: ' . $e->getMessage()]);
        }
        exit;
    }

    // 3.5. EDIT AGENT Action
    if ($action === 'edit_agent') {
        $id = $payload['id'] ?? '';
        $name = $payload['name'] ?? '';
        $position = $payload['position'] ?? '';
        $color = $payload['color'] ?? 'purple';
        $skillContent = $payload['skill_content'] ?? '';
        $isAutonomous = isset($payload['is_autonomous']) ? (int)$payload['is_autonomous'] : 0;
        
        if (empty($id) || empty($name) || empty($position)) {
            echo json_encode(['success' => false, 'message' => 'Agent ID, Name and Position are required.']);
            exit;
        }
        
        if (!$ragPdo) {
            echo json_encode(['success' => false, 'message' => 'Vector DB is not connected or configured.']);
            exit;
        }
        
        try {
            $updStmt = $ragPdo->prepare("UPDATE `rag_agents` SET `name` = ?, `position` = ?, `color` = ?, `skill_content` = ?, `is_autonomous` = ? WHERE `id` = ?");
            $updStmt->execute([$name, $position, $color, $skillContent, $isAutonomous, $id]);
            echo json_encode(['success' => true, 'message' => 'Agent updated successfully']);
        } catch (\Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Failed to update agent: ' . $e->getMessage()]);
        }
        exit;
    }

    // 3.6. DELETE AGENT Action
    if ($action === 'delete_agent') {
        $id = $payload['id'] ?? '';
        
        if (empty($id)) {
            echo json_encode(['success' => false, 'message' => 'Agent ID is required.']);
            exit;
        }
        
        if (!$ragPdo) {
            echo json_encode(['success' => false, 'message' => 'Vector DB is not connected or configured.']);
            exit;
        }
        
        try {
            $delStmt = $ragPdo->prepare("DELETE FROM `rag_agents` WHERE `id` = ?");
            $delStmt->execute([$id]);
            // Also delete chat history for this agent
            $delHistory = $ragPdo->prepare("DELETE FROM `chat_history` WHERE `agent_id` = ?");
            $delHistory->execute([$id]);
            
            echo json_encode(['success' => true, 'message' => 'Agent deleted successfully']);
        } catch (\Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Failed to delete agent: ' . $e->getMessage()]);
        }
        exit;
    }

    // 3.3. RUN AGENT Action (Manual autonomous execute)
    if ($action === 'run_agent') {
        if (!$ragPdo) {
            echo json_encode(['success' => false, 'message' => 'RAG DB connection missing']);
            exit;
        }
        
        $aStmt = $ragPdo->prepare("SELECT `name`, `skill_content`, `position` FROM `rag_agents` WHERE `id` = ?");
        $aStmt->execute([$agentId]);
        $agent = $aStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$agent) {
            echo json_encode(['success' => false, 'message' => 'Agent not found']);
            exit;
        }
        
        // Execute RAG + OpenAI run for this agent
        $reply = execute_autonomous_run($pdo, $ragPdo, $agent, $openAiKey);
        
        // Save to chat history
        try {
            $insStmt = $ragPdo->prepare("INSERT INTO `chat_history` (`user_id`, `sender`, `message_text`, `agent_id`) VALUES (?, 'agent', ?, ?)");
            $insStmt->execute([$userId, $reply, $agentId]);
        } catch (\Exception $e) {
            // Ignore
        }
        
        echo json_encode([
            'success' => true,
            'reply' => $reply
        ]);
        exit;
    }
    
    // 3.4. CHAT Action
    $userQuery = $payload['message'] ?? '';
    if (empty(trim($userQuery))) {
        echo json_encode(['success' => false, 'message' => 'Empty message content']);
        exit;
    }
    
    if (empty($openAiKey)) {
        echo json_encode([
            'success' => true,
            'reply' => "I am ready to help, but the **OpenAI API Key** is not configured. Please add your key in Settings."
        ]);
        exit;
    }

    list($to_placeholder, $to_real) = get_sanitization_maps($pdo);

    // Local database context retrieval (RAG)
    $leads_stmt = $pdo->query("SELECT `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `financial_summary` FROM `leads` LIMIT 100");
    $leads_all = $leads_stmt->fetchAll(PDO::FETCH_ASSOC);

    $context_blocks = [];
    $normalized_query = mb_strtolower($userQuery);

    foreach ($leads_all as $l) {
        $lead_id = $l['id'];
        $matches = false;
        
        if (!empty($l['name']) && mb_strpos($normalized_query, mb_strtolower($l['name'])) !== false) {
            $matches = true;
        }
        if (!empty($l['city']) && mb_strpos($normalized_query, mb_strtolower($l['city'])) !== false) {
            $matches = true;
        }
        if (!empty($l['owner']) && mb_strpos($normalized_query, mb_strtolower($l['owner'])) !== false) {
            $matches = true;
        }
        if (!empty($l['financial_summary'])) {
            if (mb_strpos($normalized_query, 'finan') !== false || 
                mb_strpos($normalized_query, 'report') !== false || 
                mb_strpos($normalized_query, 'revenue') !== false || 
                mb_strpos($normalized_query, 'turnover') !== false || 
                mb_strpos($normalized_query, 'profit') !== false || 
                mb_strpos($normalized_query, 'zisk') !== false || 
                mb_strpos($normalized_query, 'výnos') !== false || 
                mb_strpos($normalized_query, 'obrat') !== false ||
                mb_strpos($normalized_query, 'largest') !== false ||
                mb_strpos($normalized_query, 'najväč') !== false ||
                mb_strpos($normalized_query, 'highest') !== false ||
                mb_strpos(mb_strtolower($l['financial_summary']), $normalized_query) !== false) {
                $matches = true;
            }
        }
        
        $cat_stmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
        $cat_stmt->execute([$lead_id]);
        $categories = $cat_stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($categories as $cat) {
            if (mb_strpos($normalized_query, mb_strtolower($cat)) !== false) {
                $matches = true;
            }
        }
        
        $events_stmt = $pdo->prepare("SELECT `type`, `title`, `content`, `amount`, `file_name`, `file_size`, `file_type` FROM `timeline_events` WHERE `lead_id` = ? LIMIT 15");
        $events_stmt->execute([$lead_id]);
        $events = $events_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($events as $ev) {
            if (mb_strpos($normalized_query, mb_strtolower($ev['title'])) !== false || 
                mb_strpos($normalized_query, mb_strtolower($ev['content'] ?? '')) !== false ||
                (!empty($ev['file_name']) && mb_strpos($normalized_query, mb_strtolower($ev['file_name'])) !== false)) {
                $matches = true;
            }
        }

        $block = "Lead Profile:\n";
        $block .= "- Name: " . $l['name'] . "\n";
        $block .= "- City: " . $l['city'] . "\n";
        $block .= "- Client Type: " . $l['client_type'] . "\n";
        $block .= "- Status: " . $l['status'] . "\n";
        $block .= "- Owner/Manager: " . $l['owner'] . "\n";
        $block .= "- Categories: " . implode(", ", $categories) . "\n";
        if (!empty($l['value'])) {
            $block .= "- Opportunity Value: " . $l['value'] . " EUR\n";
        }
        if (!empty($l['financial_summary'])) {
            $block .= "- Financial Report & Analysis:\n" . $l['financial_summary'] . "\n";
        }
        if (!empty($events)) {
            $block .= "- Chronological History & Communications:\n";
            foreach ($events as $ev) {
                $evType = strtoupper($ev['type']);
                if ($ev['type'] === 'offer') {
                    $docType = !empty($ev['file_type']) ? strtoupper($ev['file_type']) : 'DOCUMENT';
                    $evType = "DOCUMENT: " . $docType;
                }
                
                $block .= "  * [" . $evType . "] " . $ev['title'] . ": " . strip_tags($ev['content'] ?? '');
                if (!empty($ev['file_name'])) {
                    $block .= " (File: " . $ev['file_name'] . ", Size: " . ($ev['file_size'] ?? 'N/A') . ")";
                }
                if (!empty($ev['amount'])) {
                    $block .= " (Value: " . $ev['amount'] . " EUR)";
                }
                $block .= "\n";
            }
        }

        $context_blocks[] = [
            'text' => $block,
            'is_match' => $matches
        ];
    }

    // RAG from meeting notes
    try {
        $notes_stmt = $pdo->query("SELECT `id`, `title`, `notes`, `lead_name`, `ai_summary_json` FROM `meeting_notes` WHERE (`archived` = 0 OR `archived` IS NULL) LIMIT 100");
        $meeting_notes_all = $notes_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($meeting_notes_all as $mn) {
            $matches = false;
            $plainTextNotes = "";
            if (!empty($mn['notes'])) {
                if (strpos(trim($mn['notes']), '[') === 0) {
                    try {
                        $blocks = json_decode($mn['notes'], true);
                        if (is_array($blocks)) {
                            foreach ($blocks as $b) {
                                $plainTextNotes .= ($b['content'] ?? '') . "\n";
                            }
                        }
                    } catch (\Exception $e) {
                        $plainTextNotes = $mn['notes'];
                    }
                } else {
                    $plainTextNotes = $mn['notes'];
                }
            }
            
            $summaryText = "";
            if (!empty($mn['ai_summary_json'])) {
                try {
                    $sumObj = json_decode($mn['ai_summary_json'], true);
                    $summaryText = $sumObj['summary'] ?? '';
                } catch (\Exception $e) {}
            }
            
            if (mb_strpos($normalized_query, mb_strtolower($mn['title'])) !== false ||
                (!empty($mn['lead_name']) && mb_strpos($normalized_query, mb_strtolower($mn['lead_name'])) !== false) ||
                mb_strpos($normalized_query, mb_strtolower($plainTextNotes)) !== false ||
                mb_strpos($normalized_query, mb_strtolower($summaryText)) !== false) {
                $matches = true;
            }
            
            $block = "Meeting Note Profile:\n";
            $block .= "- Title: " . $mn['title'] . "\n";
            $block .= "- Client/Contact: " . ($mn['lead_name'] ?? 'General') . "\n";
            $block .= "- Content:\n" . strip_tags($plainTextNotes) . "\n";
            if (!empty($summaryText)) {
                $block .= "- AI Summary: " . $summaryText . "\n";
            }
            
            $context_blocks[] = [
                'text' => $block,
                'is_match' => $matches
            ];
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // RAG from received emails
    try {
        $email_db = $ragPdo ?: $pdo;
        $emails_stmt = $email_db->query("SELECT `subject`, `sender`, `recipient`, `body`, `received_at` FROM `rag_emails` LIMIT 100");
        $rag_emails_all = $emails_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rag_emails_all as $re) {
            $matches = false;
            
            if (mb_strpos(mb_strtolower($re['subject']), $normalized_query) !== false ||
                mb_strpos(mb_strtolower($re['sender']), $normalized_query) !== false ||
                mb_strpos(mb_strtolower($re['body']), $normalized_query) !== false) {
                $matches = true;
            }
            
            $block = "Received Email Profile:\n";
            $block .= "- Subject: " . $re['subject'] . "\n";
            $block .= "- From: " . $re['sender'] . "\n";
            $block .= "- To: " . $re['recipient'] . "\n";
            $block .= "- Received At: " . $re['received_at'] . "\n";
            $block .= "- Content:\n" . $re['body'] . "\n";
            
            $context_blocks[] = [
                'text' => $block,
                'is_match' => $matches
            ];
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // RAG from unified entries
    try {
        $registries = $pdo->query("SELECT `id`, `name`, `entry_name`, `folder_name` FROM `unified_entries` WHERE `archived` = 0")->fetchAll();
        foreach ($registries as $reg) {
            $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($reg['id']));
            $tableName = "ue_" . $safeId;
            $chkTable = $pdo->query("SHOW TABLES LIKE '{$tableName}'")->rowCount() > 0;
            if ($chkTable) {
                $query = "
                    SELECT ue.*, l.`name` as `client_name`
                    FROM `{$tableName}` ue
                    LEFT JOIN `leads` l ON ue.`client_id` = l.`id`
                    LIMIT 100
                ";
                $rows = $pdo->query($query)->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rows as $r) {
                    $isFolder = (int)($r['is_folder'] ?? 0) === 1;
                    $typeLabel = $isFolder ? ($reg['folder_name'] ?: 'Folder') : ($reg['entry_name'] ?: 'Entry');
                    
                    $block = "Unified Entry (" . $reg['name'] . " - " . $typeLabel . "):\n";
                    $block .= "- Title: " . ($r['title'] ?: 'Untitled') . "\n";
                    if (!empty($r['client_name'])) {
                        $block .= "- Client: " . $r['client_name'] . "\n";
                    }
                    if (!empty($r['due_date'])) {
                        $block .= "- Due Date: " . $r['due_date'] . "\n";
                    }
                    if (!empty($r['file_name'])) {
                        $block .= "- File Attachment: " . $r['file_name'] . " (" . ($r['file_size'] ?? '') . ")\n";
                    }
                    
                    $matches = false;
                    if (mb_strpos($normalized_query, mb_strtolower($r['title'])) !== false ||
                        (!empty($r['client_name']) && mb_strpos($normalized_query, mb_strtolower($r['client_name'])) !== false) ||
                        (!empty($r['file_name']) && mb_strpos($normalized_query, mb_strtolower($r['file_name'])) !== false)) {
                        $matches = true;
                    }
                    
                    $context_blocks[] = [
                        'text' => $block,
                        'is_match' => $matches
                    ];
                }
            }
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    usort($context_blocks, function($a, $b) {
        return $b['is_match'] - $a['is_match'];
    });

    $selected_context = array_slice($context_blocks, 0, 6);
    $context_text = "";
    foreach ($selected_context as $cb) {
        $context_text .= $cb['text'] . "\n---\n";
    }

    $sanitized_context = sanitize_text($context_text, $to_placeholder);
    $sanitized_query = sanitize_text($userQuery, $to_placeholder);

    // Resolve system prompt based on active agent
    $agentName = "Durian";
    $skillInstructions = "You are Durian, the active CRM RAG AI assistant. You have access to the context below from the CRM database.";

    if ($agentId !== 'durian' && $ragPdo) {
        try {
            $aStmt = $ragPdo->prepare("SELECT `name`, `skill_content` FROM `rag_agents` WHERE `id` = ?");
            $aStmt->execute([$agentId]);
            $customAgent = $aStmt->fetch(PDO::FETCH_ASSOC);
            if ($customAgent) {
                $agentName = $customAgent['name'];
                $skillInstructions = "You are " . $customAgent['name'] . ", an AI assistant with the following custom skills/instructions:\n"
                                   . $customAgent['skill_content'] . "\n\n"
                                   . "You also have access to the context below from the CRM database.";
            }
        } catch (\Exception $e) {
            // Fallback
        }
    }

    $systemPrompt = $skillInstructions . "\n\n"
                  . "IMPORTANT - PRIVACY INSTRUCTION: Personal names, phone numbers, and emails have been pseudonymized and masked with placeholders like [CLIENT_NAME_1] or [EMAIL_REF_1].\n"
                  . "Keep references exactly as they are. Answer the user question based on the context provided.\n\n"
                  . "=== RAG KNOWLEDGE BASE CONTEXT ===\n"
                  . $sanitized_context
                  . "\n==================================\n\n"
                  . "Answer the user question query professionally in the same language they asked. Reference the client placeholders (e.g. [CLIENT_NAME_1]) naturally.";

    $payloadMessages = [
        ['role' => 'system', 'content' => $systemPrompt],
        ['role' => 'user', 'content' => $sanitized_query]
    ];

    // Call OpenAI
    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Bypass local container CA bundle issues
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $openAiKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'model' => 'gpt-4o-mini',
        'messages' => $payloadMessages,
        'temperature' => 0.4
    ], JSON_INVALID_UTF8_SUBSTITUTE));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($httpCode !== 200) {
        $errData = json_decode($response, true);
        $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI API endpoint error');
        $reply = "Failed to fetch response from OpenAI. API returned code " . $httpCode . ": " . $errMsg;
    } else {
        $resData = json_decode($response, true);
        $aiReply = $resData['choices'][0]['message']['content'] ?? 'No response returned from model.';
        $reply = restore_text($aiReply, $to_real);
    }
    
    // Save conversation log in the RAG DB if active
    if ($ragPdo) {
        try {
            $insStmt = $ragPdo->prepare("INSERT INTO `chat_history` (`user_id`, `sender`, `message_text`, `agent_id`) VALUES (?, 'user', ?, ?), (?, 'agent', ?, ?)");
            $insStmt->execute([$userId, $userQuery, $agentId, $userId, $reply, $agentId]);
        } catch (\Exception $e) {
            // Save log failed
        }
    }
    
    echo json_encode([
        'success' => true,
        'reply' => $reply
    ]);
    exit;
}
