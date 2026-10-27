/**
 * Public holidays and working days for Slovakia and Hungary — pure, no fetching.
 *
 * Time tracking needs "how many working days does this month have, in this
 * person's country" for the monthly cost rate, the weekly target and the day
 * strip. The days come from the server (`api/holidays.php`: Nager.Date, cached);
 * this file is
 *   1. the offline fallback — the statutory holidays computed from their rules —
 *      used when the API cannot be reached and nothing is cached, and in the QA
 *      suite (which mocks /api/*);
 *   2. the en/sk/hu name map, keyed by `ruleId`, so every UI language reads
 *      natively whatever country's calendar applies;
 *   3. the working-day arithmetic, including per-country-and-year overrides
 *      ("extra day off" / "extra working day").
 *
 * Which days are holidays depends only on the COUNTRY of the person's calendar,
 * never on the UI language. The language only picks the NAME.
 *
 * Only days of work rest are listed. Slovakia's state holidays that are not rest
 * days (1 Sept, 17 Nov) are not — Nager types them `Observance`, and the law
 * (241/1993 § 2) agrees. 8 May and 15 Sept are rest days EXCEPT in 2026, when
 * § 4b suspends them (checked against slov-lex and Nager, 2026-10-26).
 *
 * Hungary's yearly NGM decree (áthelyezett pihenőnap / ledolgozós szombat) is
 * NOT here: there is no free machine-readable source, so those days are manual
 * overrides. 24 Dec 2026 is deliberately absent until confirmed against the
 * official text — do not invent dates.
 *
 * `public/api/holidays.php` carries the same rules for the server-side fallback.
 */

export type HolidayCountry = "SK" | "HU";
export type HolidayLanguage = "en" | "sk" | "hu";
export type HolidaySource = "api" | "builtin" | "manual";

export const HOLIDAY_COUNTRIES: HolidayCountry[] = ["SK", "HU"];

export interface HolidayDay {
  /** YYYY-MM-DD */
  date: string;
  /** Stable rule key (`SK:labour-day`) when the day is a known holiday, else null (named by the API only). */
  ruleId: string | null;
  /** Name in the holiday's own language (Nager `localName`). */
  localName: string;
  /** English name (Nager `name`). */
  nameEn: string;
  source: HolidaySource;
}

export interface HolidayOverride {
  /** YYYY-MM-DD */
  date: string;
  kind: "extraDayOff" | "extraWorkingDay";
  name: string;
}

/** country -> year -> overrides, as stored in `TimeTrackingSettings.holidayOverrides`. */
export type HolidayOverrides = Partial<Record<HolidayCountry, Record<string, HolidayOverride[]>>>;

// ---------------------------------------------------------------------------
// Dates (UTC arithmetic only, so DST and the machine's timezone never matter)
// ---------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, "0");
export const isoDate = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

const utcMs = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const addDays = (iso: string, days: number): string => {
  const dt = new Date(utcMs(iso) + days * 86_400_000);
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (iso: string): number => new Date(utcMs(iso)).getUTCDay();

export const isWeekend = (iso: string): boolean => {
  const w = weekdayOf(iso);
  return w === 0 || w === 6;
};

export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Western Easter Sunday (anonymous Gregorian algorithm). */
export const easterSunday = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
};

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type Triple = { en: string; sk: string; hu: string };

interface Rule {
  id: string;
  /** Fixed day [month, day], or an offset in days from Easter Sunday. */
  fixed?: [number, number];
  easterOffset?: number;
  /** Years in which the day is NOT a rest day. */
  exceptYears?: number[];
  /** Name in the country's own language (what Nager calls `localName`) and in English. */
  local: string;
  en: string;
}

