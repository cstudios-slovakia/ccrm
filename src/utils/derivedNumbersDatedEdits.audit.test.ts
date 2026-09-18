/**
 * Pinning tests for the derived-numbers / history-rewriting-edits audit
 * (`docs/audits/derived-numbers-dated-edits-audit-2026-09-18.md`).
 *
 * ⚠️ EVERY ACTIVE TEST HERE IS EXPECTED TO FAIL until its finding is fixed.
 * Each one encodes the behaviour the audit says is correct, with the numbers
 * observed at audit time in the comment above it. Do not weaken an assertion
 * to make the suite pass: a green run here has to mean the two rules agree,
 * or it means nothing.
 *
 * Where the bug lives in a pure exported helper the test calls that helper.
 * Where it lives inside a component, the test carries a VERBATIM COPY of the
 * component's rule (marked `// mirror of <file>:<line>`), exactly as the
 * finance audit of 2026-09-17 did — the copy must be replaced by an import
 * once the rule is lifted into `src/utils/`. Findings that can only be
 * pinned by a browser check are listed with `skip` and the spec they need.
 *
 * Run: node --test --experimental-strip-types src/utils/derivedNumbersDatedEdits.audit.test.ts
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { FinancialRecord, InvoiceOffer, Lead, Task, WarehouseMovement } from "../types";
import {
  recurringAmountHistoryAfterChange,
  recurringPlannedAmountAt,
  recurringTotalInRange,
  type RecurringRule
} from "./recurringExpenses.ts";
import { reconcileInvoiceMovements } from "./invoiceFinanceBridge.ts";
import { derivePaidDate } from "./financialRecordMerge.ts";
import { todayLocal } from "./localTime.ts";
import { evaluateLeadSla } from "./leadSla.ts";

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  isRecurring: true,
  amountPlanned: 2000,
  amountReal: 2000,
  recurringFrequency: "monthly",
  recurringConfig: { monthlyType: "day_of_month", dayOfMonth: 1 },
  recurringStartDate: "2026-01-01",
  recurringEndDate: null,
  recurringAmountHistory: null,
  ...over
});

/** Runs `fn` with the process clock frozen at `nowUtc` in timezone `tz`. */
function withClock<T>(tz: string, nowUtc: number, fn: () => T): T {
  const prevTz = process.env.TZ;
  process.env.TZ = tz;
  mock.timers.enable({ apis: ["Date"], now: nowUtc });
  try {
    return fn();
  } finally {
    mock.timers.reset();
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  }
}

// ==========================================================================
// F1 — the inline "mark paid" editor dates a recurring re-price from today,
// the edit form dates it from the next charge. FinancialManagementView.tsx:2952
// vs :2783. Observed: rent 2 000/month on the 1st, user marks it paid at 2 200
// on 18 Sep → history pins 2 000 until 17 Sep, so the 1 Sep charge stays 2 000
// in the table, the trend, the forecast and the rule's own row; 2 200 appears
// only from 1 Oct. The figure the user just typed is shown nowhere.
// ==========================================================================

test("F1: settling a recurring charge at a new amount re-prices the charge that was settled, not the next one", () => {
  const today = "2026-09-18";
  // mirror of FinancialManagementView.tsx:2952 — `recurringAmountHistoryAfterChange(record, {...}, todayLocal())`
  const inlineAppliesFrom = (_rule: RecurringRule, todayIso: string) => todayIso;

  const before = rule();
  const settled = { amountPlanned: 2000, amountReal: 2200 };
  const after = rule({
    amountReal: 2200,
    recurringAmountHistory: recurringAmountHistoryAfterChange(before, settled, inlineAppliesFrom(before, today))
  });

  // Observed at audit time: 2000 (Sep) / 2200 (Oct).
  assert.equal(
    recurringPlannedAmountAt(after, "2026-09-01"),
    2200,
    "the September charge was just settled at 2 200 — it must be priced at 2 200"
  );
  assert.equal(recurringPlannedAmountAt(after, "2026-08-01"), 2000, "August keeps the old price");
});

// ==========================================================================
// F2 — the Recurring tab prices a weekly rule two ways on one screen: the
// KPI cards call recurringTotalInRange (calendar), the row prints
// amount × 52/12 (FinancialManagementView.tsx:6274-6275, getMonthlyEquivalent
// :1608-1611). Observed in the UI: cards "−82 100 €/rok" (5 300 € of it is the
// 100 €/Friday rule = 53 Fridays), the same rule's row "≈ −433,333 € / mesiac"
// (5 200 €/yr). The row also reads amountReal-first and ignores the history.
// ==========================================================================

