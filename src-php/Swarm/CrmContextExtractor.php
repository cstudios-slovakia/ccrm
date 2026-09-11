<?php
namespace CCRM\Swarm;

use PDO;

/**
 * CrmContextExtractor
 * Extracts recent leads, clients, deal objections, and competitor mentions
 * strictly within the chosen temporal lookback window (e.g. 6, 12, 24 months),
 * preventing token bloat and obsolete 10-year data contamination.
 */
class CrmContextExtractor {
    private PDO $pdo;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Extracts a curated, clean context bundle from CRM data.
     *
     * @param int $lookbackMonths Lookback horizon (default 12)
     * @param int $maxCharacters Maximum character budget (~4 characters per token; default 60,000 chars ~ 15k tokens)
     * @return array
     */
    public function extractContext(int $lookbackMonths = 12, int $maxCharacters = 60000): array {
        $lookbackMonths = max(1, min(60, $lookbackMonths));
        $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$lookbackMonths} months"));

        $clients = $this->extractRecentClients($cutoffDate);
        $objections = $this->extractRecentObjections($cutoffDate);

        // Format into structured prompt text
        $sections = [];
        $sections[] = "=== RECENT CRM STAKEHOLDER PROFILES (LOOKBACK: PAST {$lookbackMonths} MONTHS) ===";

        if (!empty($clients)) {
            $sections[] = "--- Active Client & Lead Cohorts ---";
            foreach ($clients as $c) {
                $line = "- [{$c['client_type']}] {$c['name']}";
                if (!empty($c['industry'])) $line .= " | Industry: {$c['industry']}";
                if (!empty($c['organization_size'])) $line .= " | Size: {$c['organization_size']}";
                if (!empty($c['city'])) $line .= " | Loc: {$c['city']}, {$c['country']}";
                if (!empty($c['value']) && $c['value'] > 0) $line .= " | Deal Value: €" . number_format($c['value'], 0);
                if (!empty($c['notes'])) $line .= "\n  Context: " . mb_substr(strip_tags($c['notes']), 0, 160);
                $sections[] = $line;
            }
        } else {
            $sections[] = "No active clients found in the selected temporal window.";
        }

        if (!empty($objections)) {
            $sections[] = "\n--- Recent Objections & Lost Deal Feedback ---";
            foreach ($objections as $o) {
                $sections[] = "- {$o['lead_name']} ({$o['date']}): " . mb_substr(strip_tags($o['content']), 0, 200);
            }
        }

        $fullText = implode("\n", $sections);

        // Enforce character budget safeguard
        if (mb_strlen($fullText) > $maxCharacters) {
            $fullText = mb_substr($fullText, 0, $maxCharacters) . "\n...[Additional historical records truncated to preserve context window budget]...";
        }

        return [
            'lookback_months' => $lookbackMonths,
            'cutoff_date' => $cutoffDate,
            'total_clients_sampled' => count($clients),
            'total_objections_sampled' => count($objections),
            'character_count' => mb_strlen($fullText),
            'formatted_context' => $fullText
        ];
    }

    private function extractRecentClients(string $cutoffDate): array {
        try {
            $stmt = $this->pdo->prepare("
                SELECT `id`, `name`, `status`, `value`, `client_type`, `notes`, 
                       COALESCE(`sk_nace`, '') as `industry`, 
                       COALESCE(`organization_size`, '') as `organization_size`,
                       COALESCE(`city`, '') as `city`,
                       COALESCE(`country`, 'SK') as `country`
                FROM `leads`
                WHERE `updated_at` >= ?
                  AND `archived` = 0
                ORDER BY `value` DESC, `updated_at` DESC
                LIMIT 60
            ");
            $stmt->execute([$cutoffDate]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            return [];
        }
    }

    private function extractRecentObjections(string $cutoffDate): array {
        try {
            // Pull timeline events that contain rejection, hesitation, or pricing feedback
            $stmt = $this->pdo->prepare("
                SELECT te.`title`, te.`content`, te.`created_at` as `date`, l.`name` as `lead_name`
                FROM `timeline_events` te
                JOIN `leads` l ON te.`lead_id` = l.`id`
                WHERE te.`created_at` >= ?
                  AND (
                    te.`content` LIKE '%cena%' OR te.`content` LIKE '%drah%' 
                    OR te.`content` LIKE '%price%' OR te.`content` LIKE '%expensive%'
                    OR te.`content` LIKE '%konkuren%' OR te.`content` LIKE '%compet%'
                    OR te.`content` LIKE '%gdpr%' OR te.`content` LIKE '%privacy%'
                    OR te.`content` LIKE '%odmiet%' OR te.`content` LIKE '%reject%'
                  )
                ORDER BY te.`created_at` DESC
                LIMIT 30
            ");
            $stmt->execute([$cutoffDate]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            return [];
        }
    }
}
