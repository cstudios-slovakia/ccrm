/*
  Per-phase SLA: how long a lead may sit in one pipeline state before it needs
  attention.

  An operator sets a limit in days per phase (Settings -> Pipeline stages). A
  lead that has been in that phase longer than the limit without moving on is
  "breached", and the leads list and the lead detail flag it.

  When did the lead enter its phase? Every pipeline move writes a
  `status_change` timeline event (see buildStatusChangeEvent in
  LeadsDatagrid), so the newest one is when the lead last moved. A lead that
  has never moved falls back to `createdAt` — otherwise the very leads sitting
  untouched in the first phase, which is exactly what an SLA is for, would be
  the only ones nothing could be said about.
*/

import type { Lead } from "../types";

/** Lowercased lead-state name -> maximum days a lead may stay in it. */
export type LeadStateSla = Record<string, number>;

export interface LeadSlaStatus {
  /** The configured limit, in days. Always > 0 — a phase without one yields null. */
  limitDays: number;
  /** "YYYY-MM-DD[ HH:MM]" the lead entered its current phase. */
  enteredAt: string;
  /** Whole days spent in the phase so far. */
  daysInPhase: number;
  /** Days past the limit; 0 while still inside it. */
  overdueDays: number;
  isBreached: boolean;
}

const DAY_MS = 86400000;

// Days since the epoch for a "YYYY-MM-DD..." string, read as a plain calendar
// date. Going through UTC midnight keeps the difference between two dates whole
// across a DST boundary, which `new Date(str)` arithmetic does not.
const toDayNumber = (value: string | undefined | null): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : Math.round(ms / DAY_MS);
};

/** A single limit, cleaned up: a positive whole number of days, or 0 for "none". */
export const normalizeSlaDays = (raw: unknown): number => {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Ten years is well past anything meaningful and keeps a fat-fingered paste
  // out of the stored settings.
  return Math.min(Math.floor(n), 3650);
};

/*
  The whole map, cleaned up. Keys are lowercased and sorted and phases without a
  limit are dropped, so "no SLA" has exactly one representation. That matters
  beyond tidiness: computeSettingsSig in App.tsx compares this blob against the
  one the server echoes back, and two spellings of "empty" would make the
  settings-sync effect push forever. Same reasoning as normalizeLeadAssignment.
*/
export const normalizeLeadStateSla = (raw: unknown): LeadStateSla => {
  const out: LeadStateSla = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  Object.keys(src)
    .map((key) => [key.trim().toLowerCase(), normalizeSlaDays(src[key])] as const)
    .filter(([state, days]) => state !== "" && days > 0)
    // Sorted on the lowercased key, not the raw one: "Offer Sent" and
    // "offer sent" have to land in the same place or the signature differs.
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .forEach(([state, days]) => {
      out[state] = days;
    });
  return out;
};

/** True when this phase is terminal — a closed deal cannot "move on" in time. */
const isClosedState = (
  state: string,
  leadStageGroups: Record<string, string>,
  leadStateParents: Record<string, string>,
): boolean => {
  const key = (state || "").toLowerCase();
  if (leadStageGroups[key] === "closed") return true;
  const parent = leadStateParents[key];
  return !!parent && leadStageGroups[parent.toLowerCase()] === "closed";
};

/** When the lead last moved into the phase it is in now. */
export const leadPhaseEnteredAt = (lead: Lead): string => {
  let newest = "";
  (lead.timeline || []).forEach((ev) => {
    if (ev.type !== "status_change") return;
    const ts = String(ev.timestamp ?? "").trim();
    // "YYYY-MM-DD HH:MM" sorts correctly as plain text.
    if (toDayNumber(ts) !== null && ts > newest) newest = ts;
  });
  return newest || lead.createdAt || "";
};

/**
 * The lead's SLA state, or null when nothing is being tracked — no limit set
 * for its phase, the phase is a closed one, or the dates are unreadable.
 *
 * `today` is passed in ("YYYY-MM-DD") so callers share one clock and the tests
 * do not depend on the day they run.
 */
export const evaluateLeadSla = (
  lead: Lead,
  leadStateSla: LeadStateSla,
  leadStageGroups: Record<string, string>,
  leadStateParents: Record<string, string>,
  today: string,
): LeadSlaStatus | null => {
  const key = (lead.status || "").toLowerCase();
  const limitDays = normalizeSlaDays(leadStateSla?.[key]);
  if (!limitDays) return null;
  if (isClosedState(key, leadStageGroups || {}, leadStateParents || {})) return null;

  const enteredAt = leadPhaseEnteredAt(lead);
  const enteredDay = toDayNumber(enteredAt);
  const todayDay = toDayNumber(today);
  if (enteredDay === null || todayDay === null) return null;

  const daysInPhase = Math.max(0, todayDay - enteredDay);
  const overdueDays = daysInPhase - limitDays;
  return {
    limitDays,
    enteredAt,
    daysInPhase,
    overdueDays: Math.max(0, overdueDays),
    isBreached: overdueDays > 0,
  };
};
