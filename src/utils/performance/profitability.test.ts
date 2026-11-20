import test from "node:test";
import assert from "node:assert/strict";
import type { FinancialRecord, InvoiceOffer, Project } from "../../types/index.ts";
import { DEFAULT_INVOICE_STATUS_DEFS } from "../offerStatuses.ts";
import type { TimeEntry } from "../timeTracking.ts";
import {
  computeProfitability,
  isLabourCostHidden,
  projectExpenseCosts,
  projectHasRecentExpense,
  projectInvoicedAmount,
  projectsWithRecentLabour,
} from "./profitability.ts";

const project = (id: string, over: Partial<Project> = {}): Project =>
  ({ id, name: `P ${id}`, status: "active", archived: false, ...over }) as unknown as Project;
const base = { isActive: (p: Project) => p.status === "active", clientNameOf: (p: Project) => `Client ${p.id}` };

test("rows: active first, then inactive with recent costs; each block by invoiced, highest first", () => {
  const data = computeProfitability({
    ...base,
    projects: [
      project("small", {}),
      project("big", {}),
      project("old-recent", { status: "done" }),
      project("old-quiet", { status: "done" }),
      project("archived", { archived: true }),
      project("old-big", { status: "done" }),
    ],
    invoicedByProject: { small: 1000, big: 5000, "old-recent": 300, "old-big": 9000, archived: 7000 },
    costsByProject: { small: 400, big: 6000, "old-recent": 100, "old-big": 50 },
    recentCostProjectIds: new Set(["old-recent", "old-big", "archived"]),
  });
  assert.deepEqual(data.rows.map((r) => [r.projectId, r.inactive]), [
    ["big", false],
    ["small", false],
    ["old-big", true],
    ["old-recent", true],
  ]);
  assert.deepEqual(data.rows[0], {
    projectId: "big",
    name: "P big",
    clientName: "Client big",
    inactive: false,
    invoiced: 5000,
    costs: 6000,
    profit: -1000,
    costRatioPct: 120,
  });
});

test("totals row", () => {
  const data = computeProfitability({
    ...base,
    projects: [project("a"), project("b")],
    invoicedByProject: new Map([["a", 1000], ["b", 3000]]),
    costsByProject: new Map([["a", 500]]),
    recentCostProjectIds: [],
  });
  assert.deepEqual(data.total, { projects: 2, invoiced: 4000, costs: 500, profit: 3500, costRatioPct: 12.5 });
});

test("zero denominators: nothing invoiced means no ratio, an empty list means an empty total", () => {
  const data = computeProfitability({
    ...base,
    projects: [project("a")],
    invoicedByProject: {},
    costsByProject: { a: 200 },
    recentCostProjectIds: [],
  });
  assert.equal(data.rows[0].costRatioPct, null);
  assert.equal(data.rows[0].profit, -200);
  assert.equal(data.total.costRatioPct, null);

  const empty = computeProfitability({ ...base, projects: [], invoicedByProject: {}, costsByProject: {}, recentCostProjectIds: [] });
  assert.deepEqual(empty, { rows: [], total: { projects: 0, invoiced: 0, costs: 0, profit: 0, costRatioPct: null } });
});

/* ------------------------------------------------------------------ builders */

const expense = (id: string, over: Partial<FinancialRecord>): FinancialRecord =>
  ({
    id,
    type: "expense",
    title: id,
    projectId: "p1",
    amountPlanned: 0,
    amountReal: 0,
    status: "pending",
    issueDate: "2026-11-01",
    isRecurring: false,
    ...over,
  }) as FinancialRecord;

const costs = [
  expense("paid", { status: "paid", amountPlanned: 100, amountReal: 120, paidDate: "2026-11-02" }),
  expense("partly", { status: "partially_paid", amountPlanned: 300, amountReal: 100 }),
  expense("planned", { status: "planned", amountPlanned: 50 }),
  expense("cancelled", { status: "cancelled", amountPlanned: 999 }),
  expense("other-project", { projectId: "p2", status: "paid", amountReal: 7000 }),
  expense("income-row", { type: "income", status: "paid", amountReal: 8000 }),
];

test("projectExpenseCosts: real is what moved, all adds the unpaid remainder; cancelled and other projects never", () => {
  assert.equal(projectExpenseCosts(costs, "p1", "real"), 120 + 100);
  assert.equal(projectExpenseCosts(costs, "p1", "all"), 120 + 300 + 50);
  assert.equal(projectExpenseCosts([], "p1", "real"), 0);
  assert.equal(projectExpenseCosts(costs, "nobody", "all"), 0);
});

