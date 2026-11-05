import React, { useState, useEffect, useMemo } from "react";
import {
  Coins,
  X,
  Plus,
  Trash2,
  Check,
  Calendar,
  Lock,
  Pencil,
  RotateCcw
} from "lucide-react";
import type {
  Employee,
  EmployeeSalary,
  EmployeeSettings,
  SalaryCategoryItem,
  SalaryTypeConfig
} from "../../types";
import { formatNumber } from "../../utils/currency";
import {
  employeeDeductions,
  employerLevies,
  hasPayslip,
  parsePayslipAmount,
  salaryDue,
  salaryStatus
} from "../../utils/payslip";

export interface SalaryCellDrawerProps {
  employee: Employee;
  periodNumber?: number;
  periodKey?: string;
  year?: number;
  monthName?: string;
  existingRecord?: EmployeeSalary | null;
  settings: EmployeeSettings;
  canChangePeriod?: boolean;
  onClose: () => void;
  onSave: (salary: EmployeeSalary) => void;
  systemLanguage?: string;
  systemCurrency?: string;
}

export const SalaryCellDrawer: React.FC<SalaryCellDrawerProps> = ({
  employee,
  periodNumber: initialPeriodNumber,
  periodKey: initialPeriodKey,
  year: initialYear,
  monthName: initialMonthName,
  existingRecord,
  settings,
  canChangePeriod = false,
  onClose,
  onSave,
  systemLanguage = "sk",
  systemCurrency = "€"
}) => {
  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  const currentDate = new Date();
  const defaultYear = existingRecord?.year || initialYear || currentDate.getFullYear();
  const defaultMonth = existingRecord?.periodNumber || initialPeriodNumber || (currentDate.getMonth() + 1);

  const [activeYear, setActiveYear] = useState<number>(defaultYear);
  const [activeMonthNum, setActiveMonthNum] = useState<number>(defaultMonth);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 320);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClosing]);

  const monthNames = useMemo(() => [
    t("January", "Január", "Január"),
    t("February", "Február", "Február"),
    t("March", "Marec", "Március"),
    t("April", "Apríl", "Április"),
    t("May", "Máj", "Május"),
    t("June", "Jún", "Június"),
    t("July", "Júl", "Július"),
    t("August", "August", "Augusztus"),
    t("September", "September", "Szeptember"),
    t("October", "Október", "Október"),
    t("November", "November", "November"),
    t("December", "December", "December")
  ], [systemLanguage]);

  const activePeriodKey = useMemo(() => {
    if (!canChangePeriod && initialPeriodKey) return initialPeriodKey;
    return activeMonthNum < 10 ? `M0${activeMonthNum}` : `M${activeMonthNum}`;
  }, [activeMonthNum, canChangePeriod, initialPeriodKey]);

  const currentMonthName = useMemo(() => {
    return monthNames[activeMonthNum - 1] || initialMonthName || `Month ${activeMonthNum}`;
  }, [monthNames, activeMonthNum, initialMonthName]);

  // Determine categories to show: default from settings, but include any from existing items
  const configuredCategories = useMemo<SalaryTypeConfig[]>(() => {
    return settings.salaryTypes && settings.salaryTypes.length > 0
      ? settings.salaryTypes
      : [
          { id: "base", name: "Základná mzda", defaultAmount: 0 },
          { id: "bonus", name: "Prémie / Odmeny", defaultAmount: 0 },
          { id: "overtime", name: "Nadčasy", defaultAmount: 0 },
          { id: "reimbursement", name: "Cestovné / Diéty", defaultAmount: 0 }
        ];
  }, [settings.salaryTypes]);

  // Employees get the payslip layout (Hrubá mzda = Základná + Iné, Cena práce, Na výplatu, one
  // Vyplatené); contractors and ledger lines keep the per-row Mzda / Vyplatené table.
  const showPayslip = hasPayslip(employee);

  // Items State (Each item has categoryId, name, amount, paidAmount)
  const [items, setItems] = useState<SalaryCategoryItem[]>(() => {
    if (existingRecord?.items && existingRecord.items.length > 0) {
      return existingRecord.items.map((it) => ({
        ...it,
        amount: it.amount ?? it.salary ?? 0,
        salary: it.amount ?? it.salary ?? 0,
        paidAmount: it.paidAmount ?? it.paid ?? 0,
        paid: it.paidAmount ?? it.paid ?? 0
      }));
    }

    // Initialize from employee's default salary and categories. On a payslip only rows with a
    // default amount are worth starting with; the rest are offered as name suggestions under Iné.
    return configuredCategories
      .map((cat, idx) => {
        const isBase = idx === 0 || cat.id === "base";
        const initialAmount = isBase && employee.salaryAmount ? employee.salaryAmount : cat.defaultAmount || 0;
        return {
          isBase,
          item: {
            categoryId: cat.id,
            categoryName: cat.name,
            amount: initialAmount,
            salary: initialAmount,
            paidAmount: 0,
            paid: 0
          }
        };
      })
      .filter(({ isBase, item }) => !showPayslip || isBase || (item.amount ?? 0) > 0)
      .map(({ item }) => item);
  });

  // Základná mzda is the `base` item, or the first row of records made before categories had ids
  const baseIdx = Math.max(0, items.findIndex((it) => it.categoryId === "base"));
  const baseAmount = Number(items[baseIdx]?.amount) || 0;
  const otherTotal = items.reduce((acc, it, idx) => (idx === baseIdx ? acc : acc + (Number(it.amount) || 0)), 0);
  const otherNameSuggestions = configuredCategories.filter((cat, idx) => !(idx === 0 || cat.id === "base")).map((cat) => cat.name);

  // Základná mzda is the contract amount and stays locked unless unlocked for this month (partial
  // month, unpaid leave…). A daily or hourly rate is not a month's base, so it starts unlocked.
  const contractBase = Number(employee.salaryAmount) || 0;
  const isRateBased = employee.salaryType === "daily" || employee.salaryType === "hourly";
  const [baseUnlocked, setBaseUnlocked] = useState<boolean>(isRateBased);
  const baseDiffersFromContract = !isRateBased && contractBase > 0 && baseAmount !== contractBase;

  // Payout attributes
  const [dueDate, setDueDate] = useState<string>(() => {
    if (existingRecord?.dueDate) return existingRecord.dueDate;
    const dueDay = employee.salaryDueDay || settings.salaryDueDay || 15;
    const nextMonth = activeMonthNum === 12 ? 1 : activeMonthNum + 1;
    const nextYear = activeMonthNum === 12 ? activeYear + 1 : activeYear;
    return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(Math.min(dueDay, 28)).padStart(2, "0")}`;
  });

  const [paymentDate, setPaymentDate] = useState<string>(
    existingRecord?.paymentDate || new Date().toISOString().split("T")[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(existingRecord?.paymentMethod || "bank_transfer");
  const [note, setNote] = useState<string>(existingRecord?.note || "");

  // Payslip figures (employees only): typed in by hand every month, kept as text so an emptied
  // field stays "not filled in" instead of turning into 0.
  const [laborCostText, setLaborCostText] = useState<string>(
    existingRecord?.laborCost != null ? String(existingRecord.laborCost) : ""
  );
  const [netPayText, setNetPayText] = useState<string>(
    existingRecord?.netPay != null ? String(existingRecord.netPay) : ""
  );
  // On a payslip Vyplatené is one amount for the whole month, measured against Cena práce
  const [paidText, setPaidText] = useState<string>(
    existingRecord?.totalPaid ? String(existingRecord.totalPaid) : ""
  );
  const laborCost = parsePayslipAmount(laborCostText);
  const netPay = parsePayslipAmount(netPayText);
  const formatMoney = (n: number) =>
    `${formatNumber(n, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${systemCurrency}`;

  // Calculated totals: totalSalary is the gross (Hrubá mzda on a payslip)
  const totalSalary = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  }, [items]);

  const totalPaid = useMemo(() => {
    if (showPayslip) return parsePayslipAmount(paidText) ?? 0;
    return items.reduce((acc, it) => acc + (Number(it.paidAmount) || 0), 0);
  }, [items, paidText, showPayslip]);

  const levies = employerLevies(laborCost, totalSalary);
  const deductions = employeeDeductions(totalSalary, netPay);
  const due = showPayslip ? salaryDue({ totalSalary, laborCost }) : totalSalary;
  const status = salaryStatus(due, totalPaid);
  const balanceDue = Math.max(0, due - totalPaid);

  const handleItemChange = (idx: number, field: "amount" | "paidAmount", val: number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    setItems(updated);
  };

  const handleMarkAllPaid = () => {
    if (showPayslip) {
      setPaidText(String(due));
    } else {
      const updated = items.map((it) => ({
        ...it,
        paidAmount: it.amount ?? 0,
        paid: it.amount ?? 0
      }));
      setItems(updated);
    }
    setPaymentDate(new Date().toISOString().split("T")[0]);
  };

  const handleAddCustomCategory = () => {
    setItems([
      ...items,
      {
        categoryId: `custom_${Date.now()}`,
        categoryName: showPayslip ? "" : t("Extra Allowance", "Príplatok / Iné", "Külön juttatás"),
        amount: 0,
        salary: 0,
        paidAmount: 0,
        paid: 0
      }
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    // On a payslip the paid amount lives on the record, not on the rows; an unnamed Iné row is "Iné"
    const savedItems = showPayslip
      ? items.map((it) => ({
          ...it,
          categoryName: it.categoryName.trim() || t("Other", "Iné", "Egyéb"),
          salary: it.amount ?? 0,
          paidAmount: 0,
          paid: 0
        }))
      : items;

    const record: EmployeeSalary = {
      id: existingRecord?.id || `sal_${employee.id}_${activePeriodKey}_${activeYear}`,
      employeeId: employee.id,
      periodType: settings.salaryPeriod || "monthly",
      periodKey: activePeriodKey,
      year: activeYear,
      periodNumber: activeMonthNum,
      items: savedItems,
      totalSalary,
      totalPaid,
      laborCost: showPayslip ? laborCost : existingRecord?.laborCost ?? null,
      netPay: showPayslip ? netPay : existingRecord?.netPay ?? null,
      status,
      dueDate,
      paymentDate: totalPaid > 0 ? paymentDate : undefined,
      paymentMethod: paymentMethod as any,
      financialRecordId: existingRecord?.financialRecordId,
      note: note.trim() || undefined,
      createdAt: existingRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(record);
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex flex-col justify-end ${
        isClosing ? "animate-fade-out" : "animate-fade-in"
      }`}
    >
      {/* Backdrop click dismiss */}
      <div className="flex-1" onClick={handleClose} />

      {/* Drawer Container sliding up from the bottom */}
      <div
        className={`w-full max-w-3xl mx-auto glass-panel bg-white/95 rounded-t-[32px] ws-sm:rounded-t-[36px] shadow-2xl border-t-2 border-x border-[#c29b62]/60 overflow-hidden flex flex-col max-h-[90vh] relative z-10 ${
          isClosing ? "animate-slide-out-bottom" : "animate-slide-in-bottom"
        }`}
      >
        {/* Subtle Pull Indicator */}
        <div className="pt-2.5 pb-1 flex justify-center shrink-0 bg-[#c29b62]/10">
          <div
            className="w-12 h-1.5 bg-[#c29b62]/30 rounded-full cursor-pointer hover:bg-[#c29b62]/60 transition"
            onClick={handleClose}
            title={t("Close", "Zavrieť", "Bezárás")}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#c29b62]/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#c29b62] text-white flex items-center justify-center shadow-md shadow-[#c29b62]/30 shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-title-sm font-bold text-slate-900 truncate">
                {employee.name} — {currentMonthName} {activeYear}
              </h2>
              <p className="text-ui text-slate-500">
                {showPayslip
                  ? t(
                      "Payslip for the month: gross salary, labour cost and what has been paid",
                      "Výplatná páska za mesiac: hrubá mzda, cena práce a čo je vyplatené",
                      "Havi bérjegyzék: bruttó bér, bérköltség és a kifizetett összeg"
                    )
                  : t(
                      "Two-column salary breakdown: Salary (Due) and Paid amount",
                      "Dvojstĺpcový rozpis: Mzda (Predpis) a Vyplatená suma",
                      "Kétoszlopos bontás: Bér (Előírás) és Kifizetett összeg"
                    )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Period selector if canChangePeriod is enabled or no existingRecord */}
          {(canChangePeriod || !existingRecord) && (
            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-ui font-bold text-amber-900">
                <Calendar className="w-4 h-4 text-[#c29b62]" />
                <span>{t("Salary Period:", "Obdobie mzdy:", "Bér időszaka:")}</span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={activeMonthNum}
                  onChange={(e) => setActiveMonthNum(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-xl border border-amber-300/80 bg-white text-ui font-bold text-slate-800 shadow-sm"
                >
                  {monthNames.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="2020"
                  max="2035"
                  value={activeYear}
                  onChange={(e) => setActiveYear(Number(e.target.value) || activeYear)}
                  className="w-20 px-3 py-1.5 rounded-xl border border-amber-300/80 bg-white text-ui font-bold text-slate-800 shadow-sm"
                />
              </div>
            </div>
          )}

          {/* Quick Mark as Paid Button */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  status === "paid"
                    ? "bg-emerald-500"
                    : status === "partially_paid"
                    ? "bg-amber-500"
                    : "bg-slate-400"
                }`}
              />
              <span className="text-ui font-semibold text-slate-800">
                {status === "paid"
                  ? t("Status: Fully Paid", "Stav: Vyplatené", "Állapot: Kifizetve")
                  : status === "partially_paid"
                  ? t("Status: Partially Paid", "Stav: Čiastočne vyplatené", "Állapot: Részben kifizetve")
                  : t("Status: Planned / Unpaid", "Stav: Nevyplatené (Plánované)", "Állapot: Kifizetetlen (Tervezett)")}
              </span>
            </div>

            <button
              type="button"
              onClick={handleMarkAllPaid}
              className="flex items-center gap-1.5 px-3 py-1.5 text-ui font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              {t("Mark as Fully Paid", "Označiť ako vyplatené", "Megjelölés kifizetettként")}
            </button>
          </div>

          {showPayslip ? (
            /* PAYSLIP: Hrubá mzda (Základná + Iné), Cena práce, Na výplatu and one Vyplatené */
            <div className="space-y-3" data-testid="salary-payslip">
              <h4 className="text-ui font-bold text-[#b58b4c]">
                {t("Payslip", "Výplatná páska", "Bérjegyzék")}
              </h4>

              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <table className="w-full text-ui">
                  <tbody className="divide-y divide-slate-100">
                    {/* Hrubá mzda = Základná + Iné */}
                    <tr className="bg-slate-50/70">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{t("Gross salary", "Hrubá mzda", "Bruttó bér")}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 w-48" data-testid="salary-gross">
                        {formatMoney(totalSalary)}
                      </td>
                      <td className="w-10"></td>
                    </tr>

                    <tr>
                      <td className="py-2 pl-8 pr-3 text-slate-700">
                        <div className="font-medium">{t("Base salary", "Základná mzda", "Alapbér")}</div>
                        {baseDiffersFromContract && (
                          <div className="text-micro text-slate-500 flex items-center gap-1.5">
                            <span>{t("Contract", "Podľa zmluvy", "Szerződés szerint")}: {formatMoney(contractBase)}</span>
                            <button
                              type="button"
                              onClick={() => handleItemChange(baseIdx, "amount", contractBase)}
                              className="inline-flex items-center gap-0.5 text-[#b58b4c] hover:text-[#9e7638] font-semibold transition cursor-pointer"
                              data-testid="salary-base-reset"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {t("Reset", "Obnoviť", "Visszaállítás")}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {baseUnlocked ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={baseAmount === 0 ? "" : baseAmount}
                              placeholder="0.00"
                              onChange={(e) => handleItemChange(baseIdx, "amount", parseFloat(e.target.value) || 0)}
                              data-testid="salary-base-input"
                              className="w-28 px-2 py-1 text-right font-mono font-bold text-slate-900 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#c29b62]"
                            />
                            <span className="text-slate-400 font-mono">{systemCurrency}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-mono text-slate-700" data-testid="salary-base-amount">
                            <Lock className="w-3 h-3 text-slate-400" />
                            {formatMoney(baseAmount)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {!baseUnlocked && (
                          <button
                            type="button"
                            onClick={() => setBaseUnlocked(true)}
                            className="text-slate-400 hover:text-[#b58b4c] hover:bg-[#c29b62]/10 rounded-lg transition p-1 cursor-pointer"
                            title={t("Change for this month", "Upraviť pre tento mesiac", "Módosítás erre a hónapra")}
                            aria-label={t("Change for this month", "Upraviť pre tento mesiac", "Módosítás erre a hónapra")}
                            data-testid="salary-base-unlock"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Iné: subtotal of the manually added rows below it */}
                    <tr>
                      <td className="py-2 pl-8 pr-3 font-medium text-slate-700">{t("Other", "Iné", "Egyéb")}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700" data-testid="salary-other-total">
                        {formatMoney(otherTotal)}
                      </td>
                      <td></td>
                    </tr>
                    {items.map((item, idx) =>
                      idx === baseIdx ? null : (
                        <tr key={item.categoryId || idx} className="hover:bg-slate-50/50 transition-colors" data-testid="salary-other-row">
                          <td className="py-1.5 pl-12 pr-3">
                            <input
                              type="text"
                              value={item.categoryName}
                              list="salary-other-names"
                              autoFocus={item.categoryName === "" && item.amount === 0}
                              placeholder={t("Item name", "Názov položky", "Tétel neve")}
                              onChange={(e) => {
                                const updated = [...items];
                                updated[idx] = { ...updated[idx], categoryName: e.target.value };
                                setItems(updated);
                              }}
                              className="w-full px-2 py-1 bg-transparent border-0 focus:ring-1 focus:ring-[#c29b62] rounded text-slate-800"
                            />
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={item.amount === 0 ? "" : item.amount}
                                placeholder="0.00"
                                onChange={(e) => handleItemChange(idx, "amount", parseFloat(e.target.value) || 0)}
                                className="w-28 px-2 py-1 text-right font-mono font-bold text-slate-900 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#c29b62]"
                              />
                              <span className="text-slate-400 font-mono">{systemCurrency}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-slate-300 hover:text-red-500 transition p-1 cursor-pointer"
                              title={t("Remove Row", "Odstrániť riadok", "Sor törlése")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                    <tr>
                      <td colSpan={3} className="py-1.5 pl-12 pr-3">
                        <button
                          type="button"
                          onClick={handleAddCustomCategory}
                          className="flex items-center gap-1 text-ui text-[#c29b62] hover:text-[#9e7638] font-bold transition cursor-pointer"
                          data-testid="salary-add-other"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {t("Add item", "Pridať položku", "Tétel hozzáadása")}
                        </button>
                        <datalist id="salary-other-names">
                          {otherNameSuggestions.map((name) => (
                            <option key={name} value={name} />
                          ))}
                        </datalist>
                      </td>
                    </tr>

                    {/* Cena práce and Na výplatu are typed in from the payslip */}
                    <tr className="bg-slate-50/70">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{t("Labour cost", "Cena práce", "Bérköltség")}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={laborCostText}
                            placeholder="0.00"
                            onChange={(e) => setLaborCostText(e.target.value)}
                            data-testid="salary-labor-cost"
                            className="w-28 px-2 py-1 text-right font-mono font-bold text-slate-900 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#c29b62]"
                          />
                          <span className="text-slate-400 font-mono">{systemCurrency}</span>
                        </div>
                      </td>
                      <td></td>
                    </tr>
                    <tr className="bg-slate-50/70">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{t("Net pay", "Na výplatu", "Nettó kifizetés")}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={netPayText}
                            placeholder="0.00"
                            onChange={(e) => setNetPayText(e.target.value)}
                            data-testid="salary-net-pay"
                            className="w-28 px-2 py-1 text-right font-mono font-bold text-slate-900 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#c29b62]"
                          />
                          <span className="text-slate-400 font-mono">{systemCurrency}</span>
                        </div>
                      </td>
                      <td></td>
                    </tr>
                    <tr className="text-micro text-slate-500">
                      <td className="py-1.5 pl-8 pr-3">
                        {t("Employer levies", "Odvody zamestnávateľa", "Munkáltatói járulékok")}
                        <span className="opacity-70"> ({t("labour cost − gross", "cena práce − hrubá mzda", "bérköltség − bruttó bér")})</span>
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right font-mono ${levies != null && levies < 0 ? "text-rose-600" : ""}`}
                        data-testid="salary-employer-levies"
                      >
                        {levies == null ? "—" : formatMoney(levies)}
                      </td>
                      <td></td>
                    </tr>
                    <tr className="text-micro text-slate-500">
                      <td className="py-1.5 pl-8 pr-3">
                        {t("Employee levies and tax", "Odvody a daň zamestnanca", "Munkavállalói járulékok és adó")}
                        <span className="opacity-70"> ({t("gross − net pay", "hrubá mzda − na výplatu", "bruttó bér − nettó kifizetés")})</span>
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right font-mono ${deductions != null && deductions < 0 ? "text-rose-600" : ""}`}
                        data-testid="salary-employee-deductions"
                      >
                        {deductions == null ? "—" : formatMoney(deductions)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                  <tfoot>
                    {/* Vyplatené: one amount against Cena práce (or the gross until Cena práce is known) */}
                    <tr className="bg-emerald-50/60 border-t border-emerald-200">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-emerald-700">{t("Paid", "Vyplatené", "Kifizetve")}</div>
                        <div className="text-micro text-slate-500">
                          {laborCost != null
                            ? t("of labour cost", "z ceny práce", "a bérköltségből")
                            : t("of gross salary, until labour cost is filled in", "z hrubej mzdy, kým nie je vyplnená cena práce", "a bruttó bérből, amíg nincs bérköltség")}{" "}
                          {formatMoney(due)}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={paidText}
                            placeholder="0.00"
                            onChange={(e) => setPaidText(e.target.value)}
                            data-testid="salary-paid"
                            className="w-28 px-2 py-1 text-right font-mono font-bold text-emerald-700 border border-emerald-200 bg-white rounded-lg focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="text-slate-400 font-mono">{systemCurrency}</span>
                        </div>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
          /* TWO-COLUMN SALARY CATEGORY TABLE (contractors and ledger lines) */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-ui font-bold text-[#b58b4c]">
                {t("Salary Categories & Components", "Zložky mzdy", "Bérösszetevők")}
              </h4>
              <button
                type="button"
                onClick={handleAddCustomCategory}
                className="flex items-center gap-1 text-ui text-[#c29b62] hover:text-[#9e7638] font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("Add Row", "Pridať riadok", "Sor hozzáadása")}
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              <table className="w-full text-ui">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 type-overline">
                    <th className="py-2.5 px-3 text-left">{t("Category", "Kategória", "Kategória")}</th>
                    <th className="py-2.5 px-3 text-right w-36 text-[#c29b62] font-bold">
                      {t("Salary (Due)", "Mzda (Predpis)", "Bér (Előírás)")}
                    </th>
                    <th className="py-2.5 px-3 text-right w-36 text-emerald-600 font-bold">
                      {t("Paid", "Vyplatené", "Kifizetve")}
                    </th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={item.categoryName}
                          onChange={(e) => {
                            const updated = [...items];
                            updated[idx].categoryName = e.target.value;
                            setItems(updated);
                          }}
                          className="w-full px-2 py-1 bg-transparent border-0 focus:ring-1 focus:ring-[#c29b62] rounded font-medium text-slate-800"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.amount === 0 ? "" : item.amount}
                            placeholder="0.00"
                            onChange={(e) => handleItemChange(idx, "amount", parseFloat(e.target.value) || 0)}
                            className="w-28 px-2 py-1 text-right font-mono font-bold text-slate-900 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#c29b62]"
                          />
                          <span className="text-slate-400 font-mono">{systemCurrency}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.paidAmount === 0 ? "" : item.paidAmount}
                            placeholder="0.00"
                            onChange={(e) => handleItemChange(idx, "paidAmount", parseFloat(e.target.value) || 0)}
                            className="w-28 px-2 py-1 text-right font-mono font-bold text-emerald-600 border border-emerald-200 bg-emerald-50/30 rounded-lg focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="text-slate-400 font-mono">{systemCurrency}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-slate-300 hover:text-red-500 transition p-1"
                            title={t("Remove Row", "Odstrániť riadok", "Sor törlése")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-bold text-ui">
                    <td className="py-2.5 px-3 text-slate-700">
                      {t("Total", "Spolu celkom", "Összesen")}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#c29b62]">
                      {formatNumber(totalSalary, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600">
                      {formatNumber(totalPaid, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          )}

          {/* DATES & PAYMENT DETAILS */}
          <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ui font-semibold text-slate-700 mb-1">
                {t("Due Date", "Dátum splatnosti", "Esedékesség napja")}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-ui border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#c29b62]/40"
              />
            </div>

            <div>
              <label className="block text-ui font-semibold text-slate-700 mb-1">
                {t("Payment Date", "Dátum skutočnej úhrady", "Kifizetés napja")}
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-ui border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#c29b62]/40"
              />
            </div>

            <div>
              <label className="block text-ui font-semibold text-slate-700 mb-1">
                {t("Payment Method", "Spôsob úhrady", "Fizetési mód")}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-ui border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#c29b62]/40 bg-white"
              >
                <option value="bank_transfer">{t("Bank Transfer", "Bankový prevod", "Banki átutalás")}</option>
                <option value="cash">{t("Cash in Hand", "Hotovosť", "Készpénz")}</option>
                <option value="internal_credit">{t("Internal Offset", "Zápočet", "Belső elszámolás")}</option>
              </select>
            </div>

            <div>
              <label className="block text-ui font-semibold text-slate-700 mb-1">
                {t("Sync to Financial Hub", "Prepojenie s Financiami", "Pénzügyi szinkronizáció")}
              </label>
              <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-xl bg-slate-50 text-ui text-slate-600">
                <div className={`w-2 h-2 rounded-full ${settings.autoExpense ? "bg-emerald-500" : "bg-slate-400"}`} />
                <span>
                  {settings.autoExpense
                    ? t("Auto-expense active (financial records updated)", "Automatický náklad zapnutý", "Automatikus kiadás aktív")
                    : t("Manual recording only", "Len manuálna evidencia", "Csak kézi rögzítés")}
                </span>
              </div>
            </div>
          </div>

          {/* NOTE */}
          <div>
            <label className="block text-ui font-semibold text-slate-700 mb-1">
              {t("Internal Note", "Poznámka k výplate", "Megjegyzés")}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("e.g. Regular monthly payout + bonus for Q3 milestone", "napr. Mzda + odmena za Q3", "Megjegyzés")}
              className="w-full px-3 py-2 text-ui border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#c29b62]/40"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/80">
          <div className="text-ui">
            <span className="text-slate-400">{t("Balance Remaining:", "Zostáva uhradiť:", "Fennmaradó összeg:")} </span>
            <span className="font-mono font-bold text-slate-900">
              {formatNumber(balanceDue, systemLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {systemCurrency}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-body font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-body font-heading font-bold text-white bg-gradient-to-r from-[#c29b62] to-[#b58b4c] hover:shadow-lg rounded-xl shadow-md shadow-[#c29b62]/25 transition cursor-pointer"
            >
              {t("Save Period Salary", "Uložiť mzdu", "Bér mentése")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
