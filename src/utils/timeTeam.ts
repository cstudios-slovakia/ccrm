/**
 * Team matrix: people × week/month, from entries the list API already returned.
 *
 * Cost is each entry's frozen `cost`. A week that crosses a month is the sum of
 * those amounts, never a rate recomputed for the week. Other people's cost is
 * omitted here when the viewer lacks `time_tracking_costs` (B8); the viewer's
 * own cost stays. Rounding is not applied — that belongs to reports only.
 */

import { addDays, daysInMonth } from "./holidays.ts";
import { isAdminRoleName } from "./permissions.ts";
import {
  basisFor,
  computeCostRate,
  round2,
  round4,
  type CostRate,
  type CostRateSource,
  type CostSettings,
} from "./timeCost.ts";
import { hoursOf, weekStart, type TimeTrackingSettings } from "./timeTracking.ts";

export const WEEK_COLUMNS = 8;
export const MONTH_COLUMNS = 6;

export type HolidayCountry = "SK" | "HU";
export type TeamRoleBadge = "admin" | "manager" | "employee" | "contractor";
export type MoneyByCurrency = Record<string, number>;

export interface TeamBucket {
  id: string;
  from: string;
  to: string;
}

export interface TeamPerson {
  userId: string;
  name: string;
  roleName: string;
  kind?: string | null;
  employeeId: string | null;
  /** Include at zero hours (an active employee). */
  active: boolean;
  workCountry: HolidayCountry;
  salaryType?: string | null;
  salaryAmount?: number | null;
  color?: string;
}

