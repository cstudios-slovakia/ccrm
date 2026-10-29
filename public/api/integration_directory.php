<?php
/**
 * Machine API v1 — people and (later) the client/project directory
 * (docs/WAAI-INTEGRATION.md §4.1). Required by integration.php.
 */

if (!function_exists('ccrm_int_handle_users')) {

    /**
     * GET /users: every CCRM user (the users table has no "inactive" state — a user who cannot log in is
     * deleted). `phone` is the raw phone of the linked employee, or null; WAAI normalises it.
     *
     * @return array{0: int, 1: array}
     */
    function ccrm_int_handle_users(\PDO $pdo, array $client, array $req): array {
        $rows = $pdo->query(
            "SELECT u.`id`, u.`name`, u.`email`, e.`phone`
               FROM `users` u
               LEFT JOIN `employees` e ON e.`user_id` = u.`id`
              ORDER BY u.`id`"
        )->fetchAll(\PDO::FETCH_ASSOC);

        return [200, ['users' => array_map(static function (array $u): array {
            $phone = trim((string)($u['phone'] ?? ''));
            return [
                'id' => (string)$u['id'],
                'name' => (string)$u['name'],
                'email' => (string)$u['email'],
                'phone' => $phone !== '' ? $phone : null,
            ];
        }, $rows)]];
    }
}