test("F2: a weekly rule's row-level monthly figure agrees with the KPI card for the same month", () => {
  // mirror of FinancialManagementView.tsx:1608-1611 and :6274-6275
  const getMonthlyEquivalent = (amount: number, freq?: string | null) =>
    !freq || freq === "monthly" ? amount : freq === "weekly" ? amount * (52 / 12) : amount / 12;
  const rowAmount = (r: RecurringRule) => (r.amountReal > 0 ? r.amountReal : r.amountPlanned);

  const weekly = rule({ amountPlanned: 100, amountReal: 0, recurringFrequency: "weekly", recurringConfig: { dayOfWeek: 5 }, recurringStartDate: "2026-01-02" });
  const rowMonthly = getMonthlyEquivalent(rowAmount(weekly), weekly.recurringFrequency);
  const cardMay = recurringTotalInRange(weekly, "2026-05-01", "2026-05-31"); // five Fridays
  const cardFeb = recurringTotalInRange(weekly, "2026-02-01", "2026-02-28"); // four Fridays

  // Observed: row 433.33…, card 500 (May) and 400 (Feb). The row is right for no month.
  assert.equal(rowMonthly, cardMay, "May: the row must show what the card counts for May");
  assert.equal(rowMonthly, cardFeb, "February: the row must show what the card counts for February");
});

// ==========================================================================
// F3 — the weighted average purchase price is computed by two formulas, and
// both weight the incoming lot against ONE warehouse's stock although
// `avgPurchasePrice` is an item-wide field. WarehouseView.tsx:953-961 (quick
// purchase, 2 dp) and :1464-1474 (receipt, 4 dp); the valuation KPI (:507)
// multiplies that WAP by the stock of every warehouse.
// ==========================================================================

test("F3: the weighted average purchase price is weighted against the item's whole stock, by one formula", () => {
  // mirror of WarehouseView.tsx:953-961
  const quickPurchaseWap = (existingQtyInWarehouse: number, oldAvg: number, qty: number, price: number) => {
    const newTotalQty = existingQtyInWarehouse + qty;
    const newWapPrice = newTotalQty > 0 ? (existingQtyInWarehouse * oldAvg + qty * price) / newTotalQty : price;
    return Number(newWapPrice.toFixed(2));
  };
  // mirror of WarehouseView.tsx:1464-1474
  const receiptWap = (onHandInWarehouse: number, oldAvg: number, newQty: number, newPrice: number) => {
    const combinedQty = onHandInWarehouse + newQty;
    const newWap = combinedQty > 0 ? (onHandInWarehouse * oldAvg + newQty * newPrice) / combinedQty : newPrice;
    return Number(newWap.toFixed(4));
  };

  // 100 pcs @ 10 in the main warehouse, 50 pcs @ 10 in the east one; 100 pcs @ 16 arrive in the east one.
  const itemWide = (150 * 10 + 100 * 16) / 250; // 12.40
  const viaQuick = quickPurchaseWap(50, 10, 100, 16); // observed 14.00
  const viaReceipt = receiptWap(50, 10, 100, 16); // observed 14.00
  assert.equal(viaQuick, itemWide, "quick purchase must weight against all 150 pcs, not the 50 in that warehouse");
  assert.equal(viaReceipt, itemWide, "receipt must weight against all 150 pcs, not the 50 in that warehouse");

  // Even for one warehouse the two paths disagree at the fourth decimal.
  assert.equal(quickPurchaseWap(3, 10, 1, 10.005), receiptWap(3, 10, 1, 10.005), "two receipts of the same lot must give one WAP");
});

// ==========================================================================
// F4 — three definitions of "won" and "open" for one lead register.
// Dashboard widget "Pipeline value": `SELECT SUM(value) FROM leads`
// (api/dashboard_query.php:246) — every lead, closed or archived.
// Overview "Active pipeline": open stage groups (Dashboard.tsx:373-379).
// Overview "Total revenue": status literally "accepted" (Dashboard.tsx:346-348, :383).
// Observed in the UI with the QA seed: revenue 2 500 € ("closed deals only")
// AND active pipeline 26 900 € ("4 open deals") both include the accepted lead.
// ==========================================================================

