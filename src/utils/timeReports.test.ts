import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
  buildSalaryReport,
  clientPdfRows,
  clientReportHtml,
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
