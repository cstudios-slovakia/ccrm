/**
 * Idempotency key for the one-way Toggl importer (C14, B10).
 *
 * An imported row is `source = 'toggl'` and `external_id` = the Toggl time-entry id.
 * The database unique key is `(source, external_id)`, so importing the same id again
 * inserts nothing. This module is pure — the HTTP call lives in `time_entries.php`
 * and reuses `toggl_curl` in `time_tracking_lib.php`.
 */

export interface TogglImportKey {
  source: "toggl";
  externalId: string;
}

/** The key one Toggl time entry becomes. Empty ids are not importable. */
export const togglImportKey = (togglId: string | number): TogglImportKey => ({
  source: "toggl",
  externalId: String(togglId).trim(),
});

/**
 * How many distinct incoming Toggl ids are already stored.
 * Repeating an id in `incoming` counts once — a second import of the same entry is a no-op.
 */
export const countAlreadyImported = (incoming: readonly (string | number)[], existingExternalIds: ReadonlySet<string>): number => {
  const seen = new Set<string>();
  let count = 0;
  for (const id of incoming) {
    const key = togglImportKey(id).externalId;
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    if (existingExternalIds.has(key)) count += 1;
  }
  return count;
};