test("F4: the dashboard widget, the overview pipeline and the overview revenue count a won lead the same way", () => {
  const leads = [
    { status: "new", value: 5200 },
    { status: "contacted", value: 800 },
    { status: "offer sent", value: 18400 },
    { status: "accepted", value: 2500 },
    { status: "won", value: 7000, archived: true }
  ] as Lead[];
  const leadStageGroups: Record<string, string> = { accepted: "closed", won: "closed", rejected: "closed" };
  const leadStateParents: Record<string, string> = {};

  // mirror of api/dashboard_query.php:246
  const widgetPipeline = leads.reduce((s, l) => s + l.value, 0);
  // mirror of Dashboard.tsx:373-384
  const overviewPipeline = leads
    .filter((l) => {
      const statusLower = l.status.toLowerCase();
      const parentStatus = leadStateParents[statusLower];
      const targetStatus = parentStatus ? parentStatus.toLowerCase() : statusLower;
      return (leadStageGroups[targetStatus] || "in_progress") !== "closed";
    })
    .reduce((s, l) => s + l.value, 0);
  // mirror of Dashboard.tsx:346-348 / :383
  const overviewRevenue = leads
    .filter((l) => l.status.toLowerCase() === "accepted" || leadStateParents[l.status.toLowerCase()] === "accepted")
    .reduce((s, l) => s + l.value, 0);

  // Observed: widget 33 900, overview pipeline 24 400, revenue 2 500 (the "won" lead is in no total but the widget's).
  assert.equal(widgetPipeline, overviewPipeline, "the widget must not count closed or archived leads as pipeline");
  assert.equal(overviewRevenue, 9500, "revenue must follow the closed stage group, not a state literally named 'accepted'");
});

// ==========================================================================
// F5 — "overdue" for a task is time-aware on the Tasks board
// (TaskDashboardView.tsx:1350-1368: today + deadlineTime) and date-only on the
// dashboard task widget (presetWidgets.tsx:478: `deadline < today`).
// ==========================================================================

test("F5: a task due today at 09:00 is overdue at 15:00 on every screen", () => {
  const task = { title: "Call", status: "open", deadline: "2026-09-18", deadlineTime: "09:00" } as Task;
  const today = "2026-09-18";
  const nowTime = "15:00";

  // mirror of TaskDashboardView.tsx:1356-1368
  const boardOverdue = task.deadline < today || (task.deadline === today && nowTime > (task.deadlineTime || "23:59"));
  // mirror of presetWidgets.tsx:478
  const widgetOverdue = !!task.deadline && String(task.deadline).slice(0, 10) < today;

  assert.equal(boardOverdue, true, "sanity: the board says overdue");
  assert.equal(widgetOverdue, boardOverdue, "the dashboard widget must agree with the board");
});

// ==========================================================================
// F6 — the Invoicing KPI "total invoiced" adds every document of type invoice
// AND every price offer whose status is "invoiced" (InvoicingView.tsx:335-337).
// Nothing links an offer to the invoice raised from it, so the usual flow —
// mark the offer invoiced, issue the invoice — counts the job twice.
// ==========================================================================

test("F6: an offer marked invoiced and the invoice raised from it are one job in the invoiced total", () => {
  const docs = [
    { id: "cp", type: "price_offer", status: "invoiced", totalPrice: 1200 },
    { id: "fa", type: "invoice", status: "sent", totalPrice: 1200 }
  ] as InvoiceOffer[];
  // mirror of InvoicingView.tsx:335-337
  const totalInvoicedVal = docs.filter((o) => o.type === "invoice" || o.status === "invoiced").reduce((s, o) => s + o.totalPrice, 0);
  // Observed: 2 400.
  assert.equal(totalInvoicedVal, 1200);
});

// ==========================================================================
// F7 — editing an invoice after its linked movement was paid rewrites the
// settled movement: `invoiceOwnedFields` (invoiceFinanceBridge.ts) overwrites
// amountPlanned, issueDate and dueDate regardless of settlement, and the
// status stays "paid" with the old amountReal underneath the new plan.
// ==========================================================================

