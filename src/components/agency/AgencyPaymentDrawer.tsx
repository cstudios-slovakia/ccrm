import React, { useMemo, useState } from "react";
import { Lock, Plus, Trash2, X } from "lucide-react";
import type { Language } from "../../utils/translations";
import type {
  AgencyPayment,
  AgencyPaymentLineItem,
  AgencyPaymentStatus,
} from "../../types/agency";
import { computePaymentTotals } from "../../utils/agencyCalculations";
import { saveAgencyPayment } from "../../utils/agencyApi";

interface AgencyPaymentDrawerProps {
  payment: AgencyPayment;
  workerName: string;
  companyName: string;
  canEdit: boolean;
  isAdmin: boolean;
  lang: Language;
  onClose: () => void;
  onSaved: (updated: AgencyPayment) => Promise<void>;
}

export const AgencyPaymentDrawer: React.FC<AgencyPaymentDrawerProps> = ({
  payment,
  workerName,
  companyName,
  canEdit,
  isAdmin,
  lang,
  onClose,
  onSaved,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const isLocked = payment.status === "paid" && !isAdmin;
  const editable = canEdit && !isLocked;

  const [basePay, setBasePay] = useState<number>(Number(payment.basePay || 0));
  const [billableTotal, setBillableTotal] = useState<number>(Number(payment.billableTotal || 0));
  const [items, setItems] = useState<AgencyPaymentLineItem[]>(() =>
    (payment.items || []).map((it) => ({ ...it }))
  );
  const [status, setStatus] = useState<AgencyPaymentStatus>(payment.status || "draft");
  const [paidAt, setPaidAt] = useState<string>(payment.paidAt || "");
  const [notes, setNotes] = useState<string>(payment.notes || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totals = useMemo(
    () => computePaymentTotals(basePay, items, billableTotal),
    [basePay, items, billableTotal]
  );

  const addLineItem = (kind: "earning" | "deduction") => {
    setItems((prev) => [
      ...prev,
      {
        id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kind,
        label:
          kind === "deduction"
            ? t("Accommodation / Deduction", "Ubytovanie / Zrážka", "Szállás / Levonás")
            : t("Bonus / Allowance", "Príplatok / Bonus", "Pótlék / Bónusz"),
        amount: 0,
      },
    ]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const saved = await saveAgencyPayment({
        id: payment.id.startsWith("calc-") ? undefined : payment.id,
        workerId: payment.workerId,
        placementId: payment.placementId,
        companyClientId: payment.companyClientId,
        periodYm: payment.periodYm,
        regularHours: payment.regularHours,
        overtimeHours: payment.overtimeHours,
        sickDays: payment.sickDays,
        basePay,
        items,
        grossPay: totals.grossPay,
        deductionsTotal: totals.deductionsTotal,
        netPay: totals.netPay,
        paidAmount: status === "paid" ? totals.netPay : 0,
        billableTotal,
        currency: payment.currency || "EUR",
        status,
        paidAt: status === "paid" ? paidAt || new Date().toISOString().slice(0, 10) : paidAt || null,
        notes,
      });
      await onSaved(saved);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-2xs flex justify-end">
      <form
        onSubmit={handleSave}
        data-testid="agency-payment-drawer"
        className="bg-white w-full max-w-lg h-full shadow-2xl border-l border-slate-200 flex flex-col"
      >
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-title font-bold text-slate-900">{workerName}</h2>
            <p className="text-caption text-slate-500">
              {companyName} · {payment.periodYm} · {payment.regularHours}h ({payment.overtimeHours}h OT, {payment.sickDays}d {t("sick", "PN", "beteg")})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLocked && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-caption font-semibold flex items-center gap-2">
              <Lock className="size-4 shrink-0" />
              <span>
                {t(
                  "This payment period is marked Paid and locked for non-admin edits.",
                  "Toto obdobie je označené ako vyplatené a pre neadministrátorov zamknuté.",
                  "Ez a kifizetett időszak nem adminok számára zárolva van."
                )}
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-ui font-semibold">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block type-overline text-slate-500 mb-1">
                {t("Base Worker Pay", "Základná mzda", "Alapbér")} ({payment.currency})
              </label>
              <input
                type="number"
                step="0.01"
                disabled={!editable}
                value={basePay}
                onChange={(e) => setBasePay(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 text-ui font-semibold"
              />
            </div>
            <div>
              <label className="block type-overline text-slate-500 mb-1">
                {t("Client Billing Total", "Fakturácia klientovi", "Ügyfél felé számlázandó")} ({payment.currency})
              </label>
              <input
                type="number"
                step="0.01"
                disabled={!editable}
                value={billableTotal}
                onChange={(e) => setBillableTotal(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 text-ui font-semibold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="type-overline text-slate-600">
                {t("Earnings & Deductions", "Príplatky a zrážky", "Pótlékok és levonások")}
              </span>
              {editable && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => addLineItem("earning")}
                    data-testid="agency-add-earning-btn"
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-micro font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>{t("Earning", "Príplatok", "Pótlék")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addLineItem("deduction")}
                    data-testid="agency-add-deduction-btn"
                    className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-micro font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>{t("Deduction", "Zrážka", "Levonás")}</span>
                  </button>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <p className="text-caption text-slate-400 italic">
                {t("No adjustments added.", "Žiadne príplatky ani zrážky.", "Nincs módosító tétel.")}
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={it.id} className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded-lg text-micro font-bold uppercase shrink-0 ${
                        it.kind === "deduction"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {it.kind === "deduction" ? "−" : "+"}
                    </span>
                    <input
                      type="text"
                      disabled={!editable}
                      value={it.label}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x))
                        )
                      }
                      className="flex-1 h-9 px-2.5 rounded-lg border border-slate-200 text-caption"
                    />
                    <input
                      type="number"
                      step="0.01"
                      disabled={!editable}
                      value={it.amount}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, amount: Number(e.target.value) } : x))
                        )
                      }
                      data-testid={`agency-line-amount-${idx}`}
                      className="w-24 h-9 px-2.5 rounded-lg border border-slate-200 text-ui text-right font-mono"
                    />
                    {editable && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2 text-caption">
            <div>
              <div className="text-slate-500">{t("Gross Pay", "Hrubá mzda", "Bruttó bér")}</div>
              <div className="text-ui font-bold text-slate-900">
                {totals.grossPay.toFixed(2)} {payment.currency}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t("Deductions", "Zrážky", "Levonások")}</div>
              <div className="text-ui font-bold text-rose-600">
                -{totals.deductionsTotal.toFixed(2)} {payment.currency}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t("Net Worker Pay", "Čistá výplata", "Nettó kifizetés")}</div>
              <div className="text-body font-extrabold text-slate-900" data-testid="agency-drawer-net-pay">
                {totals.netPay.toFixed(2)} {payment.currency}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t("Agency Gross Margin", "Marža agentúry", "Ügynökségi árrés")}</div>
              <div className="text-body font-extrabold text-teal-700">
                {totals.marginAmount.toFixed(2)} {payment.currency}
                {totals.marginPct !== null ? ` (${totals.marginPct}%)` : ""}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block type-overline text-slate-500 mb-1">
                {t("Status", "Stav", "Állapot")}
              </label>
              <select
                disabled={!editable}
                value={status}
                onChange={(e) => setStatus(e.target.value as AgencyPaymentStatus)}
                data-testid="agency-payment-status"
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-ui font-semibold"
              >
                <option value="draft">{t("Draft", "Koncept", "Tervezet")}</option>
                <option value="approved">{t("Approved", "Schválené", "Jóváhagyva")}</option>
                <option value="paid">{t("Paid", "Vyplatené", "Kifizetve")}</option>
              </select>
            </div>
            <div>
              <label className="block type-overline text-slate-500 mb-1">
                {t("Paid Date", "Dátum výplaty", "Kifizetés dátuma")}
              </label>
              <input
                type="date"
                disabled={!editable}
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 text-ui"
              />
            </div>
          </div>

          <div>
            <label className="block type-overline text-slate-500 mb-1">
              {t("Notes", "Poznámka", "Megjegyzés")}
            </label>
            <textarea
              rows={2}
              disabled={!editable}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-ui"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-ui font-semibold text-slate-700 cursor-pointer"
          >
            {t("Close", "Zavrieť", "Bezárás")}
          </button>
          {editable && (
            <button
              type="submit"
              disabled={saving}
              data-testid="agency-payment-save-btn"
              className="px-4 py-2 rounded-xl bg-teal-600 text-white text-ui font-semibold hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? t("Saving…", "Ukladám…", "Mentés…") : t("Save payment", "Uložiť výplatu", "Mentés")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
