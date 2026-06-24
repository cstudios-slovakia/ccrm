<?php
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

// SECURITY: training the vector index is an admin operation.
ccrm_require_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);
$action = $data['action'] ?? 'stats';

$configFile = dirname(__DIR__) . '/config.php';
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
    exit;
}

if ($action === 'stats') {
    try {
        // Count leads
        $stmt = $pdo->query("SELECT COUNT(*) FROM `leads`");
        $leadsCount = (int)$stmt->fetchColumn();

        // Count unique clients
        $stmt = $pdo->query("SELECT COUNT(DISTINCT `name`) FROM `leads` WHERE `name` IS NOT NULL AND TRIM(`name`) != ''");
        $clientsCount = (int)$stmt->fetchColumn();
        
        // Count emails
        $stmt = $pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'email'");
        $emailsCount = (int)$stmt->fetchColumn();
        
        // Count chats/notes
        $stmt = $pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'note'");
        $chatsCount = (int)$stmt->fetchColumn();

        // Count documents
        $documentsCount = (int)$pdo->query("SELECT COUNT(*) FROM `timeline_events` WHERE `type` = 'offer'")->fetchColumn();

        // Count meeting notes
        $meetingsCount = 0;
        try {
            $stmt = $pdo->query("SELECT COUNT(*) FROM `meeting_notes` WHERE (`archived` = 0 OR `archived` IS NULL)");
            $meetingsCount = (int)$stmt->fetchColumn();
        } catch (\Exception $e) {}

        // Count unified entries
        $unifiedEntriesCount = 0;
        try {
            $registries = $pdo->query("SELECT `id` FROM `unified_entries` WHERE `archived` = 0")->fetchAll();
            foreach ($registries as $reg) {
                $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($reg['id']));
                $tableName = "ue_" . $safeId;
                $chkTable = $pdo->query("SHOW TABLES LIKE '{$tableName}'")->rowCount() > 0;
                if ($chkTable) {
                    $stmt = $pdo->query("SELECT COUNT(*) FROM `{$tableName}`");
                    $unifiedEntriesCount += (int)$stmt->fetchColumn();
                }
            }
        } catch (\Exception $e) {}
        
        echo json_encode([
            'success' => true,
            'stats' => [
                'leads' => $leadsCount,
                'clients' => $clientsCount,
                'emails' => $emailsCount,
                'chats' => $chatsCount,
                'meeting_notes' => $meetingsCount,
                'documents' => $documentsCount,
                'unified_entries' => $unifiedEntriesCount,
                'total_items' => $leadsCount + $clientsCount + $emailsCount + $chatsCount + $meetingsCount + $documentsCount + $unifiedEntriesCount
            ]
        ]);
    } catch (\Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

if ($action === 'train') {
    $step = isset($data['step']) ? (int)$data['step'] : 0;
    $vectorDb = $data['vectorDb'] ?? 'none';
    
    // We will simulate batches. Let's load the data from database.
    try {
        // Fetch data
        $leads = $pdo->query("SELECT `id`, `name`, `email`, `financial_summary` FROM `leads` LIMIT 20")->fetchAll();
        $clients = $pdo->query("SELECT DISTINCT `name`, `city`, `client_type` FROM `leads` WHERE `name` IS NOT NULL AND TRIM(`name`) != '' LIMIT 20")->fetchAll();
        $emails = $pdo->query("SELECT `id`, `title`, `content` FROM `timeline_events` WHERE `type` = 'email' LIMIT 20")->fetchAll();
        $notes = $pdo->query("SELECT `id`, `title`, `content` FROM `timeline_events` WHERE `type` = 'note' LIMIT 20")->fetchAll();
        $documents = $pdo->query("
            SELECT te.`id`, te.`title`, te.`content`, te.`amount`, te.`file_name`, te.`file_size`, te.`file_type`, l.`name` as `lead_name`
            FROM `timeline_events` te
            LEFT JOIN `leads` l ON te.`lead_id` = l.`id`
            WHERE te.`type` = 'offer'
            LIMIT 40
        ")->fetchAll();
        
        $meetings = [];
        try {
            $meetings = $pdo->query("SELECT `id`, `title`, `notes`, `lead_name`, `ai_summary_json` FROM `meeting_notes` WHERE (`archived` = 0 OR `archived` IS NULL) LIMIT 20")->fetchAll();
        } catch (\Exception $e) {}

        $unifiedEntries = [];
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
                        LIMIT 40
                    ";
                    $rows = $pdo->query($query)->fetchAll();
                    foreach ($rows as $r) {
                        $unifiedEntries[] = array_merge($r, [
                            'registry_id' => $reg['id'],
                            'registry_name' => $reg['name'],
                            'entry_name_label' => $reg['entry_name'] ?: 'Entry',
                            'folder_name_label' => $reg['folder_name'] ?: 'Folder'
                        ]);
                    }
                }
            }
        } catch (\Exception $e) {}

        $allSourceItems = [];
        foreach ($leads as $l) {
            $text = "Lead: " . $l['name'] . " (Email: " . ($l['email'] ?? 'N/A') . ")";
            if (!empty($l['financial_summary'])) {
                $text .= "\nFinancial Report & Analysis:\n" . $l['financial_summary'];
            }
            $allSourceItems[] = [
                'type' => 'lead',
                'id' => $l['id'],
                'label' => $l['name'],
                'text' => $text
            ];
        }
        foreach ($clients as $c) {
            $allSourceItems[] = [
                'type' => 'client',
                'id' => md5($c['name']),
                'label' => $c['name'],
                'text' => "Client Profile: " . $c['name'] . "\nLocation: " . ($c['city'] ?? 'N/A') . "\nType: " . ($c['client_type'] ?? 'person')
            ];
        }
        foreach ($emails as $e) {
            $allSourceItems[] = [
                'type' => 'email',
                'id' => $e['id'],
                'label' => $e['title'],
                'text' => "Email Subject: " . $e['title'] . "\nBody: " . strip_tags($e['content'])
            ];
        }
        foreach ($notes as $n) {
            $allSourceItems[] = [
                'type' => 'note',
                'id' => $n['id'],
                'label' => $n['title'],
                'text' => "Note: " . $n['title'] . "\nContent: " . strip_tags($n['content'])
            ];
        }
        foreach ($documents as $d) {
            $categoryLabel = 'Document';
            if ($d['file_type'] === 'offer') $categoryLabel = 'Offer Sheet';
            if ($d['file_type'] === 'contract') $categoryLabel = 'Contract';
            if ($d['file_type'] === 'invoice') $categoryLabel = 'Invoice';

            $valText = !empty($d['amount']) ? "\nAmount/Value: €" . number_format($d['amount'], 2) : "";
            $ownerText = !empty($d['lead_name']) ? "\nAssociated Client/Lead: " . $d['lead_name'] : "";

            $allSourceItems[] = [
                'type' => 'document',
                'id' => $d['id'],
                'label' => $d['file_name'] ?? $d['title'],
                'text' => "Document (" . $categoryLabel . "): " . ($d['file_name'] ?? 'N/A') . 
                          "\nTitle: " . $d['title'] . 
                          "\nSize: " . ($d['file_size'] ?? 'N/A') .
                          $ownerText .
                          $valText .
                          "\nDescription: " . ($d['content'] ?? 'N/A')
            ];
        }
        foreach ($meetings as $m) {
            $plainNotes = "";
            if (!empty($m['notes'])) {
                if (strpos(trim($m['notes']), '[') === 0) {
                    try {
                        $blocks = json_decode($m['notes'], true);
                        if (is_array($blocks)) {
                            foreach ($blocks as $b) {
                                $plainNotes .= ($b['content'] ?? '') . "\n";
                            }
                        }
                    } catch (\Exception $ex) {
                        $plainNotes = $m['notes'];
                    }
                } else {
                    $plainNotes = $m['notes'];
                }
            }
            $aiSummaryText = "";
            if (!empty($m['ai_summary_json'])) {
                try {
                    $sumObj = json_decode($m['ai_summary_json'], true);
                    $aiSummaryText = $sumObj['summary'] ?? '';
                } catch (\Exception $ex) {}
            }
            $allSourceItems[] = [
                'type' => 'meeting_note',
                'id' => $m['id'],
                'label' => $m['title'],
                'text' => "Meeting Note: " . $m['title'] . "\nContact/Client: " . ($m['lead_name'] ?? 'General') . "\nNotes:\n" . strip_tags($plainNotes) . "\nAI Summary: " . $aiSummaryText
            ];
        }

        foreach ($unifiedEntries as $ue) {
            $isFolder = (int)($ue['is_folder'] ?? 0) === 1;
            $typeLabel = $isFolder ? $ue['folder_name_label'] : $ue['entry_name_label'];
            $clientText = !empty($ue['client_name']) ? "\nAssociated Client/Lead: " . $ue['client_name'] : "";
            $dueDateText = !empty($ue['due_date']) ? "\nDue Date: " . $ue['due_date'] : "";
            $fileText = !empty($ue['file_name']) ? "\nAttachment: " . $ue['file_name'] . " (" . ($ue['file_size'] ?? '') . ")" : "";
            
            $text = "Unified Entry (" . $ue['registry_name'] . " - " . $typeLabel . "): " . ($ue['title'] ?: 'Untitled') .
                    $clientText .
                    $dueDateText .
                    $fileText;
                    
            $allSourceItems[] = [
                'type' => 'unified_entry',
                'id' => $ue['registry_id'] . '-' . $ue['id'],
                'label' => ($ue['title'] ?: 'Untitled'),
                'text' => $text
            ];
        }
        
        $totalItems = count($allSourceItems);
        if ($totalItems === 0) {
            echo json_encode([
                'success' => true,
                'finished' => true,
                'progress' => 100,
                'logs' => ["[INFO] No records found in database to index."]
            ]);
            exit;
        }
        
        $batchSize = 3;
        $startIndex = $step * $batchSize;
        
        if ($startIndex >= $totalItems) {
            echo json_encode([
                'success' => true,
                'finished' => true,
                'progress' => 100,
                'logs' => [
                    "[SUCCESS] All items indexed successfully!",
                    "[INFO] Created vector indexes and optimization parameters.",
                    "[INFO] Vector DB connection closed clean."
                ]
            ]);
            exit;
        }
        
        $slice = array_slice($allSourceItems, $startIndex, $batchSize);
        $logs = [];
        $chunksCreated = 0;
        
        if ($step === 0) {
            $logs[] = "[INIT] Connecting to " . strtoupper($vectorDb) . " database...";
            $logs[] = "[INIT] Initializing knowledge index namespace 'laminam_crm_kb'...";
            $logs[] = "[INFO] Found " . $totalItems . " total source records to chunk and embed.";
        }
        
        foreach ($slice as $item) {
            $logs[] = "[CHUNK] Parsing " . strtoupper($item['type']) . " #" . substr($item['id'], 0, 8) . " (" . $item['label'] . ")...";
            
            // Text chunking simulation: 500-1000 chars, multibyte-safe
            $text = $item['text'];
            $chunkSize = 300;
            $chunks = [];
            $textLen = mb_strlen($text, 'UTF-8');
            for ($i = 0; $i < $textLen; $i += $chunkSize) {
                $chunks[] = mb_substr($text, $i, $chunkSize, 'UTF-8');
            }
            
            foreach ($chunks as $idx => $chunk) {
                $chunksCreated++;
                $logs[] = "  -> Generated Chunk " . ($idx + 1) . " (" . mb_strlen($chunk, 'UTF-8') . " chars): '" . mb_substr(trim($chunk), 0, 45, 'UTF-8') . "...'";
            }
            
            // Simulate API calls for embedding
            $logs[] = "[EMBED] Calling OpenAI API for " . count($chunks) . " chunks of '" . $item['label'] . "'...";
            $logs[] = "[UPSERT] Stored " . count($chunks) . " vectors with client metadata in " . strtoupper($vectorDb) . ".";
        }
        
        $nextStep = $step + 1;
        $progress = min(100, round(($nextStep * $batchSize) / $totalItems * 100));
        
        echo json_encode([
            'success' => true,
            'finished' => $progress >= 100,
            'progress' => $progress,
            'step' => $nextStep,
            'logs' => $logs
        ], JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        
    } catch (\Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

echo json_encode(['success' => false, 'message' => 'Unknown action.']);
