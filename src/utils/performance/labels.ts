/**
 * Texts derived from the selected period, translated en / sk / hu.
 * `periodLabels` fills `PeriodLabels`; the month names and the range formatter serve the
 * cashflow axis and the header range button.
 */

import type { Language } from "../translations.ts";
import type { PeriodLabels, PerformancePeriod } from "../../components/dashboard/performance/types.ts";
import { addMonthsClamped, isoWeekNumber } from "./period.ts";

const tr = (language: Language, en: string, sk: string, hu: string): string =>
  language === "sk" ? sk : language === "hu" ? hu : en;

/* ------------------------------------------------------------------ month names */

/** Short names the cashflow axis uses, January first. */
export const shortMonthNames = (language: Language): string[] =>
  language === "sk"
    ? ["Jan", "Feb", "Mar", "Apr", "Máj", "Jún", "Júl", "Aug", "Sep", "Okt", "Nov", "Dec"]
    : language === "hu"
      ? ["Jan", "Feb", "Már", "Ápr", "Máj", "Jún", "Júl", "Aug", "Sze", "Okt", "Nov", "Dec"]
      : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SK = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
const MONTHS_SK_DATIVE = ["januáru", "februáru", "marcu", "aprílu", "máju", "júnu", "júlu", "augustu", "septembru", "októbru", "novembru", "decembru"];
const MONTHS_HU = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
/** "<month>hoz / -hez képest" stems: the month with its Hungarian -hoz / -hez suffix. */
const MONTHS_HU_TO = [
  "januárhoz", "februárhoz", "márciushoz", "áprilishoz", "májushoz", "júniushoz",
  "júliushoz", "augusztushoz", "szeptemberhez", "októberhez", "novemberhez", "decemberhez",
];

/** The month's name as it reads inside a caption ("november"; English is capitalised). */
export const monthName = (language: Language, month: number): string =>
  language === "sk" ? MONTHS_SK[month] : language === "hu" ? MONTHS_HU[month] : MONTHS_EN[month];

/** The comparison phrase for a month: "oproti októbru". */
export const versusMonthPhrase = (language: Language, month: number): string =>
  language === "sk"
    ? `oproti ${MONTHS_SK_DATIVE[month]}`
    : language === "hu"
      ? `${MONTHS_HU_TO[month]} képest`
      : `vs ${MONTHS_EN[month]}`;

/* ------------------------------------------------------------------ ranges */

/**
 * "1. – 20. 11. 2026". Equal parts collapse: one day is "20. 11. 2026", one month "1. – 20. 11. 2026",
 * one year "1. 10. – 20. 11. 2026", otherwise both ends are written in full.
 */
export const formatDayRange = (start: Date, end: Date, language: Language): string => {
  const sy = start.getFullYear();
  const sm = start.getMonth();
  const sd = start.getDate();
  const ey = end.getFullYear();
  const em = end.getMonth();
  const ed = end.getDate();
  const sameYear = sy === ey;
  const sameMonth = sameYear && sm === em;
  const sameDay = sameMonth && sd === ed;

  if (language === "hu") {
    const full = (y: number, m: number, d: number) => `${y}. ${m + 1}. ${d}.`;
    if (sameDay) return full(ey, em, ed);
    if (sameMonth) return `${full(sy, sm, sd)} – ${ed}.`;
    if (sameYear) return `${full(sy, sm, sd)} – ${em + 1}. ${ed}.`;
    return `${full(sy, sm, sd)} – ${full(ey, em, ed)}`;
  }

  if (language === "en") {
    const short = shortMonthNames("en");
    if (sameDay) return `${ed} ${short[em]} ${ey}`;
    if (sameMonth) return `${sd} – ${ed} ${short[em]} ${ey}`;
    if (sameYear) return `${sd} ${short[sm]} – ${ed} ${short[em]} ${ey}`;
    return `${sd} ${short[sm]} ${sy} – ${ed} ${short[em]} ${ey}`;
  }

  if (sameDay) return `${ed}. ${em + 1}. ${ey}`;
  if (sameMonth) return `${sd}. – ${ed}. ${em + 1}. ${ey}`;
  if (sameYear) return `${sd}. ${sm + 1}. – ${ed}. ${em + 1}. ${ey}`;
  return `${sd}. ${sm + 1}. ${sy} – ${ed}. ${em + 1}. ${ey}`;
};

