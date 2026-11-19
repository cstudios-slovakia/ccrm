import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
  buildSalaryReport,
  clientPdfRows,
  clientReportHtml,
  reportCsv,
  roundDurationSec,
  type ReportEntry,
} from "./timeReports.ts";
import { DEFAULT_COST_SETTINGS } from "./timeCost.ts";

const rounding = { minutes: 15 as const, mode: "nearest" as const };

test("report rounding snaps each entry, then the total is the sum", () => {
  assert.equal(roundDurationSec(8 * 60, rounding), 15 * 60);
  assert.equal(roundDurationSec(7 * 60, rounding), 0);
  assert.equal(roundDurationSec(7 * 60, { minutes: 15, mode: "up" }), 15 * 60);
  assert.equal(roundDurationSec(7 * 60, { minutes: 0, mode: "up" }), 7 * 60);

  const entries: ReportEntry[] = [
    { id: "a", userId: "u1", projectId: "p", clientId: "c", entryDate: "2026-05-04", title: "Alpha", durationSec: 8 * 60, billable: true, cost: 1, currency: "EUR" },
    { id: "b", userId: "u1", projectId: "p", clientId: "c", entryDate: "2026-05-04", title: "Alpha", durationSec: 8 * 60, billable: true, cost: 1, currency: "EUR" },
    { id: "c", userId: "u1", projectId: "p", clientId: "c", entryDate: "2026-05-05", title: "Beta", durationSec: 7 * 60, billable: false, cost: 99, currency: "EUR" },
  ];
  const report = buildReport({
    entries,
    filters: { from: "2026-05-01", to: "2026-05-31", userId: null, projectId: null, clientId: null, billable: "all", groupBy: "title" },
    rounding,
    viewerUserId: "u1",
    canCosts: true,
    currency: "EUR",
    workingDays: 20,
  });
  const alpha = report.groups.find((g) => g.key === "Alpha");
  const beta = report.groups.find((g) => g.key === "Beta");
  assert.equal(alpha?.seconds, 30 * 60);
  assert.equal(beta?.seconds, 0);
  assert.equal(report.totals.seconds, report.groups.reduce((s, g) => s + g.seconds, 0));
  assert.equal(report.totals.seconds, 30 * 60);
});

test("client PDF is billable only, rounded, and has no cost", () => {
  const report = buildReport({
    entries: [
      { id: "a", userId: "u1", projectId: "p", clientId: null, entryDate: "2026-05-04", title: "Client work", durationSec: 8 * 60, billable: true, cost: 12345.67, currency: "EUR" },
      { id: "b", userId: "u1", projectId: "p", clientId: null, entryDate: "2026-05-04", title: "HIDDEN-INTERNAL", durationSec: 3600, billable: false, cost: 99999, currency: "EUR" },
    ],
    filters: { from: "2026-05-01", to: "2026-05-31", userId: null, projectId: null, clientId: null, billable: "all", groupBy: "title" },
    rounding: { minutes: 15, mode: "nearest" },
    viewerUserId: "u1",
    canCosts: true,
    currency: "EUR",
    workingDays: 20,
  });
  const rows = clientPdfRows(report, { person: () => "Erik", project: () => "Site" });
  assert.deepEqual(rows.map((r) => r.title), ["Client work"]);
  assert.equal(rows[0].hours, "0.25");
  const html = clientReportHtml({
    title: "Time report",
    period: "May 2026",
    rows,
    totalHours: "0.25",
    labels: { date: "Date", person: "Person", project: "Project", title: "Title", hours: "Hours", total: "Total", billableOnly: "Billable only" },
  });
  assert.match(html, /Client work/);
  assert.equal(html.includes("HIDDEN-INTERNAL"), false);
  assert.equal(html.includes("12345.67"), false);
  assert.equal(html.includes("99999"), false);
  assert.equal(html.toLowerCase().includes("cost"), false);
});

