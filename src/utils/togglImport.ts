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

/** The server accepts at most this many days per import request; a longer period is split. */
export const TOGGL_IMPORT_WINDOW_DAYS = 92;

const DAY_MS = 86_400_000;
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/**
 * Splits an inclusive `from`–`to` period (YYYY-MM-DD) into consecutive inclusive windows of at
 * most `maxDays` days, so a multi-year import runs as several short requests instead of one
 * that the server refuses or that times out. An invalid or reversed period gives no windows.
 */
export const splitImportRange = (from: string, to: string, maxDays = TOGGL_IMPORT_WINDOW_DAYS): { from: string; to: string }[] => {
  const start = dayMs(from);
  const end = dayMs(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || maxDays < 1) return [];
  const out: { from: string; to: string }[] = [];
  for (let cur = start; cur <= end; cur += maxDays * DAY_MS) {
    out.push({ from: isoDay(cur), to: isoDay(Math.min(cur + (maxDays - 1) * DAY_MS, end)) });
  }
  return out;
};
