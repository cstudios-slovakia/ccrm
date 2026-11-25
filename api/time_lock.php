<?php
/**
 * Time tracking v2 (D5.1): the per-user lock that serialises every timer mutation, and the
 * user's running entries.
 *
 * Several entries of one user may run at once, so the database no longer has a unique key that
 * refuses a second running row. Instead every timer mutation (start, stop, undo of a start, and
 * any write that touches a running entry) runs in a transaction that first locks the user's
 * `time_presence` row:
 *
 *   ccrm_tt_lock_prepare($pdo, $userId);   // BEFORE beginTransaction(): INSERT IGNORE the row
 *   $pdo->beginTransaction();
 *   ccrm_tt_lock_user($pdo, $userId);      // first statement: SELECT ... FOR UPDATE
 *   ... read the running rows (ccrm_tt_running_rows, a plain read), write, settle ...
 *   $pdo->commit();
 *
 * The presence lock must be the FIRST statement of the transaction. InnoDB (REPEATABLE READ)
 * creates a transaction's snapshot at its first non-locking read; when that read comes after the
 * lock, it sees everything the previous holder committed. A plain SELECT before the lock would
 * pin an older snapshot, and the running rows read afterwards could be stale. Do every lookup
 * that needs no lock (permissions, settings, the owner's scope) before beginTransaction().
 *
 * The running rows are read WITHOUT `FOR UPDATE`: the presence row already serialises each user,
 * and a locking read on the non-unique `idx_te_running` takes next-key (gap) locks that two
 * different users' transactions can cross into a deadlock.
 *
 * The row is created outside the transaction on purpose: an INSERT IGNORE inside it takes a
 * shared lock on an existing row, and two transactions that both hold it and then ask for the
 * exclusive one deadlock. ccrm_tt_lock_user() still creates the row itself when the caller
 * skipped ccrm_tt_lock_prepare() (the first timer action of that user ever).
 */

if (!function_exists('ccrm_tt_lock_user')) {

    /** Make sure the user's time_presence row exists. Call outside (before) the transaction. */
    function ccrm_tt_lock_prepare(\PDO $pdo, string $userId): void {
        if ($userId === '') {
            return;
        }
        $pdo->prepare("INSERT IGNORE INTO `time_presence` (`user_id`) VALUES (?)")->execute([$userId]);
    }

    /**
     * Lock the user's timer state until the current transaction ends. Must run inside a
     * transaction, as its first statement, so every read after it sees what the previous holder
     * committed.
     */
    function ccrm_tt_lock_user(\PDO $pdo, string $userId): void {
        if ($userId === '') {
            return;
        }
        if (!$pdo->inTransaction()) {
            throw new \LogicException('ccrm_tt_lock_user() needs an open transaction');
        }
        $sel = $pdo->prepare("SELECT `user_id` FROM `time_presence` WHERE `user_id` = ? FOR UPDATE");
        $sel->execute([$userId]);
        if ($sel->fetchColumn() !== false) {
            return;
        }
        $pdo->prepare("INSERT IGNORE INTO `time_presence` (`user_id`) VALUES (?)")->execute([$userId]);
        $sel->execute([$userId]);
        $sel->fetchColumn();
    }

    /**
     * Every running entry of the user (start set, no end, not deleted), oldest start first.
     * Always a plain (non-locking) read. $lock is kept for callers that mark "I hold the user's
     * lock": under ccrm_tt_lock_user() taken as the transaction's first statement, the plain read
     * already sees the latest committed rows (see the header), without gap locks on the
     * non-unique `idx_te_running` that could deadlock two users.
     */
    function ccrm_tt_running_rows(\PDO $pdo, string $userId, bool $lock = false): array {
        $realTasks = function_exists('ccrm_sql_real_tasks')
            ? ccrm_sql_real_tasks('t')
            : "(t.`task_kind` IS NULL OR t.`task_kind` <> 'recurring')";
        $stmt = $pdo->prepare(
            "SELECT te.*, COALESCE(NULLIF(t.`related_project_id`, ''), NULLIF(te.`project_id`, ''), NULLIF(k.`project_id`, '')) AS `eff_project_id`
             FROM `time_entries` te
             LEFT JOIN `tasks` t ON t.`id` = te.`task_id` AND {$realTasks}
             LEFT JOIN `tickets` k ON k.`id` = te.`ticket_id`
             WHERE te.`running_guard` = ?
             ORDER BY te.`start_at` ASC, te.`id` ASC"
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }
}
