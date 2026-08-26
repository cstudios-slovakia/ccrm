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
            echo json_encode(['success' => false, 'message' => 'Failed to delete the agent.']);
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
    $leads_stmt = $pdo->query("SELECT `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `contact_person`, `financial_summary` FROM `leads` LIMIT 100");
    $leads_all = $leads_stmt->fetchAll(PDO::FETCH_ASSOC);

    $context_blocks = [];
    $normalized_query = mb_strtolower(trim($userQuery));
    $query_words = preg_split('/[\s,\.\?\!\;\:\(\)\[\]\/\\\"\'\-]+/u', $normalized_query, -1, PREG_SPLIT_NO_EMPTY);
    $stop_words = ['v', 'a', 'i', 'o', 'na', 'do', 'so', 'za', 'pre', 'ku', 'od', 'ake', 'aka', 'aky', 'akeho', 'akej', 'co', 'kto', 'kde', 'ako', 'mame', 'ma', 'su', 'je', 'bol', 'bola', 'boli', 'the', 'is', 'in', 'at', 'of', 'on', 'and', 'to', 'for', 'are', 'what', 'who', 'how', 'which'];
    $meaningful_tokens = array_values(array_filter($query_words, function($w) use ($stop_words) {
        return mb_strlen($w) >= 2 && !in_array($w, $stop_words);
    }));

    $calc_token_score = function($targetText, array $tokens) {
        if (empty($targetText) || empty($tokens)) return 0;
        $tLower = mb_strtolower($targetText);
        $score = 0;
        foreach ($tokens as $token) {
            if (mb_strpos($tLower, $token) !== false) {
                $score += 40;
            } else {
                $stem = mb_substr($token, 0, max(3, mb_strlen($token) - 1));
                if (mb_strlen($stem) >= 3 && mb_strpos($tLower, $stem) !== false) {
                    $score += 25;
                }
            }
        }
        return $score;
    };

    foreach ($leads_all as $l) {
        $lead_id = $l['id'];
        $score = 0;
        
        $nameLower = mb_strtolower($l['name'] ?? '');
        $cityLower = mb_strtolower($l['city'] ?? '');
        $ownerLower = mb_strtolower($l['owner'] ?? '');
        $typeLower = mb_strtolower($l['client_type'] ?? '');

        if (!empty($l['name']) && mb_strpos($normalized_query, $nameLower) !== false) $score += 100;
        if (!empty($l['city']) && mb_strpos($normalized_query, $cityLower) !== false) $score += 50;
        if (!empty($l['owner']) && mb_strpos($normalized_query, $ownerLower) !== false) $score += 50;
        
        $score += $calc_token_score($l['name'] ?? '', $meaningful_tokens);
        $score += $calc_token_score($l['city'] ?? '', $meaningful_tokens);
        $score += $calc_token_score($l['owner'] ?? '', $meaningful_tokens);
        $score += $calc_token_score($l['contact_person'] ?? '', $meaningful_tokens);

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
                $score += 60;
            }
        }
        
        $cat_stmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
        $cat_stmt->execute([$lead_id]);
        $categories = $cat_stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($categories as $cat) {
            if (mb_strpos($normalized_query, mb_strtolower($cat)) !== false) {
                $score += 40;
            }
            $score += $calc_token_score($cat, $meaningful_tokens);
        }
        
        $events_stmt = $pdo->prepare("SELECT `type`, `title`, `content`, `amount`, `file_name`, `file_size`, `file_type` FROM `timeline_events` WHERE `lead_id` = ? LIMIT 15");
        $events_stmt->execute([$lead_id]);
        $events = $events_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($events as $ev) {
            if (mb_strpos($normalized_query, mb_strtolower($ev['title'])) !== false || 
                mb_strpos($normalized_query, mb_strtolower($ev['content'] ?? '')) !== false ||
                (!empty($ev['file_name']) && mb_strpos($normalized_query, mb_strtolower($ev['file_name'])) !== false)) {
                $score += 40;
            }
            $score += $calc_token_score($ev['title'] ?? '', $meaningful_tokens);
            $score += $calc_token_score($ev['content'] ?? '', $meaningful_tokens);
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
            'score' => $score,
            'is_match' => ($score > 0)
        ];
    }

    // RAG from meeting notes
    try {
        $notes_stmt = $pdo->query("SELECT `id`, `title`, `notes`, `lead_name`, `ai_summary_json` FROM `meeting_notes` WHERE (`archived` = 0 OR `archived` IS NULL) LIMIT 100");
        $meeting_notes_all = $notes_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($meeting_notes_all as $mn) {
            $score = 0;
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
                $score += 50;
            }
            $score += $calc_token_score($mn['title'] ?? '', $meaningful_tokens);
            $score += $calc_token_score($mn['lead_name'] ?? '', $meaningful_tokens);
            $score += $calc_token_score($plainTextNotes, $meaningful_tokens);
            
            $block = "Meeting Note Profile:\n";
            $block .= "- Title: " . $mn['title'] . "\n";
            $block .= "- Client/Contact: " . ($mn['lead_name'] ?? 'General') . "\n";
            $block .= "- Content:\n" . strip_tags($plainTextNotes) . "\n";
            if (!empty($summaryText)) {
                $block .= "- AI Summary: " . $summaryText . "\n";
            }
            
            $context_blocks[] = [
                'text' => $block,
                'score' => $score,
                'is_match' => ($score > 0)
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
            $score = 0;
            
            if (mb_strpos(mb_strtolower($re['subject']), $normalized_query) !== false ||
                mb_strpos(mb_strtolower($re['sender']), $normalized_query) !== false ||
                mb_strpos(mb_strtolower($re['body']), $normalized_query) !== false) {
                $score += 50;
            }
            $score += $calc_token_score($re['subject'] ?? '', $meaningful_tokens);
            $score += $calc_token_score($re['sender'] ?? '', $meaningful_tokens);
            $score += $calc_token_score($re['body'] ?? '', $meaningful_tokens);
            
            $block = "Received Email Profile:\n";
            $block .= "- Subject: " . $re['subject'] . "\n";
            $block .= "- From: " . $re['sender'] . "\n";
            $block .= "- To: " . $re['recipient'] . "\n";
            $block .= "- Received At: " . $re['received_at'] . "\n";
            $block .= "- Content:\n" . $re['body'] . "\n";
            
            $context_blocks[] = [
                'text' => $block,
                'score' => $score,
                'is_match' => ($score > 0)
            ];
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // RAG from unified entries
    try {
        $registries = $pdo->query("SELECT `id`, `name`, `entry_name`, `folder_name` FROM `unified_entries` WHERE `archived` = 0")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($registries as $reg) {
            $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($reg['id']));
            $tableName = "ue_" . $safeId;
            $chkTable = $pdo->query("SHOW TABLES LIKE '{$tableName}'")->rowCount() > 0;
            if (!$chkTable) continue;

            $regNameLower = mb_strtolower($reg['name']);
            $regIdLower = mb_strtolower($reg['id']);
            $entryLabel = $reg['entry_name'] ?: 'Záznam';
            $folderLabel = $reg['folder_name'] ?: 'Skupina';

            // Check if query targets this registry directly (e.g. "evidencia", "evidencii", "evidencie", "v evidencii", etc.)
            $isRegQuery = (
                mb_strpos($normalized_query, $regNameLower) !== false ||
                mb_strpos($normalized_query, $regIdLower) !== false ||
                (mb_strpos($regNameLower, 'evidenc') !== false && mb_strpos($normalized_query, 'evidenc') !== false) ||
                (mb_strpos($normalized_query, mb_strtolower($entryLabel)) !== false) ||
                (mb_strpos($normalized_query, mb_strtolower($folderLabel)) !== false)
            );

            $query = "
                SELECT ue.*, l.`name` as `client_name`, l.`city` as `client_city`, l.`client_type`, l.`status` as `client_status`, l.`phone` as `client_phone`, l.`email` as `client_email`
                FROM `{$tableName}` ue
                LEFT JOIN `leads` l ON ue.`client_id` = l.`id`
                ORDER BY ue.`is_folder` DESC, ue.`created_at` DESC
                LIMIT 200
            ";
            $rows = $pdo->query($query)->fetchAll(PDO::FETCH_ASSOC);

            // Index folders and children
            $foldersMap = [];
            $entriesList = [];
            foreach ($rows as $r) {
                if ((int)($r['is_folder'] ?? 0) === 1) {
                    $foldersMap[$r['id']] = $r;
                    $foldersMap[$r['id']]['children'] = [];
                } else {
                    $entriesList[] = $r;
                }
            }
            foreach ($entriesList as $e) {
                $pId = $e['parent_id'] ?? null;
                if ($pId && isset($foldersMap[$pId])) {
                    $foldersMap[$pId]['children'][] = $e;
                }
            }

            // Top-level Registry Overview Block if user is asking about this registry
            if ($isRegQuery && !empty($rows)) {
                $summaryBlock = "=== UNIFIED REGISTRY OVERVIEW: '" . $reg['name'] . "' ===\n";
                $summaryBlock .= "- Registry Name: " . $reg['name'] . " (Folder Label: " . $folderLabel . ", Entry Label: " . $entryLabel . ")\n";
                $summaryBlock .= "- Total Folders/Groups: " . count($foldersMap) . "\n";
                $summaryBlock .= "- Total Entries/Items: " . count($entriesList) . "\n";
                if (!empty($foldersMap)) {
                    $summaryBlock .= "- Folders in '" . $reg['name'] . "':\n";
                    foreach ($foldersMap as $f) {
                        $fClient = !empty($f['client_name']) ? " (Linked Client/Company: " . $f['client_name'] . ")" : "";
                        $summaryBlock .= "  * Folder [" . $folderLabel . "]: '" . ($f['title'] ?: 'Untitled') . "'" . $fClient;
                        if (!empty($f['children'])) {
                            $childTitles = array_map(function($c) { return "'" . ($c['title'] ?: 'Item') . "'"; }, $f['children']);
                            $summaryBlock .= " -> Contains " . count($f['children']) . " items: " . implode(", ", $childTitles);
                        }
                        $summaryBlock .= "\n";
                    }
                }
                $context_blocks[] = [
                    'text' => $summaryBlock,
                    'score' => 300,
                    'is_match' => true
                ];
            }

            foreach ($rows as $r) {
                $isFolder = (int)($r['is_folder'] ?? 0) === 1;
                $typeLabel = $isFolder ? $folderLabel : $entryLabel;
                $score = $isRegQuery ? 150 : 0;

                $titleLower = mb_strtolower($r['title'] ?? '');
                $clientLower = mb_strtolower($r['client_name'] ?? '');
                $fileLower = mb_strtolower($r['file_name'] ?? '');

                if (!empty($r['title']) && mb_strpos($normalized_query, $titleLower) !== false) $score += 80;
                if (!empty($r['client_name']) && mb_strpos($normalized_query, $clientLower) !== false) $score += 80;
                if (!empty($r['file_name']) && mb_strpos($normalized_query, $fileLower) !== false) $score += 50;

                $score += $calc_token_score($r['title'] ?? '', $meaningful_tokens);
                $score += $calc_token_score($r['client_name'] ?? '', $meaningful_tokens);
                $score += $calc_token_score($r['file_name'] ?? '', $meaningful_tokens);
                $score += $calc_token_score($reg['name'] ?? '', $meaningful_tokens);

                $block = "Unified Entry in '" . $reg['name'] . "' (" . $typeLabel . "):\n";
                $block .= "- Title / Name: " . ($r['title'] ?: 'Untitled') . "\n";
                $block .= "- Hierarchy: " . ($isFolder ? "Folder / Group" : "Item in Folder") . "\n";
                if (!$isFolder && !empty($r['parent_id']) && isset($foldersMap[$r['parent_id']])) {
                    $block .= "- Parent Folder: " . ($foldersMap[$r['parent_id']]['title'] ?: 'Folder') . "\n";
                }
                if ($isFolder && isset($foldersMap[$r['id']]['children']) && !empty($foldersMap[$r['id']]['children'])) {
                    $cTitles = array_map(function($c) { return $c['title'] ?: 'Item'; }, $foldersMap[$r['id']]['children']);
                    $block .= "- Contained Items: " . implode(", ", $cTitles) . " (" . count($cTitles) . " items)\n";
                }
                if (!empty($r['client_name'])) {
                    $block .= "- Associated Client/Company: " . $r['client_name'];
                    if (!empty($r['client_city'])) $block .= " (" . $r['client_city'] . ")";
                    if (!empty($r['client_type'])) $block .= " [Type: " . $r['client_type'] . "]";
                    $block .= "\n";
                }
                if (!empty($r['due_date'])) {
                    $block .= "- Due Date / Expiration: " . $r['due_date'] . "\n";
                }
                if (!empty($r['file_name'])) {
                    $block .= "- File Attachment: " . $r['file_name'] . " (" . ($r['file_size'] ?? '') . ")\n";
                }

                $context_blocks[] = [
                    'text' => $block,
                    'score' => $score,
                    'is_match' => ($score > 0)
                ];
            }
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // RAG from Warehouse Products & Inventory
    try {
        $products_stmt = $pdo->query("
            SELECT wi.`id`, wi.`name`, wi.`sku`, wi.`barcode`, wi.`category`, wi.`unit`, wi.`default_sell_price`, wi.`avg_purchase_price`, wi.`min_stock`, wi.`optimal_stock`, wi.`description`, wi.`default_location`, wi.`has_expiration`
            FROM `warehouse_items` wi
            LIMIT 100
        ");
        $products_all = $products_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($products_all as $p) {
            $score = 0;
            $pName = mb_strtolower($p['name'] ?? '');
            $pSku = mb_strtolower($p['sku'] ?? '');
            $pEan = mb_strtolower($p['barcode'] ?? '');
            $pCat = mb_strtolower($p['category'] ?? '');
            $pDesc = mb_strtolower($p['description'] ?? '');
            $pLoc = mb_strtolower($p['default_location'] ?? '');

            if ((!empty($pName) && mb_strpos($normalized_query, $pName) !== false) ||
                (!empty($pSku) && mb_strpos($normalized_query, $pSku) !== false) ||
                (!empty($pEan) && mb_strpos($normalized_query, $pEan) !== false) ||
                (!empty($pCat) && mb_strpos($normalized_query, $pCat) !== false) ||
                (!empty($pLoc) && mb_strpos($normalized_query, $pLoc) !== false) ||
                (!empty($pDesc) && mb_strpos($normalized_query, $pDesc) !== false)) {
                $score += 60;
            }

            $score += $calc_token_score($p['name'] ?? '', $meaningful_tokens);
            $score += $calc_token_score($p['sku'] ?? '', $meaningful_tokens);
            $score += $calc_token_score($p['barcode'] ?? '', $meaningful_tokens);
            $score += $calc_token_score($p['category'] ?? '', $meaningful_tokens);

            // Also match general warehouse/inventory questions if specific keywords appear
            if (mb_strpos($normalized_query, 'sklad') !== false ||
                mb_strpos($normalized_query, 'zásob') !== false ||
                mb_strpos($normalized_query, 'tovar') !== false ||
                mb_strpos($normalized_query, 'produkt') !== false ||
                mb_strpos($normalized_query, 'cenník') !== false ||
                mb_strpos($normalized_query, 'materiál') !== false ||
                mb_strpos($normalized_query, 'inventory') !== false ||
                mb_strpos($normalized_query, 'stock') !== false ||
                mb_strpos($normalized_query, 'product') !== false ||
                mb_strpos($normalized_query, 'fefo') !== false ||
                mb_strpos($normalized_query, 'šarž') !== false) {
                $score += 30;
            }

            $rawCat = $p['category'] ?? '';
            $cats = [];
            if (!empty($rawCat)) {
                if (strpos($rawCat, '[') === 0) {
                    $cats = json_decode($rawCat, true) ?: [];
                } else {
                    $cats = array_map('trim', explode(',', $rawCat));
                }
            }
            $catStr = !empty($cats) ? implode(", ", $cats) : ($rawCat ?: 'N/A');

            $onHand = 0;
            $reserved = 0;
            try {
                $stQuery = $pdo->prepare("SELECT SUM(`quantity`) as `total_qty`, SUM(`reserved_quantity`) as `total_res` FROM `warehouse_stock` WHERE `item_id` = ?");
                $stQuery->execute([$p['id']]);
                $stRow = $stQuery->fetch(PDO::FETCH_ASSOC);
                $onHand = (float)($stRow['total_qty'] ?? 0);
                $reserved = (float)($stRow['total_res'] ?? 0);
            } catch (\Exception $e) {}
            $avail = max(0, $onHand - $reserved);

            $block = "Warehouse Product / Material Profile:\n";
            $block .= "- Name: " . $p['name'] . "\n";
            $block .= "- SKU Code: " . ($p['sku'] ?: 'N/A') . "\n";
            if (!empty($p['barcode'])) {
                $block .= "- EAN / Barcode: " . $p['barcode'] . "\n";
            }
            $block .= "- Categories: " . $catStr . "\n";
            $block .= "- Selling Price: €" . number_format($p['default_sell_price'] ?? 0, 2) . " (excl. VAT)\n";
            $block .= "- Purchase Cost (WAP): €" . number_format($p['avg_purchase_price'] ?? 0, 2) . "\n";
            $block .= "- Physical Inventory: " . $onHand . " " . ($p['unit'] ?: 'ks') . " (Available: " . $avail . ", Reserved: " . $reserved . ")\n";
            $block .= "- Location / Bin: " . ($p['default_location'] ?: 'Main Floor') . "\n";
            if (!empty($p['description'])) {
                $block .= "- Specs & Description: " . strip_tags($p['description']) . "\n";
            }

            $context_blocks[] = [
                'text' => $block,
                'score' => $score,
                'is_match' => ($score > 0)
            ];
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    usort($context_blocks, function($a, $b) {
        return ($b['score'] ?? 0) - ($a['score'] ?? 0);
    });

    $selected_context = array_slice($context_blocks, 0, 20);
    $context_text = "";
    foreach ($selected_context as $cb) {
        $context_text .= $cb['text'] . "\n---\n";
    }

    $sanitized_context = sanitize_text($context_text, $to_placeholder);
    $sanitized_query = sanitize_text($userQuery, $to_placeholder);

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

    $agentName = $versionCodename;
    $skillInstructions = "You are " . $versionCodename . ", the active CRM RAG AI assistant. You have access to the context below from the CRM database.";

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
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $openAiKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'model' => ccrm_ai_model(),
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