test("F7: editing an invoice does not silently re-price or re-date a movement that is already paid", () => {
  const inv = (o: Partial<InvoiceOffer> = {}): InvoiceOffer =>
    ({
      id: "I1", documentNumber: "FA-2026-001", type: "invoice", mode: "default", leadId: "L1", clientName: "Acme",
      title: "Invoice", subject: "Roof", uspCards: [], items: [], subtotal: 1000, vatAmount: 200, totalPrice: 1200,
      currency: "EUR", status: "sent", issuedAt: "2026-08-01", dueDate: "2026-08-15", ...o
    }) as InvoiceOffer;

  const [created] = reconcileInvoiceMovements([], [inv()], [], "2026-08-01T00:00:00Z");
  const paid: FinancialRecord = { ...created, status: "paid", amountReal: 1200, paidDate: "2026-08-10" };
  const edited = inv({ totalPrice: 1500, subtotal: 1250, vatAmount: 250, issuedAt: "2026-09-01", dueDate: "2026-09-15" });
  const [after] = reconcileInvoiceMovements([inv()], [edited], [paid], "2026-09-18T00:00:00Z");

  // Observed: { status: "paid", amountPlanned: 1500, amountReal: 1200, issueDate: "2026-09-01", paidDate: "2026-08-10" }
  // — "paid" with 300 outstanding that no tab can show, and 1 200 € of August
  // income moved into September in the overview table.
  assert.equal(after.issueDate, "2026-08-01", "settled money keeps the period it was booked in");
  assert.ok(
    after.status !== "paid" || after.amountReal >= after.amountPlanned,
    `a movement cannot be "paid" and short at the same time (planned ${after.amountPlanned}, real ${after.amountReal})`
  );
});

// ==========================================================================
// F8 — the warehouse item form lets `avgPurchasePrice` be typed directly
// (WarehouseView.tsx:1144), re-valuing every unit on hand with no date and no
// trace; on create it also copies that figure into lastPurchasePrice (:1170).
// ==========================================================================

test("F8: typing a new WAP on the item form does not silently re-value stock already on hand", { skip: "component-level — needs a Playwright spec: edit an item's WAP, expect the valuation KPI unchanged or a dated revaluation movement" }, () => {});

// ==========================================================================
// F9 — pause / resume of a recurring rule overwrites its planned end date and
// the two "is it paused" rules are off by one day.
// handleToggleRecurringActive (FinancialManagementView.tsx:1592-1606) writes
// recurringEndDate = today and resume writes null; isRecurringPaused (:1244)
// says paused only when endDate < today.
// ==========================================================================

test("F9: pausing and resuming a rule that has a planned end date gives that end date back", () => {
  const today = "2026-09-18";
  // mirror of FinancialManagementView.tsx:1592-1606
  const toggle = (r: Pick<FinancialRecord, "recurringEndDate">) => {
    const isActive = !r.recurringEndDate || r.recurringEndDate >= today;
    return { ...r, recurringEndDate: isActive ? today : null };
  };
  // mirror of FinancialManagementView.tsx:1244-1245
  const isRecurringPaused = (r: Pick<FinancialRecord, "recurringEndDate">) => !!r.recurringEndDate && r.recurringEndDate < today;

  const lease = { recurringEndDate: "2026-12-31" };
  const paused = toggle(lease);
  // Observed: paused.recurringEndDate === today, and isRecurringPaused(paused) === false on the day of the click.
  assert.equal(isRecurringPaused(paused), true, "a rule paused today reads as paused today");
  const resumed = toggle(paused);
  assert.equal(resumed.recurringEndDate, "2026-12-31", "resume must restore the planned end, not make the rule endless");
});

// ==========================================================================
// F10 — renaming a lead state migrates colours, stage groups, parents and the
// leads themselves (SettingsView.tsx:705-720) but not the SLA limits keyed by
// state name (:4980-4990), the follow-up flags (:5008) or each lead's
// follow-up ticks (LeadsDatagrid.tsx:5412). After the rename the SLA badge
// disappears for the whole phase and every completed follow-up is unticked.
// ==========================================================================

