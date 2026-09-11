<?php
namespace CCRM\Swarm;

use PDO;

/**
 * CrmContextExtractor
 * Extracts recent leads, clients, deal objections, competitor mentions,
 * meeting notes, and email feedback strictly within the chosen temporal lookback window
 * and filtered by the user-selected CRM sources.
 */
class CrmContextExtractor {
    private PDO $pdo;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Extracts a curated, clean context bundle from CRM data based on user-selected sources.
     *
     * @param int $lookbackMonths Lookback horizon (default 12)
     * @param int $maxCharacters Maximum character budget (~4 characters per token; default 60,000 chars ~ 15k tokens)
     * @param array $sources Array of enabled source slugs (empty = all enabled)
     * @return array
     */
    public function extractContext(int $lookbackMonths = 12, int $maxCharacters = 60000, array $sources = []): array {
        $lookbackMonths = max(1, min(60, $lookbackMonths));
        $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$lookbackMonths} months"));

        $allSources = empty($sources);
        $sections = [];
        $sections[] = "=== RECENT CRM STAKEHOLDER PROFILES (LOOKBACK: PAST {$lookbackMonths} MONTHS) ===";

        $totalSampled = 0;

        // 1. Active Leads
        if ($allSources || in_array('active_leads', $sources)) {
            $leads = $this->extractActiveLeads($cutoffDate);
            if (!empty($leads)) {
                $sections[] = "\n--- Active Pipeline Leads & Prospects ---";
                foreach ($leads as $c) {
                    $sections[] = $this->formatLeadLine($c);
                }
                $totalSampled += count($leads);
            }
        }

        // 2. Existing Clients
        if ($allSources || in_array('existing_clients', $sources)) {
            $clients = $this->extractExistingClients($cutoffDate);
            if (!empty($clients)) {
                $sections[] = "\n--- Existing Client Cohorts & Retainers ---";
                foreach ($clients as $c) {
                    $sections[] = $this->formatLeadLine($c);
                }
                $totalSampled += count($clients);
            }
        }

        // 3. Lost Deal Objections
        if ($allSources || in_array('lost_deal_objections', $sources)) {
            $objections = $this->extractRecentObjections($cutoffDate);
            if (!empty($objections)) {
                $sections[] = "\n--- Recent Objections & Lost Deal Feedback ---";
                foreach ($objections as $o) {
                    $sections[] = "- {$o['lead_name']} ({$o['date']}): " . mb_substr(strip_tags($o['content']), 0, 200);
                }
                $totalSampled += count($objections);
            }
        }

        // 4. Competitor Intel
        if ($allSources || in_array('competitor_intel', $sources)) {
            $competitorNotes = $this->extractCompetitorIntel($cutoffDate);
            if (!empty($competitorNotes)) {
                $sections[] = "\n--- Direct Competitor Mentions & Vendor Counter-Intelligence ---";
                foreach ($competitorNotes as $cn) {
                    $sections[] = "- {$cn['lead_name']} ({$cn['date']}): " . mb_substr(strip_tags($cn['content']), 0, 200);
                }
                $totalSampled += count($competitorNotes);
            }
        }

        // 5. Meeting Notes & Transcripts
        if ($allSources || in_array('meeting_notes', $sources)) {
            $meetings = $this->extractMeetingNotes($cutoffDate);
            if (!empty($meetings)) {
                $sections[] = "\n--- Strategic Discovery & Meeting Notes ---";
                foreach ($meetings as $m) {
                    $sections[] = "- {$m['lead_name']} ({$m['date']}) [{$m['title']}]: " . mb_substr(strip_tags($m['content']), 0, 200);
                }
                $totalSampled += count($meetings);
            }
        }

        // 6. Client Emails
        if ($allSources || in_array('client_emails', $sources)) {
            $emails = $this->extractClientEmails($cutoffDate);
            if (!empty($emails)) {
                $sections[] = "\n--- Recent Client Email Inquiries ---";
                foreach ($emails as $em) {
                    $sections[] = "- {$em['lead_name']} ({$em['date']}) [{$em['title']}]: " . mb_substr(strip_tags($em['content']), 0, 180);
                }
                $totalSampled += count($emails);
            }
        }

        if ($totalSampled === 0) {
            $sections[] = "\n(No CRM records matched the active sources in the selected temporal horizon. Rehearsal will ground purely on scenario text.)";
        }

        $fullText = implode("\n", $sections);

        // Enforce character budget safeguard
        if (mb_strlen($fullText) > $maxCharacters) {
            $fullText = mb_substr($fullText, 0, $maxCharacters) . "\n...[Additional historical records truncated to preserve context window budget]...";
        }

