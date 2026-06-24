<?php
/**
 * Universal fuzzy search API for CCRM.
 * Fetches data and performs case-insensitive, diacritic-insensitive fuzzy matching in PHP.
 */

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
        exit;
    }
    ccrm_require_auth();
}

$query = trim($_GET['query'] ?? '');
if (mb_strlen($query) < 2) {
    echo json_encode([]);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';
require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB Connection failed: ' . $e->getMessage()]);
    exit;
}

// Accent/diacritics removal helper for robust Slovak/Hungarian/Czech fuzzy matching
function remove_accents($str) {
    $unwanted_array = [
        'á'=>'a', 'ä'=>'a', 'č'=>'c', 'ď'=>'d', 'é'=>'e', 'ě'=>'e', 'í'=>'i', 'ĺ'=>'l', 'ľ'=>'l', 'ň'=>'n', 'ó'=>'o', 'ô'=>'o', 'ŕ'=>'r', 'š'=>'s', 'ť'=>'t', 'ú'=>'u', 'ů'=>'u', 'ý'=>'y', 'ž'=>'z',
        'Á'=>'A', 'Ä'=>'A', 'Č'=>'C', 'Ď'=>'D', 'É'=>'E', 'Ě'=>'E', 'Í'=>'I', 'Ĺ'=>'L', 'Ľ'=>'L', 'Ň'=>'N', 'Ó'=>'O', 'Ô'=>'O', 'Ŕ'=>'R', 'Š'=>'S', 'Ť'=>'T', 'Ú'=>'U', 'Ů'=>'U', 'Ý'=>'Y', 'Ž'=>'Z',
        'ö'=>'o', 'ü'=>'u', 'ő'=>'o', 'ű'=>'u', 'Ö'=>'O', 'Ü'=>'U', 'Ő'=>'O', 'Ű'=>'U'
    ];
    return strtr($str, $unwanted_array);
}

// Fuzzy scoring helper
function get_fuzzy_score($query, $target) {
    $q = mb_strtolower(remove_accents($query));
    $t = mb_strtolower(remove_accents($target));
    
    if (empty($q) || empty($t)) return 0;
    
    // 1. Exact match
    if ($q === $t) return 1000;
    
    // 2. Substring exact match (reward earlier starts)
    $pos = mb_strpos($t, $q);
    if ($pos !== false) {
        return 800 - $pos;
    }
    
    // 3. Token-based word search
    $qWords = preg_split('/\s+/', $q, -1, PREG_SPLIT_NO_EMPTY);
    $matchedWords = 0;
    foreach ($qWords as $word) {
        if (mb_strpos($t, $word) !== false) {
            $matchedWords++;
        }
    }
    if ($matchedWords > 0) {
        return 400 * ($matchedWords / count($qWords));
    }
    
    // 4. Character-by-character fuzzy matcher (sequence search)
    $qChars = preg_split('//u', $q, -1, PREG_SPLIT_NO_EMPTY);
    $tChars = preg_split('//u', $t, -1, PREG_SPLIT_NO_EMPTY);
    
    $tIdx = 0;
    $matches = 0;
    $consecutive = 0;
    $seqScore = 0;
    
    foreach ($qChars as $char) {
        $found = false;
        while ($tIdx < count($tChars)) {
            if ($tChars[$tIdx] === $char) {
                $matches++;
                $seqScore += 20 + ($consecutive * 10);
                $consecutive++;
                $tIdx++;
                $found = true;
                break;
            } else {
                $consecutive = 0;
            }
            $tIdx++;
        }
        if (!$found) break;
    }
    
    if ($matches === count($qChars)) {
        return $seqScore;
    }
    
    // 5. Typo tolerance (Jaro-Winkler/similar_text similarity)
    similar_text($q, $t, $percent);
    if ($percent > 45) {
        return $percent * 2;
    }
    
    return 0;
}

