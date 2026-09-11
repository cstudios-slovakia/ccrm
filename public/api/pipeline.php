<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

// This file exposes a PUBLIC lead-capture webhook (POST, authenticated by the
// X-API-KEY header) that is intentionally reachable cross-origin from external
// website forms — hence the wildcard CORS below. The key-management actions
// (get_key / reset_key) are admin-only and gated by the session further down.
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-KEY');

// Handle OPTIONS request for CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$apiKeyFile = dirname(__DIR__) . '/api_key.txt';
$configFile = dirname(__DIR__) . '/config.php';

// Check if installation exists
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['status' => 'error', 'message' => 'CCRM is not installed yet.']);
    exit;
}

require_once $configFile;

try {
    $pdo = get_db_connection();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

// Helper to get or generate the API key
function getOrGenerateKey($file) {
    if (file_exists($file)) {
        $key = trim(file_get_contents($file));
        if (!empty($key)) {
            return $key;
        }
    }
    // Generate a secure key
    $key = 'sk_live_' . bin2hex(random_bytes(12));
    file_put_contents($file, $key);
    return $key;
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. GET KEY Action (admin only — reveals the integration secret)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get_key') {
    ccrm_require_admin();
    $key = getOrGenerateKey($apiKeyFile);
    echo json_encode(['status' => 'success', 'api_key' => $key]);
    exit;
}

// 2. RESET KEY Action (admin only)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'reset_key') {
    $admin = ccrm_require_admin();
    $key = 'sk_live_' . bin2hex(random_bytes(12));
    file_put_contents($apiKeyFile, $key);
    ccrm_audit_log($pdo, $admin, 'api_key.reset', 'Public lead-intake API key rotated');
    echo json_encode(['status' => 'success', 'api_key' => $key]);
    exit;
}

// Helper to get settings from database
function get_db_setting($pdo, $key, $default) {
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
    $stmt->execute([$key]);
    $val = $stmt->fetchColumn();
    if ($val === false) {
        return $default;
    }
    $decoded = json_decode($val, true);
    return $decoded !== null ? $decoded : $val;
}

/**
 * Lowercase and strip Slovak/Hungarian diacritics, so "Spoločnosť" and
 * "SPOLOCNOST" are the same label to the reader below.
 */
function ccrm_pipeline_fold($s) {
    $s = mb_strtolower(trim((string)$s), 'UTF-8');
    return strtr($s, [
        'á' => 'a', 'ä' => 'a', 'č' => 'c', 'ď' => 'd', 'é' => 'e', 'ě' => 'e',
        'í' => 'i', 'ĺ' => 'l', 'ľ' => 'l', 'ň' => 'n', 'ó' => 'o', 'ô' => 'o',
        'ö' => 'o', 'ő' => 'o', 'ŕ' => 'r', 'ř' => 'r', 'š' => 's', 'ť' => 't',
        'ú' => 'u', 'ů' => 'u', 'ü' => 'u', 'ű' => 'u', 'ý' => 'y', 'ž' => 'z',
    ]);
}

/**
 * Pull a "Label: value" line out of a free-text form message.
 *
 * Most website contact forms post the whole submission as one blob in
 * `message` and send only name/e-mail/phone as real fields:
 *
 *     Meno: Peter Puhovich
 *     Firma: Pstudios
 *     Project Budget: 3500€-5000€
 *
 * Everything after the first colon is the value. With $contains the label only
 * has to *hold* the word, which is what catches "Project Budget" and
 * "Web Budget" as well as a bare "Budget". Returns '' when nothing matches.
 */
function ccrm_pipeline_labelled_value($message, array $labels, $contains = false) {
    foreach (preg_split('/\r\n|\r|\n/', (string)$message) as $line) {
        $line = trim(preg_replace('/^[\s\-\*•·]+/u', '', $line));
        $pos = mb_strpos($line, ':', 0, 'UTF-8');
        if ($pos === false || $pos === 0) {
            continue;
        }
        $label = ccrm_pipeline_fold(mb_substr($line, 0, $pos, 'UTF-8'));
        $value = trim(mb_substr($line, $pos + 1, null, 'UTF-8'));
        if ($value === '') {
            continue;
        }
        foreach ($labels as $candidate) {
            $candidate = ccrm_pipeline_fold($candidate);
            if ($contains ? mb_strpos($label, $candidate) !== false : $label === $candidate) {
                return $value;
            }
        }
    }
    return '';
}