        return [
            'lookback_months' => $lookbackMonths,
            'cutoff_date' => $cutoffDate,
            'total_items_sampled' => $totalSampled,
            'active_sources' => $sources,
            'character_count' => mb_strlen($fullText),
            'formatted_context' => $fullText
        ];
    }

    private function formatLeadLine(array $c): string {
        $line = "- [{$c['client_type']}] {$c['name']}";
        if (!empty($c['industry'])) $line .= " | Industry: {$c['industry']}";
        if (!empty($c['organization_size'])) $line .= " | Size: {$c['organization_size']}";
        if (!empty($c['city'])) $line .= " | Loc: {$c['city']}, {$c['country']}";
        if (!empty($c['value']) && $c['value'] > 0) $line .= " | Deal Value: €" . number_format($c['value'], 0);
        if (!empty($c['notes'])) $line .= "\n  Context: " . mb_substr(strip_tags($c['notes']), 0, 160);
        return $line;
    }

    private function extractActiveLeads(string $cutoffDate): array {
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
                  AND `status` NOT IN ('won', 'lost', 'archived')
                ORDER BY `value` DESC, `updated_at` DESC
                LIMIT 40
            ");
            $stmt->execute([$cutoffDate]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            return [];
        }
    }

    private function extractExistingClients(string $cutoffDate): array {
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
                  AND (`status` = 'won' OR `client_type` = 'partner' OR `value` > 5000)
                ORDER BY `value` DESC, `updated_at` DESC
                LIMIT 40
            ");
            $stmt->execute([$cutoffDate]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            return [];
        }
    }

    private function extractRecentObjections(string $cutoffDate): array {
        try {
            $stmt = $this->pdo->prepare("
                SELECT te.`title`, te.`content`, te.`created_at` as `date`, l.`name` as `lead_name`
                FROM `timeline_events` te
                JOIN `leads` l ON te.`lead_id` = l.`id`
                WHERE te.`created_at` >= ?
                  AND (
                    te.`content` LIKE '%cena%' OR te.`content` LIKE '%drah%' 
                    OR te.`content` LIKE '%price%' OR te.`content` LIKE '%expensive%'
                    OR te.`content` LIKE '%odmiet%' OR te.`content` LIKE '%reject%'
                  )
                ORDER BY te.`created_at` DESC
                LIMIT 25
            ");
            $stmt->execute([$cutoffDate]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            return [];
        }
    }

    private function extractCompetitorIntel(string $cutoffDate): array {
        try {
            $stmt = $this->pdo->prepare("
                SELECT te.`title`, te.`content`, te.`created_at` as `date`, l.`name` as `lead_name`
                FROM `timeline_events` te
                JOIN `leads` l ON te.`lead_id` = l.`id`
                WHERE te.`created_at` >= ?
                  AND (
                    te.`content` LIKE '%konkuren%' OR te.`content` LIKE '%compet%'
                    OR te.`content` LIKE '%vendor%' OR te.`content` LIKE '%alternat%'
                  )
                ORDER BY te.`created_at` DESC
                LIMIT 25
            ");
            $stmt->execute([$cutoffDate]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            return [];
        }
    }

    private function extractMeetingNotes(string $cutoffDate): array {
        try {
            $stmt = $this->pdo->prepare("
                SELECT te.`title`, te.`content`, te.`created_at` as `date`, l.`name` as `lead_name`
                FROM `timeline_events` te
                JOIN `leads` l ON te.`lead_id` = l.`id`
                WHERE te.`created_at` >= ?
                  AND (
                    te.`type` = 'meeting' 
                    OR te.`title` LIKE '%meeting%' OR te.`title` LIKE '%stretnutie%'
                    OR te.`title` LIKE '%rokovanie%' OR te.`title` LIKE '%call%'
                  )
                ORDER BY te.`created_at` DESC
                LIMIT 25
            ");
            $stmt->execute([$cutoffDate]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            return [];
        }
    }

    private function extractClientEmails(string $cutoffDate): array {
        try {
            $stmt = $this->pdo->prepare("
                SELECT te.`title`, te.`content`, te.`created_at` as `date`, l.`name` as `lead_name`
                FROM `timeline_events` te
                JOIN `leads` l ON te.`lead_id` = l.`id`
                WHERE te.`created_at` >= ?
                  AND (te.`type` = 'email' OR te.`title` LIKE '%email%')
                ORDER BY te.`created_at` DESC
                LIMIT 25
            ");
            $stmt->execute([$cutoffDate]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            return [];
        }
    }
}
