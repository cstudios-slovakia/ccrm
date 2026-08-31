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

    // Diacritic & Accent Normalization
    $remove_accents = function($str) {
        $transl = [
            'á'=>'a','ä'=>'a','č'=>'c','ď'=>'d','é'=>'e','ě'=>'e','í'=>'i','ĺ'=>'l','ľ'=>'l','ň'=>'n','ó'=>'o','ô'=>'o','ö'=>'o','ő'=>'o','ŕ'=>'r','ř'=>'r','š'=>'s','ť'=>'t','ú'=>'u','ů'=>'u','ü'=>'u','ű'=>'u','ý'=>'y','ž'=>'z',
            'Á'=>'a','Ä'=>'a','Č'=>'c','Ď'=>'d','É'=>'e','Ě'=>'e','Í'=>'i','Ĺ'=>'l','Ľ'=>'l','Ň'=>'n','Ó'=>'o','Ô'=>'o','Ö'=>'o','Ő'=>'o','Ŕ'=>'r','Ř'=>'r','Š'=>'s','Ť'=>'t','Ú'=>'u','Ů'=>'u','Ü'=>'u','Ű'=>'u','Ý'=>'y','Ž'=>'z'
        ];
        return strtr($str, $transl);
    };

    $todayDate = date('Y-m-d');
    $todayFormatted = date('Y-m-d (l, F j, Y)');

    // Local database context retrieval (RAG)
    $leads_stmt = $pdo->query("SELECT `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `contact_person`, `financial_summary` FROM `leads` LIMIT 100");
    $leads_all = $leads_stmt->fetchAll(PDO::FETCH_ASSOC);

    $context_blocks = [];
    $normalized_query = mb_strtolower(trim($userQuery));
    $normalized_query_clean = $remove_accents($normalized_query);
    
    $query_words = preg_split('/[\s,\.\?\!\;\:\(\)\[\]\/\\\"\'\-]+/u', $normalized_query, -1, PREG_SPLIT_NO_EMPTY);
    $stop_words = ['v', 'a', 'i', 'o', 'na', 'do', 'so', 'za', 'pre', 'ku', 'od', 'ake', 'aka', 'aky', 'akeho', 'akej', 'co', 'kto', 'kde', 'ako', 'mame', 'ma', 'su', 'je', 'bol', 'bola', 'boli', 'the', 'is', 'in', 'at', 'of', 'on', 'and', 'to', 'for', 'are', 'what', 'who', 'how', 'which'];
    $meaningful_tokens = array_values(array_filter($query_words, function($w) use ($stop_words) {
        return mb_strlen($w) >= 2 && !in_array($w, $stop_words);
    }));
    $meaningful_tokens_clean = array_map($remove_accents, $meaningful_tokens);

    $calc_token_score = function($targetText, array $tokensClean) use ($remove_accents) {
        if (empty($targetText) || empty($tokensClean)) return 0;
        $tClean = $remove_accents(mb_strtolower($targetText));
        $score = 0;
        foreach ($tokensClean as $token) {
            if (mb_strpos($tClean, $token) !== false) {
                $score += 40;
            } else {
                $stem = mb_substr($token, 0, max(3, mb_strlen($token) - 1));
                if (mb_strlen($stem) >= 3 && mb_strpos($tClean, $stem) !== false) {
                    $score += 25;
                }
            }
        }
        return $score;
    };

    $isDeadlineQuery = (
        mb_strpos($normalized_query_clean, 'splatn') !== false ||
        mb_strpos($normalized_query_clean, 'platn') !== false ||
        mb_strpos($normalized_query_clean, 'expir') !== false ||
        mb_strpos($normalized_query_clean, 'due') !== false ||
        mb_strpos($normalized_query_clean, 'deadline') !== false ||
        mb_strpos($normalized_query_clean, 'vyprs') !== false ||
        mb_strpos($normalized_query_clean, 'termin') !== false ||
        mb_strpos($normalized_query_clean, 'overdue') !== false ||
        mb_strpos($normalized_query_clean, 'meska') !== false ||
        mb_strpos($normalized_query_clean, 'cas') !== false ||
        mb_strpos($normalized_query_clean, 'datum') !== false
    );

    $isFinancialQuery = (
        mb_strpos($normalized_query_clean, 'financ') !== false ||
        mb_strpos($normalized_query_clean, 'peniaz') !== false ||
        mb_strpos($normalized_query_clean, 'prijm') !== false ||
        mb_strpos($normalized_query_clean, 'vydav') !== false ||
        mb_strpos($normalized_query_clean, 'faktur') !== false ||
        mb_strpos($normalized_query_clean, 'zisk') !== false ||
        mb_strpos($normalized_query_clean, 'naklad') !== false ||
        mb_strpos($normalized_query_clean, 'cashflow') !== false ||
        mb_strpos($normalized_query_clean, 'bilanci') !== false ||
        mb_strpos($normalized_query_clean, 'uhrad') !== false ||
        mb_strpos($normalized_query_clean, 'pohladavk') !== false ||
        mb_strpos($normalized_query_clean, 'zavazk') !== false ||
        mb_strpos($normalized_query_clean, 'revenue') !== false ||
        mb_strpos($normalized_query_clean, 'income') !== false ||
        mb_strpos($normalized_query_clean, 'expense') !== false ||
        mb_strpos($normalized_query_clean, 'profit') !== false ||
        mb_strpos($normalized_query_clean, 'cost') !== false ||
        mb_strpos($normalized_query_clean, 'invoice') !== false ||
        mb_strpos($normalized_query_clean, 'bill') !== false ||
        mb_strpos($normalized_query_clean, 'budget') !== false ||
        mb_strpos($normalized_query_clean, 'uctovnictv') !== false ||
        mb_strpos($normalized_query_clean, 'dph') !== false ||
        mb_strpos($normalized_query_clean, 'platb') !== false
    );

    foreach ($leads_all as $l) {
        $lead_id = $l['id'];
        $score = 0;
        
        $nameClean = $remove_accents(mb_strtolower($l['name'] ?? ''));
        $cityClean = $remove_accents(mb_strtolower($l['city'] ?? ''));
        $ownerClean = $remove_accents(mb_strtolower($l['owner'] ?? ''));

        if (!empty($l['name']) && mb_strpos($normalized_query_clean, $nameClean) !== false) $score += 100;
        if (!empty($l['city']) && mb_strpos($normalized_query_clean, $cityClean) !== false) $score += 50;
        if (!empty($l['owner']) && mb_strpos($normalized_query_clean, $ownerClean) !== false) $score += 50;
        
        $score += $calc_token_score($l['name'] ?? '', $meaningful_tokens_clean);
        $score += $calc_token_score($l['city'] ?? '', $meaningful_tokens_clean);
        $score += $calc_token_score($l['owner'] ?? '', $meaningful_tokens_clean);
        $score += $calc_token_score($l['contact_person'] ?? '', $meaningful_tokens_clean);

        if (!empty($l['financial_summary'])) {
            if (mb_strpos($normalized_query_clean, 'finan') !== false || 
                mb_strpos($normalized_query_clean, 'report') !== false || 
                mb_strpos($normalized_query_clean, 'revenue') !== false || 
                mb_strpos($normalized_query_clean, 'turnover') !== false || 
                mb_strpos($normalized_query_clean, 'profit') !== false || 
                mb_strpos($normalized_query_clean, 'zisk') !== false || 
                mb_strpos($normalized_query_clean, 'vynos') !== false || 
                mb_strpos($normalized_query_clean, 'obrat') !== false ||
                mb_strpos($normalized_query_clean, 'largest') !== false ||
                mb_strpos($normalized_query_clean, 'najvac') !== false ||
                mb_strpos($normalized_query_clean, 'highest') !== false ||
                mb_strpos($remove_accents(mb_strtolower($l['financial_summary'])), $normalized_query_clean) !== false) {
                $score += 60;
            }
        }
        
        $cat_stmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
        $cat_stmt->execute([$lead_id]);
        $categories = $cat_stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($categories as $cat) {
            $catClean = $remove_accents(mb_strtolower($cat));
            if (mb_strpos($normalized_query_clean, $catClean) !== false) {
                $score += 40;
            }
            $score += $calc_token_score($cat, $meaningful_tokens_clean);
        }
        
        $events_stmt = $pdo->prepare("SELECT `type`, `title`, `content`, `amount`, `file_name`, `file_size`, `file_type` FROM `timeline_events` WHERE `lead_id` = ? LIMIT 15");
        $events_stmt->execute([$lead_id]);
        $events = $events_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($events as $ev) {
            $evTitleClean = $remove_accents(mb_strtolower($ev['title'] ?? ''));
            $evContentClean = $remove_accents(mb_strtolower($ev['content'] ?? ''));
            $evFileClean = $remove_accents(mb_strtolower($ev['file_name'] ?? ''));
            
            if (mb_strpos($normalized_query_clean, $evTitleClean) !== false || 
                mb_strpos($normalized_query_clean, $evContentClean) !== false ||
                (!empty($ev['file_name']) && mb_strpos($normalized_query_clean, $evFileClean) !== false)) {
                $score += 40;
            }
            $score += $calc_token_score($ev['title'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($ev['content'] ?? '', $meaningful_tokens_clean);
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
            
            $mnTitleClean = $remove_accents(mb_strtolower($mn['title'] ?? ''));
            $mnLeadClean = $remove_accents(mb_strtolower($mn['lead_name'] ?? ''));

            if (mb_strpos($normalized_query_clean, $mnTitleClean) !== false ||
                (!empty($mn['lead_name']) && mb_strpos($normalized_query_clean, $mnLeadClean) !== false)) {
                $score += 50;
            }
            $score += $calc_token_score($mn['title'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($mn['lead_name'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($plainTextNotes, $meaningful_tokens_clean);
            
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
            
            $score += $calc_token_score($re['subject'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($re['sender'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($re['body'] ?? '', $meaningful_tokens_clean);
            
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

    // RAG from unified entries & registries
    try {
        $registries = $pdo->query("SELECT `id`, `name`, `entry_name`, `folder_name` FROM `unified_entries` WHERE `archived` = 0")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($registries as $reg) {
            $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($reg['id']));
            $tableName = "ue_" . $safeId;
            $chkTable = $pdo->query("SHOW TABLES LIKE '{$tableName}'")->rowCount() > 0;
            if (!$chkTable) continue;

            $entryLabel = $reg['entry_name'] ?: 'Záznam';
            $folderLabel = $reg['folder_name'] ?: 'Skupina';
            $regNameClean = $remove_accents(mb_strtolower($reg['name']));
            $regIdClean = $remove_accents(mb_strtolower($reg['id']));
            $entryLabelClean = $remove_accents(mb_strtolower($entryLabel));
            $folderLabelClean = $remove_accents(mb_strtolower($folderLabel));

            // Check if query targets this registry directly (accent-agnostic)
            $isRegQuery = (
                mb_strpos($normalized_query_clean, $regNameClean) !== false ||
                mb_strpos($normalized_query_clean, $regIdClean) !== false ||
                (mb_strpos($regNameClean, 'evidenc') !== false && mb_strpos($normalized_query_clean, 'evidenc') !== false) ||
                (mb_strpos($normalized_query_clean, $entryLabelClean) !== false) ||
                (mb_strpos($normalized_query_clean, $folderLabelClean) !== false)
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

            // Top-level Registry Overview Block
            if (($isRegQuery || $isDeadlineQuery) && !empty($rows)) {
                $summaryBlock = "=== UNIFIED REGISTRY OVERVIEW: '" . $reg['name'] . "' ===\n";
                $summaryBlock .= "- Registry: " . $reg['name'] . " (Folder Type: " . $folderLabel . ", Entry Type: " . $entryLabel . ")\n";
                $summaryBlock .= "- Today's Date: " . $todayDate . "\n";
                $summaryBlock .= "- Total Folders/Groups: " . count($foldersMap) . "\n";
                $summaryBlock .= "- Total Entries/Certificates: " . count($entriesList) . "\n";
                if (!empty($foldersMap)) {
                    $summaryBlock .= "- Folders & Contained Items in '" . $reg['name'] . "':\n";
                    foreach ($foldersMap as $f) {
                        $fClient = !empty($f['client_name']) ? " (Client: " . $f['client_name'] . ")" : "";
                        $summaryBlock .= "  * [" . $folderLabel . "] '" . ($f['title'] ?: 'Untitled') . "'" . $fClient . "\n";
                        if (!empty($f['children'])) {
                            foreach ($f['children'] as $c) {
                                $cDue = !empty($c['due_date']) ? substr($c['due_date'], 0, 10) : 'None';
                                $cStatus = "Bez termínu";
                                if (!empty($c['due_date'])) {
                                    $cDiff = (int)round((strtotime($cDue) - strtotime($todayDate)) / 86400);
                                    if ($cDiff < 0) {
                                        $cStatus = "PO SPLATNOSTI / EXPIRED (" . abs($cDiff) . " dní po termíne platnosti)";
                                    } elseif ($cDiff === 0) {
                                        $cStatus = "SPLATNOSŤ DNES (končí dnes)";
                                    } else {
                                        $cStatus = "PLATNÝ / ACTIVE (" . $cDiff . " dní do vypršania platnosti)";
                                    }
                                }
                                $summaryBlock .= "    - " . $entryLabel . ": '" . ($c['title'] ?: 'Item') . "' | Due Date: " . $cDue . " -> [" . $cStatus . "]\n";
                            }
                        }
                    }
                }
                $context_blocks[] = [
                    'text' => $summaryBlock,
                    'score' => $isRegQuery ? 350 : 200,
                    'is_match' => true
                ];
            }

            foreach ($rows as $r) {
                $isFolder = (int)($r['is_folder'] ?? 0) === 1;
                $typeLabel = $isFolder ? $folderLabel : $entryLabel;
                $score = $isRegQuery ? 150 : 0;

                $titleClean = $remove_accents(mb_strtolower($r['title'] ?? ''));
                $clientClean = $remove_accents(mb_strtolower($r['client_name'] ?? ''));
                $fileClean = $remove_accents(mb_strtolower($r['file_name'] ?? ''));

                if (!empty($r['title']) && mb_strpos($normalized_query_clean, $titleClean) !== false) $score += 80;
                if (!empty($r['client_name']) && mb_strpos($normalized_query_clean, $clientClean) !== false) $score += 80;
                if (!empty($r['file_name']) && mb_strpos($normalized_query_clean, $fileClean) !== false) $score += 50;

                $score += $calc_token_score($r['title'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($r['client_name'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($r['file_name'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($reg['name'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($entryLabel, $meaningful_tokens_clean);
                $score += $calc_token_score($folderLabel, $meaningful_tokens_clean);

                $dueDateStr = "None";
                $validityStatus = "N/A";
                if (!empty($r['due_date'])) {
                    $dueDateStr = substr($r['due_date'], 0, 10);
                    $diffDays = (int)round((strtotime($dueDateStr) - strtotime($todayDate)) / 86400);
                    if ($diffDays < 0) {
                        $validityStatus = "PO SPLATNOSTI / EXPIRED (" . abs($diffDays) . " dní po splatnosti / expired " . abs($diffDays) . " days ago on " . $dueDateStr . ")";
                    } elseif ($diffDays === 0) {
                        $validityStatus = "DNEŠNÁ SPLATNOSŤ / DUE TODAY (expires today: " . $dueDateStr . ")";
                    } else {
                        $validityStatus = "PLATNÝ / ACTIVE (" . $diffDays . " dní do vypršania platnosti / " . $diffDays . " days remaining until " . $dueDateStr . ")";
                    }

                    if ($isDeadlineQuery) {
                        $score += 120;
                        if ($diffDays < 0 && (mb_strpos($normalized_query_clean, 'po splatnost') !== false || mb_strpos($normalized_query_clean, 'expir') !== false || mb_strpos($normalized_query_clean, 'overdue') !== false || mb_strpos($normalized_query_clean, 'vyprs') !== false)) {
                            $score += 100;
                        }
                    }
                }

                $block = "Unified Entry in '" . $reg['name'] . "' (" . $typeLabel . "):\n";
                $block .= "- Title / Name: " . ($r['title'] ?: 'Untitled') . "\n";
                $block .= "- Registry: " . $reg['name'] . "\n";
                $block .= "- Hierarchy: " . ($isFolder ? "Folder / Group" : "Item in Folder") . "\n";
                if (!$isFolder && !empty($r['parent_id']) && isset($foldersMap[$r['parent_id']])) {
                    $block .= "- Parent Folder: " . ($foldersMap[$r['parent_id']]['title'] ?: 'Folder') . "\n";
                }
                if ($isFolder && isset($foldersMap[$r['id']]['children']) && !empty($foldersMap[$r['id']]['children'])) {
                    $block .= "- Contained Items / Records:\n";
                    foreach ($foldersMap[$r['id']]['children'] as $ch) {
                        $chDue = !empty($ch['due_date']) ? substr($ch['due_date'], 0, 10) : 'None';
                        $block .= "  * '" . ($ch['title'] ?: 'Item') . "' (Due Date: " . $chDue . ")\n";
                    }
                }
                if (!empty($r['client_name'])) {
                    $block .= "- Associated Client/Company: " . $r['client_name'];
                    if (!empty($r['client_city'])) $block .= " (" . $r['client_city'] . ")";
                    if (!empty($r['client_type'])) $block .= " [Type: " . $r['client_type'] . "]";
                    $block .= "\n";
                }
                if (!empty($r['due_date'])) {
                    $block .= "- Due Date / Splatnosť / Expiration: " . $dueDateStr . " -> " . $validityStatus . "\n";
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

    // RAG from Financial Management (financial_records & financial_categories)
    try {
        $chkFin = $pdo->query("SHOW TABLES LIKE 'financial_records'")->rowCount() > 0;
        if ($chkFin) {
            $finStmt = $pdo->query("
                SELECT fr.*, l.`name` as `client_name`
                FROM `financial_records` fr
                LEFT JOIN `leads` l ON fr.`client_id` = l.`id`
                ORDER BY fr.`issue_date` DESC, fr.`created_at` DESC
                LIMIT 200
            ");
            $finRecords = $finStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($finRecords)) {
                // Compute Financial KPIs
                $totalRealIncome = 0;
                $totalRealExpense = 0;
                $totalPlannedIncome = 0;
                $totalPlannedExpense = 0;
                $overdueReceivables = 0;
                $pendingReceivables = 0;
                $pendingPayables = 0;
                $overduePayables = 0;
                $paidInvoicesCount = 0;
                $unpaidInvoicesCount = 0;

                $incomeByCat = [];
                $expenseByCat = [];

                foreach ($finRecords as $fr) {
                    $amtReal = (float)($fr['amount_real'] ?? 0);
                    $amtPlan = (float)($fr['amount_planned'] ?? 0);
                    $type = $fr['type'];
                    $status = $fr['status'];
                    $catPath = $fr['category_path'] ?: 'Všeobecné / Iné';

                    if ($type === 'income') {
                        $totalPlannedIncome += $amtPlan;
                        if ($status === 'paid') {
                            $totalRealIncome += $amtReal;
                            $paidInvoicesCount++;
                            $incomeByCat[$catPath] = ($incomeByCat[$catPath] ?? 0) + $amtReal;
                        } elseif ($status === 'partially_paid') {
                            $totalRealIncome += $amtReal;
                            $rem = max(0, $amtPlan - $amtReal);
                            $pendingReceivables += $rem;
                            $incomeByCat[$catPath] = ($incomeByCat[$catPath] ?? 0) + $amtReal;
                        } elseif ($status === 'overdue') {
                            $overdueReceivables += $amtPlan;
                            $unpaidInvoicesCount++;
                        } elseif ($status === 'pending') {
                            $pendingReceivables += $amtPlan;
                            $unpaidInvoicesCount++;
                        }
                    } elseif ($type === 'expense') {
                        $totalPlannedExpense += $amtPlan;
                        if ($status === 'paid' || $status === 'partially_paid') {
                            $totalRealExpense += $amtReal;
                            $expenseByCat[$catPath] = ($expenseByCat[$catPath] ?? 0) + $amtReal;
                        }
                        if ($status === 'overdue') {
                            $overduePayables += $amtPlan;
                        } elseif ($status === 'pending' || $status === 'planned') {
                            $pendingPayables += $amtPlan;
                        }
                    }
                }

                $netRealCashflow = $totalRealIncome - $totalRealExpense;
                $netPlannedCashflow = $totalPlannedIncome - $totalPlannedExpense;

                // Build Executive Financial KPI Overview
                $finSummaryBlock = "=== FINANCIAL MANAGEMENT OVERVIEW (FINANCIE / CASHFLOW / PREHĽAD) ===\n";
                $finSummaryBlock .= "- As of Date: " . $todayDate . "\n";
                $finSummaryBlock .= "- Skutočné príjmy (Real Income): €" . number_format($totalRealIncome, 2) . " EUR\n";
                $finSummaryBlock .= "- Skutočné výdavky (Real Expenses): €" . number_format($totalRealExpense, 2) . " EUR\n";
                $finSummaryBlock .= "- Čistá bilancia / Zisk (Net Cash Flow / Profit): €" . number_format($netRealCashflow, 2) . " EUR\n";
                $finSummaryBlock .= "- Plánované príjmy: €" . number_format($totalPlannedIncome, 2) . " EUR | Plánované výdavky: €" . number_format($totalPlannedExpense, 2) . " EUR\n";
                $finSummaryBlock .= "- Pohľadávky po splatnosti (Overdue Incomes to receive): €" . number_format($overdueReceivables, 2) . " EUR\n";
                $finSummaryBlock .= "- Čakajúce pohľadávky (Pending Incomes): €" . number_format($pendingReceivables, 2) . " EUR\n";
                $finSummaryBlock .= "- Čakajúce / Neuhradené výdavky (Pending Payables): €" . number_format($pendingPayables, 2) . " EUR\n";
                $finSummaryBlock .= "- Celkový počet finančných záznamov: " . count($finRecords) . "\n";

                if (!empty($expenseByCat)) {
                    arsort($expenseByCat);
                    $topExp = array_slice($expenseByCat, 0, 4, true);
                    $finSummaryBlock .= "- Hlavné kategórie výdavkov: ";
                    $expList = [];
                    foreach ($topExp as $cName => $cSum) {
                        $expList[] = $cName . " (€" . number_format($cSum, 2) . ")";
                    }
                    $finSummaryBlock .= implode(", ", $expList) . "\n";
                }

                $context_blocks[] = [
                    'text' => $finSummaryBlock,
                    'score' => $isFinancialQuery ? 400 : 150,
                    'is_match' => true
                ];

                // Individual Financial Record Blocks
                foreach ($finRecords as $fr) {
                    $score = $isFinancialQuery ? 130 : 0;
                    $titleClean = $remove_accents(mb_strtolower($fr['title'] ?? ''));
                    $descClean = $remove_accents(mb_strtolower($fr['description'] ?? ''));
                    $invClean = $remove_accents(mb_strtolower($fr['invoice_number'] ?? ''));
                    $catClean = $remove_accents(mb_strtolower($fr['category_path'] ?? ''));
                    $clientClean = $remove_accents(mb_strtolower($fr['client_name'] ?? ''));

                    if (!empty($fr['title']) && mb_strpos($normalized_query_clean, $titleClean) !== false) $score += 80;
                    if (!empty($fr['invoice_number']) && mb_strpos($normalized_query_clean, $invClean) !== false) $score += 100;
                    if (!empty($fr['client_name']) && mb_strpos($normalized_query_clean, $clientClean) !== false) $score += 80;
                    if (!empty($fr['category_path']) && mb_strpos($normalized_query_clean, $catClean) !== false) $score += 60;

                    $score += $calc_token_score($fr['title'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($fr['invoice_number'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($fr['client_name'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($fr['category_path'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($fr['description'] ?? '', $meaningful_tokens_clean);

                    // If query specifically asks about unpaid / overdue / pending
                    if ($fr['status'] === 'overdue' && (mb_strpos($normalized_query_clean, 'splatnost') !== false || mb_strpos($normalized_query_clean, 'nezaplat') !== false || mb_strpos($normalized_query_clean, 'neuhrad') !== false || mb_strpos($normalized_query_clean, 'overdue') !== false)) {
                        $score += 150;
                    }
                    if ($fr['status'] === 'pending' && (mb_strpos($normalized_query_clean, 'caka') !== false || mb_strpos($normalized_query_clean, 'pending') !== false || mb_strpos($normalized_query_clean, 'uhrad') !== false)) {
                        $score += 100;
                    }

                    $dueStr = !empty($fr['due_date']) ? substr($fr['due_date'], 0, 10) : 'None';
                    $paidStr = !empty($fr['paid_date']) ? substr($fr['paid_date'], 0, 10) : 'None';
                    $issueStr = !empty($fr['issue_date']) ? substr($fr['issue_date'], 0, 10) : 'None';

                    $dueValidity = "";
                    if (!empty($fr['due_date']) && $fr['status'] !== 'paid') {
                        $dDiff = (int)round((strtotime($dueStr) - strtotime($todayDate)) / 86400);
                        if ($dDiff < 0) {
                            $dueValidity = " [PO SPLATNOSTI O " . abs($dDiff) . " DNÍ / " . abs($dDiff) . " DAYS OVERDUE]";
                        } elseif ($dDiff === 0) {
                            $dueValidity = " [SPLATNOSŤ DNES / DUE TODAY]";
                        } else {
                            $dueValidity = " [SPLATNOSŤ O " . $dDiff . " DNÍ / " . $dDiff . " DAYS REMAINING]";
                        }
                    }

                    $typeLabel = ($fr['type'] === 'income') ? 'PRÍJEM / INCOME' : 'VÝDAVOK / EXPENSE';
                    $statusLabel = strtoupper($fr['status']);
                    if ($fr['status'] === 'paid') $statusLabel = "UHRADENÉ / PAID";
                    elseif ($fr['status'] === 'overdue') $statusLabel = "PO SPLATNOSTI / OVERDUE";
                    elseif ($fr['status'] === 'pending') $statusLabel = "ČAKÁ NA ÚHRADU / PENDING";
                    elseif ($fr['status'] === 'partially_paid') $statusLabel = "ČIASTOČNE UHRADENÉ / PARTIALLY PAID";
                    elseif ($fr['status'] === 'planned') $statusLabel = "PLÁNOVANÉ / PLANNED";

                    $block = "Financial Record (" . $typeLabel . " - " . $statusLabel . "):\n";
                    $block .= "- Title / Názov: " . $fr['title'] . "\n";
                    $block .= "- Type: " . $typeLabel . " (" . ($fr['subtype'] ?: 'General') . ")\n";
                    $block .= "- Status: " . $statusLabel . "\n";
                    $block .= "- Amount Real (Skutočná suma): €" . number_format((float)$fr['amount_real'], 2) . " " . ($fr['currency'] ?: 'EUR') . "\n";
                    if ((float)$fr['amount_planned'] > 0) {
                        $block .= "- Amount Planned (Plánovaná suma): €" . number_format((float)$fr['amount_planned'], 2) . " " . ($fr['currency'] ?: 'EUR') . "\n";
                    }
                    if (!empty($fr['invoice_number'])) {
                        $block .= "- Invoice / Reference Number: " . $fr['invoice_number'] . "\n";
                    }
                    if (!empty($fr['category_path'])) {
                        $block .= "- Category: " . $fr['category_path'] . "\n";
                    }
                    if (!empty($fr['client_name'])) {
                        $block .= "- Associated Client/Company: " . $fr['client_name'] . "\n";
                    }
                    if (!empty($fr['issue_date'])) {
                        $block .= "- Issue Date (Vystavené): " . $issueStr . "\n";
                    }
                    if (!empty($fr['due_date'])) {
                        $block .= "- Due Date (Splatnosť): " . $dueStr . $dueValidity . "\n";
                    }
                    if (!empty($fr['paid_date'])) {
                        $block .= "- Paid Date (Dátum úhrady): " . $paidStr . "\n";
                    }
                    if (!empty($fr['payment_method'])) {
                        $block .= "- Payment Method: " . $fr['payment_method'] . "\n";
                    }
                    if (!empty($fr['is_recurring']) && (int)$fr['is_recurring'] === 1) {
                        $block .= "- Recurring: YES (" . ($fr['recurring_frequency'] ?: 'regular') . ")\n";
                    }
                    if (!empty($fr['description'])) {
                        $block .= "- Description: " . strip_tags($fr['description']) . "\n";
                    }

                    $context_blocks[] = [
                        'text' => $block,
                        'score' => $score,
                        'is_match' => ($score > 0)
                    ];
                }
            }
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // RAG from tasks
    try {
        $tasks_stmt = $pdo->query("
            SELECT t.`id`, t.`title`, t.`description`, t.`status`, t.`priority`, t.`due_date`, t.`assigned_to`, l.`name` as `lead_name`
            FROM `tasks` t
            LEFT JOIN `leads` l ON t.`lead_id` = l.`id`
            WHERE (t.`archived` = 0 OR t.`archived` IS NULL)
            ORDER BY t.`created_at` DESC
            LIMIT 50
        ");
        $tasks_all = $tasks_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($tasks_all as $tsk) {
            $score = 0;
            $tTitleClean = $remove_accents(mb_strtolower($tsk['title'] ?? ''));
            $tLeadClean = $remove_accents(mb_strtolower($tsk['lead_name'] ?? ''));

            if (!empty($tsk['title']) && mb_strpos($normalized_query_clean, $tTitleClean) !== false) $score += 70;
            if (!empty($tsk['lead_name']) && mb_strpos($normalized_query_clean, $tLeadClean) !== false) $score += 60;
            
            $score += $calc_token_score($tsk['title'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($tsk['lead_name'] ?? '', $meaningful_tokens_clean);

            if ($isDeadlineQuery && !empty($tsk['due_date'])) {
                $score += 60;
            }

            $tDueStr = !empty($tsk['due_date']) ? substr($tsk['due_date'], 0, 10) : 'None';
            $tStatusStr = "";
            if (!empty($tsk['due_date'])) {
                $tDiff = (int)round((strtotime($tDueStr) - strtotime($todayDate)) / 86400);
                $tStatusStr = ($tDiff < 0) ? " [PO TERMÍNE / OVERDUE by " . abs($tDiff) . " days]" : " [PLATNÝ / " . $tDiff . " days remaining]";
            }

            $block = "CRM Task / Úloha Profile:\n";
            $block .= "- Title: " . $tsk['title'] . "\n";
            $block .= "- Status: " . $tsk['status'] . "\n";
            $block .= "- Priority: " . ($tsk['priority'] ?: 'Normal') . "\n";
            if (!empty($tsk['lead_name'])) $block .= "- Associated Client: " . $tsk['lead_name'] . "\n";
            if (!empty($tsk['assigned_to'])) $block .= "- Assignee: " . $tsk['assigned_to'] . "\n";
            if (!empty($tsk['due_date'])) $block .= "- Deadline / Due Date: " . $tDueStr . $tStatusStr . "\n";
            if (!empty($tsk['description'])) $block .= "- Details: " . strip_tags($tsk['description']) . "\n";

            $context_blocks[] = [
                'text' => $block,
                'score' => $score,
                'is_match' => ($score > 0)
            ];
        }
    } catch (\Exception $ex) {}

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
            $pNameClean = $remove_accents(mb_strtolower($p['name'] ?? ''));
            $pSkuClean = $remove_accents(mb_strtolower($p['sku'] ?? ''));
            $pCatClean = $remove_accents(mb_strtolower($p['category'] ?? ''));

            if ((!empty($p['name']) && mb_strpos($normalized_query_clean, $pNameClean) !== false) ||
                (!empty($p['sku']) && mb_strpos($normalized_query_clean, $pSkuClean) !== false) ||
                (!empty($p['category']) && mb_strpos($normalized_query_clean, $pCatClean) !== false)) {
                $score += 60;
            }

            $score += $calc_token_score($p['name'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($p['sku'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($p['category'] ?? '', $meaningful_tokens_clean);

            // Also match general warehouse/inventory questions
            if (mb_strpos($normalized_query_clean, 'sklad') !== false ||
                mb_strpos($normalized_query_clean, 'zasob') !== false ||
                mb_strpos($normalized_query_clean, 'tovar') !== false ||
                mb_strpos($normalized_query_clean, 'produkt') !== false ||
                mb_strpos($normalized_query_clean, 'cennik') !== false ||
                mb_strpos($normalized_query_clean, 'material') !== false ||
                mb_strpos($normalized_query_clean, 'inventory') !== false ||
                mb_strpos($normalized_query_clean, 'stock') !== false ||
                mb_strpos($normalized_query_clean, 'product') !== false ||
                mb_strpos($normalized_query_clean, 'fefo') !== false ||
                mb_strpos($normalized_query_clean, 'sarz') !== false) {
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

    $selected_context = array_slice($context_blocks, 0, 25);
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
                  . "Keep references exactly as they are. Answer the user question based on the context provided.\n\n"
                  . "=== RAG KNOWLEDGE BASE CONTEXT ===\n"
                  . $sanitized_context
                  . "\n==================================\n\n"
                  . "Answer the user question query professionally in the same language they asked. Accurately report financial metrics, invoices, certificates, folders, clients, due dates, and validity status.";

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
