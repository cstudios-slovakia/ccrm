/**
 * Time tracking: hourly cost rate of a worker and the cost of an entry — pure.
 *
 * The rate depends on the worker's employment status (Employee.kind and
 * salaryType) and, for monthly pay, on how many working days THAT month has in
 * THAT person's country. The caller supplies the working-day count (see
 * `holidays.ts`); nothing here fetches anything.
 *
 *   kind        salaryType  hourly cost rate for an entry on date D
 *   employee    monthly     salary / workingDays(D's month) / hoursPerDay   x multiplier
 *   employee    daily       amount / hoursPerDay                            x multiplier
 *   employee    hourly      amount                                          x multiplier
 *   contractor  hourly      amount
 *   contractor  daily       amount / hoursPerDay
 *   contractor  monthly     amount / basisHours(D's month)                  (retainer)
 *   ledger / nobody linked / no salary: no rate (source "none")
 *
 * `hoursBasis: "fixed"` replaces `workingDays x hoursPerDay` with
 * `fixedHoursPerMonth` for the monthly types. Vacation and sick days do NOT
 * reduce the working days: the employee is paid for them.
 *
 * `public/api/time_cost.php` is a port; `scripts/fixtures/time-cost-cases.json`
 * is run by both (`npm run test:unit` and `npm run test:time-cost`).
 */

export type CostRateSource =
  | "monthly"
  | "daily"
  | "hourly"
  | "contractor_hourly"
  | "contractor_daily"
  | "contractor_monthly"
  | "none";

export interface CostPerson {
  kind?: "employee" | "contractor" | "ledger" | string | null;
  salaryType?: "monthly" | "daily" | "hourly" | string | null;
  salaryAmount?: number | null;
}

export interface CostSettings {
  hoursBasis: "workingDays" | "fixed";
  fixedHoursPerMonth: number;
  hoursPerDay: number;
  /** Employer contributions on top of gross pay; employees only. */
  employerMultiplier: number;
}

export const DEFAULT_COST_SETTINGS: CostSettings = {
  hoursBasis: "workingDays",
  fixedHoursPerMonth: 168,
  hoursPerDay: 8,
  employerMultiplier: 1.352,
};

