<?php
/**
 * Client Contacts (`client_contacts`) schema migration and sync helpers.
 * Keeps company contact persons and standalone personal contacts completely
 * separate from `leads` so contacts never pollute the Clients list or pickers.
 */

if (!function_exists('ccrm_client_contacts_ddl')) {
    function ccrm_client_contacts_ddl(): string {
        return "CREATE TABLE IF NOT EXISTS `client_contacts` (
          `id` VARCHAR(64) NOT NULL PRIMARY KEY,
          `company_client_id` VARCHAR(50) NULL COMMENT 'leads.id of parent company client (NULL = standalone personal contact)',
          `name` VARCHAR(150) NOT NULL,
          `first_name` VARCHAR(100) NULL,
          `last_name` VARCHAR(100) NULL,
          `email` VARCHAR(255) NULL,
          `phone` VARCHAR(64) NULL,
          `contact_role` VARCHAR(120) NULL COMMENT 'Summary function string (e.g. CEO, Billing)',
          `contact_tags` TEXT NULL COMMENT 'JSON array of contact function tags',
          `notes` TEXT NULL,
          `archived` TINYINT(1) NOT NULL DEFAULT 0,
          `created_at` DATE NOT NULL,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX `idx_cc_company` (`company_client_id`),
          INDEX `idx_cc_email` (`email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    }
}

if (!function_exists('ccrm_migrate_client_contacts')) {
    function ccrm_migrate_client_contacts(PDO $pdo): void {
        try {
            if (!ccrm_table_exists($pdo, 'client_contacts')) {
                $pdo->exec(ccrm_client_contacts_ddl());
            }
            if (!ccrm_table_exists($pdo, 'leads') || !ccrm_column_exists($pdo, 'leads', 'company_client_id')) {
                return;
            }
            $hasTagsCol = ccrm_column_exists($pdo, 'leads', 'contact_tags');
            $tagsSel = $hasTagsCol ? '`contact_tags`' : 'NULL AS `contact_tags`';
            $rows = $pdo->query(
                "SELECT `id`, `company_client_id`, `name`, `contact_first_name`, `contact_last_name`, `email`, `phone`, `contact_role`, {$tagsSel}, `interest_note`, `archived`, `created_at` "
                . "FROM `leads` WHERE `client_type` = 'person' AND `company_client_id` IS NOT NULL AND TRIM(`company_client_id`) != ''"
            )->fetchAll(PDO::FETCH_ASSOC);
            if (!$rows) return;

            $refChecks = [
                ['projects', 'client_id'],
                ['projects', 'lead_id'],
                ['tasks', 'related_lead_id'],
                ['invoices_offers', 'lead_id'],
                ['tickets', 'client_id'],
                ['orders', 'client_id'],
                ['financial_records', 'client_id'],
            ];
            $activeChecks = [];
            foreach ($refChecks as [$tbl, $col]) {
                if (ccrm_table_exists($pdo, $tbl) && ccrm_column_exists($pdo, $tbl, $col)) {
                    $activeChecks[] = $pdo->prepare("SELECT 1 FROM `{$tbl}` WHERE `{$col}` = ? LIMIT 1");
                }
            }

            $ins = $pdo->prepare(
                "INSERT IGNORE INTO `client_contacts` (`id`, `company_client_id`, `name`, `first_name`, `last_name`, `email`, `phone`, `contact_role`, `contact_tags`, `notes`, `archived`, `created_at`) "
                . "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $delTimeline = ccrm_table_exists($pdo, 'timeline_events')
                ? $pdo->prepare("DELETE FROM `timeline_events` WHERE `lead_id` = ?")
                : null;
            $delLead = $pdo->prepare("DELETE FROM `leads` WHERE `id` = ?");

            foreach ($rows as $r) {
                $id = (string)$r['id'];
                $hasRefs = false;
                foreach ($activeChecks as $chk) {
                    $chk->execute([$id]);
                    if ($chk->fetchColumn()) {
                        $hasRefs = true;
                        break;
                    }
                }
                $ins->execute([
                    $id,
                    trim((string)$r['company_client_id']) ?: null,
                    (string)($r['name'] ?? ''),
                    ($r['contact_first_name'] ?? '') !== '' ? (string)$r['contact_first_name'] : null,
                    ($r['contact_last_name'] ?? '') !== '' ? (string)$r['contact_last_name'] : null,
                    ($r['email'] ?? '') !== '' ? (string)$r['email'] : null,
                    ($r['phone'] ?? '') !== '' ? (string)$r['phone'] : null,
                    ($r['contact_role'] ?? '') !== '' ? (string)$r['contact_role'] : null,
                    ($r['contact_tags'] ?? '') !== '' ? (string)$r['contact_tags'] : null,
                    ($r['interest_note'] ?? '') !== '' ? (string)$r['interest_note'] : null,
                    !empty($r['archived']) ? 1 : 0,
                    !empty($r['created_at']) ? (string)$r['created_at'] : date('Y-m-d'),
                ]);
                if (!$hasRefs) {
                    if ($delTimeline) $delTimeline->execute([$id]);
                    $delLead->execute([$id]);
                }
            }
        } catch (\Throwable $e) {
            error_log('CCRM ccrm_migrate_client_contacts failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('ccrm_sync_fetch_client_contacts')) {
    function ccrm_sync_fetch_client_contacts(PDO $pdo): array {
        if ($pdo->query("SHOW TABLES LIKE 'client_contacts'")->rowCount() === 0) return [];
        $out = [];
        $stmt = $pdo->query("SELECT * FROM `client_contacts` ORDER BY `name` ASC, `id` ASC");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $tags = (!empty($row['contact_tags']) && is_array($ct = json_decode($row['contact_tags'], true)))
                ? array_values(array_filter(array_map(fn($x) => trim((string)$x), $ct)))
                : [];
            $out[] = [
                'id' => $row['id'],
                'companyClientId' => ($row['company_client_id'] ?? '') !== '' ? $row['company_client_id'] : null,
                'name' => $row['name'] ?? '',
                'firstName' => ($row['first_name'] ?? '') !== '' ? $row['first_name'] : null,
                'lastName' => ($row['last_name'] ?? '') !== '' ? $row['last_name'] : null,
                'email' => $row['email'] ?? '',
                'phone' => $row['phone'] ?? '',
                'contactRole' => ($row['contact_role'] ?? '') !== '' ? $row['contact_role'] : null,
                'contactTags' => $tags,
                'notes' => $row['notes'] ?? '',
                'archived' => intval($row['archived'] ?? 0) === 1,
                'createdAt' => $row['created_at'] ?? '',
            ];
        }
        return $out;
    }
}

if (!function_exists('ccrm_sync_save_client_contacts')) {
    function ccrm_sync_save_client_contacts(
        PDO $pdo,
        array $items,
        bool $isDeltaSync,
        callable $deletionsFor,
        bool $skipDeletes
    ): void {
        $existingIds = $pdo->query("SELECT `id` FROM `client_contacts`")->fetchAll(PDO::FETCH_COLUMN);
        $processedIds = [];
        $ins = $pdo->prepare(
            "INSERT INTO `client_contacts` (`id`, `company_client_id`, `name`, `first_name`, `last_name`, `email`, `phone`, `contact_role`, `contact_tags`, `notes`, `archived`, `created_at`) "
            . "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            . "ON DUPLICATE KEY UPDATE `company_client_id` = VALUES(`company_client_id`), `name` = VALUES(`name`), `first_name` = VALUES(`first_name`), `last_name` = VALUES(`last_name`), `email` = VALUES(`email`), `phone` = VALUES(`phone`), `contact_role` = VALUES(`contact_role`), `contact_tags` = VALUES(`contact_tags`), `notes` = VALUES(`notes`), `archived` = VALUES(`archived`)"
        );
        foreach ($items as $ct) {
            if (!is_array($ct) || empty($ct['id'])) continue;
            $cleanTags = is_array($ct['contactTags'] ?? null)
                ? array_values(array_unique(array_filter(array_map(fn($x) => trim((string)$x), $ct['contactTags']))))
                : [];
            $roleSummary = ($ct['contactRole'] ?? '') !== ''
                ? trim((string)$ct['contactRole'])
                : ($cleanTags ? mb_substr(implode(', ', $cleanTags), 0, 120, 'UTF-8') : null);
            $ins->execute([
                (string)$ct['id'],
                ($ct['companyClientId'] ?? '') !== '' ? trim((string)$ct['companyClientId']) : null,
                trim((string)($ct['name'] ?? '')),
                ($ct['firstName'] ?? '') !== '' ? trim((string)$ct['firstName']) : null,
                ($ct['lastName'] ?? '') !== '' ? trim((string)$ct['lastName']) : null,
                ($ct['email'] ?? '') !== '' ? trim((string)$ct['email']) : null,
                ($ct['phone'] ?? '') !== '' ? trim((string)$ct['phone']) : null,
                $roleSummary,
                $cleanTags ? json_encode($cleanTags, JSON_UNESCAPED_UNICODE) : null,
                ($ct['notes'] ?? '') !== '' ? (string)$ct['notes'] : null,
                !empty($ct['archived']) ? 1 : 0,
                ccrm_date_only($ct['createdAt'] ?? null) ?: date('Y-m-d'),
            ]);
            $processedIds[] = (string)$ct['id'];
        }
        $toDelete = $isDeltaSync ? $deletionsFor('clientContacts', $existingIds) : array_diff($existingIds, $processedIds);
        if (!empty($toDelete) && !$skipDeletes) {
            ccrm_delete_omitted($pdo, 'client_contacts', $toDelete, null, [], false, $isDeltaSync);
        }
    }
}