/**
 * Read a money amount the way a web form actually sends one.
 *
 * A JSON number arrives as a number, but a form field arrives as whatever the
 * visitor picked or the form builder formatted: "4500", "4 500 EUR",
 * "3500€-5000€", "8000€+", "4.500,00", "1,234.56". floatval() alone turns
 * "4 500" into 4. So take the first amount in the string — the lower bound of a
 * range, which is the number the pipeline can count on — then decide which
 * separator is the decimal one: where both appear the last one wins, and a lone
 * separator followed by exactly three digits is a thousands group
 * ("4.500" = 4500, "4,50" = 4.5).
 */
function ccrm_pipeline_parse_money($raw) {
    if (is_int($raw) || is_float($raw)) {
        return (float)$raw;
    }
    if (!preg_match('/-?\d[\d\s.,]*/u', (string)$raw, $m)) {
        return 0.00;
    }
    $s = preg_replace('/\s+/u', '', $m[0]);
    $lastComma = strrpos($s, ',');
    $lastDot = strrpos($s, '.');
    if ($lastComma !== false && $lastDot !== false) {
        $decimal = $lastComma > $lastDot ? ',' : '.';
        $group = $decimal === ',' ? '.' : ',';
        $s = str_replace($group, '', $s);
        $s = str_replace($decimal, '.', $s);
    } elseif ($lastComma !== false || $lastDot !== false) {
        $sep = $lastComma !== false ? ',' : '.';
        $pos = $lastComma !== false ? $lastComma : $lastDot;
        $tail = substr($s, $pos + 1);
        if (strlen($tail) === 3 && ctype_digit($tail)) {
            $s = str_replace($sep, '', $s);   // thousands group
        } else {
            $s = str_replace($sep, '.', $s);  // decimal separator
        }
    }
    return (float)$s;
}

/**
 * The first non-empty string a submission sent under any of `$keys`, trimmed
 * and cut to `$maxLength` characters. Null when none of them carried one.
 */
function ccrm_pipeline_text($payload, array $keys, $maxLength) {
    foreach ($keys as $key) {
        if (!isset($payload[$key]) || !is_scalar($payload[$key])) {
            continue;
        }
        $value = trim((string)$payload[$key]);
        if ($value !== '') {
            return mb_substr($value, 0, $maxLength, 'UTF-8');
        }
    }
    return null;
}

/**
 * Read the list ids a submission names, from either the plural or the singular
 * field, in the order the form sent them and without repeats.
 *
 * A form whose interest question is a set of checkboxes has more than one answer
 * to send, so it posts `category_ids` — a JSON array, or the comma-separated
 * string a form builder produces when it flattens one into a single field. A
 * single-choice form posts `category_id`. Up to 1.9.25 only the singular was
 * read, so a visitor who ticked three interests was filed under one of them and
 * the other two were dropped on the floor — including the projects they would
 * have opened (see ccrm_auto_create_project_for_lead).
 *
 * Both fields are accepted together: the plural is the answer set, the singular
 * a form's primary choice, and a caller sending both means all of them.
 */