const SK_RULES: Rule[] = [
  { id: "new-year", fixed: [1, 1], local: "Deň vzniku Slovenskej republiky", en: "Day of the Establishment of the Slovak Republic" },
  { id: "epiphany", fixed: [1, 6], local: "Zjavenie Pána", en: "Epiphany" },
  { id: "good-friday", easterOffset: -2, local: "Veľkonočný piatok", en: "Good Friday" },
  { id: "easter-monday", easterOffset: 1, local: "Veľkonočný pondelok", en: "Easter Monday" },
  { id: "labour-day", fixed: [5, 1], local: "Sviatok práce", en: "International Workers' Day" },
  { id: "victory-day", fixed: [5, 8], exceptYears: [2026], local: "Deň víťazstva nad fašizmom", en: "Day of victory over fascism" },
  { id: "cyril-methodius", fixed: [7, 5], local: "Sviatok svätého Cyrila a svätého Metoda", en: "St. Cyril and Methodius Day" },
  { id: "snp", fixed: [8, 29], local: "Výročie Slovenského národného povstania", en: "Slovak National Uprising anniversary" },
  { id: "our-lady-sorrows", fixed: [9, 15], exceptYears: [2026], local: "Sedembolestná Panna Mária", en: "Day of Our Lady of the Seven Sorrows" },
  { id: "all-saints", fixed: [11, 1], local: "Sviatok Všetkých svätých", en: "All Saints' Day" },
  { id: "christmas-eve", fixed: [12, 24], local: "Štedrý deň", en: "Christmas Eve" },
  { id: "christmas-day", fixed: [12, 25], local: "Prvý sviatok vianočný", en: "Christmas Day" },
  { id: "st-stephen", fixed: [12, 26], local: "Druhý sviatok vianočný", en: "St. Stephen's Day" },
];

const HU_RULES: Rule[] = [
  { id: "new-year", fixed: [1, 1], local: "Újév", en: "New Year's Day" },
  { id: "revolution-1848", fixed: [3, 15], local: "Nemzeti ünnep", en: "1848 Revolution Memorial Day" },
  { id: "good-friday", easterOffset: -2, local: "Nagypéntek", en: "Good Friday" },
  { id: "easter-sunday", easterOffset: 0, local: "Húsvétvasárnap", en: "Easter Sunday" },
  { id: "easter-monday", easterOffset: 1, local: "Húsvéthétfő", en: "Easter Monday" },
  { id: "labour-day", fixed: [5, 1], local: "A munka ünnepe", en: "Labour Day" },
  { id: "pentecost-sunday", easterOffset: 49, local: "Pünkösdvasárnap", en: "Pentecost" },
  { id: "whit-monday", easterOffset: 50, local: "Pünkösdhétfő", en: "Whit Monday" },
  { id: "state-foundation", fixed: [8, 20], local: "Az államalapítás ünnepe", en: "State Foundation Day" },
  { id: "revolution-1956", fixed: [10, 23], local: "Nemzeti ünnep", en: "1956 Revolution Memorial Day" },
  { id: "all-saints", fixed: [11, 1], local: "Mindenszentek", en: "All Saints' Day" },
  { id: "christmas-day", fixed: [12, 25], local: "Karácsony", en: "Christmas Day" },
  { id: "st-stephen", fixed: [12, 26], local: "Karácsony másnapja", en: "St. Stephen's Day" },
];

const RULES: Record<HolidayCountry, Rule[]> = { SK: SK_RULES, HU: HU_RULES };

