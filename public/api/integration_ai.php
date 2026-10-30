<?php
/**
 * Machine API v1 — the CCRM OpenAI key for WAAI (docs/WAAI-INTEGRATION.md §4.1).
 * Required by integration.php.
 */

if (!function_exists('ccrm_int_handle_ai_openai_key')) {

    /**
     * GET /ai/openai-key: the key an administrator saved in Settings → AI integration, decrypted, so WAAI
     * can use it while it has no key of its own. `key` is null when none is saved. The response is
     * `Cache-Control: no-store` (set by integration.php) and the key is never logged.
     *
     * @return array{0: int, 1: array}
     */
    function ccrm_int_handle_ai_openai_key(\PDO $pdo, array $client, array $req): array {
        require_once __DIR__ . '/auth.php';
        $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'INTEGRATIONS_CONFIG'");
        $stmt->execute();
        $config = json_decode((string)$stmt->fetchColumn(), true);
        $config = is_array($config) ? ccrm_decrypt_config_secrets($config, ccrm_integration_secret_keys()) : [];
        $key = trim((string)($config['openAiKey'] ?? ''));
        return [200, ['key' => $key !== '' && $key !== CCRM_SECRET_MASK ? $key : null]];
    }
}