test("projectHasRecentExpense: paid date, else issue date, within the last 30 days, today included", () => {
  const today = new Date(2026, 10, 20);
  const at = (over: Partial<FinancialRecord>) => projectHasRecentExpense([expense("x", over)], "p1", today);
  assert.equal(at({ issueDate: "2026-11-20" }), true); // today
  assert.equal(at({ issueDate: "2026-10-21" }), true); // 30 days ago
  assert.equal(at({ issueDate: "2026-10-20" }), false); // 31 days ago
  assert.equal(at({ issueDate: "2026-11-21" }), false); // tomorrow
  assert.equal(at({ issueDate: "2026-01-01", paidDate: "2026-11-10" }), true); // paid date wins
  assert.equal(at({ issueDate: "2026-11-10", status: "cancelled" }), false);
  assert.equal(at({ issueDate: "2026-11-10", isRecurring: true }), false);
  assert.equal(projectHasRecentExpense([], "p1", today), false);
});

test("projectsWithRecentLabour: worked time in the last 30 days, today included; running and empty entries do not count", () => {
  const today = new Date(2026, 10, 20);
  const labour = (projectId: string | null, entryDate: string, over: Partial<TimeEntry> = {}): TimeEntry =>
    ({ id: `${projectId}-${entryDate}`, userId: "u1", projectId, entryDate, durationSec: 3600, workedMs: 3_600_000, running: false, ...over }) as unknown as TimeEntry;
  const ids = (entries: TimeEntry[]) => [...projectsWithRecentLabour(entries, today)].sort();
  assert.deepEqual(ids([labour("today", "2026-11-20"), labour("edge", "2026-10-21")]), ["edge", "today"]);
  assert.deepEqual(ids([labour("old", "2026-10-20"), labour("future", "2026-11-21")]), []); // 31 days ago; tomorrow
  assert.deepEqual(ids([labour("running", "2026-11-20", { running: true, workedMs: null })]), []);
  assert.deepEqual(ids([labour("zero", "2026-11-20", { workedMs: 0 })]), []);
  assert.deepEqual(ids([labour(null, "2026-11-20")]), []); // no project
  assert.deepEqual(ids([]), []);
});

test("an inactive project with only recent labour is listed", () => {
  const today = new Date(2026, 10, 20);
  const entries = [{ id: "t1", userId: "u", projectId: "old", entryDate: "2026-11-15", durationSec: 60, workedMs: 60_000, running: false }] as unknown as TimeEntry[];
  const data = computeProfitability({
    ...base,
    projects: [project("old", { status: "done" }), project("quiet", { status: "done" })],
    invoicedByProject: {},
    costsByProject: { old: 120 },
    recentCostProjectIds: projectsWithRecentLabour(entries, today),
  });
  assert.deepEqual(data.rows.map((r) => [r.projectId, r.inactive, r.costs]), [["old", true, 120]]);
});

test("projectInvoicedAmount: the ledger when it has records, else the lead's live invoices", () => {
  const p = project("p1", { leadId: "lead-1", value: 10_000 } as Partial<Project>);
  const income = (id: string, over: Partial<FinancialRecord>): FinancialRecord =>
    ({ id, type: "income", projectId: "p1", status: "paid", amountPlanned: 0, amountReal: 0, issueDate: "2026-11-01", isRecurring: false, ...over }) as FinancialRecord;
  const ledger = [
    income("i1", { amountPlanned: 4000, amountReal: 4000 }),
    income("i2", { status: "pending", amountPlanned: 1500 }),
    income("i3", { status: "cancelled", amountPlanned: 900 }),
  ];
  const invoices = [
    { id: "x1", leadId: "lead-1", type: "invoice", status: "sent", totalPrice: 700 },
    { id: "x2", leadId: "lead-1", type: "invoice", status: "cancelled", totalPrice: 5000 },
    { id: "x3", leadId: "lead-1", type: "proforma", status: "sent", totalPrice: 5000 },
    { id: "x4", leadId: "other", type: "invoice", status: "sent", totalPrice: 5000 },
  ] as unknown as InvoiceOffer[];
  const common = { project: p, defaultCurrency: "EUR", invoicesOffers: invoices, invoiceStatuses: DEFAULT_INVOICE_STATUS_DEFS };

  assert.equal(projectInvoicedAmount({ ...common, financialRecords: ledger }), 5500);
  assert.equal(projectInvoicedAmount({ ...common, financialRecords: [] }), 700);
  assert.equal(projectInvoicedAmount({ ...common, project: project("p1"), financialRecords: [] }), 0);
});

test("labour cost is hidden when a listed project has tracked time with a withheld cost", () => {
  const totals = {
    a: { seconds: 3600, cost: 50 },
    b: { seconds: 7200, cost: null },
    c: { seconds: 0, cost: null },
  };
  assert.equal(isLabourCostHidden(["a", "b"], totals), true);
  assert.equal(isLabourCostHidden(["a"], totals), false);
  // No tracked time, so nothing to withhold.
  assert.equal(isLabourCostHidden(["c", "unknown"], totals), false);
  // Time tracking is off.
  assert.equal(isLabourCostHidden(["b"], null), false);
});