export interface TeamVacation {
  employeeId: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface TeamProjectRef {
  id: string;
  active: boolean;
}

export interface TeamEntry {
  userId: string;
  projectId: string | null;
  /** YYYY-MM-DD */
  entryDate: string;
  durationSec: number;
  cost?: number | null;
  currency?: string;
  costRate?: number | null;
  costRateSource?: string | null;
  costRateBasisDays?: number | null;
}

export interface TeamRateNote {
  /** YYYY-MM */
  month: string;
  country: HolidayCountry;
  rate: CostRate;
}

export interface TeamProjectSlice {
  projectId: string | null;
  seconds: number;
  cost: MoneyByCurrency;
}

export interface TeamCell {
  bucketId: string;
  from: string;
  to: string;
  seconds: number;
  cost: MoneyByCurrency;
  /** Every working day of the bucket is vacation, and nothing was logged. */
  vacation: boolean;
  basisSeconds: number;
  projects: TeamProjectSlice[];
  rates: TeamRateNote[];
}

export interface TeamRow {
  userId: string;
  name: string;
  employeeId: string | null;
  badge: TeamRoleBadge;
  color: string;
  /** Live rate for today. Null when this viewer must not see it. */
  rate: CostRate | null;
  showRate: boolean;
  noEmployee: boolean;
  cells: TeamCell[];
  totalSeconds: number;
  totalCost: MoneyByCurrency;
}

export interface TeamMatrix {
  buckets: TeamBucket[];
  rows: TeamRow[];
  totals: {
    seconds: number[];
    cost: MoneyByCurrency[];
    totalSeconds: number;
    totalCost: MoneyByCurrency;
  };
}

const VACATION_ON = new Set(["approved", "taken", "pending"]);

const pad = (n: number): string => String(n).padStart(2, "0");

export const teamRoleBadge = (roleName: string | null | undefined, kind?: string | null): TeamRoleBadge => {
  if (kind === "contractor") return "contractor";
  if (isAdminRoleName(roleName)) return "admin";
  if ((roleName || "").toLowerCase().includes("manager")) return "manager";
  return "employee";
};

/** Own cost always; anyone else's only with `time_tracking_costs`. */
export const visibleEntryCost = (
  entry: { userId: string; cost?: number | null },
  viewerUserId: string,
  canCosts: boolean,
): number | null => {
  if (entry.cost == null || entry.cost === ("" as unknown)) return null;
  const n = typeof entry.cost === "number" ? entry.cost : Number(entry.cost);
  if (!Number.isFinite(n)) return null;
  if (canCosts || entry.userId === viewerUserId) return n;
  return null;
};

export const canSeePersonCost = (userId: string, viewerUserId: string, canCosts: boolean): boolean =>
  canCosts || userId === viewerUserId;

/** Drop cost fields the viewer must not see. Own entries are unchanged. */
export const withoutHiddenCost = <T extends { userId: string }>(entry: T, viewerUserId: string, canCosts: boolean): T => {
  if (canSeePersonCost(entry.userId, viewerUserId, canCosts)) return entry;
  const copy = { ...entry } as T & Record<string, unknown>;
  delete copy.cost;
  delete copy.costRate;
  delete copy.costRateSource;
  delete copy.costRateBasisDays;
  delete copy.billableRate;
  return copy;
};

export const addMoney = (bag: MoneyByCurrency, currency: string, amount: number | null | undefined): void => {
  if (amount == null || !Number.isFinite(amount)) return;
  const code = currency || "EUR";
  bag[code] = round2((bag[code] ?? 0) + amount);
};

export const sumMoney = (bags: readonly MoneyByCurrency[]): MoneyByCurrency => {
  const out: MoneyByCurrency = {};
  for (const bag of bags) for (const [code, amount] of Object.entries(bag)) addMoney(out, code, amount);
  return out;
};

/** A frozen snapshot turned back into the shape `costRateTooltip` reads. */
export const frozenCostRate = (
  entry: { costRate?: number | null; costRateSource?: string | null; costRateBasisDays?: number | null },
  settings: CostSettings,
): CostRate | null => {
  if (entry.costRate == null || !Number.isFinite(Number(entry.costRate))) return null;
  const rate = Number(entry.costRate);
  const source = (entry.costRateSource || "none") as CostRateSource;
  if (source === "none") return null;
  const multiplier = source.startsWith("contractor") ? 1 : settings.employerMultiplier > 0 ? settings.employerMultiplier : 1;
  const basisDays = entry.costRateBasisDays ?? null;
  const basisHours = basisDays != null && settings.hoursPerDay > 0 ? basisDays * settings.hoursPerDay : null;
  const manDay = settings.hoursPerDay > 0 ? round4((rate / multiplier) * settings.hoursPerDay) : null;
  return { rate, source, basisDays, basisHours, manDay, multiplier, amount: null };
};

export const weekBuckets = (end: string, count = WEEK_COLUMNS): TeamBucket[] => {
  const endMonday = weekStart(end);
  const first = addDays(endMonday, -7 * (count - 1));
  return Array.from({ length: count }, (_, i) => {
    const from = addDays(first, i * 7);
    return { id: from, from, to: addDays(from, 6) };
  });
};

export const monthBuckets = (endMonth: string, count = MONTH_COLUMNS): TeamBucket[] => {
  const [y0, m0] = endMonth.split("-").map(Number);
  const buckets: TeamBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const from = `${y}-${pad(m)}-01`;
    const to = `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
    buckets.push({ id: `${y}-${pad(m)}`, from, to });
  }
  return buckets;
};

export const shiftWeekAnchor = (monday: string, dir: -1 | 1, count = WEEK_COLUMNS): string =>
  addDays(weekStart(monday), dir * 7 * count);

export const shiftMonthAnchor = (ym: string, dir: -1 | 1, count = MONTH_COLUMNS): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + dir * count, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

const inBucket = (iso: string, bucket: TeamBucket): boolean => iso >= bucket.from && iso <= bucket.to;

const coversVacation = (v: TeamVacation, day: string): boolean =>
  VACATION_ON.has(v.status) && v.startDate <= day && day <= v.endDate;

const csvCell = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface TeamBuildInput {
  entries: readonly TeamEntry[];
  people: readonly TeamPerson[];
  projects: readonly TeamProjectRef[];
  vacations: readonly TeamVacation[];
  buckets: readonly TeamBucket[];
  viewerUserId: string;
  canCosts: boolean;
  currency: string;
  settings: Pick<TimeTrackingSettings, "hoursBasis" | "fixedHoursPerMonth" | "hoursPerDay" | "employerMultiplier">;
  /** YYYY-MM-DD, for the live "current rate" on each row. */
  today: string;
  bucketKind: "week" | "month";
  activeOnly: boolean;
  projectId: string | null;
  /** Working day in that person's country. */
  isWorkingDay: (country: HolidayCountry, iso: string) => boolean;
  monthWorkingDays: (country: HolidayCountry, year: number, month: number) => number;
}

const basisSecondsFor = (
  bucket: TeamBucket,
  country: HolidayCountry,
  settings: TeamBuildInput["settings"],
  monthBucket: boolean,
  isWorkingDay: TeamBuildInput["isWorkingDay"],
  monthWorkingDays: TeamBuildInput["monthWorkingDays"],
): number => {
  if (monthBucket && settings.hoursBasis === "fixed") return Math.max(0, settings.fixedHoursPerMonth) * 3600;
  const [y, m] = bucket.from.split("-").map(Number);
  if (monthBucket) return basisFor(monthWorkingDays(country, y, m), settings).hours * 3600;
  let days = 0;
  for (let d = bucket.from; d <= bucket.to; d = addDays(d, 1)) if (isWorkingDay(country, d)) days++;
  return days * settings.hoursPerDay * 3600;
};

const wholeVacation = (
  employeeId: string | null,
  bucket: TeamBucket,
  country: HolidayCountry,
  vacations: readonly TeamVacation[],
  isWorkingDay: TeamBuildInput["isWorkingDay"],
): boolean => {
  if (!employeeId) return false;
  const mine = vacations.filter((v) => v.employeeId === employeeId);
  if (!mine.length) return false;
  let working = 0;
  for (let d = bucket.from; d <= bucket.to; d = addDays(d, 1)) {
    if (!isWorkingDay(country, d)) continue;
    working++;
    if (!mine.some((v) => coversVacation(v, d))) return false;
  }
  return working > 0;
};

export const buildTeamMatrix = (input: TeamBuildInput): TeamMatrix => {
  const projectActive = new Map(input.projects.map((p) => [p.id, p.active]));
  const peopleById = new Map(input.people.map((p) => [p.userId, p]));
  let entries = input.entries.filter((e) => input.buckets.some((b) => inBucket(e.entryDate, b)));
  if (input.projectId) entries = entries.filter((e) => e.projectId === input.projectId);
  if (input.activeOnly) {
    entries = entries.filter((e) => {
      if (!e.projectId) return true;
      const active = projectActive.get(e.projectId);
      return active === undefined ? true : active;
    });
  }

  const ids = new Set<string>();
  for (const e of entries) ids.add(e.userId);
  for (const p of input.people) if (p.active && p.userId) ids.add(p.userId);

  const monthBucket = input.bucketKind === "month";
  const [ty, tm] = input.today.split("-").map(Number);

  const rows: TeamRow[] = [...ids]
    .map((userId) => {
      const person = peopleById.get(userId);
      const name = person?.name || userId;
      const country = person?.workCountry ?? "SK";
      const showRate = canSeePersonCost(userId, input.viewerUserId, input.canCosts);
      const noEmployee = !person?.employeeId;
      let rate: CostRate | null = null;
      if (showRate && person) {
        const days = input.monthWorkingDays(country, ty, tm);
        rate = computeCostRate(
          { kind: person.kind, salaryType: person.salaryType, salaryAmount: person.salaryAmount },
          days,
          input.settings,
        );
      }
      const mine = entries.filter((e) => e.userId === userId);
      const cells: TeamCell[] = input.buckets.map((bucket) => {
        const slices = new Map<string, TeamProjectSlice>();
        const rateKeys = new Map<string, TeamRateNote>();
        let seconds = 0;
        const cost: MoneyByCurrency = {};
        for (const e of mine) {
          if (!inBucket(e.entryDate, bucket)) continue;
          const sec = Math.max(0, Math.round(e.durationSec || 0));
          seconds += sec;
          const visible = visibleEntryCost(e, input.viewerUserId, input.canCosts);
          const code = e.currency || input.currency;
          addMoney(cost, code, visible);
          const key = e.projectId ?? "";
          const slice = slices.get(key) ?? { projectId: e.projectId, seconds: 0, cost: {} };
          slice.seconds += sec;
          addMoney(slice.cost, code, visible);
          slices.set(key, slice);
          if (visible != null && showRate) {
            const frozen = frozenCostRate(e, input.settings);
            if (frozen) {
              const month = e.entryDate.slice(0, 7);
              const id = `${month}|${frozen.source}|${frozen.basisDays ?? ""}|${frozen.rate}`;
              if (!rateKeys.has(id)) rateKeys.set(id, { month, country, rate: frozen });
            }
          }
        }
        const vacation = seconds === 0 && wholeVacation(person?.employeeId ?? null, bucket, country, input.vacations, input.isWorkingDay);
        return {
          bucketId: bucket.id,
          from: bucket.from,
          to: bucket.to,
          seconds,
          cost,
          vacation,
          basisSeconds: basisSecondsFor(bucket, country, input.settings, monthBucket, input.isWorkingDay, input.monthWorkingDays),
          projects: [...slices.values()].sort((a, b) => b.seconds - a.seconds),
          rates: [...rateKeys.values()],
        };
      });
      return {
        userId,
        name,
        employeeId: person?.employeeId ?? null,
        badge: teamRoleBadge(person?.roleName, person?.kind),
        color: person?.color || "#64748b",
        rate: showRate ? rate : null,
        showRate,
        noEmployee,
        cells,
        totalSeconds: cells.reduce((s, c) => s + c.seconds, 0),
        totalCost: sumMoney(cells.map((c) => c.cost)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));

  const seconds = input.buckets.map((_, i) => rows.reduce((s, row) => s + row.cells[i].seconds, 0));
  const cost = input.buckets.map((_, i) => sumMoney(rows.map((row) => row.cells[i].cost)));
  return {
    buckets: [...input.buckets],
    rows,
    totals: {
      seconds,
      cost,
      totalSeconds: seconds.reduce((s, n) => s + n, 0),
      totalCost: sumMoney(cost),
    },
  };
};

export const teamMatrixCsv = (
  matrix: TeamMatrix,
  headers: { person: string; role: string; rate: string; hours: string; cost: string; total: string },
  roleLabel: (badge: TeamRoleBadge) => string,
): string => {
  const currencies = new Set<string>();
  for (const row of matrix.rows) for (const code of Object.keys(row.totalCost)) currencies.add(code);
  for (const bag of matrix.totals.cost) for (const code of Object.keys(bag)) currencies.add(code);
  const codes = [...currencies].sort();
  const head = [headers.person, headers.role, headers.rate];
  for (const bucket of matrix.buckets) {
    head.push(`${bucket.from} ${headers.hours}`);
    for (const code of codes) head.push(`${bucket.from} ${headers.cost} ${code}`);
  }
  head.push(`${headers.total} ${headers.hours}`);
  for (const code of codes) head.push(`${headers.total} ${headers.cost} ${code}`);
  const lines = [head.map(csvCell).join(",")];
  const push = (name: string, role: string, rate: string, cells: { seconds: number; cost: MoneyByCurrency }[], totalSeconds: number, totalCost: MoneyByCurrency) => {
    const cols = [name, role, rate];
    for (const cell of cells) {
      cols.push(hoursOf(cell.seconds).toFixed(2));
      for (const code of codes) cols.push(cell.cost[code] == null ? "" : cell.cost[code].toFixed(2));
    }
    cols.push(hoursOf(totalSeconds).toFixed(2));
    for (const code of codes) cols.push(totalCost[code] == null ? "" : totalCost[code].toFixed(2));
    lines.push(cols.map(csvCell).join(","));
  };
  for (const row of matrix.rows) {
    const rate = row.showRate && row.rate?.rate != null ? row.rate.rate.toFixed(2) : "";
    push(row.name, roleLabel(row.badge), rate, row.cells, row.totalSeconds, row.totalCost);
  }
  push(headers.total, "", "", matrix.buckets.map((_, i) => ({ seconds: matrix.totals.seconds[i], cost: matrix.totals.cost[i] })), matrix.totals.totalSeconds, matrix.totals.totalCost);
  return `\uFEFF${lines.join("\n")}`;
};
