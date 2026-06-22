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
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
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
