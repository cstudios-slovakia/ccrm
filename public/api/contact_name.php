<?php
/**
 * Contact first and last name of a lead or client (docs/NEWSLETTER.md C18, decision B1.5).
 *
 * `leads.contact_person` stays the full name everyone reads (search, MCP, orders, tickets, offers,
 * the vector index). `contact_first_name` / `contact_last_name` are the typed parts, the way
 * employees keep `first_name` / `last_name` (employee_name.php); the newsletter reads the first name.
 * Rule, the same as composeContactName() in src/utils/contactName.ts: when either part is filled,
 * contact_person = trim(first + ' ' + last), given name first (no order by language); when both are
 * empty, contact_person is kept as it is.
 *
 * - ccrm_compose_contact_name(): the rule, pure.
 * - ccrm_contact_parts_from_person(): the parts of a full name; both null when a guess would be wrong.
 * - ccrm_set_contact_parts_from_person(): for every writer that sets only `contact_person`.
 * - ccrm_backfill_contact_names(): once, for rows that predate the columns (run by api/schema.php).
 *
 * Loaded by api/schema.php, so it is part of ccrm_schema_fingerprint().
 */

require_once __DIR__ . '/employee_name.php';

if (!function_exists('ccrm_compose_contact_name')) {

    /** The full contact name for a pair of parts; $person (the current full name) when both are empty. */
    function ccrm_compose_contact_name(?string $first, ?string $last, ?string $person = null): string {
        $full = trim(trim((string)$first) . ' ' . trim((string)$last));
        return $full !== '' ? $full : trim((string)$person);
    }

    /**
     * The parts of a full contact name, as the columns hold them: both null when
     * ccrm_split_person_name() cannot tell (empty, one word, a comma, a trailing title).
     *
     * @return array{0:?string,1:?string}
     */
    function ccrm_contact_parts_from_person(?string $person): array {
        $split = ccrm_split_person_name((string)$person);
        return $split === null ? [null, null] : [$split[0], $split[1]];
    }

    /**
     * What sync.php stores as a pushed lead's contact name, or null to leave the stored values alone.
     * The browser sends `contactFirstName` / `contactLastName` next to `contactPerson`; the full name
     * is composed from the parts here too, so the three never disagree. An older bundle (or a lead
     * created without the form) sends only `contactPerson`: a new or changed full name is split,
     * an unchanged one is "no opinion".
     *
     * @param array      $incoming the pushed lead (camelCase keys)
     * @param array|null $stored   the stored `leads` row, null for a new lead
     * @return array{0:?string,1:?string,2:?string}|null [contact_first_name, contact_last_name, contact_person]
     */
    function ccrm_contact_name_for_sync(array $incoming, ?array $stored): ?array {
        $person = trim((string)($incoming['contactPerson'] ?? ''));
        $orNull = static fn(string $v): ?string => $v === '' ? null : mb_substr($v, 0, 100, 'UTF-8');
        if (array_key_exists('contactFirstName', $incoming) || array_key_exists('contactLastName', $incoming)) {
            $first = trim((string)($incoming['contactFirstName'] ?? ''));
            $last = trim((string)($incoming['contactLastName'] ?? ''));
            return [$orNull($first), $orNull($last), $orNull(ccrm_compose_contact_name($first, $last, $person))];
        }
        if ($stored !== null && trim((string)($stored['contact_person'] ?? '')) === $person) {
            return null;
        }
        [$first, $last] = ccrm_contact_parts_from_person($person);
        return [$first === null ? null : $orNull($first), $last === null ? null : $orNull($last), $orNull($person)];
    }

    /**
     * Keeps the parts equal to `contact_person` after a writer set only the full name (MCP tools,
     * workflows, orders, the web form, voice copilot). Never throws: a database without the
     * columns yet simply keeps the full name, which is all it had before.
     */
    function ccrm_set_contact_parts_from_person(PDO $pdo, string $leadId): void {
        try {
            $stmt = $pdo->prepare("SELECT `contact_person` FROM `leads` WHERE `id` = ?");
            $stmt->execute([$leadId]);
            $person = $stmt->fetchColumn();
            if ($person === false) {
                return;
            }
            [$first, $last] = ccrm_contact_parts_from_person($person === null ? null : (string)$person);
            $pdo->prepare("UPDATE `leads` SET `contact_first_name` = ?, `contact_last_name` = ? WHERE `id` = ?")
                ->execute([$first, $last, $leadId]);
        } catch (\Throwable $e) {
            error_log('[ccrm] contact name parts not updated: ' . $e->getMessage());
        }
    }

    /**
     * One-time split of the contact persons saved before the columns existed. Only rows with a
     * contact_person and BOTH parts NULL are touched, so typed parts are never overwritten, and a
     * row that cannot be split safely stays empty for a person to complete. Guarded by a settings
     * marker, so a contact somebody later clears is not split again.
     *
     * @return int rows that received a first and last name
     */
    function ccrm_backfill_contact_names(PDO $pdo): int {
        try {
            if ($pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'CONTACT_NAME_BACKFILL'")->fetchColumn() !== false) {
                return 0; // Already run on this install.
            }
            $rows = $pdo->query(
                "SELECT `id`, `contact_person` FROM `leads`
                 WHERE `contact_person` IS NOT NULL AND `contact_person` <> ''
                   AND `contact_first_name` IS NULL AND `contact_last_name` IS NULL"
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $upd = $pdo->prepare(
                "UPDATE `leads` SET `contact_first_name` = ?, `contact_last_name` = ?
                 WHERE `id` = ? AND `contact_first_name` IS NULL AND `contact_last_name` IS NULL"
            );
            $done = 0;
            foreach ($rows as $r) {
                [$first, $last] = ccrm_contact_parts_from_person((string)$r['contact_person']);
                if ($first === null) {
                    continue;
                }
                $upd->execute([$first, $last, $r['id']]);
                $done += $upd->rowCount();
            }
            $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('CONTACT_NAME_BACKFILL', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
                ->execute([(string)$done]);
            return $done;
        } catch (\Throwable $e) {
            // Never block a sync over a name backfill; the marker is not set, so it retries.
            error_log('[ccrm schema] contact name backfill skipped: ' . $e->getMessage());
            return 0;
        }
    }
}
