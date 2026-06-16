<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

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
    $leads_stmt = $pdo->query("SELECT `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value` FROM `leads` LIMIT 100");
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
        
        $cat_stmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
        $cat_stmt->execute([$lead_id]);
        $categories = $cat_stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($categories as $cat) {
            if (mb_strpos($normalized_query, mb_strtolower($cat)) !== false) {
                $matches = true;
            }
        }
        
        $events_stmt = $pdo->prepare("SELECT `type`, `title`, `content` FROM `timeline_events` WHERE `lead_id` = ? LIMIT 10");
        $events_stmt->execute([$lead_id]);
        $events = $events_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($events as $ev) {
            if (mb_strpos($normalized_query, mb_strtolower($ev['title'])) !== false || mb_strpos($normalized_query, mb_strtolower($ev['content'] ?? '')) !== false) {
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
        if (!empty($events)) {
            $block .= "- Chronological History & Communications:\n";
            foreach ($events as $ev) {
                $block .= "  * [" . strtoupper($ev['type']) . "] " . $ev['title'] . ": " . strip_tags($ev['content'] ?? '') . "\n";
            }
        }

        $context_blocks[] = [
            'text' => $block,
            'is_match' => $matches
        ];
    }

    // RAG from meeting notes
    try {
        $notes_stmt = $pdo->query("SELECT `id`, `title`, `notes`, `lead_name`, `ai_summary_json` FROM `meeting_notes` LIMIT 100");
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
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $openAiKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'model' => 'gpt-4o-mini',
        'messages' => $payloadMessages,
        'temperature' => 0.4
    ]));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        $errData = json_decode($response, true);
        $errMsg = $errData['error']['message'] ?? 'OpenAI API endpoint error';
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