test("F10: renaming a lead state keeps its SLA limit", () => {
  // mirror of SettingsView.tsx:705-720 — what the cascade touches today
  const migrateMapKey = <T,>(m: Record<string, T>, from: string, to: string) => {
    if (!(from in m)) return m;
    const { [from]: v, ...rest } = m;
    return { ...rest, [to]: v };
  };
  const renameState = (s: { leadStates: string[]; leadStateColors: Record<string, string>; leadStageGroups: Record<string, string>; leadStateParents: Record<string, string>; leadStateSla: Record<string, number>; leads: Lead[] }, oldName: string, next: string) => ({
    ...s,
    leadStates: s.leadStates.map((x) => (x === oldName ? next : x)),
    leadStateColors: migrateMapKey(s.leadStateColors, oldName, next),
    leadStageGroups: migrateMapKey(s.leadStageGroups, oldName, next),
    leadStateParents: migrateMapKey(s.leadStateParents, oldName, next),
    leads: s.leads.map((l) => (l.status === oldName ? { ...l, status: next } : l))
    // leadStateSla: not migrated (SettingsView.tsx has no setLeadStateSla in handleRenameState)
  });

  const lead = { id: "L1", status: "offer sent", createdAt: "2026-09-01", timeline: [] } as unknown as Lead;
  const before = { leadStates: ["new", "offer sent"], leadStateColors: {}, leadStageGroups: {}, leadStateParents: {}, leadStateSla: { "offer sent": 5 }, leads: [lead] };
  assert.equal(evaluateLeadSla(lead, before.leadStateSla, {}, {}, "2026-09-18")?.isBreached, true, "sanity: 17 days in a 5-day phase");

  const after = renameState(before, "offer sent", "quote sent");
  const sla = evaluateLeadSla(after.leads[0], after.leadStateSla, after.leadStageGroups, after.leadStateParents, "2026-09-18");
  // Observed: null — the limit is orphaned under the old key and the breach vanishes.
  assert.equal(sla?.isBreached, true, "the SLA limit must follow the renamed state");
});

// ==========================================================================
// F11 / F12 — Invoicing has no issue-date, due-date or valid-until input
// (`grep -c 'type="date"' InvoicingView.tsx` → 0): issuedAt is always today
// (:173, :424), dueDate today + settings days (:726), validUntil today + 30
// (:725), and a status change stamps no date (:895-898). The PDF prints all
// three dates (DefaultOfferTemplate.tsx:154-177) and the finance bridge files
// the movement by them.
// ==========================================================================

test("F11: an invoice can be issued for a date other than today", { skip: "component-level — needs a Playwright spec: open the 5-step wizard, expect an issue-date / due-date / valid-until field on some step" }, () => {});
test("F12: sent / approved / invoiced / cancelled carry the date they happened", { skip: "component-level — needs a Playwright spec: change a document's status, expect a dated timeline entry or field" }, () => {});

// ==========================================================================
// F13 — the warehouse KPIs "Monthly issues (sales)" / "Receipts" sum every
// confirmed movement ever recorded (WarehouseView.tsx:518-527), no date
// filter. Observed in the UI: a receipt issued 30 days earlier (19 Aug) shown
// as this month's 2 400 € under "Mesačný výdaj tovaru — Príjem".
// ==========================================================================

test("F13: the 'monthly' warehouse KPIs count only this month's movements", () => {
  const movements = [
    { type: "inward", status: "confirmed", issuedAt: "2025-03-04 08:00", totalCostValue: 9000, totalSellValue: 0, totalProfitValue: 0 },
    { type: "outward", status: "confirmed", issuedAt: "2026-09-12 13:00", totalCostValue: 0, totalSellValue: 234, totalProfitValue: 90 }
  ] as WarehouseMovement[];
  // mirror of WarehouseView.tsx:518-527
  let monthlyInward = 0;
  movements.forEach((m) => {
    if (m.status === "confirmed" && m.type === "inward") monthlyInward += m.totalCostValue || 0;
  });
  // Observed: 9 000 — a receipt from eighteen months ago is "this month's".
  assert.equal(monthlyInward, 0, "a receipt from March 2025 is not a September 2026 figure");
});

// ==========================================================================
// F14 — `taxRate` on a financial record is stored (default 20, forced to 20 by
// the project and client forms: ProjectDetailsView.tsx:600, ClientsView.tsx:1468)
// but there is no input for it and no total reads it; the invoice bridge
// derives a rounded blended rate. Nothing on screen says whether an amount is
// gross or net.
// ==========================================================================

test("F14: the finance form exposes the VAT rate it stores, or does not store one", { skip: "component-level — product decision: either render a VAT input and use it (net/gross) or drop the field" }, () => {});

