<?php
/**
 * Contact first and last name of a lead or client (docs/NEWSLETTER.md C18, decisions B1.5 and B1.7).
 *
 * `leads.contact_person` stays the full name everyone reads (search, MCP, orders, tickets, offers,
 * the vector index). `contact_first_name` / `contact_last_name` are the typed parts, the way
 * employees keep `first_name` / `last_name` (employee_name.php); the newsletter reads the first name.
 * Rule, the same as composeContactName() in src/utils/contactName.ts: when either part is filled,
 * contact_person = trim(first + ' ' + last), given name first (no order by language); when both are
 * empty, contact_person is kept as it is.
 *
 * Person records (decision B1.7): for `client_type = 'person'` the parts are the person's OWN first and
 * last name ("Name for greetings"). `name` is never recomposed (client grouping depends on it) and the
 * compose rule does NOT apply: contact_person stays as it is (normally empty). The parts of a person are
 * set from the form, or split from `name` by a writer that had no form.
 *
 * - ccrm_compose_contact_name(): the rule, pure.
 * - ccrm_contact_parts_from_person(): the parts of a full name; both null when a guess would be wrong.
 * - ccrm_set_contact_parts_from_person(): for every writer that sets only a name or `contact_person`.
 * - ccrm_backfill_contact_names(): once, for rows that predate the columns (run by api/schema.php).
 * - ccrm_backfill_person_names(): once, the same for person records, split from `name`.
 *
 * Loaded by api/schema.php, so it is part of ccrm_schema_fingerprint().
 */

require_once __DIR__ . '/employee_name.php';

