/**
 * Time for the in-browser demo (docs/WHATSAPP-DEMO-MODULE.md C5.3). The dataset says `day` (an offset from
 * today) and `time` (`HH:MM`, wall clock in the account's time zone); this turns that into an instant.
 * Pure functions, no I/O.
 */

const partsFormatter = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatter.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatter.set(timeZone, f);
  }
  return f;
}

/** The wall clock of `instant` in `timeZone`, read as if it were UTC (so two of them subtract to an offset). */
function wallClockAsUtc(timeZone: string, instant: number): number {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(instant))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
}

/** Today's calendar date in `timeZone`. */
function todayIn(timeZone: string, now: number): { y: number; m: number; d: number } {
  const wall = new Date(wallClockAsUtc(timeZone, now));
  return { y: wall.getUTCFullYear(), m: wall.getUTCMonth() + 1, d: wall.getUTCDate() };
}

/**
 * The instant at which the wall clock in `timeZone` reads `hhmm` on the day `dayOffset` days from `now`'s date
 * there. The zone's offset is guessed at the naive instant and corrected once at the result (DST edges).
 */
export function zonedInstant(dayOffset: number, hhmm: string, timeZone: string, now: number): number {
  const [hh = 0, mm = 0] = hhmm.split(":").map((n) => Number(n));
  const today = todayIn(timeZone, now);
  const guess = Date.UTC(today.y, today.m - 1, today.d + dayOffset, hh, mm);
  const first = guess - (wallClockAsUtc(timeZone, guess) - guess);
  return guess - (wallClockAsUtc(timeZone, first) - first);
}

/** How far the newest message may sit from now: a `day: 0` message whose time has not come yet is pulled back. */
export const NEWEST_AGE_MS = 5 * 60 * 1000;

/** How many milliseconds every message must move back so the newest is at least five minutes old (0: none). */
export function pastShift(newest: number, now: number): number {
  const limit = now - NEWEST_AGE_MS;
  return newest > limit ? newest - limit : 0;
}
