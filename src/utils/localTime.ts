// Timeline timestamps and `*_at` DATE columns are stored and compared as LOCAL
// wall-clock time throughout the CRM. Deriving them from `toISOString()` yields
// UTC, which files anything logged after local midnight under the previous day
// (and, for DATE columns, can be rejected outright by MySQL).

import type { Language } from "./translations";

function localNow(): Date {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
}

// "YYYY-MM-DD" for today in the user's timezone.
export function todayLocal(): string {
  return localNow().toISOString().split("T")[0];
}

// "YYYY-MM-DD HH:MM" for right now in the user's timezone.
export function nowLocalStamp(): string {
  return localNow().toISOString().replace("T", " ").substring(0, 16);
}

export function localeCodeFor(lang: Language): string {
  return lang === "sk" ? "sk-SK" : lang === "hu" ? "hu-HU" : "en-US";
}

// Renders a "YYYY-MM-DD" (or "YYYY-MM-DD HH:MM") date string in the active UI
// language's regional format (e.g. 30.7.2026 for sk, 2026. 07. 30. for hu,
// 7/30/2026 for en). Parses the calendar values directly rather than through
// `new Date(str)`, which reads a bare YYYY-MM-DD as UTC midnight and can shift
// the displayed day back a day in timezones west of UTC.
export function formatDateLocalized(
  dateStr: string | undefined | null,
  lang: Language,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "numeric", year: "numeric" }
): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(localeCodeFor(lang), opts);
}

// Same as `formatDateLocalized`, but for a "YYYY-MM-DD HH:MM" timeline/log
// timestamp: the date part is localized, the HH:MM local time part is kept
// as-is (it isn't locale-dependent in this app — always 24h wall-clock time).
export function formatTimestampLocalized(timestampStr: string | undefined | null, lang: Language): string {
  if (!timestampStr) return "";
  const [datePart, timePart] = timestampStr.split(" ");
  const formattedDate = formatDateLocalized(datePart, lang);
  return timePart ? `${formattedDate} ${timePart}` : formattedDate;
}
