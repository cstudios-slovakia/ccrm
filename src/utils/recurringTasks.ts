/**
 * Pure recurrence engine for recurring tasks in CCRM.
 *
 * Implements schedule mode, after-completion mode, weekend rules, lead days,
 * interval anchoring, pause/resume cursor shifting, and human-readable recurrence descriptions.
 *
 * Works entirely in UTC string dates (YYYY-MM-DD) to prevent timezone drift.
 * Must match backend logic in `public/api/recurring_tasks.php` 1:1.
 */

import type {
  TaskRecurrence,
  TaskRecurrenceFrequency,
  TaskWeekendRule,
} from "../types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && ISO_DATE.test(value);

const toIso = (date: Date): string => date.toISOString().slice(0, 10);

const fromIso = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

export const daysInMonth = (year: number, month1to12: number): number =>
  new Date(Date.UTC(year, month1to12, 0)).getUTCDate();

export const clampDay = (year: number, month1to12: number, day: number): number => {
  const dim = daysInMonth(year, month1to12);
  return Math.min(Math.max(Math.round(day) || 1, 1), dim);
};

export function shiftIsoDate(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/**
 * Returns date of the nth weekday in a month.
 * month1to12: 1-12.
 * weekday: 0 = Sun, 1 = Mon, ..., 6 = Sat.
 * nth: 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, <= 0 or > 4 = last.
 */
export function nthWeekdayOfMonth(
  year: number,
  month1to12: number,
  weekday: number,
  nth: number
): string {
  const first = new Date(Date.UTC(year, month1to12 - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const dim = daysInMonth(year, month1to12);

  if (nth <= 0 || nth > 4) {
    let day = 1 + offset;
    while (day + 7 <= dim) day += 7;
    return toIso(new Date(Date.UTC(year, month1to12 - 1, day)));
  }

  let day = 1 + offset + (nth - 1) * 7;
  if (day > dim) {
    day -= 7;
  }
  return toIso(new Date(Date.UTC(year, month1to12 - 1, day)));
}

/**
 * Shifts scheduled deadline according to weekend rule.
 * For daily: 'before' or 'after' means weekdays only (skips Sat/Sun).
 * For non-daily: 'before' moves Sat/Sun to Friday; 'after' moves Sat/Sun to Monday.
 */
export function applyWeekendRule(
  isoDate: string,
  weekendRule: TaskWeekendRule,
  frequency: TaskRecurrenceFrequency = "monthly"
): string {
  if (weekendRule === "keep") {
    return isoDate;
  }
  const date = fromIso(isoDate);
  const w = date.getUTCDay(); // 0 = Sun, 6 = Sat

  if (frequency === "daily") {
    if (w === 6) {
      return weekendRule === "before"
        ? shiftIsoDate(isoDate, -1)
        : shiftIsoDate(isoDate, 2);
    }
    if (w === 0) {
      return weekendRule === "before"
        ? shiftIsoDate(isoDate, -2)
        : shiftIsoDate(isoDate, 1);
    }
    return isoDate;
  }

  if (weekendRule === "before") {
    if (w === 6) return shiftIsoDate(isoDate, -1);
    if (w === 0) return shiftIsoDate(isoDate, -2);
  } else if (weekendRule === "after") {
    if (w === 6) return shiftIsoDate(isoDate, 2);
    if (w === 0) return shiftIsoDate(isoDate, 1);
  }

  return isoDate;
}

/**
 * Start date (appearance date) = deadline - leadDays (clamped 0..365).
 */
export function getStartDate(deadline: string, leadDays: number): string {
  const clamped = Math.max(0, Math.min(365, Math.round(leadDays) || 0));
  return shiftIsoDate(deadline, -clamped);
}

/**
 * Computes next unshifted scheduled date for schedule mode.
 * Returns null if the next date is past `endsOn`.
 */
export function getNextOccurrence(
  rec: TaskRecurrence,
  cursor?: string | null
): string | null {
  const startsOn = isIsoDate(rec.startsOn) ? rec.startsOn : toIso(new Date());
  const endsOn = isIsoDate(rec.endsOn) ? rec.endsOn : null;
  const interval = Math.max(1, Math.round(rec.interval) || 1);
  const frequency = rec.frequency || "monthly";
  const config = rec.config || {};
  const weekendRule = rec.weekendRule || "keep";

  let candidate: string | null = null;

  if (frequency === "daily") {
    const weekdaysOnly = weekendRule === "before" || weekendRule === "after";
    if (!cursor) {
      let cur = startsOn;
      if (weekdaysOnly) {
        const w = fromIso(cur).getUTCDay();
        if (w === 6) cur = shiftIsoDate(cur, 2);
        else if (w === 0) cur = shiftIsoDate(cur, 1);
      }
      candidate = cur;
    } else {
      let cur = cursor;
      if (weekdaysOnly) {
        for (let i = 0; i < interval; i++) {
          cur = shiftIsoDate(cur, 1);
          while (fromIso(cur).getUTCDay() === 0 || fromIso(cur).getUTCDay() === 6) {
            cur = shiftIsoDate(cur, 1);
          }
        }
      } else {
        cur = shiftIsoDate(cur, interval);
      }
      candidate = cur;
    }
  } else if (frequency === "weekly") {
    const targetWeekday = (((Number(config.dayOfWeek) || 1) % 7) + 7) % 7;
    const startW = fromIso(startsOn).getUTCDay();
    const offset = (targetWeekday - startW + 7) % 7;
    const firstDate = shiftIsoDate(startsOn, offset);

    if (!cursor) {
      candidate = firstDate;
    } else {
      if (cursor < firstDate) {
        candidate = firstDate;
      } else {
        const diffMs = fromIso(cursor).getTime() - fromIso(firstDate).getTime();
        const diffDays = Math.round(diffMs / 86400000);
        const periodDays = interval * 7;
        const k = Math.floor(diffDays / periodDays) + 1;
        candidate = shiftIsoDate(firstDate, k * periodDays);
      }
    }
  } else if (frequency === "monthly") {
    const monthlyType = config.monthlyType || "day_of_month";

    const getOcc = (y: number, m: number): string => {
      if (monthlyType === "nth_weekday") {
        const dow = (((Number(config.dayOfWeek) || 1) % 7) + 7) % 7;
        const wom = Number(config.weekOfMonth) || 1;
        return nthWeekdayOfMonth(y, m, dow, wom);
      }
      const dom = Number(config.dayOfMonth) || 1;
      const d = clampDay(y, m, dom);
      return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };

    const startY = Number(startsOn.slice(0, 4));
    const startM = Number(startsOn.slice(5, 7));

    let anchorY = startY;
    let anchorM = startM;
    if (getOcc(startY, startM) < startsOn) {
      const anchorIndex = startY * 12 + (startM - 1) + 1;
      anchorY = Math.floor(anchorIndex / 12);
      anchorM = (anchorIndex % 12) + 1;
    }
    const anchorIndex = anchorY * 12 + (anchorM - 1);

    if (!cursor) {
      candidate = getOcc(anchorY, anchorM);
    } else {
      const cursorY = Number(cursor.slice(0, 4));
      const cursorM = Number(cursor.slice(5, 7));
      const cursorIndex = cursorY * 12 + (cursorM - 1);
      const diff = cursorIndex - anchorIndex;
      const k = Math.max(0, Math.floor(diff / interval));

      for (let iter = 0; iter < 1000; iter++) {
        const curIndex = anchorIndex + (k + iter) * interval;
        const y = Math.floor(curIndex / 12);
        const m = (curIndex % 12) + 1;
        const occ = getOcc(y, m);
        if (occ > cursor) {
          candidate = occ;
          break;
        }
      }
    }
  } else if (frequency === "yearly") {
    const targetMonth = Math.min(Math.max(Number(config.month) || 1, 1), 12);
    const targetDom = Number(config.dayOfMonth) || 1;

    const getOcc = (y: number): string => {
      const d = clampDay(y, targetMonth, targetDom);
      return `${String(y).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };

    const startY = Number(startsOn.slice(0, 4));
    let anchorY = startY;
    if (getOcc(startY) < startsOn) {
      anchorY = startY + 1;
    }

    if (!cursor) {
      candidate = getOcc(anchorY);
    } else {
      const cursorY = Number(cursor.slice(0, 4));
      const diff = cursorY - anchorY;
      const k = Math.max(0, Math.floor(diff / interval));

      for (let iter = 0; iter < 1000; iter++) {
        const y = anchorY + (k + iter) * interval;
        const occ = getOcc(y);
        if (occ > cursor) {
          candidate = occ;
          break;
        }
      }
    }
  }

  if (candidate !== null && endsOn !== null && candidate > endsOn) {
    return null;
  }
  return candidate;
}

/**
 * Rule 9: On resume, moves the cursor so that the next occurrence is the first scheduled
 * date on or after the resume date.
 * Returns the new cursor date (string YYYY-MM-DD or null).
 */
export function shiftCursorOnResume(
  rec: TaskRecurrence,
  resumeDate: string
): string | null {
  const firstOcc = getNextOccurrence(rec, null);
  if (firstOcc === null || firstOcc >= resumeDate) {
    return null;
  }

  let prev = firstOcc;
  while (true) {
    const next = getNextOccurrence(rec, prev);
    if (next === null || next >= resumeDate) {
      return prev;
    }
    prev = next;
  }
}

/**
 * Rule 7: After-completion mode next due date computation.
 */
export function getNextAfterCompletion(
  frequency: TaskRecurrenceFrequency,
  interval: number,
  completedDate: string,
  weekendRule: TaskWeekendRule,
  leadDays: number,
  endsOn?: string | null
): { deadline: string; startDate: string } | null {
  const inter = Math.max(1, Math.round(interval) || 1);
  const y = Number(completedDate.slice(0, 4));
  const m = Number(completedDate.slice(5, 7));
  const d = Number(completedDate.slice(8, 10));

  let scheduled = completedDate;
  if (frequency === "daily") {
    scheduled = shiftIsoDate(completedDate, inter);
  } else if (frequency === "weekly") {
    scheduled = shiftIsoDate(completedDate, inter * 7);
  } else if (frequency === "monthly") {
    const targetIndex = y * 12 + (m - 1) + inter;
    const targetY = Math.floor(targetIndex / 12);
    const targetM = (targetIndex % 12) + 1;
    const targetD = clampDay(targetY, targetM, d);
    scheduled = `${String(targetY).padStart(4, "0")}-${String(targetM).padStart(2, "0")}-${String(targetD).padStart(2, "0")}`;
  } else if (frequency === "yearly") {
    const targetY = y + inter;
    const targetD = clampDay(targetY, m, d);
    scheduled = `${String(targetY).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(targetD).padStart(2, "0")}`;
  }

  const deadline = applyWeekendRule(scheduled, weekendRule, frequency);
  if (endsOn && deadline > endsOn) {
    return null;
  }
  const startDate = getStartDate(deadline, leadDays);
  return { deadline, startDate };
}

/**
 * Computes upcoming planned occurrences (for ghost pills or live preview).
 */
export function getNextDueDates(
  rec: TaskRecurrence,
  count: number = 5,
  fromCursor?: string | null
): Array<{ scheduledDate: string; deadline: string; startDate: string }> {
  const result: Array<{ scheduledDate: string; deadline: string; startDate: string }> = [];
  if (rec.mode === "after_completion") {
    return result;
  }

  let cur: string | null = fromCursor ?? rec.lastOccurrence ?? null;

  for (let i = 0; i < count; i++) {
    const next = getNextOccurrence(rec, cur);
    if (!next) break;
    const deadline = applyWeekendRule(next, rec.weekendRule, rec.frequency);
    const startDate = getStartDate(deadline, rec.leadDays);
    result.push({ scheduledDate: next, deadline, startDate });
    cur = next;
  }

  return result;
}

/**
 * Human-readable description of recurrence schedule.
 */
export function describeRecurrence(
  rec: TaskRecurrence,
  lang: "en" | "sk" | "hu" = "en"
): string {
  const interval = Math.max(1, rec.interval || 1);
  const mode = rec.mode || "schedule";
  const freq = rec.frequency || "monthly";

  if (mode === "after_completion") {
    if (lang === "sk") {
      const units: Record<TaskRecurrenceFrequency, string> = {
        daily: interval === 1 ? "deň" : interval < 5 ? "dni" : "dní",
        weekly: interval === 1 ? "týždeň" : interval < 5 ? "týždne" : "týždňov",
        monthly: interval === 1 ? "mesiac" : interval < 5 ? "mesiace" : "mesiacov",
        yearly: interval === 1 ? "rok" : interval < 5 ? "roky" : "rokov",
      };
      return `${interval} ${units[freq]} po dokončení`;
    }
    if (lang === "hu") {
      const units: Record<TaskRecurrenceFrequency, string> = {
        daily: "nap",
        weekly: "hét",
        monthly: "hónap",
        yearly: "év",
      };
      return `${interval} ${units[freq]} a befejezés után`;
    }
    const units: Record<TaskRecurrenceFrequency, string> = {
      daily: interval === 1 ? "day" : "days",
      weekly: interval === 1 ? "week" : "weeks",
      monthly: interval === 1 ? "month" : "months",
      yearly: interval === 1 ? "year" : "years",
    };
    return `${interval} ${units[freq]} after completion`;
  }

  const parts: string[] = [];

  // 1. Cadence
  if (lang === "sk") {
    if (freq === "daily") {
      parts.push(interval === 1 ? "Každý deň" : `Každých ${interval} dní`);
    } else if (freq === "weekly") {
      const weekdays = ["nedeľu", "pondelok", "utorok", "stredu", "štvrtok", "piatok", "sobotu"];
      const dow = ((Number(rec.config?.dayOfWeek) || 1) % 7 + 7) % 7;
      const dayName = weekdays[dow];
      parts.push(interval === 1 ? `Každý týždeň v ${dayName}` : `Každé ${interval} týždne v ${dayName}`);
    } else if (freq === "monthly") {
      if (rec.config?.monthlyType === "nth_weekday") {
        const dow = ((Number(rec.config?.dayOfWeek) || 1) % 7 + 7) % 7;
        const wom = Number(rec.config?.weekOfMonth) || 1;
        const weekdays = ["nedeľu", "pondelok", "utorok", "stredu", "štvrtok", "piatok", "sobotu"];
        const orderStr = wom === -1 || wom > 4 ? "poslednú" : `${wom}.`;
        parts.push(interval === 1 ? `Každý mesiac (${orderStr} ${weekdays[dow]})` : `Každé ${interval} mesiace (${orderStr} ${weekdays[dow]})`);
      } else {
        const dom = Number(rec.config?.dayOfMonth) || 15;
        parts.push(interval === 1 ? `Každý mesiac ${dom}. dňa` : `Každé ${interval} mesiace ${dom}. dňa`);
      }
    } else if (freq === "yearly") {
      parts.push(interval === 1 ? "Každý rok" : `Každé ${interval} roky`);
    }
  } else if (lang === "hu") {
    if (freq === "daily") {
      parts.push(interval === 1 ? "Minden nap" : `Minden ${interval}. nap`);
    } else if (freq === "weekly") {
      const weekdays = ["vasárnap", "hétfőn", "kedden", "szerdán", "csütörtökön", "pénteken", "szombaton"];
      const dow = ((Number(rec.config?.dayOfWeek) || 1) % 7 + 7) % 7;
      parts.push(interval === 1 ? `Minden héten ${weekdays[dow]}` : `Minden ${interval}. héten ${weekdays[dow]}`);
    } else if (freq === "monthly") {
      if (rec.config?.monthlyType === "nth_weekday") {
        const dow = ((Number(rec.config?.dayOfWeek) || 1) % 7 + 7) % 7;
        const wom = Number(rec.config?.weekOfMonth) || 1;
        const weekdays = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];
        const orderStr = wom === -1 || wom > 4 ? "utolsó" : `${wom}.`;
        parts.push(interval === 1 ? `Minden hónapban (${orderStr} ${weekdays[dow]})` : `Minden ${interval}. hónapban (${orderStr} ${weekdays[dow]})`);
      } else {
        const dom = Number(rec.config?.dayOfMonth) || 15;
        parts.push(interval === 1 ? `Minden hónap ${dom}. napján` : `Minden ${interval}. hónap ${dom}. napján`);
      }
    } else if (freq === "yearly") {
      parts.push(interval === 1 ? "Minden évben" : `Minden ${interval}. évben`);
    }
  } else {
    // English
    if (freq === "daily") {
      parts.push(interval === 1 ? "Every day" : `Every ${interval} days`);
    } else if (freq === "weekly") {
      const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dow = ((Number(rec.config?.dayOfWeek) || 1) % 7 + 7) % 7;
      parts.push(interval === 1 ? `Every week on ${weekdays[dow]}` : `Every ${interval} weeks on ${weekdays[dow]}`);
    } else if (freq === "monthly") {
      if (rec.config?.monthlyType === "nth_weekday") {
        const dow = ((Number(rec.config?.dayOfWeek) || 1) % 7 + 7) % 7;
        const wom = Number(rec.config?.weekOfMonth) || 1;
        const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const orderStr = wom === -1 || wom > 4 ? "last" : `${wom}th`;
        parts.push(interval === 1 ? `Every month on the ${orderStr} ${weekdays[dow]}` : `Every ${interval} months on the ${orderStr} ${weekdays[dow]}`);
      } else {
        const dom = Number(rec.config?.dayOfMonth) || 15;
        parts.push(interval === 1 ? `Every month on the ${dom}th` : `Every ${interval} months on the ${dom}th`);
      }
    } else if (freq === "yearly") {
      parts.push(interval === 1 ? "Every year" : `Every ${interval} years`);
    }
  }

  // 2. Weekend rule
  if (rec.weekendRule === "before") {
    if (lang === "sk") parts.push(freq === "daily" ? "iba pracovné dni" : "víkend → piatok");
    else if (lang === "hu") parts.push(freq === "daily" ? "csak munkanapokon" : "hétvége → péntek");
    else parts.push(freq === "daily" ? "weekdays only" : "weekends → Friday");
  } else if (rec.weekendRule === "after") {
    if (lang === "sk") parts.push(freq === "daily" ? "iba pracovné dni" : "víkend → pondelok");
    else if (lang === "hu") parts.push(freq === "daily" ? "csak munkanapokon" : "hétvége → hétfő");
    else parts.push(freq === "daily" ? "weekdays only" : "weekends → Monday");
  }

  // 3. Lead days
  if (rec.leadDays > 0) {
    if (lang === "sk") {
      const daysStr = rec.leadDays === 1 ? "1 deň" : rec.leadDays < 5 ? `${rec.leadDays} dni` : `${rec.leadDays} dní`;
      parts.push(`zobrazí sa ${daysStr} vopred`);
    } else if (lang === "hu") {
      parts.push(`${rec.leadDays} nappal korábban jelenik meg`);
    } else {
      parts.push(`shows ${rec.leadDays} day${rec.leadDays === 1 ? "" : "s"} before`);
    }
  }

  return parts.join(" · ");
}