test("report cost stays split by currency and hides other people", () => {
  const report = buildReport({
    entries: [
      { id: "a", userId: "u1", projectId: "p", clientId: null, entryDate: "2026-05-04", title: "A", durationSec: 3600, billable: true, cost: 10, currency: "EUR" },
      { id: "b", userId: "u1", projectId: "p", clientId: null, entryDate: "2026-05-04", title: "B", durationSec: 3600, billable: true, cost: 5, currency: "USD" },
      { id: "c", userId: "u2", projectId: "p", clientId: null, entryDate: "2026-05-04", title: "C", durationSec: 3600, billable: true, cost: 80, currency: "EUR" },
    ],
    filters: { from: "2026-05-01", to: "2026-05-31", userId: null, projectId: null, clientId: null, billable: "all", groupBy: "person" },
    rounding: { minutes: 0, mode: "nearest" },
    viewerUserId: "u1",
    canCosts: false,
    currency: "EUR",
    workingDays: 20,
  });
  assert.deepEqual(report.totals.cost, { EUR: 10, USD: 5 });
  assert.equal(report.lines.find((l) => l.userId === "u2")?.seconds, 3600);
});

test("salary split uses Employee.salaryAmount and lists time without an employee", () => {
  const report = buildSalaryReport({
    entries: [
      { userId: "u1", projectId: "client", entryDate: "2026-05-04", durationSec: 7200, cost: 49.16, currency: "EUR" },
      { userId: "u1", projectId: "internal", entryDate: "2026-05-05", durationSec: 3600, cost: 24.58, currency: "EUR" },
      { userId: "u1", projectId: null, entryDate: "2026-05-06", durationSec: 3600, cost: 24.58, currency: "EUR" },
      { userId: "u2", projectId: "client", entryDate: "2026-05-06", durationSec: 1800, cost: 77, currency: "EUR" },
    ],
    people: [
      { userId: "u1", name: "Erik", employeeId: "e1", active: true, kind: "employee", salaryType: "monthly", salaryAmount: 3200, workCountry: "SK" },
      { userId: "u3", name: "Bea", employeeId: "e3", active: true, kind: "employee", salaryType: "monthly", salaryAmount: 1000, workCountry: "SK" },
      { userId: "u2", name: "No record", employeeId: null, active: false, workCountry: "SK" },
    ],
    projects: [
      { id: "client", isInternal: false },
      { id: "internal", isInternal: true },
    ],
    from: "2026-05-01",
    to: "2026-05-31",
    viewerUserId: "u1",
    canCosts: true,
    currency: "EUR",
    settings: DEFAULT_COST_SETTINGS,
    monthWorkingDays: () => 20,
  });
  const erik = report.rows.find((r) => r.userId === "u1");
  assert.ok(erik);
  assert.equal(erik.loadedSalary, 3200);
  assert.equal(erik.clientCost.EUR, 49.16);
  assert.equal(erik.internalCost.EUR, 24.58);
  assert.equal(erik.unallocatedCost.EUR, 24.58);
  assert.equal(erik.trackedSeconds, 14400);
  assert.ok(report.rows.some((r) => r.userId === "u3" && r.trackedSeconds === 0 && r.loadedSalary === 1000));
  assert.equal(report.rows.some((r) => r.userId === "u2"), false);
  assert.equal(report.totals.loadedSalary.EUR, 4200);
  assert.equal(report.withoutSalary.length, 1);
  assert.equal(report.withoutSalary[0].name, "No record");
  assert.equal(report.withoutSalary[0].seconds, 1800);
  assert.equal(erik.rateBasis, "contract");

  const hidden = buildSalaryReport({
    entries: [{ userId: "u2", projectId: "client", entryDate: "2026-05-06", durationSec: 1800, cost: 77, currency: "EUR" }],
    people: [{ userId: "u2", name: "No record", employeeId: null, active: false, workCountry: "SK" }],
    projects: [{ id: "client", isInternal: false }],
    from: "2026-05-01",
    to: "2026-05-31",
    viewerUserId: "u1",
    canCosts: false,
    currency: "EUR",
    settings: DEFAULT_COST_SETTINGS,
    monthWorkingDays: () => 20,
  });
  assert.equal(hidden.withoutSalary[0].seconds, 1800);
  assert.deepEqual(hidden.withoutSalary[0].cost, {});
});

