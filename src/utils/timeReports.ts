/**
 * Reports and the salary allocation, from the same entry list as the Team matrix.
 *
 * Rounding (`settings.rounding`) is applied here and in the client PDF only.
 * Cost of other people is dropped unless the viewer has `time_tracking_costs`.
 * Salary figures are `Employee.salaryAmount` — never an EmployeeSalary total,
 * which mixes base pay with bonuses.
 */

import { computeCostRate, type CostRate } from "./timeCost.ts";
import { hoursOf } from "./timeTracking.ts";
import {
  addMoney,
  sumMoney,
  visibleEntryCost,
  type MoneyByCurrency,
} from "./timeTeam.ts";

export type ReportGroupBy = "title" | "project" | "person" | "client" | "day";
export type BillableFilter = "all" | "yes" | "no";

export interface ReportRounding {
  minutes: number;
  mode: "nearest" | "up";
}

export interface ReportEntry {
  id: string;
  userId: string;
  projectId: string | null;
  clientId: string | null;
  entryDate: string;
  title: string;
  durationSec: number;
  billable: boolean;
  cost?: number | null;
  currency?: string;
}

export interface ReportFilters {
  from: string;
  to: string;
  userId: string | null;
  projectId: string | null;
  clientId: string | null;
  billable: BillableFilter;
  groupBy: ReportGroupBy;
}

export interface ReportLine {
  id: string;
  userId: string;
  projectId: string | null;
  clientId: string | null;
  entryDate: string;
  title: string;
  /** Rounded seconds. */
  seconds: number;
  billable: boolean;
  cost: MoneyByCurrency;
}

export interface ReportGroup {
  key: string;
  seconds: number;
  billableSeconds: number;
  cost: MoneyByCurrency;
}

export interface BuiltReport {
  lines: ReportLine[];
  groups: ReportGroup[];
  totals: { seconds: number; billableSeconds: number; cost: MoneyByCurrency };
  /** Logged seconds ÷ working days in the period. Null when the period has none. */
  perWorkingDaySeconds: number | null;
  shareByProject: { projectId: string | null; seconds: number; ratio: number }[];
}

/** Snap a duration to the report increment. `minutes: 0` leaves it alone. */
export const roundDurationSec = (sec: number, rounding: ReportRounding): number => {
  const total = Math.max(0, Math.round(sec || 0));
  const step = Math.round(rounding.minutes) * 60;
  if (!(step > 0)) return total;
  if (rounding.mode === "up") return total === 0 ? 0 : Math.ceil(total / step) * step;
  return Math.round(total / step) * step;
};

const groupKey = (line: ReportLine, by: ReportGroupBy): string => {
  switch (by) {
    case "project":
      return line.projectId ?? "";
    case "person":
      return line.userId;
    case "client":
      return line.clientId ?? "";
    case "day":
      return line.entryDate;
    default:
      return line.title || "";
  }
};

