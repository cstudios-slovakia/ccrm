<?php
/**
 * Vector index for the RAG assistant (MariaDB 11.8+ VECTOR + HNSW).
 *
 * What it does
 *   - collects the CRM records worth searching (leads/clients, timeline emails and notes,
 *     meeting notes, tasks, finance rows, offers/invoices, projects, unified entries,
 *     warehouse items, HR),
 *   - cuts them into chunks, embeds them with OpenAI and stores the vectors in the vector
 *     database (table `rag_chunks`),
 *   - answers a question with the chunks closest to it (cosine distance) — filtered by what
 *     the asking user may read.
 *
 * Privacy: the text SENT TO OPENAI for an embedding is masked with the same dictionary the
 * chat uses (client names, e-mails and phone numbers become placeholders). The raw text is
 * kept only in the customer's own database, like chat_history.
 *
 * Permissions: every chunk carries the permission key (`perm`, and optionally `perm2`) a
 * reader needs. A search returns a chunk only when the caller's read scope grants both, and
 * tasks are further limited to the ones the caller may see. A search can therefore never
 * surface what the app itself would not show.
 */

require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/agent_utils.php';

if (!defined('CCRM_VEC_DIM')) {
    define('CCRM_VEC_DIM', 768);                       // text-embedding-3-small, shortened: 4x smaller, near-equal quality
}
if (!defined('CCRM_VEC_MODEL')) {
    define('CCRM_VEC_MODEL', 'text-embedding-3-small');
}
if (!defined('CCRM_VEC_CHUNK_CHARS')) {
    define('CCRM_VEC_CHUNK_CHARS', 1400);
}
if (!defined('CCRM_VEC_MAX_CHUNKS_PER_ITEM')) {
    define('CCRM_VEC_MAX_CHUNKS_PER_ITEM', 6);
}

/** Every permission key a chunk can require (used to build the "allowed" list for a caller). */
function ccrm_vec_perm_keys(): array {
    return ['leads', 'clients', 'projects', 'tasks', 'invoices', 'financial', 'warehouse', 'meetings',
            'unified_entries', 'email', 'employees', 'employees.personal', 'employees.salaries', 'employees.vacations'];
}

/** The decrypted integrations configuration (OpenAI key, vector DB settings). */
function ccrm_vec_config(\PDO $pdo): array {
    $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
    $stmt->execute();
    $json = $stmt->fetchColumn();
    $cfg = $json ? json_decode($json, true) : [];
    return is_array($cfg) ? ccrm_decrypt_config_secrets($cfg, ccrm_integration_secret_keys()) : [];
}

