<?php
namespace CCRM\Swarm;

use PDO;
use Exception;

/**
 * SwarmManager
 * Handles dynamic table sharding (sim<sim_id>_*), simulation registry,
 * checkpointing, and safe table dropping for the SAI module.
 */
class SwarmManager {
    private PDO $pdo;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
        $this->ensureRegistryTableExists();
    }

    /**
     * Ensures the global simulation registry table exists.
     */
    public function ensureRegistryTableExists(): void {
        $sql = "CREATE TABLE IF NOT EXISTS `swarm_simulations` (
            `id` VARCHAR(36) PRIMARY KEY,
            `table_prefix` VARCHAR(50) NOT NULL,
            `title` VARCHAR(255) NOT NULL,
            `hypothesis` TEXT NOT NULL,
            `seed_document` MEDIUMTEXT,
            `lookback_months` INT DEFAULT 12,
            `swarm_scale` INT DEFAULT 30,
            `total_rounds` INT DEFAULT 15,
            `current_round` INT DEFAULT 0,
            `status` ENUM('draft', 'prepared', 'running', 'paused', 'completed', 'failed') DEFAULT 'draft',
            `checkpoint_state` LONGTEXT NULL,
            `final_report` MEDIUMTEXT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_swarm_status (`status`),
            INDEX idx_swarm_created (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

        $this->pdo->exec($sql);
    }

    /**
     * Sanitize simulation ID to be strictly alphanumeric and safe for SQL table names.
     */
    public static function sanitizeId(string $id): string {
        $clean = preg_replace('/[^a-zA-Z0-9_]/', '', $id);
        return substr($clean, 0, 32);
    }

    /**
     * Creates a new simulation entry and sets up its isolated sharded tables.
     */
    public function createSimulation(array $data): array {
        $rawId = $data['id'] ?? ('sim_' . substr(bin2hex(random_bytes(6)), 0, 10));
        $simId = self::sanitizeId($rawId);
        $prefix = 'sim' . $simId . '_';

        $title = trim($data['title'] ?? 'Untitled Rehearsal');
        $hypothesis = trim($data['hypothesis'] ?? '');
        $seedDoc = $data['seed_document'] ?? '';
        $lookbackMonths = (int)($data['lookback_months'] ?? 12);
        $swarmScale = (int)($data['swarm_scale'] ?? 30);
        $totalRounds = (int)($data['total_rounds'] ?? 15);

        // 1. Create Sharded Dynamic Tables for this specific simulation
        $this->createShardedTables($prefix);

        // 2. Register into master table
        $stmt = $this->pdo->prepare("
            INSERT INTO `swarm_simulations` 
            (`id`, `table_prefix`, `title`, `hypothesis`, `seed_document`, `lookback_months`, `swarm_scale`, `total_rounds`, `status`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'prepared')
            ON DUPLICATE KEY UPDATE 
                `title` = VALUES(`title`),
                `hypothesis` = VALUES(`hypothesis`),
                `seed_document` = VALUES(`seed_document`),
                `lookback_months` = VALUES(`lookback_months`),
                `swarm_scale` = VALUES(`swarm_scale`),
                `total_rounds` = VALUES(`total_rounds`),
                `status` = 'prepared'
        ");
        $stmt->execute([$simId, $prefix, $title, $hypothesis, $seedDoc, $lookbackMonths, $swarmScale, $totalRounds]);

        return [
            'success' => true,
            'id' => $simId,
            'table_prefix' => $prefix,
            'title' => $title,
            'status' => 'prepared'
        ];
    }

    /**
     * Creates the 4 dedicated tables for the simulation.
     */
    private function createShardedTables(string $prefix): void {
        $sqls = [
            // 1. Knowledge Graph Nodes
            "CREATE TABLE IF NOT EXISTS `{$prefix}nodes` (
                `id` VARCHAR(36) PRIMARY KEY,
                `entity_name` VARCHAR(150) NOT NULL,
                `entity_type` VARCHAR(100) NOT NULL,
                `summary` TEXT,
                `attributes` JSON,
                `source_crm_id` VARCHAR(50) NULL,
                INDEX idx_node_type (`entity_type`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // 2. Knowledge Graph Edges
            "CREATE TABLE IF NOT EXISTS `{$prefix}edges` (
                `id` VARCHAR(36) PRIMARY KEY,
                `source_node_id` VARCHAR(36) NOT NULL,
                `target_node_id` VARCHAR(36) NOT NULL,
                `relation_name` VARCHAR(100) NOT NULL,
                `fact` TEXT,
                `valid_from_round` INT DEFAULT 0,
                `invalid_from_round` INT NULL,
                INDEX idx_edge_src (`source_node_id`),
                INDEX idx_edge_tgt (`target_node_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // 3. Agent Personas
            "CREATE TABLE IF NOT EXISTS `{$prefix}agents` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `agent_index` INT NOT NULL,
                `username` VARCHAR(100) NOT NULL,
                `display_name` VARCHAR(150) NOT NULL,
                `profession` VARCHAR(100),
                `mbti` VARCHAR(4),
                `stance` VARCHAR(50) DEFAULT 'neutral',
                `user_char` TEXT NOT NULL,
                `public_bio` TEXT,
                `follower_count` INT DEFAULT 100,
                INDEX idx_agent_idx (`agent_index`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

            // 4. Social Feed Trace Log
            "CREATE TABLE IF NOT EXISTS `{$prefix}posts` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `round_num` INT NOT NULL,
                `agent_id` INT NOT NULL,
                `platform` ENUM('twitter', 'reddit') NOT NULL,
                `action_type` ENUM('POST', 'REPOST', 'QUOTE', 'LIKE', 'COMMENT') NOT NULL,
                `target_post_id` INT NULL,
                `content` TEXT,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_post_round (`round_num`),
                INDEX idx_post_agent (`agent_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
        ];

        foreach ($sqls as $sql) {
            $this->pdo->exec($sql);
        }
    }

    /**
     * Saves an asynchronous round checkpoint from the browser runtime.
     */
    public function saveCheckpoint(string $simId, int $round, array $snapshot, ?array $newPosts = null): array {
        $simId = self::sanitizeId($simId);
        $prefix = 'sim' . $simId . '_';

        // 1. Insert new posts if provided
        if (!empty($newPosts)) {
            $stmtPost = $this->pdo->prepare("
                INSERT INTO `{$prefix}posts` 
                (`round_num`, `agent_id`, `platform`, `action_type`, `target_post_id`, `content`)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($newPosts as $p) {
                $stmtPost->execute([
                    $round,
                    (int)($p['agent_id'] ?? 0),
                    ($p['platform'] ?? 'twitter') === 'reddit' ? 'reddit' : 'twitter',
                    strtoupper($p['action_type'] ?? 'POST'),
                    !empty($p['target_post_id']) ? (int)$p['target_post_id'] : null,
                    $p['content'] ?? ''
                ]);
            }
        }

        // 2. Update master checkpoint state
        $serializedState = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        $status = ($round >= (int)($snapshot['total_rounds'] ?? 15)) ? 'completed' : 'running';
        $finalReport = $snapshot['final_report'] ?? null;

        $stmt = $this->pdo->prepare("
            UPDATE `swarm_simulations` 
            SET `current_round` = ?,
                `checkpoint_state` = ?,
                `status` = ?,
                `final_report` = COALESCE(?, `final_report`),
                `updated_at` = CURRENT_TIMESTAMP
            WHERE `id` = ?
        ");
        $stmt->execute([$round, $serializedState, $status, $finalReport, $simId]);

        return [
            'success' => true,
            'round' => $round,
            'status' => $status
        ];
    }

    /**
     * Retrieves the checkpoint state to resume after a browser reload.
     */
    public function getResumeState(string $simId): ?array {
        $simId = self::sanitizeId($simId);
        $stmt = $this->pdo->prepare("SELECT * FROM `swarm_simulations` WHERE `id` = ?");
        $stmt->execute([$simId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return null;

        $state = !empty($row['checkpoint_state']) ? json_decode($row['checkpoint_state'], true) : [];
        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'hypothesis' => $row['hypothesis'],
            'lookback_months' => (int)$row['lookback_months'],
            'swarm_scale' => (int)$row['swarm_scale'],
            'total_rounds' => (int)$row['total_rounds'],
            'current_round' => (int)$row['current_round'],
            'status' => $row['status'],
            'final_report' => $row['final_report'],
            'checkpoint' => $state
        ];
    }

    /**
     * Lists all simulation rehearsals.
     */
    public function listSimulations(): array {
        $stmt = $this->pdo->query("
            SELECT `id`, `title`, `hypothesis`, `lookback_months`, `swarm_scale`, 
                   `total_rounds`, `current_round`, `status`, `created_at`, `updated_at`
            FROM `swarm_simulations`
            ORDER BY `created_at` DESC
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Drops the dedicated sharded tables and removes the simulation entry.
     */
    public function deleteSimulation(string $simId): bool {
        $simId = self::sanitizeId($simId);
        $stmt = $this->pdo->prepare("SELECT `table_prefix` FROM `swarm_simulations` WHERE `id` = ?");
        $stmt->execute([$simId]);
        $prefix = $stmt->fetchColumn();

        if ($prefix) {
            $prefix = preg_replace('/[^a-zA-Z0-9_]/', '', $prefix);
            $this->pdo->exec("DROP TABLE IF EXISTS `{$prefix}nodes`, `{$prefix}edges`, `{$prefix}agents`, `{$prefix}posts`;");
        }

        $delStmt = $this->pdo->prepare("DELETE FROM `swarm_simulations` WHERE `id` = ?");
        return $delStmt->execute([$simId]);
    }
}