const salaryInput = (salaryAmount: number) => ({
  // May 2026 was priced at €3,200: 3200 / (20 days × 8 h) × 1.352 = €27.04/h, frozen on the entries
  entries: [
    { userId: "u1", projectId: "client", entryDate: "2026-05-04", durationSec: 7200, cost: 54.08, currency: "EUR", costRate: 27.04, costRateSource: "monthly", costRateBasisDays: 20 },
    { userId: "u1", projectId: null, entryDate: "2026-05-05", durationSec: 3600, cost: 27.04, currency: "EUR", costRate: 27.04, costRateSource: "monthly", costRateBasisDays: 20 },
  ],
  people: [{ userId: "u1", name: "Erik", employeeId: "e1", active: true, kind: "employee", salaryType: "monthly", salaryAmount, workCountry: "SK" as const }],
  projects: [{ id: "client", isInternal: false }],
  from: "2026-05-01",
  to: "2026-05-31",
  viewerUserId: "u1",
  canCosts: true,
  currency: "EUR",
  settings: DEFAULT_COST_SETTINGS,
  monthWorkingDays: () => 20,
});

test("a past month keeps the salary its entries were priced at after a raise", () => {
  const report = buildSalaryReport(salaryInput(3500));
  const erik = report.rows[0];
  assert.equal(erik.rateBasis, "snapshot");
  assert.equal(erik.rate.rate, 27.04);
  assert.equal(erik.loadedSalary, 3200);
  assert.equal(report.totals.loadedSalary.EUR, 3200);
  assert.equal(erik.clientCost.EUR, 54.08);
});

test("an unchanged salary is shown as the contract amount, from the snapshot", () => {
  const erik = buildSalaryReport(salaryInput(3200)).rows[0];
  assert.equal(erik.rateBasis, "snapshot");
  assert.equal(erik.loadedSalary, 3200);
  assert.equal(erik.rate.amount, 3200);
});

test("a person without a priced entry falls back to today's contract", () => {
  const input = salaryInput(3500);
  const erik = buildSalaryReport({ ...input, entries: input.entries.map((e) => ({ ...e, costRate: null })) }).rows[0];
  assert.equal(erik.rateBasis, "contract");
  assert.equal(erik.loadedSalary, 3500);
});

test("salary bucket and utilisation use worked time for overlapping entries", () => {
  const e = (id: string) => ({ id, userId: "u1", projectId: "client", entryDate: "2026-05-04", startAt: "2026-05-04T08:00:00Z", durationSec: 3600, workedMs: 1800000, cost: 10, currency: "EUR" });
  const report = buildSalaryReport({
    entries: [e("a"), e("b")],
    people: [{ userId: "u1", name: "Erik", employeeId: "e1", active: true, kind: "employee", salaryType: "monthly", salaryAmount: 3200, workCountry: "SK" }],
    projects: [{ id: "client", isInternal: false }],
    from: "2026-05-01",
    to: "2026-05-31",
    viewerUserId: "u1",
    canCosts: true,
    currency: "EUR",
    settings: DEFAULT_COST_SETTINGS,
    monthWorkingDays: () => 20,
  });
  const row = report.rows[0];
  assert.equal(row.trackedSeconds, 3600);
  assert.equal(row.clientSeconds, 3600);
  assert.equal(row.deliveredSeconds, 7200);
  assert.equal(row.utilisation, 3600 / (20 * DEFAULT_COST_SETTINGS.hoursPerDay * 3600));
});

test("report by project stays in project time", () => {
  const report = buildReport({
    entries: [
      { id: "a", userId: "u1", projectId: "p", clientId: null, entryDate: "2026-05-04", title: "A", durationSec: 3600, billable: true },
      { id: "b", userId: "u1", projectId: "q", clientId: null, entryDate: "2026-05-04", title: "B", durationSec: 3600, billable: true },
    ],
    filters: { from: "2026-05-01", to: "2026-05-31", userId: null, projectId: null, clientId: null, billable: "all", groupBy: "project" },
    rounding: { minutes: 0, mode: "nearest" },
    viewerUserId: "u1",
    canCosts: false,
    currency: "EUR",
    workingDays: 20,
  });
  assert.deepEqual(report.groups.map((g) => g.seconds), [3600, 3600]);
});