/** en/sk/hu name of every rule, keyed `COUNTRY:rule-id`. Anything missing falls back to the API's names. */
export const HOLIDAY_NAMES: Record<string, Triple> = {
  "SK:new-year": { en: "New Year's Day (Establishment of the Slovak Republic)", sk: "Deň vzniku Slovenskej republiky", hu: "A Szlovák Köztársaság létrejöttének napja" },
  "SK:epiphany": { en: "Epiphany", sk: "Zjavenie Pána (Traja králi)", hu: "Vízkereszt" },
  "SK:good-friday": { en: "Good Friday", sk: "Veľkonočný piatok", hu: "Nagypéntek" },
  "SK:easter-monday": { en: "Easter Monday", sk: "Veľkonočný pondelok", hu: "Húsvéthétfő" },
  "SK:labour-day": { en: "Labour Day", sk: "Sviatok práce", hu: "A munka ünnepe" },
  "SK:victory-day": { en: "Victory over Fascism Day", sk: "Deň víťazstva nad fašizmom", hu: "A fasizmus feletti győzelem napja" },
  "SK:cyril-methodius": { en: "St. Cyril and Methodius Day", sk: "Sviatok svätého Cyrila a svätého Metoda", hu: "Szent Cirill és Metód ünnepe" },
  "SK:snp": { en: "Slovak National Uprising anniversary", sk: "Výročie Slovenského národného povstania", hu: "A Szlovák Nemzeti Felkelés évfordulója" },
  "SK:our-lady-sorrows": { en: "Our Lady of Sorrows", sk: "Sedembolestná Panna Mária", hu: "Hétfájdalmú Szűz Mária" },
  "SK:all-saints": { en: "All Saints' Day", sk: "Sviatok všetkých svätých", hu: "Mindenszentek" },
  "SK:christmas-eve": { en: "Christmas Eve", sk: "Štedrý deň", hu: "Szenteste" },
  "SK:christmas-day": { en: "Christmas Day", sk: "Prvý sviatok vianočný", hu: "Karácsony első napja" },
  "SK:st-stephen": { en: "St. Stephen's Day", sk: "Druhý sviatok vianočný", hu: "Karácsony másnapja" },
  "HU:new-year": { en: "New Year's Day", sk: "Nový rok", hu: "Újév" },
  "HU:revolution-1848": { en: "1848 Revolution Memorial Day", sk: "Výročie revolúcie 1848", hu: "Az 1848-as forradalom ünnepe" },
  "HU:good-friday": { en: "Good Friday", sk: "Veľkonočný piatok", hu: "Nagypéntek" },
  "HU:easter-sunday": { en: "Easter Sunday", sk: "Veľkonočná nedeľa", hu: "Húsvétvasárnap" },
  "HU:easter-monday": { en: "Easter Monday", sk: "Veľkonočný pondelok", hu: "Húsvéthétfő" },
  "HU:labour-day": { en: "Labour Day", sk: "Sviatok práce", hu: "A munka ünnepe" },
  "HU:pentecost-sunday": { en: "Pentecost", sk: "Turíce", hu: "Pünkösdvasárnap" },
  "HU:whit-monday": { en: "Whit Monday", sk: "Turícny pondelok", hu: "Pünkösdhétfő" },
  "HU:state-foundation": { en: "State Foundation Day", sk: "Sviatok založenia štátu", hu: "Az államalapítás ünnepe" },
  "HU:revolution-1956": { en: "1956 Revolution Memorial Day", sk: "Výročie revolúcie 1956", hu: "Az 1956-os forradalom ünnepe" },
  "HU:all-saints": { en: "All Saints' Day", sk: "Sviatok všetkých svätých", hu: "Mindenszentek" },
  "HU:christmas-day": { en: "Christmas Day", sk: "Prvý sviatok vianočný", hu: "Karácsony" },
  "HU:st-stephen": { en: "St. Stephen's Day", sk: "Druhý sviatok vianočný", hu: "Karácsony másnapja" },
};

