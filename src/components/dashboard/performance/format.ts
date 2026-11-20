/**
 * Formatters of the "Výkonnostný prehľad" widgets. Pure functions, no JSX.
 * Money goes through `formatMoney`; everything else follows the same locale mapping.
 * `null` always formats as "—".
 */
import { formatMoney } from "../../../utils/currency.ts";
import type { Language } from "../../../utils/translations.ts";

export const DASH = "—";
export const MINUS = "−";
const NBSP = " ";

export const makeT =
  (language: Language) =>
  (en: string, sk: string, hu: string): string =>
    language === "sk" ? sk : language === "hu" ? hu : en;

const localeOf = (l: Language): string => (l === "en" ? "en-US" : l === "hu" ? "hu-HU" : "sk-SK");

const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(Math.abs(v) * f) / f;
};

/** Locale number, at most `maxFrac` decimals, of the absolute value. */
const num = (absValue: number, l: Language, maxFrac: number): string =>
  absValue.toLocaleString(localeOf(l), { maximumFractionDigits: maxFrac });

const signOf = (v: number, rounded: number): string => (rounded === 0 ? "" : v > 0 ? "+" : MINUS);

/* ---------------------------------------------------------------- money */

export const money = (v: number | null, currency: string | null | undefined, l: Language, decimals = 0): string =>
  v === null ? DASH : formatMoney(v, currency, l, { maximumFractionDigits: currency === "HUF" ? 0 : decimals });

export const signedMoney = (v: number | null, currency: string | null | undefined, l: Language, decimals = 0): string => {
  if (v === null) return DASH;
  const r = round(v, decimals);
  return `${signOf(v, r)}${money(r, currency, l, decimals)}`;
};

/* -------------------------------------------------------------- percent */

const percentUnit = (l: Language): string => (l === "en" ? "%" : `${NBSP}%`);

export const percent = (v: number | null, l: Language, digits = 1): string =>
  v === null ? DASH : `${v < 0 ? MINUS : ""}${num(round(v, digits), l, digits)}${percentUnit(l)}`;

export const signedPercent = (v: number | null, l: Language, digits = 0): string => {
  if (v === null) return DASH;
  const r = round(v, digits);
  return `${signOf(v, r)}${num(r, l, digits)}${percentUnit(l)}`;
};

/** Percentage points: "+2,1 p. b.". */
export const pointsDelta = (v: number | null, l: Language): string => {
  if (v === null) return DASH;
  const r = round(v, 1);
  const unit = l === "sk" ? `${NBSP}p.${NBSP}b.` : l === "hu" ? `${NBSP}szp` : `${NBSP}pp`;
  return `${signOf(v, r)}${num(r, l, 1)}${unit}`;
};

/* ------------------------------------------------------------ thousands */

/** Chart axis and net flow: "80 tis.", "+10,8 tis.", "0". */
export const thousands = (v: number | null, l: Language, signed = false): string => {
  if (v === null) return DASH;
  const r = round(v / 1000, 1);
  if (r === 0) return "0";
  const unit = l === "sk" ? `${NBSP}tis.` : l === "hu" ? `${NBSP}e` : "k";
  const sign = signed ? signOf(v, r) : v < 0 ? MINUS : "";
  return `${sign}${num(r, l, 1)}${unit}`;
};

/* ---------------------------------------------------------------- days */

export const days = (v: number | null, l: Language, signed = false): string => {
  if (v === null) return DASH;
  const r = round(v, 1);
  const whole = Number.isInteger(r);
  let word: string;
  if (l === "sk") word = !whole ? "dňa" : r === 1 ? "deň" : r >= 2 && r <= 4 ? "dni" : "dní";
  else if (l === "en") word = r === 1 ? "day" : "days";
  else word = "nap";
  const sign = signed ? signOf(v, r) : v < 0 ? MINUS : "";
  return `${sign}${num(r, l, 1)}${NBSP}${word}`;
};

/* ----------------------------------------------------- hours and minutes */

export const hours = (ms: number | null, l: Language): string =>
  ms === null ? DASH : `${num(Math.round(Math.abs(ms) / 3600000), l, 0)}${NBSP}${l === "hu" ? "ó" : "h"}`;

