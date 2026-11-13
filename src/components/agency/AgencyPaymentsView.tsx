import React, { useMemo, useState } from "react";
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileSpreadsheet,
  Receipt,
  Wallet,
} from "lucide-react";
import type { Lead } from "../../types";
import type { Language } from "../../utils/translations";
import type {
  AgencyBootstrapPayload,
  AgencyPayment,
  AgencyPaymentStatus,
} from "../../types/agency";
import type { AgencyRights } from "../../utils/agencyRights";
import {
  calculateAgencyPayment,
  createAgencyClientBillingRecord,
  saveAgencyPayment,
} from "../../utils/agencyApi";
import { AgencyPaymentDrawer } from "./AgencyPaymentDrawer";

interface AgencyPaymentsViewProps {
  bootstrap: AgencyBootstrapPayload;
  clients: Lead[];
  rights: AgencyRights;
  isAdmin: boolean;
  lang: Language;
  onChanged: () => Promise<void>;
  onOpenWorker?: (workerId: string) => void;
}

function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

const STATUS_CLS: Record<AgencyPaymentStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  approved: "bg-indigo-50 text-indigo-700 border-indigo-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const AgencyPaymentsView: React.FC<AgencyPaymentsViewProps> = ({
  bootstrap,
  clients,
  rights,
  isAdmin,
  lang,
  onChanged,
  onOpenWorker,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [periodYm, setPeriodYm] = useState<string>(currentYm);
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drawerPayment, setDrawerPayment] = useState<AgencyPayment | null>(null);

  const clientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) {
      map.set(c.id, c.name);
    }
    return map;
  }, [clients]);

  const workerMap = useMemo(() => {
    const map = new Map(bootstrap.workers.map((w) => [w.id, w]));
    return map;
  }, [bootstrap.workers]);

  const companyOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const pl of bootstrap.placements) ids.add(pl.companyClientId);
    for (const p of bootstrap.payments) if (p.companyClientId) ids.add(p.companyClientId);
    return Array.from(ids).map((id) => ({ id, name: clientNameMap.get(id) || id }));
  }, [bootstrap.placements, bootstrap.payments, clientNameMap]);

  const periodPayments = useMemo(() => {
    return bootstrap.payments.filter((p) => {
      if (p.periodYm !== periodYm) return false;
      if (companyFilter && p.companyClientId !== companyFilter) return false;
      return true;
    });
  }, [bootstrap.payments, periodYm, companyFilter]);

  // Workers eligible to calculate in this period (rented / active placement / have shifts)
  const calculableWorkerIds = useMemo(() => {
    const set = new Set<string>();
    for (const pl of bootstrap.placements) {
      if (pl.status === "active" && (!companyFilter || pl.companyClientId === companyFilter)) {
        set.add(pl.workerId);
      }
    }
    for (const sh of bootstrap.shifts) {
      if (sh.workDate.startsWith(periodYm) && (!companyFilter || sh.companyClientId === companyFilter)) {
        set.add(sh.workerId);
      }
    }
    return Array.from(set);
  }, [bootstrap.placements, bootstrap.shifts, periodYm, companyFilter]);

  const totalsByCurrency = useMemo(() => {
    const map = new Map<
      string,
      { regularHours: number; overtimeHours: number; sickDays: number; netPay: number; billableTotal: number }
    >();
    for (const p of periodPayments) {
      const cur = p.currency || "EUR";
      const prev = map.get(cur) || {
        regularHours: 0,
        overtimeHours: 0,
        sickDays: 0,
        netPay: 0,
        billableTotal: 0,
      };
      prev.regularHours += Number(p.regularHours || 0);
      prev.overtimeHours += Number(p.overtimeHours || 0);
      prev.sickDays += Number(p.sickDays || 0);
      prev.netPay += Number(p.netPay || 0);
      prev.billableTotal += Number(p.billableTotal || 0);
      map.set(cur, prev);
    }
    return Array.from(map.entries());
  }, [periodPayments]);

  const handleCalculateAll = async () => {
    if (!rights.edit || calculableWorkerIds.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      for (const workerId of calculableWorkerIds) {
        const existing = periodPayments.find((p) => p.workerId === workerId);
        if (existing && existing.status === "paid") continue;
        const calc = await calculateAgencyPayment(workerId, periodYm);
        await saveAgencyPayment({
          ...(existing ? { id: existing.id, items: existing.items, notes: existing.notes, status: existing.status } : {}),
          workerId,
          placementId: calc.placementId,
          companyClientId: calc.companyClientId,
          periodYm,
          regularHours: calc.regularHours,
          overtimeHours: calc.overtimeHours,
          sickDays: calc.sickDays,
          basePay: calc.basePay,
          billableTotal: calc.billableTotal,
          currency: calc.currency,
        });
      }
      await onChanged();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRecalculateOne = async (p: AgencyPayment) => {
    if (!rights.edit) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const calc = await calculateAgencyPayment(p.workerId, periodYm);
      await saveAgencyPayment({
        id: p.id,
        workerId: p.workerId,
        placementId: calc.placementId ?? p.placementId,
        companyClientId: calc.companyClientId ?? p.companyClientId,
        periodYm,
        regularHours: calc.regularHours,
        overtimeHours: calc.overtimeHours,
        sickDays: calc.sickDays,
        basePay: calc.basePay,
        items: p.items,
        billableTotal: calc.billableTotal,
        currency: calc.currency || p.currency,
        status: p.status,
        paidAt: p.paidAt,
        notes: p.notes,
      });
      await onChanged();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Recalculation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBillingRecord = async (companyClientId: string) => {
    if (!rights.edit) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await createAgencyClientBillingRecord(companyClientId, periodYm);
      (window as unknown as { showToast?: (m: string, type?: string) => void }).showToast?.(
        t(
          `Client billing record created (${res.financialRecordId})`,
          `Fakturačný záznam klienta vytvorený (${res.financialRecordId})`,
          `Ügyfél számlázási tétel létrehozva (${res.financialRecordId})`
        ),
        "success"
      );
      await onChanged();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create client billing record");
    } finally {
      setBusy(false);
    }
  };

  const billingCompanies = useMemo(() => {
    const map = new Map<string, { companyClientId: string; totalBillable: number; totalNet: number; currency: string }>();
    for (const p of periodPayments) {
      if (!p.companyClientId) continue;
      const cur = map.get(p.companyClientId) || {
        companyClientId: p.companyClientId,
        totalBillable: 0,
        totalNet: 0,
        currency: p.currency || "EUR",
      };
      cur.totalBillable += Number(p.billableTotal || 0);
      cur.totalNet += Number(p.netPay || 0);
      map.set(p.companyClientId, cur);
    }
    return Array.from(map.values());
  }, [periodPayments]);

  return (
    <div className="space-y-4" data-testid="agency-payments-view">
      {/* Controls */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setPeriodYm((p) => shiftMonth(p, -1))}
              className="p-1.5 rounded-lg hover:bg-white text-slate-600 cursor-pointer"
            >
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="month"
              value={periodYm}
              onChange={(e) => e.target.value && setPeriodYm(e.target.value)}
              data-testid="agency-payments-month"
              className="bg-transparent text-ui font-bold text-slate-800 px-2 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setPeriodYm((p) => shiftMonth(p, 1))}
              className="p-1.5 rounded-lg hover:bg-white text-slate-600 cursor-pointer"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-caption font-semibold text-slate-700"
          >
            <option value="">{t("All companies", "Všetky firmy", "Minden cég")}</option>
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {rights.edit && (
          <button
            type="button"
            disabled={busy || calculableWorkerIds.length === 0}
            onClick={handleCalculateAll}
            data-testid="agency-calc-all-btn"
            className="px-4 py-2 rounded-xl bg-teal-600 text-white text-ui font-semibold inline-flex items-center gap-1.5 hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
          >
            <Calculator className="size-4" />
            <span>
              {t("Calculate All from Shifts", "Vypočítať zo zmien", "Számítás műszakokból")} (
              {calculableWorkerIds.length})
            </span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-ui font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Currency KPIs */}
      {totalsByCurrency.map(([cur, tot]) => {
        const margin = tot.billableTotal - tot.netPay;
        return (
          <div key={cur} className="grid grid-cols-2 ws-md:grid-cols-5 gap-3">
            <div className="glass-panel rounded-2xl p-3.5">
              <div className="type-overline text-slate-400">{t("Worked Hours", "Odpracované hodiny", "Ledolgozott óra")}</div>
              <div className="text-title font-bold text-slate-900 mt-1">
                {tot.regularHours.toFixed(1)}h{" "}
                {tot.overtimeHours > 0 && (
                  <span className="text-caption text-amber-600">+{tot.overtimeHours.toFixed(1)}h OT</span>
                )}
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-3.5">
              <div className="type-overline text-slate-400">{t("Sick Days", "Dni PN", "Betegnap")}</div>
              <div className="text-title font-bold text-rose-600 mt-1">{tot.sickDays}</div>
            </div>
            <div className="glass-panel rounded-2xl p-3.5">
              <div className="type-overline text-slate-400">{t("Worker Net Pay", "Čisté výplaty", "Nettó kifizetés")}</div>
              <div className="text-title font-bold text-slate-900 mt-1">
                {tot.netPay.toFixed(2)} {cur}
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-3.5">
              <div className="type-overline text-slate-400">{t("Client Billing", "Fakturácia klientom", "Ügyfélszámlázás")}</div>
              <div className="text-title font-bold text-indigo-700 mt-1">
                {tot.billableTotal.toFixed(2)} {cur}
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-3.5">
              <div className="type-overline text-slate-400">{t("Gross Margin", "Hrubá marža", "Bruttó árrés")}</div>
              <div className="text-title font-bold text-teal-700 mt-1">
                {margin.toFixed(2)} {cur}
              </div>
            </div>
          </div>
        );
      })}

      {/* Per-company billing shortcuts */}
      {billingCompanies.length > 0 && rights.edit && (
        <div className="glass-panel rounded-2xl p-4 space-y-2">
          <div className="type-overline text-slate-500">
            {t("Client Billing Export (Income FinancialRecord)", "Fakturácia klientovi (Príjem)", "Ügyfél számlázás")}
          </div>
          <div className="flex flex-wrap gap-2">
            {billingCompanies.map((bc) => (
              <div
                key={bc.companyClientId}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3"
              >
                <div className="text-caption">
                  <span className="font-bold text-slate-900">
                    {clientNameMap.get(bc.companyClientId) || bc.companyClientId}
                  </span>
                  <span className="text-slate-500 ml-2">
                    {bc.totalBillable.toFixed(2)} {bc.currency}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleCreateBillingRecord(bc.companyClientId)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-micro font-semibold inline-flex items-center gap-1 hover:bg-indigo-700 cursor-pointer"
                >
                  <FileSpreadsheet className="size-3" />
                  <span>{t("Create Billing Record", "Vytvoriť príjem", "Bevétel rögzítése")}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matrix Table */}
      <div className="glass-panel rounded-2xl overflow-hidden" data-testid="agency-payments-table">
        {periodPayments.length === 0 ? (
          <div className="p-10 text-center text-ui text-slate-500">
            <Wallet className="size-8 mx-auto text-slate-300 mb-2" />
            {t(
              "No payroll rows for this month yet. Log shifts in Work Schedule and click Calculate All.",
              "Pre tento mesiac zatiaľ nie sú výplaty. Zapíšte zmeny a kliknite na Vypočítať zo zmien.",
              "Ebben a hónapban még nincs elszámolás. Rögzítsen műszakokat és kattintson a Számítás gombra."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-caption">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="px-4 py-3 font-bold">{t("Worker", "Pracovník", "Dolgozó")}</th>
                  <th className="px-3 py-3 font-bold">{t("Company", "Firma", "Cég")}</th>
                  <th className="px-3 py-3 font-bold text-right">{t("Hours / Sick", "Hodiny / PN", "Óra / Beteg")}</th>
                  <th className="px-3 py-3 font-bold text-right">{t("Base Pay", "Základ", "Alap")}</th>
                  <th className="px-3 py-3 font-bold text-right">{t("Deductions", "Zrážky", "Levonás")}</th>
                  <th className="px-3 py-3 font-bold text-right">{t("Net Pay", "Čistá mzda", "Nettó")}</th>
                  <th className="px-3 py-3 font-bold text-right">{t("Billing", "Fakturácia", "Számlázás")}</th>
                  <th className="px-3 py-3 font-bold">{t("Status & Finance", "Stav a financie", "Állapot")}</th>
                  <th className="px-4 py-3 font-bold text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                </tr>
              </thead>
              <tbody>
                {periodPayments.map((p) => {
                  const worker = workerMap.get(p.workerId);
                  const compName = p.companyClientId ? clientNameMap.get(p.companyClientId) || p.companyClientId : "—";
                  return (
                    <tr
                      key={p.id}
                      data-testid={`agency-payment-row-${p.workerId}`}
                      className="border-b border-slate-100 hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {onOpenWorker ? (
                          <button
                            type="button"
                            onClick={() => onOpenWorker(p.workerId)}
                            className="hover:text-teal-700 cursor-pointer text-left"
                          >
                            {worker?.fullName || p.workerId}
                          </button>
                        ) : (
                          worker?.fullName || p.workerId
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{compName}</td>
                      <td className="px-3 py-3 text-right font-mono">
                        {Number(p.regularHours || 0)}h
                        {Number(p.overtimeHours || 0) > 0 ? ` +${Number(p.overtimeHours)}h` : ""}
                        {Number(p.sickDays || 0) > 0 && (
                          <span className="ml-1 text-rose-600 font-bold">({p.sickDays}d PN)</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {Number(p.basePay || 0).toFixed(2)} {p.currency}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-rose-600">
                        {Number(p.deductionsTotal || 0) > 0 ? `-${Number(p.deductionsTotal).toFixed(2)}` : "0.00"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                        {Number(p.netPay || 0).toFixed(2)} {p.currency}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-indigo-700">
                        {Number(p.billableTotal || 0).toFixed(2)} {p.currency}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full border text-micro font-bold uppercase ${STATUS_CLS[p.status]}`}>
                            {p.status}
                          </span>
                          {p.financialRecordId && (
                            <span
                              data-testid={`agency-payment-fr-${p.workerId}`}
                              className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-micro font-mono inline-flex items-center gap-1"
                            >
                              <Receipt className="size-2.5" />
                              {p.financialRecordId}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {rights.edit && (p.status !== "paid" || isAdmin) && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRecalculateOne(p)}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-micro font-semibold cursor-pointer"
                            >
                              {t("Recalc", "Prepočítať", "Újraszámol")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDrawerPayment(p)}
                            data-testid={`agency-payment-edit-${p.workerId}`}
                            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-teal-400 text-slate-700 text-micro font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="size-3" />
                            <span>{t("Edit", "Upraviť", "Szerkesztés")}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerPayment && (
        <AgencyPaymentDrawer
          payment={drawerPayment}
          workerName={workerMap.get(drawerPayment.workerId)?.fullName || drawerPayment.workerId}
          companyName={
            drawerPayment.companyClientId
              ? clientNameMap.get(drawerPayment.companyClientId) || drawerPayment.companyClientId
              : "—"
          }
          canEdit={rights.edit}
          isAdmin={isAdmin}
          lang={lang}
          onClose={() => setDrawerPayment(null)}
          onSaved={async () => {
            await onChanged();
          }}
        />
      )}
    </div>
  );
};