function get_excerpt($text, $query, $maxLen = 80) {
    if (empty($text)) return '';
    $text = str_replace(["\r", "\n", "\t"], " ", strip_tags($text));
    $text = preg_replace('/\s+/', ' ', $text);
    
    $pos = mb_stripos(remove_accents($text), remove_accents($query));
    if ($pos === false) {
        return mb_substr($text, 0, $maxLen) . (mb_strlen($text) > $maxLen ? '...' : '');
    }
    $start = max(0, $pos - 25);
    $len = mb_strlen($query) + 50;
    $excerpt = mb_substr($text, $start, $len);
    if ($start > 0) $excerpt = '...' . $excerpt;
    if ($start + $len < mb_strlen($text)) $excerpt = $excerpt . '...';
    return trim($excerpt);
}

$candidates = [];

// 1. LEADS & CLIENTS
try {
    $stmt = $pdo->query("SELECT `id`, `name`, `status`, `city`, `client_type`, `value`, `email`, `phone`, `contact_person`, `ai_summary` FROM `leads`");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $isClient = $row['status'] === 'accepted';
        $type = $isClient ? 'client' : 'lead';
        
        // Calculate max score from multiple fields
        $fieldsToMatch = [
            $row['name'],
            $row['city'] ?? '',
            $row['email'] ?? '',
            $row['contact_person'] ?? '',
            $row['phone'] ?? ''
        ];
        
        $maxScore = 0;
        foreach ($fieldsToMatch as $f) {
            $score = get_fuzzy_score($query, $f);
            if ($score > $maxScore) {
                $maxScore = $score;
            }
        }
        
        if ($maxScore >= 15) {
            $subtitle = ($row['city'] ? $row['city'] : '') . 
                        ($row['client_type'] ? ' (' . ucfirst($row['client_type']) . ')' : '') . 
                        ($row['value'] > 0 ? ' | €' . number_format($row['value'], 2) : '');
            
            $excerptText = "Status: " . ucfirst($row['status']) . 
                          ($row['email'] ? " | Email: " . $row['email'] : "") . 
                          ($row['ai_summary'] ? " | " . $row['ai_summary'] : "");
            
            $candidates[] = [
                'score' => $maxScore,
                'item' => [
                    'id' => $row['id'],
                    'type' => $type,
                    'title' => $row['name'],
                    'subtitle' => trim($subtitle, ' | '),
                    'excerpt' => get_excerpt($excerptText, $query),
                    'url' => $isClient ? '#client-' . urlencode($row['name']) : '#lead-' . $row['id']
                ]
            ];
        }
    }
} catch (\Exception $e) {}

// 2. EMAILS
try {
    $stmt = $pdo->query("
        SELECT te.`id`, te.`lead_id`, te.`title`, te.`content`, te.`timestamp`, l.`name` as `lead_name`
        FROM `timeline_events` te
        LEFT JOIN `leads` l ON te.`lead_id` = l.`id`
        WHERE te.`type` = 'email'
    ");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $fieldsToMatch = [
            $row['title'],
            $row['content'] ?? '',
            $row['lead_name'] ?? ''
        ];
        
        $maxScore = 0;
        foreach ($fieldsToMatch as $f) {
            $score = get_fuzzy_score($query, $f);
            if ($score > $maxScore) {
                $maxScore = $score;
            }
        }
        
        if ($maxScore >= 15) {
            $dateStr = date('Y-m-d H:i', strtotime($row['timestamp']));
            $candidates[] = [
                'score' => $maxScore,
                'item' => [
                    'id' => $row['id'],
                    'type' => 'email',
                    'title' => $row['title'],
                    'subtitle' => "Email to/from: " . ($row['lead_name'] ?: 'Unknown') . " (" . $dateStr . ")",
                    'excerpt' => get_excerpt($row['content'], $query),
                    'url' => '#lead-' . $row['lead_id']
                ]
            ];
        }
    }
} catch (\Exception $e) {}

// 3. MEETINGS
function get_meeting_notes_plain_text($notes) {
    if (empty($notes)) return '';
    $notes = trim($notes);
    if (strpos($notes, '[') === 0) {
        $blocks = json_decode($notes, true);
        if (is_array($blocks)) {
            $plainText = '';
            foreach ($blocks as $b) {
                if (isset($b['content'])) {
                    $plainText .= $b['content'] . ' ';
                }
            }
            return trim($plainText);
        }
    }
    return $notes;
}