export const duration = (ms: number | null, l: Language, signed = false): string => {
  if (ms === null) return DASH;
  const total = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hUnit = l === "hu" ? "ó" : "h";
  const mUnit = l === "hu" ? "p" : "min";
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}${NBSP}${hUnit}`);
  if (m > 0 || h === 0) parts.push(`${m}${NBSP}${mUnit}`);
  const sign = signed ? signOf(ms, total) : ms < 0 ? MINUS : "";
  return `${sign}${parts.join(" ")}`;
};

export const multiplier = (v: number | null, l: Language): string =>
  v === null ? DASH : `${num(round(v, 1), l, 1)}×`;

/** Plain number ("31", "1 234"). */
export const count = (v: number, l: Language): string => num(Math.round(v), l, 0);

/* ------------------------------------------------------------- initials */

export const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
};

/* -------------------------------------------------------------- plurals */

export type Noun = "task" | "ticket" | "push" | "criterion" | "deal" | "lead" | "project" | "item" | "offer" | "status";

/** sk: [1, 2-4, 5+ and 0, genitive singular]; en: [one, other]; hu: one form after a numeral. */
const NOUNS: Record<Noun, { sk: [string, string, string, string]; en: [string, string]; hu: string }> = {
  task: { sk: ["úloha", "úlohy", "úloh", "úlohy"], en: ["task", "tasks"], hu: "feladat" },
  ticket: { sk: ["ticket", "tickety", "ticketov", "ticketu"], en: ["ticket", "tickets"], hu: "ticket" },
  push: { sk: ["push", "pushe", "pushov", "pushu"], en: ["push", "pushes"], hu: "push" },
  criterion: { sk: ["kritérium", "kritériá", "kritérií", "kritéria"], en: ["criterion", "criteria"], hu: "kritérium" },
  deal: { sk: ["zákazka", "zákazky", "zákaziek", "zákazky"], en: ["deal", "deals"], hu: "megrendelés" },
  lead: { sk: ["lead", "leady", "leadov", "leadu"], en: ["lead", "leads"], hu: "lead" },
  project: { sk: ["projekt", "projekty", "projektov", "projektu"], en: ["project", "projects"], hu: "projekt" },
  item: { sk: ["položka", "položky", "položiek", "položky"], en: ["item", "items"], hu: "tétel" },
  offer: { sk: ["ponuka", "ponuky", "ponúk", "ponuky"], en: ["offer", "offers"], hu: "ajánlat" },
  status: { sk: ["stav", "stavy", "stavov", "stavu"], en: ["status", "statuses"], hu: "státusz" },
};

/** The noun for a count: "úloha" / "úlohy" / "úloh". */
export const noun = (kind: Noun, n: number, l: Language): string => {
  const e = NOUNS[kind];
  if (l === "hu") return e.hu;
  if (l === "en") return n === 1 ? e.en[0] : e.en[1];
  return n === 1 ? e.sk[0] : n >= 2 && n <= 4 ? e.sk[1] : e.sk[2];
};

/** "20 leadov". */
export const countNoun = (kind: Noun, n: number, l: Language): string => `${count(n, l)}${NBSP}${noun(kind, n, l)}`;

/** "+17 kritérií" (the sign of an addition). */
export const signedCountNoun = (kind: Noun, n: number, l: Language): string =>
  `${n > 0 ? "+" : n < 0 ? MINUS : ""}${countNoun(kind, Math.abs(n), l)}`;

/** The noun after "N z M": genitive plural, genitive singular for M = 1 ("z 1 úlohy"). */
export const nounAfterOf = (kind: Noun, total: number, l: Language): string => {
  if (l === "sk") return total === 1 ? NOUNS[kind].sk[3] : NOUNS[kind].sk[2];
  return noun(kind, total, l);
};

/** "8 z 34 leadov". */
export const ofTotal = (a: number, total: number, kind: Noun, l: Language): string => {
  const w = nounAfterOf(kind, total, l);
  if (l === "en") return `${count(a, l)} of ${count(total, l)} ${w}`;
  if (l === "hu") return `${count(a, l)} / ${count(total, l)} ${w}`;
  return `${count(a, l)} z ${count(total, l)} ${w}`;
};

/** Slovak "z" or "zo" before a number, by how the number is spoken (4 štyroch, 6 šiestich, 7 siedmich). */
const skZ = (n: number): "z" | "zo" => {
  const tens = Math.floor(n / 10) % 10;
  const ones = n % 10;
  if (n === 100) return "zo";
  if (n >= 20) {
    if (tens === 4 || tens === 6 || tens === 7) return "zo";
    return ones === 0 ? "z" : skZ(ones);
  }
  return [4, 6, 7, 14, 16, 17].includes(n) ? "zo" : "z";
};

/** "5 z 5 stavov", "4 zo 4 stavov". */
export const statusesOf = (included: number, total: number, l: Language): string => {
  if (l === "sk") return `${included} ${skZ(total)} ${total} ${nounAfterOf("status", total, l)}`;
  if (l === "en") return `${included} of ${total} ${noun("status", total, l)}`;
  return `${included} / ${total} ${noun("status", total, l)}`;
};

/* ------------------------------------------------------------- calendar */

const MONTHS_SHORT: Record<Language, string[]> = {
  sk: ["Jan", "Feb", "Mar", "Apr", "Máj", "Jún", "Júl", "Aug", "Sep", "Okt", "Nov", "Dec"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  hu: ["Jan", "Feb", "Már", "Ápr", "Máj", "Jún", "Júl", "Aug", "Szep", "Okt", "Nov", "Dec"],
};

const MONTHS_LONG: Record<Language, string[]> = {
  sk: ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  hu: ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"],
};

/** "Jún" (month 0-11). */
export const monthShort = (month: number, l: Language): string => MONTHS_SHORT[l][month] ?? "";

/** "jún 2026" for an aria-label. */
export const monthYear = (year: number, month: number, l: Language): string =>
  `${(MONTHS_LONG[l][month] ?? "").toLocaleLowerCase()} ${year}`;

/** "44. týždeň". */
export const isoWeekLabel = (week: number, l: Language): string =>
  l === "sk" ? `${week}. týždeň` : l === "hu" ? `${week}. hét` : `Week ${week}`;

const dayStart = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const clock = (d: Date): string => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * A past moment against `now`: today in minutes or hours, yesterday with the clock time,
 * older in days. "long" is the sentence form ("pred 2 hodinami"), "short" the table form ("pred 2 h").
 */
export const relativeTime = (date: Date, now: Date, l: Language, style: "long" | "short" = "long"): string => {
  const ms = now.getTime() - date.getTime();
  if (ms < 60000) return l === "sk" ? "práve teraz" : l === "hu" ? "most" : "just now";
  const dayDiff = Math.round((dayStart(now) - dayStart(date)) / 86400000);
  if (dayDiff <= 0) {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) {
      if (l === "sk") return style === "short" ? `pred ${mins} min` : `pred ${mins} ${mins === 1 ? "minútou" : "minútami"}`;
      if (l === "hu") return `${mins} perce`;
      return style === "short" ? `${mins} min ago` : `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
    }
    const h = Math.floor(mins / 60);
    if (l === "sk") return style === "short" ? `pred ${h} h` : `pred ${h} ${h === 1 ? "hodinou" : "hodinami"}`;
    if (l === "hu") return `${h} órája`;
    return style === "short" ? `${h} h ago` : `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  if (dayDiff === 1) return `${l === "sk" ? "včera" : l === "hu" ? "tegnap" : "yesterday"} ${clock(date)}`;
  if (l === "sk") return `pred ${dayDiff} dňami`;
  if (l === "hu") return `${dayDiff} napja`;
  return `${dayDiff} days ago`;
};

/** Deadline distance: "12 dní po termíne", "o 4 dni", "dnes". */
export const deadlineDistance = (daysFromToday: number, l: Language): string => {
  if (daysFromToday === 0) return l === "sk" ? "dnes" : l === "hu" ? "ma" : "today";
  const n = Math.abs(daysFromToday);
  const d = days(n, l);
  if (daysFromToday < 0) return l === "sk" ? `${d} po termíne` : l === "hu" ? `${d}ja lejárt` : `${d} overdue`;
  return l === "sk" ? `o ${d}` : l === "hu" ? `${d} múlva` : `in ${d}`;
};