export interface CostRate {
  /** Hourly cost, 4 decimals; null when there is nothing to price with. */
  rate: number | null;
  source: CostRateSource;
  /** The month's working days that were divided by; null for hourly rates, a fixed basis and "none". */
  basisDays: number | null;
  /** Hours the monthly amount was spread over; null unless the amount is a monthly one. */
  basisHours: number | null;
  /** Cost of one working day before the multiplier (what the tooltip calls "man-day"). */
  manDay: number | null;
  /** The multiplier that was applied (1 when none). */
  multiplier: number;
  /** The salary amount the rate was derived from. */
  amount: number | null;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

const NONE: CostRate = { rate: null, source: "none", basisDays: null, basisHours: null, manDay: null, multiplier: 1, amount: null };

/** Hours a monthly amount is spread over, and the day count behind it (null when the basis is fixed). */
export const basisFor = (workingDays: number, settings: CostSettings): { hours: number; days: number | null } =>
  settings.hoursBasis === "fixed"
    ? { hours: settings.fixedHoursPerMonth, days: null }
    : { hours: workingDays * settings.hoursPerDay, days: workingDays };

/** The hourly cost rate of one person for one month. `workingDays` is that month's, in the person's country. */
export const computeCostRate = (
  person: CostPerson | null | undefined,
  workingDays: number,
  settings: CostSettings = DEFAULT_COST_SETTINGS,
): CostRate => {
  if (!person) return NONE;
  const amount = Number(person.salaryAmount);
  if (!Number.isFinite(amount) || amount <= 0) return NONE;
  if (!(settings.hoursPerDay > 0)) return NONE;

  const kind = person.kind || "employee";
  if (kind === "ledger") return NONE;
  const isContractor = kind === "contractor";
  const salaryType = person.salaryType || (isContractor ? "hourly" : "monthly");
  const multiplier = isContractor ? 1 : settings.employerMultiplier > 0 ? settings.employerMultiplier : 1;

  if (salaryType === "hourly") {
    return { rate: round4(amount * multiplier), source: isContractor ? "contractor_hourly" : "hourly", basisDays: null, basisHours: null, manDay: round4(amount * settings.hoursPerDay), multiplier, amount };
  }
  if (salaryType === "daily") {
    return { rate: round4((amount / settings.hoursPerDay) * multiplier), source: isContractor ? "contractor_daily" : "daily", basisDays: null, basisHours: null, manDay: round4(amount), multiplier, amount };
  }
  if (salaryType === "monthly") {
    const basis = basisFor(workingDays, settings);
    if (!(basis.hours > 0)) return NONE;
    const rate = round4((amount / basis.hours) * multiplier);
    return {
      rate,
      source: isContractor ? "contractor_monthly" : "monthly",
      basisDays: basis.days,
      basisHours: basis.hours,
      manDay: round4((amount / basis.hours) * settings.hoursPerDay),
      multiplier,
      amount,
    };
  }
  return NONE;
};

/** `duration_sec / 3600 x rate`, 2 decimals; null with no rate or no duration. */
export const computeEntryCost = (durationSec: number | null | undefined, rate: number | null | undefined): number | null => {
  if (rate === null || rate === undefined || durationSec === null || durationSec === undefined) return null;
  return round2((durationSec / 3600) * rate);
};

export interface ExplainContext {
  t: (en: string, sk: string, hu: string) => string;
  /** Formats an amount of money, e.g. "€3,200". */
  money: (n: number) => string;
  /** "Oct 2026" */
  monthLabel: string;
  country: string;
}

/** The frozen rate in plain words: "€3,200 ÷ 22 working days (Oct 2026, SK) ÷ 8 h × 1.352 = €24.58/h". */
export const explainCostRate = (r: CostRate, settings: CostSettings, ctx: ExplainContext): string => {
  const { t, money } = ctx;
  if (r.rate === null || r.amount === null) return t("No rate — no employee linked", "Bez sadzby — nie je pripojený zamestnanec", "Nincs díj — nincs munkatárs hozzárendelve");
  const x = r.multiplier !== 1 ? ` × ${r.multiplier}` : "";
  const out = ` = ${money(r.rate)}/h`;
  const perHour = t("h", "h", "ó");
  switch (r.source) {
    case "monthly":
    case "contractor_monthly":
      if (r.basisDays !== null) {
        return `${money(r.amount)} ÷ ${r.basisDays} ${t("working days", "pracovných dní", "munkanap")} (${ctx.monthLabel}, ${ctx.country}) ÷ ${settings.hoursPerDay} ${perHour}${x}${out}`;
      }
      return `${money(r.amount)} ÷ ${r.basisHours} ${perHour} ${t("(fixed monthly hours)", "(pevný počet hodín mesiaca)", "(havi fix óraszám)")}${x}${out}`;
    case "daily":
    case "contractor_daily":
      return `${money(r.amount)} ${t("per day", "za deň", "naponta")} ÷ ${settings.hoursPerDay} ${perHour}${x}${out}`;
    default:
      return `${money(r.amount)}/${perHour}${x}${out}`;
  }
};

/** "Oct 2026 · 22 working days · man-day €145.45 · €24.58/h" — the Team matrix and drawer tooltip. */
export const costRateTooltip = (r: CostRate, ctx: ExplainContext): string => {
  if (r.rate === null) return ctx.t("No rate — no employee linked", "Bez sadzby — nie je pripojený zamestnanec", "Nincs díj — nincs munkatárs hozzárendelve");
  const parts = [ctx.monthLabel];
  if (r.basisDays !== null) parts.push(`${r.basisDays} ${ctx.t("working days", "pracovných dní", "munkanap")}`);
  if (r.manDay !== null) parts.push(`${ctx.t("man-day", "osobodeň", "ember-nap")} ${ctx.money(r.manDay)}`);
  parts.push(`${ctx.money(r.rate)}/h`);
  return parts.join(" · ");
};
