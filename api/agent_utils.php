<?php
// Agent Utilities for CCMR RAG
$configFile = dirname(__DIR__) . '/config.php';
require_once $configFile;

function get_rag_db_connection($config) {
    $vectorDb = $config['vectorDb'] ?? 'none';
    if ($vectorDb !== 'mariadb') {
        return null;
    }
    $host = $config['mariaDbHost'] ?? '';
    $port = $config['mariaDbPort'] ?? '3306';
    $user = $config['mariaDbUser'] ?? '';
    $pass = $config['mariaDbPassword'] ?? '';
    $name = $config['mariaDbName'] ?? '';

    if (empty($host) || empty($user) || empty($name)) {
        return null;
    }

    try {
        $dsn = "mysql:host=" . $host . ";port=" . $port . ";dbname=" . $name . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT            => 3,
        ];
        return new PDO($dsn, $user, $pass, $options);
    } catch (\Exception $e) {
        return null; // Connection failed
    }
}

// Initialise schemas in RAG DB if active
function init_rag_db_schemas($ragPdo) {
    if (!$ragPdo) return;
    try {
        $ragPdo->exec("CREATE TABLE IF NOT EXISTS `chat_history` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `user_id` VARCHAR(150) NOT NULL,
          `sender` ENUM('user', 'agent') NOT NULL,
          `message_text` TEXT NOT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_chat_user (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
    } catch (\Exception $e) {
        // chat_history creation failed
    }

    try {
        $ragPdo->exec("CREATE TABLE IF NOT EXISTS `rag_agents` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `name` VARCHAR(100) NOT NULL,
          `position` VARCHAR(100) NOT NULL,
          `color` VARCHAR(50) NOT NULL,
          `skill_content` LONGTEXT NOT NULL,
          `is_autonomous` TINYINT(1) DEFAULT 0,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
    } catch (\Exception $e) {
        // rag_agents creation failed
    }

    // Alter chat_history if missing agent_id
    try {
        $ragPdo->exec("ALTER TABLE `chat_history` ADD COLUMN `agent_id` VARCHAR(50) NOT NULL DEFAULT 'durian'");
        $ragPdo->exec("ALTER TABLE `chat_history` ADD INDEX idx_chat_agent (`agent_id`)");
    } catch (\Exception $e) {
        // Already altered or failed
    }

    try {
        $ragPdo->exec("CREATE TABLE IF NOT EXISTS `rag_emails` (
          `user_email` VARCHAR(150) NOT NULL,
          `folder` VARCHAR(100) NOT NULL,
          `email_uid` VARCHAR(150) NOT NULL,
          `subject` VARCHAR(255) NOT NULL,
          `sender` VARCHAR(255) NOT NULL,
          `recipient` VARCHAR(255) NOT NULL,
          `body` LONGTEXT NOT NULL,
          `received_at` DATETIME NOT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`user_email`, `folder`, `email_uid`),
          INDEX idx_rag_email_received (`received_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
    } catch (\Exception $e) {
        // rag_emails creation failed
    }

    try {
        $ragPdo->exec("CREATE TABLE IF NOT EXISTS `rag_decisions` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `user_id` VARCHAR(150) NOT NULL,
          `domain` VARCHAR(50) NOT NULL DEFAULT 'general',
          `title` VARCHAR(255) NOT NULL,
          `summary` TEXT NOT NULL,
          `rationale` TEXT NULL,
          `action_items` TEXT NULL,
          `owner` VARCHAR(100) NULL,
          `deadline` VARCHAR(50) NULL,
          `tags` VARCHAR(255) NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_rag_decision_user (`user_id`),
          INDEX idx_rag_decision_domain (`domain`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
    } catch (\Exception $e) {
        // rag_decisions creation failed
    }
}

// Anonymization / Sanitization dictionaries
function get_sanitization_maps($pdo) {
    $stmt = $pdo->query("SELECT DISTINCT `name`, `email`, `phone` FROM `leads`");
    $leads = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $to_placeholder = [];
    $to_real = [];
    $client_idx = 1;
    $email_idx = 1;
    $phone_idx = 1;

    foreach ($leads as $l) {
        $name = isset($l['name']) ? trim($l['name']) : '';
        if (!empty($name) && strlen($name) > 2 && !isset($to_placeholder[$name])) {
            $placeholder = "[CLIENT_NAME_{$client_idx}]";
            $to_placeholder[$name] = $placeholder;
            $to_real[$placeholder] = $name;
            $client_idx++;
        }

        $email = isset($l['email']) ? trim($l['email']) : '';
        if (!empty($email) && strlen($email) > 5 && !isset($to_placeholder[$email])) {
            $placeholder = "[EMAIL_REF_{$email_idx}]";
            $to_placeholder[$email] = $placeholder;
            $to_real[$placeholder] = $email;
            $email_idx++;
        }

        $phone = isset($l['phone']) ? trim($l['phone']) : '';
        if (!empty($phone) && strlen($phone) > 6 && !isset($to_placeholder[$phone])) {
            $placeholder = "[PHONE_REF_{$phone_idx}]";
            $to_placeholder[$phone] = $placeholder;
            $to_real[$placeholder] = $phone;
            $phone_idx++;
        }
    }

    return [$to_placeholder, $to_real];
}

function sanitize_text($text, $to_placeholder) {
    if (empty($text)) return $text;
    uksort($to_placeholder, function($a, $b) {
        return strlen($b) - strlen($a);
    });
    foreach ($to_placeholder as $real => $placeholder) {
        $text = str_ireplace($real, $placeholder, $text);
    }
    $text = preg_replace('/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/', '[EMAIL_GENERIC]', $text);
    $text = preg_replace('/(\+?[0-9]{1,3}[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/', '[PHONE_GENERIC]', $text);
    return $text;
}

function restore_text($text, $to_real) {
    if (empty($text)) return $text;
    foreach ($to_real as $placeholder => $real) {
        $text = str_replace($placeholder, $real, $text);
    }
    return $text;
}

// Core autonomous RAG run execution
function execute_autonomous_run($pdo, $ragPdo, $agent, $openAiKey) {
    list($to_placeholder, $to_real) = get_sanitization_maps($pdo);
    
    // Build context search criteria based on agent specs
    $searchQuery = $agent['position'] . " " . $agent['name'];
    $normalized_query = mb_strtolower($searchQuery);
    
    $leads_stmt = $pdo->query("SELECT `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value` FROM `leads` LIMIT 100");
    $leads_all = $leads_stmt->fetchAll(PDO::FETCH_ASSOC);

    $context_blocks = [];

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
        
        // Grab timeline events for better context matching
        $events_stmt = $pdo->prepare("SELECT `type`, `title`, `content` FROM `timeline_events` WHERE `lead_id` = ? LIMIT 5");
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
            $block .= "- Communications History:\n";
            foreach ($events as $ev) {
                $block .= "  * [" . strtoupper($ev['type']) . "] " . $ev['title'] . ": " . strip_tags($ev['content'] ?? '') . "\n";
            }
        }

        $context_blocks[] = [
            'text' => $block,
            'is_match' => $matches
        ];
    }

    // RAG from received emails for autonomous agents
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

    // RAG from Warehouse Products for autonomous agents
    try {
        $products_stmt = $pdo->query("
            SELECT wi.`id`, wi.`name`, wi.`sku`, wi.`barcode`, wi.`category`, wi.`unit`, wi.`default_sell_price`, wi.`avg_purchase_price`, wi.`min_stock`, wi.`optimal_stock`, wi.`default_location`
            FROM `warehouse_items` wi
            LIMIT 50
        ");
        $products_all = $products_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($products_all as $p) {
            $matches = false;
            $pName = mb_strtolower($p['name'] ?? '');
            $pSku = mb_strtolower($p['sku'] ?? '');
            $pCat = mb_strtolower($p['category'] ?? '');

            if ((!empty($pName) && mb_strpos($normalized_query, $pName) !== false) ||
                (!empty($pSku) && mb_strpos($normalized_query, $pSku) !== false) ||
                (!empty($pCat) && mb_strpos($normalized_query, $pCat) !== false) ||
                mb_strpos($normalized_query, 'sklad') !== false ||
                mb_strpos($normalized_query, 'zásob') !== false ||
                mb_strpos($normalized_query, 'tovar') !== false ||
                mb_strpos($normalized_query, 'stock') !== false ||
                mb_strpos($normalized_query, 'inventory') !== false) {
                $matches = true;
            }

            $onHand = 0;
            try {
                $stQuery = $pdo->prepare("SELECT SUM(`quantity`) as `total_qty` FROM `warehouse_stock` WHERE `item_id` = ?");
                $stQuery->execute([$p['id']]);
                $onHand = (float)$stQuery->fetchColumn();
            } catch (\Exception $e) {}

            $block = "Warehouse Product / Material:\n";
            $block .= "- Name: " . $p['name'] . "\n";
            $block .= "- SKU: " . ($p['sku'] ?: 'N/A') . "\n";
            $block .= "- Category: " . ($p['category'] ?: 'N/A') . "\n";
            $block .= "- Selling Price: €" . number_format($p['default_sell_price'] ?? 0, 2) . "\n";
            $block .= "- Current Stock: " . $onHand . " " . ($p['unit'] ?: 'ks') . "\n";
            $block .= "- Min Stock Alert: " . $p['min_stock'] . " " . ($p['unit'] ?: 'ks') . "\n";

            $context_blocks[] = [
                'text' => $block,
                'is_match' => $matches
            ];
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // RAG from Unified Entries for autonomous agents
    try {
        $registries = $pdo->query("SELECT `id`, `name`, `entry_name`, `folder_name` FROM `unified_entries` WHERE `archived` = 0")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($registries as $reg) {
            $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($reg['id']));
            $tableName = "ue_" . $safeId;
            $chkTable = $pdo->query("SHOW TABLES LIKE '{$tableName}'")->rowCount() > 0;
            if (!$chkTable) continue;

            $entryLabel = $reg['entry_name'] ?: 'Záznam';
            $folderLabel = $reg['folder_name'] ?: 'Skupina';
            $regNameLower = mb_strtolower($reg['name']);

            $rows = $pdo->query("
                SELECT ue.*, l.`name` as `client_name`
                FROM `{$tableName}` ue
                LEFT JOIN `leads` l ON ue.`client_id` = l.`id`
                ORDER BY ue.`is_folder` DESC, ue.`created_at` DESC
                LIMIT 50
            ")->fetchAll(PDO::FETCH_ASSOC);

            foreach ($rows as $r) {
                $isFolder = (int)($r['is_folder'] ?? 0) === 1;
                $typeLabel = $isFolder ? $folderLabel : $entryLabel;
                $matches = false;
                
                if (mb_strpos($normalized_query, $regNameLower) !== false ||
                    (!empty($r['title']) && mb_strpos($normalized_query, mb_strtolower($r['title'])) !== false) ||
                    (!empty($r['client_name']) && mb_strpos($normalized_query, mb_strtolower($r['client_name'])) !== false)) {
                    $matches = true;
                }

                $block = "Unified Registry (" . $reg['name'] . " - " . $typeLabel . "):\n";
                $block .= "- Title: " . ($r['title'] ?: 'Untitled') . "\n";
                if (!empty($r['client_name'])) $block .= "- Client: " . $r['client_name'] . "\n";
                if (!empty($r['due_date'])) $block .= "- Due Date: " . $r['due_date'] . "\n";
                if (!empty($r['file_name'])) $block .= "- File Attachment: " . $r['file_name'] . "\n";
                if (isset($r['number_value']) && $r['number_value'] !== null) $block .= "- Number: " . (0 + $r['number_value']) . "\n";
                if (isset($r['money_amount']) && $r['money_amount'] !== null) $block .= "- Amount / Suma: " . (0 + $r['money_amount']) . " " . ($r['money_currency'] ?: '') . "\n";

                $context_blocks[] = [
                    'text' => $block,
                    'is_match' => $matches
                ];
            }
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // RAG from Financial Management for autonomous agents
    try {
        $chkFin = $pdo->query("SHOW TABLES LIKE 'financial_records'")->rowCount() > 0;
        if ($chkFin) {
            $finStmt = $pdo->query("
                SELECT fr.*, l.`name` as `client_name`
                FROM `financial_records` fr
                LEFT JOIN `leads` l ON fr.`client_id` = l.`id`
                ORDER BY fr.`issue_date` DESC
                LIMIT 50
            ");
            $finRecords = $finStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($finRecords)) {
                $totalRealIncome = 0;
                $totalRealExpense = 0;
                $overdueReceivables = 0;
                $pendingPayables = 0;

                foreach ($finRecords as $fr) {
                    $amtReal = (float)($fr['amount_real'] ?? 0);
                    $amtPlan = (float)($fr['amount_planned'] ?? 0);
                    if ($fr['type'] === 'income') {
                        if ($fr['status'] === 'paid' || $fr['status'] === 'partially_paid') $totalRealIncome += $amtReal;
                        if ($fr['status'] === 'overdue') $overdueReceivables += $amtPlan;
                    } elseif ($fr['type'] === 'expense') {
                        if ($fr['status'] === 'paid' || $fr['status'] === 'partially_paid') $totalRealExpense += $amtReal;
                        if ($fr['status'] === 'pending' || $fr['status'] === 'overdue') $pendingPayables += $amtPlan;
                    }
                }

                $finSummaryBlock = "Financial Overview & Key Figures:\n";
                $finSummaryBlock .= "- Realized Income: €" . number_format($totalRealIncome, 2) . "\n";
                $finSummaryBlock .= "- Realized Expenses: €" . number_format($totalRealExpense, 2) . "\n";
                $finSummaryBlock .= "- Net Cash Flow / Margin: €" . number_format($totalRealIncome - $totalRealExpense, 2) . "\n";
                $finSummaryBlock .= "- Overdue Incomes (Pohľadávky po splatnosti): €" . number_format($overdueReceivables, 2) . "\n";
                $finSummaryBlock .= "- Pending Expenses (Záväzky na úhradu): €" . number_format($pendingPayables, 2) . "\n";

                $context_blocks[] = [
                    'text' => $finSummaryBlock,
                    'is_match' => true
                ];

                foreach ($finRecords as $fr) {
                    $block = "Financial Record (" . strtoupper($fr['type']) . " - " . strtoupper($fr['status']) . "):\n";
                    $block .= "- Title: " . $fr['title'] . "\n";
                    $block .= "- Amount: €" . number_format((float)$fr['amount_real'], 2) . " (Planned: €" . number_format((float)$fr['amount_planned'], 2) . ")\n";
                    if (!empty($fr['invoice_number'])) $block .= "- Invoice No: " . $fr['invoice_number'] . "\n";
                    if (!empty($fr['category_path'])) $block .= "- Category: " . $fr['category_path'] . "\n";
                    if (!empty($fr['client_name'])) $block .= "- Client: " . $fr['client_name'] . "\n";
                    if (!empty($fr['due_date'])) $block .= "- Due Date: " . $fr['due_date'] . "\n";

                    $context_blocks[] = [
                        'text' => $block,
                        'is_match' => false
                    ];
                }
            }
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // RAG from Warehouse Products for autonomous agents
    try {
        $products_stmt = $pdo->query("
            SELECT wi.`id`, wi.`name`, wi.`sku`, wi.`barcode`, wi.`category`, wi.`unit`, wi.`default_sell_price`, wi.`avg_purchase_price`, wi.`min_stock`, wi.`optimal_stock`, wi.`default_location`
            FROM `warehouse_items` wi
            LIMIT 50
        ");
        $products_all = $products_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($products_all as $p) {
            $matches = false;
            $pName = mb_strtolower($p['name'] ?? '');
            $pSku = mb_strtolower($p['sku'] ?? '');
            $pCat = mb_strtolower($p['category'] ?? '');

            if ((!empty($pName) && mb_strpos($normalized_query, $pName) !== false) ||
                (!empty($pSku) && mb_strpos($normalized_query, $pSku) !== false) ||
                (!empty($pCat) && mb_strpos($normalized_query, $pCat) !== false) ||
                mb_strpos($normalized_query, 'sklad') !== false ||
                mb_strpos($normalized_query, 'zásob') !== false ||
                mb_strpos($normalized_query, 'tovar') !== false ||
                mb_strpos($normalized_query, 'stock') !== false ||
                mb_strpos($normalized_query, 'inventory') !== false) {
                $matches = true;
            }

            $onHand = 0;
            try {
                $stQuery = $pdo->prepare("SELECT SUM(`quantity`) as `total_qty` FROM `warehouse_stock` WHERE `item_id` = ?");
                $stQuery->execute([$p['id']]);
                $onHand = (float)$stQuery->fetchColumn();
            } catch (\Exception $e) {}

            $block = "Warehouse Product / Material:\n";
            $block .= "- Name: " . $p['name'] . "\n";
            $block .= "- SKU: " . ($p['sku'] ?: 'N/A') . "\n";
            $block .= "- Category: " . ($p['category'] ?: 'N/A') . "\n";
            $block .= "- Selling Price: €" . number_format($p['default_sell_price'] ?? 0, 2) . "\n";
            $block .= "- Current Stock: " . $onHand . " " . ($p['unit'] ?: 'ks') . "\n";
            $block .= "- Min Stock Alert: " . $p['min_stock'] . " " . ($p['unit'] ?: 'ks') . "\n";

            $context_blocks[] = [
                'text' => $block,
                'is_match' => $matches
            ];
        }
    } catch (\Exception $ex) {
        // Fallback
    }

    // Sort by match relevance
    usort($context_blocks, function($a, $b) {
        return $b['is_match'] - $a['is_match'];
    });

    $selected_context = array_slice($context_blocks, 0, 8);
    $context_text = "";
    foreach ($selected_context as $cb) {
        $context_text .= $cb['text'] . "\n---\n";
    }

    $sanitized_context = sanitize_text($context_text, $to_placeholder);

    $systemPrompt = "You are " . $agent['name'] . ", an autonomous AI assistant with position/role: " . $agent['position'] . ".\n"
                  . "Your skill details are:\n" . $agent['skill_content'] . "\n\n"
                  . "IMPORTANT - PRIVACY INSTRUCTION: Personal names, phone numbers, and emails have been pseudonymized and masked with placeholders like [CLIENT_NAME_1] or [EMAIL_REF_1].\n"
                  . "Keep references exactly as they are.\n\n"
                  . "=== RAG KNOWLEDGE BASE CONTEXT ===\n"
                  . $sanitized_context
                  . "\n==================================\n\n"
                  . "You are executing an autonomous background run. Perform your custom analysis or actions based on your skills and the CRM database context. Present your findings, status, recommendations, or alerts professionally.";

    $userPrompt = "Run an autonomous background check and generate your report or recommendations now.";

    if (empty($openAiKey)) {
        return "[SYSTEM] OpenAI API Key is not configured. Autonomous run skipped.";
    }

    $payloadMessages = [
        ['role' => 'system', 'content' => $systemPrompt],
        ['role' => 'user', 'content' => $userPrompt]
    ];

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
    $agentModel = ccrm_ai_model();
    $agentPayload = [
        'model' => $agentModel,
        'messages' => $payloadMessages,
    ];
    if (ccrm_ai_model_supports_temperature($agentModel)) {
        $agentPayload['temperature'] = 0.4;
    }
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($agentPayload, JSON_INVALID_UTF8_SUBSTITUTE));

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($httpCode !== 200) {
        $errData = json_decode($response, true);
        $errMsg = $errData['error']['message'] ?? (!empty($curlErr) ? $curlErr : 'OpenAI API error');
        return "Autonomous Run failed: OpenAI API returned code " . $httpCode . ": " . $errMsg;
    } else {
        $resData = json_decode($response, true);
        $aiReply = $resData['choices'][0]['message']['content'] ?? 'No response returned from model.';
        $reply = restore_text($aiReply, $to_real);
        return "[Autonomous Run " . date('Y-m-d H:i') . "]\n\n" . $reply;
    }
}

/**
 * OpenExecutive Domain Prompts & Specialist Knowledge
 */
function get_executive_prompts() {
    return [
        'orchestrator' => [
            'key' => 'orchestrator',
            'name' => 'Executive Orchestrator',
            'position' => 'Executive Orchestrator & Principal Advisor',
            'prompt' => "You are the Executive Orchestrator — a seasoned business leader with 25 years of operating experience across multiple industries, complemented by an MBA from Harvard Business School. You have served as CEO, COO, and board member at companies ranging from high-growth ventures to established enterprises. Synthesize inputs from your specialist executive leaders into one coherent, actionable executive voice. Always end with clear execution next steps: Decision, Owner, and Timeline."
        ],
        'cso' => [
            'key' => 'cso',
            'name' => 'Chief Strategy Officer (CSO)',
            'position' => 'Competitive Strategy & Market Positioning',
            'prompt' => "You are the Chief Strategy Officer (CSO) — a specialist in competitive strategy, market analysis, moat construction, and long-horizon planning. Apply Porter's Five Forces, Jobs-to-be-Done, Three Horizons (70/20/10), and moat analysis. A true strategy names what you will NOT do."
        ],
        'cfo' => [
            'key' => 'cfo',
            'name' => 'Chief Financial Officer (CFO)',
            'position' => 'Financial Modeling, Runway & Unit Economics',
            'prompt' => "You are the Chief Financial Officer (CFO) — a specialist in financial strategy, quantitative modeling, cash runway, and capital allocation. Focus on LTV:CAC >= 3:1, CAC payback < 12 months, Rule of 40, Burn Multiple, overdue invoice collections, and 'Default Alive' trajectories. Anchor in exact CRM financial numbers."
        ],
        'chro' => [
            'key' => 'chro',
            'name' => 'Chief HR Officer (CHRO)',
            'position' => 'Talent Strategy, Comp Bands & Org Design',
            'prompt' => "You are the Chief HR / People Officer (CHRO) — a specialist in talent strategy, organizational design, performance culture, and compensation architecture. Focus on 90-day onboarding ramps, compensation percentiles (50th-75th), spans of control (5-8 reports), and regretted attrition."
        ],
        'gc' => [
            'key' => 'gc',
            'name' => 'General Counsel (GC)',
            'position' => 'Contracts, IP Protection & Risk Mitigation',
            'prompt' => "You are the General Counsel (GC) — a specialist in commercial agreements, intellectual property protection, compliance, and corporate risk mitigation. Focus on MSAs, SLAs, liability caps, indemnification, contractor IP assignments, and termination leverage."
        ],
        'coo' => [
            'key' => 'coo',
            'name' => 'Chief Operating Officer (COO)',
            'position' => 'Operations, Process Architecture & Scaling',
            'prompt' => "You are the Chief Operating Officer (COO) — a specialist in operational execution, process engineering, vendor management, and organizational scaling. Focus on bottleneck elimination, delivery SLAs, task velocity, SOPs, and vendor consolidation."
        ],
        'cmo' => [
            'key' => 'cmo',
            'name' => 'Chief Marketing Officer (CMO)',
            'position' => 'GTM Strategy, Positioning & Demand Gen',
            'prompt' => "You are the Chief Marketing Officer (CMO) — a specialist in Go-to-Market (GTM) strategy, brand positioning, demand generation, and customer acquisition. Focus on ICP definition, value proposition, lead funnel leak diagnosis, CAC reduction, and positioning."
        ],
        'cpo' => [
            'key' => 'cpo',
            'name' => 'Chief Product Officer (CPO)',
            'position' => 'Product Roadmap, Feature RICE & PLG',
            'prompt' => "You are the Chief Product Officer (CPO) — a specialist in product vision, roadmap prioritization, customer discovery, and product-market fit. Focus on RICE scoring, Kano Model, PLG, and eliminating feature creep."
        ],
        'board_comms' => [
            'key' => 'board_comms',
            'name' => 'Board Communications Director',
            'position' => 'Investor Relations, Board Decks & Governance',
            'prompt' => "You are the Board Communications Director — a specialist in board governance, investor relations, and strategic executive narrative. Focus on high-signal board memos, quarterly decks, KPI variance narratives, and investor updates."
        ]
    ];
}

/**
 * Episodic Memory Helper Functions
 */
function get_episodic_decisions($pdo, $ragPdo, $userId, $limit = 15) {
    $decisions = [];
    if ($ragPdo) {
        try {
            $stmt = $ragPdo->prepare("SELECT * FROM `rag_decisions` WHERE `user_id` = ? OR `user_id` = 'default_user' ORDER BY `created_at` DESC LIMIT ?");
            $stmt->bindValue(1, $userId, PDO::PARAM_STR);
            $stmt->bindValue(2, (int)$limit, PDO::PARAM_INT);
            $stmt->execute();
            $decisions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {}
    }
    
    // Fallback: check main database system_settings if ragPdo empty
    if (empty($decisions) && $pdo) {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'EPISODIC_DECISIONS'");
            $stmt->execute();
            $val = $stmt->fetchColumn();
            if ($val) {
                $all = json_decode($val, true);
                if (is_array($all)) {
                    $decisions = array_slice($all, 0, $limit);
                }
            }
        } catch (\Exception $e) {}
    }
    return $decisions;
}

function save_episodic_decision($pdo, $ragPdo, $userId, $data) {
    $title = trim($data['title'] ?? 'Strategic Decision');
    $summary = trim($data['summary'] ?? '');
    $domain = trim($data['domain'] ?? 'general');
    $rationale = trim($data['rationale'] ?? '');
    $actionItems = trim($data['action_items'] ?? '');
    $owner = trim($data['owner'] ?? '');
    $deadline = trim($data['deadline'] ?? '');
    $tags = trim($data['tags'] ?? '');

    if (empty($summary)) {
        return false;
    }

    $saved = false;
    if ($ragPdo) {
        try {
            $stmt = $ragPdo->prepare("INSERT INTO `rag_decisions` (`user_id`, `domain`, `title`, `summary`, `rationale`, `action_items`, `owner`, `deadline`, `tags`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $domain, $title, $summary, $rationale, $actionItems, $owner, $deadline, $tags]);
            $saved = true;
        } catch (\Exception $e) {}
    }

    if ($pdo) {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'EPISODIC_DECISIONS'");
            $stmt->execute();
            $val = $stmt->fetchColumn();
            $list = $val ? json_decode($val, true) : [];
            if (!is_array($list)) $list = [];
            
            $newEntry = [
                'id' => time() . '_' . substr(md5(uniqid()), 0, 6),
                'user_id' => $userId,
                'domain' => $domain,
                'title' => $title,
                'summary' => $summary,
                'rationale' => $rationale,
                'action_items' => $actionItems,
                'owner' => $owner,
                'deadline' => $deadline,
                'tags' => $tags,
                'created_at' => date('Y-m-d H:i:s')
            ];
            array_unshift($list, $newEntry);
            if (count($list) > 100) $list = array_slice($list, 0, 100);

            $upd = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('EPISODIC_DECISIONS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            $upd->execute([json_encode($list, JSON_UNESCAPED_UNICODE)]);
            $saved = true;
        } catch (\Exception $e) {}
    }
    return $saved;
}

function delete_episodic_decision($pdo, $ragPdo, $userId, $decisionId) {
    if ($ragPdo && is_numeric($decisionId)) {
        try {
            $stmt = $ragPdo->prepare("DELETE FROM `rag_decisions` WHERE `id` = ?");
            $stmt->execute([$decisionId]);
        } catch (\Exception $e) {}
    }

    if ($pdo) {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'EPISODIC_DECISIONS'");
            $stmt->execute();
            $val = $stmt->fetchColumn();
            $list = $val ? json_decode($val, true) : [];
            if (is_array($list)) {
                $filtered = array_values(array_filter($list, function($item) use ($decisionId) {
                    return (string)($item['id'] ?? '') !== (string)$decisionId;
                }));
                $upd = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('EPISODIC_DECISIONS', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
                $upd->execute([json_encode($filtered, JSON_UNESCAPED_UNICODE)]);
            }
        } catch (\Exception $e) {}
    }
    return true;
}