export const buildReport = (input: {
  entries: readonly ReportEntry[];
  filters: ReportFilters;
  rounding: ReportRounding;
  viewerUserId: string;
  canCosts: boolean;
  currency: string;
  workingDays: number;
}): BuiltReport => {
  const { filters } = input;
  const lines: ReportLine[] = [];
  for (const e of input.entries) {
    if (e.entryDate < filters.from || e.entryDate > filters.to) continue;
    if (filters.userId && e.userId !== filters.userId) continue;
    if (filters.projectId && e.projectId !== filters.projectId) continue;
    if (filters.clientId && e.clientId !== filters.clientId) continue;
    if (filters.billable === "yes" && !e.billable) continue;
    if (filters.billable === "no" && e.billable) continue;
    const seconds = roundDurationSec(e.durationSec, input.rounding);
    const cost: MoneyByCurrency = {};
    addMoney(cost, e.currency || input.currency, visibleEntryCost(e, input.viewerUserId, input.canCosts));
    lines.push({
      id: e.id,
      userId: e.userId,
      projectId: e.projectId,
      clientId: e.clientId,
      entryDate: e.entryDate,
      title: e.title,
      seconds,
      billable: e.billable,
      cost,
    });
  }
  const groups = new Map<string, ReportGroup>();
  for (const line of lines) {
    const key = groupKey(line, filters.groupBy);
    const g = groups.get(key) ?? { key, seconds: 0, billableSeconds: 0, cost: {} };
    g.seconds += line.seconds;
    if (line.billable) g.billableSeconds += line.seconds;
    g.cost = sumMoney([g.cost, line.cost]);
    groups.set(key, g);
  }
  const ordered = [...groups.values()].sort((a, b) => b.seconds - a.seconds || a.key.localeCompare(b.key));
  const totals = {
    seconds: lines.reduce((s, l) => s + l.seconds, 0),
    billableSeconds: lines.reduce((s, l) => s + (l.billable ? l.seconds : 0), 0),
    cost: sumMoney(lines.map((l) => l.cost)),
  };
  const byProject = new Map<string, number>();
  for (const line of lines) {
    const key = line.projectId ?? "";
    byProject.set(key, (byProject.get(key) ?? 0) + line.seconds);
  }
  const shareByProject = [...byProject.entries()]
    .map(([key, seconds]) => ({
      projectId: key || null,
      seconds,
      ratio: totals.seconds > 0 ? seconds / totals.seconds : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);
  return {
    lines,
    groups: ordered,
    totals,
    perWorkingDaySeconds: input.workingDays > 0 ? totals.seconds / input.workingDays : null,
    shareByProject,
  };
};

export interface ClientPdfRow {
  date: string;
  person: string;
  project: string;
  title: string;
  hours: string;
}

/** Billable lines only, already rounded, with no cost column. */
export const clientPdfRows = (
  report: BuiltReport,
  label: { person: (userId: string) => string; project: (projectId: string | null) => string },
): ClientPdfRow[] =>
  report.lines
    .filter((l) => l.billable && l.seconds > 0)
    .map((l) => ({
      date: l.entryDate,
      person: label.person(l.userId),
      project: label.project(l.projectId),
      title: l.title,
      hours: hoursOf(l.seconds).toFixed(2),
    }));

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** A printable page the browser saves as PDF. Cost is not on it. */
export const clientReportHtml = (input: {
  title: string;
  period: string;
  rows: readonly ClientPdfRow[];
  totalHours: string;
  labels: { date: string; person: string; project: string; title: string; hours: string; total: string; billableOnly: string };
}): string => {
  const body = input.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.date)}</td><td>${esc(r.person)}</td><td>${esc(r.project)}</td><td>${esc(r.title)}</td><td class="num">${esc(r.hours)}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(input.title)}</title>