test("two overlapping 1 h entries: worked 1 h, delivered 2 h, leverage 2; parallel-only keeps them", () => {
  const mk = (id: string, workedSec: number, title: string): ReportEntry => ({
    id, userId: "u1", projectId: "p", clientId: null, entryDate: "2026-05-04", title, durationSec: 3600, workedSec, billable: true, cost: 1, currency: "EUR",
  });
  const entries = [mk("a", 1800, "A"), mk("b", 1800, "B"), { ...mk("c", 3600, "C"), entryDate: "2026-05-05" }];
  const filters = { from: "2026-05-01", to: "2026-05-31", userId: null, projectId: null, clientId: null, billable: "all" as const, groupBy: "person" as const };
  const run = (parallelOnly: boolean) =>
    buildReport({ entries, filters: { ...filters, parallelOnly }, rounding: { minutes: 0, mode: "nearest" }, viewerUserId: "u1", canCosts: true, currency: "EUR", workingDays: 20 });
  const all = run(false);
  assert.equal(all.totals.seconds, 3 * 3600);
  assert.equal(all.totals.workedSeconds, 2 * 3600);
  assert.equal(all.showsWorked, true);
  const par = run(true);
  assert.deepEqual(par.lines.map((l) => l.id), ["a", "b"]);
  assert.equal(par.totals.seconds, 7200);
  assert.equal(par.totals.workedSeconds, 3600);
  assert.equal(par.leverage, 2);
  assert.equal(par.groups[0].workedSeconds, 3600);
  const plain = buildReport({ entries: [mk("c", 3600, "C")], filters, rounding: { minutes: 0, mode: "nearest" }, viewerUserId: "u1", canCosts: true, currency: "EUR", workingDays: 20 });
  assert.equal(plain.showsWorked, false);
});

test("CSV carries worked hours next to hours and leverage in summary; the client PDF stays project time", () => {
  const report = buildReport({
    entries: [
      { id: "a", userId: "u1", projectId: "p", clientId: null, entryDate: "2026-05-04", title: "A", durationSec: 3600, workedSec: 1800, billable: true, cost: 1, currency: "EUR" },
      { id: "b", userId: "u1", projectId: "p", clientId: null, entryDate: "2026-05-04", title: "B", durationSec: 3600, workedSec: 1800, billable: true, cost: 1, currency: "EUR" },
    ],
    filters: { from: "2026-05-01", to: "2026-05-31", userId: null, projectId: null, clientId: null, billable: "all", groupBy: "person" },
    rounding: { minutes: 0, mode: "nearest" },
    viewerUserId: "u1",
    canCosts: true,
    currency: "EUR",
    workingDays: 20,
  });
  const headers = { group: "Group", date: "Date", person: "Person", project: "Project", title: "Title", hours: "Hours", billable: "Billable", cost: "Cost", total: "Total", workedHours: "Worked hours", leverage: "Leverage" };
  const label = { group: (k: string) => k, person: (u: string) => u, project: (p: string | null) => p ?? "" };
  const summary = reportCsv(report, "summary", headers, label).split("\n");
  assert.equal(summary[0], "\uFEFFGroup,Hours,Worked hours,Leverage,Billable,Cost EUR");
  assert.equal(summary[1], "u1,2.00,1.00,2.00,2.00,2.00");
  const detailed = reportCsv(report, "detailed", headers, label).split("\n");
  assert.equal(detailed[0], "\uFEFFDate,Person,Project,Title,Hours,Worked hours,Billable,Cost EUR");
  assert.equal(detailed[1], "2026-05-04,u1,p,A,1.00,0.50,1,1.00");
  assert.deepEqual(clientPdfRows(report, { person: () => "x", project: () => "y" }).map((r) => r.hours), ["1.00", "1.00"]);
});
