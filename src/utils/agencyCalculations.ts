import type {
  AgencyChecklistTemplateItem,
  AgencyPaymentLineItem,
  AgencyPlacement,
  AgencySettings,
  AgencyShift,
  AgencyWorker,
  AgencyWorkerChecklistItem,
} from "../types/agency.ts";

export type ComplianceExpiryState = "ok" | "expiring" | "expired" | "missing";

export function getComplianceExpiryState(
  expiresAt: string | null | undefined,
  referenceDateIso: string = new Date().toISOString().slice(0, 10),
  warningDays = 30
): ComplianceExpiryState {
  if (!expiresAt) return "ok";
  const refMs = Date.parse(referenceDateIso + "T00:00:00Z");
  const expMs = Date.parse(expiresAt.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(refMs) || Number.isNaN(expMs)) return "ok";
  const diffDays = Math.round((expMs - refMs) / 86_400_000);
  if (diffDays < 0) return "expired";
  if (diffDays <= warningDays) return "expiring";
  return "ok";
}

export interface WorkerComplianceSummary {
  total: number;
  verified: number;
  expired: number;
  expiringSoon: number;
  missing: number;
  missingRequired: number;
  missingExpiry: number;
  worstState: ComplianceExpiryState;
}

export function summarizeWorkerCompliance(
  items: AgencyWorkerChecklistItem[],
  referenceDateIso: string = new Date().toISOString().slice(0, 10),
  warningDays = 30,
  templates?: AgencyChecklistTemplateItem[]
): WorkerComplianceSummary {
  let verified = 0;
  let expired = 0;
  let expiringSoon = 0;
  let missing = 0;
  let missingRequired = 0;
  let missingExpiry = 0;
  const tplMap = templates ? new Map(templates.map((t) => [t.key, t])) : null;
  for (const item of items) {
    const tpl = tplMap?.get(item.itemKey);
    const hasExpiry = tpl ? Boolean(tpl.hasExpiry) : true;
    const isRequired = tpl ? Boolean(tpl.required) : true;
    if (item.status === "verified") verified += 1;
    if (item.status === "missing") {
      missing += 1;
      if (isRequired) missingRequired += 1;
    }
    if (item.status === "expired") {
      expired += 1;
      continue;
    }
    if (hasExpiry) {
      if (!item.expiresAt || !item.expiresAt.trim()) {
        missingExpiry += 1;
      } else {
        const expState = getComplianceExpiryState(item.expiresAt, referenceDateIso, warningDays);
        if (expState === "expired") expired += 1;
        else if (expState === "expiring") expiringSoon += 1;
      }
    }
  }
  const worstState: ComplianceExpiryState =
    expired > 0 ? "expired" : expiringSoon > 0 ? "expiring" : missing > 0 || missingExpiry > 0 ? "missing" : "ok";
  return {
    total: items.length,
    verified,
    expired,
    expiringSoon,
    missing,
    missingRequired,
    missingExpiry,
    worstState,
  };
}

export interface ShiftTotalsResult {
  regularHours: number;
  overtimeHours: number;
  sickDays: number;
  basePay: number;
  billableTotal: number;
  marginAmount: number;
}

export function calculateShiftTotals(
  shifts: AgencyShift[],
  worker: Pick<AgencyWorker, "defaultPayRate" | "defaultBillRate">,
  placements: AgencyPlacement[],
  settings: Pick<AgencySettings, "shiftTemplates" | "overtimeMultiplier" | "holidayMultiplier">
): ShiftTotalsResult {
  const tplById = new Map(settings.shiftTemplates.map((t) => [t.id, t]));
  const placementById = new Map(placements.map((p) => [p.id, p]));
  const primaryPlacement =
    placements.find((p) => p.status === "active") || placements[0] || null;
  const otMult = settings.overtimeMultiplier || 1.25;
  const holMult = settings.holidayMultiplier || 1.5;

  let regularHours = 0;
  let overtimeHours = 0;
  let sickDays = 0;
  let basePay = 0;
  let billableTotal = 0;

  for (const sh of shifts) {
    if (sh.status === "sick") {
      sickDays += 1;
      continue;
    }
    if (sh.status === "absent") continue;
    const h = Number(sh.hours || 0);
    const ot = Number(sh.overtimeHours || 0);
    if (sh.status === "holiday" && h <= 0 && ot <= 0) continue;

    const pl = (sh.placementId && placementById.get(sh.placementId)) || primaryPlacement;
    const payRate =
      pl && Number(pl.payRate || 0) > 0
        ? Number(pl.payRate)
        : Number(worker.defaultPayRate || 0);
    const billRate =
      pl && Number(pl.billRate || 0) > 0
        ? Number(pl.billRate)
        : Number(worker.defaultBillRate || 0);
    const tpl = sh.shiftTemplateId ? tplById.get(sh.shiftTemplateId) : undefined;
    let payMult = tpl ? Number(tpl.payMultiplier || 1) : 1;
    let billMult = tpl ? Number(tpl.billMultiplier || 1) : 1;
    if (sh.status === "holiday") {
      payMult = Math.max(payMult, holMult);
      billMult = Math.max(billMult, holMult);
    }

    regularHours += h;
    overtimeHours += ot;
    basePay += h * payRate * payMult + ot * payRate * otMult;
    billableTotal += h * billRate * billMult + ot * billRate * otMult;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const roundedBase = r2(basePay);
  const roundedBill = r2(billableTotal);
  return {
    regularHours: r2(regularHours),
    overtimeHours: r2(overtimeHours),
    sickDays: Math.round(sickDays * 10) / 10,
    basePay: roundedBase,
    billableTotal: roundedBill,
    marginAmount: r2(roundedBill - roundedBase),
  };
}

export function computePaymentTotals(
  basePay: number,
  items: AgencyPaymentLineItem[],
  billableTotal = 0
): {
  extraEarnings: number;
  deductionsTotal: number;
  grossPay: number;
  netPay: number;
  marginAmount: number;
  marginPct: number | null;
} {
  let extraEarnings = 0;
  let deductionsTotal = 0;
  for (const it of items) {
    const amt = Number(it.amount || 0);
    if (it.kind === "deduction") deductionsTotal += amt;
    else extraEarnings += amt;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const grossPay = r2(basePay + extraEarnings);
  const roundedDed = r2(deductionsTotal);
  const netPay = r2(Math.max(0, grossPay - roundedDed));
  const roundedBill = r2(billableTotal);
  const marginAmount = r2(roundedBill - netPay);
  const marginPct = roundedBill > 0 ? Math.round((marginAmount / roundedBill) * 1000) / 10 : null;
  return {
    extraEarnings: r2(extraEarnings),
    deductionsTotal: roundedDed,
    grossPay,
    netPay,
    marginAmount,
    marginPct,
  };
}