<style>
  body { font-family: "Segoe UI", sans-serif; color: #0f172a; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { color: #64748b; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #0d9488; padding: 6px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 6px; font-size: 13px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-bottom: none; }
  @media print { body { margin: 12px; } }
</style></head><body>
<h1>${esc(input.title)}</h1>
<p>${esc(input.period)} · ${esc(input.labels.billableOnly)}</p>
<table><thead><tr>
<th>${esc(input.labels.date)}</th><th>${esc(input.labels.person)}</th><th>${esc(input.labels.project)}</th><th>${esc(input.labels.title)}</th><th class="num">${esc(input.labels.hours)}</th>
</tr></thead><tbody>${body}</tbody>
<tfoot><tr><td colspan="4">${esc(input.labels.total)}</td><td class="num">${esc(input.totalHours)}</td></tr></tfoot>
</table></body></html>`;
};

const csvCell = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const costCells = (bag: MoneyByCurrency, codes: string[]): string[] => codes.map((c) => (bag[c] == null ? "" : bag[c].toFixed(2)));

export const reportCsv = (
  report: BuiltReport,
  mode: "summary" | "detailed",
  headers: { group: string; date: string; person: string; project: string; title: string; hours: string; billable: string; cost: string; total: string },
  label: { group: (key: string) => string; person: (userId: string) => string; project: (id: string | null) => string },
): string => {
  const codes = [...new Set(report.lines.flatMap((l) => Object.keys(l.cost)))].sort();
  const lines: string[] = [];
  if (mode === "summary") {
    lines.push([headers.group, headers.hours, headers.billable, ...codes.map((c) => `${headers.cost} ${c}`)].map(csvCell).join(","));
    for (const g of report.groups) {
      lines.push([label.group(g.key), hoursOf(g.seconds).toFixed(2), hoursOf(g.billableSeconds).toFixed(2), ...costCells(g.cost, codes)].map(csvCell).join(","));
    }
    lines.push([headers.total, hoursOf(report.totals.seconds).toFixed(2), hoursOf(report.totals.billableSeconds).toFixed(2), ...costCells(report.totals.cost, codes)].map(csvCell).join(","));
  } else {
    lines.push([headers.date, headers.person, headers.project, headers.title, headers.hours, headers.billable, ...codes.map((c) => `${headers.cost} ${c}`)].map(csvCell).join(","));
    for (const l of report.lines) {
      lines.push([l.entryDate, label.person(l.userId), label.project(l.projectId), l.title, hoursOf(l.seconds).toFixed(2), l.billable ? "1" : "0", ...costCells(l.cost, codes)].map(csvCell).join(","));
    }
    lines.push([headers.total, "", "", "", hoursOf(report.totals.seconds).toFixed(2), "", ...costCells(report.totals.cost, codes)].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
};

export type SalaryBucket = "client" | "internal" | "unallocated";

export interface SalaryProject {
  id: string;
  isInternal: boolean;
}

export interface SalaryPerson {
  userId: string;
  name: string;
  employeeId: string | null;
  active: boolean;
  kind?: string | null;
  salaryType?: string | null;
  /** Base pay. Not an EmployeeSalary total. */
  salaryAmount?: number | null;
  workCountry: "SK" | "HU";
}

export interface SalaryEntry {
  userId: string;
  projectId: string | null;
  entryDate: string;
  durationSec: number;
  cost?: number | null;
  currency?: string;
}

export interface SalaryRow {
  userId: string;
  name: string;
  employeeId: string;
  loadedSalary: number | null;
  currency: string;
  /** This month's rate from `salaryAmount`, for the tooltip (month and basis). */
  rate: CostRate;
  trackedSeconds: number;
  clientSeconds: number;
  internalSeconds: number;
  unallocatedSeconds: number;
  clientCost: MoneyByCurrency;
  internalCost: MoneyByCurrency;
  unallocatedCost: MoneyByCurrency;
  /** Tracked hours ÷ the month's basis hours. Null when the basis is zero. */
  utilisation: number | null;
}

export interface SalaryReport {
  rows: SalaryRow[];
  totals: {
    loadedSalary: MoneyByCurrency;
    trackedSeconds: number;
    clientCost: MoneyByCurrency;
    internalCost: MoneyByCurrency;
    unallocatedCost: MoneyByCurrency;
  };
  /** Logged-in users with time and no employee record. */
  withoutSalary: { userId: string; name: string; seconds: number; cost: MoneyByCurrency }[];
}

export const allocationOf = (projectId: string | null, projects: readonly SalaryProject[]): SalaryBucket => {
  if (!projectId) return "unallocated";
  const project = projects.find((p) => p.id === projectId);
  if (!project) return "unallocated";
  return project.isInternal ? "internal" : "client";
};

/** The month before `today`, which has already closed. */
export const lastClosedMonth = (today: string): string => {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const monthRange = (ym: string): { from: string; to: string } => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
};

export const buildSalaryReport = (input: {
  entries: readonly SalaryEntry[];
  people: readonly SalaryPerson[];
  projects: readonly SalaryProject[];
  from: string;
  to: string;
  viewerUserId: string;
  canCosts: boolean;
  currency: string;
  settings: { hoursBasis: "workingDays" | "fixed"; fixedHoursPerMonth: number; hoursPerDay: number; employerMultiplier: number };
  monthWorkingDays: (country: "SK" | "HU", year: number, month: number) => number;
}): SalaryReport => {
  const [y, m] = input.from.split("-").map(Number);
  const inRange = input.entries.filter((e) => e.entryDate >= input.from && e.entryDate <= input.to);
  const employed = input.people.filter((p) => p.employeeId);
  const employedIds = new Set(employed.map((p) => p.userId));

  const bucket = (userId: string) => {
    const acc = {
      seconds: 0,
      clientSeconds: 0,
      internalSeconds: 0,
      unallocatedSeconds: 0,
      clientCost: {} as MoneyByCurrency,
      internalCost: {} as MoneyByCurrency,
      unallocatedCost: {} as MoneyByCurrency,
    };
    for (const e of inRange) {
      if (e.userId !== userId) continue;
      const sec = Math.max(0, Math.round(e.durationSec || 0));
      acc.seconds += sec;
      const where = allocationOf(e.projectId, input.projects);
      const visible = visibleEntryCost(e, input.viewerUserId, input.canCosts);
      const code = e.currency || input.currency;
      if (where === "client") {
        acc.clientSeconds += sec;
        addMoney(acc.clientCost, code, visible);
      } else if (where === "internal") {
        acc.internalSeconds += sec;
        addMoney(acc.internalCost, code, visible);
      } else {
        acc.unallocatedSeconds += sec;
        addMoney(acc.unallocatedCost, code, visible);
      }
    }
    return acc;
  };

  const withTime = new Set(inRange.map((e) => e.userId));
  const rows: SalaryRow[] = employed
    .filter((p) => p.active || withTime.has(p.userId))
    .map((p) => {
      const acc = bucket(p.userId);
      const days = input.monthWorkingDays(p.workCountry, y, m);
      const basis = input.settings.hoursBasis === "fixed"
        ? { hours: input.settings.fixedHoursPerMonth }
        : { hours: days * input.settings.hoursPerDay };
      const rate = computeCostRate(
        { kind: p.kind, salaryType: p.salaryType, salaryAmount: p.salaryAmount },
        days,
        input.settings,
      );
      const basisSeconds = basis.hours * 3600;
      return {
        userId: p.userId,
        name: p.name,
        employeeId: p.employeeId as string,
        loadedSalary: p.salaryAmount != null && Number.isFinite(Number(p.salaryAmount)) ? Number(p.salaryAmount) : null,
        currency: input.currency,
        rate,
        trackedSeconds: acc.seconds,
        clientSeconds: acc.clientSeconds,
        internalSeconds: acc.internalSeconds,
        unallocatedSeconds: acc.unallocatedSeconds,
        clientCost: acc.clientCost,
        internalCost: acc.internalCost,
        unallocatedCost: acc.unallocatedCost,
        utilisation: basisSeconds > 0 ? acc.seconds / basisSeconds : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const withoutIds = [...withTime].filter((id) => !employedIds.has(id));
  const withoutSalary = withoutIds.map((userId) => {
    const acc = bucket(userId);
    const person = input.people.find((p) => p.userId === userId);
    return {
      userId,
      name: person?.name || userId,
      seconds: acc.seconds,
      cost: sumMoney([acc.clientCost, acc.internalCost, acc.unallocatedCost]),
    };
  });

  const salaryBag: MoneyByCurrency = {};
  for (const row of rows) if (row.loadedSalary != null) addMoney(salaryBag, row.currency, row.loadedSalary);

  return {
    rows,
    totals: {
      loadedSalary: salaryBag,
      trackedSeconds: rows.reduce((s, r) => s + r.trackedSeconds, 0),
      clientCost: sumMoney(rows.map((r) => r.clientCost)),
      internalCost: sumMoney(rows.map((r) => r.internalCost)),
      unallocatedCost: sumMoney(rows.map((r) => r.unallocatedCost)),
    },
    withoutSalary,
  };
};

export const salaryCsv = (
  report: SalaryReport,
  headers: { person: string; salary: string; rate: string; hours: string; client: string; internal: string; unallocated: string; utilisation: string; total: string; without: string },
): string => {
  const codes = [
    ...new Set(
      report.rows.flatMap((r) => [...Object.keys(r.clientCost), ...Object.keys(r.internalCost), ...Object.keys(r.unallocatedCost)]),
    ),
  ].sort();
  const costHead = (name: string) => codes.map((c) => `${name} ${c}`);
  const lines = [
    [headers.person, headers.salary, headers.rate, headers.hours, ...costHead(headers.client), ...costHead(headers.internal), ...costHead(headers.unallocated), headers.utilisation]
      .map(csvCell)
      .join(","),
  ];
  for (const row of report.rows) {
    lines.push(
      [
        row.name,
        row.loadedSalary == null ? "" : row.loadedSalary.toFixed(2),
        row.rate.rate == null ? "" : row.rate.rate.toFixed(2),
        hoursOf(row.trackedSeconds).toFixed(2),
        ...costCells(row.clientCost, codes),
        ...costCells(row.internalCost, codes),
        ...costCells(row.unallocatedCost, codes),
        row.utilisation == null ? "" : `${Math.round(row.utilisation * 100)}%`,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  lines.push(
    [
      headers.total,
      Object.entries(report.totals.loadedSalary)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, n]) => n.toFixed(2))
        .join(" | "),
      "",
      hoursOf(report.totals.trackedSeconds).toFixed(2),
      ...costCells(report.totals.clientCost, codes),
      ...costCells(report.totals.internalCost, codes),
      ...costCells(report.totals.unallocatedCost, codes),
      "",
    ]
      .map(csvCell)
      .join(","),
  );
  if (report.withoutSalary.length) {
    lines.push("");
    lines.push(csvCell(headers.without));
    for (const row of report.withoutSalary) {
      lines.push([row.name, hoursOf(row.seconds).toFixed(2), ...costCells(row.cost, codes)].map(csvCell).join(","));
    }
  }
  return `\uFEFF${lines.join("\n")}`;
};