// ==========================================================================
// F15 — derivePaidDate stamps the UTC day (financialRecordMerge.ts:32) while
// every other writer stamps todayLocal(). Between local midnight and UTC
// midnight (00:00–02:00 in Bratislava in summer) a record marked paid from the
// project or client tab is filed under yesterday.
// ==========================================================================

test("F15: a record marked paid at 00:30 local time is paid today, on every form", () => {
  const { viaSecondaryForm, viaMainForm } = withClock("Europe/Bratislava", Date.UTC(2026, 8, 17, 22, 30), () => ({
    viaSecondaryForm: derivePaidDate(null, "paid"),
    viaMainForm: todayLocal() // FinancialManagementView.tsx:2957 — `record.paidDate || todayLocal()`
  }));
  // Observed: "2026-09-17" vs "2026-09-18".
  assert.equal(viaSecondaryForm, viaMainForm);
});

// ==========================================================================
// F16 — batch expiry mixes a UTC-parsed date with local midnight
// (WarehouseView.tsx:65-78): `new Date("YYYY-MM-DD")` is UTC 00:00, `today`
// is local 00:00, so a batch expiring today reads "1 day left" east of UTC and
// "expired" a day early west of it.
// ==========================================================================

test("F16: a batch whose expiration date is today is expired today, in any timezone", () => {
  // mirror of WarehouseView.tsx:65-78
  const getExpirationStatus = (expirationDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(expirationDate);
    const daysRemaining = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { status: daysRemaining <= 0 ? "expired" : daysRemaining <= 30 ? "warning" : "ok", daysRemaining };
  };
  const noon = Date.UTC(2026, 8, 18, 12, 0);
  const east = withClock("Europe/Bratislava", noon, () => getExpirationStatus("2026-09-18"));
  const west = withClock("America/Los_Angeles", noon, () => getExpirationStatus("2026-09-17"));
  // Observed: east { warning, 1 }; west { expired, 0 } for a batch that expires tomorrow local time.
  assert.equal(east.status, "expired", "Bratislava: expires today → expired");
  assert.equal(west.status, "warning", "Los Angeles: expires tomorrow → not yet expired");
});

// ==========================================================================
// F17 — task deadlines defaulted from the UTC day in four modules
// (LeadsDatagrid.tsx:2130-2134 and :3396-3398, EmailView.tsx:331-332,
// MeetingRoomView.tsx:516/:995/:1082/:1180, FilesView.tsx:264) while the task
// board treats deadlines as local dates. At 00:30 local the "+3 days" default
// is a day short.
// ==========================================================================

test("F17: a task created at 00:30 local time with a '+3 days' deadline is due in three days, not two", () => {
  const { utcDefault, expected } = withClock("Europe/Bratislava", Date.UTC(2026, 8, 17, 22, 30), () => {
    // mirror of LeadsDatagrid.tsx:2130-2134
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return { utcDefault: d.toISOString().split("T")[0], expected: "2026-09-21" };
  });
  // Observed: "2026-09-20".
  assert.equal(utcDefault, expected);
});

// ==========================================================================
// F18 — warehouse document numbers are "count of movements of this type + 1"
// with the current calendar year (WarehouseView.tsx:911, :1035, :1405, :1550,
// :1819). The sequence never restarts in a new year, and the same shape was
// fixed in Invoicing (InvoicingView.tsx:216-231) because it hands out
// duplicates as soon as a document is missing.
// ==========================================================================

test("F18: the first goods issue of a new year is number 0001, and a gap in the list does not repeat a number", () => {
  // mirror of WarehouseView.tsx:1035
  const nextIssueNumber = (movements: Pick<WarehouseMovement, "type" | "documentNumber">[], year: number) =>
    `VYD-${year}-${String(movements.filter((m) => m.type === "outward").length + 1).padStart(4, "0")}`;

  const lastYear = [{ type: "outward", documentNumber: "VYD-2026-0001" }, { type: "outward", documentNumber: "VYD-2026-0002" }] as WarehouseMovement[];
  // Observed: "VYD-2027-0003".
  assert.equal(nextIssueNumber(lastYear, 2027), "VYD-2027-0001");

  const withGap = [{ type: "outward", documentNumber: "VYD-2026-0001" }, { type: "outward", documentNumber: "VYD-2026-0003" }] as WarehouseMovement[];
  // Observed: "VYD-2026-0003" — already taken.
  assert.notEqual(nextIssueNumber(withGap, 2026), "VYD-2026-0003");
});