/** The statutory days of rest of one country and year, computed from their rules. Sorted by date. */
export const builtinHolidays = (country: HolidayCountry, year: number): HolidayDay[] => {
  const easter = easterSunday(year);
  const days: HolidayDay[] = [];
  for (const rule of RULES[country]) {
    if (rule.exceptYears?.includes(year)) continue;
    const date = rule.fixed ? isoDate(year, rule.fixed[0], rule.fixed[1]) : addDays(easter, rule.easterOffset ?? 0);
    days.push({ date, ruleId: `${country}:${rule.id}`, localName: rule.local, nameEn: rule.en, source: "builtin" });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
};

/** A holiday's name in the UI language: the en/sk/hu map first, then the API's own names. */
export const holidayName = (day: Pick<HolidayDay, "ruleId" | "localName" | "nameEn">, country: HolidayCountry, language: HolidayLanguage): string => {
  const mapped = day.ruleId ? HOLIDAY_NAMES[day.ruleId]?.[language] : undefined;
  if (mapped) return mapped;
  const ownLanguage: HolidayLanguage = country === "SK" ? "sk" : "hu";
  return language === ownLanguage ? day.localName || day.nameEn : day.nameEn || day.localName;
};

// ---------------------------------------------------------------------------
// Which country's calendar applies
// ---------------------------------------------------------------------------

const COUNTRY_ALIASES: Record<string, HolidayCountry> = {
  sk: "SK", svk: "SK", slovakia: "SK", slovensko: "SK", "slovenská republika": "SK", szlovákia: "SK",
  hu: "HU", hun: "HU", hungary: "HU", magyarország: "HU", magyarorszag: "HU", maďarsko: "HU",
};

/** Map a free-text company country ("Slovakia", "SK", "Maďarsko") to SK/HU; null when it is neither. */
export const holidayCountryFromText = (text: string | null | undefined): HolidayCountry | null => {
  const key = (text || "").trim().toLowerCase();
  return key ? COUNTRY_ALIASES[key] ?? null : null;
};

/** Employee override, else the company country, else SK. */
export const resolveWorkCountry = (
  employeeWorkCountry: HolidayCountry | null | undefined,
  companyCountry: string | null | undefined,
): HolidayCountry => employeeWorkCountry ?? holidayCountryFromText(companyCountry) ?? "SK";

// ---------------------------------------------------------------------------
// Working days
// ---------------------------------------------------------------------------

export interface HolidayCalendar {
  country: HolidayCountry;
  /** Holiday on this date (a day of rest), if any. */
  holiday: (iso: string) => HolidayDay | undefined;
  /** The override on this date, if any. */
  override: (iso: string) => HolidayOverride | undefined;
  /** Mon–Fri, minus holidays and extra days off, plus extra working days. */
  isWorkingDay: (iso: string) => boolean;
  /** A day to show muted: weekend, holiday or an extra day off, and not an extra working day. */
  isOffDay: (iso: string) => boolean;
  workingDaysInMonth: (year: number, month: number) => number;
  /** Working days in an inclusive range. */
  workingDaysInRange: (from: string, to: string) => number;
}

/**
 * Build the calendar for one country from the holidays the server returned
 * (any years) and that country's overrides (any years).
 */
export const makeHolidayCalendar = (
  country: HolidayCountry,
  holidays: HolidayDay[],
  overrides: HolidayOverride[] = [],
): HolidayCalendar => {
  const byDate = new Map<string, HolidayDay>();
  for (const h of holidays) byDate.set(h.date, h);
  const overrideByDate = new Map<string, HolidayOverride>();
  for (const o of overrides) overrideByDate.set(o.date, o);

  const holiday = (iso: string) => byDate.get(iso);
  const override = (iso: string) => overrideByDate.get(iso);
  const isWorkingDay = (iso: string): boolean => {
    const o = overrideByDate.get(iso);
    if (o?.kind === "extraWorkingDay") return true;
    if (o?.kind === "extraDayOff") return false;
    if (byDate.has(iso)) return false;
    return !isWeekend(iso);
  };
  const workingDaysInRange = (from: string, to: string): number => {
    let count = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) count++;
    return count;
  };
  return {
    country,
    holiday,
    override,
    isWorkingDay,
    isOffDay: (iso) => !isWorkingDay(iso),
    workingDaysInMonth: (year, month) => workingDaysInRange(isoDate(year, month, 1), isoDate(year, month, daysInMonth(year, month))),
    workingDaysInRange,
  };
};

/**
 * Working days of one month with no network: the built-in rules for that
 * country plus the overrides. What `timeCost` is fed when nothing better is known.
 */
export const builtinWorkingDays = (
  country: HolidayCountry,
  year: number,
  month: number,
  overrides: HolidayOverride[] = [],
): number => makeHolidayCalendar(country, builtinHolidays(country, year), overrides).workingDaysInMonth(year, month);

/** The overrides of one country that fall in the given years, flattened. */
export const overridesFor = (overrides: HolidayOverrides | undefined, country: HolidayCountry): HolidayOverride[] =>
  Object.values(overrides?.[country] ?? {}).flat();
