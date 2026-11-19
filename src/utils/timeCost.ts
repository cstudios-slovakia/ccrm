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
 * `fixedHoursPerMonth` for the monthly types.
 *
 * Leave (docs/TIME-TRACKING-V2.md D4.1, C2, C10, C11), the optional `leave` argument:
 *   WD = workingDays, PL / UL = paid / unpaid leave days (`leaveDaysInMonth`, timeLeave.ts),
 *   H  = the person's hours per day (`leave.hoursPerDay`, else settings.hoursPerDay)
 *   monthCost      = salary x (WD - UL) / WD x multiplier
 *   availableHours = (WD - UL - PL) x H   (fixed basis: fixedHoursPerMonth x (WD - UL - PL) / WD)
 *   rate           = round4(monthCost / availableHours)
 * availableHours <= 0 falls back to the no-leave basis (WD x H, or fixedHoursPerMonth) with
 * `fallback: true`. Daily pay divides by the person's H too; hourly pay ignores leave.
 * No leave and the company's hours per day give exactly the numbers of the table above.
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
  /** Monthly types: salary x (WD - UL) / WD x multiplier, 4 decimals. */
  monthCost?: number | null;
  /** Monthly types: the paid / unpaid leave days the rate used (after clamping to the month). */
  paidLeaveDays?: number | null;
  unpaidLeaveDays?: number | null;
  /** The hours per day the rate used (the person's, else the company's). */
  hoursPerDay?: number | null;
  /** The month had no available hours left after leave; the no-leave basis was used. */
  fallback?: boolean;
}

