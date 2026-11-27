import React from "react";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import type { FinancialCategory, FinancialRecord, FinancialStatus, FinancialType } from "../../types";
import { FINANCIAL_STATUS_OPTIONS } from "../../utils/financialRecordMerge";
import { todayLocal } from "../../utils/localTime";

export interface ProjectFinancialModalProps {
  finEditingRecord: FinancialRecord | null;
  finFormType: FinancialType;
  finFormTitle: string;
  setFinFormTitle: (v: string) => void;
  finFormInvoiceNumber: string;
  setFinFormInvoiceNumber: (v: string) => void;
  finFormAmountPlanned: number | "";
  setFinFormAmountPlanned: (v: number | "") => void;
  finFormAmountReal: number | "";
  setFinFormAmountReal: (v: number | "") => void;
  finFormCategoryId: string;
  setFinFormCategoryId: (v: string) => void;
  finFormStatus: FinancialStatus;
  setFinFormStatus: (v: FinancialStatus) => void;
  finFormIssueDate: string;
  setFinFormIssueDate: (v: string) => void;
  finFormDueDate: string;
  setFinFormDueDate: (v: string) => void;
  finFormPaidDate: string;
  setFinFormPaidDate: (v: string) => void;
  financialCategories: FinancialCategory[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  t: (en: string, sk: string, hu: string) => string;
}

export const ProjectFinancialModal: React.FC<ProjectFinancialModalProps> = ({
  finEditingRecord,
  finFormType,
  finFormTitle,
  setFinFormTitle,
  finFormInvoiceNumber,
  setFinFormInvoiceNumber,
  finFormAmountPlanned,
  setFinFormAmountPlanned,
  finFormAmountReal,
  setFinFormAmountReal,
  finFormCategoryId,
  setFinFormCategoryId,
  finFormStatus,
  setFinFormStatus,
  finFormIssueDate,
  setFinFormIssueDate,
  finFormDueDate,
  setFinFormDueDate,
  finFormPaidDate,
  setFinFormPaidDate,
  financialCategories,
  onClose,
  onSubmit,
  t,
}) => (
  <div className="fixed inset-0 z-[100005] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2">
          {finFormType === "income" ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-rose-600" />}
          <h3 className="text-body font-semibold text-gray-900">
            {finEditingRecord
              ? (finFormType === "income" ? t("Edit Project Invoice", "Upraviť faktúru projektu", "Számla szerkesztése") : t("Edit Project Expense", "Upraviť výdavok projektu", "Kiadás szerkesztése"))
              : (finFormType === "income" ? t("Issue Project Invoice", "Vystaviť faktúru pre projekt", "Számla kiállítása projekthez") : t("Add Project Expense", "Pridať výdavok k projektu", "Új kiadás hozzáadása"))}
          </h3>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3.5 text-ui font-medium text-left">
        <div>
          <label className="block type-overline text-gray-500 mb-1">{t("Title / Description *", "Názov / Popis *", "Megnevezés *")}</label>
          <input
            required
            value={finFormTitle}
            onChange={(e) => setFinFormTitle(e.target.value)}
            placeholder={finFormType === "income" ? t("e.g. Advance invoice 50%...", "napr. Zálohová faktúra 50%...", "pl. Előlegszámla 50%...") : t("e.g. Material purchase, rental...", "napr. Nákup materiálu, prenájom...", "pl. Anyagbeszerzés, bérlet...")}
            className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring font-medium"
          />
        </div>

        {finFormType === "income" && (
          <div>
            <label className="block type-overline text-gray-500 mb-1">{t("Invoice Number", "Číslo faktúry", "Számlaszám")}</label>
            <input
              value={finFormInvoiceNumber}
              onChange={(e) => setFinFormInvoiceNumber(e.target.value)}
              placeholder="FA-2026-0001"
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white font-mono"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block type-overline text-gray-500 mb-1">{t("Planned Amount (€) *", "Plánovaná suma (€) *", "Tervezett összeg (€) *")}</label>
            <input
              type="number"
              step="0.01"
              required
              value={finFormAmountPlanned}
              onChange={(e) => setFinFormAmountPlanned(e.target.value ? parseFloat(e.target.value) : "")}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white font-semibold"
            />
          </div>
          <div>
            <label className="block type-overline text-gray-500 mb-1">{t("Real / Paid Amount (€)", "Skutočná suma (€)", "Valós összeg (€)")}</label>
            <input
              type="number"
              step="0.01"
              value={finFormAmountReal}
              onChange={(e) => setFinFormAmountReal(e.target.value ? parseFloat(e.target.value) : "")}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white font-semibold text-emerald-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block type-overline text-gray-500 mb-1">{t("Category", "Kategória", "Kategória")}</label>
            <select
              value={finFormCategoryId}
              onChange={(e) => setFinFormCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white"
            >
              <option value="">{t("-- Select Category --", "-- Vyberte kategóriu --", "-- Válasszon --")}</option>
              {financialCategories
                .filter((c) => c.type === finFormType)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level === 1 ? `● ${c.name}` : `  ↳ ${c.name}`}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block type-overline text-gray-500 mb-1">{t("Status", "Stav", "Állapot")}</label>
            <select
              value={finFormStatus}
              onChange={(e) => {
                const next = e.target.value as FinancialStatus;
                setFinFormStatus(next);
                if ((next === "paid" || next === "partially_paid") && !finFormPaidDate) {
                  setFinFormPaidDate(finEditingRecord?.paidDate || todayLocal());
                }
                if (next === "paid" && (!finFormAmountReal || Number(finFormAmountReal) === 0) && Number(finFormAmountPlanned) > 0) {
                  setFinFormAmountReal(finFormAmountPlanned);
                }
              }}
              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white"
            >
              {FINANCIAL_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "planned"
                    ? t("Planned", "Plánované", "Tervezett")
                    : s === "pending"
                    ? t("Pending", "Čaká na úhradu", "Függő")
                    : s === "partially_paid"
                    ? t("Partially Paid", "Čiastočne uhradené", "Részben fizetve")
                    : s === "paid"
                    ? t("Paid", "Uhradené", "Fizetve")
                    : s === "overdue"
                    ? t("Overdue", "Po splatnosti", "Lejárt")
                    : t("Cancelled", "Zrušené", "Törölve")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={`grid gap-3 ${finFormStatus === "paid" || finFormStatus === "partially_paid" ? "grid-cols-3" : "grid-cols-2"}`}>
          <div>
            <label className="block type-overline text-gray-500 mb-1">{t("Issue Date", "Dátum vystavenia", "Kiállítás dátuma")}</label>
            <input type="date" required value={finFormIssueDate} onChange={(e) => setFinFormIssueDate(e.target.value)} className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white" />
          </div>
          <div>
            <label className="block type-overline text-gray-500 mb-1">{t("Due Date", "Dátum splatnosti", "Esedékesség")}</label>
            <input type="date" value={finFormDueDate} onChange={(e) => setFinFormDueDate(e.target.value)} className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white" />
          </div>
          {(finFormStatus === "paid" || finFormStatus === "partially_paid") && (
            <div>
              <label className="block type-overline text-gray-500 mb-1">{t("Paid Date", "Dátum úhrady", "Fizetés dátuma")}</label>
              <input type="date" value={finFormPaidDate} onChange={(e) => setFinFormPaidDate(e.target.value)} className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer">
            {t("Cancel", "Zrušiť", "Mégsem")}
          </button>
          <button type="submit" className="px-4 py-2 bg-entity-solid hover:bg-entity-solid-hover text-white rounded-md font-semibold cursor-pointer shadow-xs">
            {t("Save", "Uložiť", "Mentés")}
          </button>
        </div>
      </form>
    </div>
  </div>
);