function ccrm_pipeline_list_ids($payload, $pluralKey, $singularKey) {
    $raw = [];
    foreach ([$pluralKey, $singularKey] as $key) {
        if (!isset($payload[$key])) {
            continue;
        }
        $value = $payload[$key];
        if (is_array($value)) {
            foreach ($value as $item) {
                $raw[] = $item;
            }
        } elseif (is_string($value)) {
            foreach (preg_split('/[\s,;|]+/', $value) as $item) {
                $raw[] = $item;
            }
        } else {
            $raw[] = $value;
        }
    }

    $ids = [];
    foreach ($raw as $item) {
        if (is_array($item) || is_object($item) || is_bool($item) || $item === null) {
            continue;
        }
        $id = intval(is_string($item) ? trim($item) : $item);
        if ($id > 0 && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }
    return $ids;
}

// Labels the message fallback understands, in EN / SK / HU.
const CCRM_PIPELINE_COMPANY_LABELS = ['company', 'company name', 'firma', 'nazov firmy', 'spolocnost', 'organizacia', 'organization', 'ceg', 'cegnev'];
const CCRM_PIPELINE_BUDGET_LABELS = ['budget', 'rozpocet', 'koltsegvetes'];

// 3. PUBLIC API: CREATE LEAD (POST /api/pipeline.php)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Check API Key
    $providedKey = '';
    if (isset($_SERVER['HTTP_X_API_KEY'])) {
        $providedKey = trim($_SERVER['HTTP_X_API_KEY']);
    } else {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        if (isset($headers['X-API-KEY'])) {
            $providedKey = trim($headers['X-API-KEY']);
        } elseif (isset($headers['x-api-key'])) {
            $providedKey = trim($headers['x-api-key']);
        }
    }

    $actualKey = getOrGenerateKey($apiKeyFile);

    if (empty($providedKey) || empty($actualKey) || !hash_equals((string)$actualKey, (string)$providedKey)) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized: Invalid or missing X-API-KEY header']);
        exit;
    }

    // Read payload
    $input = file_get_contents('php://input');
    if (!$input) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Empty request body']);
        exit;
    }

    $payload = json_decode($input, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Malformed JSON payload']);
        exit;
    }

    // Required fields: company_name or contact_name
    $contactName = isset($payload['contact_name']) ? trim($payload['contact_name']) : '';
    $companyName = isset($payload['company_name']) ? trim($payload['company_name']) : '';

    // A form that posts its whole submission as one text blob still carries the
    // company and the budget — as labelled lines inside `message`, because that
    // is all the website side bothered to map. Read them back rather than lose
    // them; a real `company_name` / `value` field always wins over the blob.
    $formMessage = isset($payload['message']) ? trim((string)$payload['message']) : '';
    if ($companyName === '' && $formMessage !== '') {
        $companyName = trim(ccrm_pipeline_labelled_value($formMessage, CCRM_PIPELINE_COMPANY_LABELS));
    }

    if (empty($contactName) && empty($companyName)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing required field: contact_name or company_name is required']);
        exit;
    }

    // Idempotency: if the caller supplies a key (Idempotency-Key header or
    // idempotency_key/event_id field), the same submission is processed once.
    // Retries then return the original result instead of creating duplicate
    // leads / timeline events. Table is provisioned here, OUTSIDE any
    // transaction, since DDL implicitly commits in MySQL.
    $idempotencyKey = '';
    if (isset($_SERVER['HTTP_IDEMPOTENCY_KEY'])) {
        $idempotencyKey = trim($_SERVER['HTTP_IDEMPOTENCY_KEY']);
    } elseif (isset($payload['idempotency_key'])) {
        $idempotencyKey = trim((string)$payload['idempotency_key']);
    } elseif (isset($payload['event_id'])) {
        $idempotencyKey = trim((string)$payload['event_id']);
    }
    if ($idempotencyKey !== '') {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `webhook_events` (
                `event_key` VARCHAR(191) NOT NULL PRIMARY KEY,
                `lead_id` VARCHAR(50) NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
            $seen = $pdo->prepare("SELECT `lead_id` FROM `webhook_events` WHERE `event_key` = ?");
            $seen->execute([$idempotencyKey]);
            $prior = $seen->fetch(PDO::FETCH_ASSOC);
            if ($prior) {
                echo json_encode(['status' => 'success', 'deduplicated' => true, 'lead_id' => $prior['lead_id']]);
                exit;
            }
        } catch (\Throwable $e) {
            // fail open — never drop a real lead because of a dedup-store error
            $idempotencyKey = '';
        }
    }

    // Fetch lists from database for matching
    $defaultLists = ccrm_default_lists(get_db_setting($pdo, 'SYSTEM_LANGUAGE', 'sk'));
    $leadStates = get_db_setting($pdo, 'LEAD_STATES', $defaultLists['leadStates']);
    $leadSources = get_db_setting($pdo, 'LEAD_SOURCES', $defaultLists['leadSources']);
    $leadCategories = get_db_setting($pdo, 'LEAD_CATEGORIES', $defaultLists['leadCategories']);

    // Determine status (first state)
    $status = 'new';
    if (!empty($leadStates)) {
        $status = $leadStates[0];
    }

    // `source_id` and `category_id` are the permanent ids the CRM shows beside
    // each entry in Settings, NOT positions in the lists above. A form written
    // against this endpoint outlives any number of reorderings in the CRM, so
    // resolving by position (which is what this did up to 1.9.19) meant that
    // dragging one category a row up quietly re-filed every submission that
    // named it. See ccrm_normalize_list_ids in api/schema.php.
    $leadSourceIds = get_db_setting($pdo, 'LEAD_SOURCE_IDS', []);
    $leadCategoryIds = get_db_setting($pdo, 'LEAD_CATEGORY_IDS', []);

    // Determine source. A lead has exactly one, so the first id that resolves
    // wins even when a form sends several.
    $source = 'website';
    foreach (ccrm_pipeline_list_ids($payload, 'source_ids', 'source_id') as $sourceId) {
        $matchedSource = ccrm_resolve_list_id($sourceId, $leadSources, $leadSourceIds);
        if ($matchedSource !== null) {
            $source = $matchedSource;
            break;
        }
    }

    // Determine categories — a lead can hold as many interests as the visitor
    // ticked, so every id that resolves is kept, in the order it was sent.
    $categories = [];
    foreach (ccrm_pipeline_list_ids($payload, 'category_ids', 'category_id') as $categoryId) {
        $matchedCategory = ccrm_resolve_list_id($categoryId, $leadCategories, $leadCategoryIds);
        if ($matchedCategory !== null && !in_array($matchedCategory, $categories, true)) {
            $categories[] = $matchedCategory;
        }
    }

    // Create the new lead ID
    $newLeadId = 'lead-' . uniqid();
    // `leads`.`name` is the client as the CRM lists it - the company for a
    // business, the person for a private client - and `contact_person` is the
    // human to talk to there. A submission carrying both used to be filed under
    // the person's name with the company dropped on the floor. The split below
    // is the one the app's own "new client" form makes (ClientsView).
    $name = $companyName !== '' ? $companyName : $contactName;
    $contactPerson = ($companyName !== '' && $contactName !== '') ? $contactName : null;
    // No city on the form means no city. It used to fall back to the country and
    // then to a hardcoded "Bratislava", so every form without a city field
    // produced leads claiming to be somewhere the client had never said.
    $city = isset($payload['city']) ? trim($payload['city']) : "";
    $clientType = $companyName !== '' ? "business" : "person";
    // The lead's worth - the client's budget for the job. `budget` is accepted
    // as an alias because that is what the field is usually labelled on the form,
    // and a "Budget:" line in the message is the last resort.
    $valueRaw = $payload['value'] ?? ($payload['budget'] ?? null);
    $value = $valueRaw !== null ? ccrm_pipeline_parse_money($valueRaw) : 0.00;
    if ($value <= 0 && $formMessage !== '') {
        $value = ccrm_pipeline_parse_money(
            ccrm_pipeline_labelled_value($formMessage, CCRM_PIPELINE_BUDGET_LABELS, true)
        );
    }
    // What the client is asking for. The message is the one free-text field a
    // contact form always has, and `interest_note` is where the app shows it on
    // the lead ("Client interest / problem to solve"); it still goes to the
    // timeline as well.
    $interestNote = $formMessage;
    $phone = isset($payload['phone']) ? trim($payload['phone']) : "";
    $email = isset($payload['email']) ? trim($payload['email']) : "";
    $country = isset($payload['country']) ? trim($payload['country']) : "Slovakia";
    // Where the visitor came from before the form: the channel the website
    // remembered on their first page view (facebook, instagram, google,
    // direct, ...) and a free-text detail (medium, campaign, referrer,
    // landing page). Not the same thing as `source_id`, which says which
    // form/site the lead came through. Free text on purpose: it is not a
    // list the operator maintains, so nothing is resolved or validated
    // beyond length and case. `origin` / `origin_detail` are accepted as
    // shorter spellings.
    $trafficOrigin = ccrm_pipeline_text($payload, ['traffic_origin', 'origin'], 50);
    $trafficOrigin = $trafficOrigin !== null ? mb_strtolower($trafficOrigin, 'UTF-8') : null;
    $trafficOriginDetail = $trafficOrigin !== null
        ? ccrm_pipeline_text($payload, ['traffic_origin_detail', 'origin_detail'], 255)
        : null;
    $created_at = date('Y-m-d H:i:s');
    
    // Check if there is an active lead (not closed) for this client
    $existingLead = null;
    $leadStageGroups = get_db_setting($pdo, 'LEAD_STAGE_GROUPS', [
        "new" => "new",
        "contacted" => "in_progress",
        "offer sent" => "in_progress",
        "accepted" => "closed",
        "rejected" => "closed"
    ]);

    $potentialLeads = [];
    if (!empty($email) || !empty($phone)) {
        $stmt = $pdo->prepare("SELECT * FROM `leads` WHERE (email = ? AND email != '') OR (phone = ? AND phone != '') ORDER BY `created_at` DESC");
        $stmt->execute([$email, $phone]);
        $potentialLeads = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM `leads` WHERE name = ? ORDER BY `created_at` DESC");
        $stmt->execute([$name]);
        $potentialLeads = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    foreach ($potentialLeads as $pl) {
        $leadStatus = $pl['status'];
        $group = isset($leadStageGroups[$leadStatus]) ? $leadStageGroups[$leadStatus] : 'new';
        if ($group !== 'closed') {
            $existingLead = $pl;
            break;
        }
    }

    if ($existingLead !== null) {
        $existingLeadId = $existingLead['id'];
        try {
            $pdo->beginTransaction();

            // 1. Update contact fields on the existing lead if they were empty
            $updateFields = [];
            $updateParams = [];
            if (empty($existingLead['email']) && !empty($email)) {
                $updateFields[] = "`email` = ?";
                $updateParams[] = $email;
            }
            if (empty($existingLead['phone']) && !empty($phone)) {
                $updateFields[] = "`phone` = ?";
                $updateParams[] = $phone;
            }
            if (empty($existingLead['city']) && !empty($city)) {
                $updateFields[] = "`city` = ?";
                $updateParams[] = $city;
            }
            if (empty($existingLead['contact_person']) && $contactPerson !== null) {
                $updateFields[] = "`contact_person` = ?";
                $updateParams[] = $contactPerson;
            }
            // A budget quoted on the follow-up submission is worth keeping when
            // nobody has put a number on the lead yet - same rule as the contact
            // fields above: fill what is empty, never overwrite what a person set.
            if ((float)($existingLead['value'] ?? 0) === 0.0 && $value > 0) {
                $updateFields[] = "`value` = ?";
                $updateParams[] = $value;
            }
            if (empty($existingLead['interest_note']) && $interestNote !== '') {
                $updateFields[] = "`interest_note` = ?";
                $updateParams[] = $interestNote;
            }
            // First touch wins: the lead keeps the channel that brought the
            // visitor the first time. A later inquiry's origin still goes to
            // the timeline note below, so nothing is lost.
            if (empty($existingLead['traffic_origin']) && $trafficOrigin !== null) {
                $updateFields[] = "`traffic_origin` = ?";
                $updateParams[] = $trafficOrigin;
                $updateFields[] = "`traffic_origin_detail` = ?";
                $updateParams[] = $trafficOriginDetail;
            }
            if (!empty($updateFields)) {
                $updateParams[] = $existingLeadId;
                $updStmt = $pdo->prepare("UPDATE `leads` SET " . implode(', ', $updateFields) . " WHERE `id` = ?");
                $updStmt->execute($updateParams);
            }

            // 2. Add categories if not already associated
            if (!empty($categories)) {
                $catStmt = $pdo->prepare("SELECT `category_name` FROM `lead_categories` WHERE `lead_id` = ?");
                $catStmt->execute([$existingLeadId]);
                $existingCats = $catStmt->fetchAll(PDO::FETCH_COLUMN);

                $insCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
                foreach ($categories as $catName) {
                    if (!in_array($catName, $existingCats)) {
                        $insCat->execute([$existingLeadId, $catName]);
                    }
                }
            }

            // 3. Insert timeline event note representing the new form submission
            $messageLines = [];
            $messageLines[] = "Form submission received from source: " . $source;
            if ($trafficOrigin !== null) {
                $messageLines[] = "Origin: " . $trafficOrigin . ($trafficOriginDetail !== null ? " (" . $trafficOriginDetail . ")" : "");
            }
            $messageLines[] = "Name: " . $name;
            if ($contactPerson !== null) $messageLines[] = "Contact person: " . $contactPerson;
            if (!empty($email)) $messageLines[] = "Email: " . $email;
            if (!empty($phone)) $messageLines[] = "Phone: " . $phone;
            if (!empty($city)) $messageLines[] = "City: " . $city;
            if (!empty($categories)) $messageLines[] = "Categories: " . implode(', ', $categories);
            if ($value > 0) $messageLines[] = "Value: " . number_format($value, 2, '.', '') . " EUR";
            
            $formMsg = $formMessage;
            if (!empty($formMsg)) {
                $messageLines[] = "Message: " . $formMsg;
            } else {
                $messageLines[] = "Message: Form submitted (no message content).";
            }
            
            $teContent = implode("\n", $messageLines);
            $teId = 'ev-' . uniqid();
            $insTe = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`) VALUES (?, ?, 'note', ?, 'Form Inquiry (Existing Active Lead)', ?)");
            $insTe->execute([
                $teId,
                $existingLeadId,
                date('Y-m-d H:i:s'),
                $teContent
            ]);

            $pdo->commit();

            if ($idempotencyKey !== '') {
                try {
                    $pdo->prepare("INSERT IGNORE INTO `webhook_events` (`event_key`, `lead_id`) VALUES (?, ?)")
                        ->execute([$idempotencyKey, $existingLeadId]);
                } catch (\Throwable $e) { /* best effort */ }
            }

            echo json_encode([
                'status' => 'success',
                'message' => 'Lead inquiry appended to existing active lead',
                'lead_id' => $existingLeadId,
                'data' => [
                    'name' => $existingLead['name'],
                    'status' => $existingLead['status'],
                    'source' => $existingLead['source'],
                    'appended_categories' => $categories
                ]
            ]);
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[ccrm pipeline] write failed: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Database write failed.']);
        }
        exit;
    }

    try {
        $pdo->beginTransaction();

        // Next project manager in the configured rotation (Settings → Users);
        // falls back to the primary user when auto-assignment is off. Never a
        // hardcoded demo name. Held in a variable because an auto-created
        // project below is put in the same person's hands.
        $leadOwner = ccrm_auto_assign_owner($pdo) ?: ccrm_default_owner($pdo);

        // 1. Insert into leads
        $insLead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `traffic_origin`, `traffic_origin_detail`, `owner`, `value`, `rating`, `phone`, `email`, `contact_person`, `country`, `interest_note`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $insLead->execute([
            $newLeadId,
            $name,
            $city,
            $clientType,
            $status,
            $source,
            $trafficOrigin,
            $trafficOriginDetail,
            $leadOwner,
            $value,
            3,      // Default rating
            $phone,
            $email,
            $contactPerson,
            $country,
            $interestNote !== '' ? $interestNote : null,
            $created_at
        ]);

        // 2. Insert into lead_categories
        if (!empty($categories)) {
            $insCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
            foreach ($categories as $catName) {
                $insCat->execute([$newLeadId, $catName]);
            }
        }

        // 3. Insert timeline event
        $teId = 'ev-' . uniqid();
        $teContent = $formMessage !== '' ? $formMessage : "Lead received from external integration.";
        $insTe = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`) VALUES (?, ?, 'note', ?, 'Lead Created via Public API', ?)");
        $insTe->execute([
            $teId,
            $newLeadId,
            date('Y-m-d H:i:s'),
            $teContent
        ]);

        // 4. Pair the lead with its projects, when the operator asked for any
        //    (Projects → Settings → automatic project creation). A web-form
        //    lead is exactly the case the setting exists for, and the interests
        //    it ticked are what decide which types it gets.
        $autoProjects = ccrm_auto_create_project_for_lead($pdo, $newLeadId, $leadOwner, $categories);

        $pdo->commit();

        if ($idempotencyKey !== '') {
            try {
                $pdo->prepare("INSERT IGNORE INTO `webhook_events` (`event_key`, `lead_id`) VALUES (?, ?)")
                    ->execute([$idempotencyKey, $newLeadId]);
            } catch (\Throwable $e) { /* best effort */ }
        }

        echo json_encode([
            'status' => 'success',
            'message' => 'Lead created successfully',
            'lead_id' => $newLeadId,
            'data' => [
                'name' => $name,
                'status' => $status,
                'source' => $source,
                'categories' => $categories,
                // The first project stays under the key integrations already
                // read; `project_ids` carries the rest, one per matched
                // interest category.
                'project_id' => $autoProjects[0]['id'] ?? null,
                'project_ids' => array_column($autoProjects, 'id')
            ]
        ]);
    } catch (\Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[ccrm pipeline] write failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Database write failed.']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
exit;