if (!function_exists('ccrm_compose_contact_name')) {

    /** True for a private person (`leads.client_type`); a business and a partner are not. */
    function ccrm_is_person_type(?string $clientType): bool {
        return trim((string)$clientType) === 'person';
    }

    /**
     * The full contact name for a pair of parts; $person (the current full name) when both are empty.
     * A person record ($isPerson) never gets a contact name composed: $person is returned as it is.
     */
    function ccrm_compose_contact_name(?string $first, ?string $last, ?string $person = null, bool $isPerson = false): string {
        if ($isPerson) {
            return trim((string)$person);
        }
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
     * True when a person's stored parts were not typed: they are empty or still compose to the
     * name they were split from, so a renamed person can be split again. Typed parts (Péter / Kovács
     * for the name "Kovács Péter") do not compose to the name and are kept.
     */
    function ccrm_person_parts_follow_name(?string $first, ?string $last, string $oldName): bool {
        $full = trim(trim((string)$first) . ' ' . trim((string)$last));
        return $full === '' || $full === trim($oldName);
    }

    /**
     * What sync.php stores as a pushed lead's contact name, or null to leave the stored values alone.
     * The browser sends `contactFirstName` / `contactLastName` next to `contactPerson`; for a business
     * the full name is composed from the parts here too, so the three never disagree, for a person
     * `contactPerson` is kept as sent. An older bundle (or a lead created without the form) sends only
     * `contactPerson` and `name`: a new or changed contact name (a person's `name`) is split, an
     * unchanged one is "no opinion". A person whose name changes keeps typed parts.
     *
     * @param array      $incoming the pushed lead (camelCase keys)
     * @param array|null $stored   the stored `leads` row, null for a new lead
     * @return array{0:?string,1:?string,2:?string}|null [contact_first_name, contact_last_name, contact_person]
     */
    function ccrm_contact_name_for_sync(array $incoming, ?array $stored): ?array {
        $person = trim((string)($incoming['contactPerson'] ?? ''));
        $orNull = static fn(string $v): ?string => $v === '' ? null : mb_substr($v, 0, 100, 'UTF-8');
        $storedType = $stored === null ? null : (string)($stored['client_type'] ?? 'person');
        $isPerson = ccrm_is_person_type(array_key_exists('clientType', $incoming) ? (string)$incoming['clientType'] : ($storedType ?? 'person'));
        if (array_key_exists('contactFirstName', $incoming) || array_key_exists('contactLastName', $incoming)) {
            $first = trim((string)($incoming['contactFirstName'] ?? ''));
            $last = trim((string)($incoming['contactLastName'] ?? ''));
            return [$orNull($first), $orNull($last), $orNull(ccrm_compose_contact_name($first, $last, $person, $isPerson))];
        }
        if ($isPerson) {
            $name = trim((string)($incoming['name'] ?? ''));
            if ($stored !== null) {
                if (!ccrm_is_person_type($storedType)) {
                    return null; // Switched type by a bundle that sends no parts: no opinion.
                }
                $oldName = trim((string)($stored['name'] ?? ''));
                if ($oldName === $name) {
                    return null;
                }
                if (!ccrm_person_parts_follow_name($stored['contact_first_name'] ?? null, $stored['contact_last_name'] ?? null, $oldName)) {
                    return null; // Typed by a person: a rename keeps them.
                }
            }
            [$first, $last] = ccrm_contact_parts_from_person($name);
            return [$first === null ? null : $orNull($first), $last === null ? null : $orNull($last), $orNull($person)];
        }
        if ($stored !== null && trim((string)($stored['contact_person'] ?? '')) === $person) {
            return null;
        }
        [$first, $last] = ccrm_contact_parts_from_person($person);
        return [$first === null ? null : $orNull($first), $last === null ? null : $orNull($last), $orNull($person)];
    }

    /**
     * Keeps the parts consistent after a writer set only a name or the full contact name (MCP tools,
     * workflows, orders, the web form, voice copilot). Never throws: a database without the
     * columns yet simply keeps the full name, which is all it had before.
     *
     * A business and a partner: the parts follow `contact_person`. A person: the parts follow `name`
     * and `contact_person` is left alone; on a rename pass the name it had before ($previousName), so
     * parts that still compose to it are split again and typed ones are kept.
     */
    function ccrm_set_contact_parts_from_person(PDO $pdo, string $leadId, ?string $previousName = null): void {
        try {
            $stmt = $pdo->prepare("SELECT `name`, `client_type`, `contact_person`, `contact_first_name`, `contact_last_name` FROM `leads` WHERE `id` = ?");
            $stmt->execute([$leadId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row === false) {
                return;
            }
            $hasParts = trim((string)($row['contact_first_name'] ?? '')) !== '' || trim((string)($row['contact_last_name'] ?? '')) !== '';
            if (ccrm_is_person_type($row['client_type'] ?? null)) {
                $name = trim((string)($row['name'] ?? ''));
                if ($hasParts) {
                    $composed = ccrm_compose_contact_name($row['contact_first_name'], $row['contact_last_name']);
                    // Typed parts stay; so do parts that already match the name; only a rename re-splits.
                    if ($composed === $name || $previousName === null || $composed !== trim($previousName)) {
                        return;
                    }
                }
                [$first, $last] = ccrm_contact_parts_from_person($name);
                if ($first === null && !$hasParts) {
                    return;
                }
                $pdo->prepare("UPDATE `leads` SET `contact_first_name` = ?, `contact_last_name` = ? WHERE `id` = ?")
                    ->execute([$first, $last, $leadId]);
                return;
            }
            $person = $row['contact_person'];
            // The stored parts already compose to this name (e.g. typed "Anna" + "van Dijk"): keep them.
            if ($hasParts && ccrm_compose_contact_name($row['contact_first_name'], $row['contact_last_name']) === trim((string)$person)) {
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
                // `updated_at` pinned: the sync conflict guard compares it with every open tab's baseSyncedAt.
                "UPDATE `leads` SET `contact_first_name` = ?, `contact_last_name` = ?, `updated_at` = `updated_at`
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

    /**
     * One-time split of the person records saved before a person could carry their own name
     * (decision B1.7): `client_type = 'person'`, a name, both parts NULL and an empty contact_person.
     * `name` is split with ccrm_split_person_name(); a row it cannot split stays empty for the person
     * to complete. Own marker (PERSON_NAME_BACKFILL): the 3C one may already be set. `updated_at` is
     * pinned, the sync conflict guard compares it with every open tab's baseSyncedAt.
     *
     * @return int rows that received a first and last name
     */
    function ccrm_backfill_person_names(PDO $pdo): int {
        try {
            if ($pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'PERSON_NAME_BACKFILL'")->fetchColumn() !== false) {
                return 0; // Already run on this install.
            }
            $rows = $pdo->query(
                "SELECT `id`, `name` FROM `leads`
                 WHERE `client_type` = 'person' AND `name` IS NOT NULL AND `name` <> ''
                   AND (`contact_person` IS NULL OR `contact_person` = '')
                   AND `contact_first_name` IS NULL AND `contact_last_name` IS NULL"
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $upd = $pdo->prepare(
                "UPDATE `leads` SET `contact_first_name` = ?, `contact_last_name` = ?, `updated_at` = `updated_at`
                 WHERE `id` = ? AND `contact_first_name` IS NULL AND `contact_last_name` IS NULL"
            );
            $done = 0;
            foreach ($rows as $r) {
                [$first, $last] = ccrm_contact_parts_from_person((string)$r['name']);
                if ($first === null) {
                    continue;
                }
                $upd->execute([$first, $last, $r['id']]);
                $done += $upd->rowCount();
            }
            $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES ('PERSON_NAME_BACKFILL', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")
                ->execute([(string)$done]);
            return $done;
        } catch (\Throwable $e) {
            // Never block a sync over a name backfill; the marker is not set, so it retries.
            error_log('[ccrm schema] person name backfill skipped: ' . $e->getMessage());
            return 0;
        }
    }
}
