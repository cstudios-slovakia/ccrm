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
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// 1. Fetch integrations config to get OpenAI API key and RAG database parameters
$stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
$stmt->execute();
$configJson = $stmt->fetchColumn();
$integrationsConfig = $configJson ? json_decode($configJson, true) : [];
$integrationsConfig = is_array($integrationsConfig) ? ccrm_decrypt_config_secrets($integrationsConfig, ccrm_integration_secret_keys()) : [];

$openAiKey = $integrationsConfig['openAiKey'] ?? '';
$vectorDb = $integrationsConfig['vectorDb'] ?? 'none';

// Initialize DB connection and ensure schemas exist (uses vector DB if configured, falls back to main DB)
$ragPdo = get_rag_db_connection($integrationsConfig);
$chatDb = $ragPdo ?: $pdo;
if ($chatDb) {
    init_rag_db_schemas($chatDb);
}

// 2. Handle GET Request: Fetch chat history, agent list, or episodic decisions
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? 'chat_history';
    $userId = !empty($_GET['user_id']) ? $_GET['user_id'] : 'default_user';

    if ($action === 'get_agents') {
        $agents = [];
        if ($chatDb) {
            try {
                $aStmt = $chatDb->query("SELECT `id`, `name`, `position`, `color`, `voice`, `skill_content`, `is_autonomous` FROM `rag_agents` ORDER BY `id` ASC");
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

    if ($action === 'get_decisions') {
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $decisions = get_episodic_decisions($pdo, $chatDb, $userId, $limit);
        echo json_encode([
            'success' => true,
            'decisions' => $decisions
        ]);
        exit;
    }

    // Default: chat history
    $agentId = $_GET['agent_id'] ?? 'orchestrator';
    $messages = [];
    
    if ($chatDb) {
        try {
            $hStmt = $chatDb->prepare("SELECT `sender`, `message_text` as `text`, `created_at` as `timestamp` FROM `chat_history` WHERE (`user_id` = ? OR `user_id` = 'default_user') AND `agent_id` = ? ORDER BY `id` ASC");
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

// 3. Handle POST Request: Reset history, Chat, Create Agent, Run Agent, Decisions, or Convene Council
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);
    
    $action = $payload['action'] ?? 'chat';
    $userId = !empty($payload['user_id']) ? $payload['user_id'] : 'default_user';
    $agentId = $payload['agent_id'] ?? 'orchestrator';

    // 3.0. Episodic Decisions Actions
    if ($action === 'get_decisions') {
        $limit = isset($payload['limit']) ? (int)$payload['limit'] : 20;
        $decisions = get_episodic_decisions($pdo, $chatDb, $userId, $limit);
        echo json_encode(['success' => true, 'decisions' => $decisions]);
        exit;
    }

    if ($action === 'save_decision') {
        $saved = save_episodic_decision($pdo, $chatDb, $userId, $payload['decision'] ?? $payload);
        echo json_encode(['success' => $saved, 'message' => $saved ? 'Decision saved' : 'Failed to save decision']);
        exit;
    }

    if ($action === 'delete_decision') {
        $decisionId = $payload['decision_id'] ?? $payload['id'] ?? null;
        $deleted = delete_episodic_decision($pdo, $chatDb, $userId, $decisionId);
        echo json_encode(['success' => $deleted, 'message' => 'Decision deleted']);
        exit;
    }
    
    // 3.1. RESET Action
    if ($action === 'reset') {
        if ($chatDb) {
            try {
                $delStmt = $chatDb->prepare("DELETE FROM `chat_history` WHERE (`user_id` = ? OR `user_id` = 'default_user') AND `agent_id` = ?");
                $delStmt->execute([$userId, $agentId]);
            } catch (\Exception $e) {
                echo json_encode(['success' => false, 'message' => 'Failed to clear the chat history.']);
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
        $voice = $payload['voice'] ?? 'alloy';
        $skillContent = $payload['skill_content'] ?? '';
        $isAutonomous = isset($payload['is_autonomous']) ? (int)$payload['is_autonomous'] : 0;
        
        if (empty($name) || empty($position)) {
            echo json_encode(['success' => false, 'message' => 'Agent Name and Position are required.']);
            exit;
        }
        
        if (!$chatDb) {
            echo json_encode(['success' => false, 'message' => 'Database connection missing.']);
            exit;
        }
        
        try {
            $insStmt = $chatDb->prepare("INSERT INTO `rag_agents` (`name`, `position`, `color`, `voice`, `skill_content`, `is_autonomous`) VALUES (?, ?, ?, ?, ?, ?)");
            $insStmt->execute([$name, $position, $color, $voice, $skillContent, $isAutonomous]);
            echo json_encode(['success' => true, 'message' => 'Agent created successfully']);
        } catch (\Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Failed to save the agent.']);
        }
        exit;
    }

    // 3.5. EDIT AGENT Action
    if ($action === 'edit_agent') {
        $id = $payload['id'] ?? '';
        $name = $payload['name'] ?? '';
        $position = $payload['position'] ?? '';
        $color = $payload['color'] ?? 'purple';
        $voice = $payload['voice'] ?? 'alloy';
        $skillContent = $payload['skill_content'] ?? '';
        $isAutonomous = isset($payload['is_autonomous']) ? (int)$payload['is_autonomous'] : 0;
        
        if (empty($id) || empty($name) || empty($position)) {
            echo json_encode(['success' => false, 'message' => 'Agent ID, Name and Position are required.']);
            exit;
        }
        
        if (!$chatDb) {
            echo json_encode(['success' => false, 'message' => 'Database connection missing.']);
            exit;
        }
        
        try {
            $updStmt = $chatDb->prepare("UPDATE `rag_agents` SET `name` = ?, `position` = ?, `color` = ?, `voice` = ?, `skill_content` = ?, `is_autonomous` = ? WHERE `id` = ?");
            $updStmt->execute([$name, $position, $color, $voice, $skillContent, $isAutonomous, $id]);
            echo json_encode(['success' => true, 'message' => 'Agent updated successfully']);
        } catch (\Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Failed to update the agent.']);
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
        
        if (!$chatDb) {
            echo json_encode(['success' => false, 'message' => 'Database connection missing.']);
            exit;
        }
        
        try {
            $delStmt = $chatDb->prepare("DELETE FROM `rag_agents` WHERE `id` = ?");
            $delStmt->execute([$id]);
            // Also delete chat history for this agent
            $delHistory = $chatDb->prepare("DELETE FROM `chat_history` WHERE `agent_id` = ?");
            $delHistory->execute([$id]);
            
            echo json_encode(['success' => true, 'message' => 'Agent deleted successfully']);
        } catch (\Exception $e) {
            echo json_encode(['success' => false, 'message' => 'Failed to delete the agent.']);
        }
        exit;
    }

    // 3.3. RUN AGENT Action (Manual autonomous execute)
    if ($action === 'run_agent') {
        if (!$chatDb) {
            echo json_encode(['success' => false, 'message' => 'Database connection missing']);
            exit;
        }
        
        $aStmt = $chatDb->prepare("SELECT `name`, `skill_content`, `position` FROM `rag_agents` WHERE `id` = ?");
        $aStmt->execute([$agentId]);
        $agent = $aStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$agent) {
            echo json_encode(['success' => false, 'message' => 'Agent not found']);
            exit;
        }
        
        // Execute RAG + OpenAI run for this agent
        $reply = execute_autonomous_run($pdo, $chatDb, $agent, $openAiKey);
        
        // Save to chat history
        try {
            $insStmt = $chatDb->prepare("INSERT INTO `chat_history` (`user_id`, `sender`, `message_text`, `agent_id`) VALUES (?, 'agent', ?, ?)");
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

    $todayDate = date('Y-m-d');
    $todayFormatted = date('Y-m-d (l, F j, Y)');

    $roleCategory = 'orchestrator';
    $execPrompts = get_executive_prompts();
    if (isset($execPrompts[$agentId])) {
        $roleCategory = $agentId;
    }

    $ragData = build_comprehensive_crm_rag_context($pdo, $chatDb, $userQuery, 'sk', $roleCategory, ['limit' => 28]);
    $sanitized_context = $ragData['sanitized_context'];
    $to_placeholder = $ragData['to_placeholder'];
    $to_real = $ragData['to_real'];
    $sanitized_query = sanitize_text($userQuery, $to_placeholder);

    // 3.3. CONVENE COUNCIL Action (Multi-Executive Deliberation)
    if ($action === 'convene_council') {
        $councilQuery = $payload['query'] ?? $payload['message'] ?? '';
        if (empty(trim($councilQuery))) {
            echo json_encode(['success' => false, 'message' => 'Empty council inquiry']);
            exit;
        }

        if (empty($openAiKey)) {
            echo json_encode([
                'success' => true,
                'reply' => "The **Executive Council** is assembled, but the **OpenAI API Key** is not configured. Please add your key in Settings."
            ]);
            exit;
        }

        $sanitized_council_query = sanitize_text($councilQuery, $to_placeholder);
        $episodicDecisions = get_episodic_decisions($pdo, $ragPdo, $userId, 8);
        $pastDecisionsBlock = "";
        if (!empty($episodicDecisions)) {
            $pastDecisionsBlock = "\n\n<past_decisions>\n";
            foreach ($episodicDecisions as $d) {
                $pastDecisionsBlock .= "- [" . strtoupper($d['domain'] ?? 'STRATEGY') . "] " . ($d['title'] ?? 'Decision') . ": " . ($d['summary'] ?? '') . "\n";
                if (!empty($d['owner']) || !empty($d['deadline'])) {
                    $pastDecisionsBlock .= "  Owner: " . ($d['owner'] ?: 'Unassigned') . " | Deadline: " . ($d['deadline'] ?: 'TBD') . "\n";
                }
            }
            $pastDecisionsBlock .= "</past_decisions>\n";
        }

        $councilPrompt = "You are convening the Full Executive Boardroom Council (Executive Orchestrator / CEO, Chief Strategy Officer, Chief Financial Officer, General Counsel, Chief Marketing Officer, Chief Operating Officer).\n\n"
                       . "CURRENT SYSTEM DATE: " . $todayFormatted . "\n\n"
                       . "Your objective is to analyze the following strategic question/dilemma from multiple executive viewpoints and synthesize a definitive decision."
                       . $pastDecisionsBlock . "\n\n"
                       . "=== REAL-TIME CRM DATA CONTEXT ===\n"
                       . $sanitized_context
                       . "\n==================================\n\n"
                       . "STRUCTURE YOUR RESPONSE AS FOLLOWS (using clean Markdown with bold headers and bullet points):\n\n"
                       . "## 🏛️ Executive Council Boardroom Verdict\n"
                       . "**Executive Summary & Decision**: [Definitive recommendation by the Executive Orchestrator / CEO]\n\n"
                       . "## 👥 C-Suite Specialist Perspectives\n"
                       . "- **🎯 Chief Strategy Officer (CSO)**: [Competitive positioning, moat impact, and market timing]\n"
                       . "- **💰 Chief Financial Officer (CFO)**: [Unit economics, cash runway, gross margin, and capital ROI based on CRM figures]\n"
                       . "- **⚖️ General Counsel (GC)**: [Contractual liability, IP protection, and compliance boundaries]\n"
                       . "- **📣 Chief Marketing Officer (CMO)**: [Value proposition, ICP resonance, and demand gen impact]\n"
                       . "- **⚡ Chief Operating Officer (COO)**: [Operational capacity, execution bottlenecks, and workflow requirements]\n\n"
                       . "## ⚠️ Key Strategic Trade-Off & Primary Risk Hedge\n"
                       . "[What is the biggest downside risk and how do we hedge against it?]\n\n"
                       . "## 📋 Execution Action Plan (Who, What, When)\n"
                       . "| Action Item | Responsible Executive / Owner | Target Timeline |\n"
                       . "|---|---|---|\n"
                       . "| [Action 1] | [Owner] | [Timeline] |\n"
                       . "| [Action 2] | [Owner] | [Timeline] |\n"
                       . "| [Action 3] | [Owner] | [Timeline] |\n\n"
                       . "Answer in the same language the user asked (Slovak, Hungarian, or English). Deliver crisp, actionable, high-signal executive advice.";

        $councilHistoryMessages = [];
        if ($chatDb) {
            try {
                $chStmt = $chatDb->prepare("
                    SELECT `sender`, `message_text`
                    FROM `chat_history`
                    WHERE `user_id` = ? AND `agent_id` = 'orchestrator' AND `message_text` LIKE '[Executive Council%'
                    ORDER BY `id` DESC
                    LIMIT 4
                ");
                $chStmt->execute([$userId]);
                $recentCouncilHistory = array_reverse($chStmt->fetchAll(PDO::FETCH_ASSOC));
                foreach ($recentCouncilHistory as $h) {
                    $role = ($h['sender'] === 'agent') ? 'assistant' : 'user';
                    $sanitizedHText = sanitize_text($h['message_text'], $to_placeholder);
                    $councilHistoryMessages[] = ['role' => $role, 'content' => $sanitizedHText];
                }
            } catch (\Exception $e) {}
        }

        $councilPayloadMessages = [
            ['role' => 'system', 'content' => $councilPrompt]
        ];
        foreach ($councilHistoryMessages as $chm) {
            $councilPayloadMessages[] = $chm;
        }
        $councilPayloadMessages[] = ['role' => 'user', 'content' => $sanitized_council_query];

        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $openAiKey
        ]);
        $chatModel = ccrm_ai_model();
        $chatPayload = [
            'model' => $chatModel,
            'messages' => $councilPayloadMessages,
        ];
        if (ccrm_ai_model_supports_temperature($chatModel)) {
            $chatPayload['temperature'] = 0.3;
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($chatPayload, JSON_INVALID_UTF8_SUBSTITUTE));

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($httpCode !== 200) {
            $errData = json_decode($response, true);
            $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI API endpoint error');
            $reply = "Failed to convene Executive Council. API returned code " . $httpCode . ": " . $errMsg;
        } else {
            $resData = json_decode($response, true);
            $aiReply = $resData['choices'][0]['message']['content'] ?? 'No response returned from model.';
            $reply = restore_text($aiReply, $to_real);
        }

        // Save conversation log in the Chat DB under orchestrator / council
        if ($chatDb) {
            try {
                $insStmt = $chatDb->prepare("INSERT INTO `chat_history` (`user_id`, `sender`, `message_text`, `agent_id`) VALUES (?, 'user', ?, 'orchestrator'), (?, 'agent', ?, 'orchestrator')");
                $insStmt->execute([$userId, "[Executive Council Inquiry] " . $councilQuery, $userId, $reply]);
            } catch (\Exception $e) {}
        }

        echo json_encode([
            'success' => true,
            'reply' => $reply,
            'is_council' => true
        ]);
        exit;
    }

    // Resolve system prompt based on active agent
    $versionCodename = 'Imbe';
    $versionFile = dirname(__DIR__, 2) . '/src/utils/version.ts';
    if (!file_exists($versionFile)) {
        $versionFile = dirname(__DIR__) . '/src/utils/version.ts';
    }
    if (file_exists($versionFile)) {
        $vContent = @file_get_contents($versionFile);
        if ($vContent && preg_match('/VERSION_CODENAME\s*=\s*["\']([^"\']+)["\']/', $vContent, $m)) {
            $versionCodename = $m[1];
        } elseif ($vContent && preg_match('/VERSION\s*=\s*["\'][^"\']*-([^"\']+)["\']/', $vContent, $m)) {
            $versionCodename = $m[1];
        }
    }

    $execPrompts = get_executive_prompts();
    $agentName = $versionCodename;
    $skillInstructions = "You are " . $versionCodename . ", the active CRM RAG AI assistant. You have access to the context below from the CRM database.";

    if (isset($execPrompts[$agentId])) {
        $exec = $execPrompts[$agentId];
        $agentName = $exec['name'];
        $skillInstructions = $exec['prompt'] . "\n\nYou also have access to the context below from the CRM database.";
    } elseif ($agentId === 'durian' || $agentId === 'orchestrator') {
        $exec = $execPrompts['orchestrator'];
        $agentName = "Executive Leader (" . $versionCodename . ")";
        $skillInstructions = $exec['prompt'] . "\n\nYou also have access to the context below from the CRM database.";
    } elseif ($chatDb) {
        try {
            $aStmt = $chatDb->prepare("SELECT `name`, `skill_content`, `position` FROM `rag_agents` WHERE `id` = ?");
            $aStmt->execute([$agentId]);
            $customAgent = $aStmt->fetch(PDO::FETCH_ASSOC);
            if ($customAgent) {
                $agentName = $customAgent['name'];
                $skillInstructions = "You are " . $customAgent['name'] . " (" . $customAgent['position'] . "), an AI assistant with the following custom skills/instructions:\n"
                                   . $customAgent['skill_content'] . "\n\n"
                                   . "You also have access to the context below from the CRM database.";
            }
        } catch (\Exception $e) {
            // Fallback
        }
    }

    // Episodic Memory Context Injection
    $episodicDecisions = get_episodic_decisions($pdo, $chatDb, $userId, 8);
    $pastDecisionsBlock = "";
    if (!empty($episodicDecisions)) {
        $pastDecisionsBlock = "\n\n<past_decisions>\n";
        foreach ($episodicDecisions as $d) {
            $pastDecisionsBlock .= "- [" . strtoupper($d['domain'] ?? 'STRATEGY') . "] " . ($d['title'] ?? 'Decision') . ": " . ($d['summary'] ?? '') . "\n";
            if (!empty($d['owner']) || !empty($d['deadline'])) {
                $pastDecisionsBlock .= "  Owner: " . ($d['owner'] ?: 'Unassigned') . " | Deadline: " . ($d['deadline'] ?: 'TBD') . "\n";
            }
        }
        $pastDecisionsBlock .= "</past_decisions>\nMaintain continuity with these past executive decisions where relevant.\n";
    }

    $systemPrompt = $skillInstructions . "\n\n"
                  . "CURRENT SYSTEM DATE: " . $todayFormatted . "\n\n"
                  . "CRITICAL INSTRUCTIONS ON CRM DATA DOMAINS:\n"
                  . "1. FINANCIAL MANAGEMENT (FINANCIE / CASHFLOW / FAKTÚRY):\n"
                  . "   - You have full access to Financial Management records (incomes, expenses, invoices, vendor bills, overdue receivables, cash flow, and profit margins).\n"
                  . "   - When asked about company finances, revenue, expenses, cash flow, profit, unpaid invoices, or specific costs, refer to the FINANCIAL MANAGEMENT OVERVIEW and individual financial records accurately with exact euro amounts.\n\n"
                  . "2. DATES, DUE DATES & EXPIRATIONS (SPLATNOSŤ / PLATNOSŤ / LEHOTY):\n"
                  . "   - Use CURRENT SYSTEM DATE (" . $todayDate . ") to evaluate whether an entry, certificate (certifikát), invoice, deadline, task, or document is valid (platný / aktívny) or expired / overdue (po splatnosti / vypršaná platnosť).\n"
                  . "   - If asked whether any certificate or invoice is expired (po splatnosti), check all items in the context. If all dates are in the future, explicitly confirm that none are overdue and state their expiration dates and days remaining.\n"
                  . "   - If an item is expired (date in the past), clearly specify which item is expired and when.\n\n"
                  . "IMPORTANT - PRIVACY INSTRUCTION: Personal names, phone numbers, and emails have been pseudonymized and masked with placeholders like [CLIENT_NAME_1] or [EMAIL_REF_1].\n"
                  . "Keep references exactly as they are. Answer the user question based on the context provided."
                  . $pastDecisionsBlock . "\n\n"
                  . "=== RAG KNOWLEDGE BASE CONTEXT ===\n"
                  . $sanitized_context
                  . "\n==================================\n\n"
                  . "Answer the user question query professionally in the same language they asked. Accurately report financial metrics, invoices, certificates, folders, clients, due dates, and validity status.";

    $historyMessages = [];
    if ($chatDb) {
        try {
            $hStmt = $chatDb->prepare("
                SELECT `sender`, `message_text`
                FROM `chat_history`
                WHERE `user_id` = ? AND `agent_id` = ?
                ORDER BY `id` DESC
                LIMIT 8
            ");
            $hStmt->execute([$userId, $agentId]);
            $recentHistory = array_reverse($hStmt->fetchAll(PDO::FETCH_ASSOC));
            foreach ($recentHistory as $h) {
                $role = ($h['sender'] === 'agent') ? 'assistant' : 'user';
                $sanitizedHText = sanitize_text($h['message_text'], $to_placeholder);
                $historyMessages[] = ['role' => $role, 'content' => $sanitizedHText];
            }
        } catch (\Exception $e) {}
    }

    $payloadMessages = [
        ['role' => 'system', 'content' => $systemPrompt]
    ];
    foreach ($historyMessages as $hm) {
        $payloadMessages[] = $hm;
    }
    $payloadMessages[] = ['role' => 'user', 'content' => $sanitized_query];

    // Call OpenAI
    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $openAiKey
    ]);
    $chatModel = ccrm_ai_model();
    $chatPayload = [
        'model' => $chatModel,
        'messages' => $payloadMessages,
    ];
    if (ccrm_ai_model_supports_temperature($chatModel)) {
        $chatPayload['temperature'] = 0.4;
    }
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($chatPayload, JSON_INVALID_UTF8_SUBSTITUTE));

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
    
    // Save conversation log in the Chat DB if active
    if ($chatDb) {
        try {
            $insStmt = $chatDb->prepare("INSERT INTO `chat_history` (`user_id`, `sender`, `message_text`, `agent_id`) VALUES (?, 'user', ?, ?), (?, 'agent', ?, ?)");
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
