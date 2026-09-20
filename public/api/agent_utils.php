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

    // Alter rag_agents if missing voice
    try {
        $ragPdo->exec("ALTER TABLE `rag_agents` ADD COLUMN `voice` VARCHAR(32) DEFAULT 'alloy'");
    } catch (\Exception $e) {
        // Already altered or failed
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

/**
 * Unified Multi-Module RAG Context Builder for CCRM
 * Queries and structures real-time data across ALL 16 CRM modules/domains.
 */
function build_comprehensive_crm_rag_context($pdo, $chatDb, $userQuery = '', $systemLanguage = 'sk', $roleCategory = 'orchestrator', array $options = []) {
    if (!$pdo) {
        return [
            'raw_context' => '',
            'sanitized_context' => '',
            'selected_blocks' => [],
            'to_placeholder' => [],
            'to_real' => [],
            'total_blocks_found' => 0
        ];
    }

    list($to_placeholder, $to_real) = get_sanitization_maps($pdo);

    // Accent and diacritic stripping helper
    $remove_accents = function($str) {
        $transl = [
            'á'=>'a','ä'=>'a','č'=>'c','ď'=>'d','é'=>'e','ě'=>'e','í'=>'i','ĺ'=>'l','ľ'=>'l','ň'=>'n','ó'=>'o','ô'=>'o','ö'=>'o','ő'=>'o','ŕ'=>'r','ř'=>'r','š'=>'s','ť'=>'t','ú'=>'u','ů'=>'u','ü'=>'u','ű'=>'u','ý'=>'y','ž'=>'z',
            'Á'=>'a','Ä'=>'a','Č'=>'c','Ď'=>'d','É'=>'e','Ě'=>'e','Í'=>'i','Ĺ'=>'l','Ľ'=>'l','Ň'=>'n','Ó'=>'o','Ô'=>'o','Ö'=>'o','Ő'=>'o','Ŕ'=>'r','Ř'=>'r','Š'=>'s','Ť'=>'t','Ú'=>'u','Ů'=>'u','Ü'=>'u','Ű'=>'u','Ý'=>'y','Ž'=>'z'
        ];
        return strtr($str, $transl);
    };

    $todayDate = date('Y-m-d');
    $todayFormatted = date('Y-m-d (l, F j, Y)');

    $normalized_query = mb_strtolower(trim($userQuery));
    $normalized_query_clean = $remove_accents($normalized_query);

    $query_words = preg_split('/[\s,\.\?\!\;\:\(\)\[\]\/\\\"\'\-]+/u', $normalized_query, -1, PREG_SPLIT_NO_EMPTY);
    $stop_words = ['v', 'a', 'i', 'o', 'na', 'do', 'so', 'za', 'pre', 'ku', 'od', 'ake', 'aka', 'aky', 'akeho', 'akej', 'co', 'kto', 'kde', 'ako', 'mame', 'ma', 'su', 'je', 'bol', 'bola', 'boli', 'the', 'is', 'in', 'at', 'of', 'on', 'and', 'to', 'for', 'are', 'what', 'who', 'how', 'which', 'es', 'egy', 'hogy', 'nem', 'mit', 'hol', 'mikor'];
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

    // Domain intent detection
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
        mb_strpos($normalized_query_clean, 'datum') !== false ||
        mb_strpos($normalized_query_clean, 'lehot') !== false
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
        mb_strpos($normalized_query_clean, 'platb') !== false ||
        $roleCategory === 'cfo'
    );

    $isProjectQuery = (
        mb_strpos($normalized_query_clean, 'projekt') !== false ||
        mb_strpos($normalized_query_clean, 'project') !== false ||
        mb_strpos($normalized_query_clean, 'milestone') !== false ||
        mb_strpos($normalized_query_clean, 'etap') !== false ||
        mb_strpos($normalized_query_clean, 'harmonogram') !== false ||
        mb_strpos($normalized_query_clean, 'gantt') !== false ||
        mb_strpos($normalized_query_clean, 'delay') !== false ||
        mb_strpos($normalized_query_clean, 'meska') !== false ||
        $roleCategory === 'coo' || $roleCategory === 'cpo'
    );

    $isWarehouseQuery = (
        mb_strpos($normalized_query_clean, 'sklad') !== false ||
        mb_strpos($normalized_query_clean, 'zasob') !== false ||
        mb_strpos($normalized_query_clean, 'tovar') !== false ||
        mb_strpos($normalized_query_clean, 'produkt') !== false ||
        mb_strpos($normalized_query_clean, 'cennik') !== false ||
        mb_strpos($normalized_query_clean, 'material') !== false ||
        mb_strpos($normalized_query_clean, 'inventory') !== false ||
        mb_strpos($normalized_query_clean, 'stock') !== false ||
        mb_strpos($normalized_query_clean, 'product') !== false ||
        mb_strpos($normalized_query_clean, 'fefo') !== false ||
        mb_strpos($normalized_query_clean, 'sarz') !== false ||
        mb_strpos($normalized_query_clean, 'dodavatel') !== false ||
        mb_strpos($normalized_query_clean, 'supplier') !== false ||
        mb_strpos($normalized_query_clean, 'prijemk') !== false ||
        mb_strpos($normalized_query_clean, 'vydajk') !== false ||
        $roleCategory === 'coo'
    );

    $isInvoiceQuery = (
        mb_strpos($normalized_query_clean, 'faktur') !== false ||
        mb_strpos($normalized_query_clean, 'ponuk') !== false ||
        mb_strpos($normalized_query_clean, 'cenov') !== false ||
        mb_strpos($normalized_query_clean, 'proform') !== false ||
        mb_strpos($normalized_query_clean, 'invoice') !== false ||
        mb_strpos($normalized_query_clean, 'offer') !== false ||
        $roleCategory === 'cfo' || $roleCategory === 'cmo'
    );

    $isTaskQuery = (
        mb_strpos($normalized_query_clean, 'uloh') !== false ||
        mb_strpos($normalized_query_clean, 'task') !== false ||
        mb_strpos($normalized_query_clean, 'kanban') !== false ||
        mb_strpos($normalized_query_clean, 'priraden') !== false ||
        mb_strpos($normalized_query_clean, 'assign') !== false ||
        mb_strpos($normalized_query_clean, 'priorit') !== false ||
        mb_strpos($normalized_query_clean, 'todo') !== false ||
        mb_strpos($normalized_query_clean, 'done') !== false ||
        $roleCategory === 'coo' || $roleCategory === 'chro'
    );

    $isSwarmQuery = (
        mb_strpos($normalized_query_clean, 'swarm') !== false ||
        mb_strpos($normalized_query_clean, 'sai') !== false ||
        mb_strpos($normalized_query_clean, 'simulac') !== false ||
        mb_strpos($normalized_query_clean, 'rehearsal') !== false ||
        mb_strpos($normalized_query_clean, 'nacvik') !== false ||
        mb_strpos($normalized_query_clean, 'persona') !== false ||
        mb_strpos($normalized_query_clean, 'hypotez') !== false ||
        $roleCategory === 'cso' || $roleCategory === 'cmo'
    );

    $isSocialQuery = (
        mb_strpos($normalized_query_clean, 'social') !== false ||
        mb_strpos($normalized_query_clean, 'facebook') !== false ||
        mb_strpos($normalized_query_clean, 'instagram') !== false ||
        mb_strpos($normalized_query_clean, 'linkedin') !== false ||
        mb_strpos($normalized_query_clean, 'post') !== false ||
        mb_strpos($normalized_query_clean, 'prispevo') !== false ||
        mb_strpos($normalized_query_clean, 'zernio') !== false ||
        mb_strpos($normalized_query_clean, 'kampan') !== false ||
        $roleCategory === 'cmo'
    );

    $context_blocks = [];

    // =========================================================================
    // 1. PIPELINE & LEADS / CLIENTS
    // =========================================================================
    try {
        $leads_stmt = $pdo->query("SELECT `id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `contact_person`, `financial_summary`, `company_id`, `tax_id`, `vat_id`, `ai_summary`, `interest_note`, `country` FROM `leads` LIMIT 150");
        $leads_all = $leads_stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!empty($leads_all)) {
            $totalLeads = count($leads_all);
            $totalPipeValue = 0;
            $statusCounts = [];
            foreach ($leads_all as $l) {
                $totalPipeValue += (float)($l['value'] ?? 0);
                $st = $l['status'] ?: 'new';
                $statusCounts[$st] = ($statusCounts[$st] ?? 0) + 1;
            }

            $pipeSummary = "=== PIPELINE & CLIENT DIRECTORY OVERVIEW ===\n";
            $pipeSummary .= "- Total Leads & Accounts: {$totalLeads}\n";
            $pipeSummary .= "- Total Estimated Pipeline Value: €" . number_format($totalPipeValue, 2) . " EUR\n";
            $pipeSummary .= "- Pipeline Breakdown: ";
            $stList = [];
            foreach ($statusCounts as $stName => $stCount) {
                $stList[] = "{$stName}: {$stCount}";
            }
            $pipeSummary .= implode(" | ", $stList) . "\n";

            $context_blocks[] = [
                'text' => $pipeSummary,
                'score' => ($roleCategory === 'cmo' || $roleCategory === 'orchestrator' || $roleCategory === 'cso') ? 350 : 180,
                'is_match' => true
            ];

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
                $score += $calc_token_score($l['interest_note'] ?? '', $meaningful_tokens_clean);

                if (!empty($l['financial_summary']) && $isFinancialQuery) {
                    $score += 60;
                }

                $cat_stmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
                $cat_stmt->execute([$lead_id]);
                $categories = $cat_stmt->fetchAll(PDO::FETCH_COLUMN);
                foreach ($categories as $cat) {
                    $catClean = $remove_accents(mb_strtolower($cat));
                    if (mb_strpos($normalized_query_clean, $catClean) !== false) $score += 40;
                    $score += $calc_token_score($cat, $meaningful_tokens_clean);
                }

                $events_stmt = $pdo->prepare("SELECT `type`, `title`, `content`, `amount`, `file_name` FROM `timeline_events` WHERE `lead_id` = ? ORDER BY `timestamp` DESC LIMIT 10");
                $events_stmt->execute([$lead_id]);
                $events = $events_stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($events as $ev) {
                    $evTitleClean = $remove_accents(mb_strtolower($ev['title'] ?? ''));
                    if (mb_strpos($normalized_query_clean, $evTitleClean) !== false) $score += 40;
                    $score += $calc_token_score($ev['title'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($ev['content'] ?? '', $meaningful_tokens_clean);
                }

                $block = "Lead / Client Profile:\n";
                $block .= "- Name: " . $l['name'] . "\n";
                $block .= "- Client Type / Segment: " . $l['client_type'] . " | Status: " . $l['status'] . "\n";
                $block .= "- Owner/Manager: " . ($l['owner'] ?: 'Unassigned') . "\n";
                if (!empty($l['city'])) $block .= "- Location: " . $l['city'] . ($l['country'] ? ", " . $l['country'] : "") . "\n";
                if (!empty($l['company_id'])) $block .= "- IČO: " . $l['company_id'] . ($l['tax_id'] ? " | DIČ: " . $l['tax_id'] : "") . ($l['vat_id'] ? " | IČ DPH: " . $l['vat_id'] : "") . "\n";
                if (!empty($categories)) $block .= "- Categories: " . implode(", ", $categories) . "\n";
                if (!empty($l['value'])) $block .= "- Opportunity Value: €" . number_format((float)$l['value'], 2) . " EUR\n";
                if (!empty($l['interest_note'])) $block .= "- Interest Note: " . strip_tags($l['interest_note']) . "\n";
                if (!empty($l['ai_summary'])) $block .= "- AI Executive Summary: " . strip_tags($l['ai_summary']) . "\n";
                if (!empty($l['financial_summary'])) $block .= "- Financial Analysis:\n" . $l['financial_summary'] . "\n";

                if (!empty($events)) {
                    $block .= "- Key History & Communications:\n";
                    foreach ($events as $ev) {
                        $block .= "  * [" . strtoupper($ev['type']) . "] " . $ev['title'] . ": " . mb_substr(strip_tags($ev['content'] ?? ''), 0, 160);
                        if (!empty($ev['amount'])) $block .= " (Amount: €" . $ev['amount'] . ")";
                        $block .= "\n";
                    }
                }

                $context_blocks[] = [
                    'text' => $block,
                    'score' => $score,
                    'is_match' => ($score > 0)
                ];
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 2. PROJECTS & MILESTONES (projects, project_types, project_managers)
    // =========================================================================
    try {
        $chkProj = $pdo->query("SHOW TABLES LIKE 'projects'")->rowCount() > 0;
        if ($chkProj) {
            $projStmt = $pdo->query("
                SELECT p.*, pt.`name` as `type_name`, l.`name` as `client_name`
                FROM `projects` p
                LEFT JOIN `project_types` pt ON p.`project_type_id` = pt.`id`
                LEFT JOIN `leads` l ON p.`lead_id` = l.`id` OR p.`client_id` = l.`id`
                ORDER BY p.`created_at` DESC
                LIMIT 60
            ");
            $projectsAll = $projStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($projectsAll)) {
                $totalProjects = count($projectsAll);
                $activeCount = 0;
                $overdueProjCount = 0;
                $totalBudget = 0;

                foreach ($projectsAll as $pr) {
                    $totalBudget += (float)($pr['budget'] ?? 0);
                    $st = $pr['status'] ?? 'active';
                    if ($st === 'active' || $st === 'in_progress') $activeCount++;
                    if (!empty($pr['deadline']) && $st !== 'completed' && $st !== 'cancelled') {
                        if (strtotime($pr['deadline']) < strtotime($todayDate)) {
                            $overdueProjCount++;
                        }
                    }
                }

                $projSummary = "=== PROJECTS & OPERATIONAL MILESTONES OVERVIEW ===\n";
                $projSummary .= "- Total Tracked Projects: {$totalProjects}\n";
                $projSummary .= "- Active / In-Progress Projects: {$activeCount}\n";
                $projSummary .= "- Overdue Projects Past Deadline: {$overdueProjCount}\n";
                $projSummary .= "- Total Allocated Project Budget: €" . number_format($totalBudget, 2) . " EUR\n";

                $context_blocks[] = [
                    'text' => $projSummary,
                    'score' => ($isProjectQuery || $roleCategory === 'coo' || $roleCategory === 'cpo') ? 360 : 170,
                    'is_match' => true
                ];

                foreach ($projectsAll as $pr) {
                    $score = $isProjectQuery ? 120 : 0;
                    $pNameClean = $remove_accents(mb_strtolower($pr['name'] ?? ''));
                    $pClientClean = $remove_accents(mb_strtolower($pr['client_name'] ?? ''));
                    $pTypeClean = $remove_accents(mb_strtolower($pr['type_name'] ?? ''));

                    if (!empty($pr['name']) && mb_strpos($normalized_query_clean, $pNameClean) !== false) $score += 90;
                    if (!empty($pr['client_name']) && mb_strpos($normalized_query_clean, $pClientClean) !== false) $score += 70;

                    $score += $calc_token_score($pr['name'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($pr['client_name'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($pr['type_name'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($pr['delay_reason'] ?? '', $meaningful_tokens_clean);

                    $deadlineStr = !empty($pr['deadline']) ? substr($pr['deadline'], 0, 10) : 'None';
                    $dlStatus = "";
                    if (!empty($pr['deadline']) && ($pr['status'] ?? '') !== 'completed') {
                        $diff = (int)round((strtotime($deadlineStr) - strtotime($todayDate)) / 86400);
                        if ($diff < 0) {
                            $dlStatus = " [PO TERMÍNE / OVERDUE by " . abs($diff) . " days]";
                            if ($isDeadlineQuery) $score += 100;
                        } elseif ($diff === 0) {
                            $dlStatus = " [DEADLINE TODAY]";
                            if ($isDeadlineQuery) $score += 80;
                        } else {
                            $dlStatus = " [Active, " . $diff . " days remaining]";
                        }
                    }

                    // Managers
                    $mgrStmt = $pdo->prepare("SELECT u.`name` FROM `project_managers` pm JOIN `users` u ON pm.`user_id` = u.`id` WHERE pm.`project_id` = ?");
                    $mgrStmt->execute([$pr['id']]);
                    $managers = $mgrStmt->fetchAll(PDO::FETCH_COLUMN);

                    $block = "Project Record:\n";
                    $block .= "- Project Name: " . ($pr['name'] ?: 'Untitled Project') . "\n";
                    $block .= "- Status: " . strtoupper($pr['status'] ?? 'ACTIVE') . "\n";
                    if (!empty($pr['type_name'])) $block .= "- Type: " . $pr['type_name'] . "\n";
                    if (!empty($pr['client_name'])) $block .= "- Associated Client: " . $pr['client_name'] . "\n";
                    if (!empty($pr['budget'])) $block .= "- Budget: €" . number_format((float)$pr['budget'], 2) . " EUR\n";
                    if (!empty($pr['deadline'])) $block .= "- Deadline: " . $deadlineStr . $dlStatus . "\n";
                    if (!empty($pr['delay_reason'])) $block .= "- Delay Reason / Impediments: " . $pr['delay_reason'] . "\n";
                    if (!empty($managers)) $block .= "- Assigned Managers: " . implode(", ", $managers) . "\n";

                    $context_blocks[] = [
                        'text' => $block,
                        'score' => $score,
                        'is_match' => ($score > 0)
                    ];
                }
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 3. TASKS & KANBAN (tasks, task_assignees)
    // =========================================================================
    try {
        $tasks_stmt = $pdo->query("
            SELECT t.`id`, t.`title`, t.`description`, t.`status`, t.`priority`, t.`due_date`, t.`assigned_to`, l.`name` as `lead_name`, p.`name` as `project_name`
            FROM `tasks` t
            LEFT JOIN `leads` l ON t.`lead_id` = l.`id`
            LEFT JOIN `projects` p ON t.`project_id` = p.`id`
            WHERE (t.`archived` = 0 OR t.`archived` IS NULL)
            ORDER BY t.`created_at` DESC
            LIMIT 70
        ");
        $tasks_all = $tasks_stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!empty($tasks_all)) {
            $totalTasks = count($tasks_all);
            $openTasks = 0;
            $overdueTasks = 0;
            foreach ($tasks_all as $tsk) {
                $st = $tsk['status'] ?? 'todo';
                if ($st !== 'done' && $st !== 'completed') {
                    $openTasks++;
                    if (!empty($tsk['due_date']) && strtotime($tsk['due_date']) < strtotime($todayDate)) {
                        $overdueTasks++;
                    }
                }
            }

            $taskSummary = "=== TASK EXECUTION & ACTION ITEMS OVERVIEW ===\n";
            $taskSummary .= "- Total Active Tasks: {$totalTasks} | Open/Pending: {$openTasks} | Overdue: {$overdueTasks}\n";

            $context_blocks[] = [
                'text' => $taskSummary,
                'score' => ($isTaskQuery || $roleCategory === 'coo' || $roleCategory === 'chro') ? 320 : 150,
                'is_match' => true
            ];

            foreach ($tasks_all as $tsk) {
                $score = $isTaskQuery ? 100 : 0;
                $tTitleClean = $remove_accents(mb_strtolower($tsk['title'] ?? ''));
                $tLeadClean = $remove_accents(mb_strtolower($tsk['lead_name'] ?? ''));
                $tProjClean = $remove_accents(mb_strtolower($tsk['project_name'] ?? ''));

                if (!empty($tsk['title']) && mb_strpos($normalized_query_clean, $tTitleClean) !== false) $score += 70;
                if (!empty($tsk['lead_name']) && mb_strpos($normalized_query_clean, $tLeadClean) !== false) $score += 60;
                if (!empty($tsk['project_name']) && mb_strpos($normalized_query_clean, $tProjClean) !== false) $score += 60;

                $score += $calc_token_score($tsk['title'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($tsk['lead_name'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($tsk['project_name'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($tsk['description'] ?? '', $meaningful_tokens_clean);

                $tDueStr = !empty($tsk['due_date']) ? substr($tsk['due_date'], 0, 10) : 'None';
                $tStatusStr = "";
                if (!empty($tsk['due_date'])) {
                    $tDiff = (int)round((strtotime($tDueStr) - strtotime($todayDate)) / 86400);
                    $tStatusStr = ($tDiff < 0) ? " [PO TERMÍNE / OVERDUE by " . abs($tDiff) . " days]" : " [PLATNÝ / " . $tDiff . " days remaining]";
                    if ($isDeadlineQuery) $score += 60;
                }

                $block = "Task / Action Item:\n";
                $block .= "- Title: " . $tsk['title'] . "\n";
                $block .= "- Status: " . strtoupper($tsk['status']) . " | Priority: " . ($tsk['priority'] ?: 'Normal') . "\n";
                if (!empty($tsk['assigned_to'])) $block .= "- Assignee: " . $tsk['assigned_to'] . "\n";
                if (!empty($tsk['due_date'])) $block .= "- Due Date: " . $tDueStr . $tStatusStr . "\n";
                if (!empty($tsk['lead_name'])) $block .= "- Associated Client: " . $tsk['lead_name'] . "\n";
                if (!empty($tsk['project_name'])) $block .= "- Linked Project: " . $tsk['project_name'] . "\n";
                if (!empty($tsk['description'])) $block .= "- Description: " . mb_substr(strip_tags($tsk['description']), 0, 180) . "\n";

                $context_blocks[] = [
                    'text' => $block,
                    'score' => $score,
                    'is_match' => ($score > 0)
                ];
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 4. INVOICES & PRICE OFFERS (invoices_offers, invoice_offer_items)
    // =========================================================================
    try {
        $chkInv = $pdo->query("SHOW TABLES LIKE 'invoices_offers'")->rowCount() > 0;
        if ($chkInv) {
            $invStmt = $pdo->query("
                SELECT io.*, l.`name` as `lead_lookup_name`
                FROM `invoices_offers` io
                LEFT JOIN `leads` l ON io.`lead_id` = l.`id`
                ORDER BY io.`issued_at` DESC
                LIMIT 50
            ");
            $invoicesAll = $invStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($invoicesAll)) {
                $totalOffers = 0;
                $totalInvoices = 0;
                $totalInvoicedAmount = 0;
                $totalOfferAmount = 0;

                foreach ($invoicesAll as $inv) {
                    $val = (float)($inv['total_price'] ?? 0);
                    if ($inv['type'] === 'invoice') {
                        $totalInvoices++;
                        $totalInvoicedAmount += $val;
                    } else {
                        $totalOffers++;
                        $totalOfferAmount += $val;
                    }
                }

                $invSummary = "=== INVOICES & PRICE OFFERS OVERVIEW ===\n";
                $invSummary .= "- Issued Invoices Count: {$totalInvoices} (Total: €" . number_format($totalInvoicedAmount, 2) . " EUR)\n";
                $invSummary .= "- Price Offers Count: {$totalOffers} (Pipeline Offer Value: €" . number_format($totalOfferAmount, 2) . " EUR)\n";

                $context_blocks[] = [
                    'text' => $invSummary,
                    'score' => ($isInvoiceQuery || $roleCategory === 'cfo' || $roleCategory === 'cmo') ? 370 : 160,
                    'is_match' => true
                ];

                foreach ($invoicesAll as $inv) {
                    $score = $isInvoiceQuery ? 130 : 0;
                    $docClean = $remove_accents(mb_strtolower($inv['document_number'] ?? ''));
                    $clNameClean = $remove_accents(mb_strtolower($inv['client_name'] ?? ''));
                    $titleClean = $remove_accents(mb_strtolower($inv['title'] ?? ''));

                    if (!empty($inv['document_number']) && mb_strpos($normalized_query_clean, $docClean) !== false) $score += 100;
                    if (!empty($inv['client_name']) && mb_strpos($normalized_query_clean, $clNameClean) !== false) $score += 80;

                    $score += $calc_token_score($inv['document_number'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($inv['client_name'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($inv['title'] ?? '', $meaningful_tokens_clean);

                    // Line items
                    $itemsStmt = $pdo->prepare("SELECT `name`, `quantity`, `unit`, `unit_price`, `total_price` FROM `invoice_offer_items` WHERE `invoice_offer_id` = ? LIMIT 5");
                    $itemsStmt->execute([$inv['id']]);
                    $lineItems = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);

                    $block = "Invoice / Offer Document (" . strtoupper($inv['type']) . " - " . strtoupper($inv['status']) . "):\n";
                    $block .= "- Document Number: " . $inv['document_number'] . " (" . strtoupper($inv['type']) . ")\n";
                    $block .= "- Client / Buyer: " . $inv['client_name'] . "\n";
                    if (!empty($inv['client_ico'])) $block .= "- Client IČO: " . $inv['client_ico'] . ($inv['client_dic'] ? " | DIČ: " . $inv['client_dic'] : "") . "\n";
                    $block .= "- Total Price: €" . number_format((float)$inv['total_price'], 2) . " " . ($inv['currency'] ?: 'EUR') . " (Subtotal: €" . number_format((float)$inv['subtotal'], 2) . ", VAT: €" . number_format((float)$inv['vat_amount'], 2) . ")\n";
                    $block .= "- Status: " . strtoupper($inv['status']) . "\n";
                    if (!empty($inv['issued_at'])) $block .= "- Issue Date: " . $inv['issued_at'] . "\n";
                    if (!empty($inv['due_date'])) $block .= "- Due Date: " . $inv['due_date'] . "\n";

                    if (!empty($lineItems)) {
                        $block .= "- Line Items:\n";
                        foreach ($lineItems as $li) {
                            $block .= "  * " . $li['name'] . " - " . $li['quantity'] . " " . ($li['unit'] ?: 'ks') . " @ €" . number_format((float)$li['unit_price'], 2) . " = €" . number_format((float)$li['total_price'], 2) . "\n";
                        }
                    }

                    $context_blocks[] = [
                        'text' => $block,
                        'score' => $score,
                        'is_match' => ($score > 0)
                    ];
                }
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 5. FINANCIAL MANAGEMENT (financial_records, financial_categories)
    // =========================================================================
    try {
        $chkFin = $pdo->query("SHOW TABLES LIKE 'financial_records'")->rowCount() > 0;
        if ($chkFin) {
            $finStmt = $pdo->query("
                SELECT fr.*, l.`name` as `client_name`
                FROM `financial_records` fr
                LEFT JOIN `leads` l ON fr.`client_id` = l.`id`
                ORDER BY fr.`issue_date` DESC, fr.`created_at` DESC
                LIMIT 150
            ");
            $finRecords = $finStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($finRecords)) {
                $totalRealIncome = 0;
                $totalRealExpense = 0;
                $totalPlannedIncome = 0;
                $totalPlannedExpense = 0;
                $overdueReceivables = 0;
                $pendingReceivables = 0;
                $pendingPayables = 0;
                $overduePayables = 0;
                $expenseByCat = [];

                foreach ($finRecords as $fr) {
                    $amtReal = (float)($fr['amount_real'] ?? 0);
                    $amtPlan = (float)($fr['amount_planned'] ?? 0);
                    $type = $fr['type'];
                    $status = $fr['status'];
                    $catPath = $fr['category_path'] ?: 'General';

                    if ($type === 'income') {
                        $totalPlannedIncome += $amtPlan;
                        if ($status === 'paid') {
                            $totalRealIncome += $amtReal;
                        } elseif ($status === 'partially_paid') {
                            $totalRealIncome += $amtReal;
                            $pendingReceivables += max(0, $amtPlan - $amtReal);
                        } elseif ($status === 'overdue') {
                            $overdueReceivables += $amtPlan;
                        } elseif ($status === 'pending') {
                            $pendingReceivables += $amtPlan;
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

                $finSummaryBlock = "=== FINANCIAL MANAGEMENT & CASH FLOW OVERVIEW ===\n";
                $finSummaryBlock .= "- As of Date: " . $todayDate . "\n";
                $finSummaryBlock .= "- Skutočné príjmy (Real Income): €" . number_format($totalRealIncome, 2) . " EUR\n";
                $finSummaryBlock .= "- Skutočné výdavky (Real Expenses): €" . number_format($totalRealExpense, 2) . " EUR\n";
                $finSummaryBlock .= "- Čistá bilancia / Zisk (Net Cash Flow / Profit): €" . number_format($netRealCashflow, 2) . " EUR\n";
                $finSummaryBlock .= "- Pohľadávky po splatnosti (Overdue Receivables): €" . number_format($overdueReceivables, 2) . " EUR\n";
                $finSummaryBlock .= "- Čakajúce pohľadávky (Pending Incomes): €" . number_format($pendingReceivables, 2) . " EUR\n";
                $finSummaryBlock .= "- Neuhradené výdavky (Pending Payables): €" . number_format($pendingPayables, 2) . " EUR\n";

                if (!empty($expenseByCat)) {
                    arsort($expenseByCat);
                    $topExp = array_slice($expenseByCat, 0, 4, true);
                    $expList = [];
                    foreach ($topExp as $cName => $cSum) {
                        $expList[] = $cName . " (€" . number_format($cSum, 2) . ")";
                    }
                    $finSummaryBlock .= "- Hlavné kategórie výdavkov: " . implode(", ", $expList) . "\n";
                }

                $context_blocks[] = [
                    'text' => $finSummaryBlock,
                    'score' => ($isFinancialQuery || $roleCategory === 'cfo') ? 420 : 180,
                    'is_match' => true
                ];

                foreach ($finRecords as $fr) {
                    $score = $isFinancialQuery ? 130 : 0;
                    $titleClean = $remove_accents(mb_strtolower($fr['title'] ?? ''));
                    $invClean = $remove_accents(mb_strtolower($fr['invoice_number'] ?? ''));
                    $catClean = $remove_accents(mb_strtolower($fr['category_path'] ?? ''));
                    $clientClean = $remove_accents(mb_strtolower($fr['client_name'] ?? ''));

                    if (!empty($fr['title']) && mb_strpos($normalized_query_clean, $titleClean) !== false) $score += 80;
                    if (!empty($fr['invoice_number']) && mb_strpos($normalized_query_clean, $invClean) !== false) $score += 100;
                    if (!empty($fr['client_name']) && mb_strpos($normalized_query_clean, $clientClean) !== false) $score += 80;

                    $score += $calc_token_score($fr['title'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($fr['invoice_number'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($fr['client_name'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($fr['category_path'] ?? '', $meaningful_tokens_clean);

                    if ($fr['status'] === 'overdue') $score += 120;

                    $dueStr = !empty($fr['due_date']) ? substr($fr['due_date'], 0, 10) : 'None';
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

                    $block = "Financial Record (" . strtoupper($fr['type']) . " - " . strtoupper($fr['status']) . "):\n";
                    $block .= "- Title: " . $fr['title'] . "\n";
                    $block .= "- Amount Real: €" . number_format((float)$fr['amount_real'], 2) . " " . ($fr['currency'] ?: 'EUR') . " (Planned: €" . number_format((float)$fr['amount_planned'], 2) . ")\n";
                    $block .= "- Status: " . strtoupper($fr['status']) . "\n";
                    if (!empty($fr['invoice_number'])) $block .= "- Invoice No: " . $fr['invoice_number'] . "\n";
                    if (!empty($fr['category_path'])) $block .= "- Category: " . $fr['category_path'] . "\n";
                    if (!empty($fr['client_name'])) $block .= "- Client: " . $fr['client_name'] . "\n";
                    if (!empty($fr['due_date'])) $block .= "- Due Date: " . $dueStr . $dueValidity . "\n";
                    if (!empty($fr['is_recurring']) && (int)$fr['is_recurring'] === 1) $block .= "- Recurring Rule: YES (" . ($fr['recurring_frequency'] ?: 'regular') . ")\n";

                    $context_blocks[] = [
                        'text' => $block,
                        'score' => $score,
                        'is_match' => ($score > 0)
                    ];
                }
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 6. WAREHOUSE & INVENTORY (warehouse_items, stock, movements, suppliers)
    // =========================================================================
    try {
        $chkWH = $pdo->query("SHOW TABLES LIKE 'warehouse_items'")->rowCount() > 0;
        if ($chkWH) {
            $products_stmt = $pdo->query("
                SELECT wi.`id`, wi.`name`, wi.`sku`, wi.`barcode`, wi.`category`, wi.`unit`, wi.`default_sell_price`, wi.`avg_purchase_price`, wi.`min_stock`, wi.`optimal_stock`, wi.`description`, wi.`default_location`, wi.`has_expiration`
                FROM `warehouse_items` wi
                LIMIT 80
            ");
            $products_all = $products_stmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($products_all)) {
                $totalSkus = count($products_all);
                $totalStockValuation = 0;
                $lowStockAlerts = 0;

                foreach ($products_all as $p) {
                    $onHand = 0;
                    try {
                        $stQuery = $pdo->prepare("SELECT SUM(`quantity`) FROM `warehouse_stock` WHERE `item_id` = ?");
                        $stQuery->execute([$p['id']]);
                        $onHand = (float)($stQuery->fetchColumn() ?: 0);
                    } catch (\Exception $e) {}
                    $totalStockValuation += $onHand * (float)($p['avg_purchase_price'] ?? 0);
                    if ($onHand < (float)($p['min_stock'] ?? 0)) $lowStockAlerts++;
                }

                $whSummary = "=== WAREHOUSE & INVENTORY VALUATION OVERVIEW ===\n";
                $whSummary .= "- Total Catalog SKUs: {$totalSkus}\n";
                $whSummary .= "- Total Inventory Asset Valuation (at WAP cost): €" . number_format($totalStockValuation, 2) . " EUR\n";
                $whSummary .= "- Low Stock / Reorder Threshold Alerts: {$lowStockAlerts} items\n";

                $context_blocks[] = [
                    'text' => $whSummary,
                    'score' => ($isWarehouseQuery || $roleCategory === 'coo' || $roleCategory === 'cfo') ? 360 : 150,
                    'is_match' => true
                ];

                foreach ($products_all as $p) {
                    $score = $isWarehouseQuery ? 110 : 0;
                    $pNameClean = $remove_accents(mb_strtolower($p['name'] ?? ''));
                    $pSkuClean = $remove_accents(mb_strtolower($p['sku'] ?? ''));
                    $pCatClean = $remove_accents(mb_strtolower($p['category'] ?? ''));

                    if (!empty($p['name']) && mb_strpos($normalized_query_clean, $pNameClean) !== false) $score += 80;
                    if (!empty($p['sku']) && mb_strpos($normalized_query_clean, $pSkuClean) !== false) $score += 80;

                    $score += $calc_token_score($p['name'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($p['sku'] ?? '', $meaningful_tokens_clean);
                    $score += $calc_token_score($p['category'] ?? '', $meaningful_tokens_clean);

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

                    $block = "Warehouse Item Profile:\n";
                    $block .= "- Name: " . $p['name'] . " | SKU: " . ($p['sku'] ?: 'N/A') . "\n";
                    if (!empty($p['barcode'])) $block .= "- Barcode: " . $p['barcode'] . "\n";
                    $block .= "- Selling Price: €" . number_format($p['default_sell_price'] ?? 0, 2) . " | Cost Price (WAP): €" . number_format($p['avg_purchase_price'] ?? 0, 2) . "\n";
                    $block .= "- Physical Stock: " . $onHand . " " . ($p['unit'] ?: 'ks') . " (Available: " . $avail . ", Reserved: " . $reserved . ")\n";
                    $block .= "- Min Stock Alert: " . $p['min_stock'] . " " . ($p['unit'] ?: 'ks') . "\n";
                    if (!empty($p['default_location'])) $block .= "- Location: " . $p['default_location'] . "\n";

                    $context_blocks[] = [
                        'text' => $block,
                        'score' => $score,
                        'is_match' => ($score > 0)
                    ];
                }
            }

            // Suppliers
            $supStmt = $pdo->query("SELECT `name`, `company_id`, `tax_id`, `payment_due_days`, `phone`, `email`, `iban` FROM `suppliers` LIMIT 30");
            $suppliersAll = $supStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($suppliersAll as $sup) {
                $score = $isWarehouseQuery ? 80 : 0;
                $score += $calc_token_score($sup['name'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($sup['company_id'] ?? '', $meaningful_tokens_clean);

                $block = "Supplier Profile:\n";
                $block .= "- Supplier Name: " . $sup['name'] . "\n";
                if (!empty($sup['company_id'])) $block .= "- IČO: " . $sup['company_id'] . ($sup['tax_id'] ? " | DIČ: " . $sup['tax_id'] : "") . "\n";
                $block .= "- Payment Terms: " . ($sup['payment_due_days'] ?: 14) . " days due\n";
                if (!empty($sup['email'])) $block .= "- Contact Email: " . $sup['email'] . "\n";

                $context_blocks[] = [
                    'text' => $block,
                    'score' => $score,
                    'is_match' => ($score > 0)
                ];
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 7. MEETINGS & TRANSCRIPTS (meeting_notes, meeting_tasks)
    // =========================================================================
    try {
        $notes_stmt = $pdo->query("SELECT `id`, `title`, `date`, `notes`, `lead_name`, `ai_summary_json` FROM `meeting_notes` WHERE (`archived` = 0 OR `archived` IS NULL) ORDER BY `date` DESC LIMIT 40");
        $meeting_notes_all = $notes_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($meeting_notes_all as $mn) {
            $score = 0;
            $plainTextNotes = "";
            if (!empty($mn['notes'])) {
                if (strpos(trim($mn['notes']), '[') === 0) {
                    try {
                        $blocks = json_decode($mn['notes'], true);
                        if (is_array($blocks)) {
                            foreach ($blocks as $b) $plainTextNotes .= ($b['content'] ?? '') . " ";
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
                $score += 60;
            }
            $score += $calc_token_score($mn['title'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($mn['lead_name'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($plainTextNotes, $meaningful_tokens_clean);

            $block = "Meeting Notes & Transcript:\n";
            $block .= "- Title: " . $mn['title'] . " (Date: " . ($mn['date'] ?: 'N/A') . ")\n";
            $block .= "- Client/Contact: " . ($mn['lead_name'] ?? 'General') . "\n";
            $block .= "- Summary: " . ($summaryText ?: mb_substr(strip_tags($plainTextNotes), 0, 200)) . "\n";

            $context_blocks[] = [
                'text' => $block,
                'score' => $score,
                'is_match' => ($score > 0)
            ];
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 8. UNIFIED CUSTOM REGISTRIES (unified_entries, ue_*)
    // =========================================================================
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

            $isRegQuery = (
                mb_strpos($normalized_query_clean, $regNameClean) !== false ||
                (mb_strpos($regNameClean, 'evidenc') !== false && mb_strpos($normalized_query_clean, 'evidenc') !== false) ||
                $roleCategory === 'gc'
            );

            $rows = $pdo->query("
                SELECT ue.*, l.`name` as `client_name`
                FROM `{$tableName}` ue
                LEFT JOIN `leads` l ON ue.`client_id` = l.`id`
                ORDER BY ue.`is_folder` DESC, ue.`created_at` DESC
                LIMIT 100
            ")->fetchAll(PDO::FETCH_ASSOC);

            if (($isRegQuery || $isDeadlineQuery) && !empty($rows)) {
                $summaryBlock = "=== UNIFIED REGISTRY: '" . $reg['name'] . "' ===\n";
                $summaryBlock .= "- Registry Name: " . $reg['name'] . " | Total Records: " . count($rows) . "\n";
                foreach (array_slice($rows, 0, 10) as $r) {
                    $cDue = !empty($r['due_date']) ? substr($r['due_date'], 0, 10) : 'None';
                    $summaryBlock .= "  * " . ($r['title'] ?: 'Item') . " (Due: {$cDue})\n";
                }
                $context_blocks[] = [
                    'text' => $summaryBlock,
                    'score' => $isRegQuery ? 350 : 200,
                    'is_match' => true
                ];
            }

            foreach ($rows as $r) {
                $score = $isRegQuery ? 120 : 0;
                $score += $calc_token_score($r['title'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($r['client_name'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($r['file_name'] ?? '', $meaningful_tokens_clean);

                $dueDateStr = "None";
                $validityStatus = "";
                if (!empty($r['due_date'])) {
                    $dueDateStr = substr($r['due_date'], 0, 10);
                    $diffDays = (int)round((strtotime($dueDateStr) - strtotime($todayDate)) / 86400);
                    $validityStatus = ($diffDays < 0) ? " [PO SPLATNOSTI / EXPIRED by " . abs($diffDays) . " days]" : " [PLATNÝ / {$diffDays} days left]";
                    if ($isDeadlineQuery) $score += 80;
                }

                $block = "Registry Item ('" . $reg['name'] . "'):\n";
                $block .= "- Title: " . ($r['title'] ?: 'Untitled') . "\n";
                if (!empty($r['client_name'])) $block .= "- Client: " . $r['client_name'] . "\n";
                if (!empty($r['due_date'])) $block .= "- Due Date: " . $dueDateStr . $validityStatus . "\n";
                if (!empty($r['file_name'])) $block .= "- Attachment: " . $r['file_name'] . "\n";

                $context_blocks[] = [
                    'text' => $block,
                    'score' => $score,
                    'is_match' => ($score > 0)
                ];
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 9. EMAIL CLIENT (rag_emails)
    // =========================================================================
    try {
        $email_db = $chatDb ?: $pdo;
        $emails_stmt = $email_db->query("SELECT `subject`, `sender`, `recipient`, `body`, `received_at` FROM `rag_emails` ORDER BY `received_at` DESC LIMIT 40");
        $rag_emails_all = $emails_stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rag_emails_all as $re) {
            $score = 0;
            $score += $calc_token_score($re['subject'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($re['sender'] ?? '', $meaningful_tokens_clean);
            $score += $calc_token_score($re['body'] ?? '', $meaningful_tokens_clean);

            $block = "Received Email:\n";
            $block .= "- Subject: " . $re['subject'] . "\n";
            $block .= "- From: " . $re['sender'] . " | Date: " . $re['received_at'] . "\n";
            $block .= "- Content Excerpt: " . mb_substr(strip_tags($re['body']), 0, 200) . "\n";

            $context_blocks[] = [
                'text' => $block,
                'score' => $score,
                'is_match' => ($score > 0)
            ];
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 10. SYNTHETIC AI (SAI) & SWARM SIMULATIONS (swarm_simulations)
    // =========================================================================
    try {
        $chkSwarm = $pdo->query("SHOW TABLES LIKE 'swarm_simulations'")->rowCount() > 0;
        if ($chkSwarm) {
            $swarmStmt = $pdo->query("SELECT `id`, `title`, `hypothesis`, `swarm_scale`, `total_rounds`, `status`, `created_at` FROM `swarm_simulations` ORDER BY `created_at` DESC LIMIT 15");
            $sims = $swarmStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($sims as $sm) {
                $score = $isSwarmQuery ? 130 : 0;
                $score += $calc_token_score($sm['title'] ?? '', $meaningful_tokens_clean);
                $score += $calc_token_score($sm['hypothesis'] ?? '', $meaningful_tokens_clean);

                $block = "SAI Swarm Market Simulation:\n";
                $block .= "- Title / Scenario: " . $sm['title'] . "\n";
                $block .= "- Hypothesis: " . $sm['hypothesis'] . "\n";
                $block .= "- Scale: " . $sm['swarm_scale'] . " personas | Rounds: " . $sm['total_rounds'] . " | Status: " . strtoupper($sm['status']) . "\n";

                $context_blocks[] = [
                    'text' => $block,
                    'score' => $score,
                    'is_match' => ($score > 0)
                ];
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 11. WORKFLOWS & AUTOMATION (workflows)
    // =========================================================================
    try {
        $chkWf = $pdo->query("SHOW TABLES LIKE 'workflows'")->rowCount() > 0;
        if ($chkWf) {
            $wfStmt = $pdo->query("SELECT `name`, `description`, `trigger_type`, `is_active` FROM `workflows` WHERE `is_active` = 1 LIMIT 20");
            $workflows = $wfStmt->fetchAll(PDO::FETCH_ASSOC);
            if (!empty($workflows)) {
                $wfSummary = "=== AUTOMATED WORKFLOWS & EVENT TRIGGERS ===\n";
                foreach ($workflows as $wf) {
                    $wfSummary .= "- Workflow: " . $wf['name'] . " (Trigger: " . $wf['trigger_type'] . ")\n";
                }
                $context_blocks[] = [
                    'text' => $wfSummary,
                    'score' => ($roleCategory === 'coo') ? 220 : 100,
                    'is_match' => true
                ];
            }
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 12. TEAM ROSTER & SYSTEM SECURITY (users, audit_log)
    // =========================================================================
    try {
        $userStmt = $pdo->query("SELECT `id`, `name`, `email`, `role`, `is_active` FROM `users` WHERE `is_active` = 1 LIMIT 30");
        $usersAll = $userStmt->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($usersAll)) {
            $teamBlock = "=== TEAM MEMBERS & ROLES ===\n";
            foreach ($usersAll as $u) {
                $teamBlock .= "- Member: " . $u['name'] . " (" . $u['email'] . ") | Role: " . strtoupper($u['role']) . "\n";
            }
            $context_blocks[] = [
                'text' => $teamBlock,
                'score' => ($roleCategory === 'chro' || $roleCategory === 'orchestrator') ? 250 : 110,
                'is_match' => true
            ];
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // 13. EPISODIC STRATEGIC DECISIONS (rag_decisions)
    // =========================================================================
    try {
        $decisions = get_episodic_decisions($pdo, $chatDb, 'default_user', 10);
        if (!empty($decisions)) {
            $decBlock = "=== HISTORICAL BOARDROOM STRATEGIC DECISIONS ===\n";
            foreach ($decisions as $d) {
                $decBlock .= "- [" . strtoupper($d['domain'] ?? 'STRATEGY') . "] " . ($d['title'] ?? 'Decision') . ": " . ($d['summary'] ?? '') . "\n";
                if (!empty($d['owner']) || !empty($d['deadline'])) {
                    $decBlock .= "  Owner: " . ($d['owner'] ?: 'Unassigned') . " | Deadline: " . ($d['deadline'] ?: 'TBD') . "\n";
                }
            }
            $context_blocks[] = [
                'text' => $decBlock,
                'score' => ($roleCategory === 'orchestrator' || $roleCategory === 'cso' || $roleCategory === 'board_comms') ? 380 : 200,
                'is_match' => true
            ];
        }
    } catch (\Exception $ex) {}

    // =========================================================================
    // RANKING, COMPILATION & SANITIZATION
    // =========================================================================
    usort($context_blocks, function($a, $b) {
        return ($b['score'] ?? 0) - ($a['score'] ?? 0);
    });

    $maxBlocks = $options['limit'] ?? 28;
    $selected_context = array_slice($context_blocks, 0, $maxBlocks);
    $context_text = "";
    foreach ($selected_context as $cb) {
        $context_text .= $cb['text'] . "\n---\n";
    }

    $sanitized_context = sanitize_text($context_text, $to_placeholder);

    return [
        'raw_context' => $context_text,
        'sanitized_context' => $sanitized_context,
        'selected_blocks' => $selected_context,
        'to_placeholder' => $to_placeholder,
        'to_real' => $to_real,
        'total_blocks_found' => count($context_blocks)
    ];
}

function get_crm_rag_context_text($pdo, $chatDb, $userQuery = '', $systemLanguage = 'sk', $roleCategory = 'orchestrator', array $options = []) {
    $res = build_comprehensive_crm_rag_context($pdo, $chatDb, $userQuery, $systemLanguage, $roleCategory, $options);
    return $res['sanitized_context'] ?? '';
}

// Core autonomous RAG run execution
function execute_autonomous_run($pdo, $ragPdo, $agent, $openAiKey) {
    $searchQuery = ($agent['position'] ?? '') . " " . ($agent['name'] ?? '');
    $ragData = build_comprehensive_crm_rag_context($pdo, $ragPdo, $searchQuery, 'sk', $agent['roleCategory'] ?? 'orchestrator', ['limit' => 15]);
    
    $sanitized_context = $ragData['sanitized_context'];
    $to_real = $ragData['to_real'];

    $systemPrompt = "You are " . $agent['name'] . ", an autonomous AI assistant with position/role: " . $agent['position'] . ".\n"
                  . "Your skill details are:\n" . $agent['skill_content'] . "\n\n"
                  . "IMPORTANT - PRIVACY INSTRUCTION: Personal names, phone numbers, and emails have been pseudonymized and masked with placeholders like [CLIENT_NAME_1] or [EMAIL_REF_1].\n"
                  . "Keep references exactly as they are.\n\n"
                  . "=== COMPREHENSIVE CRM RAG KNOWLEDGE BASE CONTEXT ===\n"
                  . $sanitized_context
                  . "\n====================================================\n\n"
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
            'voice' => 'alloy',
            'prompt' => "You are the Executive Orchestrator — a seasoned business leader with 25 years of operating experience across multiple industries, complemented by an MBA from Harvard Business School. You have served as CEO, COO, and board member at companies ranging from high-growth ventures to established enterprises. Synthesize inputs from your specialist executive leaders into one coherent, actionable executive voice. Always end with clear execution next steps: Decision, Owner, and Timeline."
        ],
        'cso' => [
            'key' => 'cso',
            'name' => 'Chief Strategy Officer (CSO)',
            'position' => 'Competitive Strategy & Market Positioning',
            'voice' => 'ash',
            'prompt' => "You are the Chief Strategy Officer (CSO) — a specialist in competitive strategy, market analysis, moat construction, and long-horizon planning. Apply Porter's Five Forces, Jobs-to-be-Done, Three Horizons (70/20/10), and moat analysis. A true strategy names what you will NOT do."
        ],
        'cfo' => [
            'key' => 'cfo',
            'name' => 'Chief Financial Officer (CFO)',
            'position' => 'Financial Modeling, Runway & Unit Economics',
            'voice' => 'sage',
            'prompt' => "You are the Chief Financial Officer (CFO) — a specialist in financial strategy, quantitative modeling, cash runway, and capital allocation. Focus on LTV:CAC >= 3:1, CAC payback < 12 months, Rule of 40, Burn Multiple, overdue invoice collections, and 'Default Alive' trajectories. Anchor in exact CRM financial numbers."
        ],
        'chro' => [
            'key' => 'chro',
            'name' => 'Chief HR Officer (CHRO)',
            'position' => 'Talent Strategy, Comp Bands & Org Design',
            'voice' => 'coral',
            'prompt' => "You are the Chief HR / People Officer (CHRO) — a specialist in talent strategy, organizational design, performance culture, and compensation architecture. Focus on 90-day onboarding ramps, compensation percentiles (50th-75th), spans of control (5-8 reports), and regretted attrition."
        ],
        'gc' => [
            'key' => 'gc',
            'name' => 'General Counsel (GC)',
            'position' => 'Contracts, IP Protection & Risk Mitigation',
            'voice' => 'echo',
            'prompt' => "You are the General Counsel (GC) — a specialist in commercial agreements, intellectual property protection, compliance, and corporate risk mitigation. Focus on MSAs, SLAs, liability caps, indemnification, contractor IP assignments, and termination leverage."
        ],
        'coo' => [
            'key' => 'coo',
            'name' => 'Chief Operating Officer (COO)',
            'position' => 'Operations, Process Architecture & Scaling',
            'voice' => 'verse',
            'prompt' => "You are the Chief Operating Officer (COO) — a specialist in operational execution, process engineering, vendor management, and organizational scaling. Focus on bottleneck elimination, delivery SLAs, task velocity, SOPs, and vendor consolidation."
        ],
        'cmo' => [
            'key' => 'cmo',
            'name' => 'Chief Marketing Officer (CMO)',
            'position' => 'GTM Strategy, Positioning & Demand Gen',
            'voice' => 'shimmer',
            'prompt' => "You are the Chief Marketing Officer (CMO) — a specialist in Go-to-Market (GTM) strategy, brand positioning, demand generation, and customer acquisition. Focus on ICP definition, value proposition, lead funnel leak diagnosis, CAC reduction, and positioning."
        ],
        'cpo' => [
            'key' => 'cpo',
            'name' => 'Chief Product Officer (CPO)',
            'position' => 'Product Roadmap, Feature RICE & PLG',
            'voice' => 'verse',
            'prompt' => "You are the Chief Product Officer (CPO) — a specialist in product vision, roadmap prioritization, customer discovery, and product-market fit. Focus on RICE scoring, Kano Model, PLG, and eliminating feature creep."
        ],
        'board_comms' => [
            'key' => 'board_comms',
            'name' => 'Board Communications Director',
            'position' => 'Investor Relations, Board Decks & Governance',
            'voice' => 'ballad',
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