try {
    $stmt = $pdo->query("
        SELECT `id`, `title`, `date`, `notes`, `lead_name`, `ai_summary_json`
        FROM `meeting_notes`
        WHERE (`archived` = 0 OR `archived` IS NULL)
    ");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $aiSummaryText = '';
        if (!empty($row['ai_summary_json'])) {
            $sumObj = json_decode($row['ai_summary_json'], true);
            $aiSummaryText = $sumObj['summary'] ?? '';
        }
        
        $plainNotes = get_meeting_notes_plain_text($row['notes'] ?? '');
        
        $fieldsToMatch = [
            $row['title'],
            $plainNotes,
            $row['lead_name'] ?? '',
            $aiSummaryText
        ];
        
        $maxScore = 0;
        foreach ($fieldsToMatch as $f) {
            $score = get_fuzzy_score($query, $f);
            if ($score > $maxScore) {
                $maxScore = $score;
            }
        }
        
        if ($maxScore >= 15) {
            $searchText = $plainNotes . " " . $aiSummaryText;
            $candidates[] = [
                'score' => $maxScore,
                'item' => [
                    'id' => $row['id'],
                    'type' => 'meeting',
                    'title' => $row['title'],
                    'subtitle' => "Meeting regarding: " . ($row['lead_name'] ?: 'General') . " (" . $row['date'] . ")",
                    'excerpt' => get_excerpt($searchText, $query),
                    'url' => '#meetings/' . $row['id']
                ]
            ];
        }
    }
} catch (\Exception $e) {}

// 4. UNIFIED ENTRIES
try {
    $registriesStmt = $pdo->query("SELECT `id`, `name`, `entry_name`, `folder_name` FROM `unified_entries` WHERE `archived` = 0");
    $registries = $registriesStmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($registries as $reg) {
        $safeId = preg_replace('/[^a-z0-9_]/', '', strtolower($reg['id']));
        $tableName = "ue_" . $safeId;
        
        $chkTable = $pdo->query("SHOW TABLES LIKE '{$tableName}'")->rowCount() > 0;
        if ($chkTable) {
            $stmt = $pdo->query("
                SELECT ue.`id`, ue.`title`, ue.`is_folder`, ue.`file_name`, l.`name` as `client_name`
                FROM `{$tableName}` ue
                LEFT JOIN `leads` l ON ue.`client_id` = l.`id`
            ");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $fieldsToMatch = [
                    $row['title'] ?? '',
                    $row['file_name'] ?? '',
                    $row['client_name'] ?? ''
                ];
                
                $maxScore = 0;
                foreach ($fieldsToMatch as $f) {
                    $score = get_fuzzy_score($query, $f);
                    if ($score > $maxScore) {
                        $maxScore = $score;
                    }
                }
                
                if ($maxScore >= 15) {
                    $isFolder = (int)$row['is_folder'] === 1;
                    $typeLabel = $isFolder ? ($reg['folder_name'] ?: 'Folder') : ($reg['entry_name'] ?: 'Entry');
                    
                    $subtitle = "Registry: " . $reg['name'] . " (" . $typeLabel . ")" . 
                                ($row['client_name'] ? " | Client: " . $row['client_name'] : "");
                                
                    $excerptText = $row['file_name'] ? "Attachment: " . $row['file_name'] : "Registry Entry details";
                    $pathSegment = $isFolder ? 'folder-' . $row['id'] : 'entry-' . $row['id'];
                    
                    $candidates[] = [
                        'score' => $maxScore,
                        'item' => [
                            'id' => $reg['id'] . '-' . $row['id'],
                            'type' => 'unified_entry',
                            'title' => $row['title'] ?: 'Untitled',
                            'subtitle' => $subtitle,
                            'excerpt' => get_excerpt($excerptText, $query),
                            'url' => '#ue_' . $reg['id'] . '/' . $pathSegment
                        ]
                    ];
                }
            }
        }
    }
} catch (\Exception $e) {}

// Sort candidates by score descending
usort($candidates, function($a, $b) {
    return $b['score'] <=> $a['score'];
});

// Limit output to top 15 results
$finalResults = [];
$limit = 15;
$count = 0;
foreach ($candidates as $c) {
    $finalResults[] = $c['item'];
    $count++;
    if ($count >= $limit) break;
}

echo json_encode($finalResults);