/** Create the index tables. Returns an error message, or '' when the schema is ready. */
function ccrm_vec_schema(\PDO $vec): string {
    try {
        $vec->exec("CREATE TABLE IF NOT EXISTS `rag_chunks` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,   -- MariaDB: a vector-indexed table's primary key may be at most 256 bytes
            `source_type` VARCHAR(40) NOT NULL,
            `source_id` VARCHAR(120) NOT NULL,
            `chunk_no` SMALLINT NOT NULL DEFAULT 0,
            `perm` VARCHAR(40) NOT NULL,
            `perm2` VARCHAR(40) NULL,
            `label` VARCHAR(255) NOT NULL DEFAULT '',
            `content` MEDIUMTEXT NOT NULL,
            `raw_hash` CHAR(32) NOT NULL,
            `embedding` VECTOR(" . CCRM_VEC_DIM . ") NOT NULL,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            INDEX `idx_rag_chunks_source` (`source_type`, `source_id`),
            VECTOR INDEX `idx_rag_chunks_vec` (`embedding`) DISTANCE=cosine
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $vec->exec("CREATE TABLE IF NOT EXISTS `rag_index_queue` (
            `item_key` VARCHAR(190) NOT NULL,
            `source_type` VARCHAR(40) NOT NULL,
            `source_id` VARCHAR(120) NOT NULL,
            `label` VARCHAR(255) NOT NULL DEFAULT '',
            `perm` VARCHAR(40) NOT NULL,
            `perm2` VARCHAR(40) NULL,
            `content` MEDIUMTEXT NOT NULL,
            `raw_hash` CHAR(32) NOT NULL,
            PRIMARY KEY (`item_key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $vec->exec("CREATE TABLE IF NOT EXISTS `rag_index_state` (
            `k` VARCHAR(40) NOT NULL,
            `v` VARCHAR(255) NOT NULL,
            PRIMARY KEY (`k`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        return '';
    } catch (\Throwable $e) {
        error_log('[ccrm vector] schema: ' . $e->getMessage());
        return 'Could not prepare the vector index tables (MariaDB 11.8 or newer is required for VECTOR columns). See the error log.';
    }
}

/** Embed texts with OpenAI. Returns one float[] per input, in order; throws on failure. */
function ccrm_vec_embed(string $apiKey, array $texts): array {
    if (!$texts) {
        return [];
    }
    $ch = curl_init('https://api.openai.com/v1/embeddings');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
        CURLOPT_POSTFIELDS => json_encode([
            'model' => CCRM_VEC_MODEL,
            'input' => array_values($texts),
            'dimensions' => CCRM_VEC_DIM,
        ], JSON_INVALID_UTF8_SUBSTITUTE),
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($code !== 200) {
        $data = json_decode((string)$body, true);
        throw new \RuntimeException('OpenAI embeddings returned ' . $code . ': ' . ($data['error']['message'] ?? ($err ?: 'no response')));
    }
    $data = json_decode((string)$body, true);
    $out = [];
    foreach (($data['data'] ?? []) as $row) {
        $out[(int)$row['index']] = $row['embedding'];
    }
    ksort($out);
    if (count($out) !== count($texts)) {
        throw new \RuntimeException('OpenAI embeddings returned ' . count($out) . ' vectors for ' . count($texts) . ' inputs.');
    }
    return array_values($out);
}

/** A float[] as the text form MariaDB's VEC_FromText() reads. */
function ccrm_vec_literal(array $v): string {
    return '[' . implode(',', array_map(static fn($f) => rtrim(rtrim(sprintf('%.7F', (float)$f), '0'), '.'), $v)) . ']';
}

/** Plain text of a stored HTML / JSON-block note. */
function ccrm_vec_plain(?string $s, int $cap = 6000): string {
    $s = (string)$s;
    if ($s !== '' && ($s[0] === '[' || $s[0] === '{')) {
        $j = json_decode($s, true);
        if (is_array($j)) {
            $parts = [];
            array_walk_recursive($j, static function ($v, $k) use (&$parts) {
                if (is_string($v) && ($k === 'content' || $k === 'text' || $k === 'summary')) {
                    $parts[] = $v;
                }
            });
            if ($parts) {
                $s = implode("\n", $parts);
            }
        }
    }
    $s = html_entity_decode(strip_tags($s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = trim(preg_replace("/[ \t]+/", ' ', preg_replace("/\r\n?|\n{3,}/", "\n\n", $s)));
    return mb_substr($s, 0, $cap, 'UTF-8');
}

/** Cut a text into chunks at paragraph / line / sentence boundaries; every chunk repeats the heading line. */
function ccrm_vec_chunks(string $text): array {
    $text = trim($text);
    if ($text === '') {
        return [];
    }
    $max = CCRM_VEC_CHUNK_CHARS;
    if (mb_strlen($text, 'UTF-8') <= $max) {
        return [$text];
    }
    $nl = mb_strpos($text, "\n", 0, 'UTF-8');
    $head = $nl === false ? '' : mb_substr($text, 0, $nl, 'UTF-8');
    $body = $nl === false ? $text : mb_substr($text, $nl + 1, null, 'UTF-8');
    $room = max(400, $max - mb_strlen($head, 'UTF-8') - 1);
    $pieces = preg_split('/(?<=[\n\.\!\?])\s+/u', $body, -1, PREG_SPLIT_NO_EMPTY) ?: [$body];
    $chunks = [];
    $cur = '';
    foreach ($pieces as $p) {
        while (mb_strlen($p, 'UTF-8') > $room) {            // one very long "sentence"
            if ($cur !== '') { $chunks[] = $cur; $cur = ''; }
            $chunks[] = mb_substr($p, 0, $room, 'UTF-8');
            $p = mb_substr($p, $room, null, 'UTF-8');
        }
        if ($cur !== '' && mb_strlen($cur, 'UTF-8') + mb_strlen($p, 'UTF-8') + 1 > $room) {
            $chunks[] = $cur;
            $cur = '';
        }
        $cur .= ($cur === '' ? '' : ' ') . $p;
    }
    if ($cur !== '') {
        $chunks[] = $cur;
    }
    $chunks = array_slice($chunks, 0, CCRM_VEC_MAX_CHUNKS_PER_ITEM);
    return array_map(static fn($c) => $head !== '' ? ($head . "\n" . $c) : $c, $chunks);
}

/** Run a keyset-paged query: calls $each($row) for every row, 500 at a time, ordered by $idCol. */
function ccrm_vec_paged(\PDO $pdo, string $sql, string $idCol, callable $each): void {
    try {
        ccrm_vec_paged_run($pdo, $sql, $idCol, $each);
    } catch (\Throwable $e) {
        // A schema difference in one table (an older install, a renamed column) must not stop the others.
        error_log('[ccrm vector] skipped source: ' . $e->getMessage());
        $GLOBALS['ccrm_vec_warnings'][] = preg_replace('/\s+/', ' ', substr($sql, 0, 70)) . ' ... query failed';
    }
}

function ccrm_vec_paged_run(\PDO $pdo, string $sql, string $idCol, callable $each): void {
    $last = '';
    while (true) {
        $stmt = $pdo->prepare(str_replace('{PAGE}', "AND {$idCol} > ? ORDER BY {$idCol} LIMIT 500", $sql));
        $stmt->execute([$last]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows) {
            return;
        }
        foreach ($rows as $r) {
            $each($r);
        }
        $lastRow = end($rows);
        $key = preg_replace('/^.*\./', '', trim($idCol, '`'));
        $last = (string)($lastRow[trim($key, '`')] ?? ($lastRow['id'] ?? ''));
        if (count($rows) < 500) {
            return;
        }
    }
}

function ccrm_vec_table_exists(\PDO $pdo, string $t): bool {
    $s = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?");
    $s->execute([$t]);
    return (bool)$s->fetchColumn();
}

/**
 * Every searchable record as ['type','id','label','text','perm','perm2'], read straight from the
 * CRM database. No row limits: the index covers everything (the old training sampled 20-50 rows).
 */
function ccrm_vec_items(\PDO $pdo, callable $emit): void {
    $money = static fn($v) => number_format((float)$v, 2, '.', '');
    $kv = static function (array $pairs): string {
        $out = [];
        foreach ($pairs as $k => $v) {
            if ($v !== null && $v !== '' && $v !== '0000-00-00') {
                $out[] = $k . ': ' . $v;
            }
        }
        return implode("\n", $out);
    };

    // Leads and clients
    ccrm_vec_paged($pdo, "SELECT `id`,`name`,`city`,`client_type`,`status`,`source`,`owner`,`value`,`adjustment`,`contact_person`,`interest_note`,`ai_summary`,`financial_summary`,`legal_form`,`region` FROM `leads` WHERE IFNULL(`archived`,0)=0 {PAGE}", '`id`', function ($l) use ($emit, $kv) {
        $isClient = ccrm_is_client_record($l);
        $emit([
            'type' => $isClient ? 'client' : 'lead', 'id' => $l['id'], 'label' => (string)$l['name'],
            'perm' => $isClient ? 'clients' : 'leads', 'perm2' => null,
            'text' => ($isClient ? 'Client: ' : 'Lead: ') . $l['name'] . "\n" . $kv([
                'Type' => $l['client_type'], 'City' => $l['city'], 'Region' => $l['region'], 'Status' => $l['status'],
                'Source' => $l['source'], 'Owner' => $l['owner'], 'Value' => $l['value'], 'Contact person' => $l['contact_person'],
                'Legal form' => $l['legal_form'], 'Interest' => ccrm_vec_plain($l['interest_note'], 1500),
                'Summary' => ccrm_vec_plain($l['ai_summary'], 2500), 'Financial analysis' => ccrm_vec_plain($l['financial_summary'], 3000),
            ]),
        ]);
    });

    // Timeline: e-mails, notes, offers, calls... (the parent lead decides who may read it)
    if (ccrm_vec_table_exists($pdo, 'timeline_events')) {
        ccrm_vec_paged($pdo, "SELECT te.`id`, te.`type`, te.`title`, te.`content`, te.`transcription`, te.`timestamp`, te.`amount`, te.`file_name`, l.`id` AS lead_id, l.`name` AS lead_name, l.`adjustment` FROM `timeline_events` te JOIN `leads` l ON l.`id` = te.`lead_id` WHERE IFNULL(te.`hidden`,0)=0 AND IFNULL(l.`archived`,0)=0 {PAGE}", 'te.`id`', function ($e) use ($emit, $kv) {
            $body = trim(ccrm_vec_plain($e['content']) . "\n" . ccrm_vec_plain($e['transcription'], 3000));
            if ($body === '' && (string)$e['title'] === '') {
                return;
            }
            $isClient = ccrm_is_client_record(['id' => $e['lead_id'], 'adjustment' => $e['adjustment']]);
            $emit([
                'type' => 'timeline_' . $e['type'], 'id' => $e['id'], 'label' => (string)($e['title'] ?: $e['type']),
                'perm' => $isClient ? 'clients' : 'leads', 'perm2' => $e['type'] === 'email' ? 'email' : null,
                'text' => ucfirst((string)$e['type']) . ': ' . $e['title'] . "\n" . $kv([
                    'Client/Lead' => $e['lead_name'], 'Date' => substr((string)$e['timestamp'], 0, 10),
                    'Amount' => $e['amount'] !== null ? $e['amount'] : null, 'File' => $e['file_name'],
                ]) . ($body !== '' ? "\n" . $body : ''),
            ]);
        });
    }

    // Meeting notes
    if (ccrm_vec_table_exists($pdo, 'meeting_notes')) {
        ccrm_vec_paged($pdo, "SELECT `id`,`title`,`notes`,`lead_name`,`ai_summary_json` FROM `meeting_notes` WHERE IFNULL(`archived`,0)=0 {PAGE}", '`id`', function ($m) use ($emit, $kv) {
            $sum = '';
            if (!empty($m['ai_summary_json'])) {
                $s = json_decode($m['ai_summary_json'], true);
                $sum = is_array($s) ? ccrm_vec_plain((string)($s['summary'] ?? ''), 2000) : '';
            }
            $emit(['type' => 'meeting', 'id' => $m['id'], 'label' => (string)$m['title'], 'perm' => 'meetings', 'perm2' => null,
                'text' => 'Meeting note: ' . $m['title'] . "\n" . $kv(['Client' => $m['lead_name'], 'Notes' => ccrm_vec_plain($m['notes']), 'Summary' => $sum])]);
        });
    }

    // Tasks (row-level visibility is applied again at search time)
    ccrm_vec_paged($pdo, "SELECT `id`,`title`,`description`,`priority`,`status`,`owner`,`deadline`,`conclusion` FROM `tasks` WHERE IFNULL(`archived`,0)=0 {PAGE}", '`id`', function ($t) use ($emit, $kv) {
        $emit(['type' => 'task', 'id' => $t['id'], 'label' => (string)$t['title'], 'perm' => 'tasks', 'perm2' => null,
            'text' => 'Task: ' . $t['title'] . "\n" . $kv(['Status' => $t['status'], 'Priority' => $t['priority'], 'Owner' => $t['owner'],
                'Deadline' => $t['deadline'], 'Description' => ccrm_vec_plain($t['description'], 2500), 'Conclusion' => ccrm_vec_plain($t['conclusion'], 1500)])]);
    });

    // Finance rows (payroll rows additionally need the salaries permission)
    ccrm_vec_paged($pdo, "SELECT `id`,`type`,`subtype`,`title`,`description`,`category_path`,`amount_planned`,`amount_real`,`currency`,`status`,`issue_date`,`due_date`,`paid_date`,`invoice_number` FROM `financial_records` WHERE 1=1 {PAGE}", '`id`', function ($f) use ($emit, $kv, $money) {
        $emit(['type' => 'finance', 'id' => $f['id'], 'label' => (string)$f['title'], 'perm' => 'financial',
            'perm2' => ccrm_is_salary_finance_row($f) ? 'employees.salaries' : null,
            'text' => 'Finance record (' . $f['type'] . '): ' . $f['title'] . "\n" . $kv(['Category' => $f['category_path'], 'Subtype' => $f['subtype'],
                'Planned' => $money($f['amount_planned']) . ' ' . $f['currency'], 'Real' => $money($f['amount_real']) . ' ' . $f['currency'], 'Status' => $f['status'],
                'Issued' => $f['issue_date'], 'Due' => $f['due_date'], 'Paid' => $f['paid_date'], 'Invoice no.' => $f['invoice_number'], 'Note' => ccrm_vec_plain($f['description'], 1500)])]);
    });

    // Offers and invoices
    ccrm_vec_paged($pdo, "SELECT `id`,`document_number`,`type`,`title`,`subject`,`client_name`,`status`,`total_price`,`currency`,`issued_at`,`valid_until`,`due_date`,`greeting_note`,`intro_note`,`next_steps_note`,`closing_note` FROM `invoices_offers` WHERE 1=1 {PAGE}", '`id`', function ($d) use ($emit, $kv, $money) {
        $emit(['type' => 'document_' . $d['type'], 'id' => $d['id'], 'label' => (string)($d['title'] ?: $d['document_number']), 'perm' => 'invoices', 'perm2' => null,
            'text' => ucfirst((string)$d['type']) . ' ' . $d['document_number'] . ': ' . ($d['title'] ?: $d['subject']) . "\n" . $kv(['Client' => $d['client_name'], 'Status' => $d['status'],
                'Total' => $money($d['total_price']) . ' ' . $d['currency'], 'Issued' => $d['issued_at'], 'Valid until' => $d['valid_until'], 'Due' => $d['due_date'],
                'Notes' => ccrm_vec_plain(trim($d['intro_note'] . "\n" . $d['next_steps_note'] . "\n" . $d['closing_note']), 2500)])]);
    });

    // Projects
    ccrm_vec_paged($pdo, "SELECT `id`,`name`,`status`,`division`,`budget`,`value`,`start_date`,`completion_deadline`,`finished_at`,`delay_reason` FROM `projects` WHERE IFNULL(`archived`,0)=0 {PAGE}", '`id`', function ($p) use ($emit, $kv) {
        $emit(['type' => 'project', 'id' => $p['id'], 'label' => (string)$p['name'], 'perm' => 'projects', 'perm2' => null,
            'text' => 'Project: ' . $p['name'] . "\n" . $kv(['Status' => $p['status'], 'Division' => $p['division'], 'Budget' => $p['budget'], 'Value' => $p['value'],
                'Start' => $p['start_date'], 'Deadline' => $p['completion_deadline'], 'Finished' => $p['finished_at'], 'Delay reason' => $p['delay_reason']])]);
    });

    // Warehouse items
    if (ccrm_vec_table_exists($pdo, 'warehouse_items')) {
        ccrm_vec_paged($pdo, "SELECT `id`,`sku`,`name`,`description`,`category`,`unit` FROM `warehouse_items` WHERE 1=1 {PAGE}", '`id`', function ($w) use ($emit, $kv) {
            $emit(['type' => 'product', 'id' => $w['id'], 'label' => (string)$w['name'], 'perm' => 'warehouse', 'perm2' => null,
                'text' => 'Warehouse item: ' . $w['name'] . "\n" . $kv(['SKU' => $w['sku'], 'Category' => $w['category'], 'Unit' => $w['unit'], 'Description' => ccrm_vec_plain($w['description'], 2000)])]);
        });
    }

    // Unified entries (registries are one table each)
    if (ccrm_vec_table_exists($pdo, 'unified_entries')) {
        foreach ($pdo->query("SELECT `id`,`name` FROM `unified_entries` WHERE `archived` = 0")->fetchAll(\PDO::FETCH_ASSOC) as $reg) {
            $table = 'ue_' . preg_replace('/[^a-z0-9_]/', '', strtolower((string)$reg['id']));
            if (!ccrm_vec_table_exists($pdo, $table)) {
                continue;
            }
            ccrm_vec_paged($pdo, "SELECT * FROM `{$table}` WHERE 1=1 {PAGE}", '`id`', function ($u) use ($emit, $reg, $kv) {
                $emit(['type' => 'unified_entry', 'id' => $reg['id'] . '-' . $u['id'], 'label' => (string)($u['title'] ?? 'Entry'), 'perm' => 'unified_entries', 'perm2' => null,
                    'text' => 'Registry entry (' . $reg['name'] . '): ' . ($u['title'] ?? 'Untitled') . "\n" . $kv(['Due' => $u['due_date'] ?? null, 'Attachment' => $u['file_name'] ?? null])]);
            });
        }
    }

    // HR — three separate permissions, three separate item kinds
    if (ccrm_vec_table_exists($pdo, 'employees')) {
        ccrm_vec_paged($pdo, "SELECT `id`,`name`,`email`,`notes` FROM `employees` WHERE IFNULL(`is_active`,1)=1 {PAGE}", '`id`', function ($e) use ($emit, $kv) {
            $emit(['type' => 'employee', 'id' => $e['id'], 'label' => (string)$e['name'], 'perm' => 'employees.personal', 'perm2' => null,
                'text' => 'Employee: ' . $e['name'] . "\n" . $kv(['Email' => $e['email'], 'Notes' => ccrm_vec_plain($e['notes'], 1500)])]);
        });
        if (ccrm_vec_table_exists($pdo, 'employee_salaries')) {
            ccrm_vec_paged($pdo, "SELECT es.`id`, es.`period_key`, es.`total_salary`, es.`total_paid`, es.`status`, es.`payment_date`, es.`due_date`, e.`name` AS emp_name FROM `employee_salaries` es JOIN `employees` e ON e.`id` = es.`employee_id` WHERE 1=1 {PAGE}", 'es.`id`', function ($s) use ($emit, $kv, $money) {
                $emit(['type' => 'payroll', 'id' => $s['id'], 'label' => $s['emp_name'] . ' ' . $s['period_key'], 'perm' => 'employees.salaries', 'perm2' => null,
                    'text' => 'Payroll record ' . $s['period_key'] . ': ' . $s['emp_name'] . "\n" . $kv(['Salary' => $money($s['total_salary']), 'Paid' => $money($s['total_paid']),
                        'Status' => $s['status'], 'Payment date' => $s['payment_date'], 'Due' => $s['due_date']])]);
            });
        }
        if (ccrm_vec_table_exists($pdo, 'employee_vacations')) {
            ccrm_vec_paged($pdo, "SELECT ev.`id`, ev.`vacation_type_id`, ev.`start_date`, ev.`end_date`, ev.`days_count`, ev.`status`, ev.`note`, e.`name` AS emp_name FROM `employee_vacations` ev JOIN `employees` e ON e.`id` = ev.`employee_id` WHERE 1=1 {PAGE}", 'ev.`id`', function ($v) use ($emit, $kv) {
                $emit(['type' => 'vacation', 'id' => $v['id'], 'label' => $v['emp_name'] . ' ' . $v['vacation_type_id'], 'perm' => 'employees.vacations', 'perm2' => null,
                    'text' => 'Leave record: ' . $v['emp_name'] . "\n" . $kv(['Type' => $v['vacation_type_id'], 'From' => $v['start_date'], 'To' => $v['end_date'],
                        'Days' => $v['days_count'], 'Status' => $v['status'], 'Note' => ccrm_vec_plain($v['note'], 500)])]);
            });
        }
    }
}

/**
 * Compare the CRM with the index and queue what changed (new, edited, or whose permission
 * changed); remove chunks of records that no longer exist. Returns ['queued','indexed_items','removed'].
 */
function ccrm_vec_queue_build(\PDO $pdo, \PDO $vec): array {
    $GLOBALS['ccrm_vec_warnings'] = [];
    $existing = [];
    foreach ($vec->query("SELECT `source_type`, `source_id`, `raw_hash` FROM `rag_chunks` WHERE `chunk_no` = 0") as $r) {
        $existing[$r['source_type'] . "\x1f" . $r['source_id']] = $r['raw_hash'];
    }
    $vec->exec("TRUNCATE TABLE `rag_index_queue`");

    $seen = [];
    $batch = [];
    $queued = 0;
    $flush = function () use (&$batch, $vec, &$queued) {
        if (!$batch) {
            return;
        }
        $ph = rtrim(str_repeat('(?,?,?,?,?,?,?,?),', count($batch)), ',');
        $args = [];
        foreach ($batch as $b) {
            array_push($args, $b['key'], $b['type'], $b['id'], $b['label'], $b['perm'], $b['perm2'], $b['text'], $b['hash']);
        }
        $vec->prepare("REPLACE INTO `rag_index_queue` (`item_key`,`source_type`,`source_id`,`label`,`perm`,`perm2`,`content`,`raw_hash`) VALUES $ph")->execute($args);
        $queued += count($batch);
        $batch = [];
    };

    ccrm_vec_items($pdo, function (array $it) use (&$seen, &$batch, $existing, $flush) {
        $key = $it['type'] . "\x1f" . $it['id'];
        $text = trim((string)$it['text']);
        if ($text === '') {
            return;
        }
        $label = mb_substr((string)$it['label'], 0, 250, 'UTF-8');
        $hash = md5($it['perm'] . '|' . ($it['perm2'] ?? '') . '|' . $label . '|' . $text);
        $seen[$key] = true;
        if (($existing[$key] ?? null) === $hash) {
            return;
        }
        $batch[] = ['key' => mb_substr($it['type'] . ':' . $it['id'], 0, 190), 'type' => $it['type'], 'id' => mb_substr((string)$it['id'], 0, 120),
                    'label' => $label, 'perm' => $it['perm'], 'perm2' => $it['perm2'], 'text' => $text, 'hash' => $hash];
        if (count($batch) >= 100) {
            $flush();
        }
    });
    $flush();

    // Only forget records that are really gone: when a source failed above, its rows were never
    // seen, and treating that as "deleted" would wipe a working index.
    $removed = 0;
    $del = $vec->prepare("DELETE FROM `rag_chunks` WHERE `source_type` = ? AND `source_id` = ?");
    foreach (empty($GLOBALS['ccrm_vec_warnings']) ? $existing : [] as $key => $_) {
        if (!isset($seen[$key])) {
            [$t, $i] = explode("\x1f", $key, 2);
            $del->execute([$t, $i]);
            $removed++;
        }
    }
    $total = (int)$vec->query("SELECT COUNT(*) FROM `rag_index_queue`")->fetchColumn();
    $vec->prepare("REPLACE INTO `rag_index_state` (`k`,`v`) VALUES ('queue_total', ?)")->execute([(string)$total]);
    return ['queued' => $total, 'indexed_items' => count($seen), 'removed' => $removed, 'warnings' => $GLOBALS['ccrm_vec_warnings'] ?? []];
}

/**
 * Embed queued items for up to $budgetSeconds. Returns ['items','chunks','remaining','total','log'].
 * The sanitiser is built once per call; names, e-mails and phone numbers never reach OpenAI.
 */
function ccrm_vec_process(\PDO $pdo, \PDO $vec, string $apiKey, int $budgetSeconds = 20): array {
    $started = microtime(true);
    [$toPlaceholder] = get_sanitization_maps($pdo);
    $items = 0;
    $chunksDone = 0;
    $log = [];
    $ins = $vec->prepare("INSERT INTO `rag_chunks` (`source_type`,`source_id`,`chunk_no`,`perm`,`perm2`,`label`,`content`,`raw_hash`,`embedding`) VALUES (?,?,?,?,?,?,?,?,VEC_FromText(?))");
    $delItem = $vec->prepare("DELETE FROM `rag_chunks` WHERE `source_type` = ? AND `source_id` = ?");
    $delQueue = $vec->prepare("DELETE FROM `rag_index_queue` WHERE `item_key` = ?");

    while (microtime(true) - $started < $budgetSeconds) {
        $rows = $vec->query("SELECT * FROM `rag_index_queue` ORDER BY `item_key` LIMIT 40")->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows) {
            break;
        }
        $flat = [];                                   // [item row, chunk no, raw chunk text]
        foreach ($rows as $r) {
            foreach (ccrm_vec_chunks($r['content']) as $n => $c) {
                $flat[] = [$r, $n, $c];
            }
        }
        $masked = array_map(static fn($f) => sanitize_text($f[2], $toPlaceholder), $flat);
        $vectors = [];
        foreach (array_chunk($masked, 96) as $part) {
            $vectors = array_merge($vectors, ccrm_vec_embed($apiKey, $part));
        }
        $vec->beginTransaction();
        try {
            $doneKeys = [];
            foreach ($flat as $i => [$r, $n, $c]) {
                if (!isset($doneKeys[$r['item_key']])) {
                    $delItem->execute([$r['source_type'], $r['source_id']]);
                    $doneKeys[$r['item_key']] = true;
                }
                $ins->execute([$r['source_type'], $r['source_id'], $n,
                    $r['perm'], $r['perm2'], $r['label'], $c, $r['raw_hash'], ccrm_vec_literal($vectors[$i])]);
                $chunksDone++;
            }
            foreach ($rows as $r) {
                $delQueue->execute([$r['item_key']]);
                $items++;
            }
            $vec->commit();
        } catch (\Throwable $e) {
            $vec->rollBack();
            throw $e;
        }
    }
    $remaining = (int)$vec->query("SELECT COUNT(*) FROM `rag_index_queue`")->fetchColumn();
    $total = (int)($vec->query("SELECT `v` FROM `rag_index_state` WHERE `k` = 'queue_total'")->fetchColumn() ?: 0);
    return ['items' => $items, 'chunks' => $chunksDone, 'remaining' => $remaining, 'total' => $total];
}

/** Counts for the status line / stats card. */
function ccrm_vec_status(\PDO $vec): array {
    $out = ['chunks' => 0, 'items' => 0, 'queued' => 0, 'by_type' => []];
    try {
        $out['chunks'] = (int)$vec->query("SELECT COUNT(*) FROM `rag_chunks`")->fetchColumn();
        $out['items'] = (int)$vec->query("SELECT COUNT(*) FROM `rag_chunks` WHERE `chunk_no` = 0")->fetchColumn();
        $out['queued'] = (int)$vec->query("SELECT COUNT(*) FROM `rag_index_queue`")->fetchColumn();
        foreach ($vec->query("SELECT `source_type`, COUNT(*) c FROM `rag_chunks` WHERE `chunk_no` = 0 GROUP BY `source_type` ORDER BY c DESC") as $r) {
            $out['by_type'][$r['source_type']] = (int)$r['c'];
        }
    } catch (\Throwable $e) {
    }
    return $out;
}

/**
 * Chunks closest to $maskedQuery that $scope may read (null scope = a system run, no limit).
 * $maskedQuery must already be sanitised the way the chat sanitises its question.
 *
 * @return array<int,array{type:string,id:string,label:string,content:string,distance:float}>
 */
function ccrm_vec_search(\PDO $pdo, \PDO $vec, string $apiKey, string $maskedQuery, ?array $scope, int $k = 10): array {
    $q = ccrm_vec_literal(ccrm_vec_embed($apiKey, [$maskedQuery])[0]);

    $allowed = [];
    foreach (ccrm_vec_perm_keys() as $key) {
        if ($scope === null || ccrm_can($scope, $key)) {
            $allowed[$key] = true;
        }
    }
    $isRestricted = count($allowed) < count(ccrm_vec_perm_keys());
    $sel = "SELECT `source_type`, `source_id`, `label`, `content`, `perm`, `perm2`, VEC_DISTANCE_COSINE(`embedding`, VEC_FromText(?)) AS d FROM `rag_chunks`";

    $filter = function (array $rows) use ($pdo, $scope, $allowed): array {
        $rows = array_values(array_filter($rows, static fn($r) => isset($allowed[$r['perm']]) && ($r['perm2'] === null || isset($allowed[$r['perm2']]))));
        if ($scope !== null && empty($scope['isAdmin']) && !ccrm_can($scope, 'tasks.view_all')) {
            $taskIds = array_map(static fn($r) => $r['source_id'], array_filter($rows, static fn($r) => $r['source_type'] === 'task'));
            if ($taskIds) {
                $visible = ccrm_visible_task_ids($pdo, $scope, $taskIds);
                $rows = array_values(array_filter($rows, static fn($r) => $r['source_type'] !== 'task' || isset($visible[$r['source_id']])));
            }
        }
        return $rows;
    };

    // 1. approximate nearest neighbours through the HNSW index (it cannot be combined with a WHERE)
    $stmt = $vec->prepare($sel . " ORDER BY d LIMIT 80");
    $stmt->execute([$q]);
    $rows = $filter($stmt->fetchAll(\PDO::FETCH_ASSOC));

    // 2. a restricted caller may have lost most of the 80 to the permission filter: ask exactly
    if ($isRestricted && count($rows) < $k && $allowed) {
        $in = implode(',', array_fill(0, count($allowed), '?'));
        $stmt = $vec->prepare($sel . " WHERE `perm` IN ($in) AND (`perm2` IS NULL OR `perm2` IN ($in)) ORDER BY d LIMIT 60");
        $stmt->execute(array_merge([$q], array_keys($allowed), array_keys($allowed)));
        $rows = $filter($stmt->fetchAll(\PDO::FETCH_ASSOC));
    }

    $perItem = [];
    $out = [];
    foreach ($rows as $r) {
        if ((float)$r['d'] > 0.85) {
            continue;
        }
        $key = $r['source_type'] . "\x1f" . $r['source_id'];
        $perItem[$key] = ($perItem[$key] ?? 0) + 1;
        if ($perItem[$key] > 2) {
            continue;
        }
        $out[] = ['type' => $r['source_type'], 'id' => $r['source_id'], 'label' => $r['label'], 'content' => $r['content'], 'distance' => (float)$r['d']];
        if (count($out) >= $k) {
            break;
        }
    }
    return $out;
}

/**
 * The prompt block of semantically retrieved records, already masked for OpenAI.
 * Returns ['text' => string, 'hits' => int]; never throws — a failed search must not break the chat.
 */
function ccrm_vec_context_block(\PDO $pdo, ?\PDO $vec, string $apiKey, string $maskedQuery, ?array $scope, array $toPlaceholder, int $k = 10): array {
    if (!$vec || $apiKey === '' || trim($maskedQuery) === '') {
        return ['text' => '', 'hits' => 0];
    }
    try {
        if (!(int)$vec->query("SELECT COUNT(*) FROM `rag_chunks`")->fetchColumn()) {
            return ['text' => '', 'hits' => 0];
        }
        $hits = ccrm_vec_search($pdo, $vec, $apiKey, $maskedQuery, $scope, $k);
    } catch (\Throwable $e) {
        if (function_exists('ccrm_log_exception')) {
            ccrm_log_exception($e);
        }
        return ['text' => '', 'hits' => 0];
    }
    if (!$hits) {
        return ['text' => '', 'hits' => 0];
    }
    $text = "=== SEMANTICALLY RETRIEVED RECORDS (vector search, most relevant first) ===\n";
    foreach ($hits as $h) {
        $text .= '[' . $h['type'] . ' #' . $h['id'] . '] (similarity ' . round(1 - $h['distance'], 2) . ")\n" . trim($h['content']) . "\n---\n";
    }
    return ['text' => sanitize_text($text, $toPlaceholder), 'hits' => count($hits)];
}
