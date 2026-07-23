// Timeline timestamps and `*_at` DATE columns are stored and compared as LOCAL
// wall-clock time throughout the CRM. Deriving them from `toISOString()` yields
// UTC, which files anything logged after local midnight under the previous day
// (and, for DATE columns, can be rejected outright by MySQL).

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
