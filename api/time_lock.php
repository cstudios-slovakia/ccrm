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
 *   ... read the running rows (ccrm_tt_running_rows, a locking read), write, settle ...
 *   $pdo->commit();
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
     * $lock = a locking read (FOR UPDATE): always the latest committed rows, for use under the lock.
     */
    function ccrm_tt_running_rows(\PDO $pdo, string $userId, bool $lock = false): array {
        $stmt = $pdo->prepare("SELECT * FROM `time_entries` WHERE `running_guard` = ? ORDER BY `start_at` ASC, `id` ASC" . ($lock ? ' FOR UPDATE' : ''));
        $stmt->execute([$userId]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }
}