/** A range with a start and no end yet (the first click of a custom range): "5. 11. 2026 –". */
const formatOpenRange = (start: Date, language: Language): string => `${formatDayRange(start, start, language)} –`;

/**
 * What the header range button shows: the range, "5. 11. 2026 –" while the end is not chosen yet,
 * or "Celý čas" when there is no range.
 */
export const periodRangeLabel = (period: PerformancePeriod, language: Language): string =>
  period.start && period.end
    ? formatDayRange(period.start, period.end, language)
    : period.start
      ? formatOpenRange(period.start, language)
      : tr(language, "All time", "Celý čas", "Teljes időszak");

/* ------------------------------------------------------------------ caption labels */

const quarterOf = (d: Date): number => Math.floor(d.getMonth() / 3) + 1;

/**
 * "november" / "oproti októbru" and so on. The previous unit is read off `previousStart`; when
 * the period has none it is derived from `start` the same way `buildPeriod` does.
 *
 * `today` is accepted so every caller passes the one clock; the labels only depend on the period.
 */
export const periodLabels = (period: PerformancePeriod, language: Language, _today: Date): PeriodLabels => {
  const { preset, start, end } = period;
  const previousMonthOfEnd = end ? addMonthsClamped(new Date(end.getFullYear(), end.getMonth(), 1), -1).getMonth() : null;
  const versusPreviousMonth = previousMonthOfEnd === null ? "" : versusMonthPhrase(language, previousMonthOfEnd);

  if (start && !end) {
    return { current: formatOpenRange(start, language), versusPrevious: "", versusPreviousMonth: "" };
  }

  if (preset === "all" || !start || !end) {
    return {
      current: tr(language, "all time", "celý čas", "teljes időszak"),
      versusPrevious: "",
      versusPreviousMonth: "",
    };
  }

  if (preset === "month") {
    const prevMonth = period.previousStart ? period.previousStart.getMonth() : addMonthsClamped(start, -1).getMonth();
    return { current: monthName(language, start.getMonth()), versusPrevious: versusMonthPhrase(language, prevMonth), versusPreviousMonth };
  }

  if (preset === "week") {
    const week = isoWeekNumber(start);
    const prevWeek = isoWeekNumber(period.previousStart ?? new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7));
    return {
      current: tr(language, `week ${week}`, `${week}. týždeň`, `${week}. hét`),
      versusPrevious: tr(language, `vs week ${prevWeek}`, `oproti ${prevWeek}. týždňu`, `a ${prevWeek}. héthez képest`),
      versusPreviousMonth,
    };
  }

  if (preset === "quarter") {
    const q = quarterOf(start);
    const prevQ = quarterOf(period.previousStart ?? addMonthsClamped(start, -3));
    return {
      current: tr(language, `Q${q}`, `${q}. kvartál`, `${q}. negyedév`),
      versusPrevious: tr(language, `vs Q${prevQ}`, `oproti ${prevQ}. kvartálu`, `a ${prevQ}. negyedévhez képest`),
      versusPreviousMonth,
    };
  }

  if (preset === "year") {
    const year = start.getFullYear();
    const prevYear = (period.previousStart ?? new Date(year - 1, 0, 1)).getFullYear();
    return {
      current: String(year),
      versusPrevious: tr(language, `vs ${prevYear}`, `oproti roku ${prevYear}`, `a ${prevYear}. évhez képest`),
      versusPreviousMonth,
    };
  }

  return {
    current: formatDayRange(start, end, language),
    versusPrevious: tr(language, "vs previous period", "oproti predchádzajúcemu obdobiu", "az előző időszakhoz képest"),
    versusPreviousMonth,
  };
};