/** Per-person inputs of D4.1; all optional, and none of them = today's numbers. */
export interface CostLeave {
  paidLeaveDays?: number | null;
  unpaidLeaveDays?: number | null;
  /** employees.hours_per_day; null or not positive = settings.hoursPerDay. */
  hoursPerDay?: number | null;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

const NONE: CostRate = { rate: null, source: "none", basisDays: null, basisHours: null, manDay: null, multiplier: 1, amount: null };

/** Hours a monthly amount is spread over, and the day count behind it (null when the basis is fixed). */
export const basisFor = (workingDays: number, settings: CostSettings): { hours: number; days: number | null } =>
  settings.hoursBasis === "fixed"
    ? { hours: settings.fixedHoursPerMonth, days: null }
    : { hours: workingDays * settings.hoursPerDay, days: workingDays };

const nonNegative = (n: number | null | undefined): number => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/**
 * The hourly cost rate of one person for one month. `workingDays` is that month's, in the person's
 * country; `leave` carries that month's leave days and the person's hours per day (D4.1).
 */
export const computeCostRate = (
  person: CostPerson | null | undefined,
  workingDays: number,
  settings: CostSettings = DEFAULT_COST_SETTINGS,
  leave: CostLeave | null = null,
): CostRate => {
  if (!person) return NONE;
  const amount = Number(person.salaryAmount);
  if (!Number.isFinite(amount) || amount <= 0) return NONE;
  const personHours = Number(leave?.hoursPerDay);
  const hoursPerDay = Number.isFinite(personHours) && personHours > 0 ? personHours : settings.hoursPerDay;
  if (!(hoursPerDay > 0)) return NONE;

  const kind = person.kind || "employee";
  if (kind === "ledger") return NONE;
  const isContractor = kind === "contractor";
  const salaryType = person.salaryType || (isContractor ? "hourly" : "monthly");
  const multiplier = isContractor ? 1 : settings.employerMultiplier > 0 ? settings.employerMultiplier : 1;

  if (salaryType === "hourly") {
    return { rate: round4(amount * multiplier), source: isContractor ? "contractor_hourly" : "hourly", basisDays: null, basisHours: null, manDay: round4(amount * hoursPerDay), multiplier, amount, hoursPerDay };
  }
  if (salaryType === "daily") {
    return { rate: round4((amount / hoursPerDay) * multiplier), source: isContractor ? "contractor_daily" : "daily", basisDays: null, basisHours: null, manDay: round4(amount), multiplier, amount, hoursPerDay };
  }
  if (salaryType === "monthly") {
    const fixed = settings.hoursBasis === "fixed";
    const fullHours = fixed ? settings.fixedHoursPerMonth : workingDays * hoursPerDay;
    if (!(fullHours > 0)) return NONE;
    // Leave only makes sense against a month that has working days.
    const wd = workingDays > 0 ? workingDays : 0;
    const unpaid = wd > 0 ? Math.min(nonNegative(leave?.unpaidLeaveDays), wd) : 0;
    const paid = wd > 0 ? Math.min(nonNegative(leave?.paidLeaveDays), wd - unpaid) : 0;
    const left = wd - unpaid - paid;
    // No leave: exactly today's arithmetic (amount / hours x multiplier).
    const monthBase = unpaid > 0 ? (amount * (wd - unpaid)) / wd : amount;
    let hours = fullHours;
    if (unpaid > 0 || paid > 0) hours = fixed ? (settings.fixedHoursPerMonth * left) / wd : left * hoursPerDay;
    const fallback = !(hours > 0);
    if (fallback) hours = fullHours;
    return {
      rate: round4((monthBase / hours) * multiplier),
      source: isContractor ? "contractor_monthly" : "monthly",
      basisDays: fixed ? null : workingDays,
      basisHours: hours,
      manDay: round4((monthBase / hours) * hoursPerDay),
      multiplier,
      amount,
      monthCost: round4(monthBase * multiplier),
      paidLeaveDays: paid,
      unpaidLeaveDays: unpaid,
      hoursPerDay,
      fallback,
    };
  }
  return NONE;
};

/**
 * `worked_ms / 3 600 000 x rate`, 4 decimals (docs/TIME-TRACKING-V2.md D3.2); null with no rate or
 * no worked time. The server writes it (`ccrm_tt_settle()`); a total sums these and rounds to cents
 * once, at the end. Billable value still uses project time (duration), not this.
 */
export const computeWorkedCost = (workedMs: number | null | undefined, rate: number | null | undefined): number | null => {
  if (rate === null || rate === undefined || workedMs === null || workedMs === undefined) return null;
  return round4((workedMs / 3600000) * rate);
};

export interface ExplainContext {
  t: (en: string, sk: string, hu: string) => string;
  /** The rate card is still open: the explanation says "provisional" (false or undefined: nothing said). */
  provisional?: boolean;
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

/** The rate card of one person-month, as `time_entries.php?action=rateCard` returns it. */
export interface RateCard {
  employeeId?: string;
  month?: string;
  rate: number | null;
  source: string;
  salaryAmount: number | null;
  /** Working days of the month; null when unknown. */
  workingDays: number | null;
  /** null with a fixed-hours basis. */
  basisDays?: number | null;
  country?: string;
  paidLeaveDays?: number | null;
  unpaidLeaveDays?: number | null;
  hoursPerDay?: number | null;
  multiplier?: number | null;
  fallback?: boolean;
  frozen?: boolean;
  hoursBasis?: string;
  fixedHoursPerMonth?: number | null;
}

const trimNum = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * A monthly rate from the rate card in words (D4.1, D4.3). Examples (en):
 *   none:    "€3,200 ÷ 20 days ÷ 8 h × 1.352 = €27.04/h (May 2026, SK, provisional)"
 *   paid:    "€3,200 ÷ (20 − 3 leave) days ÷ 8 h × 1.352 = €31.81/h (...)"
 *   unpaid:  "€3,200 × 18/20 ÷ (20 − 2 unpaid) days ÷ 8 h × 1.352 = €27.04/h (...)"
 *   both:    "€3,200 × 18/20 ÷ (20 − 3 leave − 2 unpaid) days ÷ 8 h × 1.352 = €32.45/h (...)"
 *   fallback: "... = €27.04/h (whole month on leave: basis 20 days, May 2026, SK)"
 * "provisional" only while `ctx.provisional` is true (the card is not frozen). Null when the card is
 * not a monthly one (or has no working days), so the caller keeps its own text.
 */
export const explainRateCard = (c: RateCard, ctx: ExplainContext): string | null => {
  if (c.rate === null || c.salaryAmount === null || (c.source !== "monthly" && c.source !== "contractor_monthly")) return null;
  const { t, money } = ctx;
  const wd = c.workingDays ?? c.basisDays ?? null;
  if (wd === null || !(wd > 0)) return null;
  const paid = Math.max(0, Number(c.paidLeaveDays) || 0);
  const unpaid = Math.max(0, Number(c.unpaidLeaveDays) || 0);
  const h = Number(c.hoursPerDay) > 0 ? Number(c.hoursPerDay) : 8;
  const mult = Number(c.multiplier) > 0 && Number(c.multiplier) !== 1 ? ` × ${c.multiplier}` : "";
  const hUnit = t("h", "h", "ó");
  const salary = unpaid > 0 ? `${money(c.salaryAmount)} × ${trimNum(wd - unpaid)}/${wd}` : money(c.salaryAmount);
  const days = (() => {
    if (c.fallback || (paid <= 0 && unpaid <= 0)) return `${wd}`;
    const bits = [String(wd)];
    if (paid > 0) bits.push(`− ${trimNum(paid)} ${t("leave", "dovolenka", "szabadság")}`);
    if (unpaid > 0) bits.push(`− ${trimNum(unpaid)} ${t("unpaid", "neplatená", "fizetetlen")}`);
    return `(${bits.join(" ")})`;
  })();
  const dayWord = t("days", "dní", "nap");
  const divisor =
    c.hoursBasis === "fixed" && Number(c.fixedHoursPerMonth) > 0
      ? `${trimNum(Number(c.fixedHoursPerMonth) * (c.fallback ? 1 : (wd - unpaid - paid) / wd))} ${hUnit} ${t("(fixed monthly hours)", "(pevný počet hodín mesiaca)", "(havi fix óraszám)")}`
      : `${days} ${dayWord} ÷ ${h} ${hUnit}`;
  const note: string[] = [];
  if (c.fallback) note.push(t(`whole month on leave: basis ${wd} days`, `celý mesiac na dovolenke: základ ${wd} dní`, `egész hónap szabadságon: ${wd} napos alap`));
  note.push(ctx.monthLabel);
  if (c.country) note.push(c.country);
  if (ctx.provisional) note.push(t("provisional", "predbežná", "ideiglenes"));
  return `${salary} ÷ ${divisor}${mult} = ${money(c.rate)}/h (${note.join(", ")})`;
};

/** "Oct 2026 · 22 working days · man-day €145.45 · €24.58/h" — the Team matrix and drawer tooltip. */
export const costRateTooltip = (r: CostRate, ctx: ExplainContext): string => {
  if (r.rate === null) return ctx.t("No rate — no employee linked", "Bez sadzby — nie je pripojený zamestnanec", "Nincs díj — nincs munkatárs hozzárendelve");
  const parts = [ctx.monthLabel];
  if (r.basisDays !== null) parts.push(`${r.basisDays} ${ctx.t("working days", "pracovných dní", "munkanap")}`);
  if (r.manDay !== null) parts.push(`${ctx.t("man-day", "osobodeň", "ember-nap")} ${ctx.money(r.manDay)}`);
  parts.push(`${ctx.money(r.rate)}/h`);
  // Monthly pay: the same words as the entry drawer, from the leave the rate was priced with.
  const why =
    r.amount !== null && r.basisDays !== null
      ? explainRateCard(
          { rate: r.rate, source: r.source, salaryAmount: r.amount, workingDays: r.basisDays, paidLeaveDays: r.paidLeaveDays, unpaidLeaveDays: r.unpaidLeaveDays, hoursPerDay: r.hoursPerDay, multiplier: r.multiplier, fallback: r.fallback, country: ctx.country },
          ctx,
        )
      : null;
  return parts.join(" · ") + (why ? `\n${why}` : "");
};
