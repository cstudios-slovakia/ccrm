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

/** Why Toggl stopped answering, as the server reports it (`ccrm_toggl_failure`). */
export interface TogglProblem {
  reason: "quota" | "rate_limited" | "auth" | "unavailable";
  /** HTTP status of Toggl's answer; 0 when there was none. */
  status: number;
  /** Seconds Toggl asks to wait; 0 when it did not say. */
  retryIn: number;
}

/** Reads the server's `problem` field; anything that is not one gives null. */
export const parseTogglProblem = (value: unknown): TogglProblem | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const reason = v.reason;
  if (reason !== "quota" && reason !== "rate_limited" && reason !== "auth" && reason !== "unavailable") return null;
  return { reason, status: Number(v.status) || 0, retryIn: Math.max(0, Number(v.retryIn) || 0) };
};

/** One sentence that says why Toggl stopped answering and what to do, in the UI language. */
export const togglProblemMessage = (problem: TogglProblem, t: (en: string, sk: string, hu: string) => string): string => {
  const minutes = Math.max(1, Math.ceil(problem.retryIn / 60));
  switch (problem.reason) {
    case "quota":
      return problem.retryIn > 0
        ? t(
            `Toggl's hourly request limit for this API token is used up. Try again in about ${minutes} min.`,
            `Hodinový limit požiadaviek Toggl pre tento API token je vyčerpaný. Skúste to znova približne o ${minutes} min.`,
            `Ennek az API-tokennek az óránkénti Toggl-kéréskerete elfogyott. Próbálja újra körülbelül ${minutes} perc múlva.`,
          )
        : t(
            "Toggl's hourly request limit for this API token is used up. Try again in an hour.",
            "Hodinový limit požiadaviek Toggl pre tento API token je vyčerpaný. Skúste to znova o hodinu.",
            "Ennek az API-tokennek az óránkénti Toggl-kéréskerete elfogyott. Próbálja újra egy óra múlva.",
          );
    case "rate_limited":
      return t(
        "Toggl is getting too many requests right now. Wait a minute and try again.",
        "Toggl práve dostáva príliš veľa požiadaviek. Počkajte minútu a skúste znova.",
        "A Toggl most túl sok kérést kap. Várjon egy percet, és próbálja újra.",
      );
    case "auth":
      return t(
        `Toggl refused the API token (HTTP ${problem.status}). Check the token and its access to the workspace.`,
        `Toggl odmietol API token (HTTP ${problem.status}). Skontrolujte token a jeho prístup k pracovnému priestoru.`,
        `A Toggl elutasította az API-tokent (HTTP ${problem.status}). Ellenőrizze a tokent és a munkaterülethez való hozzáférését.`,
      );
    default:
      return problem.status > 0
        ? t(
            `Toggl answered with an error (HTTP ${problem.status}). Try again in a while.`,
            `Toggl odpovedal chybou (HTTP ${problem.status}). Skúste to znova o chvíľu.`,
            `A Toggl hibával válaszolt (HTTP ${problem.status}). Próbálja újra kicsit később.`,
          )
        : t(
            "Toggl could not be reached. Try again in a while.",
            "Toggl sa nepodarilo kontaktovať. Skúste to znova o chvíľu.",
            "A Toggl nem érhető el. Próbálja újra kicsit később.",
          );
  }
};
